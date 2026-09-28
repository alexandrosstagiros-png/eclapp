import { dateRange, shiftPeriod, calendarLanes, cellRows, copyCalendarRange, copyCalendarDays, changeCalendarAssignment } from './planning-calendar-model.js';

const STATUSES = [['work', 'В работе'], ['reserve', 'Резерв'], ['paid_reserve', 'Оплачиваемый резерв'], ['off', 'Выходной'], ['repair', 'Ремонт'], ['sick', 'Больничный'], ['transferred', 'Переброс'], ['cancelled', 'Отмена'], ['no_work', 'Нет работы'], ['no_driver', 'Без водителя'], ['crew_shortage', 'Неполный экипаж'], ['failed', 'Срыв']];
const clone = value => JSON.parse(JSON.stringify(value));
const bytes = value => new TextEncoder().encode(JSON.stringify(value)).length;
function limitedHistory(snapshots) {
  const retained = []; let size = 0;
  for (const snapshot of snapshots.slice(-10).reverse()) {
    const amount = bytes(snapshot);
    if (retained.length && size + amount > 8 * 1024 * 1024) break;
    retained.unshift(snapshot); size += amount;
  }
  return retained;
}
const statusLabel = value => STATUSES.find(item => item[0] === value)?.[1] || value;
const documentPayload = plan => ({ businessDate: plan.businessDate, templateId: plan.templateId, templateVersion: plan.templateVersion || 1, rows: plan.rows, version: plan.version || 0 });
const fingerprint = plans => JSON.stringify(Object.keys(plans).sort().map(date => documentPayload(plans[date])));
const rect = (first, last = first) => ({ r1: Math.min(first.r, last.r), c1: Math.min(first.c, last.c), r2: Math.max(first.r, last.r), c2: Math.max(first.c, last.c) });
const inside = (range, r, c) => range && r >= range.r1 && r <= range.r2 && c >= range.c1 && c <= range.c2;
const dateLabel = (value, options = { day: 'numeric', month: 'long' }) => new Intl.DateTimeFormat('ru-RU', { ...options, timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`));
const rowLabel = (row, options) => ({ driver: options.drivers.find(item => item.id === row.driverId)?.name || (row.driverId ? 'Водитель недоступен' : 'Без водителя'), vehicle: options.vehicles.find(item => item.id === row.vehicleId)?.label || (row.vehicleId ? 'Машина недоступна' : 'Без машины') });

export function createPlanningOneCExport(React, { request }) {
  const { createElement: h, useState, useEffect, useRef } = React;
  const statusLabels = { created: 'Создано в 1С', updated: 'Обновлено в 1С', unchanged: 'Уже в 1С', error: 'Требует проверки', failed: 'Требует проверки', skipped: 'Не передано', pending: 'Отправка не подтверждена', unknown: 'Нет подтверждения' };
  return function PlanningOneCExport({ token, oneC, scopeId, selectedPlans, existingPlans = selectedPlans, options, dirty, busy, onBusyChange, onAuthError, selectionHelp, children }) {
    const [sending, setSending] = useState(false);
    const [error, setError] = useState('');
    const [receipt, setReceipt] = useState(null);
    const savedVersions = existingPlans.map(plan => `${plan.businessDate}:${plan.version}`).join('|');
    useEffect(() => { setReceipt(null); }, [scopeId, savedVersions]);
    const mounted = useRef(true);
    const callbacks = useRef({ onBusyChange, onAuthError });
    callbacks.current = { onBusyChange, onAuthError };
    useEffect(() => {
      mounted.current = true;
      return () => { mounted.current = false; callbacks.current.onBusyChange?.(false); };
    }, []);
    const count = selectedPlans.reduce((total, plan) => total + plan.rows.length, 0);
    const unsaved = selectedPlans.some(plan => !plan.version);
    const overLimit = count > 200;
    async function send() {
      if (!oneC?.enabled || sending || busy || dirty || unsaved || overLimit || !count) return;
      const submitted = selectedPlans.flatMap(plan => plan.rows.map(row => ({
        businessDate: plan.businessDate, rowId: row.id,
        label: [dateLabel(plan.businessDate, { day: '2-digit', month: '2-digit' }), row.departureTime || 'Без времени', rowLabel(row, options).driver, rowLabel(row, options).vehicle].join(' · '),
      })));
      setSending(true); callbacks.current.onBusyChange?.(true); setError(''); setReceipt(null);
      try {
        const result = await request('/planning/one-c/export', { method: 'POST', body: JSON.stringify({
          responsibilityScopeId: scopeId,
          plans: selectedPlans.map(plan => ({ businessDate: plan.businessDate, version: plan.version, rowIds: plan.rows.map(row => row.id) })),
        }) }, token);
        if (!mounted.current) return;
        const results = Array.isArray(result.results) ? result.results : [];
        const rows = submitted.map(item => {
          const found = results.find(entry => entry.rowId === item.rowId && entry.businessDate === item.businessDate);
          return { ...item, ...found, status: statusLabels[found?.status] ? found.status : 'unknown', message: found?.message || (!found ? 'Сервер не вернул результат этого назначения. Повторите отправку для проверки.' : '') };
        });
        setReceipt({ rows, targetLabel: result.targetLabel || oneC.targetLabel || 'Локальная InfoBase', at: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) });
      } catch (reason) {
        if (!mounted.current) return;
        if ([401, 403].includes(reason?.status)) callbacks.current.onAuthError?.(reason);
        setError(reason?.status === 409 ? (reason.message || 'Сохранённый план изменился. Обновите план и выберите назначения заново.')
          : reason?.status === 401 ? 'Сессия закончилась. Войдите снова.'
            : reason?.status === 403 ? 'Нет доступа к передаче этого плана.'
              : reason?.status === 400 ? (reason.message || 'Не удалось передать назначения. Проверьте водителей, машины, время и сохранение плана.')
                : 'Нет подтверждения от локальной 1С. Проверьте, что локальный тест запущен, и повторите отправку. Повторная отправка не создаёт дубли.');
      } finally {
        if (mounted.current) { setSending(false); callbacks.current.onBusyChange?.(false); }
      }
    }
    if (!oneC?.enabled) return null;
    const previousRows = existingPlans.flatMap(plan => (plan.oneCExports || []).map(entry => {
      const row = plan.rows.find(item => item.id === entry.rowId);
      return { ...entry, businessDate: entry.businessDate || plan.businessDate,
        status: statusLabels[entry.status] ? entry.status : 'unknown',
        label: [dateLabel(plan.businessDate, { day: '2-digit', month: '2-digit' }), ...(row ? [row.departureTime || 'Без времени', rowLabel(row, options).driver, rowLabel(row, options).vehicle] : ['Назначение больше не входит в этот план'])].join(' · '),
      };
    }));
    const shownReceipt = receipt || (previousRows.length ? { rows: previousRows, targetLabel: oneC.targetLabel || 'Локальная InfoBase', previous: true } : null);
    const failed = shownReceipt?.rows.filter(row => !['created', 'updated', 'unchanged'].includes(row.status)).length || 0;
    return h('section', { className: 'planning-onec surface', 'aria-label': 'Передача в локальную 1С' },
      h('div', { className: 'planning-onec-heading' }, h('div', null,
        h('span', { className: 'planning-eyebrow' }, 'ЛОКАЛЬНАЯ 1С'),
        h('h3', null, oneC.targetLabel || 'Локальная InfoBase'),
        h('p', null, 'Выберите назначения и отправьте их в 1С. Повторная отправка тех же данных не создаёт дубли.')),
        h('button', { type: 'button', className: 'button primary', onClick: send, disabled: sending || busy || dirty || unsaved || overLimit || !count }, sending ? 'Передаём в 1С…' : `Передать в 1С${count ? ` · ${count}` : ''}`)),
      children,
      h('p', { className: 'planning-help' }, 'Передаются назначения «В работе»: один рейс, водитель, машина и время выхода. В 1С создаются заявка и плановая смена.'),
      h('p', { className: 'planning-help' }, 'Изменения после передачи требуют сверки с документом 1С. Комментарий — до 800 символов; дополнительные поля клиента пока не передаются.'),
      h('p', { className: 'planning-help', role: dirty || unsaved || overLimit ? 'status' : undefined }, dirty || unsaved ? 'Сначала сохраните изменения плана, затем передайте выбранные назначения в 1С.' : overLimit ? `Выбрано ${count} назначений. За один раз можно передать не больше 200; уменьшите выделение.` : `${selectionHelp} Выбрано: ${count} назначений, ${selectedPlans.length} дн.`),
      error && h('div', { className: 'planning-error', role: 'alert' }, error),
      shownReceipt && h('div', { className: 'planning-onec-receipt', 'aria-live': 'polite' },
        h('p', { className: failed ? 'planning-notice' : 'planning-feedback', role: 'status' }, `${shownReceipt.previous ? 'Сохранённые результаты' : `Результат отправки, ${shownReceipt.at}`} · ${shownReceipt.targetLabel}. Подтверждено: ${shownReceipt.rows.length - failed} из ${shownReceipt.rows.length}.${failed ? ` Не передано или требует проверки: ${failed}.` : ''}`),
        h('details', { open: failed > 0 }, h('summary', null, 'Результат по каждому назначению'),
          h('ul', null, ...shownReceipt.rows.map(row => h('li', { key: `${row.businessDate}:${row.rowId}` },
            h('span', null, row.label), h('strong', { className: ['created', 'updated', 'unchanged'].includes(row.status) ? 'planning-onec-ok' : 'planning-onec-failed' }, statusLabels[row.status]),
            row.documentNumber && h('small', null, `Смена 1С № ${row.documentNumber}`), row.requestNumber && h('small', null, `Заявка 1С № ${row.requestNumber}`), row.message && h('small', null, row.message)))))));
  };
}

export function createPlanningCalendar(React, { request }) {
  const { createElement: h, useState, useEffect, useMemo, useRef } = React;
  const PlanningOneCExport = createPlanningOneCExport(React, { request });
  const button = (text, action, props = {}) => h('button', { type: 'button', className: 'button', onClick: action, ...props }, text);
  const field = (label, input) => h('label', { className: 'planning-field' }, h('span', null, label), React.cloneElement(input, { 'aria-label': input.props['aria-label'] || label }));

  return function PlanningCalendar({ token, scope, scopes = [scope], oneC, options = { drivers: [], vehicles: [] }, templates = [], defaultTemplateId, initialDate, onOpenDay, onClose, onExpired, onDenied, onDirtyChange }) {
    const [anchor, setAnchor] = useState(initialDate);
    const [mode, setMode] = useState('week');
    const [axis, setAxis] = useState('driver');
    const [plans, setPlans] = useState({});
    const [otherPlans, setOtherPlans] = useState([]);
    const [baseline, setBaseline] = useState({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [oneCSending, setOneCSending] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [reloadKey, setReloadKey] = useState(0);
    const [selection, setSelection] = useState(null);
    const [active, setActive] = useState(null);
    const [hover, setHover] = useState(null);
    const [dragTarget, setDragTarget] = useState(null);
    const [clipboard, setClipboard] = useState(null);
    const [preview, setPreview] = useState(null);
    const [policy, setPolicy] = useState('empty');
    const [dayCopy, setDayCopy] = useState(null);
    const [edit, setEdit] = useState(null);
    const [history, setHistory] = useState([]);
    const [denied, setDenied] = useState(false);
    const drag = useRef(null);
    const keyAnchor = useRef(null);
    const grid = useRef(null);
    const sequence = useRef(0);
    const callbacks = useRef({ onOpenDay, onClose, onExpired, onDenied, onDirtyChange });
    callbacks.current = { onOpenDay, onClose, onExpired, onDenied, onDirtyChange };
    const dates = useMemo(() => dateRange(anchor, mode), [anchor, mode]);
    const lanes = useMemo(() => calendarLanes(plans, options, axis), [plans, options, axis]);
    const planDirty = fingerprint(plans) !== fingerprint(baseline);
    const editedOriginal = edit && plans[edit.date]?.rows.find(row => row.id === edit.id);
    const editDirty = Boolean(edit && editedOriginal && ['driverId', 'vehicleId', 'departureTime', 'status', 'tripCount', 'comment'].some(key => String(edit[key] ?? '') !== String(editedOriginal[key] ?? '')));
    const dirty = planDirty || editDirty;
    const laneSignature = JSON.stringify(lanes.map(lane => lane.id));
    useEffect(() => { setClipboard(null); setSelection(null); setActive(null); setHover(null); setPreview(null); setEdit(null); }, [laneSignature]);
    const dirtyRef = useRef(dirty);
    dirtyRef.current = dirty;
    const busy = loading || saving || denied || oneCSending;
    const latest = useRef(null);
    latest.current = { dates, lanes, plans, axis, selection, clipboard, busy, preview, dayCopy };
    const changedDates = dates.filter(date => plans[date] && JSON.stringify(documentPayload(plans[date])) !== JSON.stringify(baseline[date] && documentPayload(baseline[date])));
    const count = Object.values(plans).reduce((total, plan) => total + plan.rows.length, 0);
    const oneCPlans = useMemo(() => selection ? dates.flatMap((date, c) => {
      if (c < selection.c1 || c > selection.c2 || !plans[date]) return [];
      const rowIds = new Set(lanes.slice(selection.r1, selection.r2 + 1).flatMap(lane => cellRows(plans, date, lane.id, axis).map(row => row.id)));
      const rows = plans[date].rows.filter(row => rowIds.has(row.id));
      return rows.length ? [{ ...plans[date], rows }] : [];
    }) : [], [selection, dates, plans, lanes, axis]);

    function clearPrivateData() {
      sequence.current += 1;
      setPlans({}); setOtherPlans([]); setBaseline({}); setHistory([]); setClipboard(null); setPreview(null); setDayCopy(null); setActive(null); setEdit(null); setHover(null); setSelection(null); setNotice(''); setDenied(true); setLoading(false); setSaving(false);
      callbacks.current.onDirtyChange?.(false);
    }
    function fail(reason, phase = 'load') {
      if (reason?.name === 'AbortError') return;
      if ([401, 403].includes(reason?.status)) {
        clearPrivateData();
        if (reason.status === 401) callbacks.current.onExpired?.(); else callbacks.current.onDenied?.();
      }
      setError(reason?.status === 401 ? 'Сессия закончилась. Войдите снова.' : reason?.status === 403 ? 'Доступ к планированию изменился.' : reason?.status === 409 ? 'Другой менеджер уже изменил один из дней. Ни один день не перезаписан. Ваши изменения остались на экране; загрузите актуальный календарь после проверки.' : phase === 'save' && reason?.status === 400 ? 'Проверьте назначения: выбранные водители, машины или форма могли стать недоступны. Ваши изменения остались на экране.' : phase === 'save' && reason?.status === 413 ? 'Объём изменений слишком большой. Отмените часть копирования или сократите дополнительные сведения и повторите сохранение. Ваши изменения остались на экране.' : phase === 'save' ? 'Не удалось сохранить календарь. Проверьте соединение и доступность выбранных водителей и машин. Ваши изменения остались на экране.' : 'Не удалось загрузить календарь. Проверьте соединение и повторите попытку.');
    }
    useEffect(() => { callbacks.current.onDirtyChange?.(dirty); }, [dirty]);
    useEffect(() => {
      const protect = event => { if (dirtyRef.current) { event.preventDefault(); event.returnValue = ''; } };
      window.addEventListener('beforeunload', protect);
      return () => { window.removeEventListener('beforeunload', protect); sequence.current += 1; callbacks.current.onDirtyChange?.(false); };
    }, []);
    useEffect(() => {
      const currentSequence = ++sequence.current;
      const controller = new AbortController();
      setLoading(true); setDenied(false); setError(''); setNotice(''); setPlans({}); setOtherPlans([]); setBaseline({}); setHistory([]); setSelection(null); setActive(null); setEdit(null); setClipboard(null); setPreview(null); setDayCopy(null); setHover(null);
      Promise.all(scopes.map(async (item) => {
        const query = new URLSearchParams({ from: dates[0], to: dates.at(-1), responsibilityScopeId: item.responsibilityScopeId });
        return request(`/planning/calendar?${query}`, { signal: controller.signal }, token);
      })).then(results => {
        if (sequence.current !== currentSequence) return;
        const allPlans = results.flatMap(result => result.plans || []);
        const result = { plans: allPlans.filter(plan => plan.responsibilityScopeId === scope.responsibilityScopeId) };
        setOtherPlans(allPlans.filter(plan => plan.responsibilityScopeId !== scope.responsibilityScopeId).sort((a, b) => a.businessDate.localeCompare(b.businessDate)));
        const chosen = templates.find(item => item.id === defaultTemplateId) || templates.find(item => item.id === 'general') || templates[0];
        if (!chosen) throw new Error('Форма плана недоступна');
        const fetched = Object.fromEntries((result.plans || []).map(plan => [plan.businessDate, plan]));
        const next = Object.fromEntries(dates.map(date => {
          const saved = fetched[date];
          return [date, saved ? { ...saved, rows: clone(saved.rows || []) } : { id: null, businessDate: date, responsibilityScopeId: scope.responsibilityScopeId, templateId: chosen.id, templateVersion: chosen.version || 1, templateSnapshot: chosen, rows: [], version: 0 }];
        }));
        setPlans(next); setBaseline(clone(next));
      }).catch(reason => { if (sequence.current === currentSequence) fail(reason); }).finally(() => { if (sequence.current === currentSequence) setLoading(false); });
      return () => { controller.abort(); if (sequence.current === currentSequence) sequence.current += 1; };
    }, [dates[0], dates.at(-1), scope.responsibilityScopeId, token, reloadKey]);

    useEffect(() => {
      if (loading || mode !== 'month' || !grid.current) return;
      const column = dates.indexOf(anchor);
      const width = grid.current.querySelector('[data-cal-col]')?.getBoundingClientRect().width || 145;
      grid.current.scrollLeft = Math.max(0, (column - 2) * width);
    }, [loading, mode, dates[0], anchor]);

    function changePeriod(nextAnchor, nextMode = mode) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(nextAnchor) || nextAnchor === anchor && nextMode === mode) return;
      try { dateRange(nextAnchor, nextMode); } catch (reason) { setError(reason.message); return; }
      if (dirty && !window.confirm('Перейти к другому периоду? Несохранённые изменения календаря будут потеряны.')) return;
      setAnchor(nextAnchor); setMode(nextMode);
    }
    function navigatePeriod(offset) {
      try { changePeriod(shiftPeriod(anchor, mode, offset)); } catch (reason) { setError(reason.message); }
    }
    function changeAxis(next) {
      if (editDirty && !window.confirm('Изменения рейса ещё не применены. Сменить вид и отказаться от них?')) return;
      setAxis(next); setSelection(null); setActive(null); setEdit(null); setClipboard(null); setPreview(null); setHover(null);
    }
    function commit(next, text) {
      if (fingerprint(next) === fingerprint(plans)) { setNotice('Изменений нет.'); return; }
      setHistory(previous => limitedHistory([...previous, clone(plans)]));
      setPlans(next); setNotice(text); setError('');
    }
    async function save() {
      if (busy || editDirty || !changedDates.length) return;
      const body = { responsibilityScopeId: scope.responsibilityScopeId, plans: changedDates.map(date => documentPayload(plans[date])) };
      if (bytes(body) > 4 * 1024 * 1024) { setError('Объём изменений превышает 4 МБ. Отмените часть копирования или сократите дополнительные сведения и повторите сохранение. Изменения остались на экране.'); return; }
      setSaving(true); setError(''); setNotice('');
      const currentSequence = sequence.current;
      try {
        const result = await request('/planning/calendar', { method: 'PUT', body: JSON.stringify(body) }, token);
        if (sequence.current !== currentSequence) return;
        const next = { ...plans };
        for (const saved of result.plans || []) next[saved.businessDate] = saved;
        setPlans(next); setBaseline(clone(next)); setHistory([]); setNotice(`Календарь сохранён. Дней: ${changedDates.length}.`);
      } catch (reason) { if (sequence.current === currentSequence) fail(reason, 'save'); }
      finally { if (sequence.current === currentSequence) setSaving(false); }
    }
    function reload() {
      if (dirty && !window.confirm('Загрузить актуальный календарь и заменить несохранённые изменения?')) return;
      setReloadKey(value => value + 1);
    }
    function closeCalendar() {
      if (dirty && !window.confirm('Вернуться к дневному плану? Несохранённые изменения календаря будут потеряны.')) return;
      callbacks.current.onClose?.();
    }
    function openDay(date, scopeId = scope.responsibilityScopeId) {
      if (dirty && !window.confirm('Открыть редактор дня? Несохранённые изменения календаря будут потеряны. Сначала сохраните календарь, чтобы продолжить с ними.')) return;
      callbacks.current.onOpenDay?.(date, scopeId);
    }
    function copySelection() {
      if (!selection || busy || editDirty) return;
      setClipboard({ source: clone(selection), sourcePlans: clone(plans), axis, dates: [...dates], lanes: clone(lanes) });
      setNotice('Диапазон скопирован. Выделите место назначения и нажмите «Вставить» или Ctrl/⌘ V.'); setHover(null);
    }
    function pasteSelection() {
      if (!selection || !clipboard || busy || editDirty || clipboard.axis !== axis) return;
      const height = clipboard.source.r2 - clipboard.source.r1 + 1;
      const width = clipboard.source.c2 - clipboard.source.c1 + 1;
      const target = selection.r1 === selection.r2 && selection.c1 === selection.c2 ? { r1: selection.r1, c1: selection.c1, r2: Math.min(lanes.length - 1, selection.r1 + height - 1), c2: Math.min(dates.length - 1, selection.c1 + width - 1) } : clone(selection);
      setPolicy('empty'); setPreview({ kind: 'range', source: clipboard.source, sourcePlans: clipboard.sourcePlans, target, excludeSource: false }); setHover(null);
    }
    const proposed = useMemo(() => {
      if (!preview) return null;
      try {
        return preview.kind === 'day'
          ? copyCalendarDays({ plans, sourceDate: preview.sourceDate, targetDates: preview.targetDates, policy, templates })
          : copyCalendarRange({ plans, sourcePlans: preview.sourcePlans || plans, dates, lanes, axis, source: preview.source, target: preview.target, policy, templates, excludeSource: preview.excludeSource !== false });
      } catch (reason) { return { error: reason.message || 'Не удалось подготовить копирование.' }; }
    }, [preview, policy, plans, dates, lanes, axis, templates]);
    function applyPreview() {
      if (!proposed || proposed.error || busy) return;
      commit(proposed.plans, 'Копирование применено на экране. Проверьте рейсы и сохраните календарь.');
      setPreview(null); setDayCopy(null); setEdit(null);
    }
    function beginPointer(event, r, c) {
      if (busy || preview || dayCopy || event.button > 0) return;
      const point = { r, c };
      if (editDirty && !window.confirm('Изменения рейса ещё не применены. Выбрать другую ячейку и отказаться от них?')) return;
      const start = event.shiftKey && keyAnchor.current ? keyAnchor.current : point;
      if (!event.shiftKey) keyAnchor.current = point;
      setSelection(rect(start, point));
      setActive(point); setEdit(null); setHover(null);
      if (event.pointerType === 'touch') return;
      event.preventDefault();
      event.currentTarget.focus({ preventScroll: true });
      drag.current = { mode: 'select', start, last: point };
    }
    function beginFill(event) {
      if (!selection || busy || editDirty || preview) return;
      event.preventDefault(); event.stopPropagation();
      drag.current = { mode: 'fill', source: clone(selection), start: { r: selection.r2, c: selection.c2 }, last: { r: selection.r2, c: selection.c2 } };
      setDragTarget(clone(selection)); setHover(null);
    }
    useEffect(() => {
      function move(event) {
        if (!drag.current) return;
        const cell = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-cal-row][data-cal-col]');
        if (!cell || !grid.current?.contains(cell)) return;
        const point = { r: Number(cell.dataset.calRow), c: Number(cell.dataset.calCol) };
        drag.current.last = point;
        if (drag.current.mode === 'select') setSelection(rect(drag.current.start, point));
        else {
          const source = drag.current.source;
          setDragTarget({ r1: Math.min(source.r1, point.r), c1: Math.min(source.c1, point.c), r2: Math.max(source.r2, point.r), c2: Math.max(source.c2, point.c) });
        }
        const container = grid.current;
        const box = container.getBoundingClientRect();
        if (event.clientX > box.right - 36) container.scrollLeft += 20;
        if (event.clientX < box.left + 150) container.scrollLeft -= 20;
        if (event.clientY > box.bottom - 35) container.scrollTop += 16;
        if (event.clientY < box.top + 60) container.scrollTop -= 16;
      }
      function end() {
        const operation = drag.current;
        if (!operation) return;
        drag.current = null; setDragTarget(null);
        if (operation.mode !== 'fill') return;
        const source = operation.source, point = operation.last;
        const target = { r1: Math.min(source.r1, point.r), c1: Math.min(source.c1, point.c), r2: Math.max(source.r2, point.r), c2: Math.max(source.c2, point.c) };
        if (JSON.stringify(source) === JSON.stringify(target)) return;
        setPolicy('empty'); setPreview({ kind: 'range', source, target, sourcePlans: clone(latest.current.plans) });
      }
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', end); window.addEventListener('pointercancel', end);
      return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', end); drag.current = null; };
    }, []);
    function onKey(event, r, c) {
      if (event.target !== event.currentTarget || busy) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') { event.preventDefault(); copySelection(); return; }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') { event.preventDefault(); pasteSelection(); return; }
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (editDirty && !window.confirm('Изменения рейса ещё не применены. Выбрать ячейку и отказаться от них?')) return; setActive({ r, c }); setEdit(null); return; }
      if (event.key === 'Escape') { if (editDirty && !window.confirm('Закрыть детали и отказаться от неприменённых изменений рейса?')) return; setHover(null); setActive(null); setEdit(null); return; }
      const delta = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[event.key];
      if (!delta) return;
      event.preventDefault();
      const next = { r: Math.max(0, Math.min(lanes.length - 1, r + delta[0])), c: Math.max(0, Math.min(dates.length - 1, c + delta[1])) };
      if (editDirty && !window.confirm('Изменения рейса ещё не применены. Выбрать другую ячейку и отказаться от них?')) return;
      const range = event.shiftKey ? rect(keyAnchor.current || { r, c }, next) : rect(next);
      if (!event.shiftKey) keyAnchor.current = next;
      setSelection(range); setActive(next); setEdit(null);
      grid.current?.querySelector(`[data-cal-row="${next.r}"][data-cal-col="${next.c}"]`)?.focus();
    }
    function showHover(event, r, c) {
      if (drag.current || preview || dayCopy || busy || event.pointerType === 'touch') return;
      const rows = cellRows(plans, dates[c], lanes[r].id, axis);
      if (!rows.length) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      setHover({ r, c, left: Math.min(Math.max(12, bounds.left), window.innerWidth - 332), top: bounds.bottom + 8 > window.innerHeight - 220 ? Math.max(12, bounds.top - 220) : bounds.bottom + 8 });
    }
    function startDayCopy(sourceDate) { setDayCopy({ sourceDate, targetDates: [] }); setHover(null); setPreview(null); setPolicy('empty'); }
    function selectDay(date, c) {
      if (dayCopy) { toggleTarget(date); return; }
      if (editDirty && !window.confirm('Изменения рейса ещё не применены. Выбрать другой день и отказаться от них?')) return;
      setActive({ r: selection?.r1 || 0, c }); setSelection(rect({ r: 0, c }, { r: lanes.length - 1, c })); setEdit(null);
    }
    function toggleTarget(date) {
      setDayCopy(previous => previous && date !== previous.sourceDate ? { ...previous, targetDates: previous.targetDates.includes(date) ? previous.targetDates.filter(item => item !== date) : [...previous.targetDates, date].sort() } : previous);
    }
    function beginEdit(row, date) { if (editDirty && !window.confirm('Отказаться от неприменённых изменений текущего рейса?')) return; setEdit({ date, id: row.id, driverId: row.driverId || null, vehicleId: row.vehicleId || null, departureTime: row.departureTime || '', status: row.status || 'work', tripCount: row.tripCount || 1, comment: row.comment || '' }); }
    function applyEdit() {
      if (!edit || busy) return;
      if (edit.departureTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(edit.departureTime) || !Number.isInteger(Number(edit.tripCount)) || Number(edit.tripCount) < 1 || Number(edit.tripCount) > 999) { setError('Проверьте время и количество рейсов: от 1 до 999.'); return; }
      const next = clone(plans);
      const original = next[edit.date].rows.find(row => row.id === edit.id);
      if (!original) { setError('Назначение уже недоступно. Выберите рейс заново.'); return; }
      const template = next[edit.date].templateSnapshot || templates.find(item => item.id === next[edit.date].templateId && (item.version || 1) === (next[edit.date].templateVersion || 1));
      if (!template?.sections) { setError('Форма этого дня недоступна. Обновите календарь после проверки несохранённых изменений.'); return; }
      const updated = changeCalendarAssignment(original, { driverId: edit.driverId, vehicleId: edit.vehicleId, departureTime: edit.departureTime, status: edit.status, tripCount: Number(edit.tripCount), comment: edit.comment }, template);
      const cleared = Object.keys(original.clientFields || {}).filter(key => !Object.hasOwn(updated.clientFields || {}, key));
      const clearedExtra = (original.extraFields || []).some(field => Object.hasOwn(field, 'value')
        && !Object.hasOwn((updated.extraFields || []).find(item => item.id === field.id) || {}, 'value'));
      if ((cleared.length || clearedExtra) && !window.confirm('Применить смену водителя или машины? Ручные сведения о прежнем назначении, включая документы и телефон, будут удалены.')) return;
      next[edit.date].rows = next[edit.date].rows.map(row => row.id === edit.id ? updated : row);
      commit(next, 'Рейс изменён на экране. Сохраните календарь.');
      const laneIndex = lanes.findIndex(lane => lane.id === (axis === 'driver' ? updated.driverId : updated.vehicleId));
      const columnIndex = dates.indexOf(edit.date);
      if (laneIndex >= 0 && columnIndex >= 0) { setActive({ r: laneIndex, c: columnIndex }); setSelection(rect({ r: laneIndex, c: columnIndex })); }
      setEdit(null);
    }
    function rowDetails(row, date, compact = false) {
      const label = rowLabel(row, options);
      return h('div', { key: row.id, className: 'planning-cal-detail-row' }, h('strong', null, `${row.departureTime || 'Время не указано'} · ${statusLabel(row.status)}`), h('span', null, label.driver), h('span', null, label.vehicle), h('small', null, `Рейсов: ${row.tripCount || 1}${row.confirmed ? ' · Выход подтверждён' : ''}${row.requestCreated ? ' · Заявка создана' : ''}${row.arrived ? ' · Прибыл' : ''}`), row.comment && h('p', null, row.comment), !compact && button('Изменить рейс', () => beginEdit(row, date), { className: 'planning-link', disabled: busy }));
    }
    const activeDate = active && dates[active.c];
    const activeLane = active && lanes[active.r];
    const activeRows = activeDate && activeLane ? cellRows(plans, activeDate, activeLane.id, axis) : [];
    const hoverRows = hover && lanes[hover.r] ? cellRows(plans, dates[hover.c], lanes[hover.r].id, axis) : [];

    return h('section', { className: 'planning-calendar', 'aria-label': 'Календарь планирования' },
      h('div', { className: 'planning-cal-heading' }, h('div', null, onClose && button('← К дневному плану', closeCalendar, { className: 'planning-link planning-cal-back', disabled: busy }), h('span', { className: 'planning-eyebrow' }, 'ПЛАНИРОВАНИЕ РЕЙСОВ'), h('h2', null, 'Календарь'), h('p', null, 'Выделяйте ячейки и протягивайте за угол, чтобы повторить рейсы по дням и строкам.')),
        h('div', { className: 'planning-save-block' }, button(saving ? 'Сохраняем…' : 'Сохранить календарь', save, { className: 'button primary', disabled: busy || !planDirty || editDirty }), h('span', { className: `planning-save-state${dirty ? ' is-dirty' : ''}`, 'aria-live': 'polite' }, editDirty ? 'Сначала примените изменения рейса ниже' : planDirty ? `Изменено дней: ${changedDates.length}` : 'Все изменения сохранены'))),
      h('div', { className: 'planning-cal-toolbar' },
        h('div', { className: 'planning-cal-period' }, button('←', () => navigatePeriod(-1), { disabled: busy, 'aria-label': 'Предыдущий период' }), field('Период', h('input', { type: 'date', value: anchor, disabled: busy, onChange: event => changePeriod(event.target.value) })), button('→', () => navigatePeriod(1), { disabled: busy, 'aria-label': 'Следующий период' })),
        h('div', { className: 'planning-tabs', 'aria-label': 'Масштаб календаря' }, ...[['week', 'Неделя'], ['month', 'Месяц']].map(([value, label]) => button(label, () => changePeriod(anchor, value), { key: value, disabled: busy, 'aria-pressed': mode === value }))),
        field('Строки', h('select', { value: axis, disabled: busy, onChange: event => changeAxis(event.target.value) }, h('option', { value: 'driver' }, 'Водители'), h('option', { value: 'vehicle' }, 'Машины')))),
      !loading && otherPlans.length > 0 && h('section', { className: 'planning-documents', 'aria-label': 'Другие планы за период' },
        ...otherPlans.map(document => h('article', { key: document.id, className: 'planning-document surface' },
          h('div', null, h('h3', null, `${dateLabel(document.businessDate)} · ${document.templateSnapshot?.label || 'План рейсов'}`), h('p', null, `Назначений: ${document.rows?.length || 0}`)),
          button('Открыть план', () => openDay(document.businessDate, document.responsibilityScopeId), { disabled: busy })))),
      error && h('div', { className: 'planning-error', role: 'alert' }, h('p', null, error), !denied && button('Загрузить актуальный календарь', reload, { disabled: loading || saving })),
      notice && h('div', { className: 'planning-feedback', role: 'status' }, notice),
      h('div', { className: 'planning-cal-actions' }, button('Копировать', copySelection, { disabled: busy || editDirty || !selection, 'aria-label': 'Копировать выделенные ячейки' }), button('Вставить', pasteSelection, { disabled: busy || editDirty || !clipboard || !selection }), button('Копировать день', () => startDayCopy(activeDate || dates[0]), { disabled: busy || editDirty }), button('Отменить действие', () => { const next = history.at(-1); if (next) { setPlans(next); setHistory(history.slice(0, -1)); setPreview(null); setEdit(null); setNotice('Последнее действие отменено.'); } }, { disabled: busy || editDirty || !history.length }), button('Обновить', reload, { disabled: busy }), h('span', { className: 'planning-cal-total' }, `${dates.length} дн. · ${count} назначений`)),
      oneC?.enabled && !loading && !denied && h(PlanningOneCExport, {
        key: `${scope.responsibilityScopeId}:${dates[0]}`, token, oneC, scopeId: scope.responsibilityScopeId, selectedPlans: oneCPlans, existingPlans: Object.values(plans), options,
        dirty, busy: busy || Boolean(preview) || Boolean(dayCopy), onBusyChange: setOneCSending, onAuthError: reason => fail(reason, 'export'),
        selectionHelp: 'Выделите нужные ячейки или нажмите заголовок дня. В 1С попадут все назначения выделенных ячеек.',
      }, h('div', { className: 'planning-onec-selection' },
        button('Выбрать весь период для 1С', () => { setSelection({ r1: 0, c1: 0, r2: lanes.length - 1, c2: dates.length - 1 }); setEdit(null); }, { className: 'planning-link', disabled: busy || editDirty || !count }),
        button('Снять выделение', () => setSelection(null), { className: 'planning-link', disabled: busy || !selection }))),
      dayCopy && h('div', { className: 'planning-cal-copy-panel surface' }, h('div', { className: 'planning-cal-panel-heading' }, h('h3', null, 'Копирование целого дня'), button('Закрыть', () => setDayCopy(null), { className: 'planning-link' })), field('Копировать с даты', h('select', { value: dayCopy.sourceDate, onChange: event => setDayCopy({ sourceDate: event.target.value, targetDates: dayCopy.targetDates.filter(date => date !== event.target.value) }) }, ...dates.map(date => h('option', { key: date, value: date }, dateLabel(date))))), h('p', { className: 'planning-help' }, 'Выберите даты ниже или нажмите на заголовки дней в календаре. Копируются все назначения выбранного дня.'), h('div', { className: 'planning-cal-day-quick' }, button('Все дни периода', () => setDayCopy({ ...dayCopy, targetDates: dates.filter(date => date !== dayCopy.sourceDate) }), { className: 'planning-link' }), button('Будни', () => setDayCopy({ ...dayCopy, targetDates: dates.filter(date => date !== dayCopy.sourceDate && ![0, 6].includes(new Date(`${date}T12:00:00Z`).getUTCDay())) }), { className: 'planning-link' }), button('Снять выбор', () => setDayCopy({ ...dayCopy, targetDates: [] }), { className: 'planning-link' })), h('div', { className: 'planning-cal-day-checks' }, ...dates.filter(date => date !== dayCopy.sourceDate).map(date => h('label', { key: date }, h('input', { type: 'checkbox', checked: dayCopy.targetDates.includes(date), onChange: () => toggleTarget(date) }), dateLabel(date, { day: '2-digit', month: '2-digit', weekday: 'short' })))), button(`Проверить копирование · ${dayCopy.targetDates.length} дн.`, () => { setPreview({ kind: 'day', sourceDate: dayCopy.sourceDate, targetDates: dayCopy.targetDates }); setPolicy('empty'); }, { className: 'button primary', disabled: !dayCopy.targetDates.length })),
      preview && h('div', { className: 'planning-cal-copy-panel planning-cal-preview surface', role: 'region', 'aria-label': 'Проверка копирования' }, h('div', { className: 'planning-cal-panel-heading' }, h('h3', null, 'Проверка копирования'), button('Отмена', () => setPreview(null), { className: 'planning-link' })), h('p', null, preview.kind === 'day' ? `${dateLabel(preview.sourceDate)} → ${preview.targetDates.map(date => dateLabel(date, { day: '2-digit', month: '2-digit' })).join(', ')}` : 'Выделенный образец будет повторён по выбранным дням и строкам.'), field('Если место назначения уже заполнено', h('select', { value: policy, onChange: event => setPolicy(event.target.value) }, h('option', { value: 'empty' }, 'Копировать только в пустые'), h('option', { value: 'append' }, 'Добавить к существующим'), h('option', { value: 'replace' }, 'Заменить существующие'))), h('p', { className: 'planning-help' }, 'У копий снимаются отметки подтверждения, создания заявки и прибытия. Даты рейсов сдвигаются. При переносе в другую строку связанная машина или водитель и ручные реквизиты прежнего назначения очищаются — выберите их в деталях рейса после копирования. При добавлении в день с другой формой переносятся совместимые поля, форма этого дня сохраняется.'), proposed?.error ? h('p', { className: 'planning-error', role: 'alert' }, proposed.error) : h('p', { className: 'planning-cal-copy-count', 'data-cal-copy-summary': true }, `Будет скопировано: ${proposed?.summary?.copied ?? 0}. Пропущено: ${proposed?.summary?.skipped ?? 0}. Заменено: ${proposed?.summary?.replaced ?? 0}.`), policy === 'replace' && h('p', { className: 'planning-notice' }, 'Назначения в заполненных местах назначения будут заменены. До сохранения действие можно отменить.'), button('Применить копирование', applyPreview, { className: 'button primary', disabled: busy || !proposed || Boolean(proposed.error) })),
      loading ? h('div', { className: 'planning-loading', role: 'status' }, 'Загружаем календарь…') : !denied && h('div', { className: 'planning-cal-scroll', ref: grid, onScroll: () => setHover(null) },
        h('table', { className: 'planning-cal-grid', role: 'grid', 'aria-label': 'Рейсы по дням', 'aria-rowcount': lanes.length + 1, 'aria-colcount': dates.length + 1 },
          h('thead', null, h('tr', null, h('th', { className: 'planning-cal-corner', scope: 'col' }, axis === 'driver' ? 'Водитель / день' : 'Машина / день'), ...dates.map((date, c) => h('th', { key: date, scope: 'col', className: `${[0, 6].includes(new Date(`${date}T12:00:00Z`).getUTCDay()) ? 'is-weekend ' : ''}${dayCopy?.targetDates.includes(date) ? 'is-day-target' : ''}` }, button(dateLabel(date, { weekday: 'short', day: 'numeric', month: 'short' }), () => selectDay(date, c), { className: 'planning-cal-day-header', 'aria-label': `${dayCopy ? 'Копировать на' : 'Выбрать день'} ${date}`, disabled: busy }), h('span', null, `${plans[date]?.rows.length || 0} назнач.`), changedDates.includes(date) && h('i', { title: 'Есть несохранённые изменения', 'aria-label': 'Есть несохранённые изменения' }))))),
          h('tbody', null, ...lanes.map((lane, r) => h('tr', { key: lane.id || 'unassigned' }, h('th', { scope: 'row', className: 'planning-cal-lane' }, h('span', null, lane.label)), ...dates.map((date, c) => {
            const rows = cellRows(plans, date, lane.id, axis);
            const selected = inside(selection, r, c);
            const source = clipboard && inside(clipboard.source, r, c);
            const target = inside(dragTarget || (preview?.kind === 'range' ? preview.target : null), r, c);
            return h('td', { key: date, role: 'gridcell', tabIndex: selection ? r === selection.r1 && c === selection.c1 ? 0 : -1 : r === 0 && c === 0 ? 0 : -1, 'data-cal-row': r, 'data-cal-col': c, 'data-cal-date': date, 'aria-label': `${lane.label}, ${dateLabel(date)}: ${rows.length} назначений`, 'aria-selected': Boolean(selected), className: `planning-cal-cell${selected ? ' is-selected' : ''}${source ? ' is-copy-source' : ''}${target ? ' is-fill-target' : ''}${active?.r === r && active?.c === c ? ' is-active' : ''}`, onPointerDown: event => beginPointer(event, r, c), onPointerEnter: event => showHover(event, r, c), onPointerLeave: () => setHover(null), onFocus: event => showHover(event, r, c), onBlur: () => setHover(null), onKeyDown: event => onKey(event, r, c), onDoubleClick: () => openDay(date) },
              rows.length ? h('div', { className: 'planning-cal-cell-content' }, ...rows.slice(0, 2).map(row => h('div', { key: row.id, className: `planning-cal-trip is-${row.status}` }, h('strong', null, row.departureTime || '—'), h('span', null, axis === 'driver' ? rowLabel(row, options).vehicle : rowLabel(row, options).driver), h('small', null, statusLabel(row.status)))), rows.length > 2 && h('span', { className: 'planning-cal-more' }, `Ещё ${rows.length - 2}`)) : h('span', { className: 'planning-cal-empty', 'aria-hidden': true }, '—'),
              selected && r === selection.r2 && c === selection.c2 && h('button', { type: 'button', className: 'planning-cal-fill-handle', 'aria-label': 'Протянуть выделенные ячейки', title: 'Протяните, чтобы скопировать', onPointerDown: beginFill, onClick: event => event.stopPropagation(), tabIndex: -1, disabled: busy }));
          })))))),
      h('p', { className: 'planning-help planning-cal-instructions' }, 'Мышь: выделите диапазон и протяните за синий угол. Клавиатура: стрелки, Shift + стрелки, Ctrl/⌘ C и V. На телефоне выберите ячейку и используйте кнопки копирования. Нажмите на рейс, чтобы увидеть подробности.'),
      activeDate && activeLane && !denied && h('aside', { className: 'planning-cal-details surface', 'aria-label': 'Детали рейсов' }, h('div', { className: 'planning-cal-panel-heading' }, h('div', null, h('h3', null, dateLabel(activeDate)), h('p', null, activeLane.label)), button('Закрыть детали', () => { if (editDirty && !window.confirm('Закрыть детали и отказаться от неприменённых изменений рейса?')) return; setActive(null); setEdit(null); }, { className: 'planning-link' })), activeRows.length ? h('div', { className: 'planning-cal-detail-list' }, ...activeRows.map(row => rowDetails(row, activeDate))) : h('p', { className: 'planning-help' }, 'Назначений пока нет. Откройте редактор дня, чтобы добавить водителя и машину.'),
        edit && h('form', { className: 'planning-cal-inline-edit', onSubmit: event => { event.preventDefault(); applyEdit(); } }, h('h4', null, 'Изменить рейс'),
          field('Водитель рейса', h('select', { value: edit.driverId || '', disabled: busy, onChange: event => setEdit({ ...edit, driverId: event.target.value || null }) }, h('option', { value: '' }, 'Без водителя'), edit.driverId && !options.drivers.some(item => item.id === edit.driverId) && h('option', { value: edit.driverId }, 'Ранее выбранный водитель недоступен'), ...options.drivers.map(driver => h('option', { key: driver.id, value: driver.id }, driver.name)))),
          field('Машина рейса', h('select', { value: edit.vehicleId || '', disabled: busy, onChange: event => setEdit({ ...edit, vehicleId: event.target.value || null }) }, h('option', { value: '' }, 'Без машины'), edit.vehicleId && !options.vehicles.some(item => item.id === edit.vehicleId) && h('option', { value: edit.vehicleId }, 'Ранее выбранная машина недоступна'), ...options.vehicles.map(vehicle => h('option', { key: vehicle.id, value: vehicle.id }, vehicle.label)))),
          field('Время выхода', h('input', { type: 'time', value: edit.departureTime, onChange: event => setEdit({ ...edit, departureTime: event.target.value }), disabled: busy })), field('Статус', h('select', { value: edit.status, onChange: event => setEdit({ ...edit, status: event.target.value }), disabled: busy }, ...STATUSES.map(([value, label]) => h('option', { key: value, value }, label)))), field('Количество рейсов', h('input', { type: 'number', min: 1, max: 999, value: edit.tripCount, onChange: event => setEdit({ ...edit, tripCount: event.target.value }), disabled: busy })), field('Комментарий', h('textarea', { rows: 3, maxLength: 2000, value: edit.comment, onChange: event => setEdit({ ...edit, comment: event.target.value }), disabled: busy })), h('div', { className: 'planning-cal-actions' }, h('button', { type: 'submit', className: 'button primary', disabled: busy }, 'Применить изменения рейса'), button('Отмена', () => setEdit(null), { disabled: busy }))),
        h('div', { className: 'planning-cal-actions' }, button('Редактировать день', () => openDay(activeDate), { disabled: busy }), button('Копировать этот день', () => startDayCopy(activeDate), { disabled: busy || editDirty }))),
      hover && hoverRows.length > 0 && !preview && !dayCopy && h('div', { role: 'tooltip', className: 'planning-cal-tooltip', style: { left: hover.left, top: hover.top } }, h('strong', { className: 'planning-cal-tooltip-date' }, dateLabel(dates[hover.c])), hoverRows.length > 1 && h('small', { className: 'planning-cal-tooltip-more' }, `Всего назначений: ${hoverRows.length}. Нажмите для просмотра всех.`), rowDetails(hoverRows[0], dates[hover.c], true)));
  };
}
