'use strict';

const SOURCE_URL = 'http://127.0.0.1:18314/local1c/odata/standard.odata/';
const EMPTY_ID = '00000000-0000-0000-0000-000000000000';
const ENTITIES = {
  drivers: ['Catalog_Водители', 'Ref_Key,Code,Description,Телефон,Активен'],
  vehicles: ['Catalog_ТранспортныеСредства', 'Ref_Key,Code,Description,ГосНомер,Активен'],
  clients: ['Catalog_Клиенты', 'Ref_Key,Description'],
  projects: ['Catalog_ПроектыКлиентов', 'Ref_Key,Description'],
  requests: ['Document_ЗаявкаКлиента', 'Ref_Key,Number,Date,Клиент_Key,Проект_Key,СтатусЗаявки,ФактическоеВремяНачала,ФактическоеВремяОкончания'],
  shifts: ['Document_СменаТранспорта', 'Ref_Key,Number,Date,ДатаСмены,Клиент_Key,Проект_Key,РесурсыСмены'],
};

function sourceDate(value) {
  if (!value || String(value).startsWith('0001-')) return null;
  return String(value); // 1C local wall time; never relabel it as UTC.
}
function ref(value) { return value && value !== EMPTY_ID ? String(value) : null; }
function sourceId(row) {
  if (typeof row.Ref_Key !== 'string' || !/^[0-9a-f-]{36}$/i.test(row.Ref_Key)) throw new Error('1С вернула запись без корректного идентификатора.');
  return row.Ref_Key;
}
function lookup(rows, name) {
  const map = new Map();
  for (const row of rows) {
    const id = sourceId(row);
    if (map.has(id)) throw new Error(`Повторный идентификатор в ${name}; обновите обмен.`);
    map.set(id, row);
  }
  return map;
}

async function readEntity(entity, select, fetchImpl = fetch, { signal } = {}) {
  const rows = [];
  const pageSize = 500;
  for (let skip = 0; skip <= 10000; skip += pageSize) {
    const url = new URL(encodeURIComponent(entity), SOURCE_URL);
    // 1C treats '+' literally in OData expressions; HTML form encoding yields
    // HTTP 200 with an empty set instead of the expected rows. Use URI spaces.
    url.search = new URLSearchParams({ '$format': 'json', '$select': select, '$filter': 'DeletionMark eq false', '$orderby': 'Ref_Key', '$top': String(pageSize), '$skip': String(skip) }).toString().replaceAll('+', '%20');
    let response;
    try { response = await fetchImpl(url, { method: 'GET', headers: { Accept: 'application/json' }, redirect: 'error', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000) }); }
    catch {
      signal?.throwIfAborted();
      const error = new Error('Нет ответа от локальной 1С. Проверьте, что сервер теста запущен.');
      error.code = 'ONE_C_UNAVAILABLE';
      throw error;
    }
    if (!response.ok) throw new Error(`1С: HTTP ${response.status} при чтении ${entity}.`);
    const body = await response.json();
    if (!Array.isArray(body.value)) throw new Error(`1С вернула неверный формат ${entity}.`);
    rows.push(...body.value);
    if (rows.length > 10000) throw new Error(`В ${entity} больше 10 000 записей. Тест остановлен без обрезки данных.`);
    if (body.value.length < pageSize) return rows;
  }
  throw new Error('Превышен предел страниц 1С.');
}

function normalize(raw, now = new Date().toISOString()) {
  for (const key of Object.keys(ENTITIES)) {
    if (!Array.isArray(raw[key])) throw new Error(`Нет набора ${key}.`);
    lookup(raw[key], key);
  }
  const warnings = [];
  const clients = lookup(raw.clients, 'clients'), projects = lookup(raw.projects, 'projects');
  const drivers = raw.drivers.map(r => ({ id: sourceId(r), code: r.Code, name: r.Description, phone: r.Телефон ?? '', active: r.Активен === true }));
  const vehicles = raw.vehicles.map(r => ({ id: sourceId(r), code: r.Code, name: r.Description, registration: r.ГосНомер ?? '', active: r.Активен === true }));
  const named = (map, id) => map.get(ref(id))?.Description ?? '';
  const requests = raw.requests.map(r => ({ id: sourceId(r), number: r.Number, date: sourceDate(r.Date), status: r.СтатусЗаявки ?? '', clientName: named(clients, r.Клиент_Key), projectName: named(projects, r.Проект_Key), actualStart: sourceDate(r.ФактическоеВремяНачала), actualEnd: sourceDate(r.ФактическоеВремяОкончания) }));
  const shifts = raw.shifts.map(r => ({ id: sourceId(r), number: r.Number, date: sourceDate(r.ДатаСмены) ?? sourceDate(r.Date), clientName: named(clients, r.Клиент_Key), projectName: named(projects, r.Проект_Key) }));
  const driverMap = new Map(drivers.map(r => [r.id, r]));
  const vehicleMap = new Map(vehicles.map(r => [r.id, r]));
  const requestMap = new Map(requests.map(r => [r.id, r]));
  const assignments = [];
  for (const [index, shift] of raw.shifts.entries()) {
    if (!Array.isArray(shift.РесурсыСмены)) throw new Error(`Не получены строки смены ${shift.Number}.`);
    for (const row of shift.РесурсыСмены) {
      const driverId = ref(row.Водитель_Key), vehicleId = ref(row.ТранспортноеСредство_Key), requestId = ref(row.Заявка_Key);
      const driver = driverMap.get(driverId), vehicle = vehicleMap.get(vehicleId), request = requestMap.get(requestId);
      const negativeStatus = ['Неподача', 'Отменен', 'Заменен'].includes(row.СтатусВыходаНаЛинию) || row.ЕстьНеподача === true;
      const departed = row.ВышелНаЛинию === true && !negativeStatus;
      if (row.ВышелНаЛинию === true && negativeStatus) warnings.push(`Смена ${shift.Number}, строка ${row.LineNumber}: отметка выхода противоречит статусу. Строка исключена из итогов выхода и выполнения.`);
      // An assignment/departure alone is never counted as completed work.
      const completed = Boolean(driver && departed && request?.status === 'Выполнена' && request.actualStart && request.actualEnd && request.actualEnd > request.actualStart);
      if ((driverId && !driver) || (vehicleId && !vehicle) || (requestId && !request)) warnings.push(`Смена ${shift.Number}, строка ${row.LineNumber}: связанная запись отсутствует или помечена на удаление.`);
      if (!row.LineNumber) throw new Error(`Нет номера строки в смене ${shift.Number}.`);
      assignments.push({ id: `${shift.Ref_Key}:${row.LineNumber}`, shiftId: shift.Ref_Key, shiftNumber: shift.Number, date: shifts[index].date, driverId, driverName: driver?.name ?? '', vehicleId, vehicleRegistration: vehicle?.registration ?? '', requestId, requestNumber: request?.number ?? '', status: row.СтатусВыходаНаЛинию ?? '', departed, completed, actualStart: request?.actualStart ?? null, actualEnd: request?.actualEnd ?? null });
    }
  }
  if (new Set(assignments.map(r => r.id)).size !== assignments.length) throw new Error('Повторные номера строк смен.');
  warnings.push('Показаны существующие записи локальной InfoBase, включая ранее созданные демонстрационные данные. Это не данные рабочих ТЛЭиУАТ и КА 2.');
  warnings.push('Выполненная заявка при назначенном водителе и выходе — признак выполнения заказа, а не подтверждение лично отработанной смены. Связь с кандидатами рекрутинга ещё не настроена.');
  return { schemaVersion: 'transport.local-test.v1', source: { name: 'Самописная 1С · InfoBase', path: '/Users/victor/Documents/InfoBase', platform: '8.5.1.1150', mode: 'live' }, fetchedAt: now, counts: { drivers: drivers.length, vehicles: vehicles.length, requests: requests.length, shifts: shifts.length, assignments: assignments.length, departed: assignments.filter(r => r.departed).length, completed: assignments.filter(r => r.completed).length }, drivers, vehicles, requests, shifts, assignments, warnings };
}

async function readSnapshot(fetchImpl = fetch, { signal } = {}) {
  const raw = {};
  // Developer license permits only one HTTP session; read serially.
  for (const [key, [entity, select]] of Object.entries(ENTITIES)) raw[key] = await readEntity(entity, select, fetchImpl, { signal });
  return normalize(raw);
}
module.exports = { SOURCE_URL, ENTITIES, readEntity, normalize, readSnapshot };
