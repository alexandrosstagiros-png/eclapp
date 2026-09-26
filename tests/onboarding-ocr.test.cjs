'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { recognizeDocument, getOcrStatus, MAX_BYTES } = require('../recovered/apps/api/src/modules/recruitment/yandex-ocr');

// Synthetic signatures only. No real document, paid service, or network is used.
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const input = (documentType = 'passport') => ({ buffer: jpeg, mimeType: 'image/jpeg', documentType });
const reply = annotation => new Response(JSON.stringify({ result: { textAnnotation: annotation } }), { status: 200 });
function setup(t) {
  const previous = { key: process.env.YANDEX_OCR_API_KEY, folder: process.env.YANDEX_OCR_FOLDER_ID };
  process.env.YANDEX_OCR_API_KEY = 'synthetic-secret-api-key';
  process.env.YANDEX_OCR_FOLDER_ID = 'synthetic-folder';
  t.after(() => {
    for (const [name, value] of [['YANDEX_OCR_API_KEY', previous.key], ['YANDEX_OCR_FOLDER_ID', previous.folder]]) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  });
}
function safeFailure(code, status) {
  return cause => {
    assert.equal(cause.getStatus(), status);
    const result = cause.getResponse();
    assert.equal(result.code, code);
    assert.match(result.message, /[А-Яа-я]/);
    assert.doesNotMatch(JSON.stringify(cause), /synthetic-secret|sensitive upstream|synthetic-folder/);
    assert.equal(cause.cause, undefined);
    return true;
  };
}

test('status reveals only readiness and public constraints, never key or folder', t => {
  setup(t);
  const status = getOcrStatus();
  assert.equal(status.configured, true);
  assert.equal(status.provider, 'yandex');
  assert.equal(status.maxBytes, 10 * 1024 * 1024);
  assert.deepEqual(status.supportedMimeTypes, ['image/jpeg', 'image/png']);
  assert.doesNotMatch(JSON.stringify(status), /synthetic-secret|synthetic-folder/);
  delete process.env.YANDEX_OCR_API_KEY;
  assert.equal(getOcrStatus().configured, false);
  process.env.YANDEX_OCR_API_KEY = 'bad\nheader';
  assert.equal(getOcrStatus().configured, false);
});

test('sends one synchronous request with fixed endpoint, disabled logging and no redirects', async t => {
  setup(t);
  let calls = 0;
  const result = await recognizeDocument(input(), { fetchImpl: async (url, options) => {
    calls++;
    assert.equal(url, 'https://ai.api.cloud.yandex.net/ocr/v1/recognizeText');
    assert.equal(options.method, 'POST');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Authorization, 'Api-Key synthetic-secret-api-key');
    assert.equal(options.headers['x-folder-id'], 'synthetic-folder');
    assert.equal(options.headers['x-data-logging-enabled'], 'false');
    assert.deepEqual(JSON.parse(options.body), { content: jpeg.toString('base64'), mimeType: 'JPEG', languageCodes: ['*'], model: 'passport' });
    return reply({ fullText: 'SYNTHETIC PASSPORT', entities: [
      { name: 'name', text: ' Test ' }, { name: 'number', text: '0000000000' },
      { name: '__proto__', text: 'pollution' }, { name: 'unknown', text: 'discarded' },
    ] });
  } });
  assert.equal(calls, 1);
  assert.deepEqual(result, { text: 'SYNTHETIC PASSPORT', fields: { name: 'Test', number: '0000000000' }, model: 'passport' });
  assert.equal(Object.getPrototypeOf(result.fields), Object.prototype);
});

test('maps each document to its documented model and accepts PNG', async t => {
  setup(t);
  const models = {
    passport: 'passport', passport_registration: 'page', driver_license_front: 'driver-license-front',
    driver_license_back: 'driver-license-back', vehicle_registration_front: 'vehicle-registration-front',
    vehicle_registration_back: 'vehicle-registration-back', snils: 'page', other: 'page',
  };
  for (const [documentType, model] of Object.entries(models)) {
    const result = await recognizeDocument({ buffer: png, mimeType: 'image/png', documentType }, { fetchImpl: async (_, options) => {
      const body = JSON.parse(options.body);
      assert.equal(body.model, model);
      assert.equal(body.mimeType, 'PNG');
      return reply({ fullText: 'SYNTHETIC', entities: [{ name: 'name', text: 'Test' }] });
    } });
    assert.equal(result.model, model);
    if (model === 'page') assert.deepEqual(result.fields, {});
  }
});

test('supports unwrapped REST results and falls back to line text', async t => {
  setup(t);
  const result = await recognizeDocument(input('snils'), { fetchImpl: async () => new Response(JSON.stringify({
    textAnnotation: { blocks: [{ lines: [{ text: 'SYNTHETIC' }, { text: 'PAGE' }] }] },
  })) });
  assert.deepEqual(result, { text: 'SYNTHETIC\nPAGE', fields: {}, model: 'page' });
});

test('preserves recognized fields even when full text is absent', async t => {
  setup(t);
  const result = await recognizeDocument(input('driver_license_back'), { fetchImpl: async () => reply({ entities: [{ name: 'experience_from', text: '2000' }] }) });
  assert.deepEqual(result, { text: '', fields: { experience_from: '2000' }, model: 'driver-license-back' });
});

test('rejects empty, oversized, disguised and unsupported input before requesting OCR', async t => {
  setup(t);
  let calls = 0;
  const fetchImpl = async () => { calls++; throw new Error('Must not be called'); };
  const cases = [
    [undefined, 'ONBOARDING_OCR_IMAGE', 400],
    [{ ...input(), buffer: Buffer.alloc(0) }, 'ONBOARDING_OCR_IMAGE', 400],
    [{ ...input(), buffer: jpeg.toString('base64') }, 'ONBOARDING_OCR_IMAGE', 400],
    [{ ...input(), buffer: Buffer.alloc(MAX_BYTES + 1) }, 'ONBOARDING_OCR_SIZE', 413],
    [{ ...input(), buffer: Buffer.from('<html>') }, 'ONBOARDING_OCR_FORMAT', 400],
    [{ ...input(), buffer: png }, 'ONBOARDING_OCR_FORMAT', 400],
    [{ ...input(), mimeType: 'image/svg+xml' }, 'ONBOARDING_OCR_FORMAT', 400],
    [input('__proto__'), 'ONBOARDING_OCR_DOCUMENT_TYPE', 400],
    [input('unknown'), 'ONBOARDING_OCR_DOCUMENT_TYPE', 400],
  ];
  for (const [value, code, status] of cases) await assert.rejects(recognizeDocument(value, { fetchImpl }), safeFailure(code, status));
  assert.equal(calls, 0);
});

test('requires both server environment values without making a request', async t => {
  setup(t);
  delete process.env.YANDEX_OCR_FOLDER_ID;
  await assert.rejects(recognizeDocument(input(), { fetchImpl: async () => assert.fail('Must not call upstream') }), safeFailure('ONBOARDING_OCR_NOT_CONFIGURED', 503));
});

test('provider failures neither expose nor read upstream error bodies and never retry', async t => {
  setup(t);
  for (const [status, code, publicStatus] of [
    [400, 'ONBOARDING_OCR_REJECTED', 422], [401, 'ONBOARDING_OCR_ACCESS', 503],
    [403, 'ONBOARDING_OCR_ACCESS', 503], [429, 'ONBOARDING_OCR_BUSY', 503],
    [500, 'ONBOARDING_OCR_UNAVAILABLE', 503], [302, 'ONBOARDING_OCR_UNAVAILABLE', 503],
  ]) {
    let calls = 0;
    await assert.rejects(recognizeDocument(input(), { fetchImpl: async () => {
      calls++;
      return { ok: false, status, get body() { assert.fail('Must not read error body'); } };
    } }), safeFailure(code, publicStatus));
    assert.equal(calls, 1);
  }
  await assert.rejects(recognizeDocument(input(), { fetchImpl: async () => { throw new Error('synthetic-secret-api-key sensitive upstream'); } }), safeFailure('ONBOARDING_OCR_UNAVAILABLE', 503));
});

test('timeout aborts the request even when transport ignores cancellation', async t => {
  setup(t);
  let signal;
  await assert.rejects(recognizeDocument(input(), { timeoutMs: 10, fetchImpl: async (_, options) => {
    signal = options.signal;
    return new Promise(() => {});
  } }), safeFailure('ONBOARDING_OCR_TIMEOUT', 504));
  assert.equal(signal.aborted, true);
});

test('timeout covers reading the response body as well as connecting', async t => {
  setup(t);
  let cancelled = false;
  await assert.rejects(recognizeDocument(input(), { timeoutMs: 10, fetchImpl: async (_, options) => {
    const body = new ReadableStream({
      start(controller) { options.signal.addEventListener('abort', () => { cancelled = true; controller.error(new Error('aborted')); }); },
    });
    return new Response(body);
  } }), safeFailure('ONBOARDING_OCR_TIMEOUT', 504));
  assert.equal(cancelled, true);
});

test('rejects malformed or excessive successful responses safely', async t => {
  setup(t);
  const replies = [
    () => new Response('sensitive upstream not JSON'),
    () => new Response(JSON.stringify({ error: { message: 'sensitive upstream' } })),
    () => reply({ fullText: { unsafe: 'sensitive upstream' } }),
    () => reply({ fullText: 'x'.repeat(100001) }),
    () => reply({ fullText: 'SYNTHETIC', entities: {} }),
    () => reply({ entities: [{ name: 'number', text: 'x'.repeat(2049) }] }),
    () => new Response('small', { headers: { 'Content-Length': String(3 * 1024 * 1024) } }),
    () => new Response('x'.repeat(2 * 1024 * 1024 + 1)),
  ];
  for (const fetchImpl of replies) await assert.rejects(recognizeDocument(input(), { fetchImpl }), safeFailure('ONBOARDING_OCR_RESPONSE', 502));
});

test('blank recognition is actionable and does not claim successful verification', async t => {
  setup(t);
  await assert.rejects(recognizeDocument(input(), { fetchImpl: async () => reply({ fullText: '  ', entities: [] }) }), safeFailure('ONBOARDING_OCR_NO_TEXT', 422));
});
