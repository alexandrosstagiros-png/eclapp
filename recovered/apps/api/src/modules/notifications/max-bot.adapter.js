'use strict';
const https=require('node:https');
const tls=require('node:tls');
const fs=require('node:fs');
class MaxTransportError extends Error {
  constructor(code,retryAfterSeconds=0){super(code);this.code=code;this.retryAfterSeconds=retryAfterSeconds;}
}
class MaxBotAdapter {
  constructor(config){
    this.token=config.botToken;
    if(!this.token||/\s/.test(this.token))throw new Error('Invalid MAX bot token');
    const extra=config.caFile?fs.readFileSync(config.caFile):null;
    if(extra&&extra.length>1024*1024)throw new Error('MAX CA bundle too large');
    this.agent=new https.Agent({keepAlive:true,maxSockets:2,rejectUnauthorized:true,
      ...(extra?{ca:[...tls.rootCertificates,extra]}:{})});
  }
  close(){this.agent.destroy();}
  async request(path,body){
    if(process.env.NODE_ENV==='test')throw new MaxTransportError('NETWORK_DISABLED_IN_TEST');
    const payload=Buffer.from(JSON.stringify(body));
    return new Promise((resolve,reject)=>{
      let done=false;
      const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);error?reject(error):resolve(value);};
      const request=https.request({hostname:'platform-api2.max.ru',port:443,path,method:'POST',agent:this.agent,
        headers:{Authorization:this.token,'Content-Type':'application/json','Content-Length':payload.length}},response=>{
        const chunks=[];let size=0;
        response.on('data',chunk=>{size+=chunk.length;if(size>65536){request.destroy();finish(new MaxTransportError('INVALID_RECEIPT'));}else chunks.push(chunk);});
        response.on('error',()=>finish(new MaxTransportError('NETWORK_OR_TIMEOUT')));
        response.on('end',()=>{
          const status=response.statusCode||500;
          if(status!==200){
            const code=status===429?'RATE_LIMITED':status===403?'CHAT_UNAVAILABLE':status===401?'TOKEN_REJECTED':'API_REJECTED';
            const retry=Math.min(900,Math.max(0,Number(response.headers['retry-after'])||0));
            return finish(new MaxTransportError(code,retry));
          }
          if(!response.headers['content-type']?.includes('application/json'))return finish(new MaxTransportError('INVALID_RECEIPT'));
          try{finish(null,JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch{finish(new MaxTransportError('INVALID_RECEIPT'));}
        });
      });
      const timer=setTimeout(()=>{request.destroy();finish(new MaxTransportError('NETWORK_OR_TIMEOUT'));},6000);
      request.on('error',()=>finish(new MaxTransportError('NETWORK_OR_TIMEOUT')));
      request.end(payload);
    });
  }
  async send({userId,text,ackToken}){
    if(!/^[1-9]\d{0,15}$/.test(userId)||!Number.isSafeInteger(Number(userId))||!text||text.length>4000||!/^[A-Za-z0-9_-]{43}$/.test(ackToken))throw new MaxTransportError('API_REJECTED');
    const result=await this.request(`/messages?user_id=${userId}&disable_link_preview=true`,{text,notify:true,
      attachments:[{type:'inline_keyboard',payload:{buttons:[[{type:'callback',text:'Принял',payload:'ack:'+ackToken}]]}}]});
    const message=result?.message;
    if(typeof message?.body?.mid!=='string'||message.body.mid.length<1||message.body.mid.length>256||
      message.recipient?.chat_type!=='dialog'||String(message.recipient?.user_id)!==userId)throw new MaxTransportError('INVALID_RECEIPT');
    return {messageId:message.body.mid};
  }
  async answer({callbackId}){
    if(typeof callbackId!=='string'||callbackId.length<1||callbackId.length>256)throw new MaxTransportError('API_REJECTED');
    const result=await this.request(`/answers?callback_id=${encodeURIComponent(callbackId)}`,{
      message:{text:'Принято. Подтверждение получения сохранено.',attachments:[],notify:false}});
    if(result?.success!==true)throw new MaxTransportError('INVALID_RECEIPT');
    return {ok:true};
  }
}
module.exports={MaxBotAdapter,MaxTransportError};
