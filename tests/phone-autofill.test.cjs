'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createHmac } = require('node:crypto');
require(path.resolve(__dirname, '../recovered/node_modules/reflect-metadata'));
const { PhoneAutofillService } = require('../recovered/apps/api/src/modules/phone-autofill/phone-autofill.module');
const now = Date.now();
const token = '123456:test-token-for-local-autofill';
function signed(id=123, provider='telegram') {
  const p = new URLSearchParams({auth_date:String(Math.floor(now/1000)),user:JSON.stringify({id})});
  const canonical = [...p].sort(([a],[b])=>a<b?-1:1).map(([k,v])=>`${k}=${v}`).join('\n');
  const secret = createHmac('sha256','WebAppData').update(token).digest();
  p.set('hash',createHmac('sha256',secret).update(canonical).digest('hex'));
  return p.toString();
}
function service(rows=[]) {
  const calls=[];
  const result = new PhoneAutofillService({pool:{query:async(sql,args)=>{calls.push(args);return{rows};}}},{value:{telegramBotToken:token,maxBotToken:token,telegramAuthMaxAgeSeconds:300,maxAuthMaxAgeSeconds:300}},()=>now);
  result.calls=calls;
  return result;
}
function contact(id=123) { return {message:{date:Math.floor(now/1000),from:{id},chat:{id,type:'private'},contact:{user_id:id,phone_number:'79620000000'}}}; }
test('Only fresh self-shared private Telegram contacts are accepted',()=>{
  const s=service(); assert.equal(s.captureTelegramContact(contact()),true);
  for(const mutate of [u=>u.message.contact.user_id=999,u=>u.message.chat.id=999,u=>u.message.chat.type='group',u=>u.message.from.is_bot=true,u=>u.message.date-=301,u=>u.message.date+=31,u=>u.message.forward_origin={},u=>u.message.contact.phone_number='bad',u=>delete u.message.contact]) {
    const c=contact(); mutate(c); assert.equal(s.captureTelegramContact(c),false);
  }
  assert.equal(s.captureTelegramContact(null),false);
});
test('A valid signed identity reads its own phone; no arbitrary target ID',async()=>{
  const s=service([{phone:'+79620000000'}]);
  assert.deepEqual(await s.hint({provider:'telegram',initData:signed(123),userId:999}),{phone:'+79620000000'});
  assert.deepEqual(s.calls,[['telegram','123']]);
  assert.deepEqual(await s.hint({provider:'max',initData:signed(456)}),{phone:'+79620000000'});
  assert.deepEqual(s.calls[1],['max','456']);
});
test('Bad signatures never read a phone',async()=>{
  const s=service([{phone:'+79620000000'}]);
  await assert.rejects(s.hint({provider:'telegram',initData:signed().replace('hash=','hash=f')}),e=>e.status===401);
  await assert.rejects(s.hint({provider:'other',initData:signed()}),e=>e.status===400);
  assert.equal(s.calls.length,0);
});
test('Contact capture fills only same Telegram ID and expires',async()=>{
  const s=service(); s.captureTelegramContact(contact());
  assert.deepEqual(await s.hint({provider:'telegram',initData:signed()}),{phone:'+79620000000'});
  assert.deepEqual(await s.hint({provider:'telegram',initData:signed(456)}),{phone:null});
  assert.deepEqual(await s.hint({provider:'max',initData:signed()}),{phone:null});
  s.now=()=>now+300001; s.prune(); assert.equal(s.contacts.size,0);
});
test('Contact cache stays bounded',()=>{
  const s=service(); for(let i=1;i<=1002;i++)s.captureTelegramContact(contact(i));
  assert.equal(s.contacts.size,1000); assert.equal(s.contacts.has('1'),false);
});
