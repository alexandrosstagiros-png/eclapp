'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createTestServer } = require('./local-test-server.cjs');

test('sender read status follows exact receipts and refreshes independently of message changes', { timeout: 180000 }, async t => {
  const f = await createTestServer({ staffTeamActors: true });
  t.after(() => f.close());
  const { ids, adminPool: db } = f;
  const alice = await f.devLogin(ids.drivers[0]), bob = await f.devLogin(ids.drivers[1]);
  const outsider = await f.devLogin(ids.dispatcher), admin = await f.devLogin(ids.admin);
  const call = (method, route, body, session = alice) => f.request(method, route, body, session.accessToken);
  const ok = result => { assert.ok([200, 201].includes(result.status), `${result.status}: ${JSON.stringify(result.body)}`); return result.body; };
  const scoped = path => `${path}?responsibilityScopeId=${ids.scope}`;
  const create = async (patch = {}, session = alice) => ok(await call('POST', '/team/conversations', {
    id: randomUUID(), responsibilityScopeId: ids.scope, kind: 'channel', title: 'Статус прочтения', memberIds: [], ...patch,
  }, session));
  const direct = await create({ kind: 'direct', memberIds: [ids.drivers[0], ids.drivers[1]] });
  const channel = await create();
  const privateChannel = await create({ visibility: 'private', memberIds: [ids.drivers[0], ids.drivers[1]] }, admin);
  const send = async (conversation, text, patch = {}, session = alice) => ok(await call('POST', '/team/messages', {
    id: randomUUID(), responsibilityScopeId: ids.scope, conversationId: conversation.id, text, ...patch,
  }, session));
  const detail = async (conversation, session = alice) => ok(await call('GET', scoped(`/team/conversations/${conversation.id}`), undefined, session));
  const source = async (message, session = alice) => ok(await call('GET', scoped(`/team/messages/${message.id}`), undefined, session)).message;
  const ack = async (conversation, messages, session = bob) => ok(await call('PUT', `/team/conversations/${conversation.id}/read`, {
    responsibilityScopeId: ids.scope, messages: messages.map(({ id, version }) => ({ id, version })),
  }, session));
  const poll = (conversation, afterChange, messageIds, session = alice) => call('GET',
    `${scoped(`/team/conversations/${conversation.id}/changes`)}&afterChange=${afterChange}&readMessageIds=${messageIds.join(',')}`, undefined, session);
  const sent = { status: 'sent', readCount: 0, recipientCount: 1 };
  const read = { status: 'read', readCount: 1, recipientCount: 1 };
  let root, reply;

  await t.test('only the sender sees statuses; GETs and own acknowledgements never create participant reads', async () => {
    root = await send(direct, 'Видимый корень');
    reply = await send(direct, 'Скрытый ответ', { parentId: root.id });
    assert.deepEqual(root.delivery, sent);
    assert.deepEqual((await source(root)).delivery, sent);
    assert.equal('delivery' in await source(root, bob), false);
    assert.equal((await detail(direct, bob)).messages.some(message => 'delivery' in message), false);
    assert.deepEqual((await source(root)).delivery, sent, 'fetching a message is not an acknowledgement');
    await ack(direct, [root], alice);
    assert.equal((await db.query('SELECT count(*)::integer AS count FROM team_message_reads WHERE message_id=$1', [root.id])).rows[0].count, 0);
    await ack(direct, [root]);
    assert.deepEqual((await source(root)).delivery, read);
    assert.deepEqual((await source(reply)).delivery, sent, 'a root receipt cannot acknowledge hidden replies');
  });

  await t.test('polling returns new receipts without message edits, including messages outside the newest page', async () => {
    const older = await send(direct, 'До длинной истории');
    const historyIds = Array.from({ length: 105 }, () => randomUUID());
    await db.query(`INSERT INTO team_messages(id,legal_entity_id,region_id,project_id,responsibility_scope_id,conversation_id,text,author_id,author_name)
      SELECT id,$1,$2,$3,$4,$5,'История',$6,'Сотрудник' FROM unnest($7::uuid[]) messages(id)`,
    [ids.legal, ids.region, ids.project, ids.scope, direct.id, ids.drivers[0], historyIds]);
    const loaded = await detail(direct);
    assert.equal(loaded.messages.some(message => message.id === older.id), false);
    const before = ok(await poll(direct, loaded.changeCursor, [older.id, reply.id]));
    assert.deepEqual(before.messages, []);
    assert.equal(before.readStatuses.length, 2);
    assert.deepEqual(before.readStatuses.find(status => status.id === older.id).delivery, sent);
    await ack(direct, [older, reply]);
    const after = ok(await poll(direct, loaded.changeCursor, [older.id, reply.id]));
    assert.deepEqual(after.messages, []);
    assert.equal(after.changeCursor, loaded.changeCursor);
    assert.equal(after.hasMore, false);
    assert.deepEqual(after.readStatuses.map(status => status.delivery), [read, read]);
    assert.deepEqual(ok(await poll(direct, loaded.changeCursor, [older.id], bob)).readStatuses, [], 'recipients cannot inspect another sender’s receipt metadata');
  });

  await t.test('new revisions need their own receipts and deleted messages omit delivery metadata', async () => {
    const original = await send(direct, 'Первая версия');
    await ack(direct, [original]);
    const edited = ok(await call('PUT', `/team/messages/${original.id}`, {
      responsibilityScopeId: ids.scope, operationId: randomUUID(), version: original.version, text: 'Исправленная версия',
    }));
    assert.deepEqual(edited.delivery, sent);
    assert.equal(edited.version, 2);
    const unreadRevision = await source(edited, bob);
    assert.equal(unreadRevision.isUnread, false, 'an edit keeps the original unread-count semantics');
    assert.equal(unreadRevision.requiresReadReceipt, true, 'the newly displayed revision still needs an exact acknowledgement');
    assert.equal((await call('PUT', `/team/conversations/${direct.id}/read`, {
      responsibilityScopeId: ids.scope, messages: [{ id: original.id, version: original.version }],
    }, bob)).status, 409);
    await ack(direct, [edited]);
    assert.equal((await source(edited, bob)).requiresReadReceipt, false);
    assert.deepEqual(ok(await poll(direct, edited.changeCursor, [edited.id])).readStatuses, [{ id: edited.id, version: 2, delivery: read }]);
    const removed = ok(await call('PUT', `/team/messages/${edited.id}/deletion`, {
      responsibilityScopeId: ids.scope, operationId: randomUUID(), version: edited.version,
    }));
    assert.equal('delivery' in removed, false);
    assert.deepEqual(ok(await poll(direct, removed.changeCursor, [removed.id])).readStatuses, []);
  });

  await t.test('channel counts disclose no reader identities or unsupported everyone claim; outsider admin reads do not count', async () => {
    const visible = await send(channel, 'Общий канал');
    assert.deepEqual(visible.delivery, { status: 'sent', readCount: 0, recipientCount: null });
    await ack(channel, [visible]);
    await ack(channel, [visible], admin);
    assert.deepEqual((await source(visible)).delivery, { status: 'read', readCount: 2, recipientCount: null });
    const secret = await send(privateChannel, 'Закрыто');
    await ack(privateChannel, [secret], admin);
    assert.equal((await db.query('SELECT count(*)::integer AS count FROM team_message_reads WHERE message_id=$1', [secret.id])).rows[0].count, 0);
    // Existing receipts from before the feature must also never credit an outsider inspection.
    await db.query(`INSERT INTO team_message_reads(user_id,message_id,legal_entity_id,region_id,project_id,responsibility_scope_id,conversation_id,message_version)
      VALUES($1,$2,$3,$4,$5,$6,$7,1)`, [ids.admin, secret.id, ids.legal, ids.region, ids.project, ids.scope, privateChannel.id]);
    assert.deepEqual((await source(secret)).delivery, { status: 'sent', readCount: 0, recipientCount: null });
    assert.equal('delivery' in await source(secret, admin), false);
    await ack(privateChannel, [secret]);
    assert.deepEqual((await source(secret)).delivery, { status: 'read', readCount: 1, recipientCount: null });
    const privateLoaded = await detail(privateChannel);
    assert.equal((await poll(privateChannel, privateLoaded.changeCursor, [secret.id], outsider)).status, 404);
    const impersonated = ok(await call('POST', '/auth/impersonate', { userId: ids.dispatcher }, admin));
    assert.equal((await poll(privateChannel, privateLoaded.changeCursor, [secret.id], impersonated)).status, 404);
    assert.equal((await poll(direct, '0', [secret.id])).status, 404, 'a valid id cannot cross a conversation boundary');
    const newScope = randomUUID();
    await db.query("INSERT INTO responsibility_scopes(id,project_id,name) VALUES($1,$2,'Другая область')", [newScope, ids.project]);
    assert.equal((await call('GET', `/team/conversations/${privateChannel.id}/changes?responsibilityScopeId=${newScope}&readMessageIds=${secret.id}`)).status, 404);
    ok(await call('PUT', `/team/conversations/${privateChannel.id}/access`, {
      responsibilityScopeId: ids.scope, operationId: randomUUID(), version: privateLoaded.conversation.version,
      visibility: 'private', memberIds: [ids.drivers[1]],
    }, admin));
    assert.equal((await poll(privateChannel, privateLoaded.changeCursor, [secret.id])).status, 404, 'old authorship cannot restore revoked membership');
  });

  await t.test('viewing archived history still records exact reads without reviving unread notifications', async () => {
    const archived = await create({ title: 'Архивная переписка' });
    const message = await send(archived, 'Прочитать после архивации');
    ok(await call('PUT', `/team/conversations/${archived.id}/lifecycle`, {
      responsibilityScopeId: ids.scope, operationId: randomUUID(), version: archived.version, action: 'archive',
    }, admin));
    const before = await detail(archived, bob);
    assert.equal(before.conversation.unreadCount, 0);
    assert.equal(before.messages[0].isUnread, false);
    assert.equal(before.messages[0].requiresReadReceipt, true, 'opening archived history must still acknowledge the displayed version');
    await ack(archived, [message]);
    assert.equal((await source(message, bob)).requiresReadReceipt, false);
    assert.deepEqual((await source(message)).delivery, { status: 'read', readCount: 1, recipientCount: null });
  });

  await t.test('poll batches are bounded and strict, and company access is rechecked for reader counts', async () => {
    assert.equal((await poll(direct, '0', ['invalid'])).status, 400);
    assert.equal((await poll(direct, '0', Array.from({ length: 101 }, () => root.id))).status, 400);
    assert.equal((await poll(direct, '0', [randomUUID()])).status, 404);
    const repeated = ok(await poll(direct, '0', [root.id, root.id]));
    assert.equal(repeated.readStatuses.length, 1);
    assert.deepEqual(repeated.readStatuses[0].delivery, read);
    await db.query('DELETE FROM access_grants WHERE user_id=$1', [ids.drivers[1]]);
    assert.deepEqual((await source(root)).delivery, sent, 'a reader whose company access was revoked is no longer an eligible recipient');
    assert.equal((await poll(direct, '0', [root.id], bob)).status, 403);
  });
});
