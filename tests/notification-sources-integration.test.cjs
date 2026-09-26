'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID,createHash}=require('node:crypto');
const {createRequire}=require('node:module');
const path=require('node:path');
const appRequire=createRequire(path.resolve(__dirname,'../recovered/package.json'));
const {Pool}=appRequire('pg');
const {createTestServer}=require('./local-test-server.cjs');

test('committed trip/dispatcher events and document deadlines use durable scoped notifications',{timeout:180000},async t=>{
 const fixture=await createTestServer();const {adminPool:db,ids}=fixture;
 const pool=new Pool({connectionString:process.env.DATABASE_URL});
 t.after(async()=>{await pool.end();await fixture.close()});
 const database={pool,transaction:async perform=>{const c=await pool.connect();try{await c.query('BEGIN');const result=await perform(c);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}}};
 const {NotificationSourcesService,deadlineHours}=appRequire(path.resolve(__dirname,'../recovered/apps/api/src/modules/notification-sources/notification-sources.module'));
 const scanner=new NotificationSourcesService(database);
 process.env.MAX_NOTIFICATIONS_ENABLED='true';process.env.MAX_WEBHOOK_SECRET='synthetic-notification-secret-0123456789';
 await db.query("UPDATE notification_settings SET enabled_at=clock_timestamp()-interval '2 days'");
 async function createTrip(driver=ids.drivers[0],rollback=false){
  const id=randomUUID();const c=await pool.connect();
  try{
   await c.query('BEGIN');
   await c.query(`INSERT INTO trips(id,reference,business_date,project_id,region_id,legal_entity_id,responsibility_scope_id,vehicle_id,route_summary)
    SELECT $1,$2,current_date,project_id,region_id,legal_entity_id,responsibility_scope_id,vehicle_id,'Synthetic notification route' FROM trips WHERE id=$3`,[id,`SYN-${id.slice(0,8)}`,ids.trips[0]]);
   await c.query('INSERT INTO trip_assignments(trip_id,user_id) VALUES($1,$2)',[id,driver]);
   await c.query("INSERT INTO trip_stops(trip_id,sequence,label) VALUES($1,1,'Synthetic stop')",[id]);
   await c.query(rollback?'ROLLBACK':'COMMIT');return id;
  }finally{c.release()}
 }
 const notificationsFor=async id=>(await db.query(`SELECT e.type,e.body,n.recipient_id FROM notification_events e
  JOIN notifications n ON n.event_id=e.id WHERE e.entity_id=$1 ORDER BY e.created_at`,[id])).rows;
 let trip;
 await t.test('pre-enable seed produces no historical queue and deadline setting is bounded',async()=>{
  assert.equal(Number((await db.query('SELECT count(*) FROM notification_sources')).rows[0].count),0);
  assert.equal(deadlineHours({}),24);assert.equal(deadlineHours({DOCUMENT_NOTIFICATION_DEADLINE_HOURS:'48'}),48);
  assert.throws(()=>deadlineHours({DOCUMENT_NOTIFICATION_DEADLINE_HOURS:'0'}));
 });
 await t.test('creation, assignment and stops in one committed transaction produce one alert',async()=>{
  trip=await createTrip();
  const rows=(await db.query('SELECT * FROM notification_sources WHERE aggregate_id=$1',[trip])).rows;
  assert.equal(rows.length,1);assert.equal(rows[0].new_trip,true);
  assert.equal(await scanner.drainOne(),true);assert.equal(await scanner.drainOne(),false);
  assert.deepEqual((await notificationsFor(trip)).map(x=>[x.type,x.recipient_id]),[['trip_assigned',ids.drivers[0]]]);
 });
 await t.test('rolled-back business changes never produce a notification',async()=>{
  const aborted=await createTrip(ids.drivers[0],true);
  assert.equal((await db.query('SELECT 1 FROM notification_sources WHERE aggregate_id=$1',[aborted])).rowCount,0);
 });
 await t.test('route edits notify; version-only writes and repeated scan do not',async()=>{
  await db.query("UPDATE trips SET route_summary='Synthetic changed route',version=version+1 WHERE id=$1",[trip]);
  assert.equal(await scanner.drainOne(),true);
  assert.equal((await notificationsFor(trip)).at(-1).type,'trip_changed');
  await db.query('UPDATE trips SET version=version+1 WHERE id=$1',[trip]);
  assert.equal(await scanner.drainOne(),false);
 });
 await t.test('reassignment alerts the new driver and tells former driver the assignment was removed',async()=>{
  const c=await db.connect();try{await c.query('BEGIN');
   await c.query('UPDATE trip_assignments SET active=false WHERE trip_id=$1 AND user_id=$2',[trip,ids.drivers[0]]);
   await c.query('INSERT INTO trip_assignments(trip_id,user_id) VALUES($1,$2)',[trip,ids.drivers[1]]);
   await c.query('COMMIT');}finally{c.release()}

  await scanner.drainOne();const last=(await notificationsFor(trip)).slice(-2);
  assert.ok(last.some(x=>x.recipient_id===ids.drivers[0]&&x.body.includes('снято')));
  assert.ok(last.some(x=>x.recipient_id===ids.drivers[1]&&x.type==='trip_assigned'));
 });
 await t.test('moving an assignment between trips records both affected trips',async()=>{
  const old=await createTrip();const moved=await createTrip(ids.drivers[1]);while(await scanner.drainOne()){}
  await db.query('UPDATE trip_assignments SET trip_id=$1 WHERE trip_id=$2 AND user_id=$3',[moved,old,ids.drivers[0]]);
  while(await scanner.drainOne()){}
  assert.ok((await notificationsFor(old)).some(x=>x.body.includes('снято')));
  assert.ok((await notificationsFor(moved)).some(x=>x.type==='trip_assigned'&&x.recipient_id===ids.drivers[0]));
 });
 await t.test('inactive and out-of-scope drivers are excluded before enqueue',async()=>{
  const id=await createTrip();await db.query('UPDATE users SET active=false WHERE id=$1',[ids.drivers[0]]);
  await scanner.drainOne();assert.equal((await notificationsFor(id)).length,0);
  await db.query('UPDATE users SET active=true WHERE id=$1',[ids.drivers[0]]);
 });
 await t.test('database clock deadlines alert once and identify only unsubmitted/returned documents',async()=>{
  const id=await createTrip();await scanner.drainOne();
  await pool.query(`INSERT INTO workflow_attendance(id,trip_id,actor_id,kind,occurred_at,channel)
   VALUES($1,$2,$3,'check_out',clock_timestamp()-interval '25 hours','web')`,[randomUUID(),id,ids.drivers[0]]);
  const document=randomUUID();const bytes=Buffer.from('synthetic');
  await pool.query(`INSERT INTO workflow_documents(id,trip_id,kind,revision,filename,mime_type,content,byte_size,sha256,uploaded_by)
   VALUES($1,$2,'delivery_note',1,'synthetic.pdf','application/pdf',$3,$4,$5,$6)`,[document,id,bytes,bytes.length,createHash('sha256').update(bytes).digest('hex'),ids.drivers[0]]);
  assert.equal(await scanner.checkOverdue(),1);
  const alerts=(await notificationsFor(id)).filter(x=>x.type==='documents_overdue');
  assert.equal(alerts.length,1);assert.ok(alerts[0].body.includes('путевой лист'));assert.ok(!alerts[0].body.includes('накладная'));
  assert.equal(await scanner.checkOverdue(),0);assert.equal(await scanner.checkOverdue(),0);
 });
 await t.test('pending review is submitted; past backlog before enable cutoff is not broadcast',async()=>{
  const complete=await createTrip();const historical=await createTrip();while(await scanner.drainOne()){}
  for(const [id,hours]of[[complete,25],[historical,100]])await pool.query(`INSERT INTO workflow_attendance(id,trip_id,actor_id,kind,occurred_at,channel)
    VALUES($1,$2,$3,'check_out',clock_timestamp()-make_interval(hours=>$4),'web')`,[randomUUID(),id,ids.drivers[0],hours]);
  for(const kind of ['delivery_note','waybill']){
   const bytes=Buffer.from('synthetic');await pool.query(`INSERT INTO workflow_documents(id,trip_id,kind,revision,filename,mime_type,content,byte_size,sha256,uploaded_by)
    VALUES($1,$2,$3,1,'synthetic.pdf','application/pdf',$4,$5,$6,$7)`,[randomUUID(),complete,kind,bytes,bytes.length,createHash('sha256').update(bytes).digest('hex'),ids.drivers[0]]);
  }
  assert.equal(await scanner.checkOverdue(),0);
  assert.equal((await notificationsFor(historical)).filter(x=>x.type==='documents_overdue').length,0);
 });
 await t.test('a dispatcher reply alerts its request owner without exposing arbitrary message content',async()=>{
  const ticket=randomUUID();await pool.query(`INSERT INTO communications_tickets(id,reference,department,original_department,kind,subject,
   legal_entity_id,region_id,project_id,responsibility_scope_id,requester_id) VALUES($1,'SYN-NOTIFY','transport','transport','question','Synthetic request',$2,$3,$4,$5,$6)`,[ticket,ids.legal,ids.region,ids.project,ids.scope,ids.drivers[0]]);
  await pool.query('INSERT INTO telegram_inbound_updates(update_id) VALUES(987654321)');
  const content='SYNTHETIC PRIVATE DISPATCHER BODY';
  await pool.query(`INSERT INTO communications_messages(id,ticket_id,sender_id,department,update_id,content,sha256)
   VALUES($1,$2,$3,'transport',987654321,$4,$5)`,[randomUUID(),ticket,ids.dispatcher,content,createHash('sha256').update(content).digest('hex')]);
  while(await scanner.drainOne()){}
  const alerts=await notificationsFor(ticket);assert.equal(alerts.length,1);assert.equal(alerts[0].recipient_id,ids.drivers[0]);
  assert.ok(!alerts[0].body.includes(content));assert.equal(alerts[0].type,'dispatcher_message');
 });
 await t.test('concurrent scanners claim a source once',async()=>{
  const id=await createTrip();await Promise.all([scanner.drainOne(),scanner.drainOne(),scanner.drainOne()]);
  assert.equal((await notificationsFor(id)).length,1);
 });
 await t.test('unassigned overdue trips cannot starve assigned document reminders',async()=>{
  const rows=(await db.query(`INSERT INTO trips(id,reference,business_date,project_id,region_id,legal_entity_id,responsibility_scope_id,vehicle_id,route_summary)
   SELECT gen_random_uuid(),'SYN-NONE-'||gen_random_uuid(),current_date,t.project_id,t.region_id,t.legal_entity_id,t.responsibility_scope_id,t.vehicle_id,'Synthetic unassigned'
   FROM trips t CROSS JOIN generate_series(1,100) WHERE t.id=$1 RETURNING id`,[ids.trips[0]])).rows;
  await db.query(`INSERT INTO workflow_attendance(id,trip_id,actor_id,kind,occurred_at,channel)
   SELECT gen_random_uuid(),unnest($1::uuid[]),$2,'check_out',clock_timestamp()-interval '26 hours','web'`,[rows.map(x=>x.id),ids.drivers[0]]);
  const id=await createTrip();
  await pool.query(`INSERT INTO workflow_attendance(id,trip_id,actor_id,kind,occurred_at,channel)
   VALUES($1,$2,$3,'check_out',clock_timestamp()-interval '25 hours','web')`,[randomUUID(),id,ids.drivers[0]]);
  assert.equal(await scanner.checkOverdue(),1);
  assert.equal((await notificationsFor(id)).filter(x=>x.type==='documents_overdue').length,1);
 });

});
