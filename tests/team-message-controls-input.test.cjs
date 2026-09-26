'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { messageControlInput, reactionInput, moderationInput, REACTION_EMOJI } = require('../recovered/apps/api/src/modules/team/team-input');
const invalid = fn => assert.throws(fn, error => error.getStatus?.() === 400);
const operation = (patch={}) => ({responsibilityScopeId:randomUUID(),operationId:randomUUID(),version:1,...patch});
test('message mutations require bounded versions, explicit operation IDs and valid mention tokens',()=>{
  const value=operation({text:'  Текст  '});assert.equal(messageControlInput(value,'edit').text,'Текст');
  assert.deepEqual(messageControlInput(operation(),'delete').version,1);
  for(const patch of [{version:0},{version:'1'},{version:2147483646},{operationId:'bad'},{responsibilityScopeId:'bad'},{authorId:randomUUID()},{text:'x'.repeat(12001)},{text:'bad\u0000'}]) invalid(()=>messageControlInput({...value,...patch},'edit'));
  invalid(()=>messageControlInput(operation({text:'not allowed'}),'delete'));
  invalid(()=>messageControlInput(operation({text:'@all'}),'edit'));
  assert.equal(messageControlInput(operation({text:'@all',mentions:{userIds:[],all:true}}),'edit').mentions.all,true);
});
test('reaction state is explicit and moderation cannot accept a forged expiry or policy',()=>{
  for(const emoji of REACTION_EMOJI)assert.equal(reactionInput({responsibilityScopeId:randomUUID(),emoji,present:true}).emoji,emoji);
  for(const patch of [{emoji:'<script>'},{present:'true'},{userId:randomUUID()}])invalid(()=>reactionInput({responsibilityScopeId:randomUUID(),emoji:'👍',present:true,...patch}));
  assert.equal(moderationInput({responsibilityScopeId:randomUUID(),operationId:randomUUID(),enabled:false}).enabled,false);
  for(const patch of [{enabled:'true'},{enabledUntil:'2099-01-01'},{mode:'forever'},{operationId:'bad'}])invalid(()=>moderationInput({responsibilityScopeId:randomUUID(),operationId:randomUUID(),enabled:true,...patch}));
});
