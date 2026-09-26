'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, createHash } = require('node:crypto');
const { createTestServer } = require('./local-test-server.cjs');

test('external recruiter invitation is one-use, scoped, private and atomic', { timeout: 180000 }, async t => {
  const fixture = await createTestServer();
  t.after(() => fixture.close());
  const { ids, request, devLogin, adminPool: db, origin } = fixture;
  const expect = (result, status = 200) => { assert.equal(result.status, status, JSON.stringify(result.body)); return result.body; };
  await db.query('UPDATE access_grants SET personal_data_visible=true WHERE user_id=$1 AND responsibility_scope_id=$2', [ids.admin, ids.scope]);
  const admin = await devLogin(ids.admin);
  const managerId = randomUUID();
  await db.query(`INSERT INTO users(id,display_name,role,approved) VALUES($1,'Synthetic manager','manager',true)`, [managerId]);
  await db.query(`INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id,personal_data_visible)
    VALUES($1,$2,$3,$4,$5,true)`, [managerId, ids.legal, ids.region, ids.project, ids.scope]);
  const manager = await devLogin(managerId);
  const demandBody = scopeId => ({ id: randomUUID(), responsibilityScopeId: scopeId, version: 0, title: 'INVITE_PRIVATE_PROJECT', city: 'Москва', kind: 'driver', quantity: 2, priority: 'normal', status: 'open', recruiterId: ids.admin, notes: 'INVITE_INTERNAL_SECRET', publicBrief: 'Public hiring information' });
  const demand = expect(await request('PUT', '/recruitment/requests', demandBody(ids.scope), admin.accessToken));
  const hidden = expect(await request('PUT', '/recruitment/requests', demandBody(ids.scope), admin.accessToken));
  const defaultInvite = { responsibilityScopeId: ids.scope, requestIds: [demand.id] };
  const create = (patch = {}, token = admin.accessToken) => request('POST', '/recruitment/invitations', { ...defaultInvite, ...patch }, token);
  const preview = token => request('POST', '/recruitment-invitations/preview', { token });
  const accept = body => request('POST', '/recruitment-invitations/accept', body, undefined, { Origin: origin, 'X-Session-Refresh': '1' });
  const newBody = (invitation, phone = '+79991234001') => ({ token: invitation.invitationToken, displayName: 'Самостоятельный рекрутер', phone, password: 'Recruiter synthetic password 123!' });
  const list = () => request('GET', `/recruitment/invitations?responsibilityScopeId=${ids.scope}`, undefined, admin.accessToken);
  const revoke = invite => request('POST', `/recruitment/invitations/${invite.id}/revoke`, { responsibilityScopeId: ids.scope }, admin.accessToken);
  let invitation, account;

  await t.test('admin generates a secret without creating an account or entering any identity', async () => {
    const before = (await db.query('SELECT count(*)::int AS count FROM users')).rows[0].count;
    invitation = expect(await create(), 201);
    assert.match(invitation.invitationToken, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(invitation.status, 'pending');
    assert.equal((await db.query('SELECT count(*)::int AS count FROM users')).rows[0].count, before);
    const stored = (await db.query('SELECT * FROM recruitment_invitations WHERE id=$1', [invitation.id])).rows[0];
    assert.equal(stored.token_hash, createHash('sha256').update(invitation.invitationToken).digest('hex'));
    assert.ok(!JSON.stringify(stored).includes(invitation.invitationToken));
    const publicData = expect(await preview(invitation.invitationToken));
    assert.deepEqual(Object.keys(publicData).sort(), ['expiresAt', 'ready']);
    assert.equal(publicData.ready, true);
    assert.ok(!JSON.stringify(publicData).includes(demand.title));
    const listed = expect(await list());
    assert.equal(listed.invitations[0].id, invitation.id);
    assert.ok(!JSON.stringify(listed).includes(invitation.invitationToken));
    assert.ok(!JSON.stringify(listed).includes(stored.token_hash));
  });

  await t.test('only current unimpersonated scope administrator can generate/revoke/list', async () => {
    for (const token of [manager.accessToken, (await devLogin(ids.drivers[0])).accessToken]) {
      expect(await create({}, token), 403);
      expect(await request('GET', `/recruitment/invitations?responsibilityScopeId=${ids.scope}`, undefined, token), 403);
      expect(await request('POST', `/recruitment/invitations/${invitation.id}/revoke`, { responsibilityScopeId: ids.scope }, token), 403);
    }
    const impersonated = expect(await request('POST', '/auth/impersonate', { userId: managerId }, admin.accessToken));
    expect(await create({}, impersonated.accessToken), 403);
    expect(await create({ responsibilityScopeId: randomUUID() }), 403);
    expect(await create({ requestIds: [randomUUID()] }), 403);
    for (const patch of [{ requestIds: [] }, { displayName: 'Unrequested identity' }, { role: 'access_admin' },
      { expiresAt: new Date(Date.now() + 31 * 86400000).toISOString() }, { accessExpiresAt: new Date(0).toISOString() }]) expect(await create(patch), 400);
    const shortExpiry = new Date(Date.now() + 2 * 86400000).toISOString();
    const short = expect(await create({ accessExpiresAt: shortExpiry }), 201);
    assert.equal(short.expiresAt, shortExpiry);
    expect(await revoke(short), 201);
  });

  await t.test('signup owns name and phone; creates only selected access and clears stale remembered cookie', async () => {
    expect(await request('POST', '/recruitment-invitations/accept', newBody(invitation)), 403);
    expect(await request('POST', '/recruitment-invitations/accept', newBody(invitation), undefined,
      { Origin: 'https://untrusted.invalid', 'X-Session-Refresh': '1' }), 403);
    for (const patch of [{ displayName: '' }, { displayName: 'Injected\nname' }, { phone: 'invalid' }, { password: 'short' }, { role: 'manager' }])
      expect(await accept({ ...newBody(invitation), ...patch }), 400);
    const response = await fetch(`${origin}/api/v1/recruitment-invitations/accept`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, 'X-Session-Refresh': '1' },
      body: JSON.stringify(newBody(invitation, '8 (999) 123-40-01')),
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('set-cookie'), /Max-Age=0/);
    assert.match(response.headers.get('set-cookie'), /Path=\/api\/v1\/auth/);
    account = await response.json();
    assert.equal(account.actor.role, 'external_recruiter');
    assert.equal(account.actor.displayName, 'Самостоятельный рекрутер');
    assert.equal(account.rememberedDevice, false);
    assert.deepEqual(account.actor.grants.map(row => [row.responsibilityScopeId, row.financeVisible, row.personalDataVisible]), [[ids.scope, false, true]]);
    const record = (await db.query('SELECT source_kind FROM employee_directory WHERE user_id=$1', [account.actor.id])).rows[0];
    assert.equal(record.source_kind, 'external_invitation');
    const data = expect(await request('GET', `/recruitment?responsibilityScopeId=${ids.scope}`, undefined, account.accessToken));
    assert.deepEqual(data.requests.map(row => row.id), [demand.id]);
    assert.ok(!JSON.stringify(data).includes('INVITE_INTERNAL_SECRET'));
    assert.equal(expect(await list()).invitations.find(row => row.id === invitation.id).status, 'accepted');
    expect(await preview(invitation.invitationToken), 410);
    expect(await accept(newBody(invitation)), 410);
    expect(await request('POST', '/auth/password', { phone: '+79991234001', password: newBody(invitation).password, rememberDevice: false }));
    for (const route of ['/planning/context', '/access/employees', '/finance/tariffs']) expect(await request('GET', route, undefined, account.accessToken), 403);
  });

  await t.test('existing phone cannot overwrite identity; password-confirmed external account may add requests', async () => {
    const conflicting = expect(await create({ requestIds: [hidden.id], accessExpiresAt: new Date(Date.now() + 4 * 86400000).toISOString() }), 201);
    const priorAccess = (await db.query('SELECT * FROM recruitment_external_access WHERE user_id=$1', [account.actor.id])).rows[0];
    const conflict = expect(await accept({ ...newBody(conflicting), mode: 'existing' }), 409);
    assert.equal(conflict.code, 'RECRUITMENT_INVITATION_ACCESS_CONFLICT');
    assert.deepEqual((await db.query('SELECT * FROM recruitment_external_access WHERE user_id=$1', [account.actor.id])).rows[0], priorAccess);
    assert.equal((await db.query('SELECT consumed_at FROM recruitment_invitations WHERE id=$1', [conflicting.id])).rows[0].consumed_at, null);
    const invited = expect(await create({ requestIds: [hidden.id] }), 201);
    const before = (await db.query('SELECT * FROM phone_credentials WHERE user_id=$1', [account.actor.id])).rows[0];
    expect(await accept({ ...newBody(invited), displayName: 'Attacker replacement' }), 401);
    expect(await accept({ ...newBody(invited), mode: 'existing', password: 'Wrong password 123456' }), 401);
    const joined = expect(await accept({ ...newBody(invited), mode: 'existing', displayName: 'Ignored replacement' }));
    assert.equal(joined.actor.id, account.actor.id);
    assert.equal(joined.actor.displayName, account.actor.displayName);
    assert.deepEqual((await db.query('SELECT * FROM phone_credentials WHERE user_id=$1', [account.actor.id])).rows[0], before);
    const grant = (await db.query('SELECT request_ids,expires_at FROM recruitment_external_access WHERE user_id=$1', [account.actor.id])).rows[0];
    assert.deepEqual(new Set(grant.request_ids), new Set([demand.id, hidden.id]));
    assert.equal(grant.expires_at, null, 'equal scope expiry is preserved');
  });

  await t.test('employee phone cannot be converted to external; existing credential lockout applies', async () => {
    const employeePassword = expect(await request('POST', `/access/users/${managerId}/password`, { phone: '+79991234090' }, admin.accessToken), 201);
    const invited = expect(await create(), 201);
    expect(await accept({ token: invited.invitationToken, phone: employeePassword.phone, password: employeePassword.password, mode: 'existing' }), 401);
    assert.equal((await db.query('SELECT role FROM users WHERE id=$1', [managerId])).rows[0].role, 'manager');
    const lockout = expect(await create(), 201);
    for (let i = 0; i < 5; i++) expect(await accept({ ...newBody(lockout), mode: 'existing', password: 'Definitely wrong password' }), 401);
    expect(await accept({ ...newBody(lockout), mode: 'existing' }), 401);
    expect(await request('POST', '/auth/password', { phone: '+79991234001', password: newBody(lockout).password }), 401);
    await db.query('DELETE FROM phone_login_attempts');
    expect(await accept({ ...newBody(lockout), mode: 'existing' }));
  });

  await t.test('revoked/expired/unknown and no-longer-authorized-issuer links reveal no context', async () => {
    const gone = expect(await create(), 201);
    expect(await revoke(gone), 201);
    for (const token of [gone.invitationToken, 'not-a-token', 'a'.repeat(43)]) {
      assert.equal(expect(await preview(token), 410).code, 'RECRUITMENT_INVITATION_UNAVAILABLE');
      expect(await accept({ ...newBody(gone), token }), 410);
    }
    const expired = expect(await create(), 201);
    await db.query(`UPDATE recruitment_invitations SET created_at=clock_timestamp()-interval '2 days',expires_at=clock_timestamp()-interval '1 day' WHERE id=$1`, [expired.id]);
    expect(await preview(expired.invitationToken), 410);
    expect(await accept(newBody(expired, '+79991234020')), 410);
    const current = expect(await create(), 201);
    for (const [update, restore] of [
      ["UPDATE users SET active=false WHERE id=$1", "UPDATE users SET active=true WHERE id=$1"],
      ["UPDATE users SET approved=false WHERE id=$1", "UPDATE users SET approved=true WHERE id=$1"],
      ["UPDATE users SET role='manager' WHERE id=$1", "UPDATE users SET role='access_admin' WHERE id=$1"],
      ['UPDATE access_grants SET personal_data_visible=false WHERE user_id=$1', 'UPDATE access_grants SET personal_data_visible=true WHERE user_id=$1'],
    ]) {
      await db.query(update, [ids.admin]);
      expect(await preview(current.invitationToken), 410);
      expect(await accept(newBody(current, '+79991234021')), 410);
      await db.query(restore, [ids.admin]);
    }
    expect(await preview(current.invitationToken));
  });

  await t.test('parallel acceptance consumes one link exactly once; normalized phone races create one account', async () => {
    const one = expect(await create(), 201);
    const competing = await Promise.all([accept(newBody(one, '+79991234030')), accept(newBody(one, '+79991234031'))]);
    assert.deepEqual(competing.map(row => row.status).sort(), [200, 410]);
    const winningId = competing.find(row => row.status === 200).body.actor.id;
    assert.equal((await db.query('SELECT 1 FROM sessions WHERE user_id=$1', [winningId])).rowCount, 1);
    const [first, second] = [expect(await create(), 201), expect(await create(), 201)];
    const before = (await db.query('SELECT count(*)::int AS count FROM users')).rows[0].count;
    const samePhone = await Promise.all([accept(newBody(first, '+79991234032')), accept(newBody(second, '8 (999) 123-40-32'))]);
    assert.deepEqual(samePhone.map(row => row.status).sort(), [200, 401]);
    assert.equal((await db.query('SELECT count(*)::int AS count FROM users')).rows[0].count, before + 1);
    assert.equal((await db.query('SELECT 1 FROM recruitment_invitations WHERE id=ANY($1::uuid[]) AND consumed_at IS NOT NULL', [[first.id, second.id]])).rowCount, 1);
  });

  await t.test('existing account joins a second issuer scope without disclosing or changing other grants', async () => {
    const otherScope = randomUUID(), otherAdmin = randomUUID(), otherLegal = randomUUID(), otherProject = randomUUID();
    await db.query('INSERT INTO legal_entities VALUES($1,$2)', [otherLegal, 'Second issuer company']);
    await db.query('INSERT INTO projects VALUES($1,$2,$3,$4)', [otherProject, 'Second issuer project', otherLegal, ids.region]);
    await db.query('INSERT INTO responsibility_scopes(id,project_id,name) VALUES($1,$2,$3)', [otherScope, otherProject, 'Other company scope']);
    await db.query(`INSERT INTO users(id,display_name,role,approved) VALUES($1,'Second inviter','access_admin',true)`, [otherAdmin]);
    await db.query(`INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id,personal_data_visible)
      VALUES($1,$2,$3,$4,$5,true)`, [otherAdmin, otherLegal, ids.region, otherProject, otherScope]);
    const other = await devLogin(otherAdmin);
    const secondDemand = expect(await request('PUT', '/recruitment/requests', { ...demandBody(otherScope), recruiterId: otherAdmin }, other.accessToken));
    expect(await create({ requestIds: [secondDemand.id] }), 403);
    const invited = expect(await create({ responsibilityScopeId: otherScope, requestIds: [secondDemand.id] }, other.accessToken), 201);
    expect(await request('GET', `/recruitment/invitations?responsibilityScopeId=${otherScope}`, undefined, admin.accessToken), 403);
    expect(await request('POST', `/recruitment/invitations/${invited.id}/revoke`, { responsibilityScopeId: ids.scope }, admin.accessToken), 403);
    const joined = expect(await accept({ ...newBody(invited), mode: 'existing' }));
    assert.equal(joined.actor.id, account.actor.id);
    assert.deepEqual(new Set(joined.actor.grants.map(row => row.responsibilityScopeId)), new Set([ids.scope, otherScope]));
    const data = expect(await request('GET', `/recruitment?responsibilityScopeId=${otherScope}`, undefined, joined.accessToken));
    assert.deepEqual(data.requests.map(row => row.id), [secondDemand.id]);
  });

  await t.test('session failure rolls back account, credential, assignments and consumed invitation', async () => {
    const invited = expect(await create(), 201);
    const before = (await db.query('SELECT count(*)::int AS count FROM users')).rows[0].count;
    await db.query(`CREATE FUNCTION fixture_reject_session() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic session failure'; END $$;
      CREATE TRIGGER fixture_session_failure BEFORE INSERT ON sessions FOR EACH ROW EXECUTE FUNCTION fixture_reject_session()`);
    try { expect(await accept(newBody(invited, '+79991234080')), 500); }
    finally { await db.query('DROP TRIGGER fixture_session_failure ON sessions; DROP FUNCTION fixture_reject_session()'); }
    assert.equal((await db.query('SELECT count(*)::int AS count FROM users')).rows[0].count, before);
    assert.equal((await db.query('SELECT 1 FROM phone_credentials WHERE phone=$1', ['+79991234080'])).rowCount, 0);
    assert.equal((await db.query('SELECT consumed_at FROM recruitment_invitations WHERE id=$1', [invited.id])).rows[0].consumed_at, null);
    expect(await accept(newBody(invited, '+79991234080')));
  });

  await t.test('audit records actions without link secrets, entered phone or password', async () => {
    const rows = (await db.query(`SELECT payload FROM audit_events WHERE payload->>'action' LIKE 'recruitment.invitation.%'`)).rows;
    const serialized = JSON.stringify(rows);
    assert.ok(serialized.includes('recruitment.invitation.created'));
    assert.ok(serialized.includes('recruitment.invitation.accepted'));
    assert.ok(serialized.includes('recruitment.invitation.revoked'));
    for (const secret of [invitation.invitationToken, '+79991234001', newBody(invitation).password]) assert.ok(!serialized.includes(secret));
  });
});
