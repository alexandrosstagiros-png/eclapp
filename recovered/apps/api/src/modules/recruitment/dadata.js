// SPDX-License-Identifier: MIT
'use strict';
const { HttpException } = require('@nestjs/common');

// Official API: https://dadata.ru/api/find-party/ and /api/find-bank/.
// Only the user's lookup identifier is sent; credentials never leave the server
// except in the Authorization header to this fixed HTTPS origin.
const ORIGIN = 'https://suggestions.dadata.ru/suggestions/api/4_1/rs/findById/';
const MAX_RESPONSE_BYTES = 1024 * 1024;
const TIMEOUT_MS = 12000;
const issue = (code, message, status) => new HttpException({ code, message }, status);
const invalid = () => issue('DADATA_RESPONSE', 'Не удалось прочитать реквизиты DaData. Повторите поиск или заполните их вручную.', 502);
function token() {
  const value = (process.env.DADATA_API_KEY || '').trim();
  return /^[A-Za-z0-9_-]{16,256}$/.test(value) ? value : null;
}
function status() { return { provider: 'dadata', configured: Boolean(token()) }; }
function lookupQuery(value, kind) {
  if (typeof value !== 'string' || value.length > 40) throw issue('DADATA_QUERY', 'Укажите ИНН или ОГРН перевозчика.', 400);
  const query = value.replace(/\s/g, '');
  if (kind === 'bank') {
    if (!/^\d{9}$/.test(query)) throw issue('DADATA_QUERY', 'БИК должен содержать 9 цифр.', 400);
  } else if (kind !== 'party' || !/^(?:\d{10}|\d{12}|\d{13}|\d{15})$/.test(query)) {
    throw issue('DADATA_QUERY', 'Введите ИНН из 10 или 12 цифр либо ОГРН из 13 или 15 цифр.', 400);
  }
  return query;
}
const text = (value, max = 1000) => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '';
function normalize(payload, kind) {
  if (!payload || !Array.isArray(payload.suggestions) || payload.suggestions.length > 300) throw invalid();
  return payload.suggestions.slice(0, 10).map((item, index) => {
    if (!item || typeof item !== 'object' || !item.data || typeof item.data !== 'object') throw invalid();
    const data = item.data;
    let values;
    if (kind === 'bank') {
      if (!/^\d{9}$/.test(data.bic || '')) throw invalid();
      values = {
        carrier_bank: text(data.name?.payment || data.name?.short || item.value),
        carrier_bik: data.bic,
        carrier_correspondent_account: /^\d{20}$/.test(data.correspondent_account || '') ? data.correspondent_account : '',
      };
    } else {
      if (!['LEGAL', 'INDIVIDUAL'].includes(data.type) || !/^(?:\d{10}|\d{12})$/.test(data.inn || '')) throw invalid();
      const individual = data.type === 'INDIVIDUAL';
      const fio = [data.fio?.surname, data.fio?.name, data.fio?.patronymic].map(value => text(value)).filter(Boolean).join(' ');
      values = {
        carrier_type: individual ? 'ИП' : text(data.opf?.short) || 'Юридическое лицо',
        carrier_name: text(data.name?.full_with_opf || item.unrestricted_value || item.value),
        carrier_inn: data.inn,
        carrier_kpp: individual ? '' : /^\d{9}$/.test(data.kpp || '') ? data.kpp : '',
        carrier_ogrn: /^(?:\d{13}|\d{15})$/.test(data.ogrn || '') ? data.ogrn : '',
        carrier_address: text(data.address?.unrestricted_value || data.address?.value, 4000),
        carrier_signer_name: individual ? fio : text(data.management?.name),
        carrier_signer_title: individual ? 'Индивидуальный предприниматель' : text(data.management?.post),
        // A registry lookup does not establish the authority of the person who
        // will actually sign the contract. Do not invent a charter/proxy here.
        carrier_signer_basis: '',
      };
    }
    return {
      id: `${kind}:${kind === 'bank' ? data.bic : data.inn}:${text(data.kpp)}:${index}`,
      label: text(item.value || item.unrestricted_value || values.carrier_name || values.carrier_bank),
      status: text(data.state?.status, 40),
      values,
    };
  });
}
async function readResponse(response) {
  if (Number(response.headers.get('content-length')) > MAX_RESPONSE_BYTES) throw invalid();
  const reader = response.body?.getReader();
  if (!reader) throw invalid();
  const parts = [];
  let size = 0, complete = false;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) { complete = true; break; }
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) throw invalid();
      parts.push(Buffer.from(value));
    }
    try { return JSON.parse(Buffer.concat(parts, size).toString('utf8')); } catch { throw invalid(); }
  } finally {
    if (!complete) await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
async function lookup(kind, value, { fetchImpl = globalThis.fetch, timeoutMs = TIMEOUT_MS } = {}) {
  const query = lookupQuery(value, kind), key = token();
  if (!key) throw issue('DADATA_NOT_CONFIGURED', 'Автозаполнение DaData пока не подключено. Реквизиты можно заполнить вручную.', 503);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref?.();
  try {
    const response = await fetchImpl(ORIGIN + kind, {
      method: 'POST', redirect: 'error', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Token ${key}` },
      body: JSON.stringify({ query, count: 10, ...(kind === 'party' ? { branch_type: 'MAIN' } : {}) }),
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      if ([401, 403].includes(response.status)) throw issue('DADATA_ACCESS', 'DaData отклонила доступ. Проверьте подключение сервиса или заполните реквизиты вручную.', 503);
      if (response.status === 429) throw issue('DADATA_LIMIT', 'Лимит запросов DaData исчерпан. Повторите позже или заполните реквизиты вручную.', 503);
      throw issue('DADATA_UNAVAILABLE', 'DaData временно недоступна. Повторите поиск или заполните реквизиты вручную.', 503);
    }
    const suggestions = normalize(await readResponse(response), kind);
    return { ...status(), suggestions };
  } catch (error) {
    if (controller.signal.aborted) throw issue('DADATA_TIMEOUT', 'DaData не ответила вовремя. Повторите поиск или заполните реквизиты вручную.', 504);
    if (error instanceof HttpException) throw error;
    // Upstream messages and fetch errors may contain credentials or query data.
    throw issue('DADATA_UNAVAILABLE', 'DaData временно недоступна. Повторите поиск или заполните реквизиты вручную.', 503);
  } finally { clearTimeout(timer); }
}
module.exports = { lookup, lookupQuery, normalize, status };
