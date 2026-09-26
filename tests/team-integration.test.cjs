'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createTestServer } = require('./local-test-server.cjs');
const { articleStructure, createArticlePosition } = require('./team-article-fixtures.cjs');

test('corporate workspace keeps conversations, branches, knowledge and shared summaries within current grants', { timeout: 180000 }, async t => {
  const fixture = await createTestServer({ staffTeamActors: true });
  t.after(() => fixture.close());
  const { ids, request, devLogin, adminPool: db } = fixture;
  const admin = await devLogin(ids.admin), alice = await devLogin(ids.drivers[0]), bob = await devLogin(ids.drivers[1]), outsider = await devLogin(ids.dispatcher);
  const scope = ids.scope;
  const scoped = path => `${path}?responsibilityScopeId=${scope}`;
  const get = (path, session = alice) => request('GET', path, undefined, session.accessToken);
  const post = (path, body, session = alice) => request('POST', path, body, session.accessToken);
  const put = (path, body, session = alice) => request('PUT', path, body, session.accessToken);
  const ok = (result, expected) => { assert.ok((expected ? [expected] : [200, 201]).includes(result.status), `HTTP ${result.status}: ${JSON.stringify(result.body)}`); return result.body; };
  const denied = result => assert.ok([403, 404].includes(result.status), `Expected denied access, got ${result.status}`);
  const createConversation = (patch = {}, session = alice) => post('/team/conversations', { id: randomUUID(), responsibilityScopeId: scope, kind: 'channel', title: 'Операционная команда', memberIds: [], ...patch }, session);
  const message = (conversationId, text, parentId = null, session = alice, id = randomUUID()) => post('/team/messages', { id, responsibilityScopeId: scope, conversationId, text, parentId }, session);
  let channel, direct, root, reply, branch, report;
  const periodStart = new Date(Date.now() - 86400000).toISOString();

  await t.test('authentication and explicit corporate monitoring policy', async () => {
    assert.equal((await request('GET', '/team/context')).status, 401);
    const context = ok(await get('/team/context'));
    assert.equal(context.canManage, false);
    assert.ok(context.policy);
    assert.ok(context.scopes.some(s => s.responsibilityScopeId === scope));
    assert.equal(ok(await get('/team/context', admin)).canManage, true);
    const people = ok(await get(scoped('/team/people'))).people;
    assert.ok(people.some(p => p.id === ids.drivers[1]));
  });

  await t.test('channels and arbitrarily nested branches are durable and correctly attributed', async () => {
    channel = ok(await createConversation());
    root = ok(await message(channel.id, 'Задача: проверить договор до пятницы.'));
    reply = ok(await message(channel.id, 'Можно автоматизировать проверку документов и сократить время.', root.id, bob));
    branch = ok(await message(channel.id, 'Новая ветка: обсудим интеграцию.', reply.id, outsider));
    assert.equal(root.authorId, ids.drivers[0]);
    assert.equal(reply.parentId, root.id);
    assert.equal(branch.parentId, reply.id);
    const detail = ok(await get(scoped(`/team/conversations/${channel.id}`), bob));
    assert.deepEqual(detail.messages.map(m => m.id), [root.id, reply.id, branch.id]);
    const retryId = randomUUID();
    const first = ok(await message(channel.id, 'Повторяемая отправка', null, alice, retryId));
    assert.deepEqual(ok(await message(channel.id, 'Повторяемая отправка', null, alice, retryId)), first);
    assert.equal((await message(channel.id, 'Изменённый текст', null, alice, retryId)).status, 409);
    assert.equal((await post('/team/messages', { id: randomUUID(), responsibilityScopeId: scope, conversationId: channel.id, text: 'Подмена', authorId: ids.admin })).status, 400);
    await fixture.restartApi();
    assert.equal(ok(await get(scoped(`/team/conversations/${channel.id}`))).messages.length, 4);
  });

  await t.test('DMs are visible to both participants and audited administrators, never unrelated employees', async () => {
    direct = ok(await createConversation({ kind: 'direct', title: '', memberIds: [ids.drivers[0], ids.drivers[1]] }));
    const secret = ok(await message(direct.id, 'Риск: возможен срыв срока поставки и штраф.'));
    ok(await message(direct.id, 'Возможность роста: новый клиент готов увеличить объём.', secret.id, bob));
    assert.equal(ok(await get(scoped(`/team/conversations/${direct.id}`), bob)).messages.length, 2);
    denied(await get(scoped(`/team/conversations/${direct.id}`), outsider));
    assert.ok(!ok(await get(scoped('/team/conversations'), outsider)).conversations.some(c => c.id === direct.id));
    assert.ok(ok(await get(scoped('/team/conversations'), admin)).conversations.some(c => c.id === direct.id));
    assert.equal(ok(await get(scoped(`/team/conversations/${direct.id}`), admin)).messages.length, 2);
    assert.ok((await db.query("SELECT 1 FROM audit_events WHERE payload->>'action'='team.direct.admin_read' AND payload->>'entityId'=$1 AND payload->>'actorId'=$2", [direct.id, ids.admin])).rowCount > 0);
    denied(await message(direct.id, 'Админ не участник', null, admin));
    denied(await message(direct.id, 'Чужое сообщение', null, outsider));
    const crossParent = await message(channel.id, 'Недопустимая ссылка на чужую ветку', secret.id);
    assert.ok([400, 403, 404].includes(crossParent.status));
  });

  await t.test('knowledge articles use concurrent-edit protection', async () => {
    const articlePosition = await createArticlePosition(fixture, admin);
    for (const userId of [ids.drivers[0], ids.drivers[1]]) ok(await put('/team/knowledge-permissions', { responsibilityScopeId: scope, userId, canCreate: true, canEdit: true }, admin));
    const article = { id: randomUUID(), responsibilityScopeId: scope, version: 0, title: 'Работа с поставками', body: 'Проверяйте документы до отправки.', ...articleStructure(articlePosition) };
    const saved = ok(await put('/team/articles', article));
    assert.equal(saved.version, 1);
    assert.ok(ok(await get(scoped('/team/articles'), bob)).articles.some(a => a.id === article.id));
    const writes = await Promise.all([put('/team/articles', { ...article, version: 1, body: 'Первое изменение.' }), put('/team/articles', { ...article, version: 1, body: 'Второе изменение.' }, bob)]);
    assert.deepEqual(writes.map(w => w.status).sort(), [200, 409]);
  });

  await t.test('private summaries include other employees DMs and sharing never grants source access', async () => {
    const body = { responsibilityScopeId: scope, periodStart, periodEnd: new Date(Date.now() + 1000).toISOString() };
    denied(await post('/team/summaries', body));
    report = ok(await post('/team/summaries', body, admin));
    assert.equal(report.mode, 'extractive');
    assert.equal(report.messageCount, 6);
    const categories = new Set(report.items.map(i => i.category));
    for (const category of ['task', 'growth', 'optimization', 'risk']) assert.ok(categories.has(category), `Missing ${category}`);
    assert.ok(report.items.every(i => i.sourceMessageIds.length));
    assert.ok(!ok(await get(scoped('/team/summaries'), outsider)).summaries.some(s => s.id === report.id));
    denied(await put(`/team/summaries/${report.id}/sharing`, { responsibilityScopeId: scope, recipientIds: [ids.dispatcher] }, alice));
    ok(await put(`/team/summaries/${report.id}/sharing`, { responsibilityScopeId: scope, recipientIds: [ids.dispatcher] }, admin));
    assert.ok(ok(await get(scoped('/team/summaries'), outsider)).summaries.some(s => s.id === report.id));
    denied(await get(scoped(`/team/conversations/${direct.id}`), outsider));
    ok(await put(`/team/summaries/${report.id}/sharing`, { responsibilityScopeId: scope, recipientIds: [] }, admin));
    assert.ok(!ok(await get(scoped('/team/summaries'), outsider)).summaries.some(s => s.id === report.id));
  });

  await t.test('schedules survive restart, are admin-only, and validate timezone and recipients', async () => {
    const body = { id: randomUUID(), responsibilityScopeId: scope, enabled: true, frequency: 'daily', time: '09:00', timeZone: 'Europe/Moscow', weekday: 1, recipientIds: [ids.dispatcher] };
    denied(await put('/team/schedules', body));
    denied(await get(scoped('/team/schedules')));
    assert.equal((await put('/team/schedules', { ...body, timeZone: 'Invalid/Zone' }, admin)).status, 400);
    assert.equal((await put('/team/schedules', { ...body, time: '99:99' }, admin)).status, 400);
    const saved = ok(await put('/team/schedules', body, admin));
    assert.ok(Number.isFinite(Date.parse(saved.nextRunAt)));
    await fixture.restartApi();
    const restored = ok(await get(scoped('/team/schedules'), admin)).schedules.find(s => s.id === body.id);
    assert.equal(restored.frequency, 'daily');
    assert.equal(restored.timeZone, 'Europe/Moscow');
    ok(await put('/team/schedules', { ...body, enabled: false }, admin));
  });

  await t.test('company chat scopes do not expand project records, external accounts or revoked company access', async () => {
    const foreignScope = randomUUID();
    await db.query('INSERT INTO responsibility_scopes VALUES($1,$2,$3)', [foreignScope, ids.project, 'Другая команда']);
    for (const path of ['conversations', 'people']) ok(await get(`/team/${path}?responsibilityScopeId=${foreignScope}`, admin));
    for (const path of ['articles', 'summaries', 'schedules']) denied(await get(`/team/${path}?responsibilityScopeId=${foreignScope}`, admin));
    const externalId = randomUUID();
    await db.query('INSERT INTO users(id,display_name,role,active,approved) VALUES($1,$2,$3,true,true)', [externalId, 'Внешний', 'external_recruiter']);
    await db.query('INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id) VALUES($1,$2,$3,$4,$5)', [externalId, ids.legal, ids.region, ids.project, scope]);
    denied(await get('/team/context', await devLogin(externalId)));
    const badRecipient = { responsibilityScopeId: scope, recipientIds: [externalId] };
    assert.ok([400, 403, 404].includes((await put(`/team/summaries/${report.id}/sharing`, badRecipient, admin)).status));
    await db.query('DELETE FROM access_grants WHERE user_id=$1', [ids.drivers[1]]);
    denied(await get(scoped(`/team/conversations/${direct.id}`), bob));
    denied(await message(direct.id, 'После отзыва прав', null, bob));
    await db.query('UPDATE users SET active=false WHERE id=$1', [ids.drivers[0]]);
    assert.equal((await get(scoped(`/team/conversations/${channel.id}`))).status, 401);
  });
});
