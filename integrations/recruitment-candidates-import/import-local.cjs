'use strict';
// Local administrative import only. No remote URL, .env or account provisioning.
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { paths, openAdminPool, readJson, atomicJson } = require('../local-app/runtime.cjs');
const { candidateInput, instant, uuid } = require('../../recovered/apps/api/src/modules/recruitment/recruitment-input.js');

const SOURCE_NAMESPACE = 'recruitment-candidate-workbook-v1';
const SHEETS = ['Свои авто', 'Наемные авто'];
const STAFF = ['dispatcher', 'manager', 'recruiter', 'access_admin'];
const SCOPED = 'legal_entity_id=$1 AND region_id=$2 AND project_id=$3 AND responsibility_scope_id=$4';
const CANDIDATE_FIELDS = Object.freeze({ fullName: 'full_name', phone: 'phone', city: 'city', district: 'district', kind: 'kind',
  recruiterId: 'recruiter_id', source: 'source', hhUrl: 'hh_url', licenseCategories: 'license_categories', experience: 'experience',
  vehicleType: 'vehicle_type', vehicleDimensions: 'vehicle_dimensions', vehicleCapacity: 'vehicle_capacity', notes: 'notes', archived: 'archived' });

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
function digest(value) { return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex'); }
function stableId(value) {
  const bytes = createHash('sha256').update(SOURCE_NAMESPACE + ':' + value).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 15) | 80; bytes[8] = (bytes[8] & 63) | 128;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function plain(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function invalid(message, sourceKey) { throw new Error(sourceKey ? `${message} (${sourceKey})` : message); }
function codeError(message) { const error = new Error(message); error.isImportValidation = true; return error; }

function validateBatch(batch, resolution) {
  if (batch?.schemaVersion !== 1 || !/^[a-z0-9][a-z0-9_-]{0,79}$/.test(batch.source?.documentId || '') ||
      !/^[a-f0-9]{64}$/.test(batch.source?.sha256 || '') || !Array.isArray(batch.records) || batch.records.length > 20000 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(batch.source.asOf || '')) invalid('Неверный формат пакета импорта.');
  if (resolution?.schemaVersion !== 1 || resolution.documentId !== batch.source.documentId || resolution.sourceSha256 !== batch.source.sha256 || !plain(resolution.records))
    invalid('Карта решений не соответствует снимку исходного файла.');
  const seen = new Set();
  for (const record of batch.records) {
    if (!SHEETS.includes(record.sheet) || !Number.isSafeInteger(record.row) || record.row < 2 || record.sourceKey !== `${record.sheet}:${record.row}` || seen.has(record.sourceKey))
      invalid('Неверная или повторная ссылка на строку источника.');
    if (!plain(record.raw) || !plain(record.proposed) || !plain(record.labels) || !Array.isArray(record.issues) ||
        record.issues.some(issue => typeof issue !== 'string' || !/^[a-zA-Z_]+$/.test(issue)) || JSON.stringify(record).length > 250000)
      invalid('Неверные данные исходной строки.', record.sourceKey);
    seen.add(record.sourceKey);
  }
  if (Object.keys(resolution.records).some(key => !seen.has(key))) invalid('В карте решений есть строки вне выбранного пакета.');
}

function compilePlan(batch, resolution) {
  validateBatch(batch, resolution);
  const result = { sourceSha256: batch.source.sha256, documentId: batch.source.documentId, total: batch.records.length,
    selected: 0, pending: 0, excluded: 0, quarantined: 0, problems: [], records: [] };
  for (const record of batch.records) {
    const decision = resolution.records[record.sourceKey];
    if (!decision || decision.action === 'pending') { result.pending++; if (record.issues.some(code => code.startsWith('invalid_'))) result.quarantined++; continue; }
    if (decision.action === 'exclude') {
      if (typeof decision.reason !== 'string' || !decision.reason.trim()) result.problems.push({ sourceKey: record.sourceKey, code: 'exclusion_reason_required' });
      else result.excluded++;
      continue;
    }
    result.selected++;
    try {
      if (decision.action !== 'import') throw codeError('unknown_action');
      if (!['active', 'archive'].includes(decision.disposition)) throw codeError('disposition_required');
      if (!Array.isArray(decision.acknowledgedIssues) || record.issues.some(code => !decision.acknowledgedIssues.includes(code))) throw codeError('issues_not_reviewed');
      const corrections = decision.corrections || {};
      if (!plain(corrections) || Object.keys(corrections).some(key => !['fullName', 'phone', 'city', 'occurredAt'].includes(key))) throw codeError('invalid_corrections');
      if (Object.keys(corrections).length && (typeof decision.evidence !== 'string' || !decision.evidence.trim())) throw codeError('correction_evidence_required');
      const target = decision.target || resolution.targets?.[record.sheet];
      if (!plain(target)) throw codeError('target_mapping_required');
      const recruiterId = decision.recruiterId || resolution.recruiters?.[record.labels.recruiter];
      if (!recruiterId) throw codeError('recruiter_mapping_required');
      const source = resolution.sources?.[record.labels.source];
      if (!source) throw codeError('source_mapping_required');
      const candidate = decision.candidate;
      if (!plain(candidate) || !['new', 'existing', 'record'].includes(candidate.mode)) throw codeError('duplicate_decision_required');
      const localId = stableId(`${batch.source.documentId}:candidate:${record.sourceKey}`);
      const id = candidate.mode === 'existing' ? uuid(candidate.id) : candidate.mode === 'record' ? stableId(`${batch.source.documentId}:candidate:${candidate.sourceKey}`) : localId;
      if (candidate.mode === 'record' && (candidate.sourceKey === record.sourceKey || !batch.records.some(item => item.sourceKey === candidate.sourceKey))) throw codeError('invalid_candidate_reference');
      const payload = candidateInput({ ...record.proposed, ...corrections, id, responsibilityScopeId: target.responsibilityScopeId,
        version: 0, kind: target.kind, recruiterId, source, notes: decision.notes, archived: decision.disposition === 'archive' });
      const occurredAt = instant(Object.hasOwn(corrections, 'occurredAt') ? corrections.occurredAt : record.proposed.occurredAt);
      if (occurredAt && (occurredAt.slice(0, 10) > batch.source.asOf || occurredAt < '2000-01-01')) throw codeError('invalid_inquiry_date');
      if (JSON.stringify(record.raw).includes('\\u0000')) throw codeError('invalid_raw_control_character');
      let demandId = null;
      if (decision.demand !== 'none') {
        const mapped = decision.demand === 'mapped' ? resolution.demands?.[`${record.sheet}:${record.labels.location}`] : decision.demand;
        if (!mapped) throw codeError('demand_mapping_required');
        demandId = uuid(mapped);
        if (!['new', 'reserve'].includes(decision.stage)) throw codeError('review_stage_required');
        if (payload.archived) throw codeError('archived_candidate_cannot_start_application');
      }
      result.records.push({ record, decision, payload, occurredAt, demandId, candidateMode: candidate.mode,
        contactNotes: payload.notes || `Обращение из таблицы: ${record.sheet}, строка ${record.row}. Исторические этапы требуют сверки.`,
        referencedSourceKey: candidate.mode === 'record' ? candidate.sourceKey : null,
        stage: demandId ? decision.stage : null,
        importId: stableId(`${batch.source.documentId}:provenance:${record.sourceKey}`),
        contactId: stableId(`${batch.source.documentId}:contact:${record.sourceKey}`),
        applicationId: demandId ? stableId(`${batch.source.documentId}:application:${id}:${demandId}`) : null,
        recordHash: digest(record), resolutionHash: digest({ decision, target, recruiterId, source, demandId }) });
    } catch (error) { result.problems.push({ sourceKey: record.sourceKey, code: error.isImportValidation ? error.message : 'invalid_candidate_fields' }); }
  }
  const selectedByKey = new Map(result.records.map(item => [item.record.sourceKey, item]));
  for (const item of result.records) {
    if (!item.referencedSourceKey) continue;
    const parent = selectedByKey.get(item.referencedSourceKey);
    if (!parent || parent.candidateMode !== 'new' || parent.payload.id !== item.payload.id || parent.payload.phone !== item.payload.phone ||
        parent.payload.kind !== item.payload.kind || parent.payload.responsibilityScopeId !== item.payload.responsibilityScopeId || parent.payload.recruiterId !== item.payload.recruiterId)
      result.problems.push({ sourceKey: item.record.sourceKey, code: 'candidate_reference_must_be_selected_new_same_scope_owner_phone' });
  }
  result.records.sort((a, b) => Number(a.candidateMode === 'record') - Number(b.candidateMode === 'record') || a.record.sourceKey.localeCompare(b.record.sourceKey));
  return result;
}

async function inspectDatabase(client, compiled, batch, actorId, { lock = false } = {}) {
  const suffix = lock ? ' FOR UPDATE' : '';
  if (lock) {
    // Match the API's identity -> company -> scope lock order. Take all user
    // locks together before a recruiter request can wait on our company lock.
    await client.query('SELECT id FROM users WHERE id=ANY($1::uuid[]) ORDER BY id FOR NO KEY UPDATE',
      [[uuid(actorId), ...new Set(compiled.records.map(item => item.payload.recruiterId))]]);
  }
  const user = (await client.query('SELECT id,role,active,approved FROM users WHERE id=$1', [uuid(actorId)])).rows[0];
  if (!user?.active || !user.approved || user.role !== 'access_admin') invalid('Для импорта нужен действующий администратор.');
  const previous = (await client.query('SELECT DISTINCT source_sha256 FROM recruitment_candidate_imports WHERE document_id=$1', [batch.source.documentId])).rows;
  if (previous.some(row => row.source_sha256 !== batch.source.sha256)) invalid('Этот источник уже импортирован из другого снимка. Сверьте изменения и перемещения строк отдельно.');
  const scopes = new Map(), candidates = new Map(), phones = new Map(), applications = new Map();
  for (const scopeId of [...new Set(compiled.records.map(item => item.payload.responsibilityScopeId))].sort()) {
    const scope = (await client.query(`SELECT rs.id AS responsibility_scope_id,p.id AS project_id,p.legal_entity_id,p.region_id
      FROM responsibility_scopes rs JOIN projects p ON p.id=rs.project_id WHERE rs.id=$1`, [scopeId])).rows[0];
    if (!scope) { scopes.set(scopeId, null); continue; }
    const tuple = [scope.legal_entity_id, scope.region_id, scope.project_id, scopeId];
    const grant = (await client.query(`SELECT 1 FROM access_grants WHERE ${SCOPED} AND user_id=$5 AND personal_data_visible`, [...tuple, actorId])).rowCount;
    scopes.set(scopeId, grant ? { ...scope, tuple } : null);
  }
  if (lock) {
    const authorized = [...scopes.values()].filter(Boolean);
    for (const company of [...new Set(authorized.map(scope => scope.legal_entity_id))].sort())
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,917042025))', [`recruitment-company:${company}`]);
    for (const scope of authorized)
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,917042025))', [`scope:${JSON.stringify(scope.tuple)}`]);
  }
  const prepared = [];
  for (const item of compiled.records) {
    const { record, payload } = item;
    const fail = code => { compiled.problems.push({ sourceKey: record.sourceKey, code }); };
    const scopeId = payload.responsibilityScopeId;
    const scope = scopes.get(scopeId);
    if (!scope) { fail('scope_missing_or_not_authorized'); continue; }
    const participant = (await client.query(`SELECT u.id,u.role FROM users u JOIN access_grants g ON g.user_id=u.id
      WHERE g.legal_entity_id=$1 AND g.region_id=$2 AND g.project_id=$3 AND g.responsibility_scope_id=$4
      AND g.personal_data_visible AND u.id=$5 AND u.active AND u.approved AND u.role=ANY($6::text[])`,
    [...scope.tuple, payload.recruiterId, [...STAFF, 'external_recruiter']])).rows[0];
    if (!participant) { fail('recruiter_missing_or_not_authorized'); continue; }
    if (participant.role === 'external_recruiter') {
      const access = (await client.query(`SELECT request_ids FROM recruitment_external_access WHERE ${SCOPED} AND user_id=$5
        AND status='active' AND (expires_at IS NULL OR expires_at>clock_timestamp())`, [...scope.tuple, payload.recruiterId])).rows[0];
      if (!access || (item.demandId && !access.request_ids.includes(item.demandId))) { fail('external_recruiter_access_required'); continue; }
    }
    const imported = (await client.query('SELECT source_sha256,source_record_sha256,resolution_sha256 FROM recruitment_candidate_imports WHERE id=$1' + suffix, [item.importId])).rows[0];
    if (imported) {
      if (imported.source_sha256 !== batch.source.sha256 || imported.source_record_sha256 !== item.recordHash || imported.resolution_sha256 !== item.resolutionHash) fail('already_imported_source_or_resolution_changed');
      else prepared.push({ ...item, scope, replay: true });
      continue;
    }
    let existing = candidates.get(payload.id);
    if (!existing) existing = (await client.query(`SELECT id,phone,kind,recruiter_id,archived,${'legal_entity_id,region_id,project_id,responsibility_scope_id'} FROM recruitment_candidates WHERE id=$1` + suffix, [payload.id])).rows[0];
    if (item.candidateMode === 'new') {
      if (existing) { fail('candidate_id_exists_without_matching_provenance'); continue; }
      const phoneKey = `${scope.legal_entity_id}:${payload.phone}`;
      const duplicate = phones.get(phoneKey) || (await client.query('SELECT id FROM recruitment_candidates WHERE legal_entity_id=$1 AND phone=$2 LIMIT 1', [scope.legal_entity_id, payload.phone])).rows[0];
      if (duplicate) { fail('phone_match_requires_explicit_identity_resolution'); continue; }
      existing = { id: payload.id, phone: payload.phone, kind: payload.kind, recruiter_id: payload.recruiterId, archived: payload.archived, ...scope };
      phones.set(phoneKey, existing);
      candidates.set(payload.id, existing);
    } else {
      if (!existing || existing.responsibility_scope_id !== scopeId || existing.phone !== payload.phone || existing.kind !== payload.kind ||
          existing.recruiter_id !== payload.recruiterId || existing.archived !== payload.archived) { fail('existing_candidate_must_match_scope_phone_kind_owner_disposition'); continue; }
    }
    let existingApplication = null;
    if (item.demandId) {
      const request = (await client.query(`SELECT kind,status FROM recruitment_requests WHERE ${SCOPED} AND id=$5`, [...scope.tuple, item.demandId])).rows[0];
      if (!request || request.kind !== payload.kind || request.status === 'closed') { fail('existing_demand_missing_incompatible_or_closed'); continue; }
      const appKey = `${payload.id}:${item.demandId}`;
      existingApplication = applications.get(appKey) || (await client.query('SELECT id,recruiter_id FROM recruitment_applications WHERE candidate_id=$1 AND request_id=$2', [payload.id, item.demandId])).rows[0];
      if (existingApplication) {
        if (item.decision.application !== 'reuse') { fail('existing_application_requires_explicit_reuse'); continue; }
        if (existingApplication.recruiter_id !== payload.recruiterId) { fail('existing_application_owner_must_match'); continue; }
      } else applications.set(appKey, { id: item.applicationId, recruiter_id: payload.recruiterId });
    }
    prepared.push({ ...item, scope, existingApplication, replay: false });
  }
  return prepared;
}

function summary(compiled, prepared = []) {
  return { sourceSha256: compiled.sourceSha256, documentId: compiled.documentId, total: compiled.total, selected: compiled.selected,
    pending: compiled.pending, excluded: compiled.excluded, quarantined: compiled.quarantined,
    ready: prepared.filter(item => !item.replay).length, replay: prepared.filter(item => item.replay).length,
    problemCount: compiled.problems.length, problems: compiled.problems };
}

async function previewPlan(pool, batch, resolution, actorId) {
  const compiled = compilePlan(batch, resolution);
  if (compiled.problems.length || !compiled.records.length) return { mode: 'preview', ...summary(compiled) };
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query("SET LOCAL statement_timeout='30s'");
    const prepared = await inspectDatabase(client, compiled, batch, actorId);
    await client.query('ROLLBACK');
    return { mode: 'preview', ...summary(compiled, prepared) };
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

async function importPlan(pool, batch, resolution, actorId, { dryRun = true } = {}) {
  const compiled = compilePlan(batch, resolution);
  if (compiled.problems.length) invalid('Есть нерешённые ошибки выбранных строк. Выполните preview.');
  if (!compiled.records.length) invalid('Не выбраны строки для импорта. Заполните карту решений.');
  const client = await pool.connect();
  const correlationId = randomUUID();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL statement_timeout='30s'");
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,917042038))', [batch.source.documentId]);
    const prepared = await inspectDatabase(client, compiled, batch, actorId, { lock: true });
    if (compiled.problems.length) invalid('Проверка базы выявила конфликт. Выполните preview; данные не изменены.');
    let candidates = 0, contacts = 0, applications = 0;
    for (const item of prepared) {
      if (item.replay) continue;
      const { payload, scope } = item;
      if (item.candidateMode === 'new') {
        const fields = ['id', 'legal_entity_id', 'region_id', 'project_id', 'responsibility_scope_id', ...Object.values(CANDIDATE_FIELDS), 'created_by', 'updated_by'];
        const values = [payload.id, ...scope.tuple, ...Object.keys(CANDIDATE_FIELDS).map(key => payload[key]), actorId, actorId];
        await client.query(`INSERT INTO recruitment_candidates(${fields.join(',')}) VALUES(${values.map((_, i) => '$' + (i + 1)).join(',')})`, values);
        candidates++;
      }
      let applicationId = item.existingApplication?.id || item.applicationId;
      if (item.demandId && !item.existingApplication) {
        await client.query(`INSERT INTO recruitment_applications(id,legal_entity_id,region_id,project_id,responsibility_scope_id,
          candidate_id,request_id,recruiter_id,stage,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)`,
        [applicationId, ...scope.tuple, payload.id, item.demandId, payload.recruiterId, item.stage, actorId]);
        applications++;
      }
      await client.query(`INSERT INTO recruitment_contacts(id,legal_entity_id,region_id,project_id,responsibility_scope_id,
        candidate_id,application_id,result,source,occurred_at,actor_id,notes,origin,request_payload)
        VALUES($1,$2,$3,$4,$5,$6,$7,'inquiry',$8,$9,$10,$11,'import','{}'::jsonb)`,
      [item.contactId, ...scope.tuple, payload.id, applicationId, payload.source, item.occurredAt, actorId, item.contactNotes]);
      contacts++;
      await client.query(`INSERT INTO recruitment_candidate_imports(id,document_id,source_sha256,source_key,source_record_sha256,
        resolution_sha256,legal_entity_id,region_id,project_id,responsibility_scope_id,candidate_id,contact_id,application_id,
        source_data,resolution_data,imported_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15::jsonb,$16)`,
      [item.importId, batch.source.documentId, batch.source.sha256, item.record.sourceKey, item.recordHash, item.resolutionHash,
        ...scope.tuple, payload.id, item.contactId, applicationId, JSON.stringify({ source: batch.source, record: item.record }),
        JSON.stringify({ decision: item.decision, recruiterId: payload.recruiterId, source: payload.source, kind: payload.kind,
          responsibilityScopeId: payload.responsibilityScopeId, demandId: item.demandId }), actorId]);
      const auditScope = { legalEntityId: scope.legal_entity_id, regionId: scope.region_id, projectId: scope.project_id, responsibilityScopeId: scope.responsibility_scope_id };
      await client.query('SELECT append_audit($1::jsonb)', [JSON.stringify({ schemaVersion: 1, actorId,
        action: 'recruitment.candidate_imported', entityType: 'recruitment_candidates', entityId: payload.id, channel: 'system', correlationId,
        scope: auditScope, metadata: { importId: item.importId, sourceSha256: batch.source.sha256, version: 1 } })]);
    }
    await client.query(dryRun ? 'ROLLBACK' : 'COMMIT');
    return { mode: dryRun ? 'dry-run' : 'apply', ...summary(compiled, prepared), createdCandidates: candidates, createdContacts: contacts, createdApplications: applications };
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

async function main() {
  const args = process.argv.slice(2);
  let mode = 'preview';
  let modeChosen = false;
  let directory = path.join(paths.root, '.local/recruitment-candidate-import');
  for (let i = 0; i < args.length; i++) {
    if (['--preview', '--dry-run', '--apply'].includes(args[i]) && !modeChosen) { mode = args[i].slice(2); modeChosen = true; }
    else if (args[i] === '--directory' && args[i + 1]) directory = path.resolve(args[++i]);
    else invalid('Использование: node integrations/recruitment-candidates-import/import-local.cjs [--preview | --dry-run | --apply] [--directory PATH]');
  }
  const batch = await readJson(path.join(directory, 'batch.json'));
  const resolution = await readJson(path.join(directory, 'resolution.json'));
  const compiled = compilePlan(batch, resolution);
  let result;
  if (mode === 'preview' && (!compiled.records.length || compiled.problems.length)) result = { mode, ...summary(compiled) };
  else {
    const login = await readJson(paths.login);
    if (!login?.localOnly || !login.userId) invalid('Локальный администратор не настроен.');
    const pool = await openAdminPool();
    try { result = mode === 'preview' ? await previewPlan(pool, batch, resolution, login.userId) : await importPlan(pool, batch, resolution, login.userId, { dryRun: mode !== 'apply' }); }
    finally { await pool.end(); }
  }
  await fs.chmod(directory, 0o700);
  await atomicJson(path.join(directory, `${mode}.json`), result);
  const { problems, ...counts } = result;
  console.log(JSON.stringify(counts, null, 2));
  if (result.problemCount) process.exitCode = 2;
}
if (require.main === module) main().catch(() => { console.error('Импорт не выполнен. Проверьте приватную карту решений и preview; исходная книга сохранена.'); process.exitCode = 1; });
module.exports = { compilePlan, previewPlan, importPlan, stableId, digest, validateBatch };
