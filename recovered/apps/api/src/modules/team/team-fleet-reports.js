// SPDX-License-Identifier: MIT
'use strict';
const { createHash, randomUUID } = require('node:crypto');
const { BadRequestException, ConflictException, ForbiddenException } = require('@nestjs/common');
const { tuple } = require('./team.service');

function stableId(key) {
  const bytes = createHash('sha256').update(`team:fleet-release:v1:${key}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 15) | 80;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function channelScope(row) {
  return { legalEntityId: row.legal_entity_id, regionId: row.region_id, projectId: row.project_id, responsibilityScopeId: row.responsibility_scope_id };
}
function blocked(code, message) { throw new ConflictException({ code, message }); }

class TeamFleetReports {
  constructor(team) { this.team = team; }
  async sourceScopes(client, actor, scope, sourceScopeIds = [], conversationId = null) {
    if (conversationId) await this.target(client, actor, scope, conversationId);
    if (!sourceScopeIds.length) {
      // Use actual planning grants, never Team's company-expanded chat access.
      // An existing target chat can collect the unified system's operational
      // data even when imported catalogues use a different legal-entity tuple.
      const grants = (actor.sourceGrants || actor.grants).filter(grant => grant.personalDataVisible === true
        && (conversationId || grant.legalEntityId === scope.legalEntityId));
      if (!grants.length) throw new ForbiddenException('Нет доступа к данным планирования для отчёта.');
      const found = await client.query(`WITH granted AS (
        SELECT * FROM jsonb_to_recordset($1::jsonb) AS g("legalEntityId" uuid,"regionId" uuid,"projectId" uuid,"responsibilityScopeId" uuid)
      ) SELECT DISTINCT g.* FROM granted g
        JOIN projects p ON p.id=g."projectId" AND p.legal_entity_id=g."legalEntityId" AND p.region_id=g."regionId"
        JOIN responsibility_scopes rs ON rs.id=g."responsibilityScopeId" AND rs.project_id=p.id
        WHERE EXISTS(SELECT 1 FROM planning_plans plan WHERE plan.responsibility_scope_id=rs.id)
          OR EXISTS(SELECT 1 FROM trips trip WHERE trip.responsibility_scope_id=rs.id)
          OR EXISTS(SELECT 1 FROM planning_imported_resources resource WHERE resource.responsibility_scope_id=rs.id AND resource.kind='vehicle' AND resource.active)
          OR EXISTS(SELECT 1 FROM planning_one_c_resources resource WHERE resource.responsibility_scope_id=rs.id AND resource.kind='vehicle' AND resource.active)
        ORDER BY g."responsibilityScopeId"`, [JSON.stringify(grants)]);
      return found.rows.map(source => ({ ...source, personalDataVisible: true }));
    }
    const result = [];
    for (const sourceId of [...new Set(sourceScopeIds)].sort()) {
      // Team's company-expanded grants are deliberately not sufficient to read plans.
      const source = await this.team.workScope(client, actor, sourceId);
      if ((!conversationId && source.legalEntityId !== scope.legalEntityId) || source.personalDataVisible !== true)
        throw new ForbiddenException('Нет доступа к исходным планам выбранной области отчёта.');
      result.push(source);
    }
    return result;
  }
  async build(client, actor, sources, businessDate, options = {}) {
    return require('../planning/planning-daily-report').buildDailyReport(client, actor, sources, businessDate, options);
  }
  async report(client, actor, scope, input) {
    const sources = await this.sourceScopes(client, actor, scope, input.sourceScopeIds, input.conversationId);
    return this.build(client, actor, sources, input.businessDate, { publicAudience: true });
  }
  async target(client, actor, scope, conversationId) {
    const row = (await client.query('SELECT * FROM team_conversations WHERE id=$1', [conversationId])).rows[0];
    if (!row) throw new ForbiddenException('Нет доступа к выбранному каналу отчётов.');
    const granted = await this.team.workScope(client, actor, row.responsibility_scope_id);
    if (granted.legalEntityId !== scope.legalEntityId) throw new ForbiddenException('Выберите область компании, которой принадлежит канал отчётов.');
    if (row.kind !== 'channel' || row.deleted_at || row.archived_at || row.visibility !== 'public')
      blocked('FLEET_REPORT_CHANNEL_UNAVAILABLE', 'Канал «Отчеты» закрыт, удалён или находится в архиве. Проверьте канал перед публикацией.');
    return row;
  }
  async conversation(client, actor, scope, existingMessage, conversationId) {
    let row;
    if (conversationId) {
      row = await this.target(client, actor, scope, conversationId);
      if (existingMessage && existingMessage.conversation_id !== conversationId)
        blocked('FLEET_REPORT_TARGET_CONFLICT', 'Отчёт за эту дату уже опубликован в другом канале компании. Обновите его в исходном канале.');
    } else if (existingMessage) {
      row = (await client.query('SELECT * FROM team_conversations WHERE id=$1 AND legal_entity_id=$2', [existingMessage.conversation_id, scope.legalEntityId])).rows[0];
    } else {
      // Reuse an ordinary company channel, including its original scope tuple.
      // A closed/archive channel with this name is an intentional access decision.
      const rows = (await client.query(`SELECT * FROM team_conversations WHERE legal_entity_id=$1 AND kind='channel'
        AND replace(lower(btrim(title)),'ё','е')='отчеты' ORDER BY
        CASE WHEN deleted_at IS NULL AND archived_at IS NULL AND visibility='public' THEN 0 ELSE 1 END,sort_order,id`, [scope.legalEntityId])).rows;
      row = rows[0];
      if (!row) {
        const conversationId = stableId(`channel:${scope.legalEntityId}`);
        // A deterministically identified deleted channel must never be recreated.
        row = (await client.query('SELECT * FROM team_conversations WHERE id=$1', [conversationId])).rows[0];
        if (!row) {
          await this.team.lockScope(client, scope);
          row = (await client.query(`INSERT INTO team_conversations(id,legal_entity_id,region_id,project_id,responsibility_scope_id,kind,title,created_by,visibility)
            VALUES($1,$2,$3,$4,$5,'channel','Отчеты',$6,'public') RETURNING *`, [conversationId, ...tuple(scope), actor.id])).rows[0];
          await client.query(`INSERT INTO team_conversation_originals(conversation_id,legal_entity_id,region_id,project_id,responsibility_scope_id,payload)
            VALUES($1,$2,$3,$4,$5,$6::jsonb)`, [conversationId, ...tuple(scope), JSON.stringify({ kind: 'channel', title: 'Отчеты', visibility: 'public', memberIds: [] })]);
          await this.team.auditWrite(client, actor, scope, null, 'team.conversation.created', 'team_conversations', conversationId,
            { kind: 'channel', visibility: 'public', memberIds: [], source: 'fleet_release' });
        }
      }
    }
    if (!row || row.kind !== 'channel' || row.legal_entity_id !== scope.legalEntityId || row.deleted_at || row.archived_at || row.visibility !== 'public')
      blocked('FLEET_REPORT_CHANNEL_UNAVAILABLE', 'Канал «Отчеты» закрыт, удалён или находится в архиве. Проверьте канал перед публикацией.');
    await this.team.lockScope(client, channelScope(row));
    return row;
  }
  async publish(client, actor, scope, input, correlationId, { replace = true } = {}) {
    const sources = await this.sourceScopes(client, actor, scope, input.sourceScopeIds, input.conversationId);
    // Share the lifecycle lock order: company order, scope, message. This also
    // serializes two API replicas and reuse/create of the company's channel.
    await this.team.lockRecord(client, 'channel-order', scope.legalEntityId);
    const messageId = stableId(`message:${scope.legalEntityId}:${input.businessDate}`);
    let old = (await client.query('SELECT * FROM team_messages WHERE id=$1', [messageId])).rows[0];
    if (old?.deleted_at) blocked('FLEET_REPORT_DELETED', 'Отчёт за эту дату удалён. Автоматическая публикация не восстанавливает удалённые сообщения.');
    if (old && old.legal_entity_id !== scope.legalEntityId) blocked('FLEET_REPORT_CONFLICT', 'Идентификатор отчёта уже использован.');
    const report = await this.build(client, actor, sources, input.businessDate, { publicAudience: true });
    if (typeof report.text !== 'string' || !report.text.trim() || report.text.length > 12000)
      throw new BadRequestException('Текст отчёта должен содержать от 1 до 12 000 символов.');
    const conversation = await this.conversation(client, actor, scope, old, input.conversationId), targetScope = channelScope(conversation);
    await this.team.lockRecord(client, 'message', messageId);
    // Interactive message edits use scope/message locks rather than the company
    // publication lock, so refresh after joining that same lock order.
    old = (await client.query('SELECT * FROM team_messages WHERE id=$1', [messageId])).rows[0];
    if (old?.deleted_at) blocked('FLEET_REPORT_DELETED', 'Отчёт за эту дату удалён. Автоматическая публикация не восстанавливает удалённые сообщения.');
    const conversationId = conversation.id;
    if (old && (!replace || old.text === report.text)) return { conversationId, messageId, responsibilityScopeId: targetScope.responsibilityScopeId, report, unchanged: true };
    if (!old) {
      await client.query(`INSERT INTO team_messages(id,legal_entity_id,region_id,project_id,responsibility_scope_id,conversation_id,text,author_id,author_name)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [messageId, ...tuple(targetScope), conversationId, report.text, actor.id, actor.displayName]);
      await client.query(`INSERT INTO team_message_originals(message_id,legal_entity_id,region_id,project_id,responsibility_scope_id,conversation_id,payload)
        VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)`, [messageId, ...tuple(targetScope), conversationId,
        JSON.stringify({ conversationId, parentId: null, text: report.text, mentions: { userIds: [], all: false }, attachments: [] })]);
    } else {
      await client.query(`UPDATE team_messages SET text=$2,version=version+1,edited_at=clock_timestamp(),edited_by=$3,
        change_seq=nextval('team_message_change_sequence') WHERE id=$1`, [messageId, report.text, actor.id]);
      await this.team.recordControlOperation(client, actor, targetScope, conversationId, messageId, randomUUID(), 'edit',
        { version: old.version, text: report.text, mentions: { userIds: old.mention_user_ids, all: old.mention_all } });
    }
    await client.query('UPDATE team_conversations SET updated_at=clock_timestamp() WHERE id=$1', [conversationId]);
    await this.team.auditWrite(client, actor, targetScope, correlationId, old ? 'team.message.edited' : 'team.message.created', 'team_messages', messageId,
      { source: 'fleet_release', businessDate: input.businessDate, sourceScopeIds: sources.map(source => source.responsibilityScopeId),
        automaticSources: !input.sourceScopeIds?.length,
        conversationId, version: old ? old.version + 1 : 1, authorId: old?.author_id || actor.id });
    return { conversationId, messageId, responsibilityScopeId: targetScope.responsibilityScopeId, report, unchanged: false };
  }
}
module.exports = { TeamFleetReports, stableId };
