"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const input = require('../recovered/apps/api/src/modules/recruitment/recruitment-input.js');

const base = () => ({ id: randomUUID(), responsibilityScopeId: randomUUID(), version: 0 });
const candidate = () => ({ ...base(), fullName: 'Синтетический Кандидат', phone: '89991234567', city: 'Москва', kind: 'driver', recruiterId: randomUUID(), source: 'manual' });
const request = () => ({ ...base(), title: 'Синтетическая потребность', city: 'Москва', kind: 'driver', quantity: 1, priority: 'normal', status: 'open', recruiterId: randomUUID() });
const application = () => ({ ...base(), candidateId: randomUUID(), requestId: randomUUID(), recruiterId: randomUUID(), stage: 'new' });
const task = () => ({ ...base(), title: 'Позвонить', dueAt: '2026-09-21T12:00:00+03:00', assigneeId: randomUUID(), status: 'open' });
const invalid = operation => assert.throws(operation, error => error.getStatus?.() === 400 && error.getResponse?.().code === 'RECRUITMENT_VALIDATION' && /[А-Яа-яЁё]/.test(error.getResponse().message));

test('equivalent domestic phones normalize to one duplicate-detection key while international phones remain intact', () => {
  for (const phone of ['8 (999) 123-45-67', '79991234567', '+7 999 123 45 67', '9991234567']) assert.equal(input.phone(phone), '+79991234567');
  assert.equal(input.phone('+44 (20) 7946-0123'), '+442079460123');
  for (const phone of ['', '+', 'abcdef', '+0000123456', '+1234567', '+1234567890123456', '89991234567 доб. 5', '+7+9991234567']) invalid(() => input.phone(phone));
});

test('hh links reject execution, credential and look-alike-host attacks while allowing regional hh links', () => {
  assert.equal(input.hhUrl('https://hh.ru/vacancy/123456?from=search'), 'https://hh.ru/vacancy/123456?from=search');
  assert.equal(input.hhUrl('https://spb.hh.ru/resume/synthetic'), 'https://spb.hh.ru/resume/synthetic');
  assert.equal(input.hhUrl(null), '');
  for (const url of ['javascript:alert(1)', 'data:text/html,test', 'http://hh.ru/vacancy/1', '//hh.ru/vacancy/1', 'https://hh.ru.evil.example/', 'https://hh.ru@evil.example/', 'https://someone@hh.ru/', 'https://hh.ru:8443/', 'https://evil.example/#hh.ru', 'https://hһ.ru/']) invalid(() => input.hhUrl(url));
});

test('Unicode hh paths cannot expand beyond the persisted URL limit during normalization', () => {
  const acceptable = `https://hh.ru/${'я'.repeat(200)}`;
  assert.equal(input.hhUrl(acceptable), new URL(acceptable).href);
  const expanded = `https://hh.ru/${'я'.repeat(400)}`;
  assert.ok(expanded.length < 2048);
  assert.ok(new URL(expanded).href.length > 2048);
  invalid(() => input.hhUrl(expanded));
});

test('calendar dates and exact reminders preserve valid instants and reject silent calendar rollover', () => {
  assert.equal(input.date('2028-02-29'), '2028-02-29');
  assert.equal(input.date(''), null);
  assert.equal(input.instant('2026-09-21T12:00:00+03:00', true), '2026-09-21T09:00:00.000Z');
  for (const date of ['2026-02-29', '2026-02-30', '2026-04-31', '2026-13-01', '2026-1-1', '0000-01-01', '2026-09-17T00:00:00Z']) invalid(() => input.date(date));
  for (const instant of ['', '2026-09-21T12:00', '2026-02-30T12:00:00Z', '2026-09-21T24:00:00Z', '2026-09-21T12:60:00Z', '2026-09-21T12:00:60Z', '2026-09-21T12:00:00+30:00']) invalid(() => input.instant(instant, true));
});

test('rejection requires a reason and hiring requires a real work-start date', () => {
  const record = application();
  for (const reason of [null, '', '   ']) invalid(() => input.applicationInput({ ...record, stage: 'rejected', reason }));
  assert.equal(input.applicationInput({ ...record, stage: 'rejected', reason: '  Не подходит график  ' }).reason, 'Не подходит график');
  for (const startDate of [null, '', '2026-02-30']) invalid(() => input.applicationInput({ ...record, stage: 'hired', startDate }));
  assert.equal(input.applicationInput({ ...record, stage: 'hired', startDate: '2026-09-21' }).startDate, '2026-09-21');
  invalid(() => input.applicationInput({ ...record, stage: 'working' }));
});

test('record versions and quantities reject malformed, unsafe and out-of-bounds writes', () => {
  const record = request();
  for (const version of [undefined, -1, 1.5, '1', Number.MAX_SAFE_INTEGER, NaN]) invalid(() => input.requestInput({ ...record, version }));
  for (const quantity of [undefined, null, 0, -1, 1.5, '2', 10001, NaN]) invalid(() => input.requestInput({ ...record, quantity }));
  assert.equal(input.requestInput({ ...record, version: 12, quantity: 10000 }).quantity, 10000);
  for (const malformed of [null, [], 'text', new Date()]) invalid(() => input.requestInput(malformed));
});

test('paused and closed imported needs preserve an unknown or zero requirement without inventing a city', () => {
  const record = request();
  for (const status of ['paused', 'closed']) {
    for (const quantity of [null, 0, 1, 10000]) {
      const saved = input.requestInput({ ...record, status, quantity, city: '' });
      assert.equal(saved.quantity, quantity);
      assert.equal(saved.city, '');
      assert.equal(saved.status, status);
    }
    for (const quantity of [undefined, -1, 1.5, '', '0', 10001, NaN]) invalid(() => input.requestInput({ ...record, status, quantity }));
    invalid(() => input.requestInput({ ...record, status, quantity: null, recruiterId: null }));
    invalid(() => input.requestInput({ ...record, status, quantity: null, city: 'x'.repeat(101) }));
  }
  for (const city of ['', '  ', null]) invalid(() => input.requestInput({ ...record, city }));
  const saved = input.requestInput({ ...record, sourceDetails: 'Client must not change the imported source' });
  assert.equal(Object.hasOwn(saved, 'sourceDetails'), false);
});

test('candidate validation trims text, supports carrier details and rejects poisoned card values', () => {
  const record = candidate();
  const saved = input.candidateInput({ ...record, fullName: '  Синтетический Кандидат  ', kind: 'carrier', vehicleDimensions: '4 × 2 × 2 м', vehicleCapacity: '1,5 т', createdAt: '2000-01-01', version: 1 });
  assert.equal(saved.fullName, 'Синтетический Кандидат');
  assert.equal(saved.vehicleDimensions, '4 × 2 × 2 м');
  assert.equal(saved.archived, false);
  assert.equal(saved.notes, '');
  assert.ok(!Object.hasOwn(saved, 'createdAt'));
  for (const patch of [{ fullName: '   ' }, { fullName: 'Имя\u0000Кандидата' }, { notes: 'x'.repeat(4001) }, { city: 'x'.repeat(101) }, { archived: 'true' }, { kind: 'truck' }, { source: 'unknown' }, { recruiterId: 'bad-id' }]) invalid(() => input.candidateInput({ ...record, ...patch }));
});

test('tasks accept optional candidates but require an assignee, exact time and a valid status', () => {
  const record = task();
  const saved = input.taskInput(record);
  assert.equal(saved.candidateId, null);
  assert.equal(saved.dueAt, '2026-09-21T09:00:00.000Z');
  for (const patch of [{ assigneeId: null }, { candidateId: 'bad-id' }, { title: '' }, { dueAt: '2026-09-21' }, { status: 'complete' }]) invalid(() => input.taskInput({ ...record, ...patch }));
});
