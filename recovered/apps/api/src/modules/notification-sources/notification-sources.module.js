'use strict';
const {Module,Injectable,Inject}=require('@nestjs/common');
const {randomUUID}=require('node:crypto');
const {DatabaseService}=require('../../platform/database.service');
const {enqueueNotification}=require('../notifications/notification-enqueue');
const {readNotificationConfig}=require('../notifications/notification-config');
const {DOCUMENT_KINDS}=require('../workflow/domain/validation');
const scopeOf=row=>({legalEntityId:row.legal_entity_id,regionId:row.region_id,projectId:row.project_id,responsibilityScopeId:row.responsibility_scope_id});
function deadlineHours(env=process.env){
 const raw=env.DOCUMENT_NOTIFICATION_DEADLINE_HOURS||'24';
 if(!/^\d+$/.test(raw)||+raw<1||+raw>168)throw new Error('Invalid document deadline hours');
 return +raw;
}
class NotificationSourcesService {
 constructor(database){this.database=database;this.hours=deadlineHours();}
 async onModuleInit(){
  const config=readNotificationConfig();
  if(!config.enabled||process.env.NODE_ENV==='test')return;
  await this.database.pool.query('UPDATE notification_settings SET enabled_at=COALESCE(enabled_at,$1::timestamptz) WHERE singleton',[config.enabledAt||new Date()]);
  const tick=()=>{if(!this.running)this.running=this.scan().catch(()=>process.stderr.write('Notification event scan temporarily unavailable\n')).finally(()=>{this.running=null;});};
  this.timer=setInterval(tick,30000);this.timer.unref();tick();
 }
 async onModuleDestroy(){clearInterval(this.timer);await this.running;}
 async scan(){
  for(let i=0;i<50;i++)if(!await this.drainOne())break;
  await this.checkOverdue();
  // Bound completed technical records; audit and notification evidence remain intact.
  await this.database.pool.query("DELETE FROM notification_sources WHERE id IN (SELECT id FROM notification_sources WHERE processed_at<clock_timestamp()-interval '7 days' LIMIT 1000)");
 }
 async drainOne(){
  if(!readNotificationConfig().enabled)return false;
  return this.database.transaction(async client=>{
   const source=(await client.query('SELECT * FROM notification_sources WHERE processed_at IS NULL ORDER BY occurred_at,id FOR UPDATE SKIP LOCKED LIMIT 1')).rows[0];
   if(!source)return false;
   if(source.kind==='trip')await this.trip(client,source);
   else await this.dispatcherMessage(client,source);
   await client.query('UPDATE notification_sources SET processed_at=clock_timestamp() WHERE id=$1',[source.id]);
   return true;
  });
 }
 async trip(client,source){
  const trip=(await client.query("SELECT *,to_char(business_date,'DD.MM.YYYY') AS date_label FROM trips WHERE id=$1",[source.aggregate_id])).rows[0];
  if(!trip)return;
  const recipients=(await client.query('SELECT user_id FROM trip_assignments WHERE trip_id=$1 AND active ORDER BY user_id',[trip.id])).rows.map(x=>x.user_id);
  const removed=[...new Set(source.removed_user_ids||[])].filter(id=>!recipients.includes(id));
  for(let index=0;index<removed.length;index+=50)await enqueueNotification(client,{
   eventKey:`source:${source.id}:removed:${index}`,type:'trip_changed',recipientIds:removed.slice(index,index+50),scope:scopeOf(trip),
   title:'Назначение на рейс отменено',body:`Ваше назначение на рейс ${trip.reference.slice(0,120)} на ${trip.date_label} снято. Уточните дальнейшие действия у диспетчера.`,
   entityType:'trip_assignment',entityId:trip.id,correlationId:randomUUID(),occurredAt:source.occurred_at,
  });
  // Chunking prevents a large imported assignment from blocking the durable queue.
  for(let index=0;index<recipients.length;index+=50)await enqueueNotification(client,{
   eventKey:`source:${source.id}:${index}`,type:(source.new_trip||source.new_assignment)?'trip_assigned':'trip_changed',recipientIds:recipients.slice(index,index+50),
   scope:scopeOf(trip),title:(source.new_trip||source.new_assignment)?'Назначен рейс':'Рейс изменён',
   body:`Рейс ${trip.reference.slice(0,120)} на ${trip.date_label}. Откройте приложение и проверьте актуальное назначение.`,
   entityType:'trip',entityId:trip.id,correlationId:randomUUID(),occurredAt:source.occurred_at,
  });
 }
 async dispatcherMessage(client,source){
  const row=(await client.query(`SELECT t.*,m.sender_id FROM communications_messages m
   JOIN communications_tickets t ON t.id=m.ticket_id WHERE m.id=$1`,[source.aggregate_id])).rows[0];
  if(!row)return;
  // Only the author of an existing request receives a dispatcher reply here.
  // Explicit messages to any other employees use the scoped notification composer.
  const recipient=row.requester_id;
  if(!recipient||recipient===row.sender_id)return;
  await enqueueNotification(client,{
   eventKey:`message:${source.id}`,type:'dispatcher_message',recipientIds:[recipient],scope:scopeOf(row),
   title:'Сообщение диспетчера',body:`Диспетчер ответил по обращению ${row.reference}. Откройте приложение, чтобы ознакомиться с сообщением.`,
   entityType:'communication_ticket',entityId:row.id,actorId:row.sender_id,correlationId:randomUUID(),occurredAt:source.occurred_at,
  });
 }
 async checkOverdue(){
  if(!readNotificationConfig().enabled)return 0;
  return this.database.transaction(async client=>{
   const locked=(await client.query('SELECT pg_try_advisory_xact_lock(917042023) AS ok')).rows[0].ok;
   if(!locked)return 0;
   const result=await client.query(`SELECT t.*,completed.finished_at,
    completed.finished_at+make_interval(hours=>$1::integer) AS due_at,
    to_char(t.business_date,'DD.MM.YYYY') AS date_label,
    'documents-overdue:'||t.id::text||':'||extract(epoch from completed.finished_at)::text||':'||$1::text AS event_key
    FROM trips t
    JOIN LATERAL(SELECT max(occurred_at) AS finished_at FROM workflow_attendance WHERE trip_id=t.id AND kind='check_out') completed ON completed.finished_at IS NOT NULL
    JOIN notification_settings settings ON settings.singleton AND settings.enabled_at IS NOT NULL
    WHERE completed.finished_at+make_interval(hours=>$1::integer)<=clock_timestamp()
      AND completed.finished_at+make_interval(hours=>$1::integer)>=settings.enabled_at
      AND EXISTS(SELECT FROM trip_assignments a WHERE a.trip_id=t.id AND a.active)
      AND (SELECT count(DISTINCT kind) FROM workflow_current_documents d WHERE d.trip_id=t.id AND d.status IN ('pending','accepted') AND d.kind=ANY($2::text[]))<cardinality($2::text[])
      AND NOT EXISTS(SELECT FROM notification_events e WHERE e.event_key='documents-overdue:'||t.id::text||':'||extract(epoch from completed.finished_at)::text||':'||$1::text)
    ORDER BY completed.finished_at,t.id LIMIT 100`,[this.hours,DOCUMENT_KINDS]);
   let count=0;
   for(const trip of result.rows){
    const recipients=(await client.query('SELECT user_id FROM trip_assignments WHERE trip_id=$1 AND active ORDER BY user_id',[trip.id])).rows.map(x=>x.user_id);
    if(!recipients.length)continue;
    // Pending review counts as submitted: a driver's alert must not depend on staff review speed.
    const missing=(await client.query(`SELECT required.kind FROM unnest($2::text[]) AS required(kind) WHERE NOT EXISTS(
     SELECT FROM workflow_current_documents d WHERE d.trip_id=$1 AND d.kind=required.kind AND d.status IN ('pending','accepted'))`,[trip.id,DOCUMENT_KINDS])).rows.map(x=>x.kind);
    const labels={delivery_note:'накладная',waybill:'путевой лист'};
    for(let index=0;index<recipients.length;index+=50)await enqueueNotification(client,{
     eventKey:index?`${trip.event_key}:${index}`:trip.event_key,type:'documents_overdue',recipientIds:recipients.slice(index,index+50),scope:scopeOf(trip),
     title:'Просрочены документы по рейсу',body:`По рейсу ${trip.reference.slice(0,120)} на ${trip.date_label} не сданы: ${missing.map(x=>labels[x]||x).join(', ')}. Срок — ${this.hours} ч после завершения рейса.`,
     entityType:'trip',entityId:trip.id,correlationId:randomUUID(),occurredAt:trip.due_at,
    });count++;
   }
   return count;
  });
 }
}
Injectable()(NotificationSourcesService);Inject(DatabaseService)(NotificationSourcesService,undefined,0);
class NotificationSourcesModule{}
Module({providers:[NotificationSourcesService]})(NotificationSourcesModule);
module.exports={NotificationSourcesModule,NotificationSourcesService,deadlineHours};
