'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const bridgeModule = import('../frontend/bridge.mjs');
const locationHref = 'tauri://localhost/index.html';
const jsonResult = value => ({ status: 200, headers: { 'content-type': 'application/json' }, bodyBase64: Buffer.from(JSON.stringify(value)).toString('base64') });

test('only the bundled origin API prefix crosses IPC, including opaque tauri origins', async () => {
  const { createApiBridge } = await bridgeModule;
  const native = [], browser = [];
  const bridge = createApiBridge({ locationHref, invoke: async (...args) => { native.push(args); return jsonResult({ ok: true }); }, originalFetch: async (...args) => { browser.push(args); return new Response('browser'); } });
  assert.deepEqual(await (await bridge.fetch('/api/v1/me?scope=abc')).json(), { ok: true });
  await bridge.fetch('/api/v10/me');
  await bridge.fetch('https://another.example/api/v1/me');
  await bridge.fetch('other://localhost/api/v1/me');
  assert.equal(native.length, 1);
  assert.equal(native[0][1].request.path, '/api/v1/me?scope=abc');
  assert.equal(browser.length, 3);
});

test('password login disables durable credentials without losing headers or body fields', async () => {
  const { createApiBridge } = await bridgeModule;
  let captured;
  const bridge = createApiBridge({ locationHref, originalFetch: fetch, invoke: async (_, args) => { captured = args.request; return jsonResult({}); } });
  const request = new Request('https://tauri.localhost/api/v1/auth/password', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Request-ID': 'a', Cookie: 'must-not-cross' }, body: JSON.stringify({ phone: '+79990000000', password: 'test-fixture', rememberDevice: true }), credentials: 'include' });
  const httpsBridge = createApiBridge({ locationHref: 'https://tauri.localhost/', originalFetch: fetch, invoke: async (_, args) => { captured = args.request; return jsonResult({}); } });
  await httpsBridge.fetch(request);
  assert.deepEqual(JSON.parse(Buffer.from(captured.bodyBase64, 'base64')), { phone: '+79990000000', password: 'test-fixture', rememberDevice: false });
  assert.equal(captured.headers['x-request-id'], 'a');
  assert.equal(captured.headers.cookie, undefined);
  assert.equal(captured.credentials, true);
  await bridge.fetch('/api/v1/me', { credentials: 'omit' });
  assert.equal(captured.credentials, false);
  assert.equal(captured.bodyBase64, null);
});

test('multipart boundaries and binary bytes round-trip without text corruption', async () => {
  const { createApiBridge } = await bridgeModule;
  let captured;
  const binary = Uint8Array.from([0, 255, 128, 1, 13, 10]);
  const bridge = createApiBridge({ locationHref, originalFetch: fetch, invoke: async (_, args) => { captured = args.request; return { status: 200, headers: { 'content-type': 'application/octet-stream', 'set-cookie': 'do-not-expose' }, bodyBase64: Buffer.from(binary).toString('base64') }; } });
  const form = new FormData();
  form.append('photo', new Blob([binary], { type: 'image/jpeg' }), 'фото.jpg');
  const response = await bridge.fetch('/api/v1/inspections/photos', { method: 'POST', body: form });
  const boundary = captured.headers['content-type'].match(/boundary=(.+)$/)[1];
  const encoded = Buffer.from(captured.bodyBase64, 'base64');
  assert.ok(encoded.includes(Buffer.from(`--${boundary}`)));
  assert.ok(encoded.includes(binary));
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), binary);
  assert.equal(response.headers.get('set-cookie'), null);
});

test('empty HEAD and 204 replies produce legal Response objects', async () => {
  const { createApiBridge } = await bridgeModule;
  const bridge = createApiBridge({ locationHref, originalFetch: fetch, invoke: async () => ({ status: 204, headers: {}, bodyBase64: '' }) });
  assert.equal((await bridge.fetch('/api/v1/auth/logout', { method: 'POST' })).status, 204);
  assert.equal((await bridge.fetch('/api/v1/health/ready', { method: 'HEAD' })).body, null);
});

test('an aborted request does not dispatch and an in-flight mutation abort warns about server completion', async () => {
  const { createApiBridge } = await bridgeModule;
  let dispatch = 0, finish;
  const notices = [];
  const bridge = createApiBridge({ locationHref, originalFetch: fetch, onNotice: text => notices.push(text), invoke: () => { dispatch++; return new Promise(resolve => { finish = resolve; }); } });
  const cancelled = new AbortController(); cancelled.abort();
  await assert.rejects(bridge.fetch('/api/v1/me', { signal: cancelled.signal }), { name: 'AbortError' });
  assert.equal(dispatch, 0);
  const controller = new AbortController();
  const pending = bridge.fetch('/api/v1/trips', { method: 'POST', body: '{}', signal: controller.signal });
  await new Promise(setImmediate);
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(dispatch, 1);
  assert.equal(notices.length, 1);
  finish(jsonResult({ ok: true }));
});

test('suspending for a server change blocks new requests and discards an old response', async () => {
  const { createApiBridge } = await bridgeModule;
  let finish, dispatch = 0;
  const bridge = createApiBridge({ locationHref, originalFetch: fetch, invoke: () => { dispatch++; return new Promise(resolve => { finish = resolve; }); } });
  const old = bridge.fetch('/api/v1/me', { headers: { Authorization: 'Bearer old-fixture-token' } });
  bridge.suspend();
  await assert.rejects(bridge.fetch('/api/v1/me'), { name: 'AbortError' });
  finish(jsonResult({ actor: 'old-server-user' }));
  await assert.rejects(old, { name: 'AbortError' });
  assert.equal(dispatch, 1);
});

function storageEnvironment(events, failDelete = false) {
  return {
    sessionStorage: { clear: () => events.push('session') },
    localStorage: { clear: () => events.push('local') },
    caches: { keys: async () => ['old-cache'], delete: async key => events.push(key) },
    navigator: { serviceWorker: { getRegistrations: async () => [{ unregister: async () => events.push('service-worker') }] } },
    indexedDB: {
      databases: async () => [{ name: 'additional-database' }],
      deleteDatabase(name) { const request = {}; queueMicrotask(() => { events.push(name); if (failDelete) request.onblocked(); else request.onsuccess(); }); return request; },
    },
  };
}
test('changing server clears browser data and both draft databases before setting the new origin', async () => {
  const { switchServer } = await bridgeModule;
  const events = [];
  await switchServer({ serverUrl: 'https://new.example', environment: storageEnvironment(events), databases: { close: () => events.push('close-db') }, bridge: { suspend: () => events.push('freeze') }, invoke: async (name, args) => { assert.equal(name, 'set_server'); assert.equal(args.serverUrl, 'https://new.example'); events.push('set'); return args; }, reload: () => events.push('reload') });
  assert.deepEqual(events, ['freeze', 'close-db', 'session', 'local', 'old-cache', 'service-worker', 'transport-local-drafts', 'transport-inspection-drafts', 'additional-database', 'set', 'reload']);
});
test('a blocked database prevents a server switch, leaving old data scoped to its old server', async () => {
  const { switchServer } = await bridgeModule;
  let configured = false;
  await assert.rejects(switchServer({ serverUrl: 'https://new.example', environment: storageEnvironment([], true), bridge: { suspend() {} }, invoke: async () => { configured = true; }, reload() {} }), /storage blocked/);
  assert.equal(configured, false);
});

test('old UI timers cannot write an access token back after storage was cleared', async () => {
  const { switchServer } = await bridgeModule;
  class Storage { setItem() { throw new Error('Old browser method must be replaced'); } }
  const environment = { ...storageEnvironment([]), Storage };
  let checked = false;
  await switchServer({ serverUrl: 'https://new.example', environment, bridge: { suspend() {} },
    invoke: async () => {
      assert.throws(() => new Storage().setItem('ecl.session.v2', 'old-token'), { name: 'InvalidStateError' });
      checked = true;
      return { serverUrl: 'https://new.example' };
    }, reload() {},
  });
  assert.equal(checked, true);
});

test('detached download anchors use the save dialog, cancellation is quiet, external links open outside', async () => {
  const { installLinkBridge } = await bridgeModule;
  class Anchor {
    constructor(href, download = null) { this.href = href; this.download = download; }
    hasAttribute(name) { return name === 'download' && this.download !== null; }
    click() { throw new Error('Browser click should be intercepted'); }
  }
  const calls = [], notices = [];
  const environment = { HTMLAnchorElement: Anchor, location: new URL(locationHref), document: { addEventListener() {}, removeEventListener() {} } };
  const restore = installLinkBridge({ environment, invoke: async (command, args) => { calls.push([command, args]); return false; }, originalFetch: async () => new Response(Uint8Array.from([0, 255, 1])), onNotice: text => notices.push(text) });
  new Anchor('blob:tauri://localhost/fixture', 'рейс.pdf').click();
  new Anchor('https://example.com/').click();
  new Anchor('tel:+79990000000').click();
  await new Promise(setImmediate);
  const download = calls.find(([name]) => name === 'save_download');
  assert.equal(download[1].filename, 'рейс.pdf');
  assert.deepEqual(Buffer.from(download[1].bodyBase64, 'base64'), Buffer.from([0, 255, 1]));
  assert.equal(calls.filter(([name]) => name === 'open_external').length, 2);
  assert.equal(notices.length, 0);
  restore();
});

test('transport failures never expose raw network errors or credentials', async () => {
  const { createApiBridge } = await bridgeModule;
  const bridge = createApiBridge({ locationHref, originalFetch: fetch, invoke: async () => { throw new Error('TLS certificate error https://fixture:secret@example.com/?token=secret'); } });
  await assert.rejects(bridge.fetch('/api/v1/me'), error => /сертификат/.test(error.message) && !error.message.includes('secret'));
});
