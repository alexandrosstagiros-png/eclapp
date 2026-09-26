'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vk = require('../recovered/apps/api/src/modules/recruitment/vk-ocr');
const router = require('../recovered/apps/api/src/modules/recruitment/onboarding-ocr');

// Synthetic image headers; provider calls are always stubbed, never paid.
function png(width=100,height=200) {
  const bytes = Buffer.alloc(24);
  Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes);
  bytes.writeUInt32BE(13,8);bytes.write('IHDR',12);bytes.writeUInt32BE(width,16);bytes.writeUInt32BE(height,20);
  return bytes;
}
function jpeg(width=100,height=200) {
  const bytes = Buffer.from([255,216,255,224,0,4,0,0,255,192,0,8,8,0,0,0,0,1,255,217]);
  bytes.writeUInt16BE(height,13);bytes.writeUInt16BE(width,15);return bytes;
}
const input = (documentType='passport') => ({buffer:png(),mimeType:'image/png',documentType});
const response = object => new Response(JSON.stringify({status:200,body:{objects:[{status:0,name:'file',...object}]}}));
function setup(t) {
  const names=['VK_OCR_TOKEN','ONBOARDING_OCR_PROVIDER','YANDEX_OCR_API_KEY','YANDEX_OCR_FOLDER_ID'];
  const old=Object.fromEntries(names.map(name=>[name,process.env[name]]));
  process.env.VK_OCR_TOKEN='synthetic-vk-secret+/=';
  delete process.env.ONBOARDING_OCR_PROVIDER;
  t.after(()=>{for(const name of names) {if(old[name]===undefined)delete process.env[name];else process.env[name]=old[name];}});
}
const fails = (code,status) => cause => {
  assert.equal(cause.getStatus(),status);assert.equal(cause.getResponse().code,code);
  assert.match(cause.getResponse().message,/[А-Яа-я]/);
  assert.doesNotMatch(JSON.stringify(cause),/synthetic-vk-secret|upstream-sensitive|oauth_token=/);
  assert.equal(cause.cause,undefined);return true;
};

test('VK is the default provider; readiness and capabilities reveal no secret',t=>{
  setup(t);
  const status=router.getOcrStatus();
  assert.equal(status.provider,'vk');assert.equal(status.configured,true);
  assert.deepEqual(status.fieldsDocumentTypes,['passport']);
  assert.equal(status.maxWidth,3840);assert.equal(status.maxHeight,2160);
  assert.doesNotMatch(JSON.stringify(status),/synthetic-vk-secret/);
  delete process.env.VK_OCR_TOKEN;
  process.env.YANDEX_OCR_API_KEY='synthetic-yandex';process.env.YANDEX_OCR_FOLDER_ID='synthetic-folder';
  assert.equal(router.getOcrStatus().configured,false);
  process.env.ONBOARDING_OCR_PROVIDER='yandex';assert.equal(router.getOcrStatus().provider,'yandex');
  assert.equal(router.getOcrStatus().configured,true);
  process.env.ONBOARDING_OCR_PROVIDER='arbitrary-secret';
  assert.equal(router.getOcrStatus().configured,false);assert.equal(router.getOcrStatus().provider,'unsupported');
  assert.doesNotMatch(JSON.stringify(router.getOcrStatus()),/arbitrary-secret/);
});

test('VK passport request uses documented fixed endpoint, token query, matching multipart names and no redirects',async t=>{
  setup(t);let calls=0;
  const result=await router.recognizeDocument(input(),{fetchImpl:async(url,request)=>{
    calls++;const target=new URL(url);
    assert.equal(target.origin,'https://smarty.mail.ru');assert.equal(target.pathname,'/api/v1/docs/recognize');
    assert.equal(target.searchParams.get('oauth_token'),'synthetic-vk-secret+/=');assert.equal(target.searchParams.get('oauth_provider'),'mcs');
    assert.equal(request.method,'POST');assert.equal(request.redirect,'error');
    assert.deepEqual(request.headers,{Accept:'application/json'});
    assert.deepEqual(JSON.parse(request.body.get('meta')),{images:[{name:'file'}]});
    const file=request.body.get('file');assert.equal(file.type,'image/png');assert.equal(file.name,'document.png');
    assert.deepEqual(Buffer.from(await file.arrayBuffer()),png());
    return response({labels:{first_name:[' ТЕСТ '],last_name:['СИНТЕТИЧЕСКИЙ'],birthday:['01.01.2000'],series_number:['00','00'],number:['000001'],place_of_issue:['ТЕСТОВЫЙ','ОТДЕЛ'],untrusted:['discard']}});
  }});
  assert.equal(calls,1);assert.equal(result.model,'vk-docs');
  assert.deepEqual(result.fields,{name:'ТЕСТ',surname:'СИНТЕТИЧЕСКИЙ',birth_date:'01.01.2000',issued_by:'ТЕСТОВЫЙ ОТДЕЛ',series:'00 00',document_number:'000001',number:'00 00 000001'});
  assert.match(result.text,/Фамилия: СИНТЕТИЧЕСКИЙ/);assert.doesNotMatch(result.text,/discard/);
});

test('all other document types request plain text and never invent field extraction',async t=>{
  setup(t);
  for(const documentType of vk.getOcrStatus().documentTypes.filter(value=>value!=='passport')) {
    const result=await vk.recognizeDocument({...input(documentType),buffer:jpeg(),mimeType:'image/jpeg'},{fetchImpl:async(url,request)=>{
      assert.equal(new URL(url).pathname,'/api/v1/text/recognize');assert.equal(request.body.get('file').name,'document.jpg');
      return response({text:'SYNTHETIC\nDOCUMENT'});
    }});
    assert.deepEqual(result,{text:'SYNTHETIC\nDOCUMENT',fields:{},model:'vk-text'});
  }
});

test('missing or invalid token never calls VK and never falls back to another cloud',async t=>{
  setup(t);process.env.YANDEX_OCR_API_KEY='synthetic-yandex';process.env.YANDEX_OCR_FOLDER_ID='synthetic-folder';
  for(const token of ['', 'invalid\nsecret']) {
    process.env.VK_OCR_TOKEN=token;
    await assert.rejects(router.recognizeDocument(input(),{fetchImpl:async()=>assert.fail('Unexpected request')}),fails('ONBOARDING_OCR_NOT_CONFIGURED',503));
  }
  process.env.ONBOARDING_OCR_PROVIDER='unknown';
  await assert.rejects(router.recognizeDocument(input()),fails('ONBOARDING_OCR_NOT_CONFIGURED',503));
});

test('rejects unsupported content, malformed headers, oversize and VK resolution violations before sending',async t=>{
  setup(t);let calls=0;const fetchImpl=async()=>{calls++;assert.fail('Unexpected request');};
  const cases=[
    [{...input(),buffer:Buffer.alloc(0)},'IMAGE',400],
    [{...input(),buffer:Buffer.alloc(vk.MAX_BYTES+1)},'SIZE',413],
    [{...input(),mimeType:'image/svg+xml'},'FORMAT',400],
    [{...input(),buffer:Buffer.from([255,216,255]),mimeType:'image/jpeg'},'FORMAT',400],
    [{...input(),buffer:jpeg(),mimeType:'image/png'},'FORMAT',400],
    [{...input(),buffer:png(4,100)},'DIMENSIONS',400],
    [{...input(),buffer:png(3841,100)},'DIMENSIONS',400],
    [{...input(),buffer:jpeg(100,2161),mimeType:'image/jpeg'},'DIMENSIONS',400],
    [input('__proto__'),'DOCUMENT_TYPE',400],
  ];
  for(const [data,code,status] of cases) await assert.rejects(vk.recognizeDocument(data,{fetchImpl}),fails('ONBOARDING_OCR_'+code,status));
  assert.equal(calls,0);
});

test('handles HTTP and VK envelope/object errors without disclosing error bodies or URLs',async t=>{
  setup(t);
  for(const [status,code,publicStatus] of [[400,'REJECTED',422],[401,'ACCESS',503],[403,'ACCESS',503],[429,'BUSY',503],[500,'UNAVAILABLE',503],[302,'UNAVAILABLE',503]]) {
    let calls=0;
    await assert.rejects(router.recognizeDocument(input(),{fetchImpl:async()=>{calls++;return {ok:false,status,get body(){assert.fail('Must not read error body');}};}}),fails('ONBOARDING_OCR_'+code,publicStatus));
    assert.equal(calls,1);
  }
  for(const [body,code,status] of [
    [{status:403,body:'upstream-sensitive'},'ACCESS',503],
    [{status:200,body:{objects:[{name:'file',status:1,error:'upstream-sensitive'}]}},'REJECTED',422],
    [{status:200,body:{objects:[{name:'file',status:2,error:'upstream-sensitive'}]}},'UNAVAILABLE',503],
  ]) await assert.rejects(vk.recognizeDocument(input(),{fetchImpl:async()=>new Response(JSON.stringify(body))}),fails('ONBOARDING_OCR_'+code,status));
  await assert.rejects(vk.recognizeDocument(input(),{fetchImpl:async url=>{throw new Error(url+' upstream-sensitive');}}),fails('ONBOARDING_OCR_UNAVAILABLE',503));
});

test('bounded parser rejects unexpected response, mismatched file, unknown status and excessive fields',async t=>{
  setup(t);
  const cases=[
    ()=>new Response('upstream-sensitive'),
    ()=>new Response(JSON.stringify({status:200,body:{objects:[]}})),
    ()=>response({name:'different',labels:{first_name:['test']}}),
    ()=>response({status:999,labels:{first_name:['test']}}),
    ()=>response({labels:'upstream-sensitive'}),
    ()=>response({labels:{first_name:'upstream-sensitive'}}),
    ()=>response({labels:{first_name:['x'.repeat(2049)]}}),
    ()=>new Response('x',{headers:{'content-length':String(3*1024*1024)}}),
    ()=>new Response('x'.repeat(2*1024*1024+1)),
  ];
  for(const fetchImpl of cases) await assert.rejects(vk.recognizeDocument(input(),{fetchImpl}),fails('ONBOARDING_OCR_RESPONSE',502));
  await assert.rejects(vk.recognizeDocument(input('snils'),{fetchImpl:async()=>response({text:'x'.repeat(100001)})}),fails('ONBOARDING_OCR_RESPONSE',502));
  await assert.rejects(vk.recognizeDocument(input(),{fetchImpl:async()=>response({labels:{}})}),fails('ONBOARDING_OCR_NO_TEXT',422));
  await assert.rejects(vk.recognizeDocument(input('other'),{fetchImpl:async()=>response({text:' '})}),fails('ONBOARDING_OCR_NO_TEXT',422));
});

test('timeout covers connection and response reading, aborts fetch and never retries',async t=>{
  setup(t);let signal,calls=0;
  await assert.rejects(vk.recognizeDocument(input(),{timeoutMs:10,fetchImpl:async(_,request)=>{calls++;signal=request.signal;return new Promise(()=>{});}}),fails('ONBOARDING_OCR_TIMEOUT',504));
  assert.equal(signal.aborted,true);assert.equal(calls,1);
  await assert.rejects(vk.recognizeDocument(input(),{timeoutMs:10,fetchImpl:async(_,request)=>new Response(new ReadableStream({start(controller){
    request.signal.addEventListener('abort',()=>controller.error(new Error('aborted')));
  }}))}),fails('ONBOARDING_OCR_TIMEOUT',504));
});
