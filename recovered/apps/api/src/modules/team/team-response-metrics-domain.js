// SPDX-License-Identifier: MIT
'use strict';
const { object, uuid, fail } = require('./team-input');

function responseMetricsInput(query = {}) {
  object(query, ['responsibilityScopeId', 'days']);
  const days = query.days === undefined ? 30 : Number(query.days);
  if ((query.days !== undefined && !['number', 'string'].includes(typeof query.days)) ||
    !['7', '30', '90'].includes(String(query.days ?? 30)) || ![7, 30, 90].includes(days))
    fail('Выберите период: 7, 30 или 90 дней.');
  return { days, responsibilityScopeId: query.responsibilityScopeId == null || query.responsibilityScopeId === ''
    ? null : uuid(query.responsibilityScopeId, 'область работы') };
}

function durationsSummary(values) {
  if (!values.length) return { responseCount: 0, averageResponseSeconds: null, medianResponseSeconds: null };
  const ordered = [...values].sort((a, b) => a - b), middle = Math.floor(ordered.length / 2);
  return { responseCount: values.length, averageResponseSeconds: values.reduce((sum, value) => sum + value, 0) / values.length,
    medianResponseSeconds: ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2 };
}

function summarizeResponseMetrics(people, events) {
  const byUser = new Map(people.map(person => [person.userId || person.id, {
    userId: person.userId || person.id, displayName: person.displayName, role: person.role,
    durations: [], directResponseCount: 0, channelResponseCount: 0, pendingDirectCount: 0, oldestPendingSeconds: null,
  }]));
  const allDurations = [];
  let pendingDirectCount = 0;
  for (const event of events) {
    const employee = byUser.get(event.userId);
    if (!employee) continue;
    const seconds = Number(event.durationSeconds);
    if (event.kind === 'pending') {
      employee.pendingDirectCount++;
      employee.oldestPendingSeconds = Math.max(employee.oldestPendingSeconds ?? 0, seconds);
      pendingDirectCount++;
    } else {
      employee.durations.push(seconds);
      allDurations.push(seconds);
      if (event.kind === 'direct') employee.directResponseCount++;
      else if (event.kind === 'channel') employee.channelResponseCount++;
    }
  }
  const employees = [...byUser.values()].map(({ durations, ...employee }) => ({ ...employee, ...durationsSummary(durations) }));
  employees.sort((a, b) => a.displayName.localeCompare(b.displayName, 'ru') || a.userId.localeCompare(b.userId));
  return { employees, totals: { ...durationsSummary(allDurations), pendingDirectCount } };
}

module.exports = { responseMetricsInput, durationsSummary, summarizeResponseMetrics };
