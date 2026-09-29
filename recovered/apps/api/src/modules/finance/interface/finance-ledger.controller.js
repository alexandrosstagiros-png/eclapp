// SPDX-License-Identifier: MIT
'use strict';
const {
  Controller,
  Inject,
  Get,
  Put,
  Post,
  Patch,
  Query,
  Param,
  Body,
  Header,
  UseGuards,
} = require('@nestjs/common');
const { AuthGuard } = require('../../identity-access/interface/auth.guard');
const {
  CurrentActor,
} = require('../../identity-access/interface/current-actor.decorator');
const {
  FinanceLedgerService,
} = require('../application/finance-ledger.service');
class FinanceLedgerController {
  constructor(service) {
    this.service = service;
  }
  snapshot(actor, query) {
    return this.service.snapshot(actor, query);
  }
  detail(actor, id) {
    return this.service.operationDetail(actor, id);
  }
  catalog(actor, kind, body) {
    return this.service.saveCatalog(actor, kind, body);
  }
  company(actor, body) {
    return this.service.saveCompany(actor, body);
  }
  operation(actor, body) {
    return this.service.createOperation(actor, body);
  }
  settlement(actor, body) {
    return this.service.createOperation(actor, body, 'settlement');
  }
  reverse(actor, id, body) {
    return this.service.reverse(actor, id, body);
  }
  bulk(actor, body) {
    return this.service.patchOperations(actor, body);
  }
  patch(actor, id, body) {
    const { version, idempotencyKey, reason, ...patch } = body;
    return this.service.patchOperations(actor, {
      items: [{ id, version }],
      patch,
      idempotencyKey,
      ...(reason ? { reason } : {}),
    });
  }
  close(actor, body) {
    return this.service.closePeriod(actor, body);
  }
  reopen(actor, body) {
    return this.service.reopenPeriod(actor, body);
  }
  previewImport(actor, body) {
    return this.service.previewImport(actor, body);
  }
  readImport(actor, id, query) {
    return this.service.readImport(actor, id, query);
  }
  commitImport(actor, id, body) {
    return this.service.commitImport(actor, id, body);
  }
  suggestions(actor, body) {
    return this.service.suggestions(actor, body);
  }
  sourceStatus(actor, query) {
    return this.service.nativeSources(actor, query, false);
  }
  sourcePreview(actor, body) {
    return this.service.nativeSources(actor, body, true);
  }
  reconcile(actor, body) {
    return this.service.reconcile(actor, body);
  }
}
Inject(FinanceLedgerService)(FinanceLedgerController, undefined, 0);
Controller('finance/ledger')(FinanceLedgerController);
UseGuards(AuthGuard)(FinanceLedgerController);
for (const [name, route] of [
  ['snapshot', Get()],
  ['detail', Get('operations/:id')],
  ['catalog', Put('catalogs/:kind')],
  ['company', Put('companies')],
  ['operation', Post('operations')],
  ['settlement', Post('settlements')],
  ['bulk', Post('operations/bulk')],
  ['reverse', Post('operations/:id/reverse')],
  ['patch', Patch('operations/:id')],
  ['close', Post('periods/close')],
  ['reopen', Post('periods/reopen')],
  ['previewImport', Post('imports/preview')],
  ['readImport', Get('imports/:id')],
  ['commitImport', Post('imports/:id/commit')],
  ['suggestions', Post('suggestions')],
  ['sourceStatus', Get('sources/preview')],
  ['sourcePreview', Post('sources/preview')],
  ['reconcile', Post('reconciliations')],
]) {
  const descriptor = Object.getOwnPropertyDescriptor(
    FinanceLedgerController.prototype,
    name,
  );
  route(FinanceLedgerController.prototype, name, descriptor);
  Header('Cache-Control', 'no-store')(
    FinanceLedgerController.prototype,
    name,
    descriptor,
  );
  CurrentActor()(FinanceLedgerController.prototype, name, 0);
  if (['catalog', 'patch', 'reverse', 'commitImport'].includes(name)) {
    Param(name === 'catalog' ? 'kind' : 'id')(
      FinanceLedgerController.prototype,
      name,
      1,
    );
    Body()(FinanceLedgerController.prototype, name, 2);
  } else if (name === 'detail')
    Param('id')(FinanceLedgerController.prototype, name, 1);
  else if (['snapshot', 'sourceStatus'].includes(name))
    Query()(FinanceLedgerController.prototype, name, 1);
  else if (name === 'readImport') {
    Param('id')(FinanceLedgerController.prototype, name, 1);
    Query()(FinanceLedgerController.prototype, name, 2);
  } else Body()(FinanceLedgerController.prototype, name, 1);
}
module.exports = { FinanceLedgerController };
