'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {createTestServer}=require('./local-test-server.cjs');
test('durable exact read receipts and notification preferences preserve private ACL and edited mentions',{timeout:180000},async t=>{
  const f=await createTestServer({staffTeamActors:true});t.after(()=>f.close());const {ids,adminPool:db}=f;
  const alice=await f.devLogin(ids.drivers[0]),bob=await f.devLogin(ids.drivers[1]),outsider=await f.devLogin(ids.dispatcher),admin=await f.devLogin(ids.admin);
  const call=(method,path,body,session=bob)=>f.request(method,path,body,session.accessToken);
  const ok=r=>{assert.ok([200,201].includes(r.status),`${r.status}: ${JSON.stringify(r.body)}`);return r.body;};
  const scoped=path=>`${path}?responsibilityScopeId=${ids.scope}`;
  const create=async (patch,session=alice)=>ok(await call('POST','/team/conversations',{id:randomUUID(),responsibilityScopeId:ids.scope,kind:'channel',title:'Прочтение',memberIds:[],...patch},session));
  const channel=await create(),privateChannel=await create({visibility:'private',memberIds:[ids.drivers[0],ids.drivers[1]]},admin);
  const send=async(text,patch={},session=alice)=>ok(await call('POST','/team/messages',{id:randomUUID(),responsibilityScopeId:ids.scope,conversationId:channel.id,text,...patch},session));
  const ack=(messages,conversationId=channel.id,session=bob)=>call('PUT',`/team/conversations/${conversationId}/read`,{responsibilityScopeId:ids.scope,messages:messages.map(({id,version})=>({id,version}))},session);
  const detail=async(id=channel.id,session=bob)=>ok(await call('GET',scoped(`/team/conversations/${id}`),undefined,session));
  const feed=async(session=bob)=>ok(await call('GET',scoped('/team/unread'),undefined,session));
  const globalPrefs=(body,session=bob)=>call('PUT','/team/notification-preferences',body,session);
  const localPrefs=(body,id=channel.id,session=bob)=>call('PUT',`/team/conversations/${id}/notification-preferences`,{responsibilityScopeId:ids.scope,...body},session);
  const mentionText=`@[Сотрудник](user:${ids.drivers[1]})`,mention={userIds:[ids.drivers[1]],all:false};
  const root=await send('Корень'),hidden=await send('Скрытая ветка',{parentId:root.id}),newer=await send('Новый корень'),own=await send('Своё',{},bob);

  await t.test('loading, polling and reading a visible root do not mark hidden branches or other messages',async()=>{
    const loaded=await detail();assert.equal(loaded.conversation.unreadCount,3);assert.equal(loaded.messages.find(m=>m.id===root.id).isUnread,true);assert.equal(loaded.messages.find(m=>m.id===own.id).isUnread,false);
    await feed();await call('GET',scoped(`/team/messages/${root.id}`));assert.equal((await detail()).conversation.unreadCount,3);
    const top=ok(await ack([newer]));assert.equal(top.unreadCount,2);assert.equal(top.readCursor,newer.changeCursor);
    const old=ok(await ack([root]));assert.equal(old.unreadCount,1);assert.equal(old.readCursor,top.readCursor,'reading an older root cannot move the cursor back');
    assert.equal((await detail()).messages.find(m=>m.id===hidden.id).isUnread,true,'cursor high water does not mark a hidden branch');
    const complete=ok(await ack([hidden]));assert.equal(complete.unreadCount,0);assert.deepEqual(ok(await ack([root,hidden,newer])),complete,'exact retries have no effect');
    assert.equal((await feed()).totalUnreadCount,0);
    await assert.rejects(db.query('UPDATE team_conversation_user_state SET last_read_cursor=0 WHERE user_id=$1 AND conversation_id=$2',[ids.drivers[1],channel.id]));
  });

  await t.test('independent concurrent receipts merge; mixed invalid or stale batches roll back atomically',async()=>{
    const a=await send('Один'),b=await send('Два');await Promise.all([ack([a]),ack([b])]).then(results=>results.forEach(ok));assert.equal((await detail()).conversation.unreadCount,0);
    const c=await send('Три'),d=await send('Четыре');assert.equal((await ack([c,{...d,version:999}])).status,409);assert.equal((await detail()).conversation.unreadCount,2);
    assert.equal((await ack([c,{id:randomUUID(),version:1}])).status,404);assert.equal((await detail()).conversation.unreadCount,2);
    const foreign=await send('Приватно',{conversationId:privateChannel.id});assert.equal((await ack([c,foreign])).status,404);assert.equal((await detail()).conversation.unreadCount,2);
    ok(await ack([c,d]));ok(await ack([foreign],privateChannel.id));
    await assert.rejects(db.query('DELETE FROM team_message_reads WHERE user_id=$1 AND message_id=$2',[ids.drivers[1],c.id]));
    await assert.rejects(db.query('UPDATE team_message_reads SET message_version=999 WHERE user_id=$1 AND message_id=$2',[ids.drivers[1],c.id]));
  });

  await t.test('edited mentions require the newly shown revision and both acknowledgement routes agree',async()=>{
    let m=await send('Без упоминания');ok(await ack([m]));
    m=ok(await call('PUT',`/team/messages/${m.id}`,{responsibilityScopeId:ids.scope,operationId:randomUUID(),version:m.version,text:`Новая задача ${mentionText}`,mentions:mention},alice));
    let state=(await detail()).conversation;assert.equal(state.unreadCount,0);assert.equal(state.unreadMentionCount,1);
    const item=(await feed()).notifications.find(n=>n.messageId===m.id);assert.equal(item.isMention,true);assert.equal(item.isUnread,false);assert.equal(item.isUnreadMention,true);assert.equal(item.notificationId,`mention:${m.id}:2`);
    assert.equal((await ack([{...m,version:1}])).status,409);
    assert.equal((await call('PUT',`/team/mentions/${m.id}/read`,{responsibilityScopeId:ids.scope,version:1})).status,409);assert.equal((await detail()).conversation.unreadMentionCount,1);
    assert.equal((await call('PUT',`/team/mentions/${m.id}/read`,{responsibilityScopeId:ids.scope})).status,400);
    const read=ok(await call('PUT',`/team/mentions/${m.id}/read`,{responsibilityScopeId:ids.scope,version:m.version}));assert.ok(read.readAt);assert.equal((await detail()).conversation.unreadMentionCount,0);
    const all=await send('@all Всем',{mentions:{userIds:[],all:true}});state=ok(await ack([all]));assert.equal(state.unreadCount,0);assert.equal(state.unreadMentionCount,0);
    const inbox=ok(await call('GET',scoped('/team/mentions')));assert.ok(inbox.mentions.find(n=>n.messageId===all.id).readAt);assert.equal(inbox.mentions.find(n=>n.messageId===m.id).version,2);
    const deleted=await send(`Удаляем ${mentionText}`,{mentions:mention});ok(await call('PUT',`/team/messages/${deleted.id}/deletion`,{responsibilityScopeId:ids.scope,operationId:randomUUID(),version:deleted.version},alice));
    assert.equal((await feed()).notifications.some(n=>n.messageId===deleted.id),false);assert.equal((await detail()).conversation.unreadCount,0);
  });

  await t.test('global and chat mute are independent, durable, self-only and mentions override both',async()=>{
    const ordinary=await send('Обычное уведомление'),direct=await send(mentionText,{mentions:mention}),all=await send('@all Важное',{mentions:{userIds:[],all:true}});
    assert.deepEqual(ok(await call('GET','/team/notification-preferences')),{muteNotifications:false,muteSound:false});
    const before=(await detail()).conversation.readCursor;
    ok(await globalPrefs({muteNotifications:true,muteSound:false}));let configured=ok(await localPrefs({muteNotifications:false,muteSound:true}));
    assert.equal(configured.readCursor,before);assert.deepEqual(configured.notificationPreferences,{muteNotifications:false,muteSound:true});assert.deepEqual(configured.effectiveNotificationPreferences,{muteNotifications:true,muteSound:true});
    let notifications=(await feed()).notifications;const normal=notifications.find(n=>n.messageId===ordinary.id);assert.equal(normal.shouldNotify,false);assert.equal(normal.shouldPlaySound,false);
    for(const id of [direct.id,all.id]){const n=notifications.find(n=>n.messageId===id);assert.equal(n.shouldNotify,true);assert.equal(n.shouldPlaySound,true);}
    assert.deepEqual(ok(await call('GET','/team/notification-preferences',undefined,alice)),{muteNotifications:false,muteSound:false});
    assert.equal((await globalPrefs({muteNotifications:true,muteSound:true,userId:ids.drivers[0]})).status,400);
    await f.restartApi();configured=(await detail()).conversation;assert.deepEqual(configured.effectiveNotificationPreferences,{muteNotifications:true,muteSound:true});assert.equal(configured.unreadCount,3);
    ok(await globalPrefs({muteNotifications:false,muteSound:false}));configured=ok(await localPrefs({muteNotifications:false,muteSound:false}));assert.deepEqual(configured.effectiveNotificationPreferences,{muteNotifications:false,muteSound:false});
    ok(await ack([ordinary,direct,all]));
  });

  await t.test('private membership, wrong scope, revoked grants and administrator sessions constrain all state surfaces',async()=>{
    const secret=await send('@all Закрыто',{conversationId:privateChannel.id,mentions:{userIds:[],all:true}});
    assert.ok((await feed()).notifications.some(n=>n.messageId===secret.id));assert.equal((await feed(outsider)).notifications.some(n=>n.messageId===secret.id),false);
    assert.equal((await ack([secret],privateChannel.id,outsider)).status,404);assert.equal((await localPrefs({muteNotifications:true,muteSound:true},privateChannel.id,outsider)).status,404);
    ok(await ack([secret],privateChannel.id,admin));assert.equal((await detail(privateChannel.id)).conversation.unreadCount,1,'administrator reads never clear employee receipts');
    const imp=ok(await call('POST','/auth/impersonate',{userId:ids.dispatcher},admin));assert.equal((await ack([secret],privateChannel.id,imp)).status,404);
    ok(await call('PUT',`/team/conversations/${privateChannel.id}/access`,{responsibilityScopeId:ids.scope,operationId:randomUUID(),version:privateChannel.version,visibility:'private',memberIds:[ids.drivers[0]]},admin));
    assert.equal((await feed()).notifications.some(n=>n.messageId===secret.id),false);assert.equal((await ack([secret],privateChannel.id)).status,404);
    const otherScope=randomUUID();await db.query("INSERT INTO responsibility_scopes(id,project_id,name) VALUES($1,$2,'Unread alternate')",[otherScope,ids.project]);await db.query('INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id) VALUES($1,$2,$3,$4,$5)',[ids.drivers[1],ids.legal,ids.region,ids.project,otherScope]);
    assert.equal((await call('PUT',`/team/conversations/${channel.id}/read`,{responsibilityScopeId:otherScope,messages:[{id:root.id,version:1}]})).status,404);
    assert.equal(ok(await call('GET',`/team/unread?responsibilityScopeId=${otherScope}`)).totalUnreadCount,0);
  });

  await t.test('recent feed is bounded while totals cover all authorized unread messages',async()=>{
    const messageIds=Array.from({length:105},()=>randomUUID());
    await db.query(`INSERT INTO team_messages(id,legal_entity_id,region_id,project_id,responsibility_scope_id,conversation_id,text,author_id,author_name)
      SELECT id,$1,$2,$3,$4,$5,'Синтетическая непрочитанная история',$6,'Сотрудник' FROM unnest($7::uuid[]) AS messages(id)`,[ids.legal,ids.region,ids.project,ids.scope,channel.id,ids.drivers[0],messageIds]);
    const history=await feed();assert.equal(history.notifications.length,100);assert.equal(history.hasMore,true);assert.equal(history.totalUnreadCount,105);assert.equal(history.totalUnreadMentionCount,0);
    const readTop=ok(await ack(history.notifications.map(n=>({id:n.messageId,version:n.version}))));assert.equal(readTop.unreadCount,5);assert.equal((await feed()).notifications.length,5);
    await db.query('DELETE FROM access_grants WHERE user_id=$1 AND responsibility_scope_id=$2',[ids.drivers[1],ids.scope]);assert.equal((await call('GET',scoped('/team/unread'))).status,200,'another project grant retains company chat access');
    await db.query('DELETE FROM access_grants WHERE user_id=$1',[ids.drivers[1]]);assert.equal((await call('GET',scoped('/team/unread'))).status,403);assert.equal((await ack([root])).status,403);
    await db.query('UPDATE users SET auth_version=auth_version+1 WHERE id=$1',[ids.drivers[1]]);assert.equal((await call('GET','/team/notification-preferences')).status,401);
  });
});
