// SPDX-License-Identifier: MIT
'use strict';
const {createHash,randomUUID}=require('node:crypto');
const {Injectable,Inject,Controller,Get,Put,Body,Param,Query,Req,Header,UseGuards,UnauthorizedException}=require('@nestjs/common');
const {DatabaseService}=require('../../platform/database.service');
const {IdentityRepository}=require('../identity-access/infrastructure/identity.repository');
const {AuthGuard}=require('../identity-access/interface/auth.guard');
const {CurrentActor}=require('../identity-access/interface/current-actor.decorator');
const {TeamService,tuple,whereScope,ROLES}=require('./team.service');
const {object,uuid,fail,conflict,unavailable}=require('./team-input');
const MAX_AVATAR_BYTES=256*1024;
const hash=value=>createHash('sha256').update(value).digest('hex');
function contact(value,maximum,label,multiline=false){
  if(value===null||value==='')return null;
  if(typeof value!=='string'||value.length>maximum||(multiline?/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u:/[\u0000-\u001f\u007f]/u).test(value))fail(`Проверьте поле «${label}».`);
  return value.trim()||null;
}
function jpegPhoto(value){
  object(value,['contentBase64']);const encoded=value.contentBase64;
  if(typeof encoded!=='string'||encoded.length>Math.ceil(MAX_AVATAR_BYTES/3)*4||encoded.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded))fail('Некорректное содержимое фотографии.');
  const content=Buffer.from(encoded,'base64');
  if(content.toString('base64')!==encoded||content.length>MAX_AVATAR_BYTES||content.length<20||content[0]!==0xff||content[1]!==0xd8||content.at(-2)!==0xff||content.at(-1)!==0xd9)fail('Прикрепите фотографию JPEG размером до 256 КБ.');
  let offset=2,dimensions=null,sawScan=false;
  while(offset<content.length-2){
    if(content[offset++]!==0xff)fail('Некорректная структура JPEG.');
    while(content[offset]===0xff)offset++;
    const marker=content[offset++];
    if(marker===0x00||marker===0xd8||marker===0xd9||marker>=0xd0&&marker<=0xd7||offset+2>content.length-2)fail('Некорректная структура JPEG.');
    const length=content.readUInt16BE(offset);
    if(length<2||offset+length>content.length-2)fail('Некорректная структура JPEG.');
    if([0xc0,0xc1,0xc2].includes(marker)){
      if(dimensions||length<8)fail('Некорректная структура JPEG.');
      const height=content.readUInt16BE(offset+3),width=content.readUInt16BE(offset+5),components=content[offset+7];
      if(content[offset+2]!==8||!width||!height||width>512||height>512||components<1||components>4||length!==8+3*components)fail('Фотография должна быть JPEG размером не более 512 × 512 пикселей.');
      dimensions={width,height};
    }else if(marker>=0xc0&&marker<=0xcf&&![0xc4,0xc8,0xcc].includes(marker))fail('Используйте обычный или прогрессивный JPEG.');
    if(marker===0xda){
      if(!dimensions||length<6||offset+length>=content.length-2)fail('Некорректная структура JPEG.');
      sawScan=true;offset+=length;
      // Scan entropy may contain stuffed FF bytes and restart markers; other
      // markers begin the next JPEG segment (including progressive scans).
      while(offset<content.length-2){
        if(content[offset]!==0xff){offset++;continue;}
        if(content[offset+1]===0x00||(content[offset+1]>=0xd0&&content[offset+1]<=0xd7)){offset+=2;continue;}
        break;
      }
    }else offset+=length;
  }
  if(offset!==content.length-2||!dimensions||!sawScan)fail('Некорректная структура JPEG.');
  return {content,sha256:hash(content),...dimensions};
}
function profileInput(body){
  object(body,['operationId','version','email','phone','contacts','birthDate','photo']);
  if(!Number.isSafeInteger(body.version)||body.version<0||body.version>=2147483646)fail('Укажите актуальную версию профиля.');
  const input={operationId:uuid(body.operationId,'операция'),version:body.version};
  for(const [key,maximum,label,multiline] of [['email',254,'email',false],['phone',64,'телефон',false],['contacts',2000,'контакты',true]])if(body[key]!==undefined)input[key]=contact(body[key],maximum,label,multiline);
  if(input.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(input.email))fail('Укажите корректный email.');
  if(input.phone&&!/^[+\d() .-]{5,64}$/u.test(input.phone))fail('Укажите корректный контактный телефон.');
  if(body.birthDate!==undefined){
    const date=body.birthDate===''?null:body.birthDate;
    if(date!==null&&(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||date<'1900-01-01'||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date||date>new Date().toISOString().slice(0,10)))fail('Укажите корректную дату рождения.');
    input.birthDate=date;
  }
  if(body.photo!==undefined)input.photo=body.photo===null?null:jpegPhoto(body.photo);
  const {operationId,photo,...fingerprint}=input;
  if('photo'in input)fingerprint.photo=photo===null?null:{sha256:photo.sha256};
  return {...input,payloadSha256:hash(JSON.stringify(fingerprint))};
}
const PROFILE_COLUMNS='user_id AS "userId",email,phone,contacts,birth_date::text AS "birthDate",avatar_content AS "avatarContent",avatar_sha256 AS "avatarSha256",avatar_version AS "avatarVersion",version,updated_at AS "updatedAt"';
class TeamProfileService{
  constructor(database,identity,team){this.database=database;this.identity=identity;this.team=team;}
  async current(client,supplied){
    await this.identity.lockUsers(client,[supplied.id,supplied.impersonation?.administratorId].filter(Boolean));
    const actor=await this.identity.actorBySession(client,supplied.sessionId);
    if(!actor||actor.id!==supplied.id||actor.authVersion!==supplied.authVersion||actor.role!==supplied.role)throw new UnauthorizedException('Сессия недействительна.');
    return actor;
  }
  async stored(client,userId){return(await client.query(`SELECT ${PROFILE_COLUMNS} FROM user_profiles WHERE user_id=$1`,[userId])).rows[0]||{userId,email:null,phone:null,contacts:null,birthDate:null,avatarContent:null,avatarSha256:null,avatarVersion:0,version:0,updatedAt:null};}
  dto(row,person,canEdit,viewer){
    const {avatarContent,avatarSha256,birthDate,...publicRow}=row;
    const birthday={birthdayMonth:birthDate?Number(birthDate.slice(5,7)):null,birthdayDay:birthDate?Number(birthDate.slice(8,10)):null};
    if(viewer.role==='access_admin'&&!viewer.impersonation)birthday.birthDate=birthDate;
    return {...publicRow,...birthday,displayName:person.displayName,role:person.role,updatedAt:row.updatedAt?new Date(row.updatedAt).toISOString():null,
      avatarDataUrl:avatarContent?`data:image/jpeg;base64,${avatarContent.toString('base64')}`:null,canEdit};
  }
  async self(supplied){return this.database.transaction(async client=>{const actor=await this.current(client,supplied);return this.dto(await this.stored(client,actor.id),actor,true,actor);});}
  async save(supplied,body,correlationId){return this.database.transaction(async client=>{
    const actor=await this.current(client,supplied),input=profileInput(body);
    await this.team.lockRecord(client,'profile-operation',input.operationId);
    const previous=(await client.query('SELECT user_id,payload_sha256 FROM user_profile_operations WHERE id=$1',[input.operationId])).rows[0];
    const current=await this.stored(client,actor.id);
    if(previous){if(previous.user_id!==actor.id||previous.payload_sha256!==input.payloadSha256)conflict('Операция профиля уже использована с другими данными.');return this.dto(current,actor,true,actor);}
    if(current.version!==input.version)conflict('Профиль уже изменён. Обновите его перед сохранением.');
    const next={...current},changedFields=[];
    for(const key of ['email','phone','contacts','birthDate'])if(key in input&&input[key]!==current[key]){next[key]=input[key];changedFields.push(key);}
    if('photo'in input&&(input.photo?.sha256||null)!==current.avatarSha256){next.avatarContent=input.photo?.content||null;next.avatarSha256=input.photo?.sha256||null;next.avatarVersion++;changedFields.push('photo');}
    let saved=current;
    if(changedFields.length){saved=(await client.query(`INSERT INTO user_profiles(user_id,email,phone,contacts,birth_date,avatar_content,avatar_sha256,avatar_version,version)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(user_id) DO UPDATE SET email=EXCLUDED.email,phone=EXCLUDED.phone,contacts=EXCLUDED.contacts,
      birth_date=EXCLUDED.birth_date,avatar_content=EXCLUDED.avatar_content,avatar_sha256=EXCLUDED.avatar_sha256,avatar_version=EXCLUDED.avatar_version,version=EXCLUDED.version,updated_at=clock_timestamp()
      RETURNING ${PROFILE_COLUMNS}`,[actor.id,next.email,next.phone,next.contacts,next.birthDate,next.avatarContent,next.avatarSha256,next.avatarVersion,current.version+1])).rows[0];
      await this.team.audit.append(client,{actorId:actor.id,channel:actor.channel,correlationId:correlationId||randomUUID(),action:'profile.updated',entityType:'user_profile',entityId:actor.id,metadata:{changedFields,version:saved.version}});
    }
    await client.query('INSERT INTO user_profile_operations(id,user_id,payload_sha256) VALUES($1,$2,$3)',[input.operationId,actor.id,input.payloadSha256]);
    return this.dto(saved,actor,true,actor);
  });}
  async directory(supplied,scopeId){return this.database.transaction(async client=>{
    const actor=await this.team.current(client,supplied),scopes=await this.team.selectedScopes(client,actor,scopeId);
    const visibleCompanies=[...new Set(scopes.filter(scope=>scope.personalDataVisible).map(scope=>scope.legalEntityId))];
    const rows=await client.query(`SELECT DISTINCT u.id AS "userId",coalesce(p.avatar_version,0) AS "avatarVersion" FROM users u
      JOIN access_grants g ON g.user_id=u.id LEFT JOIN user_profiles p ON p.user_id=u.id
      WHERE g.legal_entity_id=ANY($1::uuid[]) AND u.active AND u.approved AND u.role=ANY($2::text[])
      AND (g.legal_entity_id=ANY($3::uuid[]) OR u.id=$4) ORDER BY u.id`,[[...new Set(scopes.map(scope=>scope.legalEntityId))],ROLES,visibleCompanies,actor.id]);
    return{profiles:rows.rows};
  });}
  async colleague(supplied,idValue,scopeId,avatarOnly=false){return this.database.transaction(async client=>{
    const id=uuid(idValue,'сотрудник');
    await this.identity.lockUsers(client,[supplied.id,supplied.impersonation?.administratorId,id].filter(Boolean));
    const actor=await this.team.current(client,supplied),scopes=await this.team.selectedScopes(client,actor,scopeId);
    const memberships=await client.query('SELECT DISTINCT legal_entity_id FROM access_grants WHERE user_id=$1',[id]);
    const companies=new Set(memberships.rows.map(row=>row.legal_entity_id));
    const scope=scopes.find(candidate=>companies.has(candidate.legalEntityId)&&(id===actor.id||candidate.personalDataVisible));
    if(!scope)unavailable();
    await this.team.lockScope(client,scope);
    if(id!==actor.id&&!scope.personalDataVisible)unavailable();
    const people=await this.team.peopleRows(client,actor,scope),person=people.find(row=>row.id===id);
    if(!person)unavailable();
    const row=await this.stored(client,id),profile=this.dto(row,person,id===actor.id,actor);
    return avatarOnly?{userId:id,avatarVersion:row.avatarVersion,avatarDataUrl:profile.avatarDataUrl}:profile;
  });}
}
Injectable()(TeamProfileService);Inject(DatabaseService)(TeamProfileService,undefined,0);Inject(IdentityRepository)(TeamProfileService,undefined,1);Inject(TeamService)(TeamProfileService,undefined,2);
class ProfileController{
  constructor(service){this.service=service;}
  self(actor){return this.service.self(actor);}
  save(actor,body,request){return this.service.save(actor,body,request.correlationId);}
}
class TeamProfileController{
  constructor(service){this.service=service;}
  directory(actor,scopeId){return this.service.directory(actor,scopeId);}
  profile(actor,id,scopeId){return this.service.colleague(actor,id,scopeId);}
  avatar(actor,id,scopeId){return this.service.colleague(actor,id,scopeId,true);}
}
for(const [ControllerClass,path,routes] of [[ProfileController,'profile',[['self',Get()],['save',Put()]]],[TeamProfileController,'team',[['directory',Get('profile-directory')],['profile',Get('profiles/:id')],['avatar',Get('profiles/:id/avatar')]]]]){
  Inject(TeamProfileService)(ControllerClass,undefined,0);Controller(path)(ControllerClass);UseGuards(AuthGuard)(ControllerClass);
  for(const[name,decorator]of routes){const descriptor=Object.getOwnPropertyDescriptor(ControllerClass.prototype,name);decorator(ControllerClass.prototype,name,descriptor);Header('Cache-Control','no-store')(ControllerClass.prototype,name,descriptor);CurrentActor()(ControllerClass.prototype,name,0);}
}
Body()(ProfileController.prototype,'save',1);Req()(ProfileController.prototype,'save',2);
Query('responsibilityScopeId')(TeamProfileController.prototype,'directory',1);
for(const name of ['profile','avatar']){Param('id')(TeamProfileController.prototype,name,1);Query('responsibilityScopeId')(TeamProfileController.prototype,name,2);}
module.exports={TeamProfileService,ProfileController,TeamProfileController,profileInput,jpegPhoto,MAX_AVATAR_BYTES};
