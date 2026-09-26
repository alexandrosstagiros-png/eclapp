import { createApiBridge, installLinkBridge, trackDatabases, clearServerData, switchServer, describeNativeError } from './bridge.mjs';
import { mountUpdateUI } from './updates.mjs';

const root = document.getElementById('root');
const shell = document.getElementById('native-shell');
const invoke = window.__TAURI__?.core?.invoke;
let config = null;
let runtime = { platform: 'unknown', version: '' };
let started = false;
let latestState = 'checking';
let lastDetail = '';
const originalFetch = window.fetch.bind(window);

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}
const toast = element('div', 'native-toast');
toast.setAttribute('role', 'status');
toast.hidden = true;
shell.append(toast);
let toastTimer;
function notice(message) {
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 10000);
}
const bar = element('footer', 'native-bar');
const state = element('span', 'native-connection');
state.setAttribute('role', 'status');
const settings = element('button', 'native-settings', 'Подключение');
settings.type = 'button';
settings.setAttribute('aria-label', 'Настройки подключения к серверу');
bar.append(state, settings);
shell.append(bar);
function transport(status, detail = '') {
  latestState = status;
  lastDetail = detail;
  state.dataset.state = status;
  state.textContent = ({ online: 'Сервер доступен', offline: 'Нет связи с сервером', degraded: 'Сбой на сервере', checking: 'Проверка соединения…' })[status];
  state.title = detail || config?.serverUrl || '';
}
transport('checking');
const bridge = createApiBridge({ invoke, originalFetch, locationHref: window.location.href, onTransport: transport, onNotice: notice });
const databases = trackDatabases(window.indexedDB);

async function health() {
  transport('checking');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await bridge.fetch('/api/v1/health/ready', { signal: controller.signal, credentials: 'omit' });
    if (!response.ok) throw new Error(`Сервер ответил с ошибкой HTTP ${response.status}. Проверьте его состояние.`);
    const payload = await response.json();
    if (!payload || typeof payload !== 'object') throw new Error('Ответ сервера не соответствует API ЕЦЛ. Проверьте адрес.');
    transport('online');
  } catch (error) {
    const message = /^Сервер |^Ответ сервера /.test(error.message) ? error.message :
      error.name === 'AbortError' ? 'Сервер не ответил за 15 секунд. Проверьте, что он запущен.' : describeNativeError(error);
    transport('offline', message);
    throw new Error(message);
  } finally { clearTimeout(timeout); }
}

async function startApp() {
  if (started) return;
  started = true;
  // A reopened WebView must never restore a prior access token from sessionStorage.
  window.sessionStorage.clear();
  window.fetch = bridge.fetch.bind(bridge);
  installLinkBridge({ environment: window, invoke, originalFetch, onNotice: notice });
  try { await import('./app.js'); }
  catch {
    root.replaceChildren(element('div', 'native-load-error', 'Не удалось загрузить интерфейс ЕЦЛ. Закройте и снова откройте приложение.'));
  }
}

function showConnection() {
  document.querySelector('.native-connect')?.remove();
  const initial = !started;
  const dialog = element('dialog', `native-connect${initial ? ' native-first-run' : ''}`);
  dialog.setAttribute('aria-labelledby', 'native-connect-title');
  const intro = element('div', 'native-connect-intro');
  const logo = element('img', 'native-connect-logo');
  logo.src = '/assets/ecl-logo-KqNBp_34.png';
  logo.alt = 'Единый центр логистики';
  intro.append(logo, element('p', 'native-eyebrow', 'РАБОЧЕЕ ПРОСТРАНСТВО ЕЦЛ'),
    element('h1', '', 'Все процессы.\nОдно приложение.'),
    element('p', '', 'Рейсы, команда, документы и планирование — в вашем рабочем пространстве.'));
  const facts = element('div', 'native-connect-facts');
  facts.append(element('span', '', 'Общий сервер компании'), element('span', '', 'Ваши роли и доступы'), element('span', '', 'Файлы на устройстве'));
  intro.append(facts);
  const form = element('form', 'native-connect-form');
  const heading = element('h2', '', initial ? 'Подключение к ЕЦЛ' : 'Сервер приложения');
  heading.id = 'native-connect-title';
  const isMobile = ['android', 'ios'].includes(runtime.platform);
  const description = element('p', 'native-muted', isMobile
    ? 'Введите HTTPS-адрес сервера компании. Адрес 127.0.0.1 на телефоне не подключает его к вашему Mac.'
    : 'Подключитесь к локальному серверу на этом компьютере или укажите HTTPS-адрес сервера компании.');
  const label = element('label', 'native-label', 'Адрес сервера');
  label.htmlFor = 'native-server-url';
  const input = element('input', 'native-input');
  input.id = 'native-server-url';
  input.name = 'serverUrl';
  input.type = 'url';
  input.required = true;
  input.autocomplete = 'url';
  input.autocapitalize = 'off';
  input.spellcheck = false;
  input.placeholder = isMobile ? 'https://ecl.example.ru' : 'http://127.0.0.1:18514';
  input.value = config?.serverUrl || (isMobile ? '' : 'http://127.0.0.1:18514');
  const helper = element('p', 'native-hint', 'Для удалённого сервера требуется HTTPS. Локальный HTTP работает только на этом устройстве.');
  const sessionNote = element('p', 'native-session-note', 'После закрытия приложения потребуется снова войти. Пароль не сохраняется.');
  const message = element('p', 'native-error', runtime.configWarning || (latestState === 'offline' ? lastDetail : ''));
  message.setAttribute('role', 'alert');
  const resetLabel = element('label', 'native-reset-label');
  const resetCheck = element('input');
  resetCheck.type = 'checkbox';
  resetLabel.append(resetCheck, element('span', '', 'Завершить текущий вход и удалить локальные черновики, фото и настройки при смене сервера. Несинхронизированные изменения будут потеряны.'));
  resetLabel.hidden = initial;
  function normalize(value) { return value.trim().replace(/\/+$/, ''); }
  function updateReset() {
    resetLabel.hidden = initial || normalize(input.value) === normalize(config?.serverUrl || '');
    resetCheck.required = !resetLabel.hidden;
    resetCheck.checked = false;
  }
  input.addEventListener('input', updateReset);
  updateReset();
  const actions = element('div', 'native-connect-actions');
  const connect = element('button', 'native-button native-primary', initial ? 'Подключиться' : 'Проверить и сохранить');
  connect.type = 'submit';
  actions.append(connect);
  if (!initial) {
    const close = element('button', 'native-button native-secondary', 'Закрыть');
    close.type = 'button';
    close.addEventListener('click', () => { dialog.close(); dialog.remove(); settings.focus(); });
    actions.append(close);
  }
  const footer = element('p', 'native-version', `ЕЦЛ${runtime.version ? ` · ${runtime.version}` : ''}`);
  form.append(heading, description, label, input, helper, sessionNote, resetLabel, message, actions, footer);
  dialog.append(intro, form);
  shell.append(dialog);
  if (initial) dialog.addEventListener('cancel', event => event.preventDefault());
  dialog.showModal();
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const serverUrl = normalize(input.value);
    connect.disabled = true;
    input.disabled = true;
    connect.textContent = 'Подключение…';
    message.textContent = '';
    try {
      if (!initial && serverUrl !== normalize(config.serverUrl)) {
        await switchServer({ serverUrl, bridge, invoke, environment: window, databases, reload: () => window.location.reload() });
        return;
      }
      if (initial) {
        // Also cover settings recovery after a missing/corrupt config file.
        // No application database connection exists before startApp().
        await clearServerData(window);
        config = await invoke('set_server', { serverUrl });
      }
      await health();
      dialog.close(); dialog.remove();
      await startApp();
    } catch (error) {
      message.textContent = /^Сервер |^Ответ сервера |^Нет связи /.test(error.message || '') ? error.message : describeNativeError(error);
      if (bridge.suspended) {
        message.textContent += ' Перезапустите приложение, чтобы продолжить.';
        connect.textContent = 'Перезапустить';
        connect.type = 'button';
        connect.onclick = () => window.location.reload();
      }
    } finally {
      connect.disabled = false;
      input.disabled = bridge.suspended;
      if (!bridge.suspended) connect.textContent = initial ? 'Подключиться' : 'Проверить и сохранить';
    }
  });
}

settings.addEventListener('click', showConnection);
window.addEventListener('online', () => { if (config && !bridge.suspended) health().catch(() => {}); });
window.addEventListener('offline', () => transport('offline', 'Устройство сообщает об отсутствии сети. Локальный сервер может оставаться доступным.'));

if (!invoke) {
  transport('offline');
  root.append(element('div', 'native-load-error', 'Этот интерфейс запускается внутри приложения ЕЦЛ. Для проверки используйте команду npm run dev в папке native.'));
  settings.disabled = true;
} else {
  mountUpdateUI({ invoke, shell, bar });
  try {
    [config, runtime] = await Promise.all([invoke('get_config'), invoke('get_runtime')]);
    if (!config?.serverUrl) showConnection();
    else {
      // Keep all role-based workspaces and stored drafts available while offline.
      await startApp();
      health().catch(error => notice(error.message));
    }
  } catch {
    transport('offline');
    notice('Не удалось прочитать настройки приложения. Откройте настройки подключения или перезапустите приложение.');
    showConnection();
  }
}
