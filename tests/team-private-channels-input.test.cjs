'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const {conversationInput,conversationAccessInput}=require('../recovered/apps/api/src/modules/team/team-input');
const invalid=fn=>assert.throws(fn,e=>e.getStatus?.()===400);
test('private channel inputs preserve direct defaults and require explicit bounded members and versioned operations',()=>{
  const base={id:randomUUID(),responsibilityScopeId:randomUUID(),kind:'channel',title:'Закрытая команда',memberIds:[]};
  assert.equal(conversationInput(base).visibility,'public');
  const members=[randomUUID(),randomUUID()];
  assert.equal(conversationInput({...base,kind:'direct',memberIds:members}).visibility,'private');
  assert.deepEqual(conversationInput({...base,visibility:'private',memberIds:members}).memberIds,[...members].sort());
  for(const patch of [{visibility:'hidden'},{visibility:'private'},{memberIds:members},{visibility:'private',memberIds:[members[0],members[0]]},{visibility:'private',memberIds:Array.from({length:201},()=>randomUUID())},{kind:'direct',visibility:'public',memberIds:members},{createdBy:randomUUID()}])invalid(()=>conversationInput({...base,...patch}));
  const op={responsibilityScopeId:base.responsibilityScopeId,operationId:randomUUID(),version:1,visibility:'private',memberIds:members};
  assert.equal(conversationAccessInput(op).version,1);
  for(const patch of [{version:0},{version:'1'},{version:2147483646},{operationId:'bad'},{memberIds:[]},{title:'forged'}])invalid(()=>conversationAccessInput({...op,...patch}));
});
