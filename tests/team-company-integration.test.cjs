'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createTestServer } = require('./local-test-server.cjs');
const { articleStructure, createArticlePosition } = require('./team-article-fixtures.cjs');

test('Team shares public conversations across projects while preserving company and private boundaries', { timeout: 180000 }, async t => {
  const f = await createTestServer({ staffTeamActors: true });
  t.after(() => f.close());
  const { ids, adminPool: db } = f;
  const secondProject = randomUUID(), secondScope = randomUUID(), foreignCompany = randomUUID(), foreignProject = randomUUID(), foreignScope = randomUUID();
  await db.query('INSERT INTO projects(id,name,legal_entity_id,region_id) VALUES($1,$2,$3,$4)', [secondProject, 'Другой проект компании', ids.legal, ids.region]);
  await db.query('INSERT INTO responsibility_scopes(id,project_id,name) VALUES($1,$2,$3)', [secondScope, secondProject, 'Другая команда']);
  await db.query('INSERT INTO legal_entities(id,name) VALUES($1,$2)', [foreignCompany, 'Чужая компания']);
  await db.query('INSERT INTO projects(id,name,legal_entity_id,region_id) VALUES($1,$2,$3,$4)', [foreignProject, 'Чужой проект', foreignCompany, ids.region]);
  await db.query('INSERT INTO responsibility_scopes(id,project_id,name) VALUES($1,$2,$3)', [foreignScope, foreignProject, 'Чужая команда']);
  await db.query('UPDATE access_grants SET project_id=$2,responsibility_scope_id=$3,personal_data_visible=true WHERE user_id=$1', [ids.drivers[1], secondProject, secondScope]);
  await db.query('UPDATE access_grants SET legal_entity_id=$2,project_id=$3,responsibility_scope_id=$4 WHERE user_id=$1', [ids.dispatcher, foreignCompany, foreignProject, foreignScope]);
  await db.query('UPDATE access_grants SET personal_data_visible=true WHERE user_id=ANY($1::uuid[])', [[ids.drivers[0], ids.admin]]);
  const alice = await f.devLogin(ids.drivers[0]), bob = await f.devLogin(ids.drivers[1]), admin = await f.devLogin(ids.admin), outsider = await f.devLogin(ids.dispatcher);
  const call = (method, path, body, session = alice) => f.request(method, path, body, session.accessToken);
  const ok = result => { assert.ok([200, 201].includes(result.status), `${result.status}: ${JSON.stringify(result.body)}`); return result.body; };
  const scoped = (path, scope = ids.scope) => `${path}?responsibilityScopeId=${scope}`;
  const create = (scope, patch = {}, session = alice) => call('POST', '/team/conversations', { id: randomUUID(), responsibilityScopeId: scope, kind: 'channel', title: 'Общий канал', memberIds: [], ...patch }, session);
  const send = (conversation, text, patch = {}, session = alice) => call('POST', '/team/messages', { id: randomUUID(), responsibilityScopeId: conversation.responsibilityScopeId, conversationId: conversation.id, text, ...patch }, session);
  const first = ok(await create(ids.scope));
  const second = ok(await create(secondScope, { title: 'История другого проекта' }, bob));
  const foreign = ok(await create(foreignScope, { title: 'Чужая история' }, outsider));
  const file = { id: randomUUID(), filename: 'company.txt', mimeType: 'text/plain', contentBase64: Buffer.from('company attachment').toString('base64') };
  const message = ok(await send(first, '@all Коллеги', { mentions: { all: true, userIds: [] }, attachments: [file] }));
  const messageInSecond = ok(await send(second, '@all Другой проект', { mentions: { all: true, userIds: [] } }));
  let privateChannel, direct;

  await t.test('company context and people do not depend on overlapping project grants', async () => {
    const context = ok(await call('GET', '/team/context'));
    assert.equal(context.companyMode, true);
    assert.deepEqual(new Set(context.scopes.map(s => s.responsibilityScopeId)), new Set([ids.scope, secondScope]));
    assert.deepEqual(context.workScopes.map(s => s.responsibilityScopeId), [ids.scope]);
    const people = ok(await call('GET', '/team/people')).people;
    const colleague = people.find(person => person.id === ids.drivers[1]);
    assert.ok(colleague);
    assert.deepEqual(colleague.workResponsibilityScopeIds, [secondScope]);
    assert.deepEqual(new Set(colleague.responsibilityScopeIds), new Set([ids.scope, secondScope]));
    assert.equal(people.some(person => person.id === ids.dispatcher), false);
    const profile = ok(await call('GET', `/team/profiles/${ids.drivers[1]}`));
    assert.equal(profile.userId, ids.drivers[1]);
    assert.ok(ok(await call('GET', '/team/profile-directory')).profiles.some(person => person.userId === ids.drivers[1]));
    assert.equal((await call('GET', `/team/profiles/${ids.dispatcher}`)).status, 404);
    assert.equal((await call('GET', scoped('/team/people', foreignScope))).status, 403);
  });

  await t.test('public history, files, mentions, notifications and read state work across projects', async () => {
    for (const session of [alice, bob, admin]) {
      const list = ok(await call('GET', '/team/conversations', undefined, session)).conversations;
      assert.deepEqual(new Set(list.map(row => row.id)), new Set([first.id, second.id]));
      assert.equal(list.find(row => row.id === second.id).responsibilityScopeId, secondScope);
    }
    const detail = ok(await call('GET', scoped(`/team/conversations/${first.id}`), undefined, bob));
    assert.equal(detail.messages[0].id, message.id);
    assert.equal(detail.conversation.canPost, true);
    const download = await fetch(`${f.origin}/api/v1${scoped(`/team/attachments/${file.id}`)}`, { headers: { Authorization: `Bearer ${bob.accessToken}` } });
    assert.equal(download.status, 200); assert.equal(await download.text(), 'company attachment');
    const mentions = ok(await call('GET', '/team/mentions', undefined, bob));
    assert.deepEqual(new Set(mentions.mentions.map(row => row.messageId)), new Set([message.id, messageInSecond.id]));
    assert.equal(mentions.mentions.find(row => row.messageId === messageInSecond.id).responsibilityScopeId, secondScope);
    const unread = ok(await call('GET', '/team/unread', undefined, bob));
    assert.equal(unread.totalUnreadCount, 2); assert.equal(unread.totalUnreadMentionCount, 2);
    assert.equal(unread.notifications.find(row => row.messageId === message.id).responsibilityScopeId, ids.scope);
    ok(await call('PUT', `/team/conversations/${first.id}/read`, { responsibilityScopeId: ids.scope, messages: [{ id: message.id, version: message.version }] }, bob));
    assert.equal(ok(await call('GET', '/team/unread', undefined, bob)).totalUnreadCount, 1);
    const recipients = (await db.query('SELECT user_id FROM team_message_mentions WHERE message_id=$1', [message.id])).rows.map(row => row.user_id);
    assert.ok(recipients.includes(ids.drivers[1])); assert.ok(!recipients.includes(ids.dispatcher));
    assert.equal((await call('GET', scoped(`/team/conversations/${first.id}`), undefined, outsider)).status, 403);
    assert.deepEqual(ok(await call('GET', '/team/conversations', undefined, outsider)).conversations.map(row => row.id), [foreign.id]);
    assert.equal(ok(await call('GET', '/team/unread', undefined, outsider)).totalUnreadCount, 0);
  });

  await t.test('only administrators create private channels and change audience, including removing creators', async () => {
    assert.equal(first.canManageAccess, false);
    assert.equal((await create(ids.scope, { visibility: 'private', memberIds: [ids.drivers[0]] })).status, 403);
    const access = { responsibilityScopeId: ids.scope, operationId: randomUUID(), version: first.version, visibility: 'private', memberIds: [ids.drivers[1]] };
    assert.equal((await call('PUT', `/team/conversations/${first.id}/access`, access)).status, 403);
    privateChannel = ok(await call('PUT', `/team/conversations/${first.id}/access`, access, admin));
    assert.deepEqual(privateChannel.memberIds, [ids.drivers[1]]);
    assert.equal(privateChannel.canManageAccess, true); assert.equal(privateChannel.canPost, false);
    assert.equal((await call('GET', scoped(`/team/conversations/${first.id}`))).status, 404);
    assert.equal((await call('GET', scoped(`/team/messages/${message.id}`))).status, 404);
    assert.equal((await send(first, 'Создатель исключён')).status, 404);
    assert.equal(ok(await call('GET', '/team/conversations')).conversations.some(row => row.id === first.id), false);
    assert.equal(ok(await call('GET', '/team/unread')).notifications.some(row => row.conversationId === first.id), false);
    assert.equal(ok(await call('GET', scoped(`/team/conversations/${first.id}`), undefined, bob)).messages[0].id, message.id);
    const unrelated = await f.devLogin(ids.mechanic);
    assert.equal((await call('GET', scoped(`/team/conversations/${first.id}`), undefined, unrelated)).status, 404);
    assert.equal((await create(ids.scope, { visibility: 'private', memberIds: [ids.dispatcher] }, admin)).status, 403);
    const adminCreated = ok(await create(secondScope, { visibility: 'private', memberIds: [ids.drivers[1]] }, admin));
    assert.equal(adminCreated.canPost, false);
    ok(await call('GET', scoped(`/team/conversations/${first.id}`), undefined, admin));
    assert.ok((await db.query("SELECT FROM audit_events WHERE payload->>'action'='team.channel.admin_read' AND payload->>'entityId'=$1", [first.id])).rowCount);
  });

  await t.test('cross-project direct membership stays private and fixed', async () => {
    direct = ok(await create(ids.scope, { kind: 'direct', memberIds: [ids.drivers[0], ids.drivers[1]], title: '' }));
    assert.equal(direct.visibility, 'private'); assert.equal(direct.canManageAccess, false);
    ok(await send(direct, 'Личное сообщение', {}, bob));
    const unrelated = await f.devLogin(ids.mechanic);
    assert.equal((await call('GET', scoped(`/team/conversations/${direct.id}`), undefined, unrelated)).status, 404);
    assert.equal((await call('PUT', `/team/conversations/${direct.id}/access`, { responsibilityScopeId: ids.scope, operationId: randomUUID(), version: direct.version, visibility: 'private', memberIds: [ids.drivers[1]] }, admin)).status, 403);
  });

  await t.test('legacy knowledge, organization, tasks and reports retain their original scope permissions', async () => {
    for (const path of ['/team/articles', '/team/organization', '/team/tasks', '/team/summaries', '/team/schedules', '/team/outcomes?kind=weekly']) {
      const route = path.includes('?') ? `${path}&responsibilityScopeId=${secondScope}` : scoped(path, secondScope);
      const result = await call('GET', route, undefined, admin);
      assert.equal(result.status, 403, `${route}: ${JSON.stringify(result.body)}`);
    }
    const articlePosition = await createArticlePosition(f, admin);
    const article = ok(await call('PUT', '/team/articles', { id: randomUUID(), responsibilityScopeId: ids.scope, title: 'Историческая инструкция', body: 'Сохранена на месте', version: 0, ...articleStructure(articlePosition) }, admin));
    assert.ok(ok(await call('GET', '/team/articles')).articles.some(row => row.id === article.id && row.responsibilityScopeId === ids.scope));
    assert.equal(ok(await call('GET', '/team/articles', undefined, bob)).articles.some(row => row.id === article.id), false);
  });

  await t.test('revoking the last company grant immediately removes inherited public and private access', async () => {
    await db.query('DELETE FROM access_grants WHERE user_id=$1', [ids.drivers[1]]);
    assert.deepEqual(ok(await call('GET', '/team/conversations', undefined, bob)).conversations, []);
    assert.equal((await call('GET', scoped(`/team/conversations/${direct.id}`), undefined, bob)).status, 403);
    assert.equal((await send(second, 'Отозванные права', {}, bob)).status, 403);
    assert.equal((await call('PUT', `/team/conversations/${first.id}/access`, { responsibilityScopeId: ids.scope, operationId: randomUUID(), version: privateChannel.version, visibility: 'private', memberIds: [ids.drivers[1]] }, admin)).status, 403);
  });
});
