'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createTestServer } = require('./local-test-server.cjs');

test('structured articles preserve automatic identity and history while validating company audience and legacy compatibility', { timeout: 180000 }, async t => {
  const f = await createTestServer({ staffTeamActors: true });
  t.after(() => f.close());
  const { ids, adminPool: db } = f, otherScope = randomUUID(), foreignScope = randomUUID(), foreignCompany = randomUUID(), foreignProject = randomUUID();
  await db.query('INSERT INTO responsibility_scopes(id,project_id,name) VALUES($1,$2,$3)', [otherScope, ids.project, 'Другая область компании']);
  await db.query('INSERT INTO legal_entities(id,name) VALUES($1,$2)', [foreignCompany, 'Другая компания']);
  await db.query('INSERT INTO projects(id,name,legal_entity_id,region_id) VALUES($1,$2,$3,$4)', [foreignProject, 'Другой проект', foreignCompany, ids.region]);
  await db.query('INSERT INTO responsibility_scopes(id,project_id,name) VALUES($1,$2,$3)', [foreignScope, foreignProject, 'Чужая область']);
  for (const [scope, company, project] of [[otherScope, ids.legal, ids.project], [foreignScope, foreignCompany, foreignProject]])
    await db.query('INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id) VALUES($1,$2,$3,$4,$5)', [ids.admin, company, ids.region, project, scope]);
  await db.query('UPDATE access_grants SET personal_data_visible=true WHERE user_id=ANY($1::uuid[])', [[ids.admin, ids.drivers[0], ids.drivers[1]]]);
  const admin = await f.devLogin(ids.admin), editor = await f.devLogin(ids.drivers[0]), reader = await f.devLogin(ids.drivers[1]);
  const call = (method, path, body, session = admin) => f.request(method, path, body, session.accessToken);
  const ok = value => { assert.ok([200, 201].includes(value.status), `${value.status}: ${JSON.stringify(value.body)}`); return value.body; };
  const position = async (scope, title) => ok(await call('PUT', `/team/organization/positions/${randomUUID()}`, { responsibilityScopeId: scope, operationId: randomUUID(), version: 0, title }));
  const manager = await position(ids.scope, 'Менеджер'), dispatcher = await position(otherScope, 'Диспетчер'), foreign = await position(foreignScope, 'Чужая должность');
  const structure = { reason: 'Устранить повторяющиеся ошибки.', purpose: 'Объяснить порядок действий.', result: 'Сотрудник умеет проверить результат.', audiencePositionIds: [manager.id, dispatcher.id] };
  const create = { id: randomUUID(), responsibilityScopeId: ids.scope, version: 0, title: 'Тема инструкции', body: 'Подробный текст инструкции.', ...structure };
  const save = (body, session = admin) => call('PUT', '/team/articles', body, session);
  const list = async (session = admin, scopeId) => ok(await call('GET', `/team/articles${scopeId ? `?responsibilityScopeId=${scopeId}` : ''}`, undefined, session)).articles;
  const latest = async (id, session = admin) => (await list(session)).find(article => article.id === id);
  let article;

  await t.test('new writes require every explicit section and a nonempty valid audience from the chosen company', async () => {
    const positions = ok(await call('GET', `/team/article-positions?responsibilityScopeId=${ids.scope}`, undefined, editor)).positions;
    assert.deepEqual(new Set(positions.map(row => row.id)), new Set([manager.id, dispatcher.id]));
    assert.equal((await call('GET', `/team/article-positions?responsibilityScopeId=${otherScope}`, undefined, editor)).status, 403);
    const legacyCreate = { id: randomUUID(), responsibilityScopeId: ids.scope, version: 0, title: 'Неполная', body: 'Текст' };
    assert.equal((await save(legacyCreate)).status, 400);
    for (const field of ['reason', 'purpose', 'result', 'audiencePositionIds']) {
      const incomplete = { ...create, id: randomUUID() }; delete incomplete[field];
      assert.equal((await save(incomplete)).status, 400, field);
    }
    for (const audiencePositionIds of [[foreign.id], [randomUUID()]]) assert.equal((await save({ ...create, id: randomUUID(), audiencePositionIds })).status, 403);
    assert.equal((await save({ ...create, id: randomUUID(), audiencePositionIds: [] })).status, 400);
    for (const patch of [{ authorName: 'Подмена' }, { updatedById: ids.drivers[0] }, { createdAt: '2020-01-01' }, { structured: false }])
      assert.equal((await save({ ...create, id: randomUUID(), ...patch })).status, 400);
    assert.equal((await db.query('SELECT count(*)::int AS count FROM team_articles')).rows[0].count, 0);
  });

  await t.test('first author, creation date and version are automatic; retries preserve snapshots and audience does not grant or restrict reading', async () => {
    const before = Date.now(); article = ok(await save(create));
    assert.equal(article.structured, true); assert.equal(article.version, 1); assert.equal(article.authorId, ids.admin);
    assert.equal(article.authorName, 'Администратор доступа'); assert.equal(article.updatedById, ids.admin); assert.equal(article.updatedByName, null);
    assert.ok(Date.parse(article.createdAt) >= before && Date.parse(article.createdAt) <= Date.now());
    assert.ok(Date.parse(article.updatedAt) >= Date.parse(article.createdAt) && Date.parse(article.updatedAt) <= Date.now());
    assert.deepEqual(article.audiencePositionIds, [...structure.audiencePositionIds].sort());
    assert.deepEqual(new Set(article.audiencePositions.map(row => row.title)), new Set(['Менеджер', 'Диспетчер']));
    assert.deepEqual(ok(await save(create)), article);
    assert.equal((await save({ ...create, reason: 'Другая причина' })).status, 409);
    assert.equal((await latest(article.id, reader)).id, article.id, 'read access is independent of the intended audience');
    assert.equal((await latest(article.id, reader)).canEdit, false);
    await assert.rejects(db.query("UPDATE team_articles SET author_name='Подмена' WHERE id=$1", [article.id]));
    await assert.rejects(db.query("UPDATE team_articles SET created_at=created_at-interval '1 day' WHERE id=$1", [article.id]));
    ok(await call('PUT', `/team/organization/positions/${manager.id}`, { responsibilityScopeId: ids.scope, operationId: randomUUID(), version: manager.version, title: 'Старший менеджер' }));
    assert.ok((await latest(article.id)).audiencePositions.some(row => row.id === manager.id && row.title === 'Менеджер'), 'renaming a position must not alter a published snapshot');
    assert.deepEqual(ok(await save(create)), article, 'an old creation retry retains its original audience labels');
  });

  await t.test('authorized editing updates only the latest editor and version, with optimistic conflicts and no structured downgrade', async () => {
    ok(await call('PUT', '/team/knowledge-permissions', { responsibilityScopeId: ids.scope, userId: ids.drivers[0], canCreate: false, canEdit: true }));
    const edited = ok(await save({ ...create, version: article.version, body: 'Текст редактора' }, editor));
    assert.equal(edited.authorId, article.authorId); assert.equal(edited.authorName, article.authorName); assert.equal(edited.createdAt, article.createdAt);
    assert.equal(edited.version, 2); assert.equal(edited.updatedById, ids.drivers[0]); assert.equal(edited.updatedByName, 'Водитель 01');
    assert.ok(edited.audiencePositions.some(row => row.id === manager.id && row.title === 'Старший менеджер'));
    assert.equal((await save({ id: article.id, responsibilityScopeId: ids.scope, version: edited.version, title: article.title, body: article.body }, editor)).status, 400);
    const competing = { ...create, version: edited.version, body: 'Конкурентная правка' };
    const attempts = await Promise.all([save(competing), save(competing, editor)]);
    assert.deepEqual(attempts.map(result => result.status).sort(), [200, 409]);
    const saved = ok(attempts.find(result => result.status === 200));
    assert.equal(saved.version, 3); assert.equal(saved.createdAt, article.createdAt);
    article = ok(await save({ ...create, version: saved.version, body: 'Итоговая правка автора' }));
    assert.equal(article.version, 4); assert.equal(article.updatedById, ids.admin); assert.equal(article.updatedByName, null);
    assert.equal((await save({ ...create, version: 1 })).status, 409);
    const before = article.authorName;
    await db.query("UPDATE users SET display_name='Новое имя автора' WHERE id=$1", [ids.admin]);
    assert.equal((await latest(article.id)).authorName, before);
  });

  await t.test('legacy and imported articles stay readable and editable without fabricated fields; explicit conversion affects exact-copy matching and deletion', async () => {
    const legacyId = randomUUID(), createdAt = '2024-01-02T03:04:05.000Z';
    await db.query(`INSERT INTO team_articles(id,legal_entity_id,region_id,project_id,responsibility_scope_id,title,body,author_id,author_name,updated_by,created_at)
      VALUES($1,$2,$3,$4,$5,'Старая статья','Старый текст',$6,'Первый автор',$6,$7)`, [legacyId, ids.legal, ids.region, ids.project, ids.scope, ids.admin, createdAt]);
    let legacy = await latest(legacyId);
    assert.equal(legacy.structured, false); assert.equal(legacy.reason, null); assert.equal(legacy.purpose, null); assert.equal(legacy.result, null); assert.deepEqual(legacy.audiencePositions, []);
    legacy = ok(await save({ id: legacyId, responsibilityScopeId: ids.scope, version: legacy.version, title: legacy.title, body: 'Правка старой статьи' }));
    assert.equal(legacy.structured, false); assert.equal(legacy.createdAt, createdAt); assert.equal(legacy.authorName, 'Первый автор');
    legacy = ok(await save({ id: legacyId, responsibilityScopeId: ids.scope, version: legacy.version, title: legacy.title, body: legacy.body, ...structure }));
    assert.equal(legacy.structured, true); assert.equal(legacy.authorName, 'Первый автор'); assert.equal(legacy.createdAt, createdAt);

    const imported = { responsibilityScopeIds: [ids.scope, otherScope], visibility: 'staff', folderPath: 'Инструкции', sourcePath: 'Инструкции/Оригинал.txt',
      title: 'Импортированная инструкция', body: 'Исходный текст', sourceArchive: 'Архив.zip', file: { filename: 'Оригинал.txt', mimeType: 'text/plain', contentBase64: Buffer.from('ORIGINAL_BYTES').toString('base64') } };
    const copies = ok(await call('POST', '/team/articles/import', imported)).articles;
    assert.ok(copies.every(copy => !copy.structured && copy.reason === null));
    assert.equal((await list()).filter(row => row.title === imported.title).length, 1);
    const first = copies.find(copy => copy.responsibilityScopeId === ids.scope);
    const converted = ok(await save({ id: first.id, responsibilityScopeId: ids.scope, version: first.version, title: first.title, body: first.body, ...structure }));
    assert.equal(converted.createdAt, first.createdAt); assert.deepEqual(converted.sourceFile, first.sourceFile);
    assert.equal((await list()).filter(row => row.title === imported.title).length, 2, 'structured and legacy copies have distinct current content');
    const deletion = ok(await call('PUT', `/team/articles/${converted.id}/deletion`, { responsibilityScopeId: ids.scope, operationId: randomUUID(), version: converted.version }));
    assert.deepEqual(deletion.deletedIds, [converted.id]);
    const survivor = (await list()).find(row => row.title === imported.title);
    assert.equal(survivor.responsibilityScopeId, otherScope); assert.equal(survivor.structured, false);
    const original = await fetch(`${f.origin}/api/v1/team/articles/${survivor.id}/source?responsibilityScopeId=${otherScope}`, { headers: { Authorization: `Bearer ${admin.accessToken}` } });
    assert.equal(original.status, 200); assert.equal(await original.text(), 'ORIGINAL_BYTES');
  });
});
