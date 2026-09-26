'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ENTITIES, readEntity, readSnapshot, normalize } = require('./adapter.cjs');

const EMPTY_ID = '00000000-0000-0000-0000-000000000000';
const id = (n) => `${String(n).padStart(8, '0')}-1234-4321-9876-123456789abc`;
const jsonResponse = (value) => ({ ok: true, status: 200, json: async () => ({ value }) });

function fixture() {
  return {
    drivers: [{ Ref_Key: id(1), Code: 'D1', Description: 'Тестовый водитель', Телефон: '+7 000 000-00-00', Активен: true }],
    vehicles: [{ Ref_Key: id(2), Code: 'V1', Description: 'Тестовый автомобиль', ГосНомер: 'Т001ЕСТ', Активен: true }],
    clients: [{ Ref_Key: id(3), Description: 'Тестовый клиент' }],
    projects: [{ Ref_Key: id(4), Description: 'Тестовый проект' }],
    requests: [{
      Ref_Key: id(5), Number: 'REQ1', Date: '2026-09-18T00:00:00',
      Клиент_Key: id(3), Проект_Key: id(4), СтатусЗаявки: 'Выполнена',
      ФактическоеВремяНачала: '2026-09-18T09:00:00', ФактическоеВремяОкончания: '2026-09-18T18:00:00',
    }],
    shifts: [{
      Ref_Key: id(6), Number: 'SHIFT1', Date: '2026-09-17T12:00:00', ДатаСмены: '2026-09-18T00:00:00',
      Клиент_Key: id(3), Проект_Key: id(4), РесурсыСмены: [{
        LineNumber: '1', Водитель_Key: id(1), ТранспортноеСредство_Key: id(2), Заявка_Key: id(5),
        ВышелНаЛинию: true, СтатусВыходаНаЛинию: 'ВышелНаЛинию', ЕстьНеподача: false,
      }],
    }],
  };
}

test('OData filter uses percent-encoded spaces, avoiding the 1C empty-result regression', async () => {
  let calls = 0;
  const result = await readEntity(...ENTITIES.drivers, async (url, options) => {
    calls += 1;
    assert.equal(options.method, 'GET');
    assert.equal(options.redirect, 'error');
    assert.ok(!url.href.includes('+'), '1C must not receive HTML form space encoding');
    assert.match(url.href, /DeletionMark%20eq%20false/);
    assert.equal(url.searchParams.get('$filter'), 'DeletionMark eq false');
    assert.equal(decodeURIComponent(url.pathname).split('/').at(-1), 'Catalog_Водители');
    return jsonResponse([{ Ref_Key: id(1) }]);
  });
  assert.equal(calls, 1);
  assert.deepEqual(result, [{ Ref_Key: id(1) }]);
});

test('request completion is derived only after a valid driver departure and actual time interval', () => {
  const snapshot = normalize(fixture(), '2026-09-18T16:00:00.000Z');
  assert.equal(snapshot.counts.completed, 1);
  assert.equal(snapshot.counts.departed, 1);
  assert.equal(snapshot.assignments[0].completed, true);
  assert.equal(snapshot.assignments[0].driverName, 'Тестовый водитель');
  assert.equal(snapshot.assignments[0].vehicleRegistration, 'Т001ЕСТ');
  assert.equal(snapshot.assignments[0].requestNumber, 'REQ1');
  assert.equal(snapshot.requests[0].clientName, 'Тестовый клиент');
  assert.equal(snapshot.requests[0].projectName, 'Тестовый проект');
  assert.equal(snapshot.assignments[0].date, '2026-09-18T00:00:00');
  assert.equal(snapshot.assignments[0].actualStart, '2026-09-18T09:00:00', 'local 1C wall time must not gain a UTC suffix');
  assert.equal(snapshot.fetchedAt, '2026-09-18T16:00:00.000Z');
});

for (const status of ['Неподача', 'Отменен', 'Заменен']) {
  test(`a stale departure flag cannot complete an assignment with status ${status}`, () => {
    const raw = fixture();
    raw.shifts[0].РесурсыСмены[0].СтатусВыходаНаЛинию = status;
    const snapshot = normalize(raw);
    assert.equal(snapshot.assignments[0].departed, false);
    assert.equal(snapshot.assignments[0].completed, false);
    assert.equal(snapshot.counts.departed, 0);
    assert.equal(snapshot.counts.completed, 0);
    assert.ok(snapshot.warnings.some((warning) => warning.includes('противоречит')));
  });
}

test('a no-show flag overrides a positive departure status', () => {
  const raw = fixture();
  raw.shifts[0].РесурсыСмены[0].ЕстьНеподача = true;
  const snapshot = normalize(raw);
  assert.equal(snapshot.assignments[0].departed, false);
  assert.equal(snapshot.counts.completed, 0);
});

test('a planned assignment is not completion even if its linked request is already completed', () => {
  const raw = fixture();
  Object.assign(raw.shifts[0].РесурсыСмены[0], { ВышелНаЛинию: false, СтатусВыходаНаЛинию: 'Запланирован' });
  const snapshot = normalize(raw);
  assert.equal(snapshot.counts.departed, 0);
  assert.equal(snapshot.counts.completed, 0);
});

test('departure and recorded times do not complete an unfinished request', () => {
  const raw = fixture();
  raw.requests[0].СтатусЗаявки = 'ВРейсе';
  const snapshot = normalize(raw);
  assert.equal(snapshot.counts.departed, 1);
  assert.equal(snapshot.counts.completed, 0);
});

for (const field of ['ФактическоеВремяНачала', 'ФактическоеВремяОкончания']) {
  for (const absent of [undefined, '', '0001-01-01T00:00:00']) {
    test(`missing ${field} (${String(absent)}) is not completion`, () => {
      const raw = fixture();
      raw.requests[0][field] = absent;
      const snapshot = normalize(raw);
      assert.equal(snapshot.counts.completed, 0);
      assert.equal(snapshot.requests[0][field === 'ФактическоеВремяНачала' ? 'actualStart' : 'actualEnd'], null);
    });
  }
}

for (const end of ['2026-09-18T09:00:00', '2026-09-18T08:59:59']) {
  test(`a zero or reversed actual interval is not completion (${end})`, () => {
    const raw = fixture();
    raw.requests[0].ФактическоеВремяОкончания = end;
    assert.equal(normalize(raw).counts.completed, 0);
  });
}

test('zero GUID references represent empty links rather than missing linked records', () => {
  const raw = fixture();
  Object.assign(raw.shifts[0].РесурсыСмены[0], { Водитель_Key: EMPTY_ID, ТранспортноеСредство_Key: EMPTY_ID, Заявка_Key: EMPTY_ID });
  Object.assign(raw.requests[0], { Клиент_Key: EMPTY_ID, Проект_Key: EMPTY_ID });
  const snapshot = normalize(raw);
  const row = snapshot.assignments[0];
  assert.deepEqual([row.driverId, row.vehicleId, row.requestId], [null, null, null]);
  assert.equal(row.completed, false);
  assert.equal(snapshot.requests[0].clientName, '');
  assert.equal(snapshot.requests[0].projectName, '');
  assert.ok(!snapshot.warnings.some((warning) => warning.includes('связанная запись отсутствует')));
});

test('missing referenced driver prevents completion and produces a warning', () => {
  const raw = fixture();
  raw.drivers = [];
  const snapshot = normalize(raw);
  assert.equal(snapshot.counts.completed, 0);
  assert.ok(snapshot.warnings.some((warning) => warning.includes('связанная запись отсутствует')));
});

test('an omitted assignment table is an error, while an explicitly empty one is valid', () => {
  const raw = fixture();
  delete raw.shifts[0].РесурсыСмены;
  assert.throws(() => normalize(raw), /Не получены строки смены SHIFT1/);
  raw.shifts[0].РесурсыСмены = [];
  assert.equal(normalize(raw).counts.assignments, 0);
});

test('duplicate source IDs cannot silently replace records during linking', () => {
  const raw = fixture();
  raw.drivers.push({ ...raw.drivers[0], Description: 'Другой водитель с тем же ID' });
  assert.throws(() => normalize(raw), /Повторный идентификатор в drivers/);
});

test('duplicate shift row identities cannot inflate assignment totals', () => {
  const raw = fixture();
  raw.shifts[0].РесурсыСмены.push({ ...raw.shifts[0].РесурсыСмены[0] });
  assert.throws(() => normalize(raw), /Повторные номера строк смен/);
});

function pagedFetch(total, skips) {
  return async (url) => {
    const skip = Number(url.searchParams.get('$skip'));
    const top = Number(url.searchParams.get('$top'));
    skips.push(skip);
    return jsonResponse(Array.from({ length: Math.min(top, Math.max(total - skip, 0)) }, (_, index) => ({ Ref_Key: id(skip + index + 1) })));
  };
}

test('pagination reads the final partial page without dropping records', async () => {
  const skips = [];
  const rows = await readEntity(...ENTITIES.drivers, pagedFetch(501, skips));
  assert.equal(rows.length, 501);
  assert.equal(rows.at(-1).Ref_Key, id(501));
  assert.deepEqual(skips, [0, 500]);
});

test('exactly 10,000 records are accepted after checking that there is no next record', async () => {
  const skips = [];
  const rows = await readEntity(...ENTITIES.drivers, pagedFetch(10000, skips));
  assert.equal(rows.length, 10000);
  assert.equal(rows.at(-1).Ref_Key, id(10000));
  assert.equal(skips.at(-1), 10000);
});

test('10,001 records fail explicitly instead of silently truncating at the safety limit', async () => {
  const skips = [];
  await assert.rejects(readEntity(...ENTITIES.drivers, pagedFetch(10001, skips)), /больше 10 000 записей/);
  assert.equal(skips.at(-1), 10000);
});

test('source failures and malformed results cannot become a successful empty snapshot', async () => {
  await assert.rejects(readEntity(...ENTITIES.drivers, async () => { throw new Error('offline'); }), /Нет ответа/);
  await assert.rejects(readEntity(...ENTITIES.drivers, async () => ({ ok: false, status: 503 })), /HTTP 503/);
  await assert.rejects(readEntity(...ENTITIES.drivers, async () => ({ ok: true, json: async () => ({ error: 'bad query' }) })), /неверный формат/);
});

test('snapshot reads are serial so the developer-license session is not used concurrently', async () => {
  const raw = fixture();
  const entityData = new Map(Object.entries(ENTITIES).map(([key, [entity]]) => [entity, raw[key]]));
  let active = 0;
  let peak = 0;
  let calls = 0;
  const snapshot = await readSnapshot(async (url) => {
    calls += 1;
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setImmediate(resolve));
    active -= 1;
    return jsonResponse(entityData.get(decodeURIComponent(url.pathname).split('/').at(-1)));
  });
  assert.equal(calls, 6);
  assert.equal(peak, 1);
  assert.equal(snapshot.counts.assignments, 1);
});
