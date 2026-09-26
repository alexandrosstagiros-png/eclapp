'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createTestServer } = require('./local-test-server.cjs');

test('message controls retain authorship, scoped access and idempotency through deletion and moderation', {timeout:180000}, async t=>{
  const f=await createTestServer({staffTeamActors:true});t.after(()=>f.close());
  const {ids,adminPool:db}=f;
  const admin=await f.devLogin(ids.admin),alice=await f.devLogin(ids.drivers[0]),bob=await f.devLogin(ids.drivers[1]),outsider=await f.devLogin(ids.dispatcher);
  const call=(method,path,body,session=alice)=>f.request(method,path,body,session?.accessToken);
  const ok=r=>{assert.ok([200,201].includes(r.status),`${r.status}: ${JSON.stringify(r.body)}`);return r.body;};
  const scoped=path=>`${path}?responsibilityScopeId=${ids.scope}`;
  const create=async(kind='channel',memberIds=[])=>ok(await call('POST','/team/conversations',{id:randomUUID(),responsibilityScopeId:ids.scope,kind,title:'Контроль сообщений',memberIds}));
  const channel=await create(),dm=await create('direct',[ids.drivers[0],ids.drivers[1]]),slow=await create(),free=await create();
  const input=(conversationId,text='Задача: синтетическое сообщение',patch={})=>({id:randomUUID(),responsibilityScopeId:ids.scope,conversationId,text,...patch});
  const send=(body,session=alice)=>call('POST','/team/messages',body,session);
  const source=async(id,session=alice)=>ok(await call('GET',scoped(`/team/messages/${id}`),undefined,session));
  const editBody=(message,text,patch={})=>({responsibilityScopeId:ids.scope,operationId:randomUUID(),version:message.version,text,mentions:{userIds:[],all:false},...patch});
  const edit=(id,body,session=alice)=>call('PUT',`/team/messages/${id}`,body,session);
  const remove=(id,body,session=alice)=>call('PUT',`/team/messages/${id}/deletion`,body,session);
  const react=(id,emoji,present,session=alice)=>call('PUT',`/team/messages/${id}/reactions`,{responsibilityScopeId:ids.scope,emoji,present},session);
  const moderation=(id,body,session=admin)=>call('PUT',`/team/conversations/${id}/moderation`,body,session);
  const secret=`DELETE_SECRET_${randomUUID()}`;
  const file={id:randomUUID(),filename:'Синтетический.txt',mimeType:'text/plain',contentBase64:Buffer.from(secret).toString('base64')};
  const original=input(channel.id,`${secret} @[Сотрудник](user:${ids.drivers[1]})`,{attachments:[file],mentions:{userIds:[ids.drivers[1]],all:false}});
  let root=ok(await send(original)),branch,firstEdit;
  async function download(session=alice){const r=await fetch(`${f.origin}/api/v1/team/attachments/${file.id}?responsibilityScopeId=${ids.scope}`,{headers:{Authorization:`Bearer ${session.accessToken}`},signal:AbortSignal.timeout(10000)});return{status:r.status,bytes:Buffer.from(await r.arrayBuffer())};}

  await t.test('ownership, expected versions and immutable send snapshots survive edits and retries',async()=>{
    assert.equal(root.version,1);assert.equal(root.editedAt,null);assert.equal(root.deletedAt,null);assert.equal(root.canEdit,true);assert.deepEqual(root.reactions,[]);
    assert.equal((await source(root.id,bob)).message.canEdit,false);
    assert.equal((await edit(root.id,editBody(root,'Чужая правка'),bob)).status,403);
    firstEdit=editBody(root,'Исправленный текст');
    const edited=ok(await edit(root.id,firstEdit));
    assert.equal(edited.version,2);assert.equal(edited.authorId,root.authorId);assert.equal(edited.editedBy,root.authorId);assert.ok(edited.editedAt);
    assert.deepEqual(edited.attachments,root.attachments);
    assert.deepEqual(ok(await edit(root.id,firstEdit)),edited);
    assert.equal((await edit(root.id,{...firstEdit,text:'Подмена ключа операции'})).status,409);
    assert.equal((await edit(root.id,editBody(root,'Устаревшая версия'))).status,409);
    assert.equal((await send({...original,text:'Подмена оригинальной отправки',mentions:{userIds:[],all:false}})).status,409);
    assert.deepEqual(ok(await send(original)),edited,'original send retry returns the current edited message without restoring old text');
    assert.equal(ok(await call('GET',scoped('/team/mentions'),undefined,bob)).mentions.some(row=>row.messageId===root.id),false,'old revision mention is hidden after edit');
    const next=editBody(edited,'Большой текст '+ 'Я'.repeat(11000));
    root=ok(await edit(root.id,next));assert.equal(root.version,3);
    assert.deepEqual(ok(await edit(root.id,firstEdit)),root,'old mutation replay never restores an older revision');
    const concurrent=await Promise.all([edit(root.id,editBody(root,'Параллельно А')),edit(root.id,editBody(root,'Параллельно Б'))]);
    assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409]);root=ok(concurrent.find(r=>r.status===200));
  });

  await t.test('reactions are explicit per-user state, idempotent and visible in aggregates and change polling',async()=>{
    const before=(await source(root.id)).message.changeCursor;
    const first=ok(await react(root.id,'👍',true));assert.deepEqual(first.reactions,[{emoji:'👍',count:1,mine:true}]);
    assert.deepEqual(ok(await react(root.id,'👍',true)),first);
    const both=ok(await react(root.id,'👍',true,bob));assert.deepEqual(both.reactions,[{emoji:'👍',count:2,mine:true}]);assert.equal(both.version,root.version);
    const outsiderView=(await source(root.id,outsider)).message;assert.deepEqual(outsiderView.reactions,[{emoji:'👍',count:2,mine:false}]);
    const changed=ok(await call('GET',`${scoped(`/team/conversations/${channel.id}/changes`)}&afterChange=${before}`));
    assert.equal(changed.messages.find(m=>m.id===root.id).reactions[0].count,2);assert.ok(BigInt(changed.changeCursor)>BigInt(before));
    const removed=ok(await react(root.id,'👍',false));assert.deepEqual(removed.reactions,[{emoji:'👍',count:1,mine:false}]);
    assert.deepEqual(ok(await react(root.id,'👍',false)),removed);
    assert.equal((await react(root.id,'🚫',true)).status,400);
    assert.equal((await call('PUT',`/team/messages/${root.id}/reactions`,{responsibilityScopeId:ids.scope,emoji:'👍',present:true,userId:ids.drivers[1]})).status,400);
  });

  await t.test('edited mentions create one current delivery and obsolete revision reads disappear',async()=>{
    const payload=editBody(root,`Новая задача @[Сотрудник](user:${ids.drivers[1]})`,{mentions:{userIds:[ids.drivers[1]],all:false}});
    root=ok(await edit(root.id,payload));
    const inbox=ok(await call('GET',scoped('/team/mentions'),undefined,bob));
    assert.equal(inbox.mentions.filter(item=>item.messageId===root.id).length,1);
    assert.equal(inbox.mentions.find(item=>item.messageId===root.id).text,root.text);
    const read=ok(await call('PUT',`/team/mentions/${root.id}/read`,{responsibilityScopeId:ids.scope,version:root.version},bob));assert.ok(read.readAt);
    const retried=ok(await edit(root.id,payload));
    assert.deepEqual(retried,{...root,delivery:{status:'read',readCount:1,recipientCount:null}},'an edit retry preserves content while refreshing independently recorded receipts');
    const deliveries=(await db.query('SELECT message_version FROM team_message_mentions WHERE message_id=$1 AND user_id=$2 ORDER BY message_version',[root.id,ids.drivers[1]])).rows;
    assert.deepEqual(deliveries.map(row=>row.message_version),[1,root.version]);
    root=ok(await edit(root.id,editBody(root,'')));
    assert.equal(root.text,'');assert.equal(root.attachments.length,1,'file-only edits retain original attachment metadata');
    assert.equal(ok(await call('GET',scoped('/team/mentions'),undefined,bob)).mentions.some(item=>item.messageId===root.id),false);
    assert.equal((await call('PUT',`/team/mentions/${root.id}/read`,{responsibilityScopeId:ids.scope,version:root.version},bob)).status,404);
  });

  await t.test('change cursors include edited historical parents outside the latest page',async()=>{
    branch=ok(await send(input(channel.id,'Ответ в ветке',{parentId:root.id})));
    await db.query("UPDATE team_messages SET created_at='2001-01-01T00:00:00Z' WHERE id=$1",[root.id]);
    const history=Array.from({length:105},()=>randomUUID());
    await db.query(`INSERT INTO team_messages(id,legal_entity_id,region_id,project_id,responsibility_scope_id,conversation_id,text,author_id,author_name)
      SELECT id,$1,$2,$3,$4,$5,'Тест истории',$6,'Сотрудник' FROM unnest($7::uuid[]) AS selected(id)`,[ids.legal,ids.region,ids.project,ids.scope,channel.id,ids.drivers[0],history]);
    const detail=ok(await call('GET',scoped(`/team/conversations/${channel.id}`)));
    assert.equal(detail.messages.some(m=>m.id===root.id),false);
    root=ok(await edit(root.id,editBody(root,'Обновлённый родитель')));
    const changes=ok(await call('GET',`${scoped(`/team/conversations/${channel.id}/changes`)}&afterChange=${detail.changeCursor}`));
    assert.equal(changes.messages.find(m=>m.id===root.id).text,'Обновлённый родитель');
    assert.deepEqual((await source(branch.id)).ancestors[0].reactions,[{emoji:'👍',count:1,mine:false}]);
    const all=ok(await call('GET',`${scoped(`/team/conversations/${channel.id}/changes`)}&afterChange=0`));assert.equal(all.hasMore,true);assert.equal(all.messages.length,100);
    const rest=ok(await call('GET',`${scoped(`/team/conversations/${channel.id}/changes`)}&afterChange=${all.changeCursor}`));
    assert.equal(rest.hasMore,false);assert.equal(new Set([...all.messages,...rest.messages].map(m=>m.id)).size,all.messages.length+rest.messages.length);
  });

  await t.test('soft deletion preserves branches and hides text, files, reactions, mentions and future summary sources',async()=>{
    await db.query('UPDATE team_messages SET created_at=clock_timestamp() WHERE id=$1',[root.id]);
    const request={responsibilityScopeId:ids.scope,operationId:randomUUID(),version:root.version};
    const tombstone=ok(await remove(root.id,request));
    assert.ok(tombstone.deletedAt);assert.equal(tombstone.deletedBy,root.authorId);assert.equal(tombstone.text,'');assert.deepEqual(tombstone.attachments,[]);assert.deepEqual(tombstone.reactions,[]);assert.deepEqual(tombstone.mentions,{userIds:[],all:false});assert.equal(tombstone.canEdit,false);assert.equal(tombstone.canDelete,false);
    assert.deepEqual(ok(await remove(root.id,request)),tombstone);
    assert.deepEqual(ok(await send(original)),tombstone,'original send retry never revives a tombstone');
    assert.deepEqual(ok(await edit(root.id,firstEdit)),tombstone,'old edit operation returns current tombstone');
    assert.equal((await edit(root.id,editBody(tombstone,'Возродить'))).status,409);
    assert.equal((await react(root.id,'👍',true)).status,404);
    assert.equal((await download()).status,404);assert.equal((await download(admin)).status,404);
    const sourceBranch=await source(branch.id);assert.equal(sourceBranch.message.text,'Ответ в ветке');assert.equal(sourceBranch.ancestors[0].deletedAt,tombstone.deletedAt);assert.equal(sourceBranch.ancestors[0].text,'');
    const report=ok(await call('POST','/team/summaries',{responsibilityScopeId:ids.scope},admin));assert.equal(report.sourceMessageIds.includes(root.id),false);assert.equal(JSON.stringify(report).includes(secret),false);
    const audit=(await db.query('SELECT payload FROM audit_events')).rows;assert.equal(JSON.stringify(audit).includes(secret),false);
    assert.equal((await db.query('SELECT 1 FROM team_message_originals WHERE message_id=$1',[root.id])).rowCount,1);
    await assert.rejects(db.query("UPDATE team_message_originals SET payload='{}'::jsonb WHERE message_id=$1",[root.id]),/append-only/);
    await assert.rejects(db.query('DELETE FROM team_control_operations WHERE id=$1',[request.operationId]),/append-only/);
    await assert.rejects(db.query("UPDATE team_messages SET deleted_at=NULL,deleted_by=NULL,text='Restore' WHERE id=$1",[root.id]),error=>error.code==='23514');
    await f.restartApi();assert.deepEqual((await source(root.id)).message,tombstone);
  });

  await t.test('administrators can moderate accessible private messages with explicit attribution and audit',async()=>{
    const message=ok(await send(input(dm.id,'Личное сообщение')));
    assert.equal((await edit(message.id,editBody(message,'Чужой доступ'),outsider)).status,404);
    assert.equal((await react(message.id,'👍',true,outsider)).status,404);
    const edited=ok(await edit(message.id,editBody(message,'Исправлено администратором'),admin));assert.equal(edited.authorId,message.authorId);assert.equal(edited.editedBy,ids.admin);assert.equal(edited.canEdit,true);
    const impersonated=ok(await call('POST','/auth/impersonate',{userId:ids.dispatcher},admin));
    assert.equal((await edit(message.id,editBody(edited,'Обход'),impersonated)).status,404);
    const removed=ok(await remove(message.id,{responsibilityScopeId:ids.scope,operationId:randomUUID(),version:edited.version},admin));assert.equal(removed.deletedBy,ids.admin);
    const events=(await db.query("SELECT payload FROM audit_events WHERE payload->>'entityId'=$1 AND payload->>'action' IN ('team.message.edited','team.message.deleted')",[message.id])).rows;
    assert.equal(events.length,2);assert.ok(events.every(e=>e.payload.actorId===ids.admin&&e.payload.metadata.administratorChangedAnotherAuthor===true));
  });

  await t.test('five-minute slow mode lasts one hour, serializes sends, exempts admins and can be disabled idempotently',async()=>{
    const toggle={responsibilityScopeId:ids.scope,operationId:randomUUID(),enabled:true};
    assert.equal((await moderation(slow.id,toggle,bob)).status,403);
    const before=Date.now(),enabled=ok(await moderation(slow.id,toggle));assert.equal(enabled.active,true);assert.equal(enabled.intervalSeconds,300);assert.ok(Date.parse(enabled.enabledUntil)>=before+3599000&&Date.parse(enabled.enabledUntil)<=Date.now()+3601000);
    assert.deepEqual(ok(await moderation(slow.id,toggle)),enabled);
    const attempts=[input(slow.id,'Первое'),input(slow.id,'Второе')];
    const results=await Promise.all(attempts.map(body=>send(body)));assert.deepEqual(results.map(r=>r.status).sort(),[201,429]);
    const success=results.findIndex(r=>r.status===201);assert.deepEqual(ok(await send(attempts[success])),results[success].body);
    assert.match(results.find(r=>r.status===429).body.message,/Следующее сообщение можно отправить через \d+ сек\./);
    await db.query("UPDATE team_messages SET created_at=clock_timestamp()-interval '120 seconds' WHERE conversation_id=$1 AND author_id=$2",[slow.id,ids.drivers[0]]);
    const twoMinutes=await send(input(slow.id,'Через две минуты'));assert.equal(twoMinutes.status,429);assert.match(twoMinutes.body.message,/через 1[78]\d сек/);
    await db.query("UPDATE team_messages SET created_at=clock_timestamp()-interval '301 seconds' WHERE conversation_id=$1 AND author_id=$2",[slow.id,ids.drivers[0]]);
    ok(await send(input(slow.id,'Через пять минут разрешено')));
    ok(await send(input(slow.id,'Боб отдельно'),bob));ok(await send(input(slow.id,'Администратор один'),admin));ok(await send(input(slow.id,'Администратор два'),admin));
    ok(await send(input(free.id,'Другой чат один')));ok(await send(input(free.id,'Другой чат два')));
    const cancel={responsibilityScopeId:ids.scope,operationId:randomUUID(),enabled:false};const disabled=ok(await moderation(slow.id,cancel));assert.equal(disabled.active,false);assert.equal(disabled.enabledUntil,null);assert.deepEqual(ok(await moderation(slow.id,cancel)),disabled);
    assert.equal(ok(await moderation(slow.id,toggle)).active,false,'replaying old enable operation cannot reactivate a canceled mode');
    assert.equal((await moderation(slow.id,{...toggle,enabled:false})).status,409);
    ok(await send(input(slow.id,'После отключения')));
    ok(await moderation(slow.id,{...toggle,operationId:randomUUID()}));
    await db.query("UPDATE team_conversation_moderation SET enabled_until=clock_timestamp()-interval '1 second' WHERE conversation_id=$1",[slow.id]);
    ok(await send(input(slow.id,'После истечения один')));ok(await send(input(slow.id,'После истечения два')));
    assert.equal(ok(await call('GET',scoped(`/team/conversations/${slow.id}`))).conversation.moderation.active,false);
  });

  await t.test('all Team endpoints exclude drivers, and revoked scopes reject controls without mutation',async()=>{
    const driverId=randomUUID(),alternate=randomUUID();
    await db.query("INSERT INTO users(id,display_name,role,active,approved) VALUES($1,'Synthetic driver','driver',true,true)",[driverId]);
    await db.query('INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id) VALUES($1,$2,$3,$4,$5)',[driverId,ids.legal,ids.region,ids.project,ids.scope]);
    const driver=await f.devLogin(driverId);
    for(const route of ['/team/context',scoped('/team/people'),scoped('/team/conversations'),scoped('/team/articles'),'/team/adaptation',scoped('/team/mentions'),scoped('/team/summaries'),scoped(`/team/messages/${branch.id}`),scoped(`/team/conversations/${channel.id}/changes`)])assert.equal((await call('GET',route,undefined,driver)).status,403,route);
    assert.equal((await send(input(channel.id),driver)).status,403);assert.equal((await react(branch.id,'👍',true,driver)).status,403);
    assert.equal(ok(await call('GET',scoped('/team/people'))).people.some(person=>person.id===driverId),false);
    await db.query("INSERT INTO responsibility_scopes(id,project_id,name) VALUES($1,$2,'Other controls scope')",[alternate,ids.project]);
    await db.query('INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id) VALUES($1,$2,$3,$4,$5)',[ids.admin,ids.legal,ids.region,ids.project,alternate]);
    assert.equal((await edit(branch.id,editBody(branch,'Wrong scope',{responsibilityScopeId:alternate}),admin)).status,404);
    await db.query('DELETE FROM access_grants WHERE user_id=$1',[ids.drivers[0]]);
    assert.equal((await edit(branch.id,editBody(branch,'Revoked'))).status,403);
    assert.equal((await react(branch.id,'👍',true)).status,403);
    assert.equal((await send(original)).status,403);
  });
});
