// SPDX-License-Identifier: MIT
'use strict';
const { HttpException } = require('@nestjs/common');
const vk = require('./vk-ocr');
const yandex = require('./yandex-ocr');

// Switching clouds is an explicit server setting, never an automatic fallback:
// a failed request must not send a candidate's document to a second provider.
function selected() {
  const provider = (process.env.ONBOARDING_OCR_PROVIDER || 'vk').trim().toLowerCase();
  return provider === 'vk' ? vk : provider === 'yandex' ? yandex : null;
}
function getOcrStatus() {
  return selected()?.getOcrStatus() || { provider: 'unsupported', configured: false, maxBytes: vk.MAX_BYTES, supportedMimeTypes: ['image/jpeg', 'image/png'], documentTypes: [] };
}
async function recognizeDocument(input, options) {
  const adapter = selected();
  if (!adapter) throw new HttpException({ code: 'ONBOARDING_OCR_NOT_CONFIGURED', message: 'Провайдер распознавания не настроен. Обратитесь к администратору или заполните поля вручную.' }, 503);
  return adapter.recognizeDocument(input, options);
}
module.exports = { recognizeDocument, getOcrStatus, MAX_BYTES: vk.MAX_BYTES };
