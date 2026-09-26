// SPDX-License-Identifier: MIT
"use strict";
const { BadRequestException, ConflictException, ForbiddenException } = require('@nestjs/common');

const STAGES = Object.freeze(['new', 'contact', 'qualified', 'interview', 'security', 'internship', 'paperwork', 'hired', 'reserve', 'rejected']);
const SOURCES = Object.freeze(['manual','avito','ati','hh','referral','vehicle_sticker','telegram','whatsapp','rabota_ru','superjob','joblab','profi','other']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function fail(message = 'Проверьте заполненные поля.') { throw new BadRequestException({ code: 'RECRUITMENT_VALIDATION', message }); }
function conflict(message = 'Запись уже изменена. Обновите данные перед сохранением.') { throw new ConflictException({ code: 'RECRUITMENT_CONFLICT', message }); }
function forbidden(message = 'Нет доступа к рекрутингу в этой области.') { throw new ForbiddenException({ code: 'RECRUITMENT_FORBIDDEN', message }); }
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
function choice(value, choices, label) {
  if (!choices.includes(value)) fail(`Выберите значение поля «${label}».`);
  return value;
}
function date(value, required = false) {
  if ((value == null || value === '') && !required) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000-')) fail('Укажите корректную дату в формате ГГГГ-ММ-ДД.');
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) fail('Укажите существующую календарную дату.');
  return value;
}
function instant(value, required = false) {
  if ((value == null || value === '') && !required) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) fail('Укажите дату и время с часовым поясом.');
  date(value.slice(0, 10), true);
  const time = value.slice(11, 19).match(/^(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!time || Number(time[1]) > 23 || Number(time[2]) > 59 || Number(time[3] || 0) > 59) fail('Укажите корректное время.');
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) fail('Укажите корректную дату и время.');
  return parsed.toISOString();
}
function phone(value) {
  const raw = string(value, 40, 'телефон', true);
  if (!/^\+?[\d\s().-]+$/.test(raw)) fail('Укажите телефон: код страны и номер.');
  let digits = raw.replace(/\D/g, '');
  if (!raw.startsWith('+') && digits.length === 10) digits = `7${digits}`;
  else if (!raw.startsWith('+') && digits.length === 11 && digits.startsWith('8')) digits = `7${digits.slice(1)}`;
  if (!/^[1-9]\d{7,14}$/.test(digits)) fail('Укажите телефон: от 8 до 15 цифр, включая код страны.');
  return `+${digits}`;
}
function hhUrl(value) {
  const raw = string(value, 2048, 'ссылка на hh');
  if (!raw) return '';
  let url;
  try { url = new URL(raw); } catch { fail('Укажите HTTPS-ссылку на hh.ru.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.href.length > 2048 || !(url.hostname === 'hh.ru' || url.hostname.endsWith('.hh.ru'))) fail('Укажите HTTPS-ссылку на hh.ru.');
  return url.href;
}
function base(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || ![Object.prototype, null].includes(Object.getPrototypeOf(body))) fail();
  if (!Number.isSafeInteger(body.version) || body.version < 0 || body.version >= 2147483646) fail('Некорректная версия записи. Обновите страницу.');
  return { id: uuid(body.id), responsibilityScopeId: uuid(body.responsibilityScopeId, 'область работы'), version: body.version };
}
function requestInput(body) {
  const input = base(body);
  if (body.requiresSecurity !== undefined && typeof body.requiresSecurity !== 'boolean') fail('Проверьте необходимость проверки СБ.');
  const status = choice(body.status, ['open', 'paused', 'closed'], 'статус потребности');
  const unspecifiedQuantity = body.quantity === null && status !== 'open';
  if (!unspecifiedQuantity && (!Number.isSafeInteger(body.quantity) || body.quantity < (status === 'open' ? 1 : 0) || body.quantity > 10000))
    fail(status === 'open' ? 'Для открытой потребности количество должно быть целым числом от 1 до 10 000.' : 'Количество должно быть целым числом от 0 до 10 000 или не указано.');
  return { ...input, title: string(body.title, 160, 'название потребности', true), city: string(body.city, 100, 'город', status === 'open'),
    district: string(body.district, 160, 'район'), kind: choice(body.kind, ['driver', 'carrier'], 'тип подбора'), quantity: body.quantity,
    priority: choice(body.priority, ['normal', 'urgent'], 'приоритет'), status,
    neededBy: date(body.neededBy), recruiterId: uuid(body.recruiterId, 'рекрутер'), schedule: string(body.schedule, 300, 'график'),
    payTerms: string(body.payTerms, 1000, 'условия оплаты'), vehicleRequirements: string(body.vehicleRequirements, 1000, 'требования к автомобилю'),
    notes: string(body.notes, 4000, 'заметки'), publicBrief: string(body.publicBrief, 4000, 'информация для рекрутера'),
    warehouseAddress: string(body.warehouseAddress, 500, 'адрес склада'), routeInfo: string(body.routeInfo, 1000, 'маршрут и пробег'),
    trainingTerms: string(body.trainingTerms, 1000, 'обучение'), driverRequirements: string(body.driverRequirements, 1000, 'требования к водителю'),
    hhUrl: hhUrl(body.hhUrl), publishedAt: instant(body.publishedAt), requiresSecurity: body.requiresSecurity ?? false };
}
function candidateInput(body) {
  const input = base(body);
  if (body.archived !== undefined && typeof body.archived !== 'boolean') fail('Некорректный признак архива.');
  return { ...input, fullName: string(body.fullName, 160, 'ФИО', true), phone: phone(body.phone), city: string(body.city, 100, 'город', true),
    district: string(body.district, 160, 'район'), kind: choice(body.kind, ['driver', 'carrier'], 'тип кандидата'),
    recruiterId: uuid(body.recruiterId, 'рекрутер'), source: choice(body.source, SOURCES, 'источник'), hhUrl: hhUrl(body.hhUrl),
    licenseCategories: string(body.licenseCategories, 80, 'категории прав'), experience: string(body.experience, 500, 'опыт'),
    vehicleType: string(body.vehicleType, 160, 'тип автомобиля'), vehicleDimensions: string(body.vehicleDimensions, 160, 'габариты автомобиля'),
    vehicleCapacity: string(body.vehicleCapacity, 160, 'грузоподъёмность'), notes: string(body.notes, 4000, 'заметки'), archived: body.archived ?? false };
}
function applicationInput(body) {
  const input = base(body);
  const stage = choice(body.stage, STAGES, 'этап');
  return { ...input, candidateId: uuid(body.candidateId, 'кандидат'), requestId: uuid(body.requestId, 'потребность'),
    recruiterId: uuid(body.recruiterId, 'рекрутер'), stage, reason: string(body.reason, 1000, 'причина отказа', stage === 'rejected'), startDate: date(body.startDate, stage === 'hired') };
}
function taskInput(body) {
  return { ...base(body), candidateId: body.candidateId == null || body.candidateId === '' ? null : uuid(body.candidateId, 'кандидат'),
    applicationId: body.applicationId == null || body.applicationId === '' ? null : uuid(body.applicationId, 'подбор'),
    title: string(body.title, 300, 'задача', true), dueAt: instant(body.dueAt, true), assigneeId: uuid(body.assigneeId, 'исполнитель'),
    status: choice(body.status, ['open', 'done'], 'статус задачи'), notes: string(body.notes, 2000, 'заметки') };
}
function accessInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail();
  if (!Number.isSafeInteger(body.version) || body.version < 0 || body.version >= 2147483646) fail('Некорректная версия доступа.');
  if (!Array.isArray(body.requestIds) || body.requestIds.length > 10000) fail('Укажите список доступных потребностей.');
  const requestIds = [...new Set(body.requestIds.map(id => uuid(id, 'потребность')))];
  return { responsibilityScopeId: uuid(body.responsibilityScopeId, 'область работы'), userId: uuid(body.userId, 'рекрутер'),
    requestIds, status: choice(body.status, ['active', 'revoked'], 'статус доступа'), expiresAt: instant(body.expiresAt), version: body.version };
}
module.exports = { accessInput, STAGES, SOURCES, string, choice, fail, conflict, forbidden, uuid, date, instant, phone, hhUrl, requestInput, candidateInput, applicationInput, taskInput };
