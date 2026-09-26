'use strict';

// Service-level regression tests use synthetic credentials and a transactional fake.
// A separate PostgreSQL integration suite covers actual locking and constraints.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHmac, createHash, randomUUID } = require('node:crypto');
const { createRequire } = require('node:module');
const apiRequire = createRequire(require('node:path').resolve(__dirname, '../recovered/package.json'));
apiRequire('reflect-metadata');
const { AuthService } = require('../recovered/apps/api/src/modules/identity-access/application/auth.service');
const { readConfig } = require('../recovered/apps/api/src/platform/config');
const { MaxAuthAdapter } = require('../recovered/apps/api/src/modules/identity-access/infrastructure/max-auth.adapter');
const { ChannelAuthError } = require('../recovered/apps/api/src/modules/identity-access/domain/channel-auth');
const BOT = 'synthetic-max-unit-test-token';
const TG_BOT = 'synthetic-telegram-unit-test-token';
const ADMIN = '10000000-0000-4000-8000-000000000005';
const USER = '10000000-0000-4000-8000-000000000001';
const OTHER = '10000000-0000-4000-8000-000000000002';
const SCOPE = {legalEntityId:'entity',regionId:'region',projectId:'project',responsibilityScopeId:'scope',financeVisible:true,personalDataVisible:true};
const digest = value => createHash('sha256').update(value).digest('hex');
function signed(id=123, {bot=BOT,age=0,query=randomUUID()}={}) {
  const params = new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)-age),query_id:query,user:JSON.stringify({id,first_name:'Untrusted name',role:'access_admin'})});
  const canonical = [...params].sort(([a],[b])=>a.localeCompare(b)).map(([key,value])=>`${key}=${value}`).join('\n');
  const secret = createHmac('sha256','WebAppData').update(bot).digest();
  params.set('hash',createHmac('sha256',secret).update(canonical).digest('hex'));
  return params.toString();
}
function fixture() {
  let state = {users:{}, grants:{},bindings:{},invitations:[],maxInvitations:[],sessions:[],replays:[],audit:[]};
  for (const [id,role] of [[ADMIN,'access_admin'],[USER,'driver'],[OTHER,'dispatcher']]) {
    state.users[id]={id,role,active:true,approved:true,auth_version:1,display_name:`Local ${role}`};
    state.grants[id]=[structuredClone(SCOPE)];
  }
  const actor = {id:ADMIN,sessionId:'admin-session',authVersion:1,channel:'telegram',role:'access_admin',grants:[SCOPE]};
  state.sessions.push({id:actor.sessionId,userId:ADMIN,authVersion:1,channel:'telegram',expiresAt:new Date(Date.now()+3600000)});
  const activeInvitation = (invitations,hash) => invitations.find(i=>i.token_hash===hash&&!i.consumed_at&&i.expires_at>Date.now());
  const invalidate = (invitations,id) => {for(const i of invitations) if(i.user_id===id&&!i.consumed_at)i.expires_at=Date.now();};
  const insert = (invitations,data,provider) => invitations.push({id:data.id,user_id:data.userId,[`${provider}_user_id`]:data[`${provider}UserId`],token_hash:data.tokenHash,expires_at:data.expiresAt,created_by:data.createdBy});
  const currentActor = session => {
    const user=state.users[session?.userId];
    if(!session||session.revoked||session.expiresAt<=Date.now()||!user?.active||!user.approved||user.auth_version!==session.authVersion) return;
    return {id:user.id,displayName:user.display_name,role:user.role,sessionId:session.id,authVersion:user.auth_version,channel:session.channel,grants:state.grants[user.id]};
  };
  const repository = {
    async lockUsers(){},
    async user(client,id){return state.users[id];},
    async grants(id){return state.grants[id]||[];},
    async channelUser(client,id,provider='telegram'){return state.bindings[`${provider}:${id}`];},
    async channelForUser(client,id,provider='telegram'){return Object.entries(state.bindings).find(([key,value])=>key.startsWith(`${provider}:`)&&value===id)?.[0].split(':')[1];},
    async bindChannel(client,userId,id,provider='telegram'){
      if(await this.channelUser(client,id,provider)||await this.channelForUser(client,userId,provider)) return false;
      state.bindings[`${provider}:${id}`]=userId; return true;
    },
    async consumeReplay(client,hash){if(state.replays.includes(hash))return false;state.replays.push(hash);return true;},
    async invitation(client,hash){return activeInvitation(state.invitations,hash);},
    async maxInvitation(client,hash){return activeInvitation(state.maxInvitations,hash);},
    async consumeInvitation(client,id){state.invitations.find(i=>i.id===id).consumed_at=new Date();},
    async consumeMaxInvitation(client,id){state.maxInvitations.find(i=>i.id===id).consumed_at=new Date();},
    async invalidateInvitations(client,id){invalidate(state.invitations,id);},
    async invalidateMaxInvitations(client,id){invalidate(state.maxInvitations,id);},
    async insertInvitation(client,data){insert(state.invitations,data,'telegram');},
    async insertMaxInvitation(client,data){insert(state.maxInvitations,data,'max');},
    async insertSession(client,data){state.sessions.push(data);},
    async actorBySession(client,id){return currentActor(state.sessions.find(s=>s.id===id));},
    async actorByToken(hash){return currentActor(state.sessions.find(s=>s.tokenHash===hash));},
    async revokeSession(client,id){state.sessions.find(s=>s.id===id).revoked=true;},
    async revokeUser(client,id){state.users[id].active=false;state.users[id].auth_version++;for(const s of state.sessions)if(s.userId===id)s.revoked=true;invalidate(state.invitations,id);invalidate(state.maxInvitations,id);},
  };
  const database = {async transaction(fn){const before=structuredClone(state);try{return await fn({});}catch(e){state=before;throw e;}}};
  const config = {value:{nodeEnv:'production',maxBotToken:BOT,maxAuthMaxAgeSeconds:300,telegramBotToken:TG_BOT,telegramAuthMaxAgeSeconds:300,sessionTtlSeconds:1800}};
  const audit = {async append(client,event){state.audit.push(event);}};
  return {service:new AuthService(database,config,audit,repository),actor,config,repository,get state(){return state;}};
}
const status = expected => error => error.getStatus?.()===expected;

test('MAX invalid credentials retain common channel error classification',()=>{
  assert.throws(()=>new MaxAuthAdapter(BOT).verify('invalid'),ChannelAuthError);
});
test('MAX config defaults to 300s and rejects unsafe lifetime',()=>{
  const env={NODE_ENV:'production',DATABASE_URL:'postgres://transport_app:test@127.0.0.1/test'};
  assert.equal(readConfig(env).maxAuthMaxAgeSeconds,300);
  for(const value of ['0','59','601','3601','NaN'])assert.throws(()=>readConfig({...env,MAX_AUTH_MAX_AGE_SECONDS:value}),/Invalid MAX_AUTH_MAX_AGE_SECONDS/);
});
test('linked MAX login uses local role/name and the independent identity namespace',async()=>{
  const f=fixture();f.state.bindings['telegram:123']=OTHER;f.state.bindings['max:123']=USER;
  const session=await f.service.maxLogin(signed(),undefined,'test');
  assert.equal(session.actor.id,USER);assert.equal(session.actor.role,'driver');assert.equal(session.actor.displayName,'Local driver');assert.equal(session.actor.channel,'max');
  assert.deepEqual(await f.service.authenticate(session.accessToken),session.actor);
  assert.equal(f.state.bindings['telegram:123'],OTHER);
});
test('Telegram login still uses Telegram identity, session and replay semantics',async()=>{
  const f=fixture();f.state.bindings['telegram:123']=OTHER;f.state.bindings['max:123']=USER;
  const payload=signed(123,{bot:TG_BOT});
  const result=await f.service.telegramLogin(payload,undefined,'test');
  assert.equal(result.actor.id,OTHER);assert.equal(result.actor.channel,'telegram');
  await assert.rejects(f.service.telegramLogin(payload,undefined,'test'),status(401));
});
test('a Telegram binding never grants MAX login; failed attempt does not consume replay',async()=>{
  const f=fixture();f.state.bindings['telegram:123']=USER;const payload=signed();
  await assert.rejects(f.service.maxLogin(payload,undefined,'test'),status(401));
  assert.equal(f.state.replays.length,0);assert.equal(f.state.sessions.length,1);
  const invite=await f.service.createMaxInvitation(f.actor,USER,'123','test');
  const session=await f.service.maxLogin(payload,invite.invitationToken,'test');
  assert.equal(session.actor.id,USER);assert.ok(f.state.maxInvitations[0].consumed_at);
});
test('one successful MAX exchange issues one session; replay is rejected',async()=>{
  const f=fixture();f.state.bindings['max:123']=USER;const payload=signed();
  await f.service.maxLogin(payload,undefined,'test');
  await assert.rejects(f.service.maxLogin(payload,undefined,'test'),status(401));
  assert.equal(f.state.sessions.length,2);assert.equal(f.state.replays.length,1);
});
test('one-time MAX invite is locked to the expected external ID',async()=>{
  const f=fixture();const invite=await f.service.createMaxInvitation(f.actor,USER,'123','test');
  await assert.rejects(f.service.maxLogin(signed(124),invite.invitationToken,'test'),status(401));
  assert.equal(f.state.replays.length,0);assert.equal(Object.keys(f.state.bindings).length,0);
  await f.service.maxLogin(signed(123),invite.invitationToken,'test');
  delete f.state.bindings['max:123'];
  await assert.rejects(f.service.maxLogin(signed(123),invite.invitationToken,'test'),status(401));
});
test('Telegram invitation cannot bind a MAX identity',async()=>{
  const f=fixture();const invite=await f.service.createInvitation(f.actor,USER,'123','test');
  await assert.rejects(f.service.maxLogin(signed(),invite.invitationToken,'test'),status(401));
  assert.equal(f.state.invitations[0].consumed_at,undefined);
});
test('MAX invitation replacement preserves Telegram invitation and expires prior MAX token',async()=>{
  const f=fixture();const tg=await f.service.createInvitation(f.actor,USER,'123','test');
  const old=await f.service.createMaxInvitation(f.actor,USER,'123','test');
  const latest=await f.service.createMaxInvitation(f.actor,USER,'124','test');
  assert.equal(f.state.invitations[0].token_hash,digest(tg.invitationToken));assert.ok(f.state.invitations[0].expires_at>Date.now());
  await assert.rejects(f.service.maxLogin(signed(),old.invitationToken,'test'),status(401));
  assert.equal((await f.service.maxLogin(signed(124),latest.invitationToken,'test')).actor.id,USER);
});
test('signature failures become HTTP 401 and failed audit excludes credentials',async()=>{
  const f=fixture();const payload=signed(123,{bot:'wrong-bot'});
  await assert.rejects(f.service.maxLogin(payload,'A'.repeat(43),'correlation'),status(401));
  assert.deepEqual(f.state.audit,[{action:'auth.login_failed',entityType:'authentication',channel:'max',correlationId:'correlation',metadata:{reasonCode:'credentials_rejected'}}]);
  assert.equal(f.state.replays.length,0);
});
test('expired MAX payload is rejected',async()=>{
  const f=fixture();f.state.bindings['max:123']=USER;
  await assert.rejects(f.service.maxLogin(signed(123,{age:301}),undefined,'test'),status(401));
  assert.equal(f.state.sessions.length,1);
});
for(const [field,value] of [['active',false],['approved',false],['role','unknown']]){
  test(`MAX login rejects user ${field}=${value}`,async()=>{
    const f=fixture();f.state.bindings['max:123']=USER;f.state.users[USER][field]=value;
    await assert.rejects(f.service.maxLogin(signed(),undefined,'test'),status(401));
    assert.equal(f.state.replays.length,0);
  });
}
test('MAX login rejects a locally approved user without access scopes',async()=>{
  const f=fixture();f.state.bindings['max:123']=USER;f.state.grants[USER]=[];
  await assert.rejects(f.service.maxLogin(signed(),undefined,'test'),status(401));
});
test('MAX invitation requires current administrator role and complete target scope',async()=>{
  for(const mutation of [f=>f.state.users[ADMIN].role='driver',f=>f.state.grants[USER]=[],f=>f.state.grants[USER].push({...SCOPE,projectId:'outside'}),f=>f.state.grants[ADMIN][0].financeVisible=false]){
    const f=fixture();mutation(f);
    await assert.rejects(f.service.createMaxInvitation(f.actor,USER,'123','test'),status(403));
    assert.equal(f.state.maxInvitations.length,0);
  }
});
test('MAX invitation rejects an existing MAX binding but permits a Telegram-linked employee',async()=>{
  const f=fixture();f.state.bindings['telegram:123']=USER;
  await f.service.createMaxInvitation(f.actor,USER,'123','test');
  f.state.bindings['max:123']=OTHER;
  await assert.rejects(f.service.createMaxInvitation(f.actor,USER,'123','test'),status(403));
  delete f.state.bindings['max:123'];f.state.bindings['max:124']=USER;
  await assert.rejects(f.service.createMaxInvitation(f.actor,USER,'123','test'),status(403));
});
test('MAX invitation only accepts canonical positive safe integer IDs',async()=>{
  const f=fixture();
  for(const id of ['0','01','-1','1.2','1e3','9007199254740992','123a'])await assert.rejects(f.service.createMaxInvitation(f.actor,USER,id,'test'),status(400));
  assert.equal((await f.service.createMaxInvitation(f.actor,USER,'9007199254740991','test')).userId,USER);
});
test('disabling MAX denies authentication and existing MAX sessions',async()=>{
  const f=fixture();f.state.bindings['max:123']=USER;
  const session=await f.service.maxLogin(signed(),undefined,'test');f.config.value.maxBotToken=undefined;
  await assert.rejects(f.service.authenticate(session.accessToken),status(401));
  await assert.rejects(f.service.maxLogin(signed(),undefined,'test'),status(503));
  assert.equal(f.state.audit.at(-1).metadata.reasonCode,'channel_unavailable');
});
test('logout and employee revoke invalidate MAX sessions; revoke expires both invitations',async()=>{
  const f=fixture();f.state.bindings['max:123']=USER;
  const session=await f.service.maxLogin(signed(),undefined,'test');
  await f.service.logout(session.actor,'test');await assert.rejects(f.service.authenticate(session.accessToken),status(401));
  const next=await f.service.maxLogin(signed(),undefined,'test');
  await f.service.createInvitation(f.actor,USER,'321','test');
  delete f.state.bindings['max:123'];await f.service.createMaxInvitation(f.actor,USER,'123','test');f.state.bindings['max:123']=USER;
  await f.service.revokeUser(f.actor,USER,'access_review','test');
  await assert.rejects(f.service.authenticate(next.accessToken),status(401));
  await assert.rejects(f.service.maxLogin(signed(),undefined,'test'),status(401));
  assert.ok(f.state.invitations[0].expires_at<=Date.now());assert.ok(f.state.maxInvitations[0].expires_at<=Date.now());
});
