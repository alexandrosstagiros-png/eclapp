// SPDX-License-Identifier: MIT
'use strict';
const { Controller, Inject, Post, Body, Header, HttpCode, UseGuards, HttpException } = require('@nestjs/common');
const { AuthGuard } = require('../identity-access/interface/auth.guard');
const { CurrentActor } = require('../identity-access/interface/current-actor.decorator');
const { fieldsOnly } = require('./onboarding-input');
const { uuid } = require('./recruitment-input');
const dadata = require('./dadata');

function createDadataController(ContractService) {
  class DadataController {
    constructor(contracts) { this.contracts = contracts; this.limits = new Map(); }
    async authorize(supplied, scopeId) {
      return this.contracts.database.transaction(async client => {
        const actor = await this.contracts.current(client, supplied);
        this.contracts.scope(actor, scopeId);
        return actor;
      });
    }
    async lookup(supplied, body, kind) {
      fieldsOnly(body, ['responsibilityScopeId', 'query']);
      const scopeId = uuid(body.responsibilityScopeId);
      const actor = await this.authorize(supplied, scopeId);
      const query = dadata.lookupQuery(body.query, kind);
      const now = Date.now();
      for (const [key, entry] of this.limits) if (entry.until <= now && !entry.pending) this.limits.delete(key);
      let entry = this.limits.get(actor.id);
      if (!entry || entry.until <= now) {
        entry = { count: 0, pending: entry?.pending || 0, until: now + 60000 };
        this.limits.set(actor.id, entry);
      }
      if (entry.count >= 20 || entry.pending >= 2) throw new HttpException({code:'DADATA_RATE_LIMIT',message:'Слишком много запросов реквизитов. Повторите поиск через минуту.'},429);
      entry.count++; entry.pending++;
      try {
        const result = await dadata.lookup(kind, query);
        await this.authorize(supplied, scopeId);
        return result;
      } finally { entry.pending--; }
    }
    party(actor, body) { return this.lookup(actor, body, 'party'); }
    bank(actor, body) { return this.lookup(actor, body, 'bank'); }
  }
  Inject(ContractService)(DadataController, undefined, 0);
  Controller('recruitment/contracts')(DadataController);
  UseGuards(AuthGuard)(DadataController);
  for (const [name, route] of [['party','party-lookup'], ['bank','bank-lookup']]) {
    const descriptor = Object.getOwnPropertyDescriptor(DadataController.prototype, name);
    Post(route)(DadataController.prototype, name, descriptor);
    HttpCode(200)(DadataController.prototype, name, descriptor);
    Header('Cache-Control', 'no-store')(DadataController.prototype, name, descriptor);
    CurrentActor()(DadataController.prototype, name, 0);
    Body()(DadataController.prototype, name, 1);
  }
  return DadataController;
}
module.exports = { createDadataController };
