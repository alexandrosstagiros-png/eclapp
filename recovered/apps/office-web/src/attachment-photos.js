// Photo capture and authenticated previews. Files are only handed to the caller.
const PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const stopTracks = stream => stream?.getTracks?.().forEach(track => { try { track.stop(); } catch {} });
const cleanType = type => String(type || '').split(';', 1)[0].trim().toLowerCase();
const photoName = name => /\.(jpe?g|png|webp)$/i.test(String(name || ''));
const cameraError = error => ({
  NotAllowedError: 'Доступ к камере запрещён. Разрешите его в настройках браузера или откройте камеру устройства.',
  PermissionDeniedError: 'Браузер не получил разрешение на камеру. Можно открыть камеру устройства.',
  NotFoundError: 'Камера не найдена. Подключите её или выберите готовую фотографию.',
  NotReadableError: 'Камера занята другим приложением или недоступна. Попробуйте ещё раз.',
  SecurityError: 'Браузер не разрешает доступ к камере. Можно открыть камеру устройства.',
})[error?.name] || error?.message || 'Не удалось включить камеру.';

async function verifiedPhoto(blob) {
  if (!blob || !blob.size || typeof blob.slice !== 'function') throw new Error('Фотография пуста или недоступна.');
  const bytes = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  const jpeg = bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const png = bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value);
  const webp = bytes.length >= 12 && [82, 73, 70, 70].every((value, index) => bytes[index] === value) && [87, 69, 66, 80].every((value, index) => bytes[index + 8] === value);
  if (!jpeg && !png && !webp) throw new Error('Предпросмотр доступен для фотографий JPEG, PNG и WebP.');
  return blob.slice(0, blob.size, jpeg ? 'image/jpeg' : png ? 'image/png' : 'image/webp');
}

async function jpegFromSource(source, width, height, maxBytes) {
  if (!width || !height) throw new Error('Камера ещё не передала изображение. Попробуйте сделать снимок ещё раз.');
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { alpha: false });
  if (!context || !canvas.toBlob) throw new Error('Не удалось подготовить снимок. Откройте камеру устройства.');
  const limit = Number.isFinite(maxBytes) && maxBytes > 0 ? maxBytes : 10 * 1024 * 1024;
  let scale = Math.min(1, 2560 / Math.max(width, height));
  try {
    for (let round = 0; round < 6; round++) {
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(source, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.9, 0.78, 0.64, 0.5]) {
        const blob = await new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Не удалось сохранить снимок.')), 'image/jpeg', quality));
        if (blob.size <= limit && cleanType(blob.type) === 'image/jpeg') {
          return new File([blob], `Фото-${new Date().toISOString().replace(/[:.]/g, '-')}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
        }
      }
      scale *= 0.72;
    }
    throw new Error('Снимок превышает допустимый размер. Попробуйте сделать другой снимок.');
  } finally { canvas.width = canvas.height = 1; }
}

async function jpegFromFile(file, maxBytes) {
  const blob = await verifiedPhoto(file);
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
    try { return await jpegFromSource(bitmap, bitmap.width, bitmap.height, maxBytes); }
    finally { bitmap.close(); }
  }
  const url = URL.createObjectURL(blob), source = new Image();
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Не удалось прочитать фотографию.')), 15000);
      source.onload = () => { clearTimeout(timeout); resolve(); };
      source.onerror = () => { clearTimeout(timeout); reject(new Error('Не удалось прочитать фотографию.')); };
      source.src = url;
    });
    return await jpegFromSource(source, source.naturalWidth, source.naturalHeight, maxBytes);
  } finally { source.src = ''; URL.revokeObjectURL(url); }
}

export function createAttachmentPhotos({ React, jsx, loadFile }) {
  const { useEffect, useRef, useState } = React;
  const h = (type, props, ...children) => jsx?.jsxs
    ? jsx.jsxs(type, { ...props, ...(children.length ? { children: children.length === 1 ? children[0] : children } : {}) })
    : React.createElement(type, props, ...children);
  const button = (label, onClick, props = {}) => h('button', { type: 'button', className: 'button attachment-photo-button', onClick, ...props }, label);

  function PhotoDialog({ title, onClose, children, wide = false }) {
    const dialog = useRef(null), close = useRef(onClose); close.current = onClose;
    useEffect(() => {
      const node = dialog.current, previous = document.activeElement, overflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      try { if (typeof node.showModal === 'function') node.showModal(); else node.setAttribute('open', ''); }
      catch { node.setAttribute('open', ''); }
      node.querySelector('button:not([disabled])')?.focus();
      const keydown = event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close.current(); return; }
        if (event.key !== 'Tab') return;
        const nodes = [...node.querySelectorAll('button:not([disabled]),input:not([disabled]):not([type="hidden"]),[tabindex="0"],a[href]')].filter(item => item.getClientRects().length);
        if (!nodes.length) { event.preventDefault(); node.focus(); return; }
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (!node.contains(document.activeElement)) { event.preventDefault(); first.focus(); }
        else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      };
      node.addEventListener('keydown', keydown);
      return () => {
        node.removeEventListener('keydown', keydown);
        if (typeof node.close === 'function' && node.open) node.close();
        document.body.style.overflow = overflow;
        if (previous?.isConnected) previous.focus();
      };
    }, []);
    return h('dialog', {
      ref: dialog, className: `attachment-photo-dialog${wide ? ' is-wide' : ''}`, role: 'dialog', 'aria-modal': true, 'aria-label': title, tabIndex: -1,
      onCancel: event => { event.preventDefault(); close.current(); },
      onClick: event => { if (event.target === event.currentTarget) close.current(); },
    }, h('div', { className: 'attachment-photo-dialog-panel' },
      h('header', { className: 'attachment-photo-dialog-header' }, h('h2', null, title), button('Закрыть', () => close.current(), { 'aria-label': 'Закрыть просмотр' })),
      children));
  }

  function PhotoViewer({ url, alt, onClose }) {
    const [zoom, setZoom] = useState(1), [size, setSize] = useState({ width: 0, height: 0 }), [natural, setNatural] = useState({ width: 0, height: 0 }), [failed, setFailed] = useState(false);
    const viewport = useRef(null);
    useEffect(() => {
      const node = viewport.current;
      const resize = () => setSize({ width: node.clientWidth, height: node.clientHeight });
      resize();
      const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
      observer?.observe(node); window.addEventListener('resize', resize);
      return () => { observer?.disconnect(); window.removeEventListener('resize', resize); };
    }, []);
    const fit = natural.width && size.width ? Math.min(1, Math.max(1, size.width - 24) / natural.width, Math.max(1, size.height - 24) / natural.height) : 1;
    const width = Math.round(natural.width * fit * zoom), height = Math.round(natural.height * fit * zoom);
    return h(PhotoDialog, { title: 'Просмотр фотографии', onClose, wide: true },
      h('div', { className: 'attachment-photo-toolbar', role: 'group', 'aria-label': 'Масштаб фотографии' },
        button('−', () => setZoom(value => Math.max(0.5, value - 0.25)), { disabled: zoom <= 0.5, 'aria-label': 'Уменьшить фотографию' }),
        h('output', { 'aria-live': 'polite', 'aria-label': 'Масштаб' }, `${Math.round(zoom * 100)}%`),
        button('+', () => setZoom(value => Math.min(4, value + 0.25)), { disabled: zoom >= 4, 'aria-label': 'Увеличить фотографию' }),
        button('Сбросить масштаб', () => { setZoom(1); viewport.current?.scrollTo?.(0, 0); })),
      h('div', { ref: viewport, className: 'attachment-photo-viewport', tabIndex: 0, 'aria-label': 'Фотография. При увеличении можно прокручивать.' },
        failed ? h('p', { className: 'attachment-photo-error', role: 'alert' }, 'Не удалось показать фотографию.') :
          h('div', { className: 'attachment-photo-canvas', style: { width: Math.max(size.width, width + 24) || '100%', height: Math.max(size.height, height + 24) || '100%' } },
            h('img', { src: url, alt: alt || 'Фотография', draggable: false, className: 'attachment-photo-full', style: natural.width ? { width, height } : { maxWidth: '100%', maxHeight: '100%' }, onLoad: event => setNatural({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight }), onError: () => setFailed(true) }))),
      alt && h('p', { className: 'attachment-photo-caption' }, alt));
  }

  function PhotoSurface({ url, alt, busy, error, onRetry }) {
    const [open, setOpen] = useState(false), [failed, setFailed] = useState(false);
    useEffect(() => { setOpen(false); setFailed(false); }, [url]);
    return h('div', { className: 'attachment-photo-preview' },
      url && !failed && h('button', { type: 'button', className: 'attachment-photo-thumbnail', 'aria-label': `Открыть фото${alt ? `: ${alt}` : ''}`, onClick: () => setOpen(true) },
        h('img', { src: url, alt: alt || 'Фотография', loading: 'lazy', onError: () => setFailed(true) }),
        h('span', null, 'Рассмотреть фото')),
      busy && h('span', { className: 'attachment-photo-status', role: 'status' }, 'Загружаем фотографию…'),
      (error || failed) && h('div', { className: 'attachment-photo-error', role: 'alert' },
        h('span', null, error || 'Не удалось показать фотографию.'),
        onRetry && button('Повторить', () => { setFailed(false); onRetry(); })),
      open && url && h(PhotoViewer, { url, alt, onClose: () => setOpen(false) }));
  }

  function PhotoPreview({ token, path, alt, filename, onExpired }) {
    const target = useRef(null), expired = useRef(onExpired); expired.current = onExpired;
    const [visible, setVisible] = useState(false), [attempt, setAttempt] = useState(0), [state, setState] = useState({});
    const eligible = Boolean(path);
    const identity = JSON.stringify([token, path, attempt]);
    useEffect(() => {
      if (!eligible || !target.current) return;
      if (typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
      const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); } }, { rootMargin: '160px' });
      observer.observe(target.current);
      return () => observer.disconnect();
    }, [eligible, path]);
    useEffect(() => {
      if (!eligible || !visible || !token) return;
      const abort = new AbortController(); let active = true, objectUrl = '';
      setState({ identity, busy: true });
      (async () => {
        try {
          const blob = await loadFile(token, path, { signal: abort.signal });
          if (!active) return;
          const image = await verifiedPhoto(blob);
          if (!active) return;
          objectUrl = URL.createObjectURL(image);
          setState({ identity, url: objectUrl });
        } catch (error) {
          if (!active || abort.signal.aborted) return;
          setState({ identity, error: error?.status === 401 ? 'Сеанс истёк. Войдите в приложение снова.' : 'Не удалось загрузить фотографию. Повторите попытку.' });
          if (error?.status === 401) expired.current?.();
        }
      })();
      return () => { active = false; abort.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
    }, [eligible, visible, token, path, attempt]);
    if (!eligible) return null;
    const current = state.identity === identity ? state : {};
    return h('div', { className: 'attachment-photo-remote', ref: target },
      h(PhotoSurface, { url: current.url, alt: alt || filename, busy: current.busy || (!current.url && !current.error), error: current.error, onRetry: () => setAttempt(value => value + 1) }));
  }

  function LocalPhotoPreview({ file, alt }) {
    const [state, setState] = useState({}), [attempt, setAttempt] = useState(0);
    const eligible = Boolean(file) && (PHOTO_TYPES.has(cleanType(file.type)) || (!cleanType(file.type) && photoName(file.name)));
    useEffect(() => {
      if (!eligible) return;
      let active = true, objectUrl = '';
      setState({ file, busy: true });
      verifiedPhoto(file).then(blob => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob); setState({ file, url: objectUrl });
      }).catch(error => { if (active) setState({ file, error: error.message || 'Не удалось открыть фотографию.' }); });
      return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
    }, [eligible, file, attempt]);
    if (!eligible) return null;
    const current = state.file === file ? state : {};
    return h(PhotoSurface, { url: current.url, alt: alt || file.name, busy: current.busy || (!current.url && !current.error), error: current.error, onRetry: () => setAttempt(value => value + 1) });
  }

  function CameraDialog({ onClose, onFiles, maxBytes }) {
    const [status, setStatus] = useState('starting'), [error, setError] = useState(''), [preview, setPreview] = useState(null);
    const video = useRef(null), nativeInput = useRef(null), run = useRef(null), requesting = useRef(false), epoch = useRef(0), mounted = useRef(true), previewUrl = useRef(''), committing = useRef(false), callbacks = useRef({ onFiles, onClose });
    callbacks.current = { onFiles, onClose };
    const active = generation => mounted.current && epoch.current === generation;
    function release() {
      requesting.current = false;
      const previous = run.current; run.current = null;
      previous?.cancelReady?.(); stopTracks(previous?.stream);
      if (video.current) { try { video.current.pause(); } catch {} video.current.srcObject = null; }
    }
    function clearPreview() { if (previewUrl.current) URL.revokeObjectURL(previewUrl.current); previewUrl.current = ''; }
    function close() { epoch.current++; release(); clearPreview(); callbacks.current.onClose(); }
    async function start() {
      const generation = ++epoch.current; committing.current = false; release(); clearPreview(); setPreview(null); setError(''); setStatus('starting');
      requesting.current = true;
      try {
        if (!navigator.mediaDevices?.getUserMedia || globalThis.isSecureContext === false) throw new Error('В этом браузере камера внутри приложения недоступна. Откройте камеру устройства или выберите готовое фото.');
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 2560 }, height: { ideal: 1440 } }, audio: false });
        if (!active(generation)) { stopTracks(stream); return; }
        const current = { stream }; run.current = current;
        const node = video.current;
        if (!node) throw new Error('Предпросмотр камеры недоступен. Повторите попытку.');
        node.srcObject = stream;
        const ready = new Promise((resolve, reject) => {
          let finished = false;
          const done = failure => {
            if (finished) return; finished = true;
            clearTimeout(timeout); node.removeEventListener('loadeddata', loaded); node.removeEventListener('canplay', loaded); node.removeEventListener('error', failed); current.cancelReady = null;
            failure ? reject(failure) : resolve();
          };
          const loaded = () => { if (node.videoWidth && node.videoHeight && node.readyState >= 2) done(); };
          const failed = () => done(new Error('Не удалось получить изображение с камеры.'));
          const timeout = setTimeout(() => done(new Error('Камера не передала изображение. Повторите попытку.')), 15000);
          current.cancelReady = () => done(new Error('Камера остановлена.'));
          node.addEventListener('loadeddata', loaded); node.addEventListener('canplay', loaded); node.addEventListener('error', failed); loaded();
        });
        await Promise.all([ready, node.play()]);
        if (!active(generation)) return;
        for (const track of stream.getTracks()) track.addEventListener('ended', () => {
          if (!active(generation) || run.current !== current) return;
          epoch.current++; release(); setError('Камера отключилась. Включите её снова или откройте камеру устройства.'); setStatus('error');
        });
        setStatus('ready');
      } catch (failure) {
        if (!active(generation)) return;
        release(); setError(cameraError(failure)); setStatus('error');
      } finally {
        if (active(generation)) requesting.current = false;
      }
    }
    useEffect(() => {
      mounted.current = true; start();
      const visibility = () => {
        if (!document.hidden || (!run.current && !requesting.current)) return;
        epoch.current++; release();
        if (!previewUrl.current) { setStatus('paused'); setError('Камера остановлена при переходе в другое окно. Нажмите «Включить камеру», чтобы продолжить.'); }
      };
      document.addEventListener('visibilitychange', visibility);
      return () => { mounted.current = false; epoch.current++; release(); clearPreview(); document.removeEventListener('visibilitychange', visibility); };
    }, []);
    function showPreview(file, generation) {
      if (!active(generation)) return;
      release(); clearPreview();
      const url = URL.createObjectURL(file); previewUrl.current = url;
      setPreview({ file, url }); setError(''); setStatus('preview');
    }
    async function capture() {
      if (status !== 'ready') return;
      const generation = epoch.current, node = video.current; setStatus('processing'); setError('');
      try { showPreview(await jpegFromSource(node, node.videoWidth, node.videoHeight, maxBytes), generation); }
      catch (failure) { if (active(generation)) { setError(cameraError(failure)); setStatus('ready'); } }
    }
    async function nativePhoto(event) {
      const file = event.target.files?.[0]; event.target.value = '';
      if (!file) return;
      const generation = ++epoch.current; release(); clearPreview(); setPreview(null); setStatus('processing'); setError('');
      try { showPreview(await jpegFromFile(file, maxBytes), generation); }
      catch (failure) { if (active(generation)) { setError(cameraError(failure)); setStatus('error'); } }
    }
    async function commit() {
      if (!preview || committing.current) return;
      const generation = epoch.current; committing.current = true; setStatus('committing'); setError('');
      try { await callbacks.current.onFiles([preview.file]); if (active(generation)) close(); }
      catch (failure) { if (active(generation)) { committing.current = false; setError(failure?.message || 'Не удалось прикрепить фотографию.'); setStatus('preview'); } }
    }
    return h(PhotoDialog, { title: 'Сфотографировать', onClose: close },
      h('div', { className: 'attachment-photo-camera-body' },
        h('video', { ref: video, className: 'attachment-photo-camera', autoPlay: true, playsInline: true, muted: true, 'aria-label': 'Изображение с камеры', hidden: Boolean(preview) || status === 'error' || status === 'paused' }),
        preview && h('img', { className: 'attachment-photo-capture-preview', src: preview.url, alt: 'Предпросмотр сделанного снимка' }),
        error && h('p', { className: 'attachment-photo-error', role: 'alert' }, error),
        ['starting', 'processing', 'committing'].includes(status) && h('p', { className: 'attachment-photo-status', role: 'status' }, status === 'starting' ? 'Ожидаем доступ к камере…' : status === 'processing' ? 'Готовим снимок…' : 'Прикрепляем фотографию…'),
        h('div', { className: 'attachment-photo-actions' },
          status === 'ready' && button('Сделать снимок', capture, { className: 'button attachment-photo-button is-primary' }),
          preview && button('Использовать фото', commit, { disabled: status === 'committing', className: 'button attachment-photo-button is-primary' }),
          preview && button('Переснять', start, { disabled: status === 'committing' }),
          ['error', 'paused'].includes(status) && button('Включить камеру', start),
          ['error', 'paused', 'starting'].includes(status) && button('Открыть камеру устройства', () => { epoch.current++; release(); setStatus('paused'); nativeInput.current?.click(); }),
          button('Отмена', close)),
        h('input', { ref: nativeInput, className: 'attachment-photo-input', type: 'file', accept: 'image/jpeg,image/png', capture: 'environment', tabIndex: -1, 'aria-label': 'Фото с камеры устройства', onChange: nativePhoto }),
        h('p', { className: 'attachment-photo-hint' }, 'Проверьте снимок перед прикреплением.')));
  }

  function PhotoPicker({ accept, multiple = false, disabled = false, onFiles, label = 'Файл или фотография', cameraLabel = 'Сфотографировать', maxBytes, resetKey }) {
    const input = useRef(null), alive = useRef(true), callback = useRef(onFiles); callback.current = onFiles;
    const [camera, setCamera] = useState(false), [error, setError] = useState(''), [pending, setPending] = useState(false);
    useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
    useEffect(() => { setCamera(false); setError(''); if (input.current) input.current.value = ''; }, [resetKey]);
    useEffect(() => { if (disabled) setCamera(false); }, [disabled]);
    async function choose(event) {
      const files = Array.from(event.target.files || []); event.target.value = '';
      if (!files.length || disabled) return;
      setError(''); setPending(true);
      try { await callback.current(files); }
      catch (failure) { if (alive.current) setError(failure?.message || 'Не удалось выбрать файл.'); }
      finally { if (alive.current) setPending(false); }
    }
    return h('div', { className: 'attachment-photo-picker', role: 'group', 'aria-label': label },
      h('span', { className: 'attachment-photo-label' }, label.startsWith('Добавить фото:') ? 'Фотография' : label),
      h('div', { className: 'attachment-photo-actions' },
        button('Выбрать файл', () => input.current?.click(), { disabled: disabled || pending }),
        button(cameraLabel.startsWith('Сфотографировать:') ? 'Сфотографировать' : cameraLabel, () => { setError(''); setCamera(true); }, { disabled: disabled || pending, 'aria-label': cameraLabel })),
      h('input', { ref: input, type: 'file', className: 'attachment-photo-input', accept, multiple, disabled: disabled || pending, tabIndex: -1, 'aria-label': label, onChange: choose }),
      error && h('p', { className: 'attachment-photo-error', role: 'alert' }, error),
      camera && !disabled && h(CameraDialog, { maxBytes, onFiles: files => callback.current(files), onClose: () => setCamera(false) }));
  }

  return { PhotoPicker, PhotoPreview, LocalPhotoPreview };
}
