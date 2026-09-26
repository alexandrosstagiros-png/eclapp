'use strict';
const {randomUUID,randomBytes}=require('node:crypto');
const {readNotificationConfig}=require('./notification-config');
const {MaxBotAdapter,MaxTransportError}=require('./max-bot.adapter');
const {enqueueNotification,eligibleRecipient,appendNotificationAudit,scopeValues,scopeMatch,digest}=require('./notification-enqueue');
const {eventScope,noticeColumns}=require('./notifications.service');
const due=`((d.status='pending' AND d.next_attempt_at<=clock_timestamp()) OR (d.status='sending' AND d.lease_until<=clock_timestamp()))`;
const errorCode=error=>error instanceof MaxTransportError?error.code:'NETWORK_OR_TIMEOUT';
class NotificationsWorker {
  constructor(database,identity){this.database=database;this.identity=identity;this.running=false;}
  config(){return readNotificationConfig();}
  async onModuleInit(){
    const config=this.config();
    if(!config.enabled)return;
    await this.database.pool.query('UPDATE notification_settings SET enabled_at=COALESCE(enabled_at,$1) WHERE singleton',[config.enabledAt||new Date()]);
    if(config.nodeEnv==='test')return;
    this.adapter=new MaxBotAdapter(config);
    this.timer=setInterval(()=>this.runOnce().catch(()=>console.error('MAX notification worker failed')),500);
    this.timer.unref();
  }
  async onModuleDestroy(){clearInterval(this.timer);if(this.activeRun)await this.activeRun.catch(()=>{});this.adapter?.close();}
  async runOnce(port=this.adapter){
    if(this.running||!this.config().enabled)return;
    this.running=true;
    this.activeRun=(async()=>{
      await this.schedule();
      if(port){
        const answer=await this.claimAnswer();
        if(answer)await this.deliverAnswer(answer,port);
        const delivery=await this.claimDelivery();
        if(delivery)await this.deliver(delivery,port);
      }
      if(!this.cleanedAt||Date.now()-this.cleanedAt>3600000){await this.cleanup();this.cleanedAt=Date.now();}
    })();
    try{await this.activeRun;}finally{this.running=false;this.activeRun=null;}
  }
  async schedule(){
    const config=this.config();
    // Claim original notifications only; escalation never recursively escalates.
    await this.database.transaction(async client=>{
      const rows=(await client.query(`SELECT ${noticeColumns} FROM notifications n JOIN notification_events e ON e.id=n.event_id
        WHERE n.acknowledged_at IS NULL AND n.parent_notification_id IS NULL
        AND EXISTS(SELECT FROM users u WHERE u.id=n.recipient_id AND u.active AND u.approved
          AND EXISTS(SELECT FROM access_grants g WHERE g.user_id=u.id AND g.legal_entity_id=e.legal_entity_id
            AND g.region_id=e.region_id AND g.project_id=e.project_id AND g.responsibility_scope_id=e.responsibility_scope_id)
          AND u.role<>'external_recruiter'
    AND (u.role<>'recruiter' OR e.entity_type<>'trip')
          AND (u.role<>'driver' OR e.entity_type<>'trip' OR EXISTS(SELECT FROM trip_assignments a WHERE a.user_id=u.id AND a.trip_id=e.entity_id AND a.active)))
        AND n.created_at>clock_timestamp()-($3*interval '1 second')
        AND ((n.reminded_at IS NULL AND n.first_sent_at<=clock_timestamp()-($1*interval '1 second'))
          OR (n.escalated_at IS NULL AND n.created_at<=clock_timestamp()-($2*interval '1 second')))
        ORDER BY n.created_at,n.id LIMIT 20 FOR UPDATE OF n SKIP LOCKED`,[config.reminderSeconds,config.escalationSeconds,config.deliveryTtlSeconds])).rows;
      for(const notice of rows){
        if(!await eligibleRecipient(client,notice.recipient_id,eventScope(notice),notice.entity_type,notice.entity_id))continue;
        if(!notice.reminded_at&&notice.first_sent_at&&notice.first_sent_at.getTime()<=Date.now()-config.reminderSeconds*1000){
          await client.query("INSERT INTO notification_deliveries(id,notification_id,kind) VALUES($1,$2,'reminder') ON CONFLICT(notification_id,kind) DO NOTHING",[randomUUID(),notice.id]);
          await client.query('UPDATE notifications SET reminded_at=clock_timestamp() WHERE id=$1',[notice.id]);
        }
        if(!notice.escalated_at&&notice.created_at.getTime()<=Date.now()-config.escalationSeconds*1000){
          const recipients=(await client.query(`SELECT u.id FROM users u WHERE u.id<>$1 AND u.active AND u.approved
            AND u.role IN ('dispatcher','access_admin') AND EXISTS(SELECT FROM access_grants g WHERE g.user_id=u.id AND ${scopeMatch('g')})
            AND EXISTS(SELECT FROM channel_identities c WHERE c.user_id=u.id AND c.provider='max') ORDER BY u.id LIMIT 20`,
            [notice.recipient_id,...scopeValues(eventScope(notice))])).rows.map(r=>r.id);
          if(recipients.length)await enqueueNotification(client,{eventKey:`escalation:${notice.id}`,type:'escalation',recipientIds:recipients,
            scope:eventScope(notice),title:`Нет подтверждения: ${notice.title}`.slice(0,120),
            body:`Сотрудник не подтвердил получение уведомления. Проверьте связь с ним.\n\n${notice.title}\n${notice.body}`.slice(0,2000),
            entityType:notice.entity_type,entityId:notice.entity_id},{config,internal:true,parentId:notice.id});
          await client.query('UPDATE notifications SET escalated_at=clock_timestamp() WHERE id=$1',[notice.id]);
          await appendNotificationAudit(client,'notifications.escalated',notice.id,null,null,{recipientCount:recipients.length});
        }
      }
    });
  }
  async lockNotice(client,id){
    // Escalations always lock their original notice first. ACK of the original
    // and transmission of an escalation therefore have a deterministic order.
    const parentId=(await client.query('SELECT parent_notification_id FROM notifications WHERE id=$1',[id])).rows[0]?.parent_notification_id;
    const parent=parentId?(await client.query('SELECT acknowledged_at FROM notifications WHERE id=$1 FOR UPDATE',[parentId])).rows[0]:null;
    const notice=(await client.query(`SELECT ${noticeColumns} FROM notifications n JOIN notification_events e ON e.id=n.event_id WHERE n.id=$1 FOR UPDATE OF n`,[id])).rows[0];
    if(notice)notice.parent_acknowledged_at=parent?.acknowledged_at;
    return notice;
  }
  async claimDelivery(){
    const candidates=(await this.database.pool.query(`SELECT d.id,n.id AS notification_id,n.recipient_id FROM notification_deliveries d
      JOIN notifications n ON n.id=d.notification_id WHERE ${due} ORDER BY d.next_attempt_at,d.created_at LIMIT 30`)).rows;
    for(const candidate of candidates){
      const claim=await this.database.transaction(async client=>{
        await this.identity.lockUsers(client,[candidate.recipient_id]);
        const notice=await this.lockNotice(client,candidate.notification_id);
        const delivery=(await client.query(`SELECT d.* FROM notification_deliveries d WHERE d.id=$1 AND ${due} FOR UPDATE`,[candidate.id])).rows[0];
        if(!delivery)return;
        const fail=async code=>{await client.query("UPDATE notification_deliveries SET status='failed',last_error=$2,lease_token=NULL,lease_until=NULL WHERE id=$1",[delivery.id,code]);};
        if(notice.acknowledged_at){await fail('ACKNOWLEDGED');return;}
        if(notice.created_at.getTime()<=Date.now()-this.config().deliveryTtlSeconds*1000){await fail('EXPIRED');return;}
        if(!await eligibleRecipient(client,notice.recipient_id,eventScope(notice),notice.entity_type,notice.entity_id)){await fail('ACCESS_REVOKED');return;}
        if(notice.parent_acknowledged_at){await fail('PARENT_ACKNOWLEDGED');return;}
        if(delivery.attempts>=6){await fail('RETRIES_EXHAUSTED');return;}
        const userId=await this.identity.channelForUser(client,notice.recipient_id,'max');
        const dialog=userId?(await client.query('SELECT * FROM max_notification_dialogs WHERE provider_user_id=$1 FOR UPDATE',[userId])).rows[0]:null;
        if(!dialog?.bot_started||dialog.muted===true){
          await client.query("UPDATE notification_deliveries SET status='pending',next_attempt_at=clock_timestamp()+interval '60 seconds',lease_token=NULL,lease_until=NULL,last_error=$2 WHERE id=$1",[delivery.id,!userId?'NOT_LINKED':dialog?.muted?'MUTED':'BOT_NOT_STARTED']);return;
        }
        if(dialog.next_send_at.getTime()>Date.now()){
          await client.query("UPDATE notification_deliveries SET status='pending',next_attempt_at=$2,lease_token=NULL,lease_until=NULL WHERE id=$1",[delivery.id,dialog.next_send_at]);return;
        }
        const token=randomBytes(32).toString('base64url'),lease=randomUUID();
        await client.query(`INSERT INTO notification_ack_tokens(token_hash,delivery_id,provider_user_id) VALUES($1,$2,$3)`,[digest(token),delivery.id,userId]);
        await client.query(`UPDATE notification_deliveries SET status='sending',attempts=attempts+1,provider_user_id=$2,
          lease_token=$3,lease_until=clock_timestamp()+interval '30 seconds',last_error=NULL WHERE id=$1`,[delivery.id,userId,lease]);
        await client.query("UPDATE max_notification_dialogs SET next_send_at=clock_timestamp()+interval '500 milliseconds' WHERE provider_user_id=$1",[userId]);
        return {id:delivery.id,notificationId:notice.id,recipientId:notice.recipient_id,lease,userId,ackToken:token,
          text:`${delivery.kind==='reminder'?'Напоминание: ':''}${notice.title}\n\n${notice.body}\n\nПодтвердите получение кнопкой «Принял».`,attempt:delivery.attempts+1};
      });
      if(claim)return claim;
    }
  }
  async deliver(claim,port){
    let receipt,error;
    try{
      receipt=await this.database.transaction(async client=>{
        // Keep the user and dialog locks for the bounded HTTP request. Revocation,
        // binding changes and signed stop/mute updates cannot race its authorization.
        await this.identity.lockUsers(client,[claim.recipientId]);
        const notice=await this.lockNotice(client,claim.notificationId);
        const delivery=(await client.query("SELECT id FROM notification_deliveries WHERE id=$1 AND lease_token=$2 AND status='sending' AND lease_until>clock_timestamp() FOR UPDATE",[claim.id,claim.lease])).rows[0];
        if(!delivery)return null;
        if(notice.parent_acknowledged_at){
          await client.query("UPDATE notification_deliveries SET status='failed',last_error='PARENT_ACKNOWLEDGED',lease_token=NULL,lease_until=NULL WHERE id=$1",[claim.id]);return null;
        }
        const external=await this.identity.channelForUser(client,claim.recipientId,'max');
        if(notice.acknowledged_at||notice.created_at.getTime()<=Date.now()-this.config().deliveryTtlSeconds*1000||external!==claim.userId||
          !await eligibleRecipient(client,claim.recipientId,eventScope(notice),notice.entity_type,notice.entity_id)){
          await client.query("UPDATE notification_deliveries SET status='failed',last_error='EXPIRED_OR_REVOKED',lease_token=NULL,lease_until=NULL WHERE id=$1",[claim.id]);return null;
        }
        const dialog=(await client.query('SELECT bot_started,muted FROM max_notification_dialogs WHERE provider_user_id=$1 FOR UPDATE',[external])).rows[0];
        if(!dialog?.bot_started||dialog.muted===true){
          await client.query("UPDATE notification_deliveries SET status='pending',next_attempt_at=clock_timestamp()+interval '60 seconds',last_error='DIALOG_UNAVAILABLE',lease_token=NULL,lease_until=NULL WHERE id=$1",[claim.id]);return null;
        }
        const result=await port.send(claim);
        if(typeof result?.messageId!=='string'||!result.messageId||result.messageId.length>256)throw new MaxTransportError('INVALID_RECEIPT');
        return result;
      });
      if(receipt===null)return;
    }
    catch(caught){error=caught;}
    await this.database.transaction(async client=>{
      await this.identity.lockUsers(client,[claim.recipientId]);
      await client.query('SELECT id FROM notifications WHERE id=$1 FOR UPDATE',[claim.notificationId]);
      if(!error){
        const sent=await client.query(`UPDATE notification_deliveries SET status='sent',sent_at=clock_timestamp(),provider_message_id=$3,
          lease_token=NULL,lease_until=NULL WHERE id=$1 AND lease_token=$2 AND status='sending' RETURNING id`,[claim.id,claim.lease,receipt.messageId]);
        if(sent.rowCount){
          await client.query('UPDATE notifications SET first_sent_at=COALESCE(first_sent_at,clock_timestamp()) WHERE id=$1',[claim.notificationId]);
          await appendNotificationAudit(client,'notifications.sent',claim.notificationId,null,null,{deliveryId:claim.id,attempt:claim.attempt});
        }
      }else{
        const code=errorCode(error),terminal=claim.attempt>=6||['TOKEN_REJECTED','CHAT_UNAVAILABLE','NETWORK_DISABLED_IN_TEST'].includes(code);
        const seconds=Math.min(900,Math.max(10*2**(claim.attempt-1),error.retryAfterSeconds||0));
        await client.query(`UPDATE notification_deliveries SET status=$3,last_error=$4,next_attempt_at=clock_timestamp()+($5*interval '1 second'),
          lease_token=NULL,lease_until=NULL WHERE id=$1 AND lease_token=$2 AND status='sending'`,[claim.id,claim.lease,terminal?'failed':'pending',code,seconds]);
      }
    });
  }
  async claimAnswer(){
    const candidates=(await this.database.pool.query(`SELECT d.callback_id,n.id AS notification_id,n.recipient_id FROM max_callback_answers d
      JOIN notifications n ON n.id=d.notification_id WHERE ${due} ORDER BY d.next_attempt_at LIMIT 20`)).rows;
    for(const candidate of candidates){
      const claim=await this.database.transaction(async client=>{
        await this.identity.lockUsers(client,[candidate.recipient_id]);
        const notice=await this.lockNotice(client,candidate.notification_id);
        const answer=(await client.query(`SELECT d.* FROM max_callback_answers d WHERE callback_id=$1 AND ${due} FOR UPDATE`,[candidate.callback_id])).rows[0];
        if(!answer)return;
        const userId=await this.identity.channelForUser(client,candidate.recipient_id,'max');
        if(answer.expires_at.getTime()<=Date.now()||answer.attempts>=3||userId!==answer.provider_user_id||!notice.acknowledged_at||
          !await eligibleRecipient(client,candidate.recipient_id,eventScope(notice),notice.entity_type,notice.entity_id)){
          await client.query("UPDATE max_callback_answers SET status='failed',last_error='EXPIRED_OR_REVOKED',lease_token=NULL,lease_until=NULL WHERE callback_id=$1",[answer.callback_id]);return;
        }
        const dialog=(await client.query('SELECT * FROM max_notification_dialogs WHERE provider_user_id=$1 FOR UPDATE',[userId])).rows[0];
        if(!dialog?.bot_started||dialog.muted===true){
          await client.query("UPDATE max_callback_answers SET next_attempt_at=clock_timestamp()+interval '5 seconds' WHERE callback_id=$1",[answer.callback_id]);return;
        }
        if(dialog.next_send_at.getTime()>Date.now()){
          await client.query('UPDATE max_callback_answers SET next_attempt_at=$2 WHERE callback_id=$1',[answer.callback_id,dialog.next_send_at]);return;
        }
        const lease=randomUUID();
        await client.query("UPDATE max_notification_dialogs SET next_send_at=clock_timestamp()+interval '500 milliseconds' WHERE provider_user_id=$1",[userId]);
        await client.query("UPDATE max_callback_answers SET status='sending',attempts=attempts+1,lease_token=$2,lease_until=clock_timestamp()+interval '30 seconds' WHERE callback_id=$1",[answer.callback_id,lease]);
        return {callbackId:answer.callback_id,notificationId:notice.id,recipientId:candidate.recipient_id,userId,lease,attempt:answer.attempts+1};
      });
      if(claim)return claim;
    }
  }
  async deliverAnswer(claim,port){
    let error;
    try{
      const delivered=await this.database.transaction(async client=>{
        await this.identity.lockUsers(client,[claim.recipientId]);
        const notice=await this.lockNotice(client,claim.notificationId);
        const answer=(await client.query("SELECT callback_id FROM max_callback_answers WHERE callback_id=$1 AND lease_token=$2 AND status='sending' AND expires_at>clock_timestamp() AND lease_until>clock_timestamp() FOR UPDATE",[claim.callbackId,claim.lease])).rows[0];
        if(!answer)return false;
        const external=await this.identity.channelForUser(client,claim.recipientId,'max');
        const dialog=(await client.query('SELECT bot_started,muted FROM max_notification_dialogs WHERE provider_user_id=$1 FOR UPDATE',[claim.userId])).rows[0];
        if(external!==claim.userId||!dialog?.bot_started||dialog.muted===true||!await eligibleRecipient(client,claim.recipientId,eventScope(notice),notice.entity_type,notice.entity_id)){
          await client.query("UPDATE max_callback_answers SET status='failed',last_error='EXPIRED_OR_REVOKED',lease_token=NULL,lease_until=NULL WHERE callback_id=$1",[claim.callbackId]);return false;
        }
        const result=await port.answer(claim);
        if(result?.ok!==true)throw new MaxTransportError('INVALID_RECEIPT');
        return true;
      });
      if(!delivered)return;
    }catch(caught){error=caught;}
    await this.database.pool.query(`UPDATE max_callback_answers SET status=$3,last_error=$4,lease_token=NULL,lease_until=NULL,
      next_attempt_at=clock_timestamp()+interval '3 seconds' WHERE callback_id=$1 AND lease_token=$2 AND status='sending'`,
      [claim.callbackId,claim.lease,error?(claim.attempt>=3?'failed':'pending'):'sent',error?errorCode(error):null]);
  }
  async cleanup(){
    await this.database.pool.query("DELETE FROM notification_ack_tokens WHERE token_hash IN (SELECT token_hash FROM notification_ack_tokens WHERE expires_at<clock_timestamp() LIMIT 1000)");
    await this.database.pool.query("DELETE FROM max_notification_updates WHERE update_hash IN (SELECT update_hash FROM max_notification_updates WHERE received_at<clock_timestamp()-interval '9 hours' LIMIT 1000)");
    await this.database.pool.query("DELETE FROM max_callback_answers WHERE callback_id IN (SELECT callback_id FROM max_callback_answers WHERE expires_at<clock_timestamp()-interval '7 days' LIMIT 1000)");
  }
}
module.exports={NotificationsWorker};
