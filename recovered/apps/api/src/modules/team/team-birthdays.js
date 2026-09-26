// SPDX-License-Identifier: MIT
'use strict';
const {randomUUID}=require('node:crypto');
const {Injectable,Inject,Controller,Get,Put,Body,Param,Query,Req,Header,UseGuards}=require('@nestjs/common');
const {DatabaseService}=require('../../platform/database.service');
const {AuthGuard}=require('../identity-access/interface/auth.guard');
const {CurrentActor}=require('../identity-access/interface/current-actor.decorator');
const {TeamService,ROLES}=require('./team.service');
const {object,uuid,fail,forbidden,unavailable,conflict}=require('./team-input');
const TIME_ZONE='Europe/Moscow';
const EMPLOYEE_ROLES=Object.freeze([...ROLES,'driver']);
const moscowDateFormatter=new Intl.DateTimeFormat('en-CA',{timeZone:TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit'});
function moscowToday(now=new Date()){
  const parts=Object.fromEntries(moscowDateFormatter.formatToParts(now).map(part=>[part.type,part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
function validDate(value){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;}
function birthdayOccurrence(month,day,year){
  const leap=year%4===0&&(year%100!==0||year%400===0);
  return `${year}-${String(month).padStart(2,'0')}-${String(month===2&&day===29&&!leap?28:day).padStart(2,'0')}`;
}
function nextBirthday(birthDate,today){
  const birthdayMonth=Number(birthDate.slice(5,7)),birthdayDay=Number(birthDate.slice(8,10)),year=Number(today.slice(0,4));
  let occurrence=birthdayOccurrence(birthdayMonth,birthdayDay,year);
  if(occurrence<today)occurrence=birthdayOccurrence(birthdayMonth,birthdayDay,year+1);
  return {birthdayMonth,birthdayDay,nextBirthday:occurrence,daysUntil:Math.round((Date.parse(occurrence)-Date.parse(today))/86400000)};
}
function congratulationInput(body){
  object(body,['occurrenceDate','congratulated']);
  if(!validDate(body.occurrenceDate)||typeof body.congratulated!=='boolean')fail('Проверьте дату поздравления и отметку выполнения.');
  return body;
}
function birthdayDateInput(body,today){
  object(body,['birthDate','version']);
  if(!Number.isSafeInteger(body.version)||body.version<0||body.version>=2147483646)fail('Укажите актуальную версию профиля.');
  if(body.birthDate!==null&&(!validDate(body.birthDate)||body.birthDate<'1900-01-01'||body.birthDate>today))fail('Укажите корректную дату рождения.');
  return body;
}
class TeamBirthdaysService{
  constructor(database,team){this.database=database;this.team=team;}
  async administrator(client,supplied){
    const actor=await this.team.current(client,supplied);
    if(actor.role!=='access_admin'||actor.impersonation)forbidden('Раздел поздравлений доступен только администратору.');
    return actor;
  }
  async employees(client,actor,scopeId,userId=null){
    const scopes=await this.team.selectedScopes(client,actor,scopeId);
    const companies=[...new Set(scopes.filter(scope=>scope.personalDataVisible).map(scope=>scope.legalEntityId))];
    const result=await client.query(`SELECT u.id AS "userId",u.display_name AS "displayName",u.role,p.birth_date::text AS "birthDate",coalesce(p.version,0) AS "profileVersion"
      FROM users u LEFT JOIN user_profiles p ON p.user_id=u.id
      WHERE u.active AND u.approved AND u.role=ANY($2::text[]) AND ($3::uuid IS NULL OR u.id=$3)
      AND EXISTS(SELECT 1 FROM access_grants g WHERE g.user_id=u.id AND g.legal_entity_id=ANY($1::uuid[]))
      ORDER BY u.display_name,u.id`,[companies,EMPLOYEE_ROLES,userId]);
    return result.rows;
  }
  async list(supplied,scopeId){return this.database.transaction(async client=>{
    const actor=await this.administrator(client,supplied),rows=await this.employees(client,actor,scopeId),today=moscowToday();
    const employees=rows.filter(row=>row.birthDate).map(row=>({...row,...nextBirthday(row.birthDate,today),congratulated:false}));
    if(employees.length){
      const completed=await client.query(`SELECT employee_id AS "userId",occurrence_date::text AS "occurrenceDate" FROM team_birthday_congratulations
        WHERE administrator_id=$1 AND employee_id=ANY($2::uuid[]) AND occurrence_date>=$3::date AND occurrence_date<=($3::date+366) AND congratulated`,[actor.id,employees.map(row=>row.userId),today]);
      const done=new Set(completed.rows.map(row=>`${row.userId}:${row.occurrenceDate}`));
      for(const employee of employees)employee.congratulated=done.has(`${employee.userId}:${employee.nextBirthday}`);
    }
    employees.sort((a,b)=>a.daysUntil-b.daysUntil||a.displayName.localeCompare(b.displayName,'ru')||a.userId.localeCompare(b.userId));
    const employeesWithoutBirthday=rows.filter(row=>!row.birthDate);
    return {today,timeZone:TIME_ZONE,employees,employeesWithoutBirthday,missingBirthDateCount:employeesWithoutBirthday.length};
  });}
  async setDate(supplied,idValue,body,scopeId,correlationId){return this.database.transaction(async client=>{
    const id=uuid(idValue,'сотрудник');
    await this.team.identity.lockUsers(client,[supplied.id,supplied.impersonation?.administratorId,id].filter(Boolean));
    const actor=await this.administrator(client,supplied),input=birthdayDateInput(body,moscowToday()),employee=(await this.employees(client,actor,scopeId,id))[0];
    if(!employee)unavailable();
    if(employee.profileVersion!==input.version)conflict('Профиль уже изменён. Обновите список перед сохранением.');
    let version=employee.profileVersion;
    if(employee.birthDate!==input.birthDate){
      version++;
      await client.query(`INSERT INTO user_profiles(user_id,birth_date,version) VALUES($1,$2,$3)
        ON CONFLICT(user_id) DO UPDATE SET birth_date=EXCLUDED.birth_date,version=EXCLUDED.version,updated_at=clock_timestamp()`,[id,input.birthDate,version]);
      await this.team.audit.append(client,{actorId:actor.id,channel:actor.channel,correlationId:correlationId||randomUUID(),action:'profile.updated',entityType:'user_profile',entityId:id,metadata:{changedFields:['birthDate'],version}});
    }
    return {userId:id,birthDate:input.birthDate,birthdayMonth:input.birthDate?Number(input.birthDate.slice(5,7)):null,birthdayDay:input.birthDate?Number(input.birthDate.slice(8,10)):null,profileVersion:version};
  });}
  async congratulate(supplied,idValue,body,scopeId){return this.database.transaction(async client=>{
    const id=uuid(idValue,'сотрудник'),input=congratulationInput(body);
    // All identity mutations use the same ordered user locks. Holding both rows
    // also keeps a profile change or employee revocation from racing this write.
    await this.team.identity.lockUsers(client,[supplied.id,supplied.impersonation?.administratorId,id].filter(Boolean));
    const actor=await this.administrator(client,supplied),rows=await this.employees(client,actor,scopeId,id),employee=rows[0];
    if(!employee?.birthDate)unavailable();
    const today=moscowToday(),birthday=nextBirthday(employee.birthDate,today);
    if(input.occurrenceDate!==today||birthday.nextBirthday!==today)conflict('Отметить поздравление можно только в день рождения. Обновите список поздравлений.');
    await client.query(`INSERT INTO team_birthday_congratulations(administrator_id,employee_id,occurrence_date,congratulated)
      VALUES($1,$2,$3,$4) ON CONFLICT(administrator_id,employee_id,occurrence_date)
      DO UPDATE SET congratulated=EXCLUDED.congratulated,updated_at=clock_timestamp()
      WHERE team_birthday_congratulations.congratulated IS DISTINCT FROM EXCLUDED.congratulated`,[actor.id,id,input.occurrenceDate,input.congratulated]);
    return {today,timeZone:TIME_ZONE,employee:{...employee,...birthday,congratulated:input.congratulated}};
  });}
}
Injectable()(TeamBirthdaysService);Inject(DatabaseService)(TeamBirthdaysService,undefined,0);Inject(TeamService)(TeamBirthdaysService,undefined,1);
class TeamBirthdaysController{
  constructor(service){this.service=service;}
  list(actor,scopeId){return this.service.list(actor,scopeId);}
  congratulate(actor,id,body,scopeId){return this.service.congratulate(actor,id,body,scopeId);}
  setDate(actor,id,body,scopeId,request){return this.service.setDate(actor,id,body,scopeId,request.correlationId);}
}
Inject(TeamBirthdaysService)(TeamBirthdaysController,undefined,0);Controller('team/birthdays')(TeamBirthdaysController);UseGuards(AuthGuard)(TeamBirthdaysController);
for(const[name,decorator]of [['list',Get()],['congratulate',Put(':id/congratulation')],['setDate',Put(':id/date')]]){
  const descriptor=Object.getOwnPropertyDescriptor(TeamBirthdaysController.prototype,name);decorator(TeamBirthdaysController.prototype,name,descriptor);
  Header('Cache-Control','no-store')(TeamBirthdaysController.prototype,name,descriptor);CurrentActor()(TeamBirthdaysController.prototype,name,0);
}
Query('responsibilityScopeId')(TeamBirthdaysController.prototype,'list',1);
Param('id')(TeamBirthdaysController.prototype,'congratulate',1);Body()(TeamBirthdaysController.prototype,'congratulate',2);Query('responsibilityScopeId')(TeamBirthdaysController.prototype,'congratulate',3);
Param('id')(TeamBirthdaysController.prototype,'setDate',1);Body()(TeamBirthdaysController.prototype,'setDate',2);Query('responsibilityScopeId')(TeamBirthdaysController.prototype,'setDate',3);Req()(TeamBirthdaysController.prototype,'setDate',4);
module.exports={TeamBirthdaysService,TeamBirthdaysController,TIME_ZONE,moscowToday,nextBirthday,birthdayOccurrence,congratulationInput,birthdayDateInput};
