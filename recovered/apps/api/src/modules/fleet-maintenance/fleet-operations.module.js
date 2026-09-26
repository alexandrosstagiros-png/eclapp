// SPDX-License-Identifier: MIT
'use strict';
const { randomUUID, createHash } = require('node:crypto');
const { Module, Injectable, Inject, Controller, Get, Put, Post, Body, Query, Param, Req, Header, UseGuards,
  UnauthorizedException, ForbiddenException, ConflictException } = require('@nestjs/common');
const { FleetMaintenanceModule, FleetMaintenanceService } = require('./fleet-maintenance.module');
const { IdentityAccessModule } = require('../identity-access/identity-access.module');
const { AuthGuard } = require('../identity-access/interface/auth.guard');
const { CurrentActor } = require('../identity-access/interface/current-actor.decorator');
const { KINDS, parseRecord, maintenanceStatus, validateAction, quantityMilli, lineAmount, uuid, text, integer, fail } = require('./fleet-operations-input');
const { normalizePlate } = require('./fleet-model');
const SCOPE = { legalEntityId: 'legal_entity_id', regionId: 'region_id', projectId: 'project_id', responsibilityScopeId: 'responsibility_scope_id' };
const tuple = scope => Object.keys(SCOPE).map(key => scope[key]);
const where = (alias = '', first = 1) => Object.values(SCOPE).map((column, i) => `${alias}${column}=$${first + i}`).join(' AND ');
const COLUMNS = 'id,kind,version,payload,created_at AS "createdAt",updated_at AS "updatedAt"';
const today = () => new Date().toISOString().slice(0, 10);
function conflict(message = 'Запись уже изменена или действие выполнено. Обновите данные.') { throw new ConflictException({ code: 'FLEET_CONFLICT', message }); }
function forbidden() { throw new ForbiddenException({ code: 'FLEET_FORBIDDEN', message: 'Нет доступа к автомобилю или записи в этой области.' }); }
function flat(row) { return { ...row.payload, id: row.id, kind: row.kind, version: row.version,
  createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
  updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt }; }
function exact(value) { const n = Number(value); if (!Number.isSafeInteger(n)) fail('Сумма или остаток выходит за допустимый диапазон.'); return n; }
function roundRatio(numerator, denominator) {
  if (denominator <= 0) fail('Не удалось определить стоимость списания.');
  return exact((BigInt(numerator) + BigInt(denominator) / 2n) / BigInt(denominator));
}
function groupRecords(rows) { const result = Object.fromEntries(KINDS.map(kind => [kind, []])); for (const row of rows) result[row.kind].push(flat(row)); return result; }

class FleetOperationsService {
  constructor(fleet) { this.fleet = fleet; }
  async records(client, scope) {
    const rows = (await client.query(`SELECT ${COLUMNS} FROM fleet_ops_records WHERE ${where()} ORDER BY created_at,id LIMIT 10001`, tuple(scope))).rows;
    if (rows.length > 10000) fail('В области более 10 000 карточек. Требуется разделение области перед просмотром.'); return rows;
  }
  async reference(client, scope, kind, id) {
    const row = (await client.query(`SELECT ${COLUMNS} FROM fleet_ops_records WHERE ${where()} AND id=$5 AND kind=$6`, [...tuple(scope), id, kind])).rows[0];
    if (!row) fail('Связанная запись недоступна в выбранной области.'); return row;
  }
  async driverReference(client, scope, id) {
    const rows = await client.query(`SELECT u.id FROM users u JOIN access_grants g ON g.user_id=u.id
      WHERE u.id=$5 AND u.role='driver' AND u.active=true AND u.approved=true AND ${where('g.')}`, [...tuple(scope), id]);
    if (!rows.rowCount) fail('Водитель недоступен в выбранной области.');
  }
  async write(client, scope, actor, kind, id, payload, existing, action, correlationId) {
    let result;
    if (existing) result = await client.query(`UPDATE fleet_ops_records SET payload=$5::jsonb,version=version+1,updated_by=$6,updated_at=clock_timestamp()
      WHERE ${where()} AND id=$7 AND version=$8 RETURNING ${COLUMNS}`, [...tuple(scope), JSON.stringify(payload), actor.id, id, existing.version]);
    else {
      const count = (await client.query(`SELECT count(*)::integer AS count FROM fleet_ops_records WHERE ${where()}`, tuple(scope))).rows[0].count;
      if (count >= 10000) fail('Достигнут предел 10 000 карточек в области.');
      result = await client.query(`INSERT INTO fleet_ops_records(id,${Object.values(SCOPE).join(',')},kind,payload,created_by,updated_by)
        VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$8) RETURNING ${COLUMNS}`, [id, ...tuple(scope), kind, JSON.stringify(payload), actor.id]);
    }
    if (!result.rowCount) conflict();
    const saved = result.rows[0];
    await client.query(`INSERT INTO fleet_ops_events(id,${Object.values(SCOPE).join(',')},record_id,record_version,action,details,actor_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)`, [randomUUID(), ...tuple(scope), id, saved.version, action,
      JSON.stringify({ before: existing?.payload || null, after: payload }), actor.id]);
    await this.fleet.auditWrite(client, scope, actor, correlationId, `fleet_operations.${kind}.${action}`, id, { version: saved.version });
    return saved;
  }
  async stock(client, scope) {
    const rows = (await client.query(`SELECT part_id AS "partId",warehouse_id AS "warehouseId",sum(quantity_milli)::text AS quantity,
      sum(amount_cents)::text AS amount FROM fleet_stock_movements WHERE ${where()} GROUP BY part_id,warehouse_id ORDER BY part_id,warehouse_id`, tuple(scope))).rows;
    return rows.map(row => ({ partId: row.partId, warehouseId: row.warehouseId, quantity: exact(row.quantity) / 1000, amountCents: exact(row.amount) }));
  }
  async movement(client, scope, actor, data) {
    await client.query(`INSERT INTO fleet_stock_movements(id,${Object.values(SCOPE).join(',')},part_id,warehouse_id,quantity_milli,unit_cost_cents,amount_cents,kind,document_id,details,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14)`, [randomUUID(), ...tuple(scope), data.partId, data.warehouseId,
      data.quantityMilli, data.unitCostCents, data.amountCents, data.kind, data.documentId, JSON.stringify(data.details || {}), actor.id]);
  }
  async idempotent(client, scope, actor, key, input, fn) {
    // Global request keys are locked before checking even across distinct scopes.
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,917042035))', [`fleet-action:${key}`]);
    const hash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    const found = (await client.query(`SELECT *,legal_entity_id AS "legalEntityId",region_id AS "regionId",project_id AS "projectId",responsibility_scope_id AS "responsibilityScopeId"
      FROM fleet_ops_actions WHERE idempotency_key=$1`, [key])).rows[0];
    if (found) {
      if (found.request_hash !== hash || found.actor_id !== actor.id || tuple(found).some((v, i) => v !== tuple(scope)[i])) conflict('Ключ отправки уже использован для другого действия.');
      return found.response;
    }
    const response = await fn();
    await client.query(`INSERT INTO fleet_ops_actions(idempotency_key,${Object.values(SCOPE).join(',')},request_hash,response,actor_id)
      VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8)`, [key, ...tuple(scope), hash, JSON.stringify(response), actor.id]);
    return response;
  }
  async context(actor) {
    if (actor.role !== 'driver') return this.fleet.context(actor);
    const own = await this.driverRead(actor);
    const scopeIds = new Set(own.assignments.map(record => record.responsibilityScopeId));
    return this.driverTransaction(actor, async (client, current) => ({ scopes: current.grants.filter(grant => scopeIds.has(grant.responsibilityScopeId))
      .map(grant => ({ ...Object.fromEntries(Object.keys(SCOPE).map(key => [key, grant[key]])), canWrite: true })) }));
  }
  async read(supplied, scopeId) {
    return this.fleet.scoped(supplied, scopeId, false, async (client, scope) => {
      const records = groupRecords(await this.records(client, scope));
      const events = (await client.query(`SELECT id,record_id AS "recordId",record_version AS "recordVersion",action,created_at AS "createdAt"
        FROM fleet_ops_events WHERE ${where()} ORDER BY created_at DESC,id LIMIT 50001`, tuple(scope))).rows;
      if (events.length > 50000) fail('В области более 50 000 событий. Требуется архивный просмотр истории.');
      const drivers = (await client.query(`SELECT u.id,u.display_name AS "displayName" FROM users u JOIN access_grants g ON g.user_id=u.id
        WHERE u.role='driver' AND u.active=true AND u.approved=true AND ${where('g.')} ORDER BY u.display_name,u.id`, tuple(scope))).rows;
      const vehicles = new Map(records.vehicles.map(vehicle => [vehicle.id, vehicle]));
      return { records, stock: await this.stock(client, scope), drivers,
        maintenance: records.maintenance.map(plan => maintenanceStatus(plan, vehicles.get(plan.vehicleId))), events };
    });
  }
  async validateReferences(client, scope, kind, payload, id, existing) {
    const p = payload;
    if (p.vehicleId) await this.reference(client, scope, 'vehicles', p.vehicleId);
    if (p.contractorId) await this.reference(client, scope, 'contractors', p.contractorId);
    if (p.driverUserId) await this.driverReference(client, scope, p.driverUserId);
    if (kind === 'vehicles') {
      const others = (await this.records(client, scope)).filter(row => row.kind === 'vehicles' && row.id !== id);
      if (p.status !== 'retired' && others.some(row => row.payload.status !== 'retired' && normalizePlate(row.payload.plate) === normalizePlate(p.plate))) conflict('Госномер уже есть у действующего автомобиля.');
      if (p.vin && others.some(row => row.payload.vin && row.payload.vin.toUpperCase() === p.vin.toUpperCase())) conflict('VIN / ID ТС уже есть у другого автомобиля.');
      if (existing?.payload.odometerKm != null && (p.odometerKm == null || p.odometerKm < existing.payload.odometerKm)) fail('Нельзя очищать или уменьшать актуальный одометр автомобиля.');
    }
    if (kind === 'orders') {
      if (p.status !== (existing?.payload.status || p.status) || !['draft', 'in_progress'].includes(p.status)) fail('Статус наряда изменяется отдельным действием. Закрытый или отменённый наряд неизменяем.');
      if (p.driverReportId) {
        const report = await this.reference(client, scope, 'driverReports', p.driverReportId);
        if (report.payload.vehicleId !== p.vehicleId || report.payload.type !== 'defect' || report.payload.status !== 'accepted' || (report.payload.orderId && report.payload.orderId !== id)) fail('Заявка должна быть принятой неисправностью этого автомобиля и не относиться к другому наряду.');
      }
      if (p.maintenanceId) {
        const plan = await this.reference(client, scope, 'maintenance', p.maintenanceId);
        if (plan.payload.vehicleId !== p.vehicleId || !plan.payload.active) fail('План ТО не относится к этому автомобилю или отключён.');
      }
      for (const line of p.lines) {
        if (line.partId) await this.reference(client, scope, 'parts', line.partId);
        if (line.warehouseId) await this.reference(client, scope, 'warehouses', line.warehouseId);
      }
    }
    if (kind === 'purchases') {
      await this.reference(client, scope, 'warehouses', p.warehouseId);
      if (!['draft', 'ordered'].includes(p.status) || (existing && p.status !== existing.payload.status)) fail('Статус закупки изменяется отдельным действием. Принятая или отменённая закупка неизменяема.');
      for (const line of p.lines) await this.reference(client, scope, 'parts', line.partId);
    }
    if (kind === 'assignments' && p.active) {
      const records = await this.records(client, scope);
      if (records.some(row => row.id !== id && row.kind === 'assignments' && row.payload.active
        && (row.payload.vehicleId === p.vehicleId || row.payload.driverUserId === p.driverUserId)
        && row.payload.startsOn <= (p.endsOn || '9999-12-31') && p.startsOn <= (row.payload.endsOn || '9999-12-31'))) conflict('Пересекающееся назначение водителя или автомобиля уже существует.');
    }
    if (kind === 'driverReports') {
      if (p.status !== 'new' || p.orderId || existing?.payload.status && existing.payload.status !== 'new') fail('Обработка заявки выполняется отдельным действием.');
    }
    if (kind === 'fuel' && existing?.payload.sourceReportId) fail('Заправка, принятая из заявки водителя, неизменяема.');
  }
  async latestOdometer(client, scope, actor, vehicleId, reading, correlationId) {
    if (reading == null) return;
    const vehicle = await this.reference(client, scope, 'vehicles', vehicleId);
    if (vehicle.payload.odometerKm == null || reading > vehicle.payload.odometerKm) await this.write(client, scope, actor, 'vehicles', vehicle.id,
      { ...vehicle.payload, odometerKm: reading }, vehicle, 'odometer', correlationId);
  }
  async save(supplied, kind, body, correlationId) {
    return this.fleet.scoped(supplied, body?.responsibilityScopeId, true, async (client, scope, actor) => {
      const input = parseRecord(kind, body);
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,917042035))', [`fleet-record:${input.id}`]);
      const found = (await client.query(`SELECT ${COLUMNS},legal_entity_id AS "legalEntityId",region_id AS "regionId",project_id AS "projectId",responsibility_scope_id AS "responsibilityScopeId"
        FROM fleet_ops_records WHERE id=$1`, [input.id])).rows[0];
      if (found && (found.kind !== kind || tuple(found).some((v, i) => v !== tuple(scope)[i]))) forbidden();
      if ((found?.version || 0) !== input.version) conflict();
      await this.validateReferences(client, scope, kind, input.payload, input.id, found);
      if (['orders', 'purchases'].includes(kind) && !input.payload.number) input.payload.number = `${kind === 'orders' ? 'ЗН' : 'ЗК'}-${input.id.slice(0, 8).toUpperCase()}`;
      const saved = await this.write(client, scope, actor, kind, input.id, input.payload, found, found ? 'updated' : 'created', correlationId);
      if (kind === 'orders') {
        const beforeId = found?.payload.driverReportId;
        if (beforeId && beforeId !== input.payload.driverReportId) {
          const old = await this.reference(client, scope, 'driverReports', beforeId);
          if (old.payload.orderId === input.id) await this.write(client, scope, actor, 'driverReports', old.id, { ...old.payload, orderId: null }, old, 'unlinked', correlationId);
        }
        if (input.payload.driverReportId) {
          const report = await this.reference(client, scope, 'driverReports', input.payload.driverReportId);
          if (report.payload.orderId !== input.id) await this.write(client, scope, actor, 'driverReports', report.id, { ...report.payload, orderId: input.id }, report, 'linked', correlationId);
        }
      }
      if (kind === 'fuel') await this.latestOdometer(client, scope, actor, input.payload.vehicleId, input.payload.odometerKm, correlationId);
      return flat(saved);
    });
  }
  async requireStockReferences(client, scope, partId, warehouseId) {
    const part = await this.reference(client, scope, 'parts', partId);
    const warehouse = await this.reference(client, scope, 'warehouses', warehouseId);
    if (!part.payload.active || !warehouse.payload.active) fail('Запчасть или склад отключены.');
  }
  async issue(client, scope, actor, orderId, lines) {
    const rows = (await client.query(`SELECT part_id,warehouse_id,sum(quantity_milli)::text AS quantity,sum(amount_cents)::text AS amount
      FROM fleet_stock_movements WHERE ${where()} GROUP BY part_id,warehouse_id`, tuple(scope))).rows;
    const balances = new Map(rows.map(row => [`${row.part_id}:${row.warehouse_id}`, { quantity: exact(row.quantity), amount: exact(row.amount) }]));
    const result = [];
    for (const line of lines) {
      if (line.stockSource !== 'warehouse') { result.push(line); continue; }
      await this.requireStockReferences(client, scope, line.partId, line.warehouseId);
      const key = `${line.partId}:${line.warehouseId}`, balance = balances.get(key) || { quantity: 0, amount: 0 }, quantity = quantityMilli(line.quantity);
      if (quantity > balance.quantity) fail(`Недостаточно остатка запчасти «${line.name.slice(0, 100)}». Наряд не закрыт.`);
      const amount = quantity === balance.quantity ? balance.amount : roundRatio(BigInt(balance.amount) * BigInt(quantity), balance.quantity);
      const unitCost = roundRatio(BigInt(amount) * 1000n, quantity);
      await this.movement(client, scope, actor, { partId: line.partId, warehouseId: line.warehouseId, quantityMilli: -quantity,
        unitCostCents: unitCost, amountCents: -amount, kind: 'issue', documentId: orderId, details: { lineId: line.id } });
      balances.set(key, { quantity: balance.quantity - quantity, amount: balance.amount - amount });
      result.push({ ...line, plannedUnitPriceCents: line.unitPriceCents, plannedAmountCents: line.amountCents,
        unitPriceCents: unitCost, amountCents: amount, discountPercent: 0, adjustmentCents: 0, adjustmentReason: '', valuation: 'weighted_average' });
    }
    return result;
  }
  async action(supplied, kind, id, body, correlationId) {
    return this.fleet.scoped(supplied, body?.responsibilityScopeId, true, async (client, scope, actor) => {
      if (!['orders', 'purchases', 'driverReports'].includes(kind)) fail('Для этого вида записи действие недоступно.');
      id = uuid(id); const input = validateAction(body);
      return this.idempotent(client, scope, actor, input.idempotencyKey, { kind, id, ...input }, async () => {
        const record = await this.reference(client, scope, kind, id);
        if (record.version !== input.version) conflict();
        let p = { ...record.payload }; const action = input.action;
        if (kind === 'orders') {
          if (['completed', 'cancelled'].includes(p.status)) conflict();
          if (action === 'start' && p.status === 'draft') p.status = 'in_progress';
          else if (action === 'cancel') p.status = 'cancelled';
          else if (action === 'complete') {
            if (!p.lines.length) fail('Добавьте позиции перед закрытием заказ-наряда.');
            const completedOn = input.completedOn || today();
            if (completedOn < p.openedOn) fail('Дата завершения раньше открытия.');
            p.lines = await this.issue(client, scope, actor, id, p.lines); p.status = 'completed'; p.completedOn = completedOn;
            if (p.maintenanceId) {
              const plan = await this.reference(client, scope, 'maintenance', p.maintenanceId);
              if (plan.payload.vehicleId !== p.vehicleId) fail('План ТО относится к другому автомобилю.');
              if (plan.payload.intervalKm && p.odometerKm == null) fail('Укажите пробег при завершении наряда, чтобы рассчитать следующее ТО по километрам.');
              if ((plan.payload.lastCompletedOn && completedOn < plan.payload.lastCompletedOn)
                || (p.odometerKm != null && plan.payload.lastOdometerKm != null && p.odometerKm < plan.payload.lastOdometerKm))
                fail('В плане ТО уже есть более позднее обслуживание. Проверьте дату, пробег или связь с планом.');
              await this.write(client, scope, actor, 'maintenance', plan.id, { ...plan.payload, lastCompletedOn: completedOn,
                lastOdometerKm: p.odometerKm ?? null, dueOn: null, dueOdometerKm: null,
                active: !!(plan.payload.intervalKm || plan.payload.intervalDays) }, plan, 'completed', correlationId);
            }
            await this.latestOdometer(client, scope, actor, p.vehicleId, p.odometerKm, correlationId);
          } else fail('Недопустимый переход состояния заказ-наряда.');
          if (p.driverReportId && ['completed', 'cancelled'].includes(p.status)) {
            const report = await this.reference(client, scope, 'driverReports', p.driverReportId);
            if (p.status === 'completed') await this.write(client, scope, actor, 'driverReports', report.id, { ...report.payload, status: 'resolved', resolution: input.resolution || `Работы выполнены по наряду ${p.number}.` }, report, 'resolved', correlationId);
            else await this.write(client, scope, actor, 'driverReports', report.id, { ...report.payload, orderId: null }, report, 'unlinked', correlationId);
          }
        } else if (kind === 'purchases') {
          if (['received', 'cancelled'].includes(p.status)) conflict();
          if (action === 'order' && p.status === 'draft') p.status = 'ordered';
          else if (action === 'cancel') p.status = 'cancelled';
          else if (action === 'receive' && p.status === 'ordered') {
            if (!p.lines.length) fail('Добавьте строки закупки перед приёмкой.');
            for (const line of p.lines) {
              await this.requireStockReferences(client, scope, line.partId, p.warehouseId);
              await this.movement(client, scope, actor, { partId: line.partId, warehouseId: p.warehouseId, quantityMilli: quantityMilli(line.quantity),
                unitCostCents: line.unitCostCents, amountCents: lineAmount(line.quantity, line.unitCostCents), kind: 'receipt', documentId: id, details: { lineId: line.id } });
            }
            p.status = 'received';
          } else fail('Недопустимый переход состояния закупки.');
        } else {
          if (['resolved', 'rejected'].includes(p.status)) conflict();
          if (action === 'accept' && p.status === 'new') {
            if (p.type === 'fuel') {
              const fuel = parseRecord('fuel', { id: randomUUID(), responsibilityScopeId: scope.responsibilityScopeId, version: 0,
                vehicleId: p.vehicleId, date: p.reportedOn, fuelType: '', litres: p.litres, unitPriceCents: p.unitPriceCents,
                odometerKm: p.odometerKm, fullTank: p.fullTank, station: p.station, receiptReference: p.receiptReference, driverUserId: p.driverUserId, notes: p.description });
              await this.write(client, scope, actor, 'fuel', fuel.id, { ...fuel.payload, sourceReportId: id }, null, 'driver_report', correlationId);
              p.fuelId = fuel.id;
            }
            if (p.type === 'odometer') {
              const vehicle = await this.reference(client, scope, 'vehicles', p.vehicleId);
              if (vehicle.payload.odometerKm != null && p.odometerKm < vehicle.payload.odometerKm) fail('Показание ниже актуального одометра. Проверьте заявку.');
            }
            await this.latestOdometer(client, scope, actor, p.vehicleId, p.odometerKm, correlationId);
            p.status = p.type === 'defect' ? 'accepted' : 'resolved';
            if (p.status === 'resolved') p.resolution = input.resolution || (p.type === 'fuel' ? 'Заправка принята в учёт.' : 'Показание одометра принято.');
          } else if (action === 'resolve' && p.status === 'accepted') {
            if (!input.resolution) fail('Укажите результат устранения неисправности.');
            if (p.orderId) fail('Завершите связанный заказ-наряд для закрытия заявки.');
            p.status = 'resolved'; p.resolution = input.resolution;
          } else if (action === 'reject') {
            if (!input.resolution) fail('Укажите причину отклонения заявки.');
            if (p.orderId) fail('Сначала отмените связанный заказ-наряд.');
            p.status = 'rejected'; p.resolution = input.resolution;
          } else fail('Недопустимое действие с заявкой.');
        }
        return { record: flat(await this.write(client, scope, actor, kind, id, p, record, action, correlationId)) };
      });
    });
  }
  async opening(supplied, body, correlationId) {
    return this.fleet.scoped(supplied, body?.responsibilityScopeId, true, async (client, scope, actor) => {
      const input = { responsibilityScopeId: scope.responsibilityScopeId, idempotencyKey: uuid(body.idempotencyKey), partId: uuid(body.partId), warehouseId: uuid(body.warehouseId),
        quantity: quantityMilli(body.quantity) / 1000, unitCostCents: integer(body.unitCostCents, 'Цена, коп.', 0, 1e11), reason: text(body.reason, 'Основание начального остатка', 2000, true) };
      return this.idempotent(client, scope, actor, input.idempotencyKey, { kind: 'opening', ...input }, async () => {
        await this.requireStockReferences(client, scope, input.partId, input.warehouseId);
        await this.movement(client, scope, actor, { ...input, quantityMilli: quantityMilli(input.quantity), amountCents: lineAmount(input.quantity, input.unitCostCents),
          kind: 'opening', documentId: input.idempotencyKey, details: { reason: input.reason } });
        await this.fleet.auditWrite(client, scope, actor, correlationId, 'fleet_operations.stock.opening', input.idempotencyKey, input);
        return { stock: await this.stock(client, scope) };
      });
    });
  }
  async importVehicles(supplied, body, correlationId) {
    return this.fleet.scoped(supplied, body?.responsibilityScopeId, true, async (client, scope, actor, state) => {
      const key = uuid(body.idempotencyKey);
      return this.idempotent(client, scope, actor, key, { kind: 'importVehicles', responsibilityScopeId: scope.responsibilityScopeId, datasetId: state.activeDatasetId }, async () => {
        const source = await this.fleet.source(client, scope, state.activeDatasetId);
        if (!source) fail('Сначала загрузите и подтвердите исходные позиции.');
        const existingRows = (await this.records(client, scope)).filter(row => row.kind === 'vehicles');
        const existing = new Set(existingRows.map(row => normalizePlate(row.payload.plate))), vehicles = new Map();
        for (const row of source.payload.rows) {
          const key = normalizePlate(row.plate); if (!key) continue;
          const date = row.completedOn || row.openedOn || '';
          const current = vehicles.get(key) || { row, reading: null, date: '' };
          if (row.odometerKm != null && Number.isFinite(row.odometerKm) && row.odometerKm >= 0 && date && date >= current.date) Object.assign(current, { reading: row.odometerKm, date });
          vehicles.set(key, current);
        }
        let created = 0, found = 0; const needsReview = [];
        for (const [key, value] of vehicles) {
          if (existing.has(key)) { found++; continue; }
          const row = value.row;
          const input = parseRecord('vehicles', { id: randomUUID(), responsibilityScopeId: scope.responsibilityScopeId, version: 0, plate: row.plate,
            vin: '', brand: row.vehicleBrand, model: '', year: row.vehicleYear, group: row.vehicleGroup, status: 'active', odometerKm: value.reading, fuelType: '', notes: 'Карточка создана из загруженных позиций. VIN и историю номеров нужно подтвердить.' });
          const saved = await this.write(client, scope, actor, 'vehicles', input.id, input.payload, null, 'imported', correlationId);
          needsReview.push({ id: saved.id, plate: row.plate, reason: 'Проверьте VIN / ID ТС и историю госномеров.' }); created++;
        }
        return { created, existing: found, needsReview };
      });
    });
  }
  async driverTransaction(supplied, fn) {
    return this.fleet.database.transaction(async client => {
      await this.fleet.identity.lockUsers(client, [supplied.id, supplied.impersonation?.administratorId].filter(Boolean));
      const actor = await this.fleet.identity.actorBySession(client, supplied.sessionId);
      if (!actor || actor.id !== supplied.id || actor.authVersion !== supplied.authVersion || actor.role !== supplied.role) throw new UnauthorizedException('Сессия недействительна.');
      if (actor.role !== 'driver') forbidden();
      return fn(client, actor);
    });
  }
  async driverRead(supplied) {
    return this.driverTransaction(supplied, async (client, actor) => {
      const assignments = [], reports = [];
      for (const scope of [...actor.grants].sort((a, b) => a.responsibilityScopeId.localeCompare(b.responsibilityScopeId))) {
        if (!tuple(scope).every(Boolean)) continue;
        await this.fleet.lockScope(client, scope);
        const all = groupRecords(await this.records(client, scope));
        const vehicles = new Map(all.vehicles.map(row => [row.id, row]));
        for (const row of all.assignments) if (row.driverUserId === actor.id && row.active && row.startsOn <= today() && (!row.endsOn || row.endsOn >= today())) {
          const vehicle = vehicles.get(row.vehicleId);
          assignments.push({ id: row.id, responsibilityScopeId: scope.responsibilityScopeId, vehicleId: row.vehicleId,
            startsOn: row.startsOn, endsOn: row.endsOn, vehicle: vehicle ? { id: vehicle.id, plate: vehicle.plate, brand: vehicle.brand, model: vehicle.model, odometerKm: vehicle.odometerKm } : null });
        }
        reports.push(...all.driverReports.filter(row => row.driverUserId === actor.id).map(row => ({ ...row, responsibilityScopeId: scope.responsibilityScopeId })));
      }
      return { assignments, reports };
    });
  }
  async driverReport(supplied, body, correlationId) {
    return this.driverTransaction(supplied, async (client, actor) => {
      const scopeId = uuid(body?.responsibilityScopeId), scope = actor.grants.find(grant => grant.responsibilityScopeId === scopeId && tuple(grant).every(Boolean));
      if (!scope) forbidden();
      await this.fleet.lockScope(client, scope);
      const input = parseRecord('driverReports', { ...body, payload: undefined, driverUserId: actor.id, status: 'new', orderId: null, resolution: '' });
      if (input.version !== 0 || input.payload.reportedOn > today()) fail('Можно создать только новую заявку с текущей или прошедшей датой.');
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,917042035))', [`fleet-record:${input.id}`]);
      const found = (await client.query(`SELECT ${COLUMNS} FROM fleet_ops_records WHERE id=$1`, [input.id])).rows[0];
      if (found) conflict('Такая заявка уже отправлена. Обновите список.');
      const all = await this.records(client, scope);
      if (!all.some(row => row.kind === 'assignments' && row.payload.active && row.payload.driverUserId === actor.id
        && row.payload.vehicleId === input.payload.vehicleId && row.payload.startsOn <= input.payload.reportedOn
        && (!row.payload.endsOn || row.payload.endsOn >= input.payload.reportedOn))) forbidden();
      await this.reference(client, scope, 'vehicles', input.payload.vehicleId);
      return flat(await this.write(client, scope, actor, 'driverReports', input.id, input.payload, null, 'created', correlationId));
    });
  }
}
Injectable()(FleetOperationsService); Inject(FleetMaintenanceService)(FleetOperationsService, undefined, 0);
class FleetOperationsController {
  constructor(service) { this.service = service; }
  context(actor) { return this.service.context(actor); }
  read(actor, scopeId) { return this.service.read(actor, scopeId); }
  save(actor, kind, body, req) { return this.service.save(actor, kind, body, req.correlationId); }
  action(actor, kind, id, body, req) { return this.service.action(actor, kind, id, body, req.correlationId); }
  opening(actor, body, req) { return this.service.opening(actor, body, req.correlationId); }
  importVehicles(actor, body, req) { return this.service.importVehicles(actor, body, req.correlationId); }
  driverRead(actor) { return this.service.driverRead(actor); }
  driverReport(actor, body, req) { return this.service.driverReport(actor, body, req.correlationId); }
}
Inject(FleetOperationsService)(FleetOperationsController, undefined, 0); Controller('fleet-operations')(FleetOperationsController); UseGuards(AuthGuard)(FleetOperationsController);
for (const [name, decorator] of [['context', Get('context')], ['read', Get()], ['opening', Post('stock/opening')], ['importVehicles', Post('vehicles/import')],
  ['driverRead', Get('driver')], ['driverReport', Post('driver/reports')], ['save', Put(':kind')], ['action', Post(':kind/:id/action')]]) {
  const descriptor = Object.getOwnPropertyDescriptor(FleetOperationsController.prototype, name);
  decorator(FleetOperationsController.prototype, name, descriptor); Header('Cache-Control', 'no-store')(FleetOperationsController.prototype, name, descriptor);
  CurrentActor()(FleetOperationsController.prototype, name, 0);
}
Query('responsibilityScopeId')(FleetOperationsController.prototype, 'read', 1);
Param('kind')(FleetOperationsController.prototype, 'save', 1); Body()(FleetOperationsController.prototype, 'save', 2); Req()(FleetOperationsController.prototype, 'save', 3);
Param('kind')(FleetOperationsController.prototype, 'action', 1); Param('id')(FleetOperationsController.prototype, 'action', 2); Body()(FleetOperationsController.prototype, 'action', 3); Req()(FleetOperationsController.prototype, 'action', 4);
for (const name of ['opening', 'importVehicles', 'driverReport']) { Body()(FleetOperationsController.prototype, name, 1); Req()(FleetOperationsController.prototype, name, 2); }
class FleetOperationsModule {}
Module({ imports: [FleetMaintenanceModule, IdentityAccessModule], controllers: [FleetOperationsController], providers: [FleetOperationsService], exports: [FleetOperationsService] })(FleetOperationsModule);
module.exports = { FleetOperationsModule, FleetOperationsService, groupRecords };
