'use strict';

// Amounts in this module are integer kopecks. Source line amounts, including
// adjustments and repeated lines, remain authoritative throughout aggregation.
const LIMITS = Object.freeze({ maxRows: 100000, maxPageSize: 200, defaultPageSize: 50, aggregatesTruncated: false });
const ISSUE_DEFINITIONS = Object.freeze({
  duplicate_candidates: ['Совпадающие позиции — требуется проверка', 'warning'],
  amount_adjustment: ['Сумма отличается от количества × цены', 'info'],
  negative_amount: ['Отрицательная сумма', 'warning'],
  unfinished_completed: ['Дата завершения при незавершённом статусе', 'warning'],
  missing_supplier: ['Подрядчик не указан', 'warning'],
  unknown_classification: ['Нет классификации или детализации', 'warning'],
  missing_odometer: ['Не указан пробег', 'warning'],
  odometer_decrease: ['Пробег ниже предыдущего значения', 'warning'],
  missing_vehicle_reference: ['Госномер отсутствует в справочнике файла', 'warning'],
  missing_completion: ['Нет даты завершения', 'warning'],
});
const TEXT_FILTERS = ['vehicleGroup', 'vehicleKey', 'group', 'node', 'positionType', 'positionName', 'supplier', 'search', 'orderId', 'issueCode'];
const LATIN_PLATE = { a: 'а', b: 'в', e: 'е', k: 'к', m: 'м', h: 'н', o: 'о', p: 'р', c: 'с', t: 'т', y: 'у', x: 'х' };

function fail(message) { const error = new Error(message); error.code = 'FLEET_VALIDATION'; error.status = 400; error.statusCode = 400; throw error; }
function normalizePlate(value) {
  return String(value == null ? '' : value).normalize('NFKC').trim().toLowerCase().replace(/[\s\-]/g, '').replace(/[abekmhopctyx]/g, letter => LATIN_PLATE[letter]);
}
function isoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function validateFilters(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('Некорректные фильтры.');
  const result = {};
  for (const key of ['dateFrom', 'dateTo', ...TEXT_FILTERS]) {
    const value = input[key];
    if (value == null || value === '') { result[key] = ''; continue; }
    if (typeof value !== 'string' && !(key === 'orderId' && typeof value === 'number')) fail('Некорректный фильтр: ' + key + '.');
    result[key] = String(value).trim();
    if (result[key].length > 500) fail('Слишком длинное значение фильтра.');
  }
  for (const key of ['dateFrom', 'dateTo']) if (result[key] && !isoDate(result[key])) fail('Дата фильтра должна быть в формате ГГГГ-ММ-ДД.');
  if (result.dateFrom && result.dateTo && result.dateFrom > result.dateTo) fail('Начальная дата не может быть позже конечной.');
  result.dateBasis = input.dateBasis == null || input.dateBasis === '' ? 'completed' : input.dateBasis;
  if (!['completed', 'opened'].includes(result.dateBasis)) fail('Неизвестное основание периода.');
  result.status = input.status == null || input.status === '' ? 'all' : input.status;
  if (!['all', 'finished', 'unfinished'].includes(result.status)) fail('Неизвестный фильтр статуса.');
  if (result.positionType && !['работа', 'запчасть'].includes(result.positionType)) fail('Неизвестный тип позиции.');
  if (result.issueCode && !Object.prototype.hasOwnProperty.call(ISSUE_DEFINITIONS, result.issueCode)) fail('Неизвестная проверка качества данных.');
  for (const [key, fallback, max] of [['page', 1, 1000000000], ['pageSize', LIMITS.defaultPageSize, LIMITS.maxPageSize]]) {
    const value = input[key] == null || input[key] === '' ? fallback : input[key];
    if (!['number', 'string'].includes(typeof value) || !/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) < 1 || Number(value) > max) fail('Некорректный размер или номер страницы.');
    result[key] = Number(value);
  }
  return result;
}
function add(a, b) {
  if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b) || !Number.isSafeInteger(a + b)) fail('Сумма выходит за допустимый диапазон точных расчётов.');
  return a + b;
}
function roundedRatio(n, d) {
  if (!d) return null;
  const numerator = BigInt(n), denominator = BigInt(d), sign = numerator < 0n ? -1n : 1n;
  const absolute = numerator < 0n ? -numerator : numerator;
  return Number(sign * ((absolute + denominator / 2n) / denominator));
}
function isFinished(row) { return String(row.status || '').trim().toLowerCase() === 'финиш'; }
function linkResolver(links = []) {
  const map = new Map();
  for (const link of links || []) {
    if (!link || !link.vehicleKey || !String(link.reason || '').trim()) continue;
    const plate = normalizePlate(link.plate);
    if (!plate) continue;
    const key = String(link.vehicleKey);
    if (map.has(plate) && map.get(plate).key !== key) fail('Для одного госномера заданы конфликтующие связи.');
    map.set(plate, { key, plate: String(link.canonicalPlate || link.plate).trim() });
  }
  return plate => map.get(normalizePlate(plate)) || { key: normalizePlate(plate), plate: String(plate || '') };
}
const DUPLICATE_FIELDS = ['orderId', 'orderNumber', 'openedOn', 'completedOn', 'plate', 'vehicleBrand', 'vehicleGroup', 'vehicleYear', 'vehicleType', 'odometerKm', 'positionType', 'group', 'node', 'name', 'partBrand', 'quantity', 'unit', 'unitPriceCents', 'amountCents', 'topUp', 'tire', 'supplier', 'ownWorkReported', 'status', 'autoGroup', 'autoNode', 'discountPercent', 'adjustmentCents', 'adjustmentReason'];
function prepare(rows, links) {
  if (!Array.isArray(rows) || rows.length > LIMITS.maxRows) fail('Превышен допустимый объём позиций.');
  const resolve = linkResolver(links), duplicateMap = new Map(), orders = new Map();
  const enriched = rows.map(row => {
    if (!row || !Number.isSafeInteger(row.amountCents)) fail('Сумма позиции должна быть целым числом копеек.');
    const identity = row.companyVehicleIdentity || resolve(row.plate);
    const item = { ...row, vehicleKey: identity.key, canonicalPlate: identity.plate, issueCodes: [], issueMessages: {} };
    const issue = (code, message) => { item.issueCodes.push(code); item.issueMessages[code] = message; };
    if (!String(row.supplier || '').trim() && !(row.sourceOrigin === 'native' && row.executionConfirmed === 'internal')) issue('missing_supplier', 'Пустой подрядчик не подтверждает ремонт своими силами.');
    if (row.odometerKm == null) issue('missing_odometer', 'Пробег не заполнен.');
    if (!row.completedOn) issue('missing_completion', 'При фильтре по периоду завершения позиция не попадёт в выборку.');
    if (row.referenceVehicleMissing === true) issue('missing_vehicle_reference', 'Госномер отсутствует в справочнике «Марки» загруженного файла.');
    if (!row.group || /не классифицирован|ремонт без детализац/i.test(row.group)) issue('unknown_classification', 'Нужна проверка назначения и детализации расходов.');
    const nativeAdjustment = row.sourceOrigin === 'native' && String(row.adjustmentReason || '').trim();
    if (row.amountCents < 0) issue('negative_amount', nativeAdjustment ? 'Указано основание корректировки: ' + nativeAdjustment + '. Отрицательная сумма сохранена.' : 'Назначение отрицательной суммы необходимо подтвердить первичным документом.');
    if (row.completedOn && !isFinished(row)) issue('unfinished_completed', 'Указана дата завершения, но статус не «Финиш».');
    if (Number.isFinite(row.quantity) && Number.isSafeInteger(row.unitPriceCents)) {
      const product = row.quantity * row.unitPriceCents;
      if (!Number.isFinite(product) || Math.abs(product - row.amountCents) > 1.01) {
        const explanations = [];
        if (row.sourceOrigin === 'native' && Number.isFinite(row.discountPercent) && row.discountPercent !== 0) explanations.push('Указана скидка ' + row.discountPercent + '%.');
        if (nativeAdjustment) explanations.push('Указано основание корректировки: ' + nativeAdjustment + '.');
        issue('amount_adjustment', explanations.length ? explanations.join(' ') + ' Сумма документа сохранена.' : 'Сумма отличается от количества × цены. Возможна скидка или корректировка; сумма источника сохранена.');
      }
    }
    const duplicateKey = JSON.stringify(DUPLICATE_FIELDS.map(key => row[key] == null ? null : row[key]));
    if (!duplicateMap.has(duplicateKey)) duplicateMap.set(duplicateKey, []);
    duplicateMap.get(duplicateKey).push(item);
    const orderKey = JSON.stringify([identity.key, String(row.companyOrderKey || row.orderId)]);
    if (!orders.has(orderKey)) orders.set(orderKey, { date: row.openedOn, odometer: row.odometerKm, identity: identity.key, items: [] });
    const order = orders.get(orderKey); order.items.push(item);
    // Conflicting readings within one document are not a chronological baseline.
    if (order.odometer !== row.odometerKm || order.date !== row.openedOn) order.conflict = true;
    return item;
  });
  for (const group of duplicateMap.values()) if (group.length > 1) for (const item of group) {
    item.issueCodes.push('duplicate_candidates');
    item.issueMessages.duplicate_candidates = 'Совпадают все поля с другими позициями (строки ' + group.slice(0, 5).map(row => row.sourceRow).join(', ') + '). Все позиции сохранены.';
  }
  const vehicles = new Map();
  for (const order of orders.values()) {
    if (order.conflict || !isoDate(order.date) || !Number.isFinite(order.odometer)) continue;
    if (!vehicles.has(order.identity)) vehicles.set(order.identity, []);
    vehicles.get(order.identity).push(order);
  }
  for (const list of vehicles.values()) {
    list.sort((a, b) => a.date.localeCompare(b.date));
    let previous = null, offset = 0;
    while (offset < list.length) {
      let end = offset + 1;
      while (end < list.length && list[end].date === list[offset].date) end++;
      const day = list.slice(offset, end);
      // No inference about the order of visits within the same calendar day.
      if (previous) for (const order of day) if (order.odometer < previous.odometer) for (const item of order.items) {
        item.issueCodes.push('odometer_decrease');
        item.issueMessages.odometer_decrease = 'Пробег ' + order.odometer + ' км ниже ' + previous.odometer + ' км от ' + previous.date + ' (строка ' + previous.items[0].sourceRow + ').';
      }
      const readings = new Set(day.map(order => order.odometer));
      previous = readings.size === 1 ? day[0] : null;
      offset = end;
    }
  }
  return enriched;
}
function matches(row, filters, omit) {
  const date = filters.dateBasis === 'opened' ? row.openedOn : row.completedOn;
  if (filters.dateFrom || filters.dateTo) {
    if (!date || filters.dateFrom && date < filters.dateFrom || filters.dateTo && date > filters.dateTo) return false;
  }
  for (const key of ['vehicleGroup', 'vehicleKey', 'group', 'node', 'positionType', 'supplier', 'orderId']) {
    if (key === omit || !filters[key]) continue;
    const actual = key === 'supplier' ? String(row.supplier || '').trim() : String(row[key] == null ? '' : row[key]);
    const expected = ['supplier', 'group', 'node', 'vehicleGroup'].includes(key) && filters[key] === '__missing__' ? '' : filters[key];
    if (actual !== expected) return false;
  }
  if (filters.positionName && String(row.name || '') !== (filters.positionName === '__missing__' ? '' : filters.positionName)) return false;
  if (omit !== 'status' && filters.status !== 'all' && (filters.status === 'finished') !== isFinished(row)) return false;
  if (filters.issueCode && !row.issueCodes.includes(filters.issueCode)) return false;
  if (filters.search) {
    const text = [row.name, row.orderId, row.orderNumber, row.plate, row.canonicalPlate, row.supplier, row.partBrand].join(' ').toLocaleLowerCase('ru-RU');
    if (!text.includes(filters.search.toLocaleLowerCase('ru-RU'))) return false;
  }
  return true;
}
function publicRow(row) { const { issueMessages, ...publicItem } = row; return publicItem; }
function selectRows(rows, filters = {}, links = []) {
  const valid = validateFilters(filters);
  return prepare(rows, links).filter(row => matches(row, valid)).map(publicRow);
}
function blankAggregate(key, label) { return { key, label, amountCents: 0, laborCents: 0, partsCents: 0, rowCount: 0, orders: new Set(), vehicles: new Set() }; }
function accumulate(entry, row) {
  entry.amountCents = add(entry.amountCents, row.amountCents);
  if (row.positionType === 'работа') entry.laborCents = add(entry.laborCents, row.amountCents);
  if (row.positionType === 'запчасть') entry.partsCents = add(entry.partsCents, row.amountCents);
  entry.rowCount++; entry.orders.add(String(row.companyOrderKey || row.orderId)); entry.vehicles.add(row.vehicleKey);
}
function finish(entry) {
  const { orders, vehicles, ...result } = entry;
  return { ...result, orderCount: orders.size, vehicleCount: vehicles.size };
}
function grouped(rows, keyFn, labelFn = key => key) {
  const map = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!map.has(key)) map.set(key, blankAggregate(key, labelFn(key, row)));
    accumulate(map.get(key), row);
  }
  return [...map.values()].map(finish).sort((a, b) => b.amountCents - a.amountCents || a.label.localeCompare(b.label, 'ru'));
}
function qualityFor(rows, allRows, filters) {
  const issues = new Map(); let affectedRows = 0;
  for (const row of rows) {
    if (row.issueCodes.length) affectedRows++;
    for (const code of row.issueCodes) {
      if (!issues.has(code)) issues.set(code, { code, label: ISSUE_DEFINITIONS[code][0], severity: ISSUE_DEFINITIONS[code][1], count: 0, amountCents: 0, examples: [] });
      const issue = issues.get(code); issue.count++; issue.amountCents = add(issue.amountCents, row.amountCents);
      if (issue.examples.length < 5) issue.examples.push({ sourceRow: row.sourceRow, orderId: row.orderId, plate: row.plate, message: row.issueMessages[code] });
    }
  }
  let excludedMissingDateRows = 0;
  if (filters.dateFrom || filters.dateTo) {
    const withoutDates = { ...filters, dateFrom: '', dateTo: '' };
    for (const row of allRows) if (!row[filters.dateBasis === 'opened' ? 'openedOn' : 'completedOn'] && matches(row, withoutDates)) excludedMissingDateRows++;
  }
  const items = [...issues.values()].sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
  return { issueCount: items.reduce((count, item) => count + item.count, 0), affectedRows, items, excludedMissingDateRows,
    referenceCoverageAvailable: allRows.some(row => typeof row.referenceVehicleMissing === 'boolean'),
    notice: 'Проверки относятся к позициям выбранного набора. Повторные строки сохранены. Пустой подрядчик не подтверждает ремонт своими силами. Пробег проверяется по датам открытия; порядок в пределах одного дня неизвестен.' };
}
function optionsFor(allRows, filters) {
  const definitions = { vehicleGroups: 'vehicleGroup', vehicles: 'vehicleKey', groups: 'group', nodes: 'node', positionTypes: 'positionType', suppliers: 'supplier', statuses: 'status' };
  const result = {};
  for (const [name, omit] of Object.entries(definitions)) {
    const map = new Map();
    for (const row of allRows) if (matches(row, filters, omit)) {
      let key = String(row[omit] || ''), label = key;
      if (omit === 'vehicleKey') label = row.canonicalPlate || row.plate;
      if (omit === 'supplier' && !key.trim()) { key = '__missing__'; label = 'Не указан'; }
      if (['group', 'node', 'vehicleGroup'].includes(omit) && !key) { key = '__missing__'; label = omit === 'node' ? 'Не указан' : 'Не указана'; }
      if (omit === 'status') { key = isFinished(row) ? 'finished' : 'unfinished'; label = key === 'finished' ? 'Завершённые' : 'Незавершённые'; }
      if (key) map.set(key, label);
    }
    result[name] = [...map].map(([key, label]) => ({ key, label })).sort((a, b) => a.label.localeCompare(b.label, 'ru'));
    if (omit === 'status') result[name].unshift({ key: 'all', label: 'Все статусы' });
  }
  return result;
}
function analyze(rows, inputFilters = {}, links = []) {
  const filters = validateFilters(inputFilters), allRows = prepare(rows, links), matched = allRows.filter(row => matches(row, filters));
  const total = blankAggregate('', ''); let tireCents = 0;
  for (const row of matched) { accumulate(total, row); if (row.tire === true) tireCents = add(tireCents, row.amountCents); }
  const aggregate = finish(total);
  const summary = { amountCents: aggregate.amountCents, laborCents: aggregate.laborCents, partsCents: aggregate.partsCents, tireCents,
    rowCount: aggregate.rowCount, orderCount: aggregate.orderCount, vehicleCount: aggregate.vehicleCount,
    averageOrderCents: roundedRatio(aggregate.amountCents, aggregate.orderCount), averageVehicleCents: roundedRatio(aggregate.amountCents, aggregate.vehicleCount),
    laborShare: aggregate.amountCents ? aggregate.laborCents / aggregate.amountCents : null };
  const groups = grouped(matched, row => row.group || '__missing__', key => key === '__missing__' ? 'Не указана' : key).map(entry => ({ ...entry, share: summary.amountCents ? entry.amountCents / summary.amountCents : null }));
  const vehicleMeta = new Map();
  for (const row of matched) {
    if (!vehicleMeta.has(row.vehicleKey)) vehicleMeta.set(row.vehicleKey, { plate: row.canonicalPlate || row.plate, groups: new Set() });
    vehicleMeta.get(row.vehicleKey).groups.add(row.vehicleGroup || '');
  }
  const vehicles = grouped(matched, row => row.vehicleKey, (key, row) => row.canonicalPlate || row.plate).map(entry => {
    const meta = vehicleMeta.get(entry.key); return { ...entry, plate: meta.plate, vehicleGroup: [...meta.groups].join(' / ') };
  });
  const positions = grouped(matched, row => JSON.stringify([row.name || '', row.positionType || '']), (key, row) => row.name || 'Без наименования')
    .map(entry => ({ ...entry, name: JSON.parse(entry.key)[0], positionType: JSON.parse(entry.key)[1] }));
  const treeMap = new Map();
  for (const row of matched) {
    const groupKey = row.group || '__missing__', nodeKey = row.node || '__missing__', nameKey = JSON.stringify([row.name || '', row.positionType || '']);
    if (!treeMap.has(groupKey)) treeMap.set(groupKey, { ...blankAggregate(groupKey, groupKey === '__missing__' ? 'Не указана' : groupKey), children: new Map() });
    const group = treeMap.get(groupKey); accumulate(group, row);
    if (!group.children.has(nodeKey)) group.children.set(nodeKey, { ...blankAggregate(nodeKey, nodeKey === '__missing__' ? 'Не указан' : nodeKey), children: new Map() });
    const node = group.children.get(nodeKey); accumulate(node, row);
    if (!node.children.has(nameKey)) node.children.set(nameKey, { ...blankAggregate(nameKey, row.name || 'Без наименования'), name: row.name || '', positionType: row.positionType });
    accumulate(node.children.get(nameKey), row);
  }
  const finishTree = list => [...list.values()].map(entry => { const { children, ...aggregateEntry } = entry; return { ...finish(aggregateEntry), ...(children ? { children: finishTree(children) } : {}) }; }).sort((a, b) => b.amountCents - a.amountCents || a.label.localeCompare(b.label, 'ru'));
  const dateKey = filters.dateBasis === 'opened' ? 'openedOn' : 'completedOn';
  const months = grouped(matched, row => row[dateKey] ? row[dateKey].slice(0, 7) : '', key => key || 'Дата не указана').sort((a, b) => a.key.localeCompare(b.key));
  const offset = (filters.page - 1) * filters.pageSize;
  return { filters, summary, months, groups, nodes: grouped(matched, row => row.node || '__missing__', key => key === '__missing__' ? 'Не указан' : key), vehicles,
    vehicleGroups: grouped(matched, row => row.vehicleGroup || '__missing__', key => key === '__missing__' ? 'Не указана' : key), positions,
    suppliers: grouped(matched, row => String(row.supplier || '').trim() || '__missing__', key => key === '__missing__' ? 'Не указан' : key), tree: finishTree(treeMap),
    options: optionsFor(allRows, filters), quality: qualityFor(matched, allRows, filters),
    details: { items: matched.slice(offset, offset + filters.pageSize).map(publicRow), total: matched.length, page: filters.page, pageSize: filters.pageSize },
    limits: { ...LIMITS, sourceRowCount: rows.length } };
}
function reconcile(reconciliation, rows, links = []) {
  const notice = 'Частичный исторический снимок расхождений из файла, а не полный независимый реестр. Сравнение с текущими позициями выполнено только для покрытых пар «машина–месяц» по дате завершения. Связи госномеров учитываются только после явного подтверждения.';
  if (!reconciliation || !Array.isArray(reconciliation.rows) || !reconciliation.rows.length) return { kind: 'none', notice: 'В загруженном файле нет сохранённой сверки с другим реестром.', rows: [], summary: { coveredKeys: 0 } };
  const resolve = linkResolver(links), live = new Map(), map = new Map();
  for (const row of rows) {
    if (!row.completedOn) continue;
    const key = JSON.stringify([resolve(row.plate).key, row.completedOn.slice(0, 7)]);
    live.set(key, add(live.get(key) || 0, row.amountCents));
  }
  for (const row of reconciliation.rows) {
    const vehicle = resolve(row.plate), key = JSON.stringify([vehicle.key, row.month]);
    if (!map.has(key)) map.set(key, { key, vehicleKey: vehicle.key, plate: vehicle.plate, month: row.month, vehicleGroup: row.vehicleGroup || '', sourceRows: [], plates: [],
      sourceAmountCents: 0, comparisonAmountCents: 0, savedDifferenceCents: 0, currentAmountCents: live.get(key) || 0, comments: [], orderDescriptions: [] });
    const result = map.get(key);
    result.sourceAmountCents = add(result.sourceAmountCents, row.sourceAmountCents);
    result.comparisonAmountCents = add(result.comparisonAmountCents, row.comparisonAmountCents);
    result.savedDifferenceCents = add(result.savedDifferenceCents, row.savedDifferenceCents == null ? add(row.comparisonAmountCents, -row.sourceAmountCents) : row.savedDifferenceCents);
    result.sourceRows.push(row.sourceRow);
    if (!result.plates.includes(row.plate)) result.plates.push(row.plate);
    if (row.comment) result.comments.push(row.comment);
    if (row.orderDescription) result.orderDescriptions.push(row.orderDescription);
  }
  const output = [...map.values()].map(row => ({ ...row, differenceCents: add(row.comparisonAmountCents, -row.currentAmountCents), sourceChangeCents: add(row.currentAmountCents, -row.sourceAmountCents) })).sort((a, b) => Math.abs(b.differenceCents) - Math.abs(a.differenceCents) || a.key.localeCompare(b.key));
  const summary = { coveredKeys: output.length, snapshotRows: reconciliation.rows.length, sourceAmountCents: 0, comparisonAmountCents: 0, currentAmountCents: 0, differenceCents: 0, sourceChangeCents: 0, positiveDifferenceCents: 0, negativeDifferenceCents: 0, equalKeys: 0, changedSourceKeys: 0 };
  for (const row of output) {
    for (const key of ['sourceAmountCents', 'comparisonAmountCents', 'currentAmountCents', 'differenceCents', 'sourceChangeCents']) summary[key] = add(summary[key], row[key]);
    if (row.differenceCents > 0) summary.positiveDifferenceCents = add(summary.positiveDifferenceCents, row.differenceCents);
    if (row.differenceCents < 0) summary.negativeDifferenceCents = add(summary.negativeDifferenceCents, row.differenceCents);
    if (!row.differenceCents) summary.equalKeys++;
    if (row.sourceChangeCents) summary.changedSourceKeys++;
  }
  return { kind: 'partial_snapshot', notice, sourceSheet: reconciliation.sourceSheet || 'Сверка с Ремонтами', sourceNotes: reconciliation.sourceNotes || [], rows: output, summary };
}

module.exports = { analyze, selectRows, reconcile, normalizePlate, validateFilters, LIMITS };
