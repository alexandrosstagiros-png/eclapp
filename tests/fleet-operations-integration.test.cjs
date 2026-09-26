'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createTestServer } = require('./local-test-server.cjs');

test('native fleet repair, procurement, inventory, maintenance, fuel and driver workflows are scoped and atomic', { timeout: 180000 }, async t => {
  const fixture = await createTestServer(); t.after(() => fixture.close());
  const { request, devLogin, adminPool: db, ids, origin } = fixture;
  await db.query('UPDATE access_grants SET finance_visible=true WHERE user_id=$1', [ids.admin]);
  const admin = await devLogin(ids.admin), token = admin.accessToken;
  const peerScope = randomUUID();
  await db.query('INSERT INTO responsibility_scopes(id,project_id,name) VALUES($1,$2,$3)', [peerScope, ids.project, 'Synthetic fleet second scope']);
  await db.query(`INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id,finance_visible)
    VALUES($1,$2,$3,$4,$5,true)`, [ids.admin, ids.legal, ids.region, ids.project, peerScope]);
  const today = new Date().toISOString().slice(0, 10);
  function expect(result, status = 200) { assert.equal(result.status, status, JSON.stringify(result.body)); return result.body; }
  const base = '/fleet-operations';
  const snapshot = (bearer = token, scope = ids.scope) => request('GET', `${base}?responsibilityScopeId=${scope}`, undefined, bearer);
  const save = (kind, payload, record = null, bearer = token, scope = ids.scope) => request('PUT', `${base}/${kind}`,
    { id: record?.id || randomUUID(), responsibilityScopeId: scope, version: record?.version || 0, ...payload }, bearer);
  const inputAction = (record, action, patch = {}) => ({ responsibilityScopeId: ids.scope, version: record.version, action, idempotencyKey: randomUUID(), ...patch });
  const action = (kind, record, body, bearer = token) => request('POST', `${base}/${kind}/${record.id}/action`, body, bearer);
  async function employee(role, finance = true, scope = ids.scope) {
    const id = randomUUID(); await db.query('INSERT INTO users(id,display_name,role,active,approved) VALUES($1,$2,$3,true,true)', [id, `Synthetic fleet ${role}`, role]);
    await db.query(`INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id,finance_visible)
      VALUES($1,$2,$3,$4,$5,$6)`, [id, ids.legal, ids.region, ids.project, scope, finance]);
    return devLogin(id);
  }
  const mechanic = await employee('mechanic'), auditor = await employee('auditor'), nofinance = await employee('access_admin', false), driver = await employee('driver', false), otherDriver = await employee('driver', false);
  let vehicle, part, warehouse, contractor, plan, purchase, order, assignment;
  const line = (patch = {}) => ({ id: randomUUID(), type: 'запчасть', name: 'Тестовый фильтр', group: 'ТО', node: 'Фильтры', quantity: 1,
    unit: 'шт.', unitPriceCents: 9900, discountPercent: 0, adjustmentCents: 0, adjustmentReason: '', stockSource: 'warehouse',
    partId: part?.id, warehouseId: warehouse?.id, ...patch });
  const orderInput = (patch = {}) => ({ vehicleId: vehicle.id, openedOn: today, status: 'draft', odometerKm: 1200, execution: 'internal', lines: [line()], ...patch });

  await t.test('staff roles require finance and exact scope; driver has no staff access', async () => {
    expect(await request('GET', `${base}/context`), 401);
    expect(await snapshot(mechanic.accessToken)); expect(await snapshot(auditor.accessToken));
    expect(await snapshot(nofinance.accessToken), 403); expect(await snapshot(driver.accessToken), 403);
    expect(await snapshot(mechanic.accessToken, peerScope), 403);
    expect(await save('vehicles', { plate: 'А111АА777' }, null, auditor.accessToken), 403);
    expect(await save('vehicles', { plate: 'А111АА777' }, null, driver.accessToken), 403);
  });
  await t.test('versioned cards and references preserve scope boundaries and normalized vehicle identity', async () => {
    vehicle = expect(await save('vehicles', { plate: 'А111АА777', vin: 'SYNTHETIC-VIN-1', brand: 'Тест', model: 'Фургон', year: 2025, group: 'Тест', odometerKm: 1000 }));
    assert.equal(vehicle.version, 1);
    expect(await save('vehicles', { plate: 'a111aa777' }), 409);
    expect(await save('vehicles', { plate: 'В222ВВ777', vin: 'synthetic-vin-1' }), 409);
    expect(await save('vehicles', { ...vehicle, odometerKm: 900 }, vehicle), 400);
    expect(await save('vehicles', { ...vehicle, odometerKm: null }, vehicle), 400);
    part = expect(await save('parts', { name: 'Фильтр', sku: 'TEST-PART', unit: 'шт.', minStock: 2 }));
    warehouse = expect(await save('warehouses', { name: 'Тестовый склад' }));
    contractor = expect(await save('contractors', { name: 'Тестовый поставщик' }));
    const peerPart = expect(await save('parts', { name: 'Недоступная деталь', unit: 'шт.' }, null, token, peerScope));
    expect(await save('orders', orderInput({ lines: [line({ partId: peerPart.id })] })), 400);
    expect(await save('parts', { name: 'Подмена', unit: 'шт.' }, peerPart), 403);
    const previous = { ...part }; part = expect(await save('parts', { ...part, name: 'Фильтр обновлён' }, part));
    expect(await save('parts', { ...previous, name: 'Устаревшее изменение' }, previous), 409);
    plan = expect(await save('maintenance', { vehicleId: vehicle.id, title: 'Замена масла', intervalKm: 500, intervalDays: 30, lastCompletedOn: today, lastOdometerKm: 1000 }));
  });
  await t.test('opening and receipt post once; purchase costs do not become repair expense', async () => {
    const body = { responsibilityScopeId: ids.scope, idempotencyKey: randomUUID(), partId: part.id, warehouseId: warehouse.id, quantity: 2, unitCostCents: 10000, reason: 'Синтетическая начальная инвентаризация' };
    expect(await request('POST', `${base}/stock/opening`, { ...body, reason: '' }, token), 400);
    const opening = expect(await request('POST', `${base}/stock/opening`, body, token), 201);
    assert.equal(opening.stock[0].quantity, 2); assert.equal(opening.stock[0].amountCents, 20000);
    assert.deepEqual(expect(await request('POST', `${base}/stock/opening`, body, token), 201), opening);
    expect(await request('POST', `${base}/stock/opening`, { ...body, quantity: 3 }, token), 409);
    purchase = expect(await save('purchases', { contractorId: contractor.id, warehouseId: warehouse.id, orderedOn: today,
      lines: [{ id: randomUUID(), partId: part.id, quantity: 2, unitCostCents: 30000 }] }));
    expect(await action('purchases', purchase, inputAction(purchase, 'receive')), 400);
    purchase = expect(await action('purchases', purchase, inputAction(purchase, 'order')), 201).record;
    const receive = inputAction(purchase, 'receive');
    const responses = await Promise.all([action('purchases', purchase, receive), action('purchases', purchase, receive)]);
    assert.deepEqual(expect(responses[0], 201), expect(responses[1], 201)); purchase = responses[0].body.record;
    expect(await save('purchases', purchase, purchase), 400);
    const state = expect(await snapshot()); assert.equal(state.stock[0].quantity, 4); assert.equal(state.stock[0].amountCents, 80000);
    const analytics = expect(await request('GET', `/fleet-maintenance?responsibilityScopeId=${ids.scope}`, undefined, token));
    assert.equal(analytics.analytics, null);
  });
  await t.test('completion uses weighted inventory cost atomically and advances maintenance without double postings', async () => {
    order = expect(await save('orders', orderInput({ maintenanceId: plan.id, lines: [line(), line({ type: 'работа', name: 'Замена', quantity: 2, unitPriceCents: 5000,
      discountPercent: 10, stockSource: 'none', partId: null, warehouseId: null, amountCents: 1 })] }), null, mechanic.accessToken));
    assert.equal(order.lines[1].amountCents, 9000);
    assert.equal(expect(await snapshot()).records.vehicles.find(row => row.id === vehicle.id).odometerKm, 1000);
    order = expect(await action('orders', order, inputAction(order, 'start'), mechanic.accessToken), 201).record;
    const complete = inputAction(order, 'complete', { completedOn: today });
    const completed = expect(await action('orders', order, complete, mechanic.accessToken), 201);
    assert.deepEqual(expect(await action('orders', order, complete, mechanic.accessToken), 201), completed); order = completed.record;
    assert.equal(order.status, 'completed'); assert.equal(order.lines[0].amountCents, 20000); assert.equal(order.lines[0].plannedAmountCents, 9900);
    expect(await save('orders', order, order), 400);
    expect(await action('orders', order, inputAction(order, 'cancel')), 409);
    const state = expect(await snapshot()); assert.equal(state.stock[0].quantity, 3); assert.equal(state.stock[0].amountCents, 60000);
    assert.equal(state.records.vehicles.find(row => row.id === vehicle.id).odometerKm, 1200);
    assert.equal(state.records.maintenance[0].lastOdometerKm, 1200); assert.equal(state.maintenance[0].dueOdometerKm, 1700);
    const analytics = expect(await request('GET', `/fleet-maintenance?responsibilityScopeId=${ids.scope}`, undefined, token));
    assert.equal(analytics.dataset, null); assert.equal(analytics.nativeRowCount, 2); assert.equal(analytics.analytics.summary.amountCents, 29000);
    assert.equal(analytics.analytics.summary.orderCount, 1); assert.equal(analytics.analytics.details.items[0].orderId, `app:${order.id}`);
    const insufficient = expect(await save('orders', orderInput({ lines: [line({ quantity: 2 }), line({ quantity: 2 })] })));
    expect(await action('orders', insufficient, inputAction(insufficient, 'complete')), 400);
    const after = expect(await snapshot()); assert.equal(after.stock[0].quantity, 3); assert.equal(after.stock[0].amountCents, 60000);
    assert.equal(after.records.orders.find(row => row.id === insufficient.id).status, 'draft');
    const issueCount = (await db.query("SELECT count(*)::integer AS count FROM fleet_stock_movements WHERE kind='issue'")).rows[0].count;
    assert.equal(issueCount, 1);
    const cancellation = expect(await action('orders', insufficient, inputAction(insufficient, 'cancel')), 201).record; assert.equal(cancellation.status, 'cancelled');
    const missingOdometer = expect(await save('orders', orderInput({ maintenanceId: plan.id, odometerKm: null, lines: [line()] })));
    expect(await action('orders', missingOdometer, inputAction(missingOdometer, 'complete')), 400);
    assert.equal(expect(await snapshot()).stock[0].quantity, 3);
    expect(await action('orders', missingOdometer, inputAction(missingOdometer, 'cancel')), 201);
    const earlierOdometer = expect(await save('orders', orderInput({ maintenanceId: plan.id, odometerKm: 1100, lines: [line()] })));
    expect(await action('orders', earlierOdometer, inputAction(earlierOdometer, 'complete')), 400);
    assert.equal(expect(await snapshot()).records.maintenance[0].lastOdometerKm, 1200);
    expect(await action('orders', earlierOdometer, inputAction(earlierOdometer, 'cancel')), 201);
  });
  await t.test('assignments prohibit overlap, driver reports are private and acceptance posts fuel once', async () => {
    assignment = expect(await save('assignments', { vehicleId: vehicle.id, driverUserId: driver.actor.id, startsOn: '2020-01-01' }));
    expect(await save('assignments', { vehicleId: vehicle.id, driverUserId: otherDriver.actor.id, startsOn: today }), 409);
    const otherVehicle = expect(await save('vehicles', { plate: 'В222ВВ777', odometerKm: 100 }));
    expect(await save('assignments', { vehicleId: otherVehicle.id, driverUserId: driver.actor.id, startsOn: today }), 409);
    const driverState = expect(await request('GET', `${base}/driver`, undefined, driver.accessToken));
    assert.equal(driverState.assignments.length, 1); assert.equal(driverState.assignments[0].vehicle.id, vehicle.id);
    assert.equal(driverState.records, undefined); assert.equal(driverState.stock, undefined);
    assert.equal(expect(await request('GET', `${base}/driver`, undefined, otherDriver.accessToken)).assignments.length, 0);
    const report = { id: randomUUID(), version: 0, responsibilityScopeId: ids.scope, vehicleId: vehicle.id, reportedOn: today,
      type: 'fuel', description: 'Тестовая заправка', litres: 10.25, unitPriceCents: 6500, fullTank: true, odometerKm: 1300 };
    expect(await request('POST', `${base}/driver/reports`, report, otherDriver.accessToken), 403);
    const own = expect(await request('POST', `${base}/driver/reports`, { ...report, driverUserId: otherDriver.actor.id, status: 'resolved' }, driver.accessToken), 201);
    assert.equal(own.driverUserId, driver.actor.id); assert.equal(own.status, 'new');
    const acceptance = inputAction(own, 'accept');
    const accepted = expect(await action('driverReports', own, acceptance), 201).record;
    assert.equal(accepted.status, 'resolved'); expect(await action('driverReports', own, acceptance), 201);
    expect(await save('driverReports', { ...accepted, status: 'new', litres: 100 }, accepted), 400);
    const state = expect(await snapshot()); assert.equal(state.records.fuel.length, 1); assert.equal(state.records.fuel[0].amountCents, 66625);
    assert.equal(state.records.vehicles.find(row => row.id === vehicle.id).odometerKm, 1300);
    expect(await save('fuel', { ...state.records.fuel[0], litres: 100 }, state.records.fuel[0]), 400);
    const others = expect(await request('GET', `${base}/driver`, undefined, otherDriver.accessToken)); assert.equal(others.reports.length, 0);
    assert.equal(expect(await request('GET', `/fleet-maintenance?responsibilityScopeId=${ids.scope}`, undefined, token)).analytics.summary.amountCents, 29000);
    expect(await action('driverReports', own, acceptance, driver.accessToken), 403);
  });
  await t.test('defect completion closes its own linked driver report and rejection needs an explanation', async () => {
    const report = expect(await request('POST', `${base}/driver/reports`, { id: randomUUID(), version: 0, responsibilityScopeId: ids.scope,
      vehicleId: vehicle.id, reportedOn: today, type: 'defect', description: 'Синтетический шум' }, driver.accessToken), 201);
    expect(await action('driverReports', report, inputAction(report, 'reject')), 400);
    const accepted = expect(await action('driverReports', report, inputAction(report, 'accept')), 201).record;
    const repair = expect(await save('orders', orderInput({ driverReportId: accepted.id, odometerKm: 1400,
      lines: [line({ type: 'работа', stockSource: 'none', partId: null, warehouseId: null, unitPriceCents: 2500 })] })));
    const ownState = expect(await request('GET', `${base}/driver`, undefined, driver.accessToken));
    assert.equal(ownState.reports.find(row => row.id === report.id).orderId, repair.id);
    expect(await action('orders', repair, inputAction(repair, 'complete', { resolution: 'Крепление восстановлено' })), 201);
    const after = expect(await request('GET', `${base}/driver`, undefined, driver.accessToken));
    assert.equal(after.reports.find(row => row.id === report.id).status, 'resolved');
    assert.equal(after.reports.find(row => row.id === report.id).resolution, 'Крепление восстановлено');
  });
  await t.test('source vehicle import is explicit and combined analytics retain imported and native history', async () => {
    const csv = '\uFEFFЗН_id;Госномер;Тип позиции;Наименование;Сумма, ₽;Пробег, км;Дата завершения;Статус ЗН\nsource-1;С333СС777;работа;Импортированная работа;15.25;2500;2026-01-01;Финиш\n';
    const form = new FormData(); form.append('responsibilityScopeId', ids.scope); form.append('file', new Blob([csv]), 'synthetic-source.csv');
    const response = await fetch(`${origin}/api/v1/fleet-maintenance/imports/preview`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
    assert.equal(response.status, 201); const preview = await response.json();
    expect(await request('POST', '/fleet-maintenance/imports/commit', { responsibilityScopeId: ids.scope, datasetId: preview.dataset.id, expectedVersion: preview.version }, token), 201);
    assert.equal(expect(await snapshot()).records.vehicles.length, 2);
    const body = { responsibilityScopeId: ids.scope, idempotencyKey: randomUUID() };
    const imported = expect(await request('POST', `${base}/vehicles/import`, body, token), 201);
    assert.equal(imported.created, 1); assert.equal(imported.needsReview.length, 1);
    assert.deepEqual(expect(await request('POST', `${base}/vehicles/import`, body, token), 201), imported);
    const next = expect(await request('POST', `${base}/vehicles/import`, { ...body, idempotencyKey: randomUUID() }, token), 201); assert.equal(next.created, 0); assert.equal(next.existing, 1);
    const before = expect(await snapshot()); await fixture.restartApi();
    assert.deepEqual(expect(await snapshot()), before);
    const analytics = expect(await request('GET', `/fleet-maintenance?responsibilityScopeId=${ids.scope}`, undefined, token));
    assert.equal(analytics.analytics.summary.amountCents, 33025); assert.equal(analytics.analytics.summary.orderCount, 3);
    assert.equal(analytics.nativeRowCount, 3); assert.equal(analytics.dataset.rowCount, 1);
    const exported = await fetch(`${origin}/api/v1/fleet-maintenance/export?responsibilityScopeId=${ids.scope}`, { headers: { Authorization: `Bearer ${token}` } });
    const exportedBytes = await exported.arrayBuffer(), exportedText = Buffer.from(exportedBytes).toString('utf8');
    assert.ok(exportedText.includes('"Скидка, %";"Корректировка, ₽";"Основание корректировки"'));
    assert.ok(exportedText.includes('"50.00";"90.00";"10";"0.00";""'));
    const exportForm = new FormData(); exportForm.append('responsibilityScopeId', ids.scope); exportForm.append('file', new Blob([exportedBytes]), 'combined-export.csv');
    const reimport = await fetch(`${origin}/api/v1/fleet-maintenance/imports/preview`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: exportForm });
    assert.equal(reimport.status, 400); assert.match((await reimport.json()).message, /app:/);
    assert.equal(expect(await request('GET', `/fleet-maintenance?responsibilityScopeId=${ids.scope}`, undefined, token)).analytics.summary.amountCents, 33025);
    const privileges = (await db.query(`SELECT has_table_privilege('transport_app','fleet_stock_movements','UPDATE,DELETE') AS stock,
      has_table_privilege('transport_app','fleet_ops_actions','UPDATE,DELETE') AS actions,
      has_table_privilege('transport_app','fleet_ops_events','UPDATE,DELETE') AS events`)).rows[0];
    assert.deepEqual(privileges, { stock: false, actions: false, events: false });
  });
  await t.test('revocation immediately removes driver access and prevents staff operations', async () => {
    await db.query('DELETE FROM access_grants WHERE user_id=$1', [driver.actor.id]);
    assert.deepEqual(expect(await request('GET', `${base}/driver`, undefined, driver.accessToken)), { assignments: [], reports: [] });
    await db.query('UPDATE access_grants SET finance_visible=false WHERE user_id=$1', [mechanic.actor.id]);
    expect(await snapshot(mechanic.accessToken), 403);
    expect(await save('vehicles', { plate: 'Е555ЕЕ777' }, null, mechanic.accessToken), 403);
  });
});
