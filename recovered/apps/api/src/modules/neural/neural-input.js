// SPDX-License-Identifier: MIT
'use strict';
const { BadRequestException } = require('@nestjs/common');
const TASKS = Object.freeze(['conversation_summary', 'work_order_prices', 'finance_classification']);
const PROVIDERS = Object.freeze({
  openai: { name: 'OpenAI', keyEnv: 'OPENAI_API_KEY', models: ['gpt-6-sol', 'gpt-6-luna', 'gpt-6-astra'] },
  anthropic: { name: 'Anthropic', keyEnv: 'ANTHROPIC_API_KEY', models: ['claude-sonnet-5', 'claude-haiku-4-5', 'claude-opus-5-5'] },
  qwen: { name: 'Qwen', keyEnv: 'DASHSCOPE_API_KEY', models: ['qwen-plus', 'qwen-flash', 'qwen3.8-max'] },
  glm: { name: 'GLM', keyEnv: 'ZHIPU_API_KEY', models: ['glm-5.3', 'glm-4.7'] },
  yandex: { name: 'Яндекс', keyEnv: 'YANDEX_API_KEY', models: ['yandexgpt/latest', 'yandexgpt-lite/latest'] },
});
function fail(message = 'Проверьте настройки нейросетей.') { throw new BadRequestException({ code: 'NEURAL_VALIDATION', message }); }
function object(value, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![null, Object.prototype].includes(Object.getPrototypeOf(value)) || Object.keys(value).some(key => !fields.includes(key))) fail('Переданы неизвестные поля настроек.');
}
function uuid(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value)) fail('Выберите область работы.');
  return value.toLowerCase();
}
function text(value, limit, label) {
  if (typeof value !== 'string' || !value.trim() || value.length > limit || /[\u0000-\u001f\u007f]/.test(value)) fail(`Проверьте поле «${label}».`);
  return value.trim();
}
function rate(value) {
  if (value == null || value === '') return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1000000) fail('Тариф должен быть числом от 0 до 1 000 000 за миллион токенов.');
  return value;
}
function settingsInput(body) {
  object(body, ['responsibilityScopeId', 'profiles', 'tasks']);
  if (!Array.isArray(body.profiles) || body.profiles.length > 30) fail('Можно настроить до 30 профилей моделей.');
  const ids = new Set();
  const profiles = body.profiles.map(profile => {
    object(profile, ['id', 'name', 'provider', 'model', 'enabled', 'inputPricePerMillion', 'outputPricePerMillion', 'cachedInputPricePerMillion', 'cacheWritePricePerMillion', 'currency', 'maxOutputTokens', 'region', 'folderId']);
    const id = text(profile.id, 80, 'ID профиля');
    if (!/^[a-zA-Z0-9_-]+$/.test(id) || ids.has(id)) fail('Профили должны иметь разные ID из букв, цифр, дефисов и подчёркиваний.');
    ids.add(id);
    if (!Object.hasOwn(PROVIDERS, profile.provider)) fail('Выберите поддерживаемого провайдера.');
    const enabled = profile.enabled === undefined ? true : profile.enabled;
    if (typeof enabled !== 'boolean') fail('Некорректный статус профиля.');
    const model = text(profile.model, 240, 'модель');
    if (!/^[a-zA-Z0-9_./:@+-]+$/.test(model)) fail('Укажите идентификатор модели из API провайдера.');
    const maxOutputTokens = profile.maxOutputTokens ?? 4096;
    if (!Number.isInteger(maxOutputTokens) || maxOutputTokens < 128 || maxOutputTokens > 32768) fail('Лимит ответа должен быть от 128 до 32 768 токенов.');
    const currency = profile.currency || (profile.provider === 'yandex' ? 'RUB' : 'USD');
    if (!['USD', 'RUB', 'CNY'].includes(currency)) fail('Выберите USD, RUB или CNY.');
    const region = profile.region || 'international';
    if (!['international', 'china'].includes(region)) fail('Выберите регион провайдера.');
    const folderId = profile.folderId || '';
    if (typeof folderId !== 'string' || folderId.length > 80 || (folderId && !/^[a-zA-Z0-9_-]+$/.test(folderId))) fail('Проверьте ID каталога Яндекс Cloud.');
    return { id, name: text(profile.name, 120, 'название профиля'), provider: profile.provider, model, enabled, currency, maxOutputTokens, region, folderId,
      inputPricePerMillion: rate(profile.inputPricePerMillion), outputPricePerMillion: rate(profile.outputPricePerMillion), cachedInputPricePerMillion: rate(profile.cachedInputPricePerMillion), cacheWritePricePerMillion: rate(profile.cacheWritePricePerMillion) };
  });
  object(body.tasks, TASKS);
  const tasks = Object.fromEntries(TASKS.map(task => {
    const selected = body.tasks[task] ?? null;
    if (selected !== null && (typeof selected !== 'string' || !ids.has(selected))) fail('Для каждой задачи выберите существующий профиль либо локальный режим.');
    return [task, selected];
  }));
  return { responsibilityScopeId: uuid(body.responsibilityScopeId), profiles, tasks };
}
function reportRange(query, now = new Date()) {
  object(query, ['responsibilityScopeId', 'from', 'to']);
  const parse = (value, end) => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value) || !Number.isFinite(Date.parse(value))) fail('Укажите корректный период отчёта.');
    const date = new Date(value);
    if (value.length === 10 && date.toISOString().slice(0, 10) !== value) fail('Укажите существующую дату.');
    if (end && value.length === 10) date.setUTCDate(date.getUTCDate() + 1);
    return date;
  };
  const to = query.to ? parse(query.to, true) : now;
  const from = query.from ? parse(query.from, false) : new Date(to.getTime() - 30 * 86400000);
  if (to <= from || to - from > 366 * 86400000) fail('Период должен быть от одного дня до 366 дней.');
  return { responsibilityScopeId: uuid(query.responsibilityScopeId), from: from.toISOString(), to: to.toISOString() };
}
module.exports = { TASKS, PROVIDERS, fail, uuid, settingsInput, reportRange };
