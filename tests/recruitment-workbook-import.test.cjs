'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createTestServer } = require('./local-test-server.cjs');
const { importPlan, TARGET, stableId } = require('../integrations/recruitment-import/import-local.cjs');

test('workbook import is atomic, repeatable and never replaces application edits', { timeout: 120000 }, async t => {
  const fixture = await createTestServer(); t.after(() => fixture.close());
  const pool = fixture.adminPool, actor = fixture.ids.admin;
  await pool.query('UPDATE access_grants SET personal_data_visible=true WHERE user_id=$1', [actor]);
  const row = (sheet, rowStart, quantity = 0) => ({ sheet, rowStart, rowEnd: rowStart, sourceKey: `${sheet}:${rowStart}`,
    sourceDetails: `${sheet}!B${rowStart}: Original private source <script>literal</script>`,
    payload: { title: `Synthetic source ${rowStart}`, kind: sheet === 'Проекты' ? 'driver' : 'carrier', city: '',
      quantity, status: 'paused', priority: 'normal', neededBy: null, publishedAt: null } });
  const plan = { schemaVersion: 1, source: { fileName: 'Synthetic.xlsx', sha256: 'a'.repeat(64) },
    records: [row('Проекты', 2), row('Перевозчики', 3, null)] };
  const count = async table => Number((await pool.query('SELECT count(*) FROM ' + table)).rows[0].count);
  const before = { requests: await count('recruitment_requests'), entities: await count('legal_entities'), projects: await count('projects'), grants: await count('access_grants'), audit: await count('audit_events') };

  await t.test('dry run validates the actual transaction but leaves no scope, record or audit behind', async () => {
    const result = await importPlan(pool, plan, actor);
    assert.equal(result.inserted, 2); assert.equal(result.dryRun, true);
    assert.deepEqual({ requests: await count('recruitment_requests'), entities: await count('legal_entities'), projects: await count('projects'), grants: await count('access_grants'), audit: await count('audit_events') }, before);
  });
  await t.test('apply creates one isolated scope and preserves zero versus missing quantities', async () => {
    const result = await importPlan(pool, plan, actor, { dryRun: false });
    assert.equal(result.inserted, 2);
    const rows = (await pool.query('SELECT quantity,source_details FROM recruitment_requests WHERE responsibility_scope_id=$1 ORDER BY kind DESC', [TARGET.responsibilityScopeId])).rows;
    assert.deepEqual(rows.map(r => r.quantity), [0, null]);
    assert.ok(rows.every(r => r.source_details.includes('Original private source')));
    assert.equal(await count('access_grants'), before.grants + 1);
    assert.equal(Number((await pool.query('SELECT count(*) FROM recruitment_external_access')).rows[0].count), 0);
    const grant = (await pool.query('SELECT * FROM access_grants WHERE responsibility_scope_id=$1', [TARGET.responsibilityScopeId])).rows[0];
    assert.equal(grant.user_id, actor); assert.equal(grant.finance_visible, false); assert.equal(grant.personal_data_visible, true);
    assert.equal(grant.legal_entity_id, TARGET.legalEntityId);
    assert.equal(await count('legal_entities'), before.entities + 1);
    const audit = (await pool.query("SELECT payload::text AS value FROM audit_events WHERE payload->>'action' LIKE 'recruitment.%'")).rows;
    assert.ok(audit.every(r => !r.value.includes('Original private source')));
  });
  await t.test('exact replay adds no records, versions, grants or audit events', async () => {
    const auditCount = await count('audit_events');
    const result = await importPlan(pool, plan, actor, { dryRun: false });
    assert.equal(result.inserted, 0); assert.equal(result.skipped, 2);
    assert.equal(await count('recruitment_requests'), before.requests + 2);
    assert.equal(await count('audit_events'), auditCount);
    assert.deepEqual((await pool.query('SELECT version FROM recruitment_requests WHERE responsibility_scope_id=$1', [TARGET.responsibilityScopeId])).rows.map(r => r.version), [1, 1]);
  });
  await t.test('an existing manual edit rolls back other new rows and audit from the same import', async () => {
    const id = stableId('request:Проекты:2');
    await pool.query("UPDATE recruitment_requests SET title='Updated in the app',version=version+1 WHERE id=$1", [id]);
    const auditCount = await count('audit_events');
    const changed = { ...plan, records: [row('Проекты', 9), ...plan.records] };
    await assert.rejects(importPlan(pool, changed, actor, { dryRun: false }), /уже изменена/);
    assert.equal(await count('recruitment_requests'), before.requests + 2);
    assert.equal(await count('audit_events'), auditCount);
    assert.equal((await pool.query('SELECT title FROM recruitment_requests WHERE id=$1', [id])).rows[0].title, 'Updated in the app');
  });
  await t.test('invalid source references and incomplete open needs cannot bypass shared validation', async () => {
    await assert.rejects(importPlan(pool, { ...plan, records: [...plan.records, plan.records[0]] }, actor), /повторная/);
    const incomplete = row('Проекты', 10, null); incomplete.payload.status = 'open';
    await assert.rejects(importPlan(pool, { ...plan, records: [incomplete] }, actor));
    assert.equal(await count('recruitment_requests'), before.requests + 2);
  });
});
