'use strict';
const common=require('@nestjs/common');
const {Throttle}=require('@nestjs/throttler');
const {IdentityAccessModule}=require('../identity-access/identity-access.module');
const {AuthGuard}=require('../identity-access/interface/auth.guard');
const {AuthService}=require('../identity-access/application/auth.service');
const {IdentityRepository}=require('../identity-access/infrastructure/identity.repository');
const {DatabaseService}=require('../../platform/database.service');
const {ConfigService}=require('../../platform/config');
const {NotificationsService}=require('./notifications.service');
const {NotificationsWorker}=require('./notifications.worker');
for(const [provider,deps] of [[NotificationsService,[DatabaseService,AuthService,IdentityRepository,ConfigService]],[NotificationsWorker,[DatabaseService,IdentityRepository]]]){
  common.Injectable()(provider);
  deps.forEach((dep,index)=>common.Inject(dep)(provider,undefined,index));
}
class NotificationsController {
  constructor(service){this.service=service;}
  status(request){return this.service.status(request.actor);}
  list(request){return this.service.list(request.actor);}
  link(body,request){return this.service.link(request.actor,body,request.correlationId);}
  ack(id,request){return this.service.ack(request.actor,id,request.correlationId);}
  scopes(request){return this.service.scopes(request.actor);}
  recipients(scopeId,request){return this.service.recipients(request.actor,scopeId);}
  message(body,request){return this.service.message(request.actor,body,request.correlationId);}
}
common.Controller('notifications')(NotificationsController);
common.Inject(NotificationsService)(NotificationsController,undefined,0);
common.UseGuards(AuthGuard)(NotificationsController);
const routes=[['status',common.Get('status'),[common.Req()]],['scopes',common.Get('scopes'),[common.Req()]],
  ['recipients',common.Get('recipients'),[common.Query('scopeId'),common.Req()]],['list',common.Get(),[common.Req()]],
  ['link',common.Post('max/link'),[common.Body(),common.Req()]],['message',common.Post('messages'),[common.Body(),common.Req()]],
  ['ack',common.Post(':id/ack'),[common.Param('id'),common.Req()]]];
for(const [name,decorator,parameters] of routes){
  const proto=NotificationsController.prototype,descriptor=Object.getOwnPropertyDescriptor(proto,name);
  decorator(proto,name,descriptor);common.Header('Cache-Control','no-store, private')(proto,name,descriptor);
  if(['link','ack'].includes(name))common.HttpCode(200)(proto,name,descriptor);
  parameters.forEach((parameter,index)=>parameter(proto,name,index));
  Reflect.defineMetadata('design:paramtypes',parameters.map(()=>Object),proto,name);
}
class MaxNotificationsWebhookController {
  constructor(service){this.service=service;}
  webhook(secret,body,request){return this.service.webhook(secret,body,request.correlationId);}
}
common.Controller('integrations/max')(MaxNotificationsWebhookController);
common.Inject(NotificationsService)(MaxNotificationsWebhookController,undefined,0);
const proto=MaxNotificationsWebhookController.prototype,descriptor=Object.getOwnPropertyDescriptor(proto,'webhook');
common.Post('webhook')(proto,'webhook',descriptor);common.HttpCode(200)(proto,'webhook',descriptor);
common.Header('Cache-Control','no-store')(proto,'webhook',descriptor);
Throttle({default:{limit:600,ttl:60000}})(proto,'webhook',descriptor);
common.Headers('x-max-bot-api-secret')(proto,'webhook',0);common.Body()(proto,'webhook',1);common.Req()(proto,'webhook',2);
Reflect.defineMetadata('design:paramtypes',[String,Object,Object],proto,'webhook');
class NotificationsModule {}
common.Module({imports:[IdentityAccessModule],controllers:[NotificationsController,MaxNotificationsWebhookController],
  providers:[NotificationsService,NotificationsWorker],exports:[NotificationsService,NotificationsWorker]})(NotificationsModule);
module.exports={NotificationsModule,NotificationsService,NotificationsWorker};
