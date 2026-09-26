// SPDX-License-Identifier: MIT
'use strict';
const { PayloadTooLargeException } = require('@nestjs/common');
const { fail, uuid, string, choice, date, phone } = require('./recruitment-input');
const DOCUMENT_TYPES = ['passport','passport_registration','driver_license_front','driver_license_back','vehicle_registration_front','vehicle_registration_back','snils','other'];
const MAX_BYTES = 10 * 1024 * 1024;
function object(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype,null].includes(Object.getPrototypeOf(value))) fail();
  return value;
}
function fieldsOnly(body, allowed) {
  object(body);
  if (Object.keys(body).some(key => !allowed.includes(key))) fail('Запрос содержит неизвестные поля. Обновите страницу.');
}
function version(value) {
  if (!Number.isSafeInteger(value) || value < 0 || value >= 2147483646) fail('Обновите версию формы.');
  return value;
}
function key(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(value) || ['__proto__','constructor','prototype'].includes(value)) fail('Недопустимый идентификатор поля.');
  return value;
}
function bool(value) { if (typeof value !== 'boolean') fail('Проверьте настройки обязательности.'); return value; }
function templateInput(body) {
  object(body);
  if (!Array.isArray(body.fields) || body.fields.length > 60 || !Array.isArray(body.documents) || body.documents.length > 20) fail('В форме допустимо до 60 полей и 20 документов.');
  const fields = body.fields.map(field => {
    object(field);
    const result = { id:key(field.id), label:string(field.label,160,'название поля',true), type:choice(field.type,['text','textarea','date','tel','select'],'тип поля'), required:bool(field.required) };
    if (field.options != null && (!Array.isArray(field.options) || field.options.length > 50)) fail('В списке допустимо до 50 вариантов.');
    result.options = (field.options || []).map(item => string(item,160,'вариант',true));
    if (result.type === 'select' && (!result.options.length || new Set(result.options).size !== result.options.length)) fail('Укажите уникальные варианты списка.');
    result.ocrKey = field.ocrKey ? key(field.ocrKey) : '';
    return result;
  });
  const documents = body.documents.map(doc => { object(doc); return { id:key(doc.id), label:string(doc.label,160,'название документа',true), type:choice(doc.type,DOCUMENT_TYPES,'тип документа'), required:bool(doc.required) }; });
  if (new Set(fields.map(f=>f.id)).size !== fields.length || new Set(documents.map(d=>d.id)).size !== documents.length) fail('Идентификаторы полей и документов должны быть уникальными.');
  if (!fields.length && !documents.length) fail('Добавьте хотя бы одно поле или документ.');
  return { id:uuid(body.id),version:version(body.version),responsibilityScopeId:uuid(body.responsibilityScopeId),
    name:string(body.name,160,'название формы',true),destination:string(body.destination,160,'направление оформления',true),
    employmentType:choice(body.employmentType,['employee','ip','self_employed'],'тип оформления'),
    description:string(body.description,4000,'описание'),privacyNotice:string(body.privacyNotice,8000,'информация об обработке данных'),
    active:bool(body.active),fields,documents };
}
function valuesInput(input, template, complete = false) {
  object(input);
  if (Object.keys(input).some(id => !template.fields.some(f=>f.id===id))) fail('В анкете есть поля из другой версии формы.');
  const result = {};
  for (const field of template.fields) {
    const value = string(input[field.id],field.type==='textarea'?4000:1000,field.label,complete && field.required);
    if (value && field.type === 'select' && !field.options.includes(value)) fail(`Выберите значение поля «${field.label}».`);
    if (value && field.type === 'date') date(value,true);
    if (value && field.type === 'tel') phone(value);
    result[field.id] = value;
  }
  return result;
}
function imageInput(body) {
  object(body);
  const mimeType = choice(body.mimeType,['image/jpeg','image/png'],'формат фотографии');
  if (typeof body.base64 !== 'string' || !body.base64.length) fail('Выберите фотографию.');
  if (body.base64.length > Math.ceil(MAX_BYTES/3)*4) throw new PayloadTooLargeException();
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(body.base64) || body.base64.length%4!==0) fail('Некорректный файл фотографии.');
  const buffer = Buffer.from(body.base64,'base64');
  if (!buffer.length || buffer.length > MAX_BYTES || buffer.toString('base64')!==body.base64) fail('Некорректный файл фотографии.');
  const png = buffer.length>=24 && buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && buffer.subarray(12,16).toString()==='IHDR';
  const jpeg = buffer.length>=4 && buffer[0]===255 && buffer[1]===216 && buffer[2]===255;
  if (!(mimeType==='image/png'?png:jpeg)) fail('Файл не соответствует формату JPEG или PNG.');
  if (png) { const w=buffer.readUInt32BE(16),h=buffer.readUInt32BE(20); if (!w || !h || w*h>20000000) fail('Фотография должна содержать не более 20 мегапикселей.'); }
  return { documentId:key(body.documentId),mimeType,buffer };
}
module.exports={DOCUMENT_TYPES,MAX_BYTES,object,fieldsOnly,version,templateInput,valuesInput,imageInput};
