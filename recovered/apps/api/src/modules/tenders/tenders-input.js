// SPDX-License-Identifier: MIT
"use strict";
const { BadRequestException, ConflictException, ForbiddenException } = require('@nestjs/common');

const STATUSES = Object.freeze(['planned', 'in_progress', 'awaiting_decision', 'won', 'closed']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function fail(message = 'Проверьте заполненные поля.') { throw new BadRequestException({ code: 'TENDERS_VALIDATION', message }); }
function conflict(message = 'Запись уже изменена. Обновите данные перед сохранением.') { throw new ConflictException({ code: 'TENDERS_CONFLICT', message }); }
function forbidden(message = 'Нет доступа к тендерам в этой области.') { throw new ForbiddenException({ code: 'TENDERS_FORBIDDEN', message }); }
function object(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || ![Object.prototype, null].includes(Object.getPrototypeOf(body))) fail();
  return body;
}
function uuid(value, label = 'идентификатор') {
  if (typeof value !== 'string' || !UUID.test(value)) fail(`Проверьте поле «${label}».`);
  return value.toLowerCase();
}
function string(value, max, label, required = false) {
  if (value == null && !required) return '';
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) fail(`Проверьте поле «${label}».`);
  const result = value.trim();
  if (required && !result) fail(`Заполните поле «${label}».`);
  return result;
}
function choice(value, values, label) {
  if (!values.includes(value)) fail(`Выберите значение поля «${label}».`);
  return value;
}
function date(value) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000-')) fail('Укажите корректную дату в формате ГГГГ-ММ-ДД.');
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) fail('Укажите существующую календарную дату.');
  return value;
}
function base(body) {
  object(body);
  if (!Number.isSafeInteger(body.version) || body.version < 0 || body.version >= 2147483646) fail('Некорректная версия записи. Обновите страницу.');
  return { id: uuid(body.id), responsibilityScopeId: uuid(body.responsibilityScopeId, 'область работы'), version: body.version };
}
function customerInput(body) {
  return { ...base(body), name: string(body.name, 200, 'заказчик', true) };
}
function tenderInput(body) {
  const input = base(body);
  const status = choice(body.status, STATUSES, 'статус');
  return { ...input, customerId: uuid(body.customerId, 'заказчик'), title: string(body.title, 200, 'название тендера', true), status,
    vehicleCount: string(body.vehicleCount, 160, 'количество автомобилей'), requirements: string(body.requirements, 4000, 'требования'),
    deliveryType: choice(body.deliveryType ?? '', ['', 'city', 'crew'], 'тип доставки'), expectedLaunch: date(body.expectedLaunch),
    launchNotes: string(body.launchNotes, 1000, 'условия запуска'), submissionDeadline: date(body.submissionDeadline),
    nextStep: string(body.nextStep, 1000, 'следующий шаг'), nextStepDue: date(body.nextStepDue),
    kind: choice(body.kind, ['tender', 'negotiation', 'expansion'], 'тип работы'),
    closeReason: string(body.closeReason, 1000, 'причина закрытия', status === 'closed'),
    winReason: string(body.winReason, 1000, 'результат победы', status === 'won') };
}
function commentInput(body) {
  object(body);
  return { id: uuid(body.id), tenderId: uuid(body.tenderId, 'тендер'), responsibilityScopeId: uuid(body.responsibilityScopeId, 'область работы'),
    text: string(body.text, 4000, 'комментарий', true) };
}
module.exports = { STATUSES, fail, conflict, forbidden, uuid, date, customerInput, tenderInput, commentInput };
