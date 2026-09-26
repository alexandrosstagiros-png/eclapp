// SPDX-License-Identifier: MIT
'use strict';
const { randomUUID } = require('node:crypto');
const { fail, conflict, forbidden, uuid, string, choice, instant, date, SOURCES, STAGES } = require('./recruitment-input');
const OPERATORS = ['manager','dispatcher','access_admin'];
const RESULTS = ['inquiry','connected','no_answer','callback','thinking','declined'];
const SECURITY = ['not_requested','documents','submitted','in_review','clarification','approved','rejected','not_required'];
const CONTACT_COLUMNS = `responsibility_scope_id AS "responsibilityScopeId",id,candidate_id AS "candidateId",application_id AS "applicationId",result,source,occurred_at AS "occurredAt",recorded_at AS "recordedAt",actor_id AS "actorId",notes,origin`;
function pageNumber(value, fallback, max = 100000) {
  const number = value == null || value === '' ? fallback : Number(value);
  if (!Number.isSafeInteger(number) || number < 1 || number > max) fail('Проверьте номер и размер страницы.');
  return number;
}
function optionalId(value, label) { return value == null || value === '' ? null : uuid(value, label); }
function boolQuery(value) { if (value == null || value === '' || value === 'false') return false; if(value === 'true') return true; fail('Проверьте признак архива.'); }
function canonical(value) { if (Array.isArray(value)) return value.map(canonical); if(value && typeof value==='object') return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])); return value; }
function contactInput(body) {
  if (!body || typeof body !== 'object') fail();
  const input = { id:uuid(body.id), responsibilityScopeId:uuid(body.responsibilityScopeId), candidateId:uuid(body.candidateId), applicationId:optionalId(body.applicationId,'подбор'),
    result:choice(body.result,RESULTS,'результат контакта'), source:body.source ? choice(body.source,SOURCES,'источник') : null,
    occurredAt:instant(body.occurredAt), notes:string(body.notes,4000,'комментарий'), completeTaskId:optionalId(body.completeTaskId,'задача'),nextAction:null };
  if(input.result==='inquiry' && !input.source) fail('Укажите источник нового обращения.');
  if(body.nextAction) input.nextAction={title:string(body.nextAction.title,300,'следующее действие',true),dueAt:instant(body.nextAction.dueAt,true),assigneeId:uuid(body.nextAction.assigneeId,'исполнитель')};
  if(['no_answer','callback','thinking'].includes(input.result) && !input.nextAction) fail('Назначьте следующий контакт и его срок.');
  return input;
}
function workflowInput(body, kind) {
  if (!body || typeof body !== 'object' || !Number.isSafeInteger(body.version) || body.version<1) fail('Обновите карточку перед сохранением.');
  const input={applicationId:uuid(body.applicationId),responsibilityScopeId:uuid(body.responsibilityScopeId),version:body.version,note:string(body.note,2000,'комментарий')};
  if(kind==='security') return {...input,status:choice(body.status,SECURITY,'статус СБ'),assigneeId:optionalId(body.assigneeId,'проверяющий'),dueAt:instant(body.dueAt)};
  return {...input,status:choice(body.status,['confirmed','no_show'],'результат выхода'),date:date(body.date,body.status==='confirmed')};
}
function createWorkflowMethods({tuple,whereScope,whereRead,whereCandidates,columns,response,publicRequestFields}) {
  return {
    async workflowDirectory(client, actor, scope, grant) {
      const requests = await client.query(`SELECT ${columns('requests')} FROM recruitment_requests WHERE ${whereRead(scope)} ${grant?'AND id=ANY($5::uuid[])':''} ORDER BY title,id LIMIT 10001`, [...tuple(scope),...(grant?[grant.requestIds]:[])]);
      if(requests.rows.length>10000) fail('Слишком много потребностей для справочника.');
      return {requests:requests.rows.map(response).map(row=>grant?Object.fromEntries(publicRequestFields.map(k=>[k,row[k]])):row),
        recruiters:grant?[{id:actor.id,name:actor.displayName}]:await this.recruiters(client,scope),
        requestRecruiters:grant?[]:await this.recruiters(client,scope,['manager','dispatcher','recruiter','access_admin']),
        workflowOperators:grant?[]:await this.recruiters(client,scope,OPERATORS),
        permissions:{securityDecision:OPERATORS.includes(actor.role),confirmStart:OPERATORS.includes(actor.role)},
        integrations:{hh:'external_links',oneC:'not_connected',messengers:'not_connected'}};
    },
    async workflowApplication(client,actor,scope,grant,id) {
      const application=await this.reference(client,scope,'applications',id);
      this.allowedRequest(grant,application.requestId);
      if(grant && application.recruiterId!==actor.id) forbidden();
      await this.ownCandidate(client,actor,scope,grant,application.candidateId);
      return application;
    },
    async worklist(supplied,query={}) {
      const scopeId=query.responsibilityScopeId, page=pageNumber(query.page,1), pageSize=pageNumber(query.pageSize,25,100);
      const view=choice(query.view || 'all',['all','new','today','overdue','security','starts','no_next'],'вид списка');
      const search=string(query.search,200,'поиск'),city=string(query.city,100,'город'),archived=boolQuery(query.archived);
      const kind=query.kind?choice(query.kind,['driver','carrier'],'направление'):null;
      const stage=query.stage?choice(query.stage,STAGES,'этап'):null;
      const source=query.source?choice(query.source,SOURCES,'источник'):null;
      const recruiterId=optionalId(query.recruiterId,'рекрутер');
      return this.database.transaction(async client=>{
        const actor=await this.current(client,supplied),scope=this.selection(actor,scopeId);
        await this.lockScope(client,scope);
        const grant=await this.externalAccess(client,actor,scope);
        const values=[...tuple(scope)], bind=v=>{values.push(v);return `$${values.length}`;};
        const conditions=[grant?whereRead(scope,'c.'):whereCandidates(scope,'c.'),`c.archived=${bind(archived)}`];
        let appAccess='',taskAccess='',contactAccess='',selectedTaskAssignee='';
        if(grant) {
          const who=bind(actor.id), requests=bind(grant.requestIds);
          appAccess=` AND a.recruiter_id=${who} AND a.request_id=ANY(${requests}::uuid[])`;
          taskAccess=` AND t.assignee_id=${who} AND (t.application_id IS NULL OR EXISTS(SELECT 1 FROM recruitment_applications ta WHERE ta.id=t.application_id AND ta.recruiter_id=${who} AND ta.request_id=ANY(${requests}::uuid[])))`;contactAccess=` AND ct.actor_id=${who} AND ct.origin='app' AND (ct.application_id IS NULL OR EXISTS(SELECT 1 FROM recruitment_applications ca WHERE ca.id=ct.application_id AND ca.recruiter_id=${who} AND ca.request_id=ANY(${requests}::uuid[])))`;
          conditions.push(`c.recruiter_id=${who} AND (NOT EXISTS(SELECT 1 FROM recruitment_applications a WHERE a.candidate_id=c.id) OR EXISTS(SELECT 1 FROM recruitment_applications a WHERE a.candidate_id=c.id${appAccess}))`);
          if(recruiterId && recruiterId!==actor.id) forbidden();
        }
        if(recruiterId) {const who=bind(recruiterId);selectedTaskAssignee=` AND t.assignee_id=${who}`;conditions.push(`(c.recruiter_id=${who} OR EXISTS(SELECT 1 FROM recruitment_applications a WHERE a.candidate_id=c.id AND a.recruiter_id=${who}${appAccess}) OR EXISTS(SELECT 1 FROM recruitment_tasks t WHERE t.candidate_id=c.id AND t.status='open' AND t.assignee_id=${who}${taskAccess}))`);}
        if(kind) conditions.push(`c.kind=${bind(kind)}`);
        if(city) conditions.push(`c.city=${bind(city)}`);
        if(source) {const src=bind(source);conditions.push(`(c.source=${src} OR EXISTS(SELECT 1 FROM recruitment_contacts ct WHERE ct.candidate_id=c.id AND ct.source=${src}${contactAccess}))`);}
        if(stage) conditions.push(`EXISTS(SELECT 1 FROM recruitment_applications a WHERE a.candidate_id=c.id AND a.stage=${bind(stage)}${appAccess})`);
        if(search){const pattern=bind(`%${search.replace(/[\\%_]/g,'\\$&')}%`);conditions.push(`(c.full_name ILIKE ${pattern} OR c.phone ILIKE ${pattern} OR EXISTS(SELECT 1 FROM recruitment_applications a JOIN recruitment_requests r ON r.id=a.request_id WHERE a.candidate_id=c.id AND r.title ILIKE ${pattern}${appAccess}))`);}
        const tz=(scope.readScopes?.[0]?.timeZone) || (await client.query('SELECT time_zone FROM regions WHERE id=$1',[scope.regionId])).rows[0]?.time_zone || 'UTC';
        const zone=scope.readScopes ? '(SELECT time_zone FROM regions WHERE id=c.region_id)' : bind(tz),today=`(clock_timestamp() AT TIME ZONE ${zone})::date`;
        const task=(where)=>`EXISTS(SELECT 1 FROM recruitment_tasks t WHERE t.candidate_id=c.id AND t.status='open'${taskAccess}${selectedTaskAssignee} AND ${where})`;
        const app=(where)=>`EXISTS(SELECT 1 FROM recruitment_applications a WHERE a.candidate_id=c.id${appAccess} AND ${where})`;
        const active=`(NOT EXISTS(SELECT 1 FROM recruitment_applications a WHERE a.candidate_id=c.id${appAccess}) OR ${app("a.stage NOT IN ('hired','rejected','reserve')")})`;
        const views={all:'true',new:`(EXISTS(SELECT 1 FROM recruitment_contacts ct WHERE ct.candidate_id=c.id AND ct.result='inquiry'${contactAccess} AND NOT EXISTS(SELECT 1 FROM recruitment_contacts reply WHERE reply.candidate_id=c.id AND reply.result<>'inquiry' AND reply.recorded_at>=ct.recorded_at${contactAccess.replaceAll('ct.','reply.')})) OR (NOT EXISTS(SELECT 1 FROM recruitment_contacts ct WHERE ct.candidate_id=c.id AND ct.result<>'inquiry'${contactAccess}) AND (NOT EXISTS(SELECT 1 FROM recruitment_applications a WHERE a.candidate_id=c.id${appAccess}) OR ${app("a.stage='new'")})))`,
          today:task(`(t.due_at AT TIME ZONE ${zone})::date=${today}`),overdue:task('t.due_at<clock_timestamp()'),
          security:app("(a.stage='security' OR a.security_status IN ('documents','submitted','in_review','clarification')) AND a.stage NOT IN ('rejected','reserve') AND a.security_status NOT IN ('approved','rejected','not_required')"),
          starts:app(`a.stage IN ('internship','paperwork','hired') AND a.attendance_status<>'confirmed'`),
          no_next:`${active} AND NOT ${task('true')}`};
        const where=[...conditions,`${zone}::text<>''`].join(' AND ');
        const countRow=(await client.query(`SELECT ${Object.entries(views).map(([key,predicate])=>`count(*) FILTER(WHERE ${predicate})::integer AS "${key}"`).join(',')} FROM recruitment_candidates c WHERE ${where}`,values)).rows[0];
        const found=await client.query(`SELECT ${columns('candidates','c.')} FROM recruitment_candidates c WHERE ${where} AND ${views[view]} ORDER BY c.updated_at DESC,c.id LIMIT $${values.length+1} OFFSET $${values.length+2}`,[...values,pageSize,(page-1)*pageSize]);
        const candidates=found.rows.map(response),ids=candidates.map(c=>c.id);
        const relatedScope=grant?scope:{readScopes:actor.grants.filter(item=>candidates.some(candidate=>candidate.legalEntityId===item.legalEntityId))};
        const related=await this.workflowRelated(client,actor,relatedScope,grant,ids);
        const contacts=await client.query(`SELECT DISTINCT ON(candidate_id) ${CONTACT_COLUMNS} FROM recruitment_contacts ct WHERE ${whereRead(relatedScope)} AND candidate_id=ANY($5::uuid[]) AND result<>'inquiry' ${grant?"AND actor_id=$6 AND origin='app' AND (application_id IS NULL OR EXISTS(SELECT 1 FROM recruitment_applications ca WHERE ca.id=ct.application_id AND ca.recruiter_id=$6 AND ca.request_id=ANY($7::uuid[])))":''} ORDER BY candidate_id,occurred_at DESC NULLS LAST,id DESC`,[...tuple(relatedScope),ids,...(grant?[actor.id,grant.requestIds]:[])]);
        const cities=(await client.query(`SELECT DISTINCT c.city FROM recruitment_candidates c WHERE ${grant?whereRead(scope,'c.'):whereCandidates(scope,'c.')} AND c.archived=$5 ${grant?`AND c.recruiter_id=$6 AND (NOT EXISTS(SELECT 1 FROM recruitment_applications a WHERE a.candidate_id=c.id) OR EXISTS(SELECT 1 FROM recruitment_applications a WHERE a.candidate_id=c.id AND a.recruiter_id=$6 AND a.request_id=ANY($7::uuid[])))`:''} ORDER BY c.city LIMIT 1000`,[...tuple(scope),archived,...(grant?[actor.id,grant.requestIds]:[])])).rows.map(r=>r.city);
        const {bucket}=(await client.query('SELECT floor(extract(epoch FROM clock_timestamp())/1800)::bigint AS bucket')).rows[0];
        for(const item of scope.readScopes || [scope]) await this.activityEvent(client,actor,item,'data_read',{dedupeKey:`${actor.sessionId}:scope:${bucket}`});
        return {items:candidates.map(candidate=>({candidate,applications:related.applications.filter(a=>a.candidateId===candidate.id),tasks:related.tasks.filter(t=>t.candidateId===candidate.id && (!recruiterId || t.assigneeId===recruiterId)),lastContact:contacts.rows.find(c=>c.candidateId===candidate.id)?response(contacts.rows.find(c=>c.candidateId===candidate.id)):null})),total:countRow[view],page,pageSize,counts:countRow,cities,...await this.workflowDirectory(client,actor,grant?scope:this.selection(actor),grant),serverTime:new Date().toISOString(),timeZone:tz};
      });
    },
    async workflowRelated(client,actor,scope,grant,ids) {
      const applications=await client.query(`SELECT ${columns('applications')} FROM recruitment_applications WHERE ${whereRead(scope)} AND candidate_id=ANY($5::uuid[]) ${grant?'AND recruiter_id=$6 AND request_id=ANY($7::uuid[])':''} ORDER BY created_at,id LIMIT 10001`,[...tuple(scope),ids,...(grant?[actor.id,grant.requestIds]:[])]);
      const tasks=await client.query(`SELECT ${columns('tasks','t.')} FROM recruitment_tasks t WHERE ${whereRead(scope,'t.')} AND candidate_id=ANY($5::uuid[]) ${grant?'AND assignee_id=$6 AND (application_id IS NULL OR EXISTS(SELECT 1 FROM recruitment_applications a WHERE a.id=t.application_id AND a.recruiter_id=$6 AND a.request_id=ANY($7::uuid[])))':''} ORDER BY due_at,id LIMIT 10001`,[...tuple(scope),ids,...(grant?[actor.id,grant.requestIds]:[])]);
      if(applications.rows.length>10000 || tasks.rows.length>10000) fail('Слишком много связанных записей. Уточните выбор кандидатов.');
      return {applications:applications.rows.map(response),tasks:tasks.rows.map(response)};
    },
    async candidateDetail(supplied,query={}) {
      const scopeId=query.responsibilityScopeId,candidateId=uuid(query.candidateId),contactPage=pageNumber(query.contactPage,1),contactPageSize=pageNumber(query.contactPageSize,50,100);
      return this.database.transaction(async client=>{
        const actor=await this.current(client,supplied),sourceScope=await this.recordScope(client,actor,'candidates',candidateId,scopeId);
        const scope=actor.role==='external_recruiter'?sourceScope:{readScopes:actor.grants.filter(item=>item.legalEntityId===sourceScope.legalEntityId)};
        await this.lockScope(client,scope);const grant=await this.externalAccess(client,actor,sourceScope);
        await this.ownCandidate(client,actor,sourceScope,grant,candidateId);
        const candidate=response(await this.reference(client,sourceScope,'candidates',candidateId));
        const related=await this.workflowRelated(client,actor,scope,grant,[candidateId]),ids=related.applications.map(a=>a.id);
        const events=(await client.query(`SELECT id,application_id AS "applicationId",from_stage AS "fromStage",to_stage AS "toStage",occurred_at AS "occurredAt",actor_id AS "actorId" FROM recruitment_events WHERE ${whereRead(scope)} AND application_id=ANY($5::uuid[]) ORDER BY occurred_at DESC,id DESC LIMIT 501`,[...tuple(scope),ids])).rows.map(response);
        const contactWhere=`${whereRead(scope,'ct.')} AND candidate_id=$5 ${grant?"AND actor_id=$6 AND origin='app' AND (application_id IS NULL OR EXISTS(SELECT 1 FROM recruitment_applications a WHERE a.id=ct.application_id AND a.recruiter_id=$6 AND a.request_id=ANY($7::uuid[])))":''}`,args=[...tuple(scope),candidateId,...(grant?[actor.id,grant.requestIds]:[])];
        const contactTotal=Number((await client.query(`SELECT count(*) AS count FROM recruitment_contacts ct WHERE ${contactWhere}`,args)).rows[0].count);
        const contacts=(await client.query(`SELECT ${CONTACT_COLUMNS} FROM recruitment_contacts ct WHERE ${contactWhere} ORDER BY recorded_at DESC,id DESC LIMIT $${args.length+1} OFFSET $${args.length+2}`,[...args,contactPageSize,(contactPage-1)*contactPageSize])).rows.map(response);
        const workflowEvents=(await client.query(`SELECT id,application_id AS "applicationId",kind,occurred_at AS "occurredAt",actor_id AS "actorId",payload FROM recruitment_workflow_events WHERE ${whereRead(scope)} AND application_id=ANY($5::uuid[]) ORDER BY occurred_at DESC,id DESC LIMIT 501`,[...tuple(scope),ids])).rows.map(row=>{
          const event=response(row);if(!OPERATORS.includes(actor.role)){const {note,...publicPayload}=event.payload;event.payload=publicPayload;}if(grant && event.actorId!==actor.id)event.actorId=null;return event;
        });
        return {candidate,...related,events:events.slice(0,500).map(event=>({...event,actorId:grant&&event.actorId!==actor.id?null:event.actorId})),eventsTruncated:events.length>500,contacts,contactTotal,contactPage,contactPageSize,workflowEvents:workflowEvents.slice(0,500),workflowEventsTruncated:workflowEvents.length>500,...await this.workflowDirectory(client,actor,scope,grant)};
      });
    },
    async workflowAudit(client,actor,scope,action,id,metadata,correlationId) {
      await this.audit.append(client,{actorId:actor.id,channel:actor.channel,correlationId:correlationId||randomUUID(),action:`recruitment.${action}`,entityType:'recruitment_workflow',entityId:id,scope,metadata});
    },
    async recordContact(supplied,body,correlationId) {
      const input=contactInput(body);
      return this.database.transaction(async client=>{
        const actor=await this.current(client,supplied,input.nextAction?[input.nextAction.assigneeId]:[]),scope=this.scope(actor,input.responsibilityScopeId);
        await this.lockScope(client,scope);const grant=await this.externalAccess(client,actor,scope);
        await this.ownCandidate(client,actor,scope,grant,input.candidateId);
        const candidate=await this.reference(client,scope,'candidates',input.candidateId);
        if(input.applicationId) {const app=await this.workflowApplication(client,actor,scope,grant,input.applicationId);if(app.candidateId!==candidate.id)fail('Контакт и подбор относятся к разным кандидатам.');}
        const existing=(await client.query('SELECT *,candidate_id AS "candidateId" FROM recruitment_contacts WHERE id=$1',[input.id])).rows[0];
        const payload=canonical(input);
        if(existing){
          if(existing.responsibility_scope_id!==scope.responsibilityScopeId || existing.actor_id!==actor.id) forbidden();
          if(JSON.stringify(canonical(existing.request_payload))!==JSON.stringify(payload)) conflict('Этот контакт уже сохранён с другими данными.');
          const contact=(await client.query(`SELECT ${CONTACT_COLUMNS} FROM recruitment_contacts WHERE id=$1`,[input.id])).rows[0];
          const task=input.nextAction?(await client.query(`SELECT ${columns('tasks')} FROM recruitment_tasks WHERE ${whereScope()} AND id=$5 AND candidate_id=$6 AND application_id IS NOT DISTINCT FROM $7::uuid ${grant?'AND assignee_id=$8':''}`,[...tuple(scope),input.id,candidate.id,input.applicationId,...(grant?[actor.id]:[])])).rows[0]:null;
          return {contact:response(contact),task:task?response(task):null};
        }
        const now=(await client.query('SELECT clock_timestamp() AS now')).rows[0].now;
        const occurred=input.occurredAt?new Date(input.occurredAt):now;
        if(occurred>now)fail('Дата состоявшегося контакта не может быть в будущем.');
        let task=null;
        if(input.nextAction){
          const next=input.nextAction;
          if((await client.query('SELECT id FROM recruitment_tasks WHERE id=$1',[input.id])).rowCount)conflict('Идентификатор действия уже использован. Откройте новую форму контакта.');
          if(new Date(next.dueAt)<=now) fail('Назначьте следующее действие на будущее время.');
          await this.validateRecruiter(client,scope,next.assigneeId);
          if(grant && next.assigneeId!==actor.id) forbidden();
          const assignee=(await client.query('SELECT role FROM users WHERE id=$1',[next.assigneeId])).rows[0];
          if(assignee.role==='external_recruiter'){
            const targetGrant=await this.externalAccess(client,{id:next.assigneeId,role:assignee.role},scope);
            await this.ownCandidate(client,{id:next.assigneeId},scope,targetGrant,candidate.id);
            if(input.applicationId){const app=await this.reference(client,scope,'applications',input.applicationId);this.allowedRequest(targetGrant,app.requestId);if(app.recruiterId!==next.assigneeId)forbidden();}
          }
          task=(await client.query(`INSERT INTO recruitment_tasks(id,legal_entity_id,region_id,project_id,responsibility_scope_id,candidate_id,application_id,title,due_at,assignee_id,status,notes,created_by,updated_by)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'open','',$11,$11) RETURNING ${columns('tasks')}`,[input.id,...tuple(scope),candidate.id,input.applicationId,next.title,next.dueAt,next.assigneeId,actor.id])).rows[0];
        }
        if(input.completeTaskId){
          const current=await this.reference(client,scope,'tasks',input.completeTaskId);
          if(current.workflowKind==='security')fail('Задача СБ завершается только через результат проверки.');
          if(current.candidateId!==candidate.id || (current.applicationId && current.applicationId!==input.applicationId))fail('Завершаемая задача должна относиться к этому контакту и подбору.');
          if(current.assigneeId!==actor.id && !['manager','access_admin'].includes(actor.role))forbidden('Завершить эту задачу может назначенный исполнитель.');
          if(current.status!=='open')conflict('Задача уже завершена. Обновите карточку.');
          await client.query("UPDATE recruitment_tasks SET status='done',completed_at=$2,updated_at=$2,updated_by=$3,version=version+1 WHERE id=$1",[current.id,now,actor.id]);
          await this.activityEvent(client,actor,scope,'task_completed',{entityId:current.id});
        }
        const contact=(await client.query(`INSERT INTO recruitment_contacts(id,legal_entity_id,region_id,project_id,responsibility_scope_id,candidate_id,application_id,result,source,occurred_at,actor_id,notes,request_payload)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING ${CONTACT_COLUMNS}`,[input.id,...tuple(scope),candidate.id,input.applicationId,input.result,input.source||candidate.source,occurred,actor.id,input.notes,payload])).rows[0];
        await this.workflowAudit(client,actor,scope,'contact.recorded',input.id,{candidateId:candidate.id,applicationId:input.applicationId,result:input.result,taskCreated:!!task},correlationId);
        await this.activityEvent(client,actor,scope,'contact_recorded',{entityId:input.id,dedupeKey:input.id});
        return {contact:response(contact),task:task?response(task):null};
      });
    },
    async updateSecurity(supplied,body,correlationId) {
      const input=workflowInput(body,'security');
      return this.database.transaction(async client=>{
        // Acquire inherited and explicit participant locks together, before the scope lock.
        // A concurrent reassignment must retry rather than validate an unlocked reviewer.
        const observed=(await client.query('SELECT security_assignee_id FROM recruitment_applications WHERE id=$1 AND responsibility_scope_id=$2',[input.applicationId,input.responsibilityScopeId])).rows[0];
        const actor=await this.current(client,supplied,[input.assigneeId,observed?.security_assignee_id].filter(Boolean)),scope=this.scope(actor,input.responsibilityScopeId);
        await this.lockScope(client,scope);const grant=await this.externalAccess(client,actor,scope);
        const application=await this.workflowApplication(client,actor,scope,grant,input.applicationId);
        if(application.version!==input.version || application.securityAssigneeId!==(observed?.security_assignee_id ?? null))conflict();
        const operator=OPERATORS.includes(actor.role);
        if(!operator && (!['documents','submitted'].includes(input.status) || ['approved','rejected'].includes(application.securityStatus)))forbidden('Решение СБ фиксирует уполномоченный сотрудник.');
        if(!operator && input.assigneeId && input.assigneeId!==application.securityAssigneeId)forbidden('Проверяющего назначает сотрудник компании.');
        const assigneeId=operator?(input.assigneeId||application.securityAssigneeId||actor.id):application.securityAssigneeId;
        if(operator && application.securityAssigneeId && application.securityAssigneeId!==actor.id && actor.role==='dispatcher')forbidden('Проверка назначена другому сотруднику.');
        if(assigneeId){await this.validateRecruiter(client,scope,assigneeId);const person=(await client.query('SELECT role FROM users WHERE id=$1',[assigneeId])).rows[0];if(!OPERATORS.includes(person.role))fail('Проверяющим может быть руководитель, диспетчер или администратор.');}
        const request=await this.reference(client,scope,'requests',application.requestId);
        if(input.status==='not_required' && request.requiresSecurity)fail('По этой потребности проверка СБ обязательна.');
        if(['rejected','clarification'].includes(input.status) && !input.note)fail('Укажите пояснение к решению СБ.');
        if(['submitted','in_review','clarification'].includes(input.status) && !assigneeId)fail('Перед передачей в СБ руководитель, диспетчер или администратор должен назначить проверяющего.');
        if(['submitted','in_review','clarification'].includes(input.status) && !input.dueAt)fail('Укажите срок следующего действия по проверке.');
        const tasks=(await client.query("SELECT id FROM recruitment_tasks WHERE application_id=$1 AND workflow_kind='security' AND status='open'",[application.id])).rows;
        if(input.status==='not_requested' && tasks.length)fail('Проверка уже назначена. Завершите её решением СБ.');
        const dueAt=input.dueAt || (input.status==='documents' ? application.securityDueAt : null);
        const now=(await client.query('SELECT clock_timestamp() AS now')).rows[0].now;
        if(input.dueAt && new Date(input.dueAt)<=now && ['documents','submitted','in_review','clarification'].includes(input.status))fail('Срок проверки должен быть в будущем.');
        if(operator && application.securityAssigneeId && application.securityAssigneeId!==actor.id && !input.note)fail('Укажите причину изменения проверки другого сотрудника.');
        const saved=(await client.query(`UPDATE recruitment_applications SET security_status=$2,security_assignee_id=$3,security_due_at=$4,version=version+1,updated_at=$5,updated_by=$6 WHERE id=$1 RETURNING ${columns('applications')}`,[application.id,input.status,assigneeId,dueAt,now,actor.id])).rows[0];
        const pending=['documents','submitted','in_review','clarification'].includes(input.status) && assigneeId && dueAt;
        if(pending){
          if(tasks.length)await client.query('UPDATE recruitment_tasks SET assignee_id=$2,due_at=$3,version=version+1,updated_at=$4,updated_by=$5 WHERE id=$1',[tasks[0].id,assigneeId,dueAt,now,actor.id]);
          else await client.query(`INSERT INTO recruitment_tasks(id,legal_entity_id,region_id,project_id,responsibility_scope_id,candidate_id,application_id,title,due_at,assignee_id,status,workflow_kind,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,'Проверить СБ',$8,$9,'open','security',$10,$10)`,[randomUUID(),...tuple(scope),application.candidateId,application.id,dueAt,assigneeId,actor.id]);
        } else if(['approved','rejected','not_required'].includes(input.status)) for(const task of tasks) await client.query("UPDATE recruitment_tasks SET status='done',completed_at=$2,version=version+1,updated_at=$2,updated_by=$3 WHERE id=$1",[task.id,now,actor.id]);
        await client.query(`INSERT INTO recruitment_workflow_events(id,legal_entity_id,region_id,project_id,responsibility_scope_id,application_id,kind,actor_id,payload) VALUES($1,$2,$3,$4,$5,$6,'security',$7,$8)`,[randomUUID(),...tuple(scope),application.id,actor.id,{fromStatus:application.securityStatus,status:input.status,assigneeId,dueAt,note:input.note}]);
        await this.workflowAudit(client,actor,scope,'security.updated',application.id,{version:saved.version,status:input.status},correlationId);
        return response(saved);
      });
    },
    async confirmStart(supplied,body,correlationId) {
      const input=workflowInput(body,'start');
      return this.database.transaction(async client=>{
        const actor=await this.current(client,supplied),scope=this.scope(actor,input.responsibilityScopeId);
        if(!OPERATORS.includes(actor.role))forbidden('Фактический выход подтверждает логист, руководитель или администратор.');
        await this.lockScope(client,scope);
        const application=await this.reference(client,scope,'applications',input.applicationId);
        if(application.version!==input.version)conflict();
        if(application.stage!=='hired')fail('Сначала укажите запланированный выход в подборе.');
        const request=await this.reference(client,scope,'requests',application.requestId);
        if(request.requiresSecurity && application.securityStatus!=='approved')fail('Сначала получите положительное решение СБ.');
        const clock=(await client.query("SELECT clock_timestamp() AS now,to_char((clock_timestamp() AT TIME ZONE r.time_zone)::date,'YYYY-MM-DD') AS today FROM regions r WHERE r.id=$1",[scope.regionId])).rows[0];
        if(input.status==='confirmed' && input.date>clock.today)fail('Нельзя подтвердить будущий выход.');
        if(input.status==='no_show' && application.startDate && response(application).startDate>clock.today)fail('Нельзя отметить неявку до запланированного дня выхода.');
        if((input.status==='no_show' || application.attendanceStatus==='confirmed') && !input.note)fail('Укажите причину неявки или изменения подтверждённого выхода.');
        const yes=input.status==='confirmed';
        const saved=(await client.query(`UPDATE recruitment_applications SET attendance_status=$2,confirmed_start_date=$3,confirmed_by=$4,confirmed_at=$5,version=version+1,updated_at=$6,updated_by=$7 WHERE id=$1 RETURNING ${columns('applications')}`,[application.id,input.status,yes?input.date:null,yes?actor.id:null,yes?clock.now:null,clock.now,actor.id])).rows[0];
        await client.query(`INSERT INTO recruitment_workflow_events(id,legal_entity_id,region_id,project_id,responsibility_scope_id,application_id,kind,actor_id,payload) VALUES($1,$2,$3,$4,$5,$6,'start',$7,$8)`,[randomUUID(),...tuple(scope),application.id,actor.id,{fromStatus:application.attendanceStatus,status:input.status,date:yes?input.date:null,note:input.note,confirmationSource:'staff'}]);
        await this.workflowAudit(client,actor,scope,'start.updated',application.id,{version:saved.version,status:input.status},correlationId);
        return response(saved);
      });
    },
  };
}
module.exports={createWorkflowMethods,contactInput,workflowInput};
