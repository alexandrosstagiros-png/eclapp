'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { callProvider, estimatedCost, providerUsage, requestFor } = require('../recovered/apps/api/src/modules/neural/neural-providers');
const { settingsInput, reportRange } = require('../recovered/apps/api/src/modules/neural/neural-input');
const profile = { id: 'main', name: 'Test', provider: 'openai', model: 'test-model', enabled: true, currency: 'USD', maxOutputTokens: 4096, region: 'international', inputPricePerMillion: 2, outputPricePerMillion: 8, cachedInputPricePerMillion: 0.2 };
const env = { OPENAI_API_KEY: 'fake-openai', ANTHROPIC_API_KEY: 'fake-anthropic', DASHSCOPE_API_KEY: 'fake-qwen', ZHIPU_API_KEY: 'fake-glm', YANDEX_API_KEY: 'fake-yandex', YANDEX_FOLDER_ID: 'test-folder' };
const request = { system: 'System instructions', prompt: 'Synthetic data only' };
test('each provider sends its documented wire protocol and records returned usage', async t => {
  for (const provider of ['openai', 'anthropic', 'qwen', 'glm', 'yandex']) await t.test(provider, async () => {
    let sent;
    const payload = provider === 'anthropic' ? { content: [{ type: 'thinking', thinking: 'hidden' }, { type: 'text', text: 'Answer' }], stop_reason: 'end_turn', usage: { input_tokens: 80, cache_read_input_tokens: 20, output_tokens: 10 } }
      : provider === 'yandex' ? { result: { alternatives: [{ message: { text: 'Answer' }, status: 'ALTERNATIVE_STATUS_FINAL' }], usage: { inputTextTokens: '100', completionTokens: '10' } } }
        : { choices: [{ message: { content: 'Answer' }, finish_reason: 'stop' }], usage: { prompt_tokens: 100, completion_tokens: 10, prompt_tokens_details: { cached_tokens: 20 } } };
    const result = await callProvider({ ...profile, provider }, request, { env, fetchImpl: async (url, options) => { sent = { url, options, body: JSON.parse(options.body) }; return new Response(JSON.stringify(payload)); } });
    assert.equal(result.text, 'Answer'); assert.equal(result.inputTokens, 100); assert.equal(result.outputTokens, 10);
    assert.equal(sent.options.redirect, 'error'); assert.ok(sent.options.signal); assert.equal(sent.body.stream ?? sent.body.completionOptions.stream, false);
    if (provider === 'anthropic') { assert.equal(sent.options.headers['x-api-key'], 'fake-anthropic'); assert.equal(sent.body.system, request.system); assert.equal(sent.body.max_tokens, 4096); }
    else if (provider === 'yandex') { assert.equal(sent.options.headers.authorization, 'Api-Key fake-yandex'); assert.equal(sent.body.modelUri, 'gpt://test-folder/test-model'); assert.equal(sent.body.messages[1].text, request.prompt); assert.equal(sent.body.completionOptions.maxTokens, '4096'); }
    else { assert.equal(sent.body.messages[1].content, request.prompt); assert.equal(sent.body.model, 'test-model'); }
    if (provider === 'openai') { assert.equal(sent.body.max_completion_tokens, 4096); assert.equal(sent.body.store, false); assert.equal(sent.body.max_tokens, undefined); }
    if (provider === 'qwen') assert.equal(sent.url, 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions');
    if (provider === 'glm') assert.equal(sent.url, 'https://api.z.ai/api/paas/v4/chat/completions');
  });
});
test('cost estimates use returned tokens, cache tariffs and explicit currencies without inventing usage or rates', () => {
  const usage = providerUsage('openai', { usage: { prompt_tokens: 1000, completion_tokens: 100, prompt_tokens_details: { cached_tokens: 200 } } });
  assert.equal(estimatedCost(profile, usage), 0.00244);
  assert.equal(estimatedCost({ ...profile, inputPricePerMillion: null }, usage), null);
  assert.equal(estimatedCost({ ...profile, cachedInputPricePerMillion: null }, usage), null);
  assert.equal(estimatedCost(profile, providerUsage('openai', {})), null);
  assert.equal(estimatedCost(profile, providerUsage('anthropic', { usage: { input_tokens: 100, cache_creation_input_tokens: 50, output_tokens: 20 } })), null);
  const written = providerUsage('openai', { usage: { prompt_tokens: 1000, completion_tokens: 100, prompt_tokens_details: { cached_tokens: 200, cache_write_tokens: 300 } } });
  assert.equal(estimatedCost(profile, written), null);
  assert.equal(estimatedCost({ ...profile, cacheWritePricePerMillion: 2.5 }, written), 0.00259);
  assert.equal(estimatedCost({ ...profile, cacheWritePricePerMillion: 2.5 }, providerUsage('anthropic', { usage: { input_tokens: 100, cache_creation_input_tokens: 50, output_tokens: 20 } })), 0.000485);
});
test('provider failures redact their body, keep usage on truncated answers and never retry paid requests', async () => {
  let calls = 0;
  const invoke = response => callProvider(profile, request, { env, fetchImpl: async () => { calls++; return response; } });
  await assert.rejects(invoke(new Response(JSON.stringify({ error: { message: 'secret-token original-private-prompt' } }), { status: 401 })), error => error.code === 'HTTP_401' && !error.message.includes('secret'));
  await assert.rejects(invoke(new Response(JSON.stringify({ choices: [{ message: { content: 'partial' }, finish_reason: 'length' }], usage: { prompt_tokens: 15, completion_tokens: 4096 } }))), error => error.code === 'OUTPUT_LIMIT' && error.usage.outputTokens === 4096);
  await assert.rejects(invoke(new Response('not json')), error => error.code === 'INVALID_RESPONSE');
  await assert.rejects(callProvider(profile, request, { env: {}, fetchImpl: async () => { throw new Error('must never call'); } }), error => error.code === 'KEY_NOT_CONFIGURED');
  assert.equal(calls, 3);
});
test('provider destinations are fixed; Qwen region/workspace and Yandex model URI are supported', () => {
  assert.match(requestFor({ ...profile, provider: 'qwen', region: 'china' }, 's', 'p', { ...env, DASHSCOPE_WORKSPACE_ID: 'workspace-1' }).url, /^https:\/\/workspace-1\.cn-beijing\.maas\.aliyuncs\.com\//);
  assert.throws(() => requestFor({ ...profile, provider: 'qwen' }, 's', 'p', { ...env, DASHSCOPE_WORKSPACE_ID: 'evil.com/' }), error => error.code === 'WORKSPACE_NOT_CONFIGURED');
  assert.equal(requestFor({ ...profile, provider: 'yandex', model: 'gpt://folder/yandexgpt/latest' }, 's', 'p', env).body.modelUri, 'gpt://folder/yandexgpt/latest');
});
test('configuration accepts custom models and null tariffs, rejects credentials, arbitrary URLs and invalid routing', () => {
  const body = { responsibilityScopeId: '50000000-0000-4000-8000-000000000001', profiles: [profile], tasks: { conversation_summary: 'main', work_order_prices: null } };
  assert.equal(settingsInput(body).profiles[0].model, 'test-model');
  for (const extra of [{ apiKey: 'private-key' }, { baseUrl: 'http://127.0.0.1' }, { inputPricePerMillion: -1 }, { maxOutputTokens: 200000 }]) assert.throws(() => settingsInput({ ...body, profiles: [{ ...profile, ...extra }] }));
  assert.throws(() => settingsInput({ ...body, tasks: { conversation_summary: 'missing' } }));
  assert.throws(() => settingsInput({ ...body, profiles: [profile, profile] }));
  assert.equal(settingsInput({ ...body, profiles: [{ ...profile, inputPricePerMillion: null }] }).profiles[0].inputPricePerMillion, null);
});
test('report dates include the final selected day and reject invalid or unbounded periods', () => {
  const scope = { responsibilityScopeId: '50000000-0000-4000-8000-000000000001' };
  assert.equal(reportRange({ ...scope, from: '2026-01-01', to: '2026-01-01' }).to, '2026-01-02T00:00:00.000Z');
  assert.throws(() => reportRange({ ...scope, from: '2026-02-30', to: '2026-03-02' }));
  assert.throws(() => reportRange({ ...scope, from: '2020-01-01', to: '2026-03-02' }));
});
