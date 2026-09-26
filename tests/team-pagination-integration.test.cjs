'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { setTimeout: delay } = require('node:timers/promises');
const { createTestServer } = require('./local-test-server.cjs');

test('corporate message pagination, administrator audit and revalidation resist stale access', { timeout: 180000 }, async t => {
  const f = await createTestServer({ staffTeamActors: true });
  t.after(() => f.close());
  const { ids, adminPool: db, request, devLogin } = f;
  const admin = await devLogin(ids.admin), alice = await devLogin(ids.drivers[0]), bob = await devLogin(ids.drivers[1]);
  const scopeTuple = [ids.legal, ids.region, ids.project, ids.scope];
  const route = id => `/team/conversations/${id}?responsibilityScopeId=${ids.scope}`;
  const call = (method, path, body, session = alice) => request(method, path, body, session.accessToken);
  const ok = response => { assert.ok([200, 201].includes(response.status), `HTTP ${response.status}: ${JSON.stringify(response.body)}`); return response.body; };
  const conversation = async (kind = 'channel', memberIds = []) => ok(await call('POST', '/team/conversations', { id: randomUUID(), responsibilityScopeId: ids.scope, kind, title: 'Проверка истории', memberIds }));
  const channel = await conversation();
  const root = ok(await call('POST', '/team/messages', { id: randomUUID(), responsibilityScopeId: ids.scope, conversationId: channel.id, text: 'Корень' }));
  let direct, directSource;

  await t.test('206 messages with sub-millisecond timestamps paginate without omissions and restore old branch ancestors', async () => {
    await db.query("UPDATE team_messages SET created_at='2026-01-01T00:00:00Z' WHERE id=$1", [root.id]);
    const seeded = Array.from({ length: 205 }, () => randomUUID());
    await db.query(`INSERT INTO team_messages(id,legal_entity_id,region_id,project_id,responsibility_scope_id,conversation_id,parent_id,text,author_id,author_name,created_at)
      SELECT x.id,$1,$2,$3,$4,$5,CASE WHEN x.n=205 THEN $8::uuid ELSE $6::uuid END,'Ответ ' || x.n,$7,'Сотрудник',
        '2026-01-01T00:00:00Z'::timestamptz + x.n*interval '1 microsecond' FROM unnest($9::uuid[]) WITH ORDINALITY AS x(id,n)`,
    [...scopeTuple, channel.id, root.id, ids.drivers[0], seeded[0], seeded]);
    const first = ok(await call('GET', route(channel.id)));
    assert.equal(first.messages.length, 100);
    assert.equal(first.hasMore, true);
    assert.equal(first.nextBefore, first.messages[0].id);
    assert.ok(first.ancestors.some(message => message.id === root.id));
    assert.ok(first.ancestors.some(message => message.id === seeded[0]));
    assert.ok(first.ancestors.every(message => !first.messages.some(item => item.id === message.id)));
    const second = ok(await call('GET', `${route(channel.id)}&before=${first.nextBefore}`));
    assert.equal(second.messages.length, 100);
    const third = ok(await call('GET', `${route(channel.id)}&before=${second.nextBefore}`));
    assert.equal(third.messages.length, 6);
    assert.equal(third.hasMore, false);
    assert.equal(third.nextBefore, null);
    assert.equal(new Set([...first.messages, ...second.messages, ...third.messages].map(message => message.id)).size, 206);
    assert.equal((await call('GET', `${route(channel.id)}&before=${randomUUID()}`)).status, 400);
    assert.equal((await call('GET', `${route(channel.id)}&before=invalid`)).status, 400);
    const source = ok(await call('GET', `/team/messages/${seeded.at(-1)}?responsibilityScopeId=${ids.scope}`));
    assert.equal(source.conversation.id, channel.id);
    assert.equal(source.message.id, seeded.at(-1));
    assert.deepEqual(source.ancestors.map(message => message.id), [root.id, seeded[0]]);
  });

  await t.test('third-party direct-message reads are audited and cannot be used to post', async () => {
    direct = await conversation('direct', [ids.drivers[0], ids.drivers[1]]);
    directSource = ok(await call('POST', '/team/messages', { id: randomUUID(), responsibilityScopeId: ids.scope, conversationId: direct.id, text: 'Задача: проверить корпоративный личный чат' }));
    const detail = ok(await call('GET', route(direct.id), undefined, admin));
    assert.equal(detail.conversation.canPost, false);
    assert.equal(ok(await call('GET', route(direct.id), undefined, bob)).conversation.canPost, true);
    const logs = await db.query("SELECT payload FROM audit_events WHERE payload->>'action'='team.direct.admin_read' AND payload->>'entityId'=$1", [direct.id]);
    assert.equal(logs.rowCount, 1);
    assert.equal(logs.rows[0].payload.actorId, ids.admin);
    assert.equal(logs.rows[0].payload.metadata.messageCount, 1);
    assert.equal((await call('POST', '/team/messages', { id: randomUUID(), responsibilityScopeId: ids.scope, conversationId: direct.id, text: 'Запрещено' }, admin)).status, 403);
  });

  await t.test('shared-summary source links preserve original conversation permissions and audit administrator reads', async () => {
    const unrelated = await devLogin(ids.dispatcher);
    const report = ok(await call('POST', '/team/summaries', { responsibilityScopeId: ids.scope }, admin));
    assert.ok(report.sourceMessageIds.includes(directSource.id));
    ok(await call('PUT', `/team/summaries/${report.id}/sharing`, { responsibilityScopeId: ids.scope, recipientIds: [ids.dispatcher] }, admin));
    assert.ok(ok(await call('GET', `/team/summaries?responsibilityScopeId=${ids.scope}`, undefined, unrelated)).summaries.some(item => item.id === report.id));
    const sourceRoute = `/team/messages/${directSource.id}?responsibilityScopeId=${ids.scope}`;
    const denied = await call('GET', sourceRoute, undefined, unrelated);
    assert.equal(denied.status, 404);
    assert.equal(denied.body.message.includes(directSource.text), false);
    assert.equal(denied.body.conversation, undefined);
    const source = ok(await call('GET', sourceRoute, undefined, admin));
    assert.equal(source.conversation.id, direct.id);
    assert.equal(source.conversation.canPost, false);
    assert.equal(source.message.id, directSource.id);
    assert.deepEqual(source.ancestors, []);
    const logs = await db.query("SELECT payload FROM audit_events WHERE payload->>'action'='team.direct.admin_read' AND payload->'metadata'->>'messageId'=$1", [directSource.id]);
    assert.equal(logs.rowCount, 1);
    assert.equal(logs.rows[0].payload.actorId, ids.admin);
    assert.equal((await call('GET', `/team/messages/${randomUUID()}?responsibilityScopeId=${ids.scope}`)).status, 404);
    assert.equal((await call('GET', `/team/messages/invalid?responsibilityScopeId=${ids.scope}`)).status, 400);
  });

  await t.test('impersonated administrators have ordinary access, and revoked parent sessions stop reads', async () => {
    const target = randomUUID();
    await db.query("INSERT INTO users(id,display_name,role,active,approved) VALUES($1,'Второй администратор','access_admin',true,true)", [target]);
    await db.query('INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id) VALUES($1,$2,$3,$4,$5)', [target, ...scopeTuple]);
    const child = ok(await call('POST', '/auth/impersonate', { userId: target }, admin));
    assert.equal(ok(await call('GET', '/team/context', undefined, child)).canManage, false);
    assert.equal((await call('GET', route(direct.id), undefined, child)).status, 404);
    assert.equal((await call('POST', '/team/summaries', { responsibilityScopeId: ids.scope, periodStart: '2026-01-01T00:00:00Z', periodEnd: '2026-01-02T00:00:00Z' }, child)).status, 403);
    await db.query('UPDATE sessions SET revoked_at=clock_timestamp() WHERE id=$1', [admin.actor.sessionId]);
    assert.equal((await call('GET', route(channel.id), undefined, child)).status, 401);
  });

  await t.test('reads waiting on the user lock revalidate a grant removed after authentication', async () => {
    const lock = await db.connect();
    try {
      await lock.query('BEGIN');
      await lock.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [ids.drivers[1]]);
      const pending = call('GET', route(direct.id), undefined, bob);
      let waiting = false;
      for (let attempt = 0; attempt < 40; attempt++) {
        const rows = await db.query("SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE 'SELECT id FROM users WHERE id = ANY%' LIMIT 1");
        if (rows.rowCount) { waiting = true; break; }
        await delay(25);
      }
      assert.equal(waiting, true, 'The service must serialize current identity against grant mutations');
      await lock.query('DELETE FROM access_grants WHERE user_id=$1', [ids.drivers[1]]);
      await lock.query('COMMIT');
      assert.equal((await pending).status, 403);
    } finally { await lock.query('ROLLBACK'); lock.release(); }
  });
});
