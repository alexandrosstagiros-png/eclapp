"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { planInput, businessDate } = require(path.join(__dirname, '../recovered/apps/api/src/modules/planning/planning-input'));

function input(rows = [{ id: randomUUID() }]) {
  return { businessDate: '2026-09-17', responsibilityScopeId: randomUUID(), templateId: 'client-moscow', rows, version: 0 };
}
function invalid(fn) { assert.throws(fn, error => error.getStatus() === 400); }

test('planning dates are explicit calendar dates without timezone coercion', () => {
  assert.equal(businessDate('2028-02-29'), '2028-02-29');
  for (const date of [undefined, null, '', '2026-02-29', '2026-04-31', '2026-09-17T00:00:00Z', '2026-9-17', '0000-01-01', '2026-00-01']) invalid(() => businessDate(date));
});
test('planning accepts bounded arbitrary client fields and preserves row order', () => {
  const first = randomUUID(); const second = randomUUID();
  const actual = planInput(input([{ id: first, clientFields: { 'Водитель / паспорт': 'Синтетический пример', phone: '+79990000000' } }, { id: second, departureTime: '23:59', status: 'paid_reserve' }]));
  assert.deepEqual(actual.rows.map(row => row.id), [first, second]);
  assert.equal(actual.rows[0].tripCount, 1);
  assert.equal(actual.rows[0].confirmed, false);
  assert.equal(actual.rows[0].driverId, null);
  assert.equal(actual.rows[0].clientFields['Водитель / паспорт'], 'Синтетический пример');
  assert.deepEqual(actual.rows[0].extraFields, []);
});
test('row-specific fields preserve automatic binding and explicit overrides without affecting adjacent rows', () => {
  const automatic = { id: randomUUID(), label: 'Паспорт', source: 'driver_passport', owner: 'driver', type: 'text' };
  const blankOverride = { ...automatic, id: randomUUID(), value: '' };
  const manual = { id: randomUUID(), label: 'Код клиента', source: 'manual', owner: 'assignment', type: 'text', value: 'КПП-12' };
  const rows = planInput(input([{ id: randomUUID(), extraFields: [automatic, blankOverride, manual] }, { id: randomUUID() }])).rows;
  assert.deepEqual(rows[0].extraFields, [automatic, blankOverride, manual]);
  assert.equal(Object.hasOwn(rows[0].extraFields[0], 'value'), false);
  assert.equal(Object.hasOwn(rows[0].extraFields[1], 'value'), true);
  assert.deepEqual(rows[1].extraFields, []);
  for (const [type, value] of [['number', '-12.5'], ['date', '2028-02-29'], ['time', '23:59']]) {
    const field = { ...manual, type, value };
    assert.deepEqual(planInput(input([{ id: randomUUID(), extraFields: [field] }])).rows[0].extraFields, [field]);
  }
  const fields = Array.from({ length: 20 }, () => ({ ...manual, id: randomUUID() }));
  assert.equal(planInput(input([{ id: randomUUID(), extraFields: fields }])).rows[0].extraFields.length, 20);
});
test('row-specific fields reject unknown sources, mismatched owners, duplicate IDs and invalid typed overrides', () => {
  const base = { id: randomUUID(), label: 'Паспорт', source: 'driver_passport', owner: 'driver', type: 'text' };
  const rejectFields = extraFields => invalid(() => planInput(input([{ id: randomUUID(), extraFields }])));
  for (const extraFields of [null, {}, [null], [base, { ...base, id: base.id.toUpperCase() }], Array.from({ length: 21 }, () => ({ ...base, id: randomUUID() }))]) rejectFields(extraFields);
  for (const patch of [
    { id: 'field' }, { label: '' }, { label: ' ' }, { label: 'x'.repeat(121) },
    { source: 'users.password_hash' }, { source: '__proto__' }, { owner: 'vehicle' }, { owner: 'unknown' }, { type: 'html' },
    { value: null }, { value: 123 }, { value: 'x'.repeat(2001) }, { value: '\u0000' }, { other: true },
    { type: 'date', value: '2026-02-29' }, { type: 'time', value: '24:00' }, { type: 'number', value: 'NaN' },
    { type: 'number', value: '1e5' }, { type: 'number', value: '12,5' }, { type: 'number', value: '1'.repeat(400) },
  ]) rejectFields([{ ...base, ...patch }]);
});
test('planning rejects ambiguity, unsafe keys, excessive strings and oversized drafts', () => {
  const id = randomUUID();
  invalid(() => planInput(input([{ id }, { id: id.toUpperCase() }])));
  invalid(() => planInput({ ...input(), legalEntityId: randomUUID() }));
  for (const patch of [{ departureTime: '24:00' }, { status: 'unknown' }, { tripCount: 0 }, { tripCount: 1.5 }, { arrived: 'false' }, { comment: 'x'.repeat(2001) }, { driverId: 'driver' }, { clientFields: [] }, { clientFields: { passport: 100 } }, { clientFields: JSON.parse('{"__proto__":"bad"}') }]) invalid(() => planInput(input([{ id, ...patch }])));
  invalid(() => planInput(input(Array.from({ length: 201 }, () => ({ id: randomUUID() })))));
  invalid(() => planInput(input([{ id, clientFields: Object.fromEntries(Array.from({ length: 51 }, (_, n) => [`field${n}`, ''])) }])));
  invalid(() => planInput(input(Array.from({ length: 200 }, () => ({ id: randomUUID(), clientFields: { a: 'я'.repeat(2000), b: 'я'.repeat(2000) } })))));
});
