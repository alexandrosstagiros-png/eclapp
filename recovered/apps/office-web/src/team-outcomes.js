const captions = { weekly: 'Недельные итоги', monthly: 'Месячные итоги' };
const statusNames = { pending: 'Ожидается', overdue: 'Просрочен', submitted: 'Сдан' };
const dateLabel = value => new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(value));
const fields = { done: 'Что сделано', inProgress: 'Что в работе', blockers: 'Какие есть препятствия', nextMonthFocus: 'Фокус следующего месяца' };
const signature = value => JSON.stringify(Object.fromEntries(['done', 'inProgress', 'blockers', 'nextMonthFocus', 'gratitude'].map(key => [key, value?.[key] || (key === 'gratitude' ? [] : '')])));
const formFor = report => ({ id: report.id, version: report.version, done: report.done || '', inProgress: report.inProgress || '', blockers: report.blockers || '', nextMonthFocus: report.nextMonthFocus || '', gratitude: (report.gratitude || []).map(({ recipientId, reason }) => ({ recipientId, reason })) });

export function createTeamOutcomes(React, { request }) {
  const { createElement: h, useState, useRef, useEffect } = React;
  const button = (label, onClick, extra = {}) => h('button', { type: 'button', className: 'button', onClick, ...extra }, label);
  function TeamOutcomes({ token, actor, scopeId, onExpired, onDirtyChange, onRecognitionChange }) {
    const [kind, setKind] = useState('weekly'), [periodStart, setPeriodStart] = useState(''), [data, setData] = useState(null);
    const [selected, setSelected] = useState(''), [report, setReport] = useState(null), [form, setForm] = useState(null), [original, setOriginal] = useState('');
    const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState(''), [notice, setNotice] = useState('');
    const [conflict, setConflict] = useState(false);
    const generation = useRef(0), revision = useRef(0), selectedRef = useRef(''), formRef = useRef(null), dirtyRef = useRef(false), busyRef = useRef(false);
    const tokenRef = useRef(token), controllers = useRef(new Set()), operation = useRef(null), callbacks = useRef({ onExpired, onDirtyChange, onRecognitionChange });
    tokenRef.current = token; callbacks.current = { onExpired, onDirtyChange, onRecognitionChange }; formRef.current = form;
    const dirty = Boolean(form && signature(form) !== original);
    dirtyRef.current = dirty;
    useEffect(() => { callbacks.current.onDirtyChange?.(dirty || busy); }, [dirty, busy]);
    useEffect(() => () => callbacks.current.onDirtyChange?.(false), []);
    useEffect(() => {
      const handler = event => { if (dirtyRef.current || busyRef.current) { event.preventDefault(); event.returnValue = ''; } };
      window.addEventListener('beforeunload', handler); return () => window.removeEventListener('beforeunload', handler);
    }, []);
    const scoped = path => `${path}?responsibilityScopeId=${encodeURIComponent(scopeId)}`;
    async function api(path, options = {}) {
      const controller = new AbortController(); controllers.current.add(controller);
      try { return await request(path, { ...options, signal: controller.signal }, tokenRef.current); }
      finally { controllers.current.delete(controller); }
    }
    function fail(reason) {
      if (reason?.name === 'AbortError') return;
      if (reason?.status === 401) callbacks.current.onExpired?.();
      if ([401, 403, 404].includes(reason?.status)) {
        revision.current++; selectedRef.current = ''; setSelected(''); setReport(null); setForm(null); setOriginal(''); setData(null);
      }
      setError(reason?.message || 'Не удалось загрузить итоги. Повторите попытку.');
    }
    function applyReport(value, replaceDraft = false) {
      setReport(value);
      if (replaceDraft || !dirtyRef.current) {
        const next = value?.canEdit ? formFor(value) : null;
        setForm(next); setOriginal(signature(next)); setConflict(false); operation.current = null;
      } else if (value.version !== formRef.current?.version) setConflict(true);
    }
    async function refresh() {
      const stamp = generation.current, requestRevision = ++revision.current;
      const query = new URLSearchParams({ responsibilityScopeId: scopeId, kind });
      if (periodStart) query.set('periodStart', periodStart);
      const value = await api(`/team/outcomes?${query}`);
      if (generation.current !== stamp || revision.current !== requestRevision) return;
      setData(value);
      const id = selectedRef.current || value.ownReportId || value.reports[0]?.id || '';
      const currentReport = value.reports.find(item => item.id === id);
      if (id && !currentReport) {
        selectedRef.current = ''; setSelected(''); setReport(null); setForm(null); setOriginal(''); setConflict(false); return;
      }
      selectedRef.current = id; setSelected(id); applyReport(currentReport || null);
    }
    useEffect(() => {
      const stamp = ++generation.current;
      revision.current++; selectedRef.current = ''; dirtyRef.current = false; busyRef.current = false; operation.current = null;
      setData(null); setSelected(''); setReport(null); setForm(null); setOriginal(''); setError(''); setNotice(''); setConflict(false); setBusy(false); setLoading(true);
      refresh().catch(reason => { if (stamp === generation.current) fail(reason); }).finally(() => { if (stamp === generation.current) setLoading(false); });
      let inFlight = false;
      const timer = setInterval(async () => {
        if (inFlight || busyRef.current || document.hidden) return;
        inFlight = true;
        try { await refresh(); } catch (reason) { if (stamp === generation.current) fail(reason); }
        finally { inFlight = false; }
      }, 15000);
      return () => { generation.current++; clearInterval(timer); for (const controller of controllers.current) controller.abort(); };
    }, [scopeId, actor.id, kind, periodStart]);
    // A refreshed access token revalidates permissions without discarding an unsaved form.
    useEffect(() => {
      if (!scopeId || busyRef.current) return;
      const stamp = generation.current;
      refresh().catch(reason => { if (stamp === generation.current) fail(reason); });
    }, [token]);
    function leave() { return !busyRef.current && (!dirtyRef.current || window.confirm('Удалить несохранённые изменения итогов?')); }
    function select(value) {
      if (value.id === selectedRef.current || !leave()) return;
      revision.current++; selectedRef.current = value.id; setSelected(value.id); setNotice(''); setError(''); applyReport(value, true);
    }
    function change(key, value) { setForm(before => ({ ...before, [key]: value })); operation.current = null; setNotice(''); }
    async function save(submit) {
      if (!form || !report?.canEdit || busyRef.current || conflict) return;
      const payload = { responsibilityScopeId: scopeId, version: form.version, done: form.done, inProgress: form.inProgress, blockers: form.blockers,
        nextMonthFocus: form.nextMonthFocus, gratitude: form.gratitude, submit };
      if (submit && (!payload.done.trim() || !payload.inProgress.trim() || !payload.blockers.trim() || (kind === 'monthly' && !payload.nextMonthFocus.trim()))) {
        setError('Заполните обязательные поля. Если пунктов нет, напишите «нет».'); return;
      }
      if (submit && payload.gratitude.some(entry => !entry.reason.trim())) { setError('Укажите, за что благодарите выбранных сотрудников.'); return; }
      const key = JSON.stringify(payload);
      if (operation.current?.key !== key) operation.current = { key, id: crypto.randomUUID() };
      const stamp = generation.current, id = form.id;
      busyRef.current = true; setBusy(true); setError(''); setNotice(''); revision.current++;
      try {
        const result = await api(`/team/outcomes/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify({ ...payload, operationId: operation.current.id }) });
        if (stamp !== generation.current || selectedRef.current !== id) return;
        dirtyRef.current = false; applyReport(result, true);
        setData(value => value && { ...value, reports: value.reports.map(item => item.id === id ? result : item) });
        setNotice(submit ? (result.gratitude?.length ? 'Итоги сданы. Благодарности начислены.' : 'Итоги сданы.') : 'Черновик сохранён. Он виден только вам.');
        if (submit) callbacks.current.onRecognitionChange?.();
      } catch (reason) {
        if (stamp !== generation.current) return;
        if (reason?.status === 409) { setConflict(true); setError('Отчёт уже изменён в другой вкладке. Ваш текст сохранён в форме; скопируйте его при необходимости и загрузите актуальную версию.'); }
        else fail(reason);
      } finally { if (stamp === generation.current) { busyRef.current = false; setBusy(false); } }
    }
    async function reloadReport() {
      if (!report || !leave()) return;
      const stamp = generation.current, id = report.id;
      setLoading(true);
      try { const result = await api(scoped(`/team/outcomes/${encodeURIComponent(id)}`)); if (stamp === generation.current && selectedRef.current === id) applyReport(result, true); }
      catch (reason) { if (stamp === generation.current) fail(reason); }
      finally { if (stamp === generation.current) setLoading(false); }
    }
    const status = value => `${statusNames[value.status]}${value.hasDraft ? ' · черновик' : ''}${value.late ? ' · с опозданием' : ''}`;
    const reportKeys = kind === 'monthly' ? Object.keys(fields) : ['done', 'inProgress', 'blockers'];
    return h('section', { className: 'team-outcomes', 'aria-label': 'Итоги руководителей' },
      h('header', { className: 'team-outcomes-heading' }, h('div', null, h('h2', null, 'Итоги'), h('p', null, 'Неделя — до конца пятницы. Месяц — до конца последнего дня. Время московское.')),
        h('div', { className: 'team-outcomes-tabs', role: 'tablist', 'aria-label': 'Период итогов' }, ...Object.entries(captions).map(([key, label]) => button(label, () => { if (key !== kind && leave()) { setKind(key); setPeriodStart(''); } }, { key, role: 'tab', 'aria-selected': kind === key, disabled: busy })))),
      error && h('p', { className: 'team-outcomes-error', role: 'alert' }, error), notice && h('p', { className: 'team-outcomes-notice', role: 'status' }, notice),
      data && h('div', { className: 'team-outcomes-period' }, h('label', null, 'Период', h('select', { value: data.period.start, 'aria-label': 'Период отчёта', disabled: busy, onChange: event => { if (leave()) setPeriodStart(event.target.value); } },
        ...data.periods.map(period => h('option', { value: period.start, key: period.start }, `${dateLabel(period.start)} — ${dateLabel(period.end)}`)))),
        h('p', null, `Сдать до ${dateLabel(data.period.dueAt)}, 23:59 МСК`)),
      loading && h('p', { role: 'status' }, 'Загрузка итогов…'),
      data && h('div', { className: 'team-outcomes-layout' }, h('aside', { className: 'team-outcomes-list' },
        h('h3', null, data.canManage ? 'Контроль сдачи' : 'Мои итоги и команда'),
        data.reports.length ? h('table', null, h('thead', null, h('tr', null, h('th', null, 'Руководитель'), h('th', null, 'Статус'))), h('tbody', null,
          ...data.reports.map(value => h('tr', { key: value.id, className: value.id === selected ? 'is-selected' : '' },
            h('td', null, button(value.ownerName + (value.ownerId === actor.id ? ' · вы' : ''), () => select(value), { disabled: busy, 'aria-pressed': value.id === selected })),
            h('td', { className: `team-outcomes-status is-${value.status}` }, status(value)))))) : h('p', null, 'В этом периоде назначенных итогов нет. Формы появляются у сотрудников с прямыми подчинёнными.'),
        h('p', { className: 'team-outcomes-help' }, data.policy), data.featureStartedAt && h('small', null, `Учёт ведётся с ${dateLabel(data.featureStartedAt)}`)),
        h('article', { className: 'team-outcomes-report', 'aria-label': 'Отчёт руководителя' }, report ? h(React.Fragment, null,
          h('header', null, h('h3', null, report.ownerName), h('p', { className: `team-outcomes-status is-${report.status}` }, status(report))),
          form && (report.canEdit || dirty) ? h('form', { onSubmit: event => { event.preventDefault(); save(true); } },
            h('p', { className: 'team-outcomes-help' }, 'Заполните каждый пункт. Если изменений или препятствий нет, напишите «нет». После сдачи текст нельзя изменить.'),
            ...reportKeys.map(key => h('label', { key }, fields[key], h('textarea', { value: form[key], 'aria-label': fields[key], maxLength: 6000, rows: 4, disabled: busy, onChange: event => change(key, event.target.value) }))),
            h('fieldset', { className: 'team-outcomes-thanks', disabled: busy }, h('legend', null, 'Поблагодарить коллег — необязательно'),
              h('p', null, 'После сдачи каждый выбранный коллега получит одну корону за этот отчёт.'),
              h('div', { className: 'team-outcomes-people' }, ...data.people.map(person => {
                const selectedGratitude = form.gratitude.find(entry => entry.recipientId === person.id);
                return h('label', { key: person.id }, h('input', { type: 'checkbox', checked: Boolean(selectedGratitude), disabled: busy || (!selectedGratitude && form.gratitude.length >= 20),
                  onChange: event => change('gratitude', event.target.checked ? [...form.gratitude, { recipientId: person.id, reason: '' }] : form.gratitude.filter(entry => entry.recipientId !== person.id)) }), person.displayName);
              })), ...form.gratitude.map(entry => h('label', { key: entry.recipientId }, `За что благодарите: ${data.people.find(person => person.id === entry.recipientId)?.displayName || 'Сотрудник'}`,
                h('textarea', { value: entry.reason, 'aria-label': `Причина благодарности ${data.people.find(person => person.id === entry.recipientId)?.displayName || 'Сотрудник'}`, rows: 2, maxLength: 1000,
                  onChange: event => change('gratitude', form.gratitude.map(value => value.recipientId === entry.recipientId ? { ...value, reason: event.target.value } : value)) })))),
            conflict && h('div', { className: 'team-outcomes-error', role: 'status' }, h('p', null, 'Сохранённая версия изменилась. Ваш текст остаётся в форме для копирования. Загрузите актуальный отчёт перед продолжением.'), button('Загрузить сохранённый отчёт', reloadReport, { disabled: busy })),
            h('div', { className: 'team-outcomes-actions' }, button('Сохранить черновик', () => save(false), { disabled: busy || conflict || !report.canEdit }), h('button', { type: 'submit', className: 'button primary', disabled: busy || conflict || !report.canEdit }, busy ? 'Сохранение…' : 'Сдать итоги')))
            : report.contentVisible ? h('div', { className: 'team-outcomes-reading' }, ...reportKeys.map(key => h('section', { key }, h('h4', null, fields[key]), h('p', null, report[key] || '—'))),
              report.gratitude?.length > 0 && h('section', null, h('h4', null, 'Благодарности'), ...report.gratitude.map(entry => h('p', { key: entry.recipientId }, h('strong', null, `♛ ${entry.recipientName}`), ` — ${entry.reason}`))),
              report.submittedAt && h('small', null, `Сдан ${dateLabel(report.submittedAt)}`))
              : h('p', null, 'Отчёт пока не сдан. Черновик доступен только автору.')) : h('p', null, 'Выберите руководителя, чтобы открыть итоги.'))));
  }
  return { TeamOutcomes };
}
