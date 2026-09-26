'use strict';
const { BadRequestException } = require('@nestjs/common');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const formatters = new Map();
function formatter(timeZone) {
  if (!formatters.has(timeZone)) {
    try {
      const value = new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
      value.format(new Date());
      if (formatters.size >= 64) formatters.clear();
      formatters.set(timeZone, value);
    } catch { throw new BadRequestException('Неизвестный часовой пояс'); }
  }
  return formatters.get(timeZone);
}
function localParts(date, timeZone) {
  return Object.fromEntries(formatter(timeZone).formatToParts(date).filter(p => p.type !== 'literal').map(p => [p.type, Number(p.value)]));
}
function wallNumber(parts) { return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour || 0, parts.minute || 0); }
function wallInstant(parts, timeZone) {
  const target = wallNumber(parts), offsets = new Set();
  // Offset samples on both sides cover daylight-saving transitions. A repeated
  // wall time uses its first occurrence; a missing wall time is skipped.
  for (let hours = -36; hours <= 36; hours += 6) {
    const sample = target + hours * 3600000;
    offsets.add(wallNumber(localParts(new Date(sample), timeZone)) - sample);
  }
  const candidates = [...offsets].map(offset => target - offset)
    .filter(value => wallNumber(localParts(new Date(value), timeZone)) === target);
  return candidates.length ? new Date(Math.min(...candidates)) : null;
}
function occurrence(schedule, after, direction = 1) {
  const from = new Date(after);
  if (!Number.isFinite(from.getTime())) throw new BadRequestException('Некорректная дата расписания');
  const local = localParts(from, schedule.timeZone), [hour, minute] = schedule.time.split(':').map(Number);
  for (let offset = 0; offset <= 15; offset++) {
    const day = new Date(Date.UTC(local.year, local.month - 1, local.day + direction * offset));
    if (schedule.frequency === 'weekly' && (day.getUTCDay() || 7) !== schedule.weekday) continue;
    const instant = wallInstant({ year: day.getUTCFullYear(), month: day.getUTCMonth() + 1, day: day.getUTCDate(), hour, minute }, schedule.timeZone);
    if (instant && (direction > 0 ? instant > from : instant < from)) return instant;
  }
  throw new BadRequestException('Не удалось вычислить время запуска');
}
const nextRun = (schedule, after = new Date()) => occurrence(schedule, after, 1);
const previousRun = (schedule, before) => occurrence(schedule, before, -1);
function record(input, keys) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !keys.includes(key))) throw new BadRequestException('Некорректные поля запроса');
  return input;
}
function id(value, name = 'id') {
  if (typeof value !== 'string' || !UUID.test(value)) throw new BadRequestException(`Некорректное поле ${name}`);
  return value.toLowerCase();
}
function recipients(value = []) {
  if (!Array.isArray(value) || value.length > 500) throw new BadRequestException('Необходимо выбрать до 500 получателей');
  return [...new Set(value.map(value => id(value, 'recipientIds')))].sort();
}
function scheduleInput(input) {
  record(input, ['id', 'responsibilityScopeId', 'enabled', 'frequency', 'time', 'timeZone', 'weekday', 'recipientIds']);
  if (typeof input.enabled !== 'boolean' || !['daily', 'weekly'].includes(input.frequency) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time || '') || typeof input.timeZone !== 'string' || input.timeZone.length > 80) throw new BadRequestException('Некорректное расписание');
  const weekday = input.weekday ?? 1;
  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) throw new BadRequestException('День недели должен быть от 1 до 7');
  formatter(input.timeZone);
  return { ...(input.id ? { id: id(input.id) } : {}), responsibilityScopeId: id(input.responsibilityScopeId, 'responsibilityScopeId'), enabled: input.enabled, frequency: input.frequency, time: input.time, timeZone: input.timeZone, weekday, recipientIds: recipients(input.recipientIds) };
}
function periodInput(input, now = new Date()) {
  record(input, ['responsibilityScopeId', 'periodStart', 'periodEnd']);
  const parse = (value, fallback) => {
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(value)) throw new BadRequestException('Укажите дату и часовой пояс');
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) throw new BadRequestException('Некорректный период');
    return date;
  };
  const periodEnd = parse(input.periodEnd, now), periodStart = parse(input.periodStart, new Date(periodEnd.getTime() - 86400000));
  if (periodStart >= periodEnd || periodEnd > new Date(now.getTime() + 60000)) throw new BadRequestException('Некорректный период');
  return { responsibilityScopeId: id(input.responsibilityScopeId, 'responsibilityScopeId'), periodStart, periodEnd };
}
const RULES = [
  ['task', /задач|нужно|необходимо|сдела(?:ть|ем|й)|подготов(?:ить|им|ьте)|срок|дедлайн|поруч|ответственн|\b(?:todo|task|deadline|must|need to)\b/iu],
  ['growth', /рост|раст[её]т|нов(?:ый|ые|ого)\s+(?:клиент|рын|заказ)|возможност|масштабир|выручк|партн[её]р|\b(?:growth|opportunity|expand|revenue)\b/iu],
  ['optimization', /оптимизац|автоматиз|сократ|упрост|ускор|эффектив|экономи|ручн(?:ой|ую|ая)|дублир|\b(?:optimi[sz]|automat|efficien|duplicate)/iu],
  ['risk', /риск|угроз|просроч|срыв|сорв[её]|ошибк|блокир|утечк|потер|задерж|не\s+успе|\b(?:risk|threat|blocked|overdue|delay|leak)\b/iu],
];
function extractDigest(messages) {
  const items = [], conversations = new Set(), sourceMessageIds = [];
  let directMessageCount = 0, branchMessageCount = 0, classifiedMessageCount = 0;
  for (const message of messages) {
    conversations.add(message.conversation_id);
    sourceMessageIds.push(message.id);
    if (message.kind === 'direct') directMessageCount++;
    if (message.parent_id) branchMessageCount++;
    let classified = false;
    for (const [category, pattern] of RULES) if (pattern.test(message.text)) {
      // Exact full source text is kept: no fabricated conclusions, dropped
      // qualifications, implicit completion status, or hidden result cap.
      items.push({ category, text: message.text, sourceMessageIds: [message.id] });
      classified = true;
    }
    if (classified) classifiedMessageCount++;
  }
  const overview = `Обработано ${messages.length} сообщений из ${conversations.size} переписок: ${directMessageCount} личных сообщений, ${branchMessageCount} ответов в ветках. В ${classifiedMessageCount} сообщениях найдены ключевые слова задач, роста, оптимизации или рисков. Остальные ${messages.length - classifiedMessageCount} сообщений также учтены. Ниже — дословные выдержки; категории определены эвристически и требуют проверки человеком.`;
  return { mode: 'extractive', overview, items, sourceMessageIds, messageCount: messages.length, classifiedMessageCount, directMessageCount, branchMessageCount };
}
module.exports = { nextRun, previousRun, scheduleInput, periodInput, extractDigest, recipients, record, id };
