const CHECK_INTERVAL = 30 * 60 * 1000;
const ACTIVE_STATES = new Set(['checking', 'downloading', 'installing']);

export function describeUpdateStatus(status, { busy = false, communicationError = '' } = {}) {
  const version = status.version ? ` ${status.version}` : '';
  const usesInstaller = status.action === 'installer';
  const descriptions = {
    disabled: ['Автообновление ещё не настроено', 'Для этой сборки пока не настроен канал обновлений.'],
    idle: [status.checked === true ? 'Установлена актуальная версия' : 'Автоматическая проверка', 'Новые версии проверяются при запуске и каждые 30 минут.'],
    checking: ['Проверяем новую версию…', 'Можно продолжать работу.'],
    downloading: [`Загружаем версию${version}`, 'Можно продолжать работу. Сообщим, когда обновление будет готово.'],
    ready: [`Версия${version} готова к установке`, usesInstaller
      ? 'Сохраните изменения. Android откроет установку обновления и при необходимости попросит разрешение.'
      : 'Сохраните изменения. Для установки приложение закроется и запустится снова.'],
    installing: ['Устанавливаем обновление…', usesInstaller ? 'Следуйте указаниям Android, затем откройте ЕЦЛ.' : 'Приложение перезапустится после установки.'],
    external: [`Доступна новая версия${version}`, 'Откройте страницу обновления и следуйте указаниям устройства.'],
    error: ['Не удалось проверить или загрузить обновление', 'Можно продолжать работу. Проверим ещё раз позже.'],
  };
  const [defaultHeading, fallback] = descriptions[status.state] || descriptions.error;
  const heading = communicationError && status.state === 'idle' ? 'Не удалось проверить обновление' : defaultHeading;
  const actionable = ['ready', 'external'].includes(status.state);
  const total = Number(status.totalBytes);
  const downloaded = Number(status.downloadedBytes);
  const percent = Number.isFinite(total) && total > 0 && Number.isFinite(downloaded) && downloaded >= 0
    ? Math.min(100, Math.floor(downloaded / total * 100)) : null;
  return {
    heading,
    detail: communicationError || status.message || fallback,
    badge: actionable ? 'Обновить' : status.state === 'downloading' ? 'Загрузка…' : 'Обновления',
    actionable,
    progress: status.state === 'downloading' ? percent : null,
    showProgress: status.state === 'downloading',
    action: status.state === 'ready' ? (usesInstaller ? 'Установить обновление' : 'Перезапустить и обновить') : status.state === 'external' ? 'Открыть обновление' : '',
    canCheck: !busy && !ACTIVE_STATES.has(status.state) && !actionable && status.state !== 'disabled',
    busy: busy || ACTIVE_STATES.has(status.state),
  };
}

// All update URLs, signatures and downloaded packages stay in Rust. This controller
// only schedules checks and reflects the native status; it never installs on a timer.
export function createUpdateController({ invoke, onChange = () => {}, currentVersion = '',
  clock = globalThis, now = () => Date.now(), document: doc = globalThis.document,
  environment = globalThis, checkInterval = CHECK_INTERVAL, startupDelay = 5000, pollInterval = 1000 }) {
  let status = { state: 'idle', currentVersion };
  let checkedAt = null;
  let lastAttemptAt = null;
  let communicationError = '';
  let checking = false;
  let installing = false;
  let disposed = false;
  let started = false;
  let statusSequence = 0;
  let refreshPromise = null;
  let startupTimer, checkTimer, pollTimer;
  const metadata = () => ({ checkedAt, busy: checking || installing, communicationError });
  const emit = () => { if (!disposed) onChange(status, metadata()); };

  function refresh() {
    if (disposed) return Promise.resolve(status);
    if (refreshPromise) return refreshPromise;
    const sequence = ++statusSequence;
    refreshPromise = Promise.resolve().then(() => invoke('get_update_status')).then(value => {
      if (!disposed && sequence === statusSequence) {
        status = value;
        communicationError = '';
        emit();
      }
      return status;
    }).catch(() => {
      if (!disposed) {
        communicationError = 'Не удалось получить состояние обновления. Попробуйте ещё раз.';
        emit();
      }
      return status;
    }).finally(() => { refreshPromise = null; });
    return refreshPromise;
  }

  async function check({ manual = false, scheduled = false } = {}) {
    if (disposed || checking || installing || ACTIVE_STATES.has(status.state) || status.state === 'ready') return;
    if (!manual && (status.state === 'disabled' || (!scheduled && lastAttemptAt !== null && now() - lastAttemptAt < checkInterval))) return;
    lastAttemptAt = now();
    checking = true;
    communicationError = '';
    emit();
    let failed = false;
    try {
      await invoke('check_for_updates');
    } catch {
      failed = true;
    } finally {
      await refresh();
      checking = false;
      if (!failed && status.state === 'idle') checkedAt = now();
      if (failed && status.state !== 'error' && status.state !== 'disabled') {
        communicationError = 'Не удалось проверить обновление. Можно продолжать работу и попробовать позже.';
      }
      emit();
    }
  }

  async function install() {
    if (disposed || installing || checking) return;
    installing = true;
    communicationError = '';
    emit();
    try {
      await refresh();
      if (disposed || !['ready', 'external'].includes(status.state)) return;
      await invoke('install_update');
      await refresh();
    } catch {
      communicationError = 'Не удалось установить или открыть обновление. Попробуйте ещё раз.';
    } finally {
      installing = false;
      emit();
    }
  }

  const foreground = () => { if (!doc || doc.visibilityState === 'visible') void check(); };
  async function start() {
    if (started || disposed) return;
    started = true;
    emit();
    await refresh();
    if (disposed) return;
    startupTimer = clock.setTimeout(() => { void check(); }, startupDelay);
    checkTimer = clock.setInterval(() => { void check({ scheduled: true }); }, checkInterval);
    pollTimer = clock.setInterval(() => {
      if (checking || installing || ACTIVE_STATES.has(status.state)) void refresh();
    }, pollInterval);
    doc?.addEventListener('visibilitychange', foreground);
    environment?.addEventListener('online', foreground);
  }

  function dispose() {
    disposed = true;
    ++statusSequence;
    clock.clearTimeout(startupTimer);
    clock.clearInterval(checkTimer);
    clock.clearInterval(pollTimer);
    doc?.removeEventListener('visibilitychange', foreground);
    environment?.removeEventListener('online', foreground);
  }
  return { start, refresh, check, install, dispose, getStatus: () => status };
}

export function mountUpdateUI({ invoke, shell, bar, currentVersion = '', environment = window }) {
  const doc = environment.document;
  function element(tag, className, text) {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }
  const trigger = element('button', 'native-updates-trigger', 'Обновления');
  trigger.type = 'button';
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-controls', 'native-updates-panel');
  bar.insertBefore(trigger, bar.lastElementChild);

  const panel = element('section', 'native-updates-panel');
  panel.id = 'native-updates-panel';
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-labelledby', 'native-updates-title');
  const header = element('div', 'native-updates-header');
  const title = element('h2', '', 'Обновления ЕЦЛ');
  title.id = 'native-updates-title';
  const close = element('button', 'native-updates-close', '×');
  close.type = 'button';
  close.setAttribute('aria-label', 'Закрыть панель обновлений');
  header.append(title, close);
  const installed = element('p', 'native-updates-version');
  const heading = element('h3', 'native-updates-heading');
  const detail = element('p', 'native-updates-detail');
  const progress = element('progress', 'native-updates-progress');
  progress.max = 100;
  progress.setAttribute('aria-label', 'Загрузка обновления');
  const actions = element('div', 'native-updates-actions');
  const action = element('button', 'native-button native-primary');
  action.type = 'button';
  const check = element('button', 'native-button native-secondary', 'Проверить обновления');
  check.type = 'button';
  actions.append(action, check);
  panel.append(header, installed, heading, detail, progress, actions);
  shell.append(panel);
  const announcement = element('span', 'native-visually-hidden');
  announcement.setAttribute('role', 'status');
  announcement.setAttribute('aria-live', 'polite');
  shell.append(announcement);
  let confirmation = null;
  let lastAnnouncement = '';

  function closePanel() {
    panel.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    trigger.focus();
  }
  trigger.addEventListener('click', () => {
    const opening = panel.hidden;
    panel.hidden = !opening;
    trigger.setAttribute('aria-expanded', String(opening));
    if (opening) { void controller.refresh(); close.focus(); }
  });
  close.addEventListener('click', closePanel);
  panel.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); closePanel(); }
  });
  const outside = event => {
    if (!panel.hidden && !confirmation && !panel.contains(event.target) && !trigger.contains(event.target)) {
      panel.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
    }
  };
  doc.addEventListener('pointerdown', outside);

  const controller = createUpdateController({ invoke, currentVersion, document: doc, environment,
    onChange(status, metadata) {
      const view = describeUpdateStatus(status, metadata);
      trigger.textContent = view.badge;
      trigger.dataset.state = status.state;
      trigger.setAttribute('aria-label', `Обновления: ${view.heading}`);
      trigger.title = view.heading;
      installed.textContent = `Установлена версия ${status.currentVersion || currentVersion || '—'}`;
      heading.textContent = view.heading;
      detail.textContent = view.detail;
      progress.hidden = !view.showProgress;
      if (view.progress === null) progress.removeAttribute('value');
      else progress.value = view.progress;
      action.hidden = !view.action;
      action.textContent = view.action;
      action.disabled = view.busy;
      check.hidden = view.actionable || status.state === 'disabled';
      check.disabled = !view.canCheck;
      if (view.actionable && lastAnnouncement !== `${status.state}:${status.version}`) {
        lastAnnouncement = `${status.state}:${status.version}`;
        announcement.textContent = `${view.heading}. ${view.detail}`;
      }
      if (confirmation && status.state !== 'ready' && !metadata.busy) {
        confirmation.close();
      }
    },
  });
  check.addEventListener('click', () => { void controller.check({ manual: true }); });
  action.addEventListener('click', () => {
    if (controller.getStatus().state === 'external' || controller.getStatus().action === 'installer') { void controller.install(); return; }
    if (controller.getStatus().state !== 'ready' || confirmation) return;
    confirmation = element('dialog', 'native-update-confirm');
    confirmation.setAttribute('aria-labelledby', 'native-update-confirm-title');
    const confirmTitle = element('h2', '', 'Перезапустить ЕЦЛ?');
    confirmTitle.id = 'native-update-confirm-title';
    const text = element('p', '', 'Сохраните документы и завершите отправку файлов. Приложение закроется для обновления; после запуска потребуется снова войти.');
    const buttons = element('div', 'native-updates-actions');
    const later = element('button', 'native-button native-secondary', 'Продолжить работу');
    later.type = 'button';
    later.autofocus = true;
    const restart = element('button', 'native-button native-primary', 'Перезапустить и обновить');
    restart.type = 'button';
    buttons.append(later, restart);
    confirmation.append(confirmTitle, text, buttons);
    confirmation.addEventListener('close', () => {
      confirmation?.remove();
      confirmation = null;
      action.focus();
    });
    later.addEventListener('click', () => confirmation.close());
    restart.addEventListener('click', () => {
      confirmation.close();
      void controller.install();
    });
    shell.append(confirmation);
    confirmation.showModal();
  });
  void controller.start();
  return () => {
    controller.dispose();
    doc.removeEventListener('pointerdown', outside);
    confirmation?.remove();
    trigger.remove(); panel.remove(); announcement.remove();
  };
}
