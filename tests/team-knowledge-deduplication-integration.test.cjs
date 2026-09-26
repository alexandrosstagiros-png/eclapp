'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createTestServer } = require('./local-test-server.cjs');
const { articleStructure, createArticlePosition } = require('./team-article-fixtures.cjs');

test('the aggregate knowledge library deduplicates exact authorized imports without merging stored articles or rights', { timeout: 180000 }, async t => {
  const f = await createTestServer({ staffTeamActors: true });
  t.after(() => f.close());
  const { ids, adminPool: db } = f;
  const scopes = [{ responsibilityScopeId: ids.scope, legalEntityId: ids.legal, regionId: ids.region, projectId: ids.project }];
  for (let index = 1; index < 5; index++) {
    const scope = { responsibilityScopeId: randomUUID(), legalEntityId: randomUUID(), regionId: ids.region, projectId: randomUUID() };
    await db.query('INSERT INTO legal_entities(id,name) VALUES($1,$2)', [scope.legalEntityId, `Синтетическая компания ${index}`]);
    await db.query('INSERT INTO projects(id,name,legal_entity_id,region_id) VALUES($1,$2,$3,$4)', [scope.projectId, `Проект ${index}`, scope.legalEntityId, scope.regionId]);
    await db.query('INSERT INTO responsibility_scopes(id,project_id,name) VALUES($1,$2,$3)', [scope.responsibilityScopeId, scope.projectId, `Область ${index}`]);
    scopes.push(scope);
    await db.query('INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id) VALUES($1,$2,$3,$4,$5)',
      [ids.admin, scope.legalEntityId, scope.regionId, scope.projectId, scope.responsibilityScopeId]);
  }
  const addEmployeeGrant = scope => db.query('INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id) VALUES($1,$2,$3,$4,$5)',
    [ids.drivers[0], scope.legalEntityId, scope.regionId, scope.projectId, scope.responsibilityScopeId]);
  await addEmployeeGrant(scopes[1]);
  const admin = await f.devLogin(ids.admin), employee = await f.devLogin(ids.drivers[0]);
  const call = (method, route, body, session = admin) => f.request(method, route, body, session.accessToken);
  const ok = result => { assert.ok([200, 201].includes(result.status), `${result.status}: ${JSON.stringify(result.body)}`); return result.body; };
  const list = async (session = admin, scopeId) => ok(await call('GET', `/team/articles${scopeId ? `?responsibilityScopeId=${scopeId}` : ''}`, undefined, session));
  const payload = (title, filename, patch = {}) => ({ responsibilityScopeIds: scopes.map(scope => scope.responsibilityScopeId), visibility: 'staff',
    folderPath: 'Общая информация', sourcePath: `Общая информация/${filename}`, title, body: `Синтетический текст ${title}.`, sourceArchive: 'Документы.zip',
    file: { filename, mimeType: 'text/plain', contentBase64: Buffer.from(`Original ${filename}`).toString('base64') }, ...patch });
  const firstInput = payload('Документ 1', 'Первый.txt'), secondInput = payload('Документ 2', 'Второй.txt', { folderPath: 'Инструкции', sourcePath: 'Инструкции/Второй.txt' });
  const firstCopies = ok(await call('POST', '/team/articles/import', firstInput)).articles;
  const secondCopies = ok(await call('POST', '/team/articles/import', secondInput)).articles;
  const download = async (article, session = admin, scopeId = article.responsibilityScopeId) => {
    const result = await fetch(`${f.origin}/api/v1/team/articles/${article.id}/source?responsibilityScopeId=${scopeId}`, { headers: { Authorization: `Bearer ${session.accessToken}` } });
    return { status: result.status, bytes: Buffer.from(await result.arrayBuffer()) };
  };
  const save = (article, patch, session = admin) => call('PUT', '/team/articles', { id: article.id, responsibilityScopeId: article.responsibilityScopeId,
    version: article.version, title: article.title, body: article.body, ...patch }, session);
  let retainedEmployeeScope;

  await t.test('five company copies become one stable accessible result per source while scoped lists and originals remain intact', async () => {
    const aggregate = await list();
    assert.equal(aggregate.articles.length, 2);
    assert.equal(Object.keys(aggregate.permissionsByScope).length, 5);
    for (const copies of [firstCopies, secondCopies]) {
      const expected = [...copies].sort((a, b) => a.id.localeCompare(b.id))[0];
      const shown = aggregate.articles.find(article => article.title === expected.title);
      assert.equal(shown.id, expected.id); assert.equal(shown.responsibilityScopeId, expected.responsibilityScopeId); assert.equal(shown.version, expected.version);
      assert.deepEqual((await download(shown)).bytes, Buffer.from(`Original ${shown.sourceFile.filename}`));
    }
    assert.deepEqual((await list()).articles, aggregate.articles);
    for (const scope of scopes) {
      const scoped = await list(admin, scope.responsibilityScopeId);
      assert.equal(scoped.articles.length, 2);
      assert.ok(scoped.articles.every(article => article.responsibilityScopeId === scope.responsibilityScopeId));
    }
    assert.equal((await db.query('SELECT count(*)::int AS count FROM team_articles')).rows[0].count, 10);
    assert.equal((await db.query('SELECT count(*)::int AS count FROM team_article_imports')).rows[0].count, 10);
    assert.equal((await db.query('SELECT count(*)::int AS count FROM team_knowledge_files')).rows[0].count, 2);
  });

  await t.test('representatives are chosen after current ACL and prefer a genuinely editable copy without lending its rights to another scope', async () => {
    const before = (await list(employee)).articles.find(article => article.title === firstInput.title);
    const allowedCopies = firstCopies.filter(article => [scopes[0].responsibilityScopeId, scopes[1].responsibilityScopeId].includes(article.responsibilityScopeId));
    assert.equal(before.id, allowedCopies.map(article => article.id).sort()[0]); assert.equal(before.canEdit, false);
    const writable = allowedCopies.find(article => article.id !== before.id);
    ok(await call('PUT', '/team/knowledge-permissions', { responsibilityScopeId: writable.responsibilityScopeId, userId: ids.drivers[0], canCreate: false, canEdit: true }));
    const chosen = (await list(employee)).articles.find(article => article.title === firstInput.title);
    assert.equal(chosen.id, writable.id); assert.equal(chosen.responsibilityScopeId, writable.responsibilityScopeId); assert.equal(chosen.canEdit, true);
    assert.equal((await save(before, { body: 'Не должно сохраниться' }, employee)).status, 403);
    assert.equal((await download(chosen, employee)).status, 200);
    assert.equal((await download(chosen, employee, before.responsibilityScopeId)).status, 404);
    const forbiddenCopy = firstCopies.find(article => article.responsibilityScopeId === scopes[4].responsibilityScopeId);
    assert.equal((await download(forbiddenCopy, employee)).status, 404);
    await db.query('DELETE FROM access_grants WHERE user_id=$1 AND responsibility_scope_id=$2', [ids.drivers[0], writable.responsibilityScopeId]);
    const after = (await list(employee)).articles.find(article => article.title === firstInput.title);
    retainedEmployeeScope = after.responsibilityScopeId;
    assert.equal(after.id, before.id); assert.equal(after.canEdit, false);
    assert.equal((await download(chosen, employee)).status, 404);
    assert.equal((await download(after, employee)).status, 200);
  });

  await t.test('editorial variants, different originals, folders, filenames, MIME types and visibility remain separate; manual articles never collapse', async () => {
    const bodyCopy = firstCopies[0], titleCopy = firstCopies[1];
    let changed = ok(await save(bodyCopy, { body: 'Отдельная редакция текста' }));
    ok(await save(titleCopy, { title: 'Отдельное название' }));
    assert.equal((await list()).articles.length, 4, 'both current title and current body participate in the key');
    changed = { ...changed, responsibilityScopeId: bodyCopy.responsibilityScopeId };
    ok(await save(changed, { body: firstInput.body }));
    assert.equal((await list()).articles.length, 3, 'identical current content can share a card even when revision counters differ');

    const variant = payload('Варианты', 'Одинаковое имя.txt', { folderPath: 'Варианты', sourcePath: 'Варианты/Одинаковое имя.txt' });
    const importVariant = patch => call('POST', '/team/articles/import', { ...variant, ...patch });
    ok(await importVariant({ responsibilityScopeIds: scopes.slice(0, 2).map(scope => scope.responsibilityScopeId) }));
    const restricted = ok(await importVariant({ responsibilityScopeIds: [scopes[2].responsibilityScopeId], visibility: 'admin' })).articles[0];
    ok(await importVariant({ responsibilityScopeIds: [scopes[3].responsibilityScopeId], file: { ...variant.file, mimeType: 'text/markdown' } }));
    ok(await importVariant({ responsibilityScopeIds: [scopes[4].responsibilityScopeId], file: { ...variant.file, contentBase64: Buffer.from('Different original bytes').toString('base64') } }));
    ok(await importVariant({ responsibilityScopeIds: [scopes[0].responsibilityScopeId], folderPath: 'Другая папка', sourcePath: 'Другая папка/Одинаковое имя.txt' }));
    ok(await importVariant({ responsibilityScopeIds: [scopes[0].responsibilityScopeId], sourcePath: 'Варианты/Другое имя.txt', file: { ...variant.file, filename: 'Другое имя.txt' } }));
    assert.equal((await list()).articles.filter(article => article.title === variant.title).length, 6);
    assert.equal((await download(restricted, employee)).status, 404);
    assert.equal((await list(employee)).articles.some(article => article.id === restricted.id), false);
    for (const scope of scopes.slice(0, 2)) {
      const articlePosition = await createArticlePosition(f, admin, scope.responsibilityScopeId);
      ok(await call('PUT', '/team/articles', { id: randomUUID(), responsibilityScopeId: scope.responsibilityScopeId,
        version: 0, title: firstInput.title, body: firstInput.body, ...articleStructure(articlePosition) }));
    }
    assert.equal((await list()).articles.filter(article => !article.sourceFile).length, 2);
  });

  await t.test('adaptation retains its own scoped article versions and read receipts independently of the aggregate representative', async () => {
    await db.query('UPDATE users SET adaptation_required=true,adaptation_scope_id=$2 WHERE id=$1', [ids.drivers[0], retainedEmployeeScope]);
    const adaptation = ok(await call('GET', '/team/adaptation', undefined, employee));
    const scoped = (await list(employee, retainedEmployeeScope)).articles.filter(article => article.folderPath === 'Общая информация');
    assert.deepEqual(adaptation.articles.map(article => article.id), scoped.map(article => article.id));
    assert.equal(adaptation.total, 1); assert.equal(adaptation.readCount, 0);
    const article = adaptation.articles[0];
    const read = ok(await call('PUT', `/team/adaptation/articles/${article.id}/read`, { responsibilityScopeId: retainedEmployeeScope, version: article.version }, employee));
    assert.equal(read.readCount, 1);
    const complete = ok(await call('PUT', '/team/adaptation/complete', { responsibilityScopeId: retainedEmployeeScope }, employee));
    assert.equal(complete.completed, true);
    const receipt = (await db.query('SELECT article_id,article_version,responsibility_scope_id FROM team_adaptation_reads WHERE user_id=$1', [ids.drivers[0]])).rows[0];
    assert.equal(receipt.article_id, article.id); assert.equal(receipt.article_version, article.version); assert.equal(receipt.responsibility_scope_id, retainedEmployeeScope);
    assert.equal((await download({ ...article, responsibilityScopeId: retainedEmployeeScope }, employee)).status, 200);
  });
});
