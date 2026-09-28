// SPDX-License-Identifier: MIT
// hh's supported text-import workflow: https://feedback.hh.ru/knowledge-base/article/0038489
export const HH_CREATE_URL = 'https://hh.ru/employer/vacancy/create';
export const HH_TEXT_LIMIT = 2000;

export function hhVacancyDraft(demand) {
  // publicBrief is a brief for recruiters, not consent to publish its contents.
  // Keep an explicit allowlist: never copy notes, sourceDetails or staff data.
  const sections = [
    ['Место работы', [demand.city, demand.district].filter(Boolean).join(', ')],
    ['Условия оплаты', demand.payTerms],
    ['График работы', demand.schedule],
    ['Адрес склада / точки выхода', demand.warehouseAddress],
    ['Обязанности и маршруты', demand.routeInfo],
    ['Требования к водителю', demand.driverRequirements],
    ['Требования к автомобилю', demand.vehicleRequirements],
    ['Обучение и стажировка', demand.trainingTerms],
  ];
  return {
    hhTitle: demand.title || (demand.kind === 'carrier' ? 'Водитель с личным грузовым автомобилем' : 'Водитель'),
    hhText: sections.filter(([, value]) => String(value || '').trim()).map(([label, value]) => `${label}: ${String(value).trim()}`).join('\n\n'),
  };
}

export const hhPublicationText = value => [value.hhTitle?.trim(), value.hhText?.trim()].filter(Boolean).join('\n\n');

export function hhVacancyUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    return url.protocol === 'https:' && !url.username && !url.password && (!url.port || url.port === '443')
      && (url.hostname === 'hh.ru' || url.hostname.endsWith('.hh.ru')) && /^\/vacancy\/[1-9]\d*\/?$/.test(url.pathname)
      && url.href.length <= 2048 ? url.href : null;
  } catch { return null; }
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Also works in local HTTP deployments without the Clipboard API.
    const previous = document.activeElement;
    const input = document.createElement('textarea');
    input.value = text;
    input.setAttribute('aria-label', 'Копирование текста вакансии');
    input.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none';
    document.body.appendChild(input);
    try { input.select(); return document.execCommand('copy'); }
    catch { return false; }
    finally { input.remove(); previous?.focus?.({ preventScroll: true }); }
  }
}

export function createHhPublicationFields(React) {
  const { createElement: h, useState, useRef, useEffect } = React;
  return function HhPublicationFields({ value, change, saving }) {
    const [feedback, setFeedback] = useState(null), [copying, setCopying] = useState(false);
    const active = useRef(true), busy = useRef(false);
    useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
    useEffect(() => { setFeedback(null); }, [value.hhTitle, value.hhText]);
    const text = hhPublicationText(value);
    const tooLong = text.length > HH_TEXT_LIMIT;
    const canCopy = Boolean(value.hhTitle?.trim() && value.hhText?.trim() && !tooLong);
    const input = (label, control, hint) => h('label', { className: 'recruitment-field' }, h('span', null, label), React.cloneElement(control, { 'aria-label': label }), hint && h('small', null, hint));
    async function copyAndOpen() {
      if (!canCopy || busy.current || saving) return;
      busy.current = true; setCopying(true); setFeedback(null);
      // Both calls start within the click gesture: awaiting clipboard first can
      // cause browsers to block the new tab. No vacancy data is placed in URLs.
      const copied = copyText(text);
      let openFailed = false;
      try {
        if (window.__TAURI__) {
          // The desktop/mobile shell routes anchor clicks to its external browser.
          const link = document.createElement('a');
          link.href = HH_CREATE_URL; link.target = '_blank'; link.rel = 'noopener noreferrer';
          link.click();
        } else window.open(HH_CREATE_URL, '_blank', 'noopener,noreferrer');
      }
      catch { openFailed = true; }
      const success = await copied;
      busy.current = false;
      if (!active.current) return;
      setCopying(false);
      setFeedback({ error: !success, message: success
        ? `Текст скопирован. На hh выберите «Генерация» и вставьте его. ${openFailed ? 'Не удалось открыть hh. Нажмите «Открыть hh» ниже.' : 'Если вкладка не открылась, нажмите «Открыть hh».'}`
        : 'Не удалось скопировать автоматически. Выделите текст ниже, скопируйте вручную и откройте hh.' });
    }
    return h('div', { className: 'recruitment-hh-fields is-wide' },
      h('p', { className: 'recruitment-meta' }, 'Проверьте текст из потребности. На hh выберите «Генерация», вставьте его, проверьте заполненные поля и нажмите «Опубликовать». Потребуется вход в аккаунт работодателя.'),
      value.hhUrl && h('p', { className: 'recruitment-feedback' }, 'В этой потребности уже есть ссылка на hh. Откройте существующую вакансию, прежде чем создавать новую.'),
      hhVacancyUrl(value.hhUrl) && h('a', { className: 'recruitment-link', href: hhVacancyUrl(value.hhUrl), target: '_blank', rel: 'noopener noreferrer' }, 'Открыть существующую вакансию ↗'),
      input('Название вакансии', h('input', { value: value.hhTitle, maxLength: 160, onChange: event => change('hhTitle', event.target.value) })),
      input('Текст вакансии', h('textarea', { value: value.hhText, rows: 9, onChange: event => change('hhText', event.target.value) }), 'Включены условия работы. Внутренние комментарии, исходная таблица и описание для рекрутеров не включены. Правки здесь используются только для размещения на hh.'),
      h('p', { className: tooLong ? 'recruitment-error' : 'recruitment-meta', role: tooLong ? 'alert' : undefined }, `${text.length} / ${HH_TEXT_LIMIT} символов вместе с названием.${tooLong ? ' Сократите текст для режима «Генерация» на hh. Текст сохранён в форме целиком.' : ''}`),
      !value.hhText?.trim() && h('p', { className: 'recruitment-meta' }, 'Добавьте условия, обязанности и требования перед переходом на hh.'),
      h('div', { className: 'recruitment-actions' },
        h('button', { type: 'button', className: 'button recruitment-primary', disabled: saving || copying || !canCopy || value.status !== 'open', onClick: copyAndOpen }, copying ? 'Копируем…' : 'Скопировать и открыть hh'),
        h('a', { className: 'recruitment-link', href: HH_CREATE_URL, target: '_blank', rel: 'noopener noreferrer' }, 'Открыть hh ↗')),
      value.status !== 'open' && h('p', { className: 'recruitment-meta' }, 'Размещение доступно для открытой потребности.'),
      feedback && h('p', { className: feedback.error ? 'recruitment-error' : 'recruitment-feedback', role: feedback.error ? 'alert' : 'status' }, feedback.message),
      feedback?.error && input('Текст для ручного копирования', h('textarea', { value: text, readOnly: true, rows: 7, onFocus: event => event.target.select() })),
      h('div', { className: 'recruitment-hh-link' }, h('h3', null, 'После публикации'),
        input('Ссылка на опубликованную вакансию', h('input', { type: 'url', value: value.hhUrl || '', maxLength: 2048, required: true, placeholder: 'https://hh.ru/vacancy/123456789', onChange: event => change('hhUrl', event.target.value) }), value.publishedAt ? 'Существующая дата публикации сохранится.' : 'Вставьте ссылку после публикации. При сохранении будет отмечено текущее время; его можно уточнить в потребности.'),
        h('p', { className: 'recruitment-meta' }, 'Открытие hh и копирование текста не отмечают вакансию опубликованной.')));
  };
}
