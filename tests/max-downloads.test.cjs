'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const apiRequire = createRequire(require('node:path').resolve(__dirname, '../recovered/package.json'));
apiRequire('reflect-metadata');
const { MaxDownloadsService } = require('../recovered/apps/api/src/modules/max-downloads/max-downloads.module');
const MIB = 1024 * 1024;
const status = expected => error => error.getStatus?.() === expected;
const tokenOf = result => new URL(result.url).pathname.split('/').at(-1);
const actor = (id = 'employee-a', sessionId = 'session-a') => ({ id, sessionId, channel: 'max' });
const payload = (bytes = Buffer.from('synthetic document')) => ({
  filename: 'Акт перевозки.pdf', contentType: 'application/pdf', contentBase64: bytes.toString('base64'),
});
function service(t, auth = { requireCurrentActor: async () => ({}) }) {
  const result = new MaxDownloadsService(auth, { pool: {} }, {
    value: { nodeEnv: 'production', allowedOrigins: ['https://app.example.test'] },
  });
  t.after(() => result.onModuleDestroy());
  return result;
}

for (const headOnly of [false, true]) {
  test(`${headOnly ? 'HEAD' : 'GET'} denies a download that expires while session verification is pending`, async t => {
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    let checked = false;
    const downloads = service(t, { async requireCurrentActor() { checked = true; await gate; } });
    const token = tokenOf(downloads.create(payload(), actor()));
    const staged = downloads.files.get(token);
    const pendingRead = downloads.read(token, headOnly);
    assert.equal(checked, true);
    // Expire only after read has passed its initial expiry check and entered auth.
    staged.expiresAt = Date.now() - 1;
    release();
    await assert.rejects(pendingRead, status(404));
    assert.equal(downloads.files.size, 0);
    assert.equal(downloads.bytes, 0);
  });
}

test('per-employee staging cap spans sessions and is released by GET', async t => {
  const downloads = service(t);
  const first = tokenOf(downloads.create(payload(), actor()));
  downloads.create(payload(), actor('employee-a', 'another-session'));
  assert.throws(() => downloads.create(payload(), actor()), status(429));
  // Another employee has an independent allowance.
  downloads.create(payload(), actor('employee-b'));
  assert.equal(downloads.files.size, 3);
  await downloads.read(first, true);
  assert.throws(() => downloads.create(payload(), actor()), status(429));
  await downloads.read(first, false);
  assert.doesNotThrow(() => downloads.create(payload(), actor()));
});

test('32 MiB staging cap accepts the exact boundary and recovers space after GET', async t => {
  const downloads = service(t);
  const full = payload(Buffer.alloc(8 * MIB, 1));
  const first = tokenOf(downloads.create(full, actor('employee-a')));
  downloads.create(full, actor('employee-a'));
  downloads.create(full, actor('employee-b'));
  downloads.create(full, actor('employee-b'));
  assert.equal(downloads.bytes, 32 * MIB);
  assert.throws(() => downloads.create(payload(Buffer.from('x')), actor('employee-c')), status(429));
  assert.equal(downloads.bytes, 32 * MIB);
  await downloads.read(first, false);
  assert.equal(downloads.bytes, 24 * MIB);
  downloads.create(full, actor('employee-c'));
  assert.equal(downloads.bytes, 32 * MIB);
});

test('empty, path-like, and control-character filenames are rejected without staging data', t => {
  const downloads = service(t);
  for (const filename of ['', '../document.pdf', 'folder/document.pdf', 'folder\\document.pdf',
    'document\r\n.pdf', 'document\u0000.pdf', 'document\u007f.pdf']) {
    assert.throws(() => downloads.create({ ...payload(), filename }, actor()), status(400));
  }
  assert.equal(downloads.files.size, 0);
  assert.equal(downloads.bytes, 0);
  assert.doesNotThrow(() => downloads.create(payload(), actor()));
});
