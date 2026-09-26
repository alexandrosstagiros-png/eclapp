'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createTestServer } = require('./local-test-server.cjs');
const { compilePlan, previewPlan, importPlan, stableId } = require('../integrations/recruitment-candidates-import/import-local.cjs');
const { prepareResolution } = require('../integrations/recruitment-candidates-import/prepare-resolution.cjs');

const row = (number, phone = '+79995550101', patch = {}) => ({ sourceKey: `Свои авто:${number}`, sheet: 'Свои авто', row: number,
  proposed: { fullName: 'Synthetic private candidate', phone, city: 'Москва', source: 'avito', occurredAt: null },
  labels: { recruiter: 'Synthetic recruiter', source: 'Авито', location: 'Synthetic demand' },
  issues: ['unverified_inquiry_date'], raw: { B3: { value: 'PRIVATE_SOURCE_ANNOTATION', cached: 'PRIVATE_SOURCE_ANNOTATION', dataType: 's' } }, ...patch });
const batch = records => ({ schemaVersion: 1, source: { documentId: 'synthetic-candidates', fileName: 'Synthetic.xlsx', sha256: 'a'.repeat(64), asOf: '2026-09-24', timeZone: 'Europe/Moscow' }, records });
const decision = (patch = {}) => ({ action: 'import', candidate: { mode: 'new' }, disposition: 'archive', demand: 'none', acknowledgedIssues: ['unverified_inquiry_date'], ...patch });
const resolution = (records, ids, patch = {}) => ({ schemaVersion: 1, sourceSha256: 'a'.repeat(64), documentId: 'synthetic-candidates',
  targets: { 'Свои авто': { responsibilityScopeId: ids.scope, kind: 'driver' } }, sources: { 'Авито': 'avito' },
  recruiters: { 'Synthetic recruiter': ids.admin }, demands: {}, records, ...patch });

test('candidate import compiles only explicitly reviewed records without invented history', () => {
  const ids = { scope: randomUUID(), admin: randomUUID() };
  const malformed = row(4, null, { proposed: { fullName: null, phone: null, city: null, occurredAt: null }, issues: ['invalid_phone', 'invalid_fullName', 'invalid_city'] });
  const source = batch([row(3), malformed]);
  const pending = compilePlan(source, resolution({}, ids));
  assert.equal(pending.pending, 2); assert.equal(pending.quarantined, 1); assert.equal(pending.selected, 0);
  const selected = compilePlan(source, resolution({ 'Свои авто:3': decision() }, ids));
  assert.equal(selected.records.length, 1); assert.equal(selected.problems.length, 0);
  assert.equal(selected.records[0].occurredAt, null); assert.equal(selected.records[0].payload.archived, true);
  assert.equal(selected.records[0].stage, null);
  const hired = compilePlan(source, resolution({ 'Свои авто:3': decision({ disposition: 'active', demand: randomUUID(), stage: 'hired' }) }, ids));
  assert.equal(hired.problems[0].code, 'review_stage_required');
  const unknown = compilePlan(source, resolution({ 'Свои авто:3': decision() }, ids, { recruiters: {} }));
  assert.equal(unknown.problems[0].code, 'recruiter_mapping_required');
  const badData = compilePlan(source, resolution({ 'Свои авто:4': decision({ acknowledgedIssues: malformed.issues }) }, ids));
  assert.equal(badData.problems[0].code, 'invalid_candidate_fields');
  const corrections = compilePlan(source, resolution({ 'Свои авто:4': decision({ acknowledgedIssues: malformed.issues,
    corrections: { fullName: 'Verified synthetic person', phone: '+79995550102', city: 'Москва' }, evidence: 'Verified by synthetic recruiter' }) }, ids));
  assert.equal(corrections.problems.length, 0);
  const missingEvidence = compilePlan(source, resolution({ 'Свои авто:4': decision({ acknowledgedIssues: malformed.issues,
    corrections: { fullName: 'Verified synthetic person' } }) }, ids));
  assert.equal(missingEvidence.problems[0].code, 'correction_evidence_required');
  assert.throws(() => compilePlan(source, resolution({}, ids, { sourceSha256: 'b'.repeat(64) })), /снимку/);
  assert.throws(() => compilePlan(batch([row(3), row(3)]), resolution({}, ids)), /повторная/);
  const notes = compilePlan(source, resolution({ 'Свои авто:3': decision({ notes: 'Original recruiter and private historical note' }) }, ids));
  assert.equal(notes.records[0].payload.notes, 'Original recruiter and private historical note');
  assert.equal(notes.records[0].contactNotes, 'Original recruiter and private historical note');
  const longNotes = compilePlan(source, resolution({ 'Свои авто:3': decision({ notes: 'x'.repeat(4001) }) }, ids));
  assert.equal(longNotes.problems[0].code, 'invalid_candidate_fields');
});

test('offline resolution preserves source attribution and quarantines conflicting and cross-sheet identities', () => {
  const otherName = row(7, '+79995550107'); otherName.proposed.fullName = 'Different synthetic person';
  const cross = row(10, '+79995550109'); cross.sheet = 'Наемные авто'; cross.sourceKey = 'Наемные авто:10';
  const first = row(3); first.raw.P3 = { cached: 'Private original comment', dataType: 's' }; first.raw.O3 = { cached: 'Private original reason', dataType: 's' };
  const repeated = row(4); repeated.proposed.fullName = '  synthetic   PRIVATE candidate  ';
  const source = batch([first, repeated, row(6, '+79995550107'), otherName, row(9, '+79995550109'), cross]);
  const prepared = prepareResolution(source, { scopeId: randomUUID(), technicalOwnerId: randomUUID() });
  assert.equal(prepared.policy.counts.selectedRows, 2); assert.equal(prepared.policy.counts.newCandidateIdentities, 1);
  assert.equal(prepared.policy.counts.repeatInquiries, 1); assert.equal(prepared.policy.directions.status, 'assumed');
  assert.equal(prepared.resolution.records['Свои авто:4'].candidate.sourceKey, 'Свои авто:3');
  const note = prepared.resolution.records['Свои авто:3'].notes;
  for (const part of ['техническим владельцем', 'Synthetic recruiter', 'Авито', 'Synthetic demand', 'Private original comment', 'Private original reason']) assert.ok(note.includes(part));
  assert.ok(prepared.duplicateIssues.records['Свои авто:6'].issues.includes('phone_name_conflict_requires_review'));
  assert.ok(prepared.duplicateIssues.records['Свои авто:9'].issues.includes('cross_sheet_phone_requires_review'));
  assert.equal(prepared.policy.problems.length, 0);
});

test('candidate import uses disposable PostgreSQL, preserves repeat contacts and never overwrites live records', { timeout: 180000 }, async t => {
  const fixture = await createTestServer(); t.after(() => fixture.close());
  const { adminPool: db, ids } = fixture;
  await db.query('UPDATE access_grants SET personal_data_visible=true WHERE user_id=$1', [ids.admin]);
  const source = batch([row(3), row(4)]);
  const choices = resolution({ 'Свои авто:3': decision({ notes: 'PRIVATE_ORIGINAL_NOTE_3' }), 'Свои авто:4': decision({ candidate: { mode: 'record', sourceKey: 'Свои авто:3' }, notes: 'PRIVATE_ORIGINAL_NOTE_4' }) }, ids);
  const counts = async () => {
    const tables = ['recruitment_candidates', 'recruitment_contacts', 'recruitment_applications', 'recruitment_events', 'recruitment_tasks', 'recruitment_candidate_imports', 'audit_events', 'users', 'access_grants', 'recruitment_requests'];
    const result = {};
    for (const table of tables) result[table] = Number((await db.query(`SELECT count(*) AS count FROM ${table}`)).rows[0].count);
    return result;
  };
  const before = await counts();
  await t.test('preview uses read-only SQL and dry-run rolls back every insert and audit', async () => {
    const preview = await previewPlan(db, source, choices, ids.admin);
    assert.equal(preview.mode, 'preview'); assert.equal(preview.ready, 2); assert.equal(preview.problemCount, 0);
    assert.deepEqual(await counts(), before);
    const dryRun = await importPlan(db, source, choices, ids.admin);
    assert.equal(dryRun.mode, 'dry-run'); assert.equal(dryRun.createdCandidates, 1); assert.equal(dryRun.createdContacts, 2);
    assert.deepEqual(await counts(), before);
  });
  await t.test('duplicate rows require explicit identity decisions and map to distinct inquiries', async () => {
    const ambiguous = resolution({ 'Свои авто:3': decision(), 'Свои авто:4': decision() }, ids);
    const preview = await previewPlan(db, source, ambiguous, ids.admin);
    assert.equal(preview.problemCount, 1); assert.equal(preview.problems[0].code, 'phone_match_requires_explicit_identity_resolution');
    await assert.rejects(importPlan(db, source, ambiguous, ids.admin, { dryRun: false }), /конфликт/);
    assert.deepEqual(await counts(), before);
    const applied = await importPlan(db, source, choices, ids.admin, { dryRun: false });
    assert.equal(applied.createdCandidates, 1); assert.equal(applied.createdContacts, 2);
    const contacts = (await db.query('SELECT candidate_id,origin,source,result,occurred_at,request_payload,notes FROM recruitment_contacts ORDER BY id')).rows;
    assert.equal(new Set(contacts.map(item => item.candidate_id)).size, 1);
    assert.ok(contacts.every(item => item.origin === 'import' && item.source === 'avito' && item.result === 'inquiry' && item.occurred_at === null));
    assert.ok(contacts.every(item => JSON.stringify(item.request_payload) === '{}'));
    assert.deepEqual(contacts.map(item => item.notes).sort(), ['PRIVATE_ORIGINAL_NOTE_3', 'PRIVATE_ORIGINAL_NOTE_4']);
    assert.equal((await db.query('SELECT notes FROM recruitment_candidates')).rows[0].notes, 'PRIVATE_ORIGINAL_NOTE_3');
    const after = await counts();
    for (const table of ['recruitment_events', 'recruitment_tasks', 'recruitment_requests', 'users', 'access_grants']) assert.equal(after[table], before[table]);
    const provenance = (await db.query('SELECT source_data,resolution_data FROM recruitment_candidate_imports')).rows;
    assert.ok(provenance.every(item => JSON.stringify(item.source_data).includes('PRIVATE_SOURCE_ANNOTATION')));
    assert.ok(provenance.every(item => item.resolution_data.recruiterId === ids.admin));
    const audit = (await db.query('SELECT payload::text AS value FROM audit_events')).rows.map(item => item.value).join('');
    assert.ok(!audit.includes('PRIVATE_SOURCE_ANNOTATION')); assert.ok(!audit.includes('PRIVATE_ORIGINAL_NOTE')); assert.ok(!audit.includes('Synthetic private candidate')); assert.ok(!audit.includes('+79995550101'));
    const privileges = (await db.query("SELECT has_table_privilege('transport_app','recruitment_candidate_imports','SELECT') AS readable")).rows[0];
    assert.equal(privileges.readable, false);
  });
  await t.test('replay is a no-op after app edits, and changed source/resolutions cannot replace them', async () => {
    const id = stableId('synthetic-candidates:candidate:Свои авто:3');
    await db.query("UPDATE recruitment_candidates SET full_name='Edited inside application',version=version+1 WHERE id=$1", [id]);
    const after = await counts();
    const replay = await importPlan(db, source, choices, ids.admin, { dryRun: false });
    assert.equal(replay.replay, 2); assert.equal(replay.createdCandidates, 0); assert.equal(replay.createdContacts, 0);
    assert.deepEqual(await counts(), after);
    assert.equal((await db.query('SELECT full_name FROM recruitment_candidates WHERE id=$1', [id])).rows[0].full_name, 'Edited inside application');
    const changed = structuredClone(source); changed.records[0].raw.B3.value = 'Edited source';
    await assert.rejects(importPlan(db, changed, choices, ids.admin, { dryRun: false }), /конфликт/);
    const differentSnapshot = { ...source, source: { ...source.source, sha256: 'b'.repeat(64) } };
    await assert.rejects(importPlan(db, differentSnapshot, { ...choices, sourceSha256: 'b'.repeat(64) }, ids.admin, { dryRun: false }), /другого снимка/);
    const changedMapping = structuredClone(choices); changedMapping.sources['Авито'] = 'other';
    await assert.rejects(importPlan(db, source, changedMapping, ids.admin, { dryRun: false }), /конфликт/);
    assert.deepEqual(await counts(), after);
  });
  await t.test('a demand must already exist in the authorized scope and gets no fabricated stage history', async () => {
    const requestId = randomUUID();
    await db.query(`INSERT INTO recruitment_requests(id,legal_entity_id,region_id,project_id,responsibility_scope_id,title,city,kind,quantity,priority,status,recruiter_id,created_by,updated_by)
      VALUES($1,$2,$3,$4,$5,'Synthetic existing request','Москва','driver',2,'normal','open',$6,$6,$6)`, [requestId, ids.legal, ids.region, ids.project, ids.scope, ids.admin]);
    const source2 = batch([row(7, '+79995550107')]);
    const mapped = resolution({ 'Свои авто:7': decision({ disposition: 'active', demand: 'mapped', stage: 'reserve' }) }, ids, { demands: { 'Свои авто:Synthetic demand': requestId } });
    const beforeApply = await counts();
    await importPlan(db, source2, mapped, ids.admin, { dryRun: false });
    const application = (await db.query('SELECT stage,start_date FROM recruitment_applications WHERE request_id=$1', [requestId])).rows[0];
    assert.equal(application.stage, 'reserve'); assert.equal(application.start_date, null);
    const after = await counts();
    assert.equal(after.recruitment_requests, beforeApply.recruitment_requests); assert.equal(after.recruitment_events, beforeApply.recruitment_events);
    assert.equal(after.recruitment_tasks, beforeApply.recruitment_tasks);
    const candidateId = stableId('synthetic-candidates:candidate:Свои авто:7');
    await db.query("UPDATE recruitment_applications SET stage='contact',version=version+1 WHERE candidate_id=$1", [candidateId]);
    const followupSource = batch([row(8, '+79995550107')]);
    const followup = resolution({ 'Свои авто:8': decision({ candidate: { mode: 'existing', id: candidateId }, disposition: 'active', demand: requestId, stage: 'new' }) }, ids);
    assert.equal((await previewPlan(db, followupSource, followup, ids.admin)).problems[0].code, 'existing_application_requires_explicit_reuse');
    followup.records['Свои авто:8'].application = 'reuse';
    const followupResult = await importPlan(db, followupSource, followup, ids.admin, { dryRun: false });
    assert.equal(followupResult.createdApplications, 0); assert.equal(followupResult.createdCandidates, 0); assert.equal(followupResult.createdContacts, 1);
    assert.equal((await db.query('SELECT stage FROM recruitment_applications WHERE candidate_id=$1', [candidateId])).rows[0].stage, 'contact');
    const afterFollowup = await counts();
    const unknownRequest = resolution({ 'Свои авто:9': decision({ disposition: 'active', demand: randomUUID(), stage: 'new' }) }, ids);
    const preview = await previewPlan(db, batch([row(9, '+79995550109')]), unknownRequest, ids.admin);
    assert.equal(preview.problems[0].code, 'existing_demand_missing_incompatible_or_closed');
    await assert.rejects(importPlan(db, batch([row(9, '+79995550109')]), unknownRequest, ids.admin, { dryRun: false }), /конфликт/);
    assert.deepEqual(await counts(), afterFollowup);
  });
  await t.test('scope permissions and recruiter assignments are never invented', async () => {
    const source3 = batch([row(12, '+79995550112')]);
    const missingRecruiter = resolution({ 'Свои авто:12': decision({ recruiterId: ids.drivers[0] }) }, ids);
    const preview = await previewPlan(db, source3, missingRecruiter, ids.admin);
    assert.equal(preview.problems[0].code, 'recruiter_missing_or_not_authorized');
    await assert.rejects(importPlan(db, source3, missingRecruiter, ids.admin, { dryRun: false }), /конфликт/);
    const missingScope = resolution({ 'Свои авто:12': decision({ target: { responsibilityScopeId: randomUUID(), kind: 'driver' } }) }, ids);
    const scoped = await previewPlan(db, source3, missingScope, ids.admin);
    assert.equal(scoped.problems[0].code, 'scope_missing_or_not_authorized');
    await assert.rejects(previewPlan(db, source3, resolution({ 'Свои авто:12': decision() }, ids), ids.drivers[0]), /администратор/);
  });
});
