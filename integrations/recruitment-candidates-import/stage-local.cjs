'use strict';
// Local administrative staging. Workbook formulas remain inert source data.
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { paths, readJson, appRequire, connectionConfig } = require('../local-app/runtime.cjs');
const { digest, stableId } = require('./import-local.cjs');
const { uuid } = require('../../recovered/apps/api/src/modules/recruitment/recruitment-input.js');

const MAIN = ['Свои авто', 'Наемные авто'];
const ARCHIVE = ['Пальма', 'Неликвид', 'ГРУЗЧИКИ', 'Лист9', 'ОФИС'];
const MAX_ROWS = 50000, MAX_ROW_BYTES = 250000;
const SCOPE = 'legal_entity_id=$1 AND region_id=$2 AND project_id=$3 AND responsibility_scope_id=$4';
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
const fail = message => { throw new Error(message); };
function check(value, message) { if (!value) fail(message); }
function jsonSafe(value) {
  const serialized = JSON.stringify(value);
  check(serialized && !serialized.includes('\\u0000') && Buffer.byteLength(serialized) <= MAX_ROW_BYTES, 'Недопустимые данные или размер исходной строки.');
}
function sameSource(source, expected) { return plain(source) && digest(source) === digest(expected); }
function fields(raw, headers, number) {
  check(plain(raw) && plain(headers), 'Отсутствуют исходные ячейки или заголовки.');
  return Object.entries(raw).map(([address, cell]) => {
    const match = /^([A-Z]{1,3})([1-9][0-9]*)$/.exec(address);
    check(match && Number(match[2]) === number && plain(cell), 'Неверный адрес исходной ячейки.');
    const header = headers[`${match[1]}1`];
    const formula = cell.dataType === 'f' ? cell.value : cell.xml?.formula != null ? cell.xml.formula : null;
    // Keep structured array/data-table formula metadata; never evaluate or coerce it to executable text.
    return { column: address, label: text(header?.cached ?? header?.value ?? match[1]),
      value: (formula ? cell.cached : cell.value) ?? null, formula, cached: cell.cached ?? null };
  });
}
function labelValue(raw, headers, number, names) {
  const address = Object.keys(headers).find(key => names.includes(text(headers[key]?.cached ?? headers[key]?.value).trim().toLowerCase()));
  const cell = address ? raw[address.replace(/1$/, String(number))] : null;
  return text(cell?.cached ?? (cell?.dataType === 'f' ? null : cell?.value));
}
function compileRows({ batch, archive, extra, policy, remainders }) {
  const source = batch?.source;
  check(batch?.schemaVersion === 1 && plain(source) && /^[a-z0-9][a-z0-9_-]{0,79}$/.test(source.documentId || '') &&
    /^[a-f0-9]{64}$/.test(source.sha256 || '') && typeof source.fileName === 'string' && source.fileName.length > 0 && source.fileName.length <= 255 &&
    Array.isArray(batch.records) && Array.isArray(batch.excludedTests), 'Неверный пакет исходных строк.');
  for (const part of [archive, extra]) check(part?.schemaVersion === 1 && sameSource(part.source, source) && plain(part.sheets), 'Архив не соответствует снимку источника.');
  check(plain(extra.headers) && Array.isArray(extra.excludedTests), 'Нет полной выгрузки заголовков и примеров.');
  check(remainders?.schemaVersion === 1 && sameSource(remainders.source, source) && Array.isArray(remainders.records), 'Нет выгрузки остальных исходных строк основных листов.');
  check(policy?.schemaVersion === 1 && policy.documentId === source.documentId && policy.sourceSha256 === source.sha256 && plain(policy.records), 'Политика дубликатов не соответствует снимку источника.');
  check(batch.records.length <= MAX_ROWS, 'Слишком много исходных строк.');
  const rows = [], seen = new Set(), mainKeys = new Set();
  function add(sheet, record, headers, main = false, example = false, remainder = false) {
    const number = record.row, key = `${sheet}:${number}`;
    check(typeof sheet === 'string' && sheet.length > 0 && sheet.length <= 100 && key.length <= 200 &&
      Number.isSafeInteger(number) && number > 0 && number <= 2147483647 && !seen.has(key), 'Неверная или повторная ссылка на исходную строку.');
    check(rows.length < MAX_ROWS, 'Слишком много исходных строк.');
    jsonSafe(record);
    const originalFields = fields(record.raw, headers, number);
    const additional = main && Object.hasOwn(policy.records, key) ? policy.records[key] : { issues: [] };
    check(plain(additional) && Array.isArray(additional.issues), 'Неверная политика строки.');
    const originalIssues = main ? record.issues : example ? ['excluded_example'] : remainder ? ['source_row_without_candidate'] : [];
    check(Array.isArray(originalIssues) && [...originalIssues, ...additional.issues].every(issue => typeof issue === 'string' && /^[a-zA-Z_]{1,100}$/.test(issue)), 'Неверные замечания к исходной строке.');
    const issues = [...new Set([...originalIssues, ...additional.issues])].sort();
    let labels;
    if (main) {
      check(record.sourceKey === key && plain(record.proposed) && plain(record.labels) && number > 1, 'Неверная основная строка.');
      const cellText = column => text(record.raw[`${column}${number}`]?.cached ?? record.raw[`${column}${number}`]?.value);
      labels = { fullName: text(record.proposed.fullName) || cellText('B'), city: text(record.proposed.city) || cellText('C'),
        phone: text(record.proposed.phone) || cellText(sheet === 'Свои авто' ? 'D' : 'E'),
        source: text(record.labels.source), recruiter: text(record.labels.recruiter), location: text(record.labels.location) };
      mainKeys.add(key);
    } else labels = { fullName: labelValue(record.raw, headers, number, ['фио', 'фио кандидата']),
      phone: labelValue(record.raw, headers, number, ['телефон', 'контакты']), city: labelValue(record.raw, headers, number, ['город']),
      source: labelValue(record.raw, headers, number, ['источник']), recruiter: labelValue(record.raw, headers, number, ['рекрутер', 'ответственный менеджер']),
      location: labelValue(record.raw, headers, number, ['локация']) };
    const rawData = { source, headers, record, disposition: main ? 'main' : example ? 'example' : remainder ? 'main_remainder' : 'archive_only' };
    const content = { sourceKey: key, sheet, row: number, labels, issues, fields: originalFields, rawData };
    jsonSafe(content);
    rows.push({ ...content, main, contentHash: digest(content), sourceRecordHash: main ? digest(record) : null });
    seen.add(key);
  }
  for (const record of batch.records) {
    check(MAIN.includes(record.sheet), 'Неизвестный основной лист.');
    add(record.sheet, record, extra.headers[record.sheet], true);
  }
  check(Object.keys(policy.records).every(key => mainKeys.has(key)), 'Политика содержит строки вне основного пакета.');
  for (const [sheet, data] of Object.entries(archive.sheets)) {
    check(ARCHIVE.includes(sheet) && Array.isArray(data.rows) && data.disposition === 'archive_only' &&
      digest(data.headers) === digest(extra.headers[sheet]), 'Неверный архивный лист или заголовок.');
    for (const record of data.rows) add(sheet, record, data.headers);
  }
  for (const [sheet, data] of Object.entries(extra.sheets)) {
    check(!MAIN.includes(sheet) && !ARCHIVE.includes(sheet) && Array.isArray(data.rows) && data.disposition === 'archive_only' &&
      digest(data.headers) === digest(extra.headers[sheet]), 'Неверный дополнительный лист.');
    for (const record of data.rows) add(sheet, record, data.headers);
  }
  const excluded = new Set(batch.excludedTests);
  check(excluded.size === batch.excludedTests.length && extra.excludedTests.length === excluded.size, 'Не совпадают исключённые примеры.');
  for (const record of extra.excludedTests) {
    check(MAIN.includes(record.sheet) && excluded.has(`${record.sheet}:${record.row}`), 'Неизвестный исключённый пример.');
    add(record.sheet, record, extra.headers[record.sheet], false, true);
  }
  for (const record of remainders.records) {
    check(MAIN.includes(record.sheet) && record.row > 1, 'Неизвестный основной лист архивной строки.');
    add(record.sheet, record, extra.headers[record.sheet], false, false, true);
  }
  check(rows.length > 0, 'Нет строк для загрузки.');
  return { source, rows };
}

async function inspect(client, compiled, scopeId, actorId, lock) {
  uuid(scopeId); uuid(actorId);
  const user = (await client.query(`SELECT role,active,approved FROM users WHERE id=$1${lock ? ' FOR UPDATE' : ''}`, [actorId])).rows[0];
  check(user?.active && user.approved && user.role === 'access_admin', 'Для загрузки нужен действующий администратор.');
  const scope = (await client.query(`SELECT p.legal_entity_id,p.region_id,p.id AS project_id,rs.id AS responsibility_scope_id
    FROM responsibility_scopes rs JOIN projects p ON p.id=rs.project_id WHERE rs.id=$1`, [scopeId])).rows[0];
  check(scope, 'Область загрузки недоступна.');
  const tuple = [scope.legal_entity_id, scope.region_id, scope.project_id, scopeId];
  if (lock) await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,917042025))', [`scope:${JSON.stringify(tuple)}`]);
  check((await client.query(`SELECT 1 FROM access_grants WHERE ${SCOPE} AND user_id=$5 AND personal_data_visible`, [...tuple, actorId])).rowCount, 'Нет права на персональные данные в выбранной области.');
  const snapshots = (await client.query(`SELECT source_sha256 FROM recruitment_import_rows WHERE document_id=$1
    UNION SELECT source_sha256 FROM recruitment_candidate_imports WHERE document_id=$1`, [compiled.source.documentId])).rows;
  check(snapshots.every(row => row.source_sha256 === compiled.source.sha256), 'Источник уже загружен из другого снимка.');
  const links = new Map((await client.query(`SELECT source_key,candidate_id,source_record_sha256 FROM recruitment_candidate_imports
    WHERE ${SCOPE} AND document_id=$5`, [...tuple, compiled.source.documentId])).rows.map(row => [row.source_key, row]));
  const existing = new Map((await client.query(`SELECT source_key,candidate_id,status,content_sha256 FROM recruitment_import_rows
    WHERE ${SCOPE} AND document_id=$5`, [...tuple, compiled.source.documentId])).rows.map(row => [row.source_key, row]));
  const prepared = compiled.rows.map(row => {
    const link = row.main ? links.get(row.sourceKey) : null;
    check(!link || link.source_record_sha256 === row.sourceRecordHash, 'Каноническая карточка получена из другой версии строки.');
    const candidateId = link?.candidate_id || null, status = row.main ? candidateId ? 'imported' : 'review' : 'archive';
    const previous = existing.get(row.sourceKey);
    check(!previous || (previous.content_sha256 === row.contentHash && previous.status === status && previous.candidate_id === candidateId), 'Конфликт повторной загрузки: исходные данные, замечания или связь изменились.');
    existing.delete(row.sourceKey);
    return { ...row, candidateId, status, replay: Boolean(previous) };
  });
  check(existing.size === 0, 'Повторная загрузка не содержит ранее сохранённые строки.');
  return { scope, tuple, prepared };
}
function counts(compiled, prepared, mode) {
  return { mode, documentId: compiled.source.documentId, sourceSha256: compiled.source.sha256, total: prepared.length,
    imported: prepared.filter(row => row.status === 'imported').length, review: prepared.filter(row => row.status === 'review').length,
    archive: prepared.filter(row => row.status === 'archive').length, ready: prepared.filter(row => !row.replay).length,
    replay: prepared.filter(row => row.replay).length, created: mode === 'preview' ? 0 : prepared.filter(row => !row.replay).length };
}
async function run(pool, bundle, scopeId, actorId, mode) {
  const compiled = compileRows(bundle), client = await pool.connect();
  try {
    await client.query(mode === 'preview' ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' : 'BEGIN');
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL statement_timeout='30s'");
    if (mode !== 'preview') await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,917042038))', [compiled.source.documentId]);
    const { scope, prepared } = await inspect(client, compiled, scopeId, actorId, mode !== 'preview');
    if (mode !== 'preview') {
      const missing = prepared.filter(row => !row.replay);
      for (let i = 0; i < missing.length; i += 100) {
        const chunk = missing.slice(i, i + 100).map(row => ({ id: stableId(`staging:${compiled.source.documentId}:${scopeId}:${row.sourceKey}`),
          ...scope, document_id: compiled.source.documentId, source_sha256: compiled.source.sha256, source_key: row.sourceKey,
          source_sheet: row.sheet, source_row: row.row, file_name: compiled.source.fileName, candidate_id: row.candidateId,
          status: row.status, full_name: row.labels.fullName, phone: row.labels.phone, city: row.labels.city,
          source_label: row.labels.source, recruiter_label: row.labels.recruiter, location_label: row.labels.location,
          issues: row.issues, fields: row.fields, raw_data: row.rawData, content_sha256: row.contentHash, created_by: actorId }));
        await client.query(`INSERT INTO recruitment_import_rows SELECT * FROM jsonb_populate_recordset(NULL::recruitment_import_rows,$1::jsonb)
          AS r WHERE true`, [JSON.stringify(chunk.map(row => ({ ...row, created_at: new Date().toISOString() })))]);
      }
      // One PII-free audit for a batch; exact replay performs no writes at all.
      if (missing.length) await client.query('SELECT append_audit($1::jsonb)', [JSON.stringify({ schemaVersion: 1, actorId,
        action: 'recruitment.source_rows_imported', entityType: 'responsibility_scopes', entityId: scopeId, channel: 'system', correlationId: randomUUID(),
        scope: { legalEntityId: scope.legal_entity_id, regionId: scope.region_id, projectId: scope.project_id, responsibilityScopeId: scopeId },
        metadata: { documentId: compiled.source.documentId, sourceSha256: compiled.source.sha256, rows: missing.length } })]);
    }
    await client.query(mode === 'apply' ? 'COMMIT' : 'ROLLBACK');
    return counts(compiled, prepared, mode);
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
const previewRows = (pool, bundle, scopeId, actorId) => run(pool, bundle, scopeId, actorId, 'preview');
const stageRows = (pool, bundle, scopeId, actorId, { dryRun = true } = {}) => run(pool, bundle, scopeId, actorId, dryRun ? 'dry-run' : 'apply');

async function verifyWorkbook(file, source) {
  check(path.basename(file) === source.fileName && createHash('sha256').update(await fs.readFile(file)).digest('hex') === source.sha256,
    'Исходный файл не соответствует проверенному снимку.');
}
async function main() {
  const args = process.argv.slice(2); let mode = 'preview', selected = false, directory = path.join(paths.root, '.local/recruitment-candidate-import'), scopeId, workbook;
  for (let i = 0; i < args.length; i++) {
    if (['--preview', '--dry-run', '--apply'].includes(args[i]) && !selected) { mode = args[i].slice(2); selected = true; }
    else if (['--directory', '--scope-id', '--workbook'].includes(args[i]) && args[i + 1]) {
      const key = args[i], value = args[++i];
      if (key === '--directory') directory = path.resolve(value); else if (key === '--scope-id') scopeId = uuid(value); else workbook = path.resolve(value);
    } else fail('Неверные параметры загрузки.');
  }
  check(scopeId && workbook, 'Укажите --scope-id UUID и --workbook PATH.');
  const [batch, archive, extra, policy, remainders, login, credentials] = await Promise.all([
    ...['batch.json', 'archive.json', 'extra-archive.json', 'duplicate-policy.json', 'main-remainders.json'].map(file => readJson(path.join(directory, file))),
    readJson(paths.login), readJson(paths.credentials)]);
  const bundle = { batch, archive, extra, policy, remainders }; compileRows(bundle);
  await verifyWorkbook(workbook, batch.source);
  check(login?.localOnly && login.userId, 'Локальный администратор не настроен.');
  const { Pool } = appRequire('pg');
  const pool = new Pool(connectionConfig(credentials, true));
  pool.on('error', () => process.stderr.write('Локальное соединение PostgreSQL недоступно.\n'));
  try {
    const result = mode === 'preview' ? await previewRows(pool, bundle, scopeId, login.userId) : await stageRows(pool, bundle, scopeId, login.userId, { dryRun: mode !== 'apply' });
    console.log(JSON.stringify(result, null, 2));
  } finally { await pool.end(); }
}
if (require.main === module) main().catch(() => { console.error('Загрузка исходных строк не выполнена. Проверьте приватный снимок и область доступа; данные сохранены.'); process.exitCode = 1; });
module.exports = { compileRows, previewRows, stageRows, verifyWorkbook };
