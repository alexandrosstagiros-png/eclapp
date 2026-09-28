// SPDX-License-Identifier: MIT
'use strict';
const { PROVIDERS } = require('./neural-input');
class ProviderError extends Error {
  constructor(code, usage = null) { super(code); this.code = code; this.usage = usage; }
}
function tokenCount(value) {
  if (value === undefined || value === null || value === '' || typeof value === 'boolean') return null;
  const count = Number(value);
  return Number.isSafeInteger(count) && count >= 0 ? count : null;
}
function providerUsage(provider, payload) {
  const data = provider === 'yandex' ? (payload?.result || payload) : payload;
  const usage = data?.usage;
  if (!usage) return { inputTokens: null, outputTokens: null, cachedInputTokens: null, cacheWriteTokens: null };
  if (provider === 'anthropic') {
    const input = tokenCount(usage.input_tokens), cached = tokenCount(usage.cache_read_input_tokens) ?? 0, writes = tokenCount(usage.cache_creation_input_tokens) ?? 0;
    return { inputTokens: input === null ? null : input + cached + writes, outputTokens: tokenCount(usage.output_tokens), cachedInputTokens: cached, cacheWriteTokens: writes };
  }
  if (provider === 'yandex') return { inputTokens: tokenCount(usage.inputTextTokens), outputTokens: tokenCount(usage.completionTokens), cachedInputTokens: 0, cacheWriteTokens: 0 };
  return { inputTokens: tokenCount(usage.prompt_tokens), outputTokens: tokenCount(usage.completion_tokens), cachedInputTokens: tokenCount(usage.prompt_tokens_details?.cached_tokens) ?? 0, cacheWriteTokens: tokenCount(usage.prompt_tokens_details?.cache_write_tokens) ?? 0 };
}
function estimatedCost(profile, usage) {
  if (!usage || usage.inputTokens === null || usage.outputTokens === null || profile.inputPricePerMillion == null || profile.outputPricePerMillion == null) return null;
  const cached = usage.cachedInputTokens || 0, writes = usage.cacheWriteTokens || 0;
  // A missing cache price must not turn actual cached usage into an invented charge.
  if ((cached && profile.cachedInputPricePerMillion == null) || (writes && profile.cacheWritePricePerMillion == null) || cached + writes > usage.inputTokens) return null;
  return Number((((usage.inputTokens - cached - writes) * profile.inputPricePerMillion + cached * (profile.cachedInputPricePerMillion ?? 0) + writes * (profile.cacheWritePricePerMillion ?? 0) + usage.outputTokens * profile.outputPricePerMillion) / 1000000).toFixed(10));
}
function requestFor(profile, system, prompt, env) {
  const key = env[PROVIDERS[profile.provider].keyEnv]?.trim();
  if (!key) throw new ProviderError('KEY_NOT_CONFIGURED');
  const headers = { 'content-type': 'application/json' }, messages = [{ role: 'system', content: system }, { role: 'user', content: prompt }];
  if (profile.provider === 'anthropic') return { url: 'https://api.anthropic.com/v1/messages', headers: { ...headers, 'x-api-key': key, 'anthropic-version': '2023-06-01' }, body: { model: profile.model, system, messages: [{ role: 'user', content: prompt }], max_tokens: profile.maxOutputTokens, stream: false } };
  if (profile.provider === 'yandex') {
    const folder = profile.folderId || env.YANDEX_FOLDER_ID?.trim();
    if (!profile.model.startsWith('gpt://') && !folder) throw new ProviderError('FOLDER_NOT_CONFIGURED');
    const modelUri = profile.model.startsWith('gpt://') ? profile.model : `gpt://${folder}/${profile.model}`;
    return { url: 'https://llm.api.cloud.yandex.net/foundationModels/v1/completion', headers: { ...headers, authorization: `Api-Key ${key}`, 'x-data-logging-enabled': 'false' },
      body: { modelUri, completionOptions: { stream: false, maxTokens: String(profile.maxOutputTokens) }, messages: messages.map(({ role, content }) => ({ role, text: content })) } };
  }
  let url = 'https://api.openai.com/v1/chat/completions';
  if (profile.provider === 'qwen') {
    const workspace = env.DASHSCOPE_WORKSPACE_ID?.trim();
    if (workspace && !/^[a-zA-Z0-9_-]{1,80}$/.test(workspace)) throw new ProviderError('WORKSPACE_NOT_CONFIGURED');
    const host = workspace ? `${workspace}.${profile.region === 'china' ? 'cn-beijing' : 'ap-southeast-1'}.maas.aliyuncs.com` : profile.region === 'china' ? 'dashscope.aliyuncs.com' : 'dashscope-intl.aliyuncs.com';
    url = `https://${host}/compatible-mode/v1/chat/completions`;
  }
  if (profile.provider === 'glm') url = 'https://api.z.ai/api/paas/v4/chat/completions';
  return { url, headers: { ...headers, authorization: `Bearer ${key}` }, body: { model: profile.model, messages, stream: false,
    ...(profile.provider === 'openai' ? { max_completion_tokens: profile.maxOutputTokens, store: false } : { max_tokens: profile.maxOutputTokens }),
    ...(profile.provider === 'qwen' ? { enable_thinking: false } : {}) } };
}
async function boundedJson(response) {
  // fetch's body reader keeps the timeout effective and prevents oversized responses.
  let size = 0; const chunks = [];
  for await (const chunk of response.body) {
    size += chunk.byteLength;
    if (size > 2 * 1024 * 1024) throw new ProviderError('RESPONSE_TOO_LARGE');
    chunks.push(Buffer.from(chunk));
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new ProviderError('INVALID_RESPONSE'); }
}
async function callProvider(profile, { system, prompt }, { fetchImpl = globalThis.fetch, env = process.env, timeoutMs = 90000 } = {}) {
  const request = requestFor(profile, system, prompt, env);
  let payload;
  try {
    const response = await fetchImpl(request.url, { method: 'POST', headers: request.headers, body: JSON.stringify(request.body), redirect: 'error', signal: AbortSignal.timeout(timeoutMs) });
    // Never surface raw provider error text: it may echo prompts or credentials.
    if (!response.ok) {
      try { payload = await boundedJson(response); } catch { /* status is sufficient */ }
      throw new ProviderError(`HTTP_${response.status}`, providerUsage(profile.provider, payload));
    }
    payload = await boundedJson(response);
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    throw new ProviderError(['TimeoutError', 'AbortError'].includes(error?.name) ? 'TIMEOUT' : 'NETWORK_ERROR');
  }
  const usage = providerUsage(profile.provider, payload), data = profile.provider === 'yandex' ? (payload?.result || payload) : payload;
  let text, reason;
  if (profile.provider === 'anthropic') { text = Array.isArray(data?.content) ? data.content.filter(item => item.type === 'text').map(item => item.text).join('\n') : null; reason = data?.stop_reason; }
  else if (profile.provider === 'yandex') { text = data?.alternatives?.[0]?.message?.text; reason = data?.alternatives?.[0]?.status; }
  else { text = data?.choices?.[0]?.message?.content; reason = data?.choices?.[0]?.finish_reason; }
  if (['length', 'max_tokens', 'ALTERNATIVE_STATUS_TRUNCATED_FINAL', 'model_context_window_exceeded'].includes(reason)) throw new ProviderError('OUTPUT_LIMIT', usage);
  if (['refusal', 'content_filter', 'sensitive', 'ALTERNATIVE_STATUS_CONTENT_FILTER'].includes(reason)) throw new ProviderError('CONTENT_FILTER', usage);
  if (typeof text !== 'string' || !text.trim()) throw new ProviderError('EMPTY_RESPONSE', usage);
  return { text: text.trim(), ...usage };
}
module.exports = { ProviderError, callProvider, providerUsage, estimatedCost, requestFor };
