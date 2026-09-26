'use strict';
const {withAuditAttribution}=require('../../platform/audit-context');
const {randomUUID,createHash}=require('node:crypto');
const {BadRequestException,ConflictException}=require('@nestjs/common');
const {readNotificationConfig}=require('./notification-config');
const digest=value=>createHash('sha256').update(value).digest('hex');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const scopeValues=s=>[s.legalEntityId,s.regionId,s.projectId,s.responsibilityScopeId];
const scopeMatch=(alias,start=2)=>`${alias}.legal_entity_id=$${start} AND ${alias}.region_id=$${start+1} AND ${alias}.project_id=$${start+2} AND ${alias}.responsibility_scope_id=$${start+3}`;
async function appendNotificationAudit(client,action,entityId,correlationId,actorId,metadata={}) {
  await client.query('SELECT append_audit($1::jsonb)',[JSON.stringify(withAuditAttribution({schemaVersion:1,action,entityType:'notification',entityId,
    correlationId:correlationId||randomUUID(),channel:'system',...(actorId?{actorId}:{}),metadata}))]);
}
async function eligibleRecipient(client,userId,scope,entityType,entityId) {
  return (await client.query(`SELECT u.id FROM users u WHERE u.id=$1 AND u.active AND u.approved
    AND EXISTS(SELECT FROM access_grants g WHERE g.user_id=u.id AND ${scopeMatch('g')})
    AND u.role<>'external_recruiter'
    AND (u.role<>'recruiter' OR $6::text<>'trip')
    AND (u.role<>'driver' OR $6::text<>'trip' OR EXISTS(SELECT FROM trip_assignments a WHERE a.user_id=u.id AND a.trip_id=$7 AND a.active))`,
    [userId,...scopeValues(scope),entityType,entityId])).rowCount===1;
}
async function enqueueNotification(client,input,options={}) {
  const config=options.config||readNotificationConfig();
  if (!config.enabled) return {eventId:null,notificationIds:[],skipped:'disabled'};
  const recipients=[...new Set(input.recipientIds||[])].sort();
  const types=options.internal?['trip_assigned','trip_changed','dispatcher_message','documents_overdue','escalation']:
    ['trip_assigned','trip_changed','dispatcher_message','documents_overdue'];
  if (!types.includes(input.type)||typeof input.eventKey!=='string'||input.eventKey.length<1||input.eventKey.length>200||
      recipients.length<1||recipients.length>50||recipients.some(id=>!UUID.test(id))||
      !input.scope||scopeValues(input.scope).some(id=>!UUID.test(id))||!UUID.test(input.entityId)||
      typeof input.entityType!=='string'||!/^[a-z_]{1,64}$/.test(input.entityType)||
      typeof input.title!=='string'||!input.title.trim()||input.title.length>120||
      typeof input.body!=='string'||!input.body.trim()||input.body.length>2000||
      /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(input.title+input.body)) throw new BadRequestException('Invalid notification');
  const now=new Date();
  const occurredAt=input.occurredAt?new Date(input.occurredAt):now;
  if (!Number.isFinite(occurredAt.getTime())||occurredAt.getTime()>Date.now()+30000) throw new BadRequestException('Invalid notification time');
  const settings=(await client.query(`UPDATE notification_settings SET enabled_at=COALESCE(enabled_at,$1::timestamptz)
    WHERE singleton RETURNING enabled_at`,[config.enabledAt||now])).rows[0];
  if (occurredAt.getTime()<settings.enabled_at.getTime()) return {eventId:null,notificationIds:[],skipped:'before_enabled'};
  const payloadHash=digest(JSON.stringify({type:input.type,recipients,scope:scopeValues(input.scope),title:input.title,body:input.body,
    entityType:input.entityType,entityId:input.entityId,actorId:input.actorId||null,parent:options.parentId||null}));
  const eventId=randomUUID();
  const inserted=await client.query(`INSERT INTO notification_events(id,event_key,payload_hash,type,legal_entity_id,region_id,project_id,
    responsibility_scope_id,title,body,entity_type,entity_id,actor_id,occurred_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
    ON CONFLICT(event_key) DO NOTHING RETURNING id`,[eventId,input.eventKey,payloadHash,input.type,...scopeValues(input.scope),input.title,input.body,
    input.entityType,input.entityId,input.actorId||null,occurredAt]);
  if (!inserted.rowCount) {
    const existing=(await client.query('SELECT id,payload_hash FROM notification_events WHERE event_key=$1',[input.eventKey])).rows[0];
    if(existing.payload_hash!==payloadHash)throw new ConflictException('Notification key reused');
    return {eventId:existing.id,notificationIds:(await client.query('SELECT id FROM notifications WHERE event_id=$1 ORDER BY id',[existing.id])).rows.map(r=>r.id)};
  }
  const notificationIds=[];
  for(const id of recipients) {
    if(!await eligibleRecipient(client,id,input.scope,input.entityType,input.entityId))continue;
    const notificationId=randomUUID();
    await client.query('INSERT INTO notifications(id,event_id,recipient_id,parent_notification_id) VALUES($1,$2,$3,$4)',[notificationId,eventId,id,options.parentId||null]);
    await client.query("INSERT INTO notification_deliveries(id,notification_id,kind) VALUES($1,$2,'initial')",[randomUUID(),notificationId]);
    notificationIds.push(notificationId);
    await appendNotificationAudit(client,'notifications.queued',notificationId,input.correlationId,input.actorId,{eventId,type:input.type});
  }
  return {eventId,notificationIds};
}
module.exports={enqueueNotification,eligibleRecipient,appendNotificationAudit,scopeValues,scopeMatch,UUID,digest};
