"use strict";
const { randomUUID } = require('node:crypto');
const { Module, Injectable, Inject, Controller, Get, Put, Post, HttpCode, Body, Query, Req, Header, UseGuards, UnauthorizedException, ForbiddenException, BadRequestException, ConflictException } = require('@nestjs/common');
const { DatabaseService } = require('../../platform/database.service');
const { IdentityAccessModule } = require('../identity-access/identity-access.module');
const { IdentityRepository } = require('../identity-access/infrastructure/identity.repository');
const { AuthGuard } = require('../identity-access/interface/auth.guard');
const { CurrentActor } = require('../identity-access/interface/current-actor.decorator');
const { AuditService } = require('../audit/application/audit.service');
const { uuid, businessDate, planInput } = require('./planning-input');
const { templateInput } = require('./planning-template-input');
const { calendarRange, calendarInput } = require('./planning-calendar-input');
const oneC = require('./planning-one-c');
const { driverOption, vehicleOption } = require('./planning-catalog');
const BUILTINS = require('./planning-builtins.json').map(definition => ({ ...definition, version: 1, custom: false }));
const BUILTIN_MAP = new Map(BUILTINS.map(template => [template.id, template]));

const ROLES = ['dispatcher', 'manager', 'access_admin'];
const PLAN_COLUMNS = `id,to_char(business_date,'YYYY-MM-DD') AS "businessDate",
  responsibility_scope_id AS "responsibilityScopeId",template_id AS "templateId",template_version AS "templateVersion",
  template_snapshot AS "templateSnapshot",rows,version,
  updated_at AS "updatedAt"`;
function tuple(scope) {
  return [scope.legalEntityId, scope.regionId, scope.projectId, scope.responsibilityScopeId];
}
function response(row) {
  return { ...row, updatedAt: row.updatedAt?.toISOString() ?? null };
}

class PlanningService {
  constructor(database, identity, audit) { this.database = database; this.identity = identity; this.audit = audit; }
  async current(client, supplied, driverIds = []) {
    // Match the existing identity mutation lock order. Grant revocation or driver
    // deactivation cannot race an in-flight save after this validation.
    await this.identity.lockUsers(client, [supplied.id, ...driverIds]);
    const current = await this.identity.actorBySession(client, supplied.sessionId);
    if (!current || current.id !== supplied.id || current.authVersion !== supplied.authVersion || current.role !== supplied.role)
      throw new UnauthorizedException('Сессия недействительна.');
    if (!ROLES.includes(current.role)) throw new ForbiddenException('Планирование недоступно для вашей роли.');
    return current;
  }
  scope(actor, id) {
    // A plan may contain arbitrary client-required personal data. A plain
    // project grant is insufficient even when the chosen rows currently look empty.
    const allowed = actor.grants.find(grant => grant.responsibilityScopeId === id && grant.personalDataVisible);
    if (!allowed) throw new ForbiddenException('Нет доступа к планированию в этой области. Требуется доступ к персональным данным.');
    return allowed;
  }
  async templateDefault(client, scope) {
    const result = await client.query(`SELECT template_id AS id FROM planning_template_defaults
      WHERE legal_entity_id=$1 AND region_id=$2 AND project_id=$3 AND responsibility_scope_id=$4`, tuple(scope));
    return result.rows[0]?.id ?? null;
  }
  async templates(actor, scopeId) {
    const id = uuid(scopeId, 'область работы');
    return this.database.transaction(async client => {
      const current = await this.current(client, actor);
      const scope = this.scope(current, id);
      const result = await client.query(`SELECT t.id,t.latest_version AS version,v.definition FROM planning_templates t
        JOIN planning_template_versions v ON v.template_id=t.id AND v.version=t.latest_version
        WHERE t.legal_entity_id=$1 AND t.region_id=$2 AND t.project_id=$3 AND t.responsibility_scope_id=$4
        ORDER BY lower(v.definition->>'label'),t.id`, tuple(scope));
      return { templates: [...BUILTINS, ...result.rows.map(row => ({ ...row.definition, id: row.id, version: row.version, custom: true }))],
        defaultTemplateId: await this.templateDefault(client, scope) };
    });
  }
  async resolveTemplate(client, scope, id, version) {
    const builtin = BUILTIN_MAP.get(id);
    if (builtin) {
      if (version !== undefined && version !== 1) throw new BadRequestException('Неизвестная версия встроенной формы.');
      return builtin;
    }
    if (version === undefined) throw new BadRequestException('Укажите версию формы клиента.');
    const customId = uuid(id, 'форма клиента');
    const result = await client.query(`SELECT v.definition FROM planning_templates t
      JOIN planning_template_versions v ON v.template_id=t.id AND v.version=$6
      WHERE t.id=$5 AND t.legal_entity_id=$1 AND t.region_id=$2 AND t.project_id=$3 AND t.responsibility_scope_id=$4`, [...tuple(scope), customId, version]);
    if (!result.rowCount) throw new BadRequestException('Форма или её версия недоступна в этой области.');
    return { ...result.rows[0].definition, id: customId, version, custom: true };
  }
  async planResponse(client, scope, row) {
    const plan = response(row);
    if (oneC.enabled()) plan.oneCExports = await oneC.receipts(client, scope.responsibilityScopeId, plan.businessDate, plan.rows);
    if (!plan.templateSnapshot) {
      plan.templateSnapshot = await this.resolveTemplate(client, scope, plan.templateId, plan.templateVersion ?? undefined);
      plan.templateVersion = plan.templateSnapshot.version;
    }
    return plan;
  }
  async saveTemplate(actor, body, correlationId) {
    const input = templateInput(body);
    return this.database.transaction(async client => {
      const current = await this.current(client, actor);
      const scope = this.scope(current, input.responsibilityScopeId);
      // Defaults and simultaneous first inserts must be serialized as well as updates.
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,917042020))', [`scope:${JSON.stringify(tuple(scope))}`]);
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,917042020))', [`template:${input.id}`]);
      const existing = (await client.query(`SELECT latest_version AS version,legal_entity_id AS "legalEntityId",region_id AS "regionId",
        project_id AS "projectId",responsibility_scope_id AS "responsibilityScopeId" FROM planning_templates WHERE id=$1 FOR UPDATE`, [input.id])).rows[0];
      if (existing && tuple(existing).some((value, index) => value !== tuple(scope)[index])) throw new ForbiddenException('Форма принадлежит другой области работы.');
      if ((existing?.version ?? 0) !== input.version) throw new ConflictException('Форма уже изменена другим менеджером. Загрузите актуальную версию.');
      const version = input.version + 1;
      if (existing) await client.query(`UPDATE planning_templates SET latest_version=$2,updated_by=$3,updated_at=clock_timestamp() WHERE id=$1`, [input.id, version, current.id]);
      else await client.query(`INSERT INTO planning_templates(id,legal_entity_id,region_id,project_id,responsibility_scope_id,latest_version,created_by,updated_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$7)`, [input.id, ...tuple(scope), version, current.id]);
      await client.query(`INSERT INTO planning_template_versions(template_id,version,definition,created_by) VALUES($1,$2,$3::jsonb,$4)`,
        [input.id, version, JSON.stringify(input.definition), current.id]);
      if (input.makeDefault) await client.query(`INSERT INTO planning_template_defaults(legal_entity_id,region_id,project_id,responsibility_scope_id,template_id,updated_by)
        VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(legal_entity_id,region_id,project_id,responsibility_scope_id)
        DO UPDATE SET template_id=excluded.template_id,updated_by=excluded.updated_by,updated_at=clock_timestamp()`, [...tuple(scope), input.id, current.id]);
      else await client.query(`UPDATE planning_template_defaults SET template_id=NULL,updated_by=$6,updated_at=clock_timestamp()
        WHERE legal_entity_id=$1 AND region_id=$2 AND project_id=$3 AND responsibility_scope_id=$4 AND template_id=$5`, [...tuple(scope), input.id, current.id]);
      const template = { ...input.definition, id: input.id, version, custom: true };
      await this.audit.append(client, {
        actorId: current.id, channel: current.channel, correlationId: correlationId || randomUUID(),
        action: existing ? 'planning.template_updated' : 'planning.template_created', entityType: 'planning_template', entityId: input.id,
        scope: { legalEntityId: scope.legalEntityId, regionId: scope.regionId, projectId: scope.projectId, responsibilityScopeId: scope.responsibilityScopeId },
        metadata: { version, kind: template.kind, sectionCount: template.sections.length,
          columnCount: template.sections.reduce((sum, section) => sum + section.columns.length, 0), makeDefault: input.makeDefault },
      });
      return { template, defaultTemplateId: await this.templateDefault(client, scope) };
    });
  }
  async context(actor) {
    return this.database.transaction(async client => {
      const current = await this.current(client, actor);
      const result = await client.query(`SELECT g.legal_entity_id AS "legalEntityId",g.region_id AS "regionId",
        g.project_id AS "projectId",g.responsibility_scope_id AS "responsibilityScopeId",
        le.name AS "legalEntityName",r.name AS "regionName",r.time_zone AS "timeZone",
        p.name AS "projectName",rs.name AS "scopeName",rs.name AS "responsibilityScopeName"
        FROM access_grants g
        JOIN legal_entities le ON le.id=g.legal_entity_id
        JOIN regions r ON r.id=g.region_id
        JOIN projects p ON p.id=g.project_id AND p.legal_entity_id=g.legal_entity_id AND p.region_id=g.region_id
        JOIN responsibility_scopes rs ON rs.id=g.responsibility_scope_id AND rs.project_id=g.project_id
        WHERE g.user_id=$1 AND g.personal_data_visible ORDER BY r.name,p.name,rs.name,g.responsibility_scope_id`, [current.id]);
      if (oneC.enabled()) {
        const connected = new Set((await client.query('SELECT responsibility_scope_id FROM planning_one_c_scopes')).rows.map(row => row.responsibility_scope_id));
        result.rows.sort((a,b) => Number(connected.has(b.responsibilityScopeId)) - Number(connected.has(a.responsibilityScopeId)));
      }
      return { scopes: result.rows, ...(oneC.enabled() ? { oneC:{enabled:true,targetLabel:oneC.TARGET_LABEL} } : {}) };
    });
  }
  async options(actor, scopeId) {
    const id = uuid(scopeId, 'область работы');
    return this.database.transaction(async client => {
      const current = await this.current(client, actor);
      const scope = this.scope(current, id);
      const params = tuple(scope);
      const drivers = await client.query(`SELECT u.id,u.display_name AS name,p.phone,d.data AS "planningData" FROM users u
        JOIN access_grants g ON g.user_id=u.id
        LEFT JOIN user_profiles p ON p.user_id=u.id
        LEFT JOIN planning_resource_data d ON d.kind='driver' AND d.resource_id=u.id
          AND d.legal_entity_id=$1 AND d.region_id=$2 AND d.project_id=$3 AND d.responsibility_scope_id=$4
        WHERE u.role='driver' AND u.active AND u.approved
        AND g.legal_entity_id=$1 AND g.region_id=$2 AND g.project_id=$3 AND g.responsibility_scope_id=$4
        ORDER BY u.display_name,u.id`, params);
      // The fleet follows the existing workflow catalog rule: a vehicle must
      // already occur on a trip in this exact scope, rather than in a global list.
      const vehicles = await client.query(`SELECT v.id,v.label,v.body_type AS "bodyType",v.capacity_kg AS "capacityKg",v.fleet_type AS "fleetType",d.data AS "planningData"
        FROM vehicles v LEFT JOIN planning_resource_data d ON d.kind='vehicle' AND d.resource_id=v.id
          AND d.legal_entity_id=$1 AND d.region_id=$2 AND d.project_id=$3 AND d.responsibility_scope_id=$4
        WHERE EXISTS(SELECT 1 FROM trips t WHERE t.vehicle_id=v.id
          AND t.legal_entity_id=$1 AND t.region_id=$2 AND t.project_id=$3 AND t.responsibility_scope_id=$4)
        ORDER BY v.label,v.id`, params);
      if (oneC.enabled()) {
        const mapped = await client.query(`SELECT r.local_id AS id,r.label,r.registration,d.data AS "planningData" FROM planning_one_c_resources r
          LEFT JOIN planning_resource_data d ON d.responsibility_scope_id=r.responsibility_scope_id AND d.kind=r.kind AND d.resource_id=r.local_id
          WHERE r.responsibility_scope_id=$1 AND r.kind='vehicle' AND r.active ORDER BY r.label,r.local_id`, [id]);
        const ids = new Set(vehicles.rows.map(vehicle => vehicle.id));
        for (const vehicle of mapped.rows) if (!ids.has(vehicle.id)) vehicles.rows.push(vehicle);
      }
      const imported = await client.query(`SELECT r.id,r.kind,r.label,d.data AS "planningData"
        FROM planning_imported_resources r LEFT JOIN planning_resource_data d ON d.responsibility_scope_id=r.responsibility_scope_id
          AND d.kind=r.kind AND d.resource_id=r.id
        WHERE r.legal_entity_id=$1 AND r.region_id=$2 AND r.project_id=$3 AND r.responsibility_scope_id=$4 AND r.active
          AND NOT EXISTS(SELECT 1 FROM users u WHERE u.id=r.id)
          AND NOT EXISTS(SELECT 1 FROM vehicles v WHERE v.id=r.id)
        ORDER BY r.label,r.id`, params);
      const driverIds = new Set(drivers.rows.map(driver => driver.id)), vehicleIds = new Set(vehicles.rows.map(vehicle => vehicle.id));
      for (const resource of imported.rows) {
        const { kind, label, ...option } = resource;
        if (kind === 'driver' && !driverIds.has(option.id)) drivers.rows.push({ ...option, name: label });
        else if (kind === 'vehicle' && !vehicleIds.has(option.id)) vehicles.rows.push({ ...option, label });
      }
      drivers.rows.sort((a, b) => a.name.localeCompare(b.name, 'ru') || a.id.localeCompare(b.id));
      vehicles.rows.sort((a, b) => a.label.localeCompare(b.label, 'ru') || a.id.localeCompare(b.id));
      const managers = await client.query(`SELECT u.id,u.display_name AS name FROM users u JOIN access_grants g ON g.user_id=u.id
        WHERE u.role=ANY($5::text[]) AND u.active AND u.approved AND g.personal_data_visible
          AND g.legal_entity_id=$1 AND g.region_id=$2 AND g.project_id=$3 AND g.responsibility_scope_id=$4
        ORDER BY u.display_name,u.id`, [...params, ROLES]);
      return { drivers: drivers.rows.map(driverOption), vehicles: vehicles.rows.map(vehicleOption), managers: managers.rows };
    });
  }
  async read(actor, date, scopeId) {
    const selectedDate = businessDate(date);
    const id = uuid(scopeId, 'область работы');
    return this.database.transaction(async client => {
      const current = await this.current(client, actor);
      const scope = this.scope(current, id);
      const result = await client.query(`SELECT ${PLAN_COLUMNS} FROM planning_plans WHERE business_date=$1
        AND legal_entity_id=$2 AND region_id=$3 AND project_id=$4 AND responsibility_scope_id=$5`, [selectedDate, ...tuple(scope)]);
      return result.rowCount ? this.planResponse(client, scope, result.rows[0]) : {
        id: null, businessDate: selectedDate, responsibilityScopeId: id, templateId: null, templateVersion: null, templateSnapshot: null, rows: [], version: 0, updatedAt: null,
      };
    });
  }
  async calendar(actor, from, to, scopeId) {
    const range = calendarRange(from, to);
    const id = uuid(scopeId, 'область работы');
    return this.database.transaction(async client => {
      const current = await this.current(client, actor);
      const scope = this.scope(current, id);
      const result = await client.query(`SELECT ${PLAN_COLUMNS} FROM planning_plans
        WHERE business_date BETWEEN $1 AND $2 AND legal_entity_id=$3 AND region_id=$4 AND project_id=$5 AND responsibility_scope_id=$6
        ORDER BY business_date`, [range.from, range.to, ...tuple(scope)]);
      const plans = [];
      for (const row of result.rows) plans.push(await this.planResponse(client, scope, row));
      return { ...range, plans };
    });
  }
  async validateReferences(client, scope, rows) {
    const drivers = [...new Set(rows.map(row => row.driverId).filter(Boolean))];
    const vehicles = [...new Set(rows.map(row => row.vehicleId).filter(Boolean))];
    const managers = [...new Set(rows.map(row => row.reporting?.managerId).filter(Boolean))];
    if (managers.length) {
      const allowed = await client.query(`SELECT u.id FROM users u JOIN access_grants g ON g.user_id=u.id
        WHERE u.id=ANY($5::uuid[]) AND u.role=ANY($6::text[]) AND u.active AND u.approved AND g.personal_data_visible
          AND g.legal_entity_id=$1 AND g.region_id=$2 AND g.project_id=$3 AND g.responsibility_scope_id=$4`, [...tuple(scope), managers, ROLES]);
      if (allowed.rowCount !== managers.length) throw new BadRequestException('Ответственный менеджер недоступен в этой области. Обновите справочник.');
    }
    // Imports take the exclusive counterpart so catalog changes cannot race a save.
    await client.query('SELECT pg_advisory_xact_lock_shared(hashtextextended($1,917042060))', [scope.responsibilityScopeId]);
    // A standalone catalog record cannot replace the access/lifecycle rules of
    // a real account or operational vehicle, even if an import reused its UUID.
    const imported = await client.query(`SELECT r.id,r.kind FROM planning_imported_resources r
      WHERE r.legal_entity_id=$1 AND r.region_id=$2 AND r.project_id=$3 AND r.responsibility_scope_id=$4 AND r.active
      AND NOT EXISTS(SELECT 1 FROM users u WHERE u.id=r.id)
      AND NOT EXISTS(SELECT 1 FROM vehicles v WHERE v.id=r.id)
      AND ((r.kind='driver' AND r.id=ANY($5::uuid[])) OR (r.kind='vehicle' AND r.id=ANY($6::uuid[])))`, [...tuple(scope), drivers, vehicles]);
    if (drivers.length) {
      const result = await client.query(`SELECT u.id FROM users u JOIN access_grants g ON g.user_id=u.id
        WHERE u.id=ANY($5::uuid[]) AND u.role='driver' AND u.active AND u.approved
        AND g.legal_entity_id=$1 AND g.region_id=$2 AND g.project_id=$3 AND g.responsibility_scope_id=$4`, [...tuple(scope), drivers]);
      const allowed = new Set(result.rows.map(row => row.id));
      for (const resource of imported.rows) if (resource.kind === 'driver') allowed.add(resource.id);
      if (allowed.size !== drivers.length) throw new BadRequestException('В плане есть недоступный водитель. Обновите справочник.');
    }
    if (vehicles.length) {
      const result = await client.query(`SELECT v.id FROM vehicles v WHERE v.id=ANY($5::uuid[])
        AND EXISTS(SELECT 1 FROM trips t WHERE t.vehicle_id=v.id
          AND t.legal_entity_id=$1 AND t.region_id=$2 AND t.project_id=$3 AND t.responsibility_scope_id=$4)`, [...tuple(scope), vehicles]);
      const allowed = new Set(result.rows.map(row => row.id));
      for (const resource of imported.rows) if (resource.kind === 'vehicle') allowed.add(resource.id);
      if (oneC.enabled()) {
        const mapped = await client.query(`SELECT local_id AS id FROM planning_one_c_resources
          WHERE responsibility_scope_id=$1 AND kind='vehicle' AND active AND local_id=ANY($2::uuid[])`, [scope.responsibilityScopeId,vehicles]);
        for (const row of mapped.rows) allowed.add(row.id);
      }
      if (allowed.size !== vehicles.length) throw new BadRequestException('В плане есть недоступный автомобиль. Обновите справочник.');
    }
  }
  async lockPlan(client, scope, input) {
    const params = [input.businessDate, ...tuple(scope)];
    // Calendar and single-day saves share this key, including first inserts.
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,917042019))', [JSON.stringify(params)]);
    const existing = (await client.query(`SELECT id,version,template_id AS "templateId",template_version AS "templateVersion",template_snapshot AS "templateSnapshot" FROM planning_plans WHERE business_date=$1
      AND legal_entity_id=$2 AND region_id=$3 AND project_id=$4 AND responsibility_scope_id=$5 FOR UPDATE`, params)).rows[0];
    if ((existing?.version ?? 0) !== input.version) throw new ConflictException(`План на ${input.businessDate} уже изменён другим менеджером. Загрузите актуальную версию перед сохранением.`);
    return existing;
  }
  async preparePlan(client, scope, input, existing) {
    // A client supplies identity and version only. The authoritative snapshot
    // comes from an immutable published version, never from the request body.
    const resolved = await this.resolveTemplate(client, scope, input.templateId, input.templateVersion);
    const snapshot = existing?.templateId === resolved.id && existing.templateVersion === resolved.version && existing.templateSnapshot
      ? existing.templateSnapshot : resolved;
    await this.validateReferences(client, scope, input.rows);
    return snapshot;
  }
  async writePlan(client, current, scope, input, existing, snapshot, correlationId) {
    const params = [input.businessDate, ...tuple(scope)];
    const result = existing
      ? await client.query(`UPDATE planning_plans SET template_id=$2,rows=$3::jsonb,version=version+1,
          updated_by=$4,updated_at=clock_timestamp(),template_version=$5,template_snapshot=$6::jsonb WHERE id=$1 RETURNING ${PLAN_COLUMNS}`,
        [existing.id, snapshot.id, JSON.stringify(input.rows), current.id, snapshot.version, JSON.stringify(snapshot)])
      : await client.query(`INSERT INTO planning_plans(id,business_date,legal_entity_id,region_id,project_id,responsibility_scope_id,
          template_id,rows,created_by,updated_by,template_version,template_snapshot) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$9,$10,$11::jsonb) RETURNING ${PLAN_COLUMNS}`,
        [randomUUID(), ...params, snapshot.id, JSON.stringify(input.rows), current.id, snapshot.version, JSON.stringify(snapshot)]);
    const plan = await this.planResponse(client, scope, result.rows[0]);
    const { legalEntityId, regionId, projectId, responsibilityScopeId } = scope;
    await this.audit.append(client, {
      actorId: current.id, channel: current.channel, correlationId: correlationId || randomUUID(),
      action: existing ? 'planning.updated' : 'planning.created', entityType: 'planning_plan', entityId: plan.id,
      scope: { legalEntityId, regionId, projectId, responsibilityScopeId },
      metadata: { businessDate: input.businessDate, version: plan.version, rowCount: input.rows.length,
        assignedDriverCount: new Set(input.rows.map(row => row.driverId).filter(Boolean)).size, assignedVehicleCount: new Set(input.rows.map(row => row.vehicleId).filter(Boolean)).size },
    });
    return plan;
  }
  async save(actor, body, correlationId) {
    const input = planInput(body);
    return this.database.transaction(async client => {
      const driverIds = [...new Set(input.rows.flatMap(row => [row.driverId, row.reporting?.managerId]).filter(Boolean))];
      const current = await this.current(client, actor, driverIds);
      const scope = this.scope(current, input.responsibilityScopeId);
      const existing = await this.lockPlan(client, scope, input);
      const snapshot = await this.preparePlan(client, scope, input, existing);
      return this.writePlan(client, current, scope, input, existing, snapshot, correlationId);
    });
  }
  async saveCalendar(actor, body, correlationId) {
    const input = calendarInput(body);
    return this.database.transaction(async client => {
      const driverIds = [...new Set(input.plans.flatMap(plan => plan.rows.flatMap(row => [row.driverId, row.reporting?.managerId]).filter(Boolean)))];
      const current = await this.current(client, actor, driverIds);
      const scope = this.scope(current, input.responsibilityScopeId);
      const prepared = [];
      // Input days are sorted: overlapping calendar saves take all shared plan
      // locks in the same order. All versions and references precede any write.
      for (const plan of input.plans) prepared.push({ input: plan, existing: await this.lockPlan(client, scope, plan) });
      for (const plan of prepared) plan.snapshot = await this.preparePlan(client, scope, plan.input, plan.existing);
      const plans = [];
      const batchCorrelationId = correlationId || randomUUID();
      for (const plan of prepared) plans.push(await this.writePlan(client, current, scope, plan.input, plan.existing, plan.snapshot, batchCorrelationId));
      return { plans };
    });
  }
  exportOneC(actor, body, correlationId) { return oneC.exportPlans(this, actor, body, correlationId); }
}
Injectable()(PlanningService);
Inject(DatabaseService)(PlanningService, undefined, 0);
Inject(IdentityRepository)(PlanningService, undefined, 1);
Inject(AuditService)(PlanningService, undefined, 2);

class PlanningController {
  constructor(service) { this.service = service; }
  context(actor) { return this.service.context(actor); }
  options(actor, scopeId) { return this.service.options(actor, scopeId); }
  templates(actor, scopeId) { return this.service.templates(actor, scopeId); }
  saveTemplate(actor, body, request) { return this.service.saveTemplate(actor, body, request.correlationId); }
  read(actor, date, scopeId) { return this.service.read(actor, date, scopeId); }
  save(actor, body, request) { return this.service.save(actor, body, request.correlationId); }
  calendar(actor, from, to, scopeId) { return this.service.calendar(actor, from, to, scopeId); }
  saveCalendar(actor, body, request) { return this.service.saveCalendar(actor, body, request.correlationId); }
  exportOneC(actor, body, request) { return this.service.exportOneC(actor, body, request.correlationId); }
}
Inject(PlanningService)(PlanningController, undefined, 0);
Controller('planning')(PlanningController);
UseGuards(AuthGuard)(PlanningController);
for (const [name, decorator] of [['context', Get('context')], ['options', Get('options')], ['templates', Get('templates')], ['saveTemplate', Put('templates')], ['calendar', Get('calendar')], ['saveCalendar', Put('calendar')], ['exportOneC', Post('one-c/export')], ['read', Get()], ['save', Put()]]) {
  const descriptor = Object.getOwnPropertyDescriptor(PlanningController.prototype, name);
  decorator(PlanningController.prototype, name, descriptor);
  Header('Cache-Control', 'no-store')(PlanningController.prototype, name, descriptor);
  CurrentActor()(PlanningController.prototype, name, 0);
}
Query('responsibilityScopeId')(PlanningController.prototype, 'options', 1);
Query('responsibilityScopeId')(PlanningController.prototype, 'templates', 1);
Body()(PlanningController.prototype, 'saveTemplate', 1);
Req()(PlanningController.prototype, 'saveTemplate', 2);
Query('date')(PlanningController.prototype, 'read', 1);
Query('responsibilityScopeId')(PlanningController.prototype, 'read', 2);
Body()(PlanningController.prototype, 'save', 1);
Req()(PlanningController.prototype, 'save', 2);
Query('from')(PlanningController.prototype, 'calendar', 1);
Query('to')(PlanningController.prototype, 'calendar', 2);
Query('responsibilityScopeId')(PlanningController.prototype, 'calendar', 3);
Body()(PlanningController.prototype, 'saveCalendar', 1);
Req()(PlanningController.prototype, 'saveCalendar', 2);
Body()(PlanningController.prototype, 'exportOneC', 1);
Req()(PlanningController.prototype, 'exportOneC', 2);
HttpCode(200)(PlanningController.prototype, 'exportOneC', Object.getOwnPropertyDescriptor(PlanningController.prototype,'exportOneC'));

class PlanningModule {}
Module({ imports: [IdentityAccessModule], controllers: [PlanningController], providers: [PlanningService] })(PlanningModule);
module.exports = { PlanningModule, PlanningService };
