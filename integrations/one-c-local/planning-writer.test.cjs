'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { preparePlannedAssignment, exportPlannedAssignment, REQUEST_ENTITY, SHIFT_ENTITY } = require('./planning-writer.cjs');

const id = (n) => `${String(n).padStart(8, '0')}-1234-4321-9876-123456789abc`;
const clone = (value) => structuredClone(value);
const ZERO_DATE = '0001-01-01T00:00:00';
function input() {
  return { sourceNamespace: 'local-planner', externalKey: 'calendar:2026-09-22:row-17', clientId: id(1), projectId: id(2), driverId: id(3), vehicleId: id(4), date: '2026-09-22', startTime: '09:00', endTime: '18:00', notes: 'План из приложения', status: 'planned' };
}
function response(status, body) {
  return { ok: status >= 200 && status < 300, status, text: async () => body === undefined ? '' : JSON.stringify(body) };
}
function backend({ before, afterCommit } = {}) {
  const data = input();
  const records = new Map([
    [`Catalog_Клиенты:${data.clientId}`, { Ref_Key: data.clientId, Активен: true, DeletionMark: false }],
    [`Catalog_ПроектыКлиентов:${data.projectId}`, { Ref_Key: data.projectId, Owner_Key: data.clientId, Активен: true, DeletionMark: false }],
    [`Catalog_Водители:${data.driverId}`, { Ref_Key: data.driverId, Активен: true, DeletionMark: false }],
    [`Catalog_ТранспортныеСредства:${data.vehicleId}`, { Ref_Key: data.vehicleId, Активен: true, DeletionMark: false }],
  ]);
  const calls = [];
  let nextNumber = 1;
  const fetchImpl = async (url, options) => {
    assert.equal(url.origin, 'http://127.0.0.1:18314');
    assert.ok(url.pathname.startsWith('/local1c/odata/standard.odata/'));
    assert.equal(options.redirect, 'error');
    const resource = decodeURIComponent(url.pathname.split('/').at(-1));
    const match = resource.match(/^([^()]+)(?:\(guid'([^']+)'\))?$/);
    assert.ok(match, `unexpected resource ${resource}`);
    const [, entity, key] = match;
    const method = options.method;
    const body = options.body ? JSON.parse(options.body) : undefined;
    const call = { entity, id: key, method, body };
    calls.push(call);
    const overridden = await before?.({ ...call, records, calls });
    if (overridden) return overridden;
    if (method === 'GET') return records.has(`${entity}:${key}`) ? response(200, clone(records.get(`${entity}:${key}`))) : response(404);
    assert.equal(method, 'POST', 'writer must not update, delete or post documents');
    assert.ok([REQUEST_ENTITY, SHIFT_ENTITY].includes(entity));
    assert.equal(key, undefined, 'create uses the entity collection');
    assert.ok(body.Ref_Key);
    assert.equal(body.Posted, false);
    assert.equal(body.DeletionMark, false);
    if (records.has(`${entity}:${body.Ref_Key}`)) return response(409, { error: { message: 'Duplicate key' } });
    const saved = {
      ...clone(body), Number: String(nextNumber++).padStart(9, '0'), DataVersion: 'AAAAAQAAAAA=',
      ...(entity === REQUEST_ENTITY ? { КоличествоМашин: String(body.КоличествоМашин), ФактическоеВремяНачала: ZERO_DATE, ФактическоеВремяОкончания: ZERO_DATE } : {
        ПлановоеКоличествоТС: String(body.ПлановоеКоличествоТС), ФактическоеКоличествоТС: '0',
        РесурсыСмены: body.РесурсыСмены.map((row) => ({ ...row, ФактическоеВремяПодачи: ZERO_DATE, ЕстьНеподача: false, ЕстьОпоздание: false })),
      }),
    };
    records.set(`${entity}:${body.Ref_Key}`, saved);
    const after = await afterCommit?.({ ...call, records, saved, calls });
    return after ?? response(201, clone(saved));
  };
  let starts = 0;
  let now = 0;
  const options = { fetchImpl, ensureSource: async () => { starts += 1; }, now: () => now, wait: async (ms) => { now += ms; } };
  return { records, calls, options, get starts() { return starts; }, posts: () => calls.filter((call) => call.method === 'POST') };
}

test('stable UUIDs depend on namespace/key; changed content changes only the payload marker', () => {
  const plan = preparePlannedAssignment(input());
  const same = preparePlannedAssignment({ ...input(), startTime: '09:00:00', clientId: input().clientId.toUpperCase() });
  assert.equal(plan.requestId, same.requestId);
  assert.equal(plan.payloadHash, same.payloadHash);
  assert.notEqual(plan.requestId, plan.shiftId);
  assert.match(plan.requestId, /^[0-9a-f-]{14}5/);
  const changed = preparePlannedAssignment({ ...input(), notes: 'Изменено' });
  assert.equal(changed.requestId, plan.requestId);
  assert.notEqual(changed.payloadHash, plan.payloadHash);
  assert.notEqual(preparePlannedAssignment({ ...input(), sourceNamespace: 'other' }).requestId, plan.requestId);
  assert.notEqual(preparePlannedAssignment({ ...input(), externalKey: 'other' }).shiftId, plan.shiftId);
});

test('first export creates linked planned documents with the selected resources and no execution facts', async () => {
  const db = backend();
  const result = await exportPlannedAssignment(input(), db.options);
  assert.equal(result.created, true);
  assert.equal(result.status, 'created');
  assert.equal(db.starts, 1);
  assert.equal(db.posts().length, 2);
  assert.deepEqual(db.posts().map((call) => call.entity), [REQUEST_ENTITY, SHIFT_ENTITY]);
  const request = db.records.get(`${REQUEST_ENTITY}:${result.requestId}`);
  const shift = db.records.get(`${SHIFT_ENTITY}:${result.shiftId}`);
  const row = shift.РесурсыСмены[0];
  assert.equal(request.Клиент_Key, input().clientId);
  assert.equal(request.Проект_Key, input().projectId);
  assert.equal(request.СтатусЗаявки, 'НазначенРесурс');
  assert.equal(request.ВремяПодачи, '0001-01-01T09:00:00');
  assert.equal(request.ПлановоеВремяНачала, '2026-09-22T00:00:00');
  assert.equal(row.Водитель_Key, input().driverId);
  assert.equal(row.ТранспортноеСредство_Key, input().vehicleId);
  assert.equal(row.Заявка_Key, result.requestId);
  assert.equal(row.ВышелНаЛинию, false);
  assert.equal(row.СтатусВыходаНаЛинию, 'Запланирован');
  assert.equal(shift.ФактическоеКоличествоТС, '0');
  assert.equal(request.Posted, false);
  assert.equal(shift.Posted, false);
  assert.ok(result.requestNumber && result.shiftNumber);
});

test('same-payload retry reads and returns the same receipt without another POST', async () => {
  const db = backend();
  const first = await exportPlannedAssignment(input(), db.options);
  const second = await exportPlannedAssignment(input(), db.options);
  assert.equal(db.posts().length, 2);
  assert.equal(second.status, 'unchanged');
  assert.equal(second.created, false);
  assert.equal(second.reused, true);
  for (const key of ['requestId', 'requestNumber', 'shiftId', 'shiftNumber', 'payloadHash']) assert.equal(second[key], first[key]);
});

test('single-entity OData rows omit parent Ref_Key and padded document numbers are trimmed', async () => {
  const db = backend({ afterCommit: ({ entity, saved }) => {
    saved.Number = `${entity === REQUEST_ENTITY ? 'DORD0003' : 'DSHF0003'} `;
    if (entity === SHIFT_ENTITY) {
      assert.equal(Object.hasOwn(saved.РесурсыСмены[0], 'Ref_Key'), false, 'parent Ref_Key must not be sent as a writable tabular attribute');
      delete saved.РесурсыСмены[0].Ref_Key;
    }
  } });
  const first = await exportPlannedAssignment(input(), db.options);
  assert.equal(first.requestNumber, 'DORD0003');
  assert.equal(first.shiftNumber, 'DSHF0003');
  const second = await exportPlannedAssignment(input(), db.options);
  assert.equal(second.status, 'unchanged');
  assert.equal(second.requestId, first.requestId);
  assert.equal(second.shiftId, first.shiftId);
  assert.equal(second.shiftNumber, 'DSHF0003');
  assert.equal(db.posts().length, 2, 'recovery of the committed pair must not create new documents');
});

test('missing end time stays unknown; overnight end times retain next-day date', () => {
  const noEnd = preparePlannedAssignment({ ...input(), endTime: undefined });
  assert.equal(noEnd.endDate, null);
  assert.equal(noEnd.requestBody.ВременноеОкноПо, ZERO_DATE);
  assert.equal(noEnd.requestBody.ПлановоеВремяОкончания, ZERO_DATE);
  assert.match(noEnd.requestBody.ВнутреннийКомментарий, /окончание не задано/);
  const overnight = preparePlannedAssignment({ ...input(), startTime: '22:00', endTime: '06:00' });
  assert.equal(overnight.endDate, '2026-09-23');
  assert.equal(overnight.requestBody.ПлановоеВремяОкончания, '2026-09-23T00:00:00');
  assert.equal(overnight.requestBody.ВременноеОкноПо, '0001-01-01T06:00:00');
});

for (const entity of [REQUEST_ENTITY, SHIFT_ENTITY]) {
  test(`a lost committed ${entity} POST response resumes through deterministic GETs without duplication`, async () => {
    let failOnce = true;
    const db = backend({ afterCommit: ({ entity: current }) => {
      if (failOnce && current === entity) { failOnce = false; throw new TypeError('response lost after commit'); }
    } });
    const result = await exportPlannedAssignment(input(), db.options);
    assert.equal(result.recovered, true);
    assert.equal(db.posts().length, 2);
    assert.equal(db.starts, 1);
    assert.ok(db.records.has(`${REQUEST_ENTITY}:${result.requestId}`));
    assert.ok(db.records.has(`${SHIFT_ENTITY}:${result.shiftId}`));
    const failedPostIndex = db.calls.findIndex((call) => call.method === 'POST' && call.entity === entity);
    assert.equal(db.calls[failedPostIndex + 1].method, 'GET', 'retry must reconcile before any next mutation');
  });
}

test('a transport failure before commit retries the same Ref_Key, not a new document identity', async () => {
  let failOnce = true;
  const db = backend({ before: ({ method, entity }) => {
    if (failOnce && method === 'POST' && entity === REQUEST_ENTITY) { failOnce = false; throw new Error('connection reset'); }
  } });
  const result = await exportPlannedAssignment(input(), db.options);
  const requestPosts = db.posts().filter((call) => call.entity === REQUEST_ENTITY);
  assert.equal(requestPosts.length, 2);
  assert.equal(requestPosts[0].body.Ref_Key, requestPosts[1].body.Ref_Key);
  assert.equal(result.requestId, requestPosts[0].body.Ref_Key);
  assert.equal([...db.records.keys()].filter((key) => key.startsWith('Document_')).length, 2);
});

test('a nontransport shift failure leaves the owned request and a later invocation resumes the partial pair', async () => {
  let failOnce = true;
  const db = backend({ before: ({ method, entity }) => {
    if (failOnce && method === 'POST' && entity === SHIFT_ENTITY) { failOnce = false; return response(400, { error: { message: 'test validation failure' } }); }
  } });
  await assert.rejects(exportPlannedAssignment(input(), db.options), { code: 'ONE_C_HTTP' });
  assert.equal(db.posts().filter((call) => call.entity === REQUEST_ENTITY).length, 1);
  const result = await exportPlannedAssignment(input(), db.options);
  assert.equal(result.requestCreated, false);
  assert.equal(result.shiftCreated, true);
  assert.equal(db.posts().filter((call) => call.entity === REQUEST_ENTITY).length, 1);
  assert.equal([...db.records.keys()].filter((key) => key.startsWith('Document_')).length, 2);
});

test('an HTTP error after a commit is reconciled by GET rather than another POST', async () => {
  let failOnce = true;
  const db = backend({ afterCommit: ({ entity }) => {
    if (failOnce && entity === REQUEST_ENTITY) { failOnce = false; return response(500, { error: { message: 'after-commit error' } }); }
  } });
  const result = await exportPlannedAssignment(input(), db.options);
  assert.equal(result.recovered, true);
  assert.equal(db.posts().length, 2);
});

test('a foreign document at the deterministic ID is a conflict and never overwritten', async () => {
  const prepared = preparePlannedAssignment(input());
  const db = backend();
  const foreign = { ...prepared.requestBody, ВнутреннийКомментарий: 'Ручной документ' };
  db.records.set(`${REQUEST_ENTITY}:${prepared.requestId}`, foreign);
  await assert.rejects(exportPlannedAssignment(input(), db.options), { code: 'ONE_C_CONFLICT' });
  assert.equal(db.posts().length, 0);
  assert.equal(foreign.ВнутреннийКомментарий, 'Ручной документ');
});

test('changing an already exported payload rejects updates without creating new documents', async () => {
  const db = backend();
  await exportPlannedAssignment(input(), db.options);
  await assert.rejects(exportPlannedAssignment({ ...input(), date: '2026-09-23' }, db.options), { code: 'ONE_C_CONFLICT' });
  assert.equal(db.posts().length, 2);
});

for (const change of [
  (request) => { request.СтатусЗаявки = 'Выполнена'; },
  (request) => { request.ФактическоеВремяНачала = '2026-09-22T00:00:00'; },
  (request) => { request.Posted = true; },
  (request) => { request.DeletionMark = true; },
  (request) => { request.ВремяПодачи = '0001-01-01T10:00:00'; },
]) {
  test(`execution or external changes are conflicts: ${change.toString()}`, async () => {
    const db = backend();
    const receipt = await exportPlannedAssignment(input(), db.options);
    change(db.records.get(`${REQUEST_ENTITY}:${receipt.requestId}`));
    await assert.rejects(exportPlannedAssignment(input(), db.options), { code: 'ONE_C_CONFLICT' });
    assert.equal(db.posts().length, 2);
  });
}

test('a collision in the shift is detected before creating an absent request', async () => {
  const prepared = preparePlannedAssignment(input());
  const db = backend();
  db.records.set(`${SHIFT_ENTITY}:${prepared.shiftId}`, { ...prepared.shiftBody, Комментарий: 'Другой документ' });
  await assert.rejects(exportPlannedAssignment(input(), db.options), { code: 'ONE_C_CONFLICT' });
  assert.equal(db.posts().length, 0);
});

test('an owned shift whose request disappeared does not recreate the missing request silently', async () => {
  const db = backend();
  const receipt = await exportPlannedAssignment(input(), db.options);
  db.records.delete(`${REQUEST_ENTITY}:${receipt.requestId}`);
  await assert.rejects(exportPlannedAssignment(input(), db.options), { code: 'ONE_C_CONFLICT' });
  assert.equal(db.posts().length, 2);
});

for (const mutation of [
  (db) => { db.records.get(`Catalog_Водители:${input().driverId}`).Активен = false; },
  (db) => { db.records.get(`Catalog_ТранспортныеСредства:${input().vehicleId}`).DeletionMark = true; },
  (db) => { db.records.get(`Catalog_ПроектыКлиентов:${input().projectId}`).Owner_Key = id(99); },
  (db) => { db.records.delete(`Catalog_Клиенты:${input().clientId}`); },
]) {
  test(`invalid references are rejected before creating documents: ${mutation.toString()}`, async () => {
    const db = backend();
    mutation(db);
    await assert.rejects(exportPlannedAssignment(input(), db.options), { code: 'ONE_C_VALIDATION' });
    assert.equal(db.posts().length, 0);
  });
}

for (const invalid of [
  { status: 'canceled' }, { status: 'off' }, { assigned: false }, { cancelled: true },
  { driverId: '' }, { vehicleId: '00000000-0000-0000-0000-000000000000' },
  { date: '2026-02-30' }, { startTime: '25:00' }, { endTime: '09:00' },
  { notes: 'x'.repeat(2000) }, { tripCount: 2 }, { completed: true },
]) {
  test(`invalid or nonplanned data never starts 1C: ${JSON.stringify(invalid).slice(0, 70)}`, async () => {
    await assert.rejects(exportPlannedAssignment({ ...input(), ...invalid }, {
      ensureSource: async () => { assert.fail('validation must precede process launch'); },
      fetchImpl: async () => { assert.fail('validation must precede HTTP'); },
    }), { code: 'ONE_C_VALIDATION' });
  });
}

test('aborting after a committed request leaves it recoverable on a later immutable retry', async () => {
  const controller = new AbortController();
  let abortOnce = true;
  const db = backend({ afterCommit: ({ entity }) => {
    if (abortOnce && entity === REQUEST_ENTITY) { abortOnce = false; controller.abort(); throw controller.signal.reason; }
  } });
  await assert.rejects(exportPlannedAssignment(input(), { ...db.options, signal: controller.signal }), { name: 'AbortError' });
  assert.equal(db.posts().length, 1);
  const result = await exportPlannedAssignment(input(), db.options);
  assert.ok(result.requestId && result.shiftId);
  assert.equal(db.posts().length, 2);
});

test('unexpected server-generated IDs stop the workflow before a linked shift is created', async () => {
  const db = backend({ afterCommit: ({ entity, saved }) => entity === REQUEST_ENTITY ? response(201, { ...saved, Ref_Key: id(98) }) : undefined });
  await assert.rejects(exportPlannedAssignment(input(), db.options), { code: 'ONE_C_CONFLICT' });
  assert.equal(db.posts().length, 1);
});
