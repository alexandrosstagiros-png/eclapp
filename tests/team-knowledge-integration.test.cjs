'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, createHash } = require('node:crypto');
const { createTestServer } = require('./local-test-server.cjs');
const { articleStructure, createArticlePosition } = require('./team-article-fixtures.cjs');
const hash = value => createHash('sha256').update(value).digest('hex');

test('knowledge imports preserve originals, idempotency and current scoped permissions', { timeout: 180000 }, async t => {
  const f = await createTestServer({ staffTeamActors: true }); t.after(() => f.close());
  const { ids, request, devLogin, adminPool: db } = f;
  const admin = await devLogin(ids.admin), employee = await devLogin(ids.drivers[0]);
  const alternate = randomUUID(), ungranted = randomUUID();
  for (const scope of [alternate, ungranted]) await db.query('INSERT INTO responsibility_scopes(id,project_id,name) VALUES($1,$2,$3)', [scope, ids.project, `Область ${scope}`]);
  await db.query('INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id) VALUES($1,$2,$3,$4,$5)', [ids.admin,ids.legal,ids.region,ids.project,alternate]);
  const call = (method, route, body, session=admin) => request(method,route,body,session?.accessToken);
  const ok = response => { assert.ok([200,201].includes(response.status), `HTTP ${response.status}: ${JSON.stringify(response.body)}`); return response.body; };
  const list = async (session=admin, scope=ids.scope) => ok(await call('GET',`/team/articles?responsibilityScopeId=${scope}`,undefined,session)).articles;
  const bytes = Buffer.concat([Buffer.from('SYNTHETIC_ORIGINAL_'),Buffer.from(Array.from({length:256},(_,i)=>i))]);
  const payload = { responsibilityScopeIds:[ids.scope,alternate],visibility:'scope',sourcePath:'Инструкции/Транспорт/Правила №1.docx',folderPath:'Инструкции/Транспорт',title:'Правила №1',body:'Синтетическая инструкция.\nПолный текст для поиска.',sourceArchive:'Архив.zip',file:{filename:'Правила №1.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',contentBase64:bytes.toString('base64')} };
  let article, restricted;
  async function download(id, session=employee, scope=ids.scope) {
    const r=await fetch(`${f.origin}/api/v1/team/articles/${id}/source?responsibilityScopeId=${scope}`,{headers:session?{Authorization:`Bearer ${session.accessToken}`}:{},signal:AbortSignal.timeout(10000)});
    return {status:r.status,headers:r.headers,bytes:Buffer.from(await r.arrayBuffer())};
  }
  await t.test('multi-scope import is durable, original bytes deduplicate and responses contain only metadata',async()=>{
    const result=ok(await call('POST','/team/articles/import',payload));
    assert.equal(result.createdCount,2);assert.equal(result.unchangedCount,0);
    article=(await list()).find(a=>a.title===payload.title);
    assert.equal(article.folderPath,payload.folderPath);assert.equal(article.body,payload.body);
    assert.deepEqual(article.sourceFile,{filename:payload.file.filename,mimeType:payload.file.mimeType,byteSize:bytes.length,sha256:hash(bytes)});
    assert.equal((await list(employee)).find(a=>a.id===article.id).canEdit,false);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM team_knowledge_files')).rows[0].n,1);
    let source=await download(article.id);assert.equal(source.status,200);assert.deepEqual(source.bytes,bytes);
    assert.match(source.headers.get('content-disposition'),/^attachment;/);assert.ok(source.headers.get('content-disposition').includes(encodeURIComponent(payload.file.filename)));
    assert.match(source.headers.get('content-type'),/^application\/octet-stream/);assert.equal(source.headers.get('x-content-type-options'),'nosniff');assert.match(source.headers.get('cache-control'),/no-store/);
    assert.equal(JSON.stringify(result).includes(payload.file.contentBase64),false);
    await f.restartApi();source=await download(article.id);assert.deepEqual(source.bytes,bytes);
  });
  await t.test('concurrent retries add no duplicate articles and preserve subsequent editorial changes',async()=>{
    const retries=await Promise.all([call('POST','/team/articles/import',payload),call('POST','/team/articles/import',{...payload,sourceArchive:'Повторный экспорт.zip'})]);
    for(const r of retries){assert.equal(ok(r).createdCount,0);assert.equal(r.body.unchangedCount,2);}
    const saved=ok(await call('PUT','/team/articles',{id:article.id,responsibilityScopeId:ids.scope,title:article.title,body:'Редакторское уточнение',version:article.version}));
    assert.equal(saved.sourceFile.sha256,hash(bytes));assert.equal(saved.folderPath,payload.folderPath);
    ok(await call('POST','/team/articles/import',payload));assert.equal((await list()).find(a=>a.id===article.id).body,'Редакторское уточнение');
    assert.equal((await call('POST','/team/articles/import',{...payload,body:'Иной импорт'})).status,409);
    assert.equal((await call('POST','/team/articles/import',{...payload,file:{...payload.file,contentBase64:Buffer.from('changed').toString('base64')}})).status,409);
  });
  await t.test('admin-only entries are hidden, including guessed source and edit routes',async()=>{
    const p={...payload,responsibilityScopeIds:[ids.scope],visibility:'admin',sourcePath:'Инструкции/Транспорт/Закрыто.docx',title:'Закрытая инструкция',file:{...payload.file,filename:'Закрыто.docx'}};
    ok(await call('POST','/team/articles/import',p));restricted=(await list()).find(a=>a.title===p.title);
    assert.ok(restricted);assert.equal((await list(employee)).some(a=>a.id===restricted.id),false);
    assert.equal((await download(restricted.id)).status,404);assert.equal((await download(restricted.id,admin)).status,200);
    const denied=await call('PUT','/team/articles',{id:restricted.id,responsibilityScopeId:ids.scope,title:'Подмена',body:'Подмена',version:restricted.version},employee);assert.ok([403,404].includes(denied.status));
    assert.equal((await call('POST','/team/articles/import',p,employee)).status,403);
  });
  await t.test('scope validation is atomic and rejects forged paths or metadata without extra files',async()=>{
    const before=(await db.query('SELECT count(*)::int AS n FROM team_articles')).rows[0].n;
    const patch={...payload,sourcePath:'Инструкции/Транспорт/Другой.docx',title:'Другой',responsibilityScopeIds:[ids.scope,ungranted],file:{...payload.file,filename:'Другой.docx',contentBase64:Buffer.from('rollback new').toString('base64')}};
    assert.ok([403,404].includes((await call('POST','/team/articles/import',patch)).status));
    for(const bad of [{sourcePath:'../Другой.docx'},{folderPath:'Иная папка'},{file:{...payload.file,sha256:'a'.repeat(64)}},{file:{...payload.file,contentBase64:'Zh=='}},{visibility:'public'},{responsibilityScopeIds:[ids.scope,ids.scope]}]) assert.equal((await call('POST','/team/articles/import',{...payload,...bad})).status,400);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM team_articles')).rows[0].n,before);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM team_knowledge_files')).rows[0].n,1);
    assert.equal((await download(article.id,admin,alternate)).status,404);
    assert.ok([401,403].includes((await download(article.id,null)).status));
  });
  await t.test('manual articles remain editable with delegated rights and source metadata cannot be overwritten through article saves',async()=>{
    const articlePosition=await createArticlePosition(f,admin);
    ok(await call('PUT','/team/knowledge-permissions',{responsibilityScopeId:ids.scope,userId:ids.drivers[0],canCreate:true,canEdit:true}));
    const input={id:randomUUID(),responsibilityScopeId:ids.scope,title:'Ручная статья',body:'Прежний сценарий',version:0,...articleStructure(articlePosition)};
    const saved=ok(await call('PUT','/team/articles',input,employee));assert.equal(saved.canEdit,true);assert.equal(saved.sourceFile,null);
    ok(await call('PUT','/team/articles',{...input,version:saved.version,body:'Изменение'},employee));
    assert.equal((await call('PUT','/team/articles',{...input,version:saved.version,folderPath:'Подмена'},employee)).status,400);
    const logs=(await db.query('SELECT payload FROM audit_events')).rows;
    assert.equal(JSON.stringify(logs).includes(payload.file.contentBase64),false);assert.equal(JSON.stringify(logs).includes(payload.body),false);
  });
  await t.test('revoked grants and external identities cannot read originals',async()=>{
    const externalId=randomUUID();await db.query("INSERT INTO users(id,display_name,role,active,approved) VALUES($1,'Внешний тест','external_recruiter',true,true)",[externalId]);
    await db.query('INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id) VALUES($1,$2,$3,$4,$5)',[externalId,ids.legal,ids.region,ids.project,ids.scope]);
    assert.ok([403,404].includes((await download(article.id,await devLogin(externalId))).status));
    await db.query('DELETE FROM access_grants WHERE user_id=$1',[ids.drivers[0]]);assert.ok([403,404].includes((await download(article.id)).status));
  });
});
