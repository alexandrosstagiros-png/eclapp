'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, createHash } = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createTestServer } = require('./local-test-server.cjs');
const { compileRows, previewRows, stageRows, verifyWorkbook } = require('../integrations/recruitment-candidates-import/stage-local.cjs');
const { importPlan, stableId } = require('../integrations/recruitment-candidates-import/import-local.cjs');

const cell = value => ({ value, cached: value, dataType: 's', format: 'General', xml: null });
function bundle() {
  const source = { documentId: 'synthetic-staging', sha256: 'a'.repeat(64), fileName: 'Synthetic.xlsx', asOf: '2026-09-24', timeZone: 'Europe/Moscow' };
  const headers = { A1: cell('Дата'), B1: cell('ФИО кандидата'), C1: cell('Город'), D1: cell('Телефон'), E1: cell('Источник'), F1: cell('Рекрутер'), G1: cell('Локация'), H1: cell('Комментарий') };
  const record = number => ({ sourceKey: `Свои авто:${number}`, sheet: 'Свои авто', row: number,
    proposed: { fullName: number === 3 ? 'Synthetic 100%_ name' : 'Another synthetic person', phone: `+79995550${number.toString().padStart(3, '0')}`, city: 'Москва', source: 'avito', occurredAt: null },
    labels: { recruiter: number === 3 ? 'Source recruiter A' : 'Source recruiter B', source: 'Авито', location: 'Original location' }, issues: ['unverified_inquiry_date'],
    raw: { [`B${number}`]: cell(number === 3 ? 'Synthetic 100%_ name' : 'Another synthetic person'), [`H${number}`]: cell('<img src=x onerror="PRIVATE_RAW">'),
      [`I${number}`]: { value: '=HYPERLINK("https://invalid.example", "inert")', cached: 'SAVED_CACHE', dataType: 'f', xml: { formula: 'HYPERLINK(...)', value: 'SAVED_CACHE' } },
      [`J${number}`]: { value: { formulaType: 'array', text: '=SUM(A1:A9)', ref: 'J3:J9' }, cached: 17, dataType: 'f' } } });
  return { batch: { schemaVersion: 1, source, records: [record(3), record(4)], excludedTests: ['Свои авто:2'] },
    archive: { schemaVersion: 1, source, sheets: { 'Неликвид': { headers, rows: [{ row: 7, raw: { B7: cell('Old archived person') } }], disposition: 'archive_only' } } },
    extra: { schemaVersion: 1, source, headers: { 'Свои авто': headers, 'Неликвид': headers, 'Проекты': { A1: cell('Проект') } },
      sheets: { 'Проекты': { headers: { A1: cell('Проект') }, rows: [{ row: 1, raw: { A1: cell('Проект') } }], disposition: 'archive_only' } },
      excludedTests: [{ sheet: 'Свои авто', row: 2, raw: { B2: cell('EXAMPLE_NEVER_CANONICAL') } }] },
    policy: { schemaVersion: 1, documentId: source.documentId, sourceSha256: source.sha256, records: { 'Свои авто:4': { issues: ['phone_name_conflict_requires_review'] } } },
    remainders: { schemaVersion: 1, source, records: [{ sheet: 'Свои авто', row: 8, raw: { H8: cell('Original comment without a candidate'), K8: cell(false) } }] } };
}
function decisions(ids) {
  return { schemaVersion: 1, documentId: 'synthetic-staging', sourceSha256: 'a'.repeat(64),
    targets: { 'Свои авто': { responsibilityScopeId: ids.scope, kind: 'driver' } }, recruiters: { 'Source recruiter A': ids.admin }, sources: { 'Авито': 'avito' },
    records: { 'Свои авто:3': { action: 'import', candidate: { mode: 'new' }, disposition: 'archive', demand: 'none', acknowledgedIssues: ['unverified_inquiry_date'] } } };
}
test('staging compiles complete immutable source rows and keeps formulas inert', () => {
  const source = bundle(), result = compileRows(source);
  assert.equal(result.rows.length, 6); assert.equal(result.rows.filter(row => row.main).length, 2);
  const first = result.rows[0];
  assert.equal(first.fields.find(field => field.column === 'B3').label, 'ФИО кандидата');
  assert.equal(first.fields.find(field => field.column === 'I3').value, 'SAVED_CACHE');
  assert.ok(first.fields.find(field => field.column === 'I3').formula.startsWith('=HYPERLINK'));
  assert.deepEqual(first.fields.find(field => field.column === 'J3').formula, source.batch.records[0].raw.J3.value);
  assert.deepEqual(first.rawData.record.raw, source.batch.records[0].raw);
  assert.ok(result.rows[1].issues.includes('phone_name_conflict_requires_review'));
  assert.equal(result.rows.find(row => row.sourceKey === 'Свои авто:2').main, false);
  assert.ok(result.rows.find(row => row.sourceKey === 'Свои авто:2').issues.includes('excluded_example'));
  const remaining = result.rows.find(row => row.sourceKey === 'Свои авто:8');
  assert.equal(remaining.main, false); assert.ok(remaining.issues.includes('source_row_without_candidate'));
  assert.equal(remaining.fields.find(field => field.column === 'K8').value, false);
});
test('staging rejects mismatched snapshots, malformed cells, omitted examples and oversized input', () => {
  let source = structuredClone(bundle()); source.extra.source.sha256 = 'b'.repeat(64);
  // structuredClone retains shared references; replace metadata instead.
  source = bundle(); source.extra = { ...source.extra, source: { ...source.extra.source, sha256: 'b'.repeat(64) } };
  assert.throws(() => compileRows(source), /снимку/);
  source = bundle(); source.policy.sourceSha256 = 'b'.repeat(64); assert.throws(() => compileRows(source), /снимку/);
  source = bundle(); source.batch.records.push(source.batch.records[0]); assert.throws(() => compileRows(source), /повторная/);
  source = bundle(); source.batch.records[0].raw.Q4 = cell('wrong address'); assert.throws(() => compileRows(source), /адрес/);
  source = bundle(); source.extra.excludedTests = []; assert.throws(() => compileRows(source), /примеры/);
  source = bundle(); source.batch.records[0].raw.H3 = cell('x'.repeat(250001)); assert.throws(() => compileRows(source), /размер/);
  source = bundle(); source.batch.records[0].raw.H3 = cell('\0'); assert.throws(() => compileRows(source), /данные/);
  source = bundle(); source.batch.records = Array(50001).fill(source.batch.records[0]); assert.throws(() => compileRows(source), /много/);
  source = bundle(); source.policy.records.UNKNOWN = { issues: [] }; assert.throws(() => compileRows(source), /вне/);
  source = bundle(); source.remainders.records.push(source.batch.records[0]); assert.throws(() => compileRows(source), /повторная/);
  source = bundle(); delete source.remainders; assert.throws(() => compileRows(source), /остальных/);
});
test('the CLI source check rejects changed bytes and filenames', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'source-check-')); t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'Synthetic.xlsx'), bytes = Buffer.from('synthetic workbook bytes');
  const source = { fileName: 'Synthetic.xlsx', sha256: createHash('sha256').update(bytes).digest('hex') };
  await fs.writeFile(file, bytes); await verifyWorkbook(file, source);
  await assert.rejects(verifyWorkbook(file, { ...source, fileName: 'Other.xlsx' }), /снимку/);
  await fs.appendFile(file, 'changed'); await assert.rejects(verifyWorkbook(file, source), /снимку/);
});

test('source staging and staff-only API use disposable PostgreSQL', { timeout: 180000 }, async t => {
  const fixture = await createTestServer(); t.after(() => fixture.close());
  const { ids, adminPool: db, request, devLogin } = fixture, source = bundle();
  const tuple = [ids.legal, ids.region, ids.project, ids.scope];
  await db.query('UPDATE access_grants SET personal_data_visible=true WHERE user_id=$1', [ids.admin]);
  const admin = await devLogin(ids.admin);
  const get = (query = '', token = admin.accessToken, scopeId = ids.scope) => request('GET', `/recruitment/import-rows?responsibilityScopeId=${scopeId}${query}`, undefined, token);
  const detail = (id, token = admin.accessToken, scopeId = ids.scope) => request('GET', `/recruitment/import-row?responsibilityScopeId=${scopeId}&id=${id}`, undefined, token);
  const count = async table => Number((await db.query(`SELECT count(*) AS count FROM ${table}`)).rows[0].count);
  const beforeCanonical = { candidates: await count('recruitment_candidates'), contacts: await count('recruitment_contacts') };
  await importPlan(db, source.batch, decisions(ids), ids.admin, { dryRun: false });
  const baseAudit = await count('audit_events');
  const canonicalId = stableId('synthetic-staging:candidate:Свои авто:3');

  await t.test('preview is read-only; dry-run rolls back rows and audit, retaining canonical state', async () => {
    const preview = await previewRows(db, source, ids.scope, ids.admin);
    assert.equal(preview.mode, 'preview'); assert.equal(preview.ready, 6); assert.equal(preview.imported, 1); assert.equal(preview.review, 1); assert.equal(preview.archive, 4);
    const dry = await stageRows(db, source, ids.scope, ids.admin);
    assert.equal(dry.created, 6); assert.equal(dry.mode, 'dry-run');
    assert.equal(await count('recruitment_import_rows'), 0); assert.equal(await count('audit_events'), baseAudit);
    assert.equal(await count('recruitment_candidates'), beforeCanonical.candidates + 1); assert.equal(await count('recruitment_contacts'), beforeCanonical.contacts + 1);
  });
  await t.test('apply preserves original fields and links only proven canonical rows; exact replay has zero writes', async () => {
    const applied = await stageRows(db, source, ids.scope, ids.admin, { dryRun: false }); assert.equal(applied.created, 6);
    const records = (await db.query('SELECT * FROM recruitment_import_rows ORDER BY source_key')).rows;
    assert.equal(records.find(row => row.source_key === 'Свои авто:3').candidate_id, canonicalId);
    assert.equal(records.filter(row => row.candidate_id !== null).length, 1);
    assert.equal(records.find(row => row.source_key === 'Свои авто:2').status, 'archive');
    assert.equal(records.find(row => row.source_key === 'Свои авто:8').status, 'archive');
    assert.equal(records.find(row => row.source_key === 'Свои авто:8').candidate_id, null);
    assert.deepEqual(records.find(row => row.source_key === 'Свои авто:3').raw_data.record.raw, source.batch.records[0].raw);
    const replay = await stageRows(db, source, ids.scope, ids.admin, { dryRun: false });
    assert.equal(replay.created, 0); assert.equal(replay.replay, 6);
    assert.deepEqual((await db.query('SELECT * FROM recruitment_import_rows ORDER BY source_key')).rows, records);
    assert.equal(await count('audit_events'), baseAudit + 1);
    const audit = (await db.query("SELECT payload::text AS value FROM audit_events WHERE payload->>'action'='recruitment.source_rows_imported'")).rows[0].value;
    assert.ok(!audit.includes('PRIVATE_RAW')); assert.ok(!audit.includes('Synthetic 100')); assert.ok(!audit.includes('SAVED_CACHE'));
  });
  await t.test('changed source, content, issues and canonical link fail the whole batch without writes', async () => {
    const before = (await db.query('SELECT * FROM recruitment_import_rows ORDER BY source_key')).rows;
    const changed = bundle(); changed.batch.records[1].raw.H4.cached = 'altered';
    await assert.rejects(stageRows(db, changed, ids.scope, ids.admin, { dryRun: false }), /Конфликт/);
    const changedIssues = bundle(); changedIssues.policy.records['Свои авто:4'].issues.push('cross_sheet_phone_requires_review');
    await assert.rejects(stageRows(db, changedIssues, ids.scope, ids.admin, { dryRun: false }), /Конфликт/);
    const changedSnapshot = bundle(); changedSnapshot.batch.source.sha256 = 'b'.repeat(64); changedSnapshot.policy.sourceSha256 = 'b'.repeat(64);
    await assert.rejects(stageRows(db, changedSnapshot, ids.scope, ids.admin, { dryRun: false }), /другого снимка/);
    const omitted = bundle(); omitted.archive.sheets['Неликвид'].rows = [];
    await assert.rejects(stageRows(db, omitted, ids.scope, ids.admin, { dryRun: false }), /ранее/);
    await db.query("UPDATE recruitment_import_rows SET status='review',candidate_id=NULL WHERE source_key='Свои авто:3'");
    await assert.rejects(stageRows(db, source, ids.scope, ids.admin, { dryRun: false }), /Конфликт/);
    await db.query("UPDATE recruitment_import_rows SET status='imported',candidate_id=$1 WHERE source_key='Свои авто:3'", [canonicalId]);
    assert.deepEqual((await db.query('SELECT * FROM recruitment_import_rows ORDER BY source_key')).rows, before);
    assert.equal(await count('audit_events'), baseAudit + 1);
  });
  let visibleId;
  await t.test('API paginates and counts filtered results, searches literal wildcards, and omits raw payloads', async () => {
    const first = await get('&pageSize=2'); assert.equal(first.status, 200); assert.equal(first.body.total, 6);
    assert.deepEqual(first.body.counts, { all: 6, imported: 1, review: 1, archive: 4 }); assert.equal(first.body.items.length, 2);
    const second = await get('&page=2&pageSize=2'); assert.equal(second.body.items.length, 2);
    assert.equal(new Set([...first.body.items, ...second.body.items].map(row => row.id)).size, 4);
    const third = await get('&page=3&pageSize=2'); assert.equal(third.body.items.length, 2);
    const result = await get('&search=' + encodeURIComponent('%_')); assert.equal(result.status, 200); assert.equal(result.body.total, 1);
    visibleId = result.body.items[0].id;
    const filtered = await get('&status=review&sheet=' + encodeURIComponent('Свои авто') + '&recruiter=' + encodeURIComponent('Source recruiter B'));
    assert.equal(filtered.body.total, 1); assert.equal(filtered.body.counts.all, 1); assert.equal(filtered.body.items[0].sourceKey, 'Свои авто:4');
    for (const item of [...first.body.items, ...second.body.items, ...third.body.items]) {
      assert.ok(!Object.hasOwn(item, 'fields')); assert.ok(!Object.hasOwn(item, 'raw_data')); assert.ok(!Object.hasOwn(item, 'rawData'));
    }
    const opened = await detail(visibleId); assert.equal(opened.status, 200); assert.equal(opened.body.fileName, 'Synthetic.xlsx');
    assert.ok(opened.body.fields.some(field => field.value === 'SAVED_CACHE')); assert.ok(!Object.hasOwn(opened.body, 'raw_data'));
    assert.ok(!JSON.stringify(opened.body).includes('rawData'));
    assert.equal((await get('&pageSize=101')).status, 400); assert.equal((await get('&status=unknown')).status, 400);
    assert.equal((await get('&page=0')).status, 400); assert.equal((await get('', admin.accessToken, 'bad-id')).status, 400);
  });
  async function employee(role, scopeId = ids.scope, pii = true) {
    const id = randomUUID(); await db.query('INSERT INTO users(id,display_name,role,active,approved) VALUES($1,$2,$3,true,true)', [id, 'Synthetic employee', role]);
    await db.query('INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id,personal_data_visible) SELECT $1,p.legal_entity_id,p.region_id,p.id,s.id,$3 FROM responsibility_scopes s JOIN projects p ON p.id=s.project_id WHERE s.id=$2', [id, scopeId, pii]);
    return { id, ...(await devLogin(id)) };
  }
  await t.test('only current authorized staff see source rows; external allowlist never grants source access', async () => {
    const peer = randomUUID(), foreignLegal = randomUUID(), foreignProject = randomUUID();
    await db.query('INSERT INTO legal_entities VALUES($1,$2)', [foreignLegal, 'Other source company']);
    await db.query('INSERT INTO projects VALUES($1,$2,$3,$4)', [foreignProject, 'Other source project', foreignLegal, ids.region]);
    await db.query('INSERT INTO responsibility_scopes VALUES($1,$2,$3)', [peer, foreignProject, 'Foreign source scope']);
    const outsider = await employee('recruiter', peer), noPII = await employee('manager', ids.scope, false);
    for (const person of [outsider, noPII]) {
      assert.equal((await get('', person.accessToken)).status, 403); assert.equal((await detail(visibleId, person.accessToken)).status, 403);
    }
    for (const role of ['dispatcher', 'manager', 'recruiter']) {
      const staff = await employee(role); assert.equal((await get('', staff.accessToken)).status, 200);
      await db.query('UPDATE access_grants SET personal_data_visible=false WHERE user_id=$1', [staff.id]);
      assert.equal((await get('', staff.accessToken)).status, 403); assert.equal((await detail(visibleId, staff.accessToken)).status, 403);
    }
    assert.equal((await detail(visibleId, outsider.accessToken, peer)).status, 400);
    assert.equal((await get('', outsider.accessToken, peer)).body.total, 0);
    const external = await employee('external_recruiter');
    const demand = await request('PUT', '/recruitment/requests', { id: randomUUID(), responsibilityScopeId: ids.scope, version: 0, title: 'Synthetic allowed need', city: 'Москва', kind: 'driver', quantity: 1, priority: 'normal', status: 'open', recruiterId: ids.admin }, admin.accessToken);
    assert.equal(demand.status, 200);
    const allow = await request('PUT', '/recruitment/access', { responsibilityScopeId: ids.scope, userId: external.id, requestIds: [demand.body.id], status: 'active', expiresAt: null, version: 0 }, admin.accessToken);
    assert.equal(allow.status, 200);
    assert.equal((await get('', external.accessToken)).status, 403); assert.equal((await detail(visibleId, external.accessToken)).status, 403);
    assert.equal((await get('', (await devLogin(ids.drivers[0])).accessToken)).status, 403);
  });
  await t.test('loader enforces admin and current scoped PII; runtime SQL role is read-only', async () => {
    await assert.rejects(previewRows(db, source, ids.scope, ids.drivers[0]), /администратор/);
    await assert.rejects(previewRows(db, source, randomUUID(), ids.admin), /недоступна/);
    await db.query('UPDATE access_grants SET personal_data_visible=false WHERE user_id=$1', [ids.admin]);
    await assert.rejects(stageRows(db, source, ids.scope, ids.admin, { dryRun: false }), /персональные/);
    assert.equal((await get()).status, 403);
    await db.query('UPDATE access_grants SET personal_data_visible=true WHERE user_id=$1', [ids.admin]);
    const privileges = (await db.query("SELECT has_table_privilege('transport_app','recruitment_import_rows','SELECT') AS readable,has_table_privilege('transport_app','recruitment_import_rows','UPDATE') AS writable")).rows[0];
    assert.equal(privileges.readable, true); assert.equal(privileges.writable, false);
    const client = await db.connect();
    try { await client.query('BEGIN'); await client.query('SET LOCAL ROLE transport_app'); await assert.rejects(client.query("UPDATE recruitment_import_rows SET status='archive' WHERE false"), error => error.code === '42501'); }
    finally { await client.query('ROLLBACK'); client.release(); }
  });
});
