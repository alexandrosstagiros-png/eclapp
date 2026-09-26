'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { analyze, selectRows, reconcile, normalizePlate, validateFilters } = require('../recovered/apps/api/src/modules/fleet-maintenance/fleet-model');

function row(patch = {}) {
  return { sourceRow: 2, orderId: '1', orderNumber: '1', openedOn: '2026-07-01', completedOn: '2026-07-01', plate: 'а123аа797', vehicleBrand: 'ГАЗ', vehicleGroup: 'Газель', vehicleYear: 2023, vehicleType: 'Грузовой',
    odometerKm: 1000, positionType: 'работа', group: 'Двигатель', node: 'двигатель', name: 'Диагностика', partBrand: '', quantity: 1, unit: '', unitPriceCents: 10000, amountCents: 10000, topUp: false, tire: false,
    supplier: 'Сервис', ownWorkReported: false, status: 'Финиш', autoGroup: 'Двигатель', autoNode: 'двигатель', ...patch };
}

test('all aggregates include rows beyond former 1000 and 32787 boundaries; only details paginate', () => {
  const rows = Array.from({ length: 33000 }, (_, index) => row({ sourceRow: index + 2, orderId: String(index + 1), amountCents: index === 32999 ? 777 : 1, unitPriceCents: 1, name: 'Позиция ' + index }));
  const result = analyze(rows, { page: 165, pageSize: 200 });
  assert.equal(result.summary.amountCents, 33776);
  assert.equal(result.summary.orderCount, 33000);
  assert.equal(result.positions.length, 33000);
  assert.equal(result.details.total, 33000);
  assert.equal(result.details.items.length, 200);
  assert.equal(result.details.items.at(-1).amountCents, 777);
  assert.equal(result.months[0].amountCents, 33776);
  assert.equal(result.tree[0].children[0].children.length, 33000);
  assert.equal(selectRows(rows, { page: 1000, pageSize: 1 }).length, 33000);
});

test('integer cents, negatives, zero results and overflow are handled explicitly', () => {
  const result = analyze([row({ amountCents: 101, unitPriceCents: 101 }), row({ orderId: '2', sourceRow: 3, amountCents: 102, unitPriceCents: 102 })]);
  assert.equal(result.summary.amountCents, 203);
  assert.equal(result.summary.averageOrderCents, 102);
  const negative = analyze([row({ amountCents: -101 }), row({ orderId: '2', amountCents: -102 })]);
  assert.equal(negative.summary.averageOrderCents, -102);
  const empty = analyze([], {});
  assert.equal(empty.summary.amountCents, 0); assert.equal(empty.summary.averageOrderCents, null); assert.equal(empty.summary.laborShare, null);
  assert.throws(() => analyze([row({ amountCents: 0.1 })]), /целым числом/);
  assert.throws(() => analyze([row({ amountCents: Number.MAX_SAFE_INTEGER }), row({ amountCents: 1 })]), /диапазон/);
});

test('date/status/exact position filters apply to the full set and options exclude their own filter', () => {
  const rows = [row(), row({ sourceRow: 3, orderId: '2', completedOn: null, status: 'Старт', name: 'Диагностика расширенная' }),
    row({ sourceRow: 4, orderId: '3', vehicleGroup: 'УАЗ', plate: 'в123вв797', completedOn: '2026-08-02', openedOn: '2026-07-20', name: 'Двигатель', status: 'В процессе' })];
  const july = analyze(rows, { dateFrom: '2026-07-01', dateTo: '2026-07-31' });
  assert.equal(july.summary.rowCount, 1); assert.equal(july.quality.excludedMissingDateRows, 1);
  assert.equal(analyze(rows, { dateBasis: 'opened', dateFrom: '2026-07-01', dateTo: '2026-07-31' }).summary.rowCount, 3);
  assert.equal(analyze(rows, { status: 'unfinished' }).summary.rowCount, 2);
  assert.equal(analyze(rows, { positionName: 'Диагностика' }).summary.rowCount, 1);
  const singleGroup = analyze(rows, { vehicleGroup: 'Газель' });
  assert.deepEqual(singleGroup.options.vehicleGroups.map(item => item.key).sort(), ['Газель', 'УАЗ']);
  assert.equal(singleGroup.summary.rowCount, 2);
  const statuses = analyze(rows, { status: 'finished' });
  assert.equal(statuses.options.statuses.length, 3);
  for (const invalid of [{ dateFrom: '2026-02-30' }, { dateFrom: '2026-09-01', dateTo: '2026-01-01' }, { pageSize: 201 }, { page: 0 }, { status: 'any' }, { dateBasis: 'x' }, { issueCode: '__proto__' }]) assert.throws(() => validateFilters(invalid));
});

test('duplicates and source adjustments remain in totals; diagnostics do not invent internal labor', () => {
  const a = row({ supplier: '', ownWorkReported: true, referenceVehicleMissing: true });
  const rows = [a, { ...a, sourceRow: 3 }, row({ sourceRow: 4, orderId: '2', amountCents: 8500, group: '— не классифицировано —', status: 'Старт' }),
    row({ sourceRow: 5, orderId: '3', amountCents: -15606, quantity: .3, unitPriceCents: 33389, odometerKm: null }),
    row({ sourceRow: 'ЕЦЛ:1:1', orderId: 'app:1', sourceOrigin: 'native', executionConfirmed: 'internal', supplier: '' })];
  const result = analyze(rows), issues = Object.fromEntries(result.quality.items.map(item => [item.code, item]));
  assert.equal(result.summary.amountCents, 22894);
  assert.equal(issues.duplicate_candidates.count, 2);
  assert.equal(issues.missing_supplier.count, 2);
  assert.equal(issues.amount_adjustment.count, 2);
  assert.equal(issues.negative_amount.count, 1);
  assert.equal(issues.unfinished_completed.count, 1);
  assert.equal(issues.missing_vehicle_reference.count, 2);
  assert.equal(analyze(rows, { issueCode: 'duplicate_candidates' }).summary.rowCount, 2);
  assert.equal(analyze(rows, { supplier: '__missing__' }).summary.rowCount, 3);
  assert.equal(result.suppliers.find(item => item.key === '__missing__').label, 'Не указан');
  assert.equal(rows[0].issueCodes, undefined, 'analysis does not mutate source data');
});

test('confirmed aliases merge denominators and odometer sequence; unconfirmed guesses never do', () => {
  const rows = [row({ plate: 'а111аа797' }), row({ sourceRow: 3, orderId: '2', plate: 'в222вв797', openedOn: '2026-07-03', odometerKm: 900 })];
  const links = [{ plate: 'а111аа797', vehicleKey: 'vehicle:VIN1', canonicalPlate: 'в222вв797', reason: 'VIN проверен' }, { plate: 'в222вв797', vehicleKey: 'vehicle:VIN1', canonicalPlate: 'в222вв797', reason: 'VIN проверен' }];
  assert.equal(analyze(rows).summary.vehicleCount, 2);
  assert.equal(analyze(rows, {}, links.map(item => ({ ...item, reason: '' }))).summary.vehicleCount, 2);
  const result = analyze(rows, {}, links);
  assert.equal(result.summary.vehicleCount, 1);
  assert.equal(result.summary.averageVehicleCents, 20000);
  assert.equal(result.quality.items.find(item => item.code === 'odometer_decrease').count, 1);
  assert.equal(selectRows(rows, { vehicleKey: 'vehicle:VIN1' }, links).length, 2);
  assert.equal(normalizePlate(' A 123 AA-797 '), 'а123аа797');
});

test('documented native discounts and negative corrections retain their stated basis in diagnostics', () => {
  const rows = [row({ sourceOrigin: 'native', sourceRow: 'ЕЦЛ:o:1', amountCents: 8500, discountPercent: 15, adjustmentCents: 0, adjustmentReason: '' }),
    row({ sourceOrigin: 'native', sourceRow: 'ЕЦЛ:o:2', orderId: '2', amountCents: -1000, discountPercent: 0, adjustmentCents: -11000, adjustmentReason: 'Возврат по акту № 7' })];
  const result = analyze(rows), negative = result.quality.items.find(item => item.code === 'negative_amount'), adjusted = result.quality.items.find(item => item.code === 'amount_adjustment');
  assert.equal(result.summary.amountCents, 7500);
  assert.equal(negative.label, 'Отрицательная сумма');
  assert.match(negative.examples[0].message, /Возврат по акту № 7/);
  assert.ok(adjusted.examples.some(example => example.message.includes('скидка 15%')));
  assert.ok(adjusted.examples.some(example => example.message.includes('Возврат по акту № 7')));
  assert.equal(result.details.items[1].adjustmentCents, -11000);
  const imported = analyze([row({ amountCents: -1000, adjustmentReason: 'Неподтверждённый текст' })]);
  assert.match(imported.quality.items.find(item => item.code === 'negative_amount').examples[0].message, /необходимо подтвердить/);
});

test('missing classification keys remain selectable and exact drill results equal aggregate totals', () => {
  const rows = [row({ group: '', node: '', vehicleGroup: '' }), row({ orderId: '2', sourceRow: 3 })];
  const result = analyze(rows), group = result.groups.find(entry => entry.key === '__missing__');
  assert.equal(group.amountCents, 10000);
  assert.equal(analyze(rows, { group: group.key }).summary.amountCents, group.amountCents);
  assert.ok(result.options.groups.some(entry => entry.key === '__missing__'));
  assert.equal(analyze(rows, { node: '__missing__', vehicleGroup: '__missing__' }).summary.rowCount, 1);
});

test('reconciliation combines confirmed covered keys, preserves snapshot totals and separates current source changes', () => {
  const saved = { sourceSheet: 'Сверка с Ремонтами', sourceNotes: ['Частичный снимок'], rows: [
    { sourceRow: 8, plate: 'а111аа797', month: '2026-07', sourceAmountCents: 0, comparisonAmountCents: 10000, savedDifferenceCents: 10000 },
    { sourceRow: 9, plate: 'в222вв797', month: '2026-07', sourceAmountCents: 10000, comparisonAmountCents: 0, savedDifferenceCents: -10000 },
  ] };
  const rows = [row({ plate: 'в222вв797', amountCents: 12000 }), row({ plate: 'с333сс797', amountCents: 999999, orderId: '2' })];
  const links = ['а111аа797', 'в222вв797'].map(plate => ({ plate, vehicleKey: 'v1', canonicalPlate: 'в222вв797', reason: 'VIN проверен' }));
  assert.equal(reconcile(saved, rows).rows.length, 2);
  const result = reconcile(saved, rows, links);
  assert.equal(result.kind, 'partial_snapshot'); assert.match(result.notice, /Частичный исторический/);
  assert.equal(result.rows.length, 1); assert.equal(result.rows[0].sourceAmountCents, 10000);
  assert.equal(result.rows[0].comparisonAmountCents, 10000); assert.equal(result.rows[0].currentAmountCents, 12000);
  assert.equal(result.rows[0].differenceCents, -2000); assert.equal(result.rows[0].sourceChangeCents, 2000);
  assert.equal(result.rows[0].savedDifferenceCents, 0);
  assert.equal(result.summary.currentAmountCents, 12000, 'uncovered source vehicles never enter partial comparison');
  assert.equal(reconcile(null, rows).kind, 'none');
});
