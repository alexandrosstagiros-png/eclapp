'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createTestServer } = require('./local-test-server.cjs');
const { importCatalog } = require('../integrations/planning-catalog/import-local.cjs');

test('linked planning catalog imports persist idempotently and remain restricted to authorized scope', { timeout: 180_000 }, async t => {
  const fixture = await createTestServer(); t.after(() => fixture.close());
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'planning-catalog-')); t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const { adminPool: db, ids, request, devLogin } = fixture, driverId = randomUUID(), foreignScope = randomUUID();
  await db.query("INSERT INTO users(id,display_name,role,active,approved) VALUES($1,'Тестов Тест Тестович','driver',true,true)", [driverId]);
  await db.query(`INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id)
    VALUES($1,$2,$3,$4,$5)`, [driverId, ids.legal, ids.region, ids.project, ids.scope]);
  await db.query('UPDATE access_grants SET personal_data_visible=true WHERE user_id=$1', [ids.admin]);
  await db.query('INSERT INTO responsibility_scopes VALUES($1,$2,$3)', [foreignScope, ids.project, 'Synthetic foreign catalog']);
  const filename = path.join(directory, 'synthetic-drivers.csv');
  await fs.writeFile(filename, 'фио,Паспорт,Адрес проживания,Тел.Водителя\nТестов Тест Тестович,SYNTHETIC PASSPORT,Source address,+70000000001\nЧужой Тест Тестович,UNMATCHED SECRET,Other address,+70000000002\n');
  const input = { scopeId: ids.scope, driversFile: filename };
  const preview = await importCatalog(db, input);
  assert.equal(preview.driver.matched, 1); assert.equal(preview.driver.unmatched, 1);
  assert.equal((await db.query('SELECT count(*)::integer count FROM planning_resource_data')).rows[0].count, 0);
  assert.equal((await importCatalog(db, { ...input, apply: true })).written, 1);
  assert.equal((await importCatalog(db, { ...input, apply: true })).written, 0);
  await db.query(`INSERT INTO planning_resource_data(legal_entity_id,region_id,project_id,responsibility_scope_id,kind,resource_id,data,source_sha256,source_name,source_row)
    VALUES($1,$2,$3,$4,'driver',$5,$6::jsonb,$7,'synthetic.csv',2)`, [ids.legal, ids.region, ids.project, foreignScope, driverId, JSON.stringify({ driver_passport: 'FOREIGN SECRET' }), 'a'.repeat(64)]);
  const actor = await devLogin(ids.admin);
  const options = await request('GET', `/planning/options?responsibilityScopeId=${ids.scope}`, undefined, actor.accessToken);
  assert.equal(options.status, 200);
  assert.equal(options.body.drivers.find(driver => driver.id === driverId).planningData.driver_passport_full, 'SYNTHETIC PASSPORT');
  assert.ok(!JSON.stringify(options.body).includes('FOREIGN SECRET'));
  assert.ok(!JSON.stringify(options.body).includes('UNMATCHED SECRET'));
  assert.equal((await request('GET', `/planning/options?responsibilityScopeId=${foreignScope}`, undefined, actor.accessToken)).status, 403);
  await db.query('UPDATE access_grants SET personal_data_visible=false WHERE user_id=$1', [ids.admin]);
  assert.equal((await request('GET', `/planning/options?responsibilityScopeId=${ids.scope}`, undefined, actor.accessToken)).status, 403);
});

test('standalone planning resources remain scoped catalog records through options, calendar saves and unmapped exports', { timeout: 180_000 }, async t => {
  const fixture = await createTestServer(); t.after(() => fixture.close());
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'planning-standalone-')); t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const { adminPool: db, ids, request, devLogin } = fixture;
  const writer = require('../integrations/one-c-local/planning-writer.cjs'), originalWriter = writer.exportPlannedAssignment;
  t.after(() => { writer.exportPlannedAssignment = originalWriter; });
  await db.query('UPDATE access_grants SET personal_data_visible=true WHERE user_id=$1', [ids.admin]);
  const token = (await devLogin(ids.admin)).accessToken;
  const counts = async () => (await db.query(`SELECT (SELECT count(*) FROM users)::integer AS users,
    (SELECT count(*) FROM access_grants)::integer AS grants,(SELECT count(*) FROM vehicles)::integer AS vehicles,(SELECT count(*) FROM trips)::integer AS trips`)).rows[0];
  const before = await counts();
  const driversFile = path.join(directory, 'synthetic-drivers.csv'), vehiclesFile = path.join(directory, 'synthetic-vehicles.csv');
  await fs.writeFile(driversFile, 'фио,Паспорт,Адрес проживания,Тел.Водителя\nКаталожный Тест Тестович,SYNTHETIC STANDALONE PASSPORT,Synthetic address,+70000000003\n');
  await fs.writeFile(vehiclesFile, 'Гос номер,Марка,форм фактор,Грузоподъемность,СТС\nА123АА77,Synthetic van,Фургон,3.5 т,SYNTHETIC STANDALONE STS\n');
  const input = { scopeId: ids.scope, driversFile, vehiclesFile, standalone: true };
  assert.equal((await importCatalog(db, input)).written, 0);
  assert.equal((await db.query('SELECT count(*)::integer count FROM planning_imported_resources')).rows[0].count, 0);
  assert.equal((await importCatalog(db, { ...input, apply: true })).written, 2);
  assert.equal((await importCatalog(db, { ...input, apply: true })).written, 0);
  assert.deepEqual(await counts(), before, 'Import creates no accounts, grants, operational vehicles or trips');
  const separate = { createScope: true, standalone: true, adminId: ids.admin, baseScopeId: ids.scope, driversFile, vehiclesFile };
  const scopePreview = await importCatalog(db, separate);
  assert.equal((await db.query('SELECT 1 FROM responsibility_scopes WHERE id=$1', [scopePreview.scopeId])).rowCount, 0, 'Scope preview rolls back the project, scope and grant');
  assert.deepEqual(await counts(), before);
  await assert.rejects(importCatalog(db, { ...separate, adminId: ids.dispatcher, apply: true }), /нет доступа/);
  const separateImport = await importCatalog(db, { ...separate, apply: true });
  assert.equal(separateImport.scopeId, scopePreview.scopeId);
  assert.equal(separateImport.written, 2);
  assert.equal((await importCatalog(db, { ...separate, apply: true })).written, 0);
  const separateGrants = (await db.query('SELECT user_id,personal_data_visible FROM access_grants WHERE responsibility_scope_id=$1', [separateImport.scopeId])).rows;
  assert.deepEqual(separateGrants, [{ user_id: ids.admin, personal_data_visible: true }]);
  assert.deepEqual(await counts(), { ...before, grants: before.grants + 1 });
  const separateOptions = await request('GET', `/planning/options?responsibilityScopeId=${separateImport.scopeId}`, undefined, token);
  assert.equal(separateOptions.status, 200);
  assert.equal(separateOptions.body.drivers.length, 1);
  assert.equal(separateOptions.body.vehicles.length, 1);
  const imported = (await db.query('SELECT id,kind FROM planning_imported_resources WHERE responsibility_scope_id=$1', [ids.scope])).rows;
  const driverId = imported.find(row => row.kind === 'driver').id, vehicleId = imported.find(row => row.kind === 'vehicle').id;
  const options = await request('GET', `/planning/options?responsibilityScopeId=${ids.scope}`, undefined, token);
  assert.equal(options.status, 200);
  assert.equal(options.body.drivers.find(driver => driver.id === driverId).planningData.driver_passport, 'SYNTHETIC STANDALONE PASSPORT');
  assert.equal(options.body.vehicles.find(vehicle => vehicle.id === vehicleId).planningData.vehicle_registration_certificate, 'SYNTHETIC STANDALONE STS');
  assert.equal((await db.query('SELECT 1 FROM users WHERE id=$1', [driverId])).rowCount, 0);
  assert.equal((await db.query('SELECT 1 FROM vehicles WHERE id=$1', [vehicleId])).rowCount, 0);
  const row = { id: randomUUID(), driverId, vehicleId, departureTime: '07:30', extraFields: [
    { id: randomUUID(), label: 'Паспорт', source: 'driver_passport', owner: 'driver', type: 'text' },
    { id: randomUUID(), label: 'СТС', source: 'vehicle_registration_certificate', owner: 'vehicle', type: 'text' },
  ] };
  const day = (businessDate, patch = {}) => ({ businessDate, templateId: 'general', templateVersion: 1, version: 0, rows: [{ ...row, id: randomUUID() }], ...patch });
  const first = day('2026-10-01');
  const saved = await request('PUT', '/planning', { ...first, responsibilityScopeId: ids.scope }, token);
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  const calendar = await request('PUT', '/planning/calendar', { responsibilityScopeId: ids.scope, plans: [day('2026-10-02'), day('2026-10-03')] }, token);
  assert.equal(calendar.status, 200, JSON.stringify(calendar.body));
  await fixture.restartApi();
  const loaded = await request('GET', `/planning/calendar?responsibilityScopeId=${ids.scope}&from=2026-10-01&to=2026-10-03`, undefined, token);
  assert.equal(loaded.status, 200);
  assert.equal(loaded.body.plans.length, 3);
  assert.ok(loaded.body.plans.every(plan => plan.rows[0].driverId === driverId && plan.rows[0].vehicleId === vehicleId && plan.rows[0].extraFields.length === 2));

  const foreignScope = randomUUID();
  await db.query('INSERT INTO responsibility_scopes VALUES($1,$2,$3)', [foreignScope, ids.project, 'Synthetic independent scope']);
  const seedResource = async (id, kind, scope = ids.scope, active = true) => db.query(`INSERT INTO planning_imported_resources(id,legal_entity_id,region_id,project_id,responsibility_scope_id,kind,label,active)
    VALUES($1,$2,$3,$4,$5,$6,'Synthetic restricted resource',$7)`, [id, ids.legal, ids.region, ids.project, scope, kind, active]);
  const foreignDriver = randomUUID(), foreignVehicle = randomUUID(), inactiveDriver = randomUUID(), inactiveVehicle = randomUUID();
  await seedResource(foreignDriver, 'driver', foreignScope);
  await seedResource(foreignVehicle, 'vehicle', foreignScope);
  await seedResource(inactiveDriver, 'driver', ids.scope, false);
  await seedResource(inactiveVehicle, 'vehicle', ids.scope, false);
  const rejectedRows = [
    { driverId: foreignDriver }, { vehicleId: foreignVehicle }, { driverId: inactiveDriver }, { vehicleId: inactiveVehicle },
    { driverId: vehicleId }, { vehicleId: driverId }, { driverId: randomUUID() }, { vehicleId: randomUUID() },
  ];
  for (const patch of rejectedRows) {
    const result = await request('PUT', '/planning', { ...day('2026-10-04', { rows: [{ ...row, ...patch }] }), responsibilityScopeId: ids.scope }, token);
    assert.equal(result.status, 400, JSON.stringify(result.body));
  }
  const refreshed = await request('GET', `/planning/options?responsibilityScopeId=${ids.scope}`, undefined, token);
  for (const id of [foreignDriver, inactiveDriver]) assert.ok(!refreshed.body.drivers.some(row => row.id === id));
  for (const id of [foreignVehicle, inactiveVehicle]) assert.ok(!refreshed.body.vehicles.some(row => row.id === id));
  assert.equal((await request('GET', `/planning/options?responsibilityScopeId=${foreignScope}`, undefined, token)).status, 403);
  await db.query(`INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id,personal_data_visible)
    VALUES($1,$2,$3,$4,$5,true)`, [ids.admin, ids.legal, ids.region, ids.project, foreignScope]);
  const crossScope = await request('PUT', '/planning', { ...day('2026-10-04'), responsibilityScopeId: foreignScope }, token);
  assert.equal(crossScope.status, 400);

  // An accidental imported-ID collision never revives a native inactive driver
  // or makes an operational vehicle available outside its trip scope.
  await db.query('UPDATE users SET active=false WHERE id=$1', [ids.drivers[0]]);
  await seedResource(ids.drivers[0], 'driver');
  const nativeVehicleId = options.body.vehicles.find(vehicle => vehicle.id !== vehicleId).id;
  await seedResource(nativeVehicleId, 'vehicle', foreignScope);
  const inactiveCollision = await request('PUT', '/planning', { ...day('2026-10-04', { rows: [{ ...row, driverId: ids.drivers[0] }] }), responsibilityScopeId: ids.scope }, token);
  assert.equal(inactiveCollision.status, 400);
  const vehicleCollision = await request('PUT', '/planning', { ...day('2026-10-04', { rows: [{ ...row, driverId: foreignDriver, vehicleId: nativeVehicleId }] }), responsibilityScopeId: foreignScope }, token);
  assert.equal(vehicleCollision.status, 400);
  const foreignOptions = await request('GET', `/planning/options?responsibilityScopeId=${foreignScope}`, undefined, token);
  assert.ok(!foreignOptions.body.vehicles.some(vehicle => vehicle.id === nativeVehicleId));
  assert.ok(!foreignOptions.body.drivers.some(driver => driver.id === driverId));

  // No 1C writer is invoked merely because an independent contact can be planned.
  process.env.LOCAL_ONE_C_ENABLED = 'true';
  await db.query('INSERT INTO planning_one_c_scopes(responsibility_scope_id,source_namespace,client_ref,project_ref) VALUES($1,$2,$3,$4)', [ids.scope, randomUUID(), randomUUID(), randomUUID()]);
  let writes = 0;
  writer.exportPlannedAssignment = async () => { writes++; throw new Error('Unexpected synthetic 1C write'); };
  const exported = await request('POST', '/planning/one-c/export', { responsibilityScopeId: ids.scope,
    plans: [{ businessDate: first.businessDate, version: saved.body.version, rowIds: [saved.body.rows[0].id] }],
  }, token);
  assert.equal(exported.status, 200, JSON.stringify(exported.body));
  assert.equal(exported.body.summary.failed, 1);
  assert.match(exported.body.results[0].message, /не сопоставлен/);
  assert.equal(writes, 0);
  assert.equal((await db.query('SELECT count(*)::integer count FROM planning_one_c_exports')).rows[0].count, 0);
  await db.query('UPDATE planning_imported_resources SET active=false WHERE id=ANY($1::uuid[])', [[driverId, vehicleId]]);
  const inactiveSave = await request('PUT', '/planning/calendar', { responsibilityScopeId: ids.scope, plans: [day('2026-10-05')] }, token);
  assert.equal(inactiveSave.status, 400);
  await db.query('UPDATE access_grants SET personal_data_visible=false WHERE user_id=$1 AND responsibility_scope_id=$2', [ids.admin, ids.scope]);
  assert.equal((await request('GET', `/planning/options?responsibilityScopeId=${ids.scope}`, undefined, token)).status, 403);
  assert.equal((await request('GET', `/planning?date=2026-10-01&responsibilityScopeId=${ids.scope}`, undefined, token)).status, 403);
});
