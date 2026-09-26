'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { hasCommunicationScope, hasDepartmentScope } = require('../recovered/apps/api/src/modules/communications/domain/communication-rules.js');
const { CommunicationsService } = require('../recovered/apps/api/src/modules/communications/application/communications.service.js');
const { CommunicationsRepository } = require('../recovered/apps/api/src/modules/communications/infra/communications.repository.js');
const { TelegramDeliveryWorker } = require('../recovered/apps/api/src/modules/communications/infra/telegram-delivery.worker.js');

const scope = { legalEntityId: randomUUID(), regionId: randomUUID(), projectId: randomUUID(), responsibilityScopeId: randomUUID() };
const user = (role) => ({ id: randomUUID(), role, display_name: 'Synthetic user', active: true, approved: true, auth_version: 1 });
const actor = (record) => ({ id: record.id, role: record.role, authVersion: 1, sessionId: randomUUID(), grants: [{ ...scope, personalDataVisible: true, financeVisible: true }] });
const noCall = () => assert.fail('External recruitment access must not load department data');

test('external recruiter grants cannot confer department or owned-ticket access; staff behavior remains available', async () => {
  const external = actor(user('external_recruiter'));
  assert.equal(hasCommunicationScope(external, scope), false);
  assert.equal(hasDepartmentScope(external, scope, false), false);
  assert.equal(hasDepartmentScope(external, scope, true), false);
  const staff = actor(user('recruiter'));
  assert.equal(hasCommunicationScope(staff, scope), true);
  assert.equal(hasDepartmentScope(staff, scope, false), true);
  const driver = actor(user('driver'));
  assert.equal(hasCommunicationScope(driver, scope), true);
  assert.equal(hasDepartmentScope(driver, scope, false), false);

  const service = new CommunicationsService({ member: noCall }, {}, {});
  assert.equal(await service.allowed({}, external, { ...scope, requesterId: external.id }), false);
  assert.deepEqual(await service.recipients({}, { ...scope, requesterId: external.id }, external), []);
  assert.deepEqual(await new CommunicationsRepository({}).memberships({ query: noCall }, external), []);
});

test('communications service rejects a current external session before reading scope labels', async () => {
  const external = actor(user('external_recruiter'));
  const service = new CommunicationsService({ database: { transaction: operation => operation({}) }, scopes: noCall }, {
    lockUsers: async () => {}, actorBySession: async () => external,
  }, {});
  await assert.rejects(service.catalog(external), error => error.getStatus?.() === 403);
});

test('Telegram bot resolves changed external roles before loading grants or ticket content', async () => {
  const external = user('external_recruiter');
  const service = new CommunicationsService({}, {
    channelUser: async () => external.id,
    lockUsers: async () => {},
    user: async () => external,
    grants: noCall,
  }, {});
  assert.equal(await service.telegramActor({}, '123456789'), undefined);
});

async function queuedDelivery(externalSide) {
  const sender = user(externalSide === 'sender' ? 'external_recruiter' : 'dispatcher');
  const recipient = user(externalSide === 'recipient' ? 'external_recruiter' : 'dispatcher');
  const people = new Map([[sender.id, sender], [recipient.id, recipient]]);
  const delivery = { id: randomUUID(), ticket_id: null, sender_id: sender.id, recipient_id: recipient.id,
    origin: 'application', chat_id: '123456789', status: 'pending', attempts: 0, content: 'Synthetic private message' };
  let failed;
  let sent = 0;
  const client = { query: async (sql, values) => {
    if (sql.startsWith('SELECT * FROM telegram_deliveries')) return { rows: [delivery] };
    if (sql.startsWith("UPDATE telegram_deliveries SET status='failed'")) {
      failed = values[1];
      return { rowCount: 1, rows: [] };
    }
    assert.fail(`Unexpected delivery query: ${sql}`);
  } };
  const database = { pool: { query: async () => ({ rows: [delivery] }) }, transaction: operation => operation(client) };
  const identity = { lockUsers: async () => {}, user: async (_client, id) => people.get(id),
    channelUser: async () => recipient.id, grants: async () => [{ ...scope, personalDataVisible: true, financeVisible: true }] };
  const core = new CommunicationsService({}, identity, {});
  const worker = new TelegramDeliveryWorker(database, core, identity, { append: async () => {} });
  assert.equal(await worker.drain({ send: async () => { sent += 1; return { messageId: 1 }; } }), true);
  assert.equal(failed, 'ACCESS_REVOKED');
  assert.equal(sent, 0);
}

test('queued Telegram delivery becomes inaccessible when recipient changes to external recruiter', async () => {
  await queuedDelivery('recipient');
});

test('queued application delivery is cancelled when its sender changes to external recruiter', async () => {
  await queuedDelivery('sender');
});
