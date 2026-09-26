import { createCompanyWorkRequest } from "./company-work-request.js";
// Driver requests use the application itself for both sides of the conversation.
const statusName = { open: 'Новое', new: 'Новое', in_progress: 'В работе', resolved: 'Решено' };
const kindName = { question: 'Вопрос', problem: 'Проблема', suggestion: 'Предложение' };
const actionName = { take: 'Взять в работу', resolve: 'Отметить решённым', reopen: 'Открыть повторно', escalate: 'Передать администрации' };
const dateLabel = value => new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
const mergeMessages = (old, fresh) => [...new Map([...old, ...fresh].map(item => [item.id, item])).values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
const mergeTickets = (old, fresh) => [...new Map([...old, ...fresh].map(item => [item.id, item])).values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));

export function createDriverRequests(React, { request }) {
  const { createElement: h, useState, useRef, useEffect } = React;
  const button = (label, onClick, props = {}) => h('button', { type: 'button', className: 'button', onClick, ...props }, label);
  const field = (label, element) => h('label', { className: 'driver-request-field' }, h('span', null, label), React.cloneElement(element, { 'aria-label': label }));

  function Panel({ token, actor, scopeId, scopes = [], scopeName, refreshRequest = 0, onExpired, onDirtyChange, driver }) {
    const [catalog, setCatalog] = useState(null);
    const [tickets, setTickets] = useState([]);
    const [cursor, setCursor] = useState(null);
    const [selected, setSelected] = useState('');
    const [ticket, setTicket] = useState(null);
    const [messages, setMessages] = useState([]);
    const [older, setOlder] = useState(null);
    const [loading, setLoading] = useState(true);
    const [threadLoading, setThreadLoading] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [drafts, setDrafts] = useState({});
    const [creating, setCreating] = useState(false);
    const [form, setForm] = useState({ department: '', kind: 'question', scopeId: '', subject: '', text: '' });
    const [action, setAction] = useState(null);
    const [reason, setReason] = useState('');
    const [filter, setFilter] = useState('');
    const generation = useRef(0), accessEpoch = useRef(0), threadRevision = useRef(0), messagesRef = useRef([]), selectedRef = useRef(''), busyRef = useRef(false), controllers = useRef(new Set());
    const requests = useRef(new Map()), listRevision = useRef(0), loadedPages = useRef(1), scroll = useRef(null), stick = useRef(true), dirtyCallback = useRef(onDirtyChange);
    const handledRefresh = useRef(refreshRequest);
    dirtyCallback.current = onDirtyChange;
    messagesRef.current = messages;
    const dirty = busy || Object.values(drafts).some(value => value.trim()) || Boolean(form.subject.trim() || form.text.trim() || reason.trim());
    useEffect(() => { dirtyCallback.current?.(dirty); }, [dirty]);
    useEffect(() => {
      const before = event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
      window.addEventListener('beforeunload', before);
      return () => window.removeEventListener('beforeunload', before);
    }, [dirty]);
    useEffect(() => () => dirtyCallback.current?.(false), []);
    const base = id => `/communications/tickets/${encodeURIComponent(id)}`;
    async function api(path, options = {}) {
      const controller = new AbortController(); controllers.current.add(controller);
      try { return await request(path, { ...options, signal: controller.signal }, token); }
      finally { controllers.current.delete(controller); }
    }
    function failure(err, contextId) {
      if (err?.name === 'AbortError') return;
      if (err?.queueError) contextId = undefined;
      if (err?.status === 401) onExpired?.();
      if ([403, 404].includes(err?.status)) {
        accessEpoch.current++; listRevision.current++; threadRevision.current++;
        if (!contextId || selectedRef.current === contextId) { selectedRef.current = ''; setSelected(''); setTicket(null); setMessages([]); setOlder(null); }
        setTickets(previous => contextId ? previous.filter(item => item.id !== contextId) : []);
      }
      setError(err?.message || 'Не удалось выполнить действие. Повторите попытку.');
    }
    function keyFor(slot, body) {
      const signature = JSON.stringify(body), old = requests.current.get(slot);
      if (old?.signature === signature) return old.key;
      const key = crypto.randomUUID(); requests.current.set(slot, { key, signature }); return key;
    }
    const scopeList = useRef(scopes); scopeList.current = scopes.length ? scopes : [{ responsibilityScopeId: scopeId }];
    const currentApi = useRef(api); currentApi.current = api;
    const companyRequest = useRef(null);
    if (!companyRequest.current) companyRequest.current = createCompanyWorkRequest((path, options) => currentApi.current(path, options), () => scopeList.current);
    async function loadList(next, replace = false) {
      const stamp = generation.current, epoch = accessEpoch.current, revision = ++listRevision.current;
      const pages = next || replace ? 1 : loadedPages.current;
      let cursorValue = next, items = [], result;
      try {
        for (let index = 0; index < pages; index++) {
          const query = new URLSearchParams(driver ? { view: 'mine' } : { responsibilityScopeId: scopeId });
          if (cursorValue) query.set('cursor', cursorValue);
          result = await (driver ? api : companyRequest.current)(`/communications/${driver ? 'tickets' : 'driver-requests'}?${query}`);
          items.push(...result.items); cursorValue = result.nextCursor;
          if (!cursorValue) break;
        }
      } catch (err) { err.queueError = true; throw err; }
      if (stamp !== generation.current || epoch !== accessEpoch.current || revision !== listRevision.current) return;
      setTickets(previous => {
        const known = new Map(previous.map(item => [item.id, item]));
        const fresh = items.map(item => known.get(item.id)?.version > item.version ? known.get(item.id) : item);
        return next ? mergeTickets(previous, fresh) : fresh;
      });
      loadedPages.current = next ? loadedPages.current + 1 : replace ? 1 : loadedPages.current;
      setCursor(cursorValue || null);
    }
    async function loadThread(id, initial = false) {
      const stamp = generation.current, epoch = accessEpoch.current, revision = ++threadRevision.current;
      const [detail, page] = await Promise.all([api(base(id)), api(`${base(id)}/messages`)]);
      if (stamp !== generation.current || epoch !== accessEpoch.current || revision !== threadRevision.current || selectedRef.current !== id) return;
      setTicket(previous => !previous || previous.id !== id || previous.version <= detail.version ? detail : previous);
      setTickets(previous => previous.map(item => item.id === detail.id && item.version <= detail.version ? detail : item));
      if (!initial && page.hasMore && !page.messages.some(message => messagesRef.current.some(old => old.id === message.id))) setOlder(page.nextBefore);
      setMessages(previous => initial ? page.messages : mergeMessages(previous, page.messages));
      if (initial) setOlder(page.hasMore ? page.nextBefore : null);
    }
    useEffect(() => {
      const stamp = ++generation.current, epoch = accessEpoch.current;
      busyRef.current = false; loadedPages.current = 1; setBusy(false); setLoading(true); setError(''); setTickets([]); setTicket(null); setMessages([]); setOlder(null);
      setSelected(''); selectedRef.current = '';
      Promise.all([api('/communications/catalog'), loadList(null, true)])
        .then(([data]) => {
          if (generation.current !== stamp || accessEpoch.current !== epoch) return;
          setCatalog(data);
          setForm(previous => ({ ...previous, department: previous.department || data.departments[0]?.code || '', scopeId: previous.scopeId || data.scopes[0]?.responsibilityScopeId || '' }));
        }).catch(err => { if (stamp === generation.current) failure(err); })
        .finally(() => { if (stamp === generation.current) setLoading(false); });
      let polling = false;
      const interval = setInterval(async () => {
        if (polling || busyRef.current || document.visibilityState === 'hidden') return;
        polling = true;
        const id = selectedRef.current;
        try { await Promise.all([loadList(), ...(id ? [loadThread(id)] : [])]); }
        catch (err) { if (stamp === generation.current) failure(err, id); }
        finally { polling = false; }
      }, 10000);
      return () => { generation.current++; clearInterval(interval); for (const controller of controllers.current) controller.abort(); };
    }, [token, actor.id, scopeId, driver]);
    useEffect(() => {
      if (stick.current && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
    }, [messages.length, selected, threadLoading]);
    useEffect(() => {
      if (handledRefresh.current === refreshRequest || loading || busy) return;
      handledRefresh.current = refreshRequest;
      const id = selectedRef.current;
      run(async current => {
        await Promise.all([loadList(), ...(id ? [loadThread(id)] : [])]);
        if (current()) setNotice('Список обращений обновлён.');
      });
    }, [refreshRequest, loading, busy]);
    async function open(id) {
      if (busyRef.current || selectedRef.current === id) return;
      if (reason.trim() && !window.confirm('Отменить незавершённое изменение статуса обращения?')) return;
      selectedRef.current = id; setSelected(id); setTicket(null); setMessages([]); setOlder(null);
      setThreadLoading(true); setError(''); setNotice(''); setCreating(false); setAction(null); setReason(''); stick.current = true;
      const stamp = generation.current;
      try { await loadThread(id, true); }
      catch (err) { if (stamp === generation.current && selectedRef.current === id) failure(err, id); }
      finally { if (stamp === generation.current && selectedRef.current === id) setThreadLoading(false); }
    }
    async function run(operation) {
      if (busyRef.current) return;
      busyRef.current = true; setBusy(true); setError(''); setNotice('');
      const stamp = generation.current, epoch = accessEpoch.current;
      try { await operation(() => stamp === generation.current && epoch === accessEpoch.current); }
      catch (err) { if (stamp === generation.current) failure(err, selectedRef.current); }
      finally { busyRef.current = false; if (stamp === generation.current) setBusy(false); }
    }
    function closeCreation() {
      if ((form.subject.trim() || form.text.trim()) && !window.confirm('Удалить черновик нового обращения?')) return;
      setCreating(false); setForm(previous => ({ ...previous, subject: '', text: '' })); requests.current.delete('create');
    }
    async function create(event) {
      event.preventDefault();
      const chosen = catalog.scopes.find(value => value.responsibilityScopeId === form.scopeId);
      if (!chosen) { setError('Выберите рабочую область.'); return; }
      const { legalEntityId, regionId, projectId, responsibilityScopeId } = chosen;
      const body = { department: form.department, kind: form.kind, subject: form.subject.trim(), text: form.text.trim(), scope: { legalEntityId, regionId, projectId, responsibilityScopeId } };
      await run(async current => {
        const result = await api('/communications/tickets', { method: 'POST', body: JSON.stringify({ ...body, idempotencyKey: keyFor('create', body) }) });
        if (!current()) return;
        requests.current.delete('create'); setForm(previous => ({ ...previous, subject: '', text: '' })); setCreating(false);
        setTickets(previous => mergeTickets(previous, [result]));
        selectedRef.current = result.id; setSelected(result.id); setTicket(result); setMessages([]); setOlder(null); stick.current = true;
        await loadThread(result.id, true); if (current()) setNotice('Обращение отправлено. Ответ появится в этом диалоге.');
      });
    }
    async function send(event) {
      event.preventDefault();
      const id = selectedRef.current, text = (drafts[id] || '').trim();
      if (!id || !text) return;
      await run(async current => {
        const result = await api(`${base(id)}/messages`, { method: 'POST', body: JSON.stringify({ text, idempotencyKey: keyFor(`message:${id}`, { text }) }) });
        if (!current()) return;
        requests.current.delete(`message:${id}`); setDrafts(previous => ({ ...previous, [id]: '' })); stick.current = true;
        if (selectedRef.current === id) setMessages(previous => mergeMessages(previous, [result]));
        await loadThread(id);
      });
    }
    async function performAction(event) {
      event.preventDefault();
      const id = ticket.id, body = { action, expectedVersion: ticket.version, ...(['resolve', 'escalate'].includes(action) ? { reason: reason.trim() } : {}) };
      await run(async current => {
        try {
          const result = await api(`${base(id)}/actions`, { method: 'POST', body: JSON.stringify({ ...body, idempotencyKey: keyFor(`action:${id}`, body) }) });
          if (!current()) return;
          setTicket(result); setTickets(previous => previous.map(item => item.id === id ? result : item)); setAction(null); setReason(''); requests.current.delete(`action:${id}`);
        } catch (err) { if (current() && err.status === 409) await loadThread(id); throw err; }
      });
    }
    const department = code => catalog?.departments.find(value => value.code === code)?.label || code;
    const visible = tickets.filter(item => !filter || `${item.subject} ${item.reference} ${item.requester.name} ${department(item.department)}`.toLocaleLowerCase('ru').includes(filter.toLocaleLowerCase('ru')));
    const thread = h('section', { className: 'driver-request-thread', 'aria-label': 'Диалог обращения' },
      button('← К списку', () => { selectedRef.current = ''; setSelected(''); setTicket(null); setMessages([]); setAction(null); setReason(''); }, { className: 'button driver-request-back', disabled: busy }),
      threadLoading ? h('p', { role: 'status' }, 'Загрузка диалога…') : ticket ? h(React.Fragment, null,
        h('header', { className: 'driver-request-thread-heading' },
          h('div', null, h('small', null, `${ticket.reference} · ${department(ticket.department)}`), h('h3', null, ticket.subject), h('p', null, `${ticket.requester.name}${ticket.assignee ? ` · Ответственный: ${ticket.assignee.name}` : ''}`)),
          h('span', { className: `driver-request-status is-${ticket.status}` }, statusName[ticket.status] || ticket.status)),
        h('div', { className: 'driver-request-actions' }, ...(ticket.actions || []).map(value => button(actionName[value] || value, () => { setAction(value); setReason(''); }, { key: value, disabled: busy }))),
        action && h('form', { className: 'driver-request-action-form', 'aria-label': actionName[action], onSubmit: performAction },
          h('strong', null, actionName[action]),
          ['resolve', 'escalate'].includes(action) && field(action === 'resolve' ? 'Результат решения' : 'Причина передачи', h('textarea', { value: reason, onChange: event => setReason(event.target.value), required: true, minLength: 3, maxLength: 500, rows: 3, disabled: busy })),
          h('div', { className: 'driver-request-actions' }, h('button', { className: 'button primary', disabled: busy, type: 'submit' }, 'Подтвердить'), button('Отмена', () => { setAction(null); setReason(''); }, { disabled: busy }))),
        h('div', { className: 'driver-request-messages', ref: scroll, role: 'log', 'aria-label': 'Сообщения обращения', 'aria-live': 'polite', onScroll: event => { const node = event.currentTarget; stick.current = node.scrollHeight - node.scrollTop - node.clientHeight < 100; } },
          older && button('Ранние сообщения', () => run(async current => {
            const node = scroll.current, previousHeight = node?.scrollHeight || 0, previousTop = node?.scrollTop || 0;
            const result = await api(`${base(ticket.id)}/messages?before=${encodeURIComponent(older)}`);
            if (!current()) return;
            stick.current = false; setMessages(previous => mergeMessages(result.messages, previous)); setOlder(result.hasMore ? result.nextBefore : null);
            requestAnimationFrame(() => { if (node) node.scrollTop = previousTop + node.scrollHeight - previousHeight; });
          }), { disabled: busy }),
          !messages.length && h('p', { className: 'driver-request-empty' }, 'Напишите сообщение по обращению.'),
          ...messages.map(message => h('article', { key: message.id, className: `driver-request-message${message.authorId === actor.id ? ' is-own' : ''}`, 'data-message-id': message.id },
            h('header', null, h('strong', null, message.authorName), h('time', { dateTime: message.createdAt }, dateLabel(message.createdAt))),
            h('p', null, message.text)))),
        ticket.canMessage ? h('form', { className: 'driver-request-composer', onSubmit: send, 'aria-label': 'Ответить на обращение' },
          field('Сообщение в обращение', h('textarea', { value: drafts[ticket.id] || '', onChange: event => setDrafts(previous => ({ ...previous, [ticket.id]: event.target.value })), placeholder: driver ? 'Напишите в отдел…' : 'Напишите ответ водителю…', maxLength: 3500, rows: 3, required: true, disabled: busy })),
          h('div', { className: 'driver-request-composer-footer' }, h('small', null, 'Ответы сохраняются в приложении.'), h('button', { type: 'submit', className: 'button primary', disabled: busy || !(drafts[ticket.id] || '').trim() }, busy ? 'Отправка…' : 'Отправить ответ')))
          : h('p', { className: 'driver-request-empty' }, ticket.status === 'resolved' ? 'Обращение решено. Для продолжения водитель может открыть его повторно.' : 'Переписка недоступна.'),
        ticket.history?.length > 0 && h('details', { className: 'driver-request-history' }, h('summary', null, 'История обращения'), ...ticket.history.map((event, index) => h('p', { key: event.id || index }, `${event.occurredAt ? dateLabel(event.occurredAt) + ' · ' : ''}${event.actor?.name || ''} · ${({ created: 'Обращение создано', take: 'Взято в работу', resolve: 'Решено', reopen: 'Открыто повторно', escalate: 'Передано администрации' })[event.action] || 'Изменение статуса'}${event.reason ? ': ' + event.reason : ''}`)))
      ) : h('div', { className: 'driver-request-empty' }, h('h3', null, 'Выберите обращение'), h('p', null, driver ? 'Переписка с отделом и его ответы появятся здесь.' : 'Здесь можно прочитать обращение водителя, ответить и отметить решение.')));
    return h('section', { className: `driver-requests${driver ? ' is-driver' : ''}${selected ? ' has-selected' : ''}` },
      h('header', { className: 'driver-requests-heading' }, h('div', null, h(driver ? 'h1' : 'h2', null, driver ? 'Связь с отделами' : 'Запросы водителей'), h('p', null, driver ? 'Пишите сотрудникам компании и получайте ответы прямо здесь.' : 'Обращения водителей во все доступные отделы компании.')), driver && button('Новое обращение', () => { setCreating(true); setError(''); }, { className: 'button primary', disabled: busy || loading || !catalog?.scopes.length })),
      error && h('div', { className: 'driver-request-error', role: 'alert' }, error, button('Обновить', () => run(async () => { await loadList(null, true); if (selectedRef.current) await loadThread(selectedRef.current, true); }))),
      notice && h('p', { className: 'driver-request-notice', role: 'status' }, notice),
      creating && catalog && h('form', { className: 'driver-request-new', 'aria-label': 'Новое обращение', onSubmit: create },
        h('h3', null, 'Новое обращение'),
        h('div', { className: 'driver-request-form-grid' },
          field('Отдел', h('select', { value: form.department, onChange: event => setForm(previous => ({ ...previous, department: event.target.value })), disabled: busy }, ...catalog.departments.map(value => h('option', { key: value.code, value: value.code }, value.label)))),
          field('Тип обращения', h('select', { value: form.kind, onChange: event => setForm(previous => ({ ...previous, kind: event.target.value })), disabled: busy }, ...Object.entries(kindName).map(([value, label]) => h('option', { key: value, value }, label)))),
          field('Тема обращения', h('input', { value: form.subject, onChange: event => setForm(previous => ({ ...previous, subject: event.target.value })), minLength: 3, maxLength: 140, required: true, disabled: busy }))),
        field('Текст обращения', h('textarea', { value: form.text, onChange: event => setForm(previous => ({ ...previous, text: event.target.value })), maxLength: 3500, required: true, rows: 4, disabled: busy })),
        h('div', { className: 'driver-request-actions' }, h('button', { type: 'submit', className: 'button primary', disabled: busy || form.subject.trim().length < 3 || !form.text.trim() }, busy ? 'Отправка…' : 'Отправить обращение'), button('Отмена', closeCreation, { disabled: busy }))),
      loading ? h('p', { role: 'status' }, 'Загрузка обращений…') : h('div', { className: 'driver-requests-layout' },
        h('aside', { className: 'driver-request-list', 'aria-label': 'Список обращений' }, field('Поиск обращений', h('input', { type: 'search', value: filter, onChange: event => setFilter(event.target.value), placeholder: 'Тема, водитель или отдел' })),
          !visible.length && h('p', { className: 'driver-request-empty' }, filter ? 'По запросу ничего не найдено.' : driver ? 'У вас пока нет обращений.' : `Нет доступных обращений водителей. Здесь отображаются только обращения, отправленные из учётных записей водителей. Сотрудники видят запросы своих отделов, администратор — все доступные обращения.${actor.role === 'access_admin' ? ' Для проверки войдите от имени водителя через раздел «Сотрудники».' : ''}`),
          ...visible.map(item => button(h(React.Fragment, null, h('span', { className: 'driver-request-list-meta' }, item.reference, h('span', { className: `driver-request-status is-${item.status}` }, statusName[item.status] || item.status)), h('strong', null, item.subject), h('span', null, driver ? department(item.department) : item.requester.name), h('small', null, `${driver ? '' : department(item.department) + ' · '}${dateLabel(item.updatedAt)}`), drafts[item.id]?.trim() && h('small', { className: 'driver-request-draft' }, 'Черновик')), () => open(item.id), { key: item.id, className: `driver-request-item${selected === item.id ? ' is-active' : ''}`, 'aria-pressed': selected === item.id, disabled: busy })),
          cursor && button('Ещё обращения', () => run(() => loadList(cursor)), { disabled: busy })), thread));
  }
  function DriverRequests(props) { return h(Panel, { ...props, driver: false, key: `${props.actor.id}:${props.scopeId}` }); }
  function DriverCommunications(props) { return h(Panel, { ...props, driver: true, key: props.actor.id }); }
  return { DriverRequests, DriverCommunications };
}
