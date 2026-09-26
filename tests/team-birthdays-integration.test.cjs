'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {createTestServer}=require('./local-test-server.cjs');
const {moscowToday}=require('../recovered/apps/api/src/modules/team/team-birthdays');
test('birthdays protect birth years, enforce current admin scope and persist individual annual congratulations',{timeout:180000},async t=>{
  const f=await createTestServer();t.after(()=>f.close());const {ids,adminPool:db}=f;
  const today=moscowToday(),tomorrow=new Date(Date.parse(today)+86400000).toISOString().slice(0,10),yesterday=new Date(Date.parse(today)-86400000).toISOString().slice(0,10);
  const birthToday=`1988-${today.slice(5)}`,birthTomorrow=`1992-${tomorrow.slice(5)}`;
  const admin=await f.devLogin(ids.admin),staff=await f.devLogin(ids.dispatcher),driver=await f.devLogin(ids.drivers[0]);
  const otherAdminId=randomUUID(),externalId=randomUUID(),inactiveId=randomUUID(),unapprovedId=randomUUID(),foreignId=randomUUID(),extraScope=randomUUID();
  const foreignLegal=randomUUID(),foreignProject=randomUUID(),foreignScope=randomUUID();
  await db.query('UPDATE access_grants SET personal_data_visible=true WHERE user_id=ANY($1::uuid[])',[[ids.admin,ids.dispatcher]]);
  await db.query('INSERT INTO responsibility_scopes(id,project_id,name) VALUES($1,$2,$3)',[extraScope,ids.project,'Synthetic second work scope']);
  await db.query('INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id,personal_data_visible) VALUES($1,$2,$3,$4,$5,true)',[ids.dispatcher,ids.legal,ids.region,ids.project,extraScope]);
  for(const[id,name,role,active,approved]of [[otherAdminId,'Second administrator','access_admin',true,true],[externalId,'External recruiter','external_recruiter',true,true],[inactiveId,'Inactive employee','dispatcher',false,true],[unapprovedId,'Unapproved employee','dispatcher',true,false]]){
    await db.query('INSERT INTO users(id,display_name,role,active,approved) VALUES($1,$2,$3,$4,$5)',[id,name,role,active,approved]);
    await db.query('INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id,personal_data_visible) VALUES($1,$2,$3,$4,$5,true)',[id,ids.legal,ids.region,ids.project,ids.scope]);
  }
  await db.query('INSERT INTO legal_entities(id,name) VALUES($1,$2)',[foreignLegal,'Foreign synthetic company']);
  await db.query('INSERT INTO projects(id,name,legal_entity_id,region_id) VALUES($1,$2,$3,$4)',[foreignProject,'Foreign project',foreignLegal,ids.region]);
  await db.query('INSERT INTO responsibility_scopes(id,project_id,name) VALUES($1,$2,$3)',[foreignScope,foreignProject,'Foreign scope']);
  await db.query('INSERT INTO users(id,display_name,role,active,approved) VALUES($1,$2,$3,true,true)',[foreignId,'Foreign employee','dispatcher']);
  await db.query('INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id) VALUES($1,$2,$3,$4,$5)',[foreignId,foreignLegal,ids.region,foreignProject,foreignScope]);
  for(const[id,date]of [[ids.admin,'1980-01-01'],[ids.dispatcher,'1990-02-28'],[ids.drivers[0],birthToday],[ids.drivers[1],birthTomorrow],[otherAdminId,'1982-12-31'],[externalId,birthToday],[inactiveId,birthToday],[unapprovedId,birthToday],[foreignId,birthToday]])await db.query('INSERT INTO user_profiles(user_id,birth_date) VALUES($1,$2)',[id,date]);
  const secondAdmin=await f.devLogin(otherAdminId),external=await f.devLogin(externalId);
  const scoped=route=>`${route}?responsibilityScopeId=${ids.scope}`;
  const call=(method,route,body,session=admin)=>f.request(method,route,body,session.accessToken);
  const ok=result=>{assert.equal(result.status,200,JSON.stringify(result.body));return result.body;};
  const list=async(session=admin)=>ok(await call('GET',scoped('/team/birthdays'),undefined,session));
  const mark=(id=ids.drivers[0],date=today,congratulated=true,session=admin)=>call('PUT',scoped(`/team/birthdays/${id}/congratulation`),{occurrenceDate:date,congratulated},session);
  const setDate=(id,birthDate,version,session=admin)=>call('PUT',scoped(`/team/birthdays/${id}/date`),{birthDate,version},session);
  const privateBirthday=(profile,day,month)=>{assert.equal(Object.hasOwn(profile,'birthDate'),false);assert.equal(profile.birthdayDay,day);assert.equal(profile.birthdayMonth,month);};

  await t.test('profile GET and save expose the year only to a fresh nonimpersonating administrator',async()=>{
    const colleague=ok(await call('GET',scoped(`/team/profiles/${ids.dispatcher}`)));assert.equal(colleague.birthDate,'1990-02-28');
    privateBirthday(ok(await call('GET',scoped(`/team/profiles/${ids.dispatcher}`),undefined,staff)),28,2);
    privateBirthday(ok(await call('GET','/profile',undefined,staff)),28,2);
    const saved=ok(await call('PUT','/profile',{operationId:randomUUID(),version:1,contacts:'Preserve hidden year'},staff));privateBirthday(saved,28,2);
    assert.equal((await db.query('SELECT birth_date::text AS date FROM user_profiles WHERE user_id=$1',[ids.dispatcher])).rows[0].date,'1990-02-28');
    const write={operationId:randomUUID(),version:saved.version,birthDate:'1991-03-07'};
    privateBirthday(ok(await call('PUT','/profile',write,staff)),7,3);privateBirthday(ok(await call('PUT','/profile',write,staff)),7,3);
    assert.equal(ok(await call('GET','/profile')).birthDate,'1980-01-01');
    privateBirthday(ok(await call('GET','/profile',undefined,driver)),Number(today.slice(8)),Number(today.slice(5,7)));
    const impersonated=ok(await call('POST','/auth/impersonate',{userId:otherAdminId}));
    privateBirthday(ok(await call('GET','/profile',undefined,impersonated)),31,12);
    privateBirthday(ok(await call('GET',scoped(`/team/profiles/${ids.dispatcher}`),undefined,impersonated)),7,3);
    assert.equal((await call('GET','/team/birthdays',undefined,impersonated)).status,403);
    assert.equal((await mark(ids.drivers[0],today,true,impersonated)).status,403);
    assert.equal((await setDate(ids.dispatcher,'1991-03-07',3,impersonated)).status,403);
  });

  await t.test('reminders cover scoped active approved employees including drivers, without duplicate grants',async()=>{
    const result=await list();assert.equal(result.today,today);assert.equal(result.timeZone,'Europe/Moscow');
    assert.deepEqual(new Set(result.employees.map(row=>row.userId)),new Set([ids.admin,ids.dispatcher,...ids.drivers,otherAdminId]));
    assert.equal(result.employees.length,5);assert.equal(result.missingBirthDateCount,2);
    assert.deepEqual(new Set(result.employeesWithoutBirthday.map(row=>row.userId)),new Set([ids.specialist,ids.mechanic]));
    assert.ok(result.employeesWithoutBirthday.every(row=>row.profileVersion===0&&row.birthDate===null));
    assert.equal(result.employees.find(row=>row.userId===ids.dispatcher).birthDate,'1991-03-07');
    const current=result.employees.find(row=>row.userId===ids.drivers[0]);assert.equal(current.nextBirthday,today);assert.equal(current.daysUntil,0);assert.equal(current.congratulated,false);
    assert.equal(result.employees.find(row=>row.userId===ids.drivers[1]).daysUntil,1);
    assert.deepEqual(result.employees.map(row=>row.daysUntil),result.employees.map(row=>row.daysUntil).sort((a,b)=>a-b));
    const headers=await fetch(`${f.origin}/api/v1/team/birthdays`,{headers:{Authorization:`Bearer ${admin.accessToken}`}});assert.equal(headers.headers.get('cache-control'),'no-store');await headers.arrayBuffer();
    assert.equal((await call('GET',`/team/birthdays?responsibilityScopeId=${foreignScope}`)).status,403);
    assert.equal((await mark(foreignId)).status,404);assert.equal((await mark(externalId)).status,404);assert.equal((await mark(inactiveId)).status,404);assert.equal((await mark(unapprovedId)).status,404);
    assert.equal((await mark(ids.mechanic)).status,404);
    for(const session of [staff,driver,external]){assert.equal((await call('GET','/team/birthdays',undefined,session)).status,403);assert.equal((await mark(ids.drivers[0],today,true,session)).status,403);assert.equal((await setDate(ids.drivers[0],'1990-01-01',1,session)).status,403);}
    assert.equal((await f.request('GET','/team/birthdays')).status,401);
  });

  await t.test('administrator fills, corrects and clears dates with current versions while preserving contact data and hidden birth years',async()=>{
    const first=ok(await setDate(ids.specialist,'1984-06-12',0));assert.equal(first.profileVersion,1);assert.equal(first.birthDate,'1984-06-12');
    assert.equal((await list()).missingBirthDateCount,1);assert.equal((await list()).employees.find(row=>row.userId===ids.specialist).profileVersion,1);
    const specialistSession=await f.devLogin(ids.specialist);privateBirthday(ok(await call('GET','/profile',undefined,specialistSession)),12,6);
    assert.equal((await setDate(ids.specialist,'1985-06-12',0)).status,409);
    const before=(await db.query('SELECT * FROM user_profiles WHERE user_id=$1',[ids.dispatcher])).rows[0];
    const changed=ok(await setDate(ids.dispatcher,'1993-05-09',before.version));assert.equal(changed.profileVersion,before.version+1);
    const after=(await db.query('SELECT * FROM user_profiles WHERE user_id=$1',[ids.dispatcher])).rows[0];
    for(const key of ['email','phone','contacts','avatar_content','avatar_sha256','avatar_version'])assert.deepEqual(after[key],before[key]);
    privateBirthday(ok(await call('GET','/profile',undefined,staff)),9,5);
    assert.deepEqual(ok(await setDate(ids.dispatcher,'1993-05-09',changed.profileVersion)),changed);
    assert.deepEqual((await db.query('SELECT * FROM user_profiles WHERE user_id=$1',[ids.dispatcher])).rows[0],after,'same date and version is a no-op');
    const results=await Promise.all([setDate(ids.specialist,'1986-04-01',1),setDate(ids.specialist,'1987-04-02',1)]);assert.deepEqual(results.map(row=>row.status).sort(),[200,409]);
    assert.equal(ok(await setDate(ids.specialist,null,2)).profileVersion,3);assert.equal((await list()).missingBirthDateCount,2);
    privateBirthday(ok(await call('GET','/profile',undefined,specialistSession)),null,null);
    assert.equal(ok(await setDate(ids.mechanic,null,0)).profileVersion,0,'clearing an absent date does not create an empty profile');
    assert.equal((await setDate(ids.mechanic,tomorrow,0)).status,400);assert.equal((await setDate(ids.mechanic,'1800-01-01',0)).status,400);
    assert.equal((await setDate(foreignId,'1990-01-01',1)).status,404);assert.equal((await setDate(externalId,'1990-01-01',1)).status,404);
    const audits=(await db.query("SELECT payload FROM audit_events WHERE payload->>'action'='profile.updated' AND payload->>'actorId'=$1 AND payload->>'entityId'=ANY($2::text[])",[ids.admin,[ids.dispatcher,ids.specialist]])).rows;
    assert.ok(audits.length>=4);assert.ok(audits.every(row=>JSON.stringify(row.payload.metadata.changedFields)==='["birthDate"]'));
    assert.equal(JSON.stringify(audits).includes('1993-05-09'),false);assert.equal(JSON.stringify(audits).includes('1984-06-12'),false);
  });

  await t.test('today completion and undo are retry-safe, persist through restart and remain personal to each administrator and year',async()=>{
    const previousYear=`${Number(today.slice(0,4))-1}-${today.slice(5)}`;
    await db.query('INSERT INTO team_birthday_congratulations(administrator_id,employee_id,occurrence_date,congratulated) VALUES($1,$2,$3,true)',[ids.admin,ids.drivers[0],previousYear]);
    assert.equal((await list()).employees.find(row=>row.userId===ids.drivers[0]).congratulated,false);
    const completed=ok(await mark());assert.equal(completed.employee.congratulated,true);assert.deepEqual(ok(await mark()),completed);
    assert.equal((await list()).employees.find(row=>row.userId===ids.drivers[0]).congratulated,true);
    assert.equal((await list(secondAdmin)).employees.find(row=>row.userId===ids.drivers[0]).congratulated,false);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM team_birthday_congratulations WHERE administrator_id=$1 AND employee_id=$2',[ids.admin,ids.drivers[0]])).rows[0].n,2);
    await f.restartApi();assert.equal((await list()).employees.find(row=>row.userId===ids.drivers[0]).congratulated,true);
    assert.equal(ok(await mark(ids.drivers[0],today,false)).employee.congratulated,false);assert.equal(ok(await mark(ids.drivers[0],today,false)).employee.congratulated,false);
    assert.equal((await list()).employees.find(row=>row.userId===ids.drivers[0]).congratulated,false);
    assert.equal((await db.query('SELECT congratulated FROM team_birthday_congratulations WHERE administrator_id=$1 AND employee_id=$2 AND occurrence_date=$3',[ids.admin,ids.drivers[0],previousYear])).rows[0].congratulated,true);
    assert.equal((await mark(ids.drivers[1],tomorrow)).status,409);assert.equal((await mark(ids.drivers[0],yesterday)).status,409);assert.equal((await mark(ids.drivers[0],'2026-02-30')).status,400);
    assert.equal((await mark(ids.drivers[0],today,'true')).status,400);
  });

  await t.test('permission, employee access and administrator role revocations apply on the next read and write',async()=>{
    await db.query('UPDATE access_grants SET personal_data_visible=false WHERE user_id=$1',[ids.admin]);
    assert.deepEqual((await list()).employees,[]);assert.equal((await list()).missingBirthDateCount,0);assert.equal((await mark()).status,404);
    assert.deepEqual((await list()).employeesWithoutBirthday,[]);assert.equal((await setDate(ids.dispatcher,'1991-01-01',4)).status,404);
    assert.equal((await call('GET',scoped(`/team/profiles/${ids.dispatcher}`))).status,404);
    await db.query('UPDATE access_grants SET personal_data_visible=true WHERE user_id=$1',[ids.admin]);
    await db.query('DELETE FROM access_grants WHERE user_id=$1',[ids.drivers[0]]);
    assert.equal((await list()).employees.some(row=>row.userId===ids.drivers[0]),false);assert.equal((await mark()).status,404);
    await db.query("UPDATE users SET role='dispatcher' WHERE id=$1",[otherAdminId]);
    assert.equal((await call('GET','/team/birthdays',undefined,secondAdmin)).status,403);
    privateBirthday(ok(await call('GET','/profile',undefined,secondAdmin)),31,12);
    await db.query('DELETE FROM access_grants WHERE user_id=$1',[ids.admin]);
    assert.equal((await call('GET',scoped('/team/birthdays'))).status,403);assert.deepEqual(ok(await call('GET','/team/birthdays')).employees,[]);
    assert.equal((await mark()).status,403);
  });
});
