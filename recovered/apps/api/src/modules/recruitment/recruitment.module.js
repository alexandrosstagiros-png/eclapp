// SPDX-License-Identifier: MIT
"use strict";
const { randomUUID } = require('node:crypto');
const { Module, Injectable, Inject, Controller, Get, Put, Post, Body, Query, Req, Header, UseGuards, UnauthorizedException } = require('@nestjs/common');
const { DatabaseService } = require('../../platform/database.service');
const { IdentityAccessModule } = require('../identity-access/identity-access.module');
const { IdentityRepository } = require('../identity-access/infrastructure/identity.repository');
const { AuthGuard } = require('../identity-access/interface/auth.guard');
const { CurrentActor } = require('../identity-access/interface/current-actor.decorator');
const { AuditService } = require('../audit/application/audit.service');
const { fail, conflict, forbidden, uuid, requestInput, candidateInput, applicationInput, taskInput } = require('./recruitment-input');

const { tuple, whereScope, whereRead, whereCandidates, companyScopes } = require('./recruitment-access');
const { externalMethods } = require('./recruitment-external');
const { createWorkflowMethods } = require('./recruitment-workflow');
const { createImportRowMethods } = require('./recruitment-import-rows');
const { RecruitmentInvitationsService, RecruitmentInvitationsController, PublicRecruitmentInvitationsController } = require('./recruitment-invitations');
const STAFF_ROLES = ['dispatcher', 'manager', 'recruiter', 'access_admin'];
const ROLES = [...STAFF_ROLES, 'external_recruiter'];
const MAX_RECORDS = 10000;
const MAX_EVENTS = 50000;
const PUBLIC_REQUEST_FIELDS = Object.freeze(['id', 'responsibilityScopeId', 'version', 'createdAt', 'updatedAt',
  'title', 'city', 'district', 'kind', 'quantity', 'priority', 'status', 'neededBy', 'schedule', 'payTerms',
  'vehicleRequirements', 'hhUrl', 'publishedAt', 'publicBrief', 'warehouseAddress', 'routeInfo', 'trainingTerms', 'driverRequirements', 'requiresSecurity']);
const SCOPE_COLUMNS = { legalEntityId: 'legal_entity_id', regionId: 'region_id', projectId: 'project_id', responsibilityScopeId: 'responsibility_scope_id' };
const COMMON_COLUMNS = { legalEntityId: 'legal_entity_id', projectId: 'project_id', regionId: 'region_id', id: 'id', responsibilityScopeId: 'responsibility_scope_id', version: 'version', createdAt: 'created_at', updatedAt: 'updated_at' };
// SQL identifiers only come from these constants, never from a request body.
const TYPES = {
  requests: { table: 'recruitment_requests', parse: requestInput, fields: {
    title: 'title', city: 'city', district: 'district', kind: 'kind', quantity: 'quantity', priority: 'priority', status: 'status',
    neededBy: 'needed_by', recruiterId: 'recruiter_id', schedule: 'schedule', payTerms: 'pay_terms', vehicleRequirements: 'vehicle_requirements',
    notes: 'notes', hhUrl: 'hh_url', publishedAt: 'published_at', publicBrief: 'public_brief',
    warehouseAddress: 'warehouse_address', routeInfo: 'route_info', trainingTerms: 'training_terms', driverRequirements: 'driver_requirements', requiresSecurity: 'requires_security',
  } },
  candidates: { table: 'recruitment_candidates', parse: candidateInput, fields: {
    fullName: 'full_name', phone: 'phone', city: 'city', district: 'district', kind: 'kind', recruiterId: 'recruiter_id', source: 'source',
    hhUrl: 'hh_url', licenseCategories: 'license_categories', experience: 'experience', vehicleType: 'vehicle_type',
    vehicleDimensions: 'vehicle_dimensions', vehicleCapacity: 'vehicle_capacity', notes: 'notes', archived: 'archived',
  } },
  applications: { table: 'recruitment_applications', parse: applicationInput, fields: {
    candidateId: 'candidate_id', requestId: 'request_id', recruiterId: 'recruiter_id', stage: 'stage', reason: 'reason', startDate: 'start_date',
  } },
  tasks: { table: 'recruitment_tasks', parse: taskInput, fields: {
    candidateId: 'candidate_id', applicationId: 'application_id', title: 'title', dueAt: 'due_at', assigneeId: 'assignee_id', status: 'status', notes: 'notes', completedAt: 'completed_at',
  } },
};
function columns(type, alias = '') {
  // Imported source text is readable by staff, never part of general API writes
  // or the explicit allowlist returned to external recruiters.
  const readOnly = type === 'requests' ? { sourceDetails: 'source_details' } : type === 'applications' ? {
    securityStatus: 'security_status', securityAssigneeId: 'security_assignee_id', securityDueAt: 'security_due_at',
    attendanceStatus: 'attendance_status', confirmedStartDate: 'confirmed_start_date', confirmedBy: 'confirmed_by', confirmedAt: 'confirmed_at',
  } : type === 'tasks' ? { workflowKind:'workflow_kind' } : {};
  return Object.entries({ ...COMMON_COLUMNS, ...TYPES[type].fields, ...readOnly }).map(([key, column]) =>
    ['neededBy', 'startDate', 'confirmedStartDate'].includes(key) ? `to_char(${alias}${column},'YYYY-MM-DD') AS "${key}"` : `${alias}${column} AS "${key}"`).join(',');
}
function response(row) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value instanceof Date ? value.toISOString() : value]));
}
function requireBounded(rows, maximum = MAX_RECORDS) {
  if (rows.length > maximum) fail('В области слишком много записей для одного просмотра. Обратитесь к администратору для разделения областей или выгрузки данных.');
  return rows.map(response);
}

class RecruitmentService {
  constructor(database, identity, audit) { this.database = database; this.identity = identity; this.audit = audit; }
  async current(client, supplied, participantIds = []) {
    // Grant changes use the same sorted user locks. A revoked grant cannot race
    // a mutation or an assignee validation inside this transaction.
    await this.identity.lockUsers(client, [supplied.id, ...participantIds]);
    const actor = await this.identity.actorBySession(client, supplied.sessionId);
    if (!actor || actor.id !== supplied.id || actor.authVersion !== supplied.authVersion || actor.role !== supplied.role)
      throw new UnauthorizedException('Сессия недействительна.');
    if (!ROLES.includes(actor.role)) forbidden('Рекрутинг недоступен для вашей роли.');
    if (actor.role !== 'external_recruiter') actor.grants = await companyScopes(client, actor);
    return actor;
  }
  selection(actor, id) {
    if (id) return this.scope(actor, uuid(id, 'проект'));
    const scopes = actor.grants.filter(grant => grant.personalDataVisible);
    if (!scopes.length) forbidden('Для рекрутинга необходим доступ к персональным данным компании.');
    return { readScopes: scopes };
  }
  async recordScope(client, actor, type, id, suppliedScopeId) {
    if (suppliedScopeId) return this.scope(actor, uuid(suppliedScopeId));
    if (actor.role === 'external_recruiter') forbidden();
    const row = (await client.query(`SELECT responsibility_scope_id AS id FROM ${type === 'importRows' ? 'recruitment_import_rows' : TYPES[type].table} WHERE id=$1`, [id])).rows[0];
    if (!row) forbidden('Карточка недоступна.');
    return this.scope(actor, row.id);
  }
  scope(actor, id) {
    const scope = actor.grants.find(grant => grant.responsibilityScopeId === id && grant.personalDataVisible);
    if (!scope) forbidden('Для рекрутинга необходим доступ к персональным данным выбранной области.');
    return scope;
  }
  async lockScope(client, scope) {
    const scopes=scope.readScopes || [scope];
    // A candidate can be linked from a different project. Lock the company first
    // so kind/archive edits cannot race cross-project reference validation.
    for(const company of [...new Set(scopes.map(item=>item.legalEntityId))].sort())
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,917042025))',[`recruitment-company:${company}`]);
    for(const item of [...scopes].sort((a,b)=>a.responsibilityScopeId.localeCompare(b.responsibilityScopeId)))
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,917042025))',[`scope:${JSON.stringify(tuple(item))}`]);
  }
  async recruiters(client, scope, roles = ROLES) {
    const scopes=scope.readScopes || [scope], companies=[...new Set(scopes.map(item=>item.legalEntityId))];
    const result=await client.query(`SELECT DISTINCT u.id,u.display_name AS name FROM users u JOIN access_grants g ON g.user_id=u.id
      WHERE u.role=ANY($1::text[]) AND u.active AND u.approved AND g.personal_data_visible
      AND g.legal_entity_id=ANY($2::uuid[]) AND (u.role<>'external_recruiter' OR g.responsibility_scope_id=ANY($3::uuid[]))
      ORDER BY name,u.id LIMIT $4`,[roles,companies,scopes.map(item=>item.responsibilityScopeId),MAX_RECORDS+1]);
    return requireBounded(result.rows);
  }
  async validateRecruiter(client, scope, id) {
    const result=await client.query(`SELECT u.id FROM users u JOIN access_grants g ON g.user_id=u.id
      WHERE u.id=$1 AND u.role=ANY($2::text[]) AND u.active AND u.approved AND g.personal_data_visible
      AND g.legal_entity_id=$3 AND (u.role<>'external_recruiter' OR g.responsibility_scope_id=$4)`,[id,ROLES,scope.legalEntityId,scope.responsibilityScopeId]);
    if(!result.rowCount) fail('Выбранный сотрудник недоступен как рекрутер компании. Обновите список сотрудников.');
  }
  async context(supplied) {
    return this.database.transaction(async client => {
      const actor = await this.current(client, supplied);
      if(actor.role !== 'external_recruiter') {
        const scopes = requireBounded(actor.grants.map(({ personalDataVisible, ...scope }) => scope));
        const counts = await client.query(`SELECT responsibility_scope_id AS id,count(*)::integer AS records FROM (
          SELECT responsibility_scope_id FROM recruitment_candidates WHERE responsibility_scope_id=ANY($1::uuid[])
          UNION ALL SELECT responsibility_scope_id FROM recruitment_requests WHERE responsibility_scope_id=ANY($1::uuid[])
        ) records GROUP BY responsibility_scope_id`, [scopes.map(scope => scope.responsibilityScopeId)]);
        const population = new Map(counts.rows.map(row => [row.id, row.records]));
        const preferred = scopes.reduce((best, scope) => !best || (population.get(scope.responsibilityScopeId) || 0) > (population.get(best.responsibilityScopeId) || 0) ? scope : best, null);
        return { scopes, defaultResponsibilityScopeId: preferred?.responsibilityScopeId || null };
      }
      const result = await client.query(`SELECT g.legal_entity_id AS "legalEntityId",g.region_id AS "regionId",
        g.project_id AS "projectId",g.responsibility_scope_id AS "responsibilityScopeId",
        le.name AS "legalEntityName",r.name AS "regionName",r.time_zone AS "timeZone",p.name AS "projectName",rs.name AS "scopeName"
        FROM access_grants g JOIN legal_entities le ON le.id=g.legal_entity_id JOIN regions r ON r.id=g.region_id
        JOIN projects p ON p.id=g.project_id AND p.legal_entity_id=g.legal_entity_id AND p.region_id=g.region_id
        JOIN responsibility_scopes rs ON rs.id=g.responsibility_scope_id AND rs.project_id=g.project_id
        WHERE g.user_id=$1 AND g.personal_data_visible ORDER BY r.name,p.name,rs.name,g.responsibility_scope_id LIMIT $2`, [actor.id, MAX_RECORDS + 1]);
      let scopes = requireBounded(result.rows);
      if (actor.role === 'external_recruiter') {
        const allowed = await client.query(`SELECT responsibility_scope_id AS id,version,expires_at AS "expiresAt" FROM recruitment_external_access
          WHERE user_id=$1 AND status='active' AND (expires_at IS NULL OR expires_at>clock_timestamp()) AND cardinality(request_ids)>0`, [actor.id]);
        scopes = scopes.filter(scope => allowed.rows.some(row => row.id === scope.responsibilityScopeId))
          .map(({ legalEntityName, ...scope }) => {
            const grant = allowed.rows.find(row => row.id === scope.responsibilityScopeId);
            return { ...scope, accessVersion: grant.version, accessExpiresAt: grant.expiresAt };
          });
      }
      return { scopes };
    });
  }
  async read(supplied, scopeId) {
    return this.database.transaction(async client => {
      const actor = await this.current(client, supplied);
      const scope = this.selection(actor, scopeId);
      await this.lockScope(client, scope);
      const grant = await this.externalAccess(client, actor, scope);
      const result = {};
      for (const type of Object.keys(TYPES)) {
        const records = await client.query(`SELECT ${columns(type,'record.')} FROM ${TYPES[type].table} record
          WHERE ${type === 'candidates' && !grant ? whereCandidates(scope,'record.') : whereRead(scope,'record.')} ORDER BY created_at DESC,id LIMIT $5`, [...tuple(scope), MAX_RECORDS + 1]);
        result[type] = requireBounded(records.rows);
        if (grant) {
          if (type === 'requests') result[type] = result[type].filter(row => grant.requestIds.includes(row.id)).map(row => Object.fromEntries(PUBLIC_REQUEST_FIELDS.map(key => [key, row[key]])));
          if (type === 'candidates') result[type] = result[type].filter(row => row.recruiterId === actor.id);
          if (type === 'applications') result[type] = result[type].filter(row => row.recruiterId === actor.id && grant.requestIds.includes(row.requestId) && result.candidates.some(candidate => candidate.id === row.candidateId));
          if (type === 'tasks') result[type] = result[type].filter(row => row.assigneeId === actor.id && (!row.candidateId || result.candidates.some(candidate => candidate.id === row.candidateId)) && (!row.applicationId || result.applications.some(application=>application.id===row.applicationId)));
        }
      }
      const events = await client.query(`SELECT id,application_id AS "applicationId",from_stage AS "fromStage",to_stage AS "toStage",
        occurred_at AS "occurredAt",actor_id AS "actorId" FROM recruitment_events WHERE ${whereRead(scope)}
        ORDER BY occurred_at,id LIMIT $5`, [...tuple(scope), MAX_EVENTS + 1]);
      result.events = requireBounded(events.rows, MAX_EVENTS);
      if (grant) {
        // A candidate attached only to revoked requests is no longer visible.
        const links = await client.query(`SELECT candidate_id AS id FROM recruitment_applications WHERE candidate_id=ANY($1::uuid[])
          GROUP BY candidate_id HAVING bool_or(request_id=ANY($2::uuid[]) AND recruiter_id=$3)=false`, [result.candidates.map(candidate=>candidate.id), grant.requestIds, actor.id]);
        const hidden = new Set(links.rows.map(row => row.id));
        result.candidates = result.candidates.filter(row => !hidden.has(row.id));
        result.tasks = result.tasks.filter(row => !row.candidateId || !hidden.has(row.candidateId));
        result.events = result.events.filter(row => result.applications.some(application => application.id === row.applicationId)).map(({ actorId, ...row }) => ({ ...row, actorId: actorId === actor.id ? actor.id : null }));
      }
      result.recruiters = grant ? [{ id: actor.id, name: actor.displayName }] : await this.recruiters(client, scope);
      result.requestRecruiters = grant ? [] : await this.recruiters(client, scope, STAFF_ROLES);
      result.workflowOperators = grant ? [] : await this.recruiters(client, scope, ['manager','dispatcher','access_admin']);
      const { bucket } = (await client.query('SELECT floor(extract(epoch FROM clock_timestamp())/1800)::bigint AS bucket')).rows[0];
      for (const item of scope.readScopes || [scope]) await this.activityEvent(client, actor, item, 'data_read', { dedupeKey: `${actor.sessionId}:scope:${bucket}` });
      result.integrations = { hh: 'external_links', oneC: 'not_connected', messengers: 'not_connected' };
      return result;
    });
  }
  async reminders(supplied) {
    return this.database.transaction(async client => {
      const actor = await this.current(client, supplied);
      const result = await client.query(`SELECT ${columns('tasks', 't.')},c.full_name AS "candidateName",rs.name AS "scopeName"
        FROM recruitment_tasks t

        JOIN responsibility_scopes rs ON rs.id=t.responsibility_scope_id AND rs.project_id=t.project_id
        LEFT JOIN recruitment_candidates c ON c.id=t.candidate_id AND c.legal_entity_id=t.legal_entity_id
        WHERE t.responsibility_scope_id=ANY($4::uuid[]) AND t.assignee_id=$1 AND t.status='open' AND t.due_at<=clock_timestamp()
          AND ($3::boolean=false OR EXISTS (SELECT 1 FROM recruitment_external_access e WHERE e.user_id=$1
            AND e.legal_entity_id=t.legal_entity_id AND e.region_id=t.region_id AND e.project_id=t.project_id AND e.responsibility_scope_id=t.responsibility_scope_id
            AND e.status='active' AND (e.expires_at IS NULL OR e.expires_at>clock_timestamp()) AND cardinality(e.request_ids)>0
            AND (t.application_id IS NULL OR EXISTS(SELECT 1 FROM recruitment_applications ta WHERE ta.id=t.application_id AND ta.recruiter_id=$1 AND ta.request_id=ANY(e.request_ids)))
            AND (t.candidate_id IS NULL OR (c.recruiter_id=$1 AND (NOT EXISTS(SELECT 1 FROM recruitment_applications a WHERE a.candidate_id=c.id)
              OR EXISTS(SELECT 1 FROM recruitment_applications a WHERE a.candidate_id=c.id AND a.recruiter_id=$1 AND a.request_id=ANY(e.request_ids)))))))
        ORDER BY t.due_at,t.id LIMIT $2`, [actor.id, MAX_RECORDS + 1, actor.role === 'external_recruiter', actor.grants.filter(g=>g.personalDataVisible).map(g=>g.responsibilityScopeId)]);
      const clock = await client.query('SELECT clock_timestamp() AS now');
      return { tasks: requireBounded(result.rows), serverTime: clock.rows[0].now.toISOString() };
    });
  }
  async reference(client, scope, type, id) {
    const result = await client.query(`SELECT ${columns(type)} FROM ${TYPES[type].table} WHERE ${type === 'candidates' ? 'legal_entity_id=$1 AND $2::uuid IS NOT NULL AND $3::uuid IS NOT NULL AND $4::uuid IS NOT NULL' : whereScope()} AND id=$5`, [...tuple(scope), id]);
    if (!result.rowCount) fail('Кандидат или потребность недоступны в выбранной области. Обновите данные.');
    return result.rows[0];
  }
  async validate(client, scope, type, input, existing, now, actor) {
    const participantId = input.recruiterId || input.assigneeId;
    await this.validateRecruiter(client, scope, participantId);
    const participant = (await client.query('SELECT role FROM users WHERE id=$1', [participantId])).rows[0];
    if (participant.role === 'external_recruiter') {
      if (type === 'requests') fail('Ответственным за потребность должен быть сотрудник компании.');
      const grant = await this.externalAccess(client, { id: participantId, role: participant.role }, scope);
      if (type === 'applications') this.allowedRequest(grant, input.requestId);
      if (['applications', 'tasks'].includes(type) && input.candidateId) await this.ownCandidate(client, { id: participantId }, scope, grant, input.candidateId);
      if(type==='tasks' && input.applicationId) {
        const application=await this.reference(client,scope,'applications',input.applicationId);
        this.allowedRequest(grant,application.requestId);
        if(application.recruiterId!==participantId)forbidden('Подбор недоступен назначенному исполнителю.');
        await this.ownCandidate(client,{id:participantId},scope,grant,application.candidateId);
      }
    }
    if (type === 'requests') {
      if(existing && existing.requiresSecurity!==input.requiresSecurity && !['manager','dispatcher','access_admin'].includes(actor.role)) forbidden('Требование проверки СБ изменяет руководитель или логист.');
      if (input.publishedAt && new Date(input.publishedAt) < new Date(existing?.createdAt || now)) fail('Дата публикации не может предшествовать созданию потребности.');
      if (existing && input.kind !== existing.kind) {
        const links = await client.query('SELECT 1 FROM recruitment_applications WHERE request_id=$1 LIMIT 1', [input.id]);
        if (links.rowCount) fail('Нельзя изменить тип потребности, к которой уже привязаны кандидаты.');
      }
    }
    if (type === 'candidates') {
      // Legacy duplicates remain editable. New records/phone changes cannot
      // fragment the company directory again; lockScope holds the company lock.
      if(!existing || existing.phone !== input.phone) {
        const duplicates = await client.query('SELECT 1 FROM recruitment_candidates WHERE legal_entity_id=$1 AND phone=$2 AND id<>$3 LIMIT 1', [scope.legalEntityId,input.phone,input.id]);
        if (duplicates.rowCount) conflict(actor.role === 'external_recruiter' ? 'Кандидат с таким телефоном уже зарегистрирован. Обратитесь к руководителю для уточнения.' : 'Кандидат с таким телефоном уже есть в компании. Найдите и откройте его карточку.');
      }
      if (existing && input.kind !== existing.kind) {
        const links = await client.query('SELECT 1 FROM recruitment_applications WHERE candidate_id=$1 LIMIT 1', [input.id]);
        if (links.rowCount) fail('Нельзя изменить тип кандидата, уже связанного с потребностью.');
      }
    }
    if (type === 'applications') {
      if (existing && (input.candidateId !== existing.candidateId || input.requestId !== existing.requestId)) fail('Кандидата и потребность в существующем отклике изменить нельзя.');
      const candidate = await this.reference(client, scope, 'candidates', input.candidateId);
      const request = await this.reference(client, scope, 'requests', input.requestId);
      if ((!existing || input.stage !== existing.stage) && request.requiresSecurity && ['internship','paperwork','hired'].includes(input.stage) && existing?.securityStatus !== 'approved')
        fail('Для этой потребности сначала нужно получить положительное решение СБ.');
      if (candidate.kind !== request.kind) fail('Тип кандидата должен соответствовать типу потребности.');
      if (!existing && request.status === 'closed') fail('Потребность закрыта. Откройте её перед добавлением кандидата.');
      if (!existing && candidate.archived) fail('Сначала верните кандидата из архива.');
      const duplicates = await client.query('SELECT 1 FROM recruitment_applications WHERE candidate_id=$1 AND request_id=$2 AND id<>$3 LIMIT 1', [input.candidateId, input.requestId, input.id]);
      if (duplicates.rowCount) conflict('Кандидат уже связан с этой потребностью. Откройте существующий отклик.');
      if (!existing || existing.stage !== input.stage) {
        const events = await client.query(`SELECT count(*)::integer AS count FROM recruitment_events WHERE ${whereScope()}`, tuple(scope));
        if (events.rows[0].count >= MAX_EVENTS) fail('Достигнут предел истории этапов в области. Обратитесь к администратору для разделения областей или выгрузки данных.');
      }
    }
    if (type === 'tasks') {
      if(existing?.workflowKind==='security') fail('Задача СБ обновляется через результат проверки в карточке подбора.');
      if(existing?.applicationId) {
        const previous=await this.reference(client,scope,'applications',existing.applicationId);
        const grant=await this.externalAccess(client,actor,scope);
        this.allowedRequest(grant,previous.requestId);
        if(grant && previous.recruiterId!==actor.id)forbidden();
      }
      if (input.applicationId) {
        const application = await this.reference(client, scope, 'applications', input.applicationId);
        if (input.candidateId && input.candidateId !== application.candidateId) fail('Задача и подбор должны относиться к одному кандидату.');
        input.candidateId = application.candidateId;
        const grant = await this.externalAccess(client, actor, scope);
        this.allowedRequest(grant, application.requestId);
        if (grant && application.recruiterId !== actor.id) forbidden();
        await this.ownCandidate(client, actor, scope, grant, input.candidateId);
      }
      if (input.candidateId) await this.reference(client, scope, 'candidates', input.candidateId);
      input.completedAt = input.status === 'done' ? (existing?.completedAt || now) : null;
    }
  }
  async save(supplied, type, body, correlationId) {
    const definition = TYPES[type];
    const input = definition.parse(body);
    return this.database.transaction(async client => {
      const actor = await this.current(client, supplied, [input.recruiterId || input.assigneeId]);
      const scope = this.scope(actor, input.responsibilityScopeId);
      await this.lockScope(client, scope);
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,917042025))', [`record:${type}:${input.id}`]);
      const found = await client.query(`SELECT ${columns(type)},legal_entity_id AS "legalEntityId",region_id AS "regionId",project_id AS "projectId"
        FROM ${definition.table} WHERE id=$1 FOR UPDATE`, [input.id]);
      const existing = found.rows[0];
      if (type === 'requests' && body.requiresSecurity === undefined) input.requiresSecurity = existing?.requiresSecurity ?? false;
      if (existing && tuple(existing).some((value, index) => value !== tuple(scope)[index])) forbidden('Запись принадлежит другой области работы.');
      const grant = await this.externalAccess(client, actor, scope);
      await this.externalWrite(client, actor, scope, grant, type, input, existing);
      if ((existing?.version || 0) !== input.version) conflict();
      if (!existing) {
        const count = await client.query(`SELECT count(*)::integer AS count FROM ${definition.table} WHERE ${whereScope()}`, tuple(scope));
        if (count.rows[0].count >= MAX_RECORDS) fail('Достигнут предел записей в области. Обратитесь к администратору для разделения областей.');
      }
      const now = (await client.query('SELECT clock_timestamp() AS now')).rows[0].now;
      await this.validate(client, scope, type, input, existing, now, actor);
      let saved;
      if (existing) {
        const fields = Object.entries(definition.fields).filter(([key]) => type !== 'applications' || !['candidateId', 'requestId'].includes(key));
        const assignments = fields.map(([, column], index) => `${column}=$${index + 2}`);
        const values = [input.id, ...fields.map(([key]) => input[key]), actor.id, now];
        saved = await client.query(`UPDATE ${definition.table} SET ${assignments.join(',')},version=version+1,
          updated_by=$${values.length - 1},updated_at=$${values.length} WHERE id=$1 RETURNING ${columns(type)}`, values);
      } else {
        const fieldEntries = Object.entries(definition.fields);
        const names = ['id', ...Object.values(SCOPE_COLUMNS), ...fieldEntries.map(([, column]) => column), 'created_by', 'updated_by', 'created_at', 'updated_at'];
        const values = [input.id, ...tuple(scope), ...fieldEntries.map(([key]) => input[key]), actor.id, actor.id, now, now];
        saved = await client.query(`INSERT INTO ${definition.table}(${names.join(',')}) VALUES(${values.map((_, index) => `$${index + 1}`).join(',')}) RETURNING ${columns(type)}`, values);
      }
      if (type === 'applications' && (!existing || existing.stage !== input.stage)) {
        await client.query(`INSERT INTO recruitment_events(id,legal_entity_id,region_id,project_id,responsibility_scope_id,application_id,from_stage,to_stage,occurred_at,actor_id)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [randomUUID(), ...tuple(scope), input.id, existing?.stage || null, input.stage, now, actor.id]);
      }
      if (type === 'candidates' && !existing) await this.activityEvent(client, actor, scope, 'candidate_created', { entityId: input.id });
      if (type === 'applications' && !existing) await this.activityEvent(client, actor, scope, 'application_created', { entityId: input.id, requestId: input.requestId, toStage: input.stage });
      if (type === 'applications' && existing && existing.stage !== input.stage) await this.activityEvent(client, actor, scope, 'stage_changed', { entityId: input.id, requestId: input.requestId, fromStage: existing.stage, toStage: input.stage });
      if (type === 'tasks' && input.status === 'done' && existing?.status !== 'done') await this.activityEvent(client, actor, scope, 'task_completed', { entityId: input.id });
      const record = response(saved.rows[0]);
      await this.audit.append(client, {
        actorId: actor.id, channel: actor.channel, correlationId: correlationId || randomUUID(),
        action: `recruitment.${type}.${existing ? 'updated' : 'created'}`, entityType: definition.table, entityId: input.id,
        scope: Object.fromEntries(Object.keys(SCOPE_COLUMNS).map(key => [key, scope[key]])),
        metadata: { version: record.version, ...(input.stage ? { stage: input.stage } : {}), ...(input.status ? { status: input.status } : {}) },
      });
      return record;
    });
  }
}
Object.assign(RecruitmentService.prototype, externalMethods);
Object.assign(RecruitmentService.prototype, createWorkflowMethods({ tuple, whereScope, whereRead, whereCandidates, columns, response, publicRequestFields: PUBLIC_REQUEST_FIELDS }));
Object.assign(RecruitmentService.prototype, createImportRowMethods({tuple,whereScope,whereRead,response}));
Injectable()(RecruitmentService);
Inject(DatabaseService)(RecruitmentService, undefined, 0);
Inject(IdentityRepository)(RecruitmentService, undefined, 1);
Inject(AuditService)(RecruitmentService, undefined, 2);

class RecruitmentController {
  constructor(service) { this.service = service; }
  context(actor) { return this.service.context(actor); }
  read(actor, scopeId) { return this.service.read(actor, scopeId); }
  reminders(actor) { return this.service.reminders(actor); }
  worklist(actor, query) { return this.service.worklist(actor, query); }
  candidate(actor, query) { return this.service.candidateDetail(actor, query); }
  importRows(actor, query) { return this.service.importRows(actor, query); }
  importRow(actor, query) { return this.service.importRow(actor, query); }
  saveContact(actor, body, request) { return this.service.recordContact(actor, body, request.correlationId); }
  saveSecurity(actor, body, request) { return this.service.updateSecurity(actor, body, request.correlationId); }
  saveStart(actor, body, request) { return this.service.confirmStart(actor, body, request.correlationId); }
  access(actor, scopeId) { return this.service.readAccess(actor, scopeId); }
  activity(actor, scopeId, days) { return this.service.activity(actor, scopeId, days); }
  saveAccess(actor, body, request) { return this.service.saveAccess(actor, body, request.correlationId); }
  saveVisit(actor, body) { return this.service.recordView(actor, body); }
  saveView(actor, body) { return this.service.recordView(actor, body, true); }
  saveRequest(actor, body, request) { return this.service.save(actor, 'requests', body, request.correlationId); }
  saveCandidate(actor, body, request) { return this.service.save(actor, 'candidates', body, request.correlationId); }
  saveApplication(actor, body, request) { return this.service.save(actor, 'applications', body, request.correlationId); }
  saveTask(actor, body, request) { return this.service.save(actor, 'tasks', body, request.correlationId); }
}
Inject(RecruitmentService)(RecruitmentController, undefined, 0);
Controller('recruitment')(RecruitmentController);
UseGuards(AuthGuard)(RecruitmentController);
for (const [name, decorator] of [
  ['access', Get('access')], ['activity', Get('activity')], ['saveAccess', Put('access')],
  ['saveVisit', Post('visits')], ['saveView', Post('request-views')],
  ['context', Get('context')], ['reminders', Get('reminders')], ['read', Get()],
  ['worklist', Get('worklist')], ['candidate', Get('candidate')], ['saveContact', Post('contacts')], ['saveSecurity', Post('security')], ['saveStart', Post('start-confirmation')],
  ['importRows', Get('import-rows')], ['importRow', Get('import-row')],
  ['saveRequest', Put('requests')], ['saveCandidate', Put('candidates')], ['saveApplication', Put('applications')], ['saveTask', Put('tasks')],
]) {
  const descriptor = Object.getOwnPropertyDescriptor(RecruitmentController.prototype, name);
  decorator(RecruitmentController.prototype, name, descriptor);
  Header('Cache-Control', 'no-store')(RecruitmentController.prototype, name, descriptor);
  CurrentActor()(RecruitmentController.prototype, name, 0);
  if (name.startsWith('save')) {
    Body()(RecruitmentController.prototype, name, 1);
    Req()(RecruitmentController.prototype, name, 2);
  }
}
for (const name of ['read', 'access', 'activity']) Query('responsibilityScopeId')(RecruitmentController.prototype, name, 1);
Query('days')(RecruitmentController.prototype, 'activity', 2);
for (const name of ['worklist', 'candidate','importRows','importRow']) Query()(RecruitmentController.prototype, name, 1);

class RecruitmentModule {}
const { OnboardingService, OnboardingController, PublicOnboardingController } = require('./recruitment-onboarding').createOnboardingComponents(RecruitmentService);
const { ContractService, ContractController } = require('./recruitment-contracts').createContractComponents(RecruitmentService);
const DadataController = require('./recruitment-dadata').createDadataController(ContractService);
Module({ imports: [IdentityAccessModule], controllers: [RecruitmentController, RecruitmentInvitationsController, PublicRecruitmentInvitationsController,OnboardingController,PublicOnboardingController,ContractController,DadataController],
  providers: [RecruitmentService, RecruitmentInvitationsService,OnboardingService,ContractService] })(RecruitmentModule);
module.exports = { RecruitmentModule, RecruitmentService };
