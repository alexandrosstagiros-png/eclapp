// SPDX-License-Identifier: MIT
// Native tenders workspace. All customers, cards and history come from the API.
const STAGES = [['planned', 'Запланировано'], ['in_progress', 'В работе'], ['awaiting_decision', 'Ждём решения'], ['won', 'Выиграно'], ['closed', 'Закрыто']];
const DELIVERY = [['', 'Не уточнён'], ['city', 'Городская'], ['crew', 'Экипажная']];
const KINDS = [['tender', 'Тендер'], ['negotiation', 'Переговоры'], ['expansion', 'Расширение проекта']];
const TABLE_COLUMNS = [['customer', 'Заказчик / тендер'], ['status', 'Статус'], ['vehicleCount', 'Количество авто'], ['requirements', 'Требования'], ['lastComment', 'Последний комментарий'], ['deliveryType', 'Тип доставки'], ['expectedLaunch', 'Запуск'], ['nextStep', 'Следующий шаг'], ['nextStepDue', 'Срок следующего шага'], ['submissionDeadline', 'Дедлайн подачи'], ['kind', 'Тип работы']];
const DEFAULT_COLUMNS = ['customer', 'status', 'vehicleCount', 'requirements', 'lastComment', 'deliveryType', 'expectedLaunch'];
const preferencesKey = (actorId) => actorId ? `office:tenders:view:v1:${encodeURIComponent(actorId)}` : null;
const readPreferences = (actorId) => {
  const defaults = { ownerId: actorId || '', view: 'board', columns: [...DEFAULT_COLUMNS], scopeId: '', storageError: false };
  if (!actorId || typeof window === 'undefined') return defaults;
  try {
    const saved = JSON.parse(window.localStorage.getItem(preferencesKey(actorId)) || 'null');
    if (saved?.version !== 1 || !Array.isArray(saved.columns)) return defaults;
    return { ...defaults, view: saved.view === 'table' ? 'table' : 'board', columns: TABLE_COLUMNS.filter(([id]) => id === 'customer' || saved.columns.includes(id)).map(([id]) => id), scopeId: typeof saved.scopeId === 'string' && saved.scopeId.length <= 100 ? saved.scopeId : '' };
  } catch { return { ...defaults, storageError: true }; }
};
const FIELDS = {
  customerId: 'Заказчик', title: 'Название', status: 'Статус', vehicleCount: 'Количество авто', requirements: 'Требования',
  deliveryType: 'Тип доставки', expectedLaunch: 'Ожидаемый запуск', launchNotes: 'Уточнение запуска', submissionDeadline: 'Дедлайн подачи',
  nextStep: 'Следующий шаг', nextStepDue: 'Срок следующего шага', kind: 'Тип проекта', closeReason: 'Причина закрытия', winReason: 'Результат победы',
};
const emptyData = () => ({ customers: [], tenders: [], events: [] });
const nameOf = (options, value) => options.find(([id]) => id === value)?.[1] || value || 'Не указано';
const dateLabel = (value, time = false) => {
  if (!value) return 'Не указана';
  const date = new Date(time ? value : `${String(value).slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? 'Дата не распознана' : new Intl.DateTimeFormat('ru-RU', time ? { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
};
const localToday = () => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; };
const scopeLabel = (scope) => [scope.projectName, scope.regionName, scope.scopeName].filter(Boolean).join(' · ') || 'Проект';
const normalized = (value) => String(value || '').toLocaleLowerCase('ru').trim();
// Preserve the API's database order when timestamps collapse to the same millisecond.
const sortEvents = (events) => [...events].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
const serializeItem = (item) => Object.fromEntries(['id', 'responsibilityScopeId', 'version', ...Object.keys(FIELDS)].map((key) => [key, item[key]]));
const newItem = (scopeId) => ({ id: crypto.randomUUID(), responsibilityScopeId: scopeId, version: 0, customerId: '', title: '', status: 'planned', vehicleCount: '', requirements: '', deliveryType: '', expectedLaunch: null, launchNotes: '', submissionDeadline: null, nextStep: '', nextStepDue: null, kind: 'tender', closeReason: '', winReason: '' });

export function createTendersWorkspace(React, { request }) {
  const { createElement: h, useState, useEffect, useMemo, useRef } = React;
  const button = (label, onClick, props = {}) => h('button', { type: 'button', className: 'button', onClick, ...props }, label);
  const field = (label, input, hint, wide = false) => h('label', { className: `tenders-field${wide ? ' is-wide' : ''}` }, h('span', null, label), React.cloneElement(input, { 'aria-label': input.props['aria-label'] || label }), hint && h('small', null, hint));
  const details = (rows) => h('dl', { className: 'tenders-details' }, ...rows.map(([label, value]) => h('div', { key: label }, h('dt', null, label), h('dd', null, value || 'Не указано'))));

  function Dialog({ title, subtitle, onClose, children, busy, compact = false }) {
    const ref = useRef(null), callbacks = useRef({ onClose, busy });
    callbacks.current = { onClose, busy };
    useEffect(() => {
      const previous = document.activeElement, element = ref.current;
      element?.querySelector('input, select, textarea, button')?.focus();
      const keys = (event) => {
        if (event.key === 'Escape' && !callbacks.current.busy) { event.preventDefault(); callbacks.current.onClose(); }
        if (event.key === 'Tab') {
          const nodes = [...element.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]')].filter((node) => node.offsetParent !== null);
          const first = nodes[0], last = nodes[nodes.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }
      };
      element?.addEventListener('keydown', keys);
      return () => { element?.removeEventListener('keydown', keys); if (previous?.isConnected) previous.focus?.(); };
    }, []);
    return h('div', { className: 'tenders-overlay' }, h('section', { ref, role: 'dialog', 'aria-modal': true, 'aria-labelledby': 'tenders-dialog-title', className: `tenders-dialog${compact ? ' is-compact' : ''}` },
      h('header', { className: 'tenders-dialog-heading' }, h('div', null, subtitle && h('p', { className: 'tenders-eyebrow' }, subtitle), h('h2', { id: 'tenders-dialog-title' }, title)), button('Закрыть', onClose, { disabled: busy, 'aria-label': 'Закрыть окно' })), children));
  }

  return function TendersWorkspace({ token, actor, onExpired, onDirtyChange }) {
    const [scopes, setScopes] = useState([]), [scopeId, setScopeId] = useState(''), [contextLoading, setContextLoading] = useState(true), [contextError, setContextError] = useState(''), [contextKey, setContextKey] = useState(0);
    const [data, setData] = useState(emptyData), [loading, setLoading] = useState(false), [loaded, setLoaded] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
    const [preferences, setPreferences] = useState(() => readPreferences(actor?.id)), [collection, setCollection] = useState('active'), [columnsOpen, setColumnsOpen] = useState(false), [commentingId, setCommentingId] = useState(null);
    const [query, setQuery] = useState(''), [selectedId, setSelectedId] = useState(null), [historyMode, setHistoryMode] = useState('tender');
    const [form, setForm] = useState(null), [formError, setFormError] = useState(''), [conflict, setConflict] = useState(null), [busy, setBusy] = useState('');
    const [comments, setComments] = useState({}), [commentErrors, setCommentErrors] = useState({});
    const alive = useRef(true), busyRef = useRef(false), scopeRef = useRef(scopeId), callbacks = useRef({ onExpired, onDirtyChange }), loadGeneration = useRef(0), dataRef = useRef(data), columnsButton = useRef(null), deepLink = useRef({ ownerId: actor?.id || '', applied: false });
    callbacks.current = { onExpired, onDirtyChange }; scopeRef.current = scopeId; dataRef.current = data;
    const formDirty = Boolean(form && (form.mode !== 'edit' ? Object.keys(FIELDS).some((key) => form.value[key] !== form.original[key]) || form.customerName.trim() : Object.keys(FIELDS).some((key) => form.value[key] !== form.original[key])));
    const dirty = formDirty || Object.values(comments).some((draft) => draft.text.trim());
    const customerName = (id, source = data) => source.customers.find((customer) => customer.id === id)?.name || 'Заказчик недоступен';
    const selected = data.tenders.find((item) => item.id === selectedId);
    const currentScope = scopes.find((scope) => scope.responsibilityScopeId === scopeId);
    const failMessage = (reason) => reason?.status === 401 ? 'Сессия завершена. Войдите снова.' : reason?.status === 403 ? 'Доступ к тендерам этой области закрыт. Обратитесь к администратору.' : reason?.message || 'Не удалось выполнить действие. Проверьте соединение и попробуйте снова.';
    const expire = (reason) => { if (reason?.status === 401) callbacks.current.onExpired?.(); };
    const currentPreferences = preferences.ownerId === (actor?.id || '') ? preferences : readPreferences(actor?.id);
    const view = currentPreferences.view, visibleColumns = TABLE_COLUMNS.filter(([id]) => currentPreferences.columns.includes(id));
    const setView = (next) => { setPreferences((current) => ({ ...(current.ownerId === (actor?.id || '') ? current : readPreferences(actor?.id)), view: next })); setColumnsOpen(false); };
    const setColumns = (next) => setPreferences((current) => ({ ...(current.ownerId === (actor?.id || '') ? current : readPreferences(actor?.id)), columns: TABLE_COLUMNS.filter(([id]) => id === 'customer' || next.includes(id)).map(([id]) => id) }));
    const closeColumns = () => { setColumnsOpen(false); columnsButton.current?.focus(); };

    useEffect(() => { alive.current = true; return () => { alive.current = false; loadGeneration.current += 1; callbacks.current.onDirtyChange?.(false); }; }, []);
    useEffect(() => { setPreferences(readPreferences(actor?.id)); setColumnsOpen(false); setCollection('active'); setQuery(''); }, [actor?.id]);
    useEffect(() => {
      if (!actor?.id || preferences.ownerId !== actor.id) return;
      try {
        window.localStorage.setItem(preferencesKey(actor.id), JSON.stringify({ version: 1, view: preferences.view, columns: preferences.columns, scopeId: preferences.scopeId }));
        if (preferences.storageError) setPreferences((current) => ({ ...current, storageError: false }));
      }
      catch { if (!preferences.storageError) setPreferences((current) => ({ ...current, storageError: true })); }
    }, [actor?.id, preferences]);
    useEffect(() => { callbacks.current.onDirtyChange?.(dirty || Boolean(busy)); }, [dirty, busy]);
    useEffect(() => {
      const prevent = (event) => { if (dirty || busyRef.current) { event.preventDefault(); event.returnValue = ''; } };
      window.addEventListener('beforeunload', prevent);
      return () => window.removeEventListener('beforeunload', prevent);
    }, [dirty]);
    useEffect(() => {
      const controller = new AbortController();
      const ownerId = actor?.id || '';
      if (deepLink.current.ownerId !== ownerId) deepLink.current = { ownerId, applied: false };
      const requestedScope = !deepLink.current.applied ? new URLSearchParams(window.location.search).get('responsibilityScopeId') : null;
      const preferredScope = currentPreferences.scopeId;
      setContextLoading(true); setContextError(''); setScopes([]); setScopeId(''); setData(emptyData()); setLoaded(false); setError('');
      setForm(null); setConflict(null); setFormError(''); setComments({}); setCommentErrors({}); setSelectedId(null); setCommentingId(null); setNotice('');
      request('/tenders/context', { signal: controller.signal }, token).then((result) => {
        if (controller.signal.aborted) return;
        if (!Array.isArray(result?.scopes)) throw new Error('Сервер не вернул список доступных областей. Повторите загрузку.');
        const available = (id) => id && result.scopes.some((scope) => scope.responsibilityScopeId === id);
        const nextScope = available(requestedScope) ? requestedScope : available(preferredScope) ? preferredScope : result.scopes[0]?.responsibilityScopeId || '';
        deepLink.current.applied = true;
        setScopes(result.scopes); setScopeId(nextScope);
        setPreferences((current) => ({ ...(current.ownerId === ownerId ? current : readPreferences(actor?.id)), scopeId: nextScope }));
      }).catch((reason) => { if (!controller.signal.aborted) { setContextError(failMessage(reason)); expire(reason); } }).finally(() => { if (!controller.signal.aborted) setContextLoading(false); });
      return () => controller.abort();
    }, [token, contextKey, actor?.id]);

    async function loadData(targetScope, signal) {
      const generation = ++loadGeneration.current;
      const result = await request(`/tenders?responsibilityScopeId=${encodeURIComponent(targetScope)}`, { signal }, token);
      if (!Array.isArray(result?.customers) || !Array.isArray(result?.tenders) || !Array.isArray(result?.events)) throw new Error('Сервер вернул неполные данные тендеров. Повторите загрузку.');
      if (alive.current && !signal?.aborted && generation === loadGeneration.current && scopeRef.current === targetScope) { setData(result); dataRef.current = result; setLoaded(true); }
      return result;
    }
    useEffect(() => {
      if (!scopeId) return;
      const controller = new AbortController();
      setData(emptyData()); setLoaded(false); setLoading(true); setError(''); setNotice('');
      loadData(scopeId, controller.signal).catch((reason) => { if (!controller.signal.aborted) { setError(failMessage(reason)); expire(reason); } }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
      return () => controller.abort();
    }, [scopeId, token]);

    async function refresh() {
      if (busyRef.current || loading || !scopeId) return;
      setLoading(true); setError('');
      try { await loadData(scopeId); } catch (reason) { if (alive.current) { setError(failMessage(reason)); expire(reason); } } finally { if (alive.current) setLoading(false); }
    }
    async function refreshAfterSave(targetScope) {
      try { await loadData(targetScope); } catch (reason) { if (alive.current && scopeRef.current === targetScope) { setError(`Изменение сохранено, но не удалось обновить доску и историю. ${failMessage(reason)}`); expire(reason); } }
    }
    const chooseScope = (next) => {
      if (busyRef.current || next === scopeId) return;
      if (dirty && !window.confirm('Есть несохранённые изменения и комментарии. Сменить область и удалить эти черновики?')) return;
      setScopeId(next); setForm(null); setConflict(null); setFormError(''); setComments({}); setCommentErrors({}); setSelectedId(null); setCommentingId(null); setQuery('');
      setPreferences((current) => ({ ...current, scopeId: next }));
    };
    const closeForm = () => {
      if (busyRef.current) return;
      if (formDirty && !window.confirm('Закрыть окно и удалить несохранённый черновик?')) return;
      setForm(null); setFormError(''); setConflict(null);
    };
    const openForm = (item) => {
      const value = item ? serializeItem(item) : newItem(scopeId);
      setForm({ mode: item ? 'edit' : 'new', value, original: { ...value }, customerMode: data.customers.length ? 'existing' : 'new', customerName: '', newCustomerId: crypto.randomUUID() });
      setFormError(''); setConflict(null);
    };
    const changeForm = (key, value) => setForm((current) => ({ ...current, value: { ...current.value, [key]: value } }));
    const upsertLocal = (key, saved) => setData((current) => ({ ...current, [key]: current[key].some((item) => item.id === saved.id) ? current[key].map((item) => item.id === saved.id ? saved : item) : [...current[key], saved] }));

    async function saveForm(event, latestOverride) {
      event?.preventDefault();
      if (!form || busyRef.current || !loaded) return;
      if (conflict && !latestOverride) { setFormError('Сравните сохранённые значения и черновик, затем используйте кнопку «Сохранить мои изменения в свежую версию».'); return; }
      const currentForm = form, targetScope = scopeId;
      let submitted = serializeItem(currentForm.value);
      if (latestOverride) {
        const changed = Object.fromEntries(Object.keys(FIELDS).filter((key) => currentForm.value[key] !== currentForm.original[key]).map((key) => [key, currentForm.value[key]]));
        submitted = serializeItem({ ...latestOverride, ...changed, version: latestOverride.version });
      }
      if (!submitted.title?.trim()) { setFormError('Введите название тендера или проекта.'); return; }
      if (submitted.status === 'won' && !submitted.winReason?.trim()) { setFormError('Укажите результат: что выиграно и на каких условиях.'); return; }
      if (submitted.status === 'closed' && !submitted.closeReason?.trim()) { setFormError('Укажите причину закрытия.'); return; }
      if (currentForm.customerMode === 'new' && currentForm.mode === 'new' && !currentForm.customerName.trim()) { setFormError('Введите название заказчика.'); return; }
      if (!(currentForm.mode === 'new' && currentForm.customerMode === 'new') && !submitted.customerId) { setFormError('Выберите заказчика.'); return; }
      busyRef.current = true; setBusy('form'); setFormError(''); setError(''); setNotice('');
      let savingCustomer = false;
      try {
        if (currentForm.mode === 'new' && currentForm.customerMode === 'new') {
          const known = dataRef.current.customers.find((customer) => customer.id === currentForm.newCustomerId);
          if (known && known.name !== currentForm.customerName.trim()) throw new Error('Этот заказчик уже сохранён с другим названием. Выберите его из списка или заново откройте создание тендера. Черновик сохранён.');
          if (known) submitted.customerId = known.id;
          else {
            savingCustomer = true;
            const customer = await request('/tenders/customers', { method: 'PUT', body: JSON.stringify({ id: currentForm.newCustomerId, responsibilityScopeId: targetScope, version: 0, name: currentForm.customerName.trim() }) }, token);
            if (!alive.current || scopeRef.current !== targetScope) return;
            upsertLocal('customers', customer); submitted.customerId = customer.id; savingCustomer = false;
          }
          // Retain the saved customer on a tender retry; never create a second customer.
          setForm((current) => current ? { ...current, value: { ...current.value, customerId: submitted.customerId }, original: { ...current.original, customerId: submitted.customerId }, customerMode: 'existing' } : current);
        }
        const saved = await request('/tenders/items', { method: 'PUT', body: JSON.stringify(submitted) }, token);
        if (!alive.current || scopeRef.current !== targetScope) return;
        upsertLocal('tenders', saved); setForm(null); setConflict(null); setNotice(currentForm.mode === 'new' ? 'Тендер добавлен.' : 'Изменения сохранены.');
        await refreshAfterSave(targetScope);
      } catch (reason) {
        if (!alive.current || scopeRef.current !== targetScope) return;
        expire(reason);
        if (reason?.status === 409) {
          try {
            const fresh = await loadData(targetScope);
            if (!alive.current || scopeRef.current !== targetScope) return;
            const latest = fresh.tenders.find((item) => item.id === submitted.id);
            if (savingCustomer) {
              const customer = fresh.customers.find((item) => item.id === currentForm.newCustomerId);
              if (customer && customer.name === currentForm.customerName.trim()) {
                setForm((current) => current ? { ...current, value: { ...current.value, customerId: customer.id }, original: { ...current.original, customerId: customer.id }, customerMode: 'existing' } : current);
                setFormError('Заказчик уже сохранён. Черновик тендера сохранён в окне — нажмите «Сохранить» ещё раз.');
              } else setFormError(`Не удалось сохранить заказчика. ${failMessage(reason)} Черновик оставлен в окне.`);
            } else if (latest) {
              setConflict(latest); setFormError('Эту карточку уже изменили. Доска обновлена, ваш черновик сохранён в окне. Сравните значения ниже перед сохранением.');
            } else setFormError('Карточка больше недоступна или изменились права. Доска обновлена, черновик сохранён в окне.');
          } catch (refreshReason) { setFormError(`Обнаружен конфликт, но загрузить свежую карточку не удалось. Черновик сохранён — повторите сохранение после восстановления соединения. ${failMessage(refreshReason)}`); expire(refreshReason); }
        } else setFormError(failMessage(reason));
      } finally { busyRef.current = false; if (alive.current) setBusy(''); }
    }

    async function changeStatus(item, status) {
      if (status === item.status || busyRef.current) return;
      if (status === 'won' || status === 'closed') {
        setForm({ mode: 'status', value: { ...serializeItem(item), status }, original: serializeItem(item), customerMode: 'existing', customerName: '' }); setConflict(null); setFormError(''); return;
      }
      const targetScope = scopeId;
      busyRef.current = true; setBusy(item.id); setError(''); setNotice('');
      try {
        const saved = await request('/tenders/items', { method: 'PUT', body: JSON.stringify({ ...serializeItem(item), status }) }, token);
        if (!alive.current || scopeRef.current !== targetScope) return;
        upsertLocal('tenders', saved); setNotice(`«${item.title}»: ${nameOf(STAGES, status)}.`); await refreshAfterSave(targetScope);
      } catch (reason) {
        if (!alive.current || scopeRef.current !== targetScope) return;
        if (reason?.status === 409) {
          try { await loadData(targetScope); setError('Карточку изменил другой сотрудник. Доска обновлена. Проверьте актуальные данные и снова выберите нужный статус.'); }
          catch (refreshReason) { setError(`Карточка изменилась, но обновить доску не удалось. Статус не изменён. ${failMessage(refreshReason)}`); expire(refreshReason); }
        } else setError(failMessage(reason));
        expire(reason);
      } finally { busyRef.current = false; if (alive.current) setBusy(''); }
    }

    function changeComment(id, text) {
      setComments((current) => ({ ...current, [id]: { text, id: current[id]?.id || crypto.randomUUID(), sentText: current[id]?.sentText } }));
      setCommentErrors((current) => ({ ...current, [id]: '' }));
    }
    async function addComment(event, item) {
      event.preventDefault();
      const draft = comments[item.id];
      if (!draft?.text.trim() || busyRef.current) return;
      const targetScope = scopeId;
      // Keep this UUID and exact payload after an uncertain network result.
      const text = draft.sentText ?? draft.text.trim();
      setComments((current) => ({ ...current, [item.id]: { ...draft, sentText: text } }));
      busyRef.current = true; setBusy(`comment:${item.id}`); setCommentErrors((current) => ({ ...current, [item.id]: '' })); setError(''); setNotice('');
      try {
        const saved = await request('/tenders/comments', { method: 'POST', body: JSON.stringify({ id: draft.id, tenderId: item.id, responsibilityScopeId: targetScope, text }) }, token);
        if (!alive.current || scopeRef.current !== targetScope) return;
        upsertLocal('events', saved); setComments((current) => { const next = { ...current }; delete next[item.id]; return next; }); setCommentingId((current) => current === item.id ? null : current); setNotice('Комментарий добавлен.');
        await refreshAfterSave(targetScope);
      } catch (reason) {
        if (!alive.current || scopeRef.current !== targetScope) return;
        const uncertain = !reason?.status || reason.status >= 500;
        if (!uncertain) setComments((current) => ({ ...current, [item.id]: { ...draft, id: reason.status === 409 ? crypto.randomUUID() : draft.id, sentText: undefined } }));
        setCommentErrors((current) => ({ ...current, [item.id]: `${failMessage(reason)} ${uncertain ? 'Текст сохранён. Повторная отправка не создаст копию комментария.' : 'Текст оставлен в поле — его можно исправить и отправить снова.'}` })); expire(reason);
        if (reason?.status === 409) {
          try { await loadData(targetScope); }
          catch (refreshReason) { if (alive.current) setError(`Не удалось обновить историю после конфликта. ${failMessage(refreshReason)}`); expire(refreshReason); }
        }
      } finally { busyRef.current = false; if (alive.current) setBusy(''); }
    }

    const filtered = useMemo(() => {
      const needle = normalized(query);
      return data.tenders.filter((item) => !needle || [item.title, item.vehicleCount, item.requirements, item.nextStep, data.customers.find((customer) => customer.id === item.customerId)?.name].some((value) => normalized(value).includes(needle)))
        .sort((a, b) => String(a.nextStepDue || '9999').localeCompare(String(b.nextStepDue || '9999')) || String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
    }, [data, query]);
    const lastComments = useMemo(() => { const result = {}; for (const event of sortEvents(data.events)) if (event.type === 'comment') result[event.tenderId] = event; return result; }, [data.events]);
    const importedNotes = useMemo(() => { const result = {}; for (const event of sortEvents(data.events)) if (event.type === 'import') result[event.tenderId] = event; return result; }, [data.events]);
    const commentBox = (item) => {
      const draft = comments[item.id], retry = draft?.sentText != null;
      return h('form', { className: 'tenders-comment-form', onSubmit: (event) => addComment(event, item) },
        h('label', { className: 'tenders-field' }, h('span', null, 'Новый комментарий'), h('textarea', { 'aria-label': `Новый комментарий: ${item.title}`, rows: 2, maxLength: 4000, value: draft?.text || '', disabled: Boolean(busy) || retry, placeholder: 'Что сделано или о чём договорились…', onChange: (event) => changeComment(item.id, event.target.value) })),
        retry && h('small', { className: 'tenders-muted' }, 'Текст зафиксирован для безопасной повторной отправки.'),
        commentErrors[item.id] && h('p', { role: 'alert', className: 'tenders-error' }, commentErrors[item.id]),
        h('button', { type: 'submit', className: 'button tenders-comment-submit', disabled: Boolean(busy) || !draft?.text.trim() }, busy === `comment:${item.id}` ? 'Отправляем…' : retry ? 'Повторить отправку' : 'Добавить комментарий'));
    };
    const card = (item) => {
      const comment = lastComments[item.id] || importedNotes[item.id], imported = comment?.type === 'import', overdue = item.nextStepDue && item.nextStepDue < localToday() && !['won', 'closed'].includes(item.status);
      return h('article', { className: 'tenders-card', key: item.id, 'aria-label': `${customerName(item.customerId)}: ${item.title}` },
        h('div', { className: 'tenders-card-heading' }, h('span', { className: 'tenders-card-kind' }, nameOf(KINDS, item.kind)), h('button', { className: 'tenders-customer-button', type: 'button', onClick: () => { setSelectedId(item.id); setHistoryMode('customer'); } }, customerName(item.customerId)), h('button', { className: 'tenders-title-button', type: 'button', onClick: () => { setSelectedId(item.id); setHistoryMode('tender'); } }, item.title)),
        field('Статус', h('select', { value: item.status, disabled: Boolean(busy) || loading, onChange: (event) => changeStatus(item, event.target.value), 'aria-label': `Статус: ${item.title}` }, ...STAGES.map(([id, label]) => h('option', { key: id, value: id }, label)))),
        h('div', { className: 'tenders-demand' }, h('strong', null, item.vehicleCount ? `${item.vehicleCount} авто` : 'Количество авто не уточнено'), h('p', null, item.requirements || 'Требования не указаны')),
        h('div', { className: 'tenders-card-facts' }, h('span', null, nameOf(DELIVERY, item.deliveryType)), h('span', null, `Запуск: ${item.expectedLaunch ? dateLabel(item.expectedLaunch) : item.launchNotes || 'не уточнён'}`)),
        item.submissionDeadline && h('p', { className: 'tenders-deadline' }, `Подать заявку до ${dateLabel(item.submissionDeadline)}`),
        (item.nextStep || item.nextStepDue) && h('div', { className: `tenders-next-step${overdue ? ' is-overdue' : ''}` }, h('span', null, 'Следующий шаг'), h('p', null, item.nextStep || 'Шаг не указан'), item.nextStepDue && h('small', null, `${overdue ? 'Просрочено · ' : ''}${dateLabel(item.nextStepDue)}`)),
        item.status === 'won' && item.winReason && h('p', { className: 'tenders-result' }, item.winReason),
        item.status === 'closed' && item.closeReason && h('p', { className: 'tenders-result' }, `Причина: ${item.closeReason}`),
        h('div', { className: 'tenders-last-comment' }, h('span', null, imported ? 'Исходная заметка · дата неизвестна' : 'Последний комментарий'), comment ? h(React.Fragment, null, h('p', null, comment.text), h('small', null, imported ? `Перенесено ${dateLabel(comment.createdAt, true)}` : `${comment.actorName || 'Сотрудник'} · ${dateLabel(comment.createdAt, true)}`)) : h('p', { className: 'tenders-muted' }, 'Комментариев пока нет')),
        commentBox(item), h('button', { type: 'button', className: 'tenders-text-button', onClick: () => { setSelectedId(item.id); setHistoryMode('tender'); } }, 'Карточка и история →'));
    };

    function tableCell(item, column) {
      if (column === 'customer') return h('div', { className: 'tenders-table-customer' },
        h('button', { className: 'tenders-customer-button', type: 'button', onClick: () => { setSelectedId(item.id); setHistoryMode('customer'); } }, customerName(item.customerId)),
        h('button', { className: 'tenders-title-button', type: 'button', onClick: () => { setSelectedId(item.id); setHistoryMode('tender'); } }, item.title),
        h('button', { type: 'button', className: 'tenders-text-button', onClick: () => { setSelectedId(item.id); setHistoryMode('tender'); } }, 'Карточка и история →'));
      if (column === 'status') return h('select', { value: item.status, disabled: Boolean(busy) || loading, onChange: (event) => changeStatus(item, event.target.value), 'aria-label': `Статус: ${item.title}` }, ...STAGES.map(([id, label]) => h('option', { key: id, value: id }, label)));
      if (column === 'lastComment') {
        const comment = lastComments[item.id] || importedNotes[item.id], imported = comment?.type === 'import', editing = commentingId === item.id || Boolean(comments[item.id]?.text);
        return h('div', { className: 'tenders-table-comment' }, comment ? h('div', { className: 'tenders-last-comment' }, imported && h('span', null, 'Исходная заметка · дата неизвестна'), h('p', null, comment.text), h('small', null, imported ? `Перенесено ${dateLabel(comment.createdAt, true)}` : `${comment.actorName || 'Сотрудник'} · ${dateLabel(comment.createdAt, true)}`)) : h('span', { className: 'tenders-muted' }, 'Комментариев пока нет'),
          editing ? commentBox(item) : button('Написать комментарий', () => setCommentingId(item.id), { className: 'tenders-text-button', 'aria-label': `Написать комментарий: ${item.title}`, disabled: Boolean(busy) }));
      }
      if (column === 'deliveryType') return nameOf(DELIVERY, item.deliveryType);
      if (column === 'kind') return nameOf(KINDS, item.kind);
      if (column === 'expectedLaunch') return h('div', { className: 'tenders-table-launch' }, h('span', null, item.expectedLaunch ? dateLabel(item.expectedLaunch) : 'Не уточнён'), item.launchNotes && h('small', null, item.launchNotes));
      if (column === 'nextStepDue') return h('span', { className: item.nextStepDue && item.nextStepDue < localToday() && !['won', 'closed'].includes(item.status) ? 'tenders-table-overdue' : '' }, item.nextStepDue ? dateLabel(item.nextStepDue) : 'Не указан');
      if (column === 'submissionDeadline') return item.submissionDeadline ? dateLabel(item.submissionDeadline) : 'Не указан';
      return item[column] || 'Не указано';
    }

    function renderTable() {
      const items = filtered.filter((item) => collection === 'closed' ? item.status === 'closed' : item.status !== 'closed');
      return h('div', { className: 'tenders-table-wrap', role: 'region', 'aria-label': 'Таблица тендеров: прокручивается по горизонтали', tabIndex: 0 },
        h('table', { className: 'tenders-table', 'aria-label': 'Тендеры' },
          h('caption', null, `${collection === 'closed' ? 'Закрытые' : 'Активные'} тендеры: ${items.length}`),
          h('thead', null, h('tr', null, ...visibleColumns.map(([id, label]) => h('th', { key: id, scope: 'col', className: `tenders-table-col-${id}` }, label)))),
          h('tbody', null, items.length ? items.map((item) => h('tr', { key: item.id, 'aria-label': `${customerName(item.customerId)}: ${item.title}` }, ...visibleColumns.map(([id]) => h('td', { key: id, className: `tenders-table-col-${id}` }, tableCell(item, id))))) : h('tr', null, h('td', { colSpan: visibleColumns.length, className: 'tenders-table-empty' }, query ? 'Тендеров по этому запросу нет.' : collection === 'closed' ? 'Закрытых тендеров пока нет.' : 'Активных тендеров пока нет.')))));
    }

    function renderColumns() {
      if (view !== 'table' || !columnsOpen) return null;
      return h('section', { id: 'tenders-columns-panel', className: 'tenders-columns-panel', role: 'region', 'aria-label': 'Настройка колонок', onKeyDown: (event) => { if (event.key === 'Escape') { event.preventDefault(); closeColumns(); } } },
        h('div', { className: 'tenders-columns-heading' }, h('div', null, h('h2', null, 'Колонки таблицы'), h('p', null, 'Выберите, что показывать. Настройка сохранится для вашего пользователя в этом браузере.')), button('Готово', closeColumns)),
        h('div', { className: 'tenders-columns-options' }, ...TABLE_COLUMNS.map(([id, label]) => h('label', { key: id, className: 'tenders-column-choice' }, h('input', { type: 'checkbox', checked: currentPreferences.columns.includes(id), disabled: id === 'customer', 'aria-label': label, onChange: (event) => setColumns(event.target.checked ? [...currentPreferences.columns, id] : currentPreferences.columns.filter((column) => column !== id)) }), h('span', null, label, id === 'customer' && h('small', null, 'Всегда виден'))))),
        button('По умолчанию', () => setColumns(DEFAULT_COLUMNS), { className: 'tenders-text-button' }));
    }

    function renderForm() {
      if (!form) return null;
      const value = form.value, statusOnly = form.mode === 'status';
      const text = (key, options = {}) => h('input', { type: 'text', value: value[key] || '', onChange: (event) => changeForm(key, event.target.value), ...options });
      const area = (key, maxLength, rows = 3) => h('textarea', { value: value[key] || '', onChange: (event) => changeForm(key, event.target.value), maxLength, rows });
      const select = (key, options) => h('select', { value: value[key] || '', onChange: (event) => changeForm(key, event.target.value) }, ...options.map(([id, label]) => h('option', { key: id, value: id }, label)));
      const date = (key) => text(key, { type: 'date', onChange: (event) => changeForm(key, event.target.value || null) });
      const showValue = (key, val) => key === 'customerId' ? customerName(val) : key === 'status' ? nameOf(STAGES, val) : key === 'deliveryType' ? nameOf(DELIVERY, val) : key === 'kind' ? nameOf(KINDS, val) : val || 'Не указано';
      const conflicts = conflict ? Object.keys(FIELDS).filter((key) => value[key] !== form.original[key] && value[key] !== conflict[key]) : [];
      return h(Dialog, { title: statusOnly ? nameOf(STAGES, value.status) : form.mode === 'new' ? 'Новый тендер' : 'Редактировать тендер', subtitle: statusOnly ? `${customerName(value.customerId)} · ${value.title}` : scopeLabel(currentScope || {}), onClose: closeForm, busy: Boolean(busy), compact: statusOnly },
        h('form', { onSubmit: (event) => saveForm(event) }, h('fieldset', { className: 'tenders-form-grid', disabled: Boolean(busy) },
          !statusOnly && h(React.Fragment, null,
            form.mode === 'new' && h('div', { className: 'tenders-segment is-wide', 'aria-label': 'Выбор заказчика' }, ...[['existing', 'Выбрать заказчика'], ['new', 'Новый заказчик']].map(([id, label]) => button(label, () => setForm((current) => ({ ...current, customerMode: id })), { key: id, 'aria-pressed': form.customerMode === id }))),
            form.mode === 'new' && form.customerMode === 'new'
              ? field('Название заказчика', h('input', { required: true, maxLength: 200, value: form.customerName, onChange: (event) => setForm((current) => ({ ...current, customerName: event.target.value })) }), 'Заказчик сохранится вместе с первым тендером.', true)
              : field('Заказчик', h('select', { required: true, value: value.customerId, onChange: (event) => changeForm('customerId', event.target.value) }, h('option', { value: '' }, 'Выберите заказчика'), ...data.customers.map((customer) => h('option', { key: customer.id, value: customer.id }, customer.name))), null, true),
            field('Название тендера или проекта', text('title', { required: true, maxLength: 200, placeholder: 'Доставка по Москве · осень' }), null, true),
            field('Тип проекта', select('kind', KINDS)), form.mode !== 'new' ? field('Статус', select('status', STAGES)) : h('p', { className: 'tenders-form-hint' }, 'Новая карточка появится в колонке «Запланировано».'),
            field('Количество авто', text('vehicleCount', { maxLength: 160, placeholder: 'Например, 10–15' })), field('Тип доставки', select('deliveryType', DELIVERY)),
            field('Требования к автомобилям и работе', area('requirements', 4000), 'Кузов, грузоподъёмность, график, география и другие условия.', true),
            field('Ожидаемый запуск', date('expectedLaunch')), field('Уточнение запуска', text('launchNotes', { maxLength: 1000, placeholder: 'Например, после согласования тарифа' })),
            field('Дедлайн подачи заявки', date('submissionDeadline')), field('Срок следующего шага', date('nextStepDue')),
            field('Следующий шаг', area('nextStep', 1000, 2), 'Один конкретный шаг: запросить тариф, отправить предложение, позвонить.', true)),
          value.status === 'won' && field('Что выиграно и на каких условиях', React.cloneElement(area('winReason', 1000), { required: true, placeholder: 'Подтверждённый объём, условия и дальнейшие договорённости' }), 'Победа в тендере и дата запуска учитываются отдельно.', true),
          value.status === 'closed' && field('Причина закрытия', React.cloneElement(area('closeReason', 1000), { required: true, placeholder: 'Проиграно, отменено или отказ от участия — укажите причину' }), null, true)),
          formError && h('div', { className: 'tenders-error tenders-dialog-message', role: 'alert' }, formError),
          conflict && h('section', { className: 'tenders-conflict', 'aria-label': 'Сравнение сохранённых данных и черновика' }, h('h3', null, 'Проверка изменений'),
            h('p', null, 'Изменённые вами поля можно сохранить поверх свежей версии. Остальные поля останутся как на сервере.'),
            conflicts.length ? h('div', { className: 'tenders-conflict-table' }, ...conflicts.map((key) => h('div', { key }, h('strong', null, FIELDS[key]), h('p', null, h('span', null, 'Сейчас: '), showValue(key, conflict[key])), h('p', null, h('span', null, 'Ваш вариант: '), showValue(key, value[key]))))) : h('p', null, 'Значения ваших изменённых полей уже совпадают с сохранёнными.'),
            button('Сохранить мои изменения в свежую версию', () => saveForm(null, conflict), { className: 'button tenders-primary', disabled: Boolean(busy) })),
          h('footer', { className: 'tenders-form-footer' }, button('Отмена', closeForm, { disabled: Boolean(busy) }), !conflict && h('button', { type: 'submit', className: 'button tenders-primary', disabled: Boolean(busy) }, busy === 'form' ? 'Сохраняем…' : 'Сохранить'))));
    }

    function renderDetail() {
      if (!selected || form) return null;
      const events = sortEvents(data.events.filter((event) => historyMode === 'customer' ? event.customerId === selected.customerId : event.tenderId === selected.id));
      return h(Dialog, { title: selected.title, subtitle: customerName(selected.customerId), onClose: () => { if (!busyRef.current) setSelectedId(null); }, busy: Boolean(busy) },
        h('div', { className: 'tenders-detail-body' },
          h('div', { className: 'tenders-detail-bar' }, h('span', { className: `tenders-stage-badge stage-${selected.status}` }, nameOf(STAGES, selected.status)), button('Редактировать', () => openForm(selected), { disabled: Boolean(busy) })),
          details([['Заказчик', customerName(selected.customerId)], ['Тип проекта', nameOf(KINDS, selected.kind)], ['Количество авто', selected.vehicleCount], ['Тип доставки', nameOf(DELIVERY, selected.deliveryType)], ['Требования', selected.requirements], ['Ожидаемый запуск', dateLabel(selected.expectedLaunch)], ['Уточнение запуска', selected.launchNotes], ['Дедлайн подачи', dateLabel(selected.submissionDeadline)], ['Следующий шаг', selected.nextStep], ['Срок следующего шага', dateLabel(selected.nextStepDue)], ...(selected.status === 'won' ? [['Результат победы', selected.winReason]] : []), ...(selected.status === 'closed' ? [['Причина закрытия', selected.closeReason]] : [])]),
          h('section', { className: 'tenders-history-section' }, h('h3', null, 'История работы'), h('div', { className: 'tenders-segment', 'aria-label': 'История работы' }, ...[['tender', 'Этот тендер'], ['customer', 'Весь заказчик']].map(([id, label]) => button(label, () => setHistoryMode(id), { key: id, 'aria-pressed': historyMode === id }))),
            h('p', { className: 'tenders-muted' }, 'От первых действий к последним.'),
            events.length ? h('ol', { className: 'tenders-history' }, ...events.map((event) => h('li', { key: event.id, className: event.type === 'comment' ? 'is-comment' : '' },
              h('div', null, h('strong', null, event.type === 'comment' ? 'Комментарий' : event.type === 'import' ? 'Импорт из Excel' : event.type === 'created' ? 'Создание карточки' : event.type === 'status' ? `Статус: ${nameOf(STAGES, event.fromStatus)} → ${nameOf(STAGES, event.toStatus)}` : 'Изменение карточки'), h('time', { dateTime: event.createdAt }, `${event.type === 'import' ? 'Перенесено ' : ''}${dateLabel(event.createdAt, true)}`)),
              event.type === 'import' && h('small', null, 'Исходная заметка · дата неизвестна'),
              event.text && h('p', null, event.text), h('small', null, `${event.type === 'import' ? 'Перенёс: ' : ''}${event.actorName || 'Сотрудник'}`, historyMode === 'customer' ? ` · ${data.tenders.find((item) => item.id === event.tenderId)?.title || 'Связанный тендер'}` : '')))) : h('p', { className: 'tenders-muted' }, 'История пока пуста.')),
          commentBox(selected)));
    }

    return h('main', { className: 'tenders-workspace' },
      h('header', { className: 'tenders-heading' }, h('div', null, h('span', { className: 'tenders-eyebrow' }, 'РАБОТА С ЗАКАЗЧИКАМИ'), h('h1', null, 'Тендеры'), h('p', null, 'Потребности, договорённости и следующий шаг — в одной карточке.')), h('div', { className: 'tenders-actions' }, button('Обновить', () => scopeId ? refresh() : setContextKey((key) => key + 1), { disabled: contextLoading || loading || Boolean(busy) }), button('+ Новый тендер', () => openForm(), { className: 'button tenders-primary', disabled: !scopeId || !loaded || loading || Boolean(busy) }))),
      contextLoading && h('div', { className: 'tenders-loading', role: 'status' }, 'Загружаем доступные проекты…'),
      contextError && h('div', { className: 'tenders-error', role: 'alert' }, contextError),
      !contextLoading && !contextError && !scopes.length && h('div', { className: 'tenders-empty' }, h('h2', null, 'Нет доступных областей ответственности'), h('p', null, actor?.role === 'access_admin' ? 'Добавьте область ответственности в администрировании и назначьте её тендерному специалисту.' : 'Попросите администратора назначить вам область ответственности. После назначения нажмите «Обновить».')),
      scopes.length > 0 && h(React.Fragment, null,
        h('div', { className: 'tenders-scope-row' }, field('Проект', h('select', { value: scopeId, disabled: Boolean(busy) || loading, onChange: (event) => chooseScope(event.target.value) }, ...scopes.map((scope) => h('option', { key: scope.responsibilityScopeId, value: scope.responsibilityScopeId }, scopeLabel(scope))))), h('p', null, 'У одного заказчика может быть несколько тендеров. Статус и комментарии меняются в канбане и таблице.')),
        error && h('div', { className: 'tenders-error', role: 'alert' }, error), notice && h('div', { className: 'tenders-notice', role: 'status' }, notice),
        h('div', { className: 'tenders-workbar' }, h('div', { className: 'tenders-view-controls' },
          h('div', { className: 'tenders-segment', role: 'group', 'aria-label': 'Вид тендеров' }, button('Канбан', () => setView('board'), { 'aria-pressed': view === 'board' }), button('Таблица', () => setView('table'), { 'aria-pressed': view === 'table' })),
          h('div', { className: 'tenders-segment', role: 'group', 'aria-label': 'Отбор тендеров' }, button(`Активные (${data.tenders.filter((item) => item.status !== 'closed').length})`, () => setCollection('active'), { 'aria-pressed': collection === 'active' }), button(`Закрытые (${data.tenders.filter((item) => item.status === 'closed').length})`, () => setCollection('closed'), { 'aria-pressed': collection === 'closed' })),
          view === 'table' && button('Колонки', () => setColumnsOpen((open) => !open), { ref: columnsButton, 'aria-expanded': columnsOpen, 'aria-controls': 'tenders-columns-panel' })),
          field('Поиск по заказчику и потребности', h('input', { type: 'search', value: query, onChange: (event) => setQuery(event.target.value), placeholder: 'Заказчик, тендер, требования…' }))),
        currentPreferences.storageError && h('p', { className: 'tenders-muted', role: 'status' }, 'Браузер не позволил сохранить настройки вида. Они действуют до закрытия страницы.'),
        renderColumns(),
        loading && h('p', { className: 'tenders-loading', role: 'status' }, loaded ? 'Обновляем доску…' : 'Загружаем тендеры…'),
        loaded && !data.tenders.length && h('div', { className: 'tenders-empty' }, h('h2', null, 'Начните с первого тендера'), h('p', null, 'Укажите заказчика и название. Количество авто, сроки и договорённости можно добавить позже.'), button('+ Новый тендер', () => openForm(), { className: 'button tenders-primary', disabled: Boolean(busy) || loading })),
        loaded && data.tenders.length > 0 && (view === 'table' ? renderTable() : collection === 'active' ? h('div', { className: 'tenders-board', 'aria-label': 'Канбан тендеров' }, ...STAGES.filter(([id]) => id !== 'closed').map(([status, label]) => {
          const items = filtered.filter((item) => item.status === status);
          return h('section', { key: status, className: `tenders-column stage-${status}`, 'aria-label': label }, h('header', null, h('h2', null, label), h('span', { 'aria-label': `Карточек: ${items.length}` }, items.length)), items.length ? items.map(card) : h('p', { className: 'tenders-column-empty' }, query ? 'Нет совпадений' : 'Пока нет тендеров'));
        })) : h('div', { className: 'tenders-closed' }, filtered.some((item) => item.status === 'closed') ? filtered.filter((item) => item.status === 'closed').map(card) : h('div', { className: 'tenders-empty' }, h('p', null, query ? 'Закрытых тендеров по этому запросу нет.' : 'Закрытых тендеров пока нет.')))),
        loaded && h('p', { className: 'tenders-footer' }, 'Дедлайн подачи — срок отправки заявки. Запуск — ожидаемая дата начала работы.')),
      renderForm(), renderDetail());
  };
}
