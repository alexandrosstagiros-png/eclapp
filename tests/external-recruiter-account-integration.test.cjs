'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const { createRequire } = require('node:module');
const { createTestServer } = require('./local-test-server.cjs');
const appRequire = createRequire(path.resolve(__dirname, '../recovered/package.json'));

test('external recruitment accounts have idempotent real onboarding and a closed API surface', { timeout: 180000 }, async t => {
  const fixture = await createTestServer();
  t.after(() => fixture.close());
  const { ids, adminPool: db, request, devLogin } = fixture;
  await db.query('UPDATE access_grants SET personal_data_visible=true WHERE user_id=$1 AND responsibility_scope_id=$2', [ids.admin, ids.scope]);
  const admin = await devLogin(ids.admin);
  const createInput = { displayName: 'Синтетический внешний рекрутер', scopeId: ids.scope, idempotencyKey: randomUUID() };
  const expect = (res, status) => { assert.equal(res.status, status, JSON.stringify(res.body)); return res.body; };
  const create = (body, token = admin.accessToken) => request('POST', '/access/employees/external', body, token);
  let employee, session;
  await t.test('admin creates exactly one account with no finance or published requests', async () => {
    const results = await Promise.all([create(createInput), create(createInput)]);
    employee = expect(results[0], 201);
    assert.equal(expect(results[1], 201).id, employee.id);
    assert.equal(employee.role, 'external_recruiter');
    assert.equal(employee.sourceKind, 'external_manual');
    assert.equal(employee.displayName, createInput.displayName);
    assert.deepEqual((await db.query('SELECT finance_visible,personal_data_visible FROM access_grants WHERE user_id=$1', [employee.id])).rows,
      [{ finance_visible: false, personal_data_visible: true }]);
    expect(await create({ ...createInput, displayName: 'Changed' }), 409);
    const ctx = await devLogin(employee.id);
    assert.deepEqual(expect(await request('GET', '/recruitment/context', undefined, ctx.accessToken), 200).scopes, []);
    expect(await request('GET', `/recruitment?responsibilityScopeId=${ids.scope}`, undefined, ctx.accessToken), 403);
    assert.equal((await db.query("SELECT 1 FROM audit_events WHERE payload->>'action'='access.external_recruiter_created' AND payload->>'entityId'=$1", [employee.id])).rowCount, 1);
  });
  await t.test('validates scope, name and extra privilege fields before writing', async () => {
    for (const body of [
      { ...createInput, displayName: ' ' }, { ...createInput, displayName: 'Bad\nname' },
      { ...createInput, role: 'access_admin' }, { ...createInput, personalDataVisible: true },
      { ...createInput, idempotencyKey: 'bad' },
    ]) expect(await create(body), 400);
    expect(await create({ ...createInput, idempotencyKey: randomUUID(), scopeId: randomUUID() }), 403);
    const driver = await devLogin(ids.drivers[0]);
    expect(await create(createInput, driver.accessToken), 403);
  });
  await t.test('phone credentials and current identity preserve the external role', async () => {
    const issued = expect(await request('POST', `/access/users/${employee.id}/password`, { phone: '+79990007654' }, admin.accessToken), 201);
    session = expect(await request('POST', '/auth/password', { phone: issued.phone, password: issued.password }), 200);
    assert.equal(expect(await request('GET', '/me', undefined, session.accessToken), 200).role, 'external_recruiter');
    const users = expect(await request('GET', '/access/employees?role=external_recruiter', undefined, admin.accessToken), 200);
    assert.ok(users.items.some(item => item.id === employee.id));
  });
  await t.test('external grants never open employee, planning, trip, communication or notification APIs', async () => {
    for (const route of ['/access/employees', '/access/employees/options', '/planning/context', '/trips',
      '/communications/catalog', '/communications/tickets', '/notifications', '/notifications/status', '/finance/tariffs', '/me/payroll']) {
      expect(await request('GET', route, undefined, session.accessToken), 403);
    }
    expect(await create({ ...createInput, idempotencyKey: randomUUID() }, session.accessToken), 403);
    expect(await request('POST', '/auth/impersonate', { userId: ids.admin }, session.accessToken), 403);
    const { eligibleRecipient } = appRequire(path.resolve(__dirname, '../recovered/apps/api/src/modules/notifications/notification-enqueue.js'));
    const scope = { legalEntityId: ids.legal, regionId: ids.region, projectId: ids.project, responsibilityScopeId: ids.scope };
    for (const entity of ['trip', 'trip_assignment', 'notification_message'])
      assert.equal(await eligibleRecipient(db, employee.id, scope, entity, randomUUID()), false);
  });
  await t.test('administrator can return from external impersonation', async () => {
    const child = expect(await request('POST', '/auth/impersonate', { userId: employee.id }, admin.accessToken), 200);
    assert.equal(child.actor.role, 'external_recruiter');
    expect(await request('GET', '/me', undefined, child.accessToken), 200);
    expect(await request('POST', '/auth/impersonate/stop', {}, child.accessToken), 200);
    expect(await request('GET', '/me', undefined, child.accessToken), 401);
  });
  await t.test('one existing recruiter can join another managed scope without new login or implicit requests', async () => {
    const scope = randomUUID(), forbiddenScope = randomUUID();
    await db.query('INSERT INTO responsibility_scopes(id,project_id,name) VALUES($1,$2,$3),($4,$2,$5)',
      [scope, ids.project, 'Synthetic second recruitment scope', forbiddenScope, 'Synthetic unmanageable scope']);
    await db.query(`INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id,personal_data_visible)
      VALUES($1,$2,$3,$4,$5,true)`, [ids.admin, ids.legal, ids.region, ids.project, scope]);
    const attach = (body, token = admin.accessToken) => request('POST', '/access/employees/external-scope', body, token);
    const body = { userId: employee.id, scopeId: scope };
    const results = await Promise.all([attach(body), attach(body)]);
    for (const result of results) assert.equal(expect(result, 201).id, employee.id);
    assert.equal((await db.query('SELECT 1 FROM access_grants WHERE user_id=$1', [employee.id])).rowCount, 2);
    assert.equal((await db.query("SELECT 1 FROM audit_events WHERE payload->>'action'='access.external_recruiter_scope_added' AND payload->>'entityId'=$1", [employee.id])).rowCount, 1);
    assert.equal(expect(await request('GET', '/me', undefined, session.accessToken), 200).grants.length, 2);
    assert.deepEqual(expect(await request('GET', '/recruitment/context', undefined, session.accessToken), 200).scopes, []);
    expect(await attach({ ...body, scopeId: forbiddenScope }), 403);
    expect(await attach(body, session.accessToken), 403);
    expect(await attach({ ...body, userId: ids.drivers[0] }), 403);
    expect(await attach({ ...body, financeVisible: true }), 400);
    // A previously manageable user is no longer manageable when a foreign scope
    // is attached. Merely knowing their id must not authorize another grant.
    await db.query(`INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id,personal_data_visible)
      VALUES($1,$2,$3,$4,$5,true)`, [employee.id, ids.legal, ids.region, ids.project, forbiddenScope]);
    expect(await attach(body), 403);
  });
});
