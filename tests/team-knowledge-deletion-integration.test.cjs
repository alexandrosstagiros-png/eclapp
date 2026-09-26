'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createTestServer } = require('./local-test-server.cjs');
const { articleStructure, createArticlePosition } = require('./team-article-fixtures.cjs');

test('administrators delete authorized exact instruction copies atomically without losing immutable history or adaptation progress', { timeout: 180000 }, async t => {
  const f = await createTestServer({ staffTeamActors: true });
  t.after(() => f.close());
  const { ids, adminPool: db } = f;
  const scopes = [{ id: ids.scope, company: ids.legal, project: ids.project }];
  for (let index = 1; index < 8; index++) {
    const scope = { id: randomUUID(), company: randomUUID(), project: randomUUID() };
    await db.query('INSERT INTO legal_entities(id,name) VALUES($1,$2)', [scope.company, `Удаление — компания ${index}`]);
    await db.query('INSERT INTO projects(id,name,legal_entity_id,region_id) VALUES($1,$2,$3,$4)', [scope.project, `Проект ${index}`, scope.company, ids.region]);
    await db.query('INSERT INTO responsibility_scopes(id,project_id,name) VALUES($1,$2,$3)', [scope.id, scope.project, `Область ${index}`]);
    await db.query('INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id) VALUES($1,$2,$3,$4,$5)', [ids.admin, scope.company, ids.region, scope.project, scope.id]);
    scopes.push(scope);
  }
  const admin = await f.devLogin(ids.admin), employee = await f.devLogin(ids.drivers[0]);
  const call = (method, route, body, session = admin) => f.request(method, route, body, session.accessToken);
  const ok = result => { assert.ok([200, 201].includes(result.status), `${result.status}: ${JSON.stringify(result.body)}`); return result.body; };
  const list = async (session = admin, scopeId) => ok(await call('GET', `/team/articles${scopeId ? `?responsibilityScopeId=${scopeId}` : ''}`, undefined, session)).articles;
  const instruction = { responsibilityScopeIds: scopes.slice(0, 6).map(scope => scope.id), visibility: 'staff', folderPath: 'Общая информация',
    sourcePath: 'Общая информация/Инструкция.txt', title: 'Удаляемая инструкция', body: 'Синтетическое содержимое инструкции.', sourceArchive: 'Архив.zip',
    file: { filename: 'Инструкция.txt', mimeType: 'text/plain', contentBase64: Buffer.from('SYNTHETIC_INSTRUCTION_ORIGINAL').toString('base64') } };
  const copies = ok(await call('POST', '/team/articles/import', instruction)).articles;
  const bodyVariant = ok(await call('POST', '/team/articles/import', { ...instruction, responsibilityScopeIds: [scopes[6].id], body: 'Отдельная редакция инструкции.' })).articles[0];
  const mimeVariant = ok(await call('POST', '/team/articles/import', { ...instruction, responsibilityScopeIds: [scopes[7].id], file: { ...instruction.file, mimeType: 'text/markdown' } })).articles[0];
  const folderVariant = ok(await call('POST', '/team/articles/import', { ...instruction, responsibilityScopeIds: [ids.scope], folderPath: 'Справочник', sourcePath: 'Справочник/Инструкция.txt' })).articles[0];
  const remaining = ok(await call('POST', '/team/articles/import', { ...instruction, responsibilityScopeIds: [ids.scope], title: 'Последняя инструкция',
    sourcePath: 'Общая информация/Последняя.txt', file: { ...instruction.file, filename: 'Последняя.txt' } })).articles[0];
  const articlePosition = await createArticlePosition(f, admin);
  const manualInput = { id: randomUUID(), responsibilityScopeId: ids.scope, version: 0, title: instruction.title, body: instruction.body, ...articleStructure(articlePosition) };
  const manual = { ...ok(await call('PUT', '/team/articles', manualInput)), responsibilityScopeId: ids.scope };
  await db.query('DELETE FROM access_grants WHERE user_id=$1 AND responsibility_scope_id=$2', [ids.admin, scopes[5].id]);
  const chosen = (await list()).find(article => article.sourceFile && article.folderPath === instruction.folderPath && article.body === instruction.body && article.sourceFile.mimeType === 'text/plain' && article.title === instruction.title);
  const chosenPosition = chosen.responsibilityScopeId === ids.scope ? articlePosition : await createArticlePosition(f, admin, chosen.responsibilityScopeId);
  const employeeCopy = copies.find(article => article.responsibilityScopeId === ids.scope);
  const operation = (article, patch = {}) => ({ responsibilityScopeId: article.responsibilityScopeId, operationId: randomUUID(), version: article.version, ...patch });
  const remove = (article, input = operation(article), session = admin) => call('PUT', `/team/articles/${article.id}/deletion`, input, session);
  const source = async (article, session = admin) => fetch(`${f.origin}/api/v1/team/articles/${article.id}/source?responsibilityScopeId=${article.responsibilityScopeId}`, { headers: { Authorization: `Bearer ${session.accessToken}` } });
  const adaptation = async () => ok(await call('GET', '/team/adaptation', undefined, employee));
  let deletion;

  await t.test('deletion belongs only to the real administrator and requires the selected source scope and current revision', async () => {
    assert.equal(chosen.canDelete, true);
    ok(await call('PUT', '/team/knowledge-permissions', { responsibilityScopeId: ids.scope, userId: ids.drivers[0], canCreate: true, canEdit: true }));
    const delegated = (await list(employee)).find(article => article.id === employeeCopy.id);
    assert.equal(delegated.canEdit, true); assert.equal(delegated.canDelete, false);
    const impersonated = ok(await call('POST', '/auth/impersonate', { userId: ids.drivers[0] }));
    assert.equal((await list(impersonated)).find(article => article.id === employeeCopy.id).canDelete, false);
    for (const session of [employee, impersonated]) assert.equal((await remove(employeeCopy, operation(employeeCopy), session)).status, 403);
    const wrongScope = scopes.find(scope => scope.id !== chosen.responsibilityScopeId && scope.id !== scopes[5].id).id;
    assert.equal((await remove(chosen, operation(chosen, { responsibilityScopeId: wrongScope }))).status, 404);
    assert.equal((await remove(chosen, operation(chosen, { version: chosen.version + 1 }))).status, 409);
    assert.equal((await remove(copies.find(article => article.responsibilityScopeId === scopes[5].id))).status, 403);
    await db.query('UPDATE users SET adaptation_required=true,adaptation_scope_id=$2 WHERE id=$1', [ids.drivers[0], ids.scope]);
    const state = await adaptation(); assert.equal(state.total, 2); assert.equal(state.canComplete, false);
    ok(await call('PUT', `/team/adaptation/articles/${employeeCopy.id}/read`, { responsibilityScopeId: ids.scope, version: employeeCopy.version }, employee));
    assert.equal((await adaptation()).readCount, 1);
  });

  await t.test('deleting one card removes five accessible exact copies once while variants, manual and inaccessible copies survive', async () => {
    const input = operation(chosen);
    const results = await Promise.all([remove(chosen, input), remove(chosen, input)]);
    deletion = ok(results[0]); assert.deepEqual(ok(results[1]), deletion);
    const expected = copies.filter(article => article.responsibilityScopeId !== scopes[5].id).map(article => article.id).sort();
    assert.deepEqual(deletion.deletedIds, expected); assert.equal(deletion.deletedCount, 5);
    assert.deepEqual(ok(await remove(chosen, input)), deletion);
    assert.equal((await remove(chosen, { ...input, version: input.version + 1 })).status, 409);
    assert.equal((await remove(manual, { ...input, responsibilityScopeId: ids.scope })).status, 409);
    assert.equal((await remove(chosen)).status, 404);
    for (const session of [admin, employee]) assert.equal((await list(session)).some(article => expected.includes(article.id)), false);
    for (const scope of scopes.slice(0, 5)) assert.equal((await list(admin, scope.id)).some(article => expected.includes(article.id)), false);
    const visible = await list();
    for (const variant of [bodyVariant, mimeVariant, folderVariant, manual, remaining]) assert.ok(visible.some(article => article.id === variant.id));
    const rows = (await db.query('SELECT id,deleted_at,deleted_by,version FROM team_articles WHERE id=ANY($1::uuid[])', [copies.map(article => article.id)])).rows;
    for (const row of rows) {
      assert.equal(Boolean(row.deleted_at), expected.includes(row.id));
      assert.equal(row.version, expected.includes(row.id) ? 2 : 1);
      if (row.deleted_at) assert.equal(row.deleted_by, ids.admin);
    }
    const audits = (await db.query("SELECT payload FROM audit_events WHERE payload->>'action'='team.article.deleted' AND payload->'metadata'->>'operationId'=$1", [input.operationId])).rows;
    assert.equal(audits.length, 5); assert.equal(JSON.stringify(audits).includes(instruction.body), false);
    assert.equal((await db.query('SELECT count(*)::int AS count FROM team_article_deletion_operations WHERE id=$1', [input.operationId])).rows[0].count, 1);
    assert.equal((await db.query('SELECT count(*)::int AS count FROM team_article_imports WHERE article_id=ANY($1::uuid[])', [expected])).rows[0].count, 5);
    assert.equal((await db.query('SELECT count(*)::int AS count FROM team_adaptation_reads WHERE article_id=$1', [employeeCopy.id])).rows[0].count, 1);
    await assert.rejects(db.query('UPDATE team_articles SET deleted_at=NULL,deleted_by=NULL WHERE id=$1', [chosen.id]));
    await assert.rejects(db.query('UPDATE team_article_deletion_operations SET deleted_ids=deleted_ids WHERE id=$1', [input.operationId]));
  });

  await t.test('deleted originals, edit/create retries and import retries cannot expose or recreate instructions', async () => {
    for (const article of copies.filter(item => deletion.deletedIds.includes(item.id))) assert.equal((await source(article)).status, 404);
    assert.equal((await source(employeeCopy, employee)).status, 404);
    for (const version of [0, 1, 2]) assert.equal((await call('PUT', '/team/articles', { id: chosen.id, responsibilityScopeId: chosen.responsibilityScopeId,
      version, title: chosen.title, body: chosen.body, ...articleStructure(chosenPosition) })).status, 404);
    assert.equal((await call('POST', '/team/articles/import', { ...instruction, responsibilityScopeIds: scopes.slice(0, 5).map(scope => scope.id) })).status, 404);
    assert.equal((await source(folderVariant)).status, 200);
    assert.equal((await call('PUT', `/team/adaptation/articles/${employeeCopy.id}/read`, { responsibilityScopeId: ids.scope, version: employeeCopy.version }, employee)).status, 404);
    const state = await adaptation(); assert.equal(state.total, 1); assert.equal(state.readCount, 0); assert.equal(state.canComplete, false);
    assert.equal((await call('PUT', '/team/adaptation/complete', { responsibilityScopeId: ids.scope }, employee)).status, 409);
  });

  await t.test('deleting the last assigned instruction permits completion; an initially empty curriculum stays blocked', async () => {
    ok(await remove(remaining));
    const empty = await adaptation(); assert.equal(empty.total, 0); assert.equal(empty.readCount, 0); assert.equal(empty.canComplete, true);
    assert.equal(ok(await call('PUT', '/team/adaptation/complete', { responsibilityScopeId: ids.scope }, employee)).completed, true);
    const emptyScope = randomUUID();
    await db.query('INSERT INTO responsibility_scopes(id,project_id,name) VALUES($1,$2,$3)', [emptyScope, ids.project, 'Пустая программа']);
    await db.query('INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id) VALUES($1,$2,$3,$4,$5)', [ids.drivers[0], ids.legal, ids.region, ids.project, emptyScope]);
    await db.query('UPDATE users SET adaptation_scope_id=$2,adaptation_completed_at=NULL WHERE id=$1', [ids.drivers[0], emptyScope]);
    assert.equal((await adaptation()).canComplete, false);
    assert.equal((await call('PUT', '/team/adaptation/complete', { responsibilityScopeId: emptyScope }, employee)).status, 409);
  });

  await t.test('manual deletion is versioned, removes only its selected ID, and cannot be replayed without current authority', async () => {
    const duplicateInput = { ...manualInput, id: randomUUID() }, duplicate = ok(await call('PUT', '/team/articles', duplicateInput));
    const edited = { ...ok(await call('PUT', '/team/articles', { ...manualInput, version: manual.version, body: 'Обновлённая ручная статья' })), responsibilityScopeId: ids.scope };
    assert.equal((await remove(manual)).status, 409);
    const input = operation(edited), result = ok(await remove(edited, input));
    assert.deepEqual(result, { deletedIds: [manual.id], deletedCount: 1 });
    assert.ok((await list()).some(article => article.id === duplicate.id));
    assert.equal((await call('PUT', '/team/articles', manualInput)).status, 404);
    await db.query('DELETE FROM access_grants WHERE user_id=$1 AND responsibility_scope_id=$2', [ids.admin, ids.scope]);
    assert.equal((await remove(edited, input)).status, 403);
    await db.query('UPDATE users SET auth_version=auth_version+1 WHERE id=$1', [ids.admin]);
    assert.equal((await remove(edited, input)).status, 401);
  });
});
