"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const { SOURCES, sourceOwner, definitionInput, templateInput } = require('../recovered/apps/api/src/modules/planning/planning-template-input');
const { planInput } = require('../recovered/apps/api/src/modules/planning/planning-input');
function column(patch = {}) { return { key: 'c_field', label: 'Колонка', source: 'manual', type: 'text', owner: 'assignment', required: false, defaultValue: '', hint: '', ...patch }; }
function definition(columns = [column()]) { return { label: 'Моя форма', kind: 'table', sections: [{ id: 's_main', label: 'Раздел', columns }] }; }
function input(patch = {}) { return { responsibilityScopeId: randomUUID(), id: randomUUID(), version: 0, definition: definition(), makeDefault: false, ...patch }; }
function invalid(fn) { assert.throws(fn, error => error.getStatus() === 400); }
test('constructor accepts repeated display labels while preserving independent stable keys and section order', () => {
  const original = definition([column(), column({ key: 'second', source: 'driver_name', owner: 'driver', required: true })]);
  original.sections.push({ id: 's_second', label: 'Раздел', columns: [column({ key: 'third', type: 'time', defaultValue: '06:15' })] });
  assert.deepEqual(definitionInput(original), original);
  assert.equal(templateInput(input({ id: 'AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA' })).id, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
});
test('constructor rejects unbounded or unsafe definitions and owner mismatch', () => {
  for (const patch of [{ sections: [] }, { sections: Array(7).fill(definition().sections[0]) }, { label: ' ' }, { label: 'x'.repeat(121) }, { kind: 'code' }, { script: 'alert(1)' }]) invalid(() => definitionInput({ ...definition(), ...patch }));
  for (const patch of [{ source: 'javascript' }, { owner: 'anything' }, { source: 'driver_passport', owner: 'assignment' }, { source: 'vehicle_plate', owner: 'driver' }, { type: 'html' }, { required: 'yes' }, { key: 'constructor' }, { key: '__proto__' }, { key: 'x.y' }, { key: 'x'.repeat(101) }, { label: '' }, { hint: 'x'.repeat(201) }, { defaultValue: 'x'.repeat(2001) }, { formula: '=2+2' }]) invalid(() => definitionInput(definition([column(patch)])));
  invalid(() => definitionInput(definition([column(), column()])));
  invalid(() => definitionInput({ ...definition(), sections: [definition().sections[0], definition().sections[0]] }));
  invalid(() => definitionInput(definition(Array.from({ length: 51 }, (_, i) => column({ key: `c_${i}` })))));
  for (const patch of [{ id: 'general' }, { version: -1 }, { version: 1.1 }, { makeDefault: 'yes' }, { templateSnapshot: {} }, { legalEntityId: randomUUID() }]) invalid(() => templateInput(input(patch)));
});
test('constructor validates typed defaults but allows empty values for later completion', () => {
  for (const [type, good, bad] of [['date', ['2028-02-29', ''], ['2026-02-29', '2026-9-1']], ['time', ['00:00', '23:59', ''], ['24:00', '6:30']], ['number', ['-1.25', '+2', '.5', '0', ''], ['2,5', 'NaN', 'Infinity', '1e3', '9'.repeat(400)]]]) {
    for (const defaultValue of good) definitionInput(definition([column({ type, defaultValue })]));
    for (const defaultValue of bad) invalid(() => definitionInput(definition([column({ type, defaultValue })])));
  }
});
test('backend and frontend use the same available sources and canonical ownership', async () => {
  const frontend = await import(pathToFileURL(path.resolve(__dirname, '../recovered/apps/office-web/src/planning-fields.js')).href);
  assert.deepEqual([...SOURCES].sort(), frontend.FIELD_SOURCES.map(source => source.value).sort());
  for (const source of SOURCES) assert.equal(sourceOwner(source), frontend.sourceOwner(source), source);
});
test('plan version identity is optional only at input level for builtin compatibility and snapshots cannot be forged', () => {
  const base = { businessDate: '2026-09-17', responsibilityScopeId: randomUUID(), templateId: 'general', version: 0, rows: [] };
  assert.ok(!Object.hasOwn(planInput(base), 'templateVersion'));
  assert.equal(planInput({ ...base, templateVersion: 1 }).templateVersion, 1);
  for (const templateVersion of [0, -1, null, '1', 1.2]) invalid(() => planInput({ ...base, templateVersion }));
  invalid(() => planInput({ ...base, templateSnapshot: definition() }));
});
