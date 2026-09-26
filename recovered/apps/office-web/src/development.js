// SPDX-License-Identifier: MIT
// One ticket moves from analysis to production; there are no separate task copies.
const PIPELINES = [
  { id: 'analysis', label: 'Аналитика', stages: [['new', 'Новые'], ['clarifying', 'Уточнение'], ['ready', 'Готово к разработке']] },
  { id: 'production', label: 'Продакшен', stages: [['in_progress', 'В работе'], ['review', 'Проверка'], ['done', 'Готово']] },
];
const SECTIONS = [['tenders', 'Тендеры'], ['recruitment', 'Рекрутинг'], ['fleet', 'Автопарк'], ['planning', 'Планирование'], ['access', 'Вход и доступ'], ['other', 'Другое']];
const FIELDS = ['title', 'description', 'section', 'status'];
const FIELD_NAMES = { title: 'Название', description: 'Описание', section: 'Раздел приложения', status: 'Этап' };
const STAGES = PIPELINES.flatMap((pipeline) => pipeline.stages);
const EMPTY_LABELS = { new: 'Новых обращений пока нет', clarifying: 'Нет тикетов на уточнении', ready: 'Нет задач, готовых к разработке', in_progress: 'Нет тикетов в работе', review: 'Нет тикетов на проверке', done: 'Здесь появятся завершённые тикеты' };
const nameOf = (options, value) => options.find(([id]) => id === value)?.[1] || value || 'Не указано';
const normalized = (value) => String(value || '').toLocaleLowerCase('ru').trim();
const scopeLabel = (scope) => [scope.projectName, scope.regionName, scope.scopeName].filter(Boolean).join(' · ') || 'Проект';
const dateLabel = (value) => {
  const date = new Date(value);
  return !value || Number.isNaN(date.getTime()) ? 'Дата не указана' : new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date);
};
const serialise = (ticket) => Object.fromEntries(['id', 'responsibilityScopeId', 'version', ...FIELDS].map((key) => [key, ticket[key]]));
const newTicket = (scopeId) => ({ id: crypto.randomUUID(), responsibilityScopeId: scopeId, version: 0, title: '', description: '', section: 'other', status: 'new' });
const sortedEvents = (events) => [...events].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
const eventLabel = (event) => {
  if (event.type === 'comment') return event.text;
  if (event.fromStatus && event.toStatus) return `${nameOf(STAGES, event.fromStatus)} → ${nameOf(STAGES, event.toStatus)}`;
  return event.text || (event.type === 'created' ? 'Тикет создан' : 'Тикет обновлён');
};

export function createDevelopmentWorkspace(React, { request }) {
  const { createElement: h, useState, useEffect, useRef, useMemo } = React;
  const button = (label, onClick, props = {}) => h('button', { type: 'button', className: 'button', onClick, ...props }, label);
  const field = (label, input, hint, wide = false) => h('label', { className: `development-field${wide ? ' is-wide' : ''}` }, h('span', null, label), React.cloneElement(input, { 'aria-label': input.props['aria-label'] || label }), hint && h('small', null, hint));

  function Dialog({ title, subtitle, onClose, busy, children }) {
    const ref = useRef(null), callbacks = useRef({ onClose, busy });
    callbacks.current = { onClose, busy };
    useEffect(() => {
      const previous = document.activeElement, element = ref.current, previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      (element?.querySelector('input, select, textarea') || element?.querySelector('button'))?.focus();
      const handleKey = (event) => {
        if (event.key === 'Escape' && !callbacks.current.busy) { event.preventDefault(); callbacks.current.onClose(); }
        if (event.key !== 'Tab') return;
        const focusable = [...element.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]')].filter((node) => node.offsetParent !== null && !node.matches(':disabled'));
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (!first) { event.preventDefault(); element.focus(); }
        else if (event.shiftKey && (document.activeElement === first || document.activeElement === element)) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || document.activeElement === element)) { event.preventDefault(); first.focus(); }
      };
      element?.addEventListener('keydown', handleKey);
      return () => { document.body.style.overflow = previousOverflow; element?.removeEventListener('keydown', handleKey); if (previous?.isConnected) previous.focus?.(); };
    }, []);
    return h('div', { className: 'development-overlay' }, h('section', { ref, tabIndex: -1, role: 'dialog', 'aria-modal': true, 'aria-labelledby': 'development-dialog-title', className: 'development-dialog' },
      h('header', { className: 'development-dialog-heading' }, h('div', null, subtitle && h('p', { className: 'development-eyebrow' }, subtitle), h('h2', { id: 'development-dialog-title' }, title)), button('Закрыть', onClose, { disabled: busy, 'aria-label': 'Закрыть тикет' })), children));
  }

  return function DevelopmentWorkspace({ token, actor, onExpired, onDirtyChange }) {
    const [scopes, setScopes] = useState([]), [scopeId, setScopeId] = useState(''), [canManage, setCanManage] = useState(false);
    const [contextLoading, setContextLoading] = useState(true), [contextError, setContextError] = useState(''), [contextRevision, setContextRevision] = useState(0);
    const [tickets, setTickets] = useState([]), [loading, setLoading] = useState(false), [loaded, setLoaded] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
    const [pipeline, setPipeline] = useState('analysis'), [query, setQuery] = useState('');
    const [dialog, setDialog] = useState(null), [formError, setFormError] = useState(''), [conflict, setConflict] = useState(null), [busy, setBusy] = useState('');
    const [comment, setComment] = useState(() => ({ id: crypto.randomUUID(), text: '' })), [commentError, setCommentError] = useState('');
    const alive = useRef(true), busyRef = useRef(false), scopeRef = useRef(scopeId), sessionRef = useRef(''), lastCredentials = useRef({ actorId: actor?.id, token }), listGeneration = useRef(0), detailGeneration = useRef(0), detailController = useRef(null), callbacks = useRef({ onExpired, onDirtyChange });
    // Access tokens renew during ordinary requests. Only an account change invalidates drafts and writes.
    scopeRef.current = scopeId; sessionRef.current = actor?.id || ''; callbacks.current = { onExpired, onDirtyChange };
    const formDirty = Boolean(dialog?.value && FIELDS.some((key) => dialog.value[key] !== dialog.original[key]));
    const dirty = formDirty || Boolean(comment.text.trim());
    const currentPipeline = PIPELINES.find((item) => item.id === pipeline);
    const failMessage = (reason) => reason?.status === 401 ? 'Сессия завершена. Войдите снова.' : reason?.status === 403 ? 'Доступ к этому тикету или области закрыт. Обратитесь к администратору.' : reason?.status === 404 ? 'Тикет больше недоступен. Обновите список обращений.' : reason?.message || 'Не удалось выполнить действие. Проверьте соединение и попробуйте снова.';
    const expire = (reason) => { if (reason?.status === 401) callbacks.current.onExpired?.(); };
    const clearDraft = () => { detailGeneration.current += 1; detailController.current?.abort(); setDialog(null); setFormError(''); setConflict(null); setComment({ id: crypto.randomUUID(), text: '' }); setCommentError(''); };
    const isCurrent = (targetScope, session, generation) => alive.current && scopeRef.current === targetScope && sessionRef.current === session && (generation === undefined || detailGeneration.current === generation);
    const upsertTicket = (ticket) => {
      // Do not let an earlier board read replace a newer detail or mutation result.
      listGeneration.current += 1;
      setLoading(false);
      setTickets((current) => current.some((item) => item.id === ticket.id) ? current.map((item) => item.id === ticket.id ? ticket : item) : [ticket, ...current]);
    };
    const readDetail = async (id, targetScope, signal) => {
      const result = await request(`/development/tickets/${encodeURIComponent(id)}?responsibilityScopeId=${encodeURIComponent(targetScope)}`, { signal }, token);
      if (!result?.ticket || !Array.isArray(result.events)) throw new Error('Сервер вернул неполные данные тикета. Повторите загрузку.');
      return result;
    };

    useEffect(() => { alive.current = true; return () => { alive.current = false; listGeneration.current += 1; detailGeneration.current += 1; detailController.current?.abort(); callbacks.current.onDirtyChange?.(false); }; }, []);
    useEffect(() => { callbacks.current.onDirtyChange?.(dirty || Boolean(busy)); }, [dirty, busy]);
    useEffect(() => {
      const prevent = (event) => { if (dirty || busyRef.current) { event.preventDefault(); event.returnValue = ''; } };
      window.addEventListener('beforeunload', prevent);
      return () => window.removeEventListener('beforeunload', prevent);
    }, [dirty]);
    useEffect(() => {
      const controller = new AbortController();
      setContextLoading(true); setContextError(''); setCanManage(false); setScopes([]); setScopeId(''); setTickets([]); setLoaded(false); setError(''); setNotice(''); setQuery(''); setPipeline('analysis'); clearDraft();
      request('/development/context', { signal: controller.signal }, token).then((result) => {
        if (controller.signal.aborted) return;
        if (!Array.isArray(result?.scopes)) throw new Error('Сервер не вернул доступные области. Повторите загрузку.');
        setScopes(result.scopes); setCanManage(result.canManage === true); setScopeId(result.scopes[0]?.responsibilityScopeId || '');
      }).catch((reason) => { if (!controller.signal.aborted) { setContextError(failMessage(reason)); expire(reason); } }).finally(() => { if (!controller.signal.aborted) setContextLoading(false); });
      return () => controller.abort();
    }, [actor?.id, contextRevision]);
    useEffect(() => {
      const previous = lastCredentials.current;
      lastCredentials.current = { actorId: actor?.id, token };
      if (previous.actorId !== actor?.id || previous.token === token) return;
      const controller = new AbortController(), session = sessionRef.current;
      // Recheck permissions after renewal without closing an open draft or replaying a mutation.
      request('/development/context', { signal: controller.signal }, token).then((result) => {
        if (controller.signal.aborted || !alive.current || sessionRef.current !== session) return;
        if (!Array.isArray(result?.scopes)) throw new Error('Не удалось обновить доступ к разделу. Ваш черновик сохранён.');
        setCanManage(result.canManage === true);
        if (result.scopes.some((scope) => scope.responsibilityScopeId === scopeRef.current)) setScopes(result.scopes);
        else if (scopeRef.current) setError('Доступ к текущей области изменился. Ваш черновик сохранён в окне. Обратитесь к администратору.');
      }).catch((reason) => { if (!controller.signal.aborted && alive.current && sessionRef.current === session) { setError(failMessage(reason)); expire(reason); } });
      return () => controller.abort();
    }, [token, actor?.id]);

    async function loadTickets(targetScope, signal) {
      const generation = ++listGeneration.current, session = sessionRef.current;
      const result = await request(`/development?responsibilityScopeId=${encodeURIComponent(targetScope)}`, { signal }, token);
      if (!Array.isArray(result?.tickets)) throw new Error('Сервер не вернул список тикетов. Повторите загрузку.');
      if (!signal?.aborted && generation === listGeneration.current && isCurrent(targetScope, session)) { setTickets(result.tickets); setLoaded(true); }
      return result;
    }
    useEffect(() => {
      if (!scopeId) return;
      const controller = new AbortController(), generation = listGeneration.current + 1;
      setTickets([]); setLoaded(false); setLoading(true); setError('');
      loadTickets(scopeId, controller.signal).catch((reason) => { if (!controller.signal.aborted && generation === listGeneration.current) { setError(failMessage(reason)); expire(reason); } }).finally(() => { if (!controller.signal.aborted && generation === listGeneration.current) setLoading(false); });
      return () => controller.abort();
    }, [scopeId]);
    async function refresh() {
      if (loading || busyRef.current || !scopeId) return;
      const targetScope = scopeId, session = sessionRef.current, generation = listGeneration.current + 1;
      setLoading(true); setError('');
      try { await loadTickets(targetScope); } catch (reason) { if (isCurrent(targetScope, session) && generation === listGeneration.current) { setError(failMessage(reason)); expire(reason); } } finally { if (isCurrent(targetScope, session) && generation === listGeneration.current) setLoading(false); }
    }
    const chooseScope = (next) => {
      if (busyRef.current || scopeId === next) return;
      if (dirty && !window.confirm('Сменить область и удалить несохранённые изменения тикета и комментария?')) return;
      clearDraft(); setScopeId(next); setQuery(''); setNotice('');
    };
    const closeDialog = () => {
      if (busyRef.current) return;
      if (dirty && !window.confirm('Закрыть тикет и удалить несохранённые изменения и комментарий?')) return;
      clearDraft();
    };
    const createTicket = () => {
      if (busyRef.current || !loaded || !scopeId) return;
      clearDraft();
      const value = newTicket(scopeId);
      setDialog({ mode: 'new', id: value.id, value, original: { ...value }, events: [], loading: false, error: '' }); setNotice('');
    };
    async function openTicket(id) {
      if (busyRef.current) return;
      clearDraft();
      const generation = detailGeneration.current, targetScope = scopeId, session = sessionRef.current, controller = new AbortController();
      detailController.current = controller;
      setDialog({ mode: 'edit', id, loading: true, error: '', events: [] });
      try {
        const result = await readDetail(id, targetScope, controller.signal);
        if (!isCurrent(targetScope, session, generation) || controller.signal.aborted) return;
        upsertTicket(result.ticket);
        setDialog({ mode: 'edit', id, value: serialise(result.ticket), original: serialise(result.ticket), ticket: result.ticket, events: result.events, loading: false, error: '' });
      } catch (reason) {
        if (!isCurrent(targetScope, session, generation) || controller.signal.aborted) return;
        setDialog((current) => current && ({ ...current, loading: false, error: failMessage(reason) })); expire(reason);
      }
    }
    const changeField = (key, value) => setDialog((current) => ({ ...current, value: { ...current.value, [key]: value } }));
    async function loadConflict() {
      if (!dialog?.value || busyRef.current) return;
      const current = dialog, targetScope = scopeId, session = sessionRef.current, generation = detailGeneration.current;
      busyRef.current = true; setBusy('conflict'); setFormError('');
      try {
        const result = await readDetail(current.id, targetScope);
        if (!isCurrent(targetScope, session, generation)) return;
        setConflict(result.ticket); upsertTicket(result.ticket); setDialog((value) => ({ ...value, events: result.events }));
      } catch (reason) { if (isCurrent(targetScope, session, generation)) { setFormError(`Ваш черновик сохранён в окне. ${failMessage(reason)}`); expire(reason); } }
      finally { busyRef.current = false; if (alive.current) setBusy(''); }
    }

    async function saveTicket(event, { latest, moveTo } = {}) {
      event?.preventDefault();
      if (!dialog?.value || busyRef.current) return;
      if (conflict && !latest) { setFormError('Сравните актуальную версию с вашим черновиком и подтвердите сохранение ниже.'); return; }
      const current = dialog, targetScope = scopeId, session = sessionRef.current, generation = detailGeneration.current;
      const changed = Object.fromEntries(FIELDS.filter((key) => current.value[key] !== current.original[key]).map((key) => [key, current.value[key]]));
      const submitted = serialise(latest ? { ...latest, ...changed } : current.value);
      if (moveTo) submitted.status = moveTo;
      submitted.title = submitted.title.trim(); submitted.description = submitted.description.trim();
      if (!submitted.title || !submitted.description) { setFormError('Заполните название и описание тикета.'); return; }
      // Retain an explicit move in the draft so a conflict retry preserves the user's intended stage.
      if (moveTo) setDialog((value) => ({ ...value, value: { ...value.value, status: moveTo } }));
      busyRef.current = true; setBusy('save'); setFormError(''); setNotice('');
      try {
        const saved = await request('/development/tickets', { method: 'PUT', body: JSON.stringify(submitted) }, token);
        if (!isCurrent(targetScope, session, generation)) return;
        upsertTicket(saved); setConflict(null);
        setPipeline(PIPELINES.find((item) => item.stages.some(([status]) => status === saved.status))?.id || 'analysis');
        setDialog((value) => ({ ...value, mode: 'edit', value: serialise(saved), original: serialise(saved), ticket: saved }));
        setNotice(current.mode === 'new' ? `Тикет №${saved.number} создан и отправлен в аналитику.` : `Тикет №${saved.number} сохранён.`);
        try {
          const result = await readDetail(saved.id, targetScope);
          if (isCurrent(targetScope, session, generation)) {
            upsertTicket(result.ticket);
            setDialog((value) => ({ ...value, value: serialise(result.ticket), original: serialise(result.ticket), ticket: result.ticket, events: result.events }));
          }
        } catch (reason) { if (isCurrent(targetScope, session, generation)) { setFormError(`Тикет сохранён, но обновить историю не удалось. ${failMessage(reason)}`); expire(reason); } }
      } catch (reason) {
        if (!isCurrent(targetScope, session, generation)) return;
        expire(reason);
        if (reason?.status === 409) {
          setConflict({ pending: true });
          setFormError('Тикет уже изменили. Ваш черновик сохранён. Загрузите актуальную версию и сравните изменения.');
          try {
            const result = await readDetail(current.id, targetScope);
            if (isCurrent(targetScope, session, generation)) { setConflict(result.ticket); upsertTicket(result.ticket); setDialog((value) => ({ ...value, events: result.events })); setFormError('Тикет уже изменили. Сравните актуальные значения ниже: ваш черновик остался в полях формы.'); }
          } catch (refreshReason) { if (isCurrent(targetScope, session, generation)) { setFormError(`Ваш черновик сохранён. Не удалось загрузить актуальную версию. ${failMessage(refreshReason)}`); expire(refreshReason); } }
        } else setFormError(failMessage(reason));
      } finally { busyRef.current = false; if (alive.current) setBusy(''); }
    }

    async function sendComment(event) {
      event.preventDefault();
      if (!dialog?.ticket || busyRef.current || !comment.text.trim()) return;
      const current = dialog, draft = comment, targetScope = scopeId, session = sessionRef.current, generation = detailGeneration.current;
      busyRef.current = true; setBusy('comment'); setCommentError('');
      try {
        const saved = await request('/development/comments', { method: 'POST', body: JSON.stringify({ id: draft.id, ticketId: current.id, responsibilityScopeId: targetScope, text: draft.text.trim() }) }, token);
        if (!isCurrent(targetScope, session, generation)) return;
        setDialog((value) => ({ ...value, events: value.events.some((item) => item.id === saved.id) ? value.events : [...value.events, saved] }));
        setComment({ id: crypto.randomUUID(), text: '' });
        try {
          const result = await readDetail(current.id, targetScope);
          if (isCurrent(targetScope, session, generation)) {
            upsertTicket(result.ticket);
            const hasDraft = FIELDS.some((key) => current.value[key] !== current.original[key]);
            if (hasDraft && result.ticket.version !== current.original.version) {
              setConflict(result.ticket); setFormError('Пока вы писали комментарий, тикет изменили. Ваш черновик сохранён. Сравните актуальные значения перед сохранением.');
              setDialog((value) => ({ ...value, ticket: result.ticket, events: result.events }));
            } else {
              setDialog((value) => ({ ...value, value: hasDraft ? value.value : serialise(result.ticket), original: serialise(result.ticket), ticket: result.ticket, events: result.events }));
            }
          }
        } catch (reason) { if (isCurrent(targetScope, session, generation)) { setCommentError(`Комментарий отправлен, но обновить историю не удалось. ${failMessage(reason)}`); expire(reason); } }
      } catch (reason) {
        if (!isCurrent(targetScope, session, generation)) return;
        setCommentError(failMessage(reason)); expire(reason);
        // A connection can fail after the server committed the comment. Its stable ID makes retries safe.
        if (![400, 401, 403, 404].includes(reason?.status)) {
          try {
            const result = await readDetail(current.id, targetScope);
            const existing = result.events.find((item) => item.id === draft.id);
            if (isCurrent(targetScope, session, generation) && existing) {
              setDialog((value) => ({ ...value, events: result.events }));
              setComment({ id: crypto.randomUUID(), text: existing.text === draft.text.trim() ? '' : draft.text });
              setCommentError(existing.text === draft.text.trim() ? '' : 'Предыдущая версия комментария уже отправлена. Новый текст сохранён в поле — отправьте его отдельным комментарием.');
            }
          } catch { /* Keep the draft and its id for a retry. */ }
        }
      } finally { busyRef.current = false; if (alive.current) setBusy(''); }
    }

    const filtered = useMemo(() => {
      const search = normalized(query);
      return tickets.filter((ticket) => !search || normalized([ticket.number, `№${ticket.number}`, ticket.title, ticket.description, nameOf(SECTIONS, ticket.section), ticket.authorName].join(' ')).includes(search)).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    }, [tickets, query]);
    const displayValue = (key, value) => key === 'section' ? nameOf(SECTIONS, value) : key === 'status' ? nameOf(STAGES, value) : value || 'Не указано';
    const renderTicket = (ticket) => h('button', { type: 'button', key: ticket.id, className: 'development-card', onClick: () => openTicket(ticket.id), 'aria-label': `Открыть тикет №${ticket.number}: ${ticket.title}` },
      h('span', { className: 'development-card-meta' }, h('span', null, `№${ticket.number}`), h('span', { className: 'development-section-badge' }, nameOf(SECTIONS, ticket.section))),
      h('strong', { className: 'development-card-title' }, ticket.title),
      h('span', { className: 'development-card-description' }, ticket.description),
      h('span', { className: 'development-card-footer' }, h('span', null, ticket.authorName || 'Сотрудник'), h('time', { dateTime: ticket.updatedAt }, dateLabel(ticket.updatedAt))));

    return h('main', { className: 'development-workspace' },
      h('header', { className: 'development-heading' }, h('div', null, h('h1', null, 'Разработка'), h('p', null, 'Ошибки и предложения по работе приложения.')), button('+ Новый тикет', createTicket, { className: 'button development-primary', disabled: !scopeId || !loaded || Boolean(busy) || contextLoading })),
      contextLoading && h('div', { className: 'development-loading', role: 'status' }, 'Загружаем доступ к разделу…'),
      contextError && h('div', { className: 'development-error', role: 'alert' }, h('p', null, contextError), button('Повторить загрузку', () => setContextRevision((value) => value + 1))),
      !contextLoading && !contextError && !scopes.length && h('div', { className: 'development-empty' }, h('h2', null, 'Нет доступной области'), h('p', null, 'Попросите администратора назначить вам область ответственности, чтобы создавать тикеты.')),
      !contextLoading && scopeId && h(React.Fragment, null,
        h('section', { className: 'development-scope-row', 'aria-label': 'Область тикетов' }, field('Проект', h('select', { value: scopeId, disabled: Boolean(busy) || scopes.length < 2, onChange: (event) => chooseScope(event.target.value) }, ...scopes.map((scope) => h('option', { key: scope.responsibilityScopeId, value: scope.responsibilityScopeId }, scopeLabel(scope))))), h('p', null, canManage ? 'Все тикеты команды. Уточняйте обращения и переводите готовые задачи в продакшен.' : 'Ваши тикеты. Создавайте обращения, дополняйте описание и следите за решением.')),
        h('div', { className: 'development-workbar' }, h('div', { className: 'development-segment', role: 'group', 'aria-label': 'Воронка тикетов' }, ...PIPELINES.map((item) => button(h(React.Fragment, null, item.label, h('span', { className: 'development-pipeline-count' }, tickets.filter((ticket) => item.stages.some(([status]) => status === ticket.status)).length)), () => setPipeline(item.id), { key: item.id, 'aria-pressed': pipeline === item.id }))), h('div', { className: 'development-search-row' }, field('Поиск тикета', h('input', { type: 'search', value: query, onChange: (event) => setQuery(event.target.value), placeholder: 'Номер, название или описание' })), button(loading ? 'Обновляем…' : 'Обновить', refresh, { disabled: loading || Boolean(busy), 'aria-label': 'Обновить список тикетов' }))),
        error && h('div', { className: 'development-error', role: 'alert' }, h('p', null, error), button('Повторить загрузку', refresh, { disabled: loading || Boolean(busy) })),
        notice && h('div', { className: 'development-notice', role: 'status' }, notice),
        loading && !loaded && h('div', { className: 'development-loading', role: 'status' }, 'Загружаем тикеты…'),
        loaded && h(React.Fragment, null,
          h('p', { className: 'development-pipeline-hint' }, pipeline === 'analysis' ? 'От нового обращения к понятной задаче для программиста.' : 'От работы над задачей к проверке и готовому результату.'),
          query.trim() && !filtered.some((ticket) => currentPipeline.stages.some(([status]) => status === ticket.status)) && h('p', { className: 'development-search-empty', role: 'status' }, 'В этой воронке нет тикетов по вашему запросу. Измените поиск или откройте другую воронку.'),
          h('div', { className: 'development-board', 'aria-label': `Воронка ${currentPipeline.label}`, 'aria-busy': loading }, ...currentPipeline.stages.map(([status, label]) => {
            const items = filtered.filter((ticket) => ticket.status === status);
            return h('section', { key: status, className: `development-column stage-${status}`, 'aria-labelledby': `development-stage-${status}` }, h('header', null, h('h2', { id: `development-stage-${status}` }, label), h('span', { 'aria-label': `Тикетов: ${items.length}` }, items.length)), items.length ? items.map(renderTicket) : h('p', { className: 'development-column-empty' }, query.trim() ? 'Нет подходящих тикетов' : EMPTY_LABELS[status]));
          })))),
      dialog && h(Dialog, { title: dialog.mode === 'new' ? 'Новый тикет' : dialog.ticket ? `Тикет №${dialog.ticket.number}` : 'Тикет', subtitle: dialog.ticket ? `${dialog.ticket.authorName || 'Сотрудник'} · ${dateLabel(dialog.ticket.createdAt)}` : 'Разработка', onClose: closeDialog, busy: Boolean(busy) },
        dialog.loading && h('div', { className: 'development-dialog-body development-loading', role: 'status' }, 'Загружаем тикет…'),
        dialog.error && h('div', { className: 'development-dialog-body development-error', role: 'alert' }, h('p', null, dialog.error), button('Повторить загрузку', () => openTicket(dialog.id))),
        dialog.value && h(React.Fragment, null,
          h('form', { onSubmit: saveTicket }, h('fieldset', { className: 'development-form-grid', disabled: Boolean(busy) },
            field('Название', h('input', { type: 'text', value: dialog.value.title, onChange: (event) => changeField('title', event.target.value), required: true, maxLength: 200, placeholder: 'Кратко опишите проблему или предложение', autoFocus: dialog.mode === 'new' }), null, true),
            field('Раздел приложения', h('select', { value: dialog.value.section, onChange: (event) => changeField('section', event.target.value) }, ...SECTIONS.map(([id, label]) => h('option', { key: id, value: id }, label)))),
            canManage && dialog.mode !== 'new' ? field('Этап', h('select', { value: dialog.value.status, onChange: (event) => changeField('status', event.target.value) }, ...PIPELINES.map((item) => h('optgroup', { key: item.id, label: item.label }, ...item.stages.map(([id, label]) => h('option', { key: id, value: id }, label)))))) : h('div', { className: 'development-status-field' }, h('span', null, 'Этап'), h('span', { className: `development-stage-badge stage-${dialog.value.status}` }, nameOf(STAGES, dialog.value.status))),
            field('Описание', h('textarea', { value: dialog.value.description, onChange: (event) => changeField('description', event.target.value), required: true, maxLength: 6000, rows: 6, placeholder: 'Что вы пытались сделать? Что произошло и какой результат ожидали?' }), 'Для ошибки укажите шаги, фактический и ожидаемый результат. Для предложения — что хотите улучшить.', true)),
          formError && h('div', { className: 'development-dialog-message development-error', role: 'alert' }, formError),
          conflict && h('section', { className: 'development-conflict', 'aria-label': 'Конфликт изменений' }, h('h3', null, 'Ваш черновик сохранён'),
            conflict.pending ? h('p', null, 'Загрузите актуальную версию, чтобы продолжить сохранение.') : h(React.Fragment, null, h('p', null, 'На сервере сейчас сохранены эти значения. При подтверждении изменятся только поля, которые вы редактировали.'), h('dl', null, ...FIELDS.filter((key) => canManage || key !== 'status').map((key) => h('div', { key }, h('dt', null, FIELD_NAMES[key]), h('dd', null, displayValue(key, conflict[key]))))), button('Сохранить мои правки в актуальную версию', () => saveTicket(null, { latest: conflict }), { className: 'button development-primary', disabled: Boolean(busy) })),
            button(busy === 'conflict' ? 'Загружаем…' : 'Загрузить актуальную версию', loadConflict, { disabled: Boolean(busy) })),
          h('footer', { className: 'development-form-footer' }, h('span', { className: 'development-muted', role: 'status' }, formDirty ? 'Есть несохранённые изменения' : dialog.mode === 'new' ? 'Тикет попадёт в «Новые»' : 'Все изменения сохранены'),
            h('div', { className: 'development-actions' }, canManage && dialog.mode !== 'new' && dialog.original.status === 'ready' && !conflict && button('В продакшен', () => saveTicket(null, { moveTo: 'in_progress' }), { disabled: Boolean(busy), title: 'Сохранить тикет и перевести в этап «В работе»' }), h('button', { type: 'submit', className: 'button development-primary', disabled: Boolean(busy) || Boolean(conflict) || (dialog.mode !== 'new' && !formDirty) }, busy === 'save' ? 'Сохраняем…' : dialog.mode === 'new' ? 'Создать тикет' : 'Сохранить')))),
          dialog.mode !== 'new' && h('section', { className: 'development-discussion', 'aria-labelledby': 'development-history-heading' }, h('h3', { id: 'development-history-heading' }, 'Обсуждение и история'),
            dialog.events.length ? h('ol', { className: 'development-history' }, ...sortedEvents(dialog.events).map((event) => h('li', { key: event.id, className: event.type === 'comment' ? 'is-comment' : '' }, h('div', null, h('strong', null, event.actorName || 'Сотрудник'), h('time', { dateTime: event.createdAt }, dateLabel(event.createdAt))), h('p', null, eventLabel(event))))) : h('p', { className: 'development-muted' }, 'История пока пуста.'),
            h('form', { className: 'development-comment-form', onSubmit: sendComment }, field('Комментарий', h('textarea', { value: comment.text, onChange: (event) => setComment((current) => ({ ...current, text: event.target.value })), rows: 3, maxLength: 4000, disabled: Boolean(busy), placeholder: 'Добавьте уточнение или результат проверки', required: true })), commentError && h('div', { className: 'development-error', role: 'alert' }, commentError), h('button', { type: 'submit', className: 'button', disabled: Boolean(busy) || !comment.text.trim() }, busy === 'comment' ? 'Отправляем…' : 'Добавить комментарий'))))));
  };
}
