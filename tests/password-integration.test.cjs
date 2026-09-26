"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID, createHmac, createHash } = require("node:crypto");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { createTestServer } = require("./local-test-server.cjs");

test("phone/password credentials with PostgreSQL, scoped administration and actual HTTP API", { timeout: 180_000 }, async t => {
  const fixture = await createTestServer({ telegramOnboarding: true });
  t.after(() => fixture.close());
  const { request, devLogin, adminPool: db, ids } = fixture;
  function expectStatus(response, status) {
    assert.equal(response.status, status, `Expected HTTP ${status}, got ${response.status}`);
    return response.body;
  }
  const phone = "+79991234567";
  const otherPhone = "+79991234568";
  let admin;
  let credentials;
  let session;
  let resetCredentials;

  async function issue(userId, targetPhone, bearer = admin.accessToken) {
    return request("POST", `/access/users/${userId}/password`, { phone: targetPhone }, bearer);
  }
  async function login(targetPhone, password) {
    return request("POST", "/auth/password", { phone: targetPhone, password });
  }
  function signed(provider, id) {
    const values = {
      auth_date: String(Math.floor(Date.now() / 1000)),
      query_id: randomUUID(), user: JSON.stringify({ id, first_name: "Synthetic" }),
    };
    const canonical = Object.entries(values).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => `${k}=${v}`).join("\n");
    const secret = createHmac("sha256", "WebAppData").update(process.env[provider === "max" ? "MAX_BOT_TOKEN" : "TELEGRAM_BOT_TOKEN"]).digest();
    return new URLSearchParams({ ...values, hash: createHmac("sha256", secret).update(canonical).digest("hex") }).toString();
  }
  async function createEmployee(role = "driver", grant = true) {
    const id = randomUUID();
    await db.query("INSERT INTO users(id,display_name,role,active,approved) VALUES($1,'Synthetic password integration employee',$2,true,true)", [id, role]);
    await db.query("INSERT INTO employee_directory(user_id,source_kind) VALUES($1,'existing')", [id]);
    if (grant) await db.query(`INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id)
      SELECT $1,legal_entity_id,region_id,project_id,responsibility_scope_id FROM access_grants WHERE user_id=$2`, [id, ids.drivers[0]]);
    return id;
  }

  await t.test("password migration is applied and unknown login cannot create an employee", async () => {
    assert.ok((await db.query("SELECT name FROM schema_migrations WHERE name LIKE '018_%'")).rowCount);
    const before = Number((await db.query("SELECT count(*) FROM users")).rows[0].count);
    expectStatus(await login("+79990009999", "unknownSyntheticPassword"), 401);
    assert.equal(Number((await db.query("SELECT count(*) FROM users")).rows[0].count), before);
    admin = await devLogin(ids.admin);
  });

  await t.test("bootstrap CLI provisions only a fresh administrator and refuses to reset it", async () => {
    const script = path.resolve(__dirname, "../recovered/scripts/bootstrap-password.cjs");
    const run = input => spawnSync(process.execPath, [script], { input, encoding: "utf8", env: process.env, timeout: 15_000 });
    const invalid = run("not a phone\n");
    assert.equal(invalid.status, 1);
    assert.equal(invalid.stdout, "");
    const before = admin.accessToken;
    const first = run("8 (999) 000-01-23\n");
    assert.equal(first.status, 0, "Bootstrap must succeed; run npm run build before integration tests so its dist helper is current");
    assert.equal(first.stderr, "");
    const issued = JSON.parse(first.stdout);
    assert.equal(issued.userId, ids.admin);
    assert.equal(issued.phone, "+79990000123");
    assert.ok(issued.password.length >= 12);
    expectStatus(await request("GET", "/me", undefined, before), 401);
    admin = expectStatus(await login(issued.phone, issued.password), 200);
    assert.equal(admin.actor.role, "access_admin");
    assert.equal(admin.actor.channel, "web");
    const repeat = run("+79990000124\n");
    assert.equal(repeat.status, 1);
    assert.equal(repeat.stdout, "");
    assert.match(repeat.stderr, /already configured/);
    assert.equal((await db.query("SELECT phone FROM phone_credentials WHERE user_id=$1", [ids.admin])).rows[0].phone, issued.phone);
    assert.equal(JSON.stringify((await db.query("SELECT payload FROM audit_events")).rows).includes(issued.password), false);
  });

  await t.test("scoped administrator issues one generated password and normalizes Russian 8 prefix", async () => {
    credentials = expectStatus(await issue(ids.drivers[0], "8 (999) 123-45-67"), 201);
    assert.equal(credentials.userId, ids.drivers[0]);
    assert.equal(credentials.phone, phone);
    assert.equal(typeof credentials.password, "string");
    assert.ok(credentials.password.length >= 12);
    assert.ok(Number.isFinite(Date.parse(credentials.issuedAt)));
    assert.equal((await db.query("SELECT phone FROM phone_credentials WHERE user_id=$1", [ids.drivers[0]])).rows[0].phone, phone);
  });

  await t.test("phone normalization variants log into the same employee with a web session", async () => {
    for (const formattedPhone of [phone, "79991234567", "89991234567", "+7 (999) 123-45-67"]) {
      session = expectStatus(await login(formattedPhone, credentials.password), 200);
      assert.equal(session.actor.id, ids.drivers[0]);
      assert.equal(session.actor.role, "driver");
      assert.equal(session.actor.channel, "web");
      assert.equal(session.actor.grants.length, 1);
    }
    const me = expectStatus(await request("GET", "/me", undefined, session.accessToken), 200);
    assert.equal(me.id, ids.drivers[0]);
    const trips = expectStatus(await request("GET", "/trips", undefined, session.accessToken), 200);
    assert.deepEqual(trips.items.map(trip => trip.id), [ids.trips[0]]);
    expectStatus(await request("GET", `/trips/${ids.trips[1]}`, undefined, session.accessToken), 404);
  });

  await t.test("incorrect password gets a generic denial with no account or credential disclosure", async () => {
    const wrong = expectStatus(await login(phone, "wrongSyntheticPassword"), 401);
    const unknown = expectStatus(await login("+79990009998", "wrongSyntheticPassword"), 401);
    assert.equal(wrong.message, unknown.message);
    for (const result of [wrong, unknown]) {
      const text = JSON.stringify(result);
      assert.equal(text.includes(credentials.password), false);
      assert.equal(text.includes(ids.drivers[0]), false);
      assert.equal(text.includes(phone), false);
    }
  });

  await t.test("database keeps only salted scrypt hashes and audit never contains passwords", async () => {
    const stored = (await db.query("SELECT * FROM phone_credentials WHERE user_id=$1", [ids.drivers[0]])).rows[0];
    assert.equal(stored.hash_algorithm, "scrypt-v1");
    assert.match(stored.password_salt, /^[0-9a-f]{64}$/);
    assert.match(stored.password_hash, /^[0-9a-f]{128}$/);
    assert.equal(JSON.stringify(stored).includes(credentials.password), false);
    assert.equal(JSON.stringify((await db.query("SELECT payload FROM audit_events")).rows).includes(credentials.password), false);
    const privileged = (await db.query("SELECT has_table_privilege('transport_app','phone_credentials','DELETE,TRUNCATE') AS deletion")).rows[0];
    assert.equal(privileged.deletion, false);
  });

  await t.test("phone number uniqueness survives normalization and leaves the existing login intact", async () => {
    expectStatus(await issue(ids.drivers[1], "8 (999) 123-45-67"), 409);
    assert.equal((await db.query("SELECT 1 FROM phone_credentials WHERE user_id=$1", [ids.drivers[1]])).rowCount, 0);
    expectStatus(await login(phone, credentials.password), 200);
  });

  await t.test("concurrent issuance cannot assign one normalized phone to two employees", async () => {
    const targets = await Promise.all([createEmployee(), createEmployee()]);
    const results = await Promise.all([issue(targets[0], "+79991234601"), issue(targets[1], "8 (999) 123-46-01")]);
    assert.deepEqual(results.map(result => result.status).sort(), [201, 409]);
    assert.equal((await db.query("SELECT 1 FROM phone_credentials WHERE phone='+79991234601'")).rowCount, 1);
  });

  await t.test("password issuance rejects anonymous, driver and out-of-scope administrators", async () => {
    expectStatus(await request("POST", `/access/users/${ids.drivers[1]}/password`, { phone: otherPhone }), 401);
    expectStatus(await issue(ids.drivers[1], otherPhone, session.accessToken), 403);
    const foreignAdmin = await createEmployee("access_admin", false);
    const foreignScope = randomUUID();
    await db.query("INSERT INTO responsibility_scopes(id,project_id,name) VALUES($1,$2,'Outside admin scope')", [foreignScope, ids.project]);
    await db.query("INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id) VALUES($1,$2,$3,$4,$5)", [foreignAdmin, ids.legal, ids.region, ids.project, foreignScope]);
    const foreignSession = await devLogin(foreignAdmin);
    expectStatus(await issue(ids.drivers[1], otherPhone, foreignSession.accessToken), 403);
  });

  await t.test("malformed phone, extra credential fields and missing password are rejected", async () => {
    for (const value of ["", "123", "+7-not-a-number", "+7\n9991234567"]) expectStatus(await issue(ids.drivers[1], value), 400);
    expectStatus(await request("POST", `/access/users/${ids.drivers[1]}/password`, { phone: otherPhone, password: "ClientCannotChoosePassword" }, admin.accessToken), 400);
    expectStatus(await request("POST", "/auth/password", { phone }), 400);
    expectStatus(await request("POST", "/auth/password", { phone, password: credentials.password, userId: ids.admin }), 400);
  });

  await t.test("a password reset invalidates old passwords and every pre-reset session", async () => {
    const oldWeb = session.accessToken;
    const oldDev = (await devLogin(ids.drivers[0])).accessToken;
    const version = session.actor.authVersion;
    resetCredentials = expectStatus(await issue(ids.drivers[0], phone), 201);
    assert.notEqual(resetCredentials.password, credentials.password);
    expectStatus(await request("GET", "/me", undefined, oldWeb), 401);
    expectStatus(await request("GET", "/me", undefined, oldDev), 401);
    expectStatus(await login(phone, credentials.password), 401);
    session = expectStatus(await login(phone, resetCredentials.password), 200);
    assert.ok(session.actor.authVersion > version);
  });

  await t.test("inactive, unapproved and unscoped accounts cannot use issued passwords", async () => {
    const target = await createEmployee();
    const issued = expectStatus(await issue(target, "+79991234570"), 201);
    for (const column of ["active", "approved"]) {
      await db.query(`UPDATE users SET ${column}=false WHERE id=$1`, [target]);
      expectStatus(await login(issued.phone, issued.password), 401);
      expectStatus(await issue(target, issued.phone), 403);
      await db.query(`UPDATE users SET ${column}=true WHERE id=$1`, [target]);
    }
    await db.query("DELETE FROM access_grants WHERE user_id=$1", [target]);
    expectStatus(await login(issued.phone, issued.password), 401);
    expectStatus(await issue(target, issued.phone), 403);
  });

  await t.test("driver, dispatcher and document specialist retain their existing roles", async () => {
    for (const [userId, targetPhone, role] of [[ids.dispatcher, "+79991234571", "dispatcher"], [ids.specialist, "+79991234572", "document_specialist"]]) {
      const issued = expectStatus(await issue(userId, targetPhone), 201);
      const result = expectStatus(await login(targetPhone, issued.password), 200);
      assert.equal(result.actor.role, role);
      assert.equal(result.actor.channel, "web");
    }
    for (const [role, targetPhone] of [["mechanic", "+79991234573"], ["auditor", "+79991234574"]]) {
      const target = await createEmployee(role);
      const issued = expectStatus(await issue(target, targetPhone), 201);
      assert.equal(expectStatus(await login(targetPhone, issued.password), 200).actor.role, role);
    }
  });

  await t.test("five wrong passwords persist a lock across an API restart", async () => {
    const issued = expectStatus(await issue(ids.drivers[1], otherPhone), 201);
    for (let attempt = 0; attempt < 5; attempt++) expectStatus(await login(otherPhone, "wrongSyntheticPassword"), 401);
    const ledger = (await db.query("SELECT failure_count,blocked_until > now() AS blocked FROM phone_login_attempts WHERE phone_hash=$1", [createHash("sha256").update(otherPhone).digest("hex")])).rows[0];
    assert.ok(ledger.failure_count >= 5);
    assert.equal(ledger.blocked, true);
    expectStatus(await login(otherPhone, issued.password), 401);
    await fixture.restartApi();
    expectStatus(await login(otherPhone, issued.password), 401);
    // An authorized reset must recover access without waiting for a time window.
    const reset = expectStatus(await issue(ids.drivers[1], otherPhone), 201);
    expectStatus(await login(otherPhone, reset.password), 200);
    for (let attempt = 0; attempt < 5; attempt++) expectStatus(await login(otherPhone, "wrongSyntheticPassword"), 401);
    await db.query("UPDATE phone_login_attempts SET window_started_at=now()-interval '16 minutes',blocked_until=now()-interval '1 second' WHERE phone_hash=$1", [createHash("sha256").update(otherPhone).digest("hex")]);
    expectStatus(await login(otherPhone, reset.password), 200);
    assert.equal((await db.query("SELECT failure_count FROM phone_login_attempts WHERE phone_hash=$1", [createHash("sha256").update(otherPhone).digest("hex")])).rows[0].failure_count, 0);
  });

  await t.test("phone hint authenticates messenger signatures and reads only the bound employee's own phone", async () => {
    expectStatus(await request("POST", "/auth/phone-hint", { provider: "max", initData: "invalid" }), 401);
    const unrelated = expectStatus(await request("POST", "/auth/phone-hint", { provider: "max", initData: signed("max", 801230002) }), 200);
    assert.equal(unrelated.phone, null);
    const externalId = 801230001;
    const invitation = expectStatus(await request("POST", "/access/max-invitations", { userId: ids.drivers[0], maxUserId: String(externalId) }, admin.accessToken), 201);
    const initData = signed("max", externalId);
    // Hint polling is permitted before login and must not consume auth replay.
    assert.equal(expectStatus(await request("POST", "/auth/phone-hint", { provider: "max", initData }), 200).phone, null);
    expectStatus(await request("POST", "/auth/max", { initData, invitationToken: invitation.invitationToken }), 200);
    for (let poll = 0; poll < 2; poll++) assert.equal(expectStatus(await request("POST", "/auth/phone-hint", { provider: "max", initData }), 200).phone, phone);
    assert.equal(expectStatus(await request("POST", "/auth/phone-hint", { provider: "telegram", initData: signed("telegram", externalId) }), 200).phone, null);
  });

  await t.test("only a verified Telegram webhook can capture the sender's own contact phone hint", async () => {
    const externalId = 801230010;
    const initData = signed("telegram", externalId);
    const update = { update_id: 90001, message: {
      message_id: 90001, date: Math.floor(Date.now() / 1000),
      from: { id: externalId, is_bot: false, first_name: "Synthetic" },
      chat: { id: externalId, type: "private" },
      contact: { user_id: externalId, phone_number: "79991234999", first_name: "Synthetic" },
    } };
    expectStatus(await request("POST", "/integrations/telegram/webhook", update), 401);
    assert.equal(expectStatus(await request("POST", "/auth/phone-hint", { provider: "telegram", initData }), 200).phone, null);
    const secretHeader = { "X-Telegram-Bot-Api-Secret-Token": process.env.TELEGRAM_WEBHOOK_SECRET };
    expectStatus(await request("POST", "/integrations/telegram/webhook", { ...update, message: { ...update.message, contact: { ...update.message.contact, user_id: externalId + 1 } } }, undefined, secretHeader), 200);
    assert.equal(expectStatus(await request("POST", "/auth/phone-hint", { provider: "telegram", initData }), 200).phone, null);
    expectStatus(await request("POST", "/integrations/telegram/webhook", update, undefined, secretHeader), 200);
    assert.equal(expectStatus(await request("POST", "/auth/phone-hint", { provider: "telegram", initData }), 200).phone, "+79991234999");
    assert.equal(expectStatus(await request("POST", "/auth/phone-hint", { provider: "max", initData: signed("max", externalId) }), 200).phone, null);
  });

  await t.test("phone web sessions can download a file and the URL is invalidated on revocation", async () => {
    const body = { filename: "phone.csv", contentType: "text/csv;charset=utf-8", contentBase64: Buffer.from("a,b\n1,2").toString("base64") };
    const download = expectStatus(await request("POST", "/max/downloads", body, session.accessToken), 201);
    const response = await fetch(new URL(new URL(download.url).pathname, fixture.origin));
    assert.equal(response.status, 200);
    assert.equal(await response.text(), "a,b\n1,2");
    const revokedDownload = expectStatus(await request("POST", "/max/downloads", body, session.accessToken), 201);
    expectStatus(await request("POST", `/access/users/${ids.drivers[0]}/revoke`, { reasonCode: "access_review" }, admin.accessToken), 200);
    expectStatus(await request("GET", "/me", undefined, session.accessToken), 401);
    expectStatus(await login(phone, resetCredentials.password), 401);
    assert.equal((await fetch(new URL(new URL(revokedDownload.url).pathname, fixture.origin))).status, 404);
  });

  await t.test("administrator self-reset returns the new password before invalidating their own session", async () => {
    const reset = expectStatus(await issue(ids.admin, "+79990000123"), 201);
    expectStatus(await request("GET", "/me", undefined, admin.accessToken), 401);
    const fresh = expectStatus(await login(reset.phone, reset.password), 200);
    assert.equal(fresh.actor.id, ids.admin);
    assert.equal(fresh.actor.role, "access_admin");
  });
});
