// SPDX-License-Identifier: MIT
'use strict';
const { HttpException } = require('@nestjs/common');

// The endpoint is intentionally fixed: document bytes and credentials may never be
// redirected to an address supplied by a client or an environment variable.
const ENDPOINT = 'https://ai.api.cloud.yandex.net/ocr/v1/recognizeText';
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 20000;
const MODELS = Object.freeze({
  passport: 'passport',
  passport_registration: 'page',
  driver_license_front: 'driver-license-front',
  driver_license_back: 'driver-license-back',
  vehicle_registration_front: 'vehicle-registration-front',
  vehicle_registration_back: 'vehicle-registration-back',
  snils: 'page',
  other: 'page',
});
const FIELD_NAMES = Object.freeze({
  passport: ['name', 'middle_name', 'surname', 'gender', 'citizenship', 'birth_date', 'birth_place', 'number', 'issued_by', 'issue_date', 'subdivision', 'expiration_date'],
  'driver-license-front': ['name', 'middle_name', 'surname', 'number', 'birth_date', 'issue_date', 'expiration_date'],
  'driver-license-back': ['experience_from', 'number', 'issue_date', 'expiration_date', 'prev_number'],
  'vehicle-registration-front': ['stsfront_car_number', 'stsfront_vin_number', 'stsfront_car_brand', 'stsfront_car_model', 'stsfront_car_year', 'stsfront_car_chassis_number', 'stsfront_car_trailer_number', 'stsfront_car_color', 'stsfront_sts_number'],
  'vehicle-registration-back': ['stsback_car_owner', 'stsback_sts_number'],
  page: [],
});

class OcrError extends HttpException {
  constructor(code, message, status) { super({ code, message }, status); }
}
function error(code, message, status) { return new OcrError(code, message, status); }
function unavailable() { return error('ONBOARDING_OCR_UNAVAILABLE', 'Сервис распознавания временно недоступен. Повторите попытку позже или заполните поля вручную.', 503); }
function timedOut() { return error('ONBOARDING_OCR_TIMEOUT', 'Распознавание заняло слишком много времени. Повторите попытку или заполните поля вручную.', 504); }
function invalidResponse() { return error('ONBOARDING_OCR_RESPONSE', 'Не удалось обработать результат распознавания. Повторите попытку или заполните поля вручную.', 502); }
function credentials() {
  const apiKey = (process.env.YANDEX_OCR_API_KEY || '').trim();
  const folderId = (process.env.YANDEX_OCR_FOLDER_ID || '').trim();
  // Reject invalid header values before invoking fetch. Neither value is exposed.
  const valid = value => value.length > 0 && value.length <= 4096 && !/[\x00-\x20\x7f-\uffff]/.test(value);
  return valid(apiKey) && valid(folderId) ? { apiKey, folderId } : null;
}

function getOcrStatus() {
  return {
    provider: 'yandex',
    configured: Boolean(credentials()),
    maxBytes: MAX_BYTES,
    supportedMimeTypes: ['image/jpeg', 'image/png'],
    documentTypes: Object.keys(MODELS),
  };
}

function validateImage(buffer, mimeType) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw error('ONBOARDING_OCR_IMAGE', 'Загрузите фотографию документа.', 400);
  }
  if (buffer.length > MAX_BYTES) throw error('ONBOARDING_OCR_SIZE', 'Фотография должна быть не больше 10 МБ.', 413);
  const jpeg = mimeType === 'image/jpeg' && buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const png = mimeType === 'image/png' && buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (!jpeg && !png) throw error('ONBOARDING_OCR_FORMAT', 'Используйте фотографию в формате JPEG или PNG.', 400);
}

async function readResponse(response, controller) {
  // Bound the upstream response as well as the upload. Do not read an error body:
  // it can echo a document, authorization data, or unrelated provider diagnostics.
  if (Number(response.headers.get('content-length')) > MAX_RESPONSE_BYTES) throw invalidResponse();
  const reader = response.body?.getReader();
  if (!reader) throw invalidResponse();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) throw invalidResponse();
      chunks.push(Buffer.from(value));
    }
    try { return JSON.parse(Buffer.concat(chunks, size).toString('utf8')); }
    catch { throw invalidResponse(); }
  } finally {
    if (controller.signal.aborted || size > MAX_RESPONSE_BYTES) void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

function normalizeResult(payload, model) {
  // The AI Studio gateway wraps the API result; the REST schema also documents
  // the unwrapped form. Both contain the same textAnnotation object.
  const annotation = payload?.result?.textAnnotation || payload?.textAnnotation;
  if (!annotation || typeof annotation !== 'object' || Array.isArray(annotation)) throw invalidResponse();
  let text = annotation.fullText;
  if (text == null && Array.isArray(annotation.blocks)) {
    text = annotation.blocks.flatMap(block => Array.isArray(block?.lines) ? block.lines : [])
      .map(line => typeof line?.text === 'string' ? line.text : '').filter(Boolean).join('\n');
  }
  if (text != null && (typeof text !== 'string' || text.length > 100000)) throw invalidResponse();
  const fields = {};
  const allowed = new Set(FIELD_NAMES[model]);
  if (annotation.entities != null && !Array.isArray(annotation.entities)) throw invalidResponse();
  for (const entity of annotation.entities || []) {
    if (!allowed.has(entity?.name)) continue;
    if (typeof entity.text !== 'string' || entity.text.length > 2048) throw invalidResponse();
    if (entity.text.trim()) fields[entity.name] = entity.text.trim();
  }
  if (!String(text || '').trim() && Object.keys(fields).length === 0) {
    throw error('ONBOARDING_OCR_NO_TEXT', 'Текст не распознан. Сделайте более чёткое фото без бликов или заполните поля вручную.', 422);
  }
  return { text: (text || '').trim(), fields, model };
}

/** Server-only; options are internal test seams, never accepted from HTTP input. */
async function recognizeDocument({ buffer, mimeType, documentType } = {}, options = {}) {
  validateImage(buffer, mimeType);
  if (!Object.hasOwn(MODELS, documentType)) throw error('ONBOARDING_OCR_DOCUMENT_TYPE', 'Выберите тип документа для распознавания.', 400);
  const config = credentials();
  if (!config) throw error('ONBOARDING_OCR_NOT_CONFIGURED', 'Распознавание Яндекса ещё не подключено. Обратитесь к администратору или заполните поля вручную.', 503);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw unavailable();
  const timeoutMs = Number.isInteger(options.timeoutMs) && options.timeoutMs > 0
    ? Math.min(options.timeoutMs, TIMEOUT_MS) : TIMEOUT_MS;
  const controller = new AbortController();
  const model = MODELS[documentType];
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(timedOut()); }, timeoutMs);
  });
  try {
    const operation = (async () => {
      const response = await fetchImpl(ENDPOINT, {
        method: 'POST',
        redirect: 'error',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Api-Key ${config.apiKey}`,
          'x-folder-id': config.folderId,
          'x-data-logging-enabled': 'false',
        },
        body: JSON.stringify({ content: buffer.toString('base64'), mimeType: mimeType === 'image/jpeg' ? 'JPEG' : 'PNG', languageCodes: ['*'], model }),
      });
      if (!response.ok) {
        if ([400, 413, 415, 422].includes(response.status)) throw error('ONBOARDING_OCR_REJECTED', 'Сервис не смог обработать фотографию. Сделайте другое фото в формате JPEG или PNG размером до 20 мегапикселей.', 422);
        if ([401, 403].includes(response.status)) throw error('ONBOARDING_OCR_ACCESS', 'Нет доступа к сервису распознавания. Обратитесь к администратору или заполните поля вручную.', 503);
        if (response.status === 429) throw error('ONBOARDING_OCR_BUSY', 'Сервис распознавания перегружен. Повторите попытку позже или заполните поля вручную.', 503);
        throw unavailable();
      }
      return normalizeResult(await readResponse(response, controller), model);
    })();
    return await Promise.race([operation, timeout]);
  } catch (cause) {
    if (cause instanceof OcrError) throw cause;
    throw controller.signal.aborted ? timedOut() : unavailable();
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

module.exports = { recognizeDocument, getOcrStatus, MAX_BYTES };
