'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { analyzePrices, listPriceOrders, analysisPrompt } = require('../recovered/apps/api/src/modules/fleet-maintenance/fleet-price-analysis');

const line = (orderId, patch = {}) => ({ orderId, orderNumber: orderId, sourceRow: orderId, openedOn: '2026-03-01', completedOn: '2026-03-02',
  status: 'Финиш', name: 'Фильтр масляный', positionType: 'запчасть', vehicleBrand: 'ГАЗ', vehicleGroup: 'Газель', partBrand: 'Тест',
  ownWorkReported: false, quantity: 1, unit: 'шт.', unitPriceCents: 10000, amountCents: 10000, plate: 'А111АА777', ...patch });
const target = patch => line('target', { openedOn: '2026-04-01', completedOn: null, status: 'Старт', ...patch });
const history = () => [line('one'), line('two', { amountCents: 20000, quantity: 2 }), line('three', { amountCents: 11000 })];

test('analysis uses actual discounted amounts per unit and median of distinct historical orders', () => {
  const result = analyzePrices([...history(), line('two', { quantity: 2, amountCents: 20000 }), target({ quantity: 2, unitPriceCents: 30000, amountCents: 30000 })], 'target');
  const item = result.items[0];
  assert.equal(item.comparisonOrderCount, 3);
  assert.equal(item.effectiveUnitPriceCents, 15000);
  assert.equal(item.quotedUnitPriceCents, 30000);
  assert.equal(item.medianUnitPriceCents, 10000);
  assert.equal(item.deviationPercent, 50);
  assert.equal(item.status, 'above_history');
  assert.equal(result.summary.aboveCount, 1);
  assert.match(result.limitation, /не подтверждение текущих рыночных цен/);
});

test('different units, currency, brand, vehicle, execution and future/old/open history cannot establish adequacy', () => {
  const different = [
    { unit: 'л' }, { currency: 'USD' }, { partBrand: 'Другая' }, { vehicleBrand: 'Другая' }, { vehicleGroup: 'Другая' },
    { ownWorkReported: true }, { positionType: 'работа' }, { name: 'Фильтр воздушный' },
    { completedOn: '2026-05-01' }, { completedOn: '2025-03-01' }, { status: 'Старт' }, { completedOn: null },
    { quantity: 0 }, { amountCents: -100 }, { quantity: '1' },
  ].map((patch, index) => line(`different-${index}`, patch));
  const result = analyzePrices([...different, line('one'), line('one', { sourceRow: 99 }), line('two'), target()], 'target');
  assert.equal(result.items[0].comparisonOrderCount, 2);
  assert.equal(result.items[0].status, 'insufficient_data');
  assert.equal(result.items[0].medianUnitPriceCents, undefined);
  assert.equal(result.summary.comparedCount, 0);
});

test('empty, malformed and future target dates, missing units and zero quantities explicitly fail comparison', () => {
  for (const patch of [{ completedOn: null, openedOn: null }, { completedOn: null, openedOn: '2026-02-30' },
    { completedOn: null, openedOn: '2099-01-01' }, { quantity: 0 }, { unit: '' }, { amountCents: -10 }]) {
    assert.equal(analyzePrices([...history(), target(patch)], 'target').items[0].status, 'insufficient_data');
  }
  assert.throws(() => analyzePrices(history(), 'unavailable'), /не найден/);
});

test('lower, within-range and exactly threshold results avoid claiming current market prices', () => {
  for (const [amountCents, expected] of [[7000, 'below_history'], [10000, 'within_history'], [12500, 'within_history'], [7500, 'within_history']])
    assert.equal(analyzePrices([...history(), target({ amountCents })], 'target').items[0].status, expected);
});

test('order picker finds native/imported orders, totals lines, scopes are supplied upstream, prompt limits positions', () => {
  const rows = [line('one'), line('one', { amountCents: 30000 }), target(), line('', { orderNumber: 'No ID' })];
  const list = listPriceOrders(rows);
  assert.equal(list.total, 2); assert.equal(list.items[0].orderId, 'target');
  assert.equal(list.items[1].amountCents, 40000); assert.equal(list.items[1].lineCount, 2);
  assert.equal(listPriceOrders(rows, 'ONE').total, 1);
  assert.equal(listPriceOrders(rows, 'нет такого').total, 0);
  assert.equal(listPriceOrders(rows, '', 1).items.length, 1);
  const result = analyzePrices([...history(), ...Array.from({ length: 105 }, (_, i) => target({ sourceRow: i }))], 'target');
  const prompt = JSON.parse(analysisPrompt(result));
  assert.equal(prompt.items.length, 100); assert.equal(prompt.omittedPositions, 5);
  assert.throws(() => analyzePrices(Array.from({ length: 1001 }, () => target()), 'target'), /более 1 000/);
});

test('provider failures preserve comparison evidence; authorization failures remain errors', async () => {
  const { FleetMaintenanceService } = require('../recovered/apps/api/src/modules/fleet-maintenance/fleet-maintenance.module');
  const service = new FleetMaintenanceService({}, {}, {});
  service.scoped = async (actor, scopeId, write, callback) => callback({}, { responsibilityScopeId: scopeId }, actor, {});
  service.source = async () => null;
  service.collectRows = async () => ({ rows: [...history(), target({ amountCents: 20000 })] });
  service.neural.run = async () => { throw Object.assign(new Error('Provider unavailable'), { status: 502 }); };
  const result = await service.priceAnalysis({}, { responsibilityScopeId: 'scope', orderId: 'target' });
  assert.equal(result.items[0].status, 'above_history');
  assert.equal(result.items[0].evidence.length, 3);
  assert.equal(result.ai, null); assert.match(result.aiWarning, /Комментарий модели недоступен/);
  service.neural.run = async () => { throw Object.assign(new Error('Denied'), { status: 403 }); };
  await assert.rejects(() => service.priceAnalysis({}, { responsibilityScopeId: 'scope', orderId: 'target' }), /Denied/);
  service.neural.run = async (_client, _actor, _scope, options) => {
    assert.equal(options.task, 'work_order_prices'); assert.equal(options.metadata.orderId, 'target');
    return { text: 'Проверьте комплектацию.', usageId: 'usage', provider: 'openai', model: 'configured', inputTokens: 10, outputTokens: 5, cost: 0.001, currency: 'USD' };
  };
  assert.equal((await service.priceAnalysis({}, { responsibilityScopeId: 'scope', orderId: 'target' })).ai.usageId, 'usage');
});
