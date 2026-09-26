'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createTestServer } = require('./local-test-server.cjs');

test('chief mechanic photo permission is explicit, scoped, administrator managed and audited', { timeout: 180000 }, async t => {
  const fixture = await createTestServer();
  t.after(() => fixture.close());
  const { ids, adminPool: db, request, devLogin } = fixture;
  const admin = await devLogin(ids.admin), mechanic = await devLogin(ids.mechanic), driver = await devLogin(ids.drivers[0]);
  const expect = (response, status) => { assert.equal(response.status, status, JSON.stringify(response.body)); return response.body; };
  const update = (enabled, { userId = ids.mechanic, scopeId = ids.scope, token = admin.accessToken, ...extra } = {}) =>
    request('PATCH', `/access/employees/${userId}/inspection-photo-permission`, { scopeId, enabled, ...extra }, token);
  const enabled = async (userId = ids.mechanic, scopeId = ids.scope) => (await db.query(
    'SELECT inspection_photo_delete FROM access_grants WHERE user_id=$1 AND responsibility_scope_id=$2', [userId, scopeId])).rows[0]?.inspection_photo_delete;
  const audit = async () => (await db.query("SELECT payload FROM audit_events WHERE payload->>'action'='access.inspection_photo_permission_changed' ORDER BY sequence" )).rows;
  const list = async () => expect(await request('GET', '/access/employees?role=mechanic&limit=50', undefined, admin.accessToken), 200).items;
  const me = async token => expect(await request('GET', '/me', undefined, token), 200);

  await t.test('no existing or new mechanic is automatically appointed and personal-data authority is required', async () => {
    assert.equal((await db.query('SELECT 1 FROM access_grants WHERE inspection_photo_delete')).rowCount, 0);
    assert.equal(mechanic.actor.grants[0].inspectionPhotoDelete, false);
    expect(await update(true), 403);
    assert.equal(await enabled(), false);
    await db.query('UPDATE access_grants SET personal_data_visible=true WHERE user_id=$1 AND responsibility_scope_id=$2', [ids.admin, ids.scope]);
    const existing = (await list()).find(row => row.id === ids.mechanic);
    assert.equal(existing.scopes[0].inspectionPhotoDelete, false);
    assert.equal(existing.scopes[0].canManageInspectionPhotoDelete, true);
    assert.equal(existing.scopes[0].personalDataVisible, true);
    const created = expect(await request('POST', '/access/employees/demo', { role: 'mechanic', scopeId: ids.scope, idempotencyKey: randomUUID() }, admin.accessToken), 201);
    assert.equal(created.scopes[0].inspectionPhotoDelete, false);
    assert.equal(created.scopes[0].personalDataVisible, false);
    assert.equal(await enabled(created.id), false);
  });

  await t.test('saving and removing the permission updates the existing session immediately and audits only a changed flag', async () => {
    const granted = expect(await update(true), 200);
    assert.equal(granted.scopes[0].inspectionPhotoDelete, true);
    assert.equal((await me(mechanic.accessToken)).grants[0].inspectionPhotoDelete, true);
    const first = await audit();
    assert.equal(first.length, 1);
    assert.equal(first[0].payload.entityId, ids.mechanic);
    assert.equal(first[0].payload.scope.responsibilityScopeId, ids.scope);
    assert.deepEqual(first[0].payload.metadata, { previousInspectionPhotoDelete: false, inspectionPhotoDelete: true });
    expect(await update(true), 200);
    assert.equal((await audit()).length, 1);
    expect(await update(false), 200);
    assert.equal((await me(mechanic.accessToken)).grants[0].inspectionPhotoDelete, false);
    assert.equal((await audit()).length, 2);
  });

  await t.test('drivers, ordinary mechanics, impersonation and non-mechanic targets cannot grant the permission', async () => {
    for (const token of [mechanic.accessToken, driver.accessToken]) expect(await update(true, { token }), 403);
    for (const userId of [ids.drivers[0], ids.admin, randomUUID()]) expect(await update(true, { userId }), 403);
    const administratorId = randomUUID();
    await db.query("INSERT INTO users(id,display_name,role,active,approved) VALUES($1,'Synthetic delegated administrator','access_admin',true,true)", [administratorId]);
    await db.query(`INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id,personal_data_visible)
      SELECT $1,legal_entity_id,region_id,project_id,responsibility_scope_id,true FROM access_grants WHERE user_id=$2`, [administratorId, ids.admin]);
    const impersonated = expect(await request('POST', '/auth/impersonate', { userId: administratorId }, admin.accessToken), 200);
    expect(await update(true, { token: impersonated.accessToken }), 403);
    assert.equal(await enabled(), false);
  });

  await t.test('validates inputs without coercion or arbitrary permission fields', async () => {
    for (const value of [null, 'true', 'false', 0, 1, {}, []]) expect(await update(value), 400);
    expect(await update(true, { userId: 'not-a-uuid' }), 400);
    expect(await update(true, { scopeId: 'not-a-uuid' }), 400);
    expect(await update(true, { financeVisible: true }), 400);
    expect(await request('PATCH', `/access/employees/${ids.mechanic}/inspection-photo-permission`, { scopeId: ids.scope }, admin.accessToken), 400);
    assert.equal(await enabled(), false);
  });

  await t.test('requires authority over every target grant and changes only the selected existing scope', async () => {
    const foreignScope = randomUUID();
    await db.query('INSERT INTO responsibility_scopes(id,project_id,name) VALUES($1,$2,$3)', [foreignScope, ids.project, 'Synthetic chief mechanic second scope']);
    expect(await update(true, { scopeId: foreignScope }), 403);
    await db.query(`INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id,personal_data_visible)
      VALUES($1,$2,$3,$4,$5,true)`, [ids.mechanic, ids.legal, ids.region, ids.project, foreignScope]);
    expect(await update(true), 403);
    assert.equal((await list()).some(row => row.id === ids.mechanic), false);
    await db.query(`INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id,personal_data_visible)
      VALUES($1,$2,$3,$4,$5,true)`, [ids.admin, ids.legal, ids.region, ids.project, foreignScope]);
    expect(await update(true), 200);
    assert.equal(await enabled(), true);
    assert.equal(await enabled(ids.mechanic, foreignScope), false);
    expect(await update(false), 200);
    await db.query('UPDATE access_grants SET finance_visible=true WHERE user_id=$1 AND responsibility_scope_id=$2', [ids.mechanic, foreignScope]);
    expect(await update(true), 403);
    await db.query('UPDATE access_grants SET finance_visible=false WHERE user_id=$1 AND responsibility_scope_id=$2', [ids.mechanic, foreignScope]);
    await db.query('UPDATE access_grants SET personal_data_visible=false WHERE user_id=$1 AND responsibility_scope_id=$2', [ids.admin, ids.scope]);
    expect(await update(true), 403);
    await db.query('UPDATE access_grants SET personal_data_visible=true WHERE user_id=$1 AND responsibility_scope_id=$2', [ids.admin, ids.scope]);
  });

  await t.test('an audit failure rolls back the permission; inactive and unapproved mechanics cannot be appointed', async () => {
    const before = (await audit()).length;
    await db.query(`CREATE FUNCTION test_reject_chief_permission_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.payload->>'action'='access.inspection_photo_permission_changed' THEN
        RAISE EXCEPTION 'Synthetic chief permission rollback'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER test_chief_permission_audit BEFORE INSERT ON audit_events
        FOR EACH ROW EXECUTE FUNCTION test_reject_chief_permission_audit()`);
    try {
      expect(await update(true), 500);
      assert.equal(await enabled(), false);
      assert.equal((await audit()).length, before);
    } finally {
      await db.query('DROP TRIGGER test_chief_permission_audit ON audit_events; DROP FUNCTION test_reject_chief_permission_audit()');
    }
    await db.query('UPDATE users SET active=false WHERE id=$1', [ids.mechanic]);
    expect(await update(true), 403);
    assert.equal((await list()).find(row => row.id === ids.mechanic).scopes[0].canManageInspectionPhotoDelete, false);
    await db.query('UPDATE users SET active=true,approved=false WHERE id=$1', [ids.mechanic]);
    expect(await update(true), 403);
    await db.query('UPDATE users SET approved=true WHERE id=$1', [ids.mechanic]);
    expect(await update(true), 200);
    await fixture.restartApi();
    assert.equal((await me(mechanic.accessToken)).grants.find(scope => scope.responsibilityScopeId === ids.scope).inspectionPhotoDelete, true);
    expect(await update(false), 200);
  });
});
