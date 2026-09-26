'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
require('../recovered/node_modules/reflect-metadata');
const {readNotificationConfig}=require('../recovered/apps/api/src/modules/notifications/notification-config');
const {MaxBotAdapter}=require('../recovered/apps/api/src/modules/notifications/max-bot.adapter');
const {enqueueNotification}=require('../recovered/apps/api/src/modules/notifications/notification-enqueue');
const {NotificationsService}=require('../recovered/apps/api/src/modules/notifications/notifications.service');
const {NotificationsWorker}=require('../recovered/apps/api/src/modules/notifications/notifications.worker');
const enabled={MAX_NOTIFICATIONS_ENABLED:'true',MAX_BOT_TOKEN:'local-test-bot-token',MAX_WEBHOOK_SECRET:'independent_test_secret_1234567890123456',NODE_ENV:'test'};
test('Notifications default disabled and production config fails closed',()=>{
  assert.equal(readNotificationConfig({}).enabled,false);
  const config=readNotificationConfig(enabled);
  assert.equal(config.reminderSeconds,300);assert.equal(config.escalationSeconds,900);assert.equal(config.deliveryTtlSeconds,86400);
  for(const overrides of [{MAX_NOTIFICATIONS_ENABLED:'yes'},{MAX_BOT_TOKEN:''},{MAX_WEBHOOK_SECRET:'short'},
    {MAX_WEBHOOK_SECRET:enabled.MAX_BOT_TOKEN},{MAX_NOTIFICATION_REMINDER_SECONDS:'0'},
    {MAX_NOTIFICATION_ESCALATION_SECONDS:'300'},{MAX_NOTIFICATIONS_ENABLED_AT:'yesterday'},{MAX_BOT_USERNAME:'bad?path'}])
    assert.throws(()=>readNotificationConfig({...enabled,...overrides}));
});
test('MAX adapter uses private numeric recipient, audible notification and bound callback button',async()=>{
  const adapter=new MaxBotAdapter({botToken:enabled.MAX_BOT_TOKEN});
  try{
    const calls=[];
    adapter.request=async(path,body)=>{calls.push({path,body});return path.startsWith('/answers')?{success:true}:{message:{body:{mid:'mid-1'},recipient:{chat_type:'dialog',user_id:123}}};};
    const token='a'.repeat(43);
    assert.deepEqual(await adapter.send({userId:'123',text:'Срочное сообщение',ackToken:token}),{messageId:'mid-1'});
    assert.equal(calls[0].path,'/messages?user_id=123&disable_link_preview=true');
    assert.equal(calls[0].body.notify,true);
    assert.deepEqual(calls[0].body.attachments[0].payload.buttons,[[{type:'callback',text:'Принял',payload:'ack:'+token}]]);
    assert.deepEqual(await adapter.answer({callbackId:'callback/id'}),{ok:true});
    assert.equal(calls[1].path,'/answers?callback_id=callback%2Fid');assert.equal(calls[1].body.message.notify,false);
    for(const userId of ['+79990000000','9007199254740992','123&chat_id=9'])await assert.rejects(adapter.send({userId,text:'text',ackToken:token}));
    assert.equal(calls.length,2);
  }finally{adapter.close();}
});
test('Adapter rejects a receipt for another user and test mode never opens network',async()=>{
  const previous=process.env.NODE_ENV;process.env.NODE_ENV='test';
  const adapter=new MaxBotAdapter({botToken:enabled.MAX_BOT_TOKEN});
  try{
    await assert.rejects(adapter.request('/messages',{}),e=>e.code==='NETWORK_DISABLED_IN_TEST');
    adapter.request=async()=>({message:{body:{mid:'mid'},recipient:{chat_type:'dialog',user_id:999}}});
    await assert.rejects(adapter.send({userId:'123',text:'test',ackToken:'b'.repeat(43)}),e=>e.code==='INVALID_RECEIPT');
  }finally{adapter.close();if(previous===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=previous;}
});
function event(){return {eventKey:'test:'+randomUUID(),type:'dispatcher_message',recipientIds:[randomUUID()],scope:{legalEntityId:randomUUID(),regionId:randomUUID(),projectId:randomUUID(),responsibilityScopeId:randomUUID()},title:'Title',body:'Body',entityType:'notification_message',entityId:randomUUID()};}
function client(){
  return {cutoff:null,inserted:0,async query(sql,args){
    if(sql.startsWith('UPDATE notification_settings')){this.cutoff ||= args[0];return{rows:[{enabled_at:this.cutoff}],rowCount:1};}
    if(sql.startsWith('INSERT INTO notification_events')){this.inserted++;return{rows:[{id:args[0]}],rowCount:1};}
    if(sql.startsWith('SELECT u.id'))return{rows:[{id:args[0]}],rowCount:1};
    return{rows:[],rowCount:1};
  }};
}
test('First direct enqueue uses the same instant as initial cutoff; historical event is excluded',async()=>{
  const db=client(),config=readNotificationConfig(enabled);
  const first=await enqueueNotification(db,event(),{config});
  assert.equal(first.notificationIds.length,1);assert.equal(db.inserted,1);
  const historical=await enqueueNotification(db,{...event(),occurredAt:new Date(db.cutoff.getTime()-1)},{config});
  assert.equal(historical.skipped,'before_enabled');assert.equal(db.inserted,1);
});
test('Disabled enqueue has no database side effects and malformed scoped messages fail before SQL',async()=>{
  const db={query(){assert.fail('Unexpected database access');}};
  assert.equal((await enqueueNotification(db,event(),{config:readNotificationConfig({})})).skipped,'disabled');
  for(const input of [{...event(),body:'bad\u0000value'},{...event(),recipientIds:[]},{...event(),scope:{}},{...event(),title:'x'.repeat(121)}])
    await assert.rejects(enqueueNotification(db,input,{config:readNotificationConfig(enabled)}),e=>e.status===400);
});
test('Invalid webhook secret and expired link payload never access the database',async()=>{
  const service=new NotificationsService({transaction(){assert.fail('Unexpected database access');}},null,null,{value:{maxBotToken:enabled.MAX_BOT_TOKEN,maxAuthMaxAgeSeconds:300}});
  service.config=()=>readNotificationConfig(enabled);
  await assert.rejects(service.webhook('wrong',{},randomUUID()),e=>e.status===401);
  await assert.rejects(service.link({}, {initData:'malformed'},randomUUID()),e=>e.status===400);
});
test('Worker test startup records cutoff but creates neither timer nor network adapter',async()=>{
  let initialized=0;
  const worker=new NotificationsWorker({pool:{query:async()=>{initialized++;}}},null);
  worker.config=()=>readNotificationConfig(enabled);
  await worker.onModuleInit();assert.equal(initialized,1);assert.equal(worker.adapter,undefined);assert.equal(worker.timer,undefined);
  await worker.onModuleDestroy();
});
