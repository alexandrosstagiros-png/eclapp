'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const dadata = require('../recovered/apps/api/src/modules/recruitment/dadata');
const SECRET = 'synthetic-dadata-key-for-tests';
function setup(t) {
  const previous = process.env.DADATA_API_KEY;
  process.env.DADATA_API_KEY = SECRET;
  t.after(() => { if (previous === undefined) delete process.env.DADATA_API_KEY; else process.env.DADATA_API_KEY = previous; });
}
const company = { value: 'ООО «Тест перевозчика»', data: { type:'LEGAL',inn:'7707083893',kpp:'773601001',ogrn:'1027700132195',
  name:{full_with_opf:'Общество с ограниченной ответственностью «Тест перевозчика»'},opf:{short:'ООО'},
  address:{unrestricted_value:'Тестовый адрес'},management:{name:'Тестовый Подписант',post:'Директор'},state:{status:'ACTIVE'},
  founders:[{private:'DO-NOT-RETURN'}] } };
const response = suggestions => new Response(JSON.stringify({suggestions}));
const fails = (code, status) => error => {
  assert.equal(error.getStatus(), status);
  assert.equal(error.getResponse().code, code);
  assert.doesNotMatch(JSON.stringify(error), /synthetic-dadata-key|UPSTREAM-PRIVATE/);
  return true;
};
test('company lookup uses a fixed authenticated endpoint and returns only editable requisites',async t => {
  setup(t);
  const result = await dadata.lookup('party','7707 083893',{fetchImpl:async(url,options) => {
    assert.equal(url,'https://suggestions.dadata.ru/suggestions/api/4_1/rs/findById/party');
    assert.equal(options.method,'POST');assert.equal(options.redirect,'error');
    assert.equal(options.headers.Authorization,`Token ${SECRET}`);
    assert.deepEqual(JSON.parse(options.body),{query:'7707083893',count:10,branch_type:'MAIN'});
    return response([company]);
  }});
  assert.equal(result.suggestions[0].values.carrier_inn,'7707083893');
  assert.equal(result.suggestions[0].values.carrier_signer_name,'Тестовый Подписант');
  assert.equal(result.suggestions[0].values.carrier_signer_basis,'');
  assert.equal(result.suggestions[0].values.carrier_account,undefined);
  assert.doesNotMatch(JSON.stringify(result),/DO-NOT-RETURN|synthetic-dadata-key/);
});
test('individual entrepreneur clears KPP and uses their FIO, not a corporate director',async t => {
  setup(t);
  const result = await dadata.lookup('party','784806113663',{fetchImpl:async()=>response([{value:'ИП Тестовый Предприниматель',data:{
    type:'INDIVIDUAL',inn:'784806113663',ogrn:'315784700000001',kpp:null,fio:{surname:'Тестовый',name:'Предприниматель'},name:{full_with_opf:'ИП Тестовый Предприниматель'},state:{status:'LIQUIDATED'}
  }}])});
  const {values,status} = result.suggestions[0];
  assert.equal(values.carrier_type,'ИП');assert.equal(values.carrier_kpp,'');
  assert.equal(values.carrier_signer_name,'Тестовый Предприниматель');assert.equal(status,'LIQUIDATED');
});
test('bank lookup preserves leading zeros and never invents a settlement account',async t => {
  setup(t);
  const result = await dadata.lookup('bank','044525225',{fetchImpl:async(url,options)=>{
    assert.match(url,/\/bank$/);assert.deepEqual(JSON.parse(options.body),{query:'044525225',count:10});
    return response([{value:'Тестовый банк',data:{bic:'044525225',name:{payment:'ТЕСТОВЫЙ БАНК'},correspondent_account:'30101810400000000225',state:{status:'ACTIVE'}}}]);
  }});
  assert.deepEqual(result.suggestions[0].values,{carrier_bank:'ТЕСТОВЫЙ БАНК',carrier_bik:'044525225',carrier_correspondent_account:'30101810400000000225'});
});
test('invalid input and missing credentials do not contact the provider',async t => {
  setup(t);let calls=0;const options={fetchImpl:async()=>{calls++;return response([]);}};
  for (const value of ['','https://example.com','1'.repeat(11),{query:'7707083893'}]) await assert.rejects(dadata.lookup('party',value,options),fails('DADATA_QUERY',400));
  await assert.rejects(dadata.lookup('bank','44525225',options),fails('DADATA_QUERY',400));
  delete process.env.DADATA_API_KEY;
  assert.deepEqual(dadata.status(),{provider:'dadata',configured:false});
  await assert.rejects(dadata.lookup('party','7707083893',options),fails('DADATA_NOT_CONFIGURED',503));
  assert.equal(calls,0);
});
test('empty results, rejected access, limits and malformed payloads remain distinct',async t => {
  setup(t);
  assert.deepEqual((await dadata.lookup('party','7707083893',{fetchImpl:async()=>response([])})).suggestions,[]);
  for (const [status,code] of [[401,'DADATA_ACCESS'],[403,'DADATA_ACCESS'],[429,'DADATA_LIMIT'],[500,'DADATA_UNAVAILABLE']]) {
    await assert.rejects(dadata.lookup('party','7707083893',{fetchImpl:async()=>new Response('UPSTREAM-PRIVATE '+SECRET,{status})}),fails(code,503));
  }
  for (const bad of [{}, {suggestions:[{}]}, {suggestions:[{data:{type:'OTHER',inn:'7707083893'}}]}]) {
    await assert.rejects(dadata.lookup('party','7707083893',{fetchImpl:async()=>new Response(JSON.stringify(bad))}),fails('DADATA_RESPONSE',502));
  }
  await assert.rejects(dadata.lookup('party','7707083893',{fetchImpl:async()=>new Response('x'.repeat(1024*1024+1))}),fails('DADATA_RESPONSE',502));
  await assert.rejects(dadata.lookup('party','7707083893',{fetchImpl:async()=>{throw new Error('UPSTREAM-PRIVATE '+SECRET);}}),fails('DADATA_UNAVAILABLE',503));
});
test('slow provider is cancelled with a safe timeout error',async t => {
  setup(t);
  const keepAlive=setTimeout(()=>{},200);t.after(()=>clearTimeout(keepAlive));
  await assert.rejects(dadata.lookup('party','7707083893',{timeoutMs:10,fetchImpl:async(_url,options)=>new Promise((_resolve,reject)=>{
    options.signal.addEventListener('abort',()=>reject(new Error('UPSTREAM-PRIVATE '+SECRET)),{once:true});
  })}),fails('DADATA_TIMEOUT',504));
});
