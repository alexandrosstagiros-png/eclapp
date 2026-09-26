// SPDX-License-Identifier: MIT
'use strict';
const { randomUUID } = require('node:crypto');
const { fail, conflict, forbidden, uuid, accessInput } = require('./recruitment-input');
const DAY = 86400000;
const {tuple,whereScope:where,whereRead}=require('./recruitment-access');
const ACCESS_COLUMNS = `responsibility_scope_id AS "responsibilityScopeId",user_id AS "userId",request_ids AS "requestIds",status,expires_at AS "expiresAt",version,created_at AS "createdAt",updated_at AS "updatedAt"`;
function accessState(grant, now = new Date()) {
  if (!grant) return 'unassigned';
  if (grant.status === 'revoked') return 'revoked';
  if (grant.expiresAt && new Date(grant.expiresAt) <= now) return 'expired';
  return grant.requestIds.length ? 'active' : 'unassigned';
}
const externalMethods = {
  manager(actor) {
    if (!['manager', 'access_admin'].includes(actor.role)) forbidden('Управление доступом и отчёт активности доступны руководителю и администратору.');
  },
  async externalAccess(client, actor, scope) {
    if (actor.role !== 'external_recruiter') return null;
    const result = await client.query(`SELECT ${ACCESS_COLUMNS},clock_timestamp() AS now FROM recruitment_external_access WHERE ${where()} AND user_id=$5`, [...tuple(scope), actor.id]);
    const grant = result.rows[0];
    if (accessState(grant, grant?.now) !== 'active') forbidden('Доступ к потребностям не назначен, отозван или истёк. Обратитесь к руководителю.');
    return grant;
  },
  allowedRequest(grant, requestId) {
    if (grant && !grant.requestIds.includes(requestId)) forbidden('Потребность не назначена вам для подбора.');
  },
  async ownCandidate(client, actor, scope, grant, candidateId) {
    if (!grant) return;
    const candidate = await client.query(`SELECT id FROM recruitment_candidates WHERE ${where()} AND id=$5 AND recruiter_id=$6
      AND (NOT EXISTS (SELECT 1 FROM recruitment_applications a WHERE a.candidate_id=$5)
        OR EXISTS (SELECT 1 FROM recruitment_applications a WHERE a.candidate_id=$5 AND a.recruiter_id=$6 AND a.request_id=ANY($7::uuid[])))`, [...tuple(scope), candidateId, actor.id, grant.requestIds]);
    if (!candidate.rowCount) forbidden('Кандидат недоступен для вашей учётной записи.');
  },
  async externalWrite(client, actor, scope, grant, type, input, existing) {
    if (!grant) return;
    if (type === 'requests') forbidden('Внешний рекрутер не может изменять потребности.');
    const ownerKey = type === 'tasks' ? 'assigneeId' : 'recruiterId';
    if (input[ownerKey] !== actor.id || (existing && existing[ownerKey] !== actor.id)) forbidden('Можно работать только со своими кандидатами, откликами и задачами.');
    if (type === 'applications') {
      this.allowedRequest(grant, input.requestId);
      await this.ownCandidate(client, actor, scope, grant, input.candidateId);
    }
    if (type === 'candidates' && existing) await this.ownCandidate(client, actor, scope, grant, input.id);
    if (type === 'tasks' && input.candidateId) await this.ownCandidate(client, actor, scope, grant, input.candidateId);
    if (type === 'tasks' && existing?.candidateId) await this.ownCandidate(client, actor, scope, grant, existing.candidateId);
  },
  async activityEvent(client, actor, scope, kind, { entityId = null, requestId = null, fromStage = null, toStage = null, dedupeKey } = {}) {
    // Acting-as sessions are audit-visible, but never inflate a recruiter's work.
    if (actor.impersonation) return false;
    const result = await client.query(`INSERT INTO recruitment_activity(id,legal_entity_id,region_id,project_id,responsibility_scope_id,
      actor_id,session_id,kind,entity_id,request_id,from_stage,to_stage,dedupe_key)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      ON CONFLICT(actor_id,responsibility_scope_id,kind,dedupe_key) DO NOTHING RETURNING id`,
      [randomUUID(), ...tuple(scope), actor.id, actor.sessionId, kind, entityId, requestId, fromStage, toStage, dedupeKey || randomUUID()]);
    return result.rowCount > 0;
  },
  async recordView(supplied, body, requestView = false) {
    const scopeId = body?.responsibilityScopeId;
    const requestId = requestView ? uuid(body?.requestId, 'потребность') : null;
    return this.database.transaction(async client => {
      const actor = await this.current(client, supplied);
      const scope = requestView ? await this.recordScope(client,actor,'requests',requestId,scopeId) : this.selection(actor,scopeId);
      await this.lockScope(client, scope);
      const grant = await this.externalAccess(client, actor, scope);
      if (requestView) {
        this.allowedRequest(grant, requestId);
        await this.reference(client, scope, 'requests', requestId);
      }
      const { bucket } = (await client.query('SELECT floor(extract(epoch FROM clock_timestamp())/1800)::bigint AS bucket')).rows[0];
      let recorded=false;
      for(const item of scope.readScopes || [scope]) recorded=(await this.activityEvent(client, actor, item, requestView ? 'request_view' : 'scope_visit', {
        entityId: requestId, requestId, dedupeKey: `${actor.sessionId}:${requestId || 'scope'}:${bucket}`,
      })) || recorded;
      return {recorded};
    });
  },
  async readAccess(supplied, scopeId) {
    return this.database.transaction(async client => {
      const actor = await this.current(client, supplied);
      this.manager(actor);
      const scope = this.selection(actor, scopeId);
      await this.lockScope(client, scope);
      const users = await client.query(`SELECT g.responsibility_scope_id AS "responsibilityScopeId",u.id,u.display_name AS name,u.role,u.active,u.approved FROM users u
        JOIN access_grants g ON g.user_id=u.id WHERE ${whereRead(scope,'g.')} AND g.personal_data_visible
        AND u.role='external_recruiter' ORDER BY u.display_name,u.id LIMIT 10001`, tuple(scope));
      const grants = await client.query(`SELECT ${ACCESS_COLUMNS},clock_timestamp() AS now FROM recruitment_external_access WHERE ${whereRead(scope)} ORDER BY user_id LIMIT 10001`, tuple(scope));
      if (users.rows.length > 10000 || grants.rows.length > 10000) fail('Слишком много записей доступа для одного просмотра.');
      return { users: users.rows, grants: grants.rows.map(({ now, ...grant }) => ({ ...grant, accessState: accessState(grant, now) })) };
    });
  },
  async saveAccess(supplied, body, correlationId) {
    const input = accessInput(body);
    return this.database.transaction(async client => {
      const actor = await this.current(client, supplied, [input.userId]);
      this.manager(actor);
      const scope = this.scope(actor, input.responsibilityScopeId);
      await this.lockScope(client, scope);
      const target = await client.query(`SELECT u.id FROM users u JOIN access_grants g ON g.user_id=u.id WHERE ${where('g.')}
        AND g.user_id=$5 AND g.personal_data_visible AND u.role='external_recruiter'`, [...tuple(scope), input.userId]);
      const found = await client.query(`SELECT ${ACCESS_COLUMNS} FROM recruitment_external_access WHERE ${where()} AND user_id=$5 FOR UPDATE`, [...tuple(scope), input.userId]);
      const existing = found.rows[0];
      if (!target.rowCount && !(existing && input.status === 'revoked')) forbidden('Внешнему рекрутеру нужен доступ к персональным данным этой области.');
      if ((existing?.version || 0) !== input.version) conflict('Доступ уже изменён. Обновите список перед сохранением.');
      const now = (await client.query('SELECT clock_timestamp() AS now')).rows[0].now;
      if (input.status === 'active' && input.expiresAt && new Date(input.expiresAt) <= now) fail('Срок активного доступа должен быть в будущем.');
      const requests = await client.query(`SELECT id FROM recruitment_requests WHERE ${where()} AND id=ANY($5::uuid[])`, [...tuple(scope), input.requestIds]);
      if (requests.rowCount !== input.requestIds.length) forbidden('Все назначенные потребности должны принадлежать выбранной области.');
      let saved;
      if (existing) saved = await client.query(`UPDATE recruitment_external_access SET request_ids=$6,status=$7,expires_at=$8,
        version=version+1,updated_at=$9,updated_by=$10 WHERE ${where()} AND user_id=$5 RETURNING ${ACCESS_COLUMNS}`,
        [...tuple(scope), input.userId, input.requestIds, input.status, input.expiresAt, now, actor.id]);
      else saved = await client.query(`INSERT INTO recruitment_external_access(legal_entity_id,region_id,project_id,responsibility_scope_id,
        user_id,request_ids,status,expires_at,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING ${ACCESS_COLUMNS}`,
        [...tuple(scope), input.userId, input.requestIds, input.status, input.expiresAt, actor.id]);
      const grant = saved.rows[0];
      await this.audit.append(client, { actorId: actor.id, channel: actor.channel, correlationId: correlationId || randomUUID(),
        action: 'recruitment.access.updated', entityType: 'recruitment_external_access', entityId: input.userId, scope,
        metadata: { version: grant.version, status: grant.status, requestIds: grant.requestIds, expiresAt: input.expiresAt } });
      return { ...grant, accessState: accessState(grant, now) };
    });
  },
  async activity(supplied, scopeId, dayInput) {
    const days = Number(dayInput == null ? 30 : dayInput);
    if (![7, 30, 90].includes(days)) fail('Период отчёта: 7, 30 или 90 дней.');
    return this.database.transaction(async client => {
      const actor = await this.current(client, supplied);
      this.manager(actor);
      const scope = this.selection(actor, scopeId);
      await this.lockScope(client, scope);
      const now = (await client.query('SELECT clock_timestamp() AS now')).rows[0].now;
      const start = new Date(now.getTime() - days * DAY);
      const people = await client.query(`SELECT u.id AS "userId",u.display_name AS name,u.role,u.active,u.approved,
        EXISTS(SELECT 1 FROM access_grants g WHERE g.user_id=u.id AND ${whereRead(scope,'g.')} AND g.personal_data_visible) AS "hasScope",
        e.status,e.expires_at AS "expiresAt",e.request_ids AS "requestIds"
        FROM users u LEFT JOIN LATERAL (SELECT e.status,e.expires_at,e.request_ids FROM recruitment_external_access e WHERE e.user_id=u.id AND ${whereRead(scope,'e.')}
          ORDER BY (e.status='active' AND (e.expires_at IS NULL OR e.expires_at>clock_timestamp()) AND cardinality(e.request_ids)>0) DESC,e.updated_at DESC LIMIT 1) e ON true
        WHERE (EXISTS(SELECT 1 FROM access_grants g WHERE g.user_id=u.id AND ${whereRead(scope,'g.')})
          AND u.role=ANY($5::text[])) OR EXISTS(SELECT 1 FROM recruitment_activity a WHERE a.actor_id=u.id AND ${whereRead(scope,'a.')})
        ORDER BY u.display_name,u.id LIMIT 10001`, [...tuple(scope), ['manager','access_admin','recruiter','external_recruiter','dispatcher']]);
      if (people.rows.length > 10000) fail('Слишком много рекрутеров для одного отчёта.');
      const aggregated = await client.query(`SELECT a.actor_id AS "userId",min(a.occurred_at) AS "firstObservationAt",max(a.occurred_at) AS "lastActivityAt",
        count(${scope.readScopes?'DISTINCT (a.session_id,a.dedupe_key)':'*'}) FILTER(WHERE occurred_at >= $5 AND kind='scope_visit')::integer AS visits,
        count(${scope.readScopes?'DISTINCT (a.session_id,a.dedupe_key)':'*'}) FILTER(WHERE occurred_at >= $5 AND kind='data_read')::integer AS "dataReads",
        count(DISTINCT (occurred_at AT TIME ZONE r.time_zone)::date) FILTER(WHERE occurred_at >= $5)::integer AS "activeDays",
        count(*) FILTER(WHERE occurred_at >= $5 AND kind='request_view')::integer AS "requestViews",
        count(DISTINCT request_id) FILTER(WHERE occurred_at >= $5 AND kind='request_view')::integer AS "uniqueRequests",
        count(DISTINCT entity_id) FILTER(WHERE occurred_at >= $5 AND kind='candidate_created')::integer AS "candidatesAdded",
        count(DISTINCT entity_id) FILTER(WHERE occurred_at >= $5 AND kind='contact_recorded')::integer AS "contactsRecorded",
        count(DISTINCT entity_id) FILTER(WHERE occurred_at >= $5 AND kind='application_created')::integer AS "applicationsAdded",
        count(*) FILTER(WHERE occurred_at >= $5 AND kind='stage_changed')::integer AS "stageChanges",
        count(DISTINCT entity_id) FILTER(WHERE occurred_at >= $5 AND kind='stage_changed'
          AND array_position(ARRAY['new','contact','qualified','interview','security','internship','paperwork','hired'],to_stage)
            > coalesce(array_position(ARRAY['new','contact','qualified','interview','security','internship','paperwork','hired'],from_stage),0))::integer AS progressed,
        count(DISTINCT entity_id) FILTER(WHERE occurred_at >= $5 AND kind IN ('stage_changed','application_created') AND to_stage='hired')::integer AS hired,
        count(DISTINCT entity_id) FILTER(WHERE occurred_at >= $5 AND kind='task_completed')::integer AS "completedTasks"
        FROM recruitment_activity a JOIN regions r ON r.id=a.region_id WHERE ${whereRead(scope,'a.')} AND occurred_at<=$6
        GROUP BY a.actor_id`, [...tuple(scope), start, now]);
      const byUser = new Map(aggregated.rows.map(row => [row.userId, row]));
      const rows = people.rows.map(person => {
        const data = byUser.get(person.userId) || { visits: 0, dataReads: 0, activeDays: 0, requestViews: 0, uniqueRequests: 0, candidatesAdded: 0,
          contactsRecorded: 0, applicationsAdded: 0, stageChanges: 0, progressed: 0, hired: 0, completedTasks: 0, firstObservationAt: null, lastActivityAt: null };
        const observedDays = data.firstObservationAt ? Math.max(0, Math.min(days, Math.floor((now - data.firstObservationAt) / DAY))) : 0;
        const substantiveProgress = data.candidatesAdded + data.contactsRecorded + data.applicationsAdded + data.progressed + data.hired + data.completedTasks;
        const flagged = observedDays >= 7 && (data.activeDays >= 5 || data.requestViews >= 20) && substantiveProgress === 0;
        const state = !person.active || !person.approved ? 'disabled' : !person.hasScope ? 'revoked'
          : person.role === 'external_recruiter' ? accessState(person.requestIds ? person : null, now) : 'active';
        return { userId: person.userId, name: person.name, role: person.role, accessState: state, ...data, observedDays,
          attention: { flagged, reason: flagged ? 'Просмотры без зафиксированной работы: проверьте причины и актуальность доступа.'
            : observedDays < 7 ? 'Недостаточно времени наблюдения (менее 7 дней).' : 'Порог проверки не достигнут.' } };
      });
      return { days, periodStart: start.toISOString(), periodEnd: now.toISOString(), rows,
        metricDefinitions: { dataReads: 'Получение данных раздела сервером, включая обновления; одна запись на сессию за 30 минут. Это не число входов.', visits: 'Явное открытие раздела или смена области; одна запись на сессию за 30 минут.',
          requestViews: 'Явное открытие карточки; одна запись на сессию и потребность за 30 минут.',
          progressed: 'Число откликов с движением вперёд по основным этапам в периоде.',
          contactsRecorded: 'Число контактов и новых обращений, сохранённых сотрудником в приложении в периоде. Повторы запросов, импорт и действия от имени сотрудника не учитываются; запись не подтверждает состоявшийся разговор.',
          hired: 'Число откликов, вручную переведённых в «Выход» в периоде; не подтверждение фактического выхода.',
          attention: 'От 7 дней наблюдения, от 5 активных дней или 20 просмотров, без новых кандидатов, записанных контактов и обращений, откликов, продвижения и завершённых задач. Сигнал для проверки, не обвинение.',
          activeDays: 'Календарные дни по часовому поясу области с зафиксированной активностью.' },
        attentionThresholds: { observationDays: 7, activeDays: 5, requestViews: 20 }, retentionDays: null };
    });
  },
};
module.exports = { externalMethods, accessState };
