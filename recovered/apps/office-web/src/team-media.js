// Local media preparation and explicitly started capture. This module never uploads.
const MIB = 1024 * 1024;
const MAX_FILE_BYTES = 25 * MIB;
const MAX_PHOTO_INPUT = 100 * MIB;
const MAX_PHOTO_PIXELS = 48 * 1000 * 1000;
const MAX_RECORDING_BYTES = 8 * MIB;
const PHOTO_TARGET = MIB;
const imageTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const audioTypes = new Set(['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/mpeg', 'audio/wav', 'audio/x-wav']);
const videoTypes = new Set(['video/webm', 'video/mp4']);
const cleanMime = type => String(type || '').split(';', 1)[0].trim().toLowerCase();
const stopTracks = stream => stream?.getTracks?.().forEach(track => { try { track.stop(); } catch {} });
const clockLabel = seconds => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

function originalPhoto(file, note) {
  if (file.size > MAX_FILE_BYTES) throw new Error('Этот файл нельзя безопасно сжать здесь. Выберите оригинал размером не более 25 МБ.');
  return { file, kind: 'file', originalSize: file.size, compressed: false, ...(note ? { note } : {}) };
}

function imageHeader(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (start, length) => String.fromCharCode(...bytes.subarray(start, start + length));
  if (bytes.length >= 24 && bytes[0] === 137 && ascii(1, 3) === 'PNG' && view.getUint32(4) === 0x0d0a1a0a) {
    let animated = false;
    for (let offset = 8; offset + 12 <= bytes.length;) {
      const length = view.getUint32(offset), kind = ascii(offset + 4, 4);
      if (kind === 'acTL') animated = true;
      if (kind === 'IDAT') break;
      offset += length + 12;
    }
    return { type: 'image/png', width: view.getUint32(16), height: view.getUint32(20), animated };
  }
  if (bytes.length >= 10 && ['GIF87a', 'GIF89a'].includes(ascii(0, 6))) return { type: 'image/gif', animated: true };
  if (bytes.length >= 30 && ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') {
    const chunk = ascii(12, 4);
    if (chunk === 'VP8X') return { type: 'image/webp', width: 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16), height: 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16), animated: Boolean(bytes[20] & 2) };
    if (chunk === 'VP8 ' && bytes[23] === 0x9d && bytes[24] === 1 && bytes[25] === 0x2a) return { type: 'image/webp', width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
    if (chunk === 'VP8L' && bytes[20] === 0x2f) return { type: 'image/webp', width: 1 + ((bytes[21] | (bytes[22] << 8)) & 0x3fff), height: 1 + (((bytes[22] >> 6) | (bytes[23] << 2) | (bytes[24] << 10)) & 0x3fff) };
    return { type: 'image/webp' };
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset] !== 0xff) break;
      while (offset < bytes.length && bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) break;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) break;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker) && length >= 7) return { type: 'image/jpeg', width: view.getUint16(offset + 5), height: view.getUint16(offset + 3) };
      offset += length;
    }
    return { type: 'image/jpeg' };
  }
  return null;
}

function jpegFilename(name) {
  let stem = String(name || 'Фото').normalize('NFC').replace(/\.[^.]+$/, '').trim() || 'Фото';
  const encoder = new TextEncoder();
  while (encoder.encode(stem + '.jpg').length > 255) stem = [...stem].slice(0, -1).join('');
  return stem + '.jpg';
}

async function decodePhoto(blob) {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
    return { image: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
  }
  const url = URL.createObjectURL(blob), image = new Image();
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { image.src = ''; reject(new Error('Не удалось прочитать фотографию.')); }, 15000);
      image.onload = () => { clearTimeout(timeout); resolve(); };
      image.onerror = () => { clearTimeout(timeout); reject(new Error('Браузер не смог открыть эту фотографию.')); };
      image.src = url;
    });
    return { image, width: image.naturalWidth, height: image.naturalHeight, close: () => { image.src = ''; URL.revokeObjectURL(url); } };
  } catch (error) { URL.revokeObjectURL(url); throw error; }
}

export async function preparePhoto(file, { original = false } = {}) {
  if (!file || typeof file.slice !== 'function' || !Number.isFinite(file.size)) throw new Error('Выберите файл фотографии.');
  if (original) return originalPhoto(file);
  if (file.size > MAX_PHOTO_INPUT) throw new Error('Для сжатия выберите фотографию размером не более 100 МБ.');
  const bytes = new Uint8Array(await file.slice(0, Math.min(file.size, 2 * MIB)).arrayBuffer());
  const header = imageHeader(bytes);
  if (header?.animated) return originalPhoto(file, 'Анимация сохранена оригинальным файлом без сжатия.');
  if (!header || !['image/jpeg', 'image/png', 'image/webp'].includes(header.type)) return originalPhoto(file, 'Формат сохранён оригинальным файлом. SVG, HEIC и другие неподдерживаемые форматы не преобразуются.');
  if (!header.width || !header.height || header.width > 24000 || header.height > 24000 || header.width * header.height > MAX_PHOTO_PIXELS) return originalPhoto(file, 'Размер изображения слишком большой или не определён безопасно. Сохранён оригинальный файл.');
  let decoded, canvas;
  try {
    decoded = await decodePhoto(file.slice(0, file.size, header.type));
    if (!decoded.width || !decoded.height || decoded.width * decoded.height > MAX_PHOTO_PIXELS || Math.max(decoded.width, decoded.height) > 24000) throw new Error('Слишком большое разрешение фотографии.');
    canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { alpha: false });
    if (!context || typeof canvas.toBlob !== 'function') throw new Error('Сжатие фотографий в этом браузере недоступно.');
    let scale = Math.min(1, 1920 / Math.max(decoded.width, decoded.height)), result;
    for (let round = 0; round < 6; round++) {
      canvas.width = Math.max(1, Math.round(decoded.width * scale));
      canvas.height = Math.max(1, Math.round(decoded.height * scale));
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(decoded.image, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.82, 0.7, 0.58]) {
        result = await new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Не удалось сжать фотографию.')), 'image/jpeg', quality));
        if (result.size <= PHOTO_TARGET) break;
      }
      if (result?.size <= PHOTO_TARGET) break;
      scale *= 0.78;
    }
    if (!result || result.size > MAX_RECORDING_BYTES || cleanMime(result.type) !== 'image/jpeg') throw new Error('Не удалось получить компактную JPEG-фотографию.');
    if (result.size >= file.size && Math.max(decoded.width, decoded.height) <= 1920) {
      const optimized = file.type === header.type ? file : new File([file], file.name, { type: header.type, lastModified: file.lastModified ?? Date.now() });
      return { file: optimized, kind: 'image', originalSize: file.size, compressed: false, note: 'Фото уже оптимизировано' };
    }
    return { file: new File([result], jpegFilename(file.name), { type: 'image/jpeg', lastModified: file.lastModified || Date.now() }), kind: 'image', originalSize: file.size, compressed: true };
  } catch (error) {
    return originalPhoto(file, `${error?.message || 'Сжатие недоступно.'} Прикреплён оригинальный файл без изменения байтов.`);
  } finally {
    decoded?.close();
    if (canvas) { canvas.width = 1; canvas.height = 1; }
  }
}

function captureError(error) {
  const names = {
    NotAllowedError: 'Доступ к камере или микрофону запрещён. Разрешите его в настройках браузера и повторите попытку.',
    PermissionDeniedError: 'Браузер не получил разрешение на запись. Проверьте доступ к камере и микрофону.',
    NotFoundError: 'Камера или микрофон не найдены. Подключите устройство и повторите попытку.',
    DevicesNotFoundError: 'Устройство записи не найдено.',
    NotReadableError: 'Камера или микрофон заняты другим приложением либо недоступны.',
    OverconstrainedError: 'Устройство не поддерживает выбранный режим записи. Попробуйте другую камеру или голосовое сообщение.',
    SecurityError: 'Запись запрещена настройками безопасности браузера.',
    AbortError: 'Не удалось начать запись. Повторите попытку.',
  };
  return names[error?.name] || error?.message || 'Не удалось записать сообщение.';
}

function speechError(code) {
  return ({ 'not-allowed': 'Браузер не разрешил диктовку. Проверьте доступ к микрофону.', 'service-not-allowed': 'Сервис распознавания речи недоступен в этом браузере.', 'audio-capture': 'Микрофон недоступен или занят.', network: 'Сервис распознавания речи недоступен. Проверьте соединение или запишите голосовое сообщение.', 'no-speech': 'Речь не распознана. Попробуйте ещё раз.', 'language-not-supported': 'Распознавание русского языка в этом браузере недоступно.', aborted: 'Диктовка остановлена.' })[code] || 'Распознавание речи завершилось с ошибкой. Можно использовать голосовое сообщение.';
}

function recorderOptions(mode) {
  const audio = mode === 'voice';
  const candidates = audio ? ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/ogg;codecs=opus'] : ['video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4'];
  const mimeType = candidates.find(type => typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported(type));
  return { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 48000, ...(!audio ? { videoBitsPerSecond: mode === 'round' ? 600000 : 1000000 } : {}) };
}

function releaseStreams(run) {
  clearInterval(run.clock);
  clearInterval(run.draw);
  clearTimeout(run.limit);
  run.expectedEnd = true;
  for (const stream of run.streams || []) stopTracks(stream);
  if (run.source) { try { run.source.pause(); } catch {} run.source.srcObject = null; }
}

function disposeRun(run) {
  if (!run) return;
  run.cancelled = true;
  clearTimeout(run.finishTimeout);
  run.cancelMetadata?.();
  if (run.recorder) {
    run.recorder.ondataavailable = null;
    run.recorder.onstop = null;
    run.recorder.onerror = null;
    try { if (run.recorder.state !== 'inactive') run.recorder.stop(); } catch {}
  }
  if (run.recognition) {
    run.recognition.onresult = run.recognition.onstart = run.recognition.onend = run.recognition.onerror = null;
    try { run.recognition.abort(); } catch {}
  }
  releaseStreams(run);
  run.chunks = [];
}

export function createTeamMedia(React) {
  const { createElement: h, useState, useEffect, useRef } = React;
  const button = (text, onClick, props = {}) => h('button', { type: 'button', className: 'button', onClick, ...props }, text);

  function CaptureDialog({ mode, onComplete, onTranscript, onClose }) {
    const [fallbackVoice, setFallbackVoice] = useState(false), [status, setStatus] = useState('idle'), [seconds, setSeconds] = useState(0), [error, setError] = useState(''), [notice, setNotice] = useState('');
    const [preview, setPreview] = useState(null), [transcript, setTranscript] = useState(''), [interim, setInterim] = useState(''), [submitting, setSubmitting] = useState(false);
    const runRef = useRef(null), alive = useRef(true), dialogRef = useRef(null), sourceRef = useRef(null), canvasRef = useRef(null), playbackRef = useRef(null), previewRef = useRef(null), committed = useRef(false);
    const callbacks = useRef({ onComplete, onTranscript, onClose }); callbacks.current = { onComplete, onTranscript, onClose };
    const actualMode = fallbackVoice ? 'voice' : mode, actualModeRef = useRef(actualMode); actualModeRef.current = actualMode;
    const title = ({ voice: 'Голосовое сообщение', video: 'Короткое видео', round: 'Видеокружок', dictation: 'Диктовка текста' })[actualMode] || 'Запись сообщения';
    const active = run => alive.current && runRef.current === run && !run.cancelled;

    function clearPreview() {
      if (playbackRef.current) { try { playbackRef.current.pause(); playbackRef.current.removeAttribute('src'); playbackRef.current.load(); } catch {} }
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
      previewRef.current = null;
    }
    function reset() {
      disposeRun(runRef.current); runRef.current = null;
      clearPreview(); committed.current = false;
      setPreview(null); setTranscript(''); setInterim(''); setError(''); setNotice(''); setSeconds(0); setStatus('idle');
    }
    function close() {
      disposeRun(runRef.current); runRef.current = null; clearPreview();
      callbacks.current.onClose?.();
    }
    useEffect(() => {
      alive.current = true;
      const oldFocus = document.activeElement, overflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      dialogRef.current?.querySelector('button')?.focus();
      const keydown = event => {
        if (event.key === 'Escape') { event.preventDefault(); close(); }
        if (event.key !== 'Tab') return;
        const nodes = [...(dialogRef.current?.querySelectorAll('button:not([disabled]),textarea:not([disabled]),audio[controls],video[controls]') || [])].filter(node => node.offsetParent !== null);
        if (!nodes.length) { event.preventDefault(); dialogRef.current?.focus(); }
        else if (event.shiftKey && document.activeElement === nodes[0]) { event.preventDefault(); nodes[nodes.length - 1].focus(); }
        else if (!event.shiftKey && document.activeElement === nodes[nodes.length - 1]) { event.preventDefault(); nodes[0].focus(); }
      };
      const visibility = () => { if (document.hidden && runRef.current && !runRef.current.stopping) stop('Запись остановлена при переходе в другое окно.'); };
      document.addEventListener('keydown', keydown); document.addEventListener('visibilitychange', visibility);
      return () => {
        alive.current = false; disposeRun(runRef.current); runRef.current = null; clearPreview();
        document.body.style.overflow = overflow;
        document.removeEventListener('keydown', keydown); document.removeEventListener('visibilitychange', visibility);
        if (oldFocus?.isConnected) oldFocus.focus();
      };
    }, []);

    function startClock(run, limit) {
      run.started = Date.now();
      run.clock = setInterval(() => { if (active(run)) setSeconds(Math.min(limit, Math.floor((Date.now() - run.started) / 1000))); }, 250);
      run.limit = setTimeout(() => { if (active(run)) stop('Достигнута максимальная длительность записи.'); }, limit * 1000);
    }
    function stop(message) {
      const run = runRef.current;
      if (!run || run.stopping || !active(run)) return;
      run.stopping = true;
      if (typeof message === 'string') setNotice(message);
      setStatus('stopping'); clearInterval(run.clock); clearTimeout(run.limit);
      if (run.recognition) {
        try { run.recognition.stop(); } catch { finishSpeech(run); }
        run.finishTimeout = setTimeout(() => { if (active(run)) { try { run.recognition.abort(); } catch {} finishSpeech(run); } }, 2500);
      } else if (run.recorder) {
        try { if (run.recorder.state !== 'inactive') run.recorder.stop(); } catch { run.failure = 'Запись прервалась. Попробуйте записать ещё раз.'; finishRecording(run); }
        releaseStreams(run);
        run.finishTimeout = setTimeout(() => { if (active(run) && !run.finished) { run.failure = 'Браузер не завершил запись. Запишите сообщение ещё раз.'; finishRecording(run); } }, 5000);
      } else { disposeRun(run); runRef.current = null; setStatus('idle'); }
    }
    function finishRecording(run) {
      if (!active(run) || run.finished) return;
      run.finished = true; clearTimeout(run.finishTimeout); releaseStreams(run);
      if (run.failure || run.oversized) {
        run.chunks = []; setError(run.failure || 'Запись превысила 8 МБ и не будет прикреплена. Запишите более короткое сообщение.'); setStatus('error'); return;
      }
      const mime = cleanMime(run.recorder.mimeType || run.chunks[0]?.type), audio = run.mode === 'voice';
      if (!(audio ? audioTypes : videoTypes).has(mime)) { run.chunks = []; setError('Браузер создал неподдерживаемый формат записи. Попробуйте другой браузер.'); setStatus('error'); return; }
      const blob = new Blob(run.chunks, { type: mime }); run.chunks = [];
      if (!blob.size || blob.size > MAX_RECORDING_BYTES) { setError(blob.size ? 'Запись превысила 8 МБ. Запишите более короткое сообщение.' : 'Получилась пустая запись. Проверьте устройство и повторите попытку.'); setStatus('error'); return; }
      const extension = mime.includes('mp4') ? (audio ? 'm4a' : 'mp4') : mime.includes('ogg') ? 'ogg' : 'webm';
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const file = new File([blob], `${audio ? 'Голосовое' : run.mode === 'round' ? 'Видеокружок' : 'Видео'}-${stamp}.${extension}`, { type: mime });
      clearPreview(); const url = URL.createObjectURL(file); previewRef.current = url;
      setPreview({ file, url, kind: audio ? 'audio' : run.mode }); setStatus('preview');
    }
    function finishSpeech(run) {
      if (!active(run) || run.finished) return;
      run.finished = true; clearTimeout(run.finishTimeout); releaseStreams(run);
      setInterim(''); setTranscript(run.finalText || ''); setStatus('preview');
      if (!run.finalText && !run.failure) setError('Речь не распознана. Попробуйте ещё раз или запишите голосовое сообщение.');
    }
    async function readyVideo(video, stream, run) {
      video.srcObject = stream; video.muted = true; video.playsInline = true;
      const ready = new Promise((resolve, reject) => {
        const done = error => { clearTimeout(timeout); video.removeEventListener('loadedmetadata', loaded); video.removeEventListener('error', failed); run.cancelMetadata = null; error ? reject(error) : resolve(); };
        const loaded = () => video.videoWidth && video.videoHeight && done();
        const failed = () => done(new Error('Не удалось получить изображение с камеры.'));
        const timeout = setTimeout(() => done(new Error('Камера не передала изображение. Попробуйте ещё раз.')), 10000);
        run.cancelMetadata = () => done(new Error('Запись отменена.'));
        video.addEventListener('loadedmetadata', loaded); video.addEventListener('error', failed);
        if (video.videoWidth && video.videoHeight) done();
      });
      await Promise.all([ready, video.play()]);
    }
    async function startRecording() {
      if (runRef.current && !runRef.current.finished && !runRef.current.cancelled) return;
      reset(); setStatus('requesting');
      const selectedMode = actualModeRef.current;
      const run = { mode: selectedMode, streams: new Set(), chunks: [], bytes: 0 }; runRef.current = run;
      try {
        if (!navigator.mediaDevices?.getUserMedia || !globalThis.isSecureContext) throw new Error('Для записи откройте приложение по HTTPS или на localhost в браузере с доступом к камере и микрофону.');
        if (typeof MediaRecorder === 'undefined') throw new Error('Этот браузер не поддерживает запись сообщений. Можно прикрепить готовый файл.');
        const audio = { channelCount: { ideal: 1, max: 1 }, echoCancellation: true, noiseSuppression: true };
        const stream = await navigator.mediaDevices.getUserMedia({ audio, video: selectedMode === 'voice' ? false : { width: { ideal: selectedMode === 'round' ? 640 : 1280, max: 1280 }, height: { ideal: selectedMode === 'round' ? 480 : 720, max: 720 }, frameRate: { ideal: 24, max: 24 }, facingMode: selectedMode === 'round' ? 'user' : 'environment' } });
        if (!active(run)) { stopTracks(stream); return; }
        run.streams.add(stream);
        let recordedStream = stream;
        if (selectedMode !== 'voice') {
          const video = sourceRef.current;
          if (!video) throw new Error('Предпросмотр камеры недоступен.');
          run.source = video; await readyVideo(video, stream, run);
          if (!active(run)) return;
          if (selectedMode === 'round') {
            const canvas = canvasRef.current, context = canvas?.getContext('2d', { alpha: false });
            if (!context || typeof canvas.captureStream !== 'function') throw new Error('Видеокружки в этом браузере недоступны. Используйте обычное видео.');
            canvas.width = canvas.height = 480;
            const draw = () => {
              if (!active(run) || run.stopping || !video.videoWidth || !video.videoHeight) return;
              const edge = Math.min(video.videoWidth, video.videoHeight);
              context.drawImage(video, (video.videoWidth - edge) / 2, (video.videoHeight - edge) / 2, edge, edge, 0, 0, 480, 480);
            };
            draw(); run.draw = setInterval(draw, 1000 / 24);
            recordedStream = canvas.captureStream(24);
            if (!recordedStream.getVideoTracks().length) throw new Error('Браузер не смог записать квадратное видео. Используйте обычное видео.');
            for (const track of stream.getAudioTracks()) recordedStream.addTrack(track);
            run.streams.add(recordedStream);
          }
        }
        run.recorder = new MediaRecorder(recordedStream, recorderOptions(selectedMode));
        run.recorder.ondataavailable = event => {
          if (!active(run) || !event.data?.size || run.oversized) return;
          run.bytes += event.data.size;
          if (run.bytes > MAX_RECORDING_BYTES) { run.oversized = true; run.chunks = []; stop('Достигнут предел размера записи.'); return; }
          run.chunks.push(event.data);
          if (run.bytes >= MAX_RECORDING_BYTES - 256 * 1024) stop('Запись остановлена у предела 8 МБ.');
        };
        run.recorder.onerror = event => { if (active(run)) { run.failure = captureError(event.error); stop(); } };
        run.recorder.onstop = () => finishRecording(run);
        for (const track of stream.getTracks()) track.addEventListener('ended', () => { if (active(run) && !run.expectedEnd) { run.failure = 'Устройство отключилось во время записи. Запишите сообщение ещё раз.'; stop(); } });
        run.recorder.start(500); setStatus('recording'); startClock(run, selectedMode === 'voice' ? 300 : 60);
      } catch (failure) {
        if (!active(run)) return;
        disposeRun(run); runRef.current = null; setError(captureError(failure)); setStatus('error');
      }
    }
    function startDictation() {
      reset();
      const Speech = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
      if (!Speech) { setError('Диктовка недоступна в этом браузере. Можно записать голосовое сообщение.'); setStatus('error'); return; }
      const run = { mode: 'dictation', streams: new Set(), finalResults: new Map(), finalText: '' }; runRef.current = run;
      try {
        const recognition = new Speech(); run.recognition = recognition;
        recognition.lang = 'ru-RU'; recognition.continuous = true; recognition.interimResults = true; recognition.maxAlternatives = 1;
        recognition.onstart = () => { if (active(run)) { setStatus('recording'); startClock(run, 300); } };
        recognition.onresult = event => {
          if (!active(run) || run.finished) return;
          let tentative = '';
          for (let index = 0; index < event.results.length; index++) {
            const result = event.results[index], text = result[0]?.transcript || '';
            if (result.isFinal) run.finalResults.set(index, text.trim());
            else tentative += text;
          }
          run.finalText = [...run.finalResults.entries()].sort((a, b) => a[0] - b[0]).map(([, text]) => text).filter(Boolean).join(' ');
          setTranscript(run.finalText); setInterim(tentative);
        };
        recognition.onerror = event => { if (active(run)) { run.failure = speechError(event.error); setError(run.failure); } };
        recognition.onend = () => finishSpeech(run);
        setStatus('requesting'); recognition.start();
      } catch (failure) { disposeRun(run); runRef.current = null; setError(captureError(failure)); setStatus('error'); }
    }
    async function commit() {
      if (committed.current || submitting) return;
      if (actualMode === 'dictation' ? !transcript.trim() : !preview) return;
      committed.current = true; setSubmitting(true);
      try {
        if (actualMode === 'dictation') await callbacks.current.onTranscript?.(transcript.trim());
        else await callbacks.current.onComplete?.(preview.file, preview.kind);
        if (alive.current) close();
      } catch (failure) { if (alive.current) { committed.current = false; setError(failure?.message || 'Не удалось добавить запись в черновик.'); setSubmitting(false); } }
    }
    const recording = status === 'recording', pending = status === 'requesting' || status === 'stopping', dictation = actualMode === 'dictation';
    const visual = actualMode === 'video' || actualMode === 'round';
    return h('div', { className: 'team-overlay' }, h('section', { className: 'team-dialog team-capture-dialog', ref: dialogRef, role: 'dialog', 'aria-modal': true, 'aria-label': title, tabIndex: -1 },
      h('header', null, h('h2', null, title), button('Закрыть', close, { disabled: submitting })),
      h('div', { className: 'team-dialog-body' },
        dictation ? h('p', { className: 'team-muted' }, 'Распознавание выполняет браузер; речь может передаваться его сервису.') : h('p', { className: 'team-muted' }, actualMode === 'voice' ? 'До 5 минут. Запись сначала появится здесь для прослушивания.' : actualMode === 'round' ? 'Квадратный кадр 480 × 480 с круглым отображением. До 60 секунд.' : 'Компактное видео до 720p и 60 секунд.'),
        error && h('div', { className: 'team-error', role: 'alert' }, error),
        notice && h('p', { className: 'team-muted', role: 'status' }, notice),
        h('p', { className: 'team-capture-timer', role: 'timer', 'aria-label': 'Длительность записи' }, `${clockLabel(seconds)} / ${actualMode === 'voice' || dictation ? '5:00' : '1:00'}`),
        visual && !preview && h('div', { className: 'team-capture-preview' },
          h('video', { ref: sourceRef, muted: true, autoPlay: true, playsInline: true, 'aria-label': 'Предпросмотр камеры', style: actualMode === 'round' ? { position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' } : { width: '100%', maxHeight: 360, objectFit: 'contain' } }),
          actualMode === 'round' && h('canvas', { ref: canvasRef, width: 480, height: 480, className: 'team-capture-round', 'aria-label': 'Кадр видеокружка', style: { width: 'min(100%, 320px)', aspectRatio: '1', borderRadius: '50%' } })),
        preview && h(preview.kind === 'audio' ? 'audio' : 'video', { ref: node => { if (node) playbackRef.current = node; }, src: preview.url, controls: true, playsInline: true, preload: 'metadata', className: `team-capture-preview${preview.kind === 'round' ? ' team-capture-round' : ''}`, 'aria-label': 'Предпросмотр записи', style: preview.kind === 'round' ? { width: 'min(100%, 320px)', aspectRatio: '1', borderRadius: '50%', objectFit: 'cover' } : { width: '100%', maxHeight: 360 } }),
        dictation && h('label', { className: 'team-field' }, h('span', null, 'Распознанный текст'), h('textarea', { rows: 6, value: transcript, readOnly: recording || pending, disabled: submitting, onChange: event => setTranscript(event.target.value), 'aria-label': 'Распознанный текст', placeholder: 'Текст появится после начала диктовки. Перед вставкой его можно исправить.' })),
        dictation && interim && h('p', { className: 'team-muted', 'aria-live': 'polite' }, interim),
        h('div', { className: 'team-actions' },
          (status === 'idle' || status === 'error') && button(dictation ? 'Начать диктовку' : 'Начать запись', dictation ? startDictation : startRecording, { className: 'button team-primary' }),
          pending && h('span', { role: 'status' }, status === 'requesting' ? 'Ожидаем разрешение и устройство…' : 'Завершаем запись…'),
          recording && button(dictation ? 'Остановить диктовку' : 'Остановить запись', () => stop(), { className: 'button team-primary' }),
          status === 'preview' && button(dictation ? 'Вставить текст' : 'Прикрепить запись', commit, { className: 'button team-primary', disabled: submitting || (dictation ? !transcript.trim() : !preview) }),
          status === 'preview' && button('Записать заново', reset, { disabled: submitting }),
          dictation && status === 'error' && button('Перейти к голосовой записи', () => { reset(); setFallbackVoice(true); }),
          button('Отменить', close, { disabled: submitting })),
        h('p', { className: 'team-muted' }, dictation ? 'Текст будет вставлен в черновик. Отправка сообщения выполняется отдельно.' : 'Запись не отправляется автоматически. После прикрепления отправьте сообщение из чата.'))));
  }

  function MediaAttachment({ file, load, onError }) {
    const [url, setUrl] = useState(''), [loading, setLoading] = useState(false), [error, setError] = useState('');
    const ref = useRef({ epoch: 0, mounted: true, url: '', pending: false }), player = useRef(null), handlers = useRef({ load, onError }); handlers.current = { load, onError };
    const mime = cleanMime(file?.mimeType), kind = file?.kind;
    const tag = kind === 'image' && imageTypes.has(mime) ? 'img' : kind === 'audio' && audioTypes.has(mime) ? 'audio' : ['video', 'round'].includes(kind) && videoTypes.has(mime) ? 'video' : null;
    function clear() {
      const node = player.current;
      if (node) { try { node.pause?.(); node.removeAttribute('src'); node.load?.(); } catch {} }
      if (ref.current.url) URL.revokeObjectURL(ref.current.url);
      ref.current.url = '';
    }
    useEffect(() => {
      ref.current.mounted = true; ref.current.epoch++; ref.current.pending = false; setUrl(''); setLoading(false); setError('');
      return () => { ref.current.mounted = false; ref.current.epoch++; ref.current.pending = false; clear(); };
    }, [file?.id, kind, mime]);
    async function open() {
      if (!tag || ref.current.pending || ref.current.url) return;
      const epoch = ref.current.epoch;
      ref.current.pending = true; setLoading(true); setError('');
      try {
        const blob = await handlers.current.load();
        if (!ref.current.mounted || epoch !== ref.current.epoch) return;
        if (!(blob instanceof Blob) || blob.size > MAX_FILE_BYTES || (Number.isInteger(file.byteSize) && blob.size !== file.byteSize)) throw new Error('Размер медиафайла не совпадает с вложением. Скачайте его заново.');
        const next = URL.createObjectURL(new Blob([blob], { type: mime })); ref.current.url = next; setUrl(next);
      } catch (failure) {
        if (ref.current.mounted && epoch === ref.current.epoch) { setError(failure?.message || 'Не удалось открыть вложение.'); handlers.current.onError?.(failure); }
      } finally { if (ref.current.mounted && epoch === ref.current.epoch) { ref.current.pending = false; setLoading(false); } }
    }
    if (!tag) return null;
    return h('div', { className: `team-media-attachment${kind === 'round' ? ' is-round' : ''}` },
      !url && button(loading ? 'Открываем…' : kind === 'image' ? 'Открыть фото' : kind === 'audio' ? 'Прослушать' : 'Смотреть видео', open, { disabled: loading, 'aria-label': `Открыть ${file.filename}`, className: 'button team-media-open' }),
      url && h(tag, { ref: node => { if (node) player.current = node; }, src: url, ...(tag === 'img' ? { alt: file.filename, className: 'team-media-image' } : { controls: true, playsInline: true, preload: 'metadata', className: 'team-media-player', 'aria-label': file.filename }), style: kind === 'round' ? { width: 'min(100%, 280px)', aspectRatio: '1', borderRadius: '50%', objectFit: 'cover' } : { maxWidth: '100%', maxHeight: 360 }, onError: () => { const failure = new Error('Браузер не может воспроизвести этот файл. Скачайте оригинал.'); setError(failure.message); handlers.current.onError?.(failure); } }),
      error && h('p', { className: 'team-error', role: 'alert' }, error));
  }
  return { CaptureDialog, MediaAttachment };
}
