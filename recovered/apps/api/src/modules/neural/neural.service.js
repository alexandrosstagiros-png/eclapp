// SPDX-License-Identifier: MIT
'use strict';
const { randomUUID } = require('node:crypto');
const { Injectable, Inject, ForbiddenException, UnauthorizedException, HttpException } = require('@nestjs/common');
const { DatabaseService } = require('../../platform/database.service');
const { IdentityRepository } = require('../identity-access/infrastructure/identity.repository');
const { AuditService } = require('../audit/application/audit.service');
const { TASKS, PROVIDERS, fail, uuid, settingsInput, reportRange } = require('./neural-input');
const { callProvider, estimatedCost, ProviderError } = require('./neural-providers');
const SCOPE_KEYS = ['legalEntityId', 'regionId', 'projectId', 'responsibilityScopeId'];
const ROLES = ['dispatcher', 'manager', 'recruiter', 'tender_specialist', 'document_specialist', 'mechanic', 'access_admin', 'auditor'];
function forbidden() { throw new ForbiddenException({ code: 'NEURAL_FORBIDDEN', message: 'Нет доступа к настройкам или расходам нейросетей в этой области.' }); }
function iso(value) { return value instanceof Date ? value.toISOString() : value; }
function safeMetadata(metadata) {
  const result = {};
  for (const key of ['summaryId', 'scheduleId', 'runId']) if (typeof metadata?.[key] === 'string' && /^[a-f0-9-]{36}$/i.test(metadata[key])) result[key] = metadata[key];
  if (typeof metadata?.orderId === 'string' && metadata.orderId.length <= 500 && !/[\u0000-\u001f\u007f]/.test(metadata.orderId)) result.orderId = metadata.orderId;
  for (const key of ['messageCount', 'orderCount']) if (Number.isSafeInteger(metadata?.[key]) && metadata[key] >= 0) result[key] = metadata[key];
  return result;
}
function publicRecord(row) {
  const result = { ...row, createdAt: iso(row.createdAt), completedAt: iso(row.completedAt), cost: row.cost === null ? null : Number(row.cost) };
  for (const key of ['inputTokens', 'outputTokens', 'cachedInputTokens', 'cacheWriteTokens']) result[key] = row[key] === null ? null : Number(row[key]);
  return result;
}
function aggregate(rows) {
  const result = { calls: 0, successful: 0, failed: 0, pending: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, unpricedCalls: 0, unknownTokenCalls: 0, costs: [] }, amounts = new Map();
  for (const row of rows) {
    result.calls += Number(row.calls);
    result.successful += Number(row.successful); result.failed += Number(row.failed); result.pending += Number(row.pending);
    result.inputTokens += Number(row.inputTokens); result.outputTokens += Number(row.outputTokens);
    result.unpricedCalls += Number(row.unpricedCalls); result.unknownTokenCalls += Number(row.unknownTokenCalls);
    if (row.cost !== null) amounts.set(row.currency, (amounts.get(row.currency) || 0) + Number(row.cost));
  }
  result.totalTokens = result.inputTokens + result.outputTokens;
  result.costs = [...amounts].sort(([a], [b]) => a.localeCompare(b)).map(([currency, amount]) => ({ currency, amount: Number(amount.toFixed(10)) }));
  return result;
}
class NeuralService {
  constructor(database) { this.database = database; this.identity = new IdentityRepository(database); this.audit = new AuditService(); }
  async admin(client, supplied) {
    await this.identity.lockUsers(client, [supplied.id, supplied.impersonation?.administratorId].filter(Boolean));
    const actor = await this.identity.actorBySession(client, supplied.sessionId);
    if (!actor || actor.id !== supplied.id || actor.authVersion !== supplied.authVersion || actor.role !== supplied.role) throw new UnauthorizedException('Сессия недействительна.');
    if (actor.role !== 'access_admin' || actor.impersonation) forbidden();
    return actor;
  }
  async scope(client, actor, scopeId) {
    const result = await client.query(`SELECT p.legal_entity_id AS "legalEntityId",p.region_id AS "regionId",p.id AS "projectId",rs.id AS "responsibilityScopeId"
      FROM responsibility_scopes rs JOIN projects p ON p.id=rs.project_id WHERE rs.id=$1`, [uuid(scopeId)]);
    const canonical = result.rows[0];
    if (!canonical || !actor.grants?.some(grant => SCOPE_KEYS.every(key => grant[key] === canonical[key]))) forbidden();
    return canonical;
  }
  async config(client, scopeId) {
    const result = await client.query('SELECT profiles,tasks,updated_at AS "updatedAt" FROM neural_settings WHERE responsibility_scope_id=$1', [scopeId]);
    return result.rows[0] || { profiles: [], tasks: Object.fromEntries(TASKS.map(task => [task, null])), updatedAt: null };
  }
  settingsResponse(scopeId, config) {
    return { responsibilityScopeId: scopeId, profiles: config.profiles, tasks: config.tasks, updatedAt: iso(config.updatedAt), canManage: true,
      providers: Object.entries(PROVIDERS).map(([id, provider]) => ({ id, ...provider, configured: Boolean(process.env[provider.keyEnv]?.trim()) })),
      costBasis: 'estimate', pricingNote: 'Расходы рассчитаны по сохранённым тарифам профиля за миллион токенов. Это оценка, не счёт провайдера; валюты не суммируются. Неизвестный тариф или расход отмечается отдельно.' };
  }
  async settings(supplied, scopeId) {
    return this.database.transaction(async client => {
      const actor = await this.admin(client, supplied), scope = await this.scope(client, actor, scopeId);
      return this.settingsResponse(scope.responsibilityScopeId, await this.config(client, scope.responsibilityScopeId));
    });
  }
  async saveSettings(supplied, body, queryScopeId, correlationId) {
    const input = settingsInput(body);
    if (queryScopeId && uuid(queryScopeId) !== input.responsibilityScopeId) fail('Области работы в запросе и настройках должны совпадать.');
    return this.database.transaction(async client => {
      const actor = await this.admin(client, supplied), scope = await this.scope(client, actor, input.responsibilityScopeId);
      const result = await client.query(`INSERT INTO neural_settings(responsibility_scope_id,profiles,tasks,updated_by) VALUES($1,$2::jsonb,$3::jsonb,$4)
        ON CONFLICT(responsibility_scope_id) DO UPDATE SET profiles=EXCLUDED.profiles,tasks=EXCLUDED.tasks,updated_by=EXCLUDED.updated_by,updated_at=clock_timestamp()
        RETURNING profiles,tasks,updated_at AS "updatedAt"`, [scope.responsibilityScopeId, JSON.stringify(input.profiles), JSON.stringify(input.tasks), actor.id]);
      await this.audit.append(client, { actorId: actor.id, channel: actor.channel, correlationId: correlationId || randomUUID(), action: 'neural.settings.updated', entityType: 'neural_settings', entityId: scope.responsibilityScopeId,
        scope, metadata: { profileCount: input.profiles.length, tasks: input.tasks } });
      return this.settingsResponse(scope.responsibilityScopeId, result.rows[0]);
    });
  }
  async run(client, actor, scope, { task, system, prompt, metadata }) {
    if (!TASKS.includes(task)) fail('Неизвестная задача нейросети.');
    if (!ROLES.includes(actor.role)) forbidden();
    const canonical = await this.scope(client, actor, scope.responsibilityScopeId);
    if (!SCOPE_KEYS.every(key => canonical[key] === scope[key])) forbidden();
    // Callers revalidate the current actor and input record access in their transaction.
    const config = await this.config(client, canonical.responsibilityScopeId);
    const profile = config.profiles.find(item => item.id === config.tasks[task]);
    if (!profile || !profile.enabled) return null;
    if (typeof prompt !== 'string' || !prompt.trim() || Buffer.byteLength(prompt, 'utf8') > 512 * 1024 || typeof system !== 'string' || Buffer.byteLength(system, 'utf8') > 32 * 1024) fail('Данных слишком много для одного запроса. Сократите выбранный период или состав данных.');
    const usageId = randomUUID(), started = Date.now();
    const pricing = { inputPricePerMillion: profile.inputPricePerMillion, outputPricePerMillion: profile.outputPricePerMillion, cachedInputPricePerMillion: profile.cachedInputPricePerMillion, cacheWritePricePerMillion: profile.cacheWritePricePerMillion };
    // These pool queries commit independently of the caller's transaction. A
    // later failure saving a summary must never erase a charge already incurred.
    // Do not send a request unless the pending ledger entry was durably saved.
    await this.database.pool.query(`INSERT INTO neural_usage(id,responsibility_scope_id,actor_id,task,profile_id,provider,model,status,currency,pricing,metadata)
      VALUES($1,$2,$3,$4,$5,$6,$7,'pending',$8,$9::jsonb,$10::jsonb)`, [usageId, canonical.responsibilityScopeId, actor.id, task, profile.id, profile.provider, profile.model, profile.currency, JSON.stringify(pricing), JSON.stringify(safeMetadata(metadata))]);
    let result;
    try { result = await callProvider(profile, { system, prompt }); }
    catch (error) {
      const code = error instanceof ProviderError ? error.code : 'PROVIDER_ERROR', usage = error instanceof ProviderError ? error.usage : null;
      await this.finishUsage(usageId, 'failed', usage, estimatedCost(profile, usage), code, started);
      const messages = { KEY_NOT_CONFIGURED: 'API-ключ выбранного провайдера не настроен на сервере.', FOLDER_NOT_CONFIGURED: 'Укажите каталог Яндекс Cloud в профиле модели или на сервере.', OUTPUT_LIMIT: 'Ответ модели не завершён: увеличьте лимит ответа или сократите входные данные.', TIMEOUT: 'Провайдер не ответил вовремя. Расход токенов может быть неизвестен.' };
      throw new HttpException({ code: 'NEURAL_PROVIDER_ERROR', message: messages[code] || 'Не удалось получить ответ провайдера нейросети. Проверьте модель, ключ и доступность сервиса.', usageId }, 502);
    }
    const cost = estimatedCost(profile, result);
    await this.finishUsage(usageId, 'success', result, cost, null, started);
    return { text: result.text, usageId, provider: profile.provider, model: profile.model, inputTokens: result.inputTokens, outputTokens: result.outputTokens, cachedInputTokens: result.cachedInputTokens, cacheWriteTokens: result.cacheWriteTokens, cost, currency: profile.currency };
  }
  async finishUsage(id, status, usage, cost, errorCode, started) {
    await this.database.pool.query(`UPDATE neural_usage SET status=$2,input_tokens=$3,output_tokens=$4,cached_input_tokens=$5,cost=$6,error_code=$7,duration_ms=$8,cache_write_tokens=$9,completed_at=clock_timestamp() WHERE id=$1 AND status='pending'`,
      [id, status, usage?.inputTokens ?? null, usage?.outputTokens ?? null, usage?.cachedInputTokens ?? null, cost, errorCode, Math.min(2147483647, Math.max(0, Date.now() - started)), usage?.cacheWriteTokens ?? null]);
  }
  async usage(supplied, query) {
    const range = reportRange(query);
    return this.database.transaction(async client => {
      const actor = await this.admin(client, supplied), scope = await this.scope(client, actor, range.responsibilityScopeId), params = [scope.responsibilityScopeId, range.from, range.to];
      const grouped = await client.query(`SELECT task,provider,model,currency,count(*) AS calls,count(*) FILTER(WHERE status='success') AS successful,
        count(*) FILTER(WHERE status='failed') AS failed,count(*) FILTER(WHERE status='pending') AS pending,coalesce(sum(input_tokens),0) AS "inputTokens",coalesce(sum(output_tokens),0) AS "outputTokens",
        count(*) FILTER(WHERE cost IS NULL) AS "unpricedCalls",count(*) FILTER(WHERE input_tokens IS NULL OR output_tokens IS NULL) AS "unknownTokenCalls",sum(cost) AS cost
        FROM neural_usage WHERE responsibility_scope_id=$1 AND created_at>=$2 AND created_at<$3 GROUP BY task,provider,model,currency ORDER BY task,provider,model,currency`, params);
      const latest = await client.query(`SELECT id,task,profile_id AS "profileId",provider,model,status,input_tokens AS "inputTokens",output_tokens AS "outputTokens",cached_input_tokens AS "cachedInputTokens",cache_write_tokens AS "cacheWriteTokens",cost,currency,error_code AS "errorCode",created_at AS "createdAt",completed_at AS "completedAt",duration_ms AS "durationMs"
        FROM neural_usage WHERE responsibility_scope_id=$1 AND created_at>=$2 AND created_at<$3 ORDER BY created_at DESC,id DESC LIMIT 200`, params);
      const taskGroups = new Map(), modelGroups = new Map();
      for (const row of grouped.rows) {
        if (!taskGroups.has(row.task)) taskGroups.set(row.task, []);
        taskGroups.get(row.task).push(row);
        const key = JSON.stringify([row.provider, row.model]);
        if (!modelGroups.has(key)) modelGroups.set(key, []);
        modelGroups.get(key).push(row);
      }
      const totals = aggregate(grouped.rows);
      return { ...range, costBasis: 'estimate', totals, byTask: [...taskGroups].map(([task, rows]) => ({ task, ...aggregate(rows) })),
        byModel: [...modelGroups.values()].map(rows => ({ provider: rows[0].provider, model: rows[0].model, ...aggregate(rows) })), records: latest.rows.map(publicRecord), truncated: totals.calls > latest.rowCount };
    });
  }
}
Injectable()(NeuralService);
Inject(DatabaseService)(NeuralService, undefined, 0);
module.exports = { NeuralService, aggregate };
