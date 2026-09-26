'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {createTestServer}=require('./local-test-server.cjs');

test('recruitment is shared inside a company while project provenance, workflows and external boundaries survive', {timeout:180000}, async t=>{
  const fixture=await createTestServer();t.after(()=>fixture.close());
  const {ids,adminPool:db,request,devLogin}=fixture;
  const a=[ids.legal,ids.region,ids.project,ids.scope];
  async function project(legal,name){const region=randomUUID(),project=randomUUID(),scope=randomUUID();await db.query('INSERT INTO regions VALUES($1,$2,$3)',[region,name,'Asia/Yekaterinburg']);await db.query('INSERT INTO projects VALUES($1,$2,$3,$4)',[project,name,legal,region]);await db.query('INSERT INTO responsibility_scopes VALUES($1,$2,$3)',[scope,project,name]);return [legal,region,project,scope];}
  const b=await project(ids.legal,'Второй проект компании'),otherLegal=randomUUID();await db.query('INSERT INTO legal_entities VALUES($1,$2)',[otherLegal,'Другая компания']);const x=await project(otherLegal,'Чужой проект');
  async function employee(role,scope,pd=true){const id=randomUUID();await db.query('INSERT INTO users(id,display_name,role,active,approved) VALUES($1,$2,$3,true,true)',[id,`Test ${role} ${id}`,role]);await db.query('INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id,personal_data_visible) VALUES($1,$2,$3,$4,$5,$6)',[id,...scope,pd]);return {id,...await devLogin(id)};}
  const admin=await employee('access_admin',a),peer=await employee('recruiter',b),foreign=await employee('manager',x),noPD=await employee('recruiter',a,false),external=await employee('external_recruiter',a);
  const ok=response=>{assert.ok([200,201].includes(response.status),`HTTP ${response.status}: ${JSON.stringify(response.body)}`);return response.body;};
  const get=async(path,actor=admin)=>ok(await request('GET',path,undefined,actor.accessToken));
  const put=async(type,body,actor=admin)=>ok(await request('PUT',`/recruitment/${type}`,body,actor.accessToken));
  const post=async(path,body,actor=admin)=>ok(await request('POST',`/recruitment/${path}`,body,actor.accessToken));
  const candidateInput=(scope,who,patch={})=>({id:randomUUID(),responsibilityScopeId:scope[3],version:0,fullName:'Общий кандидат',phone:'+79991234567',city:'Москва',kind:'driver',recruiterId:who,source:'manual',archived:false,...patch});
  const requestInput=(scope,who,patch={})=>({id:randomUUID(),responsibilityScopeId:scope[3],version:0,title:'Потребность проекта',city:'Москва',kind:'driver',quantity:2,priority:'normal',status:'open',recruiterId:who,...patch});
  let candidate,secondCandidate,demand,application,task;
  await t.test('one PD grant opens both company projects but neither another company nor grants in other modules',async()=>{
    const context=await get('/recruitment/context',peer);assert.ok(context.scopes.some(s=>s.responsibilityScopeId===a[3]));assert.ok(context.scopes.some(s=>s.responsibilityScopeId===b[3]));assert.ok(!context.scopes.some(s=>s.responsibilityScopeId===x[3]));
    assert.deepEqual((await db.query('SELECT responsibility_scope_id AS id FROM access_grants WHERE user_id=$1',[peer.id])).rows,[{id:b[3]}]);
    for(const route of ['/recruitment','/recruitment/worklist','/recruitment/import-rows']) assert.equal((await request('GET',route,undefined,noPD.accessToken)).status,403);
    assert.equal((await request('GET',`/recruitment?responsibilityScopeId=${x[3]}`,undefined,admin.accessToken)).status,403);
    candidate=await put('candidates',candidateInput(a,peer.id),peer);
    secondCandidate=await put('candidates',candidateInput(b,admin.id,{phone:'+79991234568',fullName:'Второй кандидат'}),peer);
    demand=await put('requests',requestInput(b,admin.id,{requiresSecurity:true}),peer);
    await put('candidates',candidateInput(x,foreign.id),foreign);
    const snapshot=await get('/recruitment',peer);assert.deepEqual(new Set(snapshot.candidates.map(c=>c.id)),new Set([candidate.id,secondCandidate.id]));assert.ok(snapshot.requests.some(r=>r.id===demand.id));assert.ok(snapshot.recruiters.some(r=>r.id===admin.id));
    candidate=await put('candidates',{...candidate,notes:'Сотрудник второго проекта изменил карточку первого'},peer);
    const list=await get('/recruitment/worklist?pageSize=1',peer);assert.equal(list.total,2);assert.equal(list.items.length,1);assert.ok(list.requests.some(r=>r.id===demand.id));
    assert.equal((await get(`/recruitment/worklist?responsibilityScopeId=${a[3]}`,peer)).total,1);
  });
  await t.test('a single original candidate works on a request in another project without copying or moving it',async()=>{
    application=await put('applications',{id:randomUUID(),responsibilityScopeId:b[3],version:0,candidateId:candidate.id,requestId:demand.id,recruiterId:peer.id,stage:'new'},peer);
    assert.equal(application.responsibilityScopeId,b[3]);assert.ok((await get(`/recruitment/worklist?responsibilityScopeId=${b[3]}`,peer)).items.some(item=>item.candidate.id===candidate.id));assert.ok((await get(`/recruitment?responsibilityScopeId=${b[3]}`,peer)).candidates.some(item=>item.id===candidate.id));assert.equal((await get(`/recruitment/candidate?candidateId=${candidate.id}`,peer)).candidate.responsibilityScopeId,a[3]);
    application=await put('applications',{...application,stage:'contact'},peer);
    const contact=await post('contacts',{id:randomUUID(),responsibilityScopeId:b[3],candidateId:candidate.id,applicationId:application.id,result:'connected',notes:'Контакт по второму проекту',nextAction:{title:'Перезвонить',dueAt:new Date(Date.now()+60000).toISOString(),assigneeId:admin.id}},peer);task=contact.task;assert.equal(task.responsibilityScopeId,b[3]);
    await db.query('UPDATE recruitment_tasks SET due_at=clock_timestamp()-interval \'1 minute\' WHERE id=$1',[task.id]);assert.ok((await get('/recruitment/reminders')).tasks.some(t=>t.id===task.id));
    const detail=await get(`/recruitment/candidate?responsibilityScopeId=${a[3]}&candidateId=${candidate.id}`,peer);assert.ok(detail.applications.some(item=>item.id===application.id));assert.ok(detail.tasks.some(item=>item.id===task.id));assert.equal(detail.contacts[0].responsibilityScopeId,b[3]);assert.equal(detail.events.length,2);
    const list=await get('/recruitment/worklist?view=overdue',peer);assert.equal(list.total,1);assert.equal(list.items[0].candidate.id,candidate.id);assert.equal(list.items[0].lastContact.notes,'Контакт по второму проекту');
    task=await put('tasks',{...task,status:'done'});assert.equal(task.status,'done');
    application=await post('security',{responsibilityScopeId:b[3],applicationId:application.id,version:application.version,status:'approved',assigneeId:admin.id,note:'Согласовано'});
    application=await put('applications',{...application,stage:'hired',startDate:'2026-01-01'},peer);
    application=await post('start-confirmation',{responsibilityScopeId:b[3],applicationId:application.id,version:application.version,status:'confirmed',date:'2026-01-01',note:'Вышел'});assert.equal(application.attendanceStatus,'confirmed');
    const completed=await get(`/recruitment/candidate?candidateId=${candidate.id}`,peer);assert.equal(completed.workflowEvents.length,2);assert.equal(completed.candidate.responsibilityScopeId,a[3]);assert.equal(Number((await db.query('SELECT count(*) FROM recruitment_candidates WHERE legal_entity_id=$1 AND phone=$2',[ids.legal,candidate.phone])).rows[0].count),1);
    const foreignCandidate=(await get('/recruitment',foreign)).candidates[0];assert.equal((await request('PUT','/recruitment/applications',{...application,id:randomUUID(),version:0,candidateId:foreignCandidate.id,stage:'new'},peer.accessToken)).status,400);
    await assert.rejects(db.query('UPDATE recruitment_applications SET candidate_id=$1 WHERE id=$2',[foreignCandidate.id,application.id]),error=>error.code==='23503');
    assert.equal((await request('GET',`/recruitment/candidate?candidateId=${foreignCandidate.id}`,undefined,peer.accessToken)).status,403);
  });
  await t.test('new phone duplicates cannot split the company base while historical duplicates stay editable',async()=>{
    assert.equal((await request('PUT','/recruitment/candidates',candidateInput(b,admin.id),admin.accessToken)).status,409);
    await db.query('UPDATE recruitment_candidates SET phone=$1 WHERE id=$2',[candidate.phone,secondCandidate.id]);
    secondCandidate=await put('candidates',{...secondCandidate,phone:candidate.phone,notes:'Historical duplicate preserved'});
    assert.equal(secondCandidate.notes,'Historical duplicate preserved');assert.equal(secondCandidate.responsibilityScopeId,b[3]);
  });
  await t.test('imports and administrator pages aggregate projects and preserve source routing',async()=>{
    const imported=randomUUID();await db.query(`INSERT INTO recruitment_import_rows(id,legal_entity_id,region_id,project_id,responsibility_scope_id,document_id,source_sha256,source_key,source_sheet,source_row,file_name,status,fields,raw_data,content_sha256,created_by) VALUES($1,$2,$3,$4,$5,'company-test',$6,'row:1','Проект B',1,'Test.xlsx','review','[]','{}',$6,$7)`,[imported,...b,'a'.repeat(64),admin.id]);
    assert.ok((await get('/recruitment/import-rows',peer)).items.some(item=>item.id===imported));assert.equal((await get(`/recruitment/import-row?id=${imported}`,peer)).item.responsibilityScopeId,b[3]);
    await post('visits',{});await post('request-views',{requestId:demand.id});
    const access=await get('/recruitment/access');assert.ok(access.users.some(user=>user.id===external.id&&user.responsibilityScopeId===a[3]));const activity=await get('/recruitment/activity');assert.ok(activity.rows.some(row=>row.userId===peer.id));assert.equal(activity.rows.find(row=>row.userId===admin.id).visits,1);
    const invitation=await post('invitations',{responsibilityScopeId:b[3],requestIds:[demand.id],accessExpiresAt:new Date(Date.now()+86400000).toISOString()});assert.ok((await get('/recruitment/invitations')).invitations.some(item=>item.id===invitation.id));
    const preview=await request('POST','/recruitment-invitations/preview',{token:invitation.invitationToken});assert.equal(preview.status,200,JSON.stringify(preview.body));
  });
  await t.test('external recruiters remain limited to assigned requests and own records, and grant revocation takes effect',async()=>{
    const externalDemand=await put('requests',requestInput(a,admin.id));
    await put('access',{responsibilityScopeId:a[3],userId:external.id,requestIds:[externalDemand.id],status:'active',version:0,expiresAt:new Date(Date.now()+86400000).toISOString()});
    assert.equal((await request('GET','/recruitment',undefined,external.accessToken)).status,403);assert.equal((await request('GET',`/recruitment?responsibilityScopeId=${b[3]}`,undefined,external.accessToken)).status,403);
    const own=await put('candidates',candidateInput(a,external.id,{phone:'+79991234569'}),external);
    const externalData=await get(`/recruitment?responsibilityScopeId=${a[3]}`,external);assert.deepEqual(externalData.candidates.map(item=>item.id),[own.id]);assert.deepEqual(externalData.requests.map(item=>item.id),[externalDemand.id]);
    // A shared candidate that only participates in an unassigned project must
    // disappear from every external surface, including the legacy raw snapshot.
    await put('applications',{id:randomUUID(),responsibilityScopeId:b[3],version:0,candidateId:own.id,requestId:demand.id,recruiterId:admin.id,stage:'new'});
    assert.ok(!(await get(`/recruitment?responsibilityScopeId=${a[3]}`,external)).candidates.some(item=>item.id===own.id));
    assert.ok(!(await get(`/recruitment/worklist?responsibilityScopeId=${a[3]}`,external)).items.some(item=>item.candidate.id===own.id));
    assert.equal((await request('GET',`/recruitment/candidate?responsibilityScopeId=${a[3]}&candidateId=${own.id}`,undefined,external.accessToken)).status,403);
    assert.equal((await request('GET',`/recruitment/candidate?responsibilityScopeId=${a[3]}&candidateId=${candidate.id}`,undefined,external.accessToken)).status,403);
    await db.query('UPDATE access_grants SET personal_data_visible=false WHERE user_id=$1',[peer.id]);assert.equal((await request('GET','/recruitment/worklist',undefined,peer.accessToken)).status,403);assert.equal((await request('PUT','/recruitment/candidates',{...candidate,notes:'Denied'},peer.accessToken)).status,403);
  });
});
