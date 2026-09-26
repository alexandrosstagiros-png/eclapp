'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createTestServer } = require('./local-test-server.cjs');

test('mentions persist as scoped recipient snapshots with a private durable read inbox', { timeout: 180000 }, async t => {
  const f = await createTestServer({ staffTeamActors: true });
  t.after(() => f.close());
  const { ids, adminPool: db } = f;
  const alice = await f.devLogin(ids.drivers[0]), bob = await f.devLogin(ids.drivers[1]), outsider = await f.devLogin(ids.dispatcher), admin = await f.devLogin(ids.admin);
  const tuple = [ids.legal, ids.region, ids.project, ids.scope];
  const call = (method, path, body, session = alice) => f.request(method, path, body, session?.accessToken);
  const scoped = path => `${path}?responsibilityScopeId=${ids.scope}`;
  const ok = result => { assert.ok([200,201].includes(result.status), `${result.status} ${JSON.stringify(result.body)}`); return result.body; };
  const token = id => `@[Сотрудник](user:${id})`;
  const create = async (kind, memberIds = []) => ok(await call('POST', '/team/conversations', { id: randomUUID(), responsibilityScopeId: ids.scope, kind, title: 'Упоминания', memberIds }));
  const channel = await create('channel'), direct = await create('direct', [ids.drivers[0], ids.drivers[1]]);
  const input = (conversationId, text, mentions, patch = {}) => ({ id: randomUUID(), responsibilityScopeId: ids.scope, conversationId, parentId: null, text, mentions, ...patch });
  const send = body => call('POST', '/team/messages', body);
  const inbox = async session => ok(await call('GET', scoped('/team/mentions'), undefined, session));
  const markRead = (id, session = bob, body = { responsibilityScopeId: ids.scope, version: 1 }) => call('PUT', `/team/mentions/${id}/read`, body, session);
  const mentionBody = input(channel.id, `Проверить ${token(ids.drivers[1])}`, { userIds: [ids.drivers[1]], all: false });
  let root, privateAll;

  await t.test('explicit mentions return on every message path and retries never duplicate deliveries', async () => {
    root = ok(await send(mentionBody));
    assert.deepEqual(root.mentions, mentionBody.mentions);
    const [first, second] = await Promise.all([send(mentionBody), send(mentionBody)]);
    assert.deepEqual(ok(first), root);
    assert.deepEqual(ok(second), root);
    assert.equal((await db.query('SELECT 1 FROM team_message_mentions WHERE message_id=$1', [root.id])).rowCount, 1);
    const own = await inbox(alice), recipient = await inbox(bob), unrelated = await inbox(outsider);
    assert.equal(own.unreadCount, 0);
    assert.equal(unrelated.unreadCount, 0);
    assert.equal(recipient.unreadCount, 1);
    assert.equal(recipient.mentions[0].messageId, root.id);
    assert.equal(recipient.mentions[0].conversationId, channel.id);
    assert.equal(recipient.mentions[0].parentId, null);
    assert.equal(recipient.mentions[0].readAt, null);
    const child = ok(await send(input(channel.id, 'Ветка', { userIds: [], all: false }, { parentId: root.id })));
    const source = ok(await call('GET', scoped(`/team/messages/${child.id}`), undefined, bob));
    assert.deepEqual(source.message.mentions, { userIds: [], all: false });
    assert.deepEqual(source.ancestors[0].mentions, root.mentions);
    const detail = ok(await call('GET', scoped(`/team/conversations/${channel.id}`), undefined, bob));
    assert.deepEqual(detail.messages.find(row => row.id === root.id).mentions, root.mentions);
    const changed = { ...mentionBody, text: `${token(ids.dispatcher)} проверить`, mentions: { userIds: [ids.dispatcher], all: false } };
    assert.equal((await send(changed)).status, 409);
  });

  await t.test('read acknowledgement belongs to the recipient and is idempotent across restart', async () => {
    assert.equal((await markRead(root.id, outsider)).status, 404);
    assert.equal((await markRead(root.id, admin)).status, 404);
    assert.equal((await markRead(root.id, bob, { responsibilityScopeId: ids.scope, userId: ids.drivers[0] })).status, 400);
    const first = ok(await markRead(root.id));
    assert.ok(first.readAt);
    assert.deepEqual(ok(await markRead(root.id)), first);
    await f.restartApi();
    assert.deepEqual(ok(await markRead(root.id)), first);
    const recipient = await inbox(bob);
    assert.equal(recipient.unreadCount, 0);
    assert.equal(recipient.mentions[0].readAt, first.readAt);
  });

  await t.test('@all in private conversations snapshots only its members and does not notify its author', async () => {
    privateAll = ok(await send(input(direct.id, '@all Проверьте личную ветку', { userIds: [], all: true })));
    assert.deepEqual(privateAll.mentions, { userIds: [], all: true });
    const targets = (await db.query('SELECT user_id FROM team_message_mentions WHERE message_id=$1 ORDER BY user_id', [privateAll.id])).rows.map(row => row.user_id);
    assert.deepEqual(targets, [ids.drivers[1]]);
    assert.ok((await inbox(bob)).mentions.some(row => row.messageId === privateAll.id));
    assert.equal((await inbox(outsider)).mentions.some(row => row.messageId === privateAll.id), false);
    assert.equal((await inbox(admin)).mentions.some(row => row.messageId === privateAll.id), false);
    const invalid = input(direct.id, token(ids.dispatcher), { userIds: [ids.dispatcher], all: false });
    assert.equal((await send(invalid)).status, 400);
    assert.equal((await db.query('SELECT 1 FROM team_messages WHERE id=$1', [invalid.id])).rowCount, 0);
    const adminWrite = input(direct.id, '@all', { userIds: [], all: true });
    assert.equal((await call('POST', '/team/messages', adminWrite, admin)).status, 403);
  });

  await t.test('@all channel recipients exclude later arrivals and unsupported, inactive or unapproved accounts', async () => {
    const disabled = randomUUID(), pending = randomUUID(), external = randomUUID(), newcomer = randomUUID(), wrongScope = randomUUID();
    for (const [id, role, active, approved] of [[disabled,'driver',false,true],[pending,'driver',true,false],[external,'external_recruiter',true,true]]) {
      await db.query("INSERT INTO users(id,display_name,role,active,approved) VALUES($1,'Synthetic mention recipient',$2,$3,$4)", [id, role, active, approved]);
      await db.query('INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id) VALUES($1,$2,$3,$4,$5)', [id,...tuple]);
    }
    await db.query("INSERT INTO users(id,display_name,role,active,approved) VALUES($1,'Other scope recipient','driver',true,true)", [wrongScope]);
    const all = ok(await send(input(channel.id, '@all Проверка команды', { userIds: [], all: true })));
    for (const id of [disabled,pending,external,wrongScope]) {
      const invalid = input(channel.id, token(id), { userIds: [id], all: false });
      assert.equal((await send(invalid)).status, 400);
      assert.equal((await db.query('SELECT 1 FROM team_message_mentions WHERE message_id=$1 AND user_id=$2', [all.id,id])).rowCount, 0);
    }
    await db.query("INSERT INTO users(id,display_name,role,active,approved) VALUES($1,'New teammate','dispatcher',true,true)", [newcomer]);
    await db.query('INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id) VALUES($1,$2,$3,$4,$5)', [newcomer,...tuple]);
    const newSession = await f.devLogin(newcomer);
    assert.equal((await inbox(newSession)).mentions.length, 0);
    assert.equal((await db.query('SELECT 1 FROM team_message_mentions WHERE message_id=$1 AND user_id=$2', [all.id,newcomer])).rowCount, 0);
    const externalSession = await f.devLogin(external);
    assert.equal((await call('GET', scoped('/team/mentions'), undefined, externalSession)).status, 403);
  });

  await t.test('inbox pagination follows persisted message cursors without overlap or foreign cursors', async () => {
    const messageIds = Array.from({ length: 105 }, () => randomUUID());
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query(`INSERT INTO team_messages(id,legal_entity_id,region_id,project_id,responsibility_scope_id,conversation_id,text,author_id,author_name,mention_user_ids)
        SELECT id,$1,$2,$3,$4,$5,$6,$7,'Synthetic mention sender',$8::uuid[] FROM unnest($9::uuid[]) AS selected(id)`,
      [...tuple,channel.id,token(ids.drivers[1]),ids.drivers[0],[ids.drivers[1]],messageIds]);
      await client.query(`INSERT INTO team_message_mentions(message_id,legal_entity_id,region_id,project_id,responsibility_scope_id,conversation_id,user_id)
        SELECT id,$1,$2,$3,$4,$5,$6 FROM unnest($7::uuid[]) AS selected(id)`, [...tuple,channel.id,ids.drivers[1],messageIds]);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
    const first = await inbox(bob);
    assert.equal(first.mentions.length, 100);
    assert.equal(first.hasMore, true);
    const next = ok(await call('GET', `${scoped('/team/mentions')}&before=${first.nextBefore}`, undefined, bob));
    assert.ok(next.mentions.length > 0);
    assert.equal(next.hasMore, false);
    assert.equal(next.nextBefore, null);
    assert.equal(next.unreadCount, first.unreadCount);
    const all = [...first.mentions,...next.mentions].map(item => item.messageId);
    assert.equal(new Set(all).size, all.length);
    messageIds.forEach(id => assert.ok(all.includes(id)));
    assert.equal((await call('GET', `${scoped('/team/mentions')}&before=${first.nextBefore}`, undefined, outsider)).status, 400);
  });

  await t.test('inbox and acknowledgement reject forged scopes, revoked grants and changed roles', async () => {
    const otherScope = randomUUID();
    await db.query("INSERT INTO responsibility_scopes(id,project_id,name) VALUES($1,$2,'Other mention scope')", [otherScope,ids.project]);
    await db.query('INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id) VALUES($1,$2,$3,$4,$5)', [ids.drivers[1],ids.legal,ids.region,ids.project,otherScope]);
    assert.equal(ok(await call('GET', `/team/mentions?responsibilityScopeId=${otherScope}`, undefined, bob)).mentions.length, 0);
    assert.equal((await markRead(privateAll.id, bob, { responsibilityScopeId: otherScope, version: 1 })).status, 404);
    await db.query('DELETE FROM access_grants WHERE user_id=$1 AND responsibility_scope_id=$2', [ids.drivers[1],ids.scope]);
    assert.equal((await call('GET', scoped('/team/mentions'), undefined, bob)).status, 200, 'another project grant retains company chat access');
    await db.query('DELETE FROM access_grants WHERE user_id=$1', [ids.drivers[1]]);
    assert.equal((await call('GET', scoped('/team/mentions'), undefined, bob)).status, 403);
    assert.equal((await markRead(privateAll.id, bob)).status, 403);
    assert.deepEqual(ok(await send(mentionBody)).mentions, mentionBody.mentions, 'safe replay keeps its original snapshot even after recipient revocation');
    await db.query("UPDATE users SET role='external_recruiter' WHERE id=$1", [ids.dispatcher]);
    const changedRole = await call('GET', scoped('/team/mentions'), undefined, outsider);
    assert.ok([401,403].includes(changedRole.status));
    assert.equal((await call('GET', scoped('/team/mentions'), undefined, null)).status, 401);
  });
});
