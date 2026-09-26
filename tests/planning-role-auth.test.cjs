const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createTestServer } = require('./local-test-server.cjs');

test('manager can sign in with phone/password and retain planning access after refresh', { timeout: 180000 }, async t => {
  const f = await createTestServer(); t.after(() => f.close());
  await f.adminPool.query('UPDATE access_grants SET personal_data_visible=true WHERE user_id=$1', [f.ids.admin]);
  const id = randomUUID();
  await f.adminPool.query("INSERT INTO users(id,display_name,role,active,approved) VALUES($1,'Менеджер тестового планирования','manager',true,true)", [id]);
  await f.adminPool.query("INSERT INTO employee_directory(user_id,source_kind) VALUES($1,'existing')", [id]);
  await f.adminPool.query(`INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id,personal_data_visible)
    SELECT $1,legal_entity_id,region_id,project_id,responsibility_scope_id,true FROM access_grants WHERE user_id=$2`, [id, f.ids.admin]);
  const admin = await f.devLogin(f.ids.admin);
  const issued = await f.request('POST', `/access/users/${id}/password`, { phone: '+79990000888' }, admin.accessToken);
  assert.equal(issued.status, 201);
  const login = await f.request('POST', '/auth/password', { phone: '+79990000888', password: issued.body.password });
  assert.equal(login.status, 200);
  assert.equal(login.body.actor.role, 'manager');
  const token = login.body.accessToken;
  assert.equal((await f.request('GET', '/me', undefined, token)).body.role, 'manager');
  const context = await f.request('GET', '/planning/context', undefined, token);
  assert.equal(context.status, 200);
  assert.ok(context.body.scopes.length > 0);
  assert.equal((await f.request('GET', '/health/ready')).status, 200);
  await f.request('POST', '/auth/logout', undefined, token);
  assert.equal((await f.request('GET', '/planning/context', undefined, token)).status, 401);
});
