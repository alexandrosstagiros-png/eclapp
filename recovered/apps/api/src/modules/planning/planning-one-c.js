'use strict';
const { randomUUID, createHash } = require('node:crypto');
const { BadRequestException, ForbiddenException, ConflictException } = require('@nestjs/common');
const { uuid, businessDate, object, keys, fail } = require('./planning-input');
const TARGET_LABEL = 'Локальная 1С · InfoBase';
let tail = Promise.resolve();

function enabled() {
  if (process.env.LOCAL_ONE_C_ENABLED !== 'true' || !['development','test'].includes(process.env.NODE_ENV) || process.env.HOST !== '127.0.0.1') return false;
  try { return ['127.0.0.1','localhost','[::1]'].includes(new URL(process.env.DATABASE_URL).hostname); } catch { return false; }
}
function input(body) {
  object(body, 'отправка в 1С'); keys(body, ['responsibilityScopeId','plans'], 'отправка в 1С');
  const responsibilityScopeId = uuid(body.responsibilityScopeId, 'область работы');
  if (!Array.isArray(body.plans) || !body.plans.length || body.plans.length > 31) fail('Выберите от 1 до 31 дня.');
  const dates = new Set(); let count = 0;
  const plans = body.plans.map(raw => {
    object(raw, 'день'); keys(raw, ['businessDate','version','rowIds'], 'день');
    const date = businessDate(raw.businessDate);
    if (dates.has(date)) fail('Даты не должны повторяться.'); dates.add(date);
    if (!Number.isSafeInteger(raw.version) || raw.version < 1) fail('Сначала сохраните план.');
    if (!Array.isArray(raw.rowIds) || !raw.rowIds.length) fail('Выберите строки для отправки.');
    const rowIds = raw.rowIds.map(id => uuid(id, 'строка'));
    if (new Set(rowIds).size !== rowIds.length) fail('Строки не должны повторяться.');
    count += rowIds.length;
    return { businessDate: date, version: raw.version, rowIds };
  }).sort((a,b) => a.businessDate.localeCompare(b.businessDate));
  if (count > 200) fail('За одну отправку выберите не больше 200 строк.');
  return { responsibilityScopeId, plans };
}
function payloadFor(row, date, mapping, resources) {
  if (row.status !== 'work') throw new Error('В 1С отправляются рабочие смены со статусом «Работа». Резерв, выходные и отмены не создают заявки.');
  if (row.tripCount !== 1) throw new Error('Для отправки в 1С укажите один рейс в строке; несколько рейсов оформите отдельными строками.');
  if (!row.driverId || !row.vehicleId || !row.departureTime) throw new Error('Выберите водителя, автомобиль и время выезда.');
  const driver = resources.find(r => r.kind === 'driver' && r.local_id === row.driverId && r.active);
  const vehicle = resources.find(r => r.kind === 'vehicle' && r.local_id === row.vehicleId && r.active);
  if (!driver || !vehicle) throw new Error('Водитель или автомобиль не сопоставлен с активной записью локальной 1С.');
  if (Object.values(row.clientFields || {}).some(value => String(value).trim())) throw new Error('В строке заполнены дополнительные поля клиента. Их соответствия реквизитам 1С ещё не настроены; данные не отправлены.');
  if (row.extraFields?.length) throw new Error('В строке добавлены отдельные поля. Их соответствия реквизитам 1С ещё не настроены; данные не отправлены.');
  return { sourceNamespace: mapping.source_namespace, externalKey: `${mapping.responsibility_scope_id}:${date}:${row.id}`,
    clientId: mapping.client_ref, projectId: mapping.project_ref, date,
    driverId: driver.source_ref, vehicleId: vehicle.source_ref, startTime: row.departureTime,
    status: 'planned', notes: row.comment || '' };
}
function rowResult(row) {
  return { businessDate: row.businessDate, rowId: row.row_id, status: row.status,
    documentNumber: row.receipt?.shiftNumber || '', requestNumber: row.receipt?.requestNumber || '',
    message: row.message || (row.status === 'pending' ? 'Отправка не подтверждена. Повторите отправку этой строки.' : ''),
    exportedAt: row.updated_at?.toISOString?.() || row.updated_at || null };
}
async function receipts(client, scopeId, date, currentRows = []) {
  if (!enabled()) return [];
  const result = await client.query(`SELECT *,to_char(business_date,'YYYY-MM-DD') AS "businessDate"
    FROM planning_one_c_exports WHERE responsibility_scope_id=$1 AND business_date=$2 ORDER BY created_at`, [scopeId,date]);
  const mapping=(await client.query('SELECT * FROM planning_one_c_scopes WHERE responsibility_scope_id=$1',[scopeId])).rows[0];
  const resources=(await client.query('SELECT * FROM planning_one_c_resources WHERE responsibility_scope_id=$1',[scopeId])).rows;
  return result.rows.map(stored=>{
    const result=rowResult(stored), row=currentRows.find(row=>row.id===stored.row_id);
    let hash;
    try { if(row && mapping) hash=createHash('sha256').update(JSON.stringify(payloadFor(row,date,mapping,resources))).digest('hex'); } catch {}
    if(hash!==stored.payload_hash) return {...result,status:'error',message:'План изменён после отправки. В 1С осталась ранее отправленная версия; сверьте указанные документы.'};
    return result;
  });
}
async function run(service, actor, body, correlationId) {
  if (!enabled()) throw new ForbiddenException('Локальный обмен с 1С отключён.');
  const request = input(body);
  const prepared = await service.database.transaction(async client => {
    const current = await service.current(client, actor);
    const scope = service.scope(current, request.responsibilityScopeId);
    const mapping = (await client.query('SELECT * FROM planning_one_c_scopes WHERE responsibility_scope_id=$1', [scope.responsibilityScopeId])).rows[0];
    if (!mapping) throw new BadRequestException('Эта область не связана с локальной 1С. Выберите проект «Локальная 1С».');
    const resources = (await client.query('SELECT * FROM planning_one_c_resources WHERE responsibility_scope_id=$1', [scope.responsibilityScopeId])).rows;
    const staged = [];
    // All plan versions are checked before any external write, under the same
    // locks used by day/calendar saving. The queue then preserves that snapshot.
    for (const selected of request.plans) {
      const plan = await service.lockPlan(client, scope, selected);
      if (!plan) throw new ConflictException('Сначала сохраните план.');
      const rows = (await client.query('SELECT rows FROM planning_plans WHERE id=$1', [plan.id])).rows[0].rows;
      for (const rowId of selected.rowIds) {
        const row = rows.find(r => r.id === rowId);
        if (!row) throw new ConflictException(`Строка плана на ${selected.businessDate} уже удалена. Обновите план.`);
        staged.push({ row, businessDate: selected.businessDate });
      }
    }
    await service.validateReferences(client, scope, staged.map(item => item.row));
    const jobs = [];
    for (const item of staged) {
      const base = { businessDate:item.businessDate, rowId:item.row.id };
      let payload;
      try {
        payload = payloadFor(item.row, item.businessDate, mapping, resources);
        require('../../../../../../integrations/one-c-local/planning-writer.cjs').preparePlannedAssignment(payload);
      }
      catch (error) { jobs.push({ ...base, status:'error', message:error.message }); continue; }
      const hash = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
      const existing = (await client.query(`SELECT id,payload_hash FROM planning_one_c_exports
        WHERE responsibility_scope_id=$1 AND business_date=$2 AND row_id=$3 FOR UPDATE`, [scope.responsibilityScopeId,item.businessDate,item.row.id])).rows[0];
      if (existing && existing.payload_hash !== hash) {
        jobs.push({ ...base, status:'error', message:'Эта строка уже отправлялась с другими данными. Изменения не перенесены. Сверьте документ в 1С; новая строка создаст отдельную смену.' }); continue;
      }
      const id = existing?.id || randomUUID();
      if (!existing) await client.query(`INSERT INTO planning_one_c_exports(id,responsibility_scope_id,business_date,row_id,payload,payload_hash,created_by)
        VALUES($1,$2,$3,$4,$5::jsonb,$6,$7)`, [id,scope.responsibilityScopeId,item.businessDate,item.row.id,JSON.stringify(payload),hash,current.id]);
      jobs.push({ ...base, id });
    }
    return { jobs, scope };
  });
  const results = [];
  const batchSignal=AbortSignal.timeout(180000);
  let connectionFailure;
  for (const job of prepared.jobs) {
    if (!job.id) { results.push(job); continue; }
    if(connectionFailure || batchSignal.aborted) {
      results.push({businessDate:job.businessDate,rowId:job.rowId,status:'error',message:connectionFailure || 'Общее время отправки истекло. Повторите отправку оставшихся строк.'});
      continue;
    }
    const result = await service.database.transaction(async client => {
      const stored = (await client.query('SELECT * FROM planning_one_c_exports WHERE id=$1', [job.id])).rows[0];
      const resources = (await client.query(`SELECT kind,local_id FROM planning_one_c_resources WHERE responsibility_scope_id=$1 AND active
        AND ((kind='driver' AND source_ref=$2) OR (kind='vehicle' AND source_ref=$3))`, [request.responsibilityScopeId,stored.payload.driverId,stored.payload.vehicleId])).rows;
      const driver = resources.find(r=>r.kind==='driver'), vehicle = resources.find(r=>r.kind==='vehicle');
      const current = await service.current(client, actor, driver ? [driver.local_id] : []);
      const scope = service.scope(current, request.responsibilityScopeId);
      const locked = (await client.query('SELECT pg_try_advisory_xact_lock(hashtextextended($1,917042027)) AS locked', [job.id])).rows[0].locked;
      if (!locked) return { ...job, status:'error', message:'Эта строка уже отправляется. Повторите проверку после завершения.' };
      await client.query('SELECT id FROM planning_one_c_exports WHERE id=$1 FOR UPDATE',[job.id]);
      let receipt, status, message;
      try {
        if (!driver || !vehicle) throw new BadRequestException('Водитель или автомобиль больше не доступен. Обновите справочники.');
        await service.validateReferences(client,scope,[{driverId:driver.local_id,vehicleId:vehicle.local_id}]);
        const writer = require('../../../../../../integrations/one-c-local/planning-writer.cjs');
        const { ensureSource } = require('../../../../../../integrations/one-c-local/manage.cjs');
        receipt = await writer.exportPlannedAssignment(stored.payload, { ensureSource, signal:batchSignal });
        status = receipt.status === 'unchanged' || receipt.created === false ? 'unchanged' : 'created';
        message = status === 'created' ? 'Плановая заявка и смена созданы в 1С.' : 'Уже в 1С. Повторных документов нет.';
      } catch (error) {
        status = 'error'; message = error.code?.startsWith('ONE_C_') || error instanceof BadRequestException ? error.message : 'Не удалось подтвердить запись в 1С. Повторите отправку: сохранённый ключ защищает от дублей.';
        if(['ONE_C_UNAVAILABLE','ONE_C_AUTH'].includes(error.code)) connectionFailure='Не отправлено: связь с локальной 1С прервалась. Повторите отправку после восстановления связи.';
      }
      await client.query(`UPDATE planning_one_c_exports SET status=$2,receipt=coalesce($3::jsonb,receipt),message=$4,
        attempts=attempts+1,updated_at=clock_timestamp() WHERE id=$1`, [job.id,status,receipt ? JSON.stringify(receipt) : null,message]);
      await service.audit.append(client, { actorId:current.id, channel:current.channel, correlationId:correlationId || randomUUID(),
        action:'planning.one_c_export', entityType:'planning_one_c_export', entityId:job.id, scope:prepared.scope,
        metadata:{ businessDate:job.businessDate,rowId:job.rowId,status,shiftId:receipt?.shiftId || null,requestId:receipt?.requestId || null } });
      return { businessDate:job.businessDate,rowId:job.rowId,status,documentNumber:receipt?.shiftNumber || stored.receipt?.shiftNumber || '',requestNumber:receipt?.requestNumber || stored.receipt?.requestNumber || '',message };
    });
    results.push(result);
  }
  return { targetLabel:TARGET_LABEL,results,summary:{created:results.filter(r=>r.status==='created').length,unchanged:results.filter(r=>r.status==='unchanged').length,failed:results.filter(r=>r.status==='error').length} };
}
function exportPlans(service, actor, body, correlationId) {
  const result = tail.then(() => run(service,actor,body,correlationId));
  tail = result.catch(() => {});
  return result;
}
module.exports = { enabled, TARGET_LABEL, input, payloadFor, receipts, exportPlans };
