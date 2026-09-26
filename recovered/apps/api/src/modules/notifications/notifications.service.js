'use strict';
const {randomUUID,timingSafeEqual}=require('node:crypto');
const common=require('@nestjs/common');
const {MaxAuthAdapter}=require('../identity-access/infrastructure/max-auth.adapter');
const {readNotificationConfig}=require('./notification-config');
const {enqueueNotification,eligibleRecipient,appendNotificationAudit,scopeValues,scopeMatch,UUID,digest}=require('./notification-enqueue');
const eventScope=row=>({legalEntityId:row.legal_entity_id,regionId:row.region_id,projectId:row.project_id,responsibilityScopeId:row.responsibility_scope_id});
const noticeColumns=`n.*,e.type,e.title,e.body,e.entity_type,e.entity_id,e.legal_entity_id,e.region_id,e.project_id,e.responsibility_scope_id`;
class NotificationsService {
  constructor(database,auth,identity,config){this.database=database;this.auth=auth;this.identity=identity;this.authConfig=config;}
  config(){return readNotificationConfig();}
  async current(client,actor){await this.identity.lockUsers(client,[actor.id]);return this.auth.requireCurrentActor(client,actor);}
  async link(actor,body,correlationId){
    if(actor.impersonation)throw new common.ForbiddenException('Return to your own account to link MAX');
    if(!body||Object.keys(body).some(k=>k!=='initData')||typeof body.initData!=='string'||Buffer.byteLength(body.initData)>16384)throw new common.BadRequestException();
    let verified;
    try{verified=new MaxAuthAdapter(this.authConfig.value.maxBotToken,this.authConfig.value.maxAuthMaxAgeSeconds).verify(body.initData);}
    catch{throw new common.BadRequestException('MAX data expired or invalid');}
    await this.database.transaction(async client=>{
      const current=await this.current(client,actor);
      if(current.impersonation||!current.grants.length)throw new common.ForbiddenException();
      const existing=await this.identity.channelForUser(client,current.id,'max');
      const owner=await this.identity.channelUser(client,verified.providerUserId,'max');
      if((existing&&existing!==verified.providerUserId)||(owner&&owner!==current.id))throw new common.ConflictException();
      if(!existing){
        if(verified.expiresAt.getTime()<=Date.now()||!await this.identity.consumeReplay(client,digest('max-notification-link\0'+verified.replayHash),verified.expiresAt))throw new common.BadRequestException('MAX data expired or already used');
        if(!await this.identity.bindChannel(client,current.id,verified.providerUserId,'max'))throw new common.ConflictException();
        await appendNotificationAudit(client,'notifications.max_linked',current.id,correlationId,current.id,{provider:'max'});
      }
      await client.query('INSERT INTO max_notification_dialogs(provider_user_id) VALUES($1) ON CONFLICT DO NOTHING',[verified.providerUserId]);
    });
    return this.status(actor);
  }
  async visibleRows(client,actor,limit=20){
    const rows=(await client.query(`SELECT ${noticeColumns},
      CASE WHEN EXISTS(SELECT FROM notification_deliveries d WHERE d.notification_id=n.id AND d.status='sent') THEN 'sent'
      WHEN EXISTS(SELECT FROM notification_deliveries d WHERE d.notification_id=n.id AND d.status IN ('pending','sending')) THEN 'pending' ELSE 'failed' END AS delivery_status
      FROM notifications n JOIN notification_events e ON e.id=n.event_id WHERE n.recipient_id=$1
      AND EXISTS(SELECT FROM access_grants g WHERE g.user_id=$1 AND g.legal_entity_id=e.legal_entity_id AND g.region_id=e.region_id
        AND g.project_id=e.project_id AND g.responsibility_scope_id=e.responsibility_scope_id)
      AND ($2::boolean OR e.entity_type<>'trip' OR EXISTS(SELECT FROM trip_assignments a WHERE a.user_id=$1 AND a.trip_id=e.entity_id AND a.active))
      AND ($4::boolean OR e.entity_type<>'trip')
      ORDER BY n.created_at DESC,n.id DESC LIMIT $3`,[actor.id,actor.role!=='driver',limit,actor.role!=='recruiter'])).rows;
    return rows;
  }
  async status(actor){
    return this.database.transaction(async client=>{
      const current=await this.current(client,actor);
      const external=await this.identity.channelForUser(client,current.id,'max');
      const dialog=external?(await client.query('SELECT bot_started,muted FROM max_notification_dialogs WHERE provider_user_id=$1',[external])).rows[0]:null;
      const counts=(await client.query(`SELECT count(*) FILTER(WHERE n.acknowledged_at IS NOT NULL)::int AS acked,
        count(*) FILTER(WHERE n.acknowledged_at IS NULL AND EXISTS(SELECT FROM notification_deliveries d WHERE d.notification_id=n.id AND d.status<>'failed'))::int AS pending,
        count(*) FILTER(WHERE n.acknowledged_at IS NULL AND NOT EXISTS(SELECT FROM notification_deliveries d WHERE d.notification_id=n.id AND d.status<>'failed'))::int AS failed
        FROM notifications n JOIN notification_events e ON e.id=n.event_id WHERE n.recipient_id=$1
        AND EXISTS(SELECT FROM access_grants g WHERE g.user_id=$1 AND g.legal_entity_id=e.legal_entity_id AND g.region_id=e.region_id AND g.project_id=e.project_id AND g.responsibility_scope_id=e.responsibility_scope_id)
        AND ($2::boolean OR e.entity_type<>'trip' OR EXISTS(SELECT FROM trip_assignments a WHERE a.user_id=$1 AND a.trip_id=e.entity_id AND a.active))
        AND ($3::boolean OR e.entity_type<>'trip')`,[current.id,current.role!=='driver',current.role!=='recruiter'])).rows[0];
      const config=this.config();
      return {enabled:config.enabled,maxLinked:Boolean(external),botStarted:Boolean(dialog?.bot_started),muted:dialog?.muted??null,...counts,botUrl:config.botUrl};
    });
  }
  async list(actor){return this.database.transaction(async client=>{
    const current=await this.current(client,actor);
    return {items:(await this.visibleRows(client,current)).map(n=>({id:n.id,type:n.type,title:n.title,body:n.body,createdAt:n.created_at.toISOString(),
      acknowledgedAt:n.acknowledged_at?.toISOString()??null,entityType:n.entity_type,entityId:n.entity_id,isEscalation:Boolean(n.parent_notification_id),deliveryStatus:n.delivery_status}))};
  });}
  async acknowledge(client,userId,id,correlationId){
    const notice=(await client.query(`SELECT ${noticeColumns} FROM notifications n JOIN notification_events e ON e.id=n.event_id
      WHERE n.id=$1 AND n.recipient_id=$2 FOR UPDATE OF n`,[id,userId])).rows[0];
    if(!notice||!await eligibleRecipient(client,userId,eventScope(notice),notice.entity_type,notice.entity_id))throw new common.NotFoundException();
    if(!notice.acknowledged_at){
      notice.acknowledged_at=(await client.query('UPDATE notifications SET acknowledged_at=clock_timestamp() WHERE id=$1 RETURNING acknowledged_at',[id])).rows[0].acknowledged_at;
      await client.query("UPDATE notification_deliveries SET status='failed',last_error='ACKNOWLEDGED',lease_token=NULL,lease_until=NULL WHERE notification_id=$1 AND status IN ('pending','sending')",[id]);
      await appendNotificationAudit(client,'notifications.acknowledged',id,correlationId,userId);
    }
    return {ok:true,acknowledgedAt:notice.acknowledged_at.toISOString()};
  }
  async ack(actor,id,correlationId){if(!UUID.test(id))throw new common.BadRequestException();return this.database.transaction(async client=>{
    const current=await this.current(client,actor);return this.acknowledge(client,current.id,id,correlationId);
  });}
  async scope(client,actor,scopeId){
    if(!['dispatcher','access_admin'].includes(actor.role))throw new common.ForbiddenException();
    return (await client.query(`SELECT g.legal_entity_id,g.region_id,g.project_id,g.responsibility_scope_id,g.personal_data_visible
      FROM access_grants g WHERE g.user_id=$1 AND g.responsibility_scope_id=$2`,[actor.id,scopeId])).rows[0];
  }
  async scopes(actor){return this.database.transaction(async client=>{
    const current=await this.current(client,actor);
    if(!['dispatcher','access_admin'].includes(current.role))throw new common.ForbiddenException();
    return {items:(await client.query(`SELECT s.id,s.name,g.legal_entity_id AS "legalEntityId",g.region_id AS "regionId",g.project_id AS "projectId",
      g.responsibility_scope_id AS "responsibilityScopeId",p.name AS "projectName",r.name AS "regionName",l.name AS "legalEntityName"
      FROM access_grants g JOIN responsibility_scopes s ON s.id=g.responsibility_scope_id JOIN projects p ON p.id=g.project_id
      JOIN regions r ON r.id=g.region_id JOIN legal_entities l ON l.id=g.legal_entity_id WHERE g.user_id=$1 ORDER BY l.name,p.name,s.name`,[current.id])).rows};
  });}
  async recipients(actor,scopeId){if(!UUID.test(scopeId||''))throw new common.BadRequestException();return this.database.transaction(async client=>{
    const current=await this.current(client,actor),scope=await this.scope(client,current,scopeId);
    if(!scope)throw new common.ForbiddenException();
    return {items:(await client.query(`SELECT u.id,CASE WHEN $6::boolean OR u.id=$1 THEN u.display_name ELSE 'Сотрудник '||right(u.id::text,6) END AS "displayName",u.role,
      EXISTS(SELECT FROM channel_identities c WHERE c.user_id=u.id AND c.provider='max') AS "maxLinked"
      FROM users u WHERE u.active AND u.approved AND EXISTS(SELECT FROM access_grants g WHERE g.user_id=u.id AND ${scopeMatch('g')})
      ORDER BY u.display_name,u.id LIMIT 500`,[current.id,...scopeValues(eventScope(scope)),scope.personal_data_visible])).rows};
  });}
  async message(actor,body,correlationId){
    if(!body||Object.keys(body).some(k=>!['recipientIds','responsibilityScopeId','title','body','idempotencyKey'].includes(k))||
      !Array.isArray(body.recipientIds)||body.recipientIds.length<1||body.recipientIds.length>50||body.recipientIds.some(id=>!UUID.test(id))||
      !UUID.test(body.responsibilityScopeId)||!UUID.test(body.idempotencyKey))throw new common.BadRequestException();
    if(!this.config().enabled)throw new common.ServiceUnavailableException();
    return this.database.transaction(async client=>{
      await this.identity.lockUsers(client,[actor.id,...body.recipientIds]);
      const current=await this.auth.requireCurrentActor(client,actor),row=await this.scope(client,current,body.responsibilityScopeId);
      if(!row)throw new common.ForbiddenException();const scope=eventScope(row);
      for(const id of body.recipientIds)if(!await eligibleRecipient(client,id,scope,'notification_message',body.idempotencyKey))throw new common.ForbiddenException();
      return enqueueNotification(client,{eventKey:`dispatcher:${current.id}:${body.idempotencyKey}`,type:'dispatcher_message',recipientIds:body.recipientIds,
        scope,title:body.title,body:body.body,entityType:'notification_message',entityId:body.idempotencyKey,actorId:current.id,correlationId});
    });
  }
  async webhook(secret,body,correlationId){
    const config=this.config();
    if(!config.webhookSecret)throw new common.NotFoundException();
    if(typeof secret!=='string'||secret.length>256||!timingSafeEqual(Buffer.from(digest(secret),'hex'),Buffer.from(digest(config.webhookSecret),'hex')))throw new common.UnauthorizedException();
    const type=body?.update_type;
    if(!['bot_started','bot_stopped','dialog_muted','dialog_unmuted','dialog_removed','message_callback'].includes(type))return {ok:true};
    const timestamp=body.timestamp;
    if(!Number.isSafeInteger(timestamp)||timestamp>Date.now()+30000||timestamp<Date.now()-8*3600000)return {ok:true};
    const user=type==='message_callback'?body.callback?.user:body.user;
    if(!Number.isSafeInteger(user?.user_id)||user.user_id<=0||user.is_bot===true)return {ok:true};
    const external=String(user.user_id),time=new Date(timestamp);
    if(type!=='message_callback'&&(!Number.isSafeInteger(body.chat_id)||body.chat_id===0))return {ok:true};
    if(type==='message_callback'&&(typeof body.callback?.callback_id!=='string'||body.callback.callback_id.length>256||!body.callback.callback_id||
      typeof body.callback.payload!=='string'||!/^ack:[A-Za-z0-9_-]{43}$/.test(body.callback.payload)))return {ok:true};
    await this.database.transaction(async client=>{
      // Callback uses the same user -> notification -> delivery ordering as the worker.
      const userId=type==='message_callback'?await this.identity.channelUser(client,external,'max'):undefined;
      if(userId)await this.identity.lockUsers(client,[userId]);
      const updateHash=digest(JSON.stringify([type,timestamp,external,body.chat_id??null,body.callback?.callback_id??null,body.callback?.payload??null]));
      if(!(await client.query('INSERT INTO max_notification_updates(update_hash) VALUES($1) ON CONFLICT DO NOTHING RETURNING update_hash',[updateHash])).rowCount)return;
      if(type==='message_callback'){
        if(!userId)return;
        const tokenHash=digest(body.callback.payload.slice(4));
        const delivery=(await client.query(`SELECT d.notification_id,d.provider_message_id FROM notification_ack_tokens t
          JOIN notification_deliveries d ON d.id=t.delivery_id JOIN notifications n ON n.id=d.notification_id
          WHERE t.token_hash=$1 AND t.provider_user_id=$2 AND t.expires_at>clock_timestamp() AND n.recipient_id=$3`,[tokenHash,external,userId])).rows[0];
        if(!delivery)return;
        // The opaque token is tied to this user and delivery. A retry may have produced
        // a second MAX message; both genuine buttons must remain usable.
        try{await this.acknowledge(client,userId,delivery.notification_id,correlationId);}catch(error){if(error instanceof common.NotFoundException)return;throw error;}
        await client.query(`INSERT INTO max_callback_answers(callback_id,notification_id,provider_user_id) VALUES($1,$2,$3)
          ON CONFLICT(callback_id) DO NOTHING`,[body.callback.callback_id,delivery.notification_id,external]);
      } else {
        await client.query('INSERT INTO max_notification_dialogs(provider_user_id) VALUES($1) ON CONFLICT DO NOTHING',[external]);
        if(['bot_started','bot_stopped','dialog_removed'].includes(type))await client.query(`UPDATE max_notification_dialogs SET bot_started=$2,
          lifecycle_at=$3,chat_id=$4,updated_at=clock_timestamp() WHERE provider_user_id=$1 AND (lifecycle_at IS NULL OR lifecycle_at<$3 OR (lifecycle_at=$3 AND NOT $2))`,
          [external,type==='bot_started',time,String(body.chat_id)]);
        else await client.query(`UPDATE max_notification_dialogs SET muted=$2,mute_at=$3,updated_at=clock_timestamp()
          WHERE provider_user_id=$1 AND (mute_at IS NULL OR mute_at<$3 OR (mute_at=$3 AND $2))`,[external,type==='dialog_muted',time]);
      }
    });
    return {ok:true};
  }
}
module.exports={NotificationsService,eventScope,noticeColumns};
