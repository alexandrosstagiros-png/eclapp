'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const updater = import('../frontend/updates.mjs');
const flush = async () => { for (let index = 0; index < 4; index++) await new Promise(setImmediate); };

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function fixture() {
  let time = 0, nextId = 1;
  const timers = new Map();
  const clock = {
    setTimeout(fn, delay) { const id = nextId++; timers.set(id, { fn, at: time + delay }); return id; },
    setInterval(fn, delay) { const id = nextId++; timers.set(id, { fn, at: time + delay, repeat: delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    clearInterval(id) { timers.delete(id); },
  };
  const document = new EventTarget();
  document.visibilityState = 'visible';
  const environment = new EventTarget();
  return {
    options: { clock, now: () => time, document, environment, checkInterval: 100, startupDelay: 5, pollInterval: 10 },
    document, environment,
    setTime(value) { time = value; },
    async tick(delta) {
      const end = time + delta;
      while (true) {
        const [id, next] = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0] || [];
        if (!next) break;
        time = next.at;
        if (next.repeat) next.at += next.repeat;
        else timers.delete(id);
        next.fn();
        await flush();
      }
      time = end;
    },
    timers,
  };
}

test('disabled and not-yet-checked states never claim the installed version is latest', async () => {
  const { describeUpdateStatus } = await updater;
  assert.match(describeUpdateStatus({ state: 'disabled' }).heading, /не настроено/);
  assert.equal(describeUpdateStatus({ state: 'disabled' }).canCheck, false);
  assert.equal(describeUpdateStatus({ state: 'idle' }).heading, 'Автоматическая проверка');
  assert.equal(describeUpdateStatus({ state: 'idle', checked: false }, { checkedAt: 0 }).heading, 'Автоматическая проверка');
  assert.equal(describeUpdateStatus({ state: 'idle', checked: true }).heading, 'Установлена актуальная версия');
  assert.equal(describeUpdateStatus({ state: 'idle', checked: true }, { communicationError: 'Проверка не удалась.' }).heading, 'Не удалось проверить обновление');
});

test('desktop restart, Android installation and iOS store actions use distinct instructions', async () => {
  const { describeUpdateStatus } = await updater;
  const desktop = describeUpdateStatus({ state: 'ready', version: '1.2.0', action: 'restart' });
  assert.equal(desktop.action, 'Перезапустить и обновить');
  assert.match(desktop.detail, /Сохраните изменения/);
  const android = describeUpdateStatus({ state: 'ready', version: '1.2.0', action: 'installer' });
  assert.equal(android.action, 'Установить обновление');
  assert.match(android.detail, /Android/);
  assert.equal(describeUpdateStatus({ state: 'external', platform: 'ios' }).action, 'Открыть обновление');
});

test('download progress handles unknown lengths and never exceeds 100 percent', async () => {
  const { describeUpdateStatus } = await updater;
  assert.equal(describeUpdateStatus({ state: 'downloading', downloadedBytes: 42 }).progress, null);
  assert.equal(describeUpdateStatus({ state: 'downloading', downloadedBytes: 25, totalBytes: 100 }).progress, 25);
  assert.equal(describeUpdateStatus({ state: 'downloading', downloadedBytes: 120, totalBytes: 100 }).progress, 100);
  assert.equal(describeUpdateStatus({ state: 'ready', downloadedBytes: 120, totalBytes: 100 }).showProgress, false);
});

test('startup check downloads in the background, polls native progress and never auto-installs', async () => {
  const { createUpdateController } = await updater;
  const f = fixture(), download = deferred(), calls = [], changes = [];
  let state = { state: 'idle', currentVersion: '0.1.0' };
  const controller = createUpdateController({ ...f.options,
    invoke: async command => {
      calls.push(command);
      if (command === 'get_update_status') return state;
      if (command === 'check_for_updates') {
        state = { ...state, state: 'downloading', version: '0.2.0', totalBytes: 100, downloadedBytes: 20 };
        await download.promise;
        state = { ...state, state: 'ready' };
      }
    },
    onChange: status => changes.push(status.state),
  });
  await controller.start();
  assert.equal(calls.includes('check_for_updates'), false);
  await f.tick(10);
  assert.equal(changes.includes('downloading'), true);
  await controller.check({ manual: true });
  assert.equal(calls.filter(x => x === 'check_for_updates').length, 1);
  download.resolve();
  await flush();
  assert.equal(controller.getStatus().state, 'ready');
  await f.tick(300);
  assert.equal(calls.filter(x => x === 'check_for_updates').length, 1);
  assert.equal(calls.includes('install_update'), false);
  controller.dispose();
});

test('automatic checking is throttled on foreground and retries after the interval', async () => {
  const { createUpdateController } = await updater;
  const f = fixture(), checks = [];
  const controller = createUpdateController({ ...f.options, invoke: async command => {
    if (command === 'get_update_status') return { state: 'idle', currentVersion: '0.1.0' };
    if (command === 'check_for_updates') checks.push(1);
  } });
  await controller.start();
  await f.tick(5);
  f.document.dispatchEvent(new Event('visibilitychange'));
  f.environment.dispatchEvent(new Event('online'));
  await flush();
  assert.equal(checks.length, 1);
  f.setTime(105);
  f.document.visibilityState = 'hidden';
  f.document.dispatchEvent(new Event('visibilitychange'));
  await flush();
  assert.equal(checks.length, 1);
  f.document.visibilityState = 'visible';
  f.document.dispatchEvent(new Event('visibilitychange'));
  await flush();
  assert.equal(checks.length, 2);
  await controller.check({ manual: true });
  assert.equal(checks.length, 3);
  controller.dispose();
  assert.equal(f.timers.size, 0);
});

test('disabled channels do not poll the network automatically', async () => {
  const { createUpdateController } = await updater;
  const f = fixture(), calls = [];
  const controller = createUpdateController({ ...f.options, invoke: async command => {
    calls.push(command);
    return { state: 'disabled', currentVersion: '0.1.0', message: 'Канал обновлений пока не настроен.' };
  } });
  await controller.start();
  await f.tick(305);
  assert.deepEqual(calls, ['get_update_status']);
  controller.dispose();
});

test('a failed check never announces latest and does not expose a rejected raw error', async () => {
  const { createUpdateController } = await updater;
  const f = fixture(), changes = [];
  const controller = createUpdateController({ ...f.options, invoke: async command => {
    if (command === 'check_for_updates') throw new Error('token=secret https://credentials@private.example');
    return { state: 'idle', currentVersion: '0.1.0' };
  }, onChange: (status, metadata) => changes.push({ status, metadata }) });
  await controller.start();
  await controller.check({ manual: true });
  const latest = changes.at(-1);
  assert.equal(latest.metadata.checkedAt, null);
  assert.match(latest.metadata.communicationError, /позже/);
  assert.equal(JSON.stringify(changes).includes('secret'), false);
  controller.dispose();
});

test('installation rechecks native readiness, suppresses duplicate clicks and reflects Android permission status', async () => {
  const { createUpdateController } = await updater;
  const f = fixture(), installation = deferred(), calls = [];
  let state = { state: 'ready', currentVersion: '0.1.0', version: '0.2.0', action: 'installer' };
  const controller = createUpdateController({ ...f.options, invoke: async command => {
    calls.push(command);
    if (command === 'get_update_status') return state;
    if (command === 'install_update') {
      await installation.promise;
      state = { ...state, message: 'Разрешите установку обновлений в настройках Android.' };
    }
  } });
  await controller.start();
  const pending = controller.install();
  await flush();
  await controller.install();
  assert.equal(calls.filter(x => x === 'install_update').length, 1);
  installation.resolve();
  await pending;
  assert.match(controller.getStatus().message, /Разрешите/);
  state = { state: 'idle', currentVersion: '0.2.0' };
  await controller.install();
  assert.equal(calls.filter(x => x === 'install_update').length, 1);
  controller.dispose();
});

test('disposing during initial status lookup does not leave timers or handlers behind', async () => {
  const { createUpdateController } = await updater;
  const f = fixture(), read = deferred(), changes = [];
  const controller = createUpdateController({ ...f.options, invoke: () => read.promise, onChange: state => changes.push(state) });
  const pending = controller.start();
  controller.dispose();
  read.resolve({ state: 'ready', currentVersion: '0.1.0', version: '0.2.0' });
  await pending;
  assert.equal(f.timers.size, 0);
  assert.equal(changes.length, 1);
});
