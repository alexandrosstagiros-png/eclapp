'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createTestServer } = require('./local-test-server.cjs');
const { articleStructure, createArticlePosition } = require('./team-article-fixtures.cjs');

test('knowledge permissions, staff visibility and assigned adaptation enforce current scoped access', { timeout: 180000 }, async t => {
  const f = await createTestServer(); t.after(() => f.close());
  const { ids, adminPool: db } = f;
  const admin = await f.devLogin(ids.admin), employee = await f.devLogin(ids.dispatcher), driver = await f.devLogin(ids.drivers[0]);
  const articlePosition = await createArticlePosition(f, admin);
  const alternate = randomUUID(), emptyScope = randomUUID();
  for (const scope of [alternate,emptyScope]) {
    await db.query("INSERT INTO responsibility_scopes(id,project_id,name) VALUES($1,$2,'Synthetic knowledge scope')",[scope,ids.project]);
    for (const user of [ids.admin,ids.dispatcher]) await db.query('INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id) VALUES($1,$2,$3,$4,$5)',[user,ids.legal,ids.region,ids.project,scope]);
  }
  const call = (method, route, body, session = admin) => f.request(method,route,body,session?.accessToken);
  const ok = result => { assert.ok([200,201].includes(result.status), `${result.status}: ${JSON.stringify(result.body)}`); return result.body; };
  const list = async (session = employee, scope = ids.scope) => ok(await call('GET',`/team/articles?responsibilityScopeId=${scope}`,undefined,session));
  const rights = (userId, canCreate, canEdit, scope = ids.scope, session = admin) => call('PUT','/team/knowledge-permissions',{responsibilityScopeId:scope,userId,canCreate,canEdit},session);
  const manual = (patch = {}) => ({id:randomUUID(),responsibilityScopeId:ids.scope,title:'Ручная статья',body:'Синтетический текст',version:0,...articleStructure(articlePosition),...patch});
  const save = (body, session = employee) => call('PUT','/team/articles',body,session);
  const importBody = (folderPath, filename, visibility = 'staff') => ({responsibilityScopeIds:[ids.scope,alternate],visibility,folderPath,sourcePath:`${folderPath}/${filename}`,title:filename,body:'Синтетическая инструкция для адаптации.',sourceArchive:'Synthetic.zip',file:{filename,mimeType:'application/octet-stream',contentBase64:Buffer.from(`Original ${filename}`).toString('base64')}});
  const generalInput = importBody('Общая информация','Введение.docx');
  const imported = [];
  for (const body of [generalInput,importBody('Папка сотрудника компании/Первый день','Начало.docx'),importBody('Общая информация дополнительно','Лишнее.docx'),importBody('Другой раздел','Работа.docx'),importBody('Общая информация','Секрет.docx','admin'),importBody('Публичная папка','Для всех.docx','scope')]) imported.push(...ok(await call('POST','/team/articles/import',body)).articles);
  const general = imported.find(a => a.responsibilityScopeId === ids.scope && a.title === 'Введение.docx');
  const employeeFolder = imported.find(a => a.responsibilityScopeId === ids.scope && a.title === 'Начало.docx');
  const hidden = imported.find(a => a.responsibilityScopeId === ids.scope && a.title === 'Секрет.docx');
  const unrelated = imported.find(a => a.responsibilityScopeId === ids.scope && a.title === 'Лишнее.docx');
  const scopedArticle = imported.find(a => a.responsibilityScopeId === ids.scope && a.title === 'Для всех.docx');
  const source = async (id, session = employee, scope = ids.scope) => {
    const response = await fetch(`${f.origin}/api/v1/team/articles/${id}/source?responsibilityScopeId=${scope}`,{headers:{Authorization:`Bearer ${session.accessToken}`},signal:AbortSignal.timeout(10000)});
    return {status:response.status,bytes:Buffer.from(await response.arrayBuffer())};
  };
  const state = async (session = employee) => ok(await call('GET','/team/adaptation',undefined,session));
  const read = (id, scope = ids.scope, session = employee, patch = {}) => call('PUT',`/team/adaptation/articles/${id}/read`,{responsibilityScopeId:scope,version:imported.find(article=>article.id===id)?.version || 1,...patch},session);
  const complete = (scope = ids.scope, session = employee) => call('PUT','/team/adaptation/complete',{responsibilityScopeId:scope},session);

  await t.test('staff documents exclude drivers and impersonation cannot restore administrator access', async () => {
    assert.deepEqual((await list()).permissions,{canCreate:false,canEdit:false,canManage:false});
    assert.deepEqual((await list(admin)).permissions,{canCreate:true,canEdit:true,canManage:true});
    assert.equal((await list()).articles.some(a=>a.id===general.id),true);
    assert.equal((await list()).articles.some(a=>a.id===hidden.id),false);
    assert.equal((await call('GET',`/team/articles?responsibilityScopeId=${ids.scope}`,undefined,driver)).status,403);
    assert.equal((await source(general.id,driver)).status,403);
    assert.equal((await source(general.id)).status,200);
    assert.equal((await source(scopedArticle.id,driver)).status,403);
    assert.equal((await rights(ids.drivers[0],true,true)).status,404);
    assert.equal((await save({id:general.id,responsibilityScopeId:ids.scope,title:general.title,body:'Подмена',version:general.version},driver)).status,403);
    const child = ok(await call('POST','/auth/impersonate',{userId:ids.drivers[0]}));
    assert.equal((await call('GET',`/team/articles?responsibilityScopeId=${ids.scope}`,undefined,child)).status,403);
    assert.equal((await source(general.id,child)).status,403);
    assert.equal((await call('GET',`/team/knowledge-permissions?responsibilityScopeId=${ids.scope}`,undefined,child)).status,403);
    assert.equal((await rights(ids.dispatcher,true,true,ids.scope,child)).status,403);
    assert.equal((await save(manual(),driver)).status,403);
  });

  await t.test('creation and editing are independent, scoped rights and revocation is immediate', async () => {
    assert.equal((await save(manual())).status,403);
    assert.equal((await rights(ids.dispatcher,true,true,ids.scope,employee)).status,403);
    const matrix = ok(await call('GET',`/team/knowledge-permissions?responsibilityScopeId=${ids.scope}`));
    assert.equal(matrix.permissions.find(p=>p.userId===ids.admin).canEdit,true);
    assert.equal((await rights(ids.admin,false,false)).status,400);
    assert.equal((await rights(randomUUID(),true,true)).status,404);
    ok(await rights(ids.dispatcher,true,false));
    const creation = manual(), created = ok(await save(creation));
    assert.equal(created.canEdit,false);
    assert.deepEqual(ok(await save(creation)),created,'create-only users may safely retry their original create');
    assert.equal((await save({...creation,version:created.version,body:'Редактирование'})).status,403);
    assert.equal((await save(manual({responsibilityScopeId:alternate}))).status,403);
    ok(await rights(ids.dispatcher,false,true));
    assert.equal((await save(manual())).status,403);
    const updated = ok(await save({id:general.id,responsibilityScopeId:ids.scope,title:general.title,body:'Уточнённая сотрудником инструкция',version:general.version}));
    assert.equal(updated.canEdit,true);
    general.version=updated.version;
    assert.deepEqual(updated.sourceFile,general.sourceFile);
    assert.equal(updated.folderPath,general.folderPath);
    assert.deepEqual((await source(general.id)).bytes,Buffer.from(`Original ${generalInput.file.filename}`));
    const retry = ok(await call('POST','/team/articles/import',generalInput));
    assert.equal(retry.articles.find(a=>a.id===general.id).body,updated.body);
    assert.equal((await save({id:hidden.id,responsibilityScopeId:ids.scope,title:hidden.title,body:'Подмена',version:hidden.version})).status,404);
    ok(await rights(ids.dispatcher,false,false));
    assert.equal((await list()).articles.find(a=>a.id===general.id).canEdit,false);
    assert.equal((await save({id:general.id,responsibilityScopeId:ids.scope,title:general.title,body:'Нет прав',version:updated.version})).status,403);
    const audits=(await db.query("SELECT payload FROM audit_events WHERE payload->>'action'='team.knowledge.permissions_changed'")).rows;
    assert.ok(audits.length>=3);
    assert.equal(JSON.stringify(audits).includes(updated.body),false);
  });

  await t.test('adaptation uses only the assigned scope and exact root folders with current visibility', async () => {
    assert.equal((await state()).required,false);
    assert.equal((await call('GET','/team/adaptation',undefined,driver)).status,403);
    await db.query('UPDATE users SET adaptation_required=true,adaptation_scope_id=$2 WHERE id=$1',[ids.dispatcher,ids.scope]);
    const assigned = await state();
    assert.equal(assigned.required,true);assert.equal(assigned.completed,false);assert.equal(assigned.scopeId,ids.scope);
    assert.deepEqual(new Set(assigned.articles.map(a=>a.id)),new Set([general.id,employeeFolder.id]));
    assert.equal(assigned.total,2);assert.equal(assigned.readCount,0);
    assert.equal((await complete()).status,409);
    assert.equal((await read(unrelated.id)).status,404);
    assert.equal((await read(hidden.id)).status,404);
    assert.equal((await read(general.id,alternate)).status,404);
    assert.equal((await complete(alternate)).status,404);
    assert.equal((await read(general.id,ids.scope,employee,{userId:ids.admin})).status,400);
    assert.equal((await read(general.id,ids.scope,driver)).status,403);
    const first = ok(await read(general.id));
    assert.equal(first.readCount,1);assert.equal(first.required,true);
    assert.deepEqual(ok(await read(general.id)),first);
    assert.equal((await complete()).status,409);
    assert.equal((await db.query('SELECT count(*)::integer AS count FROM team_adaptation_reads WHERE user_id=$1',[ids.dispatcher])).rows[0].count,1);
  });

  await t.test('completion persists only after every eligible document is read and is audited once', async () => {
    const allRead = ok(await read(employeeFolder.id));
    assert.equal(allRead.readCount,allRead.total);
    const previousVersion=general.version;
    const revised=ok(await save({id:general.id,responsibilityScopeId:ids.scope,title:general.title,body:'Актуальная редакция перед завершением',version:previousVersion},admin));
    general.version=revised.version;
    const stale=await state();
    assert.equal(stale.articles.find(article=>article.id===general.id).readAt,null);
    assert.equal(stale.readCount,1);
    assert.equal((await complete()).status,409);
    assert.equal((await read(general.id,ids.scope,employee,{version:previousVersion})).status,409);
    assert.equal((await read(general.id,ids.scope,employee,{version:undefined})).status,400);
    const fresh=ok(await read(general.id));
    assert.equal(fresh.readCount,fresh.total);
    const replies=await Promise.all([complete(),complete()]);
    const first=ok(replies[0]);assert.deepEqual(ok(replies[1]),first);
    assert.equal(first.required,false);assert.equal(first.completed,true);assert.ok(first.completedAt);
    await f.restartApi();
    assert.deepEqual(await state(),first);
    assert.deepEqual(ok(await complete()),first);
    const audit=(await db.query("SELECT payload FROM audit_events WHERE payload->>'action'='team.adaptation.completed' AND payload->>'actorId'=$1",[ids.dispatcher])).rows;
    assert.equal(audit.length,1);assert.equal(audit[0].payload.metadata.articleCount,2);
    assert.equal((await db.query('SELECT adaptation_required FROM users WHERE id=$1',[ids.dispatcher])).rows[0].adaptation_required,true);
  });

  await t.test('empty curricula, external roles and lost grants cannot complete or expose documents', async () => {
    const newcomer = randomUUID(), external = randomUUID();
    for (const [id,role] of [[newcomer,'manager'],[external,'external_recruiter']]) {
      await db.query("INSERT INTO users(id,display_name,role,active,approved,adaptation_required,adaptation_scope_id) VALUES($1,'Synthetic adaptation user',$2,true,true,true,$3)",[id,role,emptyScope]);
      await db.query('INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id) VALUES($1,$2,$3,$4,$5)',[id,ids.legal,ids.region,ids.project,emptyScope]);
    }
    const emptySession = await f.devLogin(newcomer), externalSession = await f.devLogin(external);
    assert.equal((await state(emptySession)).total,0);
    assert.equal((await complete(emptyScope,emptySession)).status,409);
    assert.equal((await call('GET','/team/adaptation',undefined,externalSession)).status,403);
    await db.query('UPDATE users SET adaptation_required=true,adaptation_scope_id=$2 WHERE id=$1',[ids.drivers[0],ids.scope]);
    assert.equal((await call('GET','/team/adaptation',undefined,driver)).status,403);
    await db.query('DELETE FROM access_grants WHERE user_id=$1 AND responsibility_scope_id=$2',[ids.dispatcher,ids.scope]);
    assert.equal((await call('GET','/team/adaptation',undefined,employee)).status,403);
    assert.equal((await read(general.id)).status,403);
    assert.equal((await complete()).status,403);
    assert.equal((await source(general.id)).status,404);
    assert.equal((await rights(ids.dispatcher,true,true)).status,404);
  });
});
