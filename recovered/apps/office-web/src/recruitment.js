// SPDX-License-Identifier: MIT
// Native recruiting UI. Conceptual CRM patterns only; no EspoCRM source included.
const STAGES = [
  ['new', 'Новый'], ['contact', 'Первый контакт'], ['qualified', 'Квалификация'], ['interview', 'Собеседование'], ['security', 'Проверка СБ'],
  ['internship', 'Стажировка'], ['paperwork', 'Оформление'], ['hired', 'Выход в работу'],
  ['reserve', 'Резерв'], ['rejected', 'Отказ'],
];
const KINDS = [['driver', 'Водитель'], ['carrier', 'Перевозчик']];
const SOURCES = [['manual', 'Вручную'], ['avito', 'Авито'], ['ati', 'АТИ'], ['hh', 'hh.ru'], ['referral', 'От водителя'], ['vehicle_sticker', 'Наклейка на автомобиле'], ['telegram', 'Telegram'], ['whatsapp', 'WhatsApp'], ['rabota_ru', 'Работа.ру'], ['superjob', 'SuperJob'], ['joblab', 'JobLab'], ['profi', 'Профи'], ['other', 'Другой источник']];
const WORK_VIEWS = [['all', 'Все кандидаты'], ['new', 'Новые'], ['today', 'На сегодня'], ['overdue', 'Просрочено'], ['security', 'Ожидают СБ'], ['starts', 'Ближайшие выходы'], ['no_next', 'Без следующего шага']];
const CONTACT_RESULTS = [['inquiry', 'Новое обращение'], ['connected', 'Связались'], ['no_answer', 'Не ответил'], ['callback', 'Перезвонить'], ['thinking', 'Думает'], ['declined', 'Не заинтересован']];
const SECURITY_STATES = [['not_requested', 'Не передан'], ['documents', 'Сбор документов'], ['submitted', 'Передан в СБ'], ['in_review', 'На проверке'], ['clarification', 'Нужны уточнения'], ['approved', 'Согласован'], ['rejected', 'Не согласован'], ['not_required', 'Не требуется']];
const sourceName = value => SOURCES.find(([id]) => id === value)?.[1] || value || 'Не указан';
const securityName = value => SECURITY_STATES.find(([id]) => id === value)?.[1] || 'Не передан';
const TABS = [['candidates', 'Кандидаты'], ['requests', 'Потребности'], ['tasks', 'Задачи'], ['analytics', 'Аналитика']];
const COMPANY_TABS = [['access', 'Доступ рекрутеров'], ['activity', 'Активность']];
const accessLabel = (state) => ({ active: 'Доступ открыт', expired: 'Срок истёк', revoked: 'Доступ отозван', unassigned: 'Нет назначений', inactive: 'Аккаунт отключён', internal: 'Штатный сотрудник' })[state] || 'Нет назначений';
const stageName = (value) => STAGES.find(([id]) => id === value)?.[1] || value;
const kindName = (value) => KINDS.find(([id]) => id === value)?.[1] || value;
const quantityLabel = (value) => value == null ? 'Не уточнено' : String(value);
const dateLabel = (value, time = false) => value ? new Intl.DateTimeFormat('ru-RU', time ? { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(time ? value : `${value.slice(0, 10)}T12:00:00`)) : 'Не указано';
const localDateTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const emptyData = () => ({ candidates: [], requests: [], applications: [], tasks: [], events: [], recruiters: [], contacts: [], workflowEvents: [], workflowOperators: [] });
const mergeById = (oldItems = [], newItems = []) => [...new Map([...oldItems, ...newItems].map(item => [item.id, item])).values()];
const pageData = result => ({ ...emptyData(), ...result, candidates: (result.items || []).map(item => item.candidate), applications: (result.items || []).flatMap(item => item.applications || []), tasks: (result.items || []).flatMap(item => item.tasks || []) });
const scopeLabel = (scope) => [scope.projectName, scope.regionName, scope.scopeName].filter(Boolean).join(' · ');
const scopeQuery = (responsibilityScopeId, values = {}) => new URLSearchParams({ ...(responsibilityScopeId ? { responsibilityScopeId } : {}), ...values }).toString();
const safeHh = (value) => {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && (!url.port || url.port === '443') && (url.hostname === 'hh.ru' || url.hostname.endsWith('.hh.ru')) ? url.href : null; } catch { return null; }
};
const normalized = (value) => String(value || '').toLocaleLowerCase('ru').trim();

// Invitation tokens live only in the URL fragment and component memory.
export function createRecruitmentInvitationPanel(React, { request }) {
  const { createElement: h, useState, useEffect, useRef } = React;
  const unavailable = 'Приглашение недоступно: ссылка уже использована, отозвана или срок её действия истёк. Попросите компанию выдать новую ссылку.';
  return function RecruitmentInvitationPanel({ invitationToken, onAuthenticated, onCancel }) {
    const [preview, setPreview] = useState(null), [loading, setLoading] = useState(true), [error, setError] = useState(''), [unavailableLink, setUnavailableLink] = useState(false);
    const [mode, setMode] = useState('new'), [value, setValue] = useState({ displayName: '', phone: '', password: '', confirm: '' }), [saving, setSaving] = useState(false), [retry, setRetry] = useState(0);
    const active = useRef(true), submitting = useRef(false);
    useEffect(() => {
      active.current = true;
      const controller = new AbortController();
      setLoading(true); setError(''); setPreview(null); setUnavailableLink(false);
      setValue({ displayName: '', phone: '', password: '', confirm: '' });
      request('/recruitment-invitations/preview', { method: 'POST', credentials: 'omit', body: JSON.stringify({ token: invitationToken }), signal: controller.signal })
        .then((result) => { if (!controller.signal.aborted) setPreview(result); })
        .catch((reason) => {
          if (controller.signal.aborted) return;
          const invalid = [400, 404, 409, 410].includes(reason?.status);
          setUnavailableLink(invalid); setError(invalid ? unavailable : 'Не удалось проверить приглашение. Проверьте соединение и попробуйте ещё раз.');
        }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
      return () => { active.current = false; controller.abort(); };
    }, [invitationToken, retry]);
    const change = (key, next) => { setValue((current) => ({ ...current, [key]: next })); setError(''); };
    const field = (label, key, props = {}, hint) => h('label', { className: 'recruitment-field' }, h('span', null, label),
      h('input', { value: value[key], onChange: (event) => change(key, event.target.value), 'aria-label': label, required: true, ...props }), hint && h('small', null, hint));
    async function submit(event) {
      event.preventDefault();
      if (submitting.current || !preview) return;
      if (mode === 'new' && value.password !== value.confirm) { setError('Пароли не совпадают. Повторите пароль.'); return; }
      if (mode === 'new' && value.displayName.trim().length < 2) { setError('Введите имя: минимум 2 символа.'); return; }
      submitting.current = true; setSaving(true); setError('');
      try {
        const result = await request('/recruitment-invitations/accept', { method: 'POST', credentials: 'include', headers: { 'X-Session-Refresh': '1' }, body: JSON.stringify({ token: invitationToken, phone: value.phone, password: value.password, ...(mode === 'new' ? { displayName: value.displayName.trim() } : { mode: 'existing' }) }) });
        if (!active.current) return;
        setValue({ displayName: '', phone: '', password: '', confirm: '' });
        onAuthenticated(result, value.phone);
      } catch (reason) {
        if (!active.current) return;
        if ([404, 410].includes(reason?.status)) { setUnavailableLink(true); setPreview(null); setValue({ displayName: '', phone: '', password: '', confirm: '' }); setError(unavailable); }
        else setError(reason?.status === 429 ? 'Слишком много попыток. Подождите немного и попробуйте снова.'
          : reason?.status === 400 ? reason.message || 'Проверьте имя, телефон и пароль.'
            : reason?.status === 409 ? reason.message || 'Не удалось принять приглашение. Попросите администратора проверить текущий доступ.'
            : [401, 403].includes(reason?.status) ? mode === 'existing' ? 'Не удалось войти. Проверьте телефон и пароль внешнего рекрутера.' : 'Не удалось создать аккаунт с этими данными. Если вы уже зарегистрированы, выберите «У меня есть аккаунт».'
              : 'Не удалось принять приглашение. Проверьте соединение и попробуйте снова.');
      } finally { submitting.current = false; if (active.current) setSaving(false); }
    }
    return h('main', { className: 'recruitment-workspace recruitment-invitation-page' }, h('section', { className: 'recruitment-invitation-card', 'aria-labelledby': 'recruitment-invitation-heading' },
      h('header', { className: 'recruitment-invitation-heading' }, h('span', { className: 'recruitment-eyebrow' }, 'ПРИГЛАШЕНИЕ В КОМАНДУ ПОДБОРА'), h('h1', { id: 'recruitment-invitation-heading' }, 'Доступ для рекрутера'), h('p', null, 'Укажите свои данные, чтобы получить личный доступ к потребностям компании.')),
      loading && h('div', { className: 'recruitment-loading', role: 'status' }, 'Проверяем приглашение…'),
      error && h('div', { className: 'recruitment-error', role: 'alert' }, error),
      !loading && !preview && !unavailableLink && h('button', { className: 'button', type: 'button', onClick: () => setRetry((count) => count + 1) }, 'Проверить снова'),
      !loading && preview && h(React.Fragment, null,
        h('div', { className: 'recruitment-segment recruitment-invitation-modes', 'aria-label': 'Способ входа по приглашению' }, ...[['new', 'Я новый рекрутер'], ['existing', 'У меня есть аккаунт']].map(([id, label]) => h('button', { key: id, type: 'button', className: 'button', disabled: saving, 'aria-pressed': mode === id, onClick: () => { setMode(id); setError(''); setValue((current) => ({ ...current, password: '', confirm: '' })); } }, label))),
        h('form', { onSubmit: submit }, h('fieldset', { disabled: saving, className: 'recruitment-invitation-fields' },
          mode === 'new' && field('Ваше имя', 'displayName', { type: 'text', minLength: 2, maxLength: 160, autoComplete: 'name', placeholder: 'Имя и фамилия' }),
          field('Номер телефона', 'phone', { type: 'tel', maxLength: 30, autoComplete: 'tel', placeholder: '+7 900 000-00-00' }, 'Этот номер будет вашим логином.'),
          field(mode === 'new' ? 'Придумайте пароль' : 'Пароль', 'password', { type: 'password', minLength: mode === 'new' ? 12 : 1, maxLength: 128, autoComplete: mode === 'new' ? 'new-password' : 'current-password' }, mode === 'new' ? 'Не менее 12 символов. Сохраните пароль для следующих входов.' : undefined),
          mode === 'new' && field('Повторите пароль', 'confirm', { type: 'password', minLength: 12, maxLength: 128, autoComplete: 'new-password' }),
          h('div', { className: 'recruitment-observation-notice', role: 'note' }, h('strong', null, 'Компания видит вашу активность'), h('p', null, 'Учитываются входы в раздел, просмотры потребностей и действия по подбору. Вы будете видеть назначенные потребности и своих кандидатов.')),
          h('button', { type: 'submit', className: 'button recruitment-primary', disabled: saving }, saving ? 'Открываем доступ…' : mode === 'new' ? 'Зарегистрироваться и войти' : 'Войти и принять приглашение'))),
        h('p', { className: 'recruitment-meta' }, `Ссылка действует до ${dateLabel(preview.expiresAt, true)} и используется один раз.`)),
      h('button', { type: 'button', className: 'recruitment-text-button', onClick: onCancel, disabled: saving }, 'Перейти к обычному входу')));
  };
}

export function createRecruitmentReminder(React, { request }) {
  const { createElement: h, useState, useEffect, useRef } = React;
  return function RecruitmentReminder({ token, onExpired, onOpen }) {
    const [tasks, setTasks] = useState([]);
    const callbacks = useRef({ onExpired, onOpen });
    callbacks.current = { onExpired, onOpen };
    useEffect(() => {
      let active = true;
      let controller;
      const refresh = async () => {
        controller?.abort();
        controller = new AbortController();
        const currentController = controller;
        try {
          const result = await request('/recruitment/reminders', { signal: currentController.signal }, token);
          if (active && !currentController.signal.aborted) setTasks(result.tasks || []);
        } catch (error) {
          if (!active || error?.name === 'AbortError') return;
          if ([401, 403].includes(error.status)) setTasks([]);
          if (error.status === 401) callbacks.current.onExpired?.();
        }
      };
      setTasks([]);
      refresh();
      const timer = setInterval(refresh, 60000);
      window.addEventListener('focus', refresh);
      window.addEventListener('recruitment:changed', refresh);
      return () => { active = false; controller?.abort(); clearInterval(timer); window.removeEventListener('focus', refresh); window.removeEventListener('recruitment:changed', refresh); };
    }, [token]);
    return tasks.length ? h('div', { className: 'recruitment-reminder', role: 'status' },
      h('span', { className: 'recruitment-reminder-icon', 'aria-hidden': true }, '◷'),
      h('div', null, h('strong', null, `Напоминания по подбору: ${tasks.length}`), h('span', null, 'Подошло время ваших задач.')),
      h('button', { type: 'button', onClick: () => callbacks.current.onOpen?.(tasks[0]?.responsibilityScopeId), className: 'button' }, 'Открыть задачи')) : null;
  };
}

export function createRecruitmentPanel(React, { request, OnboardingPanel }) {
  const { createElement: h, useState, useEffect, useMemo, useRef } = React;
  const button = (label, onClick, props = {}) => h('button', { type: 'button', className: 'button', onClick, ...props }, label);
  const badge = (label, tone = '') => h('span', { className: `recruitment-badge ${tone}` }, label);
  const hhLink = (url, label = 'Перейти на hh ↗') => safeHh(url) ? h('a', { className: 'recruitment-link', href: safeHh(url), target: '_blank', rel: 'noopener noreferrer' }, label) : null;
  const field = (label, input, hint, wide = false) => h('label', { className: `recruitment-field${wide ? ' is-wide' : ''}` },
    h('span', null, label), React.cloneElement(input, { 'aria-label': input.props['aria-label'] || label }), hint && h('small', null, hint));
  const empty = (title, description, action) => h('div', { className: 'recruitment-empty' },
    h('div', { className: 'recruitment-empty-mark', 'aria-hidden': true }, '＋'), h('h3', null, title), h('p', null, description), action);

  function ImportRowsPanel({ token, responsibilityScopeId, refreshKey, onError, onCandidate }) {
    const [filters, setFilters] = useState({ status: 'all', sheet: '', search: '', recruiter: '' });
    const [page, setPage] = useState(1), [result, setResult] = useState(null), [loading, setLoading] = useState(true);
    const [selectedId, setSelectedId] = useState(null), [detail, setDetail] = useState(null), [detailBusy, setDetailBusy] = useState(false);
    const callbacks = useRef({ onError, onCandidate });
    callbacks.current = { onError, onCandidate };
    const query = scopeQuery(responsibilityScopeId, { page: String(page), pageSize: '50', ...filters });
    const changeFilter = (key, value) => { setFilters(current => ({ ...current, [key]: value })); setPage(1); };
    const statuses = [['all', 'Все строки'], ['imported', 'Есть карточка'], ['review', 'Требуют разбора'], ['archive', 'Архив и справочники']];
    const statusName = value => statuses.find(([id]) => id === value)?.[1] || 'Требует уточнения';
    const plain = value => value == null || value === '' ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value);
    const issueLabels = {
      invalid_fullName: 'Имя отсутствует или требует исправления', invalid_city: 'Город отсутствует или требует исправления',
      invalid_phone: 'Телефон отсутствует или некорректен', unverified_inquiry_date: 'Дата обращения не подтверждена',
      unknown_source: 'Источник требует уточнения', unknown_recruiter: 'Исходный рекрутер не указан',
      phone_name_conflict_requires_review: 'Один телефон записан на разные имена', cross_sheet_phone_requires_review: 'Телефон встречается в обоих направлениях',
      repeat_inquiry_same_name_phone: 'Повторное обращение того же кандидата',
      excluded_example: 'Пример из исходного файла', no_candidate_identifiers: 'Строка без имени и телефона',
      source_row_without_candidate: 'Исходная строка без карточки кандидата', technical_source_row: 'Техническая строка исходного листа',
    };
    const issues = item => Array.isArray(item.issues) ? item.issues.map(issue => typeof issue === 'string' ? issueLabels[issue] || 'Требует уточнения' : issue.message || issue.label || 'Требует уточнения').join('; ') : item.issues ? plain(item.issues) : '';
    useEffect(() => { setPage(1); setSelectedId(null); setDetail(null); }, [responsibilityScopeId]);
    useEffect(() => {
      const controller = new AbortController(); let active = true;
      setLoading(true);
      const timer = setTimeout(() => request(`/recruitment/import-rows?${query}`, { signal: controller.signal }, token).then(data => {
        if (active) setResult({ ...data, responsibilityScopeId });
      }).catch(reason => { if (active && reason?.name !== 'AbortError') { setResult(null); callbacks.current.onError(reason); } }).finally(() => { if (active) setLoading(false); }), filters.search ? 200 : 0);
      return () => { active = false; clearTimeout(timer); controller.abort(); };
    }, [token, query, refreshKey]);
    useEffect(() => {
      if (!selectedId) return;
      const controller = new AbortController(); let active = true;
      setDetail(null); setDetailBusy(true);
      request(`/recruitment/import-row?${scopeQuery(responsibilityScopeId, { id: selectedId })}`, { signal: controller.signal }, token).then(data => {
        if (active) setDetail(data);
      }).catch(reason => { if (active && reason?.name !== 'AbortError') { setSelectedId(null); callbacks.current.onError(reason); } }).finally(() => { if (active) setDetailBusy(false); });
      return () => { active = false; controller.abort(); };
    }, [token, responsibilityScopeId, selectedId]);
    useEffect(() => {
      if (!selectedId) return;
      const element = document.querySelector('.recruitment-import-dialog'), previous = document.activeElement;
      element?.querySelector('button')?.focus();
      const keydown = event => {
        if (event.key === 'Escape') { event.preventDefault(); setSelectedId(null); }
        if (event.key === 'Tab') {
          const nodes = [...element.querySelectorAll('button:not([disabled]), a[href]')];
          if (event.shiftKey && document.activeElement === nodes[0]) { event.preventDefault(); nodes[nodes.length - 1]?.focus(); }
          else if (!event.shiftKey && document.activeElement === nodes[nodes.length - 1]) { event.preventDefault(); nodes[0]?.focus(); }
        }
      };
      element?.addEventListener('keydown', keydown);
      return () => { element?.removeEventListener('keydown', keydown); previous?.focus?.(); };
    }, [selectedId]);
    const data = result?.responsibilityScopeId === responsibilityScopeId ? result : null;
    const openCandidate = candidateId => { setSelectedId(null); callbacks.current.onCandidate(candidateId); };
    return h('div', { className: 'recruitment-import-view' },
      h('section', { className: 'recruitment-surface recruitment-import-intro' }, h('h3', null, 'История из Excel'),
        h('p', null, 'Исходные рекрутеры и значения сохранены как в файле. Администратор — технический ответственный за разбор, а не автор прежней работы.'),
        h('p', null, 'Пригодные карточки перенесены в архив, чтобы старые обращения не стали новыми задачами. Откройте карточку, проверьте актуальность данных и назначьте ответственного перед продолжением подбора.'),
        h('p', { className: 'recruitment-meta' }, 'Галочки, этапы и даты в исходной книге — исторические сведения. Они не подтверждают выходы или решения СБ в приложении.'),
        data?.fileName && h('p', { className: 'recruitment-meta' }, `Файл: ${plain(data.fileName)}${data.importedAt ? ` · загружен ${dateLabel(data.importedAt, true)}` : ''}`)),
      h('p', { className: 'recruitment-meta' }, 'Показатели считают строки исходного файла. Несколько строк могут относиться к одной карточке кандидата.'),
      h('div', { className: 'recruitment-import-counts', 'aria-label': 'Результат переноса Excel' }, ...statuses.map(([id, label]) => button(h(React.Fragment, null, h('span', null, label), h('strong', null, data?.counts?.[id] ?? '—')), () => changeFilter('status', id), { key: id, 'aria-pressed': filters.status === id }))),
      h('div', { className: 'recruitment-filters recruitment-import-filters' },
        field('Поиск по Excel', h('input', { type: 'search', value: filters.search, placeholder: 'Имя, телефон, город или место', onChange: event => changeFilter('search', event.target.value) })),
        field('Лист Excel', h('select', { value: filters.sheet, onChange: event => changeFilter('sheet', event.target.value) }, h('option', { value: '' }, 'Все листы'), ...(data?.sheets || []).map(sheet => h('option', { key: sheet, value: sheet }, sheet)))),
        field('Результат переноса', h('select', { value: filters.status, onChange: event => changeFilter('status', event.target.value) }, ...statuses.map(([id, label]) => h('option', { key: id, value: id }, label)))),
        field('Рекрутер в исходном файле', h('select', { value: filters.recruiter, onChange: event => changeFilter('recruiter', event.target.value) }, h('option', { value: '' }, 'Все исходные рекрутеры'), ...(data?.recruiters || []).map(name => h('option', { key: name, value: name }, name))))),
      loading ? h('div', { className: 'recruitment-loading', role: 'status' }, 'Загружаем строки Excel…') : data?.items?.length ? h('div', { className: 'recruitment-table-scroll recruitment-import-scroll', tabIndex: 0, 'aria-label': 'Исходные строки Excel' }, h('table', { className: 'recruitment-table recruitment-import-table' },
        h('thead', null, h('tr', null, ...['Источник', 'Кандидат и контакты', 'Исходный рекрутер', 'Результат переноса', 'Действия'].map(label => h('th', { key: label, scope: 'col' }, label)))),
        h('tbody', null, ...data.items.map(item => h('tr', { key: item.id, 'data-import-id': item.id },
          h('td', null, h('strong', null, plain(item.sheet)), h('p', { className: 'recruitment-meta' }, `Строка ${plain(item.row)}`), item.location && h('p', { className: 'recruitment-meta' }, plain(item.location))),
          h('td', null, h('strong', null, item.fullName || 'Имя не заполнено'), h('p', null, plain(item.phone)), h('p', { className: 'recruitment-meta' }, [item.city, item.source].filter(Boolean).map(plain).join(' · ') || 'Город и источник не заполнены')),
          h('td', null, plain(item.recruiter)),
          h('td', null, badge(statusName(item.status), item.status === 'review' ? 'is-warning' : ''), issues(item) && h('p', { className: 'recruitment-import-issues' }, issues(item))),
          h('td', null, h('div', { className: 'recruitment-import-actions' }, button('Исходная строка', () => setSelectedId(item.id), { className: 'recruitment-text-button' }), item.candidateId && button('Открыть карточку', () => openCandidate(item.candidateId), { className: 'recruitment-text-button' }))))))))
        : empty('Строк по выбранным условиям нет', data?.fileName ? 'Измените фильтры или поисковый запрос.' : 'В компании пока нет загруженной истории из Excel.'),
      h('div', { className: 'recruitment-pagination' }, h('span', { className: 'recruitment-meta', role: 'status' }, data?.total ? `${(page - 1) * 50 + 1}–${Math.min(page * 50, data.total)} из ${data.total} · по 50 строк` : 'Нет строк'),
        h('div', { className: 'recruitment-actions' }, button('Предыдущая страница Excel', () => setPage(current => Math.max(1, current - 1)), { disabled: loading || page <= 1 }), h('span', { className: 'recruitment-meta' }, `Страница ${page} из ${Math.max(1, Math.ceil((data?.total || 0) / 50))}`), button('Следующая страница Excel', () => setPage(current => current + 1), { disabled: loading || page * 50 >= (data?.total || 0) }))),
      selectedId && h('div', { className: 'recruitment-overlay' }, h('section', { className: 'recruitment-dialog recruitment-import-dialog', role: 'dialog', 'aria-modal': true, 'aria-labelledby': 'recruitment-import-heading' },
        h('div', { className: 'recruitment-dialog-heading' }, h('div', null, h('span', { className: 'recruitment-eyebrow' }, 'ИСТОЧНИК ИЗ EXCEL'), h('h2', { id: 'recruitment-import-heading' }, detail ? `${detail.item.sheet} · строка ${detail.item.row}` : 'Исходная строка')), button('Закрыть исходную строку', () => setSelectedId(null), { className: 'recruitment-text-button' })),
        h('div', { className: 'recruitment-detail-body' }, detailBusy ? h('p', { role: 'status' }, 'Загружаем исходные значения…') : detail && h(React.Fragment, null,
          h('p', { className: 'recruitment-meta' }, `${plain(detail.fileName)} · ${statusName(detail.item.status)}`),
          h('p', { className: 'recruitment-note' }, 'Это историческая строка исходного файла. Отметки найма и проверок не являются подтверждениями в приложении.'),
          issues(detail.item) && h('p', { className: 'recruitment-import-issues' }, issues(detail.item)),
          h('dl', { className: 'recruitment-import-fields' }, ...(detail.fields || []).map((sourceField, index) => h('div', { key: `${sourceField.column || ''}-${index}` }, h('dt', null, sourceField.label || sourceField.column || `Поле ${index + 1}`), h('dd', null, h('span', null, plain(sourceField.value ?? sourceField.cached)), sourceField.formula && h(React.Fragment, null, h('small', null, 'Сохранённое значение из файла; формула не пересчитывается.'), h('details', { className: 'recruitment-import-formula' }, h('summary', null, 'Формула в исходном файле'), h('code', null, plain(sourceField.formula)))))))),
          detail.item.candidateId && button('Открыть карточку кандидата', () => openCandidate(detail.item.candidateId), { className: 'button recruitment-primary' }))))));
  }

  function FormDialog({ form, setForm, saving, error, onSave, onClose, data, actor, accessData, scopes, onAssignAccess, onCopyInvitation }) {
    const ref = useRef(null);
    const headingId = 'recruitment-form-title';
    const value = form.value;
    const external = actor?.role === 'external_recruiter';
    const operator = ['manager', 'dispatcher', 'access_admin'].includes(actor?.role);
    const change = (key, next) => setForm((current) => ({ ...current, value: { ...current.value, [key]: next,
      ...(key === 'candidateId' && current.type === 'tasks' ? { applicationId: '' } : {}),
      ...(key === 'responsibilityScopeId' && ['access', 'invitation'].includes(current.type) ? { requestIds: [], ...(current.type === 'access' ? { userId: '' } : {}) } : {}),
    } }));
    const accountScopes = scopes.filter(scope => actor.grants?.some(grant => grant.responsibilityScopeId === scope.responsibilityScopeId));
    const projectChoices = ['account', 'attach'].includes(form.type) ? accountScopes : scopes;
    const formScope = scopes.find(item => item.responsibilityScopeId === value.responsibilityScopeId);
    const companyId = item => item?.legalEntityId || scopes.find(scope => scope.responsibilityScopeId === item?.responsibilityScopeId)?.legalEntityId;
    const accessRequests = data.requests.filter(item => item.responsibilityScopeId === value.responsibilityScopeId);
    const text = (key, options = {}) => h('input', { type: 'text', value: value[key] ?? '', onChange: (event) => change(key, event.target.value), ...options });
    const area = (key, maxLength, rows = 3) => h('textarea', { value: value[key] || '', onChange: (event) => change(key, event.target.value), maxLength, rows });
    const select = (key, options, props = {}) => h('select', { value: value[key] || '', onChange: (event) => change(key, event.target.value), ...props }, ...options.map(([id, label]) => h('option', { key: id, value: id }, label)));
    const recruiters = (form.type === 'requests' ? data.requestRecruiters || data.recruiters : data.recruiters).map((person) => [person.id, person.name]);
    if (value.recruiterId && !recruiters.some(([id]) => id === value.recruiterId)) recruiters.push([value.recruiterId, 'Ранее назначенный рекрутер недоступен']);
    if (value.assigneeId && !recruiters.some(([id]) => id === value.assigneeId)) recruiters.push([value.assigneeId, 'Ранее назначенный сотрудник недоступен']);
    useEffect(() => {
      const previous = document.activeElement;
      const element = ref.current;
      element?.querySelector('input, select, textarea, button')?.focus();
      const keys = (event) => {
        if (event.key === 'Escape') { event.preventDefault(); onClose(); }
        if (event.key === 'Tab') {
          const nodes = [...element.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]')].filter((node) => node.offsetParent !== null);
          const first = nodes[0], last = nodes[nodes.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }
      };
      element?.addEventListener('keydown', keys);
      return () => { element?.removeEventListener('keydown', keys); previous?.focus?.(); };
    }, [onClose]);
    const titles = { contacts: 'Результат контакта', security: 'Проверка СБ', start: 'Подтверждение выхода', candidates: 'Кандидат', requests: 'Потребность в подборе', applications: 'Подбор кандидата', tasks: 'Задача рекрутеру', access: 'Назначить потребности рекрутеру', account: 'Новый внешний рекрутер', attach: 'Подключить существующего рекрутера', invitation: value.invitationUrl ? 'Приглашение готово' : 'Пригласить по ссылке' };
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    let fields;
    if (form.type === 'candidates') fields = [
      field('ФИО', text('fullName', { required: true, maxLength: 160, autoComplete: 'name' }), null, true),
      field('Телефон', text('phone', { required: true, type: 'tel', maxLength: 30, autoComplete: 'tel', placeholder: '+7 900 000-00-00' })),
      field('Направление', select('kind', KINDS)),
      field('Город', text('city', { required: true, maxLength: 100 })), field('Район проживания', text('district', { maxLength: 160 })),
      !external && field('Рекрутер', select('recruiterId', [['', 'Выберите рекрутера'], ...recruiters], { required: true })),
      field('Источник', select('source', SOURCES)),
      field('Ссылка на кандидата или диалог hh', text('hhUrl', { type: 'url', maxLength: 2048, placeholder: 'https://hh.ru/…' }), 'Переписка открывается на сайте hh.', true),
      field('Категории прав', text('licenseCategories', { maxLength: 80, placeholder: 'B, C, CE' })), field('Опыт работы', text('experience', { maxLength: 500 })),
      ...(value.kind === 'carrier' ? [field('Тип кузова / автомобиль', text('vehicleType', { maxLength: 160 })), field('Габариты кузова', text('vehicleDimensions', { maxLength: 160, placeholder: 'Д × Ш × В, м' })), field('Грузоподъёмность / объём', text('vehicleCapacity', { maxLength: 160, placeholder: '1,5 т / 12 м³' }))] : []),
      field('Заметки о кандидате', area('notes', 4000), null, true),
      h('label', { className: 'recruitment-check is-wide', key: 'archived' }, h('input', { type: 'checkbox', checked: Boolean(value.archived), onChange: (event) => change('archived', event.target.checked) }), 'Карточка в архиве'),
    ];
    if (form.type === 'requests') fields = [
      field('Название потребности', text('title', { required: true, maxLength: 160, placeholder: 'Водители на утренние маршруты' }), null, true),
      field('Направление', select('kind', KINDS)), field(value.kind === 'carrier' ? 'Нужно машин' : 'Нужно водителей', text('quantity', { type: 'number', required: value.status === 'open', min: value.status === 'open' ? 1 : 0, max: 10000, step: 1 }), value.status !== 'open' ? 'Оставьте пустым, если количество ещё не уточнено.' : undefined),
      field('Город', text('city', { required: value.status === 'open', maxLength: 100 })), field('Район / место работы', text('district', { maxLength: 160 })),
      field('Рекрутер', select('recruiterId', [['', 'Выберите рекрутера'], ...recruiters], { required: true })), field('Нужны к дате', text('neededBy', { type: 'date' })),
      h('label', { className: 'recruitment-check is-wide' }, h('input', { type: 'checkbox', checked: Boolean(value.requiresSecurity), disabled: Boolean(value.version) && !operator, onChange: (event) => change('requiresSecurity', event.target.checked) }), 'Согласование СБ обязательно перед стажировкой и выходом', Boolean(value.version) && !operator && h('small', null, 'Изменить это правило может руководитель, диспетчер или администратор.')),
      field('Приоритет', select('priority', [['normal', 'Обычный'], ['urgent', 'Срочно']])), field('Статус потребности', select('status', [['open', 'Открыта'], ['paused', 'Приостановлена'], ['closed', 'Закрыта']])),
      field('График работы', text('schedule', { maxLength: 300 }), null, true), field('Условия оплаты', area('payTerms', 1000, 2), null, true),
      field('Адрес склада / точки выхода', text('warehouseAddress', { maxLength: 500 }), null, true),
      field('Маршруты и работа на проекте', area('routeInfo', 1000, 2), null, true),
      field('Требования к водителю', area('driverRequirements', 1000, 2), null, true),
      field('Требования к автомобилю', area('vehicleRequirements', 1000, 2), null, true),
      field('Обучение и стажировка', area('trainingTerms', 1000, 2), null, true),
      field('Описание для внешних рекрутеров', area('publicBrief', 4000), 'Видно всем рекрутерам с доступом к этой потребности. Укажите детали для подбора и кандидата.', true),
      field('Ссылка на вакансию hh', text('hhUrl', { type: 'url', maxLength: 2048, placeholder: 'https://hh.ru/vacancy/…' }), null, true),
      field('Вакансия опубликована', text('publishedAtLocal', { type: 'datetime-local', disabled: !value.version }), value.version ? `Фиксируется вручную. Время: ${zone}. Не ранее создания потребности.` : 'Сначала сохраните потребность, затем укажите время публикации.', true),
      value.version > 0 && h('div', { className: 'is-wide' }, button('Опубликовано сейчас', () => { const publishedAt = new Date().toISOString(); setForm((current) => ({ ...current, value: { ...current.value, publishedAt, publishedAtLocal: localDateTime(publishedAt) } })); }, { className: 'recruitment-text-button' })),
      field('Комментарий к потребности', area('notes', 4000), 'Внутренний комментарий компании. Внешним рекрутерам не показывается.', true),
    ];
    if (form.type === 'applications') {
      const selectedCandidate = data.candidates.find((candidate) => candidate.id === value.candidateId);
      const requests = data.requests.filter((item) => item.id === value.requestId || (item.status !== 'closed' && (!selectedCandidate || (item.kind === selectedCandidate.kind && companyId(item) === companyId(selectedCandidate)))));
      fields = [
        field('Кандидат', select('candidateId', [['', 'Выберите кандидата'], ...data.candidates.filter((item) => !item.archived || item.id === value.candidateId).map((item) => [item.id, `${item.fullName} · ${item.city}`])], { required: true, disabled: value.version > 0 }), null, true),
        field('Потребность', select('requestId', [['', 'Выберите потребность'], ...requests.map((item) => [item.id, `${item.title} · ${scopes.find(scope => scope.responsibilityScopeId === item.responsibilityScopeId)?.projectName || item.city}`])], { required: true, disabled: value.version > 0 }), 'Тип кандидата и потребности должен совпадать.', true),
        field('Этап подбора', select('stage', STAGES)), !external && field('Рекрутер', select('recruiterId', [['', 'Выберите рекрутера'], ...recruiters], { required: true })),
        field('Дата выхода в работу', text('startDate', { type: 'date', required: value.stage === 'hired' }), 'Плановая дата. Фактический выход подтверждается отдельно.', true),
        field(value.stage === 'rejected' ? 'Причина отказа' : 'Комментарий к этапу', React.cloneElement(area('reason', 1000), { required: value.stage === 'rejected' }), null, true),
      ];
    }
    if (form.type === 'tasks') fields = [
      field('Название задачи', text('title', { required: true, maxLength: 300, placeholder: 'Позвонить и узнать о решении' }), null, true),
      field('Кандидат по задаче', select('candidateId', [['', 'Без кандидата'], ...data.candidates.map((item) => [item.id, item.fullName])]), null, true),
      field('Подбор по задаче', select('applicationId', [['', 'Без привязки к подбору'], ...data.applications.filter(item => (!value.candidateId || item.candidateId === value.candidateId) && (!value.version || item.responsibilityScopeId === value.responsibilityScopeId)).map(item => [item.id, data.requests.find(demand => demand.id === item.requestId)?.title || 'Потребность'])]), 'Выберите подбор, чтобы следующий шаг появился в рабочем списке.', true),
      field('Дата и время напоминания', text('dueAtLocal', { type: 'datetime-local', required: true }), `Время устройства: ${zone}.`),
      !external && field('Ответственный', select('assigneeId', [['', 'Выберите сотрудника'], ...recruiters], { required: true })),
      field('Статус задачи', select('status', [['open', 'Открыта'], ['done', 'Выполнена']])), field('Комментарий к задаче', area('notes', 2000), null, true),
    ];
    if (form.type === 'contacts') fields = [
      field('Результат контакта', select('result', CONTACT_RESULTS), null, true),
      field('Подбор по обращению', select('applicationId', [['', 'Общее обращение'], ...data.applications.filter(item => item.candidateId === value.candidateId).map(item => [item.id, data.requests.find(demand => demand.id === item.requestId)?.title || 'Потребность'])]), null, true),
      value.result === 'inquiry' && field('Источник обращения', select('source', SOURCES), 'Источник сохраняется у этого обращения. История предыдущих обращений остаётся.', true),
      field('Комментарий к контакту', area('notes', 2000), null, true),
      h('label', { className: 'recruitment-check is-wide' }, h('input', { type: 'checkbox', checked: Boolean(value.hasNextAction) || ['no_answer', 'callback', 'thinking'].includes(value.result), disabled: ['no_answer', 'callback', 'thinking'].includes(value.result), onChange: event => change('hasNextAction', event.target.checked) }), 'Назначить следующий шаг'),
      ...((value.hasNextAction || ['no_answer', 'callback', 'thinking'].includes(value.result)) ? [
        field('Следующее действие', text('nextTitle', { required: true, maxLength: 300, placeholder: 'Перезвонить кандидату' }), null, true),
        field('Когда выполнить', text('nextDueAtLocal', { type: 'datetime-local', required: true }), `Время устройства: ${zone}.`),
        !external && field('Ответственный за следующий шаг', select('nextAssigneeId', [['', 'Выберите сотрудника'], ...recruiters], { required: true })),
      ] : []),
      value.completeTaskId && h('label', { className: 'recruitment-check is-wide' }, h('input', { type: 'checkbox', checked: Boolean(value.completeCurrentTask), onChange: event => change('completeCurrentTask', event.target.checked) }), 'Завершить текущую задачу после сохранения контакта'),
    ];
    if (form.type === 'security') fields = [
      field('Состояние проверки', h('select', { value: value.status, onChange: event => change('status', event.target.value) }, ...SECURITY_STATES.filter(([id]) => operator || ['documents', 'submitted'].includes(id)).map(([id, label]) => h('option', { key: id, value: id, disabled: (['submitted', 'in_review', 'clarification'].includes(id) && !value.assigneeId) || (id === 'not_requested' && value.hasSecurityTask) }, label))), !value.assigneeId ? operator ? 'Выберите проверяющего перед передачей в СБ.' : 'Проверяющего назначает руководитель, диспетчер или администратор. Пока можно сохранить сбор документов.' : value.hasSecurityTask ? 'Назначенная проверка остаётся открытой до решения СБ.' : undefined, true),
      operator && field('Ответственный в СБ', select('assigneeId', [['', 'Выберите проверяющего'], ...(data.workflowOperators || []).map(item => [item.id, item.name])], { required: ['submitted', 'in_review', 'clarification'].includes(value.status) })),
      field('Срок проверки', text('dueAtLocal', { type: 'datetime-local', required: ['submitted', 'in_review', 'clarification'].includes(value.status) }), `Время устройства: ${zone}.${value.status === 'documents' && value.originalDueAt ? ' Пустое поле сохраняет ранее назначенный срок; задача остаётся открытой.' : ''}`),
      field('Комментарий к передаче', React.cloneElement(area('note', 2000), { required: ['rejected', 'clarification'].includes(value.status) }), 'Материалы и подробности проверки доступны уполномоченным сотрудникам.', true),
    ];
    if (form.type === 'start') fields = [
      field('Результат выхода', h('select', { value: value.status, onChange: event => change('status', event.target.value) }, h('option', { value: 'confirmed' }, 'Фактический выход подтверждён'), h('option', { value: 'no_show', disabled: Boolean(value.plannedStartDate && value.plannedStartDate > new Intl.DateTimeFormat('en-CA', { timeZone: data.timeZone || zone }).format(new Date())) }, 'Не вышел')), value.plannedStartDate ? `План выхода: ${dateLabel(value.plannedStartDate)}. Неявку можно отметить, когда наступит эта дата.` : undefined),
      value.status === 'confirmed' && field('Дата фактического выхода', text('date', { type: 'date', required: true, max: localDateTime(new Date().toISOString()).slice(0, 10) })),
      field('Комментарий к выходу', React.cloneElement(area('note', 2000), { required: value.status === 'no_show' || value.previousStatus === 'confirmed' }), 'Подтверждение сотрудником компании. Данные о сменах из 1С пока не поступают.', true),
    ];
    if (['access', 'invitation'].includes(form.type)) fields = [
      form.type === 'invitation' && h('p', { className: 'recruitment-meta is-wide' }, 'Рекрутер сам укажет имя, телефон и пароль. Выберите потребности и срок доступа, затем передайте ему личную ссылку.'),
      form.type === 'access' && field('Внешний рекрутер', select('userId', [['', 'Выберите аккаунт'], ...(accessData.users || []).filter((person) => person.id === value.userId || (person.active && person.approved && !(accessData.grants || []).some((grant) => grant.userId === person.id && grant.responsibilityScopeId === value.responsibilityScopeId))).filter(person => person.responsibilityScopeId === value.responsibilityScopeId).map((person) => [person.id, person.name])], { required: true, disabled: Boolean(value.version) }), 'Каждый рекрутер входит под личным аккаунтом.', true),
      field('Доступ до', text(form.type === 'invitation' ? 'accessExpiresAtLocal' : 'expiresAtLocal', { type: 'datetime-local', required: true }), `Время устройства: ${zone}. По истечении срока доступ прекращается.`, true),
      h('div', { className: 'recruitment-access-choices is-wide' }, h('strong', null, 'Доступные потребности'), h('p', { className: 'recruitment-meta' }, 'Рекрутер увидит только выбранные потребности, своих кандидатов и свои подборы.'),
        h('div', { className: 'recruitment-actions' }, button('Выбрать все текущие потребности', () => change('requestIds', accessRequests.map((item) => item.id)), { className: 'recruitment-text-button' }), button('Снять выбор', () => change('requestIds', []), { className: 'recruitment-text-button' }), h('span', { className: 'recruitment-meta' }, `Выбрано: ${value.requestIds.length} из ${accessRequests.length}`)),
        h('p', { className: 'recruitment-meta' }, 'Новые потребности не добавляются автоматически. Для них компания обновляет назначение.'),
        ...accessRequests.map((item) => h('label', { className: 'recruitment-check', key: item.id }, h('input', { type: 'checkbox', checked: value.requestIds.includes(item.id), onChange: (event) => change('requestIds', event.target.checked ? [...value.requestIds, item.id] : value.requestIds.filter((id) => id !== item.id)) }), h('span', null, item.title, h('small', null, `${item.city} · ${kindName(item.kind)} · ${quantityLabel(item.quantity)} · ${({ open: 'Открыта', paused: 'Пауза', closed: 'Закрыта' })[item.status]}`))))),
      !accessRequests.length && h('p', { className: 'recruitment-meta is-wide' }, 'Сначала создайте потребность в этом проекте.'),
      form.type === 'invitation' && h('p', { className: 'recruitment-meta is-wide' }, 'Приглашение одноразовое: 7 дней на вход, но не дольше выбранного срока доступа.'),
    ];
    if (form.type === 'invitation' && value.invitationUrl) fields = [
      h('div', { className: 'recruitment-credentials is-wide' }, h('strong', null, 'Передайте ссылку одному рекрутеру'),
        field('Ссылка-приглашение', h('input', { type: 'text', readOnly: true, value: value.invitationUrl, onFocus: (event) => event.target.select() })),
        button(value.copied ? 'Ссылка скопирована' : 'Скопировать ссылку', onCopyInvitation, { className: 'button recruitment-primary' }),
        h('p', { role: 'status' }, value.copyError || `Одноразовая ссылка действует до ${dateLabel(value.expiresAt, true)}. После входа рекрутер появится в списке доступа.`),
        h('p', null, 'Скопируйте ссылку перед закрытием окна. Позже можно отозвать приглашение и создать новое.'),
        ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname) && h('p', { className: 'recruitment-meta' }, 'Локальная тестовая ссылка: откроется только на этом компьютере. Для отправки рекрутеру используйте приложение на сервере.')),
    ];
    if (form.type === 'account') fields = value.createdEmployeeId ? [
      h('div', { className: 'recruitment-feedback is-wide' }, `Аккаунт «${value.displayName}» создан. Доступ к потребностям ещё не выдан.`),
      value.issuedPassword ? h('div', { className: 'recruitment-credentials is-wide' }, h('strong', null, 'Данные для входа'), h('span', null, `Телефон: ${value.phone}`), h('code', null, value.issuedPassword), h('p', null, 'Сохраните пароль и передайте рекрутеру лично. После закрытия окна пароль больше не показывается.'), button('Назначить потребности', () => onAssignAccess(value.createdEmployeeId, value.responsibilityScopeId), { className: 'button recruitment-primary' }))
        : field('Телефон для входа', text('phone', { type: 'tel', required: true, maxLength: 30, placeholder: '+7 900 000-00-00' }), 'На следующем шаге появится пароль. Сообщения не отправляются.', true),
    ] : [field('Имя внешнего рекрутера', text('displayName', { required: true, maxLength: 160, autoComplete: 'name' }), null, true), h('p', { className: 'recruitment-meta is-wide' }, 'Шаг 1 — создать личный аккаунт. Шаг 2 — выдать пароль. Шаг 3 — выбрать потребности и срок доступа.')];
    if (form.type === 'attach') fields = [field('Личный аккаунт рекрутера', select('userId', [['', 'Выберите аккаунт'], ...form.accounts.filter(person => !accessData.users.some(item => item.id === person.id && item.responsibilityScopeId === value.responsibilityScopeId)).map((person) => [person.id, person.displayName])], { required: true }), 'Используется существующий телефон и пароль. Новый аккаунт создавать не нужно.', true), h('p', { className: 'recruitment-meta is-wide' }, 'После подключения выберите потребности этого проекта и срок доступа. До назначения рекрутер не увидит проект.')];
    if (!external && ['requests', 'access', 'invitation', 'account', 'attach'].includes(form.type) && !value.invitationUrl && !value.createdEmployeeId) {
      fields.unshift(field('Проект', select('responsibilityScopeId', projectChoices.map(item => [item.responsibilityScopeId, scopeLabel(item)]), { required: true, disabled: Boolean(value.version) }), form.type === 'requests' ? 'Проект этой потребности. Кандидаты остаются в общей базе компании.' : 'Проект назначаемых потребностей.', true));
    }
    const companies = [...new Map(scopes.map(item => [item.legalEntityId, item])).values()];
    if (!external && form.type === 'candidates' && !value.version && companies.length > 1) fields.unshift(field('Компания', select('responsibilityScopeId', companies.map(item => [item.responsibilityScopeId, item.legalEntityName])), null, true));
    return h('div', { className: 'recruitment-overlay' }, h('section', { className: 'recruitment-dialog', ref, role: 'dialog', 'aria-modal': true, 'aria-labelledby': headingId },
      h('div', { className: 'recruitment-dialog-heading' }, h('div', null, h('span', { className: 'recruitment-eyebrow' }, value.version ? 'РЕДАКТИРОВАНИЕ' : 'НОВАЯ ЗАПИСЬ'), h('h2', { id: headingId }, titles[form.type])), button('Закрыть', onClose, { className: 'recruitment-text-button', disabled: saving })),
      h('form', { onSubmit: onSave },
        h('fieldset', { disabled: saving, className: 'recruitment-form-grid' }, ...fields.filter(Boolean).map((item, index) => React.cloneElement(item, { key: item.key || index }))),
        error && h('div', { className: 'recruitment-error', role: 'alert' }, error),
        h('div', { className: 'recruitment-form-footer' }, h('small', null, value.invitationUrl ? 'Приглашение создано. Сохраните ссылку перед закрытием окна.' : 'Изменения сохраняются на сервере после нажатия кнопки.'),
          button(value.issuedPassword || value.invitationUrl ? 'Закрыть' : 'Отмена', onClose, { disabled: saving }), !value.issuedPassword && !value.invitationUrl && h('button', { type: 'submit', className: 'button recruitment-primary', disabled: saving }, saving ? 'Сохраняем…' : form.type === 'invitation' ? 'Сгенерировать ссылку' : form.type === 'attach' ? 'Подключить аккаунт' : form.type === 'account' ? value.createdEmployeeId ? 'Выдать пароль' : 'Создать аккаунт' : 'Сохранить')))));
  }

  return function RecruitmentPanel({ token, actor, onExpired, onDirtyChange, taskRequest = 0, reminderScopeId = null }) {
    const external = actor?.role === 'external_recruiter';
    const company = ['manager', 'access_admin'].includes(actor?.role);
    const operator = ['manager', 'dispatcher', 'access_admin'].includes(actor?.role);
    const canReadImport = ['manager', 'dispatcher', 'recruiter', 'access_admin'].includes(actor?.role);
    const tabs = [...TABS, ...(!external && OnboardingPanel ? [['onboarding', 'Оформление']] : []), ...(canReadImport ? [['imports', 'Импорт Excel']] : []), ...(company ? COMPANY_TABS : [])];
    const [scopes, setScopes] = useState([]), [scopeId, setScopeId] = useState(''), [projectFilter, setProjectFilter] = useState('');
    const [data, setData] = useState(emptyData), [contextLoading, setContextLoading] = useState(true), [loading, setLoading] = useState(false);
    const requestedScope = useRef(new URLSearchParams(window.location.search).get('recruitmentScope')).current;
    const requestedTab = useRef(new URLSearchParams(window.location.search).get('recruitmentTab')).current;
    const [tab, setTab] = useState(() => taskRequest > 0 ? 'tasks' : tabs.some(([id]) => id === requestedTab) ? requestedTab : 'candidates');
    const [candidateFilter, setCandidateFilter] = useState({ search: '', city: '', kind: '', recruiter: '', source: '', stage: '' });
    const [generalFilter, setGeneralFilter] = useState({ search: '', city: '', kind: '', recruiter: '' });
    const [workView, setWorkView] = useState('all'), [page, setPage] = useState(1), [pageSize, setPageSize] = useState(25);
    const [worklist, setWorklist] = useState({ items: [], total: 0, counts: {}, cities: [] });
    const [candidateLayout, setCandidateLayout] = useState(() => requestedTab === 'pipeline' || new URLSearchParams(window.location.search).get('recruitmentView') === 'board' ? 'board' : 'table'), [detailLoading, setDetailLoading] = useState(false);
    const [contactPage, setContactPage] = useState(1), [contactTotal, setContactTotal] = useState(0);
    const paginated = tab === 'candidates';
    const [requestFilter, setRequestFilter] = useState({ search: '', city: '', kind: '', recruiter: '' });
    const filter = tab === 'requests' ? requestFilter : paginated ? candidateFilter : generalFilter;
    const setFilter = tab === 'requests' ? setRequestFilter : paginated ? setCandidateFilter : setGeneralFilter;
    const [showArchive, setShowArchive] = useState(false), [taskStatus, setTaskStatus] = useState('open');
    const [onlyWithCandidates, setOnlyWithCandidates] = useState(false);
    const [form, setForm] = useState(null), [detailId, setDetailId] = useState(null), [demandId, setDemandId] = useState(null), [saving, setSaving] = useState(false);
    const [onboardingCandidateId, setOnboardingCandidateId] = useState(''), [onboardingDirty, setOnboardingDirty] = useState(false);
    const [stageEdit, setStageEdit] = useState(null), [stageResult, setStageResult] = useState(null);
    const [stageConflicts, setStageConflicts] = useState([]);
    const [invitations, setInvitations] = useState([]);
    const [accessData, setAccessData] = useState({ users: [], grants: [] }), [activity, setActivity] = useState(null), [days, setDays] = useState(30), [companyLoading, setCompanyLoading] = useState(false);
    const [error, setError] = useState(''), [formError, setFormError] = useState(''), [message, setMessage] = useState('');
    const [refreshKey, setRefreshKey] = useState(0), [contextKey, setContextKey] = useState(0), [now, setNow] = useState(Date.now());
    const mounted = useRef(true), callbacks = useRef({ onExpired, onDirtyChange }), dirtyRef = useRef(false), scopeRef = useRef(scopeId), savingRef = useRef(false), accessVersionRef = useRef(null);
    const snapshotEpoch = useRef(0);
    callbacks.current = { onExpired, onDirtyChange };
    scopeRef.current = scopeId;
    savingRef.current = saving;
    const dirty = Boolean(onboardingDirty || stageEdit || (form && JSON.stringify(form.value) !== form.initial));
    dirtyRef.current = dirty;
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const scope = scopes.find((item) => item.responsibilityScopeId === scopeId);
    const listScopeId = external ? scopeId : projectFilter;
    const projectName = item => scopes.find(scope => scope.responsibilityScopeId === item?.responsibilityScopeId)?.projectName || 'Проект не указан';
    const recordScope = (value, type, source = data) => {
      if (type === 'tasks' && value.version > 0) return value.responsibilityScopeId;
      if (type === 'applications') return source.requests.find(item => item.id === value.requestId)?.responsibilityScopeId || value.responsibilityScopeId;
      if (['contacts', 'tasks', 'security', 'start'].includes(type)) return source.applications.find(item => item.id === value.applicationId)?.responsibilityScopeId || source.candidates.find(item => item.id === value.candidateId)?.responsibilityScopeId || value.responsibilityScopeId;
      return value.responsibilityScopeId;
    };
    const recruiterName = (id) => data.recruiters.find((item) => item.id === id)?.name || 'Рекрутер недоступен';
    const candidateMap = useMemo(() => new Map(data.candidates.map((item) => [item.id, item])), [data.candidates]);
    const requestMap = useMemo(() => new Map(data.requests.map((item) => [item.id, item])), [data.requests]);
    const applicationsByCandidate = useMemo(() => {
      const grouped = new Map();
      for (const application of data.applications) {
        if (!grouped.has(application.candidateId)) grouped.set(application.candidateId, []);
        grouped.get(application.candidateId).push(application);
      }
      return grouped;
    }, [data.applications]);
    const applicationsByRequest = useMemo(() => {
      const grouped = new Map();
      for (const application of data.applications) {
        if (!candidateMap.has(application.candidateId)) continue;
        if (!grouped.has(application.requestId)) grouped.set(application.requestId, []);
        grouped.get(application.requestId).push(application);
      }
      return grouped;
    }, [data.applications, candidateMap]);
    const detail = candidateMap.get(detailId);
    const demandDetail = requestMap.get(demandId);
    const confirmDiscard = () => !dirtyRef.current || window.confirm('В рекрутинге есть несохранённые изменения. Выйти без сохранения?');
    const clearForm = () => { setForm(null); setFormError(''); setStageEdit(null); setStageResult(null); dirtyRef.current = false; callbacks.current.onDirtyChange?.(false); };
    const closeFormRef = useRef(null);
    closeFormRef.current = () => { if (!savingRef.current && confirmDiscard()) clearForm(); };
    const stableClose = useMemo(() => () => closeFormRef.current?.(), []);

    function fail(reason, isForm = false) {
      if (reason?.name === 'AbortError') return;
      if ([401, 403].includes(reason?.status)) {
        snapshotEpoch.current += 1;
        setData(emptyData()); setWorklist({ items: [], total: 0, counts: {}, cities: [] }); setAccessData({ users: [], grants: [] }); setInvitations([]); setActivity(null); setDetailId(null); setDemandId(null); clearForm();
        if (external) { setScopes([]); setScopeId(''); }
        if (reason.status === 401) callbacks.current.onExpired?.();
      }
      const text = reason?.status === 401 ? 'Сессия закончилась. Войдите снова.'
        : reason?.status === 403 ? external ? 'Нет доступа к этому проекту. Доступ мог быть отозван или его срок истёк. Обратитесь к компании и обновите список проектов.' : 'Нет доступа к рекрутингу компании. Обратитесь к администратору.'
          : reason?.status === 409 ? `${reason.message || 'Запись уже изменена или такой телефон / подбор существует.'} Ваши изменения остались в форме. При конфликте версии закройте форму и обновите данные.`
            : reason?.status === 400 ? reason.message || 'Проверьте обязательные поля, телефон, ссылку https://hh.ru и даты.'
              : isForm ? 'Не удалось сохранить запись. Ваши изменения остались в форме. Проверьте соединение и повторите попытку.'
                : 'Не удалось загрузить рекрутинг. Проверьте соединение и повторите попытку.';
      (isForm && ![401, 403].includes(reason?.status) ? setFormError : setError)(text);
    }

    useEffect(() => { mounted.current = true; return () => { mounted.current = false; callbacks.current.onDirtyChange?.(false); }; }, []);
    useEffect(() => { callbacks.current.onDirtyChange?.(dirty); }, [dirty]);
    useEffect(() => {
      if ((!detailId && !demandId) || form) return;
      const element = document.querySelector('.recruitment-detail');
      if (!element) return;
      const previous = document.activeElement;
      element.querySelector('button')?.focus();
      const keys = (event) => {
        if (event.key === 'Escape') { event.preventDefault(); setDetailId(null); setDemandId(null); }
        if (event.key === 'Tab') {
          const nodes = [...element.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])')].filter((node) => node.offsetParent !== null);
          if (event.shiftKey && document.activeElement === nodes[0]) { event.preventDefault(); nodes[nodes.length - 1]?.focus(); }
          else if (!event.shiftKey && document.activeElement === nodes[nodes.length - 1]) { event.preventDefault(); nodes[0]?.focus(); }
        }
      };
      element.addEventListener('keydown', keys);
      return () => { element.removeEventListener('keydown', keys); previous?.focus?.(); };
    }, [detailId, demandId, Boolean(form), Boolean(detail), Boolean(demandDetail)]);
    useEffect(() => {
      const guard = (event) => { if (dirtyRef.current) { event.preventDefault(); event.returnValue = ''; } };
      window.addEventListener('beforeunload', guard);
      const timer = setInterval(() => setNow(Date.now()), 60000);
      return () => { window.removeEventListener('beforeunload', guard); clearInterval(timer); };
    }, []);
    const appliedTaskRequest = useRef(0);
    useEffect(() => {
      if (taskRequest > 0 && taskRequest !== appliedTaskRequest.current && !contextLoading && scopes.length && confirmDiscard()) {
        appliedTaskRequest.current = taskRequest;
        clearForm(); setDetailId(null); setDemandId(null); setTab('tasks'); setTaskStatus('open');
        setGeneralFilter({ search: '', city: '', kind: '', recruiter: external ? '' : actor?.id || '' });
        if (!external) setProjectFilter('');
        if (external && reminderScopeId && scopes.some((item) => item.responsibilityScopeId === reminderScopeId)) setScopeId(reminderScopeId);
      }
    }, [taskRequest, contextLoading, scopes, reminderScopeId, actor?.id]);
    useEffect(() => {
      const controller = new AbortController(); let active = true;
      snapshotEpoch.current += 1;
      clearForm();
      setContextLoading(true); setError(''); setData(emptyData()); setWorklist({ items: [], total: 0, counts: {}, cities: [] }); setAccessData({ users: [], grants: [] }); setInvitations([]); setActivity(null); setDetailId(null); setDemandId(null); setScopes([]); setScopeId('');
      request('/recruitment/context', { signal: controller.signal }, token).then((result) => {
        if (!active) return;
        setScopes(result.scopes || []); setScopeId(result.scopes?.find(item => item.responsibilityScopeId === requestedScope)?.responsibilityScopeId || result.scopes?.[0]?.responsibilityScopeId || '');
        setProjectFilter('');
      }).catch((reason) => { if (active) fail(reason); }).finally(() => { if (active) setContextLoading(false); });
      return () => { active = false; controller.abort(); };
    }, [token, contextKey]);
    const listQuery = new URLSearchParams({ ...(listScopeId ? { responsibilityScopeId: listScopeId } : {}), view: workView, page: String(page), pageSize: String(pageSize), archived: String(showArchive), search: candidateFilter.search || '', city: candidateFilter.city || '', kind: candidateFilter.kind || '', recruiterId: candidateFilter.recruiter || '', source: candidateFilter.source || '', stage: candidateFilter.stage || '' }).toString();
    const snapshotPath = paginated ? `/recruitment/worklist?${listQuery}` : `/recruitment?${scopeQuery(listScopeId)}`;
    const receiveSnapshot = result => {
      setData(current => {
        const next = paginated ? pageData(result) : { ...emptyData(), ...result };
        if (!detailId) return next;
        return { ...next, candidates: mergeById(next.candidates, current.candidates.filter(item => item.id === detailId)), applications: mergeById(next.applications, current.applications.filter(item => item.candidateId === detailId)), tasks: mergeById(next.tasks, current.tasks.filter(item => item.candidateId === detailId)), contacts: current.contacts, events: mergeById(next.events, current.events), workflowEvents: current.workflowEvents };
      });
      if (paginated) {
        setWorklist(result);
        setPage(current => Math.min(current, Math.max(1, Math.ceil((result.total || 0) / pageSize))));
      }
      setStageConflicts([]);
    };
    useEffect(() => { setPage(1); }, [scopeId, projectFilter, workView, candidateFilter.search, candidateFilter.city, candidateFilter.kind, candidateFilter.recruiter, candidateFilter.source, candidateFilter.stage, showArchive, pageSize]);
    useEffect(() => {
      if (!scopeId) return;
      if (['imports', 'onboarding'].includes(tab)) { setLoading(false); return; }
      const controller = new AbortController(); let active = true;
      snapshotEpoch.current += 1;
      setLoading(true); setError('');
      const timer = setTimeout(() => request(snapshotPath, { signal: controller.signal }, token).then((result) => {
        if (active) receiveSnapshot(result);
      }).catch((reason) => { if (active) fail(reason); }).finally(() => { if (active) setLoading(false); }), paginated && filter.search ? 200 : 0);
      return () => { active = false; clearTimeout(timer); controller.abort(); };
    }, [token, scopeId, refreshKey, snapshotPath, tab === 'imports', tab === 'onboarding']);
    useEffect(() => {
      if (!detailId || !scopeId) return;
      const controller = new AbortController(); let active = true;
      setDetailLoading(true);
      request(`/recruitment/candidate?${scopeQuery(external ? scopeId : '', { candidateId: detailId, contactPage: String(contactPage), contactPageSize: '50' })}`, { signal: controller.signal }, token).then(result => {
        if (!active) return;
        setContactTotal(result.contactTotal || 0);
        setData(current => ({ ...current, candidates: mergeById(current.candidates, [result.candidate]), applications: mergeById(current.applications, result.applications), tasks: mergeById(current.tasks, result.tasks), events: mergeById(current.events, result.events), requests: mergeById(current.requests, result.requests), requestRecruiters: result.requestRecruiters || current.requestRecruiters, recruiters: mergeById(current.recruiters, result.recruiters), contacts: result.contacts || [], workflowEvents: result.workflowEvents || [], workflowOperators: result.workflowOperators || current.workflowOperators }));
      }).catch(reason => { if (active) fail(reason); }).finally(() => { if (active) setDetailLoading(false); });
      return () => { active = false; controller.abort(); };
    }, [token, scopeId, detailId, refreshKey, contactPage]);
    useEffect(() => { setContactPage(1); }, [detailId]);
    useEffect(() => {
      if (!scopeId) return;
      const controller = new AbortController(); let active = true;
      request('/recruitment/visits', { method: 'POST', body: JSON.stringify(external ? { responsibilityScopeId: scopeId } : {}), signal: controller.signal }, token).catch((reason) => { if (active && [401, 403].includes(reason?.status)) fail(reason); });
      return () => { active = false; controller.abort(); };
    }, [token, scopeId]);
    useEffect(() => {
      setAccessData({ users: [], grants: [] }); setInvitations([]); setActivity(null);
      if (!company || !scopeId || !['access', 'activity'].includes(tab)) { setCompanyLoading(false); return; }
      const controller = new AbortController(); let active = true;
      setCompanyLoading(true); setError('');
      Promise.all([request(`/recruitment/${tab}?${scopeQuery(listScopeId, tab === 'activity' ? { days: String(days) } : {})}`, { signal: controller.signal }, token), tab === 'access' && actor?.role === 'access_admin' ? request(`/recruitment/invitations?${scopeQuery(listScopeId)}`, { signal: controller.signal }, token) : null])
        .then(([result, links]) => { if (active) { tab === 'access' ? setAccessData(result) : setActivity(result); setInvitations(links?.invitations || []); } })
        .catch((reason) => { if (active) fail(reason); }).finally(() => { if (active) setCompanyLoading(false); });
      return () => { active = false; controller.abort(); };
    }, [token, scopeId, projectFilter, tab, days, refreshKey, company]);
    useEffect(() => {
      if (!external || !scopeId) return;
      accessVersionRef.current = { scopeId, version: scope?.accessVersion };
      let controller, active = true;
      const verifyAccess = async () => {
        controller?.abort(); controller = new AbortController();
        const current = controller;
        try {
          const result = await request('/recruitment/context', { signal: current.signal }, token);
          if (!active || current.signal.aborted) return;
          const currentScope = result.scopes?.find((item) => item.responsibilityScopeId === scopeRef.current);
          if (!currentScope) { fail({ status: 403 }); return; }
          if (accessVersionRef.current?.scopeId === scopeRef.current && currentScope.accessVersion !== accessVersionRef.current.version) {
            snapshotEpoch.current += 1;
            setData(emptyData()); setWorklist({ items: [], total: 0, counts: {}, cities: [] }); setDetailId(null); setDemandId(null); clearForm();
            accessVersionRef.current = { scopeId: scopeRef.current, version: currentScope.accessVersion };
            setRefreshKey((value) => value + 1);
          }
          setScopes(result.scopes || []);
        } catch (reason) { if (active && reason?.name !== 'AbortError') fail(reason); }
      };
      const timer = setInterval(verifyAccess, 60000);
      window.addEventListener('focus', verifyAccess);
      return () => { active = false; controller?.abort(); clearInterval(timer); window.removeEventListener('focus', verifyAccess); };
    }, [token, scopeId, external]);
    useEffect(() => {
      if (!external || !scope?.accessExpiresAt) return;
      let timer;
      const checkExpiry = () => {
        const remaining = new Date(scope.accessExpiresAt).getTime() - Date.now();
        if (remaining <= 0) { fail({ status: 403 }); return; }
        timer = setTimeout(checkExpiry, Math.min(remaining, 2147483647));
      };
      checkExpiry();
      return () => clearTimeout(timer);
    }, [external, scope?.accessExpiresAt]);

    function navigate(next) { if (saving || !confirmDiscard()) return; clearForm(); setOnboardingDirty(false); setDetailId(null); setDemandId(null); setTab(next); setMessage(''); }
    function chooseScope(next) { if (saving || !confirmDiscard()) return; snapshotEpoch.current += 1; if (!external) { clearForm(); setDetailId(null); setDemandId(null); setProjectFilter(next); setMessage(''); return; } clearForm(); setDetailId(null); setDemandId(null); setData(emptyData()); setWorklist({ items: [], total: 0, counts: {}, cities: [] }); setAccessData({ users: [], grants: [] }); setInvitations([]); setActivity(null); setScopeId(next); setCandidateFilter({ search: '', city: '', kind: '', recruiter: '', source: '', stage: '' }); setGeneralFilter({ search: '', city: '', kind: '', recruiter: '' }); setRequestFilter({ search: '', city: '', kind: '', recruiter: '' }); setOnlyWithCandidates(false); setMessage(''); }
    async function openForm(type, record, extra = {}) {
      if (saving || !confirmDiscard()) return;
      if (external && ['requests', 'access', 'account', 'invitation'].includes(type)) return;
      if (['access', 'account'].includes(type) && !company) return;
      if (type === 'invitation' && actor?.role !== 'access_admin') return;
      let catalog = data, accessCatalog = accessData;
      if (['applications', 'tasks', 'access', 'invitation'].includes(type)) {
        const currentScope = scopeId;
        savingRef.current = true; setSaving(true); setError('');
        try {
          const [records, permissions] = await Promise.all([request(`/recruitment?${scopeQuery(external ? scopeId : '')}`, {}, token), type === 'access' ? request('/recruitment/access', {}, token) : null]);
          catalog = { ...emptyData(), ...records };
          if (permissions) accessCatalog = permissions;
          if (!mounted.current || scopeRef.current !== currentScope) return;
        } catch (reason) { if (mounted.current && scopeRef.current === currentScope) fail(reason); return; }
        finally { if (mounted.current) { savingRef.current = false; setSaving(false); } }
      }
      const eligibleRecruiters = type === 'requests' ? catalog.requestRecruiters || catalog.recruiters : catalog.recruiters;
      const recruiterId = external || eligibleRecruiters.some((person) => person.id === actor?.id) ? actor.id : eligibleRecruiters[0]?.id || '';
      const preferredScope = projectFilter || scopeId;
      const targetScope = type === 'account' ? scopes.find(item => item.responsibilityScopeId === preferredScope && actor.grants?.some(grant => grant.responsibilityScopeId === item.responsibilityScopeId))?.responsibilityScopeId || scopes.find(item => actor.grants?.some(grant => grant.responsibilityScopeId === item.responsibilityScopeId))?.responsibilityScopeId || '' : preferredScope;
      const targetProject = scopes.find(item => item.responsibilityScopeId === targetScope);
      const base = { id: crypto.randomUUID(), responsibilityScopeId: targetScope, version: 0 };
      const defaults = {
        candidates: { ...base, fullName: '', phone: '', city: targetProject?.regionName || '', district: '', kind: 'driver', recruiterId, source: 'manual', hhUrl: '', licenseCategories: '', experience: '', vehicleType: '', vehicleDimensions: '', vehicleCapacity: '', notes: '', archived: false },
        requests: { ...base, requiresSecurity: false, title: '', city: targetProject?.regionName || '', district: '', kind: 'driver', quantity: 1, priority: 'normal', status: 'open', neededBy: '', recruiterId, schedule: '', payTerms: '', vehicleRequirements: '', warehouseAddress: '', routeInfo: '', driverRequirements: '', trainingTerms: '', publicBrief: '', notes: '', hhUrl: '', publishedAt: null },
        applications: { ...base, candidateId: '', requestId: '', recruiterId, stage: 'new', reason: '', startDate: '' },
        contacts: { id: crypto.randomUUID(), responsibilityScopeId: targetScope, candidateId: '', applicationId: '', result: 'connected', source: 'manual', notes: '', hasNextAction: true, nextTitle: 'Связаться с кандидатом', nextDueAtLocal: localDateTime(new Date(Date.now() + 3600000).toISOString()), nextAssigneeId: recruiterId },
        security: { responsibilityScopeId: targetScope, applicationId: '', version: 0, status: 'submitted', assigneeId: '', dueAtLocal: '', note: '' },
        start: { responsibilityScopeId: targetScope, applicationId: '', version: 0, status: 'confirmed', date: '', note: '' },
        tasks: { ...base, candidateId: '', applicationId: '', title: '', dueAt: new Date(Date.now() + 3600000).toISOString(), assigneeId: recruiterId, status: 'open', notes: '' },
        access: { responsibilityScopeId: targetScope, userId: '', requestIds: [], version: 0, status: 'active', expiresAt: new Date(Date.now() + 30 * 86400000).toISOString() },
        account: { responsibilityScopeId: targetScope, displayName: '', phone: '', idempotencyKey: crypto.randomUUID() },
        invitation: { responsibilityScopeId: targetScope, requestIds: data.requests.filter(item => item.responsibilityScopeId === targetScope).map((item) => item.id), accessExpiresAtLocal: localDateTime(new Date(Date.now() + 30 * 86400000).toISOString()) },
      };
      const value = { ...(record || defaults[type]), ...extra };
      value.responsibilityScopeId = recordScope(value, type, catalog) || targetScope;
      if (type === 'security') {
        const application = data.applications.find(item => item.id === value.applicationId);
        value.assigneeId ||= operator ? actor.id : '';
        if (!operator && !value.assigneeId) value.status = 'documents';
        value.originalDueAt = application?.securityDueAt || null;
        value.hasSecurityTask = data.tasks.some(task => task.applicationId === value.applicationId && task.workflowKind === 'security' && task.status === 'open') || Boolean(application?.securityAssigneeId && application.securityDueAt && ['documents', 'submitted', 'in_review', 'clarification'].includes(application.securityStatus));
      }
      if (type === 'contacts' && extra.applicationId) { const app = data.applications.find(item => item.id === extra.applicationId); if (app) value.nextAssigneeId = app.recruiterId; }
      if (external && ['candidates', 'applications'].includes(type)) value.recruiterId = actor.id;
      if (external && type === 'tasks') value.assigneeId = actor.id;
      if (type === 'access') { value.status = 'active'; value.expiresAtLocal = localDateTime(value.expiresAt); }
      if (type === 'requests') value.publishedAtLocal = localDateTime(value.publishedAt);
      if (type === 'tasks') value.dueAtLocal = localDateTime(value.dueAt);
      setStageEdit(null); setStageResult(null); setDemandId(null); setForm({ type, value, initial: JSON.stringify(value), catalog, accessCatalog }); setFormError(''); setMessage('');
    }
    async function refreshStages(applicationId) {
      if (savingRef.current || (stageEdit && stageEdit.id !== applicationId && !confirmDiscard())) return;
      const submittedScope = scopeId;
      const epoch = snapshotEpoch.current;
      savingRef.current = true; setSaving(true);
      try {
        const result = await request(snapshotPath, {}, token);
        if (!mounted.current || scopeRef.current !== submittedScope || snapshotEpoch.current !== epoch) return;
        receiveSnapshot(result); setStageEdit(null); setStageResult(null);
      } catch (reason) {
        if (!mounted.current || scopeRef.current !== submittedScope || snapshotEpoch.current !== epoch) return;
        if ([401, 403].includes(reason?.status)) fail(reason);
        else setStageResult({ id: applicationId, conflict: true, error: 'Не удалось обновить данные. Проверьте соединение и повторите попытку.' });
      } finally { if (mounted.current) { savingRef.current = false; setSaving(false); } }
    }
    async function saveStage(application, changes) {
      if (savingRef.current || stageConflicts.includes(application.id) || application.stage === changes.stage) return;
      const submittedScope = scopeId;
      const epoch = snapshotEpoch.current;
      savingRef.current = true; setSaving(true); setMessage('');
      setStageResult({ id: application.id, pending: true });
      try {
        const saved = await request('/recruitment/applications', { method: 'PUT', body: JSON.stringify({ ...application, ...changes }) }, token);
        if (!mounted.current || scopeRef.current !== submittedScope || snapshotEpoch.current !== epoch) return;
        setData((current) => ({ ...current, applications: current.applications.map((item) => item.id === saved.id ? saved : item) }));
        setWorklist(current => ({ ...current, items: current.items.map(item => ({ ...item, applications: (item.applications || []).map(value => value.id === saved.id ? saved : value) })) }));
        setStageEdit(null); setStageResult({ id: application.id, message: 'Статус сохранён' });
        window.dispatchEvent(new Event('recruitment:changed'));
        // Refresh server history and counts without clearing the grid or losing focus/scroll.
        try {
          const result = await request(snapshotPath, {}, token);
          if (mounted.current && scopeRef.current === submittedScope && snapshotEpoch.current === epoch) { receiveSnapshot(result); }
        } catch (reason) {
          if (!mounted.current || scopeRef.current !== submittedScope || snapshotEpoch.current !== epoch) return;
          if ([401, 403].includes(reason?.status)) fail(reason);
          else setStageResult({ id: application.id, message: 'Статус сохранён', refresh: true, error: 'Не удалось обновить историю и показатели. Обновите данные.' });
        }
      } catch (reason) {
        if (!mounted.current || scopeRef.current !== submittedScope || snapshotEpoch.current !== epoch) return;
        if ([401, 403].includes(reason?.status)) fail(reason);
        else { if (reason?.status === 409) setStageConflicts((current) => [...new Set([...current, application.id])]);
          setStageResult({ id: application.id, conflict: reason?.status === 409,
          error: reason?.status === 409 ? 'Подбор уже изменён другим пользователем. Обновите данные и выберите статус заново.'
            : reason?.status === 400 ? reason.message || 'Проверьте данные статуса.'
              : 'Не удалось подтвердить сохранение статуса. Проверьте соединение и повторите попытку.' }); }
      } finally { if (mounted.current) { savingRef.current = false; setSaving(false); } }
    }
    function chooseStage(application, stage) {
      if (savingRef.current || stageConflicts.includes(application.id) || (stageEdit && stageEdit.id !== application.id && !confirmDiscard())) return;
      setStageEdit(null); setStageResult(null);
      if (stage === application.stage) return;
      if (stage === 'rejected' || stage === 'hired') {
        setStageEdit({ id: application.id, stage, reason: '', startDate: application.startDate || '' });
      } else saveStage(application, { stage });
    }
    async function save(event) {
      event.preventDefault();
      if (saving || !form) return;
      const submitted = { ...form.value, responsibilityScopeId: recordScope(form.value, form.type, form.catalog || data) || scopeId };
      if (form.type === 'access') {
        if (!submitted.userId || !submitted.requestIds.length) { setFormError('Выберите рекрутера и хотя бы одну потребность.'); return; }
        if (!submitted.expiresAtLocal || new Date(submitted.expiresAtLocal) <= new Date()) { setFormError('Укажите будущую дату окончания доступа.'); return; }
        submitted.expiresAt = new Date(submitted.expiresAtLocal).toISOString();
        delete submitted.expiresAtLocal;
      }
      if (form.type === 'invitation') {
        if (!submitted.requestIds.length) { setFormError('Выберите хотя бы одну потребность.'); return; }
        if (!submitted.accessExpiresAtLocal || !Number.isFinite(new Date(submitted.accessExpiresAtLocal).getTime()) || new Date(submitted.accessExpiresAtLocal) <= new Date()) { setFormError('Укажите будущую дату окончания доступа.'); return; }
        submitted.accessExpiresAt = new Date(submitted.accessExpiresAtLocal).toISOString();
        delete submitted.accessExpiresAtLocal;
      }
      if (submitted.hhUrl && !safeHh(submitted.hhUrl)) { setFormError('Укажите HTTPS-ссылку на hh.ru или его поддомен.'); return; }
      if (form.type === 'requests') {
        submitted.quantity = submitted.quantity == null || String(submitted.quantity).trim() === '' ? null : Number(submitted.quantity);
        submitted.neededBy ||= null;
        delete submitted.sourceDetails;
        submitted.publishedAt = submitted.publishedAtLocal ? (submitted.publishedAt && localDateTime(submitted.publishedAt) === submitted.publishedAtLocal ? submitted.publishedAt : new Date(submitted.publishedAtLocal).toISOString()) : null;
        delete submitted.publishedAtLocal;
        if (!submitted.version && submitted.publishedAt) { setFormError('Сначала сохраните потребность, затем укажите время её публикации на hh.'); return; }
        if (submitted.publishedAt && new Date(submitted.publishedAt) < new Date(submitted.createdAt)) { setFormError('Дата публикации не может быть раньше создания потребности.'); return; }
      }
      if (form.type === 'tasks') { submitted.dueAt = submitted.dueAt && localDateTime(submitted.dueAt) === submitted.dueAtLocal ? submitted.dueAt : new Date(submitted.dueAtLocal).toISOString(); submitted.candidateId ||= null; submitted.applicationId ||= null; delete submitted.dueAtLocal; }
      if (form.type === 'applications') submitted.startDate ||= null;
      if (form.type === 'contacts') {
        if ((submitted.hasNextAction || ['no_answer', 'callback', 'thinking'].includes(submitted.result)) && (!submitted.nextTitle?.trim() || !submitted.nextDueAtLocal || !submitted.nextAssigneeId)) { setFormError('Укажите следующее действие, срок и ответственного.'); return; }
      }
      const type = form.type, submittedScope = scopeId, submitTarget = submitted.responsibilityScopeId;
      setSaving(true); setFormError('');
      try {
        if (['contacts', 'security', 'start'].includes(type)) {
          const payload = type === 'contacts' ? {
            id: submitted.id, responsibilityScopeId: submitTarget, candidateId: submitted.candidateId, applicationId: submitted.applicationId || null, result: submitted.result, source: submitted.result === 'inquiry' ? submitted.source : undefined, notes: submitted.notes,
            nextAction: submitted.hasNextAction || ['no_answer', 'callback', 'thinking'].includes(submitted.result) ? { title: submitted.nextTitle.trim(), dueAt: new Date(submitted.nextDueAtLocal).toISOString(), assigneeId: submitted.nextAssigneeId } : null,
            completeTaskId: submitted.completeCurrentTask ? submitted.completeTaskId || null : null,
          } : type === 'security' ? { responsibilityScopeId: submitTarget, applicationId: submitted.applicationId, version: submitted.version, status: submitted.status, assigneeId: submitted.assigneeId || null, dueAt: submitted.status === 'documents' && submitted.dueAtLocal === localDateTime(submitted.originalDueAt) ? null : submitted.dueAtLocal ? new Date(submitted.dueAtLocal).toISOString() : null, note: submitted.note }
            : { responsibilityScopeId: submitTarget, applicationId: submitted.applicationId, version: submitted.version, status: submitted.status, date: submitted.status === 'confirmed' ? submitted.date : undefined, note: submitted.note };
          await request(`/recruitment/${type === 'start' ? 'start-confirmation' : type}`, { method: 'POST', body: JSON.stringify(payload) }, token);
          if (!mounted.current || scopeRef.current !== submittedScope) return;
          clearForm(); setMessage(type === 'contacts' ? 'Контакт сохранён' : type === 'security' ? 'Проверка СБ обновлена' : 'Результат выхода сохранён'); setRefreshKey(current => current + 1); window.dispatchEvent(new Event('recruitment:changed')); return;
        }
        if (type === 'invitation') {
          const result = await request('/recruitment/invitations', { method: 'POST', body: JSON.stringify(submitted) }, token);
          if (!mounted.current || scopeRef.current !== submittedScope) return;
          const url = new URL(window.location.pathname, window.location.origin); url.searchParams.set('section', 'recruitment'); url.hash = `recruitment-invite=${encodeURIComponent(result.invitationToken)}`;
          const value = { ...submitted, expiresAt: result.expiresAt, invitationUrl: url.href };
          setForm({ type, value, initial: JSON.stringify(value) }); setRefreshKey((current) => current + 1);
          return;
        }
        if (type === 'attach') {
          await request('/access/employees/external-scope', { method: 'POST', body: JSON.stringify({ userId: submitted.userId, scopeId: submitTarget }) }, token);
          if (!mounted.current || scopeRef.current !== submittedScope) return;
          const value = { responsibilityScopeId: submitTarget, userId: submitted.userId, requestIds: [], version: 0, status: 'active', expiresAtLocal: localDateTime(new Date(Date.now() + 30 * 86400000).toISOString()) };
          const [catalog, accessCatalog] = await Promise.all([request('/recruitment', {}, token), request('/recruitment/access', {}, token)]);
          if (!mounted.current || scopeRef.current !== submittedScope) return;
          setForm({ type: 'access', value, initial: JSON.stringify(value), catalog, accessCatalog }); setRefreshKey((current) => current + 1);
          return;
        }
        if (type === 'account') {
          let value;
          if (!submitted.createdEmployeeId) {
            const result = await request('/access/employees/external', { method: 'POST', body: JSON.stringify({ displayName: submitted.displayName, scopeId: submitTarget, idempotencyKey: submitted.idempotencyKey }) }, token);
            const employee = result.employee || result;
            value = { ...submitted, createdEmployeeId: employee.id, displayName: employee.displayName };
          } else {
            const result = await request(`/access/users/${encodeURIComponent(submitted.createdEmployeeId)}/password`, { method: 'POST', body: JSON.stringify({ phone: submitted.phone }) }, token);
            value = { ...submitted, phone: result.phone || submitted.phone, issuedPassword: result.password };
          }
          if (!mounted.current || scopeRef.current !== submittedScope) return;
          setForm({ type, value, initial: JSON.stringify(value) }); setRefreshKey((current) => current + 1);
          return;
        }
        const saved = await request(`/recruitment/${type}`, { method: 'PUT', body: JSON.stringify(submitted) }, token);
        if (!mounted.current || scopeRef.current !== submittedScope) return;
        clearForm(); setMessage('Сохранено');
        if (type === 'candidates') setDetailId(saved.id);
        setRefreshKey((value) => value + 1);
        window.dispatchEvent(new Event('recruitment:changed'));
      } catch (reason) { if (mounted.current && scopeRef.current === submittedScope) fail(reason, true); }
      finally { if (mounted.current) setSaving(false); }
    }
    async function copyInvitation() {
      const url = form?.value?.invitationUrl;
      if (!url) return;
      try {
        await navigator.clipboard.writeText(url);
        if (mounted.current) setForm((current) => { if (current?.value?.invitationUrl !== url) return current; const value = { ...current.value, copied: true, copyError: '' }; return { ...current, value, initial: JSON.stringify(value) }; });
      } catch {
        if (mounted.current) setForm((current) => { if (current?.value?.invitationUrl !== url) return current; const value = { ...current.value, copyError: 'Не удалось скопировать автоматически. Выделите ссылку и скопируйте её вручную.' }; return { ...current, value, initial: JSON.stringify(value) }; });
      }
    }
    async function revokeInvitation(invitation) {
      if (saving || !window.confirm('Отозвать приглашение? Рекрутер больше не сможет войти по этой ссылке.')) return;
      const submittedScope = scopeId;
      setSaving(true); setError('');
      try {
        await request(`/recruitment/invitations/${encodeURIComponent(invitation.id)}/revoke`, { method: 'POST', body: JSON.stringify({ responsibilityScopeId: invitation.responsibilityScopeId || submittedScope }) }, token);
        if (!mounted.current || scopeRef.current !== submittedScope) return;
        setMessage('Приглашение отозвано'); setRefreshKey((current) => current + 1);
      } catch (reason) { if (mounted.current && scopeRef.current === submittedScope) fail(reason); }
      finally { if (mounted.current) setSaving(false); }
    }
    async function openExistingRecruiter() {
      if (saving || actor?.role !== 'access_admin' || !confirmDiscard()) return;
      const submittedScope = scopeId;
      setSaving(true); setError('');
      try {
        const accessCatalog = await request('/recruitment/access', {}, token);
        const accounts = []; let cursor = null;
        do {
          const result = await request(`/access/employees?role=external_recruiter&limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, {}, token);
          if (!mounted.current || scopeRef.current !== submittedScope) return;
          accounts.push(...result.items); cursor = result.nextCursor;
          if (cursor && accounts.length >= 10000) throw new Error('Too many accounts');
        } while (cursor);
        const managedScopes = scopes.filter(item => actor.grants?.some(grant => grant.responsibilityScopeId === item.responsibilityScopeId));
        const eligible = accounts.filter(person => person.active && person.approved && managedScopes.some(scope => !accessCatalog.users.some(item => item.id === person.id && item.responsibilityScopeId === scope.responsibilityScopeId)));
        if (!eligible.length) { setMessage('Нет других доступных внешних аккаунтов. Все подходящие рекрутеры уже подключены к этому проекту.'); return; }
        const value = { userId: '', responsibilityScopeId: managedScopes.find(item => item.responsibilityScopeId === projectFilter)?.responsibilityScopeId || managedScopes[0]?.responsibilityScopeId || '' };
        setForm({ type: 'attach', value, initial: JSON.stringify(value), accounts: eligible, accessCatalog }); setFormError('');
      } catch (reason) { if (mounted.current && scopeRef.current === submittedScope) fail(reason); }
      finally { if (mounted.current) setSaving(false); }
    }
    async function openDemand(item) {
      if (saving || !confirmDiscard()) return;
      const submittedScope = scopeId;
      setError('');
      try {
        await request('/recruitment/request-views', { method: 'POST', body: JSON.stringify({ responsibilityScopeId: item.responsibilityScopeId || submittedScope, requestId: item.id }) }, token);
        if (mounted.current && scopeRef.current === submittedScope) { clearForm(); setDetailId(null); setDemandId(item.id); }
      } catch (reason) { if (mounted.current && scopeRef.current === submittedScope) fail(reason); }
    }
    async function revokeAccess(grant) {
      if (saving) return;
      const submittedScope = scopeId;
      setSaving(true); setError('');
      try {
        await request('/recruitment/access', { method: 'PUT', body: JSON.stringify({ responsibilityScopeId: grant.responsibilityScopeId || submittedScope, userId: grant.userId, requestIds: grant.requestIds, expiresAt: grant.expiresAt, version: grant.version, status: 'revoked' }) }, token);
        if (mounted.current && scopeRef.current === submittedScope) { setMessage('Доступ рекрутера отозван'); setRefreshKey((current) => current + 1); }
      } catch (reason) { if (mounted.current && scopeRef.current === submittedScope) fail(reason); }
      finally { if (mounted.current) setSaving(false); }
    }
    async function finishTask(task) {
      if (saving) return;
      if (task.workflowKind === 'security') { openSecurityTask(task); return; }
      setSaving(true); setError('');
      try {
        await request('/recruitment/tasks', { method: 'PUT', body: JSON.stringify({ ...task, status: task.status === 'done' ? 'open' : 'done' }) }, token);
        if (mounted.current) { setRefreshKey((value) => value + 1); setMessage(task.status === 'done' ? 'Задача открыта снова' : 'Задача выполнена'); window.dispatchEvent(new Event('recruitment:changed')); }
      } catch (reason) { if (mounted.current) fail(reason); } finally { if (mounted.current) setSaving(false); }
    }
    const matches = (item, searchText, recruiterId = item.recruiterId) => (!filter.city || item.city === filter.city) && (!filter.kind || item.kind === filter.kind) && (!filter.recruiter || recruiterId === filter.recruiter) && (!filter.search || normalized(searchText).includes(normalized(filter.search)));
    const candidates = data.candidates.filter((item) => (showArchive || !item.archived) && matches(item, [item.fullName, item.phone, item.city, item.district].join(' ')));
    const requests = data.requests.filter((item) => matches(item, [item.title, item.city, item.district].join(' ')) && (tab !== 'requests' || !onlyWithCandidates || applicationsByRequest.has(item.id)));
    const applications = data.applications.filter((item) => {
      const candidate = candidateMap.get(item.candidateId), demand = requestMap.get(item.requestId);
      return candidate && (showArchive || !candidate.archived) && matches(candidate, [candidate.fullName, candidate.phone, demand?.title, candidate.city].join(' '), item.recruiterId);
    });
    const filteredTasks = data.tasks.filter((item) => {
      const candidate = candidateMap.get(item.candidateId);
      return (!filter.recruiter || item.assigneeId === filter.recruiter)
        && (!filter.city || candidate?.city === filter.city) && (!filter.kind || candidate?.kind === filter.kind)
        && (!filter.search || normalized([item.title, candidate?.fullName, candidate?.phone].join(' ')).includes(normalized(filter.search)));
    }).sort((left, right) => new Date(left.dueAt) - new Date(right.dueAt));
    const tasks = filteredTasks.filter((item) => !taskStatus || item.status === taskStatus);
    const currentCounts = STAGES.map(([id, name]) => ({ id, name, count: applications.filter((item) => item.stage === id).length }));
    const appIds = new Set(applications.map((item) => item.id));
    const reached = STAGES.map(([id, name]) => ({ id, name, count: new Set(data.events.filter((item) => appIds.has(item.applicationId) && item.toStage === id).map((item) => item.applicationId)).size }));
    const dueCount = filteredTasks.filter((item) => item.status === 'open' && new Date(item.dueAt).getTime() <= now).length;
    const cities = paginated ? worklist.cities || [] : [...new Set((tab === 'requests' ? data.requests : data.candidates).map((item) => item.city).filter(Boolean))].sort((left, right) => left.localeCompare(right, 'ru'));
    const openRequests = requests.filter((item) => item.status === 'open');
    const demandApplications = requests.flatMap((item) => applicationsByRequest.get(item.id) || []);
    const metricApplications = tab === 'requests' ? demandApplications : applications;
    const metricCandidateCount = tab === 'requests' ? new Set(demandApplications.map((item) => item.candidateId)).size : candidates.length;
    const metric = (label, value, hint) => h('div', { className: 'recruitment-metric' }, h('span', null, label), h('strong', null, value), h('small', null, hint));
    const addButton = (label, type, extra) => external && type === 'requests' ? null : button(label, () => openForm(type, null, extra), { className: 'button recruitment-primary', disabled: loading || !data.recruiters.length });
    const linkedApps = detail ? data.applications.filter((item) => item.candidateId === detail.id) : [];
    const demandApps = demandDetail ? applicationsByRequest.get(demandDetail.id) || [] : [];
    const linkedTasks = detail ? data.tasks.filter((item) => item.candidateId === detail.id) : [];
    const history = detail ? data.events.filter((event) => linkedApps.some((app) => app.id === event.applicationId)).sort((left, right) => new Date(right.occurredAt) - new Date(left.occurredAt)) : [];

    function openSecurityTask(task) {
      const application = data.applications.find(item => item.id === task.applicationId);
      if (!application) return;
      openForm('security', null, { applicationId: application.id, version: application.version, status: operator ? application.securityStatus || 'documents' : 'submitted', assigneeId: application.securityAssigneeId || '', dueAtLocal: localDateTime(application.securityDueAt) });
    }
    function taskCard(task) {
      const candidate = candidateMap.get(task.candidateId), due = task.status === 'open' && new Date(task.dueAt).getTime() <= now;
      return h('article', { className: `recruitment-task-card${due ? ' is-due' : ''}`, key: task.id },
        h('div', { className: 'recruitment-task-main' }, h('div', { className: 'recruitment-row-heading' }, h('h3', null, task.title), badge(task.status === 'done' ? 'Выполнена' : due ? 'Пора выполнить' : 'Запланирована', due ? 'is-warning' : '')),
          h('p', { className: 'recruitment-meta' }, `${dateLabel(task.dueAt, true)} · ${recruiterName(task.assigneeId)}`),
          candidate && button(candidate.fullName, () => setDetailId(candidate.id), { className: 'recruitment-text-button' }),
          task.notes && h('p', { className: 'recruitment-note' }, task.notes)),
        h('div', { className: 'recruitment-actions' }, task.workflowKind === 'security' ? button('Открыть СБ', () => openSecurityTask(task), { disabled: saving || !data.applications.some(item => item.id === task.applicationId) }) : h(React.Fragment, null, button('Изменить задачу', () => openForm('tasks', task), { className: 'recruitment-text-button', disabled: saving }), button(task.status === 'done' ? 'Открыть снова' : 'Выполнить', () => finishTask(task), { disabled: saving }))));
    }
    function quickStage(application) {
      const demand = requestMap.get(application.requestId);
      const title = demand?.title || 'Потребность недоступна';
      const edit = stageEdit?.id === application.id ? stageEdit : null;
      const result = stageResult?.id === application.id ? stageResult : stageConflicts.includes(application.id) ? { conflict: true, error: 'Подбор уже изменён другим пользователем. Обновите данные и выберите статус заново.' } : null;
      const cancel = () => { setStageEdit(null); if (!result?.conflict) setStageResult(null); };
      return h('div', { className: 'recruitment-quick-stage', key: application.id, 'aria-busy': Boolean(result?.pending) },
        h('strong', { className: 'recruitment-quick-stage-title' }, title),
        field('Статус подбора', h('select', { value: edit?.stage || application.stage, 'aria-label': `Статус подбора · ${title}`,
          disabled: saving || !demand || result?.conflict, onChange: (event) => chooseStage(application, event.target.value) },
        ...STAGES.map(([id, label]) => h('option', { key: id, value: id }, label)))),
        edit && h('form', { className: 'recruitment-quick-stage-form', onSubmit: (event) => {
          event.preventDefault();
          if (savingRef.current || result?.conflict) return;
          if (edit.stage === 'rejected' && !edit.reason.trim()) { setStageResult({ id: application.id, error: 'Укажите причину отказа.' }); return; }
          saveStage(application, edit.stage === 'rejected' ? { stage: edit.stage, reason: edit.reason.trim() } : { stage: edit.stage, startDate: edit.startDate });
        } },
        edit.stage === 'rejected'
          ? field('Причина отказа', h('textarea', { value: edit.reason, required: true, maxLength: 1000, rows: 2, autoFocus: true, disabled: saving || result?.conflict,
            onChange: (event) => setStageEdit({ ...edit, reason: event.target.value }) }))
          : field('Дата выхода в работу', h('input', { type: 'date', value: edit.startDate, required: true, autoFocus: true, disabled: saving || result?.conflict,
            onChange: (event) => setStageEdit({ ...edit, startDate: event.target.value }) })),
        h('div', { className: 'recruitment-actions' }, h('button', { type: 'submit', className: 'button recruitment-primary', disabled: saving || result?.conflict }, 'Сохранить статус'),
          button('Отмена', cancel, { className: 'recruitment-text-button', disabled: saving }))),
        h('p', { className: `recruitment-stage-status${result?.message ? ' is-saved' : ''}`, role: 'status' }, result?.pending ? 'Сохраняем…' : result?.message || '\u00a0'),
        result?.error && h('p', { className: 'recruitment-error', role: 'alert' }, result.error),
        (result?.conflict || result?.refresh) && button('Обновить данные', () => refreshStages(application.id), { className: 'recruitment-text-button', disabled: saving }));
    }
    function candidateCard(candidate, linked = applicationsByCandidate.get(candidate.id) || []) {
      const openCandidate = () => { if (!savingRef.current && confirmDiscard()) { clearForm(); setDetailId(candidate.id); } };
      return h('article', { className: 'recruitment-candidate-card', key: candidate.id, 'data-candidate-id': candidate.id },
        h('div', { className: 'recruitment-row-heading' }, h('div', { className: 'recruitment-person' }, h('span', { className: 'recruitment-avatar', 'aria-hidden': true }, candidate.fullName.split(/\s+/).slice(0, 2).map((part) => part[0]).join('')),
          h('div', null, button(candidate.fullName, openCandidate, { className: 'recruitment-name-button', disabled: saving }), h('p', { className: 'recruitment-meta' }, [candidate.city, candidate.district].filter(Boolean).join(' · ')))), badge(candidate.archived ? 'Архив' : kindName(candidate.kind))),
        h('a', { href: `tel:${candidate.phone}`, className: 'recruitment-phone' }, candidate.phone),
        candidate.kind === 'carrier' && h('p', { className: 'recruitment-meta' }, [candidate.vehicleType, candidate.vehicleDimensions, candidate.vehicleCapacity].filter(Boolean).join(' · ') || 'Параметры автомобиля не заполнены'),
        linked.length ? h('div', { className: 'recruitment-candidate-stages' }, ...linked.map(quickStage))
          : h('div', { className: 'recruitment-candidate-no-stage' }, h('p', { className: 'recruitment-meta' }, 'Пока не добавлен в подбор'),
            !candidate.archived && button('Добавить в подбор', () => openForm('applications', null, { candidateId: candidate.id, recruiterId: candidate.recruiterId }), { className: 'recruitment-text-button', disabled: saving })),
        h('div', { className: 'recruitment-card-bottom' }, h('span', null, `${recruiterName(candidate.recruiterId)} · подборов: ${linked.length}`), button('Карточка →', openCandidate, { className: 'recruitment-text-button', disabled: saving })));
    }
    function boardCard(application) {
      const candidate = candidateMap.get(application.candidateId), demand = requestMap.get(application.requestId);
      return h('article', { className: 'recruitment-pipeline-card', key: application.id, 'data-candidate-id': application.candidateId, 'data-application-id': application.id },
        button(candidate?.fullName || 'Кандидат', () => { if (!savingRef.current && confirmDiscard()) { clearForm(); setDetailId(application.candidateId); } }, { className: 'recruitment-name-button', disabled: saving }),
        h('p', { className: 'recruitment-meta' }, `${candidate?.city || ''} · ${kindName(candidate?.kind)}`), h('p', { className: 'recruitment-demand-name' }, demand?.title || 'Потребность недоступна'),
        h('span', { className: 'recruitment-meta' }, recruiterName(application.recruiterId)),
        candidate?.archived && badge('Архив'),
        h('div', { className: 'recruitment-card-bottom' }, button('Изменить этап', () => openForm('applications', application), { className: 'recruitment-text-button', disabled: saving }), hhLink(candidate?.hhUrl, 'hh ↗')));
    }
    function demandCandidate(application, compact = false) {
      const candidate = candidateMap.get(application.candidateId);
      const openCandidate = () => { setDemandId(null); setDetailId(candidate.id); };
      return h('div', { className: `recruitment-demand-candidate${compact ? ' is-compact' : ''}`, key: application.id },
        h('div', { className: 'recruitment-demand-candidate-main' },
          compact ? button(candidate.fullName, openCandidate, { className: 'recruitment-name-button' }) : h('strong', null, candidate.fullName),
          !compact && h('p', { className: 'recruitment-meta' }, [candidate.city, !external && `Рекрутер: ${recruiterName(application.recruiterId)}`, application.startDate && `Выход: ${dateLabel(application.startDate)}`].filter(Boolean).join(' · ')),
          !compact && application.reason && h('p', { className: 'recruitment-note' }, application.reason)),
        h('div', { className: 'recruitment-actions' }, badge(stageName(application.stage), application.stage === 'hired' ? 'is-active' : ''), candidate.archived && badge('Архив')),
        !compact && h('div', { className: 'recruitment-actions recruitment-demand-candidate-actions' }, button('Открыть кандидата', openCandidate, { className: 'recruitment-text-button' }), button('Изменить этап', () => openForm('applications', application), { className: 'recruitment-text-button' })));
    }

    function workflowActions(candidate, application, nextTask) {
      if (nextTask?.workflowKind === 'security') nextTask = null;
      return h('div', { className: 'recruitment-workflow-actions' },
        button('Контакт', () => openForm('contacts', null, { candidateId: candidate.id, applicationId: application?.id || '', source: candidate.source, completeTaskId: nextTask?.workflowKind === 'security' ? null : nextTask?.id || null, completeCurrentTask: false }), { className: 'recruitment-text-button', disabled: saving }),
        button('Следующий шаг', () => openForm('tasks', nextTask || null, { candidateId: candidate.id, applicationId: application?.id || '', assigneeId: application?.recruiterId || candidate.recruiterId }), { className: 'recruitment-text-button', disabled: saving }),
        application && button('СБ', () => openForm('security', null, { applicationId: application.id, version: application.version, status: operator ? application.securityStatus || 'documents' : 'submitted', assigneeId: application.securityAssigneeId || '', dueAtLocal: localDateTime(application.securityDueAt) }), { className: 'recruitment-text-button', disabled: saving || (!operator && ['approved', 'rejected'].includes(application.securityStatus)) || (actor?.role === 'dispatcher' && application.securityAssigneeId && application.securityAssigneeId !== actor.id) }),
        application?.stage === 'hired' && operator && button('Подтвердить выход', () => openForm('start', null, { applicationId: application.id, version: application.version, previousStatus: application.attendanceStatus, plannedStartDate: application.startDate, date: application.confirmedStartDate || (application.startDate <= localDateTime(new Date().toISOString()).slice(0, 10) ? application.startDate : '') || '' }), { className: 'recruitment-text-button', disabled: saving }));
    }
    function workTable(items) {
      return h('div', { className: 'recruitment-table-scroll recruitment-worklist-scroll', tabIndex: 0, 'aria-label': 'Рабочий список кандидатов' }, h('table', { className: 'recruitment-table recruitment-worklist' },
        h('thead', null, h('tr', null, ...['Кандидат', 'Проект и этап', 'Последний контакт', 'Следующее действие', 'Ответственный и действия'].map(label => h('th', { key: label, scope: 'col' }, label)))),
        h('tbody', null, ...items.map(item => {
          const candidate = item.candidate, linked = item.applications || [], nextTasks = (item.tasks || []).filter(task => task.status === 'open').sort((left, right) => new Date(left.dueAt) - new Date(right.dueAt));
          const contact = item.lastContact;
          return h('tr', { key: candidate.id, 'data-candidate-id': candidate.id },
            h('td', null, button(candidate.fullName, () => { if (confirmDiscard()) { clearForm(); setDetailId(candidate.id); } }, { className: 'recruitment-name-button', disabled: saving }), h('a', { href: `tel:${candidate.phone}`, className: 'recruitment-phone' }, candidate.phone), h('p', { className: 'recruitment-meta' }, `${candidate.city} · ${kindName(candidate.kind)}`), h('p', { className: 'recruitment-meta' }, sourceName(contact?.source || candidate.source)), candidate.archived && badge('Архив')),
            h('td', null, linked.length ? linked.map(application => h('div', { key: application.id, className: 'recruitment-worklist-project' }, quickStage(application), h('p', { className: 'recruitment-meta' }, `СБ: ${securityName(application.securityStatus)}`), application.startDate && h('p', { className: 'recruitment-meta' }, `План выхода: ${dateLabel(application.startDate)}`), application.attendanceStatus === 'confirmed' ? badge(`Выход подтверждён · ${dateLabel(application.confirmedStartDate)}`, 'is-active') : application.attendanceStatus === 'no_show' ? badge('Не вышел', 'is-warning') : application.stage === 'hired' && badge('Выход не подтверждён', 'is-warning'))) : h('div', null, h('p', { className: 'recruitment-meta' }, 'Не добавлен в подбор'), button('Добавить в подбор', () => openForm('applications', null, { candidateId: candidate.id, recruiterId: candidate.recruiterId }), { className: 'recruitment-text-button', disabled: candidate.archived || saving }))),
            h('td', null, contact ? h(React.Fragment, null, h('strong', null, CONTACT_RESULTS.find(([id]) => id === contact.result)?.[1] || contact.result), h('p', { className: 'recruitment-meta' }, dateLabel(contact.occurredAt, true)), contact.notes && h('p', { className: 'recruitment-worklist-note' }, contact.notes)) : h('span', { className: 'recruitment-meta' }, 'Контактов ещё нет')),
            h('td', null, nextTasks.length ? nextTasks.map(task => h('div', { key: task.id, className: `recruitment-worklist-next${new Date(task.dueAt).getTime() < now ? ' is-overdue' : ''}` }, h('strong', null, task.title), h('p', { className: 'recruitment-meta' }, dateLabel(task.dueAt, true)), linked.length > 1 && task.applicationId && h('p', { className: 'recruitment-meta' }, requestMap.get(linked.find(app => app.id === task.applicationId)?.requestId)?.title), button(task.workflowKind === 'security' ? 'Открыть СБ' : 'Выполнить', () => finishTask(task), { className: 'recruitment-text-button', disabled: saving }))) : h('span', { className: 'recruitment-meta' }, 'Не назначено')),
            h('td', null, linked.length ? linked.map(application => h('div', { key: application.id, className: 'recruitment-worklist-actions' }, linked.length > 1 && h('strong', null, requestMap.get(application.requestId)?.title), h('p', { className: 'recruitment-meta' }, recruiterName(application.recruiterId)), workflowActions(candidate, application, nextTasks.find(task => task.applicationId === application.id)))) : h('div', null, h('p', { className: 'recruitment-meta' }, recruiterName(candidate.recruiterId)), workflowActions(candidate, null, nextTasks[0]))));
        }))));
    }
    const paging = () => h('div', { className: 'recruitment-pagination' },
      h('span', { className: 'recruitment-meta', role: 'status' }, worklist.total ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, worklist.total)} из ${worklist.total}` : 'Нет записей'),
      field('Строк на странице', h('select', { value: pageSize, disabled: saving || Boolean(stageEdit), onChange: event => setPageSize(Number(event.target.value)) }, ...[25, 50, 100].map(size => h('option', { key: size, value: size }, size)))),
      h('div', { className: 'recruitment-actions' }, button('Назад', () => setPage(value => Math.max(1, value - 1)), { disabled: page <= 1 || loading || saving || Boolean(stageEdit) }), h('span', { className: 'recruitment-meta' }, `Страница ${page} из ${Math.max(1, Math.ceil((worklist.total || 0) / pageSize))}`), button('Далее', () => setPage(value => value + 1), { disabled: page * pageSize >= worklist.total || loading || saving || Boolean(stageEdit) })));

    const pageItems = worklist.items || [];
    const pageApplications = pageItems.flatMap(item => item.applications || []);
    const withoutApplications = pageItems.filter(item => !item.applications?.length);
    const candidateBoard = () => h('div', { className: 'recruitment-board', 'aria-label': 'Кандидаты по этапам', tabIndex: 0 },
      withoutApplications.length > 0 && h('section', { className: 'recruitment-column stage-unassigned' },
        h('div', { className: 'recruitment-column-title' }, h('h3', null, 'Без подбора'), h('span', null, withoutApplications.length)),
        ...withoutApplications.map(item => candidateCard(item.candidate, []))),
      ...STAGES.filter(([id]) => pageApplications.some(item => item.stage === id)).map(([id, name]) => {
        const entries = pageApplications.filter(item => item.stage === id);
        return h('section', { className: `recruitment-column stage-${id}`, key: id },
          h('div', { className: 'recruitment-column-title' }, h('h3', null, name), h('span', null, entries.length)),
          ...entries.map(boardCard));
      }));

    let content;
    if (tab === 'onboarding' && !external && OnboardingPanel) content = h(OnboardingPanel, { key: `onboarding-${refreshKey}`, token, scopes, candidates: data.candidates, initialCandidateId: onboardingCandidateId, onExpired, refreshKey, onDirtyChange: setOnboardingDirty });
    if (tab === 'imports' && canReadImport) content = h(ImportRowsPanel, { token, responsibilityScopeId: listScopeId, refreshKey, onError: fail, onCandidate: candidateId => { setDetailId(candidateId); setContactPage(1); } });
    if (paginated) content = h('div', { className: 'recruitment-work-view' },
      h('div', { className: 'recruitment-work-toolbar' },
        h('div', { className: 'recruitment-segment', 'aria-label': 'Вид кандидатов' }, ...[['table', 'Список'], ['board', 'По этапам']].map(([id, label]) => button(label, () => setCandidateLayout(id), { key: id, 'aria-pressed': candidateLayout === id, disabled: saving || Boolean(stageEdit) }))),
        h('p', { className: 'recruitment-meta' }, candidateLayout === 'table' ? 'Один кандидат — одна строка. После контакта фиксируйте результат и следующий шаг.' : 'Один кандидат может иметь несколько подборов. Фильтры выбирают людей; в колонках показаны все их подборы.')),
      h('div', { className: 'recruitment-work-views', 'aria-label': 'Очереди работы' }, ...WORK_VIEWS.map(([id, label]) => button(h(React.Fragment, null, h('span', null, label), h('strong', null, worklist.counts?.[id] ?? '—')), () => { if (confirmDiscard()) { clearForm(); setWorkView(id); } }, { key: id, 'aria-pressed': workView === id, disabled: saving }))),
      h('p', { className: 'recruitment-meta' }, candidateLayout === 'board' ? `На странице: ${pageItems.length} кандидатов · ${pageApplications.length} подборов · без подбора: ${withoutApplications.length}. Числа в колонках относятся к этой странице, в очередях — ко всей выборке. Пустые этапы скрыты.` : `Числа в очередях — кандидаты по выбранным фильтрам. «На сегодня»: ${worklist.timeZone || zone}. Время действий: ${zone}.`),
      pageItems.length ? candidateLayout === 'board' ? candidateBoard() : workTable(pageItems) : empty('Нет кандидатов по выбранным условиям', 'Выберите другую очередь или измените фильтры.', addButton('Добавить кандидата', 'candidates')),
      paging());
    if (tab === 'requests') content = requests.length ? h('div', { className: 'recruitment-request-grid' }, ...requests.map((item) => {
      const requestApplications = applicationsByRequest.get(item.id) || [];
      return h('article', { className: 'recruitment-request-card', key: item.id },
        h('div', { className: 'recruitment-row-heading' }, h('h3', null, item.title), badge(({ open: 'Открыта', paused: 'Пауза', closed: 'Закрыта' })[item.status], item.status === 'open' ? 'is-active' : '')),
        h('p', { className: 'recruitment-meta' }, [projectName(item), item.city, item.district, kindName(item.kind)].filter(Boolean).join(' · ')),
        h('div', { className: 'recruitment-demand-quantity' }, h('strong', { className: item.quantity == null ? 'is-unspecified' : undefined }, quantityLabel(item.quantity)), h('span', null, item.kind === 'carrier' ? 'машин требуется' : 'водителей требуется'), item.priority === 'urgent' && badge('Срочно', 'is-warning')),
        h('section', { className: 'recruitment-demand-candidates', 'aria-label': 'Кандидаты по потребности' },
          h('div', { className: 'recruitment-row-heading' }, h('strong', null, external ? 'Мои кандидаты' : 'Кандидаты'), badge(requestApplications.length)),
          requestApplications.length ? requestApplications.slice(0, 3).map((application) => demandCandidate(application, true)) : h('p', { className: 'recruitment-meta' }, 'Пока никто не добавлен.'),
          requestApplications.length > 3 && button(`Все кандидаты (${requestApplications.length})`, () => openDemand(item), { className: 'recruitment-text-button' })),
        h('dl', { className: 'recruitment-compact-details' }, !external && h(React.Fragment, null, h('dt', null, 'Ответственный'), h('dd', null, recruiterName(item.recruiterId))), h('dt', null, 'Нужны к'), h('dd', null, dateLabel(item.neededBy)), h('dt', null, 'Кандидатов'), h('dd', null, requestApplications.length), item.schedule && h(React.Fragment, null, h('dt', null, 'График'), h('dd', null, item.schedule))),
        item.payTerms && h('p', { className: 'recruitment-note' }, item.payTerms),
        h('div', { className: 'recruitment-card-bottom' }, button('Подробнее о потребности', () => openDemand(item), { className: 'recruitment-text-button' }), !external && button('Изменить потребность', () => openForm('requests', item), { className: 'recruitment-text-button' }), hhLink(item.hhUrl)),
        item.status !== 'closed' && button('Подобрать кандидата', () => openForm('applications', null, { requestId: item.id, recruiterId: external ? actor.id : item.recruiterId }), { className: 'button', disabled: saving }));
    })) : empty(onlyWithCandidates ? 'Нет потребностей с кандидатами по выбранным фильтрам' : external ? 'Нет доступных потребностей' : 'Потребностей пока нет', onlyWithCandidates ? 'Снимите фильтр «С кандидатами» или измените другие фильтры.' : external ? 'Компания назначает вам потребности и срок доступа. Если назначение уже было, измените фильтры или обратитесь к компании.' : 'Добавьте проект для водителей ЕЦЛ или потребность в перевозчиках: условия, машины, количество и срок.', onlyWithCandidates ? button('Показать все потребности', () => setOnlyWithCandidates(false)) : addButton('Создать потребность', 'requests'));
    if (tab === 'tasks') content = h('div', { className: 'recruitment-task-view' }, h('div', { className: 'recruitment-task-toolbar' },
      h('div', { className: 'recruitment-segment' }, ...[['open', 'Открытые'], ['done', 'Выполненные'], ['', 'Все']].map(([id, label]) => button(label, () => setTaskStatus(id), { key: id, 'aria-pressed': taskStatus === id }))),
      h('span', { className: 'recruitment-meta' }, `Время устройства: ${zone}`)), tasks.length ? h('div', { className: 'recruitment-task-list' }, ...tasks.map(taskCard)) : empty('Нет задач по выбранным условиям', 'Напоминание появится в приложении, когда наступит назначенное время. Задачи сохраняются между входами.', addButton('Добавить задачу', 'tasks')));
    if (tab === 'analytics') {
      const published = requests.filter((item) => item.publishedAt && new Date(item.publishedAt) >= new Date(item.createdAt));
      const averageHours = published.length ? published.reduce((sum, item) => sum + (new Date(item.publishedAt) - new Date(item.createdAt)) / 3600000, 0) / published.length : null;
      content = h('div', { className: 'recruitment-analytics' },
        h('section', { className: 'recruitment-surface recruitment-confirmed-results' }, h('h3', null, 'План и фактические выходы'), h('p', { className: 'recruitment-meta' }, 'Этап подбора и подтверждение выхода учитываются отдельно. Повторные подборы одного человека остаются отдельными записями.'),
          h('div', { className: 'recruitment-metrics recruitment-outcome-metrics' }, metric('На этапе выхода', applications.filter(item => item.stage === 'hired').length, 'Плановый этап, включая подтверждённые'), metric('Подтверждённые выходы', applications.filter(item => item.attendanceStatus === 'confirmed').length, 'Факт подтверждён сотрудником компании'), metric('Неявки', applications.filter(item => item.attendanceStatus === 'no_show').length, 'Зафиксированный результат выхода'))),
        h('section', { className: 'recruitment-surface' }, h('h3', null, 'Сейчас по этапам'), h('p', { className: 'recruitment-meta' }, 'Каждый подбор учитывается только на своём текущем этапе.'),
          h('div', { className: 'recruitment-bars' }, ...currentCounts.map((item) => h('div', { className: 'recruitment-bar-row', key: item.id }, h('span', null, item.name), h('div', { className: 'recruitment-bar-track' }, h('div', { style: { width: `${applications.length ? item.count / applications.length * 100 : 0}%` } })), h('strong', null, item.count))))),
        h('section', { className: 'recruitment-surface' }, h('h3', null, 'Дошли до этапа'), h('p', { className: 'recruitment-meta' }, `Доля из ${applications.length} подборов по сохранённой истории переходов. Пропущенные этапы не засчитываются.`),
          h('div', { className: 'recruitment-reached' }, ...reached.map((item) => h('div', { key: item.id }, h('span', null, item.name), h('strong', null, item.count), h('small', null, `${applications.length ? Math.round(item.count / applications.length * 100) : 0}%`))))),
        h('section', { className: 'recruitment-surface' }, h('h3', null, external ? 'Мои результаты' : 'Работа рекрутеров'), h('div', { className: 'recruitment-table-scroll' }, h('table', { className: 'recruitment-table' }, h('thead', null, h('tr', null, h('th', null, 'Рекрутер'), h('th', null, 'Подборов'), h('th', null, 'На этапе выхода'), h('th', null, 'Дошли до этапа выхода'), h('th', null, 'Подтверждённые выходы'), h('th', null, 'Неявки'))), h('tbody', null, ...data.recruiters.filter((person) => !filter.recruiter || person.id === filter.recruiter).map((person) => {
          const items = applications.filter((app) => app.recruiterId === person.id), ids = new Set(items.map((app) => app.id));
          const everHired = new Set(data.events.filter((event) => ids.has(event.applicationId) && event.toStage === 'hired').map((event) => event.applicationId)).size;
          return h('tr', { key: person.id }, h('td', null, person.name), h('td', null, items.length), h('td', null, items.filter((app) => app.stage === 'hired').length), h('td', null, `${items.length ? Math.round(everHired / items.length * 100) : 0}%`), h('td', null, items.filter(app => app.attendanceStatus === 'confirmed').length), h('td', null, items.filter(app => app.attendanceStatus === 'no_show').length));
        }))))),
        h('section', { className: 'recruitment-surface' }, h('h3', null, 'Скорость публикации на hh'), h('p', { className: 'recruitment-large-number' }, averageHours === null ? 'Нет данных' : `${Math.round(averageHours * 10) / 10} ч`), h('p', { className: 'recruitment-meta' }, `Среднее от создания потребности до вручную указанной публикации. Потребностей с датой: ${published.length}. Переписка и время ответа на hh в приложении не отслеживаются.`)),
        h('section', { className: 'recruitment-surface recruitment-integration-note' }, badge('1С не подключена'), h('h3', null, 'Смены и удержание водителей'), h('p', null, 'Плановую дату указывает рекрутер, фактический выход подтверждает уполномоченный сотрудник компании. Подтверждение выхода не означает полностью отработанную смену. Дни работы, смены и удержание появятся после подключения данных из 1С.')));
    }
    if (tab === 'access' && company) content = companyLoading ? h('div', { className: 'recruitment-loading', role: 'status' }, 'Загружаем назначения…') : h('div', { className: 'recruitment-access-view' },
      h('section', { className: 'recruitment-surface' }, h('h3', null, 'Личный доступ к нужным потребностям'), h('p', null, 'Компания выбирает потребности из списков «Проекты» и «Перевозчики», задаёт срок и может отозвать доступ. Рекрутеры работают со своими кандидатами. Внутренние комментарии компании скрыты.'),
        h('div', { className: 'recruitment-actions' }, actor?.role === 'access_admin' && button('Пригласить по ссылке', () => openForm('invitation'), { className: 'button recruitment-primary', disabled: saving || !data.requests.length }), button('Выдать доступ', () => openForm('access'), { className: 'button', disabled: saving || !data.requests.length || !accessData.users.some((person) => person.active && person.approved && !accessData.grants.some((grant) => grant.userId === person.id && grant.responsibilityScopeId === person.responsibilityScopeId)) }), actor?.role === 'access_admin' && button('Создать аккаунт рекрутера', () => openForm('account'), { disabled: saving }), actor?.role === 'access_admin' && button('Подключить существующего рекрутера', openExistingRecruiter, { disabled: saving })),
        actor?.role !== 'access_admin' && h('p', { className: 'recruitment-meta' }, 'Новые личные аккаунты создаёт администратор доступа. Здесь можно назначить потребности уже созданным внешним рекрутерам.')),
      actor?.role === 'access_admin' && invitations.length > 0 && h('section', { className: 'recruitment-surface recruitment-invitations' }, h('h3', null, 'Приглашения по ссылке'), h('p', { className: 'recruitment-meta' }, 'Каждая ссылка рассчитана на одного рекрутера. Использованное приглашение превращается в личный доступ.'),
        ...invitations.map((invitation) => { const state = invitation.status === 'pending' && new Date(invitation.expiresAt).getTime() <= now ? 'expired' : invitation.status;
          return h('article', { className: 'recruitment-invitation-row', key: invitation.id }, h('div', null, h('strong', null, `Приглашение от ${dateLabel(invitation.createdAt, true)}`), h('p', { className: 'recruitment-meta' }, `${projectName(invitation)} · потребностей: ${invitation.requestIds.length} · ссылка до ${dateLabel(invitation.expiresAt, true)}`), h('p', { className: 'recruitment-meta' }, `Доступ до ${dateLabel(invitation.accessExpiresAt, true)}`)),
            badge(({ pending: 'Ожидает входа', accepted: 'Использовано', revoked: 'Отозвано', expired: 'Срок истёк' })[state] || 'Недоступно', state === 'pending' ? 'is-active' : ''), state === 'pending' && button('Отозвать приглашение', () => revokeInvitation(invitation), { className: 'recruitment-text-button', disabled: saving })); })),
      accessData.users.length ? h('div', { className: 'recruitment-access-grid' }, ...accessData.users.map((person) => {
        const grant = accessData.grants.find((item) => item.userId === person.id && item.responsibilityScopeId === person.responsibilityScopeId);
        const state = !person.active || !person.approved ? 'inactive' : grant?.accessState || 'unassigned';
        return h('article', { className: 'recruitment-surface', key: `${person.id}:${person.responsibilityScopeId}` }, h('div', { className: 'recruitment-row-heading' }, h('h3', null, person.name), h('p', { className: 'recruitment-meta' }, projectName(person)), badge(accessLabel(state), state === 'active' ? 'is-active' : state === 'expired' ? 'is-warning' : '')),
          h('p', { className: 'recruitment-meta' }, grant?.expiresAt ? `Доступ до ${dateLabel(grant.expiresAt, true)}` : 'Срок доступа не назначен'),
          h('div', { className: 'recruitment-assigned-list' }, h('strong', null, `Потребностей: ${grant?.requestIds.length || 0}`), ...(grant?.requestIds || []).map((id) => h('span', { key: id }, requestMap.get(id)?.title || 'Потребность недоступна'))),
          h('div', { className: 'recruitment-actions' }, button(grant ? state === 'active' ? 'Изменить назначение' : 'Возобновить доступ' : 'Назначить потребности', () => openForm('access', grant || null, { userId: person.id, responsibilityScopeId: person.responsibilityScopeId, ...(state !== 'active' ? { expiresAt: new Date(Date.now() + 30 * 86400000).toISOString() } : {}) }), { disabled: saving || !person.active || !person.approved || !data.requests.length }), grant?.status === 'active' && button('Отозвать доступ', () => revokeAccess(grant), { className: 'recruitment-text-button', disabled: saving })));
      })) : empty('Внешних рекрутеров пока нет', actor?.role === 'access_admin' ? 'Создайте ссылку-приглашение. Рекрутер сам заполнит имя, телефон и пароль, после чего появится здесь.' : 'Администратор доступа должен создать личные аккаунты внешних рекрутеров.'));
    if (tab === 'activity' && company) content = h('div', { className: 'recruitment-activity-view' },
      h('section', { className: 'recruitment-surface' }, h('div', { className: 'recruitment-row-heading' }, h('div', null, h('h3', null, 'Активность и результат'), h('p', { className: 'recruitment-meta' }, 'Действия в компании за период, включая закрытые подборы. Можно уточнить проект фильтром.')), h('div', { className: 'recruitment-segment', 'aria-label': 'Период отчёта' }, ...[7, 30, 90].map((count) => button(`${count} дней`, () => setDays(count), { key: count, 'aria-pressed': days === count })))),
        h('p', null, 'Просмотры без результата — повод проверить причины. Решение о доступе принимает компания.'),
        activity && h('p', { className: 'recruitment-meta' }, `Период: ${dateLabel(activity.periodStart)} — ${dateLabel(activity.periodEnd)}.`),
        h('details', { className: 'recruitment-counting-rules' }, h('summary', null, 'Как считаются показатели'),
          h('p', null, 'Визит — открытие раздела или переход в проект. Повторные визиты и просмотры одной потребности в одной сессии за 30 минут считаются один раз. Фоновое обновление не увеличивает эти два счётчика.'),
          h('p', null, 'Загрузки данных учитываются сервером отдельно, включая фоновое обновление. Действия в этом отчёте относятся к тому, кто их выполнил; результаты закреплённого за рекрутером подбора показаны в «Аналитике».'),
          activity?.metricDefinitions?.activeDays && h('p', null, activity.metricDefinitions.activeDays),
          h('p', null, 'Контакты — сохранённые результаты связи и новые обращения за период. Они учитываются как содержательная работа с кандидатом.'),
          h('p', null, 'Учитываются только события, записанные после включения наблюдения; старые визиты не восстанавливаются. Переход к этапу выхода учитывается как действие; подтверждённые фактические выходы показаны в «Аналитике».'),
          activity && h('p', null, activity.retentionDays ? `Срок хранения событий активности: ${activity.retentionDays} дней.` : 'Автоматическое удаление событий активности пока не настроено.'),
          h('p', null, activity?.metricDefinitions?.attention || 'Для сигнала нужны минимум 7 дней наблюдения, 5 активных дней или 20 просмотров и отсутствие новых кандидатов, контактов и обращений, подборов, продвижений по этапам, выходов и выполненных задач.'),
          h('p', null, 'Сигнал не доказывает злоупотребление и не приводит к автоматической блокировке.'))),
      companyLoading ? h('div', { className: 'recruitment-loading', role: 'status' }, 'Считаем активность…') : activity?.rows.length ? h('div', { className: 'recruitment-activity-grid' }, ...activity.rows.map((row) => h('article', { className: `recruitment-surface recruitment-activity-card${row.attention?.flagged ? ' has-attention' : ''}`, key: row.userId },
        h('div', { className: 'recruitment-row-heading' }, h('div', null, h('h3', null, row.name), h('p', { className: 'recruitment-meta' }, row.role === 'external_recruiter' ? 'Внешний рекрутер' : 'Сотрудник компании')), badge(row.role === 'external_recruiter' ? accessLabel(row.accessState) : 'Штатный сотрудник', row.accessState === 'active' ? 'is-active' : '')),
        h('dl', { className: 'recruitment-activity-values' }, ...[['Визиты', row.visits], ['Загрузки данных', row.dataReads], ['Активных дней', row.activeDays], ['Просмотры потребностей', row.requestViews], ['Разных потребностей', row.uniqueRequests], ['Новых кандидатов', row.candidatesAdded], ['Контакты', row.contactsRecorded], ['Новых подборов', row.applicationsAdded], ['Смен этапа', row.stageChanges], ['Продвинутых подборов', row.progressed], ['Переходов к выходу', row.hired], ['Выполненных задач', row.completedTasks]].map(([label, value]) => h('div', { key: label }, h('dt', null, label), h('dd', null, value ?? 0)))),
        h('p', { className: 'recruitment-meta' }, `Последнее действие: ${row.lastActivityAt ? dateLabel(row.lastActivityAt, true) : 'ещё нет событий'}.${row.firstObservationAt ? ` Наблюдение с ${dateLabel(row.firstObservationAt)} · полных дней: ${row.observedDays ?? 0}.` : ''}`),
        row.attention?.reason && h('div', { className: row.attention.flagged ? 'recruitment-attention' : 'recruitment-meta' }, row.attention.flagged && h('strong', null, 'Требует внимания'), h('p', null, row.attention.reason)))))
        : !companyLoading && empty('Нет активности за этот период', 'События появятся после входа рекрутера, открытия потребности или работы с подбором. Старые просмотры не создаются задним числом.'));

    return h('div', { className: 'recruitment-workspace' },
      h('header', { className: 'recruitment-heading' }, h('div', null, h('span', { className: 'recruitment-eyebrow' }, 'КОМАНДА И ПОДБОР'), h('h1', null, 'Рекрутинг'), h('p', null, 'Общая база кандидатов и потребностей компании.')), h('div', { className: 'recruitment-heading-actions' },
        hhLink('https://hh.ru/employer', 'Открыть hh ↗'), button('Обновить', () => { if (confirmDiscard()) { clearForm(); scopeId ? setRefreshKey((value) => value + 1) : setContextKey((value) => value + 1); } }, { disabled: contextLoading || loading || saving }))),
      external && h('div', { className: 'recruitment-observation-notice', role: 'note' }, h('strong', null, 'Компания видит вашу активность'), h('p', null, 'Учитываются входы в раздел, загрузки данных, просмотры потребностей и действия по подбору. Вы видите назначенные потребности и своих кандидатов.')),
      contextLoading ? h('div', { className: 'recruitment-loading', role: 'status' }, 'Загружаем доступные проекты…') : !scopes.length && !error ? empty('Рекрутинг недоступен', external ? 'Компания должна назначить вам потребности и срок доступа. После назначения обновите список проектов.' : 'Администратор должен предоставить доступ к рекрутингу и персональным данным компании.') : null,
      error && h('div', { className: 'recruitment-error', role: 'alert' }, error),
      message && h('div', { className: 'recruitment-feedback', role: 'status' }, message),
      scopes.length > 0 && h(React.Fragment, null,
        external && h('div', { className: 'recruitment-scope-row' }, field('Проект', h('select', { value: scopeId, disabled: saving, onChange: (event) => chooseScope(event.target.value) }, ...scopes.map((item) => h('option', { key: item.responsibilityScopeId, value: item.responsibilityScopeId }, scopeLabel(item))))), h('p', { className: 'recruitment-meta' }, 'Назначенные вам потребности и ваши кандидаты.')),
        h('nav', { className: 'recruitment-tabs', 'aria-label': 'Разделы рекрутинга' }, ...tabs.map(([id, name]) => button(name, () => navigate(id), { key: id, 'aria-pressed': tab === id, disabled: saving }))),
        !external && tab !== 'onboarding' && scopes.length > 1 && h('div', { className: 'recruitment-project-filter' }, field('Фильтр по проекту', h('select', { value: projectFilter, disabled: saving || Boolean(stageEdit), onChange: event => chooseScope(event.target.value) }, h('option', { value: '' }, 'Все проекты компании'), ...scopes.map(item => h('option', { key: item.responsibilityScopeId, value: item.responsibilityScopeId }, scopeLabel(item)))))),
        !['access', 'activity', 'imports', 'onboarding'].includes(tab) && h('div', { className: 'recruitment-filters' },
          field('Поиск', h('input', { type: 'search', value: filter.search, disabled: Boolean(stageEdit) || saving, placeholder: tab === 'requests' ? 'Название потребности' : 'Имя, телефон, потребность', onChange: (event) => setFilter({ ...filter, search: event.target.value }) })),
          field(tab === 'requests' ? 'Город потребности' : 'Город кандидата', h('select', { value: filter.city, disabled: Boolean(stageEdit) || saving, onChange: (event) => setFilter({ ...filter, city: event.target.value }) }, h('option', { value: '' }, 'Все города'), ...cities.map((city) => h('option', { key: city, value: city }, city)))),
          field('Направление', h('select', { value: filter.kind, disabled: Boolean(stageEdit) || saving, onChange: (event) => setFilter({ ...filter, kind: event.target.value }) }, h('option', { value: '' }, 'Все направления'), ...KINDS.map(([id, label]) => h('option', { key: id, value: id }, label)))),
          !external && field(tab === 'requests' ? 'Ответственный за потребность' : 'Рекрутер', h('select', { value: filter.recruiter, disabled: Boolean(stageEdit) || saving, onChange: (event) => setFilter({ ...filter, recruiter: event.target.value }) }, h('option', { value: '' }, tab === 'requests' ? 'Все ответственные' : 'Все рекрутеры'), ...(tab === 'requests' ? data.requestRecruiters || data.recruiters : data.recruiters).map((item) => h('option', { key: item.id, value: item.id }, item.name))))),
        paginated && h('div', { className: 'recruitment-work-extra-filters' },
          field('Источник привлечения', h('select', { value: filter.source || '', disabled: Boolean(stageEdit) || saving, onChange: event => setFilter({ ...filter, source: event.target.value }) }, h('option', { value: '' }, 'Все источники'), ...SOURCES.map(([id, label]) => h('option', { key: id, value: id }, label)))),
          field('Этап', h('select', { value: filter.stage || '', disabled: Boolean(stageEdit) || saving, onChange: event => setFilter({ ...filter, stage: event.target.value }) }, h('option', { value: '' }, 'Все этапы'), ...STAGES.map(([id, label]) => h('option', { key: id, value: id }, label)))),
          !external && button('Мои', () => setFilter({ ...filter, recruiter: filter.recruiter === actor?.id ? '' : actor?.id || '' }), { 'aria-pressed': filter.recruiter === actor?.id, disabled: saving || Boolean(stageEdit) })),
        loading ? h('div', { className: 'recruitment-loading', role: 'status' }, 'Загружаем подбор…') : !error && h(React.Fragment, null,
          !['access', 'activity', 'candidates', 'imports', 'onboarding'].includes(tab) && h('div', { className: 'recruitment-metrics' }, metric('Кандидаты', metricCandidateCount, tab === 'requests' ? 'В выбранных потребностях' : 'Уникальные карточки'), metric('Подборы', metricApplications.length, 'Кандидат + потребность'), metric('На этапе выхода', metricApplications.filter((item) => item.stage === 'hired').length, 'Плановый этап, включая подтверждённые'), tab === 'requests' ? metric('Потребности с кандидатами', requests.filter((item) => applicationsByRequest.has(item.id)).length, 'По выбранным фильтрам') : metric('Пора выполнить', dueCount, 'Задачи по выбранным фильтрам')),
          h('div', { className: 'recruitment-workbar' }, h('div', null, h('h2', null, tabs.find(([id]) => id === tab)?.[1]), paginated && h('p', { className: 'recruitment-meta' }, `${worklist.total || 0} кандидатов по выбранным условиям`), tab === 'requests' && h('p', { className: 'recruitment-meta' }, `Открыто: ${openRequests.length} · нужно водителей: ${openRequests.filter((item) => item.kind === 'driver').reduce((sum, item) => sum + item.quantity, 0)} · машин: ${openRequests.filter((item) => item.kind === 'carrier').reduce((sum, item) => sum + item.quantity, 0)}`)),
            h('div', { className: 'recruitment-actions' }, paginated && h('label', { className: 'recruitment-check' }, h('input', { type: 'checkbox', checked: showArchive, disabled: Boolean(stageEdit) || saving, onChange: (event) => setShowArchive(event.target.checked) }), 'Только архив'),
              tab === 'requests' && h('label', { className: 'recruitment-check' }, h('input', { type: 'checkbox', checked: onlyWithCandidates, onChange: (event) => setOnlyWithCandidates(event.target.checked) }), 'С кандидатами'),
              paginated && !showArchive && candidateLayout === 'board' && addButton('Добавить в подбор', 'applications'), paginated && addButton('Добавить кандидата', 'candidates'), tab === 'requests' && !external && addButton('Создать потребность', 'requests'), tab === 'tasks' && addButton('Добавить задачу', 'tasks'))),
          tab === 'requests' && h('div', { className: 'recruitment-segment recruitment-request-directions', 'aria-label': 'Списки потребностей' }, ...[['', 'Все потребности'], ['driver', 'Проекты · водители ЕЦЛ'], ['carrier', 'Перевозчики · машины']].map(([id, label]) => button(label, () => setFilter({ ...filter, kind: id }), { key: id, 'aria-pressed': filter.kind === id }))),
          detailId && !detail && detailLoading && h('p', { className: 'recruitment-meta', role: 'status' }, 'Открываем карточку кандидата…'),
          content,
          tab !== 'onboarding' && h('footer', { className: 'recruitment-footer' }, h('span', null, 'hh — переход на сайт для переписки'), h('span', null, 'Авторассылки в мессенджеры не подключены')))),
      demandDetail && !form && h('div', { className: 'recruitment-overlay' }, h('section', { className: 'recruitment-dialog recruitment-detail', role: 'dialog', 'aria-modal': true, 'aria-label': `Потребность ${demandDetail.title}` },
        h('div', { className: 'recruitment-dialog-heading' }, h('div', null, h('span', { className: 'recruitment-eyebrow' }, demandDetail.kind === 'carrier' ? 'ПЕРЕВОЗЧИКИ · МАШИНЫ' : 'ПРОЕКТЫ · ВОДИТЕЛИ ЕЦЛ'), h('h2', null, demandDetail.title)), button('Закрыть потребность', () => setDemandId(null), { className: 'recruitment-text-button' })),
        h('div', { className: 'recruitment-detail-body' }, h('div', { className: 'recruitment-actions' }, badge(({ open: 'Открыта', paused: 'Пауза', closed: 'Закрыта' })[demandDetail.status], demandDetail.status === 'open' ? 'is-active' : ''), demandDetail.priority === 'urgent' && badge('Срочно', 'is-warning'), hhLink(demandDetail.hhUrl)),
          h('section', { className: 'recruitment-detail-section', 'aria-label': 'Кандидаты по потребности' },
            h('h3', null, `${external ? 'Мои кандидаты' : 'Кандидаты по потребности'} · ${demandApps.length}`),
            demandApps.length ? demandApps.map((application) => demandCandidate(application)) : h('p', { className: 'recruitment-meta' }, 'Пока никто не добавлен в эту потребность.')),
          h('dl', { className: 'recruitment-detail-fields' }, ...[['Проект', projectName(demandDetail)], ['Город / район', [demandDetail.city, demandDetail.district].filter(Boolean).join(' · ')], ['Количество и срок', `${quantityLabel(demandDetail.quantity)}${demandDetail.quantity == null ? '' : demandDetail.kind === 'carrier' ? ' машин' : ' водителей'} · ${dateLabel(demandDetail.neededBy)}`], ['Адрес склада / точки выхода', demandDetail.warehouseAddress], ['График работы', demandDetail.schedule], ['Условия оплаты', demandDetail.payTerms], ['Маршруты и работа на проекте', demandDetail.routeInfo], ['Требования к водителю', demandDetail.driverRequirements], ['Требования к автомобилю', demandDetail.vehicleRequirements], ['Обучение и стажировка', demandDetail.trainingTerms], ['Описание для рекрутеров', demandDetail.publicBrief], ...(!external ? [['Ответственный в компании', recruiterName(demandDetail.recruiterId)], ['Внутренний комментарий компании', demandDetail.notes]] : [])].map(([label, value]) => h('div', { key: label }, h('dt', null, label), h('dd', null, value || 'Не указано')))),
          !external && demandDetail.sourceDetails && h('details', { className: 'recruitment-source-details' },
            h('summary', null, 'Данные из исходной таблицы'),
            h('div', { className: 'recruitment-source-text' }, demandDetail.sourceDetails)),
          h('div', { className: 'recruitment-actions' }, demandDetail.status !== 'closed' && button('Подобрать кандидата', () => openForm('applications', null, { requestId: demandDetail.id, recruiterId: external ? actor.id : demandDetail.recruiterId }), { className: 'button recruitment-primary', disabled: saving }), !external && button('Изменить потребность', () => openForm('requests', demandDetail))),
          external && h('p', { className: 'recruitment-meta' }, 'Открытие этой потребности учитывается в отчёте активности компании.')))),
      detail && !form && h('div', { className: 'recruitment-overlay' }, h('section', { className: 'recruitment-dialog recruitment-detail', role: 'dialog', 'aria-modal': true, 'aria-label': `Карточка ${detail.fullName}` },
        h('div', { className: 'recruitment-dialog-heading' }, h('div', null, h('span', { className: 'recruitment-eyebrow' }, 'КАРТОЧКА КАНДИДАТА'), h('h2', null, detail.fullName)), button('Закрыть карточку', () => setDetailId(null), { className: 'recruitment-text-button' })),
        h('div', { className: 'recruitment-detail-body' }, detailLoading && h('p', { className: 'recruitment-meta', role: 'status' }, 'Обновляем историю кандидата…'), h('div', { className: 'recruitment-actions' }, badge(kindName(detail.kind)), detail.archived && badge('Архив'), h('a', { className: 'recruitment-phone', href: `tel:${detail.phone}` }, detail.phone), hhLink(detail.hhUrl)),
          h('dl', { className: 'recruitment-detail-fields' }, ...[['Город / район', [detail.city, detail.district].filter(Boolean).join(' · ')], ['Рекрутер', recruiterName(detail.recruiterId)], ['Источник', sourceName(detail.source)], ['Права / опыт', [detail.licenseCategories, detail.experience].filter(Boolean).join(' · ')], ...(detail.kind === 'carrier' ? [['Автомобиль', detail.vehicleType], ['Габариты / грузоподъёмность', [detail.vehicleDimensions, detail.vehicleCapacity].filter(Boolean).join(' · ')]] : [])].map(([label, value]) => h('div', { key: label }, h('dt', null, label), h('dd', null, value || 'Не указано')))),
          detail.notes && h('p', { className: 'recruitment-note' }, detail.notes),
          h('div', { className: 'recruitment-actions' }, !external && OnboardingPanel && button('Оформить кандидата', () => { if (!confirmDiscard()) return; setOnboardingCandidateId(detail.id); navigate('onboarding'); }, { className: 'button recruitment-primary', disabled: detail.archived }), button('Изменить кандидата', () => openForm('candidates', detail)), button('Добавить в подбор', () => openForm('applications', null, { candidateId: detail.id, recruiterId: detail.recruiterId }), { disabled: detail.archived }), button('Напомнить о кандидате', () => openForm('tasks', null, { candidateId: detail.id, assigneeId: detail.recruiterId })), button('Записать контакт', () => openForm('contacts', null, { candidateId: detail.id, source: detail.source })), button('Новое обращение', () => openForm('contacts', null, { candidateId: detail.id, result: 'inquiry', source: detail.source }))),
          h('section', { className: 'recruitment-detail-section' }, h('h3', null, 'Подборы'), linkedApps.length ? linkedApps.map((app) => h('div', { className: 'recruitment-detail-row', key: app.id }, h('div', null, h('strong', null, requestMap.get(app.requestId)?.title || 'Потребность'), h('p', { className: 'recruitment-meta' }, `${projectName(app)} · ${stageName(app.stage)}${app.startDate ? ` · выход ${dateLabel(app.startDate)}` : ''}`), app.reason && h('p', { className: 'recruitment-note' }, app.reason), h('p', { className: 'recruitment-meta' }, `СБ: ${securityName(app.securityStatus)}${app.securityDueAt ? ` · срок ${dateLabel(app.securityDueAt, true)}` : ''}`), app.attendanceStatus === 'confirmed' && badge(`Выход подтверждён · ${dateLabel(app.confirmedStartDate)}`, 'is-active'), app.attendanceStatus === 'no_show' && badge('Не вышел', 'is-warning'), workflowActions(detail, app, linkedTasks.find(task => task.applicationId === app.id && task.status === 'open'))), button('Изменить этап', () => openForm('applications', app), { className: 'recruitment-text-button' }))) : h('p', { className: 'recruitment-meta' }, 'Пока не привязан к потребностям.')),
          h('section', { className: 'recruitment-detail-section' }, h('h3', null, `Обращения и контакты · ${contactTotal}`), (data.contacts || []).filter(item => item.candidateId === detail.id).length ? h('ol', { className: 'recruitment-history' }, ...data.contacts.filter(item => item.candidateId === detail.id).map(contact => h('li', { key: contact.id }, h('strong', null, CONTACT_RESULTS.find(([id]) => id === contact.result)?.[1] || contact.result), h('span', null, `${dateLabel(contact.occurredAt, true)}${contact.source ? ` · ${sourceName(contact.source)}` : ''}`), contact.notes && h('p', { className: 'recruitment-note' }, contact.notes)))) : h('p', { className: 'recruitment-meta' }, 'Здесь сохраняются отдельные обращения и результаты контактов.'), contactTotal > 50 && h('div', { className: 'recruitment-actions' }, button('Предыдущие контакты', () => setContactPage(value => Math.max(1, value - 1)), { disabled: contactPage === 1 || detailLoading }), h('span', { className: 'recruitment-meta' }, `Страница ${contactPage}`), button('Следующие контакты', () => setContactPage(value => value + 1), { disabled: contactPage * 50 >= contactTotal || detailLoading }))),
          (data.workflowEvents || []).some(event => linkedApps.some(app => app.id === event.applicationId)) && h('section', { className: 'recruitment-detail-section' }, h('h3', null, 'История проверок и выходов'), h('ol', { className: 'recruitment-history' }, ...data.workflowEvents.filter(event => linkedApps.some(app => app.id === event.applicationId)).map(event => h('li', { key: event.id }, h('strong', null, event.kind === 'security' ? `СБ: ${securityName(event.payload?.status)}` : event.payload?.status === 'no_show' ? 'Не вышел' : 'Результат выхода'), h('span', null, dateLabel(event.occurredAt || event.createdAt, true)), event.payload?.note && h('p', { className: 'recruitment-note' }, event.payload.note))))),
          h('section', { className: 'recruitment-detail-section' }, h('h3', null, 'Задачи'), linkedTasks.length ? linkedTasks.map(taskCard) : h('p', { className: 'recruitment-meta' }, 'Напоминаний пока нет.')),
          h('section', { className: 'recruitment-detail-section' }, h('h3', null, 'История переходов'), history.length ? h('ol', { className: 'recruitment-history' }, ...history.map((event) => h('li', { key: event.id }, h('strong', null, `${event.fromStage ? `${stageName(event.fromStage)} → ` : ''}${stageName(event.toStage)}`), h('span', null, `${dateLabel(event.occurredAt, true)} · ${requestMap.get(linkedApps.find((app) => app.id === event.applicationId)?.requestId)?.title || ''}`)))) : h('p', { className: 'recruitment-meta' }, 'Переходы появятся после добавления в подбор.'))))),
      form && h(FormDialog, { form, setForm, saving, error: formError, onSave: save, onClose: stableClose, data: form.catalog || data, actor, accessData: form.accessCatalog || accessData, scopes, onAssignAccess: (userId, responsibilityScopeId) => openForm('access', null, { userId, responsibilityScopeId }), onCopyInvitation: copyInvitation }));
  };
}
