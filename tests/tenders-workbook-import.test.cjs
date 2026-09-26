'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createTestServer } = require('./local-test-server.cjs');
const { importPlan, recordsFromPlan, TARGET, stableId, NOTE_PREFIX } = require('../integrations/tenders-import/import-local.cjs');

const source = { fileName: 'Synthetic.xlsx', sha256: 'a'.repeat(64) };
function row(sourceRows, name = `Synthetic customer ${sourceRows[0]}`, patch = {}) {
  return { sheet: 'Лист2', sourceRows, sourceKey: `Лист2:${sourceRows[0]}`, customerName: name,
    sourceDetails: `SHA256: ${source.sha256}\n${sourceRows.map(number => `Лист2!A${number}:E${number}\nA: ${name}\nB: Original source <script>literal</script>\nC: Next action\nD: 5–8 автомобилей\nE: Конец сентября`).join('\n')}`,
    comment: `${NOTE_PREFIX}\nB: Original source <script>literal</script>\nC: Next action`,
    payload: { title: `Synthetic opportunity ${sourceRows[0]}`, status: 'in_progress', kind: 'negotiation', vehicleCount: '5–8',
      requirements: '8 паллет', deliveryType: '', expectedLaunch: null, launchNotes: 'Конец сентября; год не указан',
      submissionDeadline: null, nextStep: 'Уточнить год запуска', nextStepDue: null, closeReason: '', winReason: '', ...patch } };
}
const plan = () => ({ schemaVersion: 1, source, records: [row([2]), row([5, 17], 'Synthetic duplicate customer'), row([9], 'synthetic   CUSTOMER 2')] });

test('tender import validates source coverage, dates and shared payload rules before connection', () => {
  const good = plan();
  const parsed = recordsFromPlan(good);
  assert.equal(parsed.length, 3);
  assert.equal(parsed[0].customer.id, parsed[2].customer.id);
  assert.deepEqual(parsed.flatMap(record => record.sourceRows).sort((a, b) => a - b), [2, 5, 9, 17]);
  const rejects = [
    { ...good, records: [...good.records, row([17])] },
    { ...good, records: [row([5, 5])] },
    { ...good, records: [{ ...row([5, 17]), sourceDetails: row([5]).sourceDetails }] },
    { ...good, source: { ...source, sha256: 'b'.repeat(64) } },
    { ...good, records: [{ ...row([2]), sourceDetails: `SHA256 ${source.sha256}\nЛист2!A2:E20` }] },
    { ...good, records: [{ ...row([2]), comment: 'Без указания происхождения и даты' }] },
    { ...good, records: [row([2], 'Synthetic', { expectedLaunch: '2026-09-30' })] },
    { ...good, records: [row([2], 'Synthetic', { status: 'won' })] },
    { ...good, records: [row([2], 'Synthetic', { status: 'closed' })] },
  ];
  for (const invalid of rejects) assert.throws(() => recordsFromPlan(invalid));
});

test('tender workbook import is atomic, scoped, replayable and preserves source uncertainty', { timeout: 180000 }, async t => {
  const fixture = await createTestServer(); t.after(() => fixture.close());
  const pool = fixture.adminPool, actor = fixture.ids.admin, sourcePlan = plan();
  const tables = ['tender_customers', 'tender_items', 'tender_events', 'legal_entities', 'regions', 'projects', 'responsibility_scopes', 'access_grants', 'audit_events'];
  const counts = async () => Object.fromEntries(await Promise.all(tables.map(async table => [table, Number((await pool.query(`SELECT count(*) FROM ${table}`)).rows[0].count)])));
  const before = await counts();
  const specialistId = randomUUID();
  await pool.query("INSERT INTO users(id,display_name,role,active,approved) VALUES($1,'Synthetic specialist','tender_specialist',true,true)", [specialistId]);

  await t.test('dry run executes all writes then rolls back references, grants, history and audit', async () => {
    const result = await importPlan(pool, sourcePlan, actor);
    assert.equal(result.inserted, 3);
    assert.equal(result.customersInserted, 2);
    assert.equal(result.eventsInserted, 9);
    assert.equal(result.sourceRows, 4);
    assert.equal(result.dryRun, true);
    assert.deepEqual(await counts(), before);
  });
  await t.test('non-administrators and inactive administrators cannot import or grant themselves access', async () => {
    await assert.rejects(importPlan(pool, sourcePlan, specialistId, { dryRun: false }), /администратор/);
    const inactiveId = randomUUID();
    await pool.query("INSERT INTO users(id,display_name,role,active,approved) VALUES($1,'Synthetic inactive admin','access_admin',false,true)", [inactiveId]);
    await assert.rejects(importPlan(pool, sourcePlan, inactiveId, { dryRun: false }), /администратор/);
    assert.deepEqual(await counts(), before);
  });
  await t.test('an actual late PostgreSQL error rolls back previously inserted customers, records and events', async () => {
    await pool.query("CREATE FUNCTION reject_synthetic_import() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.title='Synthetic opportunity 9' THEN RAISE EXCEPTION 'Synthetic late failure'; END IF; RETURN NEW; END; $$");
    await pool.query('CREATE TRIGGER synthetic_import_failure BEFORE INSERT ON tender_items FOR EACH ROW EXECUTE FUNCTION reject_synthetic_import()');
    try { await assert.rejects(importPlan(pool, sourcePlan, actor, { dryRun: false }), /Synthetic late failure/); }
    finally {
      await pool.query('DROP TRIGGER synthetic_import_failure ON tender_items');
      await pool.query('DROP FUNCTION reject_synthetic_import()');
    }
    assert.deepEqual(await counts(), before);
  });
  await t.test('apply groups customer identities, preserves the duplicate row references and distinguishes imported notes', async () => {
    const start = (await pool.query('SELECT clock_timestamp() AS now')).rows[0].now;
    const result = await importPlan(pool, sourcePlan, actor, { dryRun: false });
    assert.equal(result.inserted, 3);
    assert.equal(result.customersInserted, 2);
    assert.equal(result.eventsInserted, 9);
    assert.equal(result.sourceRows, 4);
    assert.deepEqual(result.mapping.find(record => record.sourceKey === 'Лист2:5').sourceRows, [5, 17]);
    const tenders = (await pool.query('SELECT * FROM tender_items WHERE responsibility_scope_id=$1', [TARGET.responsibilityScopeId])).rows;
    assert.equal(tenders.length, 3);
    assert.ok(tenders.every(record => record.vehicle_count === '5–8' && record.expected_launch === null && record.submission_deadline === null && record.next_step_due === null));
    assert.ok(tenders.every(record => record.launch_notes === 'Конец сентября; год не указан'));
    const events = (await pool.query('SELECT * FROM tender_events WHERE responsibility_scope_id=$1 ORDER BY created_at,id', [TARGET.responsibilityScopeId])).rows;
    assert.equal(events.length, 9);
    assert.equal(events.filter(record => record.type === 'comment').length, 0);
    assert.equal(events.filter(record => record.type === 'created').length, 3);
    assert.equal(events.filter(record => record.type === 'import').length, 6);
    assert.ok(events.every(record => record.created_at >= start));
    const mergedSource = events.find(record => record.id === stableId('event:source:Лист2:5'));
    assert.match(mergedSource.text, /Лист2!A5:E5/);
    assert.match(mergedSource.text, /Лист2!A17:E17/);
    assert.ok(mergedSource.text.includes(source.sha256));
    const grants = (await pool.query('SELECT * FROM access_grants WHERE responsibility_scope_id=$1', [TARGET.responsibilityScopeId])).rows;
    assert.equal(grants.length, 1);
    assert.equal(grants[0].user_id, actor);
    assert.equal(grants[0].finance_visible, false);
    assert.equal(grants[0].personal_data_visible, false);
    const audit = (await pool.query("SELECT payload::text AS value FROM audit_events WHERE payload->>'action' LIKE 'tenders.%'")).rows;
    assert.ok(audit.length >= 5);
    assert.ok(audit.every(record => !record.value.includes('Original source') && !record.value.includes('Synthetic customer') && !record.value.includes('Next action')));
  });
  await t.test('exact replay is a complete noop including versions, grants and audit events', async () => {
    const applied = await counts();
    const result = await importPlan(pool, sourcePlan, actor, { dryRun: false });
    assert.equal(result.inserted, 0);
    assert.equal(result.skipped, 3);
    assert.equal(result.customersInserted, 0);
    assert.equal(result.eventsInserted, 0);
    assert.deepEqual(await counts(), applied);
    assert.ok((await pool.query('SELECT version FROM tender_items WHERE responsibility_scope_id=$1', [TARGET.responsibilityScopeId])).rows.every(record => record.version === 1));
  });
  await t.test('changed source hash, record coverage or payload rejects without appending a second import', async () => {
    const applied = await counts();
    const changedHash = structuredClone(sourcePlan);
    changedHash.source.sha256 = 'b'.repeat(64);
    changedHash.records.forEach(record => { record.sourceDetails = record.sourceDetails.replaceAll(source.sha256, changedHash.source.sha256); });
    const changedPayload = structuredClone(sourcePlan); changedPayload.records[0].payload.title = 'Different source title';
    for (const changed of [changedHash, changedPayload, { ...sourcePlan, records: sourcePlan.records.slice(1) }, { ...sourcePlan, records: [...sourcePlan.records, row([30])] }])
      await assert.rejects(importPlan(pool, changed, actor, { dryRun: false }), /без перезаписи/);
    assert.deepEqual(await counts(), applied);
  });
  await t.test('source event corruption and revoked import grant are detected, never silently restored', async () => {
    const eventId = stableId('event:source:Лист2:5');
    await pool.query("UPDATE tender_events SET text='Changed source event' WHERE id=$1", [eventId]);
    await assert.rejects(importPlan(pool, sourcePlan, actor, { dryRun: false }), /история уже изменены/);
    await pool.query('UPDATE tender_events SET text=$2 WHERE id=$1', [eventId, sourcePlan.records[1].sourceDetails]);
    await pool.query('DELETE FROM access_grants WHERE user_id=$1 AND responsibility_scope_id=$2', [actor, TARGET.responsibilityScopeId]);
    const revoked = await counts();
    await assert.rejects(importPlan(pool, sourcePlan, actor, { dryRun: false }), /Доступ администратора.*отозван/);
    assert.deepEqual(await counts(), revoked);
    await pool.query(`INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id,personal_data_visible,finance_visible)
      VALUES($1,$2,$3,$4,$5,false,false)`, [actor, TARGET.legalEntityId, TARGET.regionId, TARGET.projectId, TARGET.responsibilityScopeId]);
  });
  await t.test('application edits survive rejected replay without resets or extra history', async () => {
    const id = stableId('tender:Лист2:2');
    await pool.query("UPDATE tender_items SET title='Updated in the app',version=version+1 WHERE id=$1", [id]);
    const applied = await counts();
    await assert.rejects(importPlan(pool, sourcePlan, actor, { dryRun: false }), /уже изменена/);
    assert.deepEqual(await counts(), applied);
    const existing = (await pool.query('SELECT title,version FROM tender_items WHERE id=$1', [id])).rows[0];
    assert.deepEqual(existing, { title: 'Updated in the app', version: 2 });
  });
});
