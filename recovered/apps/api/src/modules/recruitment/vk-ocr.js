// SPDX-License-Identifier: MIT
'use strict';
const { HttpException } = require('@nestjs/common');
const { Blob } = require('node:buffer');

// Verified against vk-cs/docs-public, docs/ru/ml/vision/instructions, 2026-09-26.
const HOST = 'https://smarty.mail.ru';
const MAX_BYTES = 10 * 1024 * 1024; // Our upload limit is stricter than VK's 15 MB.
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 20000;
const DOCUMENT_TYPES = ['passport','passport_registration','driver_license_front','driver_license_back','vehicle_registration_front','vehicle_registration_back','snils','other'];
const PASSPORT_FIELDS = {
  first_name: ['name','Имя'], last_name: ['surname','Фамилия'], middle_name: ['middle_name','Отчество'],
  birthday: ['birth_date','Дата рождения'], birthplace: ['birth_place','Место рождения'],
  date_of_issue: ['issue_date','Дата выдачи'], place_of_issue: ['issued_by','Кем выдан'],
  code_of_issue: ['subdivision','Код подразделения'], sex: ['gender','Пол'],
  series_number: ['series','Серия'], number: ['document_number','Номер'],
};
class OcrError extends HttpException { constructor(code, message, status) { super({ code, message }, status); } }
const error = (code, message, status) => new OcrError(code, message, status);
const unavailable = () => error('ONBOARDING_OCR_UNAVAILABLE','Сервис VK Cloud временно недоступен. Повторите попытку позже или заполните поля вручную.',503);
const timedOut = () => error('ONBOARDING_OCR_TIMEOUT','Распознавание заняло слишком много времени. Повторите попытку или заполните поля вручную.',504);
const invalidResponse = () => error('ONBOARDING_OCR_RESPONSE','Не удалось обработать результат распознавания VK Cloud. Повторите попытку или заполните поля вручную.',502);
const noText = () => error('ONBOARDING_OCR_NO_TEXT','Текст не распознан. Сделайте более чёткое фото без бликов или заполните поля вручную.',422);
function token() {
  const value = (process.env.VK_OCR_TOKEN || '').trim();
  return value.length > 0 && value.length <= 4096 && !/[\x00-\x20\x7f-\uffff]/.test(value) ? value : null;
}
function getOcrStatus() {
  return { provider:'vk', configured:Boolean(token()), maxBytes:MAX_BYTES, supportedMimeTypes:['image/jpeg','image/png'],
    documentTypes:[...DOCUMENT_TYPES], fieldsDocumentTypes:['passport'], minWidth:5, minHeight:5, maxWidth:3840, maxHeight:2160 };
}

function dimensions(buffer, mimeType) {
  if (mimeType === 'image/png') {
    if (buffer.length < 24 || !buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) || buffer.subarray(12,16).toString() !== 'IHDR') return null;
    return { width:buffer.readUInt32BE(16), height:buffer.readUInt32BE(20) };
  }
  if (mimeType !== 'image/jpeg' || buffer.length < 4 || buffer[0] !== 255 || buffer[1] !== 216) return null;
  let offset = 2;
  while (offset < buffer.length) {
    if (buffer[offset++] !== 255) return null;
    while (offset < buffer.length && buffer[offset] === 255) offset++;
    if (offset >= buffer.length) return null;
    const marker = buffer[offset++];
    if (marker === 0xd9 || marker === 0xda || marker === 0x00) return null;
    if (marker === 0x01 || marker >= 0xd0 && marker <= 0xd7) continue;
    if (offset + 2 > buffer.length) return null;
    const length = buffer.readUInt16BE(offset);
    if (length < 2 || offset + length > buffer.length) return null;
    if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)) {
      if (length < 8) return null;
      return { height:buffer.readUInt16BE(offset+3), width:buffer.readUInt16BE(offset+5) };
    }
    offset += length;
  }
  return null;
}
function validateImage(buffer,mimeType) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw error('ONBOARDING_OCR_IMAGE','Загрузите фотографию документа.',400);
  if (buffer.length > MAX_BYTES) throw error('ONBOARDING_OCR_SIZE','Фотография должна быть не больше 10 МБ.',413);
  const size = dimensions(buffer,mimeType);
  if (!size) throw error('ONBOARDING_OCR_FORMAT','Используйте корректную фотографию в формате JPEG или PNG.',400);
  if (size.width < 5 || size.height < 5 || size.width > 3840 || size.height > 2160) {
    throw error('ONBOARDING_OCR_DIMENSIONS','Для VK Cloud уменьшите фотографию: ширина от 5 до 3840 пикселей, высота от 5 до 2160 пикселей.',400);
  }
}
function statusError(status) {
  if ([400,413,415,422].includes(status)) return error('ONBOARDING_OCR_REJECTED','VK Cloud не смог обработать фотографию. Сделайте другое фото документа или заполните поля вручную.',422);
  if ([401,403].includes(status)) return error('ONBOARDING_OCR_ACCESS','Нет доступа к VK Cloud Vision. Обратитесь к администратору или заполните поля вручную.',503);
  if (status === 429) return error('ONBOARDING_OCR_BUSY','VK Cloud временно ограничил распознавание. Повторите попытку позже.',503);
  return unavailable();
}
async function readResponse(response,controller) {
  if (Number(response.headers.get('content-length')) > MAX_RESPONSE_BYTES) throw invalidResponse();
  const reader = response.body?.getReader();
  if (!reader) throw invalidResponse();
  const chunks = []; let size = 0;
  try {
    while (true) {
      const {value,done} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) throw invalidResponse();
      chunks.push(Buffer.from(value));
    }
    try { return JSON.parse(Buffer.concat(chunks,size).toString('utf8')); } catch { throw invalidResponse(); }
  } finally {
    if (controller.signal.aborted || size > MAX_RESPONSE_BYTES) void reader.cancel().catch(()=>{});
    reader.releaseLock();
  }
}
function normalize(payload,passport) {
  if (!payload || typeof payload !== 'object' || !Number.isInteger(payload.status)) throw invalidResponse();
  if (payload.status !== 200) throw statusError(payload.status);
  const objects = payload.body?.objects;
  if (!Array.isArray(objects) || objects.length !== 1 || objects[0]?.name !== 'file') throw invalidResponse();
  const result = objects[0];
  if (result.status === 1) throw statusError(422);
  if (result.status === 2) throw unavailable();
  if (result.status !== 0) throw invalidResponse();
  if (!passport) {
    if (typeof result.text !== 'string' || result.text.length > 100000) throw invalidResponse();
    if (!result.text.trim()) throw noText();
    return {text:result.text.trim(),fields:{},model:'vk-text'};
  }
  if (!result.labels || typeof result.labels !== 'object' || Array.isArray(result.labels)) throw invalidResponse();
  const fields = {}, lines = [];
  for (const [source,[target,label]] of Object.entries(PASSPORT_FIELDS)) {
    const parts = result.labels[source];
    if (parts == null) continue;
    if (!Array.isArray(parts) || parts.length > 200 || parts.some(value=>typeof value !== 'string' || value.length > 2048)) throw invalidResponse();
    const value = parts.map(item=>item.trim()).filter(Boolean).join(' ');
    if (value.length > 2048) throw invalidResponse();
    if (value) { fields[target] = value; lines.push(`${label}: ${value}`); }
  }
  // Keep the existing form key `number` as a complete passport number. Preserve
  // its components for forms which deliberately use separate fields.
  if (fields.document_number) fields.number = [fields.series,fields.document_number].filter(Boolean).join(' ');
  if (fields.surname && fields.name) fields.full_name = [fields.surname,fields.name,fields.middle_name].filter(Boolean).join(' ');
  if (!lines.length) throw noText();
  return {text:lines.join('\n'),fields,model:'vk-docs'};
}

/** options are internal test seams, never HTTP input. No paid automatic retries. */
async function recognizeDocument({buffer,mimeType,documentType} = {},options = {}) {
  validateImage(buffer,mimeType);
  if (!DOCUMENT_TYPES.includes(documentType)) throw error('ONBOARDING_OCR_DOCUMENT_TYPE','Выберите тип документа для распознавания.',400);
  const accessToken = token();
  if (!accessToken) throw error('ONBOARDING_OCR_NOT_CONFIGURED','VK Cloud Vision ещё не подключён. Обратитесь к администратору или заполните поля вручную.',503);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw unavailable();
  const passport = documentType === 'passport';
  const url = new URL(passport ? '/api/v1/docs/recognize' : '/api/v1/text/recognize', HOST);
  // VK's documented authentication uses query parameters. Never log this URL,
  // propagate network errors, or pass it to the browser; disable URL tracing.
  url.searchParams.set('oauth_token',accessToken);
  url.searchParams.set('oauth_provider','mcs');
  const form = new FormData();
  form.append('file',new Blob([buffer],{type:mimeType}),mimeType==='image/jpeg'?'document.jpg':'document.png');
  form.append('meta',JSON.stringify({images:[{name:'file'}]}));
  const controller = new AbortController();
  const timeoutMs = Number.isInteger(options.timeoutMs) && options.timeoutMs > 0 ? Math.min(options.timeoutMs,TIMEOUT_MS) : TIMEOUT_MS;
  let timer;
  const timeout = new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(timedOut());},timeoutMs);});
  try {
    const operation = (async()=>{
      const response = await fetchImpl(url.toString(),{method:'POST',redirect:'error',signal:controller.signal,headers:{Accept:'application/json'},body:form});
      if (!response.ok) throw statusError(response.status); // Never read error bodies.
      return normalize(await readResponse(response,controller),passport);
    })();
    return await Promise.race([operation,timeout]);
  } catch (cause) {
    if (cause instanceof OcrError) throw cause;
    throw controller.signal.aborted ? timedOut() : unavailable();
  } finally { clearTimeout(timer);controller.abort(); }
}
module.exports = {recognizeDocument,getOcrStatus,MAX_BYTES};
