import {
  PLANNING_TEMPLATES, suggestTemplate, templateFor, tomorrow, newPlanningRow,
  clientValue, exportSections, eligibleRows, adoptTemplate, clientFieldIssues, columnOwner, extraFieldValue, newExtraField, resetReportingFacts,
} from './planning-model.js';
import { FIELD_SOURCES } from './planning-fields.js';
import { createPlanningBuilder } from './planning-builder.js';
import { createPlanningCalendar, createPlanningOneCExport } from './planning-calendar.js';
import { scheduleCompanyRead } from './company-work-request.js';

const STATUSES = [
  ['work', 'В работе'], ['reserve', 'Резерв'], ['paid_reserve', 'Оплачиваемый резерв'],
  ['off', 'Выходной'], ['repair', 'Ремонт'], ['sick', 'Больничный'],
  ['transferred', 'Переброс'], ['cancelled', 'Отмена'],
  ['no_work', 'Нет работы'], ['no_driver', 'Без водителя'], ['crew_shortage', 'Неполный экипаж'], ['failed', 'Срыв'],
];
const FLAGS = [['confirmed', 'Выход подтверждён'], ['requestCreated', 'Заявка создана'], ['arrived', 'Прибыл']];
const TABLE_COLUMNS = [
  ['driverId', 'Водитель'], ['vehicleId', 'Машина'], ['departureTime', 'Время выхода'],
  ['status', 'Статус'], ['tripCount', 'Рейсов'], ...FLAGS, ['comment', 'Комментарий менеджера'],
  ['report:block', 'Блок отчёта'], ['report:fleetType', 'Принадлежность машины'], ['report:managerId', 'Ответственный за выпуск'],
  ['report:cityName', 'Город выпуска'], ['report:clientName', 'Клиент выпуска'],
  ['report:actualTrips', 'Рейсов на линии (факт)'], ['report:crewRequired', 'Требуется в экипаже'], ['report:crewPresent', 'Вышло в экипаже'],
].map(([id, label]) => ({ id, label }));
const DEFAULT_COLUMNS = ['driverId', 'vehicleId', 'departureTime', 'status', 'tripCount', 'confirmed', 'comment'];
const preferencesKey = actorId => `office:planning:view:v1:${encodeURIComponent(actorId)}`;
function readPreferences(actorId) {
  const defaults = { ownerId: actorId || '', layout: 'cards', columns: [...DEFAULT_COLUMNS] };
  if (!actorId || typeof window === 'undefined') return defaults;
  try {
    const saved = JSON.parse(window.localStorage.getItem(preferencesKey(actorId)) || 'null');
    if (saved?.version !== 1 || !Array.isArray(saved.columns)) return defaults;
    const columns = saved.columns.filter(id => typeof id === 'string' && (TABLE_COLUMNS.some(column => column.id === id) || id.startsWith('client:')));
    return { ...defaults, layout: saved.layout === 'table' ? 'table' : 'cards', columns: [...new Set(['driverId', ...columns])] };
  } catch { return defaults; }
}
const MAX_ROWS = 200;
const payload = (plan) => ({
  businessDate: plan.businessDate, responsibilityScopeId: plan.responsibilityScopeId,
  templateId: plan.templateId, templateVersion: plan.templateVersion || 1, rows: plan.rows, version: plan.version,
});
const fingerprint = (plan) => JSON.stringify(payload(plan));

export function createPlanningPanel(React, { request: rawRequest, download }) {
  const request = (path, options = {}, token) => (options.method || 'GET') === 'GET'
    ? scheduleCompanyRead(rawRequest, path, options, token) : rawRequest(path, options, token);
  const { createElement: h, useState, useEffect, useMemo, useRef } = React;
  const PlanningBuilder = createPlanningBuilder(React);
  const PlanningCalendar = createPlanningCalendar(React, { request });
  const PlanningOneCExport = createPlanningOneCExport(React, { request });
  const button = (label, onClick, extra = {}) => h('button', { type: 'button', className: 'button', onClick, ...extra }, label);
  const field = (label, input, hint) => h('label', { className: 'planning-field' }, h('span', null, label), React.cloneElement(input, { 'aria-label': input.props['aria-label'] || label }), hint && h('small', null, hint));

  function RowDialog({ title, onClose, children }) {
    const dialog = useRef(null);
    useEffect(() => {
      const origin = document.activeElement;
      const node = dialog.current;
      node.showModal();
      const overflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        node.close();
        document.body.style.overflow = overflow;
        if (origin?.isConnected) origin.focus({ preventScroll: true });
      };
    }, []);
    return h('dialog', { ref: dialog, className: 'planning-row-dialog', 'aria-labelledby': 'planning-row-dialog-title',
      onCancel: event => { event.preventDefault(); onClose(); },
    }, h('div', { className: 'planning-dialog-heading' }, h('h2', { id: 'planning-row-dialog-title' }, title),
      button('Закрыть', onClose, { 'aria-label': 'Закрыть карточку', className: 'button', autoFocus: true })), children);
  }

  function ExtraFieldAdder({ row, index, context, template, disabled, onAdd }) {
    const [source, setSource] = useState('driver_passport');
    const [label, setLabel] = useState('');
    const [type, setType] = useState('text');
    const [owner, setOwner] = useState('assignment');
    const definition = FIELD_SOURCES.find(item => item.value === source) || FIELD_SOURCES[0];
    const title = label.trim() || (source === 'manual' ? '' : definition.label.replace(/^Ручной ввод: /, ''));
    const preview = extraFieldValue({ source, type: definition.type, owner: definition.owner }, row, context, index, template);
    const full = (row.extraFields || []).length >= 20;
    return h('section', { className: 'planning-extra-adder', 'aria-label': 'Новое поле строки' },
      h('p', { className: 'planning-help' }, 'Поле появится справа только у этого назначения и попадёт в форму клиента.'),
      h('div', { className: 'planning-extra-adder-grid' },
        field('Данные для подстановки', h('select', { value: source, disabled: disabled || full,
          onChange: event => { setSource(event.target.value); setLabel(''); },
        }, ...[['driver', 'Водитель'], ['vehicle', 'Транспорт'], ['assignment', 'Рейс и ручные поля']].map(([group, caption]) => h('optgroup', { key: group, label: caption },
          ...FIELD_SOURCES.filter(item => item.owner === group).map(item => h('option', { key: item.value, value: item.value }, item.label)))))),
        field('Название поля', h('input', { value: label, maxLength: 120, placeholder: source === 'manual' ? 'Например, номер пропуска' : title,
          disabled: disabled || full, onChange: event => setLabel(event.target.value),
        })),
        source === 'manual' && field('Тип поля', h('select', { value: type, disabled, onChange: event => setType(event.target.value) },
          ...[['text', 'Текст'], ['number', 'Число'], ['date', 'Дата'], ['time', 'Время']].map(([value, caption]) => h('option', { key: value, value }, caption)))),
        source === 'manual' && field('Данные относятся к', h('select', { value: owner, disabled, onChange: event => setOwner(event.target.value) },
          ...[['assignment', 'Рейсу'], ['driver', 'Водителю'], ['vehicle', 'Машине']].map(([value, caption]) => h('option', { key: value, value }, caption))))),
      source !== 'manual' && h('p', { className: 'planning-extra-preview' }, h('span', null, 'Подстановка: '), preview || 'Данных пока нет — значение можно будет ввести вручную.'),
      full && h('p', { className: 'planning-help', role: 'status' }, 'В строке можно добавить до 20 полей.'),
      button('Добавить поле', () => {
        if (disabled || full || !title) return;
        onAdd({ ...newExtraField(source), label: title, ...(source === 'manual' ? { type, owner } : {}) });
        setLabel('');
      }, { className: 'button primary', disabled: disabled || full || !title }));
  }

  function SearchPicker({ label, value, options, onChange, disabled, emptyLabel, compact = false, ariaLabel = label }) {
    const [query, setQuery] = useState('');
    const [searching, setSearching] = useState(false);
    const selectedExists = options.some((item) => item.id === value);
    const filtered = options.filter((item) => item.id === value || item.label.toLocaleLowerCase('ru').includes(query.toLocaleLowerCase('ru')));
    return h('div', { className: 'planning-picker' },
      h('div', { className: 'planning-picker-heading' },
        h('span', { className: compact ? 'visually-hidden' : undefined }, label),
        button(searching ? 'Скрыть поиск' : 'Поиск', () => { setSearching(!searching); setQuery(''); }, {
          className: 'planning-link', disabled, 'aria-expanded': searching, 'aria-label': `${searching ? 'Скрыть поиск' : 'Поиск'}: ${ariaLabel.toLowerCase()}`,
        })),
      searching && h('input', { type: 'search', value: query, onChange: (event) => setQuery(event.target.value), placeholder: `Найти: ${label.toLowerCase()}`, 'aria-label': `Поиск: ${ariaLabel.toLowerCase()}`, autoFocus: true, disabled }),
      h('select', { value: value || '', 'aria-label': ariaLabel, onChange: (event) => onChange(event.target.value || null), disabled },
        h('option', { value: '' }, emptyLabel),
        value && !selectedExists && h('option', { value }, 'Ранее выбранная запись недоступна'),
        ...filtered.map((item) => h('option', { key: item.id, value: item.id }, item.label))),
      searching && !filtered.length && h('small', null, 'Совпадений нет'));
  }

  function PlanningPanel({ token, actor, onExpired, onDirtyChange }) {
    const [scopes, setScopes] = useState([]);
    const [templates, setTemplates] = useState([]);
    const [defaultTemplateId, setDefaultTemplateId] = useState(null);
    const [builderInitial, setBuilderInitial] = useState(null);
    const [builderDirty, setBuilderDirty] = useState(false);
    const [builderSaving, setBuilderSaving] = useState(false);
    const [builderError, setBuilderError] = useState(null);
    const [savedForm, setSavedForm] = useState(null);
    const [calendarOpen, setCalendarOpen] = useState(false);
    const [calendarDirty, setCalendarDirty] = useState(false);
    const [selection, setSelection] = useState(null);
    const [options, setOptions] = useState({ drivers: [], vehicles: [] });
    const [reportDefaults, setReportDefaults] = useState({ block: '', managerId: '', cityName: '', clientName: '' });
    const [catalogs, setCatalogs] = useState([]);
    const [newAssignment, setNewAssignment] = useState(null);
    const pendingAssignment = useRef(null);
    const [plan, setPlan] = useState(null);
    const [dailyPlans, setDailyPlans] = useState([]);
    const [savedSnapshot, setSavedSnapshot] = useState('');
    const [contextLoading, setContextLoading] = useState(true);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [refreshingOptions, setRefreshingOptions] = useState(false);
    const [error, setError] = useState(null);
    const [message, setMessage] = useState('');
    const [view, setView] = useState('assignments');
    const [preferences, setPreferences] = useState(() => readPreferences(actor?.id));
    const [columnsOpen, setColumnsOpen] = useState(false);
    const [rowDialog, setRowDialog] = useState(null);
    const [storageError, setStorageError] = useState(false);
    const columnsButton = useRef(null);
    const [filter, setFilter] = useState('');
    const [reloadKey, setReloadKey] = useState(0);
    const [contextKey, setContextKey] = useState(0);
    const [exporting, setExporting] = useState(false);
    const [oneC, setOneC] = useState(null);
    const [oneCSending, setOneCSending] = useState(false);
    const [oneCSelected, setOneCSelected] = useState([]);
    const callbacks = useRef({ onExpired, onDirtyChange });
    const requestSequence = useRef(0);
    const mounted = useRef(true);
    callbacks.current = { onExpired, onDirtyChange };
    const dirty = Boolean(plan && savedSnapshot && fingerprint(plan) !== savedSnapshot);
    const dirtyRef = useRef(dirty);
    dirtyRef.current = dirty || builderDirty || calendarDirty;
    const scope = scopes.find((item) => item.responsibilityScopeId === selection?.scopeId);
    const template = plan ? plan.templateSnapshot || templateFor(plan.templateId) : null;
    const currentPreferences = preferences.ownerId === (actor?.id || '') ? preferences : readPreferences(actor?.id);
    const tableColumns = useMemo(() => {
      const seen = new Set();
      return [...TABLE_COLUMNS, ...(template?.sections || []).flatMap(section => section.columns.filter(column => {
        if (seen.has(column.key)) return false;
        seen.add(column.key);
        return true;
      }).map(column => ({ id: `client:${template.id}:${column.key}`, label: column.label, column })))];
    }, [template]);
    const visibleColumns = tableColumns.filter(column => currentPreferences.columns.includes(column.id));
    const busy = contextLoading || loading || saving || exporting || refreshingOptions || builderSaving || oneCSending;
    const formChoices = template && !templates.some(item => item.id === template.id && item.version === (template.version || 1)) ? [...templates, template] : templates;
    const context = useMemo(() => ({ businessDate: plan?.businessDate, scope, drivers: options.drivers, vehicles: options.vehicles }), [plan?.businessDate, scope, options]);
    const outputRows = useMemo(() => eligibleRows(plan?.rows || []), [plan?.rows]);
    const fieldIssues = useMemo(() => template ? clientFieldIssues(template, plan.rows, context) : [], [template, plan?.rows, context]);
    const sections = useMemo(() => template ? exportSections(template, plan.rows, context) : [], [template, plan?.rows, context]);
    const driverOptions = useMemo(() => options.drivers.map((driver) => ({ id: driver.id, label: driver.name })), [options.drivers]);
    const vehicleOptions = useMemo(() => options.vehicles.map((vehicle) => ({ id: vehicle.id, label: [vehicle.label, ({ refrigerated: 'Рефрижератор', box: 'Фургон' })[vehicle.bodyType]].filter(Boolean).join(' · ') })), [options.vehicles]);
    const invalidExportRows = outputRows.filter((row) =>
      !options.drivers.some((driver) => driver.id === row.driverId)
      || !options.vehicles.some((vehicle) => vehicle.id === row.vehicleId)
      || !/^([01]\d|2[0-3]):[0-5]\d$/.test(row.departureTime || ''));
    const stats = useMemo(() => ({
      assigned: plan?.rows.length || 0,
      trips: outputRows.reduce((sum, row) => sum + Number(row.tripCount || 1), 0),
      confirmed: outputRows.filter((row) => row.confirmed).length,
      reserve: (plan?.rows || []).filter((row) => ['reserve', 'paid_reserve'].includes(row.status)).length,
    }), [plan?.rows, outputRows]);

    useEffect(() => {
      mounted.current = true;
      return () => { mounted.current = false; requestSequence.current += 1; callbacks.current.onDirtyChange?.(false); };
    }, []);
    useEffect(() => { setPreferences(readPreferences(actor?.id)); setColumnsOpen(false); }, [actor?.id]);
    useEffect(() => { setReportDefaults({ block: '', managerId: '', cityName: '', clientName: '' }); }, [selection?.scopeId, selection?.date]);
    useEffect(() => {
      if (!actor?.id || preferences.ownerId !== actor.id) return;
      try {
        window.localStorage.setItem(preferencesKey(actor.id), JSON.stringify({ version: 1, layout: preferences.layout, columns: preferences.columns }));
        setStorageError(false);
      } catch { setStorageError(true); }
    }, [actor?.id, preferences]);
    useEffect(() => { callbacks.current.onDirtyChange?.(dirty || builderDirty || calendarDirty); }, [dirty, builderDirty, calendarDirty]);
    useEffect(() => {
      const protect = (event) => {
        if (dirtyRef.current) { event.preventDefault(); event.returnValue = ''; }
      };
      window.addEventListener('beforeunload', protect);
      return () => window.removeEventListener('beforeunload', protect);
    }, []);

    function fail(reason, phase) {
      if (reason?.name === 'AbortError') return;
      if ([401, 403].includes(reason?.status)) {
        requestSequence.current += 1;
        setPlan(null);
        setDailyPlans([]);
        setCatalogs([]);
        setNewAssignment(null);
        pendingAssignment.current = null;
        setOptions({ drivers: [], vehicles: [] });
        setSavedSnapshot('');
        setTemplates([]);
        setBuilderInitial(null);
        setBuilderDirty(false);
        setSavedForm(null);
        setCalendarOpen(false);
        setCalendarDirty(false);
        setMessage('');
        setFilter('');
        setLoading(false);
        setSaving(false);
        setRefreshingOptions(false);
        setOneC(null);
        setOneCSelected([]);
      }
      if (reason?.status === 401) callbacks.current.onExpired?.();
      const text = reason?.status === 401 ? 'Сессия закончилась. Войдите снова.'
        : reason?.status === 403 ? 'У вас нет доступа к этому плану.'
          : reason?.status === 409 ? 'План уже изменил другой менеджер. Ваши изменения сохранены на экране. Скопируйте нужные данные или загрузите актуальный план.'
            : phase === 'save' && reason?.status === 400 ? (reason.message || 'Проверьте назначения и поля клиентской формы. Водитель или машина могли стать недоступны: обновите справочники и выберите доступные записи. Ваши изменения остались на экране.')
              : phase === 'save' && reason?.status === 413 ? 'Объём плана превышает допустимый размер. Сократите длинные комментарии и дополнительные сведения или количество назначений, затем сохраните план. Ваши изменения остались на экране.'
                : phase === 'options' ? 'Не удалось обновить водителей и машины. Ваш план остался на экране. Проверьте соединение и повторите обновление справочников.'
            : phase === 'save' ? 'Не удалось сохранить план. Ваши изменения остались на экране. Попробуйте ещё раз.'
              : 'Не удалось загрузить планирование. Проверьте соединение и повторите попытку.';
      setError({ text, phase, status: reason?.status });
    }

    useEffect(() => {
      const controller = new AbortController();
      let active = true;
      setContextLoading(true);
      setError(null);
      request('/planning/context', { signal: controller.signal }, token).then(async (result) => {
        if (!active) return;
        setOneC(result.oneC?.enabled ? result.oneC : null);
        const available = result.scopes || [];
        const resources = await Promise.all(available.map(async (scope) => ({ scope, ...await request(`/planning/options?responsibilityScopeId=${encodeURIComponent(scope.responsibilityScopeId)}`, { signal: controller.signal }, token) })));
        if (!active) return;
        // Prefer the populated operational catalog; keep API order for ties (1C first).
        resources.sort((a, b) => ((b.drivers?.length || 0) + (b.vehicles?.length || 0)) - ((a.drivers?.length || 0) + (a.vehicles?.length || 0)));
        setCatalogs(resources); setScopes(resources.map(item => item.scope));
        pendingAssignment.current = null; setNewAssignment(null);
        const requestedScope = new URLSearchParams(window.location.search).get('planningScope');
        const first = available.find(item => item.responsibilityScopeId === requestedScope) || resources[0]?.scope;
        setSelection(first ? { scopeId: first.responsibilityScopeId, date: tomorrow(first.timeZone) } : null);
      }).catch((reason) => { if (active) fail(reason, 'context'); }).finally(() => { if (active) setContextLoading(false); });
      return () => { active = false; controller.abort(); };
    }, [token, contextKey]);

    useEffect(() => {
      if (!selection) return;
      const controller = new AbortController();
      const sequence = ++requestSequence.current;
      const current = () => mounted.current && sequence === requestSequence.current;
      setLoading(true);
      setPlan(null);
      setRowDialog(null);
      setSavedSnapshot('');
      setOneCSelected([]);
      setBuilderInitial(null);
      setBuilderDirty(false);
      setSavedForm(null);
      setError(null);
      setMessage('');
      setDailyPlans([]);
      // A document keeps its original access context, but the workspace finds it
      // across every permitted context without asking the user to pick a database.
      Promise.all(scopes.map((item) => request(`/planning?date=${encodeURIComponent(selection.date)}&responsibilityScopeId=${encodeURIComponent(item.responsibilityScopeId)}`, { signal: controller.signal }, token))).then(async (documents) => {
        if (!current()) return;
        const saved = documents.filter((document) => document.id);
        const pending = pendingAssignment.current;
        const document = pending?.scopeId === selection.scopeId
          ? documents.find((item) => item.responsibilityScopeId === selection.scopeId)
          : saved.find((item) => item.responsibilityScopeId === selection.scopeId) || saved[0]
            || documents.find((item) => item.responsibilityScopeId === selection.scopeId) || documents[0];
        if (!document) throw new Error('План недоступен');
        setDailyPlans(saved);
        if (document.responsibilityScopeId !== selection.scopeId) {
          setSelection((previous) => ({ ...previous, scopeId: document.responsibilityScopeId }));
          return;
        }
        const query = `responsibilityScopeId=${encodeURIComponent(document.responsibilityScopeId)}`;
        const [choices, forms] = await Promise.all([
          request(`/planning/options?${query}`, { signal: controller.signal }, token),
          request(`/planning/templates?${query}`, { signal: controller.signal }, token),
        ]);
        if (!current()) return;
        const chosenScope = scopes.find((item) => item.responsibilityScopeId === document.responsibilityScopeId);
        const catalog = forms.templates || [];
        const selectedForm = document.templateSnapshot || catalog.find(item => item.id === (document.templateId || forms.defaultTemplateId || suggestTemplate(chosenScope?.projectName, chosenScope?.regionName)));
        if (!selectedForm) throw new Error('Форма плана недоступна');
        const next = {
          ...document, businessDate: selection.date, responsibilityScopeId: selection.scopeId,
          templateId: selectedForm.id, templateVersion: selectedForm.version || 1, templateSnapshot: selectedForm,
          rows: (document.rows || []).map((row) => ({ ...row, clientFields: { ...(row.clientFields || {}) } })),
          version: document.version || 0,
        };
        setOptions({ drivers: choices.drivers || [], vehicles: choices.vehicles || [], managers: choices.managers || [] });
        setTemplates(catalog);
        setDefaultTemplateId(forms.defaultTemplateId);
        setSavedSnapshot(fingerprint(next));
        if (pending?.scopeId === next.responsibilityScopeId) {
          if (next.rows.length >= MAX_ROWS) { pendingAssignment.current = null; throw new Error('В плане уже 200 назначений'); }
          setPlan({ ...next, rows: [...next.rows, { ...newPlanningRow(), driverId: pending.driverId }] });
          pendingAssignment.current = null;
        } else setPlan(next);
      }).catch((reason) => { if (current()) fail(reason, 'load'); }).finally(() => { if (current()) setLoading(false); });
      return () => { controller.abort(); if (sequence === requestSequence.current) requestSequence.current += 1; };
    }, [selection?.scopeId, selection?.date, token, reloadKey]);

    function switchSelection(next) {
      if (!next.date || next.date === selection.date && next.scopeId === selection.scopeId) return;
      if (dirtyRef.current && !window.confirm('Есть несохранённые изменения плана или формы. Перейти к другому плану и отказаться от этих изменений?')) return;
      setSelection(next.date === selection.date ? next : { ...next, scopeId: scopes[0]?.responsibilityScopeId || next.scopeId });
      setFilter('');
    }
    function reload() {
      if (dirtyRef.current && !window.confirm('Загрузить актуальный план? Несохранённые изменения плана и формы на экране будут заменены.')) return;
      setReloadKey((key) => key + 1);
    }
    function changeRow(id, changes) {
      if (oneCSending) return;
      setPlan((previous) => ({ ...previous, rows: previous.rows.map((row) => row.id === id ? { ...row, ...changes } : row) }));
      setMessage('');
    }
    function changeAssignment(row, kind, value) {
      if (row[kind] === value) return;
      const owner = kind === 'driverId' ? 'driver' : 'vehicle';
      const keys = new Set([...PLANNING_TEMPLATES, ...templates, template].filter(Boolean).flatMap(item => item.sections.flatMap(section => section.columns)).filter(column => columnOwner(column) === owner).map(column => column.key));
      const overrides = Object.keys(row.clientFields).filter((key) => keys.has(key));
      const extraOverrides = (row.extraFields || []).filter(item => columnOwner(item) === owner && Object.hasOwn(item, 'value'));
      if (overrides.length || extraOverrides.length) {
        const prompt = kind === 'driverId'
          ? 'Сменить водителя? Ручные сведения о прежнем водителе, включая документы и телефон, будут удалены из всех клиентских форм этого назначения.'
          : 'Сменить машину? Ручные сведения о прежней машине будут удалены из всех клиентских форм этого назначения.';
        if (!window.confirm(prompt)) return;
      }
      const clientFields = { ...row.clientFields };
      for (const key of overrides) delete clientFields[key];
      const extraFields = (row.extraFields || []).map(item => {
        if (columnOwner(item) !== owner) return item;
        const { value: previousValue, ...linked } = item;
        return linked;
      });
      changeRow(row.id, { [kind]: value, clientFields, extraFields, confirmed: false, arrived: false, requestCreated: false,
        ...(row.reporting ? { reporting: resetReportingFacts(row.reporting, kind === 'vehicleId') } : {}) });
    }
    function clientChange(row, key, value) {
      if (!Object.prototype.hasOwnProperty.call(row.clientFields, key) && Object.keys(row.clientFields).length >= 50) {
        setMessage('В одном назначении можно сохранить до 50 ручных уточнений. Верните подстановку в ненужных полях, включая поля ранее выбранной формы.');
        return;
      }
      changeRow(row.id, { clientFields: { ...row.clientFields, [key]: value } });
    }
    function resetOverride(row, key) {
      const next = { ...row.clientFields };
      delete next[key];
      changeRow(row.id, { clientFields: next });
    }
    function changeExtraField(row, id, value, reset = false) {
      changeRow(row.id, { extraFields: (row.extraFields || []).map(item => {
        if (item.id !== id) return item;
        const { value: previousValue, ...linked } = item;
        return reset ? linked : { ...linked, value };
      }) });
    }
    function openRow(row, mode = 'edit') {
      if (!busy) setRowDialog({ rowId: row.id, mode });
    }
    function rowOpenEvents(row, index) {
      return {
        tabIndex: 0, 'aria-label': `Открыть карточку назначения ${index + 1}`, 'aria-haspopup': 'dialog',
        onClick: event => {
          if (event.target.closest('button,input,select,textarea,a,label,summary')) return;
          if (window.getSelection()?.toString()) return;
          openRow(row);
        },
        onKeyDown: event => {
          if (event.target !== event.currentTarget || !['Enter', ' '].includes(event.key)) return;
          event.preventDefault();
          openRow(row);
        },
      };
    }
    function addRow() {
      if (!plan || busy || plan.rows.length >= MAX_ROWS) return;
      if (catalogs.length > 1) { setNewAssignment({ driverId: '' }); return; }
      appendAssignment(null);
    }
    function appendAssignment(driverId) {
      const ownCatalog = catalogs.find(item => item.scope.responsibilityScopeId === plan.responsibilityScopeId);
      const target = !driverId || ownCatalog?.drivers.some(item => item.id === driverId) ? ownCatalog : catalogs.find(item => item.drivers.some(driver => driver.id === driverId));
      const targetScope = target?.scope.responsibilityScopeId || plan.responsibilityScopeId;
      if (targetScope !== plan.responsibilityScopeId) {
        if (dirtyRef.current) { setNewAssignment(null); setMessage('Сохраните текущий план, затем добавьте выбранного водителя.'); return; }
        pendingAssignment.current = { scopeId: targetScope, driverId };
        setSelection(previous => ({ ...previous, scopeId: targetScope }));
      } else setPlan((previous) => ({ ...previous, rows: [...previous.rows, { ...newPlanningRow(), driverId }] }));
      setNewAssignment(null); setFilter(''); setView('assignments'); setMessage('');
    }
    function removeRow(row, index) {
      if (oneCSending) return;
      if (!window.confirm(`Удалить назначение № ${index + 1} из плана?`)) return;
      setPlan((previous) => ({ ...previous, rows: previous.rows.filter((item) => item.id !== row.id) }));
      setOneCSelected(previous => previous.filter(id => id !== row.id));
      if (rowDialog?.rowId === row.id) setRowDialog(null);
      setMessage('');
    }
    function changeTemplate(value) {
      const selected = typeof value === 'object' ? value : formChoices.find(item => `${item.id}@${item.version || 1}` === value);
      if (!selected || selected.id === plan.templateId && (selected.version || 1) === (plan.templateVersion || 1)) return;
      if (plan.rows.length && !window.confirm('Применить выбранную форму? Назначения сохранятся. Ручные значения удалённых полей и полей с изменённым источником, типом или принадлежностью будут очищены.')) return;
      setPlan((previous) => adoptTemplate(previous, selected));
      setMessage('');
    }
    function openBuilder() {
      if (!plan || busy) return;
      const latest = templates.find(item => item.id === template.id) || template;
      setBuilderInitial({ ...latest, isDefault: latest.id === defaultTemplateId });
      setBuilderError(null);
      setBuilderDirty(false);
    }
    function openCalendar() {
      if (!scope || busy) return;
      if (dirty && !window.confirm('Открыть календарь без сохранения изменений текущего дня? Несохранённые изменения этого дня будут потеряны.')) return;
      setPlan(null);
      setSavedSnapshot('');
      setError(null);
      setMessage('');
      setCalendarOpen(true);
      setCalendarDirty(false);
    }
    function closeCalendar(date, scopeId) {
      setCalendarOpen(false);
      setCalendarDirty(false);
      if (date) setSelection(previous => ({ ...previous, date, scopeId: scopeId || previous.scopeId }));
      setReloadKey(key => key + 1);
    }
    async function saveForm(input) {
      if (!plan || busy) return false;
      const sequence = requestSequence.current;
      setBuilderSaving(true);
      setBuilderError(null);
      try {
        const result = await request('/planning/templates', { method: 'PUT', body: JSON.stringify({ ...input, responsibilityScopeId: plan.responsibilityScopeId }) }, token);
        if (!mounted.current || sequence !== requestSequence.current) return false;
        setTemplates(previous => [...previous.filter(item => item.id !== result.template.id), result.template]);
        setDefaultTemplateId(result.defaultTemplateId);
        setSavedForm(result.template);
        return { ...result.template, isDefault: result.defaultTemplateId === result.template.id };
      } catch (reason) {
        if (mounted.current && sequence === requestSequence.current) {
          if ([401, 403].includes(reason?.status)) fail(reason, 'forms');
          else setBuilderError({ text: reason?.status === 409 ? 'Другой менеджер уже сохранил новую версию. Обновите список форм; ваш черновик остаётся в конструкторе, его можно сохранить как копию.'
            : reason?.status === 400 ? 'Проверьте названия, типы полей и значения по умолчанию. В форме допускается до 50 полей и 6 разделов.'
              : reason?.status === 413 ? 'Форма слишком большая. Сократите значения по умолчанию и подсказки.' : 'Не удалось сохранить форму. Черновик остался на экране. Проверьте соединение и повторите попытку.' });
        }
        return false;
      } finally { if (mounted.current) setBuilderSaving(false); }
    }
    async function refreshForms() {
      if (!plan || busy) return;
      const sequence = requestSequence.current;
      setBuilderSaving(true);
      try {
        const result = await request(`/planning/templates?responsibilityScopeId=${encodeURIComponent(plan.responsibilityScopeId)}`, {}, token);
        if (!mounted.current || sequence !== requestSequence.current) return;
        setTemplates(result.templates);
        setDefaultTemplateId(result.defaultTemplateId);
        setBuilderError({ text: 'Список обновлён. Черновик сохранён на экране. Можно открыть актуальную форму или сохранить изменения как копию.' });
      } catch (reason) {
        if (mounted.current && sequence === requestSequence.current) {
          if ([401, 403].includes(reason?.status)) fail(reason, 'forms');
          else setBuilderError({ text: 'Не удалось обновить список форм. Проверьте соединение.' });
        }
      } finally { if (mounted.current) setBuilderSaving(false); }
    }
    async function save() {
      if (!plan || busy) return;
      const sequence = requestSequence.current;
      const submitted = payload(plan);
      setSaving(true);
      setError(null);
      setMessage('');
      try {
        const result = await request('/planning', { method: 'PUT', body: JSON.stringify(submitted) }, token);
        if (!mounted.current || sequence !== requestSequence.current) return;
        const next = { ...plan, ...result, rows: result.rows || submitted.rows };
        setPlan(next);
        setDailyPlans((previous) => previous.some((item) => item.responsibilityScopeId === next.responsibilityScopeId) ? previous.map((item) => item.responsibilityScopeId === next.responsibilityScopeId ? next : item) : [...previous, next]);
        setSavedSnapshot(fingerprint(next));
        setMessage('План сохранён');
      } catch (reason) { if (mounted.current && sequence === requestSequence.current) fail(reason, 'save'); }
      finally { if (mounted.current) setSaving(false); }
    }
    async function refreshOptions() {
      if (!plan || busy) return;
      const sequence = requestSequence.current;
      setRefreshingOptions(true);
      setMessage('');
      try {
        const result = await request(`/planning/options?responsibilityScopeId=${encodeURIComponent(plan.responsibilityScopeId)}`, {}, token);
        if (!mounted.current || sequence !== requestSequence.current) return;
        setOptions({ drivers: result.drivers || [], vehicles: result.vehicles || [], managers: result.managers || [] });
        setMessage('Справочники обновлены. Проверьте выбранных водителей и машины, затем сохраните план.');
      } catch (reason) {
        if (mounted.current && sequence === requestSequence.current) fail(reason, 'options');
      } finally { if (mounted.current) setRefreshingOptions(false); }
    }
    async function exportSection(section, mode) {
      if (!plan || invalidExportRows.length || fieldIssues.length || !outputRows.length || busy) return;
      const sequence = requestSequence.current;
      let accessChecked = false;
      setExporting(true);
      setMessage('');
      try {
        const access = await request('/planning/context', {}, token);
        if (!mounted.current || sequence !== requestSequence.current) return;
        if (!(access.scopes || []).some((item) => item.responsibilityScopeId === plan.responsibilityScopeId)) {
          fail({ status: 403 }, 'export');
          return;
        }
        accessChecked = true;
        const content = template.kind === 'text' ? section.text : mode === 'copy' ? section.tsv : section.csv;
        if (mode === 'copy') {
          await navigator.clipboard.writeText(content);
          setMessage(template.kind === 'text' ? 'Текст скопирован' : 'Таблица скопирована. Её можно вставить в Excel или Google Sheets.');
        } else {
          const name = `${plan.businessDate} ${scope?.projectName || 'Планирование'} ${section.label || template.label}`.replace(/[\\/:*?"<>|]/g, '-');
          await download(`${name}.${template.kind === 'text' ? 'txt' : 'csv'}`, content, template.kind === 'text' ? 'text/plain;charset=utf-8' : 'text/csv;charset=utf-8', token);
          setMessage('Файл формы подготовлен');
        }
      } catch (reason) {
        if (!mounted.current || sequence !== requestSequence.current) return;
        if ([401, 403].includes(reason?.status)) fail(reason, 'export');
        else if (!accessChecked) setMessage('Не удалось проверить доступ к плану. Выгрузка отменена. Проверьте соединение и повторите попытку.');
        else setMessage(mode === 'copy' ? 'Не удалось скопировать. Скачайте форму файлом.' : 'Не удалось подготовить файл. Попробуйте ещё раз.');
      } finally { if (mounted.current) setExporting(false); }
    }

    function renderClientCell(row, index, column, compact = false) {
      const overridden = Object.prototype.hasOwnProperty.call(row.clientFields, column.key);
      const input = h('input', {
        type: ['date', 'time'].includes(column.type) ? column.type : 'text', value: clientValue(template, column, row, context, index) ?? '', maxLength: 2000,
        inputMode: column.type === 'number' ? 'decimal' : undefined, 'aria-required': Boolean(column.required),
        'aria-label': compact ? `${column.label}, назначение ${index + 1}` : column.label,
        'aria-invalid': fieldIssues.some(issue => issue.rowId === row.id && issue.key === column.key),
        placeholder: column.hint || 'Не заполнено', title: [column.required ? 'Обязательное поле' : '', column.hint].filter(Boolean).join(' · ') || undefined,
        onChange: (event) => clientChange(row, column.key, event.target.value), disabled: saving || exporting || oneCSending,
      });
      return h('div', { key: column.key, className: 'planning-client-cell' },
        compact ? input : field(column.label, input, [column.required ? 'Обязательное поле' : '', column.hint].filter(Boolean).join(' · ')),
        overridden && button('Вернуть подстановку', () => resetOverride(row, column.key), {
          className: 'planning-link', disabled: saving || exporting || oneCSending,
          'aria-label': compact ? `Вернуть подстановку: ${column.label}, назначение ${index + 1}` : undefined,
        }));
    }

    function renderClientFields(row, index) {
      const seen = new Set();
      return h('details', { className: 'planning-client-details' },
        h('summary', null, h('span', null, 'Поля для клиента'), h('small', null, template.label)),
        h('p', { className: 'planning-help' }, 'Данные из назначения подставляются автоматически. Любое поле можно уточнить для клиентской формы.'),
        ...template.sections.map((section) => {
          const columns = section.columns.filter((column) => {
            if (seen.has(column.key)) return false;
            seen.add(column.key);
            return true;
          });
          if (!columns.length) return null;
          return h('section', { key: section.id, className: 'planning-client-section' },
            template.sections.length > 1 && h('h4', null, section.label),
            h('div', { className: 'planning-client-grid' }, ...columns.map(column => renderClientCell(row, index, column))));
        }));
    }

    function renderExtraFields(row, index, compact = false) {
      return h('div', { className: compact ? 'planning-row-extras is-inline' : 'planning-row-extras', 'aria-label': `Дополнительные поля назначения ${index + 1}` },
        ...(row.extraFields || []).map(item => {
          const overridden = Object.hasOwn(item, 'value');
          const value = extraFieldValue(item, row, context, index, template);
          const source = FIELD_SOURCES.find(entry => entry.value === item.source);
          const issue = fieldIssues.find(entry => entry.rowId === row.id && entry.extraFieldId === item.id);
          return h('div', { className: 'planning-extra-cell', key: item.id },
            field(item.label, h('input', {
              type: ['date', 'time'].includes(item.type) ? item.type : 'text', value: value ?? '', maxLength: 2000,
              inputMode: item.type === 'number' ? 'decimal' : undefined,
              'aria-label': `${item.label}, дополнительное поле, назначение ${index + 1}`,
              'aria-invalid': Boolean(issue), disabled: busy,
              placeholder: item.source === 'manual' ? 'Введите значение' : 'Нет данных в справочнике',
              onChange: event => changeExtraField(row, item.id, event.target.value),
            }), issue?.message || (overridden ? 'Уточнено для этой строки' : item.source === 'manual' ? 'Ручное поле' : source?.label.replace(/^Ручной ввод: /, ''))),
            h('div', { className: 'planning-extra-actions' },
              overridden && item.source !== 'manual' && button('Вернуть подстановку', () => changeExtraField(row, item.id, undefined, true), {
                className: 'planning-link', disabled: busy, 'aria-label': `Вернуть подстановку: ${item.label}, дополнительное поле, назначение ${index + 1}`,
              }),
              button('Удалить поле', () => changeRow(row.id, { extraFields: row.extraFields.filter(entry => entry.id !== item.id) }), {
                className: 'planning-link planning-remove', disabled: busy, 'aria-label': `Удалить поле: ${item.label}, назначение ${index + 1}`,
              })));
        }));
    }

    function renderRowDialog() {
      const index = plan?.rows.findIndex(row => row.id === rowDialog?.rowId) ?? -1;
      if (index < 0) return null;
      const row = plan.rows[index];
      const adding = rowDialog.mode === 'add';
      return h(RowDialog, { key: row.id, title: adding ? `Добавить поле · назначение ${index + 1}` : `Карточка назначения ${index + 1}`, onClose: () => setRowDialog(null) },
        error && h('div', { className: 'planning-error', role: 'alert' }, error.text),
        adding ? h(ExtraFieldAdder, { row, index, context, template, disabled: busy,
          onAdd: item => { changeRow(row.id, { extraFields: [...(row.extraFields || []), item] }); setRowDialog(null); },
        }) : h(React.Fragment, null,
          renderRow(row, index, true),
          h('footer', { className: 'planning-dialog-footer' }, h('span', { className: 'planning-help', role: 'status' }, dirty ? 'Есть несохранённые изменения' : 'Все изменения сохранены'),
            button('Готово', () => setRowDialog(null)),
            button(saving ? 'Сохраняем…' : 'Сохранить план', save, { className: 'button primary', disabled: busy || !dirty && Boolean(plan.id) }))));
    }

    function updatePreferences(patch) {
      setPreferences(previous => ({ ...(previous.ownerId === (actor?.id || '') ? previous : readPreferences(actor?.id)), ...patch }));
    }
    function closeColumns() {
      setColumnsOpen(false);
      columnsButton.current?.focus();
    }
    function renderColumnSettings() {
      return h('section', {
        id: 'planning-column-settings', className: 'planning-column-settings surface', role: 'region', 'aria-label': 'Настройка колонок',
        onKeyDown: event => { if (event.key === 'Escape') { event.preventDefault(); closeColumns(); } },
      },
      h('div', { className: 'planning-column-heading' }, h('h3', null, 'Колонки таблицы'), button('Готово', closeColumns)),
      h('p', { className: 'planning-help' }, storageError ? 'Настройки действуют до закрытия раздела: браузер не разрешает их сохранить.' : 'Выберите видимые колонки. Настройки сохраняются для вас в этом браузере.'),
      ...[['Назначение', tableColumns.filter(column => !column.column)], ['Поля клиента', tableColumns.filter(column => column.column)]].map(([label, columns]) => columns.length > 0 && h('fieldset', { key: label, className: 'planning-column-group' },
        h('legend', null, label),
        h('div', { className: 'planning-column-options' }, ...columns.map(column => h('label', { key: column.id },
          h('input', {
            type: 'checkbox', checked: currentPreferences.columns.includes(column.id), disabled: column.id === 'driverId', 'aria-label': column.label,
            onChange: event => updatePreferences({ columns: event.target.checked ? [...currentPreferences.columns, column.id] : currentPreferences.columns.filter(id => id !== column.id) }),
          }), h('span', null, column.label, column.id === 'driverId' && h('small', null, 'Всегда виден'))))))),
      button('По умолчанию', () => updatePreferences({ columns: [...DEFAULT_COLUMNS, ...currentPreferences.columns.filter(id => id.startsWith('client:') && !tableColumns.some(column => column.id === id))] }), { className: 'planning-link' }));
    }

    function reportingControl(row, key, props = {}) {
      const value = row.reporting?.[key] ?? '';
      const update = value => changeRow(row.id, { reporting: { ...row.reporting, [key]: value } });
      if (key === 'cityName' || key === 'clientName') return h('input', { ...props, value, maxLength: 100,
        placeholder: key === 'cityName' ? scope?.regionName || 'Город из области' : scope?.projectName || 'Клиент из области', onChange: event => update(event.target.value) });
      if (key === 'block' || key === 'fleetType' || key === 'managerId') {
        const choices = key === 'block' ? [['crew', 'Экипажный'], ['city', 'Городская доставка']]
          : key === 'fleetType' ? [['own', 'Собственный'], ['subcontracted', 'Наёмный']]
            : (options.managers || []).map(person => [person.id, person.name]);
        return h('select', { ...props, value, onChange: event => update(event.target.value || null) },
          h('option', { value: '' }, key === 'fleetType' ? 'Из справочника / не указано' : 'Не указано'),
          value && !choices.some(([id]) => id === value) && h('option', { value }, 'Ранее выбранная запись недоступна'),
          ...choices.map(([id, label]) => h('option', { key: id, value: id }, label)));
      }
      const max = key === 'actualTrips' ? 999 : 99, min = key === 'crewRequired' ? 1 : 0;
      return h('input', { ...props, type: 'number', min, max, step: 1, value, placeholder: 'Не указано',
        onChange: event => update(event.target.value === '' ? null : Number(event.target.value)) });
    }
    function renderReporting(row, index) {
      return h('section', { className: 'planning-release-fields', 'aria-label': `Выпуск, назначение ${index + 1}` },
        h('h4', null, 'Выпуск для ежедневного отчёта'),
        h('div', { className: 'planning-assignment-grid' },
          ...TABLE_COLUMNS.filter(column => column.id.startsWith('report:') && (row.reporting?.block === 'crew' || !column.id.startsWith('report:crew')))
            .map(column => field(column.label, reportingControl(row, column.id.slice(7))))),
        h('p', { className: 'planning-help' }, 'Факт — число рейсов этой машины за выбранный день. Пусто: использовать отметки рейсов; 0: машина не вышла. План и подтверждение выхода сами по себе не считаются выпуском.'),
        row.reporting?.block === 'crew' && h('p', { className: 'planning-help' }, 'Состав экипажа указывается вместе с водителем. Для невыпуска выберите причину в статусе назначения.'));
    }
    function renderReportDefaults() {
      return h('section', { className: 'planning-release-defaults surface', 'aria-label': 'Настройка ежедневного выпуска' },
        h('h3', null, 'Ежедневный выпуск → Команда · Отчеты'),
        h('p', { className: 'planning-help' }, 'Включите в план все учитываемые на день машины, в том числе не вышедшие, и укажите причину. Наёмный парк — подтверждённые на день машины. Доступный резерв подрядчиков не добавляйте как простой.'),
        h('div', { className: 'planning-assignment-grid' },
          field('Блок для назначений дня', h('select', { disabled: busy, value: reportDefaults.block, onChange: event => setReportDefaults(previous => ({ ...previous, block: event.target.value })) },
            h('option', { value: '' }, 'Не менять'), h('option', { value: 'crew' }, 'Экипажный'), h('option', { value: 'city' }, 'Городская доставка'))),
          field('Ответственный для назначений дня', h('select', { disabled: busy, value: reportDefaults.managerId, onChange: event => setReportDefaults(previous => ({ ...previous, managerId: event.target.value })) },
            h('option', { value: '' }, 'Не менять'), ...(options.managers || []).map(person => h('option', { key: person.id, value: person.id }, person.name)))),
          ...[['cityName', 'Город для назначений дня'], ['clientName', 'Клиент для назначений дня']].map(([key, label]) => field(label,
            h('input', { disabled: busy, value: reportDefaults[key], maxLength: 100, placeholder: 'Не менять', onChange: event => setReportDefaults(previous => ({ ...previous, [key]: event.target.value })) }))),
          button('Применить к назначениям дня', () => {
            const patch = Object.fromEntries(Object.entries(reportDefaults).map(([key, value]) => [key, value.trim()]).filter(([, value]) => value));
            setPlan(previous => ({ ...previous, rows: previous.rows.map(row => ({ ...row, reporting: { ...row.reporting, ...patch } })) }));
            setMessage('Данные отчёта применены. Сохраните план, чтобы включить изменения в отчёт.');
          }, { disabled: busy || !plan.rows.length || !Object.values(reportDefaults).some(value => value.trim()) })),
        h('p', { className: 'planning-help' }, 'Факт выпуска и состав экипажа заполняются в карточке машины или соответствующих колонках таблицы. Публикация и расписание — в разделе «Команда».'));
    }
    function renderTableCell(row, index, column) {
      if (column.column) return renderClientCell(row, index, column.column, true);
      const props = { 'aria-label': `${column.label}, назначение ${index + 1}`, disabled: saving || exporting || oneCSending };
      if (column.id.startsWith('report:')) return reportingControl(row, column.id.slice(7), props);
      switch (column.id) {
        case 'driverId': case 'vehicleId':
          return h(SearchPicker, {
            label: column.label, ariaLabel: props['aria-label'], compact: true, value: row[column.id],
            options: column.id === 'driverId' ? driverOptions : vehicleOptions,
            onChange: value => changeAssignment(row, column.id, value), disabled: props.disabled,
            emptyLabel: column.id === 'driverId' ? 'Выберите водителя' : 'Выберите машину',
          });
        case 'departureTime':
          return h('input', { ...props, type: 'time', value: row.departureTime || '', onChange: event => changeRow(row.id, { departureTime: event.target.value }) });
        case 'status':
          return h('select', { ...props, value: row.status, onChange: event => changeRow(row.id, { status: event.target.value }) }, ...STATUSES.map(([value, label]) => h('option', { key: value, value }, label)));
        case 'tripCount':
          return h('input', { ...props, type: 'number', min: 1, max: 999, step: 1, value: row.tripCount, onChange: event => changeRow(row.id, { tripCount: Math.min(999, Math.max(1, Math.trunc(Number(event.target.value) || 1))) }) });
        case 'comment':
          return h('textarea', { ...props, rows: 2, maxLength: 2000, value: row.comment || '', placeholder: 'Комментарий', onChange: event => changeRow(row.id, { comment: event.target.value }) });
        default:
          return h('div', { className: 'planning-table-checkbox' }, h('input', { ...props, type: 'checkbox', checked: Boolean(row[column.id]), onChange: event => changeRow(row.id, { [column.id]: event.target.checked }) }));
      }
    }

    function renderTable() {
      const warnings = filteredRows.map(({ row, index }) => ({ id: row.id, index, text: [
        invalidExportRows.some(item => item.id === row.id) ? 'Для выгрузки заполните водителя, машину и время выхода.' : '',
        ...fieldIssues.filter(issue => issue.rowId === row.id).map(issue => `${issue.label}: ${issue.message}.`),
      ].filter(Boolean).join(' ') })).filter(warning => warning.text);
      return h('div', { className: 'planning-assignment-table-wrap surface' },
        warnings.length > 0 && h('details', { className: 'planning-table-notice' },
          h('summary', null, `Проверьте назначения перед выгрузкой: ${warnings.length}`),
          h('ul', null, ...warnings.map(warning => h('li', { key: warning.id }, `Назначение ${warning.index + 1}: ${warning.text}`)))),
        h('div', { className: 'planning-table-scroll', role: 'region', 'aria-label': 'Таблица назначений', tabIndex: 0 },
          h('table', { className: 'planning-assignment-table' },
            h('caption', { className: 'visually-hidden' }, 'Назначения на выбранную дату'),
            h('thead', null, h('tr', null, h('th', { scope: 'col', className: 'planning-table-number' }, '№'),
              ...visibleColumns.map(column => h('th', { key: column.id, scope: 'col', className: `planning-table-${column.column ? 'client' : column.id}` }, column.label, column.column?.required && h('span', { title: 'Обязательное поле' }, ' *'))),
              h('th', { scope: 'col', className: 'planning-table-actions' }, 'Действия'),
              h('th', { scope: 'col', className: 'planning-table-extras' }, 'Дополнительные поля строки'))),
            h('tbody', null, ...filteredRows.map(({ row, index }) => {
              const warning = warnings.find(item => item.id === row.id)?.text;
              return h('tr', { ...rowOpenEvents(row, index), key: row.id, className: `planning-clickable-row${warning ? ' is-incomplete' : ''}` },
                h('th', { scope: 'row', className: 'planning-table-number' }, button(String(index + 1).padStart(2, '0'), () => openRow(row), {
                  className: 'planning-row-number', 'aria-label': `Открыть карточку назначения ${index + 1}`, disabled: busy,
                }),
                  warning && h('span', { className: 'planning-table-warning', title: warning, 'aria-label': warning, role: 'img' }, '!')),
                ...visibleColumns.map(column => h('td', { key: column.id, className: `planning-table-${column.column ? 'client' : column.id}` }, renderTableCell(row, index, column))),
                h('td', { className: 'planning-table-actions' },
                  oneC?.enabled && h('label', { className: 'planning-onec-checkbox' }, h('input', {
                    type: 'checkbox', checked: oneCSelected.includes(row.id), disabled: busy, 'aria-label': `Передать в 1С назначение ${index + 1}`,
                    onChange: event => setOneCSelected(previous => event.target.checked ? [...previous, row.id] : previous.filter(id => id !== row.id)),
                  }), 'В 1С'),
                  button('Карточка', () => openRow(row), { className: 'planning-link', 'aria-label': `Редактировать назначение ${index + 1}`, disabled: busy }),
                  button('Удалить', () => removeRow(row, index), { className: 'planning-link planning-remove', 'aria-label': `Удалить назначение ${index + 1}`, disabled: saving || exporting || oneCSending })),
                h('td', { className: 'planning-table-extras' }, h('div', { className: 'planning-row-extra-strip' }, renderExtraFields(row, index, true),
                  button('+ Добавить поле', () => openRow(row, 'add'), { className: 'button planning-add-row-field', 'aria-label': `Добавить поле в назначение ${index + 1}`, disabled: busy || (row.extraFields || []).length >= 20 }))));
            })))));
    }

    function renderRow(row, index, inDialog = false) {
      const driver = options.drivers.find((item) => item.id === row.driverId);
      const vehicle = options.vehicles.find((item) => item.id === row.vehicleId);
      const active = ['work', 'paid_reserve'].includes(row.status);
      const incomplete = active && (!driver || !vehicle || !/^([01]\d|2[0-3]):[0-5]\d$/.test(row.departureTime || ''));
      return h('article', { className: `planning-assignment${incomplete ? ' planning-assignment-incomplete' : ''}`, key: row.id },
        h('div', { className: 'planning-assignment-heading' },
          h('div', { className: 'planning-assignment-title' }, h('span', { className: 'planning-row-number' }, String(index + 1).padStart(2, '0')),
            h('div', null, h('h3', null, driver?.name || 'Новое назначение'), h('p', null, vehicle?.label || 'Выберите водителя и машину'))),
          h('div', { className: 'planning-assignment-tools' },
            oneC?.enabled && h('label', { className: 'planning-onec-checkbox' }, h('input', {
              type: 'checkbox', checked: oneCSelected.includes(row.id), disabled: busy,
              'aria-label': `Передать в 1С назначение ${index + 1}`,
              onChange: event => setOneCSelected(previous => event.target.checked ? [...previous, row.id] : previous.filter(id => id !== row.id)),
            }), 'В 1С'),
            h('span', { className: `planning-status${active ? ' planning-status-active' : ''}` }, STATUSES.find(([value]) => value === row.status)?.[1]),
            button('Удалить', () => removeRow(row, index), { className: 'planning-link planning-remove', 'aria-label': `Удалить назначение ${index + 1}`, disabled: saving || exporting || oneCSending }))),
        h('fieldset', { disabled: saving || exporting || oneCSending, className: 'planning-row-fields' },
          h('div', { className: 'planning-assignment-grid' },
            h(SearchPicker, { label: 'Водитель', value: row.driverId, options: driverOptions, onChange: (driverId) => changeAssignment(row, 'driverId', driverId), disabled: saving || exporting || oneCSending, emptyLabel: 'Выберите водителя' }),
            h(SearchPicker, { label: 'Машина', value: row.vehicleId, options: vehicleOptions, onChange: (vehicleId) => changeAssignment(row, 'vehicleId', vehicleId), disabled: saving || exporting || oneCSending, emptyLabel: 'Выберите машину' }),
            field('Время выхода', h('input', { type: 'time', value: row.departureTime || '', onChange: (event) => changeRow(row.id, { departureTime: event.target.value }), 'aria-label': `Время выхода, назначение ${index + 1}` })),
            field('Статус', h('select', { value: row.status, onChange: (event) => changeRow(row.id, { status: event.target.value }) }, ...STATUSES.map(([value, label]) => h('option', { key: value, value }, label)))),
            field('Рейсов', h('input', { type: 'number', min: 1, max: 999, step: 1, value: row.tripCount, onChange: (event) => changeRow(row.id, { tripCount: Math.min(999, Math.max(1, Math.trunc(Number(event.target.value) || 1))) }) }))),
          h('div', { className: 'planning-flags' }, ...FLAGS.map(([key, label]) => h('label', { key }, h('input', { type: 'checkbox', checked: Boolean(row[key]), onChange: (event) => changeRow(row.id, { [key]: event.target.checked }) }), label))),
          field('Комментарий менеджера', h('textarea', { value: row.comment || '', rows: 2, maxLength: 2000, placeholder: 'Детали назначения, изменения или договорённости', onChange: (event) => changeRow(row.id, { comment: event.target.value }) })),
          renderReporting(row, index),
          incomplete && h('p', { className: 'planning-row-warning' }, 'Для выгрузки заполните водителя, машину и время выхода.'),
          renderClientFields(row, index),
          h('section', { className: 'planning-extra-section' },
            h('div', { className: 'planning-column-heading' }, h('h4', null, 'Дополнительные поля строки'),
              !inDialog && button('+ Добавить поле', () => openRow(row, 'add'), { className: 'button', 'aria-label': `Добавить поле в назначение ${index + 1}`, disabled: busy || (row.extraFields || []).length >= 20 })),
            renderExtraFields(row, index),
            inDialog && h('details', { className: 'planning-extra-details' }, h('summary', null, '+ Добавить поле'),
              h(ExtraFieldAdder, { row, index, context, template, disabled: busy,
                onAdd: item => changeRow(row.id, { extraFields: [...(row.extraFields || []), item] }),
              })))));
    }

    function renderPreview() {
      return h('div', { className: 'planning-preview' },
        h('div', { className: 'planning-preview-intro' },
          h('div', null, h('h2', null, template.label), template.custom && h('span', { className: 'planning-help' }, `Версия формы ${template.version}`), h('p', null, 'В форму включаются назначения «В работе» и «Оплачиваемый резерв». Порядок колонок соответствует выбранному клиенту.')),
          h('span', { className: `planning-draft-badge${dirty ? ' is-dirty' : ''}` }, dirty ? 'Выгрузка текущего черновика' : 'Текущая форма')),
        template.id === 'general' && h('div', { className: 'planning-notice' }, 'Для этого плана используется общая форма. Выберите нужный формат клиента перед подачей информации.'),
        invalidExportRows.length > 0 && h('div', { className: 'planning-notice', role: 'status' }, `В ${invalidExportRows.length} назначениях не заполнены водитель, машина или время. Дополните их во вкладке «Назначения», чтобы выгрузить форму.`),
        fieldIssues.length > 0 && h('div', { className: 'planning-notice', role: 'status' }, h('strong', null, 'Проверьте поля перед выгрузкой:'), h('ul', null, ...fieldIssues.slice(0, 8).map(issue => h('li', { key: `${issue.rowId}_${issue.key}` }, `Назначение ${issue.rowIndex + 1}, ${issue.label}: ${issue.message.toLowerCase()}.`))), fieldIssues.length > 8 && h('p', null, `Всего полей для проверки: ${fieldIssues.length}.`)),
        !outputRows.length ? h('div', { className: 'planning-empty surface' }, h('h3', null, 'В форме пока нет рейсов'), h('p', null, 'Добавьте назначение со статусом «В работе» или «Оплачиваемый резерв».'), button('К назначениям', () => setView('assignments')))
          : sections.map((section) => h('section', { className: 'planning-export-section surface', key: section.id },
            h('div', { className: 'planning-section-heading' },
              h('div', null, h('h3', null, section.label || template.label), h('span', { className: 'planning-help' }, `${outputRows.length} назначений · ${stats.trips} рейсов`)),
              h('div', { className: 'planning-export-actions' },
                button(template.kind === 'text' ? 'Копировать текст' : 'Копировать таблицу', () => exportSection(section, 'copy'), { disabled: busy || invalidExportRows.length > 0 || fieldIssues.length > 0 }),
                button(template.kind === 'text' ? 'Скачать TXT' : 'Скачать CSV', () => exportSection(section, 'file'), { disabled: busy || invalidExportRows.length > 0 || fieldIssues.length > 0 }))),
            template.kind === 'text' ? h('pre', { className: 'planning-text-preview', tabIndex: 0 }, section.text || 'Нет данных')
              : h('div', { className: 'planning-table-scroll', role: 'region', 'aria-label': `Предпросмотр: ${section.label || template.label}`, tabIndex: 0 },
                h('table', { className: 'planning-client-table' },
                  h('caption', { className: 'visually-hidden' }, `${template.label} — ${section.label || 'Форма клиента'}`),
                  h('thead', null, h('tr', null, ...section.headers.map((label, index) => h('th', { scope: 'col', key: index }, label)))),
                  h('tbody', null, ...section.rows.map((values, index) => h('tr', {
                    key: outputRows[index].id, className: 'planning-clickable-row',
                    ...rowOpenEvents(outputRows[index], plan.rows.indexOf(outputRows[index])),
                  }, ...values.map((value, cell) => h('td', { key: cell, className: value === '' || value == null ? 'planning-empty-cell' : '' }, value === '' || value == null ? '—' : String(value)))))))),
            h('p', { className: 'planning-export-help' }, template.kind === 'text' ? 'Уточнить сведения можно в полях для клиента у каждого назначения.' : 'Нажмите на строку, чтобы открыть карточку и уточнить данные. Дополнительные поля заполняются только у тех назначений, в которые их добавили.'))));
    }

    const filteredRows = (plan?.rows || []).map((row, index) => ({ row, index })).filter(({ row }) => {
      const query = filter.trim().toLocaleLowerCase('ru');
      if (!query) return true;
      const driver = options.drivers.find((item) => item.id === row.driverId);
      const vehicle = options.vehicles.find((item) => item.id === row.vehicleId);
      return [driver?.name, vehicle?.label, row.comment, row.departureTime, STATUSES.find(([id]) => id === row.status)?.[1]].join(' ').toLocaleLowerCase('ru').includes(query);
    });

    if (calendarOpen && scope) return h('div', { className: 'planning-workspace' },
      h(PlanningCalendar, { token, scope, scopes, oneC, options, templates, defaultTemplateId, initialDate: selection.date,
        onOpenDay: closeCalendar, onClose: () => closeCalendar(), onDirtyChange: setCalendarDirty,
        onExpired: () => fail({ status: 401 }, 'calendar'), onDenied: () => fail({ status: 403 }, 'calendar') }));
    return h('div', { className: 'planning-workspace' },
      h('div', { className: 'page-heading planning-page-heading' },
        h('div', null, h('span', { className: 'planning-eyebrow' }, 'ОПЕРАЦИОННАЯ РАБОТА'), h('h1', null, 'Планирование'), h('p', null, 'Назначайте водителей на будущие рейсы и готовьте подачу в форме каждого клиента.')),
        plan && !builderInitial && h('div', { className: 'planning-save-block' }, button(saving ? 'Сохраняем…' : 'Сохранить план', save, { className: 'button primary', disabled: busy || !dirty && Boolean(plan.id) }),
          h('span', { className: dirty ? 'planning-save-state is-dirty' : 'planning-save-state', role: 'status' }, saving ? 'Сохраняем изменения' : dirty ? 'Есть несохранённые изменения' : plan.id ? 'Все изменения сохранены' : 'Новый план'))),
      error && h('div', { className: 'planning-error', role: 'alert' }, h('p', null, error.text),
        error.phase === 'context' ? button('Повторить загрузку', () => setContextKey((key) => key + 1))
          : error.status === 409 ? button('Загрузить актуальный план', reload)
            : error.phase === 'load' ? button('Повторить загрузку', reload)
              : error.phase === 'options' && ![401, 403].includes(error.status) || error.phase === 'save' && error.status === 400 ? button(refreshingOptions ? 'Обновляем справочники…' : 'Обновить водителей и машины', refreshOptions, { disabled: busy })
                : error.phase === 'save' && error.status === 413 ? null
              : error.status !== 401 && error.status !== 403 ? button('Повторить сохранение', save, { disabled: busy }) : null),
      message && h('div', { className: 'planning-feedback', role: 'status' }, message),
      contextLoading ? h('div', { className: 'planning-loading surface', role: 'status' }, 'Загружаем планирование…')
        : !scopes.length && !error ? h('div', { className: 'planning-empty surface' },
          h('h2', null, 'Планирование пока недоступно'),
          h('p', null, 'Для планирования нужна назначенная зона ответственности и разрешение на доступ к персональным данным в этой зоне.'),
          h('p', null, 'Обратитесь к администратору доступа: «Сотрудники» → ваша карточка → «Настроить планирование». Администратор выбирает зоны и включает доступ к персональным данным.'),
          h('p', null, 'После настройки доступа обновите страницу.')) : null,
      selection && h('section', { className: 'planning-controls surface', 'aria-label': 'Настройки плана' },
        field('Дата рейсов', h('input', { type: 'date', value: selection.date, disabled: busy || Boolean(builderInitial), onChange: (event) => switchSelection({ ...selection, date: event.target.value }) }), scope?.timeZone ? `Часовой пояс: ${scope.timeZone}` : null),
        field('Форма подачи клиенту', h('select', { value: plan ? `${plan.templateId}@${plan.templateVersion || 1}` : '', disabled: busy || !plan || Boolean(builderInitial), onChange: (event) => changeTemplate(event.target.value) }, !plan && h('option', { value: '' }, loading ? 'Загрузка…' : 'Форма недоступна'), ...formChoices.map((item) => h('option', { key: `${item.id}@${item.version || 1}`, value: `${item.id}@${item.version || 1}` }, `${item.label}${item.custom ? ` · версия ${item.version}` : ''}${templates.some(latest => latest.id === item.id && latest.version !== item.version) ? ' (версия плана)' : ''}`))))),
      !loading && dailyPlans.length > 1 && h('section', { className: 'planning-documents', 'aria-label': 'Планы на выбранную дату' },
        ...dailyPlans.map((document, index) => h('article', { key: document.id, className: 'planning-document surface' },
          h('div', null, h('h2', null, document.templateSnapshot?.label || templateFor(document.templateId)?.label || `План ${index + 1}`), h('p', null, `Назначений: ${document.rows?.length || 0}`)),
          button(document.responsibilityScopeId === selection.scopeId ? 'Открытый план' : 'Открыть план', () => switchSelection({ ...selection, scopeId: document.responsibilityScopeId }), { disabled: busy || Boolean(builderInitial) || document.responsibilityScopeId === selection.scopeId, 'aria-label': `Открыть план ${index + 1}: ${document.templateSnapshot?.label || 'Клиентская форма'}` })))),
      loading && h('div', { className: 'planning-loading surface', role: 'status' }, 'Загружаем план и справочники…'),
      plan && !loading && builderInitial && h(React.Fragment, null,
        button('Обновить список форм', refreshForms, { disabled: busy }),
        h(PlanningBuilder, { templates: templates.map(item => ({ ...item, isDefault: item.id === defaultTemplateId })), selectedTemplate: builderInitial, onSave: saveForm,
          onClose: () => { setBuilderInitial(null); setBuilderDirty(false); setBuilderError(null); }, onDirtyChange: setBuilderDirty, busy, error: builderError })),
      plan && !loading && !builderInitial && h(React.Fragment, null,
        h('div', { className: 'planning-workbar' }, h('div', { className: 'planning-mode-actions' }, button('Календарь', openCalendar, { disabled: busy }), button('Конструктор форм', openBuilder, { disabled: busy })),
          savedForm && h('div', { className: 'planning-feedback' }, h('span', null, `Сохранена форма «${savedForm.label}», версия ${savedForm.version}. Текущий план сохранит выбранную версию до её применения.`), button('Применить сохранённую форму', () => changeTemplate(savedForm), { disabled: busy }))),
        oneC?.enabled && h(PlanningOneCExport, {
          key: `${selection.scopeId}:${selection.date}`, token, oneC, scopeId: plan.responsibilityScopeId,
          selectedPlans: oneCSelected.some(id => plan.rows.some(row => row.id === id)) ? [{ ...plan, rows: plan.rows.filter(row => oneCSelected.includes(row.id)) }] : [],
          existingPlans: [plan], options, dirty, busy, onBusyChange: setOneCSending, onAuthError: reason => fail(reason, 'export'),
          selectionHelp: 'Отметьте нужные назначения флажком «В 1С».',
        }, h('div', { className: 'planning-onec-selection' },
          button('Выбрать все назначения', () => { setOneCSelected(plan.rows.map(row => row.id)); setView('assignments'); }, { className: 'planning-link', disabled: busy || !plan.rows.length }),
          button('Снять выбор', () => setOneCSelected([]), { className: 'planning-link', disabled: busy || !oneCSelected.length }))),
        h('div', { className: 'planning-metrics', 'aria-label': 'Итоги плана' },
          ...[['Назначений', stats.assigned], ['Рейсов к подаче', stats.trips], ['Подтверждено', `${stats.confirmed} / ${outputRows.length}`], ['В резерве', stats.reserve]].map(([label, value]) => h('div', { className: 'planning-metric', key: label }, h('span', null, label), h('strong', null, value)))),
        view === 'assignments' && renderReportDefaults(),
        h('div', { className: 'planning-workbar' },
          h('div', { className: 'planning-tabs', role: 'group', 'aria-label': 'Вид плана' },
            button('Назначения', () => setView('assignments'), { className: '', 'aria-pressed': view === 'assignments' }),
            button('Форма клиента', () => setView('client'), { className: '', 'aria-pressed': view === 'client' })),
          button('+ Добавить назначение', addRow, { className: 'button planning-add', disabled: busy || plan.rows.length >= MAX_ROWS })),
        view === 'assignments' ? h('div', { className: 'planning-assignments' },
          h('div', { className: 'planning-display-toolbar' },
            h('div', { className: 'planning-tabs', role: 'group', 'aria-label': 'Отображение назначений' },
              ...[['cards', 'Карточки'], ['table', 'Таблица']].map(([layout, label]) => button(label, () => { updatePreferences({ layout }); setColumnsOpen(false); }, { key: layout, className: '', 'aria-pressed': currentPreferences.layout === layout }))),
            currentPreferences.layout === 'table' && h('div', { className: 'planning-display-actions' },
              h('span', { className: 'planning-help' }, `${visibleColumns.length} из ${tableColumns.length} колонок`),
              button('Колонки', () => setColumnsOpen(open => !open), { ref: columnsButton, 'aria-expanded': columnsOpen, 'aria-controls': 'planning-column-settings' }))),
          currentPreferences.layout === 'table' && columnsOpen && renderColumnSettings(),
          plan.rows.length > 0 && h('div', { className: 'planning-search-row' }, h('input', { type: 'search', placeholder: 'Поиск по водителю, машине или комментарию', value: filter, onChange: (event) => setFilter(event.target.value), 'aria-label': 'Поиск назначений' }), h('span', null, `${filteredRows.length} из ${plan.rows.length}`)),
          !plan.rows.length ? h('div', { className: 'planning-empty surface' }, h('span', { className: 'planning-empty-icon', 'aria-hidden': true }, '＋'), h('h2', null, 'Начните план на выбранную дату'), h('p', null, 'Добавьте водителя и машину, укажите время выхода. Сведения автоматически попадут в форму клиента.'), button('Добавить первое назначение', addRow, { className: 'button primary', disabled: busy }))
            : !filteredRows.length ? h('div', { className: 'planning-empty surface' }, h('h3', null, 'Назначения не найдены'), h('p', null, 'Измените запрос или очистите поиск.'), button('Очистить поиск', () => setFilter('')))
              : currentPreferences.layout === 'table' ? renderTable() : filteredRows.map(({ row, index }) => renderRow(row, index)),
          plan.rows.length >= MAX_ROWS && h('p', { className: 'planning-help' }, 'В одном плане может быть не более 200 назначений.')) : renderPreview(),
        h('footer', { className: 'planning-footer' }, h('span', null, 'План сохраняется на выбранную дату.'), plan.updatedAt && h('span', null, `Обновлён ${new Date(plan.updatedAt).toLocaleString('ru-RU', { timeZone: scope?.timeZone || 'Europe/Moscow', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`))),
      newAssignment && plan && h(RowDialog, { title: 'Новое назначение', onClose: () => setNewAssignment(null) },
        h('p', { className: 'planning-help' }, 'Выберите водителя. Его план и справочники откроются автоматически.'),
        field('Водитель для назначения', h('select', { value: newAssignment.driverId, onChange: event => setNewAssignment({ driverId: event.target.value }) },
          h('option', { value: '' }, 'Назначение без водителя'),
          ...[...new Map(catalogs.flatMap(item => item.drivers || []).map(driver => [driver.id, driver])).values()].sort((a, b) => a.name.localeCompare(b.name, 'ru')).map(driver => h('option', { key: driver.id, value: driver.id }, driver.name)))),
        h('footer', { className: 'planning-dialog-footer' }, button('Отмена', () => setNewAssignment(null)), button('Добавить назначение', () => appendAssignment(newAssignment.driverId || null), { className: 'button primary' }))),
      rowDialog && plan && !loading && renderRowDialog());
  }
  return PlanningPanel;
}
