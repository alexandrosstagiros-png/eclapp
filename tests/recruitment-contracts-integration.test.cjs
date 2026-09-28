'use strict';
// Every identity, document and file is synthetic in a disposable PostgreSQL.
const test=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {createTestServer}=require('./local-test-server.cjs');
const API='/recruitment/contracts';
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC','base64');
const PDF=Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n');
const PRIVATE='SYNTHETIC-PRIVATE-PASSPORT-4091';
test('versioned contract templates, immutable issue/sign lifecycle and durable private originals', {timeout:240000},async t=>{
  const fixture=await createTestServer();t.after(()=>fixture.close());
  const {ids,request,devLogin,adminPool:db}=fixture;
  const scope=[ids.legal,ids.region,ids.project,ids.scope];
  const foreignLegal=randomUUID(),foreignProject=randomUUID(),foreignScope=randomUUID();
  await db.query('INSERT INTO legal_entities VALUES($1,$2)',[foreignLegal,'Synthetic foreign contract company']);
  await db.query('INSERT INTO projects VALUES($1,$2,$3,$4)',[foreignProject,'Synthetic foreign contract project',foreignLegal,ids.region]);
  await db.query('INSERT INTO responsibility_scopes VALUES($1,$2,$3)',[foreignScope,foreignProject,'Synthetic foreign contract scope']);
  async function actor(role,grantedScope=scope,pd=true){const id=randomUUID();await db.query('INSERT INTO users(id,display_name,role,active,approved) VALUES($1,$2,$3,true,true)',[id,`Synthetic ${role}`,role]);await db.query('INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id,personal_data_visible) VALUES($1,$2,$3,$4,$5,$6)',[id,...grantedScope,pd]);return {id,...await devLogin(id)};}
  const manager=await actor('manager'),recruiter=await actor('recruiter'),peer=await actor('recruiter'),admin=await actor('access_admin'),external=await actor('external_recruiter'),noPD=await actor('recruiter',scope,false),foreign=await actor('manager',[foreignLegal,ids.region,foreignProject,foreignScope]);
  const auth=(method,route,body,who=recruiter)=>request(method,API+route,body,who.accessToken);
  const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
  const denied=(r,status=403)=>assert.equal(r.status,status,JSON.stringify(r.body));
  const templateBody=(patch={})=>({id:randomUUID(),version:0,responsibilityScopeId:ids.scope,name:'Synthetic contract',employmentType:'self_employed',text:'Договор № {{contract_number}} от {{contract_date}}\n{{full_name}}\n{{passport_number}}',fields:[{id:'full_name',label:'ФИО',type:'text',required:true},{id:'passport_number',label:'Паспорт',type:'text',required:true}],state:'published',...patch});
  const candidateId=randomUUID();
  await db.query(`INSERT INTO recruitment_candidates(id,legal_entity_id,region_id,project_id,responsibility_scope_id,full_name,phone,city,kind,recruiter_id,source,created_by,updated_by)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,'driver',$9,'manual',$9,$9)`,[candidateId,...scope,'Synthetic Contract Candidate','+79991230049','Москва',recruiter.id]);
  let template=ok(await auth('PUT','/templates',templateBody(),manager));
  const newDocument=async(patch={},who=recruiter)=>ok(await auth('POST','/documents',{templateId:template.id,...patch},who));
  const read=async(doc,who=recruiter)=>ok(await auth('GET',`/documents/${doc.id}`,undefined,who));
  const save=async(doc,patch={},who=recruiter)=>ok(await auth('PUT',`/documents/${doc.id}`,{version:doc.version,text:doc.text,values:doc.values,number:doc.number,date:doc.date,...patch},who));
  const ready=async()=>save(await newDocument({candidateId}),{number:'SYN-001',date:'2026-09-27',values:{full_name:'Synthetic Contract Candidate',passport_number:PRIVATE}});
  const issue=async doc=>ok(await auth('POST',`/documents/${doc.id}/issue`,{version:doc.version}));
  const signedBody=doc=>({version:doc.version,signedDate:'2026-09-28',mimeType:'application/pdf',fileName:'Synthetic подписанный договор.pdf',base64:PDF.toString('base64')});
  const download=(doc,who)=>fetch(`${fixture.origin}/api/v1${API}/documents/${doc.id}/signed-file`,{headers:who?{Authorization:`Bearer ${who.accessToken}`}:{}});

  await t.test('role, company, owner and revoked PII boundaries guard every operation',async()=>{
    for(const [who,status] of [[null,401],[manager,200]]) {
      const response=await fetch(`${fixture.origin}/api/v1${API}/context`,{headers:who?{Authorization:`Bearer ${who.accessToken}`}:{}});
      assert.equal(response.status,status);assert.match(response.headers.get('x-correlation-id'),/^[a-f0-9-]{36}$/);assert.match(response.headers.get('cache-control'),/no-store/);
      await response.arrayBuffer();
    }
    denied(await request('GET',API+'/context'),401);
    for(const who of [external,noPD])denied(await auth('GET','/context',undefined,who));
    for(const who of [recruiter,peer,external,noPD])denied(await auth('PUT','/templates',templateBody(),who));
    denied(await auth('PUT','/templates',templateBody({responsibilityScopeId:foreignScope}),manager));
    assert.equal(ok(await auth('GET','/context',undefined,admin)).canManageTemplates,true);
    const doc=await ready();
    for(const who of [peer,foreign,external,noPD]){
      denied(await auth('GET',`/documents/${doc.id}`,undefined,who));
      denied(await auth('PUT',`/documents/${doc.id}`,{version:doc.version,text:doc.text,values:doc.values,number:'Denied',date:doc.date},who));
      denied(await auth('POST',`/documents/${doc.id}/issue`,{version:doc.version},who));
      denied(await auth('POST',`/documents/${doc.id}/sign`,signedBody(doc),who));
      denied(await auth('POST','/documents',{sourceDocumentId:doc.id},who));
      assert.equal((await download(doc,who)).status,403);
    }
    assert.equal((await read(doc,manager)).id,doc.id);
    assert.equal((await read(doc,admin)).id,doc.id);
    assert.ok(!ok(await auth('GET','/context',undefined,peer)).documents.some(d=>d.id===doc.id));
    assert.ok(!ok(await auth('GET','/context',undefined,foreign)).templates.some(d=>d.id===template.id));
    denied(await auth('GET',`/templates/${template.id}`,undefined,foreign));
    denied(await auth('POST','/documents',{templateId:template.id},foreign));
    const revocable=await actor('recruiter'),privateDoc=await newDocument({},revocable);
    await db.query('UPDATE access_grants SET personal_data_visible=false WHERE user_id=$1',[revocable.id]);
    denied(await auth('GET',`/documents/${privateDoc.id}`,undefined,revocable));
  });
  await t.test('draft changes preserve published edition and existing snapshots',async()=>{
    const blank=ok(await auth('PUT','/templates',templateBody({state:'draft',text:''}),manager));
    denied(await auth('POST',`/templates/${blank.id}/publish`,{version:blank.version},manager),400);
    assert.equal(ok(await auth('GET',`/templates/${blank.id}`,undefined,manager)).draft.text,'');
    let form=ok(await auth('PUT','/templates',templateBody({state:'draft'}),manager));
    assert.equal(form.published,null);assert.equal(form.publishedVersion,0);
    denied(await auth('GET',`/templates/${form.id}`));
    denied(await auth('POST','/documents',{templateId:form.id}),403);
    form=ok(await auth('POST',`/templates/${form.id}/publish`,{version:form.version},manager));
    assert.equal(form.publishedVersion,1);assert.equal(form.draft,null);
    const first=ok(await auth('POST','/documents',{templateId:form.id}));
    const staleVersion=form.version;
    form=ok(await auth('PUT','/templates',templateBody({id:form.id,version:form.version,name:'Edited draft',state:'draft'}),manager));
    assert.equal(form.published.name,'Synthetic contract');assert.equal(form.draft.name,'Edited draft');
    const metadata=ok(await auth('GET','/context',undefined,manager)).templates.find(t=>t.id===form.id);
    assert.equal(metadata.name,'Edited draft');assert.equal(metadata.publishedName,'Synthetic contract');
    const during=ok(await auth('POST','/documents',{templateId:form.id}));assert.equal(during.templateSnapshot.name,'Synthetic contract');
    assert.equal(ok(await auth('GET',`/templates/${form.id}`)).draft,null,'Recruiter cannot inspect unpublished draft');
    denied(await auth('POST',`/templates/${form.id}/publish`,{version:staleVersion},manager),409);
    form=ok(await auth('POST',`/templates/${form.id}/publish`,{version:form.version},manager));
    assert.equal(form.publishedVersion,2);assert.equal(form.versions.length,2);
    assert.deepEqual((await read(first)).templateSnapshot,first.templateSnapshot);
    const later=ok(await auth('POST','/documents',{templateId:form.id}));assert.equal(later.templateSnapshot.name,'Edited draft');assert.equal(later.templateVersion,2);
    await assert.rejects(db.query("UPDATE recruitment_contract_documents SET template_snapshot='{}' WHERE id=$1",[first.id]),/immutable/);
    const competing=await Promise.all([
      auth('PUT','/templates',templateBody({id:form.id,version:form.version,name:'Concurrent published',state:'published'}),manager),
      auth('POST','/documents',{templateId:form.id},peer)
    ]);
    for(const result of competing)ok(result);
  });
  await t.test('authorized candidate and onboarding values prefill declared fields only',async()=>{
    const form=ok(await request('PUT','/recruitment/onboarding/templates',{id:randomUUID(),version:0,responsibilityScopeId:ids.scope,name:'Synthetic prefill',destination:'Synthetic',employmentType:'self_employed',description:'',privacyNotice:'',active:true,fields:[{id:'full_name',label:'ФИО',type:'text',required:true},{id:'passport_number',label:'Паспорт',type:'text',required:false},{id:'private_other',label:'Другое',type:'text',required:false}],documents:[]},manager.accessToken));
    let session=ok(await request('POST','/recruitment/onboarding/sessions',{templateId:form.id,candidateId},recruiter.accessToken));
    session=ok(await request('PUT',`/recruitment/onboarding/sessions/${session.id}`,{version:session.version,values:{full_name:'Synthetic verified spelling',passport_number:PRIVATE,private_other:'DO-NOT-PREFILL'}},recruiter.accessToken));
    const doc=await newDocument({onboardingSessionId:session.id});
    assert.equal(doc.candidateId,candidateId);assert.equal(doc.values.full_name,'Synthetic verified spelling');assert.equal(doc.values.passport_number,PRIVATE);assert.equal(doc.values.private_other,undefined);
    denied(await auth('POST','/documents',{templateId:template.id,onboardingSessionId:session.id},peer));
    assert.equal((await newDocument({candidateId})).values.full_name,'Synthetic Contract Candidate');
    denied(await auth('POST','/documents',{templateId:template.id,candidateId:randomUUID()}),400);
  });
  await t.test('issue validates fields, dates, placeholders, output bounds and conflicting versions',async()=>{
    let doc=await newDocument();
    denied(await auth('POST',`/documents/${doc.id}/issue`,{version:doc.version}),400);
    denied(await auth('PUT',`/documents/${doc.id}`,{version:doc.version,text:doc.text+' {{unknown}}',values:doc.values,number:'A',date:'2026-09-27'}),400);
    denied(await auth('PUT',`/documents/${doc.id}`,{version:doc.version,text:doc.text,values:doc.values,number:'A',date:'2026-02-30'}),400);
    const old=doc.version;doc=await save(doc,{number:'D-1',date:'2026-09-27',values:{full_name:'Synthetic',passport_number:PRIVATE}});
    assert.equal(doc.date,'2026-09-27');assert.match(doc.renderedText,/27\.09\.2026/);
    denied(await auth('PUT',`/documents/${doc.id}`,{version:old,text:doc.text,values:doc.values,number:'stale',date:doc.date}),409);
    const concurrent=await Promise.all([auth('POST',`/documents/${doc.id}/issue`,{version:doc.version}),auth('POST',`/documents/${doc.id}/issue`,{version:doc.version})]);
    assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409]);
    doc=await read(doc);assert.equal(doc.status,'issued');
    denied(await auth('PUT',`/documents/${doc.id}`,{version:doc.version,text:'Changed',values:doc.values,number:'Changed',date:doc.date}),409);
    const before=structuredClone(doc);
    await assert.rejects(db.query("UPDATE recruitment_contract_documents SET content_text='tampered' WHERE id=$1",[doc.id]),/immutable/);
    const copy=ok(await auth('POST','/documents',{sourceDocumentId:doc.id}));
    assert.equal(copy.status,'draft');assert.equal(copy.number,'');assert.equal(copy.date,null);assert.deepEqual(copy.templateSnapshot,doc.templateSnapshot);assert.equal(copy.text,doc.text);
    await save(copy,{number:'COPY',date:doc.date,text:'Переработанный текст {{full_name}}'});
    assert.deepEqual(await read(doc),before);
    const long=ok(await auth('PUT','/templates',templateBody({text:'{{long_value}}'.repeat(4000),fields:[{id:'long_value',label:'Большое поле',required:false,type:'textarea'}]}),manager));
    const enormous=ok(await auth('POST','/documents',{templateId:long.id}));
    denied(await auth('PUT',`/documents/${enormous.id}`,{version:enormous.version,text:enormous.text,values:{long_value:'x'.repeat(8000)},number:'A',date:'2026-09-27'}),400);
  });
  await t.test('sign accepts bounded real formats, freezes originals and survives API restart',async()=>{
    let doc=await issue(await ready());
    const count=Number((await db.query('SELECT count(*) FROM recruitment_contract_signed_files')).rows[0].count);
    for(const patch of [{mimeType:'image/svg+xml'},{mimeType:'image/jpeg'},{base64:'bad!'}, {base64:Buffer.from('Not PDF').toString('base64')},{signedDate:'2026-02-30'},{signedDate:'2026-09-26'},{fileName:'../secret.pdf'}])denied(await auth('POST',`/documents/${doc.id}/sign`,{...signedBody(doc),...patch}),400);
    const oversized=Buffer.alloc(10*1024*1024+1);PDF.copy(oversized);
    const tooLarge=await auth('POST',`/documents/${doc.id}/sign`,{...signedBody(doc),base64:oversized.toString('base64')});assert.ok([400,413].includes(tooLarge.status));
    assert.equal(Number((await db.query('SELECT count(*) FROM recruitment_contract_signed_files')).rows[0].count),count);
    doc=ok(await auth('POST',`/documents/${doc.id}/sign`,signedBody(doc)));
    assert.equal(doc.status,'signed');assert.equal(doc.signedDate,'2026-09-28');assert.equal(doc.signedFile.byteSize,PDF.length);
    denied(await auth('POST',`/documents/${doc.id}/sign`,signedBody(doc)),409);
    assert.equal((await download(doc)).status,401);
    for(const who of [peer,foreign,noPD])assert.equal((await download(doc,who)).status,403);
    const response=await download(doc,recruiter);assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);assert.match(response.headers.get('content-disposition'),/^attachment;/);assert.equal(response.headers.get('x-content-type-options'),'nosniff');assert.deepEqual(Buffer.from(await response.arrayBuffer()),PDF);
    await fixture.restartApi();assert.deepEqual(Buffer.from(await (await download(doc,recruiter)).arrayBuffer()),PDF);
    await assert.rejects(db.query("UPDATE recruitment_contract_documents SET number='tampered' WHERE id=$1",[doc.id]),/immutable/);
    let image=await issue(await ready());image=ok(await auth('POST',`/documents/${image.id}/sign`,{...signedBody(image),mimeType:'image/png',fileName:'synthetic.png',base64:PNG.toString('base64')}));assert.equal(image.signedFile.mimeType,'image/png');
    const audit=JSON.stringify((await db.query("SELECT payload FROM audit_events WHERE payload->>'action' LIKE 'recruitment.contract.%'")).rows);
    for(const value of [PRIVATE,PDF.toString('base64'),'Synthetic подписанный договор.pdf'])assert.ok(!audit.includes(value));
    const privileges=(await db.query("SELECT has_table_privilege('transport_app','recruitment_contract_signed_files','UPDATE') AS files,has_table_privilege('transport_app','recruitment_contract_template_versions','UPDATE') AS editions")).rows[0];assert.equal(privileges.files,false);assert.equal(privileges.editions,false);
  });
  await t.test('reversible removal preserves signed content and denies foreign, peer and dispatcher mutations',async()=>{
    const dispatcher=await actor('dispatcher');
    let doc=await issue(await ready());doc=ok(await auth('POST',`/documents/${doc.id}/sign`,signedBody(doc)));
    const before=structuredClone(doc);
    for(const who of [peer,foreign,dispatcher,noPD,external])denied(await auth('POST',`/documents/${doc.id}/delete`,{version:doc.version},who));
    const dispatchDoc=await newDocument({},dispatcher);
    assert.equal(dispatchDoc.canDelete,false);
    denied(await auth('POST',`/documents/${dispatchDoc.id}/delete`,{version:dispatchDoc.version},dispatcher));
    denied(await auth('POST',`/documents/${dispatchDoc.id}/restore-template`,{version:dispatchDoc.version},dispatcher));
    const stale=doc.version;
    doc=ok(await auth('POST',`/documents/${doc.id}/delete`,{version:doc.version}));
    assert.ok(doc.deletedAt);assert.equal(doc.deletedBy,recruiter.id);assert.equal(doc.status,'signed');assert.equal(doc.canEdit,false);assert.equal(doc.canRestore,true);
    assert.ok(!ok(await auth('GET','/context')).documents.some(d=>d.id===doc.id));
    assert.ok(ok(await auth('GET','/context?deleted=true')).documents.some(d=>d.id===doc.id));
    assert.ok(!ok(await auth('GET','/context?deleted=true',undefined,peer)).documents.some(d=>d.id===doc.id));
    denied(await auth('GET',`/documents/${doc.id}`));
    assert.equal(ok(await auth('GET',`/documents/${doc.id}?deleted=true`)).id,doc.id);
    for(const who of [peer,foreign,dispatcher])denied(await auth('POST',`/documents/${doc.id}/restore`,{version:doc.version},who));
    denied(await auth('POST',`/documents/${doc.id}/restore`,{version:stale}),409);
    denied(await auth('POST','/documents',{sourceDocumentId:doc.id}));
    denied(await auth('POST',`/documents/${doc.id}/restore-template`,{version:doc.version}));
    denied(await auth('POST',`/documents/${doc.id}/issue`,{version:doc.version}));
    denied(await auth('POST',`/documents/${doc.id}/sign`,signedBody(doc)));
    assert.equal((await download(doc,recruiter)).status,403);
    await assert.rejects(db.query("UPDATE recruitment_contract_documents SET content_text='altered',deleted_at=NULL,deleted_by=NULL,version=version+1 WHERE id=$1",[doc.id]),/only change removal metadata/);
    doc=ok(await auth('POST',`/documents/${doc.id}/restore`,{version:doc.version},admin));
    assert.equal(doc.deletedAt,null);assert.equal(doc.deletedBy,null);assert.equal(doc.status,'signed');assert.equal(doc.renderedText,before.renderedText);assert.deepEqual(doc.values,before.values);assert.deepEqual(doc.templateSnapshot,before.templateSnapshot);assert.deepEqual(doc.signedFile,before.signedFile);
    assert.deepEqual(Buffer.from(await (await download(doc,recruiter)).arrayBuffer()),PDF);
    const appPrivileges=(await db.query("SELECT has_table_privilege('transport_app','recruitment_contract_documents','DELETE') AS documents,has_table_privilege('transport_app','recruitment_contract_templates','DELETE') AS templates,has_table_privilege('transport_app','recruitment_contract_signed_files','DELETE') AS files")).rows[0];assert.deepEqual(appPrivileges,{documents:false,templates:false,files:false});
  });
  await t.test('recruiters remove shared templates and recover their own clean editable draft from an old document',async()=>{
    let sourceTemplate=ok(await auth('PUT','/templates',templateBody(),manager));
    const originalSnapshot=sourceTemplate.published;
    let doc=ok(await auth('POST','/documents',{templateId:sourceTemplate.id,candidateId}));
    doc=await save(doc,{text:`Personalized ${PRIVATE} {{full_name}}`,values:{full_name:'PERSON-DO-NOT-COPY',passport_number:PRIVATE},number:'PRIVATE-NUMBER',date:'2026-09-27'});
    const alteredTemplate=ok(await auth('PUT','/templates',templateBody({id:sourceTemplate.id,version:sourceTemplate.version,text:'A newer unrelated template {{full_name}}'}),manager));
    sourceTemplate=ok(await auth('GET',`/templates/${sourceTemplate.id}`));
    assert.equal(sourceTemplate.canEdit,false);assert.equal(sourceTemplate.canDelete,true);
    denied(await auth('PUT','/templates',templateBody({id:sourceTemplate.id,version:sourceTemplate.version})),403);
    denied(await auth('POST',`/templates/${sourceTemplate.id}/delete`,{version:sourceTemplate.version},foreign));
    sourceTemplate=ok(await auth('POST',`/templates/${sourceTemplate.id}/delete`,{version:sourceTemplate.version}));
    assert.ok(sourceTemplate.deletedAt);assert.equal(sourceTemplate.canRestore,true);
    assert.ok(!ok(await auth('GET','/context')).templates.some(t=>t.id===sourceTemplate.id));
    assert.ok(ok(await auth('GET','/context?deleted=true',undefined,peer)).templates.some(t=>t.id===sourceTemplate.id));
    denied(await auth('GET',`/templates/${sourceTemplate.id}`));
    denied(await auth('POST','/documents',{templateId:sourceTemplate.id}));
    denied(await auth('POST',`/templates/${sourceTemplate.id}/publish`,{version:sourceTemplate.version},manager));
    assert.equal((await read(doc)).id,doc.id,'Existing documents remain usable after source template removal');
    await assert.rejects(db.query("UPDATE recruitment_contract_templates SET draft='{}' WHERE id=$1",[sourceTemplate.id]),/Restore a removed template/);
    denied(await auth('POST',`/documents/${doc.id}/restore-template`,{version:doc.version},peer));
    denied(await auth('POST',`/documents/${doc.id}/restore-template`,{version:doc.version-1}),409);
    let recovered=ok(await auth('POST',`/documents/${doc.id}/restore-template`,{version:doc.version,name:'Recovered safe draft'}));
    assert.notEqual(recovered.id,sourceTemplate.id);assert.equal(recovered.publishedVersion,0);assert.equal(recovered.createdBy,recruiter.id);assert.equal(recovered.canEdit,true);assert.equal(recovered.draft.text,originalSnapshot.text);assert.deepEqual(recovered.draft.fields,originalSnapshot.fields);
    for(const privateValue of [PRIVATE,'PERSON-DO-NOT-COPY','PRIVATE-NUMBER','Personalized'])assert.ok(!JSON.stringify(recovered).includes(privateValue));
    const ownContext=ok(await auth('GET','/context'));assert.equal(ownContext.canAccessTemplates,true);assert.equal(ownContext.canManageTemplates,false);assert.ok(ownContext.templates.some(t=>t.id===recovered.id && t.canEdit));
    denied(await auth('GET',`/templates/${recovered.id}`,undefined,peer));
    recovered=ok(await auth('PUT','/templates',{id:recovered.id,version:recovered.version,responsibilityScopeId:ids.scope,...recovered.draft,name:'My edited recovered draft',state:'draft'}));
    recovered=ok(await auth('POST',`/templates/${recovered.id}/publish`,{version:recovered.version}));
    assert.equal(recovered.published.name,'My edited recovered draft');
    const fresh=ok(await auth('POST','/documents',{templateId:recovered.id}));assert.equal(fresh.values.passport_number,'');assert.ok(!fresh.text.includes(PRIVATE));
    const restored=ok(await auth('POST',`/templates/${sourceTemplate.id}/restore`,{version:sourceTemplate.version},peer));assert.equal(restored.publishedVersion,alteredTemplate.publishedVersion);assert.equal(restored.deletedAt,null);assert.equal(restored.versions.length,2);
  });
  await t.test('template defaults remain reusable while candidate data and calendar constraints govern each document',async()=>{
    const fields=[{id:'full_name',label:'ФИО',type:'text',required:true,defaultValue:'Reusable fallback'},
      {id:'monthly_rent',label:'Аренда',type:'text',required:true,defaultValue:'45000'},
      {id:'valid_until',label:'Действует до',type:'date',required:true,notBeforeContractDate:true},
      {id:'birth_date',label:'Дата рождения',type:'date',required:false,defaultValue:'1990-01-02'}];
    const form=ok(await auth('PUT','/templates',templateBody({employmentType:'any',text:'{{full_name}} — {{monthly_rent}} до {{valid_until}}, дата рождения {{birth_date}}',fields}),manager));assert.equal(form.published.employmentType,'any');
    let doc=ok(await auth('POST','/documents',{templateId:form.id,candidateId}));assert.equal(doc.values.full_name,'Synthetic Contract Candidate');assert.equal(doc.values.monthly_rent,'45000');assert.equal(doc.values.valid_until,'');assert.equal(doc.values.birth_date,'1990-01-02');
    denied(await auth('PUT',`/documents/${doc.id}`,{version:doc.version,text:doc.text,number:'R-1',date:'2026-09-27',values:{...doc.values,valid_until:'2026-09-26'}}),400);
    doc=await save(doc,{number:'R-1',date:'2026-09-27',values:{...doc.values,valid_until:'2027-09-27'}});assert.match(doc.renderedText,/27\.09\.2027/);assert.match(doc.renderedText,/02\.01\.1990/);
    doc=await issue(doc);assert.match(doc.renderedText,/27\.09\.2027/);
    const recovered=ok(await auth('POST',`/documents/${doc.id}/restore-template`,{version:doc.version}));assert.deepEqual(recovered.draft.fields,fields);assert.ok(!JSON.stringify(recovered.draft).includes('Synthetic Contract Candidate'));
    for(const field of [{id:'bad',label:'Bad',type:'date',required:false,defaultValue:'2026-02-30'},{id:'bad',label:'Bad',type:'text',required:false,notBeforeContractDate:true}])denied(await auth('PUT','/templates',templateBody({text:'{{bad}}',fields:[field]}),manager),400);
  });
});
