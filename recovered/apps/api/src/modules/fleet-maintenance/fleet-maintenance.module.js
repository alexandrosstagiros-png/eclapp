// SPDX-License-Identifier: MIT
"use strict";
const { randomUUID, createHash } = require('node:crypto');
const { Module, Injectable, Inject, Controller, Get, Put, Post, Body, Query, Req, Res, Header,
  UseGuards, UseInterceptors, UploadedFile, UnauthorizedException, BadRequestException,
  ConflictException, ForbiddenException, PayloadTooLargeException } = require('@nestjs/common');
const { FileInterceptor } = require('@nestjs/platform-express');
const { DatabaseService } = require('../../platform/database.service');
const { IdentityAccessModule } = require('../identity-access/identity-access.module');
const { IdentityRepository } = require('../identity-access/infrastructure/identity.repository');
const { AuthGuard } = require('../identity-access/interface/auth.guard');
const { CurrentActor } = require('../identity-access/interface/current-actor.decorator');
const { AuditService } = require('../audit/application/audit.service');
const { analyze, reconcile, normalizePlate, validateFilters, selectRows } = require('./fleet-model');
const { parseWorkbook } = require('./fleet-workbook');
const { orderRows, maintenanceStatus } = require('./fleet-operations-input');

const READ_ROLES = Object.freeze(['access_admin', 'manager', 'mechanic', 'auditor']);
const WRITE_ROLES = Object.freeze(['access_admin', 'manager', 'mechanic']);
const MAX_UPLOAD = 20 * 1024 * 1024;
const SCOPE = Object.freeze({ legalEntityId: 'legal_entity_id', regionId: 'region_id', projectId: 'project_id', responsibilityScopeId: 'responsibility_scope_id' });
const DATASET_COLUMNS = 'id,file_name AS "fileName",file_hash AS "fileHash",created_at AS "createdAt",row_count AS "rowCount",metadata';
function tuple(scope) { return Object.keys(SCOPE).map(key => scope[key]); }
function where(alias = '', first = 1) { return Object.values(SCOPE).map((column, i) => `${alias}${column}=$${first + i}`).join(' AND '); }
function fail(message = 'Проверьте параметры запроса.') { throw new BadRequestException({ code: 'FLEET_VALIDATION', message }); }
function denied() { throw new ForbiddenException({ code: 'FLEET_FORBIDDEN', message: 'Нет доступа к обслуживанию автопарка и финансовым данным в этой области.' }); }
function conflict() { throw new ConflictException({ code: 'FLEET_CONFLICT', message: 'Данные области уже изменены. Обновите страницу и повторите действие.' }); }
function object(value) { if (!value || typeof value !== 'object' || Array.isArray(value)) fail(); return value; }
function uuid(value) { if (typeof value !== 'string' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)) fail('Выберите корректную область или загрузку.'); return value.toLowerCase(); }
function version(value) { if (!Number.isSafeInteger(value) || value < 0 || value >= 2147483646) fail('Некорректная версия. Обновите страницу.'); return value; }
function text(value, maximum, required = false) {
  if (value == null && !required) return '';
  if (typeof value !== 'string' || value.length > maximum || /[\u0000-\u001f\u007f]/.test(value)) fail('Проверьте текстовые поля.');
  const result = value.trim(); if (required && !result) fail('Укажите основание подтверждения идентичности автомобиля.'); return result;
}
function dataset(row) { return row ? { id: row.id, fileName: row.fileName, fileHash: row.fileHash,
  createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt, rowCount: row.rowCount, metadata: row.metadata } : null; }
function inputError(error, fallback) {
  if (error?.status === 400 || error?.statusCode === 400 || error?.safeInput === true) fail(error.message);
  if (error instanceof BadRequestException) throw error;
  fail(fallback);
}
function filename(original) {
  let name = String(original || '');
  // Multipart parsers may interpret UTF-8 filename bytes as latin1. Repair only
  // an unambiguous, lossless UTF-8 round trip; retain actual Unicode filenames.
  if ([...name].every(character => character.codePointAt(0) <= 255)) {
    const bytes = Buffer.from(name, 'latin1'), decoded = bytes.toString('utf8');
    if (!decoded.includes('\uFFFD') && Buffer.from(decoded, 'utf8').equals(bytes)) name = decoded;
  }
  const leaf = name.replace(/\\/g, '/').split('/').pop().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 200).trim();
  if (!leaf || !/\.(xlsx|csv)$/i.test(leaf)) fail('Загрузите файл XLSX или CSV с позициями заказ-нарядов.');
  return leaf;
}
function sourceRowsOnly(rows) {
  // The exported combined view also contains native orders. Reimporting those
  // would retain an immutable copy AND append the same live order a second time.
  // A reserved prefix is rejected explicitly; source positions are never removed.
  if (rows.some(row => /^app:/i.test(String(row.orderId || ''))))
    fail('Файл содержит заказ-наряды ЕЦЛ с ID app:. Повторный импорт создаст двойной учёт. Загрузите исходную выгрузку Завгара без записей ЕЦЛ.');
}
function csvCell(value, numeric = false) {
  let string = value == null ? '' : String(value);
  // Quoting alone does not prevent spreadsheet formula execution. Protect all
  // text beginning with a formula marker, including after whitespace/BOM.
  if (!numeric && typeof value !== 'number' && (/^[\s\uFEFF]*[=+\-@]/u.test(string) || /^[\t\r\n]/.test(string))) string = `'${string}`;
  return `"${string.replace(/"/g, '""')}"`;
}
function money(cents) {
  if (cents == null) return '';
  const absolute = BigInt(cents < 0 ? -cents : cents);
  return `${cents < 0 ? '-' : ''}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
}
const EXPORT_FIELDS = [
  ['Строка источника', 'sourceRow'], ['ЗН_id', 'orderId'], ['Номер ЗН', 'orderNumber'], ['Дата открытия', 'openedOn'],
  ['Дата завершения', 'completedOn'], ['Госномер', 'plate'], ['Идентификатор автомобиля', 'vehicleKey'], ['Бренд ТС', 'vehicleBrand'],
  ['Марка', 'vehicleGroup'], ['Год', 'vehicleYear'], ['Тип ТС', 'vehicleType'], ['Пробег, км', 'odometerKm'],
  ['Тип позиции', 'positionType'], ['Группа', 'group'], ['Узел', 'node'], ['Наименование', 'name'], ['Бренд', 'partBrand'],
  ['Кол-во', 'quantity'], ['Ед.', 'unit'], ['Цена за ед., ₽', row => money(row.unitPriceCents), true], ['Сумма, ₽', row => money(row.amountCents), true],
  ['Скидка, %', 'discountPercent'], ['Корректировка, ₽', row => money(row.adjustmentCents), true], ['Основание корректировки', 'adjustmentReason'],
  ['Долив (не замена)', 'topUp'], ['Шины', 'tire'], ['Подрядчик', 'supplier'], ['Своими силами', 'ownWorkReported'],
  ['Статус ЗН', 'status'], ['Группа (авто)', 'autoGroup'], ['Узел (авто)', 'autoNode'], ['Замечания', row => (row.issueCodes || []).join(', ')],
];
class FleetUploadInterceptor extends FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD, files: 1, fields: 1, fieldSize: 100, parts: 3 } }) {
  async intercept(context, next) {
    try { return await super.intercept(context, next); }
    catch (error) {
      if (error?.getStatus?.() === 413) throw new PayloadTooLargeException({ code: 'FLEET_UPLOAD', message: 'Размер файла превышает 20 МиБ.' });
      fail('Загрузите один файл и одну выбранную область. Проверьте форму загрузки.');
    }
  }
}

class FleetMaintenanceService {
  constructor(database, identity, audit) { this.database = database; this.identity = identity; this.audit = audit; }
  async current(client, supplied, write = false) {
    await this.identity.lockUsers(client, [supplied.id, supplied.impersonation?.administratorId].filter(Boolean));
    const actor = await this.identity.actorBySession(client, supplied.sessionId);
    if (!actor || actor.id !== supplied.id || actor.authVersion !== supplied.authVersion || actor.role !== supplied.role) throw new UnauthorizedException('Сессия недействительна.');
    if (!(write ? WRITE_ROLES : READ_ROLES).includes(actor.role)) denied();
    return actor;
  }
  scope(actor, id) {
    const found = actor.grants.find(grant => grant.responsibilityScopeId === id && grant.financeVisible === true && tuple(grant).every(value => typeof value === 'string' && value));
    if (!found) denied(); return found;
  }
  async lockScope(client, scope) { await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,917042034))', [`fleet:${JSON.stringify(tuple(scope))}`]); }
  async state(client, scope) {
    const result = await client.query(`SELECT active_dataset_id AS "activeDatasetId",version,links FROM fleet_maintenance_state WHERE ${where()}`, tuple(scope));
    return result.rows[0] || { activeDatasetId: null, version: 0, links: [] };
  }
  async source(client, scope, id, includePayload = true) {
    if (!id) return null;
    const result = await client.query(`SELECT ${DATASET_COLUMNS}${includePayload ? ',payload' : ''} FROM fleet_maintenance_datasets WHERE ${where()} AND id=$5`, [...tuple(scope), id]);
    if (!result.rowCount) fail('Загрузка недоступна в выбранной области.');
    return result.rows[0];
  }
  async collectRows(client, scope, source) {
    const records = (await client.query(`SELECT id,kind,version,payload FROM fleet_ops_records WHERE ${where()} ORDER BY created_at,id LIMIT 10001`, tuple(scope))).rows;
    if (records.length > 10000) fail('В области более 10 000 карточек. Требуется разделение области перед расчётом.');
    const grouped = {};
    for (const row of records) (grouped[row.kind] ||= []).push({ ...row.payload, id: row.id, kind: row.kind, version: row.version });
    const native = orderRows(grouped);
    return { rows: [...(source?.payload.rows || []), ...native], nativeRowCount: native.length, records: grouped };
  }
  async auditWrite(client, scope, actor, correlationId, action, entityId, metadata) {
    await this.audit.append(client, { actorId: actor.id, channel: actor.channel, correlationId: correlationId || randomUUID(), action,
      entityType: 'fleet_maintenance', entityId, scope: Object.fromEntries(Object.keys(SCOPE).map(key => [key, scope[key]])), metadata });
  }
  async event(client, scope, actor, next, kind, details) {
    await client.query(`INSERT INTO fleet_maintenance_events(id,${Object.values(SCOPE).join(',')},version,kind,dataset_id,details,actor_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)`, [randomUUID(), ...tuple(scope), next.version, kind, next.activeDatasetId, JSON.stringify(details), actor.id]);
  }
  async saveState(client, scope, actor, previous, next) {
    if (previous.version === 0) {
      await client.query(`INSERT INTO fleet_maintenance_state(${Object.values(SCOPE).join(',')},active_dataset_id,version,links,updated_by)
        VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8)`, [...tuple(scope), next.activeDatasetId, next.version, JSON.stringify(next.links), actor.id]);
    } else {
      const result = await client.query(`UPDATE fleet_maintenance_state SET active_dataset_id=$5,version=$6,links=$7::jsonb,updated_by=$8,updated_at=clock_timestamp()
        WHERE ${where()} AND version=$9`, [...tuple(scope), next.activeDatasetId, next.version, JSON.stringify(next.links), actor.id, previous.version]);
      if (!result.rowCount) conflict();
    }
  }
  async context(supplied) {
    return this.database.transaction(async client => {
      const actor = await this.current(client, supplied);
      const result = await client.query(`SELECT g.legal_entity_id AS "legalEntityId",g.region_id AS "regionId",g.project_id AS "projectId",
        g.responsibility_scope_id AS "responsibilityScopeId",r.name AS "regionName",p.name AS "projectName",rs.name AS "scopeName"
        FROM access_grants g JOIN regions r ON r.id=g.region_id
        JOIN projects p ON p.id=g.project_id AND p.legal_entity_id=g.legal_entity_id AND p.region_id=g.region_id
        JOIN responsibility_scopes rs ON rs.id=g.responsibility_scope_id AND rs.project_id=g.project_id
        WHERE g.user_id=$1 AND g.finance_visible=true ORDER BY r.name,p.name,rs.name,g.responsibility_scope_id`, [actor.id]);
      return { scopes: result.rows.map(row => ({ ...row, canWrite: WRITE_ROLES.includes(actor.role) })) };
    });
  }
  async scoped(supplied, scopeId, write, fn) {
    return this.database.transaction(async client => {
      const actor = await this.current(client, supplied, write);
      const scope = this.scope(actor, uuid(scopeId));
      await this.lockScope(client, scope);
      return fn(client, scope, actor, await this.state(client, scope));
    });
  }
  filters(input) { try { return validateFilters(input || {}); } catch (error) { inputError(error, 'Проверьте фильтры и границы периода.'); } }
  calculation(rows, filters, links) { try { return analyze(rows, filters, links); } catch (error) { inputError(error, 'Не удалось рассчитать выборку. Проверьте исходные суммы и фильтры.'); } }
  async read(supplied, query) {
    return this.scoped(supplied, query.responsibilityScopeId, false, async (client, scope, actor, state) => {
      const filters = this.filters(query);
      const source = await this.source(client, scope, state.activeDatasetId);
      const combined = await this.collectRows(client, scope, source);
      return { dataset: dataset(source), version: state.version, links: state.links, nativeRowCount: combined.nativeRowCount,
        analytics: source || combined.nativeRowCount ? this.calculation(combined.rows, filters, state.links) : null };
    });
  }
  async preview(supplied, body, file, correlationId) {
    return this.scoped(supplied, body?.responsibilityScopeId, true, async (client, scope, actor, state) => {
      if (!file || !Buffer.isBuffer(file.buffer) || !file.buffer.length) fail('Выберите непустой файл XLSX или CSV.');
      if (file.buffer.length > MAX_UPLOAD) throw new PayloadTooLargeException('Размер файла превышает 20 МиБ.');
      const fileName = filename(file.originalname);
      const fileHash = createHash('sha256').update(file.buffer).digest('hex');
      let source = (await client.query(`SELECT ${DATASET_COLUMNS},payload FROM fleet_maintenance_datasets WHERE ${where()} AND file_hash=$5`, [...tuple(scope), fileHash])).rows[0];
      if (!source) {
        let parsed;
        try { parsed = await parseWorkbook(file.buffer, fileName); } catch (error) { inputError(error, 'Не удалось прочитать файл. Проверьте формат и лист «Позиции».'); }
        if (!Array.isArray(parsed?.rows) || !parsed.rows.length || parsed.rows.length > 100000) fail('Файл должен содержать от 1 до 100 000 позиций.');
        sourceRowsOnly(parsed.rows);
        // Calculate before storing: malformed/overflowing money never becomes a
        // staged snapshot that the user could subsequently activate.
        this.calculation(parsed.rows, {}, state.links);
        const saved = await client.query(`INSERT INTO fleet_maintenance_datasets(id,${Object.values(SCOPE).join(',')},file_name,file_hash,row_count,metadata,payload,created_by)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11) RETURNING ${DATASET_COLUMNS},payload`,
        [randomUUID(), ...tuple(scope), fileName, fileHash, parsed.rows.length, JSON.stringify(parsed.metadata || {}), JSON.stringify(parsed), actor.id]);
        source = saved.rows[0];
        await this.auditWrite(client, scope, actor, correlationId, 'fleet_maintenance.import.previewed', source.id, { fileHash, rowCount: source.rowCount });
      }
      const analytics = this.calculation(source.payload.rows, {}, state.links);
      return { dataset: dataset(source), version: state.version, summary: analytics.summary, quality: analytics.quality, alreadyActive: state.activeDatasetId === source.id };
    });
  }
  async commit(supplied, body, correlationId) {
    object(body);
    return this.scoped(supplied, body.responsibilityScopeId, true, async (client, scope, actor, state) => {
      const expected = version(body.expectedVersion);
      const source = await this.source(client, scope, uuid(body.datasetId));
      sourceRowsOnly(source.payload.rows);
      // A retry of an already active immutable hash is a no-op, even when its
      // original expected version is older. No unrelated state is overwritten.
      if (source.id === state.activeDatasetId) return { dataset: dataset(source), version: state.version, alreadyActive: true };
      if (expected !== state.version) conflict();
      const next = { ...state, activeDatasetId: source.id, version: state.version + 1 };
      await this.saveState(client, scope, actor, state, next);
      await this.event(client, scope, actor, next, 'activated', { previousDatasetId: state.activeDatasetId });
      await this.auditWrite(client, scope, actor, correlationId, 'fleet_maintenance.import.activated', source.id, { version: next.version, previousDatasetId: state.activeDatasetId });
      return { dataset: dataset(source), version: next.version, alreadyActive: false };
    });
  }
  async history(supplied, scopeId) {
    return this.scoped(supplied, scopeId, false, async (client, scope, actor, state) => {
      const result = await client.query(`SELECT ${DATASET_COLUMNS} FROM fleet_maintenance_datasets WHERE ${where()} ORDER BY created_at DESC,id`, tuple(scope));
      return { items: result.rows.map(dataset) };
    });
  }
  async links(supplied, body, correlationId) {
    object(body);
    return this.scoped(supplied, body.responsibilityScopeId, true, async (client, scope, actor, state) => {
      if (version(body.expectedVersion) !== state.version) conflict();
      const plate = normalizePlate(text(body.plate, 40, true));
      const vehicleKey = text(body.vehicleKey, 120);
      const canonicalPlate = normalizePlate(text(body.canonicalPlate, 40));
      const reason = text(body.reason, 2000, true);
      if (!plate || (vehicleKey && !canonicalPlate)) fail('Укажите госномер и основной госномер автомобиля.');
      const previous = state.links.find(link => link.plate === plate) || null;
      const links = state.links.filter(link => link.plate !== plate);
      if (vehicleKey) {
        const shared = links.find(link => link.vehicleKey === vehicleKey);
        if (shared && shared.canonicalPlate !== canonicalPlate) fail('У этой подтверждённой группы другой основной госномер. Используйте его или сначала исправьте связи.');
        const canonical = links.find(link => link.plate === canonicalPlate);
        if (canonical && canonical.vehicleKey !== vehicleKey) fail('Основной госномер уже связан с другим автомобилем. Сначала проверьте и отмените прежнюю связь.');
        if (!canonical && canonicalPlate !== plate) links.push({ plate: canonicalPlate, vehicleKey, canonicalPlate, reason });
        links.push({ plate, vehicleKey, canonicalPlate, reason });
      }
      links.sort((a, b) => a.plate.localeCompare(b.plate, 'ru'));
      const next = { ...state, links, version: state.version + 1 };
      await this.saveState(client, scope, actor, state, next);
      await this.event(client, scope, actor, next, 'vehicle_link', { plate, previous, next: links.find(link => link.plate === plate) || null, reason });
      await this.auditWrite(client, scope, actor, correlationId, 'fleet_maintenance.vehicle_link.updated', scope.responsibilityScopeId,
        { version: next.version, plate, vehicleKey, reason });
      return { version: next.version, links };
    });
  }
  async reconciliation(supplied, scopeId) {
    return this.scoped(supplied, scopeId, false, async (client, scope, actor, state) => {
      const source = await this.source(client, scope, state.activeDatasetId);
      try { return reconcile(source?.payload.reconciliation || null, source?.payload.rows || [], state.links); }
      catch (error) { inputError(error, 'Не удалось рассчитать сверку загруженного снимка.'); }
    });
  }
  async export(supplied, query) {
    return this.scoped(supplied, query.responsibilityScopeId, false, async (client, scope, actor, state) => {
      const filters = this.filters(query);
      const source = await this.source(client, scope, state.activeDatasetId);
      const combined = await this.collectRows(client, scope, source);
      let rows;
      try { rows = selectRows(combined.rows, filters, state.links); }
      catch (error) { inputError(error, 'Не удалось сформировать выгрузку. Проверьте фильтры.'); }
      const lines = [EXPORT_FIELDS.map(([label]) => csvCell(label)).join(';')];
      for (const row of rows) lines.push(EXPORT_FIELDS.map(([, field, numeric]) => csvCell(typeof field === 'function' ? field(row) : row[field], numeric)).join(';'));
      return Buffer.from(`\uFEFF${lines.join('\r\n')}\r\n`, 'utf8');
    });
  }
  async report(supplied, query) {
    return this.scoped(supplied, query.responsibilityScopeId, false, async (client, scope, actor, state) => {
      const filters = this.filters(query), source = await this.source(client, scope, state.activeDatasetId);
      const combined = await this.collectRows(client, scope, source);
      const analytics = this.calculation(combined.rows, filters, state.links);
      const reconciliation = reconcile(source?.payload.reconciliation || null, source?.payload.rows || [], state.links);
      const scopeNames = (await client.query(`SELECT rs.name AS "scopeName",p.name AS "projectName",r.name AS "regionName"
        FROM responsibility_scopes rs JOIN projects p ON p.id=rs.project_id JOIN regions r ON r.id=p.region_id
        WHERE rs.id=$4 AND p.id=$3 AND p.region_id=$2 AND p.legal_entity_id=$1`, tuple(scope))).rows[0] || {};
      const vehicles = new Map((combined.records.vehicles || []).map(row => [row.id, row]));
      const operations = { records: combined.records, maintenance: (combined.records.maintenance || []).map(row => maintenanceStatus(row, vehicles.get(row.vehicleId))) };
      const { generateFleetReport } = require('./fleet-report');
      return generateFleetReport({ analytics, dataset: dataset(source), scope: { ...scopeNames, responsibilityScopeId: scope.responsibilityScopeId }, reconciliation, operations });
    });
  }
}
Injectable()(FleetMaintenanceService);
Inject(DatabaseService)(FleetMaintenanceService, undefined, 0);
Inject(IdentityRepository)(FleetMaintenanceService, undefined, 1);
Inject(AuditService)(FleetMaintenanceService, undefined, 2);

class FleetMaintenanceController {
  constructor(service) { this.service = service; }
  context(actor) { return this.service.context(actor); }
  read(actor, query) { return this.service.read(actor, query); }
  preview(actor, body, file, request) { return this.service.preview(actor, body, file, request.correlationId); }
  commit(actor, body, request) { return this.service.commit(actor, body, request.correlationId); }
  history(actor, scopeId) { return this.service.history(actor, scopeId); }
  links(actor, body, request) { return this.service.links(actor, body, request.correlationId); }
  reconciliation(actor, scopeId) { return this.service.reconciliation(actor, scopeId); }
  async export(actor, query, response) {
    const bytes = await this.service.export(actor, query);
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', 'attachment; filename="fleet-maintenance.csv"');
    response.send(bytes);
  }
  async report(actor, query, response) {
    const bytes = await this.service.report(actor, query);
    response.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
    response.setHeader('Content-Disposition', 'attachment; filename="fleet-maintenance.pptx"');
    response.send(bytes);
  }
}
Inject(FleetMaintenanceService)(FleetMaintenanceController, undefined, 0);
Controller('fleet-maintenance')(FleetMaintenanceController);
UseGuards(AuthGuard)(FleetMaintenanceController);
for (const [name, decorator] of [['context', Get('context')], ['read', Get()], ['preview', Post('imports/preview')], ['commit', Post('imports/commit')],
  ['history', Get('imports')], ['links', Put('vehicle-links')], ['reconciliation', Get('reconciliation')], ['export', Get('export')], ['report', Get('report.pptx')]]) {
  const descriptor = Object.getOwnPropertyDescriptor(FleetMaintenanceController.prototype, name);
  decorator(FleetMaintenanceController.prototype, name, descriptor);
  Header('Cache-Control', 'no-store')(FleetMaintenanceController.prototype, name, descriptor);
  CurrentActor()(FleetMaintenanceController.prototype, name, 0);
}
for (const name of ['read', 'export', 'report']) Query()(FleetMaintenanceController.prototype, name, 1);
for (const name of ['history', 'reconciliation']) Query('responsibilityScopeId')(FleetMaintenanceController.prototype, name, 1);
for (const name of ['preview', 'commit', 'links']) Body()(FleetMaintenanceController.prototype, name, 1);
for (const name of ['commit', 'links']) Req()(FleetMaintenanceController.prototype, name, 2);
UploadedFile()(FleetMaintenanceController.prototype, 'preview', 2);
Req()(FleetMaintenanceController.prototype, 'preview', 3);
Res()(FleetMaintenanceController.prototype, 'export', 2);
Res()(FleetMaintenanceController.prototype, 'report', 2);
UseInterceptors(FleetUploadInterceptor)
  (FleetMaintenanceController.prototype, 'preview', Object.getOwnPropertyDescriptor(FleetMaintenanceController.prototype, 'preview'));
class FleetMaintenanceModule {}
Module({ imports: [IdentityAccessModule], controllers: [FleetMaintenanceController], providers: [FleetMaintenanceService], exports: [FleetMaintenanceService] })(FleetMaintenanceModule);
module.exports = { FleetMaintenanceModule, FleetMaintenanceService, csvCell };
