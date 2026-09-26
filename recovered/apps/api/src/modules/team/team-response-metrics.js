// SPDX-License-Identifier: MIT
'use strict';
const { Injectable, Inject, Controller, Get, Query, Req, Header, UseGuards } = require('@nestjs/common');
const { DatabaseService } = require('../../platform/database.service');
const { AuthGuard } = require('../identity-access/interface/auth.guard');
const { CurrentActor } = require('../identity-access/interface/current-actor.decorator');
const { TeamService, canManage } = require('./team.service');
const { forbidden } = require('./team-input');
const { responseMetricsInput, summarizeResponseMetrics } = require('./team-response-metrics-domain');

// Compute runs over the full history of conversations active in this period:
// truncating history at the start would reset the clock for an older question
// and count a repeated channel reply as a first response. Only metadata is read.
const RESPONSE_EVENTS_SQL = `WITH history AS (
  SELECT m.id,m.conversation_id,m.parent_id,m.author_id,m.created_at,c.kind
  FROM team_messages m JOIN team_conversations c ON c.id=m.conversation_id
    AND c.legal_entity_id=m.legal_entity_id AND c.region_id=m.region_id
    AND c.project_id=m.project_id AND c.responsibility_scope_id=m.responsibility_scope_id
  WHERE c.id=ANY($1::uuid[]) AND c.deleted_at IS NULL AND m.deleted_at IS NULL AND m.created_at<$3
), direct_changes AS (
  SELECT *,lag(author_id) OVER(PARTITION BY conversation_id ORDER BY created_at,id) AS previous_author
  FROM history WHERE kind='direct'
), direct_messages AS (
  SELECT *,sum(CASE WHEN previous_author=author_id THEN 0 ELSE 1 END)
    OVER(PARTITION BY conversation_id ORDER BY created_at,id) AS run_number
  FROM direct_changes
), direct_runs AS (
  SELECT conversation_id,author_id,run_number,min(created_at) AS started_at
  FROM direct_messages GROUP BY conversation_id,author_id,run_number
), direct_history AS (
  SELECT *,lag(started_at) OVER(PARTITION BY conversation_id ORDER BY run_number) AS previous_start,
    lead(run_number) OVER(PARTITION BY conversation_id ORDER BY run_number) AS next_run
  FROM direct_runs
), channel_replies AS (
  SELECT child.author_id,child.conversation_id,child.created_at,parent.created_at AS parent_created_at,
    row_number() OVER(PARTITION BY child.parent_id,child.author_id ORDER BY child.created_at,child.id) AS reply_number
  FROM history child JOIN history parent ON parent.id=child.parent_id AND parent.conversation_id=child.conversation_id
  WHERE child.kind='channel' AND child.author_id<>parent.author_id AND child.created_at>=parent.created_at
)
SELECT author_id AS "userId",conversation_id AS "conversationId",'direct' AS kind,
  extract(epoch FROM (started_at-previous_start))::double precision AS "durationSeconds"
FROM direct_history WHERE previous_start IS NOT NULL AND started_at>=$2 AND started_at<$3
UNION ALL
SELECT author_id,conversation_id,'channel',extract(epoch FROM (created_at-parent_created_at))::double precision
FROM channel_replies WHERE reply_number=1 AND created_at>=$2 AND created_at<$3
UNION ALL
SELECT member.user_id,run.conversation_id,'pending',extract(epoch FROM ($3::timestamptz-run.started_at))::double precision
FROM direct_history run JOIN team_members member ON member.conversation_id=run.conversation_id AND member.user_id<>run.author_id
WHERE run.next_run IS NULL AND run.started_at>=$2 AND run.started_at<$3`;

class TeamResponseMetricsService {
  constructor(database, team) { this.database = database; this.team = team; }

  async list(supplied, query, correlationId) {
    const input = responseMetricsInput(query);
    return this.database.transaction(async client => {
      const actor = await this.team.current(client, supplied);
      if (!canManage(actor)) forbidden('Скорость ответов доступна только администратору.');
      const scopes = await this.team.selectedScopes(client, actor, input.responsibilityScopeId);
      const companyIds = [...new Set(scopes.map(scope => scope.legalEntityId))];
      const people = new Map();
      for (const companyId of companyIds) {
        const scope = scopes.find(candidate => candidate.legalEntityId === companyId);
        for (const person of await this.team.peopleRows(client, actor, scope)) {
          if (!people.has(person.id) || scope.personalDataVisible) people.set(person.id, person);
        }
      }
      const periodEnd = new Date(), periodStart = new Date(periodEnd.getTime() - input.days * 86400000);
      const conversations = (await client.query(`SELECT c.id,c.kind,c.visibility,c.legal_entity_id AS "legalEntityId",
          c.region_id AS "regionId",c.project_id AS "projectId",c.responsibility_scope_id AS "responsibilityScopeId",
          ARRAY(SELECT user_id FROM team_members WHERE conversation_id=c.id ORDER BY user_id) AS "memberIds"
        FROM team_conversations c WHERE c.legal_entity_id=ANY($1::uuid[]) AND c.deleted_at IS NULL
          AND EXISTS(SELECT 1 FROM team_messages m WHERE m.conversation_id=c.id AND m.deleted_at IS NULL
            AND m.created_at>=$2 AND m.created_at<$3)
        ORDER BY c.id`, [companyIds, periodStart, periodEnd])).rows;
      const events = conversations.length ? (await client.query(RESPONSE_EVENTS_SQL,
        [conversations.map(conversation => conversation.id), periodStart, periodEnd])).rows : [];
      for (const conversation of conversations) {
        if (conversation.visibility !== 'private' || conversation.memberIds.includes(actor.id)) continue;
        await this.team.auditWrite(client, actor, conversation, correlationId,
          conversation.kind === 'direct' ? 'team.direct.admin_read' : 'team.channel.admin_read', 'team_conversations', conversation.id,
          { source: 'response_metrics', memberIds: conversation.memberIds, days: input.days,
            periodStart: periodStart.toISOString(), periodEnd: periodEnd.toISOString() });
      }
      return { days: input.days, periodStart: periodStart.toISOString(), periodEnd: periodEnd.toISOString(),
        generatedAt: periodEnd.toISOString(), ...summarizeResponseMetrics([...people.values()], events) };
    });
  }
}

Injectable()(TeamResponseMetricsService);
Inject(DatabaseService)(TeamResponseMetricsService, undefined, 0);
Inject(TeamService)(TeamResponseMetricsService, undefined, 1);
class TeamResponseMetricsController {
  constructor(service) { this.service = service; }
  list(actor, query, request) { return this.service.list(actor, query, request.correlationId); }
}
Inject(TeamResponseMetricsService)(TeamResponseMetricsController, undefined, 0);
Controller('team/response-metrics')(TeamResponseMetricsController);
UseGuards(AuthGuard)(TeamResponseMetricsController);
const descriptor = Object.getOwnPropertyDescriptor(TeamResponseMetricsController.prototype, 'list');
Get()(TeamResponseMetricsController.prototype, 'list', descriptor);
Header('Cache-Control', 'no-store')(TeamResponseMetricsController.prototype, 'list', descriptor);
CurrentActor()(TeamResponseMetricsController.prototype, 'list', 0);
Query()(TeamResponseMetricsController.prototype, 'list', 1);
Req()(TeamResponseMetricsController.prototype, 'list', 2);
module.exports = { TeamResponseMetricsService, TeamResponseMetricsController };
