'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {messageReadInput,notificationPreferencesInput}=require('../recovered/apps/api/src/modules/team/team-input');
const bad=fn=>assert.throws(fn,error=>error.getStatus?.()===400);
test('read acknowledgments name exact messages and shown revisions, never a cursor range',()=>{
  const scope=randomUUID(),id=randomUUID(),base={responsibilityScopeId:scope,messages:[{id,version:1}]};
  assert.deepEqual(messageReadInput(base),base);
  for(const patch of [{messages:[]},{messages:Array.from({length:101},()=>({id:randomUUID(),version:1}))},{messages:[{id,version:0}]},{messages:[{id,version:'1'}]},{messages:[{id,version:2147483646}]},{messages:[{id:'bad',version:1}]},{messages:[{id,version:1},{id,version:2}]},{messages:[{id,version:1,userId:randomUUID()}]},{throughCursor:'999999'},{userId:randomUUID()},{responsibilityScopeId:'bad'}])bad(()=>messageReadInput({...base,...patch}));
});
test('notification preferences are explicit booleans and cannot target another user',()=>{
  const base={muteNotifications:true,muteSound:false};assert.deepEqual(notificationPreferencesInput(base),base);
  assert.equal(notificationPreferencesInput({...base,responsibilityScopeId:randomUUID()},true).muteNotifications,true);
  for(const patch of [{muteNotifications:'true'},{muteSound:null},{userId:randomUUID()},{responsibilityScopeId:randomUUID()},{mentionsMuted:true}])bad(()=>notificationPreferencesInput({...base,...patch}));
  bad(()=>notificationPreferencesInput(base,true));
});
