#!/usr/bin/env node
'use strict';
const fs = require('node:fs/promises');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');
const { paths, PORT, PG_PORT, ORIGIN, ensureDirectory, readJson, cleanEnvironment } = require('./runtime.cjs');
const { ownProcess } = require('./server.cjs');

async function probe() {
  try {
    const response = await fetch(`${ORIGIN}/__local/status`, { signal: AbortSignal.timeout(1000) });
    const value = await response.json();
    return value.kind === 'ecl-persistent-local-app' ? value : null;
  } catch { return null; }
}
async function portAvailable(port) {
  return new Promise(resolve => { const socket = net.createServer(); socket.once('error', () => resolve(false)); socket.listen(port, '127.0.0.1', () => socket.close(() => resolve(true))); });
}
async function status() {
  const state = await readJson(paths.state);
  const live = ownProcess(state?.pid);
  const health = live ? await probe() : null;
  const ready = Boolean(health?.ready && health.instanceId === state?.instanceId);
  return { running: live, ready,
    status: live ? (ready ? 'ready' : state?.status || 'starting') : state?.status || 'not_started',
    url: ORIGIN, pid: live ? state.pid : null, loginPath: paths.login, logPath: paths.log, dataPath: paths.data };
}
async function start() {
  await ensureDirectory();
  const current = await status();
  if (current.running) { console.log(JSON.stringify(current, null, 2)); return; }
  if (!await portAvailable(PORT)) throw new Error(`Порт ${PORT} занят другим процессом. Он не будет остановлен.`);
  if (!await portAvailable(PG_PORT)) throw new Error(`Порт локальной PostgreSQL ${PG_PORT} занят. Существующий процесс не будет остановлен.`);
  const log = await fs.open(paths.log, 'a', 0o600);
  await fs.chmod(paths.log, 0o600);
  let child;
  try {
    child = spawn(process.execPath, [paths.server], { cwd: paths.root, env: cleanEnvironment(), detached: true, stdio: ['ignore', log.fd, log.fd] });
    await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
    child.unref();
  } finally { await log.close(); }
  const deadline = Date.now() + 150000;
  let nextProgress = Date.now() + 30000;
  while (Date.now() < deadline) {
    const health = await probe();
    if (health?.ready && health.pid === child.pid) { console.log(JSON.stringify(await status(), null, 2)); return; }
    if (!ownProcess(child.pid)) throw new Error(`Локальное приложение не запустилось. Журнал: ${paths.log}`);
    if (Date.now() >= nextProgress) {
      console.log('Локальное приложение запускается: ожидаем PostgreSQL и чтение справочников 1С…');
      nextProgress = Date.now() + 30000;
    }
    await delay(300);
  }
  console.log(JSON.stringify({ ...(await status()), message: 'Запуск продолжается. Повторите команду status; данные сохраняются в локальном каталоге.' }, null, 2));
}
async function stop() {
  const state = await readJson(paths.state);
  if (!ownProcess(state?.pid)) { console.log('Локальное приложение уже остановлено. Данные сохранены.'); return; }
  process.kill(state.pid, 'SIGTERM');
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline && ownProcess(state.pid)) await delay(200);
  if (ownProcess(state.pid)) throw new Error('Остановка ещё выполняется. Принудительное завершение не применялось; проверьте status и журнал.');
  console.log('Локальное приложение остановлено. Планирование, календарь и база PostgreSQL сохранены.');
}
async function main() {
  const action = process.argv[2] || 'status';
  if (action === 'start') return start();
  if (action === 'stop') return stop();
  if (action === 'status') { console.log(JSON.stringify(await status(), null, 2)); return; }
  throw new Error('Использование: node integrations/local-app/manage.cjs start|stop|status');
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { start, stop, status };
