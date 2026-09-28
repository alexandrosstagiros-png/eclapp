"use strict";
const { BadRequestException } = require('@nestjs/common');
const { SOURCES, sourceOwner } = require('./planning-sources');

const STATUSES = Object.freeze(['work', 'reserve', 'paid_reserve', 'off', 'repair', 'sick', 'transferred', 'cancelled', 'no_work', 'no_driver', 'crew_shortage', 'failed']);
const MAX_PLAN_BYTES = 450 * 1024;
const MAX_EXTRA_FIELDS = 20;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function fail(message) { throw new BadRequestException(message); }
function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail(`Некорректное поле «${label}».`);
  return value;
}
function keys(value, allowed, label) {
  if (Object.keys(value).some(key => !allowed.includes(key))) fail(`Неизвестное поле в «${label}».`);
}
function uuid(value, label = 'идентификатор') {
  if (typeof value !== 'string' || !UUID.test(value)) fail(`Некорректное поле «${label}».`);
  return value.toLowerCase();
}
function businessDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000-')) fail('Укажите дату планирования в формате ГГГГ-ММ-ДД.');
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) fail('Некорректная дата планирования.');
  return value;
}
function string(value, max, label) {
  if (typeof value !== 'string' || value.length > max || value.includes('\u0000')) fail(`Некорректное поле «${label}».`);
  return value;
}
function boolean(value, label) {
  if (value === undefined) return false;
  if (typeof value !== 'boolean') fail(`Некорректное поле «${label}».`);
  return value;
}
function extraFieldsInput(raw, rowLabel) {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > MAX_EXTRA_FIELDS) fail(`В строке допускается до ${MAX_EXTRA_FIELDS} дополнительных полей: ${rowLabel}.`);
  const seen = new Set();
  return raw.map(field => {
    object(field, `дополнительное поле, ${rowLabel}`);
    keys(field, ['id', 'label', 'source', 'type', 'owner', 'value'], `дополнительное поле, ${rowLabel}`);
    const id = uuid(field.id, 'идентификатор дополнительного поля');
    if (seen.has(id)) fail(`Идентификаторы дополнительных полей должны быть уникальными: ${rowLabel}.`);
    seen.add(id);
    const label = string(field.label, 120, 'название дополнительного поля').trim();
    if (!label) fail('Заполните название дополнительного поля.');
    if (!['text', 'number', 'date', 'time'].includes(field.type)) fail('Неизвестный тип дополнительного поля.');
    if (!SOURCES.has(field.source)) fail('Неизвестный источник подстановки дополнительного поля.');
    if (!['assignment', 'driver', 'vehicle'].includes(field.owner)) fail('Неизвестная принадлежность дополнительного поля.');
    if (field.source !== 'manual' && field.owner !== sourceOwner(field.source)) fail('Принадлежность дополнительного поля должна соответствовать источнику подстановки.');
    const result = { id, label, source: field.source, type: field.type, owner: field.owner };
    // An absent value follows the selected driver/vehicle. An explicit empty
    // string is a saved override and must not become an automatic value again.
    if (Object.hasOwn(field, 'value')) {
      const value = string(field.value, 2000, 'значение дополнительного поля');
      if (value !== '') {
        if (field.type === 'date') businessDate(value);
        if (field.type === 'time' && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) fail('Укажите время дополнительного поля в формате ЧЧ:ММ.');
        if (field.type === 'number' && (!/^[-+]?(?:\d+\.?\d*|\.\d+)$/.test(value) || !Number.isFinite(Number(value)))) fail('Значение дополнительного поля должно быть числом с точкой в качестве десятичного разделителя.');
      }
      result.value = value;
    }
    return result;
  });
}
function reportingInput(raw, row) {
  if (raw === undefined) return undefined;
  object(raw, 'данные выпуска');
  keys(raw, ['block', 'fleetType', 'managerId', 'actualTrips', 'crewRequired', 'crewPresent', 'cityName', 'clientName'], 'данные выпуска');
  const nullableChoice = (value, choices, label) => {
    if (value == null) return null;
    if (!choices.includes(value)) fail(`Некорректное поле «${label}».`);
    return value;
  };
  const nullableCount = (value, min, max, label) => {
    if (value == null) return null;
    if (!Number.isSafeInteger(value) || value < min || value > max) fail(`Поле «${label}» должно быть целым от ${min} до ${max}.`);
    return value;
  };
  const result = {
    block: nullableChoice(raw.block, ['crew', 'city'], 'блок'),
    fleetType: nullableChoice(raw.fleetType, ['own', 'subcontracted'], 'принадлежность машины'),
    managerId: raw.managerId == null ? null : uuid(raw.managerId, 'ответственный менеджер'),
    actualTrips: nullableCount(raw.actualTrips, 0, 999, 'фактические рейсы'),
    crewRequired: nullableCount(raw.crewRequired, 1, 99, 'требуется человек в экипаже'),
    crewPresent: nullableCount(raw.crewPresent, 0, 99, 'вышло человек в экипаже'),
  };
  for (const [key, label] of [['cityName', 'город выпуска'], ['clientName', 'клиент выпуска']]) {
    if (raw[key] == null) continue;
    const value = string(raw[key], 100, label).trim();
    if (/[\u0000-\u001f]/.test(value)) fail(`Некорректное поле «${label}».`);
    if (value) result[key] = value;
  }
  if (result.actualTrips > 0) {
    if (!row.vehicleId) fail('Для фактического выпуска выберите машину.');
    // Preserve real incidents, such as a release with an incomplete crew or a
    // vehicle repaired after a run. The report exposes conflicting facts.
  }
  return result;
}
function planInput(body) {
  object(body, 'план');
  keys(body, ['businessDate', 'responsibilityScopeId', 'templateId', 'templateVersion', 'rows', 'version'], 'план');
  const date = businessDate(body.businessDate);
  const responsibilityScopeId = uuid(body.responsibilityScopeId, 'область работы');
  if (typeof body.templateId !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(body.templateId)) fail('Выберите форму клиента.');
  if (body.templateVersion !== undefined && (!Number.isSafeInteger(body.templateVersion) || body.templateVersion < 1 || body.templateVersion >= 2147483647)) fail('Некорректная версия формы клиента.');
  if (!Number.isSafeInteger(body.version) || body.version < 0 || body.version >= 2147483647) fail('Некорректная версия плана.');
  if (!Array.isArray(body.rows) || body.rows.length > 200) fail('В одном плане допускается до 200 строк.');
  const seen = new Set();
  const rows = body.rows.map((raw, index) => {
    const label = `строка ${index + 1}`;
    object(raw, label);
    keys(raw, ['id', 'driverId', 'vehicleId', 'departureTime', 'status', 'confirmed', 'requestCreated', 'arrived', 'tripCount', 'comment', 'clientFields', 'extraFields', 'reporting'], label);
    const id = uuid(raw.id, label);
    if (seen.has(id)) fail('Идентификаторы строк плана должны быть уникальными.');
    seen.add(id);
    const departureTime = raw.departureTime ?? '';
    if (typeof departureTime !== 'string' || (departureTime !== '' && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(departureTime))) fail(`Укажите время ЧЧ:ММ: ${label}.`);
    const status = raw.status ?? 'work';
    if (!STATUSES.includes(status)) fail(`Неизвестный статус: ${label}.`);
    const tripCount = raw.tripCount ?? 1;
    if (!Number.isSafeInteger(tripCount) || tripCount < 1 || tripCount > 999) fail(`Число рейсов должно быть целым от 1 до 999: ${label}.`);
    const fields = object(raw.clientFields ?? {}, `поля клиента, ${label}`);
    if (Object.keys(fields).length > 50) fail(`Допускается до 50 полей клиента: ${label}.`);
    const clientFields = Object.fromEntries(Object.entries(fields).map(([key, value]) => {
      if (!key || key.length > 100 || /[\u0000-\u001f]/.test(key) || ['__proto__', 'prototype', 'constructor'].includes(key)) fail(`Некорректное название поля клиента: ${label}.`);
      return [key, string(value, 2000, `поле клиента, ${label}`)];
    }));
    const reporting = reportingInput(raw.reporting, { vehicleId: raw.vehicleId, status });
    return {
      id, driverId: raw.driverId == null ? null : uuid(raw.driverId, 'водитель'),
      vehicleId: raw.vehicleId == null ? null : uuid(raw.vehicleId, 'автомобиль'),
      departureTime, status, tripCount,
      confirmed: boolean(raw.confirmed, 'выход подтверждён'),
      requestCreated: boolean(raw.requestCreated, 'заявка создана'),
      arrived: boolean(raw.arrived, 'прибыл'),
      comment: string(raw.comment ?? '', 2000, 'комментарий'), clientFields,
      extraFields: extraFieldsInput(raw.extraFields, label),
      ...(reporting === undefined ? {} : { reporting }),
    };
  });
  if (Buffer.byteLength(JSON.stringify(rows), 'utf8') > MAX_PLAN_BYTES) fail('План слишком большой. Сократите комментарии и поля клиента.');
  return { businessDate: date, responsibilityScopeId, templateId: body.templateId, ...(body.templateVersion === undefined ? {} : { templateVersion: body.templateVersion }), rows, version: body.version };
}
module.exports = { STATUSES, MAX_PLAN_BYTES, MAX_EXTRA_FIELDS, uuid, businessDate, planInput, object, keys, string, fail };
