"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const input = require('../recovered/apps/api/src/modules/tenders/tenders-input');
const base = () => ({ id: randomUUID(), responsibilityScopeId: randomUUID(), version: 0 });
const tender = () => ({ ...base(), customerId: randomUUID(), title: 'Перевозки для заказчика', status: 'planned', kind: 'tender' });
const invalid = operation => assert.throws(operation, error => error.getStatus?.() === 400 && error.getResponse?.().code === 'TENDERS_VALIDATION');

test('a minimal tender preserves unspecified commercial requirements without fabricating a quantity or date', () => {
  const saved = input.tenderInput({ ...tender(), vehicleCount: '  10–15 авто, после уточнения  ', requirements: '  Рефрижераторы\nТемпература +2…+4 °C  ' });
  assert.equal(saved.vehicleCount, '10–15 авто, после уточнения');
  assert.equal(saved.requirements, 'Рефрижераторы\nТемпература +2…+4 °C');
  assert.equal(saved.expectedLaunch, null);
  assert.equal(saved.submissionDeadline, null);
  assert.equal(saved.nextStepDue, null);
  assert.equal(saved.deliveryType, '');
  assert.equal(saved.nextStep, '');
  assert.equal(saved.closeReason, '');
  assert.equal(saved.winReason, '');
  assert.equal(input.tenderInput(tender()).vehicleCount, '');
});

test('winning and closing require a recorded outcome while reopening remains possible', () => {
  const record = tender();
  for (const reason of [undefined, null, '', '  ']) {
    invalid(() => input.tenderInput({ ...record, status: 'won', winReason: reason }));
    invalid(() => input.tenderInput({ ...record, status: 'closed', closeReason: reason }));
  }
  assert.equal(input.tenderInput({ ...record, status: 'won', winReason: '  Заказчик подтвердил условия  ' }).winReason, 'Заказчик подтвердил условия');
  assert.equal(input.tenderInput({ ...record, status: 'closed', closeReason: 'Сняли конкурс' }).closeReason, 'Сняли конкурс');
  assert.equal(input.tenderInput({ ...record, status: 'in_progress', version: 3 }).status, 'in_progress');
  for (const patch of [{ status: 'launched' }, { kind: '' }, { deliveryType: 'air' }, { vehicleCount: 10 }]) invalid(() => input.tenderInput({ ...record, ...patch }));
});

test('date-only deadlines reject timezone shifts and nonexistent days', () => {
  assert.equal(input.date('2028-02-29'), '2028-02-29');
  for (const date of [null, undefined, '']) assert.equal(input.date(date), null);
  for (const date of ['0000-01-01', '2026-02-29', '2026-04-31', '2026-13-01', '2026-1-1', '2026-09-23T00:00:00Z', 1]) {
    invalid(() => input.tenderInput({ ...tender(), expectedLaunch: date }));
    invalid(() => input.tenderInput({ ...tender(), submissionDeadline: date }));
    invalid(() => input.tenderInput({ ...tender(), nextStepDue: date }));
  }
});

test('versions and scope identifiers reject malformed writes before database access', () => {
  for (const version of [undefined, null, -1, 1.5, '1', 2147483646, Number.MAX_SAFE_INTEGER, NaN]) invalid(() => input.tenderInput({ ...tender(), version }));
  for (const patch of [{ id: 'bad' }, { responsibilityScopeId: '' }, { customerId: null }]) invalid(() => input.tenderInput({ ...tender(), ...patch }));
  for (const body of [null, [], 'text', new Date(), Object.create({})]) {
    invalid(() => input.tenderInput(body));
    invalid(() => input.customerInput(body));
    invalid(() => input.commentInput(body));
  }
});

test('text bounds reject poison and oversized payloads and discard server-owned properties', () => {
  const record = tender();
  const limits = { title: 200, vehicleCount: 160, requirements: 4000, launchNotes: 1000, nextStep: 1000, closeReason: 1000, winReason: 1000 };
  for (const [field, maximum] of Object.entries(limits)) {
    assert.equal(input.tenderInput({ ...record, [field]: 'а'.repeat(maximum) })[field].length, maximum);
    invalid(() => input.tenderInput({ ...record, [field]: 'а'.repeat(maximum + 1) }));
    invalid(() => input.tenderInput({ ...record, [field]: 'неверно\u0000' }));
  }
  const saved = input.tenderInput({ ...record, createdAt: '2000-01-01', actorId: randomUUID(), legalEntityId: randomUUID() });
  for (const field of ['createdAt', 'actorId', 'legalEntityId']) assert.equal(Object.hasOwn(saved, field), false);
  assert.equal(input.customerInput({ ...base(), name: '  Заказчик  ' }).name, 'Заказчик');
  for (const name of ['', '  ', 'a'.repeat(201)]) invalid(() => input.customerInput({ ...base(), name }));
});

test('comments require a stable UUID key and nonblank bounded text; client cannot set authors or time', () => {
  const record = { id: randomUUID(), tenderId: randomUUID(), responsibilityScopeId: randomUUID(), text: '  Получили требования\nГотовим расчёт  ' };
  const saved = input.commentInput({ ...record, actorId: randomUUID(), createdAt: '2000-01-01' });
  assert.equal(saved.text, 'Получили требования\nГотовим расчёт');
  assert.deepEqual(Object.keys(saved).sort(), ['id', 'responsibilityScopeId', 'tenderId', 'text']);
  for (const patch of [{ id: null }, { tenderId: 'bad' }, { text: '' }, { text: '  ' }, { text: 'a'.repeat(4001) }, { text: 'a\u007fb' }]) invalid(() => input.commentInput({ ...record, ...patch }));
});
