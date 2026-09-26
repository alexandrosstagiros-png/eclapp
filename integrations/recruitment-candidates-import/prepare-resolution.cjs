'use strict';
// Offline policy preparation. This module never opens a database connection.
const fs = require('node:fs/promises');
const path = require('node:path');
const { compilePlan } = require('./import-local.cjs');
const { atomicJson, readJson } = require('../local-app/runtime.cjs');

const normalize = value => String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('ru');
const SOURCE_ALIASES = new Map([
  ['avito', ['авито', 'avito']], ['ati', ['ати', 'ati', 'ati.su']],
  ['hh', ['hh', 'hh.ru', 'хх', 'хх.ру']],
  ['referral', ['от водителя', 'рекомендация', 'рекомендации', 'по рекомендации', 'приведи друга']],
  ['telegram', ['телеграм', 'telegram', 'тг', 'tg']],
  ['whatsapp', ['whatsapp', 'ватсап', 'вотсап']],
  ['vehicle_sticker', ['наклейка', 'наклейка на авто', 'наклейка на машине', 'реклама на машине']],
  ['rabota_ru', ['работа.ру', 'rabota.ru']], ['superjob', ['superjob', 'superjob.ru', 'суперджоб']],
  ['joblab', ['joblab', 'joblab.ru', 'джоблаб']], ['profi', ['profi', 'profi.ru', 'профи', 'профи.ру']],
].flatMap(([code, aliases]) => aliases.map(alias => [alias, code])));

function legacyValue(record, column) {
  const cell = record.raw[`${column}${record.row}`];
  if (!cell) return '';
  const value = cell.cached ?? (cell.dataType === 'f' ? null : cell.value);
  // Cached text and numbers are data. Never evaluate or execute a formula.
  if (value == null || typeof value === 'object') return '';
  return String(value).trim();
}
function makeNotes(record, fileName) {
  const own = record.sheet === 'Свои авто';
  const reason = legacyValue(record, own ? 'O' : 'Q');
  const comment = legacyValue(record, own ? 'P' : 'R');
  const parts = [
    `Архив импорта: ${fileName}. Лист «${record.sheet}», строка ${record.row}.`,
    'Администратор назначен техническим владельцем импорта. Это не назначение исходного рекрутера.',
    `Исходный рекрутер: ${record.labels.recruiter || 'не указан в исходнике'}.`,
    `Источник: ${record.labels.source || 'не указан в исходнике'}.`,
    `Локация: ${record.labels.location || 'не указана в исходнике'}.`,
    'Исторические флажки и даты требуют сверки; текущий статус кандидата не подтверждён.',
    ...(reason ? [`Причина отказа в исходнике: ${reason}`] : []),
    ...(comment ? [`Комментарий в исходнике: ${comment}`] : []),
  ];
  const rawText = parts.join('\n');
  const cleanText = rawText.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '\ufffd');
  const suffix = '\n[Текст сокращён. Полный источник сохранён в архиве импорта.]';
  const truncated = cleanText.length > 4000;
  return { text: truncated ? cleanText.slice(0, 4000 - suffix.length) + suffix : cleanText,
    truncated, controlCharactersReplaced: rawText !== cleanText };
}

function prepareResolution(batch, { scopeId, technicalOwnerId, ownKind = 'driver', hiredKind = 'carrier', directionStatus = 'assumed' }) {
  const groups = new Map();
  for (const row of batch.records) {
    if (!row.proposed.phone) continue;
    if (!groups.has(row.proposed.phone)) groups.set(row.proposed.phone, []);
    groups.get(row.proposed.phone).push(row);
  }
  const crossPhones = new Set(), conflictPhones = new Set(), sameNameRepeatKeys = new Set();
  for (const [phone, group] of groups) {
    if (new Set(group.map(row => row.sheet)).size > 1) crossPhones.add(phone);
    for (const sheet of ['Свои авто', 'Наемные авто']) {
      const within = group.filter(row => row.sheet === sheet);
      if (within.length < 2) continue;
      if (new Set(within.map(row => normalize(row.proposed.fullName))).size > 1) conflictPhones.add(phone);
      else within.forEach(row => sameNameRepeatKeys.add(row.sourceKey));
    }
  }
  const resolution = { schemaVersion: 1, sourceSha256: batch.source.sha256, documentId: batch.source.documentId,
    recruiters: Object.fromEntries([...new Set(batch.records.map(row => row.labels.recruiter))].map(label => [label, technicalOwnerId])),
    targets: { 'Свои авто': { responsibilityScopeId: scopeId, kind: ownKind }, 'Наемные авто': { responsibilityScopeId: scopeId, kind: hiredKind } },
    sources: Object.fromEntries([...new Set(batch.records.map(row => row.labels.source))].map(label => [label, SOURCE_ALIASES.get(normalize(label)) || 'other'])),
    demands: {}, records: {} };
  const flags = {}, firstByIdentity = new Map(), bySheet = {};
  const policy = { schemaVersion: 1, sourceSha256: batch.source.sha256, documentId: batch.source.documentId,
    scopeId, technicalOwnerId, ownership: 'technical_import_only', originalRecruiterPreservedIn: ['contact.notes', 'candidate.notes', 'source_data.record.labels.recruiter'],
    directions: { status: directionStatus, 'Свои авто': ownKind, 'Наемные авто': hiredKind,
      explanation: directionStatus === 'assumed' ? 'Соответствие направлений предварительное, ожидает уточнения пользователя. Карта не применена.' : 'Соответствие направлений подтверждено пользователем.' },
    demand: 'none', disposition: 'archive', datePolicy: 'unverified_dates_remain_null', statusPolicy: 'legacy_flags_are_not_operational_statuses',
    duplicatePolicy: 'exclude_all_cross_sheet_phones_and_all_name_conflict_phone_groups; merge_equal_normalized_name_and_phone_within_one_sheet',
    counts: { total: batch.records.length, selectedRows: 0, newCandidateIdentities: 0, repeatInquiries: 0, mandatoryFieldRows: 0,
      eligibleRows: 0, eligibleWithheldRows: 0, crossSheetPhoneGroups: crossPhones.size, selectedOtherSourceRows: 0,
      truncatedNoteRows: 0, sanitizedNoteRows: 0 }, bySheet, selectedSourceKeys: [], withheldSourceKeys: [], problems: [] };
  for (const row of batch.records) {
    const issues = [];
    if (crossPhones.has(row.proposed.phone)) issues.push('cross_sheet_phone_requires_review');
    if (conflictPhones.has(row.proposed.phone)) issues.push('phone_name_conflict_requires_review');
    if (sameNameRepeatKeys.has(row.sourceKey)) issues.push('repeat_inquiry_same_name_phone');
    if (issues.length) flags[row.sourceKey] = issues;
    const mandatory = row.issues.some(issue => issue.startsWith('invalid_'));
    if (mandatory) policy.counts.mandatoryFieldRows++;
    else policy.counts.eligibleRows++;
    const withheld = mandatory || crossPhones.has(row.proposed.phone) || conflictPhones.has(row.proposed.phone);
    if (withheld) {
      if (!mandatory) policy.counts.eligibleWithheldRows++;
      policy.withheldSourceKeys.push(row.sourceKey);
      continue;
    }
    const identity = `${row.sheet}:${row.proposed.phone}:${normalize(row.proposed.fullName)}`;
    const first = firstByIdentity.get(identity);
    const notes = makeNotes(row, batch.source.fileName);
    const candidate = first ? { mode: 'record', sourceKey: first } : { mode: 'new' };
    if (!first) firstByIdentity.set(identity, row.sourceKey);
    resolution.records[row.sourceKey] = { action: 'import', candidate, disposition: 'archive', demand: 'none',
      acknowledgedIssues: [...row.issues], notes: notes.text, technicalOwner: true };
    policy.counts.selectedRows++;
    policy.counts[first ? 'repeatInquiries' : 'newCandidateIdentities']++;
    if (resolution.sources[row.labels.source] === 'other') policy.counts.selectedOtherSourceRows++;
    if (notes.truncated) policy.counts.truncatedNoteRows++;
    if (notes.controlCharactersReplaced) policy.counts.sanitizedNoteRows++;
    if (!bySheet[row.sheet]) bySheet[row.sheet] = { rows: 0, newCandidates: 0, repeatInquiries: 0 };
    bySheet[row.sheet].rows++;
    bySheet[row.sheet][first ? 'repeatInquiries' : 'newCandidates']++;
    policy.selectedSourceKeys.push(row.sourceKey);
  }
  const compiled = compilePlan(batch, resolution);
  policy.problems = compiled.problems;
  return { resolution, policy, duplicateIssues: { schemaVersion: 1, documentId: batch.source.documentId, sourceSha256: batch.source.sha256,
    records: Object.fromEntries(Object.entries(flags).map(([sourceKey, issues]) => [sourceKey, { issues }])) } };
}

async function main() {
  const options = {};
  const names = { '--directory': 'directory', '--scope': 'scopeId', '--technical-owner': 'technicalOwnerId',
    '--own-kind': 'ownKind', '--hired-kind': 'hiredKind', '--direction-status': 'directionStatus' };
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (!names[args[i]] || !args[i + 1]) throw new Error('Укажите directory, scope и technical-owner.');
    options[names[args[i]]] = args[++i];
  }
  if (!options.directory || !options.scopeId || !options.technicalOwnerId || !['assumed', 'confirmed'].includes(options.directionStatus || 'assumed')) throw new Error('Неверные параметры политики.');
  const directory = path.resolve(options.directory);
  const batch = await readJson(path.join(directory, 'batch.json'));
  const result = prepareResolution(batch, options);
  if (result.policy.problems.length) throw new Error('Карта решений содержит ошибки. Файлы не заменены.');
  const old = await readJson(path.join(directory, 'resolution.json'));
  if (old) await atomicJson(path.join(directory, `resolution.backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`), old);
  await atomicJson(path.join(directory, 'resolution.json'), result.resolution);
  await atomicJson(path.join(directory, 'policy.json'), result.policy);
  await atomicJson(path.join(directory, 'duplicate-policy.json'), result.duplicateIssues);
  await fs.chmod(directory, 0o700);
  console.log(JSON.stringify({ directionStatus: result.policy.directions.status, counts: result.policy.counts, bySheet: result.policy.bySheet, problemCount: result.policy.problems.length, databaseModified: false }, null, 2));
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { prepareResolution, makeNotes, normalize };
