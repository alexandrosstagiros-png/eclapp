'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createTestServer } = require('./local-test-server.cjs');

test('named internal recruiters have scoped, audited onboarding without changing existing credentials', { timeout: 180000 }, async t => {
  const fixture = await createTestServer();
  t.after(() => fixture.close());
  const { ids, adminPool: db, request, devLogin } = fixture;
  process.env.DEMO_EMPLOYEE_CREATION_ENABLED = 'false';
  await fixture.restartApi();
  const admin = await devLogin(ids.admin);
  const expect = (response, status) => { assert.equal(response.status, status, JSON.stringify(response.body)); return response.body; };
  const create = (body, token = admin.accessToken) => request('POST', '/access/employees/recruiter', body, token);
  const input = { displayName: 'Синтетический штатный рекрутер', scopeId: ids.scope, idempotencyKey: randomUUID() };
  let employee, session;

  await t.test('administrator must already have personal-data access for the selected scope', async () => {
    await db.query('UPDATE access_grants SET personal_data_visible=false WHERE user_id=$1', [ids.admin]);
    const options = expect(await request('GET', '/access/employees/options', undefined, admin.accessToken), 200);
    assert.equal(options.demoCreationEnabled, false);
    assert.equal(options.recruiterCreationEnabled, false);
    assert.deepEqual(options.recruiterScopes, []);
    expect(await create(input), 403);
    assert.equal((await db.query('SELECT 1 FROM employee_creation_requests WHERE idempotency_key=$1', [input.idempotencyKey])).rowCount, 0);
    await db.query('UPDATE access_grants SET personal_data_visible=true WHERE user_id=$1 AND responsibility_scope_id=$2', [ids.admin, ids.scope]);
    const permitted = expect(await request('GET', '/access/employees/options', undefined, admin.accessToken), 200);
    assert.equal(permitted.recruiterCreationEnabled, true);
    assert.deepEqual(permitted.recruiterScopes.map(scope => scope.id), [ids.scope]);
  });

  await t.test('concurrent retries create exactly one real internal account and audit event', async () => {
    const responses = await Promise.all([create(input), create(input)]);
    employee = expect(responses[0], 201);
    assert.equal(expect(responses[1], 201).id, employee.id);
    assert.equal(employee.displayName, input.displayName);
    assert.equal(employee.role, 'recruiter');
    assert.equal(employee.sourceKind, 'internal_manual');
    assert.equal(employee.phoneLoginEnabled, false);
    assert.deepEqual((await db.query('SELECT finance_visible,personal_data_visible FROM access_grants WHERE user_id=$1', [employee.id])).rows,
      [{ finance_visible: false, personal_data_visible: true }]);
    assert.equal((await db.query("SELECT 1 FROM audit_events WHERE payload->>'action'='access.recruiter_created' AND payload->>'entityId'=$1", [employee.id])).rowCount, 1);
    expect(await create({ ...input, displayName: 'Изменённое имя' }), 409);
  });

  await t.test('invalid inputs and privilege escalation are rejected without writing an account', async () => {
    const before = (await db.query('SELECT count(*)::int AS count FROM users')).rows[0].count;
    for (const patch of [{ displayName: ' ' }, { displayName: 'Bad\nName' }, { displayName: 'x'.repeat(161) },
      { role: 'access_admin' }, { personalDataVisible: true }, { financeVisible: true }, { idempotencyKey: 'invalid' }]) {
      expect(await create({ ...input, ...patch }), 400);
    }
    expect(await create({ ...input, idempotencyKey: randomUUID(), scopeId: randomUUID() }), 403);
    const driver = await devLogin(ids.drivers[0]);
    expect(await create({ ...input, idempotencyKey: randomUUID() }, driver.accessToken), 403);
    assert.equal((await db.query('SELECT count(*)::int AS count FROM users')).rows[0].count, before);
  });

  await t.test('standard password onboarding opens recruiting and retains the limited role', async () => {
    const issued = expect(await request('POST', `/access/users/${employee.id}/password`, { phone: '+79990007191' }, admin.accessToken), 201);
    session = expect(await request('POST', '/auth/password', { phone: issued.phone, password: issued.password }), 200);
    assert.equal(expect(await request('GET', '/me', undefined, session.accessToken), 200).role, 'recruiter');
    const context = expect(await request('GET', '/recruitment/context', undefined, session.accessToken), 200);
    assert.ok(context.scopes.some(scope => scope.responsibilityScopeId === ids.scope));
    expect(await request('GET', `/recruitment?responsibilityScopeId=${ids.scope}`, undefined, session.accessToken), 200);
    expect(await request('GET', '/access/employees/options', undefined, session.accessToken), 403);
    expect(await request('GET', '/finance/tariffs', undefined, session.accessToken), 403);
    const users = expect(await request('GET', '/access/employees?role=recruiter', undefined, admin.accessToken), 200);
    assert.ok(users.items.some(item => item.id === employee.id));
  });

  await t.test('existing recruiters join an authorized scope exactly once without password or role changes', async () => {
    const secondScope = randomUUID(), foreignScope = randomUUID();
    await db.query('INSERT INTO responsibility_scopes(id,project_id,name) VALUES($1,$2,$3),($4,$2,$5)',
      [secondScope, ids.project, 'Synthetic additional recruiting scope', foreignScope, 'Synthetic foreign scope']);
    await db.query(`INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id,personal_data_visible)
      VALUES($1,$2,$3,$4,$5,true)`, [ids.admin, ids.legal, ids.region, ids.project, secondScope]);
    const credentials = (await db.query('SELECT * FROM phone_credentials WHERE user_id=$1', [employee.id])).rows[0];
    const attach = (body, token = admin.accessToken) => request('POST', '/access/employees/recruiter-scope', body, token);
    const body = { userId: employee.id, scopeId: secondScope };
    for (const response of await Promise.all([attach(body), attach(body)])) assert.equal(expect(response, 201).id, employee.id);
    assert.equal((await db.query('SELECT role FROM users WHERE id=$1', [employee.id])).rows[0].role, 'recruiter');
    assert.deepEqual((await db.query('SELECT * FROM phone_credentials WHERE user_id=$1', [employee.id])).rows[0], credentials);
    assert.equal((await db.query('SELECT 1 FROM access_grants WHERE user_id=$1', [employee.id])).rowCount, 2);
    assert.equal((await db.query("SELECT 1 FROM audit_events WHERE payload->>'action'='access.recruiter_scope_added' AND payload->>'entityId'=$1", [employee.id])).rowCount, 1);
    assert.equal(expect(await request('GET', '/me', undefined, session.accessToken), 200).grants.length, 2);
    expect(await attach({ ...body, userId: ids.drivers[0] }), 403);
    expect(await attach({ ...body, scopeId: foreignScope }), 403);
    expect(await attach(body, session.accessToken), 403);
    expect(await attach({ ...body, financeVisible: true }), 400);
    expect(await attach({ ...body, password: 'forbidden-reset' }), 400);
    await db.query('UPDATE access_grants SET personal_data_visible=false WHERE user_id=$1 AND responsibility_scope_id=$2', [employee.id, secondScope]);
    expect(await attach(body), 409);
    await db.query('UPDATE access_grants SET personal_data_visible=true WHERE user_id=$1 AND responsibility_scope_id=$2', [employee.id, secondScope]);
    await db.query('UPDATE users SET active=false WHERE id=$1', [employee.id]);
    expect(await attach(body), 403);
    await db.query('UPDATE users SET active=true WHERE id=$1', [employee.id]);
    await db.query(`INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id,personal_data_visible)
      VALUES($1,$2,$3,$4,$5,true)`, [employee.id, ids.legal, ids.region, ids.project, foreignScope]);
    expect(await attach(body), 403);
    assert.deepEqual((await db.query('SELECT * FROM phone_credentials WHERE user_id=$1', [employee.id])).rows[0], credentials);
  });
});
