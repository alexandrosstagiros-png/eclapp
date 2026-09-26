'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const modelPromise = import(pathToFileURL(path.resolve(__dirname, '../recovered/apps/office-web/src/planning-calendar-model.js')));
const driverA = randomUUID(), driverB = randomUUID(), vehicleA = randomUUID(), vehicleB = randomUUID();
const scope = randomUUID();
const dates = ['2028-02-28', '2028-02-29', '2028-03-01', '2028-03-02'];
const lanes = [{ id: driverA, label: 'Водитель А' }, { id: driverB, label: 'Водитель Б' }];
const template = (version = 1, changes = {}) => ({ id: 'custom_test', version, label: 'Клиент', kind: 'table', custom: true, projectNames: [], sections: [{ id: 'main', label: 'Заявка', columns: [
  { key: 'route', label: 'Маршрут', source: 'manual', type: 'text', owner: 'assignment' },
  { key: 'load', label: 'Дата погрузки', source: 'loading_date', type: 'date' },
  { key: 'delivery', label: 'Дата доставки', source: 'delivery_date', type: 'date' },
  { key: 'manual_day', label: 'Дата разгрузки', source: 'manual', type: 'date', owner: 'assignment' },
  { key: 'passport_day', label: 'Выдача паспорта', source: 'document_issue_date', type: 'date' },
  { key: 'driver_note', label: 'Допуск водителя', source: 'manual', type: 'text', owner: 'driver' },
  { key: 'vehicle_note', label: 'Допуск машины', source: 'manual', type: 'text', owner: 'vehicle' },
] }], ...changes });
const row = (patch = {}) => ({ id: randomUUID(), driverId: driverA, vehicleId: vehicleA, departureTime: '05:15', status: 'work', confirmed: true, requestCreated: true, arrived: true, tripCount: 2, comment: 'Рейс А', clientFields: {}, ...patch });
const plan = (businessDate, rows = [], patch = {}) => ({ id: randomUUID(), businessDate, responsibilityScopeId: scope, templateId: 'custom_test', templateVersion: 1, templateSnapshot: template(), rows, version: 3, updatedAt: '2028-02-01T10:00:00Z', ...patch });
const single = (r = 0, c = 0) => ({ r1: r, c1: c, r2: r, c2: c });
const copy = (m, plans, extra = {}) => m.copyCalendarRange({ plans, dates, lanes, axis: 'driver', source: single(), target: single(0, 1), policy: 'empty', ...extra });

test('calendar dates use Monday weeks, real leap days and timezone-independent ISO arithmetic', async () => {
  const m = await modelPromise;
  assert.deepEqual(m.dateRange('2028-02-29', 'week'), ['2028-02-28', '2028-02-29', '2028-03-01', '2028-03-02', '2028-03-03', '2028-03-04', '2028-03-05']);
  const february = m.dateRange('2028-02-29', 'month');
  assert.equal(february.length, 29); assert.equal(february[0], '2028-02-01'); assert.equal(february.at(-1), '2028-02-29');
  assert.equal(m.dateRange('2027-02-01', 'month').length, 28);
  assert.equal(m.shiftPeriod('2028-02-29', 'week', 1), '2028-03-07');
  assert.equal(m.shiftPeriod('2026-12-30', 'week', 1), '2027-01-06');
  assert.equal(m.shiftPeriod('2028-01-31', 'month', 1), '2028-02-01');
  assert.equal(m.shiftPeriod('2027-01-31', 'month', 1), '2027-02-01');
  assert.equal(m.shiftPeriod('2028-03-31', 'month', -1), '2028-02-01');
});

test('calendar lanes retain unavailable and unassigned records without losing multi-trip cells', async () => {
  const m = await modelPromise;
  const missingDriver = randomUUID(), missingVehicle = randomUUID();
  const records = [row(), row({ comment: 'Второй рейс' }), row({ driverId: missingDriver, vehicleId: missingVehicle }), row({ driverId: null, vehicleId: null })];
  const plans = { [dates[0]]: plan(dates[0], records) };
  const options = { drivers: [{ id: driverA, name: 'Водитель А' }, { id: driverB, name: 'Водитель Б' }], vehicles: [{ id: vehicleA, label: 'А001' }] };
  const driverLanes = m.calendarLanes(plans, options, 'driver');
  assert.ok(driverLanes.some(lane => lane.id === driverA && lane.label === 'Водитель А'));
  assert.ok(driverLanes.some(lane => lane.id === driverB));
  assert.ok(driverLanes.some(lane => lane.id === missingDriver));
  assert.ok(driverLanes.some(lane => lane.id === null));
  assert.equal(new Set(driverLanes.map(lane => lane.id)).size, driverLanes.length);
  assert.deepEqual(m.cellRows(plans, dates[0], driverA, 'driver').map(item => item.id), records.slice(0, 2).map(item => item.id));
  assert.deepEqual(m.cellRows(plans, dates[1], driverA, 'driver'), []);
  const vehicleLanes = m.calendarLanes(plans, options, 'vehicle');
  assert.ok(vehicleLanes.some(lane => lane.id === missingVehicle));
  assert.equal(m.cellRows(plans, dates[0], null, 'vehicle').length, 1);
});

test('copying to another day creates independent rows, shifts assignment dates and resets completed actions', async () => {
  const m = await modelPromise;
  const source = plan(dates[0], [row({ clientFields: { route: 'Склад — магазин', load: '2028-02-28', delivery: '2028-02-29', manual_day: '2028-03-01', passport_day: '2020-03-01', driver_note: 'Действует', vehicle_note: 'Разрешение' } }), row({ status: 'reserve' })]);
  const plans = { [dates[0]]: source }, before = structuredClone(plans);
  const result = copy(m, plans);
  assert.deepEqual(plans, before, 'copy operations must not mutate source state');
  const target = result.plans[dates[1]], copied = target.rows[0];
  assert.equal(target.rows.length, 2);
  assert.ok(!source.rows.some(item => item.id === copied.id));
  assert.equal(new Set(target.rows.map(item => item.id)).size, 2);
  assert.equal(copied.driverId, driverA); assert.equal(copied.vehicleId, vehicleA);
  assert.deepEqual([copied.confirmed, copied.requestCreated, copied.arrived], [false, false, false]);
  assert.equal(copied.tripCount, 2); assert.equal(copied.departureTime, '05:15');
  assert.deepEqual(copied.clientFields, { route: 'Склад — магазин', load: '2028-02-29', delivery: '2028-03-01', manual_day: '2028-03-02', passport_day: '2020-03-01', driver_note: 'Действует', vehicle_note: 'Разрешение' });
  assert.equal(target.templateVersion, 1); assert.deepEqual(target.templateSnapshot, source.templateSnapshot);
  assert.equal(result.summary.copied, 2);
});

test('vertical fill changes the chosen resource and clears stale identity overrides and the paired resource', async () => {
  const m = await modelPromise;
  const plans = { [dates[0]]: plan(dates[0], [row({ clientFields: { route: 'Маршрут', driver_note: 'Допуск А', vehicle_note: 'Кузов А', passport_day: '2020-01-01' } })]) };
  const result = copy(m, plans, { target: single(1, 0) });
  const assigned = m.cellRows(result.plans, dates[0], driverB, 'driver')[0];
  assert.equal(assigned.driverId, driverB); assert.equal(assigned.vehicleId, null);
  assert.deepEqual(assigned.clientFields, { route: 'Маршрут' });
  const vehicleResult = copy(m, plans, { axis: 'vehicle', lanes: [{ id: vehicleA, label: 'А' }, { id: vehicleB, label: 'Б' }], target: single(1, 0) });
  const vehicleAssigned = m.cellRows(vehicleResult.plans, dates[0], vehicleB, 'vehicle')[0];
  assert.equal(vehicleAssigned.vehicleId, vehicleB); assert.equal(vehicleAssigned.driverId, null);
  assert.deepEqual(vehicleAssigned.clientFields, { route: 'Маршрут' });
});

test('inline resource edits clear only affected private overrides and reset actions while time edits keep all fields', async () => {
  const m = await modelPromise;
  const original = row({ clientFields: { route: 'Маршрут А', load: dates[0], driver_note: 'Допуск водителя', passport_day: '2020-01-01', vehicle_note: 'Допуск машины', unavailable_key: 'Ранее удалённая колонка' } });
  const before = structuredClone(original), schema = template();
  const driverChange = m.changeCalendarAssignment(original, { driverId: driverB }, schema);
  assert.equal(driverChange.id, original.id); assert.equal(driverChange.driverId, driverB); assert.equal(driverChange.vehicleId, vehicleA);
  assert.deepEqual(driverChange.clientFields, { route: 'Маршрут А', load: dates[0], vehicle_note: 'Допуск машины' });
  assert.deepEqual([driverChange.confirmed, driverChange.requestCreated, driverChange.arrived], [false, false, false]);
  const vehicleChange = m.changeCalendarAssignment(original, { vehicleId: vehicleB }, schema);
  assert.equal(vehicleChange.driverId, driverA); assert.equal(vehicleChange.vehicleId, vehicleB);
  assert.deepEqual(vehicleChange.clientFields, { route: 'Маршрут А', load: dates[0], driver_note: 'Допуск водителя', passport_day: '2020-01-01' });
  const both = m.changeCalendarAssignment(original, { driverId: driverB, vehicleId: vehicleB }, schema);
  assert.deepEqual(both.clientFields, { route: 'Маршрут А', load: dates[0] });
  const timeOnly = m.changeCalendarAssignment(original, { departureTime: '07:30' }, schema);
  assert.equal(timeOnly.departureTime, '07:30'); assert.equal(timeOnly.id, original.id);
  assert.deepEqual(timeOnly.clientFields, original.clientFields);
  assert.deepEqual([timeOnly.confirmed, timeOnly.requestCreated, timeOnly.arrived], [true, true, true]);
  assert.notEqual(timeOnly.clientFields, original.clientFields, 'the draft owns its field object');
  assert.deepEqual(original, before, 'no inline edit may mutate its source row');
});

test('horizontal and vertical fill repeat an immutable source pattern and protect overlapping source cells', async () => {
  const m = await modelPromise;
  const plans = {
    [dates[0]]: plan(dates[0], [row({ comment: 'А' }), row({ driverId: driverB, vehicleId: vehicleB, comment: 'Б' })]),
    [dates[1]]: plan(dates[1], [row({ comment: 'В' }), row({ driverId: driverB, vehicleId: vehicleB, comment: 'Г' })]),
  };
  const before = structuredClone(plans);
  const result = copy(m, plans, { source: { r1: 0, c1: 0, r2: 1, c2: 1 }, target: { r1: 0, c1: 0, r2: 1, c2: 3 }, policy: 'replace' });
  assert.deepEqual(plans, before); assert.deepEqual(result.plans[dates[0]], before[dates[0]]); assert.deepEqual(result.plans[dates[1]], before[dates[1]]);
  assert.deepEqual(result.plans[dates[2]].rows.map(item => item.comment), ['А', 'Б']);
  assert.deepEqual(result.plans[dates[3]].rows.map(item => item.comment), ['В', 'Г']);
  assert.equal(result.summary.copied, 4);
});

test('empty, append and replace policies apply to each destination cell without affecting other lanes', async () => {
  const m = await modelPromise;
  const plans = { [dates[0]]: plan(dates[0], [row({ comment: 'Источник' })]), [dates[1]]: plan(dates[1], [row({ comment: 'Существующий' }), row({ driverId: driverB, comment: 'Соседний' })]) };
  const before = structuredClone(plans);
  const empty = copy(m, plans, { policy: 'empty' });
  assert.deepEqual(empty.plans, plans); assert.equal(empty.summary.copied, 0);
  const appended = copy(m, plans, { policy: 'append' });
  assert.deepEqual(m.cellRows(appended.plans, dates[1], driverA, 'driver').map(item => item.comment), ['Существующий', 'Источник']);
  const replaced = copy(m, plans, { policy: 'replace' });
  assert.deepEqual(m.cellRows(replaced.plans, dates[1], driverA, 'driver').map(item => item.comment), ['Источник']);
  assert.equal(replaced.summary.replaced, 1);
  assert.equal(m.cellRows(replaced.plans, dates[1], driverB, 'driver')[0].id, before[dates[1]].rows[1].id);
  assert.deepEqual(plans, before);
});

test('different target forms retain their snapshot and only semantically compatible field overrides', async () => {
  const m = await modelPromise;
  const sourceTemplate = template();
  const targetTemplate = template(2, { sections: [{ id: 'main', label: 'Версия 2', columns: [
    { key: 'route', label: 'Новый заголовок', source: 'manual', type: 'text', owner: 'assignment' },
    { key: 'load', label: 'Иной смысл', source: 'manual', type: 'date', owner: 'assignment' },
    { key: 'driver_note', label: 'Теперь маршрут', source: 'manual', type: 'text', owner: 'assignment' },
    { key: 'vehicle_note', label: 'Число', source: 'manual', type: 'number', owner: 'vehicle' },
  ] }] });
  const plans = { [dates[0]]: plan(dates[0], [row({ clientFields: { route: 'Маршрут', load: dates[0], delivery: dates[1], driver_note: 'ФИО', vehicle_note: 'Борт' } })], { templateSnapshot: sourceTemplate }), [dates[1]]: plan(dates[1], [], { templateSnapshot: targetTemplate, templateVersion: 2 }) };
  const result = copy(m, plans);
  assert.equal(result.plans[dates[1]].templateVersion, 2);
  assert.deepEqual(result.plans[dates[1]].templateSnapshot, targetTemplate);
  assert.deepEqual(result.plans[dates[1]].rows[0].clientFields, { route: 'Маршрут' });
});

test('an unsaved empty calendar placeholder inherits the copied client form while a saved empty day keeps its own', async () => {
  const m = await modelPromise;
  const other = template(2, { id: 'other_client', sections: [{ id: 'other', label: 'Другая форма', columns: [{ key: 'other_route', source: 'manual', type: 'text', owner: 'assignment', label: 'Маршрут другой формы' }] }] });
  const plans = {
    [dates[0]]: plan(dates[0], [row({ clientFields: { route: 'Данные исходного клиента' } })]),
    [dates[1]]: plan(dates[1], [], { id: null, version: 0, updatedAt: null, templateId: other.id, templateVersion: 2, templateSnapshot: other }),
    [dates[2]]: plan(dates[2], [], { templateId: other.id, templateVersion: 2, templateSnapshot: other }),
  };
  const fresh = copy(m, plans);
  assert.equal(fresh.plans[dates[1]].templateId, 'custom_test');
  assert.deepEqual(fresh.plans[dates[1]].templateSnapshot, plans[dates[0]].templateSnapshot);
  assert.deepEqual(fresh.plans[dates[1]].rows[0].clientFields, { route: 'Данные исходного клиента' });
  const saved = copy(m, plans, { target: single(0, 2) });
  assert.deepEqual(saved.plans[dates[2]].templateSnapshot, other);
  assert.deepEqual(saved.plans[dates[2]].rows[0].clientFields, {});
});

test('clipboard paste uses its captured source after edits and repeats two rows into a taller target', async () => {
  const m = await modelPromise;
  const extraLanes = [...lanes, { id: randomUUID(), label: 'Водитель В' }, { id: randomUUID(), label: 'Водитель Г' }];
  const sourcePlans = { [dates[0]]: plan(dates[0], [row({ comment: 'Исходный А' }), row({ driverId: driverB, comment: 'Исходный Б' })]) };
  const plans = structuredClone(sourcePlans);
  plans[dates[0]].rows[0].comment = 'Изменён после копирования';
  const result = copy(m, plans, { lanes: extraLanes, sourcePlans, source: { r1: 0, c1: 0, r2: 1, c2: 0 }, target: { r1: 0, c1: 1, r2: 3, c2: 1 }, excludeSource: false });
  assert.deepEqual(result.plans[dates[1]].rows.map(item => item.comment), ['Исходный А', 'Исходный Б', 'Исходный А', 'Исходный Б']);
  assert.deepEqual(result.plans[dates[1]].rows.map(item => item.driverId), extraLanes.map(lane => lane.id));
  assert.equal(result.plans[dates[0]].rows[0].comment, 'Изменён после копирования');
  assert.deepEqual(result.plans[dates[1]].rows.slice(2).map(item => item.vehicleId), [null, null]);
});

test('copying whole days preserves historical source forms for new/replaced days and existing forms on append', async () => {
  const m = await modelPromise;
  const newer = template(2);
  const plans = { [dates[0]]: plan(dates[0], [row({ clientFields: { route: 'А' } })]), [dates[1]]: plan(dates[1], [row({ driverId: driverB, comment: 'Б' })], { templateVersion: 2, templateSnapshot: newer }) };
  const before = structuredClone(plans);
  const result = m.copyCalendarDays({ plans, sourceDate: dates[0], targetDates: [dates[0], dates[1], dates[2]], policy: 'replace' });
  assert.deepEqual(result.plans[dates[0]], before[dates[0]]);
  assert.deepEqual(result.plans[dates[1]].templateSnapshot, before[dates[0]].templateSnapshot);
  assert.equal(result.plans[dates[1]].templateVersion, 1);
  assert.equal(result.plans[dates[1]].rows.length, 1); assert.equal(result.plans[dates[2]].rows.length, 1);
  assert.notEqual(result.plans[dates[1]].rows[0].id, result.plans[dates[2]].rows[0].id);
  const append = m.copyCalendarDays({ plans, sourceDate: dates[0], targetDates: [dates[1]], policy: 'append' });
  assert.equal(append.plans[dates[1]].rows.length, 2);
  assert.deepEqual(append.plans[dates[1]].templateSnapshot, newer);
  const empty = m.copyCalendarDays({ plans, sourceDate: dates[0], targetDates: [dates[1]], policy: 'empty' });
  assert.deepEqual(empty.plans, plans); assert.deepEqual(plans, before);
});

test('copy limits reject operations atomically before exceeding 200 assignments per day', async () => {
  const m = await modelPromise;
  const plans = { [dates[0]]: plan(dates[0], [row()]), [dates[1]]: plan(dates[1], Array.from({ length: 200 }, () => row())) };
  const before = structuredClone(plans);
  assert.throws(() => copy(m, plans, { policy: 'append' }), /200/);
  assert.deepEqual(plans, before);
  const allowed = copy(m, plans, { policy: 'replace' });
  assert.equal(allowed.plans[dates[1]].rows.length, 1);
});

test('copy limits reject a multi-day draft exceeding the 4 MiB request bound', async () => {
  const m = await modelPromise;
  const manyDates = Array.from({ length: 15 }, (_, index) => `2028-03-${String(index + 1).padStart(2, '0')}`);
  const plans = { [manyDates[0]]: plan(manyDates[0], Array.from({ length: 180 }, () => row({ comment: 'x'.repeat(2000) }))) };
  const before = structuredClone(plans);
  assert.throws(() => m.copyCalendarDays({ plans, sourceDate: manyDates[0], targetDates: manyDates.slice(1), policy: 'replace' }), /много данных|4|МБ|MiB|размер|объ[её]м/i);
  assert.deepEqual(plans, before);
});

test('row additions survive calendar copies independently, shifting assignment dates and clearing reassigned resource overrides', async () => {
  const m = await modelPromise;
  const fields = [
    { id: randomUUID(), label: 'Разгрузка', source: 'manual', owner: 'assignment', type: 'date', value: dates[1] },
    { id: randomUUID(), label: 'Паспорт', source: 'driver_passport', owner: 'driver', type: 'text', value: 'Паспорт водителя А' },
    { id: randomUUID(), label: 'Дата выдачи', source: 'document_issue_date', owner: 'driver', type: 'date', value: '2020-01-01' },
    { id: randomUUID(), label: 'СТС', source: 'vehicle_registration_certificate', owner: 'vehicle', type: 'text', value: 'Документ машины А' },
    { id: randomUUID(), label: 'Адрес', source: 'driver_address', owner: 'driver', type: 'text' },
  ];
  const original = row({ extraFields: fields });
  const plans = { [dates[0]]: plan(dates[0], [original]) };
  const before = structuredClone(plans);
  const horizontal = copy(m, plans).plans[dates[1]].rows[0];
  assert.equal(horizontal.extraFields[0].value, dates[2]);
  assert.equal(horizontal.extraFields[2].value, '2020-01-01');
  assert.equal(horizontal.extraFields[1].value, 'Паспорт водителя А');
  horizontal.extraFields[1].value = 'Исправление';
  assert.deepEqual(plans, before, 'editing a copied field cannot edit its source');
  const vertical = copy(m, plans, { target: single(1, 1) }).plans[dates[1]].rows[0];
  assert.equal(vertical.driverId, driverB); assert.equal(vertical.vehicleId, null);
  assert.equal(vertical.extraFields[0].value, dates[2]);
  assert.equal(vertical.extraFields.length, fields.length, 'definitions belong to the assignment and are retained');
  for (const field of vertical.extraFields.slice(1)) assert.ok(!Object.hasOwn(field, 'value'), field.label);
  assert.deepEqual(plans, before);
});

test('editing a selected calendar resource resets only its row field overrides and retains independent definitions', async () => {
  const m = await modelPromise;
  const original = row({ extraFields: [
    { id: randomUUID(), label: 'Маршрут', source: 'manual', owner: 'assignment', type: 'text', value: 'Склад А' },
    { id: randomUUID(), label: 'Пропуск водителя', source: 'manual', owner: 'driver', type: 'text', value: 'Пропуск А' },
    { id: randomUUID(), label: 'СТС', source: 'vehicle_registration_certificate', owner: 'vehicle', type: 'text', value: 'Документ А' },
  ] });
  const changed = m.changeCalendarAssignment(original, { driverId: driverB }, template());
  assert.equal(changed.extraFields[0].value, 'Склад А');
  assert.ok(!Object.hasOwn(changed.extraFields[1], 'value'));
  assert.equal(changed.extraFields[2].value, 'Документ А');
  changed.extraFields[0].label = 'Другой заголовок';
  assert.equal(original.extraFields[0].label, 'Маршрут');
  assert.equal(original.extraFields[1].value, 'Пропуск А');
  const time = m.changeCalendarAssignment(original, { departureTime: '08:00' }, template());
  time.extraFields[1].value = 'Новые данные';
  assert.equal(original.extraFields[1].value, 'Пропуск А');
});
