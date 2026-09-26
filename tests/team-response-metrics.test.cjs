'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { responseMetricsInput, durationsSummary, summarizeResponseMetrics } = require('../recovered/apps/api/src/modules/team/team-response-metrics-domain');

test('response metrics accept only supported periods and an optional canonical scope', () => {
  assert.deepEqual(responseMetricsInput(), { days: 30, responsibilityScopeId: null });
  const scope = randomUUID();
  for (const days of [7, 30, 90]) assert.deepEqual(responseMetricsInput({ days: String(days), responsibilityScopeId: scope }), { days, responsibilityScopeId: scope });
  for (const days of ['', '07', '30.0', ' 30 ', '31', 0, -7, null, true, ['7'], ['7', '30'], {}])
    assert.throws(() => responseMetricsInput({ days }), error => error.status === 400);
  for (const input of [{ responsibilityScopeId: 'foreign' }, { userId: scope }, { companyId: scope }, []])
    assert.throws(() => responseMetricsInput(input), error => error.status === 400);
});

test('mean and median preserve immediate responses and distinguish no observations from zero', () => {
  assert.deepEqual(durationsSummary([]), { responseCount: 0, averageResponseSeconds: null, medianResponseSeconds: null });
  assert.deepEqual(durationsSummary([0]), { responseCount: 1, averageResponseSeconds: 0, medianResponseSeconds: 0 });
  assert.deepEqual(durationsSummary([600, 0, 300]), { responseCount: 3, averageResponseSeconds: 300, medianResponseSeconds: 300 });
  assert.deepEqual(durationsSummary([1, 9, 2, 4]), { responseCount: 4, averageResponseSeconds: 4, medianResponseSeconds: 3 });
  assert.equal(durationsSummary([0.1, 0.3]).medianResponseSeconds, 0.2);
});

test('staff with no observations stay visible and global statistics are weighted by replies', () => {
  const people = ['a', 'b', 'c'].map(id => ({ id, displayName: id, role: 'dispatcher' }));
  const event = (userId, kind, durationSeconds) => ({ userId, kind, durationSeconds });
  const result = summarizeResponseMetrics(people, [event('a', 'direct', 0), event('a', 'channel', 30), event('b', 'direct', 90),
    event('a', 'pending', 60), event('a', 'pending', 120), event('former-employee', 'channel', 900)]);
  assert.deepEqual(result.totals, { responseCount: 3, averageResponseSeconds: 40, medianResponseSeconds: 30, pendingDirectCount: 2 });
  const [a, b, c] = result.employees;
  assert.equal(a.responseCount, 2); assert.equal(a.directResponseCount, 1); assert.equal(a.channelResponseCount, 1);
  assert.equal(a.pendingDirectCount, 2); assert.equal(a.oldestPendingSeconds, 120);
  assert.equal(b.pendingDirectCount, 0); assert.equal(b.oldestPendingSeconds, null);
  assert.equal(c.responseCount, 0); assert.equal(c.averageResponseSeconds, null); assert.equal(c.medianResponseSeconds, null);
});
