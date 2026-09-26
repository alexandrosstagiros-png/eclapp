'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { recoverSnapshot } = require('./recovery.cjs');

function unavailable() {
  const error = new Error('Локальная 1С пока недоступна.');
  error.code = 'ONE_C_UNAVAILABLE';
  return error;
}

function fakeClock() {
  let current = 1000;
  const waits = [];
  return {
    now: () => current,
    waits,
    wait: async (ms) => {
      assert.ok(ms > 0, 'retry waits must advance time');
      waits.push(ms);
      current += ms;
    },
  };
}

test('source is ensured once before reading and the real snapshot is returned unchanged', async () => {
  const calls = [];
  const expected = { schemaVersion: 'transport.local-test.v1', assignments: [{ id: 'real-source-row' }] };
  const actual = await recoverSnapshot({
    ensureSource: async () => { calls.push('ensure'); },
    readSnapshot: async () => { calls.push('read'); return expected; },
    wait: async () => { assert.fail('a healthy source must not be retried'); },
  });
  assert.strictEqual(actual, expected);
  assert.deepEqual(calls, ['ensure', 'read']);
});

test('transport unavailability is retried without repeatedly starting the source', async () => {
  const clock = fakeClock();
  let starts = 0;
  let reads = 0;
  const expected = { assignments: [{ id: 'recovered-row' }] };
  const actual = await recoverSnapshot({
    ...clock,
    timeoutMs: 10000,
    ensureSource: async () => { starts += 1; },
    readSnapshot: async () => {
      reads += 1;
      if (reads <= 2) throw unavailable();
      return expected;
    },
  });
  assert.strictEqual(actual, expected);
  assert.equal(starts, 1);
  assert.equal(reads, 3);
  assert.equal(clock.waits.length, 2);
});

for (const [kind, code] of [['schema', 'ONE_C_SCHEMA'], ['authorization', 'ONE_C_AUTH'], ['uncategorized', undefined]]) {
  test(`${kind} failures stay visible without retry or another source start`, async () => {
    const failure = new Error(`${kind} failure`);
    if (code) failure.code = code;
    let starts = 0;
    let reads = 0;
    await assert.rejects(recoverSnapshot({
      ensureSource: async () => { starts += 1; },
      readSnapshot: async () => { reads += 1; throw failure; },
      wait: async () => { assert.fail('nontransport failures must not wait or retry'); },
    }), (error) => error === failure);
    assert.equal(starts, 1);
    assert.equal(reads, 1);
  });
}

test('the startup deadline terminates retries with an actionable 1C error', async () => {
  const clock = fakeClock();
  let starts = 0;
  let reads = 0;
  await assert.rejects(recoverSnapshot({
    ...clock,
    timeoutMs: 2100,
    ensureSource: async () => { starts += 1; },
    readSnapshot: async () => { reads += 1; throw unavailable(); },
  }), (error) => {
    assert.match(error.message, /1С/);
    assert.match(error.message, /врем|минут|запуст|ожидан|ответ/i);
    assert.match(error.message, /журнал|ibsrv|повтор|Конфигуратор/i);
    return true;
  });
  assert.equal(starts, 1);
  assert.ok(reads >= 1 && reads <= 3, `unexpected retry count: ${reads}`);
  assert.ok(clock.waits.length <= 2);
  assert.equal(clock.now(), 3100, 'retry waits must stop at the remaining deadline, not overshoot it');
});

test('a source launch failure bubbles unchanged before any reads or retries', async () => {
  const failure = new Error('Порт занят чужим процессом.');
  let starts = 0;
  await assert.rejects(recoverSnapshot({
    ensureSource: async () => { starts += 1; throw failure; },
    readSnapshot: async () => { assert.fail('failed source launch must prevent the read'); },
    wait: async () => { assert.fail('launch errors must not be retried'); },
  }), (error) => error === failure);
  assert.equal(starts, 1);
});

test('an already aborted refresh cannot start or restart a source process', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(recoverSnapshot({
    signal: controller.signal,
    ensureSource: async () => { assert.fail('aborted operation must not start the source'); },
    readSnapshot: async () => { assert.fail('aborted operation must not read'); },
    wait: async () => { assert.fail('aborted operation must not wait'); },
  }), { name: 'AbortError' });
});

test('aborting while waiting ends recovery without another read or process start', { timeout: 1000 }, async () => {
  const controller = new AbortController();
  let enteredWait;
  const waitStarted = new Promise((resolve) => { enteredWait = resolve; });
  let starts = 0;
  let reads = 0;
  let waitSignal;
  const operation = recoverSnapshot({
    signal: controller.signal,
    ensureSource: async () => { starts += 1; },
    readSnapshot: async () => { reads += 1; throw unavailable(); },
    wait: (_ms, _value, options) => new Promise((_resolve, reject) => {
      waitSignal = options?.signal;
      assert.ok(waitSignal instanceof AbortSignal, 'retry wait needs the operation abort signal');
      const rejectAbort = () => reject(waitSignal.reason);
      if (waitSignal.aborted) rejectAbort();
      else waitSignal.addEventListener('abort', rejectAbort, { once: true });
      enteredWait();
    }),
  });
  // Attach rejection handling before triggering cancellation.
  const rejected = assert.rejects(operation, { name: 'AbortError' });
  await waitStarted;
  controller.abort();
  await rejected;
  assert.equal(waitSignal.aborted, true);
  assert.equal(starts, 1);
  assert.equal(reads, 1);
});

test('the read receives the operation signal so cancellation can stop an in-flight HTTP request', { timeout: 1000 }, async () => {
  const controller = new AbortController();
  let enteredRead;
  const readStarted = new Promise((resolve) => { enteredRead = resolve; });
  let operationSignal;
  const operation = recoverSnapshot({
    signal: controller.signal,
    ensureSource: async () => {},
    readSnapshot: (options) => new Promise((_resolve, reject) => {
      operationSignal = options?.signal;
      assert.ok(operationSignal instanceof AbortSignal);
      operationSignal.addEventListener('abort', () => reject(operationSignal.reason), { once: true });
      enteredRead();
    }),
    wait: async () => { assert.fail('a canceled read must not enter the retry loop'); },
  });
  const rejected = assert.rejects(operation, { name: 'AbortError' });
  await readStarted;
  controller.abort();
  await rejected;
  assert.equal(operationSignal.aborted, true);
});
