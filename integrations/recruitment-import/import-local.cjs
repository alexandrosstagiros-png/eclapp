'use strict';

// One-time/repeatable local import. No remote connection flags are supported.
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { paths, openAdminPool, readJson } = require('../local-app/runtime.cjs');
const { requestInput } = require('../../recovered/apps/api/src/modules/recruitment/recruitment-input.js');

const SOURCE_KEY = 'ecl-recruitment-projects-workbook-v1';
const FIELD_COLUMNS = Object.freeze({ title: 'title', city: 'city', district: 'district', kind: 'kind', quantity: 'quantity',
  priority: 'priority', status: 'status', neededBy: 'needed_by', recruiterId: 'recruiter_id', schedule: 'schedule',
  payTerms: 'pay_terms', vehicleRequirements: 'vehicle_requirements', notes: 'notes', publicBrief: 'public_brief',
  warehouseAddress: 'warehouse_address', routeInfo: 'route_info', trainingTerms: 'training_terms', driverRequirements: 'driver_requirements',
  hhUrl: 'hh_url', publishedAt: 'published_at' });
function stableId(value) {
  const bytes = createHash('sha256').update(SOURCE_KEY + ':' + value).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 15) | 80; bytes[8] = (bytes[8] & 63) | 128;
  const h = bytes.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
const TARGET = Object.freeze({ legalEntityId: stableId('legal-entity'), legalEntityName: 'ЕЦЛ · данные рекрутинга',
  regionId: stableId('region'), regionName: 'Все города', projectId: stableId('project'),
  projectName: 'Рекрутинг · Проекты и Перевозчики', responsibilityScopeId: stableId('scope'), scopeName: 'Потребности компании' });
function recordsFromPlan(plan, actorId) {
  if (plan?.schemaVersion !== 1 || !/^[a-f0-9]{64}$/.test(plan.source?.sha256 || '') ||
      !Array.isArray(plan.records) || !plan.records.length || plan.records.length > 10000) throw new Error('Неверный формат плана импорта.');
  const seen = new Set();
  return plan.records.map(record => {
    if (!['Проекты', 'Перевозчики'].includes(record.sheet) || !Number.isSafeInteger(record.rowStart) || record.rowStart < 2 ||
        !Number.isSafeInteger(record.rowEnd) || record.rowEnd < record.rowStart || record.sourceKey !== `${record.sheet}:${record.rowStart}` || seen.has(record.sourceKey))
      throw new Error('Неверная или повторная ссылка на исходную строку.');
    seen.add(record.sourceKey);
    if (typeof record.sourceDetails !== 'string' || !record.sourceDetails || record.sourceDetails.length > 100000 || /\u0000/.test(record.sourceDetails))
      throw new Error(`Неверный исходный текст: ${record.sourceKey}`);
    const payload = requestInput({ ...record.payload, id: stableId('request:' + record.sourceKey),
      responsibilityScopeId: TARGET.responsibilityScopeId, recruiterId: actorId, version: 0 });
    if (payload.kind !== (record.sheet === 'Проекты' ? 'driver' : 'carrier') || payload.publishedAt || payload.neededBy)
      throw new Error(`Неверное направление или придуманная дата: ${record.sourceKey}`);
    return { ...record, payload };
  });
}
async function ensureReference(client, table, id, values) {
  // All identifiers and values here are internal constants, never workbook SQL.
  const existing = (await client.query(`SELECT * FROM ${table} WHERE id=$1 FOR UPDATE`, [id])).rows[0];
  if (existing) {
    if (Object.entries(values).some(([key, value]) => existing[key] !== value)) throw new Error(`Область импорта уже изменена: ${table}`);
    return;
  }
  const fields = ['id', ...Object.keys(values)];
  await client.query(`INSERT INTO ${table}(${fields.join(',')}) VALUES(${fields.map((_, i) => '$' + (i + 1)).join(',')})`, [id, ...Object.values(values)]);
}
async function importPlan(pool, plan, actorId, { dryRun = true } = {}) {
  const records = recordsFromPlan(plan, actorId);
  const client = await pool.connect();
  const correlationId = randomUUID();
  const result = { dryRun, sourceSha256: plan.source.sha256, sourceFile: plan.source.fileName, ...TARGET,
    inserted: 0, skipped: 0, bySheet: {}, byStatus: {}, mapping: [] };
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL statement_timeout='30s'");
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,917042031))', [SOURCE_KEY]);
    const user = (await client.query('SELECT id,role,active,approved FROM users WHERE id=$1 FOR UPDATE', [actorId])).rows[0];
    if (!user?.active || !user.approved || user.role !== 'access_admin') throw new Error('Для импорта нужен действующий администратор.');
    const legalEntityId = TARGET.legalEntityId;
    const tuple = [legalEntityId, TARGET.regionId, TARGET.projectId, TARGET.responsibilityScopeId];
    const scope = { legalEntityId, regionId: TARGET.regionId, projectId: TARGET.projectId, responsibilityScopeId: TARGET.responsibilityScopeId };
    // Match ordinary recruitment writes: lock actor, then scope, then rows.
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,917042025))', [`scope:${JSON.stringify(tuple)}`]);
    await ensureReference(client, 'legal_entities', legalEntityId, { name: TARGET.legalEntityName });
    await ensureReference(client, 'regions', TARGET.regionId, { name: TARGET.regionName, time_zone: 'Europe/Moscow' });
    await ensureReference(client, 'projects', TARGET.projectId, { name: TARGET.projectName, legal_entity_id: legalEntityId, region_id: TARGET.regionId });
    await ensureReference(client, 'responsibility_scopes', TARGET.responsibilityScopeId, { name: TARGET.scopeName, project_id: TARGET.projectId });
    const grant = (await client.query(`SELECT * FROM access_grants WHERE user_id=$1 AND responsibility_scope_id=$2`, [actorId, TARGET.responsibilityScopeId])).rows[0];
    if (grant && (grant.legal_entity_id !== legalEntityId || grant.project_id !== TARGET.projectId || grant.region_id !== TARGET.regionId || !grant.personal_data_visible || grant.finance_visible))
      throw new Error('Права в области импорта изменены. Автоматическая замена запрещена.');
    if (!grant) {
      await client.query(`INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id,personal_data_visible,finance_visible)
        VALUES($1,$2,$3,$4,$5,true,false)`, [actorId, ...tuple]);
      await client.query('SELECT append_audit($1::jsonb)', [JSON.stringify({ schemaVersion: 1, actorId, action: 'recruitment.import_scope_created',
        entityType: 'responsibility_scope', entityId: TARGET.responsibilityScopeId, channel: 'system', correlationId, scope,
        metadata: { sourceKey: SOURCE_KEY, financeVisible: false, personalDataVisible: true } })]);
    }
    const total = Number((await client.query('SELECT count(*) FROM recruitment_requests WHERE responsibility_scope_id=$1', [TARGET.responsibilityScopeId])).rows[0].count);
    if (total > 10000) throw new Error('Слишком много записей в области импорта.');
    for (const record of records) {
      const payload = record.payload;
      const existing = (await client.query('SELECT * FROM recruitment_requests WHERE id=$1 FOR UPDATE', [payload.id])).rows[0];
      if (existing) {
        const sameScope = existing.legal_entity_id === legalEntityId && existing.region_id === TARGET.regionId && existing.project_id === TARGET.projectId && existing.responsibility_scope_id === TARGET.responsibilityScopeId;
        const sameFields = Object.entries(FIELD_COLUMNS).every(([key, column]) => existing[column] === payload[key]);
        if (!sameScope || !sameFields || existing.source_details !== record.sourceDetails)
          throw new Error(`Запись ${record.sourceKey} уже изменена в приложении или исходнике. Импорт отменён без перезаписи.`);
        result.skipped++;
      } else {
        if (total + result.inserted >= 10000) throw new Error('Превышен предел записей области.');
        const names = ['id', 'legal_entity_id', 'region_id', 'project_id', 'responsibility_scope_id', ...Object.values(FIELD_COLUMNS), 'source_details', 'created_by', 'updated_by'];
        const values = [payload.id, ...tuple, ...Object.keys(FIELD_COLUMNS).map(key => payload[key]), record.sourceDetails, actorId, actorId];
        await client.query(`INSERT INTO recruitment_requests(${names.join(',')}) VALUES(${values.map((_, i) => '$' + (i + 1)).join(',')})`, values);
        await client.query('SELECT append_audit($1::jsonb)', [JSON.stringify({ schemaVersion: 1, actorId, action: 'recruitment.requests.imported',
          entityType: 'recruitment_requests', entityId: payload.id, channel: 'system', correlationId, scope,
          metadata: { sourceKey: SOURCE_KEY, sourceSha256: plan.source.sha256, sheet: record.sheet, rowStart: record.rowStart, rowEnd: record.rowEnd, version: 1, status: payload.status } })]);
        result.inserted++;
      }
      result.bySheet[record.sheet] = (result.bySheet[record.sheet] || 0) + 1;
      result.byStatus[payload.status] = (result.byStatus[payload.status] || 0) + 1;
      result.mapping.push({ sourceKey: record.sourceKey, requestId: payload.id, status: payload.status, quantity: payload.quantity });
    }
    if (result.inserted) await client.query('SELECT append_audit($1::jsonb)', [JSON.stringify({ schemaVersion: 1, actorId,
      action: 'recruitment.workbook_imported', entityType: 'responsibility_scope', entityId: TARGET.responsibilityScopeId,
      channel: 'system', correlationId, scope, metadata: { sourceKey: SOURCE_KEY, sourceSha256: plan.source.sha256, inserted: result.inserted, skipped: result.skipped, bySheet: result.bySheet } })]);
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
    throw new Error('Использование: node integrations/recruitment-import/import-local.cjs [--dry-run | --apply]');
  const dir = path.join(paths.root, '.local/recruitment-import');
  const plan = await readJson(path.join(dir, 'plan.json'));
  const login = await readJson(paths.login);
  if (!login?.localOnly || !login.userId) throw new Error('Локальный администратор не настроен.');
  const pool = await openAdminPool();
  try {
    const result = await importPlan(pool, plan, login.userId, { dryRun: !args.includes('--apply') });
    const output = path.join(dir, result.dryRun ? 'dry-run.json' : 'result.json');
    await fs.writeFile(output, JSON.stringify(result, null, 2) + '\n', { mode: 0o600 });
    const { mapping, ...summary } = result;
    console.log(JSON.stringify(summary, null, 2));
  } finally { await pool.end(); }
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { importPlan, recordsFromPlan, stableId, TARGET, SOURCE_KEY };
