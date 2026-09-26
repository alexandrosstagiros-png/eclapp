'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createTestServer } = require('./local-test-server.cjs');

test('Team response metrics use real reply history, company isolation and fresh administrator access', { timeout: 180000 }, async t => {
  const f = await createTestServer({ staffTeamActors: true });
  t.after(() => f.close());
  const { ids, adminPool: db } = f;
  const a = ids.drivers[0], b = ids.drivers[1], c = ids.mechanic;
  const now = Date.now(), secondProject = randomUUID(), secondScope = randomUUID();
  const foreignCompany = randomUUID(), foreignProject = randomUUID(), foreignScope = randomUUID();
  await db.query('INSERT INTO projects(id,name,legal_entity_id,region_id) VALUES($1,$2,$3,$4)', [secondProject, 'Metrics second project', ids.legal, ids.region]);
  await db.query('INSERT INTO responsibility_scopes(id,project_id,name) VALUES($1,$2,$3)', [secondScope, secondProject, 'Metrics second scope']);
  await db.query('INSERT INTO legal_entities(id,name) VALUES($1,$2)', [foreignCompany, 'Metrics foreign company']);
  await db.query('INSERT INTO projects(id,name,legal_entity_id,region_id) VALUES($1,$2,$3,$4)', [foreignProject, 'Metrics foreign project', foreignCompany, ids.region]);
  await db.query('INSERT INTO responsibility_scopes(id,project_id,name) VALUES($1,$2,$3)', [foreignScope, foreignProject, 'Metrics foreign scope']);
  await db.query('UPDATE access_grants SET project_id=$2,responsibility_scope_id=$3 WHERE user_id=$1', [b, secondProject, secondScope]);
  await db.query('UPDATE access_grants SET legal_entity_id=$2,project_id=$3,responsibility_scope_id=$4 WHERE user_id=$1', [ids.dispatcher, foreignCompany, foreignProject, foreignScope]);
  await db.query("UPDATE users SET role='access_admin' WHERE id=$1", [ids.dispatcher]);
  await db.query('UPDATE access_grants SET personal_data_visible=true WHERE user_id=$1', [ids.admin]);
  const admin = await f.devLogin(ids.admin), alice = await f.devLogin(a), bob = await f.devLogin(b), outsider = await f.devLogin(ids.dispatcher);
  const call = (method, path, body, session = admin) => f.request(method, path, body, session.accessToken);
  const ok = result => { assert.ok([200, 201].includes(result.status), `${result.status}: ${JSON.stringify(result.body)}`); return result.body; };
  const list = async (scope = ids.scope, days = 7, session = admin) => ok(await call('GET', `/team/response-metrics?responsibilityScopeId=${scope}&days=${days}`, undefined, session));
  const employee = (result, id) => { const row = result.employees.find(person => person.userId === id); assert.ok(row, `missing employee ${id}`); return row; };
  const create = async (kind, scope = ids.scope, session = alice, patch = {}) => ok(await call('POST', '/team/conversations', {
    id: randomUUID(), responsibilityScopeId: scope, kind, title: 'Metrics synthetic history', memberIds: kind === 'direct' ? [a, b] : [], ...patch,
  }, session));
  async function message(conversation, authorId, secondsAgo, parentId = null, deleted = false) {
    const id = randomUUID(), timestamp = new Date(now - secondsAgo * 1000);
    await db.query(`INSERT INTO team_messages(id,legal_entity_id,region_id,project_id,responsibility_scope_id,conversation_id,parent_id,text,author_id,author_name,created_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,'Synthetic metrics message',$8,'Synthetic employee',$9)`,
    [id, conversation.legalEntityId, conversation.regionId, conversation.projectId, conversation.responsibilityScopeId, conversation.id, parentId, authorId, timestamp]);
    if (deleted) await db.query("UPDATE team_messages SET text='',deleted_at=clock_timestamp(),deleted_by=$2 WHERE id=$1", [id, authorId]);
    return id;
  }
  const direct = await create('direct');
  await message(direct, a, 3600); await message(direct, a, 3540);
  await message(direct, b, 3000); await message(direct, b, 2940);
  await message(direct, a, 2880); await message(direct, a, 2850);
  const channel = await create('channel', secondScope, bob);
  const root = await message(channel, a, 2700);
  await message(channel, b, 2400, root); await message(channel, b, 2340, root);
  await message(channel, a, 2320, root); await message(channel, c, 2100, root);
  const immediate = await message(channel, a, 2000);
  await message(channel, b, 2000, immediate);
  const deletedParent = await message(channel, a, 1800, null, true);
  await message(channel, b, 1700, deletedParent);
  await message(channel, b, 1600, root, true);
  await message(channel, b, 1500); // A plain channel post is not a reply to everyone.
  const privateChannel = await create('channel', ids.scope, admin, { visibility: 'private', memberIds: [a, b] });
  await message(privateChannel, a, 600);
  const foreign = await create('channel', foreignScope, outsider);
  await message(foreign, ids.dispatcher, 500);

  await t.test('direct runs and first explicit channel replies produce exact mean, median, pending and zero values', async () => {
    const result = await list();
    assert.equal(result.days, 7); assert.equal(Date.parse(result.periodEnd) - Date.parse(result.periodStart), 7 * 86400000);
    assert.equal(result.generatedAt, result.periodEnd);
    const ar = employee(result, a), br = employee(result, b), cr = employee(result, c), empty = employee(result, ids.admin);
    assert.equal(ar.responseCount, 1); assert.equal(ar.averageResponseSeconds, 120); assert.equal(ar.medianResponseSeconds, 120);
    assert.equal(br.responseCount, 3); assert.equal(br.directResponseCount, 1); assert.equal(br.channelResponseCount, 2);
    assert.equal(br.averageResponseSeconds, 300); assert.equal(br.medianResponseSeconds, 300);
    assert.equal(br.pendingDirectCount, 1); assert.ok(br.oldestPendingSeconds >= 2880 && br.oldestPendingSeconds < 3000);
    assert.equal(cr.responseCount, 1); assert.equal(cr.averageResponseSeconds, 600);
    assert.equal(empty.responseCount, 0); assert.equal(empty.averageResponseSeconds, null); assert.equal(empty.medianResponseSeconds, null);
    assert.equal(empty.pendingDirectCount, 0); assert.equal(empty.oldestPendingSeconds, null);
    assert.deepEqual(result.totals, { responseCount: 5, averageResponseSeconds: 324, medianResponseSeconds: 300, pendingDirectCount: 1 });
    const zeroParent = await message(channel, a, 1000);
    await message(channel, ids.admin, 1000, zeroParent);
    const zero = employee(await list(), ids.admin);
    assert.equal(zero.averageResponseSeconds, 0); assert.equal(zero.medianResponseSeconds, 0);
    const headers = await fetch(`${f.origin}/api/v1/team/response-metrics`, { headers: { Authorization: `Bearer ${admin.accessToken}` } });
    assert.equal(headers.headers.get('cache-control'), 'no-store'); await headers.arrayBuffer();
  });

  await t.test('period selection preserves the original unanswered series and does not recount an earlier channel reply', async () => {
    const boundary = await create('direct');
    await message(boundary, a, 9 * 86400); await message(boundary, a, 2 * 86400);
    await message(boundary, b, 86400);
    const olderParent = await message(channel, a, 10 * 86400);
    await message(channel, b, 8 * 86400, olderParent); await message(channel, b, 100, olderParent);
    const oldPending = await create('direct');
    await message(oldPending, a, 9 * 86400); await message(oldPending, a, 60);
    const short = await list(), long = await list(ids.scope, 30);
    assert.equal(employee(short, b).directResponseCount, 2);
    assert.equal(employee(short, b).channelResponseCount, 2);
    assert.equal(employee(short, b).averageResponseSeconds, (600 + 300 + 0 + 8 * 86400) / 4);
    assert.equal(employee(long, b).channelResponseCount, 3);
    assert.equal(employee(short, b).pendingDirectCount, 1, 'old open series is outside the requested period');
    assert.equal(employee(long, b).pendingDirectCount, 2);
    assert.equal(employee(short, a).pendingDirectCount, 1, 'last reply starts a new outgoing series');
    assert.equal(ok(await call('GET', '/team/response-metrics')).days, 30);
    assert.equal((await list(ids.scope, 90)).days, 90);
  });

  await t.test('company-wide reads include other projects while private access remains audited and other companies stay isolated', async () => {
    const fromFirst = await list(), fromSecond = await list(secondScope);
    assert.deepEqual(fromFirst.totals, fromSecond.totals);
    assert.equal(fromFirst.employees.some(person => person.userId === ids.dispatcher), false);
    assert.equal((await call('GET', `/team/response-metrics?responsibilityScopeId=${foreignScope}`)).status, 403);
    const otherCompany = await list(foreignScope, 7, outsider);
    assert.deepEqual(otherCompany.employees.map(person => person.userId), [ids.dispatcher]);
    assert.equal(otherCompany.totals.responseCount, 0);
    const audit = (await db.query(`SELECT payload FROM audit_events WHERE payload->'metadata'->>'source'='response_metrics'
      AND payload->>'entityId'=ANY($1::text[])`, [[direct.id, privateChannel.id]])).rows.map(row => row.payload);
    assert.ok(audit.some(row => row.action === 'team.direct.admin_read' && row.entityId === direct.id));
    assert.ok(audit.some(row => row.action === 'team.channel.admin_read' && row.entityId === privateChannel.id));
    assert.ok(audit.every(row => row.actorId === ids.admin));
    assert.equal(JSON.stringify(audit).includes('Synthetic metrics message'), false);
    await db.query('UPDATE access_grants SET personal_data_visible=false WHERE user_id=$1', [ids.admin]);
    const masked = await list();
    assert.equal(employee(masked, a).displayName, `Сотрудник · ${a.slice(-6)}`);
    await db.query('UPDATE access_grants SET personal_data_visible=true WHERE user_id=$1', [ids.admin]);
  });

  await t.test('unknown parameters, ordinary sessions and impersonation cannot use administrator metrics', async () => {
    assert.equal((await f.request('GET', '/team/response-metrics')).status, 401);
    assert.equal((await call('GET', '/team/response-metrics', undefined, alice)).status, 403);
    const impersonated = ok(await call('POST', '/auth/impersonate', { userId: a }));
    assert.equal((await call('GET', '/team/response-metrics', undefined, impersonated)).status, 403);
    await db.query("UPDATE users SET role='access_admin' WHERE id=$1", [ids.specialist]);
    const impersonatedAdmin = ok(await call('POST', '/auth/impersonate', { userId: ids.specialist }));
    assert.equal((await call('GET', '/team/response-metrics', undefined, impersonatedAdmin)).status, 403, 'impersonating an administrator never inherits the analytics capability');
    for (const query of ['days=1', 'days=7&days=30', 'days=NaN', 'responsibilityScopeId=bad', `userId=${a}`])
      assert.equal((await call('GET', `/team/response-metrics?${query}`)).status, 400, query);
    await db.query('UPDATE users SET active=false WHERE id=$1', [b]);
    assert.equal((await list()).employees.some(person => person.userId === b), false);
    await db.query('UPDATE users SET active=true WHERE id=$1', [b]);
    await db.query("UPDATE users SET role='dispatcher' WHERE id=$1", [ids.admin]);
    assert.equal((await call('GET', '/team/response-metrics')).status, 403, 'administrator role is rechecked on each request');
    await db.query("UPDATE users SET role='access_admin' WHERE id=$1", [ids.admin]);
    await db.query('DELETE FROM access_grants WHERE user_id=$1', [ids.admin]);
    assert.equal((await call('GET', `/team/response-metrics?responsibilityScopeId=${ids.scope}`)).status, 403);
    assert.deepEqual(ok(await call('GET', '/team/response-metrics')).employees, []);
  });
});
