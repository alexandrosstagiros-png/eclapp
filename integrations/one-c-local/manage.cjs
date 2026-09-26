#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawn, execFileSync } = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');
const ROOT = path.resolve(__dirname, '../..');
const DATA = path.join(ROOT, '.local/one-c-local');
const CONFIG = path.join(DATA, 'ibsrv.yml');
const STATE = path.join(DATA, 'processes.json');
const LOCK = path.join(DATA, 'process-start.lock');
const PLATFORM = '/opt/1cv8/8.5.1.1150';
const WEB = path.join(__dirname, 'server.cjs');
fs.mkdirSync(DATA, { recursive: true, mode: 0o700 });

function readState() { try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch { return {}; } }
function saveState(state) {
  const tmp = `${STATE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, STATE);
}
async function withLaunchLock(work) {
  const until = Date.now() + 10000;
  for (;;) {
    try { fs.writeFileSync(LOCK, String(process.pid), { flag: 'wx', mode: 0o600 }); break; }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      let owner;
      try { owner = fs.readFileSync(LOCK, 'utf8'); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
      if (/^[1-9]\d*$/.test(owner)) {
        try { process.kill(Number(owner), 0); }
        catch (error) {
          if (error.code === 'ESRCH') {
            try { if (fs.readFileSync(LOCK, 'utf8') === owner) fs.unlinkSync(LOCK); } catch {}
            continue;
          }
        }
      }
      if (Date.now() >= until) throw new Error('Другой запуск локального теста ещё выполняется. Повторите обновление.');
      await delay(100);
    }
  }
  try { return await work(); }
  finally { fs.unlinkSync(LOCK); }
}
function isOwned(pid, type) {
  if (!Number.isInteger(pid) || pid <= 1) return false;
  try {
    const args = execFileSync('/bin/ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8' });
    return type === 'ibsrv' ? args.includes(`${PLATFORM}/ibsrv`) && args.includes(CONFIG) : args.includes(WEB);
  } catch { return false; }
}
function available(port) {
  return new Promise(resolve => { const s = net.createServer(); s.once('error', () => resolve(false)); s.listen(port, '127.0.0.1', () => s.close(() => resolve(true))); });
}
async function launch(file, args, logName) {
  const fd = fs.openSync(path.join(DATA, logName), 'a', 0o600);
  const child = spawn(file, args, { cwd: ROOT, detached: true, stdio: ['ignore', fd, fd] });
  fs.closeSync(fd);
  await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
  child.unref(); return child.pid;
}
async function ensureSource({ signal } = {}) {
  signal?.throwIfAborted();
  return withLaunchLock(async () => {
  signal?.throwIfAborted();
  if (!fs.existsSync('/Users/victor/Documents/InfoBase/1Cv8.1CD')) throw new Error('Не найдена исходная InfoBase. Новая база автоматически не создаётся.');
  if (!fs.existsSync(CONFIG)) throw new Error('Нет локальной настройки ibsrv.yml. См. README.md.');
  const state = readState();
  if (isOwned(state.ibsrv, 'ibsrv')) return false;
  if (!await available(18314)) throw new Error('Порт 18314 занят другим процессом. Он не будет остановлен автоматически.');
  const pid = await launch(path.join(PLATFORM, 'ibsrv'), [`--config=${CONFIG}`, `--data=${path.join(DATA, 'server-data')}`, '--disable-ssh', '--disable-direct'], 'ibsrv.log');
  saveState({ ...readState(), ibsrv: pid });
  return true;
  });
}
async function main() {
  const action = process.argv[2] ?? 'start';
  const state = readState();
  if (action === 'stop') {
    await withLaunchLock(async () => {
      const current = readState();
      for (const type of ['web', 'ibsrv']) if (isOwned(current[type], type)) process.kill(current[type], type === 'ibsrv' ? 'SIGINT' : 'SIGTERM');
    });
    console.log('Команда остановки локального теста отправлена. База InfoBase сохранена.');
    return;
  }
  if (action === 'status') {
    console.log(JSON.stringify({ ibsrv: isOwned(state.ibsrv, 'ibsrv'), web: isOwned(state.web, 'web'), url: 'http://127.0.0.1:18414' }, null, 2));
    return;
  }
  if (action !== 'start') throw new Error('Использование: node manage.cjs start|stop|status');
  await ensureSource();
  await withLaunchLock(async () => {
  if (!isOwned(readState().web, 'web')) {
    if (!await available(18414)) throw new Error('Порт 18414 занят другим процессом. Он не будет остановлен автоматически.');
    const pid = await launch(process.execPath, [WEB], 'web.log');
    saveState({ ...readState(), web: pid });
  }
  });
  console.log('Локальный тест: http://127.0.0.1:18414');
  console.log('Первое чтение 1С после запуска может занять до двух минут. Затем нажмите «Обновить».');
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { ensureSource, isOwned, readState };
