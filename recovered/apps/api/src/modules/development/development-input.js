// SPDX-License-Identifier: MIT
"use strict";
const { BadRequestException, ConflictException, ForbiddenException, NotFoundException } = require('@nestjs/common');

const STATUSES = Object.freeze(['new', 'clarifying', 'ready', 'in_progress', 'review', 'done']);
const SECTIONS = Object.freeze(['tenders', 'recruitment', 'fleet', 'planning', 'access', 'other']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function fail(message = 'Проверьте заполненные поля.') { throw new BadRequestException({ code: 'DEVELOPMENT_VALIDATION', message }); }
function conflict(message = 'Тикет уже изменён. Обновите данные перед сохранением.') { throw new ConflictException({ code: 'DEVELOPMENT_CONFLICT', message }); }
function forbidden(message = 'Нет доступа к разделу «Разработка» в этой области.') { throw new ForbiddenException({ code: 'DEVELOPMENT_FORBIDDEN', message }); }
function unavailable() { throw new NotFoundException({ code: 'DEVELOPMENT_NOT_FOUND', message: 'Тикет недоступен в выбранной области.' }); }
function object(body, allowed) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || ![Object.prototype, null].includes(Object.getPrototypeOf(body))) fail();
  if (Object.keys(body).some(key => !allowed.includes(key))) fail('Переданы неизвестные поля. Обновите страницу.');
}
function uuid(value, label = 'идентификатор') {
  if (typeof value !== 'string' || !UUID.test(value)) fail(`Проверьте поле «${label}».`);
  return value.toLowerCase();
}
function string(value, maximum, label) {
  if (typeof value !== 'string' || value.length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) fail(`Проверьте поле «${label}».`);
  const result = value.trim();
  if (!result) fail(`Заполните поле «${label}».`);
  return result;
}
function choice(value, values, label) {
  if (!values.includes(value)) fail(`Выберите значение поля «${label}».`);
  return value;
}
function ticketInput(body) {
  object(body, ['id', 'responsibilityScopeId', 'title', 'description', 'section', 'status', 'version']);
  if (!Number.isSafeInteger(body.version) || body.version < 0 || body.version >= 2147483646) fail('Некорректная версия тикета. Обновите страницу.');
  return { id: uuid(body.id), responsibilityScopeId: uuid(body.responsibilityScopeId, 'область работы'),
    title: string(body.title, 200, 'название'), description: string(body.description, 6000, 'описание'),
    section: choice(body.section, SECTIONS, 'раздел'), status: choice(body.status, STATUSES, 'этап'), version: body.version };
}
function commentInput(body) {
  object(body, ['id', 'ticketId', 'responsibilityScopeId', 'text']);
  return { id: uuid(body.id), ticketId: uuid(body.ticketId, 'тикет'), responsibilityScopeId: uuid(body.responsibilityScopeId, 'область работы'),
    text: string(body.text, 4000, 'комментарий') };
}
module.exports = { STATUSES, SECTIONS, fail, conflict, forbidden, unavailable, uuid, ticketInput, commentInput };
