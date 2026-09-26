import { columnOwner, templateFor } from './planning-model.js';

const DAY = 86400000;
function parsed(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '') || value.startsWith('0000-')) throw new Error('Укажите корректную дату.');
  const date = new Date(`${value}T12:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error('Укажите корректную дату.');
  return date;
}
export function addDays(value, offset) {
  const date = parsed(value);
  date.setUTCDate(date.getUTCDate() + offset);
  if (date.getUTCFullYear() < 1 || date.getUTCFullYear() > 9999) throw new Error('Дата выходит за допустимый диапазон.');
  return date.toISOString().slice(0, 10);
}
export function dateRange(anchor, mode = 'week') {
  const date = parsed(anchor);
  if (mode === 'week') {
    const start = addDays(anchor, -((date.getUTCDay() + 6) % 7));
    return Array.from({ length: 7 }, (_, index) => addDays(start, index));
  }
  if (mode !== 'month') throw new Error('Выберите неделю или месяц.');
  const start = `${anchor.slice(0, 7)}-01`;
  const count = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 12)).getUTCDate();
  return Array.from({ length: count }, (_, index) => addDays(start, index));
}
export function shiftPeriod(anchor, mode, offset) {
  if (mode === 'week') return addDays(anchor, offset * 7);
  const date = parsed(anchor);
  if (mode !== 'month') throw new Error('Выберите неделю или месяц.');
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 10);
}
function axisField(axis) {
  if (!['driver', 'vehicle'].includes(axis)) throw new Error('Выберите водителей или машины.');
  return axis === 'vehicle' ? 'vehicleId' : 'driverId';
}
export function calendarLanes(plans, options, axis = 'driver') {
  const key = axisField(axis);
  const catalog = axis === 'driver' ? options.drivers || [] : options.vehicles || [];
  const lanes = new Map(catalog.map(item => [item.id, { id: item.id, label: item.name || item.label }]));
  for (const plan of Object.values(plans)) for (const row of plan.rows || []) {
    if (row[key] && !lanes.has(row[key])) lanes.set(row[key], { id: row[key], label: `${axis === 'driver' ? 'Водитель' : 'Машина'} недоступен · ${row[key].slice(0, 8)}`, unavailable: true });
  }
  return [...lanes.values(), { id: null, label: axis === 'driver' ? 'Без водителя' : 'Без машины' }];
}
export function cellRows(plans, date, laneId, axis = 'driver') {
  const key = axisField(axis);
  return (plans[date]?.rows || []).filter(row => (row[key] ?? null) === laneId);
}
export function changeCalendarAssignment(row, changes, template) {
  const next = { ...row, ...changes, clientFields: { ...(row.clientFields || {}) } };
  if (next.extraFields) next.extraFields = structuredClone(next.extraFields);
  const driverChanged = (next.driverId ?? null) !== (row.driverId ?? null);
  const vehicleChanged = (next.vehicleId ?? null) !== (row.vehicleId ?? null);
  if (driverChanged || vehicleChanged) {
    const columns = new Map(template.sections.flatMap(section => section.columns).map(column => [column.key, column]));
    next.clientFields = Object.fromEntries(Object.entries(next.clientFields).filter(([key]) => {
      const column = columns.get(key);
      return column && !(driverChanged && columnOwner(column) === 'driver') && !(vehicleChanged && columnOwner(column) === 'vehicle');
    }));
    for (const field of next.extraFields || []) {
      if (driverChanged && columnOwner(field) === 'driver' || vehicleChanged && columnOwner(field) === 'vehicle') delete field.value;
    }
    next.confirmed = false;
    next.requestCreated = false;
    next.arrived = false;
  }
  return next;
}
function schema(plan, templates = []) {
  return plan.templateSnapshot || templates.find(item => item.id === plan.templateId && (item.version || 1) === (plan.templateVersion || 1)) || templateFor(plan.templateId);
}
function freshDay(source, date, templates) {
  const template = schema(source, templates);
  return { id: null, businessDate: date, responsibilityScopeId: source.responsibilityScopeId,
    templateId: template.id, templateVersion: template.version || 1, templateSnapshot: structuredClone(template),
    version: 0, updatedAt: null, rows: [] };
}
function compatible(from, to) {
  return from && from.source === to.source && from.type === to.type && columnOwner(from) === columnOwner(to);
}
function copiedRow(row, sourcePlan, targetPlan, lane, axis, templates) {
  const sourceTemplate = schema(sourcePlan, templates), targetTemplate = schema(targetPlan, templates);
  const oldColumns = new Map(sourceTemplate.sections.flatMap(section => section.columns).map(column => [column.key, column]));
  const targetColumns = targetTemplate.sections.flatMap(section => section.columns);
  const copy = { ...row, id: crypto.randomUUID(), confirmed: false, requestCreated: false, arrived: false, clientFields: {} };
  if (row.extraFields) copy.extraFields = structuredClone(row.extraFields);
  const field = axis ? axisField(axis) : null;
  const changedLane = field && (row[field] ?? null) !== lane;
  if (changedLane) {
    copy[field] = lane;
    copy[axis === 'driver' ? 'vehicleId' : 'driverId'] = null;
  }
  const delta = Math.round((parsed(targetPlan.businessDate) - parsed(sourcePlan.businessDate)) / DAY);
  for (const field of copy.extraFields || []) {
    if (changedLane && ['driver', 'vehicle'].includes(columnOwner(field))) delete field.value;
    else if (field.type === 'date' && columnOwner(field) === 'assignment' && /^\d{4}-\d{2}-\d{2}$/.test(field.value)) {
      try { field.value = addDays(field.value, delta); } catch { /* Invalid manual dates remain visible for correction. */ }
    }
  }
  for (const column of targetColumns) {
    const before = oldColumns.get(column.key);
    if (!compatible(before, column) || changedLane && ['driver', 'vehicle'].includes(columnOwner(column))) continue;
    let value;
    if (Object.hasOwn(row.clientFields || {}, column.key)) value = row.clientFields[column.key];
    else if (column.type === 'date' && columnOwner(column) === 'assignment' && before.defaultValue) value = before.defaultValue;
    else continue;
    if (column.type === 'date' && columnOwner(column) === 'assignment' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      try { value = addDays(value, delta); } catch { /* A manually entered invalid date stays visible for correction. */ }
    }
    copy.clientFields[column.key] = value;
  }
  return copy;
}
function checkPolicy(policy) {
  if (!['empty', 'append', 'replace'].includes(policy)) throw new Error('Выберите способ копирования.');
}
function validateResult(plans, changedDates) {
  const changed = [...changedDates].map(date => plans[date]);
  for (const plan of changed) {
    if (plan.rows.length > 200) throw new Error(`В дне ${plan.businessDate} получается больше 200 назначений. Выберите другой способ копирования.`);
    if (new TextEncoder().encode(JSON.stringify(plan.rows)).length > 450 * 1024) throw new Error(`План ${plan.businessDate} слишком большой. Сократите дополнительные сведения.`);
  }
  const payload = changed.map(({ businessDate, templateId, templateVersion, rows, version }) => ({ businessDate, templateId, templateVersion, rows, version }));
  if (new TextEncoder().encode(JSON.stringify({ plans: payload })).length > 4 * 1024 * 1024 - 1024) throw new Error('Слишком много данных для одного сохранения. Копируйте меньший период.');
}
function rectangle(rect, dates, lanes) {
  if (!rect || !['r1', 'r2', 'c1', 'c2'].every(key => Number.isInteger(rect[key]))) throw new Error('Выберите ячейки календаря.');
  const result = { r1: Math.min(rect.r1, rect.r2), r2: Math.max(rect.r1, rect.r2), c1: Math.min(rect.c1, rect.c2), c2: Math.max(rect.c1, rect.c2) };
  if (result.r1 < 0 || result.r2 >= lanes.length || result.c1 < 0 || result.c2 >= dates.length) throw new Error('Диапазон выходит за пределы календаря.');
  return result;
}
export function copyCalendarRange({ plans, dates, lanes, axis = 'driver', source, target, policy = 'empty', sourcePlans, excludeSource = true, templates = [] }) {
  checkPolicy(policy);
  const from = rectangle(source, dates, lanes), to = rectangle(target, dates, lanes);
  const original = structuredClone(sourcePlans || plans), result = { ...plans };
  const changed = new Set();
  const summary = { copied: 0, skipped: 0, replaced: 0, changedDays: 0 };
  const height = from.r2 - from.r1 + 1, width = from.c2 - from.c1 + 1;
  const modulo = (value, divisor) => ((value % divisor) + divisor) % divisor;
  for (let rowIndex = to.r1; rowIndex <= to.r2; rowIndex += 1) for (let colIndex = to.c1; colIndex <= to.c2; colIndex += 1) {
    if (excludeSource && rowIndex >= from.r1 && rowIndex <= from.r2 && colIndex >= from.c1 && colIndex <= from.c2) continue;
    const originRow = from.r1 + modulo(rowIndex - (excludeSource ? from.r1 : to.r1), height);
    const originCol = from.c1 + modulo(colIndex - (excludeSource ? from.c1 : to.c1), width);
    const sourceDate = dates[originCol], targetDate = dates[colIndex], targetLane = lanes[rowIndex].id;
    const entries = cellRows(original, sourceDate, lanes[originRow].id, axis);
    if (!entries.length) { summary.skipped += 1; continue; }
    const existing = cellRows(result, targetDate, targetLane, axis);
    if (policy === 'empty' && existing.length) { summary.skipped += 1; continue; }
    const sourcePlan = original[sourceDate];
    const existingPlan = result[targetDate];
    const persistedOrFilled = existingPlan && (existingPlan.id || existingPlan.version > 0 || existingPlan.rows.length);
    const targetPlan = persistedOrFilled ? structuredClone(existingPlan) : freshDay(sourcePlan, targetDate, templates);
    if (policy === 'replace') {
      targetPlan.rows = targetPlan.rows.filter(row => (row[axisField(axis)] ?? null) !== targetLane);
      summary.replaced += existing.length;
    }
    targetPlan.rows.push(...entries.map(row => copiedRow(row, sourcePlan, targetPlan, targetLane, axis, templates)));
    result[targetDate] = targetPlan;
    changed.add(targetDate);
    summary.copied += entries.length;
  }
  validateResult(result, changed);
  summary.changedDays = changed.size;
  return { plans: result, summary };
}
export function copyCalendarDays({ plans, sourceDate, targetDates, policy = 'empty', templates = [] }) {
  checkPolicy(policy);
  parsed(sourceDate);
  if (!Array.isArray(targetDates) || targetDates.length > 31) throw new Error('За один раз можно скопировать до 31 дня.');
  const source = plans[sourceDate];
  if (!source?.rows.length) throw new Error('В исходном дне нет назначений для копирования.');
  const original = structuredClone(source), result = { ...plans }, changed = new Set();
  const summary = { copied: 0, skipped: 0, replaced: 0, changedDays: 0 };
  for (const date of new Set(targetDates)) {
    parsed(date);
    if (date === sourceDate) continue;
    const existing = result[date];
    if (policy === 'empty' && existing?.rows.length) { summary.skipped += 1; continue; }
    let next = existing ? structuredClone(existing) : freshDay(original, date, templates);
    if (policy !== 'append' || !existing?.rows.length) {
      next = { ...next, templateId: original.templateId, templateVersion: original.templateVersion || 1, templateSnapshot: structuredClone(schema(original, templates)), rows: [] };
      summary.replaced += existing?.rows.length || 0;
    }
    next.rows.push(...original.rows.map(row => copiedRow(row, original, next, null, null, templates)));
    result[date] = next;
    summary.copied += original.rows.length;
    changed.add(date);
  }
  validateResult(result, changed);
  summary.changedDays = changed.size;
  return { plans: result, summary };
}
