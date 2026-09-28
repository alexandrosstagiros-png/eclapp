'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createTestServer } = require('./local-test-server.cjs');

test('price analysis uses authorized active import and native data, returns evidence and rechecks live finance grants', { timeout: 180000 }, async t => {
  const fixture = await createTestServer(); t.after(() => fixture.close());
  const { request, devLogin, adminPool: db, ids } = fixture;
  await db.query('UPDATE access_grants SET finance_visible=true WHERE user_id=$1', [ids.admin]);
  const admin = await devLogin(ids.admin), token = admin.accessToken;
  const peer = randomUUID();
  await db.query('INSERT INTO responsibility_scopes(id,project_id,name) VALUES($1,$2,$3)', [peer, ids.project, 'Недоступный ценовой источник']);
  const row = (orderId, patch = {}) => ({ orderId, orderNumber: orderId, sourceRow: orderId, name: 'Фильтр', positionType: 'запчасть',
    vehicleBrand: 'ГАЗ', vehicleGroup: 'Тест', partBrand: '', quantity: 1, unit: 'шт.', amountCents: 10000,
    unitPriceCents: 10000, ownWorkReported: false, status: 'Финиш', openedOn: '2026-01-01', completedOn: '2026-01-02', ...patch });
  async function seed(scope, rows) {
    const dataset = randomUUID();
    await db.query(`INSERT INTO fleet_maintenance_datasets(id,legal_entity_id,region_id,project_id,responsibility_scope_id,file_name,file_hash,row_count,metadata,payload,created_by)
      VALUES($1,$2,$3,$4,$5,'prices.csv',$6,$7,'{}',$8::jsonb,$9)`, [dataset, ids.legal, ids.region, ids.project, scope, 'a'.repeat(64), rows.length, JSON.stringify({ rows }), ids.admin]);
    await db.query(`INSERT INTO fleet_maintenance_state(legal_entity_id,region_id,project_id,responsibility_scope_id,active_dataset_id,version,updated_by)
      VALUES($1,$2,$3,$4,$5,1,$6)`, [ids.legal, ids.region, ids.project, scope, dataset, ids.admin]);
  }
  await seed(ids.scope, [row('one'), row('two'), row('three'), row('target', { amountCents: 20000, openedOn: '2026-03-01', completedOn: null, status: 'Старт' })]);
  await seed(peer, [row('secret-one', { amountCents: 1 }), row('secret-two', { amountCents: 1 }), row('secret-three', { amountCents: 1 })]);
  const expect = (result, status = 200) => { assert.equal(result.status, status, JSON.stringify(result.body)); return result.body; };
  const analyze = (body = {}, bearer = token) => request('POST', '/fleet-maintenance/price-analysis', { responsibilityScopeId: ids.scope, orderId: 'target', ...body }, bearer);
  expect(await request('POST', '/fleet-maintenance/price-analysis', { responsibilityScopeId: ids.scope, orderId: 'target' }), 401);
  const list = expect(await request('GET', `/fleet-maintenance/price-analysis/orders?responsibilityScopeId=${ids.scope}`, undefined, token));
  assert.equal(list.items.length, 4); assert.equal(list.items[0].orderId, 'target');
  const analysis = expect(await analyze(), 201);
  assert.equal(analysis.summary.aboveCount, 1); assert.equal(analysis.items[0].medianUnitPriceCents, 10000);
  assert.equal(analysis.items[0].comparisonOrderCount, 3); assert.equal(analysis.ai, null);
  assert.ok(analysis.items[0].evidence.every(sample => !sample.orderId.startsWith('secret')));
  expect(await analyze({ responsibilityScopeId: peer }), 403);
  expect(await analyze({ orderId: 'secret-one' }), 400);
  expect(await analyze({ orderId: '' }), 400);
  expect(await analyze({ orderId: {} }), 400);
  expect(await analyze({ responsibilityScopeId: 'company' }), 400);
  assert.equal(expect(await request('GET', `/fleet-maintenance/price-analysis/orders?responsibilityScopeId=${ids.scope}&search=target`, undefined, token)).total, 1);
  const vehicle = expect(await request('PUT', '/fleet-operations/vehicles', { id: randomUUID(), version: 0, responsibilityScopeId: ids.scope,
    plate: 'А111АА777', brand: 'ГАЗ', group: 'Тест' }, token));
  const order = expect(await request('PUT', '/fleet-operations/orders', { id: randomUUID(), version: 0, responsibilityScopeId: ids.scope,
    vehicleId: vehicle.id, openedOn: '2026-03-01', status: 'draft', execution: 'internal', lines: [{ id: randomUUID(), type: 'работа', name: 'Проверка',
      group: 'ТО', node: 'Двигатель', quantity: 1, unit: 'ч', unitPriceCents: 9000, stockSource: 'none' }] }, token));
  assert.equal(expect(await analyze({ orderId: `app:${order.id}` }), 201).summary.insufficientCount, 1);
  const auditorId = randomUUID();
  await db.query("INSERT INTO users(id,display_name,role,active,approved) VALUES($1,'Аудитор цен','auditor',true,true)", [auditorId]);
  await db.query('INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id,finance_visible) VALUES($1,$2,$3,$4,$5,true)', [auditorId, ids.legal, ids.region, ids.project, ids.scope]);
  const auditor = await devLogin(auditorId);
  assert.equal(expect(await analyze({}, auditor.accessToken), 201).summary.aboveCount, 1);
  await db.query('UPDATE access_grants SET finance_visible=false WHERE user_id=$1', [auditorId]);
  expect(await analyze({}, auditor.accessToken), 403);
  expect(await request('GET', `/fleet-maintenance/price-analysis/orders?responsibilityScopeId=${ids.scope}`, undefined, auditor.accessToken), 403);
});
