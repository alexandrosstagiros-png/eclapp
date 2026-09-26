'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { nextRun, previousRun, scheduleInput, periodInput, extractDigest } = require('../recovered/apps/api/src/modules/team/team-insights-domain');
const daily = { frequency: 'daily', time: '09:00', timeZone: 'Europe/Moscow', weekday: 1 };
test('daily and weekly schedules use local calendar time and advance strictly beyond an occurrence', () => {
  assert.equal(nextRun(daily, new Date('2026-09-25T05:59:59Z')).toISOString(), '2026-09-25T06:00:00.000Z');
  assert.equal(nextRun(daily, new Date('2026-09-25T06:00:00Z')).toISOString(), '2026-09-26T06:00:00.000Z');
  assert.equal(nextRun({ ...daily, frequency: 'weekly', weekday: 1 }, new Date('2026-09-25T06:00:00Z')).toISOString(), '2026-09-28T06:00:00.000Z');
  assert.equal(previousRun({ ...daily, frequency: 'weekly', weekday: 1 }, new Date('2026-09-28T06:00:00Z')).toISOString(), '2026-09-21T06:00:00.000Z');
  assert.equal(nextRun({ ...daily, timeZone: 'Asia/Kathmandu' }, new Date('2026-09-25T00:00:00Z')).toISOString(), '2026-09-25T03:15:00.000Z');
});
test('DST gaps skip missing wall times and repeated wall times run only once per local day', () => {
  const spring = { ...daily, time: '02:30', timeZone: 'America/New_York' };
  assert.equal(nextRun(spring, new Date('2026-03-07T07:30:00Z')).toISOString(), '2026-03-09T06:30:00.000Z');
  assert.equal(previousRun(spring, new Date('2026-03-09T06:30:00Z')).toISOString(), '2026-03-07T07:30:00.000Z');
  const autumn = { ...daily, time: '01:30', timeZone: 'America/New_York' };
  assert.equal(nextRun(autumn, new Date('2026-11-01T04:00:00Z')).toISOString(), '2026-11-01T05:30:00.000Z');
  assert.equal(nextRun(autumn, new Date('2026-11-01T05:30:00Z')).toISOString(), '2026-11-02T06:30:00.000Z');
});
test('schedule and period validation reject forged, invalid or ambiguous input', () => {
  const valid = { ...daily, responsibilityScopeId: randomUUID(), enabled: true, recipientIds: [] };
  assert.equal(scheduleInput(valid).time, '09:00');
  for (const patch of [{ enabled: 'true' }, { frequency: 'hourly' }, { time: '24:00' }, { timeZone: 'not/a-zone' }, { weekday: 0 }, { weekday: 8 }, { recipientIds: ['foreign'] }, { ownerId: randomUUID() }]) assert.throws(() => scheduleInput({ ...valid, ...patch }), error => error.status === 400);
  const now = new Date('2026-09-25T06:00:00Z'), base = { responsibilityScopeId: valid.responsibilityScopeId };
  const period = periodInput(base, now);
  assert.equal(period.periodStart.toISOString(), '2026-09-24T06:00:00.000Z');
  for (const patch of [{ periodStart: '2026-09-24' }, { periodEnd: '2026-09-26T06:00:00Z' }, { periodStart: now.toISOString() }, { ownerId: randomUUID() }]) assert.throws(() => periodInput({ ...base, ...patch }, now));
});
test('source-based digest retains evidence, exact text and all matches without a hidden message cap', () => {
  const messages = Array.from({ length: 140 }, (_, index) => ({ id: randomUUID(), conversation_id: 'channel', parent_id: null, kind: 'channel', text: `Нужно подготовить задачу ${index}. Пока срок не подтверждён.` }));
  const direct = { id: randomUUID(), conversation_id: 'private', parent_id: 'parent', kind: 'direct', text: 'Есть возможность роста. Предлагаю автоматизировать процесс: риск задержки сохраняется.' };
  const ordinary = { id: randomUUID(), conversation_id: 'private', parent_id: null, kind: 'direct', text: 'Спасибо за информацию.' };
  const report = extractDigest([...messages, direct, ordinary]);
  assert.equal(report.messageCount, 142);
  assert.equal(report.sourceMessageIds.length, 142);
  assert.equal(report.classifiedMessageCount, 141);
  assert.equal(report.directMessageCount, 2);
  assert.equal(report.branchMessageCount, 1);
  assert.equal(report.items.filter(item => item.category === 'task').length, 140);
  for (const category of ['growth', 'optimization', 'risk']) assert.deepEqual(report.items.find(item => item.category === category), { category, text: direct.text, sourceMessageIds: [direct.id] });
  assert.equal(report.items[0].text, messages[0].text);
  assert.ok(report.sourceMessageIds.includes(ordinary.id));
  assert.match(report.overview, /эвристически/);
  assert.equal(report.mode, 'extractive');
  assert.equal(extractDigest([]).messageCount, 0);
});
