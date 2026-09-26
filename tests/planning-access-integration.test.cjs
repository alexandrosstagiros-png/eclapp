'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { setTimeout: delay } = require('node:timers/promises');
const { createTestServer } = require('./local-test-server.cjs');

// Every account, scope, password and database in this suite is disposable.
test('administrators provision and repair planning access through scoped, audited HTTP endpoints', { timeout: 180000 }, async t => {
  const fixture = await createTestServer();
  t.after(() => fixture.close());
  const { ids, adminPool: db, request, devLogin } = fixture;
  process.env.DEMO_EMPLOYEE_CREATION_ENABLED = 'false';
  await fixture.restartApi();
  const admin = await devLogin(ids.admin);
  const driver = await devLogin(ids.drivers[0]);
  const dispatcher = await devLogin(ids.dispatcher);
  const secondScope = randomUUID(), limitedScope = randomUUID(), foreignScope = randomUUID();
  await db.query('INSERT INTO responsibility_scopes(id,project_id,name) VALUES($1,$2,$3),($4,$2,$5),($6,$2,$7)',
    [secondScope, ids.project, 'Synthetic evening planning group', limitedScope, 'Synthetic restricted planning group', foreignScope, 'Synthetic foreign planning group']);
  await db.query(`INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id,personal_data_visible)
    VALUES($1,$2,$3,$4,$5,true),($1,$2,$3,$4,$6,false)`, [ids.admin, ids.legal, ids.region, ids.project, secondScope, limitedScope]);

  const expect = (response, status) => {
    assert.equal(response.status, status, `Expected HTTP ${status}, got ${response.status}: ${JSON.stringify(response.body)}`);
    return response.body;
  };
  const create = (input, token = admin.accessToken) => request('POST', '/access/employees/planner', input, token);
  const read = (userId = ids.dispatcher, token = admin.accessToken) => request('GET', `/access/employees/${userId}/planning-access`, undefined, token);
  const save = (userId, input, token = admin.accessToken) => request('PUT', `/access/employees/${userId}/planning-access`, input, token);
  const editor = async (userId = ids.dispatcher) => expect(await read(userId), 200);
  const grants = async userId => (await db.query('SELECT * FROM access_grants WHERE user_id=$1 ORDER BY responsibility_scope_id', [userId])).rows;
  const events = async (userId, action) => (await db.query("SELECT payload FROM audit_events WHERE payload->>'entityId'=$1 AND payload->>'action'=$2 ORDER BY sequence", [userId, action])).rows.map(row => row.payload);
  const planning = (token, scopeId = ids.scope) => request('GET', `/planning?date=2026-09-26&responsibilityScopeId=${scopeId}`, undefined, token);
  const context = async token => expect(await request('GET', '/planning/context', undefined, token), 200);
  const input = { displayName: 'Синтетический диспетчер планирования', role: 'dispatcher', scopeId: ids.scope, personalDataVisible: true, idempotencyKey: randomUUID() };
  let created, manager, credentials, session;

  await t.test('options expose named scopes and the administrator personal-data ceiling with demo creation disabled', async () => {
    const permissions = (await db.query(`SELECT
      has_column_privilege('transport_app','access_grants','personal_data_visible','UPDATE') AS personal,
      has_column_privilege('transport_app','access_grants','finance_visible','UPDATE') AS finance,
      has_table_privilege('transport_app','access_grants','DELETE') AS revoke`)).rows[0];
    assert.deepEqual(permissions, { personal: true, finance: false, revoke: true });
    const options = expect(await request('GET', '/access/employees/options', undefined, admin.accessToken), 200);
    assert.equal(options.demoCreationEnabled, false);
    assert.equal(options.plannerCreationEnabled, true);
    assert.deepEqual(options.plannerRoles, ['dispatcher', 'manager']);
    assert.deepEqual(options.plannerScopes.map(scope => scope.id).sort(), [ids.scope, secondScope, limitedScope].sort());
    for (const scope of options.plannerScopes) {
      for (const key of ['legalEntity', 'region', 'project', 'responsibilityScope']) {
        assert.equal(typeof scope[key].id, 'string');
        assert.equal(typeof scope[key].name, 'string');
        assert.ok(scope[key].name.length > 0);
      }
    }
    assert.equal(options.plannerScopes.find(scope => scope.id === ids.scope).personalDataVisible, false);
    assert.equal(options.plannerScopes.find(scope => scope.id === secondScope).personalDataVisible, true);
    expect(await create(input), 403);
    assert.equal((await db.query('SELECT 1 FROM employee_creation_requests WHERE idempotency_key=$1', [input.idempotencyKey])).rowCount, 0);
    await db.query('UPDATE access_grants SET personal_data_visible=true WHERE user_id=$1 AND responsibility_scope_id=$2', [ids.admin, ids.scope]);
  });

  await t.test('concurrent creation retries produce one real planner and one audit record', async () => {
    const results = await Promise.all([create(input), create(input)]);
    created = expect(results[0], 201);
    assert.equal(expect(results[1], 201).id, created.id);
    assert.equal(created.displayName, input.displayName);
    assert.equal(created.role, 'dispatcher');
    assert.equal(created.sourceKind, 'internal_manual');
    assert.equal(created.phoneLoginEnabled, false);
    assert.equal(created.active, true);
    assert.equal(created.approved, true);
    const stored = await grants(created.id);
    assert.equal(stored.length, 1);
    assert.equal(stored[0].finance_visible, false);
    assert.equal(stored[0].personal_data_visible, true);
    assert.equal(stored[0].inspection_photo_delete, false);
    assert.equal((await events(created.id, 'access.planner_created')).length, 1);
    expect(await create({ ...input, displayName: 'Другое имя' }), 409);
    expect(await create({ ...input, personalDataVisible: false }), 409);
    manager = expect(await create({ ...input, idempotencyKey: randomUUID(), displayName: 'Синтетический менеджер', role: 'manager', personalDataVisible: false }), 201);
    assert.equal(manager.role, 'manager');
    assert.equal(manager.sourceKind, 'internal_manual');
    assert.equal((await grants(manager.id))[0].personal_data_visible, false);
  });

  await t.test('normal password onboarding opens planning and never grants financial administration', async () => {
    credentials = expect(await request('POST', `/access/users/${created.id}/password`, { phone: '+79990007291' }, admin.accessToken), 201);
    session = expect(await request('POST', '/auth/password', { phone: credentials.phone, password: credentials.password }), 200);
    assert.equal(session.actor.role, 'dispatcher');
    assert.deepEqual((await context(session.accessToken)).scopes.map(scope => scope.responsibilityScopeId), [ids.scope]);
    expect(await planning(session.accessToken), 200);
    expect(await request('GET', '/finance/tariffs', undefined, session.accessToken), 403);
    expect(await request('GET', '/access/employees/options', undefined, session.accessToken), 403);
    const directory = expect(await request('GET', '/access/employees?role=dispatcher', undefined, admin.accessToken), 200);
    assert.ok(directory.items.some(employee => employee.id === created.id));
    assert.equal(JSON.stringify(await events(created.id, 'access.planner_created')).includes(credentials.password), false);
  });

  await t.test('the existing dispatcher can be repaired without signing in again or changing credentials', async () => {
    assert.deepEqual(await context(dispatcher.accessToken), { scopes: [] });
    expect(await planning(dispatcher.accessToken), 403);
    const before = await editor();
    assert.equal(before.employeeId, ids.dispatcher);
    assert.equal(typeof before.version, 'string');
    assert.ok(before.version.length > 0);
    assert.deepEqual(before.grants, [{ scopeId: ids.scope, personalDataVisible: false }]);
    const saved = expect(await save(ids.dispatcher, { version: before.version, grants: [{ scopeId: ids.scope, personalDataVisible: true }] }), 200);
    assert.notEqual(saved.version, before.version);
    assert.deepEqual(saved.grants, [{ scopeId: ids.scope, personalDataVisible: true }]);
    assert.deepEqual(await editor(), saved);
    expect(await planning(dispatcher.accessToken), 200);
    assert.deepEqual((await context(dispatcher.accessToken)).scopes.map(scope => scope.responsibilityScopeId), [ids.scope]);
    const changed = await events(ids.dispatcher, 'access.planning_access_changed');
    assert.equal(changed.length, 1);
    assert.equal(changed[0].actorId, ids.admin);
    assert.equal(changed[0].scope.responsibilityScopeId, ids.scope);
    assert.equal(changed[0].metadata.change, 'updated');
    assert.equal(changed[0].metadata.previous.personalDataVisible, false);
    assert.equal(changed[0].metadata.next.personalDataVisible, true);
    expect(await save(ids.dispatcher, { version: saved.version, grants: saved.grants }), 200);
    assert.equal((await events(ids.dispatcher, 'access.planning_access_changed')).length, 1);
  });

  await t.test('adding scopes preserves retained finance, special permissions, role and phone credentials', async () => {
    const stale = await editor(created.id);
    await db.query('UPDATE access_grants SET finance_visible=true WHERE user_id=$1 AND responsibility_scope_id=$2', [ids.admin, ids.scope]);
    await db.query('UPDATE access_grants SET finance_visible=true,inspection_photo_delete=true WHERE user_id=$1', [created.id]);
    expect(await save(created.id, { version: stale.version, grants: stale.grants }), 409);
    const retained = (await grants(created.id))[0];
    const storedPassword = (await db.query('SELECT * FROM phone_credentials WHERE user_id=$1', [created.id])).rows[0];
    const storedUser = (await db.query('SELECT * FROM users WHERE id=$1', [created.id])).rows[0];
    const before = await editor(created.id);
    const saved = expect(await save(created.id, { version: before.version, grants: [...before.grants, { scopeId: secondScope, personalDataVisible: true }] }), 200);
    assert.equal(saved.grants.length, 2);
    const stored = await grants(created.id);
    assert.deepEqual(stored.find(grant => grant.responsibility_scope_id === ids.scope), retained);
    const added = stored.find(grant => grant.responsibility_scope_id === secondScope);
    assert.equal(added.finance_visible, false);
    assert.equal(added.inspection_photo_delete, false);
    assert.equal(added.personal_data_visible, true);
    assert.deepEqual((await db.query('SELECT * FROM phone_credentials WHERE user_id=$1', [created.id])).rows[0], storedPassword);
    assert.deepEqual((await db.query('SELECT * FROM users WHERE id=$1', [created.id])).rows[0], storedUser);
    assert.deepEqual((await context(session.accessToken)).scopes.map(scope => scope.responsibilityScopeId).sort(), [ids.scope, secondScope].sort());
    expect(await planning(session.accessToken, secondScope), 200);
    const addedEvent = await events(created.id, 'access.planning_access_changed');
    assert.equal(addedEvent.length, 1);
    assert.equal(addedEvent[0].scope.responsibilityScopeId, secondScope);
    assert.equal(addedEvent[0].metadata.change, 'added');
    assert.equal(addedEvent[0].metadata.previous, null);
    assert.equal(addedEvent[0].metadata.next.financeVisible, false);
    expect(await save(created.id, { version: before.version, grants: before.grants }), 409);
    assert.deepEqual(await editor(created.id), saved);
  });

  await t.test('personal-data removal and scope removal immediately deny planning in the same live session', async () => {
    let state = await editor(created.id);
    state = expect(await save(created.id, { version: state.version, grants: [{ scopeId: ids.scope, personalDataVisible: false }, { scopeId: secondScope, personalDataVisible: true }] }), 200);
    expect(await planning(session.accessToken), 403);
    expect(await request('GET', `/planning/options?responsibilityScopeId=${ids.scope}`, undefined, session.accessToken), 403);
    expect(await request('PUT', '/planning', { businessDate: '2026-09-26', responsibilityScopeId: ids.scope, templateId: 'general', version: 0, rows: [] }, session.accessToken), 403);
    expect(await planning(session.accessToken, secondScope), 200);
    assert.deepEqual((await context(session.accessToken)).scopes.map(scope => scope.responsibilityScopeId), [secondScope]);
    state = expect(await save(created.id, { version: state.version, grants: [{ scopeId: ids.scope, personalDataVisible: false }] }), 200);
    expect(await planning(session.accessToken, secondScope), 403);
    assert.deepEqual(await context(session.accessToken), { scopes: [] });
    assert.equal((await grants(created.id)).length, 1);
    const me = expect(await request('GET', '/me', undefined, session.accessToken), 200);
    assert.equal(me.role, 'dispatcher');
    assert.equal(me.grants[0].financeVisible, true);
    assert.equal(me.grants[0].inspectionPhotoDelete, true);
    expect(await save(created.id, { version: state.version, grants: [] }), 400);
    assert.deepEqual(await editor(created.id), state);
  });

  await t.test('concurrent editors cannot overwrite another administrator change', async () => {
    const before = await editor(manager.id);
    const updates = [
      { version: before.version, grants: [{ scopeId: ids.scope, personalDataVisible: true }] },
      { version: before.version, grants: [{ scopeId: secondScope, personalDataVisible: true }] },
    ];
    const results = await Promise.all(updates.map(update => save(manager.id, update)));
    assert.deepEqual(results.map(response => response.status).sort(), [200, 409]);
    const winner = results.find(response => response.status === 200).body;
    assert.deepEqual(await editor(manager.id), winner);
    assert.equal((await events(manager.id, 'access.planning_access_changed')).length, winner.grants[0].scopeId === ids.scope ? 1 : 2);
    const managerSession = await devLogin(manager.id);
    expect(await planning(managerSession.accessToken, winner.grants[0].scopeId), 200);
  });

  await t.test('strict inputs prevent role changes, arbitrary flags, duplicate scopes and malformed versions', async () => {
    const before = await editor();
    const originalGrants = await grants(ids.dispatcher);
    const usersBefore = (await db.query('SELECT count(*)::int AS count FROM users')).rows[0].count;
    expect(await create(null), 400);
    for (const patch of [
      { displayName: ' ' }, { displayName: 'Bad\nName' }, { displayName: 'x'.repeat(161) }, { role: 'access_admin' },
      { role: 'recruiter' }, { financeVisible: true }, { inspectionPhotoDelete: true }, { password: 'forbidden' },
      { personalDataVisible: 'true' }, { personalDataVisible: null }, { scopeId: 'invalid' }, { idempotencyKey: 'invalid' },
    ]) expect(await create({ ...input, idempotencyKey: randomUUID(), ...patch }), 400);
    for (const update of [
      { grants: before.grants }, { version: '', grants: before.grants }, { version: 1, grants: before.grants },
      { version: before.version, grants: {} }, { version: before.version, grants: [before.grants[0], before.grants[0]] },
      { version: before.version, grants: [{ scopeId: 'invalid', personalDataVisible: true }] },
      { version: before.version, grants: [{ scopeId: ids.scope }] },
      { version: before.version, grants: [{ scopeId: ids.scope, personalDataVisible: 'false' }] },
      { version: before.version, grants: [{ ...before.grants[0], financeVisible: true }] },
      { version: before.version, grants: [{ ...before.grants[0], inspectionPhotoDelete: true }] },
      { version: before.version, grants: before.grants, role: 'access_admin' },
      { version: before.version, grants: before.grants, password: 'forbidden' },
    ]) expect(await save(ids.dispatcher, update), 400);
    expect(await save(ids.dispatcher, null), 400);
    expect(await read('invalid'), 400);
    expect(await save('invalid', { version: before.version, grants: before.grants }), 400);
    assert.deepEqual(await grants(ids.dispatcher), originalGrants);
    assert.equal((await db.query('SELECT count(*)::int AS count FROM users')).rows[0].count, usersBefore);
  });

  await t.test('no caller can edit non-planners, themselves, inactive or incompletely manageable employees', async () => {
    const state = await editor();
    const update = { version: state.version, grants: state.grants };
    expect(await request('GET', `/access/employees/${ids.dispatcher}/planning-access`), 401);
    expect(await request('PUT', `/access/employees/${ids.dispatcher}/planning-access`, update), 401);
    expect(await request('POST', '/access/employees/planner', { ...input, idempotencyKey: randomUUID() }), 401);
    for (const token of [driver.accessToken, dispatcher.accessToken, session.accessToken]) {
      expect(await read(ids.dispatcher, token), 403);
      expect(await save(ids.dispatcher, update, token), 403);
      expect(await create({ ...input, idempotencyKey: randomUUID() }, token), 403);
    }
    for (const target of [ids.admin, ids.drivers[0], ids.mechanic, ids.specialist, randomUUID()]) {
      expect(await read(target), 403);
      expect(await save(target, update), 403);
    }
    for (const column of ['active', 'approved']) {
      await db.query(`UPDATE users SET ${column}=false WHERE id=$1`, [ids.dispatcher]);
      expect(await read(), 403);
      expect(await save(ids.dispatcher, update), 403);
      await db.query(`UPDATE users SET ${column}=true WHERE id=$1`, [ids.dispatcher]);
    }
    await db.query(`INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id)
      VALUES($1,$2,$3,$4,$5)`, [ids.dispatcher, ids.legal, ids.region, ids.project, foreignScope]);
    expect(await read(), 403);
    expect(await save(ids.dispatcher, update), 403);
    await db.query('DELETE FROM access_grants WHERE user_id=$1 AND responsibility_scope_id=$2', [ids.dispatcher, foreignScope]);
    await db.query('UPDATE access_grants SET finance_visible=false WHERE user_id=$1 AND responsibility_scope_id=$2', [ids.admin, ids.scope]);
    expect(await read(created.id), 403);
    expect(await save(created.id, update), 403);
    await db.query('UPDATE access_grants SET finance_visible=true WHERE user_id=$1 AND responsibility_scope_id=$2', [ids.admin, ids.scope]);
  });

  await t.test('scope and personal-data ceilings are checked for additions and creation without partial writes', async () => {
    const state = await editor();
    for (const targetScope of [foreignScope, randomUUID()]) {
      expect(await create({ ...input, scopeId: targetScope, idempotencyKey: randomUUID() }), 403);
      expect(await save(ids.dispatcher, { version: state.version, grants: [...state.grants, { scopeId: targetScope, personalDataVisible: false }] }), 403);
    }
    expect(await create({ ...input, scopeId: limitedScope, idempotencyKey: randomUUID() }), 403);
    expect(await save(ids.dispatcher, { version: state.version, grants: [...state.grants, { scopeId: limitedScope, personalDataVisible: true }] }), 403);
    assert.deepEqual(await editor(), state);
    const limited = expect(await create({ ...input, scopeId: limitedScope, personalDataVisible: false, idempotencyKey: randomUUID() }), 201);
    const limitedState = await editor(limited.id);
    assert.deepEqual(limitedState.grants, [{ scopeId: limitedScope, personalDataVisible: false }]);
    assert.equal(limitedState.scopes.find(scope => scope.id === limitedScope).personalDataVisible, false);
    expect(await save(limited.id, { version: limitedState.version, grants: [{ scopeId: limitedScope, personalDataVisible: true }] }), 403);
    const added = expect(await save(ids.dispatcher, { version: state.version, grants: [...state.grants, { scopeId: limitedScope, personalDataVisible: false }] }), 200);
    expect(await save(ids.dispatcher, { version: added.version, grants: state.grants }), 200);
  });

  await t.test('impersonated administrators cannot create or edit planning access', async () => {
    const delegatedId = randomUUID();
    await db.query("INSERT INTO users(id,display_name,role,active,approved) VALUES($1,'Synthetic delegated planning administrator','access_admin',true,true)", [delegatedId]);
    await db.query(`INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id,personal_data_visible)
      VALUES($1,$2,$3,$4,$5,true)`, [delegatedId, ids.legal, ids.region, ids.project, ids.scope]);
    const impersonated = expect(await request('POST', '/auth/impersonate', { userId: delegatedId }, admin.accessToken), 200);
    const state = await editor();
    expect(await read(ids.dispatcher, impersonated.accessToken), 403);
    expect(await save(ids.dispatcher, { version: state.version, grants: state.grants }, impersonated.accessToken), 403);
    expect(await create({ ...input, idempotencyKey: randomUUID() }, impersonated.accessToken), 403);
  });

  await t.test('an audit failure rolls back every grant change and planner creation', async () => {
    const before = await editor();
    const stored = await grants(ids.dispatcher);
    const count = (await events(ids.dispatcher, 'access.planning_access_changed')).length;
    const failedInput = { ...input, idempotencyKey: randomUUID() };
    const usersBefore = (await db.query('SELECT count(*)::int AS count FROM users')).rows[0].count;
    await db.query(`CREATE FUNCTION test_reject_planning_access_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.payload->>'action' IN ('access.planning_access_changed','access.planner_created') THEN
        RAISE EXCEPTION 'Synthetic planning access rollback'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER test_planning_access_audit BEFORE INSERT ON audit_events
        FOR EACH ROW EXECUTE FUNCTION test_reject_planning_access_audit()`);
    try {
      expect(await save(ids.dispatcher, { version: before.version, grants: [{ scopeId: secondScope, personalDataVisible: true }] }), 500);
      assert.deepEqual(await editor(), before);
      assert.deepEqual(await grants(ids.dispatcher), stored);
      assert.equal((await events(ids.dispatcher, 'access.planning_access_changed')).length, count);
      expect(await create(failedInput), 500);
      assert.equal((await db.query('SELECT count(*)::int AS count FROM users')).rows[0].count, usersBefore);
      assert.equal((await db.query('SELECT 1 FROM employee_creation_requests WHERE idempotency_key=$1', [failedInput.idempotencyKey])).rowCount, 0);
    } finally {
      await db.query('DROP TRIGGER test_planning_access_audit ON audit_events; DROP FUNCTION test_reject_planning_access_audit()');
    }
    expect(await create(failedInput), 201);
  });

  await t.test('authority and session are rechecked after a pending save acquires its user lock', async () => {
    const target = expect(await create({ ...input, idempotencyKey: randomUUID(), personalDataVisible: false }), 201);
    const before = await editor(target.id);
    for (const revoked of ['personal-data', 'session']) {
      const actor = await devLogin(ids.admin);
      const client = await db.connect();
      let pending;
      try {
        await client.query('BEGIN');
        await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [ids.admin]);
        pending = save(target.id, { version: before.version, grants: [{ scopeId: ids.scope, personalDataVisible: true }] }, actor.accessToken);
        const deadline = Date.now() + 5000;
        let waiting = false;
        while (Date.now() < deadline) {
          waiting = (await db.query("SELECT 1 FROM pg_stat_activity WHERE usename='transport_app' AND wait_event_type='Lock' AND query LIKE 'SELECT id FROM users WHERE%'")).rowCount > 0;
          if (waiting) break;
          await delay(20);
        }
        assert.ok(waiting, 'The HTTP mutation must be waiting for the administrator user lock');
        if (revoked === 'personal-data') await client.query('UPDATE access_grants SET personal_data_visible=false WHERE user_id=$1 AND responsibility_scope_id=$2', [ids.admin, ids.scope]);
        else await client.query('UPDATE sessions SET revoked_at=now() WHERE id=$1', [actor.actor.sessionId]);
        await client.query('COMMIT');
        expect(await pending, revoked === 'session' ? 401 : 403);
      } finally {
        await client.query('ROLLBACK');
        client.release();
        if (pending) await pending;
        await db.query('UPDATE access_grants SET personal_data_visible=true WHERE user_id=$1 AND responsibility_scope_id=$2', [ids.admin, ids.scope]);
      }
      assert.deepEqual(await editor(target.id), before);
    }
    assert.equal((await events(target.id, 'access.planning_access_changed')).length, 0);
    await fixture.restartApi();
    expect(await planning(dispatcher.accessToken), 200);
    assert.equal(expect(await request('POST', '/auth/password', { phone: credentials.phone, password: credentials.password }), 200).actor.id, created.id);
  });
});
