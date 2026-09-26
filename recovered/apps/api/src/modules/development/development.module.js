// SPDX-License-Identifier: MIT
"use strict";
const { randomUUID } = require('node:crypto');
const { Module, Injectable, Inject, Controller, Get, Put, Post, Body, Param, Query, Req, Header, UseGuards, UnauthorizedException } = require('@nestjs/common');
const { DatabaseService } = require('../../platform/database.service');
const { IdentityAccessModule } = require('../identity-access/identity-access.module');
const { IdentityRepository } = require('../identity-access/infrastructure/identity.repository');
const { AuthGuard } = require('../identity-access/interface/auth.guard');
const { CurrentActor } = require('../identity-access/interface/current-actor.decorator');
const { AuditService } = require('../audit/application/audit.service');
const { fail, conflict, forbidden, unavailable, uuid, ticketInput, commentInput } = require('./development-input');

const ROLES = Object.freeze(['driver', 'dispatcher', 'manager', 'recruiter', 'tender_specialist', 'document_specialist', 'mechanic', 'access_admin', 'auditor']);
const MAX_TICKETS = 2000;
const MAX_EVENTS = 10000;
const SCOPE_COLUMNS = Object.freeze({ legalEntityId: 'legal_entity_id', regionId: 'region_id', projectId: 'project_id', responsibilityScopeId: 'responsibility_scope_id' });
const FIELDS = Object.freeze({ title: 'title', description: 'description', section: 'section', status: 'status' });
const TICKET_COLUMNS = 'id,number,responsibility_scope_id AS "responsibilityScopeId",title,description,section,status,author_id AS "authorId",author_name AS "authorName",version,created_at AS "createdAt",updated_at AS "updatedAt"';
const EVENT_COLUMNS = 'id,ticket_id AS "ticketId",type,text,actor_id AS "actorId",actor_name AS "actorName",created_at AS "createdAt",from_status AS "fromStatus",to_status AS "toStatus"';
const STATUS_LABELS = Object.freeze({ new: 'Новые', clarifying: 'Уточнение', ready: 'Готово к разработке', in_progress: 'В работе', review: 'Проверка', done: 'Готово' });
const FIELD_LABELS = Object.freeze({ title: 'название', description: 'описание', section: 'раздел' });
function tuple(scope) { return Object.keys(SCOPE_COLUMNS).map(key => scope[key]); }
function whereScope(first = 1) { return Object.values(SCOPE_COLUMNS).map((column, index) => `${column}=$${first + index}`).join(' AND '); }
function response(row) { return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value instanceof Date ? value.toISOString() : value])); }
function bounded(rows, maximum, message) {
  if (rows.length > maximum) fail(message);
  return rows;
}
function canManage(actor) { return actor.role === 'access_admin'; }
function publicTicket(row, actor, scope) {
  const ticket = response(row);
  if (!scope.personalDataVisible && ticket.authorId !== actor.id) ticket.authorName = 'Сотрудник';
  return ticket;
}
function publicEvent(row, actor, scope) {
  const event = response(row);
  if (!scope.personalDataVisible && event.actorId !== actor.id) event.actorName = 'Сотрудник';
  return event;
}

class DevelopmentService {
  constructor(database, identity, audit) { this.database = database; this.identity = identity; this.audit = audit; }
  async current(client, supplied) {
    // Grant and identity changes use these same sorted row locks. Revalidate
    // impersonated parent sessions as well as the signed-in employee.
    await this.identity.lockUsers(client, [supplied.id, supplied.impersonation?.administratorId].filter(Boolean));
    const actor = await this.identity.actorBySession(client, supplied.sessionId);
    if (!actor || actor.id !== supplied.id || actor.authVersion !== supplied.authVersion || actor.role !== supplied.role)
      throw new UnauthorizedException('Сессия недействительна.');
    if (!ROLES.includes(actor.role)) forbidden('Раздел «Разработка» недоступен для вашей роли.');
    return actor;
  }
  async scope(client, actor, id) {
    // Older access-grant rows may contain individually valid dimensions that do
    // not belong together. Compare the entire grant to the canonical scope.
    const found = await client.query(`SELECT p.legal_entity_id AS "legalEntityId",p.region_id AS "regionId",p.id AS "projectId",
      rs.id AS "responsibilityScopeId" FROM responsibility_scopes rs JOIN projects p ON p.id=rs.project_id WHERE rs.id=$1`, [id]);
    const canonical = found.rows[0];
    const scope = canonical && actor.grants.find(grant => tuple(grant).every((value, index) => value === tuple(canonical)[index]));
    if (!scope) forbidden();
    return scope;
  }
  async lockScope(client, scope) {
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,917042040))', [`scope:${JSON.stringify(tuple(scope))}`]);
  }
  async lockRecord(client, type, id) {
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,917042040))', [`record:${type}:${id}`]);
  }
  async eventCapacity(client, scope, ticketId) {
    const count = await client.query(`SELECT count(*)::integer AS count FROM development_events WHERE ${whereScope()} AND ticket_id=$5`, [...tuple(scope), ticketId]);
    if (count.rows[0].count >= MAX_EVENTS) fail('Достигнут предел истории тикета. Обратитесь к администратору.');
  }
  async context(supplied) {
    return this.database.transaction(async client => {
      const actor = await this.current(client, supplied);
      const result = await client.query(`SELECT g.legal_entity_id AS "legalEntityId",g.region_id AS "regionId",g.project_id AS "projectId",
        g.responsibility_scope_id AS "responsibilityScopeId",le.name AS "legalEntityName",r.name AS "regionName",r.time_zone AS "timeZone",
        p.name AS "projectName",rs.name AS "scopeName" FROM access_grants g
        JOIN legal_entities le ON le.id=g.legal_entity_id JOIN regions r ON r.id=g.region_id
        JOIN projects p ON p.id=g.project_id AND p.legal_entity_id=g.legal_entity_id AND p.region_id=g.region_id
        JOIN responsibility_scopes rs ON rs.id=g.responsibility_scope_id AND rs.project_id=g.project_id
        WHERE g.user_id=$1 ORDER BY r.name,p.name,rs.name,g.responsibility_scope_id LIMIT $2`, [actor.id, MAX_TICKETS + 1]);
      return { scopes: bounded(result.rows, MAX_TICKETS, 'Слишком много областей работы. Обратитесь к администратору.').map(response), canManage: canManage(actor) };
    });
  }
  async read(supplied, scopeId) {
    return this.database.transaction(async client => {
      const actor = await this.current(client, supplied);
      const scope = await this.scope(client, actor, uuid(scopeId, 'область работы'));
      const result = await client.query(`SELECT ${TICKET_COLUMNS} FROM development_tickets
        WHERE ${whereScope()} AND ($5::boolean OR author_id=$6)
        ORDER BY updated_at DESC,id LIMIT $7`, [...tuple(scope), canManage(actor), actor.id, MAX_TICKETS + 1]);
      return { tickets: bounded(result.rows, MAX_TICKETS, 'Слишком много тикетов для одного просмотра. Обратитесь к администратору для выгрузки данных.').map(row => publicTicket(row, actor, scope)) };
    });
  }
  async reference(client, actor, scope, id) {
    const result = await client.query(`SELECT ${TICKET_COLUMNS} FROM development_tickets
      WHERE ${whereScope()} AND id=$5 AND ($6::boolean OR author_id=$7)`, [...tuple(scope), id, canManage(actor), actor.id]);
    if (!result.rowCount) unavailable();
    return result.rows[0];
  }
  async detail(supplied, ticketId, scopeId) {
    return this.database.transaction(async client => {
      const actor = await this.current(client, supplied);
      const scope = await this.scope(client, actor, uuid(scopeId, 'область работы'));
      const id = uuid(ticketId, 'тикет');
      // One consistent ticket/history snapshot while comments and edits serialize.
      await this.lockScope(client, scope);
      const ticket = await this.reference(client, actor, scope, id);
      const result = await client.query(`SELECT ${EVENT_COLUMNS} FROM development_events
        WHERE ${whereScope()} AND ticket_id=$5 ORDER BY created_at,id LIMIT $6`, [...tuple(scope), id, MAX_EVENTS + 1]);
      return { ticket: publicTicket(ticket, actor, scope), events: bounded(result.rows, MAX_EVENTS, 'История тикета слишком велика. Обратитесь к администратору для выгрузки данных.').map(row => publicEvent(row, actor, scope)) };
    });
  }
  async appendEvent(client, actor, scope, event) {
    const result = await client.query(`INSERT INTO development_events(id,legal_entity_id,region_id,project_id,responsibility_scope_id,
      ticket_id,type,text,actor_id,actor_name,from_status,to_status)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING ${EVENT_COLUMNS}`,
    [event.id || randomUUID(), ...tuple(scope), event.ticketId, event.type, event.text, actor.id, actor.displayName, event.fromStatus || null, event.toStatus || null]);
    return publicEvent(result.rows[0], actor, scope);
  }
  async auditWrite(client, actor, scope, correlationId, action, entityType, entityId, metadata) {
    await this.audit.append(client, { actorId: actor.id, channel: actor.channel, correlationId: correlationId || randomUUID(), action, entityType, entityId,
      scope: Object.fromEntries(Object.keys(SCOPE_COLUMNS).map(key => [key, scope[key]])), metadata });
  }
  async save(supplied, body, correlationId) {
    return this.database.transaction(async client => {
      const actor = await this.current(client, supplied);
      const input = ticketInput(body);
      const scope = await this.scope(client, actor, input.responsibilityScopeId);
      await this.lockScope(client, scope);
      await this.lockRecord(client, 'ticket', input.id);
      const found = await client.query(`SELECT ${TICKET_COLUMNS},legal_entity_id AS "legalEntityId",region_id AS "regionId",project_id AS "projectId"
        FROM development_tickets WHERE id=$1 FOR UPDATE`, [input.id]);
      const existing = found.rows[0];
      if (existing && (tuple(existing).some((value, index) => value !== tuple(scope)[index]) || (!canManage(actor) && existing.authorId !== actor.id))) unavailable();
      if (input.version === 0 && input.status !== 'new') fail('Новый тикет должен начинаться с этапа «Новые».');
      if (existing && input.version === 0) {
        // A retry with the same client-generated ID is a read, never a new write.
        if (existing.version !== 1 || existing.authorId !== actor.id || Object.keys(FIELDS).some(key => existing[key] !== input[key]))
          conflict('Идентификатор тикета уже использован. Обновите данные перед сохранением.');
        const { legalEntityId, regionId, projectId, ...ticket } = existing;
        return publicTicket(ticket, actor, scope);
      }
      if ((existing?.version || 0) !== input.version) conflict();
      if (existing && !canManage(actor) && input.status !== existing.status) forbidden('Менять этап тикета может только администратор.');
      await this.eventCapacity(client, scope, input.id);
      let saved;
      if (existing) {
        saved = await client.query(`UPDATE development_tickets SET title=$2,description=$3,section=$4,status=$5,
          version=version+1,updated_by=$6,updated_at=clock_timestamp()
          WHERE id=$1 AND ${whereScope(7)} AND version=$11 RETURNING ${TICKET_COLUMNS}`,
        [input.id, input.title, input.description, input.section, input.status, actor.id, ...tuple(scope), input.version]);
        if (!saved.rowCount) conflict();
      } else {
        saved = await client.query(`INSERT INTO development_tickets(id,legal_entity_id,region_id,project_id,responsibility_scope_id,
          title,description,section,status,author_id,author_name,updated_by)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING ${TICKET_COLUMNS}`,
        [input.id, ...tuple(scope), input.title, input.description, input.section, input.status, actor.id, actor.displayName, actor.id]);
      }
      const event = { ticketId: input.id, type: 'updated', text: 'Тикет обновлён.' };
      if (!existing) Object.assign(event, { type: 'created', text: 'Тикет создан.', toStatus: 'new' });
      else {
        if (existing.status !== input.status) Object.assign(event, { type: 'status', text: `${STATUS_LABELS[existing.status]} → ${STATUS_LABELS[input.status]}`,
          fromStatus: existing.status, toStatus: input.status });
        const changed = Object.keys(FIELD_LABELS).filter(key => existing[key] !== input[key]);
        if (changed.length) event.text += ` Изменены поля: ${changed.map(key => FIELD_LABELS[key]).join(', ')}.`;
      }
      await this.appendEvent(client, actor, scope, event);
      const ticket = publicTicket(saved.rows[0], actor, scope);
      await this.auditWrite(client, actor, scope, correlationId, `development.ticket.${existing ? 'updated' : 'created'}`, 'development_tickets', input.id,
        { version: ticket.version, status: ticket.status, section: ticket.section });
      return ticket;
    });
  }
  async comment(supplied, body, correlationId) {
    return this.database.transaction(async client => {
      const actor = await this.current(client, supplied);
      const input = commentInput(body);
      const scope = await this.scope(client, actor, input.responsibilityScopeId);
      await this.lockScope(client, scope);
      await this.lockRecord(client, 'event', input.id);
      // Check current ticket access before even returning an idempotent comment.
      await this.reference(client, actor, scope, input.ticketId);
      const found = await client.query(`SELECT ${EVENT_COLUMNS},legal_entity_id AS "legalEntityId",region_id AS "regionId",
        project_id AS "projectId",responsibility_scope_id AS "responsibilityScopeId" FROM development_events WHERE id=$1`, [input.id]);
      const existing = found.rows[0];
      if (existing) {
        if (tuple(existing).some((value, index) => value !== tuple(scope)[index]) || existing.type !== 'comment' ||
          existing.actorId !== actor.id || existing.ticketId !== input.ticketId || existing.text !== input.text)
          conflict('Идентификатор комментария уже использован. Добавьте новый комментарий.');
        const { legalEntityId, regionId, projectId, responsibilityScopeId, ...event } = existing;
        return publicEvent(event, actor, scope);
      }
      await this.eventCapacity(client, scope, input.ticketId);
      const event = await this.appendEvent(client, actor, scope, { ...input, type: 'comment' });
      // Comments count as activity without invalidating a draft of ticket fields.
      await client.query(`UPDATE development_tickets SET updated_at=clock_timestamp(),updated_by=$6 WHERE ${whereScope()} AND id=$5`,
        [...tuple(scope), input.ticketId, actor.id]);
      await this.auditWrite(client, actor, scope, correlationId, 'development.comment.created', 'development_events', input.id, { ticketId: input.ticketId });
      return event;
    });
  }
}
Injectable()(DevelopmentService);
Inject(DatabaseService)(DevelopmentService, undefined, 0);
Inject(IdentityRepository)(DevelopmentService, undefined, 1);
Inject(AuditService)(DevelopmentService, undefined, 2);

class DevelopmentController {
  constructor(service) { this.service = service; }
  context(actor) { return this.service.context(actor); }
  read(actor, scopeId) { return this.service.read(actor, scopeId); }
  detail(actor, id, scopeId) { return this.service.detail(actor, id, scopeId); }
  saveTicket(actor, body, request) { return this.service.save(actor, body, request.correlationId); }
  saveComment(actor, body, request) { return this.service.comment(actor, body, request.correlationId); }
}
Inject(DevelopmentService)(DevelopmentController, undefined, 0);
Controller('development')(DevelopmentController);
UseGuards(AuthGuard)(DevelopmentController);
for (const [name, decorator] of [['context', Get('context')], ['read', Get()], ['detail', Get('tickets/:id')], ['saveTicket', Put('tickets')], ['saveComment', Post('comments')]]) {
  const descriptor = Object.getOwnPropertyDescriptor(DevelopmentController.prototype, name);
  decorator(DevelopmentController.prototype, name, descriptor);
  Header('Cache-Control', 'no-store')(DevelopmentController.prototype, name, descriptor);
  CurrentActor()(DevelopmentController.prototype, name, 0);
  if (name.startsWith('save')) { Body()(DevelopmentController.prototype, name, 1); Req()(DevelopmentController.prototype, name, 2); }
}
Query('responsibilityScopeId')(DevelopmentController.prototype, 'read', 1);
Param('id')(DevelopmentController.prototype, 'detail', 1);
Query('responsibilityScopeId')(DevelopmentController.prototype, 'detail', 2);
class DevelopmentModule {}
Module({ imports: [IdentityAccessModule], controllers: [DevelopmentController], providers: [DevelopmentService] })(DevelopmentModule);
module.exports = { DevelopmentModule, DevelopmentService };
