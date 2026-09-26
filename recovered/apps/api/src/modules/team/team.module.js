// SPDX-License-Identifier: MIT
"use strict";
const { Module, Injectable, Inject, Controller, Get, Put, Post, Body, Param, Query, Req, Res, Header, UseGuards } = require('@nestjs/common');
const { DatabaseService } = require('../../platform/database.service');
const { IdentityAccessModule } = require('../identity-access/identity-access.module');
const { AuthGuard } = require('../identity-access/interface/auth.guard');
const { CurrentActor } = require('../identity-access/interface/current-actor.decorator');
const { TeamService } = require('./team.service');
const { TeamInsightsService } = require('./team-insights');
const { TeamProfileService, ProfileController, TeamProfileController } = require('./team-profile');
const { TeamBirthdaysService, TeamBirthdaysController } = require('./team-birthdays');
const { TeamOrganizationTasksService, TeamOrganizationTasksController } = require('./team-organization-tasks');
const { TeamOutcomesService, TeamOutcomesController } = require('./team-outcomes');
const { TeamResponseMetricsService, TeamResponseMetricsController } = require('./team-response-metrics');
const { attachmentDisposition } = require('./team-input');
Injectable()(TeamInsightsService);
Inject(DatabaseService)(TeamInsightsService, undefined, 0);
Inject(TeamService)(TeamInsightsService, undefined, 1);
class TeamController {
  constructor(service, insights) { this.service = service; this.insights = insights; }
  notificationPreferences(actor) { return this.service.notificationPreferences(actor); }
  setNotificationPreferences(actor, body) { return this.service.setNotificationPreferences(actor, body); }
  setConversationNotificationPreferences(actor, id, body) { return this.service.setConversationNotificationPreferences(actor, id, body); }
  readConversation(actor, id, body, request) { return this.service.readConversation(actor, id, body, request.correlationId); }
  unread(actor, scopeId, request) { return this.service.unread(actor, scopeId, request.correlationId); }
  context(actor) { return this.service.context(actor); }
  people(actor, scopeId) { return this.service.people(actor, scopeId); }
  conversations(actor, scopeId, request) { return this.service.conversations(actor, scopeId, request.correlationId); }
  detail(actor, id, scopeId, before, request) { return this.service.detail(actor, id, scopeId, before, request.correlationId); }
  createConversation(actor, body, request) { return this.service.createConversation(actor, body, request.correlationId); }
  setConversationAccess(actor, id, body, request) { return this.service.setConversationAccess(actor, id, body, request.correlationId); }
  setChannelLifecycle(actor, id, body, request) { return this.service.setChannelLifecycle(actor, id, body, request.correlationId); }
  setChannelOrder(actor, id, body, request) { return this.service.setChannelOrder(actor, id, body, request.correlationId); }
  send(actor, body, request) { return this.service.send(actor, body, request.correlationId); }
  editMessage(actor, id, body, request) { return this.service.changeMessage(actor, id, body, 'edit', request.correlationId); }
  deleteMessage(actor, id, body, request) { return this.service.changeMessage(actor, id, body, 'delete', request.correlationId); }
  react(actor, id, body, request) { return this.service.react(actor, id, body, request.correlationId); }
  setModeration(actor, id, body, request) { return this.service.setModeration(actor, id, body, request.correlationId); }
  changes(actor, id, scopeId, after, request, readMessageIds) { return this.service.changes(actor, id, scopeId, after, request.correlationId, readMessageIds); }
  mentions(actor, scopeId, before) { return this.service.mentions(actor, scopeId, before); }
  readMention(actor, id, body) { return this.service.readMention(actor, id, body); }
  source(actor, id, scopeId, request) { return this.service.source(actor, id, scopeId, request.correlationId); }
  async attachment(actor, id, scopeId, request, response) {
    const file = await this.service.attachment(actor, id, scopeId, request.correlationId);
    response.setHeader('Content-Type', 'application/octet-stream');
    response.setHeader('Content-Disposition', attachmentDisposition(file.filename));
    response.setHeader('Content-Length', String(file.byteSize));
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Content-Security-Policy', 'sandbox');
    response.setHeader('Cache-Control', 'no-store');
    response.send(file.content);
  }
  articles(actor, scopeId) { return this.service.articles(actor, scopeId); }
  articlePositions(actor, scopeId) { return this.service.articlePositions(actor, scopeId); }
  saveArticle(actor, body, request) { return this.service.saveArticle(actor, body, request.correlationId); }
  deleteArticle(actor, id, body, request) { return this.service.deleteArticle(actor, id, body, request.correlationId); }
  importArticle(actor, body, request) { return this.service.importArticle(actor, body, request.correlationId); }
  knowledgePermissions(actor, scopeId) { return this.service.knowledgePermissions(actor, scopeId); }
  saveKnowledgePermission(actor, body, request) { return this.service.saveKnowledgePermission(actor, body, request.correlationId); }
  adaptation(actor) { return this.service.adaptation(actor); }
  readAdaptationArticle(actor, id, body) { return this.service.readAdaptationArticle(actor, id, body); }
  completeAdaptation(actor, body, request) { return this.service.completeAdaptation(actor, body, request.correlationId); }
  async articleSource(actor, id, scopeId, response) {
    const file = await this.service.articleSource(actor, id, scopeId);
    response.setHeader('Content-Type', 'application/octet-stream');
    response.setHeader('Content-Disposition', attachmentDisposition(file.filename));
    response.setHeader('Content-Length', String(file.byteSize));
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Content-Security-Policy', 'sandbox');
    response.setHeader('Cache-Control', 'no-store');
    response.send(file.content);
  }
  summaries(actor, query) { return this.insights.summaries(actor, query); }
  generate(actor, body, request) { return this.insights.generate(actor, body, request.correlationId); }
  share(actor, id, body, request) { return this.insights.share(actor, id, body, request.correlationId); }
  schedules(actor, query) { return this.insights.schedules(actor, query); }
  saveSchedule(actor, body, request) { return this.insights.saveSchedule(actor, body, request.correlationId); }
}
Inject(TeamService)(TeamController, undefined, 0);
Inject(TeamInsightsService)(TeamController, undefined, 1);
Controller('team')(TeamController);
UseGuards(AuthGuard)(TeamController);
const routes = [['notificationPreferences', Get('notification-preferences')], ['setNotificationPreferences', Put('notification-preferences')],
  ['setConversationNotificationPreferences', Put('conversations/:id/notification-preferences')], ['readConversation', Put('conversations/:id/read')], ['unread', Get('unread')], ['context', Get('context')], ['people', Get('people')], ['conversations', Get('conversations')], ['detail', Get('conversations/:id')],
  ['createConversation', Post('conversations')], ['send', Post('messages')], ['source', Get('messages/:id')], ['attachment', Get('attachments/:id')], ['articles', Get('articles')], ['saveArticle', Put('articles')],
  ['editMessage', Put('messages/:id')], ['deleteMessage', Put('messages/:id/deletion')], ['react', Put('messages/:id/reactions')],
  ['setConversationAccess', Put('conversations/:id/access')], ['setModeration', Put('conversations/:id/moderation')], ['changes', Get('conversations/:id/changes')],
  ['setChannelLifecycle', Put('conversations/:id/lifecycle')], ['setChannelOrder', Put('conversations/:id/order')],
  ['importArticle', Post('articles/import')], ['articleSource', Get('articles/:id/source')], ['deleteArticle', Put('articles/:id/deletion')], ['articlePositions', Get('article-positions')],
  ['knowledgePermissions', Get('knowledge-permissions')], ['saveKnowledgePermission', Put('knowledge-permissions')], ['adaptation', Get('adaptation')],
  ['readAdaptationArticle', Put('adaptation/articles/:id/read')], ['completeAdaptation', Put('adaptation/complete')],
  ['mentions', Get('mentions')], ['readMention', Put('mentions/:id/read')],
  ['summaries', Get('summaries')], ['generate', Post('summaries')], ['share', Put('summaries/:id/sharing')], ['schedules', Get('schedules')], ['saveSchedule', Put('schedules')]];
for (const [name, decorator] of routes) {
  const descriptor = Object.getOwnPropertyDescriptor(TeamController.prototype, name);
  decorator(TeamController.prototype, name, descriptor);
  Header('Cache-Control', 'no-store')(TeamController.prototype, name, descriptor);
  CurrentActor()(TeamController.prototype, name, 0);
}
for (const name of ['people', 'conversations', 'articles', 'articlePositions', 'knowledgePermissions']) Query('responsibilityScopeId')(TeamController.prototype, name, 1);
Req()(TeamController.prototype, 'conversations', 2);
Query('responsibilityScopeId')(TeamController.prototype, 'unread', 1);
Req()(TeamController.prototype, 'unread', 2);
Body()(TeamController.prototype, 'setNotificationPreferences', 1);
for (const name of ['summaries', 'schedules']) Query()(TeamController.prototype, name, 1);
for (const name of ['createConversation', 'send', 'saveArticle', 'importArticle', 'saveKnowledgePermission', 'completeAdaptation', 'generate', 'saveSchedule']) {
  Body()(TeamController.prototype, name, 1); Req()(TeamController.prototype, name, 2);
}
Param('id')(TeamController.prototype, 'detail', 1);
Query('responsibilityScopeId')(TeamController.prototype, 'detail', 2);
Query('before')(TeamController.prototype, 'detail', 3);
Req()(TeamController.prototype, 'detail', 4);
Param('id')(TeamController.prototype, 'changes', 1);
Query('responsibilityScopeId')(TeamController.prototype, 'changes', 2);
Query('afterChange')(TeamController.prototype, 'changes', 3);
Req()(TeamController.prototype, 'changes', 4);
Query('readMessageIds')(TeamController.prototype, 'changes', 5);
for (const name of ['editMessage', 'deleteMessage', 'react', 'setModeration', 'setConversationAccess', 'setChannelLifecycle', 'setChannelOrder', 'setConversationNotificationPreferences', 'readConversation', 'deleteArticle']) {
  Param('id')(TeamController.prototype, name, 1);
  Body()(TeamController.prototype, name, 2);
  Req()(TeamController.prototype, name, 3);
}
Param('id')(TeamController.prototype, 'source', 1);
Query('responsibilityScopeId')(TeamController.prototype, 'source', 2);
Req()(TeamController.prototype, 'source', 3);
Param('id')(TeamController.prototype, 'attachment', 1);
Query('responsibilityScopeId')(TeamController.prototype, 'attachment', 2);
Req()(TeamController.prototype, 'attachment', 3);
Res()(TeamController.prototype, 'attachment', 4);
Param('id')(TeamController.prototype, 'articleSource', 1);
Query('responsibilityScopeId')(TeamController.prototype, 'articleSource', 2);
Res()(TeamController.prototype, 'articleSource', 3);
Query('responsibilityScopeId')(TeamController.prototype, 'mentions', 1);
Query('before')(TeamController.prototype, 'mentions', 2);
Param('id')(TeamController.prototype, 'readMention', 1);
Body()(TeamController.prototype, 'readMention', 2);
Param('id')(TeamController.prototype, 'readAdaptationArticle', 1);
Body()(TeamController.prototype, 'readAdaptationArticle', 2);
Param('id')(TeamController.prototype, 'share', 1);
Body()(TeamController.prototype, 'share', 2);
Req()(TeamController.prototype, 'share', 3);
class TeamModule {}
Module({ imports: [IdentityAccessModule], controllers: [TeamController, TeamOrganizationTasksController, TeamOutcomesController, ProfileController, TeamProfileController, TeamBirthdaysController, TeamResponseMetricsController], providers: [TeamService, TeamInsightsService, TeamOrganizationTasksService, TeamOutcomesService, TeamProfileService, TeamBirthdaysService, TeamResponseMetricsService] })(TeamModule);
module.exports = { TeamModule, TeamService, TeamInsightsService };
