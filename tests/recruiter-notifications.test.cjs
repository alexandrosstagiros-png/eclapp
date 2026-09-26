'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createRequire } = require('node:module');
const { randomUUID } = require('node:crypto');
const { createTestServer } = require('./local-test-server.cjs');
const appRequire = createRequire(path.resolve(__dirname, '../recovered/package.json'));

test('Recruiter cannot read, acknowledge or receive queued trip notifications; direct employee messages remain available', { timeout: 120000 }, async t => {
  process.env.MAX_NOTIFICATIONS_ENABLED = 'true';
  process.env.MAX_WEBHOOK_SECRET = 'synthetic_recruiter_notification_secret_12345';
  process.env.MAX_NOTIFICATIONS_ENABLED_AT = new Date(Date.now() - 10000).toISOString();
  const fixture = await createTestServer();
  const { DatabaseService } = appRequire(path.resolve(__dirname, '../recovered/apps/api/src/platform/database.service.js'));
  const { IdentityRepository } = appRequire(path.resolve(__dirname, '../recovered/apps/api/src/modules/identity-access/infrastructure/identity.repository.js'));
  const { NotificationsWorker } = appRequire(path.resolve(__dirname, '../recovered/apps/api/src/modules/notifications/notifications.worker.js'));
  const { enqueueNotification, eligibleRecipient } = appRequire(path.resolve(__dirname, '../recovered/apps/api/src/modules/notifications/notification-enqueue.js'));
  const database = new DatabaseService({ value: { databaseUrl: process.env.DATABASE_URL } });
  t.after(async () => { await database.pool.end(); await fixture.close(); });
  const worker = new NotificationsWorker(database, new IdentityRepository(database));
  const { adminPool: db, ids, request } = fixture;
  const userId = randomUUID(), tripId = randomUUID();
  const scope = { legalEntityId: ids.legal, regionId: ids.region, projectId: ids.project, responsibilityScopeId: ids.scope };
  await db.query("INSERT INTO users(id,display_name,role,active,approved) VALUES($1,'Synthetic notification recipient','dispatcher',true,true)", [userId]);
  await db.query('INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id,finance_visible,personal_data_visible) VALUES($1,$2,$3,$4,$5,false,true)', [userId, ids.legal, ids.region, ids.project, ids.scope]);
  const event = (type, entityType, entityId) => ({ eventKey: 'recruiter-test:' + randomUUID(), type, recipientIds: [userId], scope, title: 'Synthetic title', body: 'Synthetic content', entityType, entityId });
  // The role may change while a delivery is queued. Stored trip notices must
  // become inaccessible without deleting the user's ordinary staff messages.
  const trip = await database.transaction(client => enqueueNotification(client, event('trip_changed', 'trip', tripId)));
  const message = await database.transaction(client => enqueueNotification(client, event('dispatcher_message', 'notification_message', randomUUID())));
  assert.equal(trip.notificationIds.length, 1);
  assert.equal(message.notificationIds.length, 1);
  await db.query("UPDATE users SET role='recruiter',auth_version=auth_version+1 WHERE id=$1", [userId]);
  const actor = await fixture.devLogin(userId);
  assert.equal(actor.actor.role, 'recruiter');
  assert.equal(await eligibleRecipient(db, userId, scope, 'trip', tripId), false);
  assert.equal(await eligibleRecipient(db, userId, scope, 'notification_message', randomUUID()), true);
  const skipped = await database.transaction(client => enqueueNotification(client, event('trip_changed', 'trip', tripId)));
  assert.equal(skipped.notificationIds.length, 0);

  const list = await request('GET', '/notifications', undefined, actor.accessToken);
  assert.equal(list.status, 200);
  assert.deepEqual(list.body.items.map(item => item.id), message.notificationIds);
  const status = await request('GET', '/notifications/status', undefined, actor.accessToken);
  assert.equal(status.status, 200);
  assert.equal(status.body.pending, 1);
  assert.equal((await request('POST', `/notifications/${trip.notificationIds[0]}/ack`, {}, actor.accessToken)).status, 404);
  assert.equal((await request('POST', `/notifications/${message.notificationIds[0]}/ack`, {}, actor.accessToken)).status, 200);

  await db.query("UPDATE notifications SET created_at=now()-interval '20 minutes',first_sent_at=now()-interval '10 minutes' WHERE id=$1", [trip.notificationIds[0]]);
  await worker.schedule();
  const scheduled = (await db.query('SELECT reminded_at,escalated_at FROM notifications WHERE id=$1', [trip.notificationIds[0]])).rows[0];
  assert.equal(scheduled.reminded_at, null);
  assert.equal(scheduled.escalated_at, null);
  assert.equal(await worker.claimDelivery(), undefined);
  const delivery = (await db.query('SELECT status,last_error FROM notification_deliveries WHERE notification_id=$1', [trip.notificationIds[0]])).rows[0];
  assert.equal(delivery.status, 'failed');
  assert.equal(delivery.last_error, 'ACCESS_REVOKED');
});
