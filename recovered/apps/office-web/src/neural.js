const TASKS = { conversation_summary: 'Сводка сообщений', work_order_prices: 'Анализ цен заказ-нарядов' };
const PROVIDERS = { openai: 'OpenAI', anthropic: 'Anthropic', qwen: 'Qwen', glm: 'GLM', yandex: 'Яндекс' };
const number = value => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Number(value) || 0);
const tokenLabel = value => value == null ? 'нет данных' : number(value);
const costLabel = (value, currency) => value == null ? 'Тариф не задан' : new Intl.NumberFormat('ru-RU', { style: 'currency', currency: currency || 'USD', maximumFractionDigits: 6 }).format(Number(value));
const scopeLabel = scope => [scope.projectName, scope.regionName, scope.scopeName || scope.responsibilityScopeName].filter(Boolean).join(' · ') || 'Область';
const day = date => date.toISOString().slice(0, 10);
const newProfile = () => ({ id: crypto.randomUUID(), name: '', provider: 'openai', model: '', enabled: true, inputPricePerMillion: null, outputPricePerMillion: null, cachedInputPricePerMillion: null, cacheWritePricePerMillion: null, currency: 'USD', maxOutputTokens: 4096, region: 'international', folderId: '' });

export function createNeuralWorkspace(React, { request, Summary, PriceAnalysis }) {
  const h = React.createElement;
  const { useState, useEffect, useRef } = React;
  const button = (text, action, props = {}) => h('button', { type: 'button', className: 'button secondary', onClick: action, ...props }, text);
  const field = (label, child, note) => h('label', { className: 'neural-field' }, h('span', null, label), child, note && h('small', null, note));
  const errorText = error => error?.message || 'Не удалось загрузить данные. Повторите попытку.';

  function Settings({ token, scopeId, onExpired, onDirtyChange }) {
    const [data, setData] = useState(null), [draft, setDraft] = useState(null), [error, setError] = useState(''), [notice, setNotice] = useState('');
    const [busy, setBusy] = useState(false), [reload, setReload] = useState(0);
    const alive = useRef(true), saving = useRef(false), identity = useRef({ token, scopeId });
    identity.current = { token, scopeId };
    const dirty = Boolean(draft && data && JSON.stringify(draft) !== JSON.stringify({ profiles: data.profiles, tasks: data.tasks }));
    useEffect(() => { onDirtyChange?.(dirty); }, [dirty]);
    useEffect(() => { alive.current = true; return () => { alive.current = false; onDirtyChange?.(false); }; }, []);
    useEffect(() => {
      const controller = new AbortController();
      saving.current = false; setBusy(false); setError(''); setNotice(''); setData(null); setDraft(null);
      request(`/neural/settings?responsibilityScopeId=${encodeURIComponent(scopeId)}`, { signal: controller.signal }, token)
        .then(value => { if (!controller.signal.aborted) { setData(value); setDraft({ profiles: value.profiles, tasks: value.tasks }); } })
        .catch(reason => { if (!controller.signal.aborted) { setError(errorText(reason)); if (reason.status === 401) onExpired(); } });
      return () => controller.abort();
    }, [token, scopeId, reload]);
    function updateProfile(id, values) { setNotice(''); setDraft(old => ({ ...old, profiles: old.profiles.map(profile => profile.id === id ? { ...profile, ...values } : profile) })); }
    async function save(event) {
      event.preventDefault(); if (saving.current) return;
      const current = () => alive.current && identity.current.token === token && identity.current.scopeId === scopeId;
      saving.current = true; setBusy(true); setError(''); setNotice('');
      try {
        const value = await request('/neural/settings', { method: 'PUT', body: JSON.stringify({ responsibilityScopeId: scopeId, ...draft }) }, token);
        if (current()) { setData(value); setDraft({ profiles: value.profiles, tasks: value.tasks }); setNotice('Настройки нейросетей сохранены'); }
      } catch (reason) { if (current()) { setError(errorText(reason)); if (reason.status === 401) onExpired(); } }
      finally { if (current()) { saving.current = false; setBusy(false); } }
    }
    if (!draft) return h('section', { className: 'neural-card' }, error ? h('div', { role: 'alert', className: 'error' }, error, button('Повторить загрузку', () => setReload(value => value + 1))) : h('p', { role: 'status' }, 'Загружаем настройки…'));
    return h('form', { className: 'neural-settings', onSubmit: save },
      h('section', { className: 'neural-card' }, h('h2', null, 'Подключения'),
        h('p', { className: 'muted' }, 'Ключи хранятся на сервере. Подключите нужного провайдера, добавьте модели и назначьте их задачам.'),
        h('div', { className: 'neural-providers' }, ...data.providers.map(provider => h('article', { className: 'neural-provider', key: provider.id },
          h('strong', null, provider.name), h('span', { className: `neural-badge ${provider.configured ? 'ready' : ''}` }, provider.configured ? 'Ключ подключён' : 'Нет ключа'),
          h('small', null, 'Переменная сервера'), h('code', null, provider.keyEnv)))),
        h('p', { className: 'neural-note' }, 'При выборе внешней модели сообщения или позиции заказ-наряда передаются выбранному провайдеру для выполнения задачи.')),
      h('section', { className: 'neural-card' }, h('h2', null, 'Модели для задач'),
        h('p', { className: 'muted' }, 'У каждой задачи своя модель. Можно создать несколько настроек одного провайдера с разными моделями и тарифами.'),
        h('div', { className: 'neural-fields' }, ...Object.entries(TASKS).map(([task, label]) => field(label,
          h('select', { 'aria-label': label, value: draft.tasks[task] || '', disabled: busy, onChange: event => { setNotice(''); setDraft(old => ({ ...old, tasks: { ...old.tasks, [task]: event.target.value || null } })); } },
            h('option', { value: '' }, 'Локальная обработка · без расходов'), ...draft.profiles.map(profile => h('option', { key: profile.id, value: profile.id, disabled: !profile.enabled }, `${profile.name || 'Без названия'} · ${profile.model || 'модель не задана'}${profile.enabled ? '' : ' · выключена'}`))))))),
      h('section', { className: 'neural-card' }, h('div', { className: 'neural-card-heading' }, h('h2', null, 'Каталог моделей'), button('Добавить модель', () => setDraft(old => ({ ...old, profiles: [...old.profiles, newProfile()] })), { disabled: busy || draft.profiles.length >= 30 })),
        !draft.profiles.length && h('p', { className: 'neural-empty' }, 'Моделей пока нет. Локальная сводка и сравнение цен по истории доступны без подключения.'),
        ...draft.profiles.map((profile, index) => {
          const provider = data.providers.find(item => item.id === profile.provider);
          const numeric = (key, label, { max, min = 0, step = 'any', note } = {}) => field(label, h('input', { type: 'number', min, max, step, 'aria-label': `${label} · модель ${index + 1}`, value: profile[key] ?? '', disabled: busy, onChange: event => updateProfile(profile.id, { [key]: event.target.value === '' ? null : Number(event.target.value) }) }), note);
          return h('fieldset', { key: profile.id, className: 'neural-model', disabled: busy }, h('legend', null, `Модель ${index + 1}`),
            h('div', { className: 'neural-fields' },
              field('Название настройки', h('input', { required: true, maxLength: 100, 'aria-label': `Название настройки · модель ${index + 1}`, value: profile.name, placeholder: 'Например, быстрая сводка', onChange: event => updateProfile(profile.id, { name: event.target.value }) })),
              field('Провайдер', h('select', { 'aria-label': `Провайдер · модель ${index + 1}`, value: profile.provider, onChange: event => updateProfile(profile.id, { provider: event.target.value, model: '', folderId: '', region: 'international' }) }, ...Object.entries(PROVIDERS).map(([id, label]) => h('option', { value: id, key: id }, label)))),
              field('Идентификатор модели', h('input', { required: true, maxLength: 240, 'aria-label': `Идентификатор модели · модель ${index + 1}`, list: `neural-models-${profile.id}`, value: profile.model, placeholder: 'Точное имя модели из API', onChange: event => updateProfile(profile.id, { model: event.target.value }) }), 'Выберите подсказку или введите другую модель провайдера.'),
              h('datalist', { id: `neural-models-${profile.id}` }, ...(provider?.models || []).map(model => h('option', { key: model, value: model }))),
              numeric('maxOutputTokens', 'Лимит токенов ответа', { min: 128, max: 32768, step: 1 }),
              profile.provider === 'qwen' && field('Регион API Qwen', h('select', { value: profile.region || 'international', onChange: event => updateProfile(profile.id, { region: event.target.value }) }, h('option', { value: 'international' }, 'Международный'), h('option', { value: 'china' }, 'Китай'))),
              profile.provider === 'yandex' && field('Каталог Яндекс Cloud', h('input', { value: profile.folderId || '', maxLength: 80, onChange: event => updateProfile(profile.id, { folderId: event.target.value }), placeholder: 'ID каталога' }), 'Можно задать на сервере через YANDEX_FOLDER_ID.')),
            h('h3', null, 'Тариф за 1 млн токенов'),
            h('div', { className: 'neural-fields neural-pricing' },
              numeric('inputPricePerMillion', 'Входящие токены'), numeric('outputPricePerMillion', 'Исходящие токены'), numeric('cachedInputPricePerMillion', 'Входящие из кеша'), numeric('cacheWritePricePerMillion', 'Запись в кеш'),
              field('Валюта тарифа', h('select', { value: profile.currency, onChange: event => updateProfile(profile.id, { currency: event.target.value }) }, ...['USD', 'RUB', 'CNY'].map(currency => h('option', { key: currency }, currency))))),
            h('p', { className: 'muted' }, 'Укажите тариф вашего аккаунта. Пустой тариф означает неизвестную стоимость; 0 — бесплатные токены.'),
            h('div', { className: 'neural-model-footer' }, field('Модель включена', h('input', { type: 'checkbox', checked: profile.enabled, onChange: event => { const enabled = event.target.checked; setDraft(old => ({ ...old, profiles: old.profiles.map(item => item.id === profile.id ? { ...item, enabled } : item), tasks: Object.fromEntries(Object.entries(old.tasks).map(([key, value]) => [key, !enabled && value === profile.id ? null : value])) })); } })),
              button('Удалить модель', () => setDraft(old => ({ ...old, profiles: old.profiles.filter(item => item.id !== profile.id), tasks: Object.fromEntries(Object.entries(old.tasks).map(([key, value]) => [key, value === profile.id ? null : value])) })), { 'aria-label': `Удалить модель ${index + 1}` })));
        })),
      error && h('div', { role: 'alert', className: 'error' }, error), notice && h('p', { role: 'status', className: 'neural-success' }, notice),
      h('div', { className: 'neural-save' }, h('button', { type: 'submit', className: 'button primary', disabled: busy || !dirty }, busy ? 'Сохраняем…' : 'Сохранить настройки'), dirty && h('span', { className: 'muted' }, 'Есть несохранённые изменения')));
  }

  function Usage({ token, scopeId, onExpired }) {
    const [from, setFrom] = useState(day(new Date(Date.now() - 29 * 86400000))), [to, setTo] = useState(day(new Date()));
    const [data, setData] = useState(null), [error, setError] = useState(''), [loading, setLoading] = useState(true), [revision, setRevision] = useState(0);
    useEffect(() => {
      const controller = new AbortController(); setError(''); setData(null);
      if (!from || !to || from > to) { setLoading(false); setError('Укажите корректный период: начало не позже конца.'); return; }
      setLoading(true);
      const end = new Date(`${to}T00:00:00Z`); end.setUTCDate(end.getUTCDate() + 1);
      request(`/neural/usage?${new URLSearchParams({ responsibilityScopeId: scopeId, from: `${from}T00:00:00.000Z`, to: end.toISOString() })}`, { signal: controller.signal }, token)
        .then(value => { if (!controller.signal.aborted) setData(value); })
        .catch(reason => { if (!controller.signal.aborted) { setError(errorText(reason)); if (reason.status === 401) onExpired(); } })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
      return () => controller.abort();
    }, [token, scopeId, from, to, revision]);
    const costs = items => items?.length ? items.map(item => costLabel(item.amount, item.currency)).join(' · ') : '—';
    const table = (label, headings, rows) => h('section', { className: 'neural-card' }, h('h2', null, label), rows.length ? h('div', { className: 'neural-table-scroll', tabIndex: 0 }, h('table', { className: 'neural-table', 'aria-label': label }, h('thead', null, h('tr', null, ...headings.map(text => h('th', { key: text, scope: 'col' }, text)))), h('tbody', null, ...rows.map((row, index) => h('tr', { key: index }, ...row.map((value, column) => h('td', { key: column }, value))))))) : h('p', { className: 'neural-empty' }, 'За этот период запросов нет.'));
    return h('div', { className: 'neural-usage' },
      h('section', { className: 'neural-card' }, h('h2', null, 'Расход токенов и денег'),
        h('div', { className: 'neural-filters' }, field('С даты', h('input', { type: 'date', value: from, onChange: event => setFrom(event.target.value) })), field('По дату', h('input', { type: 'date', value: to, onChange: event => setTo(event.target.value) })), button('Обновить расходы', () => setRevision(value => value + 1), { disabled: loading })),
        h('p', { className: 'muted' }, 'Период указан в UTC. Токены — по ответам провайдеров, деньги — расчёт по сохранённым тарифам на момент запроса. Разные валюты считаются отдельно.')),
      error && h('p', { role: 'alert', className: 'error' }, error), loading && h('p', { role: 'status' }, 'Загружаем расходы…'),
      data && h(React.Fragment, null,
        h('div', { className: 'neural-metrics' }, ...[
          ['Запросы', number(data.totals.calls), `${number(data.totals.successful)} успешно · ${number(data.totals.failed)} с ошибкой · ${number(data.totals.pending)} выполняется`],
          ['Токены', number(data.totals.inputTokens + data.totals.outputTokens), `${number(data.totals.inputTokens)} входящих · ${number(data.totals.outputTokens)} исходящих · ${number(data.totals.unknownTokenCalls)} запросов с неизвестным расходом`],
          ['Расчётная стоимость', costs(data.totals.costs), `${number(data.totals.unpricedCalls)} запросов без расчёта стоимости`],
        ].map(([label, value, note]) => h('article', { className: 'neural-card neural-metric', key: label }, h('span', null, label), h('strong', null, value), h('small', null, note)))),
        table('По задачам', ['Задача', 'Запросы', 'Входящие', 'Исходящие', 'Стоимость'], data.byTask.map(item => [TASKS[item.task] || item.task, number(item.calls), number(item.inputTokens), number(item.outputTokens), costs(item.costs)])),
        table('По моделям', ['Провайдер / модель', 'Запросы', 'Входящие', 'Исходящие', 'Стоимость'], data.byModel.map(item => [`${PROVIDERS[item.provider] || item.provider} · ${item.model}`, number(item.calls), number(item.inputTokens), number(item.outputTokens), costs(item.costs)])),
        table('История запросов', ['Время', 'Задача', 'Модель', 'Статус', 'Токены вход / выход', 'Стоимость'], data.records.map(item => [new Date(item.createdAt).toLocaleString('ru-RU'), TASKS[item.task] || item.task, `${PROVIDERS[item.provider] || item.provider} · ${item.model}`, ({ success: 'Успешно', failed: 'Ошибка', pending: 'Выполняется' })[item.status] || item.status, `${tokenLabel(item.inputTokens)} / ${tokenLabel(item.outputTokens)}`, item.cost == null ? 'Не рассчитана' : costLabel(item.cost, item.currency)])),
        data.truncated && h('p', { className: 'neural-note' }, 'Показана только последняя часть истории. Итоги учитывают весь выбранный период. Сузьте период для подробностей.'),
        h('p', { className: 'muted' }, 'Локальная обработка не расходует токены провайдеров. Расчёт приложения может отличаться от счёта провайдера из-за налогов, скидок и дополнительных услуг.')));
  }

  function AdminPanel({ mode, token, actor, onExpired, onDirtyChange }) {
    const [context, setContext] = useState(null), [scopeId, setScopeId] = useState(''), [error, setError] = useState(''), [revision, setRevision] = useState(0);
    const dirty = useRef(false);
    useEffect(() => {
      const controller = new AbortController(); setError(''); setContext(null); setScopeId(''); dirty.current = false; onDirtyChange?.(false);
      request('/team/context', { signal: controller.signal }, token).then(value => {
        if (!controller.signal.aborted) { setContext(value); setScopeId((value.workScopes || value.scopes)[0]?.responsibilityScopeId || ''); }
      }).catch(reason => { if (!controller.signal.aborted) { setError(errorText(reason)); if (reason.status === 401) onExpired(); } });
      return () => controller.abort();
    }, [token, actor.id, revision]);
    return h('div', { className: 'neural-admin' },
      error && h('div', { role: 'alert', className: 'error' }, error, button('Повторить загрузку', () => setRevision(value => value + 1))),
      !context && !error && h('p', { role: 'status' }, 'Загружаем области доступа…'),
      context && (!(context.workScopes || context.scopes).length ? h('p', { className: 'neural-empty' }, 'Нет доступных областей для настройки.') : h(React.Fragment, null,
        field('Область настроек и расходов', h('select', { value: scopeId, onChange: event => {
          if (dirty.current && !window.confirm('Есть несохранённые настройки нейросетей. Сменить область без сохранения?')) return;
          dirty.current = false; onDirtyChange?.(false); setScopeId(event.target.value);
        } }, ...(context.workScopes || context.scopes).map(scope => h('option', { key: scope.responsibilityScopeId, value: scope.responsibilityScopeId }, scopeLabel(scope))))),
        scopeId && (mode === 'models' ? h(Settings, { key: scopeId, token, scopeId, onExpired, onDirtyChange: value => { dirty.current = value; onDirtyChange?.(value); } }) : h(Usage, { key: scopeId, token, scopeId, onExpired })))));
  }

  return function NeuralWorkspace({ token, actor, onExpired, onDirtyChange, onNavigate }) {
    const admin = actor.role === 'access_admin' && !actor.impersonation;
    const prices = ['access_admin', 'manager', 'mechanic', 'auditor'].includes(actor.role) && actor.grants.some(grant => grant.financeVisible);
    const [tab, setTab] = useState('summary');
    const dirty = useRef(false);
    const markDirty = value => { dirty.current = value; onDirtyChange?.(value); };
    useEffect(() => () => onDirtyChange?.(false), []);
    useEffect(() => {
      const beforeUnload = event => { if (dirty.current) { event.preventDefault(); event.returnValue = ''; } };
      window.addEventListener('beforeunload', beforeUnload);
      return () => window.removeEventListener('beforeunload', beforeUnload);
    }, []);
    return h('section', { className: 'neural-workspace', 'aria-label': 'Нейросети' },
      h('header', { className: 'neural-heading' }, h('div', null, h('span', { className: 'eyebrow' }, 'Интеллектуальные задачи'), h('h1', null, 'Нейросети'), h('p', null, 'Сводки команды, проверка цен и управление моделями'))),
      h('nav', { className: 'neural-tabs', 'aria-label': 'Разделы нейросетей' }, ...[['summary', 'Сводка'], ...(prices ? [['prices', 'Анализ цен']] : []), ...(admin ? [['models', 'Модели и задачи'], ['usage', 'Расходы']] : [])].map(([id, label]) => button(label, () => {
        if (tab === id) return;
        if (dirty.current && !window.confirm('Есть несохранённые изменения. Перейти без сохранения?')) return;
        markDirty(false); setTab(id);
      }, { key: id, className: `button ${tab === id ? 'primary' : 'secondary'}`, 'aria-current': tab === id ? 'page' : undefined }))),
      tab === 'summary' && h(Summary, { token, actor, onExpired, onDirtyChange: markDirty, onNavigate }),
      tab === 'prices' && prices && h(PriceAnalysis, { token, actor, onExpired }),
      ['models', 'usage'].includes(tab) && admin && h(AdminPanel, { mode: tab, token, actor, onExpired, onDirtyChange: markDirty }));
  };
}
