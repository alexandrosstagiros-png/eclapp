'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { lineAmount, parseRecord, maintenanceStatus, orderRows } = require('../recovered/apps/api/src/modules/fleet-maintenance/fleet-operations-input');
const body = payload => ({ id: randomUUID(), responsibilityScopeId: randomUUID(), version: 0, ...payload });
test('financial arithmetic rounds once in integer cents, preserves authorised adjustments, rejects excessive precision', () => {
  assert.equal(lineAmount(1.005, 100), 101);
  assert.equal(lineAmount(2.5, 199, 10), 448);
  assert.equal(lineAmount(1, 10000, 33.33, -10), 6657);
  assert.equal(lineAmount(1, 100, 100, -17), -17);
  assert.throws(() => lineAmount(0.0001, 1));
  assert.throws(() => lineAmount(1, 10, 33.333));
  assert.throws(() => lineAmount(1e8, 1e11));
  const fuel = parseRecord('fuel', body({ vehicleId: randomUUID(), date: '2026-09-24', litres: 10.25, unitPriceCents: 6500, amountCents: 1 }));
  assert.equal(fuel.payload.amountCents, 66625);
});
test('order input never trusts client totals and adjustments require an explanation', () => {
  const line = { id: randomUUID(), name: 'Диагностика', type: 'работа', quantity: 1.5, unitPriceCents: 12000, discountPercent: 10, amountCents: 1 };
  const order = body({ vehicleId: randomUUID(), openedOn: '2026-09-24', execution: 'internal', lines: [line] });
  assert.equal(parseRecord('orders', order).payload.lines[0].amountCents, 16200);
  assert.throws(() => parseRecord('orders', { ...order, lines: [{ ...line, adjustmentCents: -5 }] }));
  assert.throws(() => parseRecord('orders', { ...order, lines: [line, line] }));
  assert.throws(() => parseRecord('orders', { ...order, openedOn: '2026-02-30' }));
  assert.throws(() => parseRecord('orders', { ...order, lines: [{ ...line, stockSource: 'warehouse', partId: randomUUID(), warehouseId: randomUUID() }] }));
});
test('maintenance uses earliest known threshold, handles leap year and unknown odometer explicitly', () => {
  assert.equal(maintenanceStatus({ dueOn: '2026-10-09', dueOdometerKm: 1100 }, { odometerKm: 1100 }, '2026-09-24').status, 'overdue');
  assert.equal(maintenanceStatus({ dueOdometerKm: 10000 }, {}, '2026-09-24').status, 'unknown');
  assert.equal(maintenanceStatus({ dueOn: '2026-12-01', dueOdometerKm: 10000 }, {}, '2026-09-24').status, 'unknown');
  assert.equal(maintenanceStatus({ dueOn: '2026-10-08' }, {}, '2026-09-24').status, 'soon');
  assert.equal(maintenanceStatus({ dueOn: '2026-10-09' }, {}, '2026-09-24').status, 'scheduled');
  assert.equal(maintenanceStatus({ lastCompletedOn: '2024-02-28', intervalDays: 2 }, {}, '2024-02-28').dueOn, '2024-03-01');
  assert.equal(maintenanceStatus({ active: false, dueOn: '2020-01-01' }, {}, '2026-09-24').status, 'inactive');
});
test('native repair analytics keeps draft and complete status distinct, excludes cancellation and uses reserved identities', () => {
  const vehicle = { id: randomUUID(), plate: 'А123АА777' };
  const order = { id: randomUUID(), vehicleId: vehicle.id, execution: 'internal', openedOn: '2026-09-24', completedOn: '2026-09-25', status: 'draft', lines: [{ id: randomUUID(), type: 'работа', name: 'Ремонт', amountCents: 321 }] };
  const data = { vehicles: [vehicle], orders: [order] };
  assert.equal(orderRows(data)[0].completedOn, null);
  assert.equal(orderRows(data)[0].executionConfirmed, 'internal');
  assert.equal(orderRows(data)[0].orderId, `app:${order.id}`);
  order.status = 'completed'; assert.equal(orderRows(data)[0].completedOn, '2026-09-25');
  order.status = 'cancelled'; assert.equal(orderRows(data).length, 0);
});
