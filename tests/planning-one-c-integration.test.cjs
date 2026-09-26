'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {createTestServer}=require('./local-test-server.cjs');
const writer=require('../integrations/one-c-local/planning-writer.cjs');

test('local planning export authorizes scopes, persists immutable jobs, reports every selected row and safely retries', {timeout:180000}, async t=>{
  const fixture=await createTestServer();
  const original=writer.exportPlannedAssignment;
  t.after(async()=>{writer.exportPlannedAssignment=original;await fixture.close();});
  const {request,devLogin,adminPool:db,ids}=fixture;
  const admin=(await devLogin(ids.admin)).accessToken;
  const driver=(await devLogin(ids.drivers[0])).accessToken;
  await db.query('UPDATE access_grants SET personal_data_visible=true WHERE user_id=$1',[ids.admin]);
  const scoped={responsibilityScopeId:ids.scope};
  assert.equal((await request('POST','/planning/one-c/export',{})).status,401);
  assert.equal((await request('POST','/planning/one-c/export',{},admin)).status,403);
  process.env.LOCAL_ONE_C_ENABLED='true';
  const vehicle=randomUUID();
  await db.query('INSERT INTO planning_one_c_scopes(responsibility_scope_id,source_namespace,client_ref,project_ref) VALUES($1,$2,$3,$4)',[ids.scope,randomUUID(),randomUUID(),randomUUID()]);
  for(const [kind,id] of [['driver',ids.drivers[0]],['vehicle',vehicle]]) await db.query(`INSERT INTO planning_one_c_resources(responsibility_scope_id,kind,local_id,source_ref,label,active) VALUES($1,$2,$3,$4,$5,true)`,[ids.scope,kind,id,randomUUID(),`Mapped ${kind}`]);
  const options=await request('GET',`/planning/options?responsibilityScopeId=${ids.scope}`,undefined,admin);
  assert.equal(options.status,200);assert.ok(options.body.vehicles.some(v=>v.id===vehicle));
  assert.equal((await db.query('SELECT 1 FROM vehicles WHERE id=$1',[vehicle])).rowCount,0,'mapping does not invent vehicle capabilities');
  const row={id:randomUUID(),driverId:ids.drivers[0],vehicleId:vehicle,departureTime:'08:30',status:'work',confirmed:false,arrived:false,requestCreated:false,tripCount:1,comment:'Private plan note',clientFields:{}};
  const bad={...row,id:randomUUID(),status:'off'};
  const input={...scoped,businessDate:'2026-09-21',templateId:'lamoda',version:0,rows:[row,bad]};
  let saved=await request('PUT','/planning',input,admin);assert.equal(saved.status,200);
  const selection=()=>({...scoped,plans:[{businessDate:input.businessDate,version:saved.body.version,rowIds:[row.id,bad.id]}]});
  const calls=[];const records=new Map();let simulateFailure=false;
  writer.exportPlannedAssignment=async payload=>{
    calls.push(payload);
    if(simulateFailure){const e=new Error('Synthetic unavailable');e.code='ONE_C_UNAVAILABLE';throw e;}
    const key=payload.externalKey;const existed=records.has(key);
    if(!existed)records.set(key,{requestId:randomUUID(),shiftId:randomUUID(),requestNumber:'TEST-R1',shiftNumber:'TEST-S1'});
    return {...records.get(key),created:!existed,status:existed?'unchanged':'created'};
  };
  await t.test('rejects unauthorized roles, foreign scopes, unsaved versions and unknown rows before writing',async()=>{
    assert.equal((await request('POST','/planning/one-c/export',selection(),driver)).status,403);
    assert.equal((await request('POST','/planning/one-c/export',{...selection(),responsibilityScopeId:randomUUID()},admin)).status,403);
    assert.equal((await request('POST','/planning/one-c/export',{...scoped,plans:[{...selection().plans[0],version:2}]},admin)).status,409);
    assert.equal((await request('POST','/planning/one-c/export',{...scoped,plans:[{...selection().plans[0],rowIds:[randomUUID()]}]},admin)).status,409);
    assert.equal(calls.length,0);
  });
  await t.test('returns one receipt per row; concurrent retries share the immutable identity',async()=>{
    const responses=await Promise.all([request('POST','/planning/one-c/export',selection(),admin),request('POST','/planning/one-c/export',selection(),admin)]);
    for(const result of responses){assert.equal(result.status,200);assert.equal(result.body.results.length,2);assert.equal(result.body.summary.failed,1);}
    assert.equal(records.size,1);assert.equal(calls[0].externalKey,calls[1].externalKey);assert.equal(calls[0].notes,row.comment);
    assert.equal(calls[0].status,'planned');assert.equal(calls[0].endTime,undefined);
    assert.equal((await db.query('SELECT count(*) FROM planning_one_c_exports')).rows[0].count,'1');
    await fixture.restartApi();
    const loaded=await request('GET',`/planning?date=${input.businessDate}&responsibilityScopeId=${ids.scope}`,undefined,admin);
    assert.equal(loaded.body.oneCExports[0].documentNumber,'TEST-S1');
    const audit=(await db.query("SELECT payload FROM audit_events WHERE payload->>'action'='planning.one_c_export'")).rows;
    assert.equal(audit.length,2);assert.ok(!JSON.stringify(audit).includes(row.comment));
  });
  await t.test('changed exported payload cannot silently overwrite 1C',async()=>{
    saved=await request('PUT','/planning',{...input,version:saved.body.version,rows:[{...row,departureTime:'10:00'},bad]},admin);
    assert.equal(saved.body.oneCExports[0].status,'error');
    assert.match(saved.body.oneCExports[0].message,/ранее отправленная версия/);
    const count=calls.length;
    const result=await request('POST','/planning/one-c/export',selection(),admin);
    assert.equal(result.status,200);assert.equal(result.body.summary.failed,2);assert.equal(calls.length,count);
    assert.match(result.body.results[0].message,/другими данными/);
  });
  await t.test('row-specific automatic and manual fields cannot silently disappear on export',async()=>{
    const field={id:randomUUID(),label:'Паспорт',source:'driver_passport',owner:'driver',type:'text'};
    const rows=[{...row,id:randomUUID(),extraFields:[field]},{...row,id:randomUUID(),extraFields:[{...field,value:'SYNTHETIC_PRIVATE_OVERRIDE'}]}];
    saved=await request('PUT','/planning',{...input,version:saved.body.version,rows},admin);
    assert.equal(saved.status,200);
    const count=calls.length;
    const result=await request('POST','/planning/one-c/export',{...scoped,plans:[{businessDate:input.businessDate,version:saved.body.version,rowIds:rows.map(row=>row.id)}]},admin);
    assert.equal(result.status,200);assert.equal(result.body.summary.failed,2);assert.equal(calls.length,count);
    assert.ok(result.body.results.every(row=>/отдельные поля/.test(row.message)));
    assert.equal((await db.query('SELECT count(*) FROM planning_one_c_exports WHERE row_id=ANY($1::uuid[])',[rows.map(row=>row.id)])).rows[0].count,'0');
    assert.ok(!JSON.stringify(result.body).includes('SYNTHETIC_PRIVATE_OVERRIDE'));
  });
  await t.test('unavailable write remains retryable after API restart, only selected rows are sent',async()=>{
    const another={...row,id:randomUUID()};
    saved=await request('PUT','/planning',{...input,version:saved.body.version,rows:[another,bad]},admin);
    const chosen={...scoped,plans:[{businessDate:input.businessDate,version:saved.body.version,rowIds:[another.id]}]};
    simulateFailure=true;
    let result=await request('POST','/planning/one-c/export',chosen,admin);assert.equal(result.body.summary.failed,1);
    await fixture.restartApi();simulateFailure=false;
    result=await request('POST','/planning/one-c/export',chosen,admin);assert.equal(result.body.summary.created,1);
    assert.equal(records.size,2);
    await db.query('UPDATE users SET active=false WHERE id=$1',[ids.drivers[0]]);
    const count=calls.length;
    assert.equal((await request('POST','/planning/one-c/export',chosen,admin)).status,400);assert.equal(calls.length,count);
  });
  await t.test('local gate hides integration and mapped-only vehicles when disabled',async()=>{
    process.env.LOCAL_ONE_C_ENABLED='false';
    const context=await request('GET','/planning/context',undefined,admin);assert.equal(context.body.oneC,undefined);
    const options=await request('GET',`/planning/options?responsibilityScopeId=${ids.scope}`,undefined,admin);
    assert.ok(!options.body.vehicles.some(v=>v.id===vehicle));
    assert.equal((await request('POST','/planning/one-c/export',selection(),admin)).status,403);
  });
});
