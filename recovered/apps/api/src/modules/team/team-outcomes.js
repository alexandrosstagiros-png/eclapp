'use strict';
const { randomUUID } = require('node:crypto');
const { Injectable, Inject, Controller, Get, Put, Query, Param, Body, Req, Header, UseGuards } = require('@nestjs/common');
const { DatabaseService } = require('../../platform/database.service');
const { AuthGuard } = require('../identity-access/interface/auth.guard');
const { CurrentActor } = require('../identity-access/interface/current-actor.decorator');
const { TeamService, tuple, whereScope, canManage } = require('./team.service');
const { loadOrganization, subordinateIds } = require('./team-organization-tasks');
const { object, uuid, fail, forbidden, unavailable, conflict } = require('./team-input');
const TIME_ZONE = 'Europe/Moscow';
// PostgreSQL date values are calendar labels, never host-time-zone instants.
const REPORT_COLUMNS = 'id,legal_entity_id,region_id,project_id,responsibility_scope_id,owner_id,owner_name,subordinate_ids,kind,period_start::text,period_end::text,due_at,assigned_at,done,in_progress,blockers,next_month_focus,gratitude,version,updated_at,submitted_at';
const day = value => value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
const iso = value => value ? new Date(value).toISOString() : null;
function periodFor(kind, now = new Date(), requested) {
  if (!['weekly', 'monthly'].includes(kind)) fail('Выберите недельные или месячные итоги.');
  const localDay = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const date = new Date(`${requested || localDay}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || (requested && (!/^\d{4}-\d{2}-\d{2}$/.test(requested) || day(date) !== requested))) fail('Некорректный период.');
  const start = new Date(date);
  if (kind === 'weekly') start.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7);
  else start.setUTCDate(1);
  if (requested && day(start) !== requested) fail('Период должен начинаться в понедельник или первого числа месяца.');
  const end = new Date(start), due = new Date(start);
  if (kind === 'weekly') { end.setUTCDate(end.getUTCDate() + 6); due.setUTCDate(due.getUTCDate() + 4); }
  else { end.setUTCMonth(end.getUTCMonth() + 1, 0); due.setTime(end.getTime()); }
  return { kind, start: day(start), end: day(end), dueAt: new Date(`${day(due)}T23:59:59.999+03:00`).toISOString(), timeZone: TIME_ZONE };
}
function text(value, label, max = 6000) {
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) fail(`Проверьте поле «${label}».`);
  return value.trim();
}
function saveInput(body) {
  object(body, ['responsibilityScopeId', 'operationId', 'version', 'done', 'inProgress', 'blockers', 'nextMonthFocus', 'gratitude', 'submit']);
  if (!Number.isSafeInteger(body.version) || body.version < 1 || body.version >= 2147483646) fail('Укажите актуальную версию отчёта.');
  if (typeof body.submit !== 'boolean') fail('Укажите действие с отчётом.');
  if (!Array.isArray(body.gratitude) || body.gratitude.length > 20) fail('Выберите не более 20 получателей благодарности.');
  const gratitude = body.gratitude.map(value => {
    object(value, ['recipientId', 'reason']);
    return { recipientId: uuid(value.recipientId, 'получатель'), reason: text(value.reason, 'за что благодарите', 1000) };
  }).sort((a, b) => a.recipientId.localeCompare(b.recipientId));
  if (new Set(gratitude.map(value => value.recipientId)).size !== gratitude.length) fail('Получатели благодарности не должны повторяться.');
  return { responsibilityScopeId: uuid(body.responsibilityScopeId, 'область'), operationId: uuid(body.operationId, 'операция'), version: body.version,
    done: text(body.done, 'что сделано'), inProgress: text(body.inProgress, 'что в работе'), blockers: text(body.blockers, 'препятствия'),
    nextMonthFocus: text(body.nextMonthFocus, 'фокус следующего месяца'), gratitude, submit: body.submit };
}
class TeamOutcomesService {
  constructor(database, teamService) { this.database = database; this.team = teamService; }
  now() { return new Date(); }
  async context(client, supplied, scopeId) {
    const actor = await this.team.current(client, supplied), scope = await this.team.workScope(client, actor, uuid(scopeId, 'область'));
    await this.team.lockScope(client, scope);
    const organization = await loadOrganization(client, this.team, actor, scope);
    return { actor, scope, organization, descendants: subordinateIds(organization, actor.id) };
  }
  allowed(context, row) { return canManage(context.actor) || row.owner_id === context.actor.id || context.descendants.has(row.owner_id); }
  publicReport(row, context, now = this.now()) {
    const own = row.owner_id === context.actor.id, submitted = Boolean(row.submitted_at), content = own || submitted;
    return { id: row.id, responsibilityScopeId: row.responsibility_scope_id, ownerId: row.owner_id,
      ownerName: context.scope.personalDataVisible || own ? row.owner_name : `Сотрудник · ${row.owner_id.slice(-6)}`,
      kind: row.kind, periodStart: day(row.period_start), periodEnd: day(row.period_end), dueAt: iso(row.due_at), assignedAt: iso(row.assigned_at),
      status: submitted ? 'submitted' : now > new Date(row.due_at) ? 'overdue' : 'pending', hasDraft: !submitted && row.version > 1,
      late: submitted && new Date(row.submitted_at) > new Date(row.due_at), submittedAt: iso(row.submitted_at), updatedAt: iso(row.updated_at), version: row.version,
      canEdit: own && !submitted && !context.actor.impersonation, contentVisible: content,
      ...(content ? { done: row.done, inProgress: row.in_progress, blockers: row.blockers, nextMonthFocus: row.next_month_focus,
        gratitude: row.gratitude.map(entry => ({ ...entry, recipientName: context.organization.people.find(person => person.id === entry.recipientId)?.displayName || 'Сотрудник' })) } : {}) };
  }
  async lockAssignmentOwners(client, scopeId, extra = []) {
    const rows = (await client.query('SELECT DISTINCT manager_id FROM team_organization_employees WHERE responsibility_scope_id=$1 AND manager_id IS NOT NULL', [uuid(scopeId, 'область')])).rows;
    const owners = new Set(rows.map(row => row.manager_id));
    await this.team.identity.lockUsers(client, [...owners, ...extra].filter(Boolean));
    return owners;
  }
  async ensureAssignments(client, context, period, lockedOwners) {
    const people = context.organization.people;
    for (const person of people) {
      // A concurrent organization change can introduce a new owner after the
      // sorted pre-lock snapshot. Materialize that owner on the next tick/read;
      // never acquire a user FK lock after the shared scope lock.
      if (!lockedOwners.has(person.id)) continue;
      const directs = people.filter(candidate => candidate.managerId === person.id).map(candidate => candidate.id).sort();
      if (!directs.length) continue;
      await client.query(`INSERT INTO team_outcome_reports(id,legal_entity_id,region_id,project_id,responsibility_scope_id,owner_id,owner_name,subordinate_ids,kind,period_start,period_end,due_at)
        VALUES($1,$2,$3,$4,$5,$6,(SELECT display_name FROM users WHERE id=$6),$7::uuid[],$8,$9,$10,$11)
        ON CONFLICT(responsibility_scope_id,owner_id,kind,period_start) DO NOTHING`, [randomUUID(), ...tuple(context.scope), person.id, directs, period.kind, period.start, period.end, period.dueAt]);
    }
  }
  async list(supplied, query) {
    return this.database.transaction(async client => {
      const lockedOwners = await this.lockAssignmentOwners(client, query.responsibilityScopeId, [supplied.id, supplied.impersonation?.administratorId]);
      const context = await this.context(client, supplied, query.responsibilityScopeId), now = this.now(), kind = query.kind || 'weekly';
      const currentPeriod = periodFor(kind, now), period = periodFor(kind, now, query.periodStart);
      if (period.start > currentPeriod.start) fail('Будущий период ещё не открыт.');
      await this.ensureAssignments(client, context, currentPeriod, lockedOwners);
      const rows = (await client.query(`SELECT ${REPORT_COLUMNS} FROM team_outcome_reports WHERE ${whereScope()} AND kind=$5 ORDER BY period_start DESC,owner_name,owner_id`, [...tuple(context.scope), kind])).rows.filter(row => this.allowed(context, row));
      const reports = rows.filter(row => day(row.period_start) === period.start).map(row => this.publicReport(row, context, now));
      const periods = [...new Set([currentPeriod.start, ...rows.map(row => day(row.period_start))])].sort().reverse().map(start => periodFor(kind, now, start));
      const featureStartedAt = iso((await client.query('SELECT feature_started_at FROM team_outcome_state WHERE singleton')).rows[0].feature_started_at);
      return { period, periods, reports, featureStartedAt, ownReportId: reports.find(row => row.ownerId === context.actor.id)?.id || null, canManage: canManage(context.actor),
        people: context.organization.people.filter(person => person.id !== context.actor.id).map(person => ({ id: person.id, displayName: person.displayName })),
        policy: 'Обязательства фиксируются автоматически для действующих руководителей. Изменение подчинённости не удаляет уже назначенные итоги. Черновик виден только автору; сданный отчёт — автору, его текущим руководителям и администратору.' };
    });
  }
  async detail(supplied, idValue, scopeId) {
    return this.database.transaction(async client => {
      const context = await this.context(client, supplied, scopeId);
      const row = (await client.query(`SELECT ${REPORT_COLUMNS} FROM team_outcome_reports WHERE ${whereScope()} AND id=$5`, [...tuple(context.scope), uuid(idValue, 'отчёт')])).rows[0];
      if (!row || !this.allowed(context, row)) unavailable();
      return this.publicReport(row, context);
    });
  }
  async save(supplied, idValue, body, correlationId) {
    const input = saveInput(body), id = uuid(idValue, 'отчёт');
    return this.database.transaction(async client => {
      // Recipient identity/grant changes and impersonation revocation use the same sorted user locks.
      await this.team.identity.lockUsers(client, [supplied.id, supplied.impersonation?.administratorId, ...input.gratitude.map(entry => entry.recipientId)].filter(Boolean));
      const context = await this.context(client, supplied, input.responsibilityScopeId), { actor, scope, organization } = context;
      const row = (await client.query(`SELECT ${REPORT_COLUMNS} FROM team_outcome_reports WHERE ${whereScope()} AND id=$5 FOR UPDATE`, [...tuple(scope), id])).rows[0];
      if (!row || !this.allowed(context, row)) unavailable();
      if (row.owner_id !== actor.id || actor.impersonation) forbidden('Итоги заполняет сам руководитель из своего аккаунта.');
      await this.team.lockRecord(client, 'outcome-operation', input.operationId);
      const { operationId, responsibilityScopeId, ...payload } = input;
      const old = (await client.query('SELECT report_id,actor_id,payload=$2::jsonb AS matches FROM team_outcome_operations WHERE id=$1', [operationId, JSON.stringify(payload)])).rows[0];
      if (old) {
        if (old.report_id !== id || old.actor_id !== actor.id || !old.matches) conflict('Идентификатор операции уже использован с другими данными.');
        return this.publicReport(row, context);
      }
      if (row.submitted_at) conflict('Отчёт уже сдан и не может быть изменён.');
      if (row.version !== input.version) conflict('Отчёт изменился. Загрузите актуальную версию, сохранив свой черновик.');
      if (input.submit && (!input.done || !input.inProgress || !input.blockers || (row.kind === 'monthly' && !input.nextMonthFocus))) fail('Заполните обязательные поля. Если пунктов нет, напишите «нет».');
      if (row.kind === 'weekly' && input.nextMonthFocus) fail('Фокус следующего месяца заполняется в месячных итогах.');
      const eligible = new Set(organization.people.map(person => person.id));
      for (const entry of input.gratitude) {
        if (entry.recipientId === actor.id) fail('Благодарность адресуется другому сотруднику.');
        if (!eligible.has(entry.recipientId)) forbidden('Получатель благодарности должен иметь действующий доступ к области.');
        if (input.submit && !entry.reason) fail('Укажите, за что благодарите выбранного сотрудника.');
      }
      const now = this.now();
      const saved = (await client.query(`UPDATE team_outcome_reports SET done=$6,in_progress=$7,blockers=$8,next_month_focus=$9,gratitude=$10::jsonb,
        version=version+1,updated_at=$11,submitted_at=CASE WHEN $12 THEN $11::timestamptz ELSE NULL END WHERE ${whereScope()} AND id=$5 RETURNING ${REPORT_COLUMNS}`,
      [...tuple(scope), id, input.done, input.inProgress, input.blockers, input.nextMonthFocus, JSON.stringify(input.gratitude), now, input.submit])).rows[0];
      if (input.submit) for (const entry of input.gratitude) await client.query(`INSERT INTO team_outcome_recognition(report_id,recipient_id,legal_entity_id,region_id,project_id,responsibility_scope_id,reason)
        VALUES($1,$2,$3,$4,$5,$6,$7)`, [id, entry.recipientId, ...tuple(scope), entry.reason]);
      await client.query(`INSERT INTO team_outcome_operations(id,report_id,legal_entity_id,region_id,project_id,responsibility_scope_id,actor_id,payload)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`, [operationId, id, ...tuple(scope), actor.id, JSON.stringify(payload)]);
      await this.team.auditWrite(client, actor, scope, correlationId, input.submit ? 'team.outcome.submitted' : 'team.outcome.draft_saved', 'team_outcome', id,
        { kind: row.kind, periodStart: day(row.period_start), version: saved.version, gratitudeCount: input.gratitude.length, late: input.submit && now > new Date(row.due_at) });
      return this.publicReport(saved, context, now);
    });
  }
  async recognition(supplied, scopeId) {
    return this.database.transaction(async client => {
      const context = await this.context(client, supplied, scopeId);
      const rows = (await client.query(`SELECT recipient_id AS "userId",count(*)::integer AS count FROM team_outcome_recognition WHERE ${whereScope()} GROUP BY recipient_id`, tuple(context.scope))).rows;
      const visible = new Set(context.organization.people.map(person => person.id));
      return { recognition: rows.filter(row => visible.has(row.userId)) };
    });
  }
  async tick(now = this.now()) {
    if (this.activeTick) return this.activeTick;
    this.activeTick = (async () => {
      const scopes = (await this.database.pool.query(`SELECT DISTINCT o.legal_entity_id AS "legalEntityId",o.region_id AS "regionId",o.project_id AS "projectId",
        o.responsibility_scope_id AS "responsibilityScopeId" FROM team_organization_employees o
        JOIN projects p ON p.id=o.project_id AND p.legal_entity_id=o.legal_entity_id AND p.region_id=o.region_id
        JOIN responsibility_scopes rs ON rs.id=o.responsibility_scope_id AND rs.project_id=o.project_id ORDER BY "responsibilityScopeId"`)).rows;
      for (const scope of scopes) await this.database.transaction(async client => {
        const lockedOwners = await this.lockAssignmentOwners(client, scope.responsibilityScopeId);
        await this.team.lockScope(client, scope);
        // Server-only materialization has no user session and never returns employee data.
        // The organization loader independently filters current active staff and canonical grants.
        const actor = { id: null }, organization = await loadOrganization(client, this.team, actor, { ...scope, personalDataVisible: true });
        for (const kind of ['weekly', 'monthly']) await this.ensureAssignments(client, { scope, organization }, periodFor(kind, now), lockedOwners);
      });
      return { scopes: scopes.length };
    })();
    try { return await this.activeTick; } finally { this.activeTick = null; }
  }
  async onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    await this.tick();
    this.timer = setInterval(() => this.tick().catch(() => process.stderr.write('Team outcome materialization unavailable\n')), 60000);
    this.timer.unref();
  }
  async onModuleDestroy() { clearInterval(this.timer); if (this.activeTick) await this.activeTick.catch(() => {}); }
}
Injectable()(TeamOutcomesService);
Inject(DatabaseService)(TeamOutcomesService, undefined, 0);
Inject(TeamService)(TeamOutcomesService, undefined, 1);
class TeamOutcomesController {
  constructor(service) { this.service = service; }
  list(actor, query) { return this.service.list(actor, query); }
  detail(actor, id, scopeId) { return this.service.detail(actor, id, scopeId); }
  save(actor, id, body, request) { return this.service.save(actor, id, body, request.correlationId); }
  recognition(actor, scopeId) { return this.service.recognition(actor, scopeId); }
}
Inject(TeamOutcomesService)(TeamOutcomesController, undefined, 0);
Controller('team')(TeamOutcomesController);
UseGuards(AuthGuard)(TeamOutcomesController);
for (const [name, method] of [['list', Get('outcomes')], ['detail', Get('outcomes/:id')], ['save', Put('outcomes/:id')], ['recognition', Get('recognition')]]) {
  const descriptor = Object.getOwnPropertyDescriptor(TeamOutcomesController.prototype, name);
  method(TeamOutcomesController.prototype, name, descriptor); Header('Cache-Control', 'no-store')(TeamOutcomesController.prototype, name, descriptor);
  CurrentActor()(TeamOutcomesController.prototype, name, 0);
}
Query()(TeamOutcomesController.prototype, 'list', 1);
Param('id')(TeamOutcomesController.prototype, 'detail', 1); Query('responsibilityScopeId')(TeamOutcomesController.prototype, 'detail', 2);
Param('id')(TeamOutcomesController.prototype, 'save', 1); Body()(TeamOutcomesController.prototype, 'save', 2); Req()(TeamOutcomesController.prototype, 'save', 3);
Query('responsibilityScopeId')(TeamOutcomesController.prototype, 'recognition', 1);
module.exports = { TeamOutcomesService, TeamOutcomesController, periodFor, saveInput };
