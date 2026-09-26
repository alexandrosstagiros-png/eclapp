'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createRequire } = require('node:module');
const path = require('node:path');
const { createTestServer } = require('./local-test-server.cjs');
const appRequire = createRequire(path.resolve(__dirname, '../recovered/package.json'));
const ExcelJS = appRequire('exceljs');

const headers = ['ЗН_id', 'Номер ЗН', 'Дата открытия', 'Месяц открытия', 'Госномер', 'Бренд ТС', 'Марка', 'Год', 'Тип ТС', 'Пробег, км',
  'Тип позиции', 'Группа', 'Узел', 'Наименование', 'Бренд', 'Кол-во', 'Ед.', 'Цена за ед., ₽', 'Сумма, ₽', 'Долив (не замена)',
  'Шины', 'Подрядчик', 'Своими силами', 'Статус ЗН', 'Дата завершения', 'Месяц завершения', 'Группа (авто)', 'Узел (авто)'];
async function workbook(amount = 10, count = 3) {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Позиции'); sheet.addRow(headers);
  for (let i = 0; i < count; i++) sheet.addRow([i + 1, `TEST-${i}`, new Date('2026-01-01T00:00:00Z'), '2026-01',
    i % 2 ? 'В222ВВ777' : 'А111АА777', 'ГАЗ', 'Группа тест', 2021, 'Грузовой', 10000 + i, i % 2 ? 'работа' : 'запчасть',
    'ТО', 'Фильтры', i === 0 ? '=HYPERLINK("https://example.invalid")' : `Деталь ${i}`, '', 1, 'шт.', amount, amount,
    false, false, 'Сервис', false, 'Финиш', new Date('2026-01-02T00:00:00Z'), '2026-01', 'ТО', 'Фильтры']);
  return Buffer.from(await book.xlsx.writeBuffer());
}

test('fleet snapshots enforce scope/finance, stage without activation, replace atomically and preserve history', { timeout: 180000 }, async t => {
  const fixture = await createTestServer(); t.after(() => fixture.close());
  const { request, devLogin, adminPool: db, ids, origin } = fixture;
  const peerScope = randomUUID();
  await db.query('INSERT INTO responsibility_scopes(id,project_id,name) VALUES($1,$2,$3)', [peerScope, ids.project, 'Synthetic fleet peer']);
  await db.query('UPDATE access_grants SET finance_visible=true WHERE user_id=$1', [ids.admin]);
  await db.query(`INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id,finance_visible)
    VALUES($1,$2,$3,$4,$5,true)`, [ids.admin, ids.legal, ids.region, ids.project, peerScope]);
  const admin = await devLogin(ids.admin);
  const sessions = {};
  const base = '/fleet-maintenance';
  function expect(result, status = 200) { assert.equal(result.status, status, JSON.stringify(result.body)); return result.body; }
  const read = (token = admin.accessToken, scope = ids.scope, query = '') => request('GET', `${base}?responsibilityScopeId=${scope}${query}`, undefined, token);
  async function employee(role, finance = true) {
    const id = randomUUID();
    await db.query('INSERT INTO users(id,display_name,role,active,approved) VALUES($1,$2,$3,true,true)', [id, `Fleet synthetic ${role}`, role]);
    await db.query(`INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id,finance_visible)
      VALUES($1,$2,$3,$4,$5,$6)`, [id, ids.legal, ids.region, ids.project, ids.scope, finance]);
    return devLogin(id);
  }
  async function preview(bytes, token = admin.accessToken, scope = ids.scope, filename = 'synthetic-fleet.xlsx') {
    const form = new FormData(); form.append('responsibilityScopeId', scope); form.append('file', new Blob([bytes]), filename);
    const response = await fetch(`${origin}/api/v1${base}/imports/preview`, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: form });
    return { status: response.status, body: await response.json() };
  }
  const commit = (id, expectedVersion, token = admin.accessToken, scope = ids.scope) => request('POST', `${base}/imports/commit`,
    { responsibilityScopeId: scope, datasetId: id, expectedVersion }, token);
  const link = (patch = {}, token = admin.accessToken) => request('PUT', `${base}/vehicle-links`, {
    responsibilityScopeId: ids.scope, plate: 'А111АА777', vehicleKey: 'в222вв777', canonicalPlate: 'В222ВВ777', reason: 'Подтверждено по VIN: синтетический тест', expectedVersion: 1, ...patch,
  }, token);
  const bytes = await workbook(); let first; let second;

  await t.test('role plus exact current scope and finance grant are all required', async () => {
    expect(await read(undefined), 200); // default helper token is intentionally administrator
    expect(await request('GET', `${base}/context`), 401);
    const context = expect(await request('GET', `${base}/context`, undefined, admin.accessToken));
    assert.equal(context.scopes.length, 2); assert.ok(context.scopes.every(scope => scope.canWrite));
    assert.deepEqual(expect(await read()), { dataset: null, version: 0, links: [], nativeRowCount: 0, analytics: null });
    for (const role of ['manager', 'mechanic', 'auditor']) {
      sessions[role] = await employee(role);
      expect(await read(sessions[role].accessToken));
      const available = expect(await request('GET', `${base}/context`, undefined, sessions[role].accessToken));
      assert.equal(available.scopes[0].canWrite, role !== 'auditor');
      expect(await read(sessions[role].accessToken, peerScope), 403);
    }
    for (const role of ['driver', 'dispatcher', 'tender_specialist', 'recruiter']) {
      const denied = await employee(role);
      expect(await read(denied.accessToken), 403);
      expect(await preview(bytes, denied.accessToken), 403);
    }
    for (const role of ['access_admin', 'manager', 'mechanic', 'auditor']) {
      const hidden = await employee(role, false);
      assert.deepEqual(expect(await request('GET', `${base}/context`, undefined, hidden.accessToken)).scopes, []);
      expect(await read(hidden.accessToken), 403);
      expect(await commit(randomUUID(), 0, hidden.accessToken), 403);
    }
    expect(await preview(bytes, sessions.auditor.accessToken), 403);
    expect(await commit(randomUUID(), 0, sessions.auditor.accessToken), 403);
    expect(await link({}, sessions.auditor.accessToken), 403);
  });
  await t.test('preview validates server source and persists a staging snapshot without replacing active data', async () => {
    const originalName = 'Заказ-наряды_автопарк v3.xlsx';
    first = expect(await preview(bytes, sessions.mechanic.accessToken, ids.scope, originalName), 201);
    assert.equal(first.dataset.fileName, originalName);
    assert.equal(first.version, 0); assert.equal(first.summary.amountCents, 3000); assert.equal(first.dataset.rowCount, 3);
    assert.equal(first.alreadyActive, false); assert.equal(expect(await read()).dataset, null);
    assert.equal(expect(await preview(bytes), 201).dataset.id, first.dataset.id);
    const history = expect(await request('GET', `${base}/imports?responsibilityScopeId=${ids.scope}`, undefined, admin.accessToken));
    assert.equal(history.items.length, 1);
    expect(await preview(Buffer.from('not xlsx')), 400);
    expect(await preview(Buffer.alloc(0)), 400);
    expect(await preview(bytes, admin.accessToken, ids.scope, 'wrong.exe'), 400);
    expect(await preview(Buffer.alloc(20 * 1024 * 1024 + 1)), 413);
    assert.equal(expect(await read()).version, 0);
    const activated = expect(await commit(first.dataset.id, 0, sessions.manager.accessToken), 201);
    assert.equal(activated.version, 1);
    assert.equal(expect(await read()).analytics.summary.amountCents, 3000);
    assert.equal(expect(await read(admin.accessToken, peerScope)).dataset, null);
    expect(await commit(first.dataset.id, 0, admin.accessToken, peerScope), 400);
  });
  await t.test('shared vehicle links require evidence, advance version and preserve source rows', async () => {
    expect(await link({ reason: ' ' }), 400);
    const linked = expect(await link()); assert.equal(linked.version, 2);
    const data = expect(await read()); assert.equal(data.analytics.summary.vehicleCount, 1); assert.equal(data.analytics.summary.rowCount, 3);
    expect(await link(), 409);
    assert.equal(expect(await commit(first.dataset.id, 0), 201).version, 2);
    assert.equal(expect(await commit(first.dataset.id, 0), 201).alreadyActive, true);
    const unlinked = expect(await link({ vehicleKey: '', expectedVersion: 2, reason: 'Синтетическое подтверждение отменено' }));
    assert.equal(unlinked.version, 3); assert.equal(expect(await read()).analytics.summary.vehicleCount, 2);
  });
  await t.test('atomic competing activation has one winner; historical datasets can be reactivated', async () => {
    second = expect(await preview(await workbook(20, 205)), 201);
    assert.equal(second.version, 3); assert.equal(expect(await read()).dataset.id, first.dataset.id);
    const third = expect(await preview(await workbook(30, 2)), 201);
    const competing = await Promise.all([commit(second.dataset.id, 3), commit(third.dataset.id, 3)]);
    assert.deepEqual(competing.map(result => result.status).sort(), [201, 409]);
    assert.equal(expect(await read()).version, 4);
    expect(await commit(first.dataset.id, 3), 409);
    const restored = expect(await commit(first.dataset.id, 4), 201); assert.equal(restored.version, 5);
    assert.equal(expect(await read()).analytics.summary.amountCents, 3000);
    const last = expect(await commit(second.dataset.id, 5), 201); assert.equal(last.version, 6);
    assert.equal(expect(await read()).analytics.summary.amountCents, 410000);
    assert.equal(expect(await read()).analytics.details.items.length, 50);
    await fixture.restartApi();
    const persisted = expect(await read()); assert.equal(persisted.version, 6); assert.equal(persisted.dataset.id, second.dataset.id);
    assert.equal((await db.query('SELECT count(*)::integer AS count FROM fleet_maintenance_datasets')).rows[0].count, 3);
    assert.equal((await db.query('SELECT count(*)::integer AS count FROM fleet_maintenance_events')).rows[0].count, 6);
    const privileges = (await db.query(`SELECT has_table_privilege('transport_app','fleet_maintenance_datasets','UPDATE,DELETE') AS mutable,
      has_table_privilege('transport_app','fleet_maintenance_events','UPDATE,DELETE') AS events_mutable`)).rows[0];
    assert.deepEqual(privileges, { mutable: false, events_mutable: false });
  });
  await t.test('filtered export includes every matched row and neutralizes spreadsheet formulas', async () => {
    const response = await fetch(`${origin}/api/v1${base}/export?responsibilityScopeId=${ids.scope}&page=2&pageSize=1`, { headers: { Authorization: `Bearer ${sessions.auditor.accessToken}` } });
    assert.equal(response.status, 200); assert.match(response.headers.get('content-disposition'), /attachment/);
    const raw = Buffer.from(await response.arrayBuffer()); assert.equal(raw.subarray(0, 3).toString('hex'), 'efbbbf');
    const csv = raw.toString('utf8'); assert.equal(csv.trim().split('\r\n').length, 206); assert.ok(csv.includes("'=HYPERLINK"));
    expect(await read(admin.accessToken, ids.scope, '&dateFrom=2026-02-30'), 400);
    const noMatches = expect(await read(admin.accessToken, ids.scope, '&dateFrom=2027-01-01'));
    assert.equal(noMatches.analytics.summary.amountCents, 0); assert.equal(noMatches.analytics.summary.averageOrderCents, null);
    const reconciliation = expect(await request('GET', `${base}/reconciliation?responsibilityScopeId=${ids.scope}`, undefined, admin.accessToken));
    assert.equal(reconciliation.kind, 'none');
    const report = await fetch(`${origin}/api/v1${base}/report.pptx?responsibilityScopeId=${ids.scope}&positionType=${encodeURIComponent('работа')}`,
      { headers: { Authorization: `Bearer ${sessions.auditor.accessToken}` } });
    assert.equal(report.status, 200); assert.match(report.headers.get('content-type'), /presentationml/);
    const presentation = Buffer.from(await report.arrayBuffer()); assert.equal(presentation.subarray(0, 2).toString(), 'PK');
  });
  await t.test('live permission revocation prevents reads and writes with an existing session', async () => {
    await db.query('UPDATE access_grants SET finance_visible=false WHERE user_id=$1', [sessions.mechanic.actor.id]);
    expect(await read(sessions.mechanic.accessToken), 403);
    expect(await request('GET', `${base}/report.pptx?responsibilityScopeId=${ids.scope}`, undefined, sessions.mechanic.accessToken), 403);
    expect(await preview(bytes, sessions.mechanic.accessToken), 403);
    await db.query('DELETE FROM access_grants WHERE user_id=$1', [sessions.manager.actor.id]);
    expect(await commit(first.dataset.id, 6, sessions.manager.accessToken), 403);
    assert.equal(expect(await read()).version, 6);
  });
  await t.test('CSV money preserves negative cents and maximum safe precision without formula escaping numeric cells', async () => {
    const csv = '\uFEFFЗН_id;Госномер;Тип позиции;Наименование;Сумма, ₽;Дата завершения;Статус ЗН;Своими силами\n' +
      'edge-1;А111АА777;запчасть;Предельная сумма;90071992547409.91;2026-01-01;Финиш;true\n' +
      'edge-2;А111АА777;работа;Корректировка;-0.01;2026-01-01;Финиш;true\n';
    const staging = expect(await preview(Buffer.from(csv), admin.accessToken, peerScope, 'cents.csv'), 201);
    assert.equal(staging.summary.amountCents, Number.MAX_SAFE_INTEGER - 1);
    expect(await commit(staging.dataset.id, 0, admin.accessToken, peerScope), 201);
    const response = await fetch(`${origin}/api/v1${base}/export?responsibilityScopeId=${peerScope}`, { headers: { Authorization: `Bearer ${admin.accessToken}` } });
    const exported = await response.text();
    assert.ok(exported.includes('"90071992547409.91"')); assert.ok(exported.includes('"-0.01"')); assert.ok(!exported.includes("'-0.01"));
    const roundTrip = expect(await preview(Buffer.from(exported), admin.accessToken, peerScope, 'round-trip.csv'), 201);
    assert.equal(roundTrip.summary.amountCents, Number.MAX_SAFE_INTEGER - 1);
    const source = (await db.query('SELECT payload FROM fleet_maintenance_datasets WHERE id=$1', [roundTrip.dataset.id])).rows[0].payload;
    assert.ok(source.rows.every(row => row.ownWorkReported === true));
  });
});
