"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { calendarRange, calendarInput, MAX_CALENDAR_BYTES } = require('../recovered/apps/api/src/modules/planning/planning-calendar-input');
const scope = randomUUID();
const plan = (businessDate, patch = {}) => ({ businessDate, templateId: 'general', templateVersion: 1, rows: [{ id: randomUUID() }], version: 0, ...patch });
const body = plans => ({ responsibilityScopeId: scope, plans });
const invalid = fn => assert.throws(fn, error => error.getStatus() === 400);

test('calendar ranges are inclusive real calendar dates of at most 31 days', () => {
  assert.deepEqual(calendarRange('2028-02-01', '2028-03-02'), { from: '2028-02-01', to: '2028-03-02' });
  assert.deepEqual(calendarRange('2026-12-31', '2026-12-31'), { from: '2026-12-31', to: '2026-12-31' });
  for (const pair of [['2026-09-01', '2026-10-02'], ['2026-09-03', '2026-09-02'], ['2026-02-29', '2026-03-01'], [undefined, '2026-09-01'], ['2026-09-01', undefined]]) invalid(() => calendarRange(...pair));
});
test('calendar input normalizes all days and rejects ambiguous dates or caller-supplied scope/snapshots', () => {
  const input = calendarInput(body([plan('2026-09-03'), plan('2026-09-01')]));
  assert.deepEqual(input.plans.map(day => day.businessDate), ['2026-09-01', '2026-09-03']);
  assert.ok(input.plans.every(day => day.responsibilityScopeId === scope && day.rows[0].driverId === null));
  for (const plans of [[], [plan('2026-09-01'), plan('2026-09-01')], [plan('2026-09-01'), plan('2026-10-02')], [plan('2026-09-01', { responsibilityScopeId: randomUUID() })], [plan('2026-09-01', { templateSnapshot: {} })], [plan('2026-09-01', { rows: [{ id: randomUUID(), status: 'unknown' }] })], [plan('2026-09-01', { rows: Array.from({ length: 201 }, () => ({ id: randomUUID() })) })]]) invalid(() => calendarInput(body(plans)));
  invalid(() => calendarInput({ ...body([plan('2026-09-01')]), projectId: randomUUID() }));
});
test('calendar payload bound applies across individually valid days', () => {
  const rows = Array.from({ length: 180 }, () => ({ id: randomUUID(), comment: 'x'.repeat(2000) }));
  const input = body(Array.from({ length: 12 }, (_, index) => plan(`2026-09-${String(index + 1).padStart(2, '0')}`, { rows })));
  assert.ok(Buffer.byteLength(JSON.stringify(input)) > MAX_CALENDAR_BYTES);
  invalid(() => calendarInput(input));
  assert.equal(calendarInput(body(input.plans.slice(0, 2))).plans.length, 2);
});
