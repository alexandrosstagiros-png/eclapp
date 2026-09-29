'use strict';

const { inflateRawSync } = require('node:zlib');
const { TextDecoder } = require('node:util');
const { normalizePlate, LIMITS } = require('./fleet-model');
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_EXPANDED_BYTES = 160 * 1024 * 1024;
const HEADERS = Object.freeze({
  'ЗН_id': 'orderId', 'Номер ЗН': 'orderNumber', 'Дата открытия': 'openedOn', 'Месяц открытия': null,
  'Госномер': 'plate', 'Бренд ТС': 'vehicleBrand', 'Марка': 'vehicleGroup', 'Год': 'vehicleYear', 'Тип ТС': 'vehicleType',
  'Пробег, км': 'odometerKm', 'Тип позиции': 'positionType', 'Группа': 'group', 'Узел': 'node', 'Наименование': 'name',
  'Бренд': 'partBrand', 'Кол-во': 'quantity', 'Ед.': 'unit', 'Цена за ед., ₽': 'unitPriceCents', 'Сумма, ₽': 'amountCents',
  'Долив (не замена)': 'topUp', 'Шины': 'tire', 'Подрядчик': 'supplier', 'Своими силами': 'ownWorkReported',
  'Своими силами (как в источнике)': 'ownWorkReported',
  'Статус ЗН': 'status', 'Дата завершения': 'completedOn', 'Месяц завершения': null, 'Группа (авто)': 'autoGroup', 'Узел (авто)': 'autoNode',
});
const TEXT_FIELDS = ['orderId', 'orderNumber', 'plate', 'vehicleBrand', 'vehicleGroup', 'vehicleType', 'positionType', 'group', 'node', 'name', 'partBrand', 'unit', 'supplier', 'status', 'autoGroup', 'autoNode'];
function fail(message) { const error = new Error(message); error.code = 'FLEET_VALIDATION'; error.status = 400; error.statusCode = 400; throw error; }
function cellValue(value) {
  if (value == null) return null;
  if (value instanceof Date || typeof value !== 'object') return value;
  if ('formula' in value || 'sharedFormula' in value) return cellValue(value.result);
  if (Array.isArray(value.richText)) return value.richText.map(part => part.text || '').join('');
  if ('text' in value) return String(value.text);
  return null;
}
function text(value) { const result = cellValue(value); return result == null ? '' : String(result).trim(); }
function decimal(value, sourceRow, label, required = false) {
  value = cellValue(value);
  if (value == null || value === '') { if (required) fail('Строка ' + sourceRow + ': не заполнено поле «' + label + '».'); return null; }
  if (typeof value !== 'number' && typeof value !== 'string') fail('Строка ' + sourceRow + ': некорректное число в поле «' + label + '».');
  const normalized = String(value).trim().replace(/[\s\u00a0\u202f]/g, '').replace(',', '.');
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(normalized)) fail('Строка ' + sourceRow + ': некорректное число в поле «' + label + '».');
  if (!Number.isFinite(Number(normalized))) fail('Строка ' + sourceRow + ': число выходит за допустимый диапазон.');
  return normalized;
}
// Decimal-string conversion avoids 1.005 * 100 floating-point rounding loss.
// Round once to kopecks, half away from zero, preserving source sign.
function cents(value, sourceRow, label, required = false) {
  const input = decimal(value, sourceRow, label, required);
  if (input == null) return null;
  const match = /^([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(input);
  const exponent = Number(match[4] || 0), fraction = match[3] || '', digits = ((match[2] || '') + fraction).replace(/^0+/, '') || '0';
  const shift = exponent - fraction.length + 2;
  if (Math.abs(exponent) > 1000 || digits.length > 1000) fail('Строка ' + sourceRow + ': сумма выходит за допустимый диапазон.');
  let magnitude = BigInt(digits);
  if (shift >= 0) { if (shift > 20 && magnitude) fail('Строка ' + sourceRow + ': сумма выходит за допустимый диапазон.'); magnitude *= 10n ** BigInt(shift); }
  else { const divisor = 10n ** BigInt(-shift); magnitude = (magnitude + divisor / 2n) / divisor; }
  const result = Number(match[1] === '-' ? -magnitude : magnitude);
  if (!Number.isSafeInteger(result)) fail('Строка ' + sourceRow + ': сумма выходит за допустимый диапазон точных расчётов.');
  return result;
}
function number(value, sourceRow, label) { const result = decimal(value, sourceRow, label); return result == null ? null : Number(result); }
function boolean(value, sourceRow, label) {
  value = cellValue(value);
  if (value == null || value === '') return false;
  if (value === true || value === 1 || /^(true|истина|да|1)$/i.test(String(value).trim())) return true;
  if (value === false || value === 0 || /^(false|ложь|нет|0)$/i.test(String(value).trim())) return false;
  fail('Строка ' + sourceRow + ': некорректное логическое значение в поле «' + label + '».');
}
function date(value, sourceRow, label, date1904 = false) {
  value = cellValue(value);
  if (value == null || value === '') return null;
  let iso;
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) fail('Строка ' + sourceRow + ': некорректная дата.');
    iso = value.toISOString().slice(0, 10);
  } else if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0 || value > 2958465) fail('Строка ' + sourceRow + ': некорректная дата.');
    const serial = Math.floor(value);
    if (!date1904 && serial === 60) fail('Строка ' + sourceRow + ': недопустимая календарная дата.');
    const base = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 31);
    iso = new Date(base + (serial - (!date1904 && serial > 60 ? 1 : 0)) * 86400000).toISOString().slice(0, 10);
  } else {
    const input = String(value).trim();
    const russian = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(input);
    iso = russian ? russian[3] + '-' + russian[2] + '-' + russian[1] : input;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) fail('Строка ' + sourceRow + ': некорректная дата в поле «' + label + '».');
  const parsed = new Date(iso + 'T00:00:00Z');
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== iso) fail('Строка ' + sourceRow + ': некорректная календарная дата.');
  return iso;
}
function rowFromCells(cells, columns, sourceRow, date1904) {
  const row = { sourceRow };
  const value = field => columns.has(field) ? cells[columns.get(field)] : null;
  for (const field of TEXT_FIELDS) row[field] = text(value(field));
  if (!row.orderId || !row.plate || !row.name) fail('Строка ' + sourceRow + ': обязательны ЗН_id, госномер и наименование.');
  row.positionType = row.positionType.toLowerCase();
  if (!['работа', 'запчасть'].includes(row.positionType)) fail('Строка ' + sourceRow + ': тип позиции должен быть «работа» или «запчасть».');
  row.openedOn = date(value('openedOn'), sourceRow, 'Дата открытия', date1904);
  row.completedOn = date(value('completedOn'), sourceRow, 'Дата завершения', date1904);
  row.vehicleYear = number(value('vehicleYear'), sourceRow, 'Год');
  row.odometerKm = number(value('odometerKm'), sourceRow, 'Пробег, км');
  row.quantity = number(value('quantity'), sourceRow, 'Кол-во');
  row.unitPriceCents = cents(value('unitPriceCents'), sourceRow, 'Цена за ед., ₽');
  row.amountCents = cents(value('amountCents'), sourceRow, 'Сумма, ₽', true);
  for (const [field, label] of [['topUp', 'Долив (не замена)'], ['tire', 'Шины'], ['ownWorkReported', 'Своими силами']]) row[field] = boolean(value(field), sourceRow, label);
  return row;
}
function headerMap(cells) {
  const map = new Map();
  for (let index = 0; index < cells.length; index++) {
    const header = text(cells[index]).replace(/^\ufeff/, '');
    if (!Object.prototype.hasOwnProperty.call(HEADERS, header) || !HEADERS[header]) continue;
    const field = HEADERS[header];
    if (map.has(field)) fail('Повторяющийся заголовок «' + header + '».');
    map.set(field, index);
  }
  for (const [header, field] of Object.entries(HEADERS)) if (['orderId', 'plate', 'positionType', 'name', 'amountCents'].includes(field) && !map.has(field)) fail('В листе «Позиции» отсутствует обязательный столбец «' + header + '».');
  if (!map.has('completedOn') && !map.has('openedOn')) fail('В источнике нет столбца даты открытия или завершения.');
  return map;
}
function checkZip(buffer) {
  // Validate central/local entry boundaries and actual inflation before ExcelJS.
  // Central directory sizes alone are not sufficient against forged zip bombs.
  let eocd = -1;
  for (let pos = buffer.length - 22; pos >= Math.max(0, buffer.length - 65557); pos--) if (buffer.readUInt32LE(pos) === 0x06054b50 && pos + 22 + buffer.readUInt16LE(pos + 20) === buffer.length) { eocd = pos; break; }
  if (eocd < 0) fail('Файл XLSX повреждён или имеет неподдерживаемый формат.');
  const disk = buffer.readUInt16LE(eocd + 4), startDisk = buffer.readUInt16LE(eocd + 6), entries = buffer.readUInt16LE(eocd + 10), directoryBytes = buffer.readUInt32LE(eocd + 12), directory = buffer.readUInt32LE(eocd + 16);
  if (disk || startDisk || entries === 65535 || entries > 10000 || directory === 0xffffffff || directory + directoryBytes > eocd) fail('Неподдерживаемый или слишком большой архив XLSX.');
  let offset = directory, expanded = 0; const names = new Set();
  for (let index = 0; index < entries; index++) {
    if (offset + 46 > eocd || buffer.readUInt32LE(offset) !== 0x02014b50) fail('Файл XLSX повреждён.');
    const flags = buffer.readUInt16LE(offset + 8), method = buffer.readUInt16LE(offset + 10), compressed = buffer.readUInt32LE(offset + 20), expected = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28), extraLength = buffer.readUInt16LE(offset + 30), commentLength = buffer.readUInt16LE(offset + 32), local = buffer.readUInt32LE(offset + 42);
    const end = offset + 46 + nameLength + extraLength + commentLength;
    if (end > directory + directoryBytes || compressed === 0xffffffff || expected === 0xffffffff || flags & 1 || ![0, 8].includes(method)) fail('Неподдерживаемый формат архива XLSX.');
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength);
    if (names.has(name) || name.includes('\\') || name.split('/').includes('..')) fail('Некорректная структура архива XLSX.');
    names.add(name);
    if (local + 30 > directory || buffer.readUInt32LE(local) !== 0x04034b50) fail('Файл XLSX повреждён.');
    const dataOffset = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    if (dataOffset + compressed > directory || expanded + expected > MAX_EXPANDED_BYTES) fail('Распакованный файл превышает допустимые 160 МиБ.');
    const data = buffer.subarray(dataOffset, dataOffset + compressed);
    let actual;
    try { actual = method === 0 ? data : inflateRawSync(data, { maxOutputLength: MAX_EXPANDED_BYTES - expanded + 1 }); }
    catch (_) { fail('Повреждённый архив или превышен предел распаковки 160 МиБ.'); }
    expanded += actual.length;
    if (expanded > MAX_EXPANDED_BYTES) fail('Распакованный файл превышает допустимые 160 МиБ.');
    if (actual.length !== expected) fail('Некорректный размер данных внутри XLSX.');
    offset = end;
  }
  if (offset !== directory + directoryBytes || !names.has('xl/workbook.xml') || !names.has('[Content_Types].xml')) fail('Файл не является книгой XLSX.');
  return expanded;
}
function csvRecords(content) {
  let firstLine = '', inside = false;
  for (let i = 0; i < content.length; i++) { const char = content[i]; if (char === '"') inside = !inside; if ((char === '\n' || char === '\r') && !inside) break; firstLine += char; }
  const delimiters = [';', ',', '\t'];
  const delimiter = delimiters.sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0];
  const records = []; let cells = [], cell = '', quoted = false, closed = false, physicalLine = 1, startLine = 1;
  const endCell = () => { cells.push(cell); cell = ''; closed = false; };
  const endRow = () => { endCell(); if (cells.some(value => value.trim() !== '')) records.push({ sourceRow: startLine, cells }); cells = []; startLine = physicalLine + 1; if (records.length > LIMITS.maxRows + 1) fail('Источник содержит больше 100 000 позиций.'); };
  for (let index = 0; index < content.length; index++) {
    const char = content[index];
    if (quoted) {
      if (char === '"') { if (content[index + 1] === '"') { cell += '"'; index++; } else { quoted = false; closed = true; } }
      else { cell += char; if (char === '\n') physicalLine++; }
    } else if (char === '"' && !cell && !closed) quoted = true;
    else if (char === delimiter) endCell();
    else if (char === '\r' || char === '\n') { if (char === '\r' && content[index + 1] === '\n') index++; endRow(); physicalLine++; }
    else { if (closed || char === '"') fail('Некорректные кавычки в CSV.'); cell += char; }
  }
  if (quoted) fail('В CSV не закрыты кавычки.');
  if (cell || cells.length || closed) endRow();
  return records;
}
function parseReferences(sheet) {
  if (!sheet) return null;
  const header = new Map(); sheet.getRow(1).eachCell((cell, index) => header.set(text(cell.value), index));
  if (!header.has('Госномер')) return null;
  const rows = [];
  sheet.eachRow((row, sourceRow) => {
    if (sourceRow === 1) return;
    const get = name => header.has(name) ? row.getCell(header.get(name)).value : null;
    const plate = text(get('Госномер')); if (!plate) return;
    if (rows.length >= LIMITS.maxRows) fail('Справочник автомобилей превышает допустимый размер.');
    rows.push({ sourceRow, plate, vehicleGroup: text(get('Марка')), vehicleBrand: text(get('Бренд ТС')), vehicleYear: number(get('Год'), sourceRow, 'Год') });
  });
  return rows;
}
function parseReconciliation(sheet) {
  if (!sheet) return null;
  let headerRow = 0, columns;
  for (let index = 1; index <= Math.min(sheet.rowCount, 30); index++) {
    const cells = sheet.getRow(index).values.slice(1).map(text);
    if (cells.includes('Машина') && cells.includes('Месяц') && cells.includes('Завгар, ₽') && cells.includes('«Ремонты», ₽')) { headerRow = index; columns = new Map(cells.map((cell, index) => [cell, index + 1])); break; }
  }
  if (!headerRow) return { kind: 'unreadable_snapshot', sourceSheet: sheet.name, sourceNotes: ['Структура сохранённой сверки не распознана.'], rows: [] };
  const sourceNotes = [];
  for (let index = 1; index < headerRow; index++) { const note = text(sheet.getRow(index).getCell(1).value); if (note) sourceNotes.push(note); }
  const rows = [];
  sheet.eachRow((row, sourceRow) => {
    if (sourceRow <= headerRow) return;
    const get = name => columns.has(name) ? row.getCell(columns.get(name)).value : null;
    const plate = text(get('Машина')), month = text(get('Месяц')); if (!plate && !month) return;
    if (!plate || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) fail('Строка ' + sourceRow + ': некорректный месяц или госномер в сохранённой сверке.');
    if (rows.length >= LIMITS.maxRows) fail('Сохранённая сверка превышает допустимый размер.');
    rows.push({ sourceRow, plate, month, vehicleGroup: text(get('Марка')), sourceAmountCents: cents(get('Завгар, ₽'), sourceRow, 'Завгар, ₽', true),
      comparisonAmountCents: cents(get('«Ремонты», ₽'), sourceRow, '«Ремонты», ₽', true), savedDifferenceCents: cents(get('Разница, ₽'), sourceRow, 'Разница, ₽'),
      orderDescription: text(get('Наряды в Завгаре за месяц')), comment: text(get('Комментарий')) });
  });
  return { kind: 'partial_snapshot', sourceSheet: sheet.name, sourceNotes, rows };
}
async function parseWorkbook(input, filename = '') {
  if (!Buffer.isBuffer(input) && !(input instanceof Uint8Array)) fail('Не передан файл для загрузки.');
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
  if (!buffer.length) fail('Файл пуст.');
  if (buffer.length > MAX_FILE_BYTES) fail('Размер файла превышает допустимые 20 МиБ.');
  const extension = String(filename).toLowerCase().split('.').pop();
  if (!['xlsx', 'csv'].includes(extension)) fail('Поддерживаются только файлы XLSX и CSV.');
  let rows = [], referenceVehicles = null, reconciliation = null, expandedBytes = buffer.length, sheetNames = [], columns;
  if (extension === 'csv') {
    let content;
    try { content = new TextDecoder('utf-8', { fatal: true }).decode(buffer).replace(/^\ufeff/, ''); }
    catch (_) { fail('CSV должен быть сохранён в кодировке UTF-8.'); }
    const records = csvRecords(content);
    if (!records.length) fail('В файле нет строк с позициями.');
    columns = headerMap(records[0].cells);
    rows = records.slice(1).map(record => rowFromCells(record.cells, columns, record.sourceRow, false));
    sheetNames = ['Позиции (CSV)'];
  } else {
    expandedBytes = checkZip(buffer);
    let workbook;
    try { const ExcelJS = require('exceljs'); workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(buffer); }
    catch (_) { fail('Не удалось прочитать XLSX. Проверьте формат и целостность файла.'); }
    sheetNames = workbook.worksheets.map(sheet => sheet.name);
    const source = workbook.getWorksheet('Позиции');
    if (!source) fail('В книге отсутствует обязательный лист «Позиции».');
    columns = headerMap(source.getRow(1).values.slice(1));
    source.eachRow((row, sourceRow) => {
      if (sourceRow === 1) return;
      const cells = row.values.slice(1);
      if (!cells.some(value => cellValue(value) != null && text(value) !== '')) return;
      if (rows.length >= LIMITS.maxRows) fail('Источник содержит больше 100 000 позиций.');
      rows.push(rowFromCells(cells, columns, sourceRow, Boolean(workbook.properties.date1904)));
    });
    referenceVehicles = parseReferences(workbook.getWorksheet('Марки'));
    reconciliation = parseReconciliation(workbook.getWorksheet('Сверка с Ремонтами'));
  }
  if (!rows.length) fail('В листе «Позиции» нет строк данных.');
  if (rows.length > LIMITS.maxRows) fail('Источник содержит больше 100 000 позиций.');
  if (referenceVehicles) { const known = new Set(referenceVehicles.map(row => normalizePlate(row.plate))); rows.forEach(row => { row.referenceVehicleMissing = !known.has(normalizePlate(row.plate)); }); }
  const ranges = {};
  for (const key of ['openedOn', 'completedOn']) { const dates = rows.map(row => row[key]).filter(Boolean).sort(); ranges[key] = { from: dates[0] || null, to: dates[dates.length - 1] || null }; }
  let total = 0;
  for (const row of rows) { total += row.amountCents; if (!Number.isSafeInteger(total)) fail('Общая сумма выходит за допустимый диапазон точных расчётов.'); }
  return { rows, referenceVehicles: referenceVehicles || [], reconciliation,
    metadata: { format: extension, sourceSheet: extension === 'csv' ? 'Позиции (CSV)' : 'Позиции', sheetNames, rowCount: rows.length, amountCents: total, sourceLastRow: rows[rows.length - 1].sourceRow,
      fileBytes: buffer.length, expandedBytes, dateRanges: ranges, referenceAvailable: referenceVehicles !== null, referenceVehicleCount: referenceVehicles ? referenceVehicles.length : 0,
      reconciliationKind: reconciliation ? reconciliation.kind : 'none', reconciliationRowCount: reconciliation ? reconciliation.rows.length : 0,
      sourceAmountPolicy: 'Сумма каждой позиции из источника; количество × цена не заменяет сумму. Повторы сохранены.',
      supplierPolicy: 'Пустой подрядчик означает «Не указан». Исходный признак «Своими силами» сохранён без подтверждения его смысла.' } };
}

module.exports = { parseWorkbook, MAX_FILE_BYTES, MAX_EXPANDED_BYTES, checkZip, cellValue, cents, date, csvRecords };
