'use strict';
const { randomUUID } = require('node:crypto');
const { ForbiddenException, NotFoundException } = require('@nestjs/common');
const { canManage, tuple, ROLES } = require('./team.service');
const { nextRun, previousRun, scheduleInput, periodInput, extractDigest, recipients, record, id } = require('./team-insights-domain');
const scopeWhere = (alias = '', start = 1) => ['legal_entity_id', 'region_id', 'project_id', 'responsibility_scope_id'].map((key, index) => `${alias ? `${alias}.` : ''}${key}=$${start + index}`).join(' AND ');
const iso = value => value ? new Date(value).toISOString() : null;
const reportResponse = row => ({ id: row.id, responsibilityScopeId: row.responsibility_scope_id, ownerId: row.owner_id, title: row.title, createdAt: iso(row.created_at), periodStart: iso(row.period_start), periodEnd: iso(row.period_end), messageCount: row.message_count, mode: row.mode, overview: row.overview, items: row.items, sourceMessageIds: row.source_message_ids, recipientIds: row.recipient_ids, scheduleId: row.schedule_id || null });
const scheduleResponse = row => ({ id: row.id, responsibilityScopeId: row.responsibility_scope_id, ownerId: row.owner_id, enabled: row.enabled, frequency: row.frequency, time: row.local_time, timeZone: row.time_zone, weekday: row.weekday, recipientIds: row.recipient_ids, nextRunAt: iso(row.next_run_at), lastRunAt: iso(row.last_run_at), nextAttemptAt: iso(row.next_attempt_at), lastError: row.last_error, attempts: row.attempts });
function admin(actor) { if (!canManage(actor)) throw new ForbiddenException('Саммари и расписания создаёт администратор'); }
function rawScope(row) { return { legalEntityId: row.legal_entity_id, regionId: row.region_id, projectId: row.project_id, responsibilityScopeId: row.responsibility_scope_id }; }
function sameScope(first, second) { return tuple(first).every((value, index) => value === tuple(second)[index]); }

class TeamInsightsService {
  constructor(database, teamService) { this.database = database; this.team = teamService; this.running = false; }
  async lockUsers(client, userIds) {
    await this.team.identity.lockUsers(client, userIds.filter(Boolean));
  }
  async eligibleRecipients(client, scope, userIds) {
    if (!userIds.length) return [];
    const result = await client.query(`SELECT u.id FROM users u WHERE u.id=ANY($1::uuid[]) AND u.active AND u.approved
      AND u.role=ANY($6::text[]) AND EXISTS(SELECT FROM access_grants g WHERE g.user_id=u.id AND ${scopeWhere('g', 2)}) ORDER BY u.id`, [userIds, ...tuple(scope), [...ROLES]]);
    const eligible = result.rows.map(row => row.id).sort();
    if (eligible.length !== userIds.length) throw new ForbiddenException('Получатели должны быть активными сотрудниками с доступом к выбранной области');
    return eligible;
  }
  async summaries(supplied, query) {
    const scopeId = id(query?.responsibilityScopeId, 'responsibilityScopeId');
    return this.database.transaction(async client => {
      const actor = await this.team.current(client, supplied), scope = await this.team.workScope(client, actor, scopeId);
      const manager = canManage(actor);
      const rows = (await client.query(`SELECT * FROM team_summaries WHERE ${scopeWhere()} AND ($5::boolean OR $6::uuid=ANY(recipient_ids)) ORDER BY created_at DESC,id`, [...tuple(scope), manager, actor.id])).rows;
      // Shared reports confer no conversation membership and contain only the
      // explicitly shared, frozen report. Message APIs retain their own checks.
      return { summaries: rows.map(reportResponse), canManage: manager };
    });
  }
  async build(client, actor, scope, periodStart, periodEnd, recipientIds, correlationId, schedule = null) {
    const messages = (await client.query(`SELECT m.id,m.conversation_id,m.parent_id,m.text,m.created_at,c.kind,c.visibility,
        ARRAY(SELECT user_id FROM team_members WHERE conversation_id=c.id) AS member_ids
      FROM team_messages m JOIN team_conversations c ON c.id=m.conversation_id AND c.legal_entity_id=m.legal_entity_id
        AND c.region_id=m.region_id AND c.project_id=m.project_id AND c.responsibility_scope_id=m.responsibility_scope_id
      WHERE ${scopeWhere('m')} AND m.deleted_at IS NULL AND c.deleted_at IS NULL AND m.created_at >= $5 AND m.created_at < $6 ORDER BY m.created_at,m.id`, [...tuple(scope), periodStart, periodEnd])).rows;
    for (const conversationId of new Set(messages.filter(message => message.visibility === 'private' && !message.member_ids.includes(actor.id)).map(message => message.conversation_id))) {
      const message = messages.find(row => row.conversation_id === conversationId);
      await this.team.auditWrite(client, actor, scope, correlationId, message.kind === 'direct' ? 'team.direct.admin_read' : 'team.channel.admin_read',
        'team_conversations', conversationId, { source: 'summary_generation', memberIds: message.member_ids, scheduled: Boolean(schedule) });
    }
    const digest = extractDigest(messages), reportId = randomUUID();
    const title = `Саммари · ${periodStart.toISOString().slice(0, 10)} — ${periodEnd.toISOString().slice(0, 10)}`;
    const row = (await client.query(`INSERT INTO team_summaries(id,legal_entity_id,region_id,project_id,responsibility_scope_id,owner_id,title,period_start,period_end,message_count,mode,overview,items,source_message_ids,recipient_ids,schedule_id,scheduled_for)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14::uuid[],$15::uuid[],$16,$17) RETURNING *`, [reportId, ...tuple(scope), actor.id, title, periodStart, periodEnd, digest.messageCount, digest.mode, digest.overview, JSON.stringify(digest.items), digest.sourceMessageIds, recipientIds, schedule?.id || null, schedule?.scheduledFor || null])).rows[0];
    await this.team.auditWrite(client, actor, scope, correlationId, 'team.summary.created', 'team_summary', reportId, { messageCount: digest.messageCount, periodStart: periodStart.toISOString(), periodEnd: periodEnd.toISOString(), recipientCount: recipientIds.length, scheduled: Boolean(schedule) });
    return reportResponse(row);
  }
  async generate(supplied, body, correlationId) {
    const input = periodInput(body);
    return this.database.transaction(async client => {
      const actor = await this.team.current(client, supplied); admin(actor);
      const scope = await this.team.workScope(client, actor, input.responsibilityScopeId);
      await this.team.lockScope(client, scope);
      return this.build(client, actor, scope, input.periodStart, input.periodEnd, [], correlationId);
    });
  }
  async share(supplied, reportId, body, correlationId) {
    id(reportId); record(body, ['responsibilityScopeId', 'recipientIds']);
    const scopeId = id(body.responsibilityScopeId, 'responsibilityScopeId'), recipientIds = recipients(body.recipientIds);
    return this.database.transaction(async client => {
      await this.lockUsers(client, [supplied.id, supplied.impersonation?.administratorId, ...recipientIds]);
      const actor = await this.team.current(client, supplied); admin(actor);
      const scope = await this.team.workScope(client, actor, scopeId);
      await this.team.lockScope(client, scope);
      const old = (await client.query(`SELECT id FROM team_summaries WHERE id=$5 AND ${scopeWhere()} FOR UPDATE`, [...tuple(scope), reportId])).rows[0];
      if (!old) throw new NotFoundException('Саммари не найдено');
      await this.eligibleRecipients(client, scope, recipientIds);
      const row = (await client.query('UPDATE team_summaries SET recipient_ids=$2::uuid[] WHERE id=$1 RETURNING *', [reportId, recipientIds])).rows[0];
      await this.team.auditWrite(client, actor, scope, correlationId, 'team.summary.shared', 'team_summary', reportId, { recipientIds });
      return reportResponse(row);
    });
  }
  async schedules(supplied, query) {
    const scopeId = id(query?.responsibilityScopeId, 'responsibilityScopeId');
    return this.database.transaction(async client => {
      const actor = await this.team.current(client, supplied); admin(actor);
      const scope = await this.team.workScope(client, actor, scopeId);
      const rows = (await client.query(`SELECT * FROM team_summary_schedules WHERE ${scopeWhere()} ORDER BY created_at,id`, tuple(scope))).rows;
      return { schedules: rows.map(scheduleResponse) };
    });
  }
  async saveSchedule(supplied, body, correlationId) {
    const input = scheduleInput(body);
    return this.database.transaction(async client => {
      const existing = input.id ? (await client.query('SELECT owner_id FROM team_summary_schedules WHERE id=$1', [input.id])).rows[0] : null;
      await this.lockUsers(client, [supplied.id, supplied.impersonation?.administratorId, ...(existing ? [existing.owner_id] : []), ...input.recipientIds]);
      const actor = await this.team.current(client, supplied); admin(actor);
      const scope = await this.team.workScope(client, actor, input.responsibilityScopeId);
      await this.team.lockScope(client, scope);
      await this.eligibleRecipients(client, scope, input.recipientIds);
      const scheduleId = input.id || randomUUID(), now = new Date(), next = nextRun(input, now);
      await this.team.lockRecord(client, 'summary-schedule', scheduleId);
      const old = (await client.query('SELECT * FROM team_summary_schedules WHERE id=$1 FOR UPDATE', [scheduleId])).rows[0];
      if (old && !sameScope(rawScope(old), scope)) throw new NotFoundException('Расписание не найдено');
      let row;
      if (old) {
        if (old.enabled === input.enabled && old.frequency === input.frequency && old.local_time === input.time && old.time_zone === input.timeZone && old.weekday === input.weekday && JSON.stringify(old.recipient_ids) === JSON.stringify(input.recipientIds)) return scheduleResponse(old);
        // Other administrators can pause or edit a schedule, but it continues
        // to run only while its original owner's current authority is valid.
        row = (await client.query(`UPDATE team_summary_schedules SET enabled=$2,frequency=$3,local_time=$4,time_zone=$5,weekday=$6,recipient_ids=$7::uuid[],next_run_at=$8,next_attempt_at=$8,attempts=0,last_error=NULL,version=version+1,updated_at=clock_timestamp() WHERE id=$1 RETURNING *`, [scheduleId, input.enabled, input.frequency, input.time, input.timeZone, input.weekday, input.recipientIds, next])).rows[0];
      } else {
        row = (await client.query(`INSERT INTO team_summary_schedules(id,legal_entity_id,region_id,project_id,responsibility_scope_id,owner_id,enabled,frequency,local_time,time_zone,weekday,recipient_ids,next_run_at,next_attempt_at)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::uuid[],$13,$13) RETURNING *`, [scheduleId, ...tuple(scope), actor.id, input.enabled, input.frequency, input.time, input.timeZone, input.weekday, input.recipientIds, next])).rows[0];
      }
      await this.team.auditWrite(client, actor, scope, correlationId, 'team.schedule.saved', 'team_summary_schedule', scheduleId, { enabled: input.enabled, frequency: input.frequency, timeZone: input.timeZone, recipientIds: input.recipientIds });
      return scheduleResponse(row);
    });
  }
  async owner(client, userId) {
    const row = (await client.query('SELECT id,display_name,role,active,approved FROM users WHERE id=$1', [userId])).rows[0];
    if (!row || !row.active || !row.approved || row.role !== 'access_admin') throw new ForbiddenException('OWNER_ACCESS_REVOKED');
    const grants = (await client.query(`SELECT legal_entity_id AS "legalEntityId",region_id AS "regionId",project_id AS "projectId",responsibility_scope_id AS "responsibilityScopeId",finance_visible AS "financeVisible",personal_data_visible AS "personalDataVisible" FROM access_grants WHERE user_id=$1`, [userId])).rows;
    return { id: row.id, displayName: row.display_name, role: row.role, channel: 'web', grants };
  }
  async runSchedule(candidate, now) {
    return this.database.transaction(async client => {
      await this.lockUsers(client, [candidate.owner_id, ...candidate.recipient_ids]);
      // Mutations and workers lock owner/recipients before the scope and the
      // schedule row. SKIP LOCKED plus the unique occurrence key allow replicas.
      const expectedScope = rawScope(candidate);
      await this.team.lockScope(client, expectedScope);
      const row = (await client.query(`SELECT * FROM team_summary_schedules WHERE id=$1 AND enabled AND next_run_at<=$2 AND next_attempt_at<=$2 FOR UPDATE SKIP LOCKED`, [candidate.id, now])).rows[0];
      if (!row) return null;
      if (row.version !== candidate.version) return null;
      const scheduledFor = new Date(row.next_run_at), config = scheduleResponse(row), runId = randomUUID();
      await client.query(`INSERT INTO team_summary_runs(id,schedule_id,scheduled_for,status,attempts,attempted_at) VALUES($1,$2,$3,'running',1,$4)
        ON CONFLICT(schedule_id,scheduled_for) DO UPDATE SET status='running',attempts=team_summary_runs.attempts+1,error_code=NULL,attempted_at=EXCLUDED.attempted_at,completed_at=NULL`, [runId, row.id, scheduledFor, now]);
      await client.query('SAVEPOINT summary_generation');
      try {
        const actor = await this.owner(client, row.owner_id), scope = await this.team.workScope(client, actor, row.responsibility_scope_id);
        if (!sameScope(scope, expectedScope)) throw new ForbiddenException('OWNER_ACCESS_REVOKED');
        await this.eligibleRecipients(client, scope, row.recipient_ids);
        const periodStart = row.last_period_end ? new Date(row.last_period_end) : previousRun(config, scheduledFor);
        const report = await this.build(client, actor, scope, periodStart, scheduledFor, row.recipient_ids, randomUUID(), { id: row.id, scheduledFor });
        const next = nextRun(config, scheduledFor);
        await client.query(`UPDATE team_summary_runs SET status='succeeded',summary_id=$3,completed_at=$4,error_code=NULL WHERE schedule_id=$1 AND scheduled_for=$2`, [row.id, scheduledFor, report.id, now]);
        await client.query(`UPDATE team_summary_schedules SET next_run_at=$2,next_attempt_at=$2,last_run_at=$3,last_period_end=$4,attempts=0,last_error=NULL,updated_at=clock_timestamp() WHERE id=$1`, [row.id, next, now, scheduledFor]);
        await client.query('RELEASE SAVEPOINT summary_generation');
        return { scheduleId: row.id, reportId: report.id, status: 'succeeded' };
      } catch (error) {
        await client.query('ROLLBACK TO SAVEPOINT summary_generation');
        const forbidden = error?.status === 403 || error?.status === 401, attempts = row.attempts + 1;
        const code = forbidden ? 'ACCESS_REVOKED' : 'SUMMARY_GENERATION_FAILED';
        const exhausted = attempts >= 6, retryAt = new Date(now.getTime() + Math.min(3600000, 60000 * 2 ** (attempts - 1)));
        await client.query(`UPDATE team_summary_runs SET status='failed',error_code=$3,completed_at=$4 WHERE schedule_id=$1 AND scheduled_for=$2`, [row.id, scheduledFor, code, now]);
        await client.query(`UPDATE team_summary_schedules SET enabled=$2,attempts=$3,last_error=$4,next_attempt_at=$5,updated_at=clock_timestamp() WHERE id=$1`, [row.id, !forbidden && !exhausted, attempts, exhausted && !forbidden ? 'RETRIES_EXHAUSTED' : code, retryAt]);
        await client.query('RELEASE SAVEPOINT summary_generation');
        return { scheduleId: row.id, status: 'failed', error: code };
      }
    });
  }
  async runOnce(now = new Date()) {
    if (this.running) return [];
    this.running = true;
    this.activeRun = (async () => {
      const rows = (await this.database.pool.query('SELECT * FROM team_summary_schedules WHERE enabled AND next_run_at<=$1 AND next_attempt_at<=$1 ORDER BY next_run_at,id LIMIT 20', [now])).rows;
      const results = [];
      for (const row of rows) {
        const result = await this.runSchedule(row, now);
        if (result) results.push(result);
      }
      return results;
    })();
    try { return await this.activeRun; } finally { this.running = false; this.activeRun = null; }
  }
  tick(now = new Date()) { return this.runOnce(now); }
  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => this.runOnce().catch(() => process.stderr.write('Team summary scheduler unavailable\n')), 15000);
    this.timer.unref();
  }
  async onModuleDestroy() { clearInterval(this.timer); if (this.activeRun) await this.activeRun.catch(() => {}); }
}
module.exports = { TeamInsightsService, reportResponse, scheduleResponse };
