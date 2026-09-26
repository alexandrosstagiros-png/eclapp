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
const { fail, conflict, forbidden, uuid, customerInput, tenderInput, commentInput } = require('./tenders-input');

const ROLES = Object.freeze(['tender_specialist', 'access_admin']);
const MAX_RECORDS = 10000;
const MAX_EVENTS = 50000;
const SCOPE_COLUMNS = Object.freeze({ legalEntityId: 'legal_entity_id', regionId: 'region_id', projectId: 'project_id', responsibilityScopeId: 'responsibility_scope_id' });
const COMMON_COLUMNS = { id: 'id', responsibilityScopeId: 'responsibility_scope_id', version: 'version', createdAt: 'created_at', updatedAt: 'updated_at' };
const TYPES = Object.freeze({
  customers: { table: 'tender_customers', parse: customerInput, fields: { name: 'name' } },
  tenders: { table: 'tender_items', parse: tenderInput, fields: {
    customerId: 'customer_id', title: 'title', status: 'status', vehicleCount: 'vehicle_count', requirements: 'requirements', deliveryType: 'delivery_type',
    expectedLaunch: 'expected_launch', launchNotes: 'launch_notes', submissionDeadline: 'submission_deadline', nextStep: 'next_step', nextStepDue: 'next_step_due',
    kind: 'kind', closeReason: 'close_reason', winReason: 'win_reason',
  } },
});
const EVENT_COLUMNS = 'id,tender_id AS "tenderId",customer_id AS "customerId",type,text,actor_id AS "actorId",actor_name AS "actorName",created_at AS "createdAt",from_status AS "fromStatus",to_status AS "toStatus"';
const STATUS_LABELS = Object.freeze({ planned: 'Запланировано', in_progress: 'В работе', awaiting_decision: 'Ждём решения', won: 'Выиграно', closed: 'Закрыто' });
const FIELD_LABELS = Object.freeze({ customerId: 'заказчик', title: 'название', vehicleCount: 'количество автомобилей', requirements: 'требования',
  deliveryType: 'тип доставки', expectedLaunch: 'дата запуска', launchNotes: 'условия запуска', submissionDeadline: 'дедлайн подачи',
  nextStep: 'следующий шаг', nextStepDue: 'срок следующего шага', kind: 'тип работы', closeReason: 'причина закрытия', winReason: 'результат победы' });
function tuple(scope) { return Object.keys(SCOPE_COLUMNS).map(key => scope[key]); }
function whereScope(alias = '', first = 1) {
  return Object.values(SCOPE_COLUMNS).map((column, index) => `${alias}${column}=$${first + index}`).join(' AND ');
}
function columns(type) {
  return Object.entries({ ...COMMON_COLUMNS, ...TYPES[type].fields }).map(([key, column]) =>
    ['expectedLaunch', 'submissionDeadline', 'nextStepDue'].includes(key) ? `to_char(${column},'YYYY-MM-DD') AS "${key}"` : `${column} AS "${key}"`).join(',');
}
function response(row) { return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value instanceof Date ? value.toISOString() : value])); }
function bounded(rows, maximum = MAX_RECORDS) {
  if (rows.length > maximum) fail('В области слишком много записей для одного просмотра. Обратитесь к администратору для разделения областей или выгрузки данных.');
  return rows.map(response);
}
function publicEvent(row, actor, scope) {
  const event = response(row);
  if (!scope.personalDataVisible && event.actorId !== actor.id) event.actorName = 'Сотрудник';
  return event;
}

class TendersService {
  constructor(database, identity, audit) { this.database = database; this.identity = identity; this.audit = audit; }
  async current(client, supplied) {
    // Identity/grant mutations lock these same sorted user rows. Include the
    // administrator of an impersonated session when revalidating its parent.
    await this.identity.lockUsers(client, [supplied.id, supplied.impersonation?.administratorId].filter(Boolean));
    const actor = await this.identity.actorBySession(client, supplied.sessionId);
    if (!actor || actor.id !== supplied.id || actor.authVersion !== supplied.authVersion || actor.role !== supplied.role)
      throw new UnauthorizedException('Сессия недействительна.');
    if (!ROLES.includes(actor.role)) forbidden('Раздел «Тендеры» недоступен для вашей роли.');
    return actor;
  }
  scope(actor, id) {
    const scope = actor.grants.find(grant => grant.responsibilityScopeId === id && tuple(grant).every(value => typeof value === 'string' && value));
    if (!scope) forbidden();
    return scope;
  }
  async lockScope(client, scope) {
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,917042032))', [`scope:${JSON.stringify(tuple(scope))}`]);
  }
  async lockRecord(client, type, id) {
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,917042032))', [`record:${type}:${id}`]);
  }
  async capacity(client, scope, table, maximum) {
    // table is always an internal constant, never a request value.
    const count = await client.query(`SELECT count(*)::integer AS count FROM ${table} WHERE ${whereScope()}`, tuple(scope));
    if (count.rows[0].count >= maximum) fail('Достигнут предел записей в области. Обратитесь к администратору для разделения областей или выгрузки данных.');
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
        WHERE g.user_id=$1 ORDER BY r.name,p.name,rs.name,g.responsibility_scope_id LIMIT $2`, [actor.id, MAX_RECORDS + 1]);
      return { scopes: bounded(result.rows) };
    });
  }
  async read(supplied, scopeId) {
    return this.database.transaction(async client => {
      const actor = await this.current(client, supplied);
      const id = uuid(scopeId, 'область работы');
      const scope = this.scope(actor, id);
      await this.lockScope(client, scope);
      const result = {};
      for (const type of Object.keys(TYPES)) {
        const records = await client.query(`SELECT ${columns(type)} FROM ${TYPES[type].table} WHERE ${whereScope()}
          ORDER BY created_at DESC,id LIMIT $5`, [...tuple(scope), MAX_RECORDS + 1]);
        result[type] = bounded(records.rows);
      }
      const events = await client.query(`SELECT ${EVENT_COLUMNS} FROM tender_events WHERE ${whereScope()}
        ORDER BY created_at,id LIMIT $5`, [...tuple(scope), MAX_EVENTS + 1]);
      result.events = bounded(events.rows, MAX_EVENTS).map(row => publicEvent(row, actor, scope));
      return result;
    });
  }
  async reference(client, scope, type, id) {
    const result = await client.query(`SELECT ${columns(type)} FROM ${TYPES[type].table} WHERE ${whereScope()} AND id=$5`, [...tuple(scope), id]);
    if (!result.rowCount) fail(type === 'customers' ? 'Заказчик недоступен в выбранной области. Обновите данные.' : 'Тендер недоступен в выбранной области. Обновите данные.');
    return result.rows[0];
  }
  async appendEvent(client, scope, actor, event) {
    const result = await client.query(`INSERT INTO tender_events(id,legal_entity_id,region_id,project_id,responsibility_scope_id,
      tender_id,customer_id,type,text,actor_id,actor_name,from_status,to_status)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING ${EVENT_COLUMNS}`,
    [event.id || randomUUID(), ...tuple(scope), event.tenderId, event.customerId, event.type, event.text, actor.id, actor.displayName, event.fromStatus || null, event.toStatus || null]);
    return publicEvent(result.rows[0], actor, scope);
  }
  async auditWrite(client, scope, actor, correlationId, action, entityType, entityId, metadata) {
    await this.audit.append(client, { actorId: actor.id, channel: actor.channel, correlationId: correlationId || randomUUID(),
      action, entityType, entityId, scope: Object.fromEntries(Object.keys(SCOPE_COLUMNS).map(key => [key, scope[key]])), metadata });
  }
  async save(supplied, type, body, correlationId) {
    const definition = TYPES[type];
    if (!definition) fail();
    return this.database.transaction(async client => {
      const actor = await this.current(client, supplied);
      const input = definition.parse(body);
      const scope = this.scope(actor, input.responsibilityScopeId);
      await this.lockScope(client, scope);
      await this.lockRecord(client, type, input.id);
      const found = await client.query(`SELECT ${columns(type)},legal_entity_id AS "legalEntityId",region_id AS "regionId",project_id AS "projectId"
        FROM ${definition.table} WHERE id=$1 FOR UPDATE`, [input.id]);
      const existing = found.rows[0];
      if (existing && tuple(existing).some((value, index) => value !== tuple(scope)[index])) forbidden('Запись принадлежит другой области работы.');
      if ((existing?.version || 0) !== input.version) conflict();
      if (!existing) await this.capacity(client, scope, definition.table, MAX_RECORDS);
      if (type === 'tenders') {
        await this.reference(client, scope, 'customers', input.customerId);
        await this.capacity(client, scope, 'tender_events', MAX_EVENTS);
      }
      const fields = Object.entries(definition.fields);
      let saved;
      if (existing) {
        const values = [input.id, ...fields.map(([key]) => input[key]), actor.id, ...tuple(scope), input.version];
        saved = await client.query(`UPDATE ${definition.table} SET ${fields.map(([, column], index) => `${column}=$${index + 2}`).join(',')},
          version=version+1,updated_by=$${fields.length + 2},updated_at=clock_timestamp()
          WHERE id=$1 AND ${whereScope('', fields.length + 3)} AND version=$${values.length} RETURNING ${columns(type)}`, values);
        if (!saved.rowCount) conflict();
      } else {
        const names = ['id', ...Object.values(SCOPE_COLUMNS), ...fields.map(([, column]) => column), 'created_by', 'updated_by'];
        const values = [input.id, ...tuple(scope), ...fields.map(([key]) => input[key]), actor.id, actor.id];
        saved = await client.query(`INSERT INTO ${definition.table}(${names.join(',')}) VALUES(${values.map((_, index) => `$${index + 1}`).join(',')})
          RETURNING ${columns(type)}`, values);
      }
      if (type === 'tenders') {
        const event = { tenderId: input.id, customerId: input.customerId, type: 'updated', text: 'Карточка обновлена.' };
        if (!existing) Object.assign(event, { type: 'created', text: 'Тендер создан.', toStatus: input.status });
        else if (existing.status !== input.status) Object.assign(event, { type: 'status', text: `${STATUS_LABELS[existing.status]} → ${STATUS_LABELS[input.status]}`,
          fromStatus: existing.status, toStatus: input.status });
        if (existing) {
          const changed = Object.keys(FIELD_LABELS).filter(key => existing[key] !== input[key]);
          if (changed.length) event.text += ` Изменены поля: ${changed.map(key => FIELD_LABELS[key]).join(', ')}.`;
        }
        // Preserve the outcome even after reopening or editing the card later.
        if (input.status === 'closed') event.text += ` Причина закрытия: ${input.closeReason}`;
        if (input.status === 'won') event.text += ` Результат победы: ${input.winReason}`;
        await this.appendEvent(client, scope, actor, event);
      }
      const record = response(saved.rows[0]);
      await this.auditWrite(client, scope, actor, correlationId, `tenders.${type}.${existing ? 'updated' : 'created'}`, definition.table, input.id,
        { version: record.version, ...(type === 'tenders' ? { status: record.status, customerId: record.customerId } : {}) });
      return record;
    });
  }
  async comment(supplied, body, correlationId) {
    return this.database.transaction(async client => {
      const actor = await this.current(client, supplied);
      const input = commentInput(body);
      const scope = this.scope(actor, input.responsibilityScopeId);
      await this.lockScope(client, scope);
      await this.lockRecord(client, 'events', input.id);
      const found = await client.query(`SELECT ${EVENT_COLUMNS},legal_entity_id AS "legalEntityId",region_id AS "regionId",
        project_id AS "projectId",responsibility_scope_id AS "responsibilityScopeId" FROM tender_events WHERE id=$1`, [input.id]);
      const existing = found.rows[0];
      if (existing) {
        if (tuple(existing).some((value, index) => value !== tuple(scope)[index]) || existing.type !== 'comment' ||
          existing.actorId !== actor.id || existing.tenderId !== input.tenderId || existing.text !== input.text)
          conflict('Идентификатор комментария уже использован. Обновите данные и добавьте новый комментарий.');
        const { legalEntityId, regionId, projectId, responsibilityScopeId, ...event } = existing;
        return publicEvent(event, actor, scope);
      }
      const tender = await this.reference(client, scope, 'tenders', input.tenderId);
      await this.capacity(client, scope, 'tender_events', MAX_EVENTS);
      const event = await this.appendEvent(client, scope, actor, { ...input, customerId: tender.customerId, type: 'comment' });
      await this.auditWrite(client, scope, actor, correlationId, 'tenders.comment.created', 'tender_events', input.id, { tenderId: input.tenderId, customerId: tender.customerId });
      return event;
    });
  }
}
Injectable()(TendersService);
Inject(DatabaseService)(TendersService, undefined, 0);
Inject(IdentityRepository)(TendersService, undefined, 1);
Inject(AuditService)(TendersService, undefined, 2);

class TendersController {
  constructor(service) { this.service = service; }
  context(actor) { return this.service.context(actor); }
  read(actor, scopeId) { return this.service.read(actor, scopeId); }
  saveCustomer(actor, body, request) { return this.service.save(actor, 'customers', body, request.correlationId); }
  saveTender(actor, body, request) { return this.service.save(actor, 'tenders', body, request.correlationId); }
  saveComment(actor, body, request) { return this.service.comment(actor, body, request.correlationId); }
}
Inject(TendersService)(TendersController, undefined, 0);
Controller('tenders')(TendersController);
UseGuards(AuthGuard)(TendersController);
for (const [name, decorator] of [['context', Get('context')], ['read', Get()], ['saveCustomer', Put('customers')], ['saveTender', Put('items')], ['saveComment', Post('comments')]]) {
  const descriptor = Object.getOwnPropertyDescriptor(TendersController.prototype, name);
  decorator(TendersController.prototype, name, descriptor);
  Header('Cache-Control', 'no-store')(TendersController.prototype, name, descriptor);
  CurrentActor()(TendersController.prototype, name, 0);
  if (name.startsWith('save')) { Body()(TendersController.prototype, name, 1); Req()(TendersController.prototype, name, 2); }
}
Query('responsibilityScopeId')(TendersController.prototype, 'read', 1);
class TendersModule {}
Module({ imports: [IdentityAccessModule], controllers: [TendersController], providers: [TendersService] })(TendersModule);
module.exports = { TendersModule, TendersService };
