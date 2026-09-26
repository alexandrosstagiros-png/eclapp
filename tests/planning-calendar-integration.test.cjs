"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createTestServer } = require('./local-test-server.cjs');

function expect(response, status) {
  assert.equal(response.status, status, `Expected HTTP ${status}, got ${response.status}: ${JSON.stringify(response.body)}`);
  return response.body;
}
test('calendar uses scoped atomic PostgreSQL saves, shared day locks and pinned client forms', { timeout: 180_000 }, async t => {
  const fixture = await createTestServer(); t.after(() => fixture.close());
  const { request, devLogin, ids, adminPool: db } = fixture;
  await db.query("UPDATE users SET role='manager' WHERE id=$1", [ids.dispatcher]);
  await db.query('UPDATE access_grants SET personal_data_visible=true WHERE user_id=ANY($1::uuid[])', [[ids.dispatcher, ids.admin]]);
  const manager = await devLogin(ids.dispatcher), admin = await devLogin(ids.admin), driver = await devLogin(ids.drivers[0]);
  const peerScope = randomUUID();
  await db.query('INSERT INTO responsibility_scopes(id,project_id,name) VALUES($1,$2,$3)', [peerScope, ids.project, 'Синтетическая соседняя область']);
  await db.query(`INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id,personal_data_visible)
    VALUES($1,$2,$3,$4,$5,true)`, [ids.admin, ids.legal, ids.region, ids.project, peerScope]);
  const range = (from = '2026-10-01', to = '2026-10-31', scope = ids.scope) => `/planning/calendar?from=${from}&to=${to}&responsibilityScopeId=${scope}`;
  const plan = (businessDate, patch = {}) => ({ businessDate, templateId: 'general', templateVersion: 1, version: 0,
    rows: [{ id: randomUUID(), comment: 'SYNTHETIC_CALENDAR_COMMENT', clientFields: { client_note: 'SYNTHETIC_CALENDAR_PRIVATE' }, extraFields: [
      { id: randomUUID(), label: 'Паспорт', source: 'driver_passport', type: 'text', owner: 'driver' },
      { id: randomUUID(), label: 'КПП', source: 'manual', type: 'text', owner: 'assignment', value: 'SYNTHETIC_CALENDAR_ROW_PRIVATE' },
    ] }], ...patch });
  const put = (plans, token = manager.accessToken, scope = ids.scope) => request('PUT', '/planning/calendar', { responsibilityScopeId: scope, plans }, token);
  const single = (day, token = manager.accessToken) => request('PUT', '/planning', { ...day, responsibilityScopeId: ids.scope }, token);
  const stored = async date => (await db.query("SELECT id,version,rows FROM planning_plans WHERE business_date=$1 AND responsibility_scope_id=$2", [date, ids.scope])).rows[0];
  let initial;

  await t.test('requires current role and exact personal-data grant for range and batch operations', async () => {
    expect(await request('GET', range()), 401);
    expect(await request('PUT', '/planning/calendar', {}), 401);
    expect(await request('GET', range(), undefined, driver.accessToken), 403);
    expect(await put([plan('2026-10-01')], driver.accessToken), 403);
    expect(await request('GET', range('2026-10-01', '2026-10-31', peerScope), undefined, manager.accessToken), 403);
    expect(await put([plan('2026-10-01')], manager.accessToken, peerScope), 403);
    assert.deepEqual(expect(await request('GET', range(), undefined, manager.accessToken), 200), { from: '2026-10-01', to: '2026-10-31', plans: [] });
  });
  await t.test('stores a chronological inclusive range and authoritative snapshots without exposing row contents in audit', async () => {
    initial = expect(await put([plan('2026-10-03'), plan('2026-10-01')]), 200).plans;
    assert.deepEqual(initial.map(day => day.businessDate), ['2026-10-01', '2026-10-03']);
    assert.ok(initial.every(day => day.id && day.version === 1 && day.templateSnapshot.id === 'general' && day.templateSnapshot.version === 1));
    assert.ok(initial.every(day => day.rows[0].extraFields.length === 2 && !Object.hasOwn(day.rows[0].extraFields[0], 'value')));
    const loaded = expect(await request('GET', range('2026-10-01', '2026-10-03'), undefined, admin.accessToken), 200);
    assert.deepEqual(loaded.plans, initial);
    assert.deepEqual(expect(await request('GET', range('2026-10-03', '2026-10-03'), undefined, manager.accessToken), 200).plans, [initial[1]]);
    assert.deepEqual(expect(await request('GET', range('2026-10-01', '2026-10-31', peerScope), undefined, admin.accessToken), 200).plans, []);
    const events = (await db.query("SELECT payload FROM audit_events WHERE payload->>'entityId'=ANY($1::text[])", [initial.map(day => day.id)])).rows;
    assert.equal(events.length, 2);
    assert.ok(events.every(event => event.payload.metadata.businessDate && event.payload.metadata.rowCount === 1));
    assert.ok(!JSON.stringify(events).includes('SYNTHETIC_CALENDAR'));
  });
  await t.test('a later stale day or invalid reference rolls back all days and audit events', async () => {
    const before = await stored('2026-10-01');
    const beforeEvents = Number((await db.query('SELECT count(*) AS count FROM audit_events')).rows[0].count);
    expect(await put([plan('2026-10-01', { version: 1, rows: [] }), plan('2026-10-02'), plan('2026-10-03', { version: 0 })]), 409);
    assert.deepEqual(await stored('2026-10-01'), before); assert.equal(await stored('2026-10-02'), undefined);
    expect(await put([plan('2026-10-01', { version: 1, rows: [] }), plan('2026-10-02'), plan('2026-10-04', { rows: [{ id: randomUUID(), driverId: randomUUID() }] })]), 400);
    assert.deepEqual(await stored('2026-10-01'), before); assert.equal(await stored('2026-10-02'), undefined); assert.equal(await stored('2026-10-04'), undefined);
    expect(await put([plan('2026-10-01', { version: 1, rows: [] }), plan('2026-10-04', { templateId: 'unknown' })]), 400);
    expect(await put([plan('2026-10-01', { version: 1, rows: [] }), plan('2026-10-04', { rows: [{ id: randomUUID(), departureTime: '25:00' }] })]), 400);
    expect(await put([plan('2026-10-01', { version: 1, rows: [] }), plan('2026-10-04', { rows: [{ id: randomUUID(), extraFields: [{ id: randomUUID(), label: 'Неверное поле', source: 'unknown', type: 'text', owner: 'assignment' }] }] })]), 400);
    assert.deepEqual(await stored('2026-10-01'), before);
    assert.equal(Number((await db.query('SELECT count(*) AS count FROM audit_events')).rows[0].count), beforeEvents);
  });
  await t.test('batch and single saves share first-insert locks and never partially win a race', async () => {
    const shared = plan('2026-10-05'), extra = plan('2026-10-06');
    const race = await Promise.all([put([extra, shared]), single(shared, admin.accessToken)]);
    assert.deepEqual(race.map(result => result.status).sort(), [200, 409]);
    assert.equal((await stored(shared.businessDate)).version, 1);
    assert.equal(Boolean(await stored(extra.businessDate)), race[0].status === 200);
    const first = plan('2026-10-07'), second = plan('2026-10-08');
    const batches = await Promise.all([put([first, second]), put([second, first], admin.accessToken)]);
    assert.deepEqual(batches.map(result => result.status).sort(), [200, 409]);
    assert.equal((await stored(first.businessDate)).version, 1); assert.equal((await stored(second.businessDate)).version, 1);
  });
  await t.test('copied days retain immutable custom-form versions and reject forged or out-of-scope forms', async () => {
    const templateId = randomUUID();
    const definition = label => ({ label, kind: 'table', sections: [{ id: 's_main', label: 'Основной раздел', columns: [
      { key: 'c_gate', label: 'КПП', type: 'text', source: 'manual', owner: 'assignment', required: false, defaultValue: '', hint: '' },
    ] }] });
    const first = expect(await request('PUT', '/planning/templates', { responsibilityScopeId: ids.scope, id: templateId, version: 0, definition: definition('Первая форма'), makeDefault: false }, manager.accessToken), 200).template;
    expect(await put([plan('2026-10-10', { templateId })]), 200);
    expect(await request('PUT', '/planning/templates', { responsibilityScopeId: ids.scope, id: templateId, version: 1, definition: definition('Изменённая форма'), makeDefault: false }, manager.accessToken), 200);
    const copied = expect(await put([plan('2026-10-10', { templateId, version: 1 }), plan('2026-10-11', { templateId })]), 200).plans;
    assert.ok(copied.every(day => day.templateVersion === 1));
    for (const day of copied) assert.deepEqual(day.templateSnapshot, first);
    expect(await put([plan('2026-10-12'), plan('2026-10-13', { templateId, templateSnapshot: definition('FORGED') })]), 400);
    expect(await put([plan('2026-10-12'), plan('2026-10-13', { templateId })], admin.accessToken, peerScope), 400);
    assert.equal(await stored('2026-10-12'), undefined);
    assert.equal(Number((await db.query("SELECT count(*) AS count FROM planning_plans WHERE responsibility_scope_id=$1 AND business_date IN ('2026-10-12','2026-10-13')", [peerScope])).rows[0].count), 0);
    await fixture.restartApi();
    assert.deepEqual(expect(await request('GET', range('2026-10-10', '2026-10-11'), undefined, manager.accessToken), 200).plans, copied);
  });
  await t.test('HTTP validates range, ambiguous batches and bodies above the ordinary single-day parser limit', async () => {
    for (const route of [range('2026-10-01', '2026-11-01'), range('2026-10-02', '2026-10-01'), range('2026-02-30', '2026-03-01'), '/planning/calendar?responsibilityScopeId=' + ids.scope]) expect(await request('GET', route, undefined, manager.accessToken), 400);
    for (const plans of [[], [plan('2026-10-15'), plan('2026-10-15')], [plan('2026-10-15'), plan('2026-11-15')], [plan('2026-10-15', { responsibilityScopeId: peerScope })]]) expect(await put(plans), 400);
    const rows = Array.from({ length: 150 }, () => ({ id: randomUUID(), comment: 'x'.repeat(1800) }));
    const large = [plan('2026-10-15', { rows }), plan('2026-10-16', { rows })];
    assert.ok(Buffer.byteLength(JSON.stringify(large)) > 512 * 1024);
    const saved = expect(await put(large), 200).plans;
    assert.deepEqual(saved.map(day => day.rows.length), [150, 150]);
    const tooLarge = Array.from({ length: 16 }, (_, index) => plan(`2026-11-${String(index + 1).padStart(2, '0')}`, { rows }));
    assert.ok(Buffer.byteLength(JSON.stringify(tooLarge)) > 4 * 1024 * 1024);
    expect(await put(tooLarge), 413);
  });
  await t.test('scope and session revocation immediately deny calendar reads and multi-day saves', async () => {
    await db.query('UPDATE access_grants SET personal_data_visible=false WHERE user_id=$1', [ids.dispatcher]);
    expect(await request('GET', range(), undefined, manager.accessToken), 403);
    expect(await put([plan('2026-10-20'), plan('2026-10-21')]), 403);
    assert.equal(await stored('2026-10-20'), undefined);
    await db.query('UPDATE sessions SET revoked_at=clock_timestamp() WHERE user_id=$1', [ids.admin]);
    expect(await request('GET', range(), undefined, admin.accessToken), 401);
    expect(await put([plan('2026-10-20')], admin.accessToken), 401);
  });
});
