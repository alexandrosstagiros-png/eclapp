'use strict';
// Synthetic data only; every scenario runs in a disposable PostgreSQL cluster.
const test=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {createTestServer}=require('./local-test-server.cjs');
const API='/recruitment/contracts';
const PRIVATE='SYNTHETIC-PACK-PASSPORT-DO-NOT-AUDIT';
test('contract packs issue atomically with shared inputs, immutable snapshots and repeat-click protection',{timeout:240000},async t=>{
  const fixture=await createTestServer();t.after(()=>fixture.close());
  const {ids,request,devLogin,adminPool:db}=fixture,scope=[ids.legal,ids.region,ids.project,ids.scope];
  const foreignLegal=randomUUID(),foreignProject=randomUUID(),foreignScope=randomUUID();
  await db.query('INSERT INTO legal_entities VALUES($1,$2)',[foreignLegal,'Synthetic foreign pack organization']);
  await db.query('INSERT INTO projects VALUES($1,$2,$3,$4)',[foreignProject,'Synthetic foreign pack project',foreignLegal,ids.region]);
  await db.query('INSERT INTO responsibility_scopes VALUES($1,$2,$3)',[foreignScope,foreignProject,'Synthetic foreign pack scope']);
  async function actor(role,grantedScope=scope,pd=true) {
    const id=randomUUID();await db.query('INSERT INTO users(id,display_name,role,active,approved) VALUES($1,$2,$3,true,true)',[id,`Synthetic pack ${role}`,role]);
    await db.query('INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id,personal_data_visible) VALUES($1,$2,$3,$4,$5,$6)',[id,...grantedScope,pd]);
    return {id,...await devLogin(id)};
  }
  const manager=await actor('manager'),recruiter=await actor('recruiter'),peer=await actor('recruiter'),dispatcher=await actor('dispatcher'),external=await actor('external_recruiter'),noPD=await actor('recruiter',scope,false),foreign=await actor('manager',[foreignLegal,ids.region,foreignProject,foreignScope]);
  const auth=(method,path,body,who=recruiter)=>request(method,API+path,body,who.accessToken);
  const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
  const denied=(r,status=403)=>assert.equal(r.status,status,JSON.stringify(r.body));
  const fields=[{id:'full_name',label:'ФИО',type:'text',required:true},{id:'passport_number',label:'Паспорт',type:'text',required:true},{id:'company_name',label:'Компания',type:'text',required:true}];
  const templateBody=(patch={})=>({id:randomUUID(),version:0,responsibilityScopeId:ids.scope,name:'Synthetic pack template',employmentType:'employee',text:'{{company_name}} — {{full_name}} {{passport_number}}\n№ {{contract_number}} от {{contract_date}}',fields,state:'published',...patch});
  const makeTemplate=async patch=>ok(await auth('PUT','/templates',templateBody(patch),manager));
  const base=await makeTemplate({name:'Synthetic employment contract'}),appendix=await makeTemplate({name:'Synthetic appendix',text:'Приложение к договору № {{contract_number}} от {{contract_date}}: {{full_name}}',fields:[fields[0]]});
  const candidateId=randomUUID();
  await db.query(`INSERT INTO recruitment_candidates(id,legal_entity_id,region_id,project_id,responsibility_scope_id,full_name,phone,city,kind,recruiter_id,source,created_by,updated_by)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,'driver',$9,'manual',$9,$9)`,[candidateId,...scope,'Synthetic Pack Candidate','+79991230491','Москва',recruiter.id]);
  const packBody=(patch={})=>({idempotencyKey:randomUUID(),responsibilityScopeId:ids.scope,kind:'employee',templateIds:[base.id,appendix.id],templateVersions:{[base.id]:base.publishedVersion,[appendix.id]:appendix.publishedVersion},candidateId,values:{passport_number:PRIVATE},number:`PACK-SYNTHETIC-${randomUUID()}`,date:'2026-09-28',...patch});
  const catalogPath=(extra='')=>`/packs/catalog?responsibilityScopeId=${ids.scope}&kind=employee${extra}`;
  const counts=async()=>((await db.query('SELECT (SELECT count(*) FROM recruitment_contract_packs)::int AS packs,(SELECT count(*) FROM recruitment_contract_documents)::int AS documents')).rows[0]);

  await t.test('published catalog and source data respect current role, company and PII access',async()=>{
    denied(await request('GET',API+catalogPath()),401);
    for(const who of [external,noPD,foreign]) {
      denied(await auth('GET',catalogPath(),undefined,who));
      denied(await auth('POST','/packs',packBody(),who));
    }
    for(const who of [recruiter,dispatcher])denied(await auth('POST','/packs/install',{responsibilityScopeId:ids.scope},who));
    const before=await counts();
    const list=ok(await auth('GET',catalogPath(`&candidateId=${candidateId}&templateIds=${base.id},${appendix.id}`)));
    assert.equal(list.values.full_name,'Synthetic Pack Candidate');assert.equal(list.fields.filter(f=>f.id==='full_name').length,1);
    assert.equal(list.templates.find(t=>t.id===base.id).version,1);assert.equal(list.templates.find(t=>t.id===base.id).text,base.published.text);
    assert.deepEqual(await counts(),before,'GET does not install or issue anything');
    const hidden=await makeTemplate({state:'draft'});
    denied(await auth('GET',catalogPath(`&templateIds=${hidden.id}`)),400);
    denied(await auth('POST','/packs',packBody({kind:'carrier'})),400);
  });
  await t.test('organization defaults save once, reject personal fields and enforce optimistic versions',async()=>{
    for(const who of [recruiter,dispatcher,foreign,noPD])denied(await auth('PUT','/packs/settings',{responsibilityScopeId:ids.scope,version:0,values:{company_name:'Synthetic shared company'}},who));
    denied(await auth('PUT','/packs/settings',{responsibilityScopeId:ids.scope,version:0,values:{passport_number:PRIVATE}},manager),400);
    const settings=ok(await auth('PUT','/packs/settings',{responsibilityScopeId:ids.scope,version:0,values:{company_name:'Synthetic reusable company'}},manager));
    assert.equal(settings.version,1);
    denied(await auth('PUT','/packs/settings',{responsibilityScopeId:ids.scope,version:0,values:{company_name:'stale'}},manager),409);
    const list=ok(await auth('GET',catalogPath(`&templateIds=${base.id}`)));
    assert.equal(list.values.company_name,'Synthetic reusable company');assert.equal(list.settings.version,1);
  });
  let issued;
  await t.test('concurrent repeat clicks issue exactly one complete pack with matching numbers and dates',async()=>{
    const before=await counts(),body=packBody({number:'PACK-SYNTHETIC-001'});
    const results=await Promise.all([auth('POST','/packs',body),auth('POST','/packs',body)]);
    issued=ok(results[0]);const duplicate=ok(results[1]);
    assert.equal(issued.id,duplicate.id);assert.deepEqual(issued.documents.map(d=>d.id),duplicate.documents.map(d=>d.id));
    assert.deepEqual(await counts(),{packs:before.packs+1,documents:before.documents+2});
    assert.equal(issued.documents.length,2);
    for(const document of issued.documents) {
      assert.equal(document.status,'issued');assert.equal(document.packId,issued.id);assert.equal(document.number,body.number);assert.equal(document.date,body.date);
      assert.match(document.renderedText,/PACK-SYNTHETIC-001/);assert.match(document.renderedText,/28\.09\.2026/);assert.equal(document.values.full_name,'Synthetic Pack Candidate');
    }
    assert.equal(issued.documents[0].values.company_name,'Synthetic reusable company');
    assert.equal(issued.documents[1].values.passport_number,undefined,'Only each document\'s declared fields are snapshotted');
    denied(await auth('POST','/packs',{...body,number:'different'}),409);
    denied(await auth('GET',`/packs/${issued.id}`,undefined,peer));denied(await auth('GET',`/packs/${issued.id}`,undefined,foreign));
    assert.equal(ok(await auth('GET',`/packs/${issued.id}`,undefined,manager)).id,issued.id);
    assert.ok(ok(await auth('GET','/context')).packs.some(p=>p.id===issued.id));
    assert.ok(!ok(await auth('GET','/context',undefined,peer)).packs.some(p=>p.id===issued.id));
    await fixture.restartApi();assert.equal(ok(await auth('POST','/packs',body)).id,issued.id);
    await assert.rejects(db.query("UPDATE recruitment_contract_documents SET field_values='{}' WHERE id=$1",[issued.documents[0].id]),/immutable/);
    await assert.rejects(db.query("UPDATE recruitment_contract_packs SET number='tampered' WHERE id=$1",[issued.id]),/immutable/);
    await assert.rejects(db.query('UPDATE recruitment_contract_documents SET pack_id=NULL,pack_position=NULL WHERE id=$1',[issued.documents[0].id]),/immutable/);
  });
  await t.test('validation and persistence failures leave no partial pack or document',async()=>{
    const before=await counts();
    for(const patch of [{values:{}},{date:'2026-02-30'},{templateIds:[base.id,base.id]},{templateVersions:{}},{values:{passport_number:PRIVATE,unexpected:'extra'}}])denied(await auth('POST','/packs',packBody(patch)),400);
    const expiry=await makeTemplate({text:'Действует до {{valid_until}}',fields:[{id:'valid_until',label:'Срок',type:'date',required:true,notBeforeContractDate:true}]});
    denied(await auth('POST','/packs',packBody({templateIds:[base.id,expiry.id],templateVersions:{[base.id]:1,[expiry.id]:1},values:{passport_number:PRIVATE,valid_until:'2026-09-27'}})),400);
    assert.deepEqual(await counts(),before);
    // Fail the second insert after a valid first document and pack were written.
    await db.query(`CREATE FUNCTION synthetic_pack_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.template_id='${appendix.id}'::uuid THEN RAISE EXCEPTION 'Synthetic persistence failure'; END IF; RETURN NEW; END; $$`);
    await db.query('CREATE TRIGGER synthetic_pack_failure BEFORE INSERT ON recruitment_contract_documents FOR EACH ROW EXECUTE FUNCTION synthetic_pack_failure()');
    try {denied(await auth('POST','/packs',packBody()),500);assert.deepEqual(await counts(),before);}
    finally {await db.query('DROP TRIGGER synthetic_pack_failure ON recruitment_contract_documents');await db.query('DROP FUNCTION synthetic_pack_failure()');}
  });
  await t.test('automatic numbers serialize concurrent packs, skip existing documents and preserve manual numbers',async()=>{
    const draft=ok(await auth('POST','/documents',{templateId:base.id}));
    ok(await auth('PUT',`/documents/${draft.id}`,{version:draft.version,text:draft.text,values:{...draft.values,full_name:'Synthetic reserved draft',passport_number:PRIVATE,company_name:'Synthetic company'},number:'ТК-2026-00001',date:'2026-09-28'}));
    const bodies=[packBody({number:''}),packBody({number:''})];
    const packs=(await Promise.all(bodies.map(body=>auth('POST','/packs',body)))).map(ok);
    assert.deepEqual(packs.map(p=>p.number).sort(),['ТК-2026-00002','ТК-2026-00003']);
    for(const pack of packs)assert.ok(pack.documents.every(d=>d.number===pack.number && d.renderedText.includes(pack.number)));
    assert.equal(ok(await auth('POST','/packs',bodies[0])).id,packs[0].id);
    denied(await auth('POST','/packs',packBody({number:packs[0].number})),409);
    const nextYear=ok(await auth('POST','/packs',packBody({number:'',date:'2027-01-01'})));assert.equal(nextYear.number,'ТК-2027-00001');
  });
  await t.test('preview editions cannot silently change and conflicting shared definitions require resolution',async()=>{
    const a=await makeTemplate({text:'{{term}}',fields:[{id:'term',label:'Условие',type:'text',required:true,defaultValue:'first'}]}),b=await makeTemplate({text:'{{term}}',fields:[{id:'term',label:'Условие',type:'text',required:true,defaultValue:'second'}]});
    const list=ok(await auth('GET',catalogPath(`&templateIds=${a.id},${b.id}`)));
    assert.equal(list.values.term,'');assert.ok(list.conflicts.some(c=>c.fieldId==='term' && c.type==='default'));
    const body=packBody({templateIds:[a.id,b.id],templateVersions:{[a.id]:1,[b.id]:1},values:{}});
    denied(await auth('POST','/packs',body),400);
    const pack=ok(await auth('POST','/packs',{...body,values:{term:'Explicit shared term'}}));
    assert.ok(pack.documents.every(d=>d.renderedText==='Explicit shared term'));
    await makeTemplate({id:a.id,version:a.version,text:'Changed {{term}}',fields:a.published.fields});
    denied(await auth('POST','/packs',{...body,idempotencyKey:randomUUID(),values:{term:'Confirmed'}}),409);
    assert.equal(ok(await auth('GET',`/packs/${pack.id}`)).documents[0].renderedText,'Explicit shared term');
    const incompatible=await makeTemplate({text:'{{term}}',fields:[{id:'term',label:'Условие',type:'date',required:false}]});
    denied(await auth('POST','/packs',packBody({templateIds:[b.id,incompatible.id],templateVersions:{[b.id]:1,[incompatible.id]:1},values:{term:'2026-09-28'}})),400);
  });
  await t.test('onboarding values prefill only declared fields and cannot cross session owners',async()=>{
    const template=ok(await request('PUT','/recruitment/onboarding/templates',{id:randomUUID(),version:0,responsibilityScopeId:ids.scope,name:'Synthetic pack OCR source',destination:'Synthetic',employmentType:'employee',description:'',privacyNotice:'',active:true,
      fields:[{id:'full_name',label:'ФИО',type:'text',required:true},{id:'passport_number',label:'Паспорт',type:'text',required:false},{id:'private_extra',label:'Не переносить',type:'text',required:false}],documents:[]},manager.accessToken));
    let session=ok(await request('POST','/recruitment/onboarding/sessions',{templateId:template.id,candidateId},recruiter.accessToken));
    session=ok(await request('PUT',`/recruitment/onboarding/sessions/${session.id}`,{version:session.version,values:{full_name:'Synthetic verified OCR name',passport_number:PRIVATE,private_extra:'SYNTHETIC-UNDECLARED-PRIVATE'}},recruiter.accessToken));
    denied(await auth('GET',catalogPath(`&onboardingSessionId=${session.id}&templateIds=${base.id}`),undefined,peer));
    const body=packBody({candidateId:undefined,onboardingSessionId:session.id,values:{}});
    denied(await auth('POST','/packs',body,peer));
    const pack=ok(await auth('POST','/packs',body));assert.equal(pack.candidateId,candidateId);
    assert.equal(pack.documents[0].values.full_name,'Synthetic verified OCR name');assert.equal(pack.documents[0].values.passport_number,PRIVATE);
    assert.ok(!JSON.stringify(pack).includes('SYNTHETIC-UNDECLARED-PRIVATE'));
    const before=await counts();
    await db.query('UPDATE access_grants SET personal_data_visible=false WHERE user_id=$1',[peer.id]);
    denied(await auth('POST','/packs',packBody(),peer));assert.deepEqual(await counts(),before);
    const audit=JSON.stringify((await db.query("SELECT payload FROM audit_events WHERE payload->>'action' LIKE 'recruitment.contract.%'")).rows);
    for(const value of [PRIVATE,'Synthetic verified OCR name','Synthetic reusable company','Explicit shared term','PACK-SYNTHETIC-001'])assert.ok(!audit.includes(value));
  });
  await t.test('built-in installation is explicit, repeatable and preserves published edits and trash',async()=>{
    const installed=ok(await auth('POST','/packs/install',{responsibilityScopeId:ids.scope},manager));assert.ok(installed.installedCount>0);
    assert.ok(installed.onboardingTemplateId);
    const driver=(await db.query('SELECT fields,source_catalog_key FROM recruitment_onboarding_templates WHERE id=$1',[installed.onboardingTemplateId])).rows[0];
    assert.equal(driver.fields.find(f=>f.id==='passport_number').ocrKey,'document_number');assert.equal(driver.fields.find(f=>f.id==='full_name').ocrKey,'full_name');
    const list=ok(await auth('GET',catalogPath()));assert.ok(list.selectedTemplateIds.length>0);
    const builtin=list.templates.find(t=>t.catalogKey);
    let editable=ok(await auth('GET',`/templates/${builtin.id}`,undefined,manager));
    const originalCatalogKey=editable.catalogKey;
    editable=ok(await auth('PUT','/templates',templateBody({id:editable.id,version:editable.version,name:'Synthetic locally edited builtin',text:'Local edit {{full_name}}',fields:[fields[0]]}),manager));
    assert.equal(editable.catalogKey,originalCatalogKey);
    const again=ok(await auth('POST','/packs/install',{responsibilityScopeId:ids.scope},manager));assert.equal(again.installedCount,0);
    assert.equal(ok(await auth('GET',`/templates/${builtin.id}`,undefined,manager)).published.name,'Synthetic locally edited builtin');
    editable=ok(await auth('POST',`/templates/${builtin.id}/delete`,{version:editable.version},manager));
    assert.equal(ok(await auth('POST','/packs/install',{responsibilityScopeId:ids.scope},manager)).installedCount,0);
    assert.equal(ok(await auth('GET',`/templates/${builtin.id}?deleted=true`,undefined,manager)).deletedAt,editable.deletedAt);
    const privileges=(await db.query("SELECT has_table_privilege('transport_app','recruitment_contract_packs','UPDATE') AS packs,has_column_privilege('transport_app','recruitment_contract_documents','pack_id','UPDATE') AS link")).rows[0];
    assert.deepEqual(privileges,{packs:false,link:false});
  });
  await t.test('actual built-in employee and carrier defaults issue as complete, reusable packs',async()=>{
    for(const kind of ['employee','carrier']) {
      const list=ok(await auth('GET',`/packs/catalog?responsibilityScopeId=${ids.scope}&kind=${kind}&candidateId=${candidateId}`));
      assert.ok(list.selectedTemplateIds.length);assert.ok(!list.conflicts.some(c=>c.type==='type'));
      const values={...list.values};
      for(const field of list.fields)if(!values[field.id])values[field.id]=field.type==='date'?'2027-09-28':field.type==='tel'?'+79991230491':`Synthetic ${field.id}`;
      const body=packBody({kind,number:'',templateIds:list.selectedTemplateIds,templateVersions:Object.fromEntries(list.templates.filter(t=>list.selectedTemplateIds.includes(t.id)).map(t=>[t.id,t.version])),values});
      const pack=ok(await auth('POST','/packs',body));
      assert.equal(pack.documents.length,list.selectedTemplateIds.length);assert.ok(pack.number.startsWith(kind==='employee'?'ТК-':'ПР-'));
      for(const document of pack.documents) {assert.equal(document.status,'issued');assert.ok(!document.renderedText.includes('{{'));}
    }
  });
});
