'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {createTestServer}=require('./local-test-server.cjs');
const {jpeg,paddedJpeg}=require('./team-profile-fixture.cjs');
test('profiles preserve self-only edits, versioned retries, contact privacy and fresh session authority',{timeout:180000},async t=>{
  const f=await createTestServer();t.after(()=>f.close());const{ids,adminPool:db}=f;
  const admin=await f.devLogin(ids.admin),employee=await f.devLogin(ids.dispatcher),driver=await f.devLogin(ids.drivers[0]);
  const call=(method,path,body,session=employee)=>f.request(method,path,body,session.accessToken);
  const ok=r=>{assert.ok([200,201].includes(r.status),`${r.status}: ${JSON.stringify(r.body)}`);return r.body;};
  const scoped=path=>`${path}?responsibilityScopeId=${ids.scope}`;
  const self=async(session=employee)=>ok(await call('GET','/profile',undefined,session));
  const save=(body,session=employee)=>call('PUT','/profile',body,session);
  const operation=(version,patch={})=>({operationId:randomUUID(),version,...patch});
  const original=operation(0,{email:'profile@example.test',phone:'+7 (900) 123-45-67',contacts:'Telegram: synthetic\nВнутренний: 42',birthDate:'1990-02-28',photo:{contentBase64:paddedJpeg().toString('base64')}});
  let profile;

  await t.test('every authenticated role has its own profile without changing login identity or accessing Team',async()=>{
    const before=(await db.query('SELECT * FROM phone_credentials ORDER BY user_id')).rows;
    const initial=await self();assert.equal(initial.version,0);assert.equal(initial.avatarVersion,0);assert.equal(initial.avatarDataUrl,null);assert.equal(initial.userId,ids.dispatcher);
    profile=ok(await save(original));assert.equal(profile.version,1);assert.equal(profile.avatarVersion,1);assert.equal(profile.email,original.email);assert.equal(profile.phone,original.phone);assert.ok(profile.avatarDataUrl.endsWith(original.photo.contentBase64));assert.equal(profile.canEdit,true);
    assert.deepEqual((await db.query('SELECT * FROM phone_credentials ORDER BY user_id')).rows,before,'contact phone cannot change login credentials');
    assert.equal(ok(await save(operation(0,{contacts:'Синтетический водитель'}),driver)).userId,ids.drivers[0]);
    assert.equal((await call('GET',scoped('/team/profile-directory'),undefined,driver)).status,403);
    for(const role of ['external_recruiter','tender_specialist']){
      const id=randomUUID();await db.query("INSERT INTO users(id,display_name,role,active,approved) VALUES($1,'Synthetic profile role',$2,true,true)",[id,role]);
      const session=await f.devLogin(id);assert.equal((await self(session)).userId,id);assert.equal(ok(await save(operation(0,{contacts:'Self contact'}),session)).version,1);
      if(role==='external_recruiter')assert.equal((await call('GET',scoped('/team/profile-directory'),undefined,session)).status,403);
    }
    assert.equal((await f.request('GET','/profile')).status,401);
  });

  await t.test('operation retries never overwrite later edits and concurrent expected versions have one winner',async()=>{
    assert.deepEqual(ok(await save(original)),profile);
    const second=operation(profile.version,{contacts:'Исправленные контакты'});profile=ok(await save(second));assert.equal(profile.avatarVersion,1);
    assert.deepEqual(ok(await save(original)),profile,'old operation replay returns latest profile');
    assert.equal((await save({...original,email:'different@example.test'})).status,409);
    assert.equal((await save(operation(1,{contacts:'stale'}))).status,409);
    const results=await Promise.all([save(operation(profile.version,{email:'first@example.test'})),save(operation(profile.version,{email:'second@example.test'}))]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);profile=ok(results.find(r=>r.status===200));
    assert.equal((await save(operation(profile.version,{userId:ids.admin}))).status,400);
    assert.equal((await save({...original,version:0},admin)).status,409,'operation identifiers cannot be reused by another profile owner');
    await f.restartApi();assert.deepEqual(await self(),profile);assert.deepEqual(ok(await save(original)),profile);
  });

  await t.test('avatar omission preserves bytes, null removes them and avatar cache version changes only with photo',async()=>{
    profile=ok(await save(operation(profile.version,{birthDate:'',email:null})));assert.equal(Object.hasOwn(profile,'birthDate'),false);assert.equal(profile.birthdayDay,null);assert.equal(profile.birthdayMonth,null);assert.equal(profile.email,null);assert.equal(profile.avatarVersion,1);assert.ok(profile.avatarDataUrl);
    profile=ok(await save(operation(profile.version,{photo:{contentBase64:jpeg.toString('base64')}})));assert.equal(profile.avatarVersion,2);
    const remove=operation(profile.version,{photo:null});profile=ok(await save(remove));assert.equal(profile.avatarVersion,3);assert.equal(profile.avatarDataUrl,null);
    assert.deepEqual(ok(await save(remove)),profile);assert.deepEqual(ok(await save(operation(profile.version,{photo:null}))),profile,'removing an absent image is a no-op');
    profile=ok(await save(operation(profile.version,{photo:{contentBase64:jpeg.toString('base64')}})));assert.equal(profile.avatarVersion,4);
    const malformed=operation(profile.version,{photo:{contentBase64:Buffer.from('not jpeg').toString('base64')}});assert.equal((await save(malformed)).status,400);assert.deepEqual(await self(),profile);
  });

  await t.test('directory, contact and avatar reads require current scoped personal-data permission or self',async()=>{
    await db.query('UPDATE access_grants SET personal_data_visible=true WHERE user_id=$1 AND responsibility_scope_id=$2',[ids.admin,ids.scope]);
    const colleague=ok(await call('GET',scoped(`/team/profiles/${ids.dispatcher}`),undefined,admin));assert.equal(colleague.phone,original.phone);assert.equal(colleague.avatarVersion,4);assert.equal(colleague.canEdit,false);
    const avatar=ok(await call('GET',scoped(`/team/profiles/${ids.dispatcher}/avatar`),undefined,admin));assert.deepEqual(Object.keys(avatar).sort(),['avatarDataUrl','avatarVersion','userId']);assert.equal(avatar.avatarDataUrl,profile.avatarDataUrl);
    const directory=ok(await call('GET',scoped('/team/profile-directory'),undefined,admin));assert.equal(directory.profiles.find(p=>p.userId===ids.dispatcher).avatarVersion,4);assert.equal(JSON.stringify(directory).includes('base64'),false);assert.equal(JSON.stringify(directory).includes(original.phone),false);
    assert.equal(directory.profiles.some(p=>p.userId===ids.drivers[0]),false,'drivers are outside the Team directory');
    await db.query('UPDATE access_grants SET personal_data_visible=false WHERE user_id=$1 AND responsibility_scope_id=$2',[ids.admin,ids.scope]);
    assert.equal((await call('GET',scoped(`/team/profiles/${ids.dispatcher}`),undefined,admin)).status,404);assert.equal((await call('GET',scoped(`/team/profiles/${ids.dispatcher}/avatar`),undefined,admin)).status,404);
    assert.deepEqual(ok(await call('GET',scoped('/team/profile-directory'),undefined,admin)).profiles.map(p=>p.userId),[ids.admin]);
    await db.query('UPDATE access_grants SET personal_data_visible=false WHERE user_id=$1 AND responsibility_scope_id=$2',[ids.dispatcher,ids.scope]);
    assert.equal(ok(await call('GET',scoped(`/team/profiles/${ids.dispatcher}`))).canEdit,true,'self remains visible without a personal-data grant');
    assert.equal((await call('GET',scoped(`/team/profiles/${ids.admin}`))).status,404);
    assert.equal((await call('GET',`/team/profiles/${ids.dispatcher}?responsibilityScopeId=${randomUUID()}`)).status,403);
  });

  await t.test('audit contains field names only, immutable operation hashes, and revoked sessions cannot write',async()=>{
    const events=(await db.query("SELECT payload FROM audit_events WHERE payload->>'action'='profile.updated' AND payload->>'entityId'=$1 ORDER BY sequence",[ids.dispatcher])).rows;
    assert.ok(events.length>=5);assert.ok(events.every(r=>Array.isArray(r.payload.metadata.changedFields)));const serialized=JSON.stringify(events);for(const value of [original.email,original.phone,original.contacts,original.birthDate,original.photo.contentBase64])assert.equal(serialized.includes(value),false);
    const ledger=(await db.query('SELECT * FROM user_profile_operations WHERE id=$1',[original.operationId])).rows[0];assert.match(ledger.payload_sha256,/^[0-9a-f]{64}$/);await assert.rejects(db.query('UPDATE user_profile_operations SET payload_sha256=payload_sha256 WHERE id=$1',[original.operationId]));
    await db.query('UPDATE access_grants SET personal_data_visible=true WHERE user_id=$1 AND responsibility_scope_id=$2',[ids.admin,ids.scope]);
    const child=ok(await call('POST','/auth/impersonate',{userId:ids.dispatcher},admin));assert.equal((await self(child)).userId,ids.dispatcher);
    await db.query('UPDATE users SET auth_version=auth_version+1 WHERE id=$1',[ids.admin]);assert.equal((await call('GET','/profile',undefined,child)).status,401);assert.equal((await save(operation(profile.version,{contacts:'rejected'}),child)).status,401);
    await db.query('DELETE FROM access_grants WHERE user_id=$1 AND responsibility_scope_id=$2',[ids.dispatcher,ids.scope]);assert.equal((await call('GET',scoped('/team/profile-directory'))).status,403);assert.equal((await self()).userId,ids.dispatcher,'self profile does not require a Team scope');
    await db.query('UPDATE users SET active=false WHERE id=$1',[ids.dispatcher]);assert.equal((await call('GET','/profile')).status,401);assert.equal((await save(operation(profile.version,{contacts:'rejected'}))).status,401);
  });
});
