import { PLANNING_TEMPLATES } from './planning-templates.js';
import { columnOwner, FIELD_SOURCES } from './planning-fields.js';
export { PLANNING_TEMPLATES };
export { columnOwner };

const normalized = value => String(value ?? '').toLocaleLowerCase('ru-RU').replaceAll('ё', 'е').replace(/[^а-яa-z0-9]/g, '');
export function suggestTemplate(projectName, regionName = '') {
  const candidates = new Set([normalized(projectName), normalized(`${projectName} ${regionName}`)]);
  return PLANNING_TEMPLATES.find(template => template.projectNames.some(name => candidates.has(normalized(name))))?.id ?? 'general';
}
export function templateFor(id) {
  return PLANNING_TEMPLATES.find(template => template.id === id) ?? PLANNING_TEMPLATES.find(template => template.id === 'general');
}
export function tomorrow(timeZone = 'Europe/Moscow', now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const read = type => parts.find(part => part.type === type).value;
  const date = new Date(`${read('year')}-${read('month')}-${read('day')}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}
export function newPlanningRow() {
  return { id: crypto.randomUUID(), driverId: null, vehicleId: null, departureTime: '', status: 'work',
    confirmed: false, requestCreated: false, arrived: false, tripCount: 1, comment: '', clientFields: {}, extraFields: [] };
}
export function newExtraField(source = 'manual') {
  const definition = FIELD_SOURCES.find(item => item.value === source) || FIELD_SOURCES[0];
  return { id: crypto.randomUUID(), label: definition.value === 'manual' ? 'Дополнительное поле' : definition.label.replace(/^Ручной ввод: /, ''),
    source: definition.value, type: definition.type, owner: definition.owner };
}
export function eligibleRows(rows) {
  return rows.filter(row => ['work', 'paid_reserve'].includes(row.status));
}
export function clientValue(template, column, row, context, index = 0) {
  if (Object.hasOwn(row.clientFields ?? {}, column.key)) return row.clientFields[column.key];
  const value = automaticValue(template, column, row, context, index);
  return value === '' || value == null ? column.defaultValue ?? '' : value;
}
export function extraFieldValue(field, row, context, index = 0, template = templateFor('general')) {
  if (Object.hasOwn(field, 'value')) return field.value;
  return automaticValue(template, field, row, context, index) ?? '';
}
function automaticValue(template, column, row, context, index) {
  const driver = context.drivers?.find(item => item.id === row.driverId);
  const vehicle = context.vehicles?.find(item => item.id === row.vehicleId);
  const resource = columnOwner(column) === 'driver' ? driver : columnOwner(column) === 'vehicle' ? vehicle : null;
  if (column.source !== 'manual' && Object.hasOwn(resource?.planningData ?? {}, column.source)) {
    const linked = resource.planningData[column.source];
    if (linked !== '' && linked != null) return String(linked);
  }
  switch (column.source) {
    case 'sequence': return String(index + 1);
    case 'trip_count': return String(row.tripCount ?? 1);
    case 'driver_name': return driver?.name ?? '';
    case 'driver_surname': return driver?.name?.trim().split(/\s+/)[0] ?? '';
    case 'driver_name_inn_phone': return [driver?.name, driver?.planningData?.driver_inn, driver?.planningData?.driver_phone].filter(Boolean).join(', ');
    case 'vehicle_plate': return vehicle?.label ?? '';
    case 'vehicle_model': return vehicle?.planningData?.vehicle_brand ?? '';
    case 'planning_date': case 'loading_date': case 'arrival_date': return context.businessDate ?? '';
    case 'delivery_date': return template.id === 'logika_moloka' ? context.businessDate ?? '' : '';
    case 'arrival_time': case 'loading_time': return row.departureTime ?? '';
    case 'payload_kg': return vehicle?.capacityKg == null ? '' : String(vehicle.capacityKg);
    case 'tonnage': {
      const capacity = vehicle?.planningData?.payload_kg ?? vehicle?.capacityKg;
      return capacity == null || capacity === '' || !Number.isFinite(Number(capacity)) ? '' : String(Number(capacity) / 1000);
    }
    case 'vehicle_body_type': return ({ refrigerated: 'Рефрижератор', box: 'Фургон' })[vehicle?.bodyType] ?? '';
    case 'comment': return row.comment ?? '';
    default: return '';
  }
}
export function adoptTemplate(plan, template) {
  const oldTemplate = plan.templateSnapshot || PLANNING_TEMPLATES.find(item => item.id === plan.templateId);
  const oldColumns = new Map((oldTemplate?.sections || []).flatMap(section => section.columns).map(column => [column.key, column]));
  const newColumns = new Map(template.sections.flatMap(section => section.columns).map(column => [column.key, column]));
  const incompatible = new Set();
  for (const [key, column] of newColumns) {
    const before = oldColumns.get(key);
    if (before && (before.source !== column.source || before.type !== column.type || columnOwner(before) !== columnOwner(column))) incompatible.add(key);
  }
  return { ...plan, templateId: template.id, templateVersion: template.version || 1,
    templateSnapshot: structuredClone(template), rows: plan.rows.map(row => ({ ...row,
      clientFields: Object.fromEntries(Object.entries(row.clientFields || {}).filter(([key]) => newColumns.has(key) && !incompatible.has(key))),
      ...(row.extraFields ? { extraFields: structuredClone(row.extraFields) } : {}),
    })) };
}
function fieldTypeIssue(type, value) {
  if (!value) return '';
  if (type === 'number' && (!/^[-+]?(?:\d+\.?\d*|\.\d+)$/.test(value) || !Number.isFinite(Number(value)))) return 'Введите число';
  if (type === 'time' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return 'Укажите время ЧЧ:ММ';
  if (type === 'date') {
    const date = new Date(`${value}T00:00:00.000Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000-') || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return 'Укажите корректную дату';
  }
  return '';
}
export function clientFieldIssues(template, rows, context) {
  const issues = [];
  const columns = template.sections.flatMap(section => section.columns);
  eligibleRows(rows).forEach((row, index) => {
    for (const column of columns) {
      const value = String(clientValue(template, column, row, context, index) ?? '').trim();
      let message = '';
      if (!value && column.required) message = 'Обязательное поле';
      else if (template.custom) message = fieldTypeIssue(column.type, value);
      if (message) issues.push({ rowId: row.id, rowIndex: rows.indexOf(row), key: column.key, label: column.label, message });
    }
    for (const field of row.extraFields || []) {
      const value = String(extraFieldValue(field, row, context, index, template) ?? '').trim();
      const message = fieldTypeIssue(field.type, value);
      if (message) issues.push({ rowId: row.id, rowIndex: rows.indexOf(row), key: field.id, extraFieldId: field.id, label: field.label, message });
    }
  });
  return issues;
}
function formattedCell(column, value) {
  if (column.type === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value.split('-').reverse().join('.');
  return String(value ?? '');
}
// These exports are intended for spreadsheets. Quote fields and neutralize
// executable formula prefixes, including prefixes following whitespace.
export function safeSpreadsheetCell(value) {
  const text = String(value ?? '');
  return /^[\s\uFEFF]*[=+@-]/u.test(text) ? "'" + text : text;
}
export function csvText(headers, rows) {
  const quote = value => `"${safeSpreadsheetCell(value).replaceAll('"', '""')}"`;
  return '\uFEFF' + [headers, ...rows].map(row => row.map(quote).join(';')).join('\r\n');
}
export function tsvText(headers, rows) {
  return [headers, ...rows].map(row => row.map(value => safeSpreadsheetCell(value).replace(/[\t\r\n]+/g, ' ')).join('\t')).join('\n');
}
export function exportSections(template, rows, context) {
  const included = eligibleRows(rows);
  const additions = new Map();
  const rowAdditions = included.map(row => {
    const fields = new Map(), occurrences = new Map();
    for (const field of row.extraFields || []) {
      const signature = JSON.stringify([field.source, field.label, field.type]);
      const occurrence = occurrences.get(signature) || 0;
      occurrences.set(signature, occurrence + 1);
      const key = JSON.stringify([signature, occurrence]);
      if (!additions.has(key)) additions.set(key, field);
      fields.set(key, field);
    }
    return fields;
  });
  const extraColumns = [...additions];
  return template.sections.map(section => {
    const headers = [...section.columns.map(column => column.label), ...extraColumns.map(([, field]) => field.label)];
    const values = included.map((row, index) => [
      ...section.columns.map(column => formattedCell(column, clientValue(template, column, row, context, index))),
      ...extraColumns.map(([key]) => {
        const field = rowAdditions[index].get(key);
        return field ? formattedCell(field, extraFieldValue(field, row, context, index, template)) : '';
      }),
    ]);
    const csv = csvText(headers, values);
    const tsv = tsvText(headers, values);
    let text = tsv;
    if (template.kind === 'text') {
      const date = formattedCell({ type: 'date' }, context.businessDate);
      text = `Заявка на: ${date}\n\n` + values.map((row, rowIndex) => headers.flatMap((label, index) =>
        index < section.columns.length || rowAdditions[rowIndex].has(extraColumns[index - section.columns.length][0])
          ? [`${label}: ${row[index]}`] : []).join('\n')).join('\n\n');
    }
    return { id: section.id, label: section.label, headers, rows: values, text, csv, tsv };
  });
}
