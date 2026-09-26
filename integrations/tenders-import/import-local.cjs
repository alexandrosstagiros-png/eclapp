'use strict';

// Repeatable local-only import. Source files are data; never instructions or SQL.
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { paths, openAdminPool, readJson } = require('../local-app/runtime.cjs');
const { customerInput, tenderInput, commentInput, uuid } = require('../../recovered/apps/api/src/modules/tenders/tenders-input');

const SOURCE_KEY = 'ecl-tenders-clientele-workbook-v1';
const NOTE_PREFIX = 'Исходная заметка из Excel; дата исходной записи неизвестна';
const FIELD_COLUMNS = Object.freeze({ customerId: 'customer_id', title: 'title', status: 'status', vehicleCount: 'vehicle_count',
  requirements: 'requirements', deliveryType: 'delivery_type', expectedLaunch: 'expected_launch', launchNotes: 'launch_notes',
  submissionDeadline: 'submission_deadline', nextStep: 'next_step', nextStepDue: 'next_step_due', kind: 'kind', closeReason: 'close_reason', winReason: 'win_reason' });
function stableId(value) {
  const bytes = createHash('sha256').update(`${SOURCE_KEY}:${value}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 15) | 80; bytes[8] = (bytes[8] & 63) | 128;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
const TARGET = Object.freeze({ legalEntityId: stableId('legal-entity'), legalEntityName: 'ЕЦЛ · данные тендеров',
  regionId: stableId('region'), regionName: 'Все города', projectId: stableId('project'), projectName: 'Тендеры · Клиентура',
  responsibilityScopeId: stableId('scope'), scopeName: 'Клиентская база' });
const TUPLE = Object.freeze([TARGET.legalEntityId, TARGET.regionId, TARGET.projectId, TARGET.responsibilityScopeId]);
const SCOPE = Object.freeze({ legalEntityId: TARGET.legalEntityId, regionId: TARGET.regionId, projectId: TARGET.projectId, responsibilityScopeId: TARGET.responsibilityScopeId });
const SCOPE_COLUMNS = Object.freeze(['legal_entity_id', 'region_id', 'project_id', 'responsibility_scope_id']);
function normalizedName(value) { return value.trim().normalize('NFC').replace(/\s+/gu, ' ').toLocaleLowerCase('ru'); }
function sameScope(row) { return SCOPE_COLUMNS.every((column, index) => row[column] === TUPLE[index]); }
function changed(message = 'Данные импорта уже изменены в приложении или исходнике.') { throw new Error(`${message} Импорт отменён без перезаписи.`); }
function sourceHasRow(details, sheet, row) {
  const refs = [`${sheet}!`, `'${sheet}'!`];
  return refs.some(prefix => new RegExp(`${prefix}A${row}:E${row}(?![0-9])`).test(details)) ||
    ['A', 'B', 'C', 'D', 'E'].every(column => refs.some(prefix => new RegExp(`${prefix}${column}${row}(?![0-9])`).test(details)));
}
function recordsFromPlan(plan) {
  if (plan?.schemaVersion !== 1 || !/^[a-f0-9]{64}$/.test(plan.source?.sha256 || '') ||
    typeof plan.source?.fileName !== 'string' || !plan.source.fileName.trim() || plan.source.fileName.length > 250 || /[\u0000-\u001f]/.test(plan.source.fileName) ||
    !Array.isArray(plan.records) || !plan.records.length || plan.records.length > 10000) throw new Error('Неверный формат плана импорта.');
  const seenKeys = new Set(), seenRows = new Set();
  const records = plan.records.map(record => {
    if (record?.sheet !== 'Лист2' || !Array.isArray(record.sourceRows) || !record.sourceRows.length || record.sourceRows.length > 10000 ||
      record.sourceRows.some(row => !Number.isSafeInteger(row) || row < 2 || row > 1048576)) throw new Error('Неверная ссылка на исходную строку.');
    const sourceRows = [...record.sourceRows].sort((a, b) => a - b);
    if (record.sourceKey !== `${record.sheet}:${sourceRows[0]}` || seenKeys.has(record.sourceKey)) throw new Error('Неверная или повторная ссылка на исходную строку.');
    seenKeys.add(record.sourceKey);
    for (const row of sourceRows) {
      const key = `${record.sheet}:${row}`;
      if (seenRows.has(key)) throw new Error('Повторная исходная строка: её нельзя перенести в несколько карточек.');
      seenRows.add(key);
    }
    const customer = customerInput({ id: stableId('customer:' + normalizedName(typeof record.customerName === 'string' ? record.customerName : '')),
      responsibilityScopeId: TARGET.responsibilityScopeId, version: 0, name: record.customerName });
    const payload = tenderInput({ ...record.payload, id: stableId('tender:' + record.sourceKey), customerId: customer.id,
      responsibilityScopeId: TARGET.responsibilityScopeId, version: 0 });
    if (payload.expectedLaunch || payload.submissionDeadline || payload.nextStepDue) throw new Error('В исходнике нет полных календарных дат. Год или день запуска нельзя придумывать.');
    const eventInput = text => commentInput({ id: stableId('validation'), tenderId: payload.id, responsibilityScopeId: TARGET.responsibilityScopeId, text }).text;
    const sourceDetails = eventInput(record.sourceDetails), comment = eventInput(record.comment);
    if (!sourceDetails.includes(plan.source.sha256) || !sourceRows.every(row => sourceHasRow(sourceDetails, record.sheet, row)))
      throw new Error('Исходная заметка должна сохранять SHA256 и ссылки на все ячейки A:E каждой исходной строки.');
    if (!comment.startsWith(NOTE_PREFIX)) throw new Error('Исходная заметка должна явно сохранять неизвестную дату исходной записи.');
    return { sourceKey: record.sourceKey, sourceRows, sheet: record.sheet, customer, payload, sourceDetails, comment };
  });
  return records.sort((a, b) => a.sourceRows[0] - b.sourceRows[0]);
}
function manifestHash(plan, records) {
  return createHash('sha256').update(JSON.stringify({ schemaVersion: 1, source: { fileName: plan.source.fileName, sha256: plan.source.sha256 }, records })).digest('hex');
}
async function ensureReference(client, table, id, values, mustExist) {
  const existing = (await client.query(`SELECT * FROM ${table} WHERE id=$1 FOR UPDATE`, [id])).rows[0];
  if (existing) {
    if (Object.entries(values).some(([key, value]) => existing[key] !== value)) changed(`Область импорта уже изменена: ${table}.`);
    return;
  }
  if (mustExist) changed('Область первоначального импорта отсутствует.');
  const fields = ['id', ...Object.keys(values)];
  await client.query(`INSERT INTO ${table}(${fields.join(',')}) VALUES(${fields.map((_, index) => `$${index + 1}`).join(',')})`, [id, ...Object.values(values)]);
}
async function lockRecord(client, type, id) {
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,917042032))', [`record:${type}:${id}`]);
}
async function appendAudit(client, actorId, correlationId, action, entityType, entityId, metadata) {
  await client.query('SELECT append_audit($1::jsonb)', [JSON.stringify({ schemaVersion: 1, actorId, action, entityType, entityId,
    channel: 'system', correlationId, scope: SCOPE, metadata })]);
}
function expectedEvents(record) {
  return [
    { id: stableId(`event:created:${record.sourceKey}`), type: 'created', text: 'Перенесено из Excel. Дата исходной записи неизвестна.', toStatus: record.payload.status },
    { id: stableId(`event:source:${record.sourceKey}`), type: 'import', text: record.sourceDetails, toStatus: null },
    { id: stableId(`event:note:${record.sourceKey}`), type: 'import', text: record.comment, toStatus: null },
  ];
}
async function importPlan(pool, plan, actorId, { dryRun = true } = {}) {
  uuid(actorId, 'администратор');
  if (typeof dryRun !== 'boolean') throw new Error('Режим импорта должен быть указан явно.');
  const records = recordsFromPlan(plan), planSha256 = manifestHash(plan, records);
  const customerMap = new Map();
  for (const record of records) if (!customerMap.has(record.customer.id)) customerMap.set(record.customer.id, record.customer);
  const client = await pool.connect(), correlationId = randomUUID();
  const result = { dryRun, sourceSha256: plan.source.sha256, sourceFile: plan.source.fileName, planSha256, ...TARGET,
    inserted: 0, skipped: 0, customersInserted: 0, eventsInserted: 0, sourceRows: records.reduce((sum, row) => sum + row.sourceRows.length, 0),
    byStatus: {}, mapping: [] };
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL statement_timeout='30s'");
    const actor = (await client.query('SELECT id,display_name,role,active,approved FROM users WHERE id=$1 FOR UPDATE', [actorId])).rows[0];
    if (!actor?.active || !actor.approved || actor.role !== 'access_admin') throw new Error('Для импорта нужен действующий администратор.');
    // Use exactly the ordinary module's actor -> scope -> record lock order.
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,917042032))', [`scope:${JSON.stringify(TUPLE)}`]);
    const previous = (await client.query(`SELECT payload->'metadata' AS metadata FROM audit_events
      WHERE payload->>'action'='tenders.workbook_imported' AND payload->>'entityId'=$1 ORDER BY sequence`, [TARGET.responsibilityScopeId])).rows;
    const replay = previous.length > 0;
    if (replay && (previous.length !== 1 || previous[0].metadata?.sourceKey !== SOURCE_KEY || previous[0].metadata?.planSha256 !== planSha256 || previous[0].metadata?.sourceSha256 !== plan.source.sha256))
      changed('Источник или состав плана импорта уже изменён.');
    await ensureReference(client, 'legal_entities', TARGET.legalEntityId, { name: TARGET.legalEntityName }, replay);
    await ensureReference(client, 'regions', TARGET.regionId, { name: TARGET.regionName, time_zone: 'Europe/Moscow' }, replay);
    await ensureReference(client, 'projects', TARGET.projectId, { name: TARGET.projectName, legal_entity_id: TARGET.legalEntityId, region_id: TARGET.regionId }, replay);
    await ensureReference(client, 'responsibility_scopes', TARGET.responsibilityScopeId, { name: TARGET.scopeName, project_id: TARGET.projectId }, replay);
    const grant = (await client.query('SELECT * FROM access_grants WHERE user_id=$1 AND responsibility_scope_id=$2', [actorId, TARGET.responsibilityScopeId])).rows[0];
    if (grant && (!sameScope(grant) || grant.personal_data_visible || grant.finance_visible)) changed('Права в области импорта уже изменены.');
    if (!grant) {
      if (replay) changed('Доступ администратора к области импорта отозван.');
      await client.query(`INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id,personal_data_visible,finance_visible)
        VALUES($1,$2,$3,$4,$5,false,false)`, [actorId, ...TUPLE]);
      await appendAudit(client, actorId, correlationId, 'tenders.import_scope_created', 'responsibility_scope', TARGET.responsibilityScopeId,
        { sourceKey: SOURCE_KEY, financeVisible: false, personalDataVisible: false });
    }
    const totals = {};
    for (const table of ['tender_customers', 'tender_items', 'tender_events']) {
      totals[table] = Number((await client.query(`SELECT count(*) FROM ${table} WHERE legal_entity_id=$1 AND region_id=$2 AND project_id=$3 AND responsibility_scope_id=$4`, TUPLE)).rows[0].count);
    }
    if (!replay && (totals.tender_customers + customerMap.size > 10000 || totals.tender_items + records.length > 10000 || totals.tender_events + records.length * 3 > 50000))
      throw new Error('Превышен предел записей области импорта.');
    for (const customer of customerMap.values()) {
      await lockRecord(client, 'customers', customer.id);
      const existing = (await client.query('SELECT * FROM tender_customers WHERE id=$1 FOR UPDATE', [customer.id])).rows[0];
      if (existing) {
        if (!replay || !sameScope(existing) || existing.name !== customer.name || existing.version !== 1) changed('Карточка заказчика уже изменена или занята.');
      } else {
        if (replay) changed('Карточка первоначального заказчика отсутствует.');
        await client.query(`INSERT INTO tender_customers(id,legal_entity_id,region_id,project_id,responsibility_scope_id,name,created_by,updated_by)
          VALUES($1,$2,$3,$4,$5,$6,$7,$7)`, [customer.id, ...TUPLE, customer.name, actorId]);
        result.customersInserted++;
      }
    }
    for (const record of records) {
      const payload = record.payload;
      await lockRecord(client, 'tenders', payload.id);
      const existing = (await client.query('SELECT * FROM tender_items WHERE id=$1 FOR UPDATE', [payload.id])).rows[0];
      if (existing) {
        if (!replay || !sameScope(existing) || existing.version !== 1 || !Object.entries(FIELD_COLUMNS).every(([key, column]) => existing[column] === payload[key]))
          changed(`Запись ${record.sourceKey} уже изменена в приложении или исходнике.`);
        for (const expected of expectedEvents(record)) {
          const event = (await client.query('SELECT * FROM tender_events WHERE id=$1', [expected.id])).rows[0];
          if (!event || !sameScope(event) || event.tender_id !== payload.id || event.customer_id !== payload.customerId || event.type !== expected.type ||
            event.text !== expected.text || event.from_status !== null || event.to_status !== expected.toStatus) changed('Сохранённый источник или исходная история уже изменены.');
        }
        result.skipped++;
      } else {
        if (replay) changed('Карточка первоначального тендера отсутствует.');
        const names = ['id', ...SCOPE_COLUMNS, ...Object.values(FIELD_COLUMNS), 'created_by', 'updated_by'];
        const values = [payload.id, ...TUPLE, ...Object.keys(FIELD_COLUMNS).map(key => payload[key]), actorId, actorId];
        await client.query(`INSERT INTO tender_items(${names.join(',')}) VALUES(${values.map((_, index) => `$${index + 1}`).join(',')})`, values);
        for (const event of expectedEvents(record)) {
          await lockRecord(client, 'events', event.id);
          const collision = await client.query('SELECT 1 FROM tender_events WHERE id=$1', [event.id]);
          if (collision.rowCount) changed('Идентификатор исходного события уже занят.');
          await client.query(`INSERT INTO tender_events(id,legal_entity_id,region_id,project_id,responsibility_scope_id,tender_id,customer_id,type,text,actor_id,actor_name,to_status)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [event.id, ...TUPLE, payload.id, payload.customerId, event.type, event.text, actorId, actor.display_name, event.toStatus]);
          result.eventsInserted++;
        }
        await appendAudit(client, actorId, correlationId, 'tenders.items.imported', 'tender_items', payload.id,
          { sourceKey: SOURCE_KEY, sourceSha256: plan.source.sha256, sheet: record.sheet, sourceRows: record.sourceRows, version: 1, status: payload.status });
        result.inserted++;
      }
      result.byStatus[payload.status] = (result.byStatus[payload.status] || 0) + 1;
      result.mapping.push({ sourceKey: record.sourceKey, sourceRows: record.sourceRows, tenderId: payload.id, customerId: payload.customerId, status: payload.status });
    }
    if (!replay) await appendAudit(client, actorId, correlationId, 'tenders.workbook_imported', 'responsibility_scope', TARGET.responsibilityScopeId,
      { sourceKey: SOURCE_KEY, sourceSha256: plan.source.sha256, planSha256, inserted: result.inserted, customersInserted: result.customersInserted,
        sourceRows: result.sourceRows, byStatus: result.byStatus });
    await client.query(dryRun ? 'ROLLBACK' : 'COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}
async function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => !['--apply', '--dry-run'].includes(arg)) || args.includes('--apply') && args.includes('--dry-run'))
    throw new Error('Использование: node integrations/tenders-import/import-local.cjs [--dry-run | --apply]');
  const directory = path.join(paths.root, '.local/tenders-import');
  const plan = await readJson(path.join(directory, 'plan.json')), login = await readJson(paths.login);
  if (!login?.localOnly || !login.userId) throw new Error('Локальный администратор не настроен.');
  const pool = await openAdminPool();
  try {
    const result = await importPlan(pool, plan, login.userId, { dryRun: !args.includes('--apply') });
    await fs.writeFile(path.join(directory, result.dryRun ? 'dry-run.json' : 'result.json'), JSON.stringify(result, null, 2) + '\n', { mode: 0o600 });
    const { mapping, ...summary } = result;
    console.log(JSON.stringify(summary, null, 2));
  } finally { await pool.end(); }
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { importPlan, recordsFromPlan, stableId, TARGET, SOURCE_KEY, NOTE_PREFIX, manifestHash };
