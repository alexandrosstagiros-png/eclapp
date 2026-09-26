"use strict";
const { uuid, object, keys, string, fail, businessDate } = require('./planning-input');
const { SOURCES, sourceOwner } = require('./planning-sources');
const SAFE_KEY = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/;
function defaultValueInput(value, type) {
  const result = string(value ?? '', 2000, 'значение по умолчанию');
  if (result === '') return result;
  if (type === 'date') businessDate(result);
  if (type === 'time' && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(result)) fail('Значение времени по умолчанию должно быть в формате ЧЧ:ММ.');
  if (type === 'number' && (!/^[-+]?(?:\d+\.?\d*|\.\d+)$/.test(result) || !Number.isFinite(Number(result)))) fail('Значение по умолчанию должно быть числом с точкой в качестве десятичного разделителя.');
  return result;
}
function key(value, label) {
  if (typeof value !== 'string' || !SAFE_KEY.test(value) || ['__proto__', 'prototype', 'constructor'].includes(value)) fail(`Некорректное поле «${label}».`);
  return value;
}
function label(value, title) {
  const result = string(value, 120, title).trim();
  if (!result) fail(`Заполните поле «${title}».`);
  return result;
}
function definitionInput(raw) {
  object(raw, 'форма клиента');
  keys(raw, ['label', 'kind', 'sections'], 'форма клиента');
  if (!['table', 'text'].includes(raw.kind)) fail('Выберите табличную или текстовую форму.');
  if (!Array.isArray(raw.sections) || raw.sections.length < 1 || raw.sections.length > 6) fail('В форме допускается от 1 до 6 разделов.');
  const sectionsSeen = new Set(), columnsSeen = new Set();
  const sections = raw.sections.map(section => {
    object(section, 'раздел');
    keys(section, ['id', 'label', 'columns'], 'раздел');
    const id = key(section.id, 'идентификатор раздела');
    if (sectionsSeen.has(id)) fail('Идентификаторы разделов должны быть уникальными.');
    sectionsSeen.add(id);
    if (!Array.isArray(section.columns) || section.columns.length < 1 || section.columns.length > 50) fail('В каждом разделе нужна хотя бы одна колонка; во всей форме — не более 50.');
    const columns = section.columns.map(column => {
      object(column, 'колонка');
      keys(column, ['key', 'label', 'type', 'source', 'owner', 'required', 'defaultValue', 'hint'], 'колонка');
      const columnKey = key(column.key, 'ключ колонки');
      if (columnsSeen.has(columnKey)) fail('Ключи колонок должны быть уникальными во всей форме.');
      columnsSeen.add(columnKey);
      if (columnsSeen.size > 50) fail('В форме допускается до 50 колонок.');
      if (!['text', 'number', 'date', 'time'].includes(column.type)) fail('Неизвестный тип колонки.');
      if (!SOURCES.has(column.source)) fail('Неизвестный источник подстановки.');
      if (!['assignment', 'driver', 'vehicle'].includes(column.owner)) fail('Неизвестная принадлежность поля.');
      if (column.source !== 'manual' && column.owner !== sourceOwner(column.source)) fail('Принадлежность поля должна соответствовать источнику подстановки.');
      if (typeof column.required !== 'boolean') fail('Укажите обязательность поля.');
      return { key: columnKey, label: label(column.label, 'название колонки'), type: column.type, source: column.source,
        owner: column.owner, required: column.required,
        defaultValue: defaultValueInput(column.defaultValue, column.type), hint: string(column.hint ?? '', 200, 'подсказка') };
    });
    return { id, label: label(section.label, 'название раздела'), columns };
  });
  return { label: label(raw.label, 'название формы'), kind: raw.kind, sections };
}
function templateInput(body) {
  object(body, 'сохранение формы');
  keys(body, ['responsibilityScopeId', 'id', 'version', 'definition', 'makeDefault'], 'сохранение формы');
  if (!Number.isSafeInteger(body.version) || body.version < 0 || body.version >= 2147483646) fail('Некорректная версия формы клиента.');
  if (typeof body.makeDefault !== 'boolean') fail('Укажите, использовать ли форму по умолчанию.');
  return { responsibilityScopeId: uuid(body.responsibilityScopeId, 'область работы'), id: uuid(body.id, 'идентификатор формы'),
    version: body.version, definition: definitionInput(body.definition), makeDefault: body.makeDefault };
}
module.exports = { SOURCES, sourceOwner, definitionInput, templateInput };
