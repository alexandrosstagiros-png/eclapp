'use strict';
const { businessDate: parseDate, uuid } = require('./planning-input');

const BLOCK_NAMES = { crew: 'Экипажный блок', city: 'Городская доставка', unknown: 'Блок не указан', conflict: 'Блок противоречив' };
const REASONS = { reserve: 'Резерв', off: 'Выходной', repair: 'Ремонт', sick: 'Больничный', transferred: 'Переброс', cancelled: 'Отмена', no_work: 'Нет работы', no_driver: 'Нет водителя', crew_shortage: 'Неполный экипаж', failed: 'Срыв', unknown: 'Причина не указана', conflict: 'Причины противоречивы' };
const WORK = new Set(['work', 'paid_reserve']);
const NONRELEASE = new Set(Object.keys(REASONS).filter(key => !['unknown', 'conflict'].includes(key)));
const tuple = value => ['legalEntityId', 'regionId', 'projectId', 'responsibilityScopeId'].map(key => value[key]);
const keyFor = (scopeId, vehicleId) => `${scopeId}:${vehicleId}`;
const clean = (value, fallback = 'Не указано') => String(value || fallback).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);
const percent = (value, total) => total ? Math.round(value * 1000 / total) / 10 : null;
const pct = value => value == null ? '—' : `${value.toFixed(1).replace('.', ',')}%`;
const finiteInt = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;
function ownership(value) {
  const normalized = typeof value === 'string' ? value.toLocaleLowerCase('ru').replace(/ё/g, 'е').trim().replace(/\s+/g, ' ') : '';
  if (['own', 'свой', 'своя', 'свои', 'собственный', 'собственная', 'собственные', 'собственный парк', 'собственное тс', 'собственное'].includes(normalized)) return 'own';
  if (['subcontracted', 'hired', 'наем', 'наемный', 'наемная', 'наемные', 'наемный парк', 'наемное тс', 'привлеченный', 'привлеченная', 'привлеченные'].includes(normalized)) return 'subcontracted';
  return null;
}
function pick(values) {
  const known = [...new Set(values.filter(value => value != null && value !== ''))];
  if (known.length > 1) return 'conflict';
  return known.length ? known[0] : 'unknown';
}
function namedAttribution(value, fallbackId, labels) {
  if (typeof value !== 'string' || !value.trim()) return fallbackId;
  const label = clean(value, '');
  const id = `label:${label.toLocaleLowerCase('ru').replace(/ё/g, 'е')}`;
  if (!labels.has(id)) labels.set(id, label);
  return id;
}
function baseStats(records) {
  const reasons = Object.fromEntries(Object.keys(REASONS).map(key => [key, 0]));
  for (const vehicle of records) if (vehicle.state === 'notReleased') reasons[vehicle.reason] += 1;
  const total = records.length, onLine = records.filter(vehicle => vehicle.state === 'onLine').length;
  const trips = records.reduce((sum, vehicle) => sum + (vehicle.actualTrips || 0), 0);
  const repair = records.filter(vehicle => vehicle.status === 'repair').length;
  return { total, planned: records.filter(vehicle => vehicle.planned).length, onLine,
    notReleased: records.filter(vehicle => vehicle.state === 'notReleased').length,
    unconfirmed: records.filter(vehicle => vehicle.state === 'unconfirmed').length,
    plannedTrips: records.reduce((sum, vehicle) => sum + vehicle.plannedTrips, 0),
    actualTrips: trips, extraTrips: records.reduce((sum, vehicle) => sum + Math.max(0, (vehicle.actualTrips || 0) - 1), 0),
    unknownTripVehicles: records.filter(vehicle => vehicle.actualTrips == null).length,
    onLineWithoutTripCount: records.filter(vehicle => vehicle.state === 'onLine' && vehicle.actualTrips == null).length,
    repair, releasePercent: percent(onLine, total), reasons,
    outsideRepairPercent: records.some(vehicle => ['unknown', 'conflict'].includes(vehicle.status)) ? null : percent(total - repair, total) };
}
function stats(records) {
  const result = baseStats(records);
  result.fleet = Object.fromEntries(['own', 'subcontracted', 'unknown'].map(type => [type, baseStats(records.filter(vehicle => vehicle.fleetType === type))]));
  result.technicalReadiness = result.fleet.own.outsideRepairPercent;
  result.crew = { assessed: records.filter(vehicle => vehicle.crewRequired != null && vehicle.crewPresent != null).length,
    complete: records.filter(vehicle => vehicle.crewRequired != null && vehicle.crewPresent != null && vehicle.crewPresent >= vehicle.crewRequired).length,
    short: records.filter(vehicle => vehicle.crewRequired != null && vehicle.crewPresent != null && vehicle.crewPresent < vehicle.crewRequired).length };
  return result;
}
function groups(records, field, labels) {
  const result = new Map();
  for (const vehicle of records) {
    const key = vehicle[field];
    if (!result.has(key)) result.set(key, []);
    result.get(key).push(vehicle);
  }
  return [...result].map(([id, vehicles]) => ({ id, label: clean(labels.get(id), id === 'conflict' ? 'Противоречивые сведения' : 'Не указано'), ...stats(vehicles) }))
    .sort((a, b) => a.label.localeCompare(b.label, 'ru') || a.id.localeCompare(b.id));
}
function renderDailyReport(report, { publicAudience = false } = {}) {
  const summary = report.summary;
  const reasons = stats => Object.entries(stats.reasons).filter(([, count]) => count).map(([key, count]) => `${REASONS[key]} ${count}`).join('; ') || 'не указаны';
  const fleetLine = stats => `свои ${stats.fleet.own.onLine}/${stats.fleet.own.total}; наём ${stats.fleet.subcontracted.onLine}/${stats.fleet.subcontracted.total}; владение не указано ${stats.fleet.unknown.onLine}/${stats.fleet.unknown.total}`;
  const lines = [`Ежедневный отчёт за ${report.businessDate}`, `Учтено машин: ${summary.total}. План выхода: ${summary.planned}. На линии подтверждено: ${summary.onLine} (${pct(summary.releasePercent)}).`,
    `На линии / учтено: ${fleetLine(summary)}.`,
    `Не вышли по указанным данным: ${summary.notReleased}. Выпуск не подтверждён: ${summary.unconfirmed}.`,
    `Рейсы: план ${summary.plannedTrips}, подтверждено ${summary.actualTrips}, из них дополнительные ${summary.extraTrips}. Машин без точного факта рейсов: ${summary.unknownTripVehicles}, из них на линии ${summary.onLineWithoutTripCount}.`,
    `Причины невыпуска: ${reasons(summary)}.`,
    `Собственный парк: в ремонте ${summary.fleet.own.repair}/${summary.fleet.own.total}; вне ремонта по статусам ${pct(summary.technicalReadiness)}.`,
    `Планы: ${report.coverage.planCount}/${report.coverage.sourceScopeCount} областей; строки без машины: ${report.coverage.unallocatedRows}.`,
    'Полнота парка не подтверждена: знаменатель — учтённые машины, а не весь парк. Неизвестный факт не считается простоем.'
  ];
  if (!summary.total) lines.push('Нет учтённых машин за выбранную дату. Это отсутствие данных, а не нулевой выпуск парка.');
  const blocks = report.blocks.map(block => {
    const core = [`\n${block.label}: учтено ${block.total}; план ${block.planned}; на линии ${block.onLine} (${pct(block.releasePercent)}); не вышли ${block.notReleased}; без факта ${block.unconfirmed}.`,
      `На линии / учтено: ${fleetLine(block)}. Рейсы ${block.actualTrips}, дополнительные ${block.extraTrips}.`,
      `Причины: ${reasons(block)}. Свои вне ремонта ${pct(block.technicalReadiness)}.`,
      ...(block.id === 'crew' ? [`Комплектность экипажей: оценено ${block.crew.assessed}; полных ${block.crew.complete}; неполных ${block.crew.short}.`] : [])];
    const details = [];
    for (const [kind, title, rows] of [['city', 'По городам / регионам', block.byCity], ['client', 'По клиентским проектам', block.byClient],
      ['manager', publicAudience ? 'По менеджерам (обезличено для общего чата)' : 'По менеджерам', block.byManager]]) {
      details.push(`${title} (учтено / план / на линии / не вышли / без факта):`);
      for (const row of rows || []) {
        const label = publicAudience && kind === 'manager' && !['unknown', 'conflict'].includes(row.id) ? `Менеджер · ${row.id.slice(-6)}` : row.label;
        details.push(`${label}: ${row.total} / ${row.planned} / ${row.onLine} / ${row.notReleased} / ${row.unconfirmed}; свои ${row.fleet.own.onLine}/${row.fleet.own.total}, наём ${row.fleet.subcontracted.onLine}/${row.fleet.subcontracted.total}${row.fleet.unknown.total ? `, владение ? ${row.fleet.unknown.onLine}/${row.fleet.unknown.total}` : ''}; рейсы ${row.actualTrips}, доп. ${row.extraTrips}.`);
      }
    }
    return { core, details };
  });
  const warnings = report.issues.filter(issue => issue.code !== 'coverage_not_attested').map(issue => `${issue.message} (${issue.count})`);
  const warningLines = warnings.length ? ['\nПроверка данных:', ...warnings.map(message => `• ${message}`)] : [];
  // Reserve every block's totals and quality diagnostics before abbreviating
  // breakdowns, so a large first block cannot hide the next block's release.
  const fixedLength = blocks.reduce((sum, block) => sum + block.core.join('\n').length + 1, 0);
  const budget = 12000 - lines.join('\n').length - warningLines.join('\n').length - fixedLength - 160;
  let used = 0, omitted = 0;
  for (const block of blocks) {
    lines.push(...block.core);
    for (const line of block.details) {
      if (used + line.length + 1 <= Math.max(0, budget)) { lines.push(line); used += line.length + 1; }
      else omitted += 1;
    }
  }
  if (omitted) lines.push(`Подробные строки сокращены для чата: ${omitted}. Общие итоги включают все учтённые машины.`);
  lines.push(...warningLines);
  return lines.join('\n').slice(0, 12000);
}

/** Source scopes are the explicit report coverage, not the full physical fleet. */
function aggregateDailyReport({ businessDate, sourceScopes = [], plans = [], vehicles = [], attendance = [], managers = [] }, options = {}) {
  parseDate(businessDate);
  const issueMap = new Map();
  const issue = (code, message, ref = 'report') => {
    if (!issueMap.has(code)) issueMap.set(code, { code, message, refs: new Set() });
    issueMap.get(code).refs.add(ref);
  };
  issue('coverage_not_attested', 'Полнота парка не подтверждена');
  const scopes = new Map(sourceScopes.map(scope => [scope.responsibilityScopeId, scope]));
  const resources = new Map(vehicles.map(vehicle => [keyFor(vehicle.responsibilityScopeId, vehicle.id || vehicle.vehicleId), vehicle]));
  const managerNames = new Map(managers.map(manager => [manager.id, clean(manager.name || manager.displayName, 'Сотрудник')]));
  const cities = new Map([['unknown', 'Город / регион не указан'], ['conflict', 'Несколько городов / регионов']]);
  const clients = new Map([['unknown', 'Клиентский проект не указан'], ['conflict', 'Несколько клиентских проектов']]);
  for (const scope of sourceScopes) { cities.set(scope.regionId, clean(scope.regionName)); clients.set(scope.projectId, clean(scope.projectName)); }
  managerNames.set('unknown', 'Менеджер не указан'); managerNames.set('conflict', 'Несколько менеджеров');
  const physical = new Map();
  const getVehicle = id => { if (!physical.has(id)) physical.set(id, { id, rows: [], events: [], scopes: new Set() }); return physical.get(id); };
  let unallocatedRows = 0, rowCount = 0;
  const validPlans = plans.filter(plan => plan.businessDate === businessDate && scopes.has(plan.responsibilityScopeId));
  const covered = new Set(validPlans.map(plan => plan.responsibilityScopeId));
  for (const scope of sourceScopes) if (!covered.has(scope.responsibilityScopeId)) issue('missing_plan', 'Нет дневного плана в выбранной области', scope.responsibilityScopeId);
  for (const plan of validPlans) for (const row of plan.rows || []) {
    rowCount += 1;
    if (!row.vehicleId) { unallocatedRows += 1; continue; }
    const vehicle = getVehicle(row.vehicleId), scope = scopes.get(plan.responsibilityScopeId);
    vehicle.rows.push({ ...row, scope, metadata: resources.get(keyFor(plan.responsibilityScopeId, row.vehicleId)) || {} });
    vehicle.scopes.add(plan.responsibilityScopeId);
  }
  if (unallocatedRows) issue('unallocated_rows', `Назначения без машины не включены в парк: ${unallocatedRows}`);
  for (const event of attendance) {
    if (event.businessDate !== businessDate || !scopes.has(event.responsibilityScopeId) || !event.vehicleId || !event.tripId) continue;
    const vehicle = getVehicle(event.vehicleId);
    vehicle.events.push({ ...event, scope: scopes.get(event.responsibilityScopeId) });
    vehicle.scopes.add(event.responsibilityScopeId);
  }
  const records = [];
  for (const vehicle of physical.values()) {
    const rows = vehicle.rows, reporting = rows.map(row => row.reporting || {});
    // Shared catalogue scopes carry many customer/city assignments. A trip in
    // the same vehicle+scope inherits the explicit row attribution; its scope
    // name must not overwrite that customer or introduce a false conflict.
    const plannedScopeIds = new Set(rows.map(row => row.scope.responsibilityScopeId));
    const attributionRows = [...rows, ...vehicle.events.filter(event => !plannedScopeIds.has(event.scope.responsibilityScopeId))];
    if (!rows.length) issue('actual_without_plan', 'Фактический выезд отсутствует в строках дневного плана', vehicle.id);
    if (rows.length > 1) issue('duplicate_vehicle', 'Машина встречается несколько раз; учтена один раз, планы рейсов взяты по максимуму', vehicle.id);
    const block = pick(reporting.map(value => ['crew', 'city'].includes(value.block) ? value.block : null));
    const city = pick(attributionRows.map(row => namedAttribution(row.reporting?.cityName, row.scope.regionId, cities)));
    const client = pick(attributionRows.map(row => namedAttribution(row.reporting?.clientName, row.scope.projectId, clients)));
    const manager = pick(reporting.map(value => value.managerId && managerNames.has(value.managerId) ? value.managerId : null));
    for (const [field, value, missing, conflict] of [
      ['block', block, 'Не указан блок доставки', 'У машины противоречивые блоки доставки'],
      ['city', city, 'Не указан город / регион', 'Машина относится к нескольким городам / регионам'],
      ['client', client, 'Не указан клиентский проект', 'Машина относится к нескольким клиентским проектам'],
      ['manager', manager, 'Менеджер не указан или недоступен', 'У машины несколько ответственных менеджеров']]) {
      if (value === 'unknown') issue(`${field}_unknown`, missing, vehicle.id);
      if (value === 'conflict') issue(`${field}_conflict`, conflict, vehicle.id);
    }
    const fleetValues = rows.map(row => ownership(row.reporting?.fleetType) || ownership(row.metadata.fleetType) || ownership(row.metadata.ownershipType));
    if (!rows.length) for (const event of vehicle.events) { const data = resources.get(keyFor(event.responsibilityScopeId, vehicle.id)) || {}; fleetValues.push(ownership(data.fleetType) || ownership(data.ownershipType)); }
    let fleetType = pick(fleetValues);
    if (fleetType === 'conflict') { issue('fleet_conflict', 'Противоречивый тип владения; машина в категории «не указано»', vehicle.id); fleetType = 'unknown'; }
    if (fleetType === 'unknown') issue('fleet_unknown', 'Тип владения не определён', vehicle.id);
    const statuses = [...new Set(rows.map(row => WORK.has(row.status) || NONRELEASE.has(row.status) ? row.status : 'unknown'))];
    const status = statuses.length > 1 ? 'conflict' : statuses[0] || 'unknown';
    if (status === 'conflict') issue('status_conflict', 'У машины противоречивые статусы планирования', vehicle.id);
    if (status === 'unknown') issue('status_unknown', 'Статус машины не указан или неизвестен', vehicle.id);
    const planned = rows.some(row => WORK.has(row.status));
    const plannedTrips = Math.max(0, ...rows.filter(row => WORK.has(row.status)).map(row => finiteInt(row.tripCount, 1, 999) ? row.tripCount : 1));
    const manual = [...new Set(reporting.map(value => value.actualTrips).filter(value => finiteInt(value, 0, 999)))];
    const attended = new Set(vehicle.events.map(event => event.tripId)).size;
    let actualTrips = null;
    if (manual.length > 1) issue('actual_conflict', 'Противоречивое фактическое число рейсов; фактические сведения требуют проверки', vehicle.id);
    else if (manual.length === 1) {
      actualTrips = manual[0];
      if (attended && attended !== actualTrips) issue('actual_override', 'Ручной факт рейсов отличается от отметок водителей; использован ручной факт', vehicle.id);
    } else if (attended) actualTrips = attended;
    else if (statuses.length && statuses.every(value => NONRELEASE.has(value))) actualTrips = 0;
    // Different positive totals disagree about trip count, not about release.
    // A mixture of zero and positive manual facts remains unresolved.
    const state = actualTrips == null ? manual.length > 1 && manual.every(value => value > 0) ? 'onLine' : 'unconfirmed' : actualTrips > 0 ? 'onLine' : 'notReleased';
    const reason = NONRELEASE.has(status) ? status : status === 'conflict' ? 'conflict' : 'unknown';
    if (state === 'notReleased' && reason === 'unknown') issue('reason_unknown', 'Для подтверждённого невыпуска не указана причина', vehicle.id);
    if (state === 'onLine' && statuses.some(value => NONRELEASE.has(value))) issue('release_status_conflict', 'Факт выезда противоречит статусу невыпуска', vehicle.id);
    if (state === 'unconfirmed') issue('actual_unknown', 'Факт выпуска не заполнен и не подтверждён отметками рейса', vehicle.id);
    const required = block === 'crew' ? [...new Set(reporting.map(value => value.crewRequired).filter(value => finiteInt(value, 1, 99)))] : [];
    const present = block === 'crew' ? [...new Set(reporting.map(value => value.crewPresent).filter(value => finiteInt(value, 0, 99)))] : [];
    const crewRequired = required.length === 1 ? required[0] : null, crewPresent = present.length === 1 ? present[0] : null;
    if (required.length > 1 || present.length > 1) issue('crew_conflict', 'Противоречивая комплектность экипажа', vehicle.id);
    if (block === 'crew' && (crewRequired == null || crewPresent == null)) issue('crew_unknown', 'Комплектность экипажа не заполнена', vehicle.id);
    if (state === 'onLine' && crewRequired != null && crewPresent != null && crewPresent < crewRequired) issue('crew_short_released', 'Подтверждён выезд неполного экипажа', vehicle.id);
    records.push({ id: vehicle.id, block, city, client, manager, fleetType, status, planned, plannedTrips, actualTrips, state, reason, crewRequired, crewPresent });
  }
  const report = { businessDate, summary: stats(records),
    blocks: groups(records, 'block', new Map(Object.entries(BLOCK_NAMES))).map(block => {
      const selected = records.filter(vehicle => vehicle.block === block.id);
      return { ...block, byCity: groups(selected, 'city', cities), byClient: groups(selected, 'client', clients), byManager: groups(selected, 'manager', managerNames) };
    }), byCity: groups(records, 'city', cities),
    byClient: groups(records, 'client', clients), byManager: groups(records, 'manager', managerNames),
    issues: [...issueMap.values()].map(({ refs, ...entry }) => ({ ...entry, count: refs.size })),
    sourceScopes: sourceScopes.map(scope => ({ ...scope })),
    coverage: { incomplete: true, sourceScopeCount: sourceScopes.length, planCount: covered.size, rowCount, unallocatedRows,
      missingScopeIds: sourceScopes.filter(scope => !covered.has(scope.responsibilityScopeId)).map(scope => scope.responsibilityScopeId) } };
  report.text = renderDailyReport(report, options);
  return report;
}

/** Read one database snapshot. Authorization of these exact tuples is performed
 * by the caller before publication; this function never enlarges the coverage. */
async function buildDailyReport(client, actor, sourceScopes, businessDate, options = {}) {
  const date = parseDate(businessDate);
  const scopes = [...new Map(sourceScopes.map(scope => {
    const normalized = Object.fromEntries(['legalEntityId', 'regionId', 'projectId', 'responsibilityScopeId'].map(key => [key, uuid(scope[key], key)]));
    const grant = (actor.sourceGrants || actor.grants || []).find(item => tuple(item).every((value, index) => value === tuple(normalized)[index]));
    return [normalized.responsibilityScopeId, { ...normalized, personalDataVisible: Boolean(grant?.personalDataVisible) }];
  })).values()];
  if (!scopes.length) return aggregateDailyReport({ businessDate: date, sourceScopes: [] }, options);
  const raw = (await client.query(`WITH requested AS (
    SELECT * FROM jsonb_to_recordset($1::jsonb) AS x("legalEntityId" uuid,"regionId" uuid,"projectId" uuid,"responsibilityScopeId" uuid,"personalDataVisible" boolean)
  ), scopes AS (
    SELECT q.*,r.name AS "regionName",p.name AS "projectName",rs.name AS "scopeName"
    FROM requested q JOIN projects p ON p.id=q."projectId" AND p.legal_entity_id=q."legalEntityId" AND p.region_id=q."regionId"
    JOIN regions r ON r.id=q."regionId" JOIN responsibility_scopes rs ON rs.id=q."responsibilityScopeId" AND rs.project_id=p.id
  ), plans AS (
    SELECT p.responsibility_scope_id AS "responsibilityScopeId",p.business_date::text AS "businessDate",p.rows
    FROM planning_plans p JOIN scopes s ON p.legal_entity_id=s."legalEntityId" AND p.region_id=s."regionId"
      AND p.project_id=s."projectId" AND p.responsibility_scope_id=s."responsibilityScopeId" WHERE p.business_date=$2::date
  ), actual AS (
    SELECT t.id AS "tripId",t.vehicle_id AS "vehicleId",t.responsibility_scope_id AS "responsibilityScopeId",t.business_date::text AS "businessDate"
    FROM trips t JOIN scopes s ON t.legal_entity_id=s."legalEntityId" AND t.region_id=s."regionId"
      AND t.project_id=s."projectId" AND t.responsibility_scope_id=s."responsibilityScopeId" WHERE t.business_date=$2::date
      AND EXISTS(SELECT 1 FROM workflow_attendance w WHERE w.trip_id=t.id AND w.kind IN ('check_in','check_out'))
  ), resources AS (
    SELECT p."responsibilityScopeId",(row->>'vehicleId')::uuid AS id FROM plans p CROSS JOIN LATERAL jsonb_array_elements(p.rows) row WHERE row->>'vehicleId' IS NOT NULL
    UNION SELECT "responsibilityScopeId","vehicleId" FROM actual
  ), vehicle_data AS (
    SELECT q.id,q."responsibilityScopeId",v.fleet_type AS "fleetType",d.data->>'ownership_type' AS "ownershipType"
    FROM resources q JOIN scopes s ON s."responsibilityScopeId"=q."responsibilityScopeId"
    LEFT JOIN vehicles v ON v.id=q.id LEFT JOIN planning_resource_data d ON d.resource_id=q.id AND d.kind='vehicle'
      AND d.legal_entity_id=s."legalEntityId" AND d.region_id=s."regionId" AND d.project_id=s."projectId" AND d.responsibility_scope_id=s."responsibilityScopeId"
  ), manager_data AS (
    SELECT DISTINCT u.id,CASE WHEN s."personalDataVisible" OR u.id=$3::uuid THEN u.display_name ELSE 'Сотрудник · '||right(u.id::text,6) END AS name
    FROM plans p JOIN scopes s ON s."responsibilityScopeId"=p."responsibilityScopeId" CROSS JOIN LATERAL jsonb_array_elements(p.rows) row
    JOIN users u ON u.id=(row->'reporting'->>'managerId')::uuid AND u.active AND u.approved AND u.role IN ('manager','dispatcher','access_admin')
    WHERE EXISTS(SELECT 1 FROM access_grants g WHERE g.user_id=u.id AND g.legal_entity_id=s."legalEntityId" AND g.region_id=s."regionId"
      AND g.project_id=s."projectId" AND g.responsibility_scope_id=s."responsibilityScopeId")
  ) SELECT (SELECT coalesce(jsonb_agg(to_jsonb(s)),'[]'::jsonb) FROM scopes s) AS scopes,
    (SELECT coalesce(jsonb_agg(to_jsonb(p)),'[]'::jsonb) FROM plans p) AS plans,
    (SELECT coalesce(jsonb_agg(to_jsonb(a)),'[]'::jsonb) FROM actual a) AS attendance,
    (SELECT coalesce(jsonb_agg(to_jsonb(v)),'[]'::jsonb) FROM vehicle_data v) AS vehicles,
    (SELECT coalesce(jsonb_agg(to_jsonb(m)),'[]'::jsonb) FROM manager_data m) AS managers`, [JSON.stringify(scopes), date, actor.id])).rows[0];
  if (raw.scopes.length !== scopes.length) throw new Error('Область ежедневного отчёта больше не существует.');
  return aggregateDailyReport({ businessDate: date, sourceScopes: raw.scopes, plans: raw.plans, attendance: raw.attendance, vehicles: raw.vehicles, managers: raw.managers }, options);
}
module.exports = { buildDailyReport, aggregateDailyReport, renderDailyReport, ownership };
