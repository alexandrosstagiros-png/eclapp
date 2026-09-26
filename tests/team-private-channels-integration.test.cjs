'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {createTestServer}=require('./local-test-server.cjs');

test('closed channels enforce current scoped membership across every message surface and immutable retries',{timeout:180000},async t=>{
  const f=await createTestServer({staffTeamActors:true});t.after(()=>f.close());
  const {ids,adminPool:db}=f,scope=ids.scope;
  const alice=await f.devLogin(ids.drivers[0]),bob=await f.devLogin(ids.drivers[1]),outsider=await f.devLogin(ids.dispatcher),admin=await f.devLogin(ids.admin);
  const call=(method,path,body,session=alice)=>f.request(method,path,body,session.accessToken);
  const scoped=path=>`${path}?responsibilityScopeId=${scope}`;
  const ok=r=>{assert.ok([200,201].includes(r.status),`${r.status}: ${JSON.stringify(r.body)}`);return r.body;};
  const members=[ids.drivers[0],ids.drivers[1]].sort();
  const original={id:randomUUID(),responsibilityScopeId:scope,kind:'channel',visibility:'private',title:'Синтетический закрытый канал',memberIds:members};
  let channel=ok(await call('POST','/team/conversations',original,admin));
  const file={id:randomUUID(),filename:'Закрытый.txt',mimeType:'text/plain',contentBase64:Buffer.from('PRIVATE_FILE_SYNTHETIC').toString('base64')};
  const payload=(text,patch={})=>({id:randomUUID(),responsibilityScopeId:scope,conversationId:channel.id,text,...patch});
  const firstBody=payload('@all Задача: закрытый синтетический текст',{mentions:{userIds:[],all:true},attachments:[file]});
  const first=ok(await call('POST','/team/messages',firstBody));
  const branch=ok(await call('POST','/team/messages',payload('Ответ',{parentId:first.id}),bob));
  const getConversation=(session=alice)=>call('GET',scoped(`/team/conversations/${channel.id}`),undefined,session);
  const accessBody=(patch={})=>({responsibilityScopeId:scope,operationId:randomUUID(),version:channel.version,visibility:channel.visibility,memberIds:channel.memberIds,...patch});
  const access=(body,session=admin)=>call('PUT',`/team/conversations/${channel.id}/access`,body,session);
  const list=async(session)=>ok(await call('GET',scoped('/team/conversations'),undefined,session)).conversations;
  const inbox=async(session)=>ok(await call('GET',scoped('/team/mentions'),undefined,session));
  const download=async(session)=>{const r=await fetch(`${f.origin}/api/v1${scoped(`/team/attachments/${file.id}`)}`,{headers:{Authorization:`Bearer ${session.accessToken}`}});return{status:r.status,text:await r.text()};};
  async function deniedSurfaces(session){
    assert.equal((await list(session)).some(c=>c.id===channel.id),false);
    for(const route of [scoped(`/team/conversations/${channel.id}`),scoped(`/team/conversations/${channel.id}/changes`),scoped(`/team/messages/${first.id}`),scoped(`/team/messages/${branch.id}`)])assert.equal((await call('GET',route,undefined,session)).status,404,route);
    assert.equal((await download(session)).status,404);
    assert.equal((await inbox(session)).mentions.some(m=>m.conversationId===channel.id),false);
    assert.equal((await call('POST','/team/messages',payload('Посторонний'),session)).status,404);
    assert.equal((await call('PUT',`/team/messages/${first.id}/reactions`,{responsibilityScopeId:scope,emoji:'👍',present:true},session)).status,404);
    assert.equal((await call('PUT',`/team/mentions/${first.id}/read`,{responsibilityScopeId:scope,version:first.version},session)).status,404);
    assert.equal((await call('PUT',`/team/messages/${first.id}`,{responsibilityScopeId:scope,operationId:randomUUID(),version:1,text:'Чужая правка'},session)).status,404);
  }

  await t.test('private messages, branches, files, mentions and all-targets are invisible outside selected participants',async()=>{
    assert.equal(channel.visibility,'private');assert.equal(channel.version,1);assert.equal(channel.createdBy,ids.admin);assert.equal(channel.canManageAccess,true);
    assert.equal(ok(await getConversation(bob)).conversation.canManageAccess,false);
    assert.deepEqual(ok(await getConversation(bob)).messages.map(m=>m.id),[first.id,branch.id]);
    assert.equal((await download(bob)).text,'PRIVATE_FILE_SYNTHETIC');assert.ok((await inbox(bob)).mentions.some(m=>m.messageId===first.id));
    assert.deepEqual((await db.query('SELECT user_id FROM team_message_mentions WHERE message_id=$1 ORDER BY user_id',[first.id])).rows.map(r=>r.user_id),[ids.drivers[1]]);
    await deniedSurfaces(outsider);
    assert.equal((await call('POST','/team/messages',payload(`@[Посторонний](user:${ids.dispatcher})`,{mentions:{userIds:[ids.dispatcher],all:false}}))).status,400);
    assert.equal((await access(accessBody(),bob)).status,403);
    assert.equal((await call('POST','/team/conversations',{...original,id:randomUUID(),memberIds:[ids.drivers[1]]})).status,403);
    assert.equal((await access(accessBody({memberIds:[ids.drivers[1]]}),alice)).status,403);
  });

  await t.test('admin oversight is read-only without membership, audited and not inherited during impersonation',async()=>{
    const detail=ok(await getConversation(admin));assert.equal(detail.conversation.canPost,false);assert.equal(detail.conversation.canManageAccess,true);
    ok(await call('GET',scoped(`/team/messages/${branch.id}`),undefined,admin));ok(await call('GET',scoped(`/team/conversations/${channel.id}/changes`),undefined,admin));
    assert.equal((await download(admin)).status,200);assert.ok((await list(admin)).some(c=>c.id===channel.id));
    assert.equal((await call('POST','/team/messages',payload('Администратор без участия'),admin)).status,403);
    const events=(await db.query("SELECT payload FROM audit_events WHERE payload->>'actorId'=$1 AND payload->>'action' IN ('team.channel.admin_read','team.attachment.admin_download')",[ids.admin])).rows;
    assert.ok(events.length>=5);
    const impersonated=ok(await call('POST','/auth/impersonate',{userId:ids.dispatcher},admin));
    await deniedSurfaces({accessToken:impersonated.accessToken});
  });

  await t.test('member removal is immediate and old creation/access/send retries cannot restore revoked membership',async()=>{
    const remove=accessBody({memberIds:[ids.drivers[0]]});channel=ok(await access(remove));assert.equal(channel.version,2);
    await deniedSurfaces(bob);assert.equal((await call('POST','/team/messages',{...firstBody,id:branch.id},bob)).status,404);
    assert.deepEqual(ok(await access(remove)),channel);
    assert.deepEqual(ok(await call('POST','/team/conversations',original,admin)),channel,'creation retry returns current access state');
    assert.equal((await access({...remove,memberIds:members})).status,409);
    assert.equal((await access(accessBody({version:1,memberIds:members}))).status,409);
    assert.equal((await call('POST','/team/conversations',{...original,title:'Заменить'},admin)).status,409);
    const add=accessBody({memberIds:members});channel=ok(await access(add,admin));assert.equal(channel.version,3);
    assert.equal(ok(await getConversation(bob)).messages.length,2);
    channel=ok(await access(accessBody({memberIds:[ids.drivers[0]]})));
    assert.deepEqual(ok(await access(add,admin)),ok(await getConversation(admin)).conversation,'old access retry returns latest state, never restores removed members');
    await deniedSurfaces(bob);
    const events=await db.query("SELECT count(*)::int AS count FROM audit_events WHERE payload->>'entityId'=$1 AND payload->>'action'='team.conversation.access_changed'",[channel.id]);assert.equal(events.rows[0].count,3);
    await assert.rejects(db.query('UPDATE team_conversation_originals SET payload=payload WHERE conversation_id=$1',[channel.id]));
  });

  await t.test('opening and closing channels changes all live ACLs atomically; concurrent access writes conflict',async()=>{
    channel=ok(await access(accessBody({visibility:'public',memberIds:[]})));
    assert.equal(ok(await getConversation(outsider)).conversation.canPost,true);assert.equal((await download(outsider)).status,200);
    const attempt=accessBody({visibility:'private',memberIds:members});
    const concurrent=await Promise.all([access(attempt),access({...attempt,operationId:randomUUID()})]);assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409]);channel=ok(concurrent.find(r=>r.status===200));
    await deniedSurfaces(outsider);
    await f.restartApi();assert.deepEqual(ok(await getConversation(admin)).conversation,channel);assert.deepEqual(ok(await call('POST','/team/conversations',original,admin)),channel);
  });

  await t.test('direct membership remains fixed and current scope grants and session authority always apply',async()=>{
    const dm=ok(await call('POST','/team/conversations',{id:randomUUID(),responsibilityScopeId:scope,kind:'direct',title:'',memberIds:members}));
    assert.equal(dm.visibility,'private');assert.equal(dm.canManageAccess,false);
    assert.equal((await call('PUT',`/team/conversations/${dm.id}/access`,{...accessBody(),version:dm.version},admin)).status,403);
    await assert.rejects(db.query('DELETE FROM team_members WHERE conversation_id=$1 AND user_id=$2',[dm.id,ids.drivers[1]]));
    assert.equal((await call('GET',scoped(`/team/conversations/${dm.id}`),undefined,outsider)).status,404);
    await db.query('DELETE FROM access_grants WHERE user_id=$1 AND responsibility_scope_id=$2',[ids.drivers[1],scope]);
    assert.equal((await getConversation(bob)).status,403);assert.equal((await download(bob)).status,404);
    assert.equal((await access(accessBody({memberIds:members}))).status,403,'cannot enroll a user without a live scope grant');
    await db.query('UPDATE users SET auth_version=auth_version+1 WHERE id=$1',[ids.drivers[0]]);
    assert.equal((await access(accessBody(),alice)).status,401);
  });

  await t.test('administrators can close channels and remove offboarded participants without retaining their creator',async()=>{
    channel=ok(await access(accessBody({visibility:'public',memberIds:[]}),admin));
    await db.query('DELETE FROM access_grants WHERE user_id=$1 AND responsibility_scope_id=$2',[ids.drivers[0],scope]);
    await db.query('UPDATE users SET active=false WHERE id=$1',[ids.drivers[0]]);
    assert.equal((await access(accessBody({visibility:'private',memberIds:[ids.drivers[0],ids.admin]}),admin)).status,403);
    channel=ok(await access(accessBody({visibility:'private',memberIds:[ids.admin]}),admin));
    assert.equal(channel.visibility,'private');assert.equal(channel.canPost,true);
    channel=ok(await access(accessBody({memberIds:[ids.specialist]}),admin));
    assert.deepEqual(channel.memberIds,[ids.specialist]);assert.equal(channel.canPost,false);
    assert.equal((await getConversation()).status,401);assert.equal((await getConversation(outsider)).status,404);
    const wrongScope=randomUUID();
    await db.query("INSERT INTO responsibility_scopes(id,project_id,name) VALUES($1,$2,'Isolated private scope')",[wrongScope,ids.project]);
    await db.query('INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id) VALUES($1,$2,$3,$4,$5)',[ids.admin,ids.legal,ids.region,ids.project,wrongScope]);
    assert.equal((await access(accessBody({responsibilityScopeId:wrongScope}),admin)).status,404);
  });
});
