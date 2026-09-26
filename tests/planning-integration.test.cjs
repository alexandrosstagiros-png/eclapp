"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createTestServer } = require('./local-test-server.cjs');

test('planning persists scoped manager drafts through the real HTTP API and PostgreSQL', { timeout: 180_000 }, async t => {
  const fixture = await createTestServer();
  t.after(() => fixture.close());
  const { request, devLogin, adminPool: db, ids } = fixture;
  const owned = [ids.legal, ids.region, ids.project, ids.scope];
  const elsewhere = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  const peerScope = randomUUID();
  await db.query('INSERT INTO legal_entities VALUES($1,$2)', [elsewhere[0], 'Synthetic other company']);
  await db.query('INSERT INTO regions VALUES($1,$2,$3)', [elsewhere[1], 'Synthetic other region', 'Asia/Yekaterinburg']);
  await db.query('INSERT INTO projects VALUES($1,$2,$3,$4)', [elsewhere[2], 'Synthetic other project', elsewhere[0], elsewhere[1]]);
  await db.query('INSERT INTO responsibility_scopes VALUES($1,$2,$3)', [elsewhere[3], elsewhere[2], 'Synthetic other scope']);
  await db.query('INSERT INTO responsibility_scopes VALUES($1,$2,$3)', [peerScope, ids.project, 'Synthetic other group in same project']);
  async function grant(id, scope = owned, personalData = true) {
    await db.query(`INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id,personal_data_visible)
      VALUES($1,$2,$3,$4,$5,$6)`, [id, ...scope, personalData]);
  }
  async function employee(role, scope = owned, extra = {}) {
    const id = randomUUID();
    await db.query('INSERT INTO users(id,display_name,role,active,approved) VALUES($1,$2,$3,$4,$5)', [id, `Synthetic ${role} ${id}`, role, extra.active ?? true, extra.approved ?? true]);
    if (scope) await grant(id, scope, extra.personalData ?? true);
    return id;
  }
  function expect(response, status) {
    assert.equal(response.status, status, `Expected HTTP ${status}, got ${response.status}: ${JSON.stringify(response.body)}`);
    return response.body;
  }
  const managerId = await employee('manager');
  const secondManagerId = await employee('manager');
  const foreignManagerId = await employee('manager', elsewhere);
  const manager = await devLogin(managerId);
  const second = await devLogin(secondManagerId);
  const foreign = await devLogin(foreignManagerId);
  const date = '2026-09-17';
  const query = (scope = ids.scope, day = date) => `/planning?date=${day}&responsibilityScopeId=${scope}`;
  let saved;
  let options;
  let firstInput;

  await t.test('requires authentication and an eligible role with personal-data access', async () => {
    for (const route of ['/planning/context', `/planning/options?responsibilityScopeId=${ids.scope}`, query()]) expect(await request('GET', route), 401);
    expect(await request('PUT', '/planning', {}), 401);
    for (const role of ['driver', 'document_specialist', 'mechanic', 'auditor']) {
      const login = await devLogin(await employee(role));
      expect(await request('GET', '/planning/context', undefined, login.accessToken), 403);
      expect(await request('GET', query(), undefined, login.accessToken), 403);
    }
    const unprivileged = await devLogin(await employee('manager', owned, { personalData: false }));
    assert.deepEqual(expect(await request('GET', '/planning/context', undefined, unprivileged.accessToken), 200), { scopes: [] });
    expect(await request('GET', query(), undefined, unprivileged.accessToken), 403);
    const context = expect(await request('GET', '/planning/context', undefined, manager.accessToken), 200);
    assert.equal(context.scopes.length, 1);
    assert.equal(context.scopes[0].responsibilityScopeId, ids.scope);
    assert.equal(context.scopes[0].timeZone, 'Europe/Moscow');
    assert.equal(context.scopes[0].projectId, ids.project);
  });
  await t.test('options include only approved active drivers and vehicles in the exact scope', async () => {
    const allowedDriver = await employee('driver');
    const deniedDrivers = [await employee('driver', elsewhere), await employee('driver', [ids.legal, ids.region, ids.project, peerScope]), await employee('driver', owned, { active: false }), await employee('driver', owned, { approved: false })];
    const foreignVehicle = randomUUID();
    await db.query("INSERT INTO vehicles VALUES($1,'Synthetic foreign vehicle','box',1500,'own')", [foreignVehicle]);
    await db.query(`INSERT INTO trips(id,reference,business_date,legal_entity_id,region_id,project_id,responsibility_scope_id,vehicle_id,route_summary)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,'Synthetic route')`, [randomUUID(), randomUUID(), date, ...elsewhere, foreignVehicle]);
    options = expect(await request('GET', `/planning/options?responsibilityScopeId=${ids.scope}`, undefined, manager.accessToken), 200);
    assert.ok(options.drivers.some(driver => driver.id === allowedDriver));
    for (const id of deniedDrivers) assert.ok(!options.drivers.some(driver => driver.id === id));
    assert.ok(options.vehicles.length > 0);
    assert.ok(!options.vehicles.some(vehicle => vehicle.id === foreignVehicle));
    assert.ok(options.drivers.every(driver => typeof driver.id === 'string' && typeof driver.name === 'string'));
    expect(await request('GET', `/planning/options?responsibilityScopeId=${peerScope}`, undefined, manager.accessToken), 403);
    expect(await request('GET', `/planning/options?responsibilityScopeId=${elsewhere[3]}`, undefined, manager.accessToken), 403);
    firstInput = { businessDate: date, responsibilityScopeId: ids.scope, templateId: 'lamoda', version: 0, rows: [
      { id: randomUUID(), driverId: allowedDriver, vehicleId: options.vehicles[0].id, departureTime: '06:30', status: 'work', confirmed: true, requestCreated: false, arrived: false, tripCount: 2, comment: 'Synthetic confidential comment', clientFields: { passport: 'SYNTHETIC_PASSPORT_ONLY', gate: 'B' }, extraFields: [
        { id: randomUUID(), label: 'Паспорт водителя', source: 'driver_passport', type: 'text', owner: 'driver' },
        { id: randomUUID(), label: 'Модель автомобиля', source: 'vehicle_model', type: 'text', owner: 'vehicle', value: '' },
        { id: randomUUID(), label: 'Примечание клиента', source: 'manual', type: 'text', owner: 'assignment', value: 'SYNTHETIC_ROW_PRIVATE' },
      ] },
      { id: randomUUID(), driverId: null, vehicleId: null, departureTime: '', status: 'paid_reserve', confirmed: false, requestCreated: false, arrived: false, tripCount: 1, comment: '', clientFields: { arbitraryClientField: 'Синтетические данные' }, extraFields: [] },
    ] };
    for (const override of [{ driverId: deniedDrivers[0] }, { driverId: deniedDrivers[1] }, { vehicleId: foreignVehicle }]) {
      expect(await request('PUT', '/planning', { ...firstInput, rows: [{ ...firstInput.rows[0], ...override }] }, manager.accessToken), 400);
    }
  });
  await t.test('saves and reloads ordered client-specific rows without leaking their contents into audit', async () => {
    const empty = expect(await request('GET', query(), undefined, manager.accessToken), 200);
    assert.equal(empty.id, null); assert.equal(empty.version, 0); assert.deepEqual(empty.rows, []);
    saved = expect(await request('PUT', '/planning', firstInput, manager.accessToken), 200);
    assert.equal(saved.version, 1); assert.ok(saved.id); assert.ok(saved.updatedAt);
    assert.deepEqual(saved.rows, firstInput.rows);
    assert.deepEqual(expect(await request('GET', query(), undefined, second.accessToken), 200), saved);
    const events = (await db.query("SELECT payload FROM audit_events WHERE payload->>'entityId'=$1", [saved.id])).rows;
    assert.equal(events.length, 1);
    assert.equal(events[0].payload.action, 'planning.created');
    assert.equal(events[0].payload.metadata.rowCount, 2);
    assert.ok(!JSON.stringify(events).includes('SYNTHETIC_PASSPORT_ONLY'));
    assert.ok(!JSON.stringify(events).includes('Synthetic confidential comment'));
    assert.ok(!JSON.stringify(events).includes('SYNTHETIC_ROW_PRIVATE'));
    assert.equal(Object.hasOwn(saved.rows[0].extraFields[0], 'value'), false);
    assert.equal(saved.rows[0].extraFields[1].value, '');
    assert.deepEqual(saved.rows[1].extraFields, []);
    assert.equal(Number((await db.query('SELECT count(*) AS count FROM telegram_deliveries')).rows[0].count), 0);
    await fixture.restartApi();
    assert.deepEqual(expect(await request('GET', query(), undefined, manager.accessToken), 200), saved);
  });
  await t.test('separates dates, projects and responsibility scopes and rejects forged scope fields', async () => {
    assert.equal(expect(await request('GET', query(ids.scope, '2026-09-18'), undefined, manager.accessToken), 200).version, 0);
    expect(await request('GET', query(elsewhere[3]), undefined, manager.accessToken), 403);
    expect(await request('GET', query(), undefined, foreign.accessToken), 403);
    expect(await request('PUT', '/planning', { ...firstInput, responsibilityScopeId: elsewhere[3] }, manager.accessToken), 403);
    expect(await request('PUT', '/planning', { ...firstInput, version: 1, legalEntityId: elsewhere[0] }, manager.accessToken), 400);
    await grant(secondManagerId, [ids.legal, ids.region, ids.project, peerScope]);
    const other = expect(await request('PUT', '/planning', { ...firstInput, responsibilityScopeId: peerScope, rows: [], templateId: 'general' }, second.accessToken), 200);
    assert.notEqual(other.id, saved.id);
    assert.equal(other.templateId, 'general');
    assert.deepEqual(expect(await request('GET', query(), undefined, manager.accessToken), 200), saved);
  });
  await t.test('optimistic versions prevent stale writes and concurrent creation loses no data', async () => {
    expect(await request('PUT', '/planning', firstInput, second.accessToken), 409);
    saved = expect(await request('PUT', '/planning', { ...firstInput, version: 1, rows: [...firstInput.rows].reverse() }, second.accessToken), 200);
    assert.equal(saved.version, 2);
    assert.equal(saved.rows[0].id, firstInput.rows[1].id);
    expect(await request('PUT', '/planning', { ...firstInput, version: 1 }, manager.accessToken), 409);
    const create = { ...firstInput, businessDate: '2026-09-20', rows: [] };
    const concurrent = await Promise.all([request('PUT', '/planning', create, manager.accessToken), request('PUT', '/planning', create, second.accessToken)]);
    assert.deepEqual(concurrent.map(result => result.status).sort(), [200, 409]);
    assert.equal(Number((await db.query("SELECT count(*) AS count FROM planning_plans WHERE business_date='2026-09-20'")).rows[0].count), 1);
  });
  await t.test('validates dates, row values and sizeable ordinary plans', async () => {
    for (const route of [`/planning?responsibilityScopeId=${ids.scope}`, query(ids.scope, '2026-02-30'), '/planning/options?responsibilityScopeId=invalid']) expect(await request('GET', route, undefined, manager.accessToken), 400);
    for (const patch of [{ status: 'invalid' }, { departureTime: '24:01' }, { tripCount: 0 }, { confirmed: 'yes' }, { clientFields: { field: 123 } },
      { extraFields: [{ ...firstInput.rows[0].extraFields[0], source: 'users.password_hash' }] },
      { extraFields: [{ ...firstInput.rows[0].extraFields[0], owner: 'vehicle' }] },
      { extraFields: [{ ...firstInput.rows[0].extraFields[0], type: 'date', value: '2026-02-30' }] },
    ]) {
      expect(await request('PUT', '/planning', { ...firstInput, version: 2, rows: [{ ...firstInput.rows[0], ...patch }] }, manager.accessToken), 400);
    }
    assert.deepEqual(expect(await request('GET', query(), undefined, manager.accessToken), 200), saved);
    const bulk = { ...firstInput, businessDate: '2026-09-21', rows: Array.from({ length: 40 }, () => ({ ...firstInput.rows[1], id: randomUUID(), comment: 'x'.repeat(500) })) };
    assert.ok(Buffer.byteLength(JSON.stringify(bulk)) > 16 * 1024);
    const bulkSaved = expect(await request('PUT', '/planning', bulk, manager.accessToken), 200);
    assert.equal(bulkSaved.rows.length, 40);
    assert.equal(expect(await request('GET', query(ids.scope, '2026-09-21'), undefined, manager.accessToken), 200).rows.length, 40);
  });
  await t.test('revoked access and revoked sessions immediately block saved personal data', async () => {
    await db.query('UPDATE access_grants SET personal_data_visible=false WHERE user_id=$1', [managerId]);
    expect(await request('GET', query(), undefined, manager.accessToken), 403);
    expect(await request('PUT', '/planning', { ...firstInput, version: 2 }, manager.accessToken), 403);
    await db.query('UPDATE sessions SET revoked_at=clock_timestamp() WHERE user_id=$1', [secondManagerId]);
    expect(await request('GET', query(), undefined, second.accessToken), 401);
    const admin = await devLogin(ids.admin);
    expect(await request('GET', query(), undefined, admin.accessToken), 403);
    await db.query('UPDATE access_grants SET personal_data_visible=true WHERE user_id=$1', [ids.admin]);
    assert.equal(expect(await request('GET', query(), undefined, admin.accessToken), 200).version, 2);
    await db.query('UPDATE access_grants SET personal_data_visible=true WHERE user_id=$1', [ids.dispatcher]);
    const dispatcher = await devLogin(ids.dispatcher);
    assert.equal(expect(await request('GET', query(), undefined, dispatcher.accessToken), 200).version, 2);
  });
});
