// SPDX-License-Identifier: MIT
'use strict';
const { Module, Controller, Get, Put, Query, Body, Req, Inject, UseGuards, Header } = require('@nestjs/common');
const { IdentityAccessModule } = require('../identity-access/identity-access.module');
const { AuthGuard } = require('../identity-access/interface/auth.guard');
const { CurrentActor } = require('../identity-access/interface/current-actor.decorator');
const { NeuralService } = require('./neural.service');
class NeuralController {
  constructor(service) { this.service = service; }
  settings(actor, scopeId) { return this.service.settings(actor, scopeId); }
  saveSettings(actor, body, scopeId, request) { return this.service.saveSettings(actor, body, scopeId, request.correlationId); }
  usage(actor, query) { return this.service.usage(actor, query); }
}
Inject(NeuralService)(NeuralController, undefined, 0);
Controller('neural')(NeuralController);
UseGuards(AuthGuard)(NeuralController);
for (const [name, route] of [['settings', Get('settings')], ['saveSettings', Put('settings')], ['usage', Get('usage')]]) {
  const descriptor = Object.getOwnPropertyDescriptor(NeuralController.prototype, name);
  route(NeuralController.prototype, name, descriptor);
  Header('Cache-Control', 'no-store')(NeuralController.prototype, name, descriptor);
  CurrentActor()(NeuralController.prototype, name, 0);
}
Query('responsibilityScopeId')(NeuralController.prototype, 'settings', 1);
Body()(NeuralController.prototype, 'saveSettings', 1);
Query('responsibilityScopeId')(NeuralController.prototype, 'saveSettings', 2);
Req()(NeuralController.prototype, 'saveSettings', 3);
Query()(NeuralController.prototype, 'usage', 1);
class NeuralModule {}
Module({ imports: [IdentityAccessModule], controllers: [NeuralController], providers: [NeuralService], exports: [NeuralService] })(NeuralModule);
module.exports = { NeuralModule, NeuralService };
