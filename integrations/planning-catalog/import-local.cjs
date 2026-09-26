'use strict';
// Read-only by default. Only a supplied local workspace is eligible for writes.
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { planningData } = require('../../recovered/apps/api/src/modules/planning/planning-catalog');

function csvRows(input) {
  if (Buffer.byteLength(input) > 20 * 1024 * 1024) throw new Error('CSV превышает 20 МиБ.');
  const rows = []; let row = [], cell = '', quoted = false, afterQuote = false;
  const source = input.replace(/^\uFEFF/, '');
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') { cell += '"'; i++; }
      else if (char === '"') { quoted = false; afterQuote = true; }
      else cell += char;
      continue;
    }
    if (char === '"' && !cell && !afterQuote) { quoted = true; continue; }
    if (char === ',' || char === '\n' || char === '\r') {
      row.push(cell); cell = ''; afterQuote = false;
      if (char !== ',') { rows.push(row); row = []; if (char === '\r' && source[i + 1] === '\n') i++; }
      continue;
    }
    if (afterQuote || char === '"') throw new Error('Некорректные кавычки в CSV.');
    cell += char;
  }
  if (quoted) throw new Error('Незакрытые кавычки в CSV.');
  if (cell || row.length || afterQuote) { row.push(cell); rows.push(row); }
  return rows;
}
function clean(value) {
  const result = String(value ?? '').trim();
  if (!result || result.length > 2000 || /^(?:#(?:REF!|N\/A|VALUE!|ERROR!|DIV\/0!)|[-—])$/i.test(result)) return '';
  return result;
}
function nameKey(value) { return clean(value).normalize('NFC').replace(/\s+/g, ' ').toLocaleLowerCase('ru'); }
function plateKey(value) {
  const letters = { А: 'A', В: 'B', Е: 'E', К: 'K', М: 'M', Н: 'H', О: 'O', Р: 'P', С: 'C', Т: 'T', У: 'Y', Х: 'X' };
  const key = clean(value).toUpperCase().replace(/[АВЕКМНОРСТУХ]/g, char => letters[char]).replace(/[\s-]/g, '');
  return /^[ABEKMHOPCTYX]\d{3}[ABEKMHOPCTYX]{2}\d{2,3}$/.test(key) ? key : '';
}
function isoDate(value) {
  const text = clean(value), match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(text);
  const date = match ? `${match[3]}-${match[2]}-${match[1]}` : text;
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date ? date : '';
}
function numeric(value) {
  const text = clean(value).replace(',', '.');
  return /^\d+(?:\.\d+)?$/.test(text) && Number.isFinite(Number(text)) ? text : '';
}
function payloadKg(value) {
  const match = /^(\d+(?:[.,]\d+)?)\s*(кг|kg|т|тн|тонн[аы]?|t)\.?$/i.exec(clean(value));
  if (!match) return '';
  return String(Number(match[1].replace(',', '.')) * (/^(?:кг|kg)$/i.test(match[2]) ? 1 : 1000));
}
function volumeM3(value) {
  const text = clean(value), number = numeric(text);
  if (number) return number;
  const match = /^(\d+(?:[.,]\d+)?)\s*(?:м[3³]|m3|к\/м3)$/i.exec(text);
  return match ? numeric(match[1]) : '';
}
function records(input, kind) {
  const rows = csvRows(input), headers = (rows.shift() || []).map(value => value.trim());
  const required = kind === 'driver' ? ['фио', 'Паспорт', 'Адрес проживания', 'Тел.Водителя'] : ['Гос номер', 'Марка', 'форм фактор', 'Грузоподъемность'];
  if (required.some(header => headers.filter(value => value === header).length !== 1)) throw new Error(`Не найдены уникальные заголовки справочника ${kind}.`);
  return rows.map((row, index) => {
    const at = header => clean(row[headers.indexOf(header)]);
    const key = kind === 'driver' ? nameKey(at('фио')) : plateKey(at('Гос номер'));
    let data;
    if (kind === 'driver') data = {
      driver_phone: at('Тел.Водителя'), driver_address: at('Адрес проживания'), driver_registration_address: at('Адрес Регистрации'),
      driver_passport: at('Паспорт'), driver_passport_full: at('Паспорт'), driver_birth_date: isoDate(at('Дата Рождения')),
      driver_license: at('Водительское удостоверение'), driver_license_full: at('Водительское удостоверение'), driver_inn: at('ИНН'), driver_snils: at('Снилс'),
    };
    else data = {
      vehicle_plate: at('Гос номер'), vehicle_brand: at('Марка'), vehicle_model: at('Марка'), vehicle_body_type: at('форм фактор'),
      pallet_capacity: numeric(at('Паллетность')), payload_capacity: at('Грузоподъемность'), payload_kg: payloadKg(at('Грузоподъемность')),
      volume_m3: volumeM3(at('Полезный объем')), vehicle_registration_certificate: at('СТС'),
      ownership_type: at('ТИП ТС / Свой _ Наём'), actual_carrier: at('Название ТК'), vehicle_condition_notes: at('Комментарий по ТС'),
    };
    return { key, label: kind === 'driver' ? at('фио').replace(/\s+/g, ' ') : at('Гос номер'), sourceRow: index + 2, data: planningData(data, kind) };
  }).filter(record => record.key && (kind !== 'driver' || record.key.split(' ').length >= 3));
}
function matchRecords(source, targets, kind) {
  const index = new Map(), targetIndex = new Map();
  for (const record of source) index.set(record.key, [...(index.get(record.key) || []), record]);
  for (const target of targets) {
    const key = kind === 'driver' ? nameKey(target.name) : plateKey(target.registration || target.label);
    if (key && !(targetIndex.get(key) || []).some(candidate => candidate.id === target.id)) targetIndex.set(key, [...(targetIndex.get(key) || []), target]);
  }
  const matched = []; let unmatched = 0, ambiguous = 0, contactConflicts = 0;
  for (const [key, group] of index) {
    const candidates = targetIndex.get(key) || [];
    if (group.length !== 1 || candidates.length > 1) { ambiguous += group.length; continue; }
    if (!candidates.length) { unmatched += group.length; continue; }
    const record = group[0], target = candidates[0];
    const digits = value => clean(value).replace(/\D/g, '').replace(/^8(?=\d{10}$)/, '7');
    if (kind === 'driver' && target.phone && record.data.driver_phone && digits(target.phone) !== digits(record.data.driver_phone)) { contactConflicts++; continue; }
    matched.push({ ...record, resourceId: target.id });
  }
  return { matched, summary: { sourceRows: source.length, matched: matched.length, unmatched, ambiguous, contactConflicts } };
}
function resourceId(scopeId, kind, key) {
  const bytes = createHash('sha256').update(`planning-file-catalog-v1:${scopeId.toLowerCase()}:${kind}:${key}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 15) | 0x50; bytes[8] = (bytes[8] & 63) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
async function importCatalog(pool, { scopeId, driversFile, vehiclesFile, apply = false, standalone = false, createScope = false, adminId, baseScopeId }) {
  if (createScope) {
    if (!standalone || scopeId || !adminId || !baseScopeId) throw new Error('Новая область требует --standalone и локального администратора; --scope не используется.');
    scopeId = resourceId(adminId, 'scope', 'driver-vehicle-file-catalog');
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(scopeId || '')) throw new Error('Укажите UUID области планирования.');
  scopeId = scopeId.toLowerCase();
  if (!driversFile && !vehiclesFile) throw new Error('Укажите исходный CSV водителей или автомобилей.');
  const files = [];
  for (const [kind, filename] of [['driver', driversFile], ['vehicle', vehiclesFile]]) if (filename) {
    const buffer = await fs.readFile(filename);
    const source = buffer.toString('utf8'), parsed = csvRows(source), nameColumn = parsed[0]?.findIndex(value => value.trim() === (kind === 'driver' ? 'фио' : 'Гос номер'));
    const populatedRows = parsed.slice(1).filter(row => clean(row[nameColumn])).length;
    files.push({ kind, name: path.basename(filename), hash: createHash('sha256').update(buffer).digest('hex'), rows: records(source, kind), populatedRows });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let base;
    if (createScope) {
      await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [adminId]);
      base = (await client.query(`SELECT g.legal_entity_id,g.region_id FROM users u JOIN access_grants g ON g.user_id=u.id
        WHERE u.id=$1 AND u.role='access_admin' AND u.active AND u.approved AND g.responsibility_scope_id=$2 AND g.personal_data_visible`, [adminId, baseScopeId])).rows[0];
      if (!base) throw new Error('У локального администратора нет доступа к исходной области.');
    }
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,917042060))', [scopeId]);
    if (createScope) {
      const projectId = resourceId(adminId, 'project', 'driver-vehicle-file-catalog');
      await client.query('INSERT INTO projects(id,name,legal_entity_id,region_id) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',
        [projectId, 'Планирование · справочник из файла', base.legal_entity_id, base.region_id]);
      await client.query('INSERT INTO responsibility_scopes(id,project_id,name) VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [scopeId, projectId, 'Водители и транспорт']);
      await client.query(`INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id,personal_data_visible)
        VALUES($1,$2,$3,$4,$5,true) ON CONFLICT DO NOTHING`, [adminId, base.legal_entity_id, base.region_id, projectId, scopeId]);
    }
    const scope = (await client.query(`SELECT p.legal_entity_id,p.region_id,p.id AS project_id,rs.id AS responsibility_scope_id
      FROM responsibility_scopes rs JOIN projects p ON p.id=rs.project_id WHERE rs.id=$1`, [scopeId])).rows[0];
    if (!scope) throw new Error('Область планирования не найдена.');
    const params = [scope.legal_entity_id, scope.region_id, scope.project_id, scope.responsibility_scope_id];
    const summary = { mode: apply ? 'apply' : 'preview', standalone, scopeId, written: 0 };
    for (const file of files) {
      const targets = file.kind === 'driver'
        ? (await client.query(`SELECT u.id,u.display_name AS name,p.phone FROM users u JOIN access_grants g ON g.user_id=u.id
          LEFT JOIN user_profiles p ON p.user_id=u.id WHERE u.role='driver' AND u.active AND u.approved
          AND g.legal_entity_id=$1 AND g.region_id=$2 AND g.project_id=$3 AND g.responsibility_scope_id=$4`, params)).rows
        : (await client.query(`SELECT DISTINCT v.id,v.label,'' AS registration FROM vehicles v JOIN trips t ON t.vehicle_id=v.id
          WHERE t.legal_entity_id=$1 AND t.region_id=$2 AND t.project_id=$3 AND t.responsibility_scope_id=$4
          UNION SELECT r.local_id AS id,r.label,r.registration FROM planning_one_c_resources r WHERE r.responsibility_scope_id=$4 AND r.kind='vehicle' AND r.active`, params)).rows;
      const independentTargets = standalone ? file.rows.map(record => ({ id: resourceId(scopeId, file.kind, record.key), name: record.label, label: record.label })) : targets;
      const result = matchRecords(file.rows, independentTargets, file.kind);
      summary[file.kind] = { populatedRows: file.populatedRows, skippedInvalidKeys: file.populatedRows - file.rows.length, ...result.summary };
      if (apply) for (const record of result.matched) {
        if (standalone) await client.query(`INSERT INTO planning_imported_resources(id,legal_entity_id,region_id,project_id,responsibility_scope_id,kind,label)
          VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO UPDATE SET label=excluded.label
          WHERE planning_imported_resources.responsibility_scope_id=excluded.responsibility_scope_id AND planning_imported_resources.kind=excluded.kind`,
        [record.resourceId, ...params, file.kind, record.label]);
        const inserted = await client.query(`INSERT INTO planning_resource_data(legal_entity_id,region_id,project_id,responsibility_scope_id,kind,resource_id,data,source_sha256,source_name,source_row)
          VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10) ON CONFLICT(responsibility_scope_id,kind,resource_id)
          DO UPDATE SET data=excluded.data,source_sha256=excluded.source_sha256,source_name=excluded.source_name,source_row=excluded.source_row,imported_at=clock_timestamp()
          WHERE planning_resource_data.data IS DISTINCT FROM excluded.data OR planning_resource_data.source_sha256<>excluded.source_sha256
          OR planning_resource_data.source_row<>excluded.source_row OR planning_resource_data.source_name<>excluded.source_name`,
        [...params, file.kind, record.resourceId, JSON.stringify(record.data), file.hash, file.name, record.sourceRow]);
        summary.written += inserted.rowCount;
      }
    }
    await client.query(apply ? 'COMMIT' : 'ROLLBACK');
    return summary;
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}
if (require.main === module) (async () => {
  const args = process.argv.slice(2), options = { apply: false };
  const flags = { '--scope': 'scopeId', '--drivers': 'driversFile', '--vehicles': 'vehiclesFile' };
  while (args.length) {
    const flag = args.shift();
    if (flag === '--apply') options.apply = true;
    else if (flag === '--standalone') options.standalone = true;
    else if (flag === '--create-scope') options.createScope = true;
    else if (flags[flag] && args[0] && !args[0].startsWith('--')) options[flags[flag]] = args.shift();
    else throw new Error('Допустимые параметры: --scope UUID или --create-scope; --drivers CSV --vehicles CSV [--standalone] [--apply].');
  }
  if (options.createScope) {
    const { ids } = require('../../recovered/scripts/seed.cjs');
    options.adminId = ids.admin; options.baseScopeId = ids.scope;
  }
  const { openAdminPool } = require('../local-app/runtime.cjs'), pool = await openAdminPool();
  try { console.log(JSON.stringify(await importCatalog(pool, options), null, 2)); } finally { await pool.end(); }
})().catch(error => { console.error(error.code ? `Импорт не выполнен (${error.code}).` : error.message); process.exitCode = 1; });
module.exports = { csvRows, nameKey, plateKey, isoDate, payloadKg, volumeM3, records, matchRecords, resourceId, importCatalog };
