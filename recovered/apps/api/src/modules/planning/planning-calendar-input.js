"use strict";
const { businessDate, uuid, planInput, object, keys, fail } = require('./planning-input');

const MAX_CALENDAR_BYTES = 4 * 1024 * 1024;
const DAY_MS = 24 * 60 * 60 * 1000;
function calendarRange(from, to) {
  const start = businessDate(from), end = businessDate(to);
  const days = (Date.parse(`${end}T00:00:00.000Z`) - Date.parse(`${start}T00:00:00.000Z`)) / DAY_MS + 1;
  if (days < 1 || days > 31) fail('Выберите период календаря от 1 до 31 дня.');
  return { from: start, to: end };
}
function calendarInput(body) {
  object(body, 'календарь');
  keys(body, ['responsibilityScopeId', 'plans'], 'календарь');
  const responsibilityScopeId = uuid(body.responsibilityScopeId, 'область работы');
  if (!Array.isArray(body.plans) || body.plans.length < 1 || body.plans.length > 31) fail('За один раз можно сохранить от 1 до 31 дня.');
  if (Buffer.byteLength(JSON.stringify(body), 'utf8') > MAX_CALENDAR_BYTES) fail('Изменения календаря слишком большие. Сохраните меньше дней за один раз.');
  const seen = new Set();
  const plans = body.plans.map(raw => {
    object(raw, 'день календаря');
    keys(raw, ['businessDate', 'templateId', 'templateVersion', 'rows', 'version'], 'день календаря');
    const plan = planInput({ ...raw, responsibilityScopeId });
    if (seen.has(plan.businessDate)) fail('Даты сохраняемых планов должны быть уникальными.');
    seen.add(plan.businessDate);
    return plan;
  }).sort((left, right) => left.businessDate.localeCompare(right.businessDate));
  calendarRange(plans[0].businessDate, plans[plans.length - 1].businessDate);
  if (Buffer.byteLength(JSON.stringify({ responsibilityScopeId, plans }), 'utf8') > MAX_CALENDAR_BYTES) fail('Изменения календаря слишком большие. Сохраните меньше дней за один раз.');
  return { responsibilityScopeId, plans };
}
module.exports = { MAX_CALENDAR_BYTES, calendarRange, calendarInput };
