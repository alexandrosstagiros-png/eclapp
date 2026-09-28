// SPDX-License-Identifier: MIT
"use strict";
const { randomUUID } = require('node:crypto');
const { Injectable, Inject, UnauthorizedException, HttpException } = require('@nestjs/common');
const { DatabaseService } = require('../../platform/database.service');
const { IdentityRepository } = require('../identity-access/infrastructure/identity.repository');
const { AuditService } = require('../audit/application/audit.service');
const { fail, conflict, forbidden, unavailable, object, uuid, conversationInput, conversationAccessInput, channelManagementInput, messageInput, articleInput, messageControlInput, reactionInput, moderationInput, messageReadInput, notificationPreferencesInput, REACTION_EMOJI } = require('./team-input');
const { articleImportId, articleImportInput, articleDeletionInput } = require('./team-knowledge-input');
const { knowledgeArticleKey, deduplicateKnowledgeArticles } = require('./team-knowledge-deduplication');
const ROLES = Object.freeze(['dispatcher', 'manager', 'recruiter', 'tender_specialist', 'document_specialist', 'mechanic', 'access_admin', 'auditor']);
const SCOPE_COLUMNS = Object.freeze({ legalEntityId: 'legal_entity_id', regionId: 'region_id', projectId: 'project_id', responsibilityScopeId: 'responsibility_scope_id' });
const POLICY = Object.freeze({ administratorCanReadDirectMessages: true, auditedAdministratorReads: true,
  text: 'Это корпоративная среда. Открытые каналы доступны сотрудникам компании. Только администратор ограничивает видимость каналов и выбирает участников. Администратор компании может читать закрытые каналы и личные чаты, включать переписку в сводки и явно делиться сводками с сотрудниками. Просмотр администратором закрытых каналов и личных чатов без своего участия фиксируется в журнале аудита.' });
const MESSAGE_COLUMNS = 'id,conversation_id AS "conversationId",parent_id AS "parentId",text,author_id AS "authorId",author_name AS "authorName",created_at AS "createdAt",json_build_object(\'userIds\',mention_user_ids,\'all\',mention_all) AS mentions,version,edited_at AS "editedAt",edited_by AS "editedBy",deleted_at AS "deletedAt",deleted_by AS "deletedBy",change_seq::text AS "changeCursor"';
const ARTICLE_COLUMNS = `id,title,body,version,author_id AS "authorId",author_name AS "authorName",created_at AS "createdAt",updated_at AS "updatedAt",
  updated_by AS "updatedById",(SELECT display_name FROM users WHERE users.id=team_articles.updated_by) AS "updatedByName",structured,reason,purpose,result,
  coalesce((SELECT json_agg(json_build_object('id',position_id,'title',position_title) ORDER BY position_id)
    FROM team_article_audience_positions WHERE article_id=team_articles.id),'[]'::json) AS "audiencePositions"`;
const ADAPTATION_FOLDERS = Object.freeze(['Общая информация', 'Папка сотрудника компании']);
function tuple(scope) { return Object.keys(SCOPE_COLUMNS).map(key => scope[key]); }
function whereScope(first = 1, alias = '') { return Object.values(SCOPE_COLUMNS).map((column, index) => `${alias ? `${alias}.` : ''}${column}=$${first + index}`).join(' AND '); }
function response(row) { return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value instanceof Date ? value.toISOString() : value])); }
function canManage(actor) { return actor.role === 'access_admin' && !actor.impersonation; }
function publicAuthored(row, actor, scope) {
  const result = response(row);
  if (!scope.personalDataVisible && result.authorId !== actor.id) result.authorName = 'Сотрудник';
  if ('conversationId' in result && 'version' in result) {
    result.canEdit = result.canDelete = !result.deletedAt && !result.conversationArchivedAt && (result.authorId === actor.id || canManage(actor));
    if (result.deletedAt) {
      result.text = '';
      result.attachments = [];
      result.mentions = { userIds: [], all: false };
      result.reactions = [];
      result.isUnread = result.isUnreadMention = result.requiresReadReceipt = false;
      delete result.delivery;
    }
  }
  delete result.conversationArchivedAt;
  return result;
}
function attachmentMetadata(file) {
  return { id: file.id, filename: file.filename, mimeType: file.mimeType, byteSize: file.byteSize, sha256: file.sha256,
    ...(file.kind && file.kind !== 'file' ? { kind: file.kind } : {}) };
}
function originalMessagePayload(input) {
  return { conversationId: input.conversationId, parentId: input.parentId, text: input.text, mentions: input.mentions, attachments: input.attachments.map(attachmentMetadata) };
}
function articleVisible(actor, imported) {
  return !imported || imported.visibility === 'scope' || (imported.visibility === 'staff' && actor.role !== 'driver') ||
    (imported.visibility === 'admin' && canManage(actor));
}
function publicArticle(row, actor, scope, imported, permissions = { canEdit: canManage(actor) }) {
  const result = publicAuthored(row, actor, scope);
  delete result.deletedAt;
  if (result.updatedById === result.authorId) result.updatedByName = null;
  else if (!scope.personalDataVisible && result.updatedById !== actor.id) result.updatedByName = 'Сотрудник';
  return { ...result, audiencePositionIds: (result.audiencePositions || []).map(position => position.id), folderPath: imported?.folderPath || '', visibility: imported?.visibility || 'scope',
    sourceFile: imported ? { filename: imported.filename, mimeType: imported.mimeType, byteSize: imported.byteSize, sha256: imported.sha256 } : null,
    canEdit: Boolean(!row.deletedAt && permissions.canEdit && articleVisible(actor, imported)), canDelete: !row.deletedAt && canManage(actor) };
}
function conversationSelect() {
  return `c.id,c.title,c.kind,c.visibility,c.version,c.created_by AS "createdBy",c.updated_at AS "updatedAt",
    c.sort_order AS "sortOrder",c.archived_at AS "archivedAt",c.deleted_at AS "deletedAt",
    c.legal_entity_id AS "legalEntityId",c.region_id AS "regionId",c.project_id AS "projectId",c.responsibility_scope_id AS "responsibilityScopeId",
    ARRAY(SELECT m.user_id FROM team_members m WHERE m.conversation_id=c.id ORDER BY m.user_id) AS "memberIds",
    (SELECT json_build_object('mode',mode,'enabledUntil',enabled_until,'active',enabled_until>clock_timestamp())
      FROM team_conversation_moderation WHERE conversation_id=c.id) AS moderation`;
}
function publicConversation(row, actor) {
  const result = response(row);
  return { ...result, sortOrder: Number(result.sortOrder), canManageChannel: result.kind === 'channel' && !result.deletedAt && canManage(actor),
    canManageAccess: result.kind === 'channel' && !result.deletedAt && canManage(actor),
    canPost: !result.archivedAt && !result.deletedAt && (result.visibility === 'public' || result.memberIds.includes(actor.id)),
    moderation: { mode: 'interval', intervalSeconds: 300, enabledUntil: result.moderation?.enabledUntil || null, active: Boolean(result.moderation?.active), canManage: canManage(actor) } };
}
class TeamService {
  constructor(database, identity, audit) { this.database = database; this.identity = identity; this.audit = audit; }
  async current(client, supplied) {
    await this.identity.lockUsers(client, [supplied.id, supplied.impersonation?.administratorId].filter(Boolean));
    const actor = await this.identity.actorBySession(client, supplied.sessionId);
    if (!actor || actor.id !== supplied.id || actor.authVersion !== supplied.authVersion || actor.role !== supplied.role)
      throw new UnauthorizedException('Сессия недействительна.');
    if (!ROLES.includes(actor.role)) forbidden('Корпоративная среда недоступна для вашей роли.');
    // Team is a company workspace. Derive its access from current company grants
    // without changing identity grants or permissions in operational modules.
    return this.companyActor(client, actor);
  }
  async companyActor(client, actor) {
    const sourceGrants = actor.sourceGrants || actor.grants;
    const legalEntityIds = [...new Set(sourceGrants.map(grant => grant.legalEntityId))];
    const found = await client.query(`SELECT p.legal_entity_id AS "legalEntityId",p.region_id AS "regionId",p.id AS "projectId",
      rs.id AS "responsibilityScopeId" FROM responsibility_scopes rs JOIN projects p ON p.id=rs.project_id
      WHERE p.legal_entity_id=ANY($1::uuid[]) ORDER BY p.legal_entity_id,p.id,rs.id`, [legalEntityIds]);
    return { ...actor, sourceGrants, grants: found.rows.map(scope => {
      const companyGrants = sourceGrants.filter(grant => grant.legalEntityId === scope.legalEntityId);
      return { ...scope, financeVisible: false, personalDataVisible: companyGrants.some(grant => grant.personalDataVisible) };
    }) };
  }
  async selectedScopes(client, actor, scopeId) {
    return scopeId == null || scopeId === '' ? actor.grants : [await this.scope(client, actor, uuid(scopeId, 'область работы'))];
  }
  async scope(client, actor, id) {
    const found = await client.query(`SELECT p.legal_entity_id AS "legalEntityId",p.region_id AS "regionId",p.id AS "projectId",
      rs.id AS "responsibilityScopeId" FROM responsibility_scopes rs JOIN projects p ON p.id=rs.project_id WHERE rs.id=$1`, [id]);
    const canonical = found.rows[0];
    const scope = canonical && actor.grants.find(grant => tuple(grant).every((value, index) => value === tuple(canonical)[index]));
    if (!scope) forbidden();
    return scope;
  }
  async workScope(client, actor, id) {
    return this.scope(client, { ...actor, grants: actor.sourceGrants || actor.grants }, id);
  }
  async workPeopleRows(client, actor, scope) {
    const result = await client.query(`SELECT u.id,u.display_name AS "displayName",u.role FROM users u
      JOIN access_grants g ON g.user_id=u.id WHERE ${whereScope(1, 'g')}
      AND u.active AND u.approved AND u.role=ANY($5::text[]) ORDER BY u.display_name,u.id`, [...tuple(scope), ROLES]);
    return result.rows.map(row => ({ ...row, displayName: scope.personalDataVisible || row.id === actor.id ? row.displayName : `Сотрудник · ${row.id.slice(-6)}` }));
  }
  async lockScope(client, scope) {
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,917042041))', [`scope:${JSON.stringify(tuple(scope))}`]);
  }
  async lockRecord(client, type, id) {
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,917042041))', [`record:${type}:${id}`]);
  }
  async auditWrite(client, actor, scope, correlationId, action, entityType, entityId, metadata) {
    await this.audit.append(client, { actorId: actor.id, channel: actor.channel, correlationId: correlationId || randomUUID(), action, entityType, entityId,
      scope: Object.fromEntries(Object.keys(SCOPE_COLUMNS).map(key => [key, scope[key]])), metadata });
  }
  async context(supplied) {
    return this.database.transaction(async client => {
      const actor = await this.current(client, supplied);
      const result = await client.query(`SELECT p.legal_entity_id AS "legalEntityId",p.region_id AS "regionId",p.id AS "projectId",
        rs.id AS "responsibilityScopeId",le.name AS "legalEntityName",r.name AS "regionName",r.time_zone AS "timeZone",
        p.name AS "projectName",rs.name AS "scopeName" FROM responsibility_scopes rs JOIN projects p ON p.id=rs.project_id
        JOIN legal_entities le ON le.id=p.legal_entity_id JOIN regions r ON r.id=p.region_id
        WHERE rs.id=ANY($1::uuid[]) ORDER BY le.name,r.name,p.name,rs.name,rs.id`, [actor.grants.map(grant => grant.responsibilityScopeId)]);
      const scopes = result.rows.map(response);
      return { scopes, workScopes: scopes.filter(scope => actor.sourceGrants.some(grant => grant.responsibilityScopeId === scope.responsibilityScopeId))
        .map(scope => ({ ...scope, personalDataVisible: actor.sourceGrants.some(grant => grant.responsibilityScopeId === scope.responsibilityScopeId && grant.personalDataVisible) })),
        defaultResponsibilityScopeId: scopes[0]?.responsibilityScopeId || null, companyMode: true, canManage: canManage(actor), policy: POLICY };
    });
  }
  async peopleRows(client, actor, scope) {
    const result = await client.query(`SELECT DISTINCT u.id,u.display_name AS "displayName",u.role,
      ARRAY(SELECT own.responsibility_scope_id FROM access_grants own WHERE own.user_id=u.id AND own.legal_entity_id=$1 ORDER BY own.responsibility_scope_id) AS "workResponsibilityScopeIds" FROM users u
      JOIN access_grants g ON g.user_id=u.id WHERE g.legal_entity_id=$1
      AND u.active AND u.approved AND u.role=ANY($2::text[]) ORDER BY u.display_name,u.id`, [scope.legalEntityId, ROLES]);
    return result.rows.map(row => ({ ...row, displayName: scope.personalDataVisible || row.id === actor.id ? row.displayName : `Сотрудник · ${row.id.slice(-6)}` }));
  }
  async people(supplied, scopeId) {
    return this.database.transaction(async client => {
      const actor = await this.current(client, supplied);
      const scopes = await this.selectedScopes(client, actor, scopeId), people = new Map();
      for (const legalEntityId of new Set(scopes.map(scope => scope.legalEntityId))) {
        const scope = scopes.find(candidate => candidate.legalEntityId === legalEntityId);
        for (const person of await this.peopleRows(client, actor, scope)) {
          const previous = people.get(person.id);
          people.set(person.id, { ...person, legalEntityIds: [...(previous?.legalEntityIds || []), legalEntityId],
            workResponsibilityScopeIds: [...(previous?.workResponsibilityScopeIds || []), ...person.workResponsibilityScopeIds],
            responsibilityScopeIds: [...(previous?.responsibilityScopeIds || []), ...actor.grants.filter(grant => grant.legalEntityId === legalEntityId).map(grant => grant.responsibilityScopeId)] });
        }
      }
      return { people: [...people.values()].sort((a, b) => a.displayName.localeCompare(b.displayName) || a.id.localeCompare(b.id)) };
    });
  }
  async withConversationState(client, actor, scope, rows) {
    if (!rows.length) return [];
    const states = await client.query(`SELECT c.id,coalesce(s.last_read_cursor,0)::text AS "readCursor",s.last_read_at AS "lastReadAt",
      json_build_object('muteNotifications',coalesce(s.mute_notifications,false),'muteSound',coalesce(s.mute_sound,false)) AS "notificationPreferences",
      json_build_object('muteNotifications',coalesce(s.mute_notifications,false) OR coalesce(g.mute_notifications,false),
        'muteSound',coalesce(s.mute_sound,false) OR coalesce(g.mute_sound,false)) AS "effectiveNotificationPreferences",
      counts.unread_count AS "unreadCount",counts.mention_count AS "unreadMentionCount"
      FROM team_conversations c
      LEFT JOIN team_conversation_user_state s ON s.conversation_id=c.id AND s.user_id=$2
      LEFT JOIN team_notification_preferences g ON g.user_id=$2
      LEFT JOIN LATERAL (SELECT count(*) FILTER(WHERE r.message_id IS NULL)::integer AS unread_count,
          count(*) FILTER(WHERE n.message_id IS NOT NULL AND n.read_at IS NULL)::integer AS mention_count
        FROM team_messages m LEFT JOIN team_message_reads r ON r.message_id=m.id AND r.user_id=$2
        LEFT JOIN team_message_mentions n ON n.message_id=m.id AND n.user_id=$2 AND n.message_version=m.version
        WHERE m.conversation_id=c.id AND m.deleted_at IS NULL AND m.author_id<>$2 AND c.archived_at IS NULL AND c.deleted_at IS NULL) counts ON true
      WHERE c.id=ANY($1::uuid[])`, [rows.map(row => row.id), actor.id]);
    const byId = new Map(states.rows.map(row => [row.id, row]));
    return rows.map(row => ({ ...row, ...byId.get(row.id) }));
  }
  async notificationPreferences(supplied) {
    return this.database.transaction(async client => {
      const actor = await this.current(client, supplied);
      const result = await client.query('SELECT mute_notifications AS "muteNotifications",mute_sound AS "muteSound" FROM team_notification_preferences WHERE user_id=$1', [actor.id]);
      return result.rows[0] || { muteNotifications: false, muteSound: false };
    });
  }
  async setNotificationPreferences(supplied, body) {
    return this.database.transaction(async client => {
      const actor = await this.current(client, supplied), input = notificationPreferencesInput(body);
      const result = await client.query(`INSERT INTO team_notification_preferences(user_id,mute_notifications,mute_sound) VALUES($1,$2,$3)
        ON CONFLICT(user_id) DO UPDATE SET mute_notifications=EXCLUDED.mute_notifications,mute_sound=EXCLUDED.mute_sound
        RETURNING mute_notifications AS "muteNotifications",mute_sound AS "muteSound"`, [actor.id, input.muteNotifications, input.muteSound]);
      return result.rows[0];
    });
  }
  async setConversationNotificationPreferences(supplied, idValue, body) {
    return this.database.transaction(async client => {
      const actor = await this.current(client, supplied), input = notificationPreferencesInput(body, true);
      const scope = await this.scope(client, actor, input.responsibilityScopeId), id = uuid(idValue, 'чат');
      await this.lockScope(client, scope);
      await this.reference(client, actor, scope, id);
      await client.query(`INSERT INTO team_conversation_user_state(user_id,conversation_id,legal_entity_id,region_id,project_id,responsibility_scope_id,mute_notifications,mute_sound)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(user_id,conversation_id) DO UPDATE
        SET mute_notifications=EXCLUDED.mute_notifications,mute_sound=EXCLUDED.mute_sound`, [actor.id, id, ...tuple(scope), input.muteNotifications, input.muteSound]);
      return publicConversation(await this.reference(client, actor, scope, id), actor);
    });
  }
  async acknowledgeMessages(client, actor, scope, conversationId, messages) {
    // An explicit list is essential: a visible root never acknowledges hidden replies.
    const ids = messages.map(message => message.id);
    const found = await client.query(`SELECT id,version,change_seq::text AS cursor FROM team_messages
      WHERE ${whereScope()} AND conversation_id=$5 AND id=ANY($6::uuid[])`, [...tuple(scope), conversationId, ids]);
    if (found.rowCount !== messages.length) unavailable();
    const versions = new Map(messages.map(message => [message.id, message.version]));
    if (found.rows.some(message => message.version !== versions.get(message.id))) conflict('Сообщение изменилось. Обновите его перед отметкой о прочтении.');
    const receipts = await client.query(`INSERT INTO team_message_reads(user_id,message_id,legal_entity_id,region_id,project_id,responsibility_scope_id,conversation_id,message_version)
      SELECT $7,m.id,m.legal_entity_id,m.region_id,m.project_id,m.responsibility_scope_id,m.conversation_id,m.version
      FROM team_messages m JOIN team_conversations c ON c.id=m.conversation_id
      WHERE ${whereScope(1, 'm')} AND m.conversation_id=$5 AND m.id=ANY($6::uuid[]) AND m.author_id<>$7 AND m.deleted_at IS NULL
        AND (c.visibility='public' OR EXISTS(SELECT 1 FROM team_members member WHERE member.conversation_id=c.id AND member.user_id=$7))
      ON CONFLICT(user_id,message_id) DO UPDATE SET message_version=EXCLUDED.message_version
      WHERE team_message_reads.message_version<EXCLUDED.message_version RETURNING message_id`, [...tuple(scope), conversationId, ids, actor.id]);
    const mentions = await client.query(`UPDATE team_message_mentions n SET read_at=clock_timestamp() FROM team_messages m
      WHERE ${whereScope(1, 'n')} AND n.conversation_id=$5 AND n.message_id=ANY($6::uuid[]) AND n.user_id=$7 AND n.read_at IS NULL
        AND m.id=n.message_id AND m.version=n.message_version`, [...tuple(scope), conversationId, ids, actor.id]);
    const cursor = found.rows.reduce((maximum, message) => BigInt(message.cursor) > maximum ? BigInt(message.cursor) : maximum, 0n).toString();
    await client.query(`INSERT INTO team_conversation_user_state(user_id,conversation_id,legal_entity_id,region_id,project_id,responsibility_scope_id,last_read_cursor,last_read_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,clock_timestamp()) ON CONFLICT(user_id,conversation_id) DO UPDATE
      SET last_read_cursor=greatest(team_conversation_user_state.last_read_cursor,EXCLUDED.last_read_cursor),
        last_read_at=CASE WHEN $8::boolean OR EXCLUDED.last_read_cursor>team_conversation_user_state.last_read_cursor
          THEN EXCLUDED.last_read_at ELSE team_conversation_user_state.last_read_at END`,
    [actor.id, conversationId, ...tuple(scope), cursor, Boolean(receipts.rowCount || mentions.rowCount)]);
  }
  async readConversation(supplied, idValue, body, correlationId) {
    return this.database.transaction(async client => {
      const actor = await this.current(client, supplied), input = messageReadInput(body);
      const scope = await this.scope(client, actor, input.responsibilityScopeId), id = uuid(idValue, 'чат');
      await this.lockScope(client, scope);
      const conversation = await this.reference(client, actor, scope, id);
      await this.acknowledgeMessages(client, actor, scope, id, input.messages);
      if (conversation.visibility === 'private' && !conversation.memberIds.includes(actor.id))
        await this.auditWrite(client, actor, scope, correlationId, conversation.kind === 'direct' ? 'team.direct.admin_read' : 'team.channel.admin_read',
          'team_conversations', id, { source: 'read_acknowledgment', messageCount: input.messages.length, memberIds: conversation.memberIds });
      return publicConversation(await this.reference(client, actor, scope, id), actor);
    });
  }
  async unread(supplied, scopeId, correlationId) {
    return this.database.transaction(async client => {
      const actor = await this.current(client, supplied), scopes = await this.selectedScopes(client, actor, scopeId);
      for (const scope of scopes) await this.lockScope(client, scope);
      const scopeById = new Map(scopes.map(scope => [scope.responsibilityScopeId, scope]));
      const found = await client.query(`SELECT m.responsibility_scope_id AS "responsibilityScopeId",m.id AS "messageId",m.conversation_id AS "conversationId",m.parent_id AS "parentId",m.text,
        m.author_id AS "authorId",m.author_name AS "authorName",m.version,m.created_at AS "createdAt",m.change_seq::text AS "changeCursor",
        (r.message_id IS NULL) AS "isUnread",(n.message_id IS NOT NULL AND n.read_at IS NULL) AS "isUnreadMention",
        (n.message_id IS NOT NULL AND n.read_at IS NULL) AS "isMention",
        (count(*) FILTER(WHERE r.message_id IS NULL) OVER())::integer AS "totalUnreadCount",
        (count(*) FILTER(WHERE n.message_id IS NOT NULL AND n.read_at IS NULL) OVER())::integer AS "totalUnreadMentionCount",c.title AS "conversationTitle",c.kind,c.visibility,
        ARRAY(SELECT user_id FROM team_members WHERE conversation_id=c.id) AS "memberIds"
        FROM team_messages m JOIN team_conversations c ON c.id=m.conversation_id
        LEFT JOIN team_message_reads r ON r.message_id=m.id AND r.user_id=$2
        LEFT JOIN team_message_mentions n ON n.message_id=m.id AND n.user_id=$2 AND n.message_version=m.version
        WHERE m.responsibility_scope_id=ANY($1::uuid[]) AND m.deleted_at IS NULL AND m.author_id<>$2 AND c.archived_at IS NULL AND c.deleted_at IS NULL
          AND (r.message_id IS NULL OR (n.message_id IS NOT NULL AND n.read_at IS NULL))
          AND ((c.kind='channel' AND c.visibility='public') OR $3::boolean OR EXISTS(
            SELECT FROM team_members member WHERE member.conversation_id=c.id AND member.user_id=$2))
        ORDER BY m.change_seq DESC,m.id LIMIT 101`, [scopes.map(scope => scope.responsibilityScopeId), actor.id, canManage(actor)]);
      const rows = found.rows.slice(0, 100), ids = [...new Set(rows.map(row => row.conversationId))];
      const states = new Map((await this.withConversationState(client, actor, null, ids.map(id => ({ id })))).map(row => [row.id, row]));
      for (const conversationId of ids) {
        const row = rows.find(message => message.conversationId === conversationId);
        if (row.visibility === 'private' && !row.memberIds.includes(actor.id)) await this.auditWrite(client, actor, scopeById.get(row.responsibilityScopeId), correlationId,
          row.kind === 'direct' ? 'team.direct.admin_read' : 'team.channel.admin_read', 'team_conversations', conversationId,
          { source: 'unread_feed', memberIds: row.memberIds });
      }
      const tasks = new Map();
      for (const scope of scopes) for (const [id, task] of await require('./team-organization-tasks').taskMessageMetadata(client, actor, scope, rows.filter(row => row.responsibilityScopeId === scope.responsibilityScopeId).map(row => row.messageId))) tasks.set(id, task);
      return { totalUnreadCount: found.rows[0]?.totalUnreadCount || 0, totalUnreadMentionCount: found.rows[0]?.totalUnreadMentionCount || 0, notifications: rows.map(row => {
        const { kind, visibility, memberIds, totalUnreadCount, totalUnreadMentionCount, ...message } = publicAuthored(row, actor, scopeById.get(row.responsibilityScopeId)), state = states.get(row.conversationId);
        return { ...message, ...tasks.get(row.messageId), notificationId: row.isMention ? `mention:${row.messageId}:${row.version}` : `message:${row.messageId}`,
          notificationPreferences: state.notificationPreferences, effectiveNotificationPreferences: state.effectiveNotificationPreferences,
          shouldNotify: row.isMention || !state.effectiveNotificationPreferences.muteNotifications,
          shouldPlaySound: row.isMention || !state.effectiveNotificationPreferences.muteSound };
      }), hasMore: found.rows.length > 100 };
    });
  }
  async conversations(supplied, scopeId, correlationId) {
    return this.database.transaction(async client => {
      const actor = await this.current(client, supplied);
      const scopes = await this.selectedScopes(client, actor, scopeId);
      for (const scope of scopes) await this.lockScope(client, scope);
      const result = await client.query(`SELECT ${conversationSelect()} FROM team_conversations c
        WHERE c.responsibility_scope_id=ANY($1::uuid[]) AND c.deleted_at IS NULL AND ((c.kind='channel' AND c.visibility='public') OR $2::boolean OR EXISTS(
          SELECT 1 FROM team_members m WHERE m.conversation_id=c.id AND m.user_id=$3))
        ORDER BY CASE WHEN c.kind='channel' THEN 0 ELSE 1 END,CASE WHEN c.kind='channel' THEN c.sort_order END,c.updated_at DESC,c.id`, [scopes.map(scope => scope.responsibilityScopeId), canManage(actor), actor.id]);
      for (const row of result.rows) if (row.visibility === 'private' && !row.memberIds.includes(actor.id))
        await this.auditWrite(client, actor, row, correlationId, row.kind === 'direct' ? 'team.direct.admin_read' : 'team.channel.admin_read', 'team_conversations', row.id, { source: 'conversation_list', memberIds: row.memberIds });
      return { conversations: (await this.withConversationState(client, actor, null, result.rows)).map(row => publicConversation(row, actor)), canManage: canManage(actor) };
    });
  }
  async reference(client, actor, scope, id, includeDeleted = false) {
    const result = await client.query(`SELECT ${conversationSelect()} FROM team_conversations c
      WHERE ${whereScope(1, 'c')} AND c.id=$5 ${includeDeleted && canManage(actor) ? '' : 'AND c.deleted_at IS NULL'} AND ((c.kind='channel' AND c.visibility='public') OR $6::boolean OR EXISTS(
        SELECT 1 FROM team_members m WHERE m.conversation_id=c.id AND m.user_id=$7))`, [...tuple(scope), id, canManage(actor), actor.id]);
    if (!result.rowCount) unavailable();
    return (await this.withConversationState(client, actor, scope, result.rows))[0];
  }
  async createConversation(supplied, body, correlationId) {
    return this.database.transaction(async client => {
      const actor = await this.current(client, supplied);
      const input = conversationInput(body);
      const scope = await this.scope(client, actor, input.responsibilityScopeId);
      if (input.kind === 'channel' && input.visibility === 'private' && !canManage(actor)) forbidden('Закрывать каналы и выбирать участников может только администратор.');
      if (input.kind === 'direct' && !input.memberIds.includes(actor.id)) forbidden('Создатель должен участвовать в личном чате.');
      await this.lockScope(client, scope);
      await this.lockRecord(client, 'conversation', input.id);
      const found = await client.query(`SELECT ${conversationSelect()},c.legal_entity_id AS "legalEntityId",c.region_id AS "regionId",
        c.project_id AS "projectId",c.responsibility_scope_id AS "responsibilityScopeId" FROM team_conversations c WHERE c.id=$1`, [input.id]);
      const existing = found.rows[0];
      const payload = { kind: input.kind, title: input.title, visibility: input.visibility, memberIds: input.memberIds };
      if (existing) {
        if (tuple(existing).some((value, index) => value !== tuple(scope)[index]) || existing.createdBy !== actor.id) conflict('Идентификатор чата уже использован.');
        const original = await client.query('SELECT payload=$2::jsonb AS matches FROM team_conversation_originals WHERE conversation_id=$1', [input.id, JSON.stringify(payload)]);
        if (!original.rows[0]?.matches) conflict('Идентификатор чата уже использован с другими данными.');
        return publicConversation(await this.reference(client, actor, scope, input.id), actor);
      }
      const members = await this.peopleRows(client, actor, scope);
      if (input.memberIds.some(id => !members.some(person => person.id === id))) forbidden('Участник должен быть действующим сотрудником компании.');
      await client.query(`INSERT INTO team_conversations(id,legal_entity_id,region_id,project_id,responsibility_scope_id,kind,title,created_by,visibility)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [input.id, ...tuple(scope), input.kind, input.title, actor.id, input.visibility]);
      for (const memberId of input.memberIds) await client.query(`INSERT INTO team_members(conversation_id,legal_entity_id,region_id,project_id,responsibility_scope_id,user_id)
        VALUES($1,$2,$3,$4,$5,$6)`, [input.id, ...tuple(scope), memberId]);
      await client.query(`INSERT INTO team_conversation_originals(conversation_id,legal_entity_id,region_id,project_id,responsibility_scope_id,payload)
        VALUES($1,$2,$3,$4,$5,$6::jsonb)`, [input.id, ...tuple(scope), JSON.stringify(payload)]);
      await this.auditWrite(client, actor, scope, correlationId, 'team.conversation.created', 'team_conversations', input.id, { kind: input.kind, visibility: input.visibility, memberIds: input.memberIds });
      return publicConversation(await this.reference(client, actor, scope, input.id), actor);
    });
  }
  async setConversationAccess(supplied, idValue, body, correlationId) {
    return this.database.transaction(async client => {
      const actor = await this.current(client, supplied), input = conversationAccessInput(body);
      const scope = await this.scope(client, actor, input.responsibilityScopeId), id = uuid(idValue, 'канал');
      await this.lockRecord(client, 'channel-order', scope.legalEntityId);
      await this.lockScope(client, scope);
      await this.lockRecord(client, 'conversation', id);
      const conversation = await this.reference(client, actor, scope, id);
      if (conversation.kind !== 'channel') forbidden('Состав личного чата неизменяем. Создайте новый чат.');
      if (!canManage(actor)) forbidden('Доступ к каналу меняет только администратор.');
      const payload = { version: input.version, visibility: input.visibility, memberIds: input.memberIds };
      if (await this.existingControlOperation(client, actor, scope, id, null, input.operationId, 'access', payload)) return publicConversation(conversation, actor);
      if (conversation.version !== input.version) conflict('Доступ к каналу уже изменён. Обновите данные.');
      const eligible = new Set((await this.peopleRows(client, actor, scope)).map(person => person.id));
      if (input.memberIds.some(memberId => !eligible.has(memberId))) forbidden('Участник должен быть действующим сотрудником компании.');
      await client.query(`UPDATE team_conversations SET visibility=$6,version=version+1,updated_at=clock_timestamp() WHERE ${whereScope()} AND id=$5`, [...tuple(scope), id, input.visibility]);
      await client.query(`DELETE FROM team_members WHERE ${whereScope()} AND conversation_id=$5 AND NOT user_id=ANY($6::uuid[])`, [...tuple(scope), id, input.memberIds]);
      for (const memberId of input.memberIds) await client.query(`INSERT INTO team_members(conversation_id,legal_entity_id,region_id,project_id,responsibility_scope_id,user_id)
        VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(conversation_id,user_id) DO NOTHING`, [id, ...tuple(scope), memberId]);
      await this.recordControlOperation(client, actor, scope, id, null, input.operationId, 'access', payload);
      await this.auditWrite(client, actor, scope, correlationId, 'team.conversation.access_changed', 'team_conversations', id,
        { previousVisibility: conversation.visibility, visibility: input.visibility, previousMemberIds: conversation.memberIds, memberIds: input.memberIds, version: conversation.version + 1 });
      return publicConversation(await this.reference(client, actor, scope, id), actor);
    });
  }
  async setChannelLifecycle(supplied, idValue, body, correlationId) {
    return this.database.transaction(async client => {
      const actor = await this.current(client, supplied), input = channelManagementInput(body, 'lifecycle');
      if (!canManage(actor)) forbidden('Управлять каналами может только администратор.');
      const scope = await this.scope(client, actor, input.responsibilityScopeId), id = uuid(idValue, 'канал');
      // Company-wide order and lifecycle mutations share this lock. Message
      // writes use the scope lock, so an archive also serializes with sends.
      await this.lockRecord(client, 'channel-order', scope.legalEntityId);
      await this.lockScope(client, scope);
      await this.lockRecord(client, 'conversation', id);
      const conversation = await this.reference(client, actor, scope, id, true);
      if (conversation.kind !== 'channel') forbidden('Это действие доступно только для каналов.');
      const payload = { version: input.version, action: input.action }, action = `channel_${input.action}`;
      if (await this.existingControlOperation(client, actor, scope, id, null, input.operationId, action, payload))
        return { conversation: publicConversation(conversation, actor) };
      if (conversation.deletedAt) unavailable();
      if (conversation.version !== input.version) conflict('Канал уже изменён. Обновите данные.');
      if (input.action === 'archive' && conversation.archivedAt) conflict('Канал уже в архиве.');
      if (input.action === 'restore' && !conversation.archivedAt) conflict('Канал уже активен.');
      const assignments = input.action === 'delete' ? 'deleted_at=clock_timestamp(),deleted_by=$6'
        : input.action === 'archive' ? 'archived_at=clock_timestamp(),archived_by=$6' : 'archived_at=NULL,archived_by=NULL';
      await client.query(`UPDATE team_conversations SET ${assignments},version=version+1,updated_at=clock_timestamp()
        WHERE ${whereScope()} AND id=$5`, [...tuple(scope), id, ...(input.action === 'restore' ? [] : [actor.id])]);
      await this.recordControlOperation(client, actor, scope, id, null, input.operationId, action, payload);
      await this.auditWrite(client, actor, scope, correlationId, `team.channel.${input.action === 'archive' ? 'archived' : input.action === 'restore' ? 'restored' : 'deleted'}`,
        'team_conversations', id, { version: conversation.version + 1, wasArchived: Boolean(conversation.archivedAt) });
      return { conversation: publicConversation(await this.reference(client, actor, scope, id, true), actor) };
    });
  }
  async channelOrderRows(client, scope) {
    const result = await client.query(`SELECT id,responsibility_scope_id AS "responsibilityScopeId",sort_order AS "sortOrder",version
      FROM team_conversations WHERE legal_entity_id=$1 AND kind='channel' AND archived_at IS NULL AND deleted_at IS NULL
      ORDER BY sort_order,id FOR UPDATE`, [scope.legalEntityId]);
    return result.rows.map(row => ({ ...row, sortOrder: Number(row.sortOrder) }));
  }
  async setChannelOrder(supplied, idValue, body, correlationId) {
    return this.database.transaction(async client => {
      const actor = await this.current(client, supplied), input = channelManagementInput(body, 'order');
      if (!canManage(actor)) forbidden('Управлять каналами может только администратор.');
      const scope = await this.scope(client, actor, input.responsibilityScopeId), id = uuid(idValue, 'канал');
      await this.lockRecord(client, 'channel-order', scope.legalEntityId);
      await this.lockScope(client, scope);
      await this.lockRecord(client, 'conversation', id);
      const conversation = await this.reference(client, actor, scope, id);
      if (conversation.kind !== 'channel') forbidden('Это действие доступно только для каналов.');
      const payload = input.direction ? { version: input.version, direction: input.direction }
        : { version: input.version, targetId: input.targetId, targetVersion: input.targetVersion, placement: input.placement };
      if (await this.existingControlOperation(client, actor, scope, id, null, input.operationId, 'channel_order', payload))
        return { order: await this.channelOrderRows(client, scope) };
      if (conversation.version !== input.version) conflict('Порядок каналов уже изменён. Обновите данные.');
      if (conversation.archivedAt) conflict('Сначала верните канал из архива.');
      const order = await this.channelOrderRows(client, scope), index = order.findIndex(row => row.id === id);
      const desired = [...order];
      const [moving] = desired.splice(index, 1);
      let destination, neighbor;
      if (input.direction) {
        neighbor = order[index + (input.direction === 'up' ? -1 : 1)];
        destination = neighbor ? index + (input.direction === 'up' ? -1 : 1) : index;
      } else {
        if (input.targetId === id) fail('Выберите другой канал для перемещения.');
        const target = (await client.query(`SELECT kind,version,archived_at AS "archivedAt",deleted_at AS "deletedAt"
          FROM team_conversations WHERE legal_entity_id=$1 AND id=$2`, [scope.legalEntityId, input.targetId])).rows[0];
        if (!target || target.deletedAt) unavailable();
        if (target.kind !== 'channel') forbidden('Это действие доступно только для каналов.');
        if (target.archivedAt) conflict('Нельзя переместить канал к архивному каналу.');
        if (target.version !== input.targetVersion) conflict('Порядок каналов уже изменён. Обновите данные.');
        destination = desired.findIndex(row => row.id === input.targetId) + (input.placement === 'after' ? 1 : 0);
      }
      desired.splice(destination, 0, moving);
      // Reuse the existing rank slots so a long drag stays atomic and does not
      // accumulate fractional ranks or rewrite unaffected channel versions.
      const changed = desired.flatMap((row, position) => row.id === order[position].id ? [] : [{ ...row, sortOrder: order[position].sortOrder }]);
      if (changed.length) {
        await client.query(`UPDATE team_conversations c SET sort_order=placement.sort_order,version=c.version+1
          FROM unnest($2::uuid[],$3::bigint[]) AS placement(id,sort_order)
          WHERE c.legal_entity_id=$1 AND c.id=placement.id`, [scope.legalEntityId, changed.map(row => row.id), changed.map(row => row.sortOrder)]);
        await this.auditWrite(client, actor, scope, correlationId, 'team.channel.order_changed', 'team_conversations', id,
          { ...payload, ...(neighbor ? { neighborId: neighbor.id } : {}), changedChannelIds: changed.map(row => row.id),
            previousSortOrder: Number(conversation.sortOrder), sortOrder: changed.find(row => row.id === id).sortOrder, version: conversation.version + 1 });
      }
      await this.recordControlOperation(client, actor, scope, id, null, input.operationId, 'channel_order', payload);
      return { order: await this.channelOrderRows(client, scope) };
    });
  }
  async ancestorRows(client, scope, messages, actor) {
    if (!messages.length) return [];
    const result = await client.query(`WITH RECURSIVE ancestry AS (
      SELECT id,parent_id FROM team_messages WHERE id=ANY($5::uuid[]) AND ${whereScope()}
      UNION SELECT parent.id,parent.parent_id FROM team_messages parent JOIN ancestry child ON parent.id=child.parent_id
    ) SELECT ${MESSAGE_COLUMNS} FROM team_messages WHERE ${whereScope()} AND id IN (SELECT id FROM ancestry)
      AND NOT id=ANY($5::uuid[]) ORDER BY created_at,id`, [...tuple(scope), messages.map(message => message.id)]);
    return this.withAttachments(client, scope, result.rows, actor);
  }
  async messageReadStatuses(client, actor, scope, ids) {
    if (!ids.length) return [];
    // Receipts are visible only to the sender. Do not expose reader identities or
    // turn an administrator's inspection of a private chat into a member read.
    // A channel has no historical recipient snapshot, so its total stays unknown.
    const result = await client.query(`SELECT m.id,m.version,json_build_object(
        'status',CASE WHEN receipts.count>0 THEN 'read' ELSE 'sent' END,
        'readCount',receipts.count,
        'recipientCount',CASE WHEN c.kind='direct' THEN
          (SELECT count(*)::integer FROM team_members member WHERE member.conversation_id=c.id AND member.user_id<>m.author_id)
          ELSE NULL END) AS delivery
      FROM team_messages m JOIN team_conversations c ON c.id=m.conversation_id
      LEFT JOIN LATERAL (SELECT count(*)::integer AS count FROM team_message_reads r
        JOIN users reader ON reader.id=r.user_id AND reader.active AND reader.approved AND reader.role=ANY($7::text[])
        WHERE r.message_id=m.id AND r.message_version=m.version AND r.user_id<>m.author_id
          AND EXISTS(SELECT 1 FROM access_grants g WHERE g.user_id=r.user_id AND g.legal_entity_id=c.legal_entity_id)
          AND (c.visibility='public' OR EXISTS(SELECT 1 FROM team_members member WHERE member.conversation_id=c.id AND member.user_id=r.user_id))) receipts ON true
      WHERE ${whereScope(1, 'm')} AND m.id=ANY($5::uuid[]) AND m.author_id=$6 AND m.deleted_at IS NULL`,
    [...tuple(scope), ids, actor.id, ROLES]);
    return result.rows;
  }
  async withAttachments(client, scope, messages, actor) {
    if (!messages.length) return [];
    const files = await client.query(`SELECT id,message_id AS "messageId",filename,mime_type AS "mimeType",byte_size AS "byteSize",sha256,kind
      FROM team_attachments WHERE ${whereScope()} AND message_id=ANY($5::uuid[]) ORDER BY message_id,position`,
    [...tuple(scope), messages.map(message => message.id)]);
    const grouped = new Map();
    for (const file of files.rows) {
      if (!grouped.has(file.messageId)) grouped.set(file.messageId, []);
      grouped.get(file.messageId).push(attachmentMetadata(file));
    }
    const reactionRows = await client.query(`SELECT message_id AS "messageId",emoji,count(*)::integer AS count,bool_or(user_id=$6) AS mine
      FROM team_message_reactions WHERE ${whereScope()} AND message_id=ANY($5::uuid[]) GROUP BY message_id,emoji`,
    [...tuple(scope), messages.map(message => message.id), actor.id]);
    const reactions = new Map();
    for (const row of reactionRows.rows) {
      if (!reactions.has(row.messageId)) reactions.set(row.messageId, []);
      reactions.get(row.messageId).push({ emoji: row.emoji, count: row.count, mine: row.mine });
    }
    const states = await client.query(`SELECT m.id,c.archived_at AS "conversationArchivedAt",
        (c.archived_at IS NULL AND m.author_id<>$6 AND m.deleted_at IS NULL AND r.message_id IS NULL) AS "isUnread",
        (c.archived_at IS NULL AND m.author_id<>$6 AND m.deleted_at IS NULL AND n.message_id IS NOT NULL AND n.read_at IS NULL) AS "isUnreadMention",
        (m.author_id<>$6 AND m.deleted_at IS NULL AND r.message_version IS DISTINCT FROM m.version
          AND (c.visibility='public' OR EXISTS(SELECT 1 FROM team_members member WHERE member.conversation_id=c.id AND member.user_id=$6))) AS "requiresReadReceipt"
      FROM team_messages m JOIN team_conversations c ON c.id=m.conversation_id
      LEFT JOIN team_message_reads r ON r.message_id=m.id AND r.user_id=$6
      LEFT JOIN team_message_mentions n ON n.message_id=m.id AND n.user_id=$6 AND n.message_version=m.version
      WHERE ${whereScope(1, 'm')} AND m.id=ANY($5::uuid[])`, [...tuple(scope), messages.map(message => message.id), actor.id]);
    const readStates = new Map(states.rows.map(row => [row.id, row]));
    const deliveries = new Map((await this.messageReadStatuses(client, actor, scope, messages.filter(message => message.authorId === actor.id).map(message => message.id))).map(row => [row.id, row.delivery]));
    const tasks = await require('./team-organization-tasks').taskMessageMetadata(client, actor, scope, messages.map(message => message.id));
    return messages.map(message => ({ ...message, ...readStates.get(message.id), ...tasks.get(message.id), attachments: message.deletedAt ? [] : grouped.get(message.id) || [],
      ...(deliveries.has(message.id) ? { delivery: deliveries.get(message.id) } : {}),
      reactions: message.deletedAt ? [] : (reactions.get(message.id) || []).sort((a, b) => REACTION_EMOJI.indexOf(a.emoji) - REACTION_EMOJI.indexOf(b.emoji)) }));
  }
  async attachment(supplied, idValue, scopeId, correlationId) {
    return this.database.transaction(async client => {
      const actor = await this.current(client, supplied);
      const id = uuid(idValue, 'файл');
      const requestedScopeId = uuid(scopeId, 'область работы');
      let scope;
      try { scope = await this.scope(client, actor, requestedScopeId); }
      catch (error) { if (error.getStatus?.() === 403) unavailable(); throw error; }
      await this.lockScope(client, scope);
      // Check metadata and the original conversation before fetching file bytes.
      const found = await client.query(`SELECT id,conversation_id AS "conversationId",message_id AS "messageId",filename,byte_size AS "byteSize"
        FROM team_attachments WHERE ${whereScope()} AND id=$5 AND message_id IN (SELECT id FROM team_messages WHERE deleted_at IS NULL)`, [...tuple(scope), id]);
      const file = found.rows[0];
      if (!file) unavailable();
      const conversation = await this.reference(client, actor, scope, file.conversationId);
      if (conversation.visibility === 'private' && !conversation.memberIds.includes(actor.id)) {
        await this.auditWrite(client, actor, scope, correlationId, 'team.attachment.admin_download', 'team_attachments', id,
          { conversationId: conversation.id, messageId: file.messageId, memberIds: conversation.memberIds });
      }
      const bytes = await client.query(`SELECT content FROM team_attachments WHERE ${whereScope()} AND id=$5`, [...tuple(scope), id]);
      return { filename: file.filename, byteSize: file.byteSize, content: bytes.rows[0].content };
    });
  }
  async source(supplied, idValue, scopeId, correlationId) {
    return this.database.transaction(async client => {
      const actor = await this.current(client, supplied);
      const scope = await this.scope(client, actor, uuid(scopeId, 'область работы'));
      const id = uuid(idValue, 'сообщение');
      await this.lockScope(client, scope);
      const found = await client.query(`SELECT ${MESSAGE_COLUMNS} FROM team_messages WHERE ${whereScope()} AND id=$5`, [...tuple(scope), id]);
      const row = found.rows[0];
      if (!row) unavailable();
      // A shared report never grants access to its original conversation.
      // Author, text and conversation metadata are returned only after this check.
      const conversation = await this.reference(client, actor, scope, row.conversationId);
      const message = publicAuthored((await this.withAttachments(client, scope, [row], actor))[0], actor, scope);
      const ancestors = (await this.ancestorRows(client, scope, [row], actor)).map(ancestor => publicAuthored(ancestor, actor, scope));
      if (conversation.visibility === 'private' && !conversation.memberIds.includes(actor.id)) {
        await this.auditWrite(client, actor, scope, correlationId, conversation.kind === 'direct' ? 'team.direct.admin_read' : 'team.channel.admin_read', 'team_conversations', conversation.id,
          { messageCount: 1, ancestorCount: ancestors.length, messageId: id, memberIds: conversation.memberIds, source: 'summary_reference' });
      }
      return { conversation: publicConversation(conversation, actor), message, ancestors };
    });
  }
  async detail(supplied, idValue, scopeId, beforeValue, correlationId) {
    return this.database.transaction(async client => {
      const actor = await this.current(client, supplied);
      const scope = await this.scope(client, actor, uuid(scopeId, 'область работы'));
      const id = uuid(idValue, 'чат');
      const before = beforeValue == null ? null : uuid(beforeValue, 'курсор истории');
      await this.lockScope(client, scope);
      const conversation = await this.reference(client, actor, scope, id);
      if (before) {
        const cursor = await client.query(`SELECT id FROM team_messages WHERE ${whereScope()} AND conversation_id=$5 AND id=$6`, [...tuple(scope), id, before]);
        if (!cursor.rowCount) fail('Курсор истории недоступен. Обновите чат.');
      }
      // Resolve the cursor inside PostgreSQL to retain timestamp microseconds.
      const result = await client.query(`SELECT ${MESSAGE_COLUMNS} FROM team_messages WHERE ${whereScope()} AND conversation_id=$5
        AND ($6::uuid IS NULL OR (created_at,id)<(SELECT created_at,id FROM team_messages WHERE id=$6))
        ORDER BY created_at DESC,id DESC LIMIT 101`, [...tuple(scope), id, before]);
      const hasMore = result.rows.length > 100;
      const messages = (await this.withAttachments(client, scope, result.rows.slice(0, 100).reverse(), actor)).map(row => publicAuthored(row, actor, scope));
      const ancestors = (await this.ancestorRows(client, scope, messages, actor)).map(row => publicAuthored(row, actor, scope));
      if (conversation.visibility === 'private' && !conversation.memberIds.includes(actor.id)) {
        await this.auditWrite(client, actor, scope, correlationId, conversation.kind === 'direct' ? 'team.direct.admin_read' : 'team.channel.admin_read', 'team_conversations', id,
          { messageCount: messages.length, ancestorCount: ancestors.length, before, memberIds: conversation.memberIds });
      }
      const cursor = await client.query(`SELECT coalesce(max(change_seq),0)::text AS value FROM team_messages WHERE ${whereScope()} AND conversation_id=$5`, [...tuple(scope), id]);
      return { conversation: publicConversation(conversation, actor), messages, ancestors, hasMore, nextBefore: hasMore ? messages[0].id : null, changeCursor: cursor.rows[0].value };
    });
  }
  async send(supplied, body, correlationId) {
    return this.database.transaction(async client => this.sendInTransaction(client, await this.current(client, supplied), body, correlationId));
  }
  // Internal transaction helper: callers supply an actor already revalidated in this transaction.
  async sendInTransaction(client, actor, body, correlationId) {
      const input = messageInput(body);
      const scope = await this.scope(client, actor, input.responsibilityScopeId);
      await this.lockScope(client, scope);
      await this.lockRecord(client, 'message', input.id);
      const conversation = await this.reference(client, actor, scope, input.conversationId);
      if (conversation.archivedAt) conflict('Канал в архиве. Верните его из архива, чтобы отправлять сообщения.');
      if (conversation.visibility === 'private' && !conversation.memberIds.includes(actor.id)) forbidden('Администратор может просматривать этот чат, но не отправлять сообщения от имени участников.');
      if (input.parentId) {
        const parent = await client.query(`SELECT id FROM team_messages WHERE ${whereScope()} AND conversation_id=$5 AND id=$6`, [...tuple(scope), input.conversationId, input.parentId]);
        if (!parent.rowCount) unavailable();
      }
      const found = await client.query(`SELECT ${MESSAGE_COLUMNS},legal_entity_id AS "legalEntityId",region_id AS "regionId",
        project_id AS "projectId",responsibility_scope_id AS "responsibilityScopeId" FROM team_messages WHERE id=$1`, [input.id]);
      const existing = found.rows[0];
      if (existing) {
        if (tuple(existing).some((value, index) => value !== tuple(scope)[index]) || existing.authorId !== actor.id ||
          existing.conversationId !== input.conversationId || existing.parentId !== input.parentId)
          conflict('Идентификатор сообщения уже использован.');
        const original = await client.query('SELECT payload=$2::jsonb AS matches FROM team_message_originals WHERE message_id=$1',
          [input.id, JSON.stringify(originalMessagePayload(input))]);
        if (!original.rows[0]?.matches) conflict('Идентификатор сообщения уже использован с другими данными.');
        const { legalEntityId, regionId, projectId, responsibilityScopeId, ...row } = existing;
        const saved = (await this.withAttachments(client, scope, [row], actor))[0];
        return publicAuthored(saved, actor, scope);
      }
      await this.enforceConversationInterval(client, actor, scope, conversation.id);
      const recipients = await this.mentionRecipients(client, actor, scope, conversation, input.mentions);
      const result = await client.query(`INSERT INTO team_messages(id,legal_entity_id,region_id,project_id,responsibility_scope_id,
        conversation_id,parent_id,text,author_id,author_name,mention_user_ids,mention_all) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING ${MESSAGE_COLUMNS}`,
      [input.id, ...tuple(scope), input.conversationId, input.parentId, input.text, actor.id, actor.displayName, input.mentions.userIds, input.mentions.all]);
      await client.query(`INSERT INTO team_message_originals(message_id,legal_entity_id,region_id,project_id,responsibility_scope_id,conversation_id,payload)
        VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)`, [input.id, ...tuple(scope), input.conversationId, JSON.stringify(originalMessagePayload(input))]);
      for (const [position, file] of input.attachments.entries()) {
        const inserted = await client.query(`INSERT INTO team_attachments(id,legal_entity_id,region_id,project_id,responsibility_scope_id,
          conversation_id,message_id,filename,mime_type,byte_size,sha256,content,position,kind)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT(id) DO NOTHING RETURNING id`,
        [file.id, ...tuple(scope), input.conversationId, input.id, file.filename, file.mimeType, file.byteSize, file.sha256, file.content, position, file.kind]);
        if (!inserted.rowCount) conflict('Идентификатор файла уже использован. Прикрепите файл заново.');
      }
      if (recipients.length) await client.query(`INSERT INTO team_message_mentions(message_id,legal_entity_id,region_id,project_id,responsibility_scope_id,conversation_id,user_id)
        SELECT $1,$2,$3,$4,$5,$6,user_id FROM unnest($7::uuid[]) AS selected(user_id)`, [input.id, ...tuple(scope), input.conversationId, recipients]);
      await client.query(`UPDATE team_conversations SET updated_at=clock_timestamp() WHERE ${whereScope()} AND id=$5`, [...tuple(scope), input.conversationId]);
      await this.auditWrite(client, actor, scope, correlationId, 'team.message.created', 'team_messages', input.id,
        { conversationId: input.conversationId, parentId: input.parentId, attachmentCount: input.attachments.length, mentionCount: recipients.length, mentionAll: input.mentions.all });
      const [readStatus] = await this.messageReadStatuses(client, actor, scope, [input.id]);
      return publicAuthored({ ...result.rows[0], delivery: readStatus.delivery, attachments: input.attachments.map(attachmentMetadata), reactions: [], isUnread: false, isUnreadMention: false, requiresReadReceipt: false }, actor, scope);
  }
  async enforceConversationInterval(client, actor, scope, conversationId) {
    if (canManage(actor)) return;
    const found = await client.query(`SELECT ceil(extract(epoch FROM ((SELECT max(created_at) FROM team_messages
      WHERE ${whereScope()} AND conversation_id=$5 AND author_id=$6)+interval '5 minutes'-clock_timestamp())))::integer AS seconds
      FROM team_conversation_moderation WHERE ${whereScope()} AND conversation_id=$5 AND enabled_until>clock_timestamp()`,
    [...tuple(scope), conversationId, actor.id]);
    const seconds = found.rows[0]?.seconds;
    if (seconds > 0) throw new HttpException({ code: 'TEAM_RATE_LIMIT', message: `Следующее сообщение можно отправить через ${seconds} сек.` }, 429);
  }
  async messageRow(client, scope, id) {
    const found = await client.query(`SELECT ${MESSAGE_COLUMNS} FROM team_messages WHERE ${whereScope()} AND id=$5`, [...tuple(scope), id]);
    if (!found.rowCount) unavailable();
    return found.rows[0];
  }
  async publicMessage(client, actor, scope, row) {
    return publicAuthored((await this.withAttachments(client, scope, [row], actor))[0], actor, scope);
  }
  async existingControlOperation(client, actor, scope, conversationId, messageId, operationId, action, payload) {
    await this.lockRecord(client, 'control-operation', operationId);
    const found = await client.query(`SELECT actor_id AS "actorId",conversation_id AS "conversationId",message_id AS "messageId",action,
      legal_entity_id AS "legalEntityId",region_id AS "regionId",project_id AS "projectId",responsibility_scope_id AS "responsibilityScopeId",payload=$2::jsonb AS matches
      FROM team_control_operations WHERE id=$1`, [operationId, JSON.stringify(payload)]);
    const row = found.rows[0];
    if (!row) return false;
    if (row.actorId !== actor.id || row.conversationId !== conversationId || row.messageId !== messageId || row.action !== action || !row.matches ||
      tuple(row).some((value, index) => value !== tuple(scope)[index])) conflict('Идентификатор операции уже использован с другими данными.');
    return true;
  }
  async recordControlOperation(client, actor, scope, conversationId, messageId, operationId, action, payload) {
    await client.query(`INSERT INTO team_control_operations(id,actor_id,legal_entity_id,region_id,project_id,responsibility_scope_id,conversation_id,message_id,action,payload)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`, [operationId, actor.id, ...tuple(scope), conversationId, messageId, action, JSON.stringify(payload)]);
  }
  async changeMessage(supplied, idValue, body, action, correlationId) {
    return this.database.transaction(async client => {
      const actor = await this.current(client, supplied);
      const input = messageControlInput(body, action);
      const id = uuid(idValue, 'сообщение');
      const scope = await this.scope(client, actor, input.responsibilityScopeId);
      await this.lockScope(client, scope);
      await this.lockRecord(client, 'message', id);
      const old = await this.messageRow(client, scope, id);
      const conversation = await this.reference(client, actor, scope, old.conversationId);
      if (conversation.archivedAt) conflict('Сообщения архивного канала доступны только для чтения.');
      if (old.authorId !== actor.id && !canManage(actor)) forbidden('Изменять и удалять чужие сообщения может только администратор.');
      const payload = action === 'edit' ? { version: input.version, text: input.text, mentions: input.mentions } : { version: input.version };
      if (await this.existingControlOperation(client, actor, scope, conversation.id, id, input.operationId, action, payload))
        return this.publicMessage(client, actor, scope, old);
      if (old.deletedAt) conflict('Сообщение уже удалено.');
      if (old.version !== input.version) conflict('Сообщение изменилось. Обновите его перед сохранением.');
      let saved;
      if (action === 'edit') {
        if (!input.text) {
          const files = await client.query('SELECT 1 FROM team_attachments WHERE message_id=$1 LIMIT 1', [id]);
          if (!files.rowCount) fail('Добавьте текст сообщения или удалите его.');
        }
        const recipients = await this.mentionRecipients(client, actor, scope, conversation, input.mentions);
        saved = (await client.query(`UPDATE team_messages SET text=$6,mention_user_ids=$7,mention_all=$8,version=version+1,
          edited_at=clock_timestamp(),edited_by=$9,change_seq=nextval('team_message_change_sequence')
          WHERE ${whereScope()} AND id=$5 RETURNING ${MESSAGE_COLUMNS}`, [...tuple(scope), id, input.text, input.mentions.userIds, input.mentions.all, actor.id])).rows[0];
        if (recipients.length) await client.query(`INSERT INTO team_message_mentions(message_id,legal_entity_id,region_id,project_id,responsibility_scope_id,conversation_id,user_id,message_version)
          SELECT $1,$2,$3,$4,$5,$6,user_id,$8 FROM unnest($7::uuid[]) AS selected(user_id)`, [id, ...tuple(scope), conversation.id, recipients, saved.version]);
      } else {
        saved = (await client.query(`UPDATE team_messages SET text='',mention_user_ids='{}'::uuid[],mention_all=false,version=version+1,
          deleted_at=clock_timestamp(),deleted_by=$6,change_seq=nextval('team_message_change_sequence')
          WHERE ${whereScope()} AND id=$5 RETURNING ${MESSAGE_COLUMNS}`, [...tuple(scope), id, actor.id])).rows[0];
      }
      await this.recordControlOperation(client, actor, scope, conversation.id, id, input.operationId, action, payload);
      await this.auditWrite(client, actor, scope, correlationId, `team.message.${action === 'edit' ? 'edited' : 'deleted'}`, 'team_messages', id,
        { conversationId: conversation.id, authorId: old.authorId, version: saved.version, administratorChangedAnotherAuthor: actor.id !== old.authorId });
      return this.publicMessage(client, actor, scope, saved);
    });
  }
  async react(supplied, idValue, body, correlationId) {
    return this.database.transaction(async client => {
      const actor = await this.current(client, supplied);
      const input = reactionInput(body);
      const id = uuid(idValue, 'сообщение');
      const scope = await this.scope(client, actor, input.responsibilityScopeId);
      await this.lockScope(client, scope);
      let row = await this.messageRow(client, scope, id);
      const conversation = await this.reference(client, actor, scope, row.conversationId);
      if (conversation.archivedAt) conflict('Сообщения архивного канала доступны только для чтения.');
      if (row.deletedAt) unavailable();
      const changed = input.present
        ? await client.query(`INSERT INTO team_message_reactions(message_id,user_id,legal_entity_id,region_id,project_id,responsibility_scope_id,conversation_id,emoji)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(message_id,user_id,emoji) DO NOTHING RETURNING message_id`, [id, actor.id, ...tuple(scope), row.conversationId, input.emoji])
        : await client.query(`DELETE FROM team_message_reactions WHERE ${whereScope()} AND message_id=$5 AND user_id=$6 AND emoji=$7 RETURNING message_id`, [...tuple(scope), id, actor.id, input.emoji]);
      if (changed.rowCount) {
        row = (await client.query(`UPDATE team_messages SET change_seq=nextval('team_message_change_sequence') WHERE ${whereScope()} AND id=$5 RETURNING ${MESSAGE_COLUMNS}`, [...tuple(scope), id])).rows[0];
        await this.auditWrite(client, actor, scope, correlationId, 'team.message.reaction_changed', 'team_messages', id, { emoji: input.emoji, present: input.present, conversationId: row.conversationId });
      }
      return this.publicMessage(client, actor, scope, row);
    });
  }
  async setModeration(supplied, idValue, body, correlationId) {
    return this.database.transaction(async client => {
      const actor = await this.current(client, supplied);
      if (!canManage(actor)) forbidden('Режим общения настраивает администратор.');
      const input = moderationInput(body);
      const id = uuid(idValue, 'чат');
      const scope = await this.scope(client, actor, input.responsibilityScopeId);
      await this.lockScope(client, scope);
      const conversation = await this.reference(client, actor, scope, id);
      const payload = { enabled: input.enabled };
      if (await this.existingControlOperation(client, actor, scope, id, null, input.operationId, 'moderation', payload)) return publicConversation(conversation, actor).moderation;
      await client.query(`INSERT INTO team_conversation_moderation(conversation_id,legal_entity_id,region_id,project_id,responsibility_scope_id,enabled_until,updated_by)
        VALUES($1,$2,$3,$4,$5,CASE WHEN $6 THEN clock_timestamp()+interval '1 hour' ELSE NULL END,$7)
        ON CONFLICT(conversation_id) DO UPDATE SET enabled_until=EXCLUDED.enabled_until,updated_by=EXCLUDED.updated_by,updated_at=clock_timestamp()`,
      [id, ...tuple(scope), input.enabled, actor.id]);
      await this.recordControlOperation(client, actor, scope, id, null, input.operationId, 'moderation', payload);
      await this.auditWrite(client, actor, scope, correlationId, 'team.conversation.moderation_changed', 'team_conversations', id, { enabled: input.enabled, mode: 'interval', intervalSeconds: 300, durationSeconds: 3600 });
      return publicConversation(await this.reference(client, actor, scope, id), actor).moderation;
    });
  }
  async changes(supplied, idValue, scopeId, afterValue, correlationId, readMessageIdsValue) {
    const after = afterValue == null ? '0' : afterValue;
    return this.database.transaction(async client => {
      const actor = await this.current(client, supplied);
      if (typeof after !== 'string' || !/^(0|[1-9][0-9]{0,18})$/.test(after) || BigInt(after) > 9223372036854775807n) fail('Некорректный курсор изменений.');
      if (readMessageIdsValue != null && typeof readMessageIdsValue !== 'string') fail('Некорректный список статусов прочтения.');
      const readMessageIds = readMessageIdsValue ? readMessageIdsValue.split(',') : [];
      if (readMessageIds.length > 100) fail('Можно запросить статусы не более 100 сообщений.');
      const readIds = [...new Set(readMessageIds.map(value => uuid(value, 'сообщение')))];
      const scope = await this.scope(client, actor, uuid(scopeId, 'область работы'));
      const id = uuid(idValue, 'чат');
      await this.lockScope(client, scope);
      const conversation = await this.reference(client, actor, scope, id);
      if (readIds.length) {
        const requested = await client.query(`SELECT id FROM team_messages WHERE ${whereScope()} AND conversation_id=$5 AND id=ANY($6::uuid[])`, [...tuple(scope), id, readIds]);
        if (requested.rowCount !== readIds.length) unavailable();
      }
      const readStatuses = await this.messageReadStatuses(client, actor, scope, readIds);
      const found = await client.query(`SELECT ${MESSAGE_COLUMNS} FROM team_messages WHERE ${whereScope()} AND conversation_id=$5 AND change_seq>$6::bigint ORDER BY change_seq LIMIT 101`, [...tuple(scope), id, after]);
      const hasMore = found.rows.length > 100;
      const messages = (await this.withAttachments(client, scope, found.rows.slice(0, 100), actor)).map(row => publicAuthored(row, actor, scope));
      const ancestors = (await this.ancestorRows(client, scope, messages, actor)).map(row => publicAuthored(row, actor, scope));
      if (conversation.visibility === 'private' && !conversation.memberIds.includes(actor.id) && (messages.length || ancestors.length || readStatuses.length))
        await this.auditWrite(client, actor, scope, correlationId, conversation.kind === 'direct' ? 'team.direct.admin_read' : 'team.channel.admin_read', 'team_conversations', id, { source: 'changes', messageCount: messages.length, ancestorCount: ancestors.length, readStatusCount: readStatuses.length, memberIds: conversation.memberIds });
      return { conversation: publicConversation(conversation, actor), messages, ancestors, readStatuses, hasMore, changeCursor: messages.length ? messages[messages.length - 1].changeCursor : after };
    });
  }
  async mentionRecipients(client, actor, scope, conversation, mentions) {
    if (!mentions.all && !mentions.userIds.length) return [];
    const people = (await this.peopleRows(client, actor, scope)).filter(person => conversation.visibility === 'public' || conversation.memberIds.includes(person.id));
    const eligible = new Set(people.map(person => person.id));
    if (mentions.userIds.some(id => !eligible.has(id))) fail('Упомянутый сотрудник должен иметь действующий доступ к этому чату.');
    return [...new Set(mentions.all ? [...eligible] : mentions.userIds)].filter(id => id !== actor.id).sort();
  }
  async mentions(supplied, scopeId, beforeValue) {
    return this.database.transaction(async client => {
      const actor = await this.current(client, supplied);
      const scopes = await this.selectedScopes(client, actor, scopeId);
      for (const scope of scopes) await this.lockScope(client, scope);
      const scopeById = new Map(scopes.map(scope => [scope.responsibilityScopeId, scope]));
      const before = beforeValue == null ? null : uuid(beforeValue, 'курсор упоминаний');
      const access = `n.responsibility_scope_id=ANY($1::uuid[]) AND n.user_id=$2 AND m.deleted_at IS NULL AND c.archived_at IS NULL AND c.deleted_at IS NULL AND n.message_version=m.version AND ((c.kind='channel' AND c.visibility='public') OR $3::boolean OR EXISTS(
        SELECT 1 FROM team_members member WHERE member.conversation_id=c.id AND member.user_id=$2))`;
      const joins = 'FROM team_message_mentions n JOIN team_messages m ON m.id=n.message_id JOIN team_conversations c ON c.id=n.conversation_id';
      const values = [scopes.map(scope => scope.responsibilityScopeId), actor.id, canManage(actor)];
      if (before) {
        const cursor = await client.query(`SELECT m.id ${joins} WHERE ${access} AND m.id=$4`, [...values, before]);
        if (!cursor.rowCount) fail('Курсор упоминаний недоступен. Обновите список.');
      }
      const result = await client.query(`SELECT m.responsibility_scope_id AS "responsibilityScopeId",m.id AS "messageId",m.conversation_id AS "conversationId",m.parent_id AS "parentId",m.text,
        m.author_id AS "authorId",m.author_name AS "authorName",m.created_at AS "createdAt",m.version,n.read_at AS "readAt",c.title AS "conversationTitle",c.kind AS "conversationKind"
        ${joins} WHERE ${access} AND ($4::uuid IS NULL OR (m.created_at,m.id)<(SELECT created_at,id FROM team_messages WHERE id=$4))
        ORDER BY m.created_at DESC,m.id DESC LIMIT 101`, [...values, before]);
      const unread = await client.query(`SELECT count(*)::integer AS count ${joins} WHERE ${access} AND n.read_at IS NULL`, values);
      const hasMore = result.rows.length > 100;
      const mentions = result.rows.slice(0, 100).map(row => publicAuthored(row, actor, scopeById.get(row.responsibilityScopeId)));
      return { mentions, unreadCount: unread.rows[0].count, hasMore, nextBefore: hasMore ? mentions[mentions.length - 1].messageId : null };
    });
  }
  async readMention(supplied, idValue, body) {
    return this.database.transaction(async client => {
      const actor = await this.current(client, supplied);
      object(body, ['responsibilityScopeId', 'version']);
      const id = uuid(idValue, 'упоминание');
      const input = messageReadInput({ responsibilityScopeId: body.responsibilityScopeId, messages: [{ id, version: body.version }] });
      const scope = await this.scope(client, actor, input.responsibilityScopeId);
      await this.lockScope(client, scope);
      const found = await client.query(`SELECT n.conversation_id AS "conversationId" FROM team_message_mentions n
        JOIN team_messages m ON m.id=n.message_id AND m.version=n.message_version AND m.deleted_at IS NULL
        WHERE ${whereScope(1, 'n')} AND n.user_id=$5 AND n.message_id=$6`, [...tuple(scope), actor.id, id]);
      if (!found.rowCount) unavailable();
      await this.reference(client, actor, scope, found.rows[0].conversationId);
      await this.acknowledgeMessages(client, actor, scope, found.rows[0].conversationId, input.messages);
      const result = await client.query(`SELECT message_id AS "messageId",read_at AS "readAt" FROM team_message_mentions
        WHERE ${whereScope()} AND user_id=$5 AND message_id=$6 AND message_version=$7`, [...tuple(scope), actor.id, id, body.version]);
      return response(result.rows[0]);
    });
  }
  async articles(supplied, scopeId) {
    return this.database.transaction(async client => {
      const actor = await this.current(client, supplied);
      const aggregate = scopeId == null || scopeId === '';
      const scopes = aggregate ? actor.sourceGrants : [await this.workScope(client, actor, uuid(scopeId, 'область работы'))];
      let articles = [];
      const permissionsByScope = {};
      for (const scope of scopes) {
        const permissions = await this.knowledgeRights(client, actor, scope);
        permissionsByScope[scope.responsibilityScopeId] = permissions;
        const result = await client.query(`SELECT ${ARTICLE_COLUMNS} FROM team_articles WHERE ${whereScope()} AND deleted_at IS NULL ORDER BY updated_at DESC,id`, tuple(scope));
        articles.push(...(await this.withArticleMetadata(client, actor, scope, result.rows, permissions)).map(row => ({ ...row, responsibilityScopeId: scope.responsibilityScopeId })));
      }
      if (aggregate) articles = deduplicateKnowledgeArticles(articles);
      articles.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
      return { articles, permissions: permissionsByScope[scopes[0]?.responsibilityScopeId] || { canCreate: false, canEdit: false, canManage: false }, permissionsByScope };
    });
  }
  async articlePositions(supplied, scopeId) {
    return this.database.transaction(async client => {
      const actor = await this.current(client, supplied);
      const scope = await this.workScope(client, actor, uuid(scopeId, 'область работы'));
      const result = await client.query(`SELECT id,title,legal_entity_id AS "legalEntityId",responsibility_scope_id AS "responsibilityScopeId"
        FROM team_organization_positions WHERE legal_entity_id=$1 ORDER BY title,id`, [scope.legalEntityId]);
      return { responsibilityScopeId: scope.responsibilityScopeId, positions: result.rows };
    });
  }
  async articleAudience(client, scope, positionIds) {
    const result = await client.query(`SELECT id,title FROM team_organization_positions
      WHERE legal_entity_id=$1 AND id=ANY($2::uuid[]) ORDER BY id FOR SHARE`, [scope.legalEntityId, positionIds]);
    if (result.rowCount !== positionIds.length) forbidden('Выберите должности компании, для которой создаётся статья.');
    return result.rows;
  }
  async knowledgeRights(client, actor, scope) {
    if (canManage(actor)) return { canCreate: true, canEdit: true, canManage: true };
    const found = await client.query(`SELECT can_create AS "canCreate",can_edit AS "canEdit" FROM team_knowledge_permissions
      WHERE ${whereScope()} AND user_id=$5`, [...tuple(scope), actor.id]);
    return { canCreate: Boolean(found.rows[0]?.canCreate), canEdit: Boolean(found.rows[0]?.canEdit), canManage: false };
  }
  async knowledgePermissionRows(client, actor, scope) {
    const people = await this.workPeopleRows(client, actor, scope);
    const found = await client.query(`SELECT user_id AS "userId",can_create AS "canCreate",can_edit AS "canEdit" FROM team_knowledge_permissions WHERE ${whereScope()}`, tuple(scope));
    const rights = new Map(found.rows.map(row => [row.userId, row]));
    return people.map(person => ({ userId: person.id, displayName: person.displayName, role: person.role,
      canCreate: person.role === 'access_admin' || Boolean(rights.get(person.id)?.canCreate),
      canEdit: person.role === 'access_admin' || Boolean(rights.get(person.id)?.canEdit) }));
  }
  async knowledgePermissions(supplied, scopeId) {
    return this.database.transaction(async client => {
      const actor = await this.current(client, supplied);
      if (!canManage(actor)) forbidden('Настраивать права базы знаний может только администратор.');
      const scope = await this.workScope(client, actor, uuid(scopeId, 'область работы'));
      return { responsibilityScopeId: scope.responsibilityScopeId, permissions: await this.knowledgePermissionRows(client, actor, scope) };
    });
  }
  async saveKnowledgePermission(supplied, body, correlationId) {
    return this.database.transaction(async client => {
      const actor = await this.current(client, supplied);
      if (!canManage(actor)) forbidden('Настраивать права базы знаний может только администратор.');
      object(body, ['responsibilityScopeId', 'userId', 'canCreate', 'canEdit']);
      if (typeof body.canCreate !== 'boolean' || typeof body.canEdit !== 'boolean') fail('Укажите права создания и редактирования.');
      const userId = uuid(body.userId, 'сотрудник');
      const scope = await this.workScope(client, actor, uuid(body.responsibilityScopeId, 'область работы'));
      await this.lockScope(client, scope);
      const target = (await this.knowledgePermissionRows(client, actor, scope)).find(person => person.userId === userId);
      if (!target) unavailable();
      if (target.role === 'access_admin') {
        if (!body.canCreate || !body.canEdit) fail('У администратора всегда есть права создания и редактирования.');
        return target;
      }
      await client.query(`INSERT INTO team_knowledge_permissions(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id,can_create,can_edit,updated_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(user_id,responsibility_scope_id)
        DO UPDATE SET can_create=EXCLUDED.can_create,can_edit=EXCLUDED.can_edit,updated_by=EXCLUDED.updated_by,updated_at=clock_timestamp()`,
      [userId, ...tuple(scope), body.canCreate, body.canEdit, actor.id]);
      if (target.canCreate !== body.canCreate || target.canEdit !== body.canEdit) await this.auditWrite(client, actor, scope, correlationId,
        'team.knowledge.permissions_changed', 'users', userId, { canCreate: body.canCreate, canEdit: body.canEdit });
      return { ...target, canCreate: body.canCreate, canEdit: body.canEdit };
    });
  }
  async adaptationSnapshot(client, actor) {
    const assignment = (await client.query(`SELECT adaptation_required AS required,adaptation_scope_id AS "scopeId",
      adaptation_completed_at AS "completedAt" FROM users WHERE id=$1`, [actor.id])).rows[0];
    const empty = { required: false, completed: false, completedAt: null, scopeId: null, folders: [...ADAPTATION_FOLDERS], articles: [], total: 0, readCount: 0, canComplete: false };
    if (!assignment?.required || !assignment.scopeId || actor.role === 'driver') return empty;
    const scope = await this.workScope(client, actor, assignment.scopeId);
    const rows = await client.query(`SELECT ${ARTICLE_COLUMNS} FROM team_articles WHERE ${whereScope()} AND deleted_at IS NULL
      AND id IN (SELECT article_id FROM team_article_imports WHERE split_part(folder_path,'/',1)=ANY($5::text[])) ORDER BY title,id`, [...tuple(scope), ADAPTATION_FOLDERS]);
    const articles = await this.withArticleMetadata(client, actor, scope, rows.rows);
    const reads = await client.query(`SELECT r.article_id AS "articleId",r.read_at AS "readAt" FROM team_adaptation_reads r
      JOIN team_articles a ON a.id=r.article_id AND a.version=r.article_version
      WHERE ${whereScope(1, 'r')} AND r.user_id=$5 AND r.article_id=ANY($6::uuid[])`, [...tuple(scope), actor.id, articles.map(article => article.id)]);
    const readById = new Map(reads.rows.map(row => [row.articleId, response(row).readAt]));
    // An initially empty curriculum still needs configuration. If its last
    // accessible instructions were removed, deletion must not trap an enrollee.
    const removedMaterials = !articles.length && (await client.query(`SELECT EXISTS(
      SELECT FROM team_articles a JOIN team_article_imports i ON i.article_id=a.id
      WHERE ${whereScope(1, 'a')} AND a.deleted_at IS NOT NULL AND split_part(i.folder_path,'/',1)=ANY($5::text[])
        AND (i.visibility='scope' OR (i.visibility='staff' AND $6::boolean) OR (i.visibility='admin' AND $7::boolean))) AS removed`,
    [...tuple(scope), ADAPTATION_FOLDERS, actor.role !== 'driver', canManage(actor)])).rows[0].removed;
    return { required: !assignment.completedAt, completed: Boolean(assignment.completedAt), completedAt: response(assignment).completedAt,
      scopeId: assignment.scopeId, folders: [...ADAPTATION_FOLDERS], articles: articles.map(article => ({ ...article, readAt: readById.get(article.id) || null })),
      total: articles.length, readCount: readById.size, canComplete: readById.size === articles.length && Boolean(articles.length || removedMaterials) };
  }
  async adaptation(supplied) {
    return this.database.transaction(async client => this.adaptationSnapshot(client, await this.current(client, supplied)));
  }
  async readAdaptationArticle(supplied, idValue, body) {
    return this.database.transaction(async client => {
      const actor = await this.current(client, supplied);
      object(body, ['responsibilityScopeId', 'version']);
      if (!Number.isSafeInteger(body.version) || body.version < 1 || body.version >= 2147483646) fail('Укажите версию прочитанной статьи.');
      const scopeId = uuid(body.responsibilityScopeId, 'область работы');
      const id = uuid(idValue, 'статья');
      const scope = await this.workScope(client, actor, scopeId);
      await this.lockScope(client, scope);
      const state = await this.adaptationSnapshot(client, actor);
      const article = state.articles.find(article => article.id === id);
      if (state.scopeId !== scopeId || !article) unavailable();
      if (article.version !== body.version) conflict('Статья изменилась. Прочитайте актуальную версию перед подтверждением.');
      await client.query(`INSERT INTO team_adaptation_reads(user_id,article_id,article_version,legal_entity_id,region_id,project_id,responsibility_scope_id)
        VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(user_id,article_id,article_version) DO NOTHING`, [actor.id, id, body.version, ...tuple(scope)]);
      return this.adaptationSnapshot(client, actor);
    });
  }
  async completeAdaptation(supplied, body, correlationId) {
    return this.database.transaction(async client => {
      const actor = await this.current(client, supplied);
      object(body, ['responsibilityScopeId']);
      const scopeId = uuid(body.responsibilityScopeId, 'область работы');
      const scope = await this.workScope(client, actor, scopeId);
      await this.lockScope(client, scope);
      const state = await this.adaptationSnapshot(client, actor);
      if (state.scopeId !== scopeId) unavailable();
      if (state.completed) return state;
      if (!state.canComplete) conflict('Для завершения адаптации ознакомьтесь со всеми назначенными материалами.');
      const saved = await client.query(`UPDATE users SET adaptation_completed_at=clock_timestamp() WHERE id=$1 AND adaptation_required
        AND adaptation_scope_id=$2 AND adaptation_completed_at IS NULL RETURNING adaptation_completed_at AS "completedAt"`, [actor.id, scopeId]);
      if (!saved.rowCount) conflict('Назначение адаптации изменилось. Обновите страницу.');
      await this.auditWrite(client, actor, scope, correlationId, 'team.adaptation.completed', 'users', actor.id, { articleCount: state.total });
      return { ...state, required: false, completed: true, completedAt: response(saved.rows[0]).completedAt };
    });
  }
  async articleImports(client, ids) {
    if (!ids.length) return new Map();
    const imported = await client.query(`SELECT i.article_id AS "articleId",i.folder_path AS "folderPath",i.source_path AS "sourcePath",
      i.source_archive AS "sourceArchive",i.filename,i.mime_type AS "mimeType",i.sha256,i.visibility,i.imported_title AS "importedTitle",
      i.imported_body_sha256 AS "importedBodySha256",f.byte_size AS "byteSize"
      FROM team_article_imports i JOIN team_knowledge_files f ON f.sha256=i.sha256 WHERE i.article_id=ANY($1::uuid[])`, [ids]);
    return new Map(imported.rows.map(row => [row.articleId, row]));
  }
  async withArticleMetadata(client, actor, scope, rows, permissions) {
    permissions = permissions || await this.knowledgeRights(client, actor, scope);
    const imported = await this.articleImports(client, rows.map(row => row.id));
    return rows.filter(row => !row.deletedAt && articleVisible(actor, imported.get(row.id)))
      .map(row => publicArticle(row, actor, scope, imported.get(row.id), permissions));
  }
  async articleSource(supplied, idValue, scopeId) {
    return this.database.transaction(async client => {
      const actor = await this.current(client, supplied);
      const id = uuid(idValue, 'статья');
      const requestedScopeId = uuid(scopeId, 'область работы');
      let scope;
      try { scope = await this.workScope(client, actor, requestedScopeId); }
      catch (error) { if (error.getStatus?.() === 403) unavailable(); throw error; }
      await this.lockScope(client, scope);
      const article = await client.query(`SELECT id FROM team_articles WHERE ${whereScope()} AND id=$5 AND deleted_at IS NULL`, [...tuple(scope), id]);
      if (!article.rowCount) unavailable();
      const imported = (await this.articleImports(client, [id])).get(id);
      if (!imported || !articleVisible(actor, imported)) unavailable();
      // Global byte deduplication never grants access: authorize the scoped article first.
      const file = await client.query('SELECT content FROM team_knowledge_files WHERE sha256=$1', [imported.sha256]);
      return { filename: imported.filename, byteSize: imported.byteSize, content: file.rows[0].content };
    });
  }
  async importArticle(supplied, body, correlationId) {
    return this.database.transaction(async client => {
      const actor = await this.current(client, supplied);
      if (!canManage(actor)) forbidden('Импортировать документы может только администратор.');
      const input = articleImportInput(body);
      const scopes = [];
      // Check every destination before writing, and lock in a fixed order across imports.
      for (const id of [...input.responsibilityScopeIds].sort()) scopes.push(await this.workScope(client, actor, id));
      for (const scope of scopes) await this.lockScope(client, scope);
      await client.query(`INSERT INTO team_knowledge_files(sha256,byte_size,content) VALUES($1,$2,$3) ON CONFLICT(sha256) DO NOTHING`,
        [input.file.sha256, input.file.byteSize, input.file.content]);
      let createdCount = 0;
      let unchangedCount = 0;
      const articles = [];
      for (const scope of scopes) {
        const id = articleImportId(scope.responsibilityScopeId, input.sourcePath);
        await this.lockRecord(client, 'article', id);
        const found = await client.query(`SELECT ${ARTICLE_COLUMNS},deleted_at AS "deletedAt",legal_entity_id AS "legalEntityId",region_id AS "regionId",
          project_id AS "projectId",responsibility_scope_id AS "responsibilityScopeId" FROM team_articles WHERE id=$1`, [id]);
        const existing = found.rows[0];
        if (existing) {
          if (existing.deletedAt) unavailable();
          const imported = (await this.articleImports(client, [id])).get(id);
          if (!imported || tuple(existing).some((value, index) => value !== tuple(scope)[index]) ||
            imported.sourcePath !== input.sourcePath || imported.folderPath !== input.folderPath || imported.filename !== input.file.filename ||
            imported.mimeType !== input.file.mimeType || imported.sha256 !== input.file.sha256 || imported.byteSize !== input.file.byteSize ||
            imported.visibility !== input.visibility || imported.importedTitle !== input.title || imported.importedBodySha256 !== input.bodySha256)
            conflict('Документ по этому пути уже импортирован с другими данными.');
          const { legalEntityId, regionId, projectId, responsibilityScopeId, ...row } = existing;
          articles.push({ ...publicArticle(row, actor, scope, imported), responsibilityScopeId });
          unchangedCount += 1;
          continue;
        }
        const inserted = await client.query(`INSERT INTO team_articles(id,legal_entity_id,region_id,project_id,responsibility_scope_id,title,body,author_id,author_name,updated_by)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(id) DO NOTHING RETURNING ${ARTICLE_COLUMNS}`,
        [id, ...tuple(scope), input.title, input.body, actor.id, actor.displayName, actor.id]);
        if (!inserted.rowCount) conflict('Идентификатор статьи уже использован.');
        await client.query(`INSERT INTO team_article_imports(article_id,folder_path,source_path,source_archive,filename,mime_type,sha256,visibility,imported_title,imported_body_sha256)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [id, input.folderPath, input.sourcePath, input.sourceArchive, input.file.filename, input.file.mimeType, input.file.sha256,
          input.visibility, input.title, input.bodySha256]);
        await this.auditWrite(client, actor, scope, correlationId, 'team.article.imported', 'team_articles', id,
          { fileCount: 1, visibility: input.visibility });
        articles.push({ ...publicArticle(inserted.rows[0], actor, scope, { ...input, ...input.file }), responsibilityScopeId: scope.responsibilityScopeId });
        createdCount += 1;
      }
      return { articles, createdCount, unchangedCount };
    });
  }
  async deleteArticle(supplied, idValue, body, correlationId) {
    return this.database.transaction(async client => {
      const actor = await this.current(client, supplied), input = articleDeletionInput(body), id = uuid(idValue, 'инструкция');
      if (!canManage(actor)) forbidden('Удалять инструкции может только администратор.');
      const scope = await this.workScope(client, actor, input.responsibilityScopeId);
      const scopes = [...actor.sourceGrants].sort((a, b) => a.responsibilityScopeId.localeCompare(b.responsibilityScopeId));
      // Import takes these same scope locks in UUID order. This also serializes
      // deletion with edits, downloads and adaptation acknowledgements.
      for (const candidate of scopes) await this.lockScope(client, candidate);
      await this.lockRecord(client, 'article-deletion-operation', input.operationId);
      const operation = (await client.query(`SELECT actor_id AS "actorId",article_id AS "articleId",article_version AS version,deleted_ids AS "deletedIds",
        legal_entity_id AS "legalEntityId",region_id AS "regionId",project_id AS "projectId",responsibility_scope_id AS "responsibilityScopeId"
        FROM team_article_deletion_operations WHERE id=$1`, [input.operationId])).rows[0];
      if (operation) {
        if (operation.actorId !== actor.id || operation.articleId !== id || operation.version !== input.version ||
          tuple(operation).some((value, index) => value !== tuple(scope)[index])) conflict('Идентификатор операции уже использован с другими данными.');
        return { deletedIds: operation.deletedIds, deletedCount: operation.deletedIds.length };
      }
      await this.lockRecord(client, 'article', id);
      const selected = (await client.query(`SELECT ${ARTICLE_COLUMNS},deleted_at AS "deletedAt" FROM team_articles
        WHERE ${whereScope()} AND id=$5 FOR UPDATE`, [...tuple(scope), id])).rows[0];
      if (!selected || selected.deletedAt) unavailable();
      if (selected.version !== input.version) conflict('Инструкция уже изменена. Обновите её перед удалением.');
      const imported = (await this.articleImports(client, [id])).get(id);
      const key = knowledgeArticleKey(publicArticle(selected, actor, scope, imported));
      let copies = [{ ...selected, ...scope }];
      if (key) {
        const scopeById = new Map(scopes.map(candidate => [candidate.responsibilityScopeId, candidate]));
        const rows = (await client.query(`SELECT ${ARTICLE_COLUMNS},legal_entity_id AS "legalEntityId",region_id AS "regionId",
          project_id AS "projectId",responsibility_scope_id AS "responsibilityScopeId" FROM team_articles
          WHERE responsibility_scope_id=ANY($1::uuid[]) AND deleted_at IS NULL`, [scopes.map(candidate => candidate.responsibilityScopeId)])).rows;
        const imports = await this.articleImports(client, rows.map(row => row.id));
        copies = rows.filter(row => articleVisible(actor, imports.get(row.id)) &&
          knowledgeArticleKey(publicArticle(row, actor, scopeById.get(row.responsibilityScopeId), imports.get(row.id))) === key);
      }
      copies.sort((a, b) => a.id.localeCompare(b.id));
      const deletedIds = copies.map(row => row.id);
      await client.query(`UPDATE team_articles SET deleted_at=clock_timestamp(),deleted_by=$2,version=version+1,updated_by=$2,updated_at=clock_timestamp()
        WHERE id=ANY($1::uuid[]) AND deleted_at IS NULL`, [deletedIds, actor.id]);
      await client.query(`INSERT INTO team_article_deletion_operations(id,actor_id,article_id,legal_entity_id,region_id,project_id,responsibility_scope_id,article_version,deleted_ids)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::uuid[])`, [input.operationId, actor.id, id, ...tuple(scope), input.version, deletedIds]);
      for (const copy of copies) await this.auditWrite(client, actor, copy, correlationId, 'team.article.deleted', 'team_articles', copy.id,
        { operationId: input.operationId, selectedArticleId: id, version: copy.version + 1, deletedCount: deletedIds.length });
      return { deletedIds, deletedCount: deletedIds.length };
    });
  }
  async saveArticle(supplied, body, correlationId) {
    return this.database.transaction(async client => {
      const actor = await this.current(client, supplied);
      const input = articleInput(body);
      const scope = await this.workScope(client, actor, input.responsibilityScopeId);
      await this.lockScope(client, scope);
      await this.lockRecord(client, 'article', input.id);
      const found = await client.query(`SELECT ${ARTICLE_COLUMNS},deleted_at AS "deletedAt",legal_entity_id AS "legalEntityId",region_id AS "regionId",
        project_id AS "projectId",responsibility_scope_id AS "responsibilityScopeId" FROM team_articles WHERE id=$1 FOR UPDATE`, [input.id]);
      const existing = found.rows[0];
      if (existing && tuple(existing).some((value, index) => value !== tuple(scope)[index])) unavailable();
      if (existing?.deletedAt) unavailable();
      const imported = existing ? (await this.articleImports(client, [input.id])).get(input.id) : null;
      if (!articleVisible(actor, imported)) unavailable();
      const permissions = await this.knowledgeRights(client, actor, scope);
      if (existing && input.version > 0 ? !permissions.canEdit : !permissions.canCreate)
        forbidden(existing && input.version > 0 ? 'Администратор не предоставил право редактировать базу знаний.' : 'Администратор не предоставил право создавать статьи.');
      if ((!existing || existing.structured) && !input.structured) fail('Заполните причину, задачу, текст, результат и выберите должности в поле «Для кого».');
      if (existing && input.version === 0) {
        if (existing.version !== 1 || existing.authorId !== actor.id || existing.title !== input.title || existing.body !== input.body || existing.structured !== input.structured ||
          (input.structured && (existing.reason !== input.reason || existing.purpose !== input.purpose || existing.result !== input.result ||
            JSON.stringify(existing.audiencePositions.map(position => position.id)) !== JSON.stringify(input.audiencePositionIds))))
          conflict('Идентификатор статьи уже использован. Обновите данные.');
        const { legalEntityId, regionId, projectId, responsibilityScopeId, ...row } = existing;
        return publicArticle(row, actor, scope, imported, permissions);
      }
      if ((existing?.version || 0) !== input.version) conflict();
      const audience = input.structured ? await this.articleAudience(client, scope, input.audiencePositionIds) : [];
      let saved;
      if (existing) {
        saved = await client.query(`UPDATE team_articles SET title=$2,body=$3,version=version+1,updated_by=$4,updated_at=clock_timestamp(),
          structured=$10,reason=$11,purpose=$12,result=$13
          WHERE id=$1 AND ${whereScope(5)} AND version=$9 RETURNING ${ARTICLE_COLUMNS}`,
        [input.id, input.title, input.body, actor.id, ...tuple(scope), input.version, input.structured, input.reason || null, input.purpose || null, input.result || null]);
        if (!saved.rowCount) conflict();
      } else {
        saved = await client.query(`INSERT INTO team_articles(id,legal_entity_id,region_id,project_id,responsibility_scope_id,title,body,author_id,author_name,updated_by,structured,reason,purpose,result)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING ${ARTICLE_COLUMNS}`,
        [input.id, ...tuple(scope), input.title, input.body, actor.id, actor.displayName, actor.id, input.structured, input.reason, input.purpose, input.result]);
      }
      if (input.structured) {
        await client.query('DELETE FROM team_article_audience_positions WHERE article_id=$1', [input.id]);
        for (const position of audience) await client.query(`INSERT INTO team_article_audience_positions(article_id,legal_entity_id,position_id,position_title)
          VALUES($1,$2,$3,$4)`, [input.id, scope.legalEntityId, position.id, position.title]);
        saved = await client.query(`SELECT ${ARTICLE_COLUMNS} FROM team_articles WHERE id=$1`, [input.id]);
      }
      await this.auditWrite(client, actor, scope, correlationId, `team.article.${existing ? 'updated' : 'created'}`, 'team_articles', input.id, { version: saved.rows[0].version });
      return publicArticle(saved.rows[0], actor, scope, imported, permissions);
    });
  }
}
Injectable()(TeamService);
Inject(DatabaseService)(TeamService, undefined, 0);
Inject(IdentityRepository)(TeamService, undefined, 1);
Inject(AuditService)(TeamService, undefined, 2);
module.exports = { TeamService, tuple, whereScope, response, canManage, ROLES, POLICY };
