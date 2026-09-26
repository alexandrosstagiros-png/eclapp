'use strict';
const { setTimeout: delay } = require('node:timers/promises');

// Only transport unavailability is retried. Authorization, schema and business
// errors stay visible. All callers share this work through server.refresh().
async function recoverSnapshot({ ensureSource, readSnapshot, wait = delay, now = Date.now, timeoutMs = 120000, signal }) {
  const deadline = now() + timeoutMs;
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const operationSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
  const expired = () => new Error('Локальная 1С не ответила за две минуты. Закройте Конфигуратор, если он занимает базу, и повторите обновление.');
  signal?.throwIfAborted();
  await ensureSource({ signal: operationSignal });
  for (;;) {
    signal?.throwIfAborted();
    if (now() >= deadline || timeoutSignal.aborted) throw expired();
    try { return await readSnapshot({ signal: operationSignal }); }
    catch (error) {
      signal?.throwIfAborted();
      if (now() >= deadline || timeoutSignal.aborted) throw expired();
      if (error.code !== 'ONE_C_UNAVAILABLE') throw error;
      try { await wait(Math.min(1500, Math.max(0, deadline - now())), undefined, { signal: operationSignal }); }
      catch (error) { signal?.throwIfAborted(); if (timeoutSignal.aborted) throw expired(); throw error; }
    }
  }
}
module.exports = { recoverSnapshot };
