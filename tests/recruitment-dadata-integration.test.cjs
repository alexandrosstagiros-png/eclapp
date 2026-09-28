'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {createTestServer}=require('./local-test-server.cjs');
test('DaData lookup checks current access before external calls and hides provider secrets', {timeout:240000},async t=>{
  const fixture=await createTestServer();t.after(()=>fixture.close());
  const {ids,adminPool:db,devLogin,request}=fixture;
  const secret='synthetic-dadata-integration-secret';
  process.env.DADATA_API_KEY=secret;
  const original=global.fetch;let calls=0;
  global.fetch=async(url,options)=>{
    if(!String(url).startsWith('https://suggestions.dadata.ru/'))return original(url,options);
    calls++;assert.equal(options.headers.Authorization,`Token ${secret}`);
    return new Response(JSON.stringify({suggestions:[{value:'ООО Тест',data:{type:'LEGAL',inn:'7707083893',kpp:'773601001',ogrn:'1027700132195',state:{status:'ACTIVE'},name:{full_with_opf:'ООО Тест'}}}]}));
  };
  t.after(()=>{global.fetch=original;delete process.env.DADATA_API_KEY;});
  async function actor(role,pd=true){const id=randomUUID();await db.query('INSERT INTO users(id,display_name,role,active,approved) VALUES($1,$2,$3,true,true)',[id,'Synthetic lookup actor',role]);await db.query('INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id,personal_data_visible) VALUES($1,$2,$3,$4,$5,$6)',[id,ids.legal,ids.region,ids.project,ids.scope,pd]);return {id,...await devLogin(id)};}
  const recruiter=await actor('recruiter'),external=await actor('external_recruiter'),noPD=await actor('recruiter',false);
  const body={responsibilityScopeId:ids.scope,query:'7707083893'};
  const lookup=(who,patch={})=>request('POST','/recruitment/contracts/party-lookup',{...body,...patch},who?.accessToken);
  assert.equal((await lookup(null)).status,401);
  for(const who of [external,noPD])assert.equal((await lookup(who)).status,403);
  assert.equal((await lookup(recruiter,{responsibilityScopeId:randomUUID()})).status,403);
  assert.equal(calls,0);
  assert.equal((await lookup(recruiter,{query:'https://example.com'})).status,400);
  assert.equal(calls,0);
  const result=await lookup(recruiter);assert.equal(result.status,200,JSON.stringify(result.body));
  assert.equal(result.body.suggestions[0].values.carrier_inn,'7707083893');
  assert.doesNotMatch(JSON.stringify(result.body),/synthetic-dadata-integration-secret/);
  await db.query('UPDATE access_grants SET personal_data_visible=false WHERE user_id=$1',[recruiter.id]);
  assert.equal((await lookup(recruiter)).status,403);assert.equal(calls,1);
});
