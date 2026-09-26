'use strict';

// Local InfoBase only. Immutable exports: no PATCH, PUT, DELETE or posting.
// Deterministic Ref_Key + ownership/payload marker allow safe retries after a
// committed POST whose response was lost. A partial pair is resumed, not deleted.
// Official Ref_Key/tabular POST example:
// https://1c-dn.com/blog/synchronization-between-a-mobile-app-and-a-database-server-on-the-1c-platform/
const { createHash } = require('node:crypto');
const { SOURCE_URL } = require('./adapter.cjs');
const { recoverSnapshot } = require('./recovery.cjs');

const REQUEST_ENTITY = 'Document_ЗаявкаКлиента';
const SHIFT_ENTITY = 'Document_СменаТранспорта';
const EMPTY_ID = '00000000-0000-0000-0000-000000000000';
const ZERO_DATE = '0001-01-01T00:00:00';
const ID_NAMESPACE = Buffer.from('e68bb04842385506a0cbfeb46e1e29c8', 'hex');
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function fail(code, message, details = {}) {
  return Object.assign(new Error(message), { code, ...details });
}
function requiredText(value, name, limit) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > limit || /[\0\r\n]/u.test(value)) {
    throw fail('ONE_C_VALIDATION', `Некорректное поле ${name}.`);
  }
  return value.trim();
}
function uuid(value, name) {
  if (typeof value !== 'string' || !GUID.test(value) || value === EMPTY_ID) {
    throw fail('ONE_C_VALIDATION', `Не выбрано соответствие 1С: ${name}.`);
  }
  return value.toLowerCase();
}
function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '0100-01-01') {
    throw fail('ONE_C_VALIDATION', 'Дата смены должна иметь формат ГГГГ-ММ-ДД.');
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw fail('ONE_C_VALIDATION', 'Указана несуществующая дата смены.');
  }
  return value;
}
function time(value, name) {
  if (typeof value !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value)) {
    throw fail('ONE_C_VALIDATION', `Некорректное время ${name}; требуется ЧЧ:ММ.`);
  }
  return value.length === 5 ? `${value}:00` : value;
}
function deterministicId(name) {
  const bytes = createHash('sha1').update(ID_NAMESPACE).update(name, 'utf8').digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 15) | 0x50;
  bytes[8] = (bytes[8] & 63) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Pure validation/preparation; does not start 1C or make any HTTP request. */
function preparePlannedAssignment(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw fail('ONE_C_VALIDATION', 'Нет данных плановой смены.');
  const status = input.status ?? 'planned';
  if (!['planned', 'confirmed'].includes(status) || input.cancelled === true || input.canceled === true || input.assigned === false) {
    throw fail('ONE_C_VALIDATION', 'Можно отправлять только назначенные, неотменённые плановые смены.');
  }
  if (input.departed || input.completed || input.posted || input.actualStart || input.actualEnd) {
    throw fail('ONE_C_VALIDATION', 'Этот обмен передаёт только план, без факта выхода или выполнения.');
  }
  const normalized = {
    sourceNamespace: requiredText(input.sourceNamespace, 'sourceNamespace', 100),
    externalKey: requiredText(input.externalKey, 'externalKey', 300),
    clientId: uuid(input.clientId, 'клиент'),
    projectId: uuid(input.projectId, 'проект'),
    date: date(input.date),
    driverId: uuid(input.driverId, 'водитель'),
    vehicleId: uuid(input.vehicleId, 'автомобиль'),
    startTime: time(input.startTime, 'начала'),
    endTime: input.endTime == null || input.endTime === '' ? null : time(input.endTime, 'окончания'),
    notes: input.notes == null ? '' : input.notes,
    status,
  };
  if (typeof normalized.notes !== 'string' || normalized.notes.length > 800 || normalized.notes.includes('\0')) {
    throw fail('ONE_C_VALIDATION', 'Примечание должно содержать не более 800 символов.');
  }
  normalized.notes = normalized.notes.replaceAll('\r\n', '\n');
  if (normalized.startTime === normalized.endTime) throw fail('ONE_C_VALIDATION', 'Начало и окончание смены не могут совпадать.');
  if (input.tripCount != null && Number(input.tripCount) !== 1) throw fail('ONE_C_VALIDATION', 'За одну отправку поддерживается только один рейс.');
  const endDate = normalized.endTime == null ? null : normalized.endTime < normalized.startTime
    ? new Date(new Date(`${normalized.date}T00:00:00Z`).getTime() + 86400000).toISOString().slice(0, 10)
    : normalized.date;
  if (endDate != null && !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) throw fail('ONE_C_VALIDATION', 'Дата окончания выходит за поддерживаемый диапазон.');
  const identity = JSON.stringify([normalized.sourceNamespace, normalized.externalKey]);
  const payloadHash = sha256(JSON.stringify(normalized));
  const ownerPrefix = `[local-planning:v1:${sha256(identity).slice(0, 32)}:`;
  const marker = `${ownerPrefix}${payloadHash}]`;
  const requestId = deterministicId(`${identity}:request`);
  const shiftId = deterministicId(`${identity}:shift`);
  const interval = `План: ${normalized.date} ${normalized.startTime}${endDate ? ` — ${endDate} ${normalized.endTime}` : '; окончание не задано'}`;
  const comment = `${marker}\n${interval}${normalized.notes ? `\n${normalized.notes}` : ''}`;
  if (comment.length > 1000) throw fail('ONE_C_VALIDATION', 'Примечание вместе с меткой обмена превышает длину поля 1С.');
  const midnight = `${normalized.date}T00:00:00`;
  // The actual configuration declares the misleadingly named planned-date
  // attributes Date-only. Preserve clock times in its separate Time attributes.
  const requestBody = {
    Ref_Key: requestId, Date: midnight, Posted: false, DeletionMark: false,
    Клиент_Key: normalized.clientId, Проект_Key: normalized.projectId,
    СтатусЗаявки: status === 'confirmed' ? 'Подтверждена' : 'НазначенРесурс',
    ДатаПодачи: midnight, ВремяПодачи: `0001-01-01T${normalized.startTime}`,
    ВременноеОкноС: `0001-01-01T${normalized.startTime}`, ВременноеОкноПо: normalized.endTime ? `0001-01-01T${normalized.endTime}` : ZERO_DATE,
    ПлановоеВремяНачала: midnight, ПлановоеВремяОкончания: endDate ? `${endDate}T00:00:00` : ZERO_DATE,
    КоличествоМашин: 1, ВнутреннийКомментарий: comment,
  };
  const shiftBody = {
    Ref_Key: shiftId, Date: midnight, ДатаСмены: midnight, Posted: false, DeletionMark: false,
    Клиент_Key: normalized.clientId, Проект_Key: normalized.projectId,
    ПлановоеКоличествоТС: 1, ФактическоеКоличествоТС: 0, Комментарий: comment,
    РесурсыСмены: [{
      // Parent Ref_Key is implicit here. Single-entity OData reads omit it
      // inside tabular rows even though collection reads can include it.
      LineNumber: '1', Заявка_Key: requestId,
      Водитель_Key: normalized.driverId, ТранспортноеСредство_Key: normalized.vehicleId,
      ПлановоеВремяПодачи: midnight, ВышелНаЛинию: false,
      СтатусВыходаНаЛинию: status === 'confirmed' ? 'Подтвержден' : 'Запланирован',
      СтатусПодтверждения: 'НеОтправлено', РольРесурсаВСмене: 'Основной',
      Комментарий: `${marker}\n${interval}`,
    }],
  };
  return { normalized, requestId, shiftId, payloadHash, ownerPrefix, marker, requestBody, shiftBody, endDate };
}

function entityUrl(entity, id) {
  const resource = `${encodeURIComponent(entity)}${id ? `(guid'${uuid(id, 'ссылка документа')}')` : ''}`;
  const url = new URL(resource, SOURCE_URL);
  url.search = '$format=json';
  return url;
}
async function requestJson(fetchImpl, entity, id, { method = 'GET', body, signal, requestTimeoutMs = 20000 } = {}) {
  signal?.throwIfAborted();
  const timeoutSignal = AbortSignal.timeout(requestTimeoutMs);
  let response;
  let text;
  try {
    response = await fetchImpl(entityUrl(entity, id), {
      method, redirect: 'error',
      headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json; charset=utf-8' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal,
    });
    text = await response.text();
  } catch (cause) {
    signal?.throwIfAborted();
    throw fail('ONE_C_UNAVAILABLE', `Нет ответа от локальной 1С при ${method} ${entity}. Повтор безопасен с тем же ключом строки.`, { cause });
  }
  if (method === 'GET' && response.status === 404) return null;
  if (!response.ok) {
    let detail = '';
    try { const parsed = JSON.parse(text); detail = parsed['odata.error']?.message?.value ?? parsed.error?.message ?? ''; } catch {}
    throw fail([401, 403].includes(response.status) ? 'ONE_C_AUTH' : 'ONE_C_HTTP',
      `1С: HTTP ${response.status} при ${method} ${entity}.${detail ? ` ${String(detail).slice(0, 400)}` : ''}`, { status: response.status });
  }
  if (!text.trim()) return null;
  let result;
  try { result = JSON.parse(text); } catch { throw fail('ONE_C_SCHEMA', `1С вернула не JSON при ${method} ${entity}.`); }
  if (!result || typeof result !== 'object' || Array.isArray(result) || result['odata.error']) {
    throw fail('ONE_C_SCHEMA', `Некорректный ответ 1С при ${method} ${entity}.`);
  }
  return result;
}

function canonical(value, expected) {
  if (typeof expected === 'number') return Number(value);
  if (typeof expected === 'string' && GUID.test(expected)) return typeof value === 'string' ? value.toLowerCase() : value;
  if (typeof expected === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(expected)) return typeof value === 'string' ? value.replace(/\.0+$/, '') : value;
  return value;
}
function comparePlanned(actual, expected, label) {
  for (const [key, value] of Object.entries(expected)) {
    if (Array.isArray(value)) {
      if (!Array.isArray(actual[key]) || actual[key].length !== value.length) throw fail('ONE_C_CONFLICT', `${label}: состав строк изменён в 1С.`);
      value.forEach((row, index) => comparePlanned(actual[key][index], row, `${label}, строка ${index + 1}`));
    } else if (canonical(actual[key], value) !== value) {
      throw fail('ONE_C_CONFLICT', `${label}: поле «${key}» отличается от отправленного плана. Изменение документа автоматически не выполняется.`);
    }
  }
}
function hasFactDate(value) { return Boolean(value && value !== ZERO_DATE && !String(value).startsWith('0001-01-01T00:00:00')); }
function assertOwnedPlanned(actual, expected, prepared, kind) {
  const label = kind === 'request' ? 'Заявка' : 'Смена';
  const commentField = kind === 'request' ? 'ВнутреннийКомментарий' : 'Комментарий';
  if (typeof actual[commentField] !== 'string' || !actual[commentField].startsWith(prepared.ownerPrefix)) {
    throw fail('ONE_C_CONFLICT', `${label}: идентификатор уже занят документом без метки этой строки приложения.`);
  }
  if (actual[commentField].split('\n')[0] !== prepared.marker) {
    throw fail('ONE_C_CONFLICT', `${label}: эта строка уже отправлена с другими данными. Изменения после отправки пока не поддерживаются.`);
  }
  if (actual.DeletionMark === true || actual.Posted === true) throw fail('ONE_C_CONFLICT', `${label}: документ удалён или проведён в 1С.`);
  if (kind === 'request') {
    if (hasFactDate(actual.ФактическоеВремяНачала) || hasFactDate(actual.ФактическоеВремяОкончания)) {
      throw fail('ONE_C_CONFLICT', 'Заявка уже содержит фактическое исполнение в 1С.');
    }
  } else {
    if (Number(actual.ФактическоеКоличествоТС || 0) !== 0 || actual.РесурсыСмены?.some((row) =>
      row.ВышелНаЛинию === true || row.ЕстьНеподача === true || row.ЕстьОпоздание === true || hasFactDate(row.ФактическоеВремяПодачи))) {
      throw fail('ONE_C_CONFLICT', 'Смена уже содержит фактическое исполнение в 1С.');
    }
  }
  comparePlanned(actual, expected, label);
}

async function validateReferences(prepared, io) {
  const { normalized: input } = prepared;
  const definitions = [
    ['Catalog_Клиенты', input.clientId, 'Клиент'],
    ['Catalog_ПроектыКлиентов', input.projectId, 'Проект'],
    ['Catalog_Водители', input.driverId, 'Водитель'],
    ['Catalog_ТранспортныеСредства', input.vehicleId, 'Автомобиль'],
  ];
  for (const [entity, id, label] of definitions) {
    const row = await io(entity, id);
    if (!row || row.Ref_Key?.toLowerCase() !== id || row.DeletionMark === true || row.Активен !== true) {
      throw fail('ONE_C_VALIDATION', `${label} отсутствует, удалён или неактивен в локальной 1С.`);
    }
    if (entity === 'Catalog_ПроектыКлиентов' && row.Owner_Key?.toLowerCase() !== input.clientId) {
      throw fail('ONE_C_VALIDATION', 'Выбранный проект 1С не принадлежит выбранному клиенту.');
    }
  }
}

/**
 * input: {sourceNamespace,externalKey,clientId,projectId,date,driverId,vehicleId,
 *         startTime,endTime,notes?,status?:'planned'|'confirmed'}.
 * Existing owned documents are verified and reused, never updated. Changes to
 * an already exported payload require manual resolution rather than new IDs.
 * Caller must serialize this with other local 1C I/O (one developer session).
 */
async function exportPlannedAssignment(input, options = {}) {
  const prepared = preparePlannedAssignment(input);
  const {
    fetchImpl = fetch,
    ensureSource = (args) => require('./manage.cjs').ensureSource(args),
    signal, timeoutMs = 120000, requestTimeoutMs = 20000,
    wait, now,
  } = options;
  const created = new Set();
  const uncertain = new Set();
  const attempt = async ({ signal: operationSignal }) => {
    const io = (entity, id, extra = {}) => requestJson(fetchImpl, entity, id, { signal: operationSignal, requestTimeoutMs, ...extra });
    let request = await io(REQUEST_ENTITY, prepared.requestId);
    let shift = await io(SHIFT_ENTITY, prepared.shiftId);
    if (request) assertOwnedPlanned(request, prepared.requestBody, prepared, 'request');
    if (shift) assertOwnedPlanned(shift, prepared.shiftBody, prepared, 'shift');
    if (shift && !request) throw fail('ONE_C_CONFLICT', 'Смена уже существует, но связанная заявка отсутствует. Требуется проверка в 1С.');
    if (!request || !shift) await validateReferences(prepared, io);

    const createAndVerify = async (entity, body, kind) => {
      let response;
      try { response = await io(entity, null, { method: 'POST', body }); }
      catch (error) {
        uncertain.add(kind);
        // Read before any next POST. HTTP failures can also follow a commit.
        // Transport failures are recovered by restarting this whole attempt,
        // whose first operations are GETs of the deterministic identities.
        if (error.code === 'ONE_C_UNAVAILABLE' || operationSignal.aborted) throw error;
        const existing = await io(entity, body.Ref_Key);
        if (!existing) throw error;
        assertOwnedPlanned(existing, body, prepared, kind);
        return existing;
      }
      if (response?.Ref_Key && response.Ref_Key.toLowerCase() !== body.Ref_Key) {
        throw fail('ONE_C_CONFLICT', '1С создала документ с неожиданным идентификатором. Автоматический повтор остановлен; требуется проверка.', { expectedId: body.Ref_Key, returnedId: response.Ref_Key });
      }
      created.add(kind);
      const saved = await io(entity, body.Ref_Key);
      if (!saved) throw fail('ONE_C_CONFLICT', '1С подтвердила запись, но документ по ожидаемому идентификатору не найден.');
      assertOwnedPlanned(saved, body, prepared, kind);
      return saved;
    };
    if (!request) request = await createAndVerify(REQUEST_ENTITY, prepared.requestBody, 'request');
    if (!shift) shift = await createAndVerify(SHIFT_ENTITY, prepared.shiftBody, 'shift');
    return {
      requestId: prepared.requestId, requestNumber: String(request.Number ?? '').trimEnd(),
      shiftId: prepared.shiftId, shiftNumber: String(shift.Number ?? '').trimEnd(),
      payloadHash: prepared.payloadHash,
      created: created.size > 0, reused: created.size < 2,
      status: created.size > 0 ? 'created' : 'unchanged',
      requestCreated: created.has('request'), shiftCreated: created.has('shift'),
      recovered: uncertain.size > 0,
    };
  };
  return recoverSnapshot({ ensureSource, readSnapshot: attempt, signal, timeoutMs, ...(wait ? { wait } : {}), ...(now ? { now } : {}) });
}

module.exports = { preparePlannedAssignment, exportPlannedAssignment, REQUEST_ENTITY, SHIFT_ENTITY };
