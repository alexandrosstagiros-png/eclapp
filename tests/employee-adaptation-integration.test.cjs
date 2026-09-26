'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash, randomUUID } = require('node:crypto');
const { createTestServer } = require('./local-test-server.cjs');

test('employee creation opts into adaptation atomically without changing existing accounts or retry semantics', { timeout: 180000 }, async t => {
  const fixture = await createTestServer();
  t.after(() => fixture.close());
  const { ids, adminPool: db, request, devLogin } = fixture;
  const admin = await devLogin(ids.admin);
  await db.query('UPDATE access_grants SET personal_data_visible=true WHERE user_id=$1 AND responsibility_scope_id=$2', [ids.admin, ids.scope]);
  const expect = (response, status) => { assert.equal(response.status, status, JSON.stringify(response.body)); return response.body; };
  const create = (route, body, token = admin.accessToken) => request('POST', `/access/employees/${route}`, body, token);
  const input = (route, extra = {}) => ({ scopeId: ids.scope, idempotencyKey: randomUUID(),
    ...(route === 'demo' ? { role: 'manager' } : { displayName: 'Синтетический сотрудник адаптации' }), ...extra });
  const status = async id => (await db.query('SELECT adaptation_required,adaptation_scope_id,adaptation_completed_at FROM users WHERE id=$1', [id])).rows[0];
  const legacyHash = (route, body) => createHash('sha256').update(JSON.stringify(route === 'demo'
    ? { role: body.role, scopeId: body.scopeId }
    : { role: route === 'external' ? 'external_recruiter' : route.replace('-', '_'), scopeId: body.scopeId, displayName: body.displayName,
      ...(route === 'external' ? {} : { sourceKind: 'internal_manual' }) })).digest('hex');
  const enrolled = [];
  const existing = (await db.query('SELECT id,adaptation_required,adaptation_scope_id,adaptation_completed_at FROM users ORDER BY id')).rows;

  await t.test('existing accounts and all omitted/default-false creation requests stay unenrolled with legacy hashes', async () => {
    for (const account of existing) assert.deepEqual(account, { id: account.id, adaptation_required: false, adaptation_scope_id: null, adaptation_completed_at: null });
    for (const route of ['demo', 'tender-specialist', 'recruiter', 'external']) {
      const body = input(route), employee = expect(await create(route, body), 201);
      assert.equal(employee.adaptationRequired, false);
      assert.equal(employee.adaptationScopeId, null);
      assert.equal(employee.adaptationCompletedAt, null);
      assert.deepEqual(await status(employee.id), { adaptation_required: false, adaptation_scope_id: null, adaptation_completed_at: null });
      assert.equal((await db.query('SELECT payload_hash FROM employee_creation_requests WHERE actor_id=$1 AND idempotency_key=$2', [ids.admin, body.idempotencyKey])).rows[0].payload_hash, legacyHash(route, body));
      assert.equal(expect(await create(route, { ...body, adaptationRequired: false }), 201).id, employee.id);
      if (route !== 'external') expect(await create(route, { ...body, adaptationRequired: true }), 409);
      const explicitFalse = input(route, { adaptationRequired: false });
      const second = expect(await create(route, explicitFalse), 201);
      const omitted = { ...explicitFalse }; delete omitted.adaptationRequired;
      assert.equal(expect(await create(route, omitted), 201).id, second.id);
    }
  });

  await t.test('all internal creation paths persist the assigned scope once and include enrollment in the audit', async () => {
    for (const route of ['demo', 'tender-specialist', 'recruiter']) {
      const body = input(route, { adaptationRequired: true });
      const replies = await Promise.all([create(route, body), create(route, body)]);
      const employee = expect(replies[0], 201);
      assert.equal(expect(replies[1], 201).id, employee.id);
      assert.equal(employee.adaptationRequired, true);
      assert.equal(employee.adaptationScopeId, ids.scope);
      assert.equal(employee.adaptationCompletedAt, null);
      assert.deepEqual(await status(employee.id), { adaptation_required: true, adaptation_scope_id: ids.scope, adaptation_completed_at: null });
      assert.equal((await db.query('SELECT 1 FROM employee_creation_requests WHERE actor_id=$1 AND idempotency_key=$2', [ids.admin, body.idempotencyKey])).rowCount, 1);
      const audits = (await db.query("SELECT payload FROM audit_events WHERE payload->>'entityId'=$1 AND payload->>'action' LIKE 'access.%created'", [employee.id])).rows;
      assert.equal(audits.length, 1);
      assert.equal(audits[0].payload.metadata.adaptationRequired, true);
      assert.equal(audits[0].payload.metadata.adaptationScopeId, ids.scope);
      expect(await create(route, { ...body, adaptationRequired: false }), 409);
      const omitted = { ...body }; delete omitted.adaptationRequired;
      expect(await create(route, omitted), 409);
      enrolled.push({ route, body, employee });
    }
    for (const role of ['dispatcher', 'recruiter', 'tender_specialist', 'document_specialist', 'mechanic']) {
      const employee = expect(await create('demo', input('demo', { role, adaptationRequired: true })), 201);
      assert.equal(employee.adaptationRequired, true);
      assert.equal(employee.adaptationScopeId, ids.scope);
    }
  });

  await t.test('only real booleans are accepted and drivers/external users cannot enroll', async () => {
    const before = (await db.query('SELECT count(*)::int AS count FROM users')).rows[0].count;
    for (const route of ['demo', 'tender-specialist', 'recruiter', 'external']) {
      for (const adaptationRequired of [null, 'true', 'false', 0, 1, {}, []]) {
        expect(await create(route, input(route, { adaptationRequired })), 400);
      }
      expect(await create(route, input(route, { adaptationScopeId: ids.scope })), 400);
      expect(await create(route, input(route, { adaptationCompletedAt: new Date().toISOString() })), 400);
    }
    expect(await create('external', input('external', { adaptationRequired: true })), 400);
    expect(await create('demo', input('demo', { role: 'driver', adaptationRequired: true })), 400);
    assert.equal((await db.query('SELECT count(*)::int AS count FROM users')).rows[0].count, before);
    const driver = expect(await create('demo', input('demo', { role: 'driver', adaptationRequired: false })), 201);
    assert.equal(driver.adaptationRequired, false);
  });

  await t.test('enrolled tender specialists can reach Team and adaptation while external accounts remain excluded', async () => {
    const specialist = enrolled.find(row => row.route === 'tender-specialist').employee;
    const session = await devLogin(specialist.id);
    const context = expect(await request('GET', '/team/context', undefined, session.accessToken), 200);
    assert.deepEqual(context.scopes.map(scope => scope.responsibilityScopeId), [ids.scope]);
    const adaptation = expect(await request('GET', '/team/adaptation', undefined, session.accessToken), 200);
    assert.equal(adaptation.required, true);
    assert.equal(adaptation.scopeId, ids.scope);
    assert.equal(adaptation.completed, false);
    expect(await request('GET', `/team/articles?responsibilityScopeId=${ids.scope}`, undefined, session.accessToken), 200);
    expect(await request('GET', '/access/employees/options', undefined, session.accessToken), 403);
    const external = expect(await create('external', input('external')), 201);
    const outsider = await devLogin(external.id);
    for (const route of ['/team/context', '/team/adaptation', `/team/articles?responsibilityScopeId=${ids.scope}`]) {
      expect(await request('GET', route, undefined, outsider.accessToken), 403);
    }
  });

  await t.test('unauthorized scope, missing personal-data permission and non-administrator requests leave no enrollment', async () => {
    const foreignScope = randomUUID();
    await db.query('INSERT INTO responsibility_scopes(id,project_id,name) VALUES($1,$2,$3)', [foreignScope, ids.project, 'Synthetic inaccessible adaptation scope']);
    const driver = await devLogin(ids.drivers[0]);
    const before = (await db.query('SELECT count(*)::int AS count FROM users')).rows[0].count;
    for (const route of ['demo', 'tender-specialist', 'recruiter']) {
      const body = input(route, { adaptationRequired: true, scopeId: foreignScope });
      expect(await create(route, body), 403);
      assert.equal((await db.query('SELECT 1 FROM employee_creation_requests WHERE idempotency_key=$1', [body.idempotencyKey])).rowCount, 0);
      expect(await create(route, input(route, { adaptationRequired: true }), driver.accessToken), 403);
    }
    await db.query('UPDATE access_grants SET personal_data_visible=false WHERE user_id=$1 AND responsibility_scope_id=$2', [ids.admin, ids.scope]);
    expect(await create('recruiter', input('recruiter', { adaptationRequired: true })), 403);
    await db.query('UPDATE access_grants SET personal_data_visible=true WHERE user_id=$1 AND responsibility_scope_id=$2', [ids.admin, ids.scope]);
    assert.equal((await db.query('SELECT count(*)::int AS count FROM users')).rows[0].count, before);
  });

  await t.test('an audit failure rolls back account, enrollment, grant, directory entry and idempotency reservation together', async () => {
    const counts = async () => (await db.query(`SELECT
      (SELECT count(*)::int FROM users) AS users,
      (SELECT count(*)::int FROM access_grants) AS grants,
      (SELECT count(*)::int FROM employee_directory) AS directory,
      (SELECT count(*)::int FROM employee_creation_requests) AS requests,
      (SELECT count(*)::int FROM audit_events) AS audit`)).rows[0];
    const before = await counts();
    const bodies = ['demo', 'tender-specialist', 'recruiter'].map(route => ({ route, body: input(route, { adaptationRequired: true }) }));
    await db.query(`CREATE FUNCTION test_reject_adaptation_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.payload->'metadata'->>'adaptationRequired'='true' THEN
        RAISE EXCEPTION 'Synthetic adaptation transaction rollback'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER test_adaptation_audit BEFORE INSERT ON audit_events
        FOR EACH ROW EXECUTE FUNCTION test_reject_adaptation_audit()`);
    try {
      for (const { route, body } of bodies) expect(await create(route, body), 500);
      assert.deepEqual(await counts(), before);
    } finally {
      await db.query('DROP TRIGGER test_adaptation_audit ON audit_events; DROP FUNCTION test_reject_adaptation_audit()');
    }
    for (const { route, body } of bodies) assert.equal(expect(await create(route, body), 201).adaptationRequired, true);
  });

  await t.test('API restart and retries preserve completed progress and never enroll preexisting employees', async () => {
    const completedAt = '2026-09-25T11:12:13.000Z';
    for (const { employee } of enrolled) await db.query('UPDATE users SET adaptation_completed_at=$2 WHERE id=$1', [employee.id, completedAt]);
    await fixture.restartApi();
    for (const { route, body, employee } of enrolled) {
      const retry = expect(await create(route, body), 201);
      assert.equal(retry.id, employee.id);
      assert.equal(retry.adaptationRequired, true);
      assert.equal(retry.adaptationScopeId, ids.scope);
      assert.equal(retry.adaptationCompletedAt, completedAt);
      const listing = expect(await request('GET', `/access/employees?role=${employee.role}&limit=50`, undefined, admin.accessToken), 200).items;
      assert.equal(listing.find(row => row.id === employee.id).adaptationCompletedAt, completedAt);
    }
    assert.deepEqual((await db.query('SELECT id,adaptation_required,adaptation_scope_id,adaptation_completed_at FROM users WHERE id=ANY($1::uuid[]) ORDER BY id', [existing.map(row => row.id)])).rows, existing);
  });
});
