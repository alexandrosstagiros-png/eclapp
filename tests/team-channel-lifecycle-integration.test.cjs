'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createTestServer } = require('./local-test-server.cjs');

test('administrators manage durable shared channel order and lifecycle without bypassing chat access', { timeout: 180000 }, async t => {
  const f = await createTestServer({ staffTeamActors: true });
  t.after(() => f.close());
  const { ids, adminPool: db } = f, scope = ids.scope;
  const admin = await f.devLogin(ids.admin), alice = await f.devLogin(ids.drivers[0]), bob = await f.devLogin(ids.drivers[1]), outsider = await f.devLogin(ids.dispatcher);
  const call = (method, path, body, session = admin) => f.request(method, path, body, session.accessToken);
  const ok = result => { assert.ok([200, 201].includes(result.status), `${result.status}: ${JSON.stringify(result.body)}`); return result.body; };
  const scoped = path => `${path}?responsibilityScopeId=${scope}`;
  const list = async (session = admin) => ok(await call('GET', scoped('/team/conversations'), undefined, session)).conversations;
  const detail = async (id, session = admin) => ok(await call('GET', scoped(`/team/conversations/${id}`), undefined, session));
  const create = async (title, patch = {}, session = admin) => {
    const body = { id: randomUUID(), responsibilityScopeId: scope, kind: 'channel', title, memberIds: [], ...patch };
    return { body, channel: ok(await call('POST', '/team/conversations', body, session)) };
  };
  const operation = (channel, patch = {}) => ({ responsibilityScopeId: scope, operationId: randomUUID(), version: channel.version, ...patch });
  const lifecycle = (channel, body, session = admin) => call('PUT', `/team/conversations/${channel.id}/lifecycle`, body, session);
  const order = (channel, body, session = admin) => call('PUT', `/team/conversations/${channel.id}/order`, body, session);
  const messageBody = (channel, text, patch = {}) => ({ id: randomUUID(), responsibilityScopeId: scope, conversationId: channel.id, text, ...patch });
  const send = async (channel, text, patch = {}, session = alice) => ok(await call('POST', '/team/messages', messageBody(channel, text, patch), session));
  const activeIds = async session => (await list(session)).filter(c => c.kind === 'channel' && !c.archivedAt).map(c => c.id);
  const publicChannels = [];
  for (const title of ['Порядок — первый', 'Порядок — второй', 'Порядок — третий']) publicChannels.push((await create(title)).channel);
  const privateCreation = await create('Закрытый архив', { visibility: 'private', memberIds: [ids.drivers[0], ids.drivers[1]] });
  let privateChannel = privateCreation.channel;
  const file = { id: randomUUID(), filename: 'Архив.txt', mimeType: 'text/plain', contentBase64: Buffer.from('SYNTHETIC_ARCHIVED_ATTACHMENT').toString('base64') };
  const firstBody = messageBody(privateChannel, '@all История закрытого канала', { mentions: { userIds: [], all: true }, attachments: [file] });
  const first = ok(await call('POST', '/team/messages', firstBody, alice));
  const reply = await send(privateChannel, 'Ответ в ветке', { parentId: first.id }, bob);
  const download = session => fetch(`${f.origin}/api/v1${scoped(`/team/attachments/${file.id}`)}`, { headers: { Authorization: `Bearer ${session.accessToken}` } });
  const unread = async (session = bob) => ok(await call('GET', scoped('/team/unread'), undefined, session));
  const mentions = async (session = bob) => ok(await call('GET', scoped('/team/mentions'), undefined, session));

  await t.test('management authority comes from the current administrator session, never membership or impersonation', async () => {
    assert.equal(publicChannels[0].canManageChannel, true);
    assert.equal((await detail(publicChannels[0].id, alice)).conversation.canManageChannel, false);
    const imp = ok(await call('POST', '/auth/impersonate', { userId: ids.drivers[0] }));
    for (const session of [alice, bob, imp]) {
      for (const action of ['archive', 'restore', 'delete']) assert.equal((await lifecycle(publicChannels[0], operation(publicChannels[0], { action }), session)).status, 403);
      assert.equal((await order(publicChannels[0], operation(publicChannels[0], { direction: 'down' }), session)).status, 403);
    }
    const direct = (await create('', { kind: 'direct', memberIds: [ids.drivers[0], ids.drivers[1]] }, alice)).channel;
    for (const action of ['archive', 'restore', 'delete']) assert.equal((await lifecycle(direct, operation(direct, { action }))).status, 403);
    assert.equal((await order(direct, operation(direct, { direction: 'up' }))).status, 403);
    assert.deepEqual((await detail(privateChannel.id)).conversation.memberIds, privateChannel.memberIds);
  });

  await t.test('reordering swaps adjacent channels once and survives messages, sessions and restart', async () => {
    const before = await activeIds();
    const channel = (await list()).find(c => c.id === before[1]);
    const body = operation(channel, { direction: 'up' });
    const changed = ok(await order(channel, body));
    const expected = [...before]; [expected[0], expected[1]] = [expected[1], expected[0]];
    assert.deepEqual(await activeIds(), expected);
    assert.deepEqual(changed.order.filter(c => expected.includes(c.id)).map(c => c.id), expected);
    assert.equal(changed.order.find(c => c.id === channel.id).version, channel.version + 1);
    const versions = (await list()).map(c => [c.id, c.version]);
    ok(await order(channel, body));
    assert.deepEqual((await list()).map(c => [c.id, c.version]), versions, 'retry must not move the channel a second time');
    assert.equal((await order(channel, { ...body, direction: 'down' })).status, 409);
    assert.equal((await order(channel, operation(channel, { direction: 'down' }))).status, 409);
    await send(publicChannels[2], 'Новая активность не меняет порядок');
    assert.deepEqual(await activeIds(), expected);
    const publicExpected = expected.filter(id => publicChannels.some(c => c.id === id));
    assert.deepEqual((await activeIds(outsider)).filter(id => publicExpected.includes(id)), publicExpected);
    await f.restartApi();
    assert.deepEqual(await activeIds(), expected);
    const top = (await list()).find(c => c.id === expected[0]);
    const boundary = operation(top, { direction: 'up' });
    ok(await order(top, boundary)); ok(await order(top, boundary));
    assert.equal((await detail(top.id)).conversation.version, top.version, 'boundary moves are idempotent no-ops');
    assert.deepEqual(await activeIds(), expected);
  });

  let archiveBody;
  await t.test('archive retains private history and files while excluding notifications and blocking content changes', async () => {
    privateChannel = (await detail(privateChannel.id)).conversation;
    assert.ok((await unread()).notifications.some(n => n.conversationId === privateChannel.id));
    assert.ok((await mentions()).mentions.some(n => n.conversationId === privateChannel.id));
    archiveBody = operation(privateChannel, { action: 'archive' });
    privateChannel = ok(await lifecycle(privateChannel, archiveBody)).conversation;
    assert.ok(privateChannel.archivedAt); assert.equal(privateChannel.deletedAt, null); assert.equal(privateChannel.canPost, false);
    const archived = await detail(privateChannel.id, bob);
    assert.deepEqual(archived.messages.map(m => m.id), [first.id, reply.id]);
    assert.deepEqual(archived.conversation.memberIds, privateCreation.channel.memberIds);
    assert.equal(archived.conversation.unreadCount, 0); assert.equal(archived.conversation.unreadMentionCount, 0);
    for (const message of archived.messages) { assert.equal(message.canEdit, false); assert.equal(message.canDelete, false); }
    assert.equal(await (await download(bob)).text(), 'SYNTHETIC_ARCHIVED_ATTACHMENT');
    assert.equal((await list(outsider)).some(c => c.id === privateChannel.id), false);
    assert.equal((await download(outsider)).status, 404);
    assert.equal((await unread()).notifications.some(n => n.conversationId === privateChannel.id), false);
    assert.equal((await mentions()).mentions.some(n => n.conversationId === privateChannel.id), false);
    const writes = [
      ['POST', '/team/messages', messageBody(privateChannel, 'Архив закрыт для отправки')],
      ['POST', '/team/messages', firstBody],
      ['PUT', `/team/messages/${first.id}`, { responsibilityScopeId: scope, operationId: randomUUID(), version: first.version, text: 'Правка архива' }],
      ['PUT', `/team/messages/${first.id}/deletion`, { responsibilityScopeId: scope, operationId: randomUUID(), version: first.version }],
      ['PUT', `/team/messages/${first.id}/reactions`, { responsibilityScopeId: scope, emoji: '👍', present: true }],
    ];
    for (const [method, route, body] of writes) for (const session of [alice, admin]) assert.equal((await call(method, route, body, session)).status, 409, `${method} ${route}`);
    assert.equal((await order(privateChannel, operation(privateChannel, { direction: 'up' }))).status, 409);
    ok(await call('PUT', `/team/conversations/${privateChannel.id}/read`, { responsibilityScopeId: scope, messages: [{ id: first.id, version: first.version }] }, bob));
    assert.deepEqual(ok(await lifecycle(privateChannel, archiveBody)).conversation, (await detail(privateChannel.id)).conversation);
    assert.equal((await lifecycle(privateChannel, operation(privateChannel, { action: 'archive' }))).status, 409);
  });

  await t.test('restore preserves membership and optimistic versions; stale operations cannot rearchive a restored channel', async () => {
    assert.equal((await lifecycle(privateChannel, operation(privateChannel, { version: 1, action: 'restore' }))).status, 409);
    const restore = operation(privateChannel, { action: 'restore' });
    const attempts = await Promise.all([lifecycle(privateChannel, restore), lifecycle(privateChannel, { ...restore, operationId: randomUUID() })]);
    assert.deepEqual(attempts.map(r => r.status).sort(), [200, 409]);
    privateChannel = ok(attempts.find(r => r.status === 200)).conversation;
    assert.equal(privateChannel.archivedAt, null); assert.equal((await detail(privateChannel.id, alice)).conversation.canPost, true);
    assert.deepEqual(privateChannel.memberIds, privateCreation.channel.memberIds);
    ok(await lifecycle(privateChannel, archiveBody));
    assert.equal((await detail(privateChannel.id)).conversation.archivedAt, null, 'old archive retry cannot undo restoration');
    await send(privateChannel, 'После восстановления можно писать');
    assert.equal((await call('GET', scoped(`/team/conversations/${privateChannel.id}`), undefined, outsider)).status, 404);
    await f.restartApi();
    assert.equal((await detail(privateChannel.id)).conversation.archivedAt, null);
  });

  await t.test('deleted channels disappear from every live content surface and retries cannot resurrect them', async () => {
    privateChannel = (await detail(privateChannel.id)).conversation;
    const deleteBody = operation(privateChannel, { action: 'delete' });
    const deleted = ok(await lifecycle(privateChannel, deleteBody)).conversation;
    assert.ok(deleted.deletedAt); assert.equal(deleted.canPost, false);
    assert.deepEqual(ok(await lifecycle(privateChannel, deleteBody)).conversation, deleted);
    assert.deepEqual(ok(await lifecycle(privateChannel, archiveBody)).conversation, deleted, 'an old archive retry returns the current tombstone');
    assert.equal((await lifecycle(privateChannel, { ...deleteBody, action: 'restore' })).status, 409);
    for (const session of [admin, alice, bob]) {
      assert.equal((await list(session)).some(c => c.id === privateChannel.id), false);
      for (const route of [scoped(`/team/conversations/${privateChannel.id}`), scoped(`/team/conversations/${privateChannel.id}/changes`), scoped(`/team/messages/${first.id}`), scoped(`/team/messages/${reply.id}`)]) assert.equal((await call('GET', route, undefined, session)).status, 404, route);
      assert.equal((await download(session)).status, 404);
      assert.equal((await unread(session)).notifications.some(n => n.conversationId === privateChannel.id), false);
      assert.equal((await mentions(session)).mentions.some(n => n.conversationId === privateChannel.id), false);
      assert.equal((await call('POST', '/team/messages', messageBody(privateChannel, 'Удалённый канал'), session)).status, 404);
      assert.equal((await call('PUT', `/team/mentions/${first.id}/read`, { responsibilityScopeId: scope, version: first.version }, session)).status, 404);
    }
    assert.equal((await call('POST', '/team/conversations', privateCreation.body)).status, 404);
    assert.equal((await call('POST', '/team/messages', firstBody, alice)).status, 404, 'an old send retry cannot expose deleted history');
    for (const action of ['archive', 'restore', 'delete']) assert.equal((await lifecycle(privateChannel, operation(deleted, { action }))).status, 404);
    assert.equal((await order(privateChannel, operation(deleted, { direction: 'up' }))).status, 404);
    assert.deepEqual((await db.query('SELECT user_id FROM team_members WHERE conversation_id=$1 ORDER BY user_id', [privateChannel.id])).rows.map(row => row.user_id), privateCreation.channel.memberIds);
    await f.restartApi();
    assert.equal((await list()).some(c => c.id === privateChannel.id), false);
    assert.deepEqual(ok(await lifecycle(privateChannel, deleteBody)).conversation, deleted);
  });

  await t.test('scope substitution and changed session authority cannot mutate a channel', async () => {
    const channel = (await detail(publicChannels[0].id)).conversation;
    const wrongScope = randomUUID();
    await db.query("INSERT INTO responsibility_scopes(id,project_id,name) VALUES($1,$2,'Lifecycle wrong scope')", [wrongScope, ids.project]);
    for (const action of ['archive', 'delete']) assert.equal((await lifecycle(channel, operation(channel, { responsibilityScopeId: wrongScope, action }))).status, 404);
    assert.equal((await order(channel, operation(channel, { responsibilityScopeId: wrongScope, direction: 'down' }))).status, 404);
    await db.query('UPDATE users SET auth_version=auth_version+1 WHERE id=$1', [ids.admin]);
    assert.equal((await lifecycle(channel, operation(channel, { action: 'delete' }))).status, 401);
    assert.equal((await order(channel, operation(channel, { direction: 'down' }))).status, 401);
  });
});

test('drag reorder atomically rotates rank slots and validates both source and target authority', { timeout: 180000 }, async t => {
  const f = await createTestServer({ staffTeamActors: true });
  t.after(() => f.close());
  const { ids, adminPool: db } = f;
  const otherScope = randomUUID(), foreignCompany = randomUUID(), foreignProject = randomUUID(), foreignScope = randomUUID();
  await db.query('INSERT INTO responsibility_scopes(id,project_id,name) VALUES($1,$2,$3)', [otherScope, ids.project, 'Другой отдел компании']);
  await db.query('INSERT INTO legal_entities(id,name) VALUES($1,$2)', [foreignCompany, 'Другая компания']);
  await db.query('INSERT INTO projects(id,name,legal_entity_id,region_id) VALUES($1,$2,$3,$4)', [foreignProject, 'Другой проект', foreignCompany, ids.region]);
  await db.query('INSERT INTO responsibility_scopes(id,project_id,name) VALUES($1,$2,$3)', [foreignScope, foreignProject, 'Другая область']);
  await db.query('UPDATE access_grants SET legal_entity_id=$2,project_id=$3,responsibility_scope_id=$4 WHERE user_id=$1', [ids.dispatcher, foreignCompany, foreignProject, foreignScope]);
  const admin = await f.devLogin(ids.admin), alice = await f.devLogin(ids.drivers[0]), outsider = await f.devLogin(ids.dispatcher);
  const call = (method, path, body, session = admin) => f.request(method, path, body, session.accessToken);
  const ok = result => { assert.ok([200, 201].includes(result.status), `${result.status}: ${JSON.stringify(result.body)}`); return result.body; };
  const create = async (title, patch = {}, session = admin) => ok(await call('POST', '/team/conversations', {
    id: randomUUID(), responsibilityScopeId: ids.scope, kind: 'channel', title, memberIds: [], ...patch,
  }, session));
  const list = async () => ok(await call('GET', '/team/conversations')).conversations.filter(row => row.kind === 'channel' && !row.archivedAt);
  const request = (source, target, placement, patch = {}) => ({ responsibilityScopeId: source.responsibilityScopeId, operationId: randomUUID(), version: source.version,
    targetId: target.id, targetVersion: target.version, placement, ...patch });
  const reorder = (source, body, session = admin) => call('PUT', `/team/conversations/${source.id}/order`, body, session);
  const channels = [];
  for (const [index, title] of ['A', 'B', 'C', 'D', 'E'].entries()) channels.push(await create(title, index === 4 ? { responsibilityScopeId: otherScope } : {}));
  const [a, b, c, d, e] = channels.map(channel => channel.id);
  let firstOperation;

  await t.test('long moves in both directions preserve rank slots and only increment changed channel versions', async () => {
    for (const [sourceId, targetId, placement, expected] of [[e, b, 'before', [a, e, b, c, d]], [a, c, 'after', [e, b, c, a, d]], [d, e, 'before', [d, e, b, c, a]]]) {
      const before = await list(), source = before.find(row => row.id === sourceId), target = before.find(row => row.id === targetId);
      const body = request(source, target, placement), after = ok(await reorder(source, body)).order;
      firstOperation ||= { source, body };
      assert.deepEqual(after.map(row => row.id), expected);
      assert.deepEqual(after.map(row => row.sortOrder), before.map(row => row.sortOrder), 'moving channels reuses the same ordered rank slots');
      for (const [index, row] of after.entries()) {
        const previous = before.find(item => item.id === row.id);
        assert.equal(row.version, previous.version + (before[index].id === row.id ? 0 : 1));
      }
      assert.deepEqual((await list()).map(row => row.id), expected);
    }
    const before = await list(), source = before[1], body = request(source, before[0], 'after');
    assert.deepEqual(ok(await reorder(source, body)).order, before.map(({ id, responsibilityScopeId, sortOrder, version }) => ({ id, responsibilityScopeId, sortOrder, version })), 'dropping into the existing position is a no-op');
    ok(await reorder(firstOperation.source, firstOperation.body));
    assert.deepEqual(await list(), before, 'replaying an earlier long move returns current state without moving again');
    assert.equal((await reorder(firstOperation.source, { ...firstOperation.body, placement: 'after' })).status, 409);
    const audits = await db.query("SELECT payload FROM audit_events WHERE payload->>'action'='team.channel.order_changed'");
    assert.equal(audits.rowCount, 3);
    assert.ok(audits.rows.some(row => row.payload.metadata.targetId === b && row.payload.metadata.changedChannelIds.length === 4));
  });

  await t.test('stale source and target revisions fail without changing any channel; competing drops conflict', async () => {
    let before = await list(), source = before[0], target = before[2];
    assert.equal((await reorder(source, request(source, target, 'after', { version: source.version - 1 }))).status, 409);
    assert.equal((await reorder(source, request(source, target, 'after', { targetVersion: target.version - 1 }))).status, 409);
    assert.deepEqual(await list(), before);
    const otherSource = before[before.length - 1];
    const attempts = await Promise.all([reorder(source, request(source, target, 'after')), reorder(otherSource, request(otherSource, target, 'before'))]);
    assert.deepEqual(attempts.map(result => result.status).sort(), [200, 409]);
    const after = await list();
    assert.equal(after.find(row => row.id === target.id).version, target.version + 1);
    assert.deepEqual(after.map(row => row.sortOrder), before.map(row => row.sortOrder));
  });

  await t.test('targets must be active channels in the same company and dragging never grants administrator authority', async () => {
    const foreign = await create('Чужой канал', { responsibilityScopeId: foreignScope }, outsider);
    let archived = await create('Архивный канал'), deleted = await create('Удалённый канал');
    const direct = await create('', { kind: 'direct', memberIds: [ids.admin, ids.drivers[0]] });
    for (const [channel, action] of [[archived, 'archive'], [deleted, 'delete']]) {
      const saved = ok(await call('PUT', `/team/conversations/${channel.id}/lifecycle`, {
        responsibilityScopeId: channel.responsibilityScopeId, operationId: randomUUID(), version: channel.version, action,
      })).conversation;
      if (action === 'archive') archived = saved; else deleted = saved;
    }
    const before = await list(), source = before[0], target = before[before.length - 1];
    for (const [candidate, status] of [[foreign, 404], [archived, 409], [deleted, 404], [direct, 403], [source, 400], [{ id: randomUUID(), version: 1 }, 404]]) {
      assert.equal((await reorder(source, request(source, candidate, 'before'))).status, status);
    }
    const impersonated = ok(await call('POST', '/auth/impersonate', { userId: ids.drivers[0] }));
    for (const session of [alice, impersonated]) assert.equal((await reorder(source, request(source, target, 'after'), session)).status, 403);
    assert.equal((await reorder(archived, request(archived, target, 'before'))).status, 409);
    assert.deepEqual(await list(), before);
  });
});
