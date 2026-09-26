"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { createRequire } = require("node:module");
const { createHmac, randomUUID, createHash } = require("node:crypto");
const { createTestServer } = require("./local-test-server.cjs");
const appRequire = createRequire(path.resolve(__dirname, "../recovered/package.json"));

test("MAX notification linking, durable queue and acknowledgements with real PostgreSQL", { timeout: 120000 }, async t => {
  process.env.MAX_NOTIFICATIONS_ENABLED = "true";
  process.env.MAX_WEBHOOK_SECRET = "synthetic_notification_webhook_secret_12345";
  process.env.MAX_NOTIFICATIONS_ENABLED_AT = new Date(Date.now() - 10000).toISOString();
  const fixture = await createTestServer();
  const { DatabaseService } = appRequire(path.resolve(__dirname, "../recovered/apps/api/src/platform/database.service.js"));
  const { IdentityRepository } = appRequire(path.resolve(__dirname, "../recovered/apps/api/src/modules/identity-access/infrastructure/identity.repository.js"));
  const { NotificationsWorker } = appRequire(path.resolve(__dirname, "../recovered/apps/api/src/modules/notifications/notifications.module.js"));
  const { MaxTransportError } = appRequire(path.resolve(__dirname, "../recovered/apps/api/src/modules/notifications/max-bot.adapter.js"));
  const database = new DatabaseService({ value: { databaseUrl: process.env.DATABASE_URL } });
  const worker = new NotificationsWorker(database, new IdentityRepository(database));
  t.after(async () => { await database.pool.end(); await fixture.close(); });
  const { ids, request, adminPool: db } = fixture;
  const actors = {};
  for (const [name, id] of [["admin", ids.admin], ["dispatcher", ids.dispatcher], ["driver", ids.drivers[0]], ["other", ids.drivers[1]]]) actors[name] = await fixture.devLogin(id);
  const external = { driver: 901230001, other: 901230002, dispatcher: 901230004, admin: 901230005 };
  function signed(id) {
    const values = { auth_date: String(Math.floor(Date.now()/1000)), query_id: randomUUID(), user: JSON.stringify({ id, first_name: "Synthetic" }) };
    const canonical = Object.entries(values).sort(([a],[b]) => a<b?-1:a>b?1:0).map(([k,v]) => `${k}=${v}`).join("\n");
    const secret = createHmac("sha256", "WebAppData").update(process.env.MAX_BOT_TOKEN).digest();
    return new URLSearchParams({ ...values, hash: createHmac("sha256",secret).update(canonical).digest("hex") }).toString();
  }
  async function webhook(body, secret = process.env.MAX_WEBHOOK_SECRET) {
    return request("POST", "/integrations/max/webhook", body, undefined, { "X-Max-Bot-Api-Secret": secret });
  }
  async function lifecycle(name, type, timestamp = Date.now()) {
    return webhook({ update_type: type, timestamp, user: { user_id: external[name] }, chat_id: external[name] });
  }
  async function message(name = "driver", overrides = {}) {
    const body = { recipientIds: [actors[name].actor.id], responsibilityScopeId: ids.scope, idempotencyKey: randomUUID(), title: "Synthetic dispatch message", body: "Synthetic notification text", ...overrides };
    const response = await request("POST", "/notifications/messages", body, actors.dispatcher.accessToken);
    assert.equal(response.status, 201);
    return { ...response.body, body };
  }
  async function isolateQueue() {
    await db.query("UPDATE notification_deliveries SET status='failed',last_error='TEST_FIXTURE_ISOLATION',lease_token=NULL,lease_until=NULL WHERE status IN ('pending','sending')");
    await db.query("UPDATE max_notification_dialogs SET next_send_at=now()-interval '1 second'");
  }
  async function makeDue(id) {
    await db.query("UPDATE notification_deliveries SET next_attempt_at=now()-interval '1 second',lease_until=now()-interval '1 second' WHERE id=$1", [id]);
    await db.query("UPDATE max_notification_dialogs SET next_send_at=now()-interval '1 second'");
  }

  await t.test("MAX account linking is signature-checked, idempotent and cannot hijack another employee", async () => {
    assert.equal((await request("POST", "/notifications/max/link", { initData: "bad" }, actors.driver.accessToken)).status, 400);
    const initData = signed(external.driver);
    for (let i=0;i<2;i++) assert.equal((await request("POST", "/notifications/max/link", { initData }, actors.driver.accessToken)).status, 200);
    assert.equal((await request("POST", "/notifications/max/link", { initData }, actors.other.accessToken)).status, 409);
    assert.equal((await request("POST", "/notifications/max/link", { initData: signed(external.other) }, actors.driver.accessToken)).status, 409);
    for (const name of ["other", "dispatcher", "admin"]) assert.equal((await request("POST", "/notifications/max/link", { initData: signed(external[name]) }, actors[name].accessToken)).status, 200);
    assert.equal((await request("POST", "/notifications/max/link", { initData })).status, 401);
  });

  await t.test("verified lifecycle updates honor timestamp order and do not assume the bot was started", async () => {
    assert.equal((await request("GET", "/notifications/status", undefined, actors.driver.accessToken)).body.botStarted, false);
    assert.equal((await webhook({ update_type: "bot_started", timestamp: Date.now(), user: { user_id: external.driver }, chat_id: external.driver }, "bad-secret")).status, 401);
    const now = Date.now();
    await lifecycle("driver", "bot_started", now - 4000);
    await lifecycle("driver", "bot_stopped", now - 5000);
    assert.equal((await request("GET", "/notifications/status", undefined, actors.driver.accessToken)).body.botStarted, true);
    await lifecycle("driver", "dialog_muted", now - 3000);
    await lifecycle("driver", "dialog_unmuted", now - 4000);
    assert.equal((await request("GET", "/notifications/status", undefined, actors.driver.accessToken)).body.muted, true);
    await lifecycle("driver", "dialog_unmuted", now - 2000);
    for (const name of ["dispatcher", "admin"]) await lifecycle(name, "bot_started", now - 1000);
  });

  await t.test("composer is scoped and idempotent with conflict detection and recipient-only visibility", async () => {
    const sent = await message();
    const repeat = await request("POST", "/notifications/messages", sent.body, actors.dispatcher.accessToken);
    assert.equal(repeat.status, 201);
    assert.deepEqual(repeat.body.notificationIds, sent.notificationIds);
    assert.equal((await request("POST", "/notifications/messages", { ...sent.body, body: "different" }, actors.dispatcher.accessToken)).status, 409);
    assert.equal((await request("POST", "/notifications/messages", { ...sent.body, idempotencyKey: randomUUID() }, actors.driver.accessToken)).status, 403);
    assert.equal((await request("POST", "/notifications/messages", { ...sent.body, idempotencyKey: randomUUID(), responsibilityScopeId: randomUUID() }, actors.admin.accessToken)).status, 403);
    const own = await request("GET", "/notifications", undefined, actors.driver.accessToken);
    assert.ok(own.body.items.some(row => row.id === sent.notificationIds[0]));
    const foreign = await request("GET", "/notifications", undefined, actors.other.accessToken);
    assert.equal(foreign.body.items.some(row => row.id === sent.notificationIds[0]), false);
    assert.equal((await request("POST", `/notifications/${sent.notificationIds[0]}/ack`, {}, actors.other.accessToken)).status, 404);
  });

  await t.test("delivery waits for bot start, then only one worker can hold its lease", async () => {
    await isolateQueue();
    const queued = await message("other");
    assert.equal(await worker.claimDelivery(), undefined);
    const delivery = (await db.query("SELECT * FROM notification_deliveries WHERE notification_id=$1", [queued.notificationIds[0]])).rows[0];
    assert.equal(delivery.attempts, 0);
    assert.equal(delivery.last_error, "BOT_NOT_STARTED");
    await lifecycle("other", "bot_started");
    await makeDue(delivery.id);
    const claims = await Promise.all([worker.claimDelivery(), worker.claimDelivery()]);
    assert.equal(claims.filter(Boolean).length, 1);
    const claim = claims.find(Boolean);
    assert.equal(claim.userId, String(external.other));
    let sends = 0;
    await worker.deliver(claim, { send: async () => { sends++; return { messageId: "synthetic-mid-started" }; } });
    assert.equal(sends, 1);
    assert.equal((await db.query("SELECT status FROM notification_deliveries WHERE id=$1", [claim.id])).rows[0].status, "sent");
    const stored = (await db.query("SELECT token_hash FROM notification_ack_tokens WHERE delivery_id=$1", [claim.id])).rows[0].token_hash;
    assert.equal(stored, createHash("sha256").update(claim.ackToken).digest("hex"));
  });

  await t.test("expired leases reject stale senders and retries back off after rate limiting", async () => {
    await isolateQueue();
    await message();
    const old = await worker.claimDelivery();
    await makeDue(old.id);
    const fresh = await worker.claimDelivery();
    assert.notEqual(fresh.lease, old.lease);
    let sends = 0;
    await worker.deliver(old, { send: async () => { sends++; return { messageId: "stale" }; } });
    assert.equal(sends, 0);
    await worker.deliver(fresh, { send: async () => { throw new MaxTransportError("RATE_LIMITED", 70); } });
    const failed = (await db.query("SELECT status,last_error,next_attempt_at FROM notification_deliveries WHERE id=$1", [fresh.id])).rows[0];
    assert.equal(failed.status, "pending");
    assert.equal(failed.last_error, "RATE_LIMITED");
    assert.ok(failed.next_attempt_at.getTime() - Date.now() >= 69000);
    await makeDue(fresh.id);
    const retry = await worker.claimDelivery();
    await worker.deliver(retry, { send: async () => ({ messageId: "synthetic-mid-retry" }) });
    const callback = (name, id) => ({ update_type: "message_callback", timestamp: Date.now(), callback: { user: { user_id: external[name] }, callback_id: id, payload: "ack:" + fresh.ackToken } });
    await webhook(callback("other", "wrong-owner"));
    assert.equal((await db.query("SELECT acknowledged_at FROM notifications WHERE id=$1", [retry.notificationId])).rows[0].acknowledged_at, null);
    const correct = callback("driver", "right-owner");
    await webhook(correct); await webhook(correct);
    assert.ok((await db.query("SELECT acknowledged_at FROM notifications WHERE id=$1", [retry.notificationId])).rows[0].acknowledged_at);
    assert.equal((await db.query("SELECT 1 FROM max_callback_answers WHERE callback_id='right-owner'")).rowCount, 1);
    await db.query("UPDATE max_notification_dialogs SET next_send_at=now()-interval '1 second'");
    const answer = await worker.claimAnswer();
    assert.equal(answer.callbackId, "right-owner");
    await worker.deliverAnswer(answer, { answer: async () => ({ ok: true }) });
    assert.equal((await db.query("SELECT status FROM max_callback_answers WHERE callback_id='right-owner'")).rows[0].status, "sent");
  });

  await t.test("mute and access revocation after claiming prevent external send", async () => {
    await isolateQueue();
    await message();
    const muted = await worker.claimDelivery();
    await lifecycle("driver", "dialog_muted");
    let sends = 0;
    const port = { send: async () => { sends++; return { messageId: "must-not-send" }; } };
    await worker.deliver(muted, port);
    assert.equal(sends, 0);
    await lifecycle("driver", "dialog_unmuted", Date.now() + 1);
    await isolateQueue();
    await message();
    const revoked = await worker.claimDelivery();
    await db.query("UPDATE users SET active=false WHERE id=$1", [ids.drivers[0]]);
    await worker.deliver(revoked, port);
    assert.equal(sends, 0);
    await db.query("UPDATE users SET active=true WHERE id=$1", [ids.drivers[0]]);
  });

  await t.test("reminder and scoped escalation are scheduled once and never recursively escalate", async () => {
    await isolateQueue();
    const queued = await message();
    const claim = await worker.claimDelivery();
    await worker.deliver(claim, { send: async () => ({ messageId: "synthetic-mid-reminder" }) });
    await db.query("UPDATE notifications SET created_at=now()-interval '901 seconds',first_sent_at=now()-interval '301 seconds' WHERE id=$1", [queued.notificationIds[0]]);
    await worker.schedule(); await worker.schedule();
    const deliveries = await db.query("SELECT kind FROM notification_deliveries WHERE notification_id=$1 ORDER BY kind", [queued.notificationIds[0]]);
    assert.deepEqual(deliveries.rows.map(row => row.kind), ["initial", "reminder"]);
    const escalations = (await db.query("SELECT recipient_id,parent_notification_id FROM notifications WHERE parent_notification_id=$1 ORDER BY recipient_id", [queued.notificationIds[0]])).rows;
    assert.deepEqual(escalations.map(row => row.recipient_id).sort(), [ids.dispatcher,ids.admin].sort());
    assert.ok(escalations.every(row => row.parent_notification_id === queued.notificationIds[0]));
    await db.query("UPDATE notifications SET created_at=now()-interval '901 seconds',first_sent_at=now()-interval '301 seconds' WHERE parent_notification_id=$1", [queued.notificationIds[0]]);
    await worker.schedule();
    assert.equal((await db.query("SELECT 1 FROM notifications n JOIN notifications parent ON n.parent_notification_id=parent.id WHERE parent.parent_notification_id=$1", [queued.notificationIds[0]])).rowCount, 0);
    assert.equal((await request("POST", `/notifications/${queued.notificationIds[0]}/ack`, {}, actors.driver.accessToken)).status, 200);
    assert.equal((await db.query("SELECT status FROM notification_deliveries WHERE notification_id=$1 AND kind='reminder'", [queued.notificationIds[0]])).rows[0].status, "failed");
  });

  await t.test("twenty ineligible old notices cannot starve another employee's reminder and escalation", async () => {
    await isolateQueue();
    const invalidIds = [];
    for (let i=0;i<20;i++) invalidIds.push((await message("other")).notificationIds[0]);
    const eligibleId = (await message()).notificationIds[0];
    await db.query("UPDATE notifications SET created_at=now()-interval '1000 seconds',first_sent_at=now()-interval '301 seconds' WHERE id=ANY($1::uuid[])", [invalidIds]);
    await db.query("UPDATE notifications SET created_at=now()-interval '901 seconds',first_sent_at=now()-interval '301 seconds' WHERE id=$1", [eligibleId]);
    await db.query("UPDATE users SET active=false WHERE id=$1", [ids.drivers[1]]);
    try {
      await worker.schedule();
      const eligible = (await db.query("SELECT reminded_at,escalated_at FROM notifications WHERE id=$1", [eligibleId])).rows[0];
      assert.ok(eligible.reminded_at);
      assert.ok(eligible.escalated_at);
      assert.equal((await db.query("SELECT 1 FROM notification_deliveries WHERE notification_id=$1 AND kind='reminder'", [eligibleId])).rowCount, 1);
      assert.equal((await db.query("SELECT 1 FROM notifications WHERE parent_notification_id=$1", [eligibleId])).rowCount, 2);
      assert.equal((await db.query("SELECT 1 FROM notification_deliveries WHERE notification_id=ANY($1::uuid[]) AND kind='reminder'", [invalidIds])).rowCount, 0);
    } finally {
      await db.query("UPDATE users SET active=true WHERE id=$1", [ids.drivers[1]]);
      // The next scenario does not inherit deliberately aged test records.
      await db.query("UPDATE notifications SET acknowledged_at=clock_timestamp() WHERE id=ANY($1::uuid[])", [[...invalidIds, eligibleId]]);
    }
  });

  await t.test("an escalation claimed before the employee ACK must not be sent afterwards", async () => {
    await isolateQueue();
    const parentId = (await message()).notificationIds[0];
    await db.query("UPDATE notifications SET created_at=now()-interval '901 seconds' WHERE id=$1", [parentId]);
    await worker.schedule();
    const child = (await db.query("SELECT id FROM notifications WHERE parent_notification_id=$1 AND recipient_id=$2", [parentId,ids.dispatcher])).rows[0];
    assert.ok(child);
    await db.query("UPDATE notification_deliveries SET next_attempt_at=now()+interval '1 hour' WHERE notification_id<>$1 AND status='pending'", [child.id]);
    await db.query("UPDATE max_notification_dialogs SET next_send_at=now()-interval '1 second'");
    const claim = await worker.claimDelivery();
    assert.equal(claim.notificationId, child.id);
    assert.equal((await request("POST", `/notifications/${parentId}/ack`, {}, actors.driver.accessToken)).status, 200);
    let sends = 0;
    await worker.deliver(claim, { send: async () => { sends++; return { messageId: "must-not-send-escalation" }; } });
    assert.equal(sends, 0);
    const row = (await db.query("SELECT status,last_error FROM notification_deliveries WHERE id=$1", [claim.id])).rows[0];
    assert.equal(row.status, "failed");
    assert.equal(row.last_error, "PARENT_ACKNOWLEDGED");
  });
});
