// The bundled UI speaks to its normal /api/v1 routes. Only Rust knows the server.
export const DRAFT_DATABASES = ['transport-local-drafts', 'transport-inspection-drafts'];
const MAX_TRANSFER = 40 * 1024 * 1024;

export function toBase64(bytes) {
  let result = '';
  for (let offset = 0; offset < bytes.length; offset += 0x6000)
    result += btoa(String.fromCharCode(...bytes.subarray(offset, offset + 0x6000)));
  return result;
}
export function fromBase64(value) {
  const decoded = atob(value || '');
  return Uint8Array.from(decoded, character => character.charCodeAt(0));
}
export function abortError() {
  return new DOMException('Ожидание отменено. Уже отправленное действие могло выполниться на сервере.', 'AbortError');
}
export function withAbort(promise, signal) {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const abort = () => { cleanup(); reject(abortError()); };
    const cleanup = () => signal.removeEventListener('abort', abort);
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve(promise).then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
  });
}
export function isApiUrl(url, locationHref) {
  const local = new URL(locationHref);
  return url.protocol === local.protocol && url.host === local.host &&
    (url.pathname === '/api/v1' || url.pathname.startsWith('/api/v1/'));
}
export function describeNativeError(error) {
  const text = String(error?.message || error || '').toLowerCase();
  if (/certificate|certificat|tls|ssl|сертификат|защищ[её]н/.test(text)) return 'Не удалось проверить защищённое соединение. Проверьте сертификат сервера и дату на устройстве.';
  if (/https|loopback|localhost|cleartext|scheme/.test(text)) return 'Для удалённого сервера нужен адрес HTTPS. HTTP доступен только для локального сервера на этом устройстве.';
  if (/url|address|origin|host|адрес/.test(text)) return 'Проверьте адрес сервера: например, https://ecl.example.ru. Не добавляйте путь, пароль или параметры.';
  if (/size|large|limit|размер/.test(text)) return 'Файл слишком большой для передачи. Выберите файл меньше 40 МБ.';
  if (/blocked|storage|хранилищ/.test(text)) return 'Не удалось очистить локальное хранилище. Закройте и снова откройте приложение перед сменой сервера.';
  if (/timeout|timed out/.test(text)) return 'Сервер не ответил вовремя. Проверьте, что он запущен, и повторите попытку.';
  return 'Нет связи с сервером. Проверьте адрес, подключение и доступность сервера.';
}

export function createApiBridge({ invoke, originalFetch, locationHref, onTransport = () => {}, onNotice = () => {} }) {
  let suspended = false;
  let epoch = 0;
  return {
    suspend() { suspended = true; epoch++; },
    get suspended() { return suspended; },
    async fetch(input, init) {
      const url = new URL(input instanceof Request ? input.url : String(input), locationHref);
      if (!isApiUrl(url, locationHref)) return originalFetch(input, init);
      if (suspended) throw abortError();
      const requestEpoch = epoch;
      const request = new Request(input instanceof Request ? input : url.href, init);
      if (request.signal.aborted) throw abortError();
      const headers = Object.fromEntries(request.headers.entries());
      // Browser cookies never cross IPC; Rust owns its per-session cookie jar.
      for (const name of ['cookie', 'cookie2', 'host', 'content-length', 'origin', 'referer']) delete headers[name];
      let body = null;
      if (!['GET', 'HEAD'].includes(request.method)) {
        body = new Uint8Array(await withAbort(request.arrayBuffer(), request.signal));
        if (body.byteLength > MAX_TRANSFER) throw new Error('Request body size limit');
        if (url.pathname === '/api/v1/auth/password' && /application\/json/i.test(headers['content-type'] || '')) {
          const value = JSON.parse(new TextDecoder().decode(body));
          value.rememberDevice = false;
          body = new TextEncoder().encode(JSON.stringify(value));
        }
      }
      if (suspended || requestEpoch !== epoch || request.signal.aborted) throw abortError();
      const operation = invoke('api_request', { request: {
        path: url.pathname + url.search,
        method: request.method,
        headers,
        bodyBase64: body?.byteLength ? toBase64(body) : null,
        credentials: request.credentials !== 'omit',
      }}).then(result => {
        if (suspended || requestEpoch !== epoch) throw abortError();
        onTransport(result.status >= 500 ? 'degraded' : 'online');
        const responseHeaders = new Headers(result.headers);
        responseHeaders.delete('set-cookie');
        responseHeaders.delete('set-cookie2');
        const noBody = request.method === 'HEAD' || [204, 205, 304].includes(result.status);
        return new Response(noBody ? null : fromBase64(result.bodyBase64), { status: result.status, headers: responseHeaders });
      }, error => {
        if (suspended || requestEpoch !== epoch) throw abortError();
        onTransport('offline', describeNativeError(error));
        throw new TypeError(describeNativeError(error));
      });
      try { return await withAbort(operation, request.signal); }
      catch (error) {
        if (error.name === 'AbortError' && !['GET', 'HEAD', 'OPTIONS'].includes(request.method))
          onNotice('Ожидание отменено. Действие могло выполниться на сервере: обновите данные перед повторной отправкой.');
        throw error;
      }
    },
  };
}

export function trackDatabases(indexedDB) {
  if (!indexedDB) return { close() {} };
  const originalOpen = indexedDB.open.bind(indexedDB);
  const connections = new Set();
  let closed = false;
  indexedDB.open = function (...args) {
    if (closed) throw new DOMException('Хранилище закрыто для смены сервера.', 'InvalidStateError');
    const request = originalOpen(...args);
    request.addEventListener('success', () => {
      const database = request.result;
      if (closed) database.close();
      else {
        connections.add(database);
        database.addEventListener('close', () => connections.delete(database));
        database.addEventListener('versionchange', () => database.close());
      }
    });
    return request;
  };
  return { close() { closed = true; for (const database of connections) database.close(); connections.clear(); } };
}

export async function clearServerData(environment, databases = { close() {} }) {
  databases.close();
  environment.sessionStorage.clear();
  environment.localStorage.clear();
  if (environment.caches) {
    for (const key of await environment.caches.keys()) await environment.caches.delete(key);
  }
  if (environment.navigator?.serviceWorker) {
    for (const registration of await environment.navigator.serviceWorker.getRegistrations()) await registration.unregister();
  }
  if (environment.indexedDB) {
    const names = new Set(DRAFT_DATABASES);
    if (typeof environment.indexedDB.databases === 'function') {
      for (const database of await environment.indexedDB.databases()) if (database.name) names.add(database.name);
    }
    for (const name of names) await new Promise((resolve, reject) => {
      const request = environment.indexedDB.deleteDatabase(name);
      const timer = setTimeout(() => reject(new Error('Local storage blocked')), 5000);
      request.onsuccess = () => { clearTimeout(timer); resolve(); };
      request.onerror = () => { clearTimeout(timer); reject(new Error('Local storage failed')); };
      request.onblocked = () => { clearTimeout(timer); reject(new Error('Local storage blocked')); };
    });
  }
}

export async function switchServer({ serverUrl, bridge, invoke, environment, databases, reload }) {
  // No subsequent old-session request can run against the newly selected server.
  bridge.suspend();
  // Timers from the old UI cannot repopulate storage after it has been cleared.
  if (environment.Storage?.prototype) {
    environment.Storage.prototype.setItem = function () {
      throw new DOMException('Хранилище закрыто для смены сервера.', 'InvalidStateError');
    };
  }
  await clearServerData(environment, databases);
  const config = await invoke('set_server', { serverUrl });
  reload();
  return config;
}

export function installLinkBridge({ environment, invoke, originalFetch, onNotice = () => {} }) {
  const { document, HTMLAnchorElement } = environment;
  const originalClick = HTMLAnchorElement.prototype.click;
  const handle = anchor => {
    const href = anchor.href;
    if (!href) return false;
    let url;
    try { url = new URL(href, environment.location.href); } catch { return false; }
    if (url.protocol === 'blob:' && anchor.hasAttribute('download')) {
      // Begin reading synchronously: existing download helpers revoke blob URLs soon after click().
      const download = originalFetch(href).then(response => response.arrayBuffer()).then(bytes => {
        if (bytes.byteLength > MAX_TRANSFER) throw new Error('Download size limit');
        return invoke('save_download', { filename: anchor.download || 'Документ', bodyBase64: toBase64(new Uint8Array(bytes)) });
      });
      download.then(saved => { if (saved) onNotice('Файл сохранён.'); }, error => onNotice(describeNativeError(error)));
      return true;
    }
    if (['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol) &&
        !(url.protocol === environment.location.protocol && url.host === environment.location.host)) {
      invoke('open_external', { url: url.href }).catch(() => onNotice('Не удалось открыть ссылку на этом устройстве.'));
      return true;
    }
    return false;
  };
  HTMLAnchorElement.prototype.click = function () { if (!handle(this)) return originalClick.call(this); };
  const listener = event => {
    const anchor = event.target.closest?.('a[href]');
    if (anchor && handle(anchor)) { event.preventDefault(); event.stopImmediatePropagation(); }
  };
  document.addEventListener('click', listener, true);
  return () => { HTMLAnchorElement.prototype.click = originalClick; document.removeEventListener('click', listener, true); };
}
