"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { createTestServer } = require("./local-test-server.cjs");
const hash = value => createHash("sha256").update(value).digest("hex");

test("remembered devices rotate real PostgreSQL credentials through the HTTP API", { timeout: 120000 }, async t => {
  const fixture = await createTestServer();
  t.after(() => fixture.close());
  const { origin, adminPool: db, ids } = fixture;
  const admin = await fixture.devLogin(ids.admin);
  const issued = await fixture.request("POST", `/access/users/${ids.drivers[0]}/password`, { phone: "+79990004567" }, admin.accessToken);
  assert.equal(issued.status, 201);
  let password = issued.body.password;
  const phone = issued.body.phone;
  async function call(route, { body = {}, cookie, access, headers = {}, method = "POST" } = {}) {
    const response = await fetch(`${origin}/api/v1${route}`, {
      method,
      headers: { "Content-Type": "application/json", Origin: origin, "X-Session-Refresh": "1", ...(cookie ? { Cookie: cookie } : {}), ...(access ? { Authorization: `Bearer ${access}` } : {}), ...headers },
      ...(method === "GET" || method === "OPTIONS" ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(10000),
    });
    const text = await response.text();
    const setCookie = response.headers.get("set-cookie");
    return { status: response.status, body: text ? JSON.parse(text) : null, headers: response.headers, cookie: setCookie?.split(";")[0], setCookie };
  }
  const login = (rememberDevice, cookie) => call("/auth/password", { body: { phone, password, ...(rememberDevice === undefined ? {} : { rememberDevice }) }, cookie });
  const refresh = cookie => call("/auth/refresh", { cookie });
  const token = cookie => cookie.slice(cookie.indexOf("=") + 1);
  const deviceFor = async cookie => (await db.query("SELECT d.*,t.consumed_at FROM remembered_devices d JOIN remembered_device_tokens t ON t.device_id=d.id WHERE t.token_hash=$1", [hash(token(cookie))])).rows[0];

  await t.test("default password login remembers the device without disclosing refresh credentials in JSON", async () => {
    const result = await login();
    assert.equal(result.status, 200);
    assert.equal(result.body.rememberedDevice, true);
    assert.equal(result.body.refreshToken, undefined);
    assert.ok(result.setCookie.includes("HttpOnly; SameSite=Lax"));
    assert.ok(result.setCookie.includes("Path=/api/v1/auth"));
    const row = await deviceFor(result.cookie);
    assert.equal(row.user_id, ids.drivers[0]);
    assert.ok(Math.abs(row.expires_at - Date.now() - 30 * 86400000) < 10000);
    assert.ok(Math.abs(row.absolute_expires_at - Date.now() - 90 * 86400000) < 10000);
    assert.ok(Math.abs(Date.parse(result.body.expiresAt) - Date.now() - 1800000) < 10000);
    const stored = await db.query("SELECT * FROM remembered_device_tokens WHERE device_id=$1", [row.id]);
    assert.equal(stored.rows[0].token_hash, hash(token(result.cookie)));
    assert.equal(JSON.stringify(stored.rows).includes(token(result.cookie)), false);
    assert.equal(JSON.stringify((await db.query("SELECT payload FROM audit_events")).rows).includes(token(result.cookie)), false);
  });

  await t.test("device-status detects missing cookies and does not rotate an existing credential", async () => {
    assert.deepEqual((await call("/auth/device-status")).body, { rememberedDevice: false, rememberedUntil: null });
    const result = await login();
    for (let i = 0; i < 2; i++) {
      const status = await call("/auth/device-status", { cookie: result.cookie });
      assert.equal(status.status, 200);
      assert.equal(status.body.rememberedDevice, true);
      assert.equal(status.setCookie, null);
    }
    assert.equal((await deviceFor(result.cookie)).consumed_at, null);
  });

  await t.test("refresh rotates the cookie and issues access after the original access session expires", async () => {
    const first = await login();
    await db.query("UPDATE sessions SET expires_at=now()-interval '1 second' WHERE id=$1", [first.body.actor.sessionId]);
    const next = await refresh(first.cookie);
    assert.equal(next.status, 200);
    assert.notEqual(next.cookie, first.cookie);
    assert.equal(next.body.actor.id, ids.drivers[0]);
    assert.equal((await call("/me", { method: "GET", access: next.body.accessToken })).status, 200);
    assert.ok((await deviceFor(first.cookie)).consumed_at);
    assert.equal((await deviceFor(next.cookie)).id, (await deviceFor(first.cookie)).id);
  });

  await t.test("rotation preserves another tab's unexpired access session", async () => {
    const first = await login();
    const next = await refresh(first.cookie);
    assert.equal(next.status, 200);
    assert.equal((await call("/me", { method: "GET", access: first.body.accessToken })).status, 200);
  });

  await t.test("rememberDevice false clears the cookie and revokes the previously remembered device", async () => {
    const first = await login();
    const temporary = await login(false, first.cookie);
    assert.equal(temporary.status, 200);
    assert.equal(temporary.body.rememberedDevice, false);
    assert.equal(temporary.body.rememberedUntil, null);
    assert.ok(temporary.setCookie.includes("Max-Age=0"));
    assert.equal((await refresh(first.cookie)).status, 401);
    assert.equal((await call("/me", { method: "GET", access: first.body.accessToken })).status, 401);
    assert.equal((await call("/me", { method: "GET", access: temporary.body.accessToken })).status, 200);
  });

  await t.test("CSRF attempts cannot rotate credentials or clear the existing cookie", async () => {
    const first = await login();
    for (const headers of [{ Origin: "https://evil.example" }, { Origin: "null" }, { "X-Session-Refresh": "" }]) {
      const result = await call("/auth/refresh", { cookie: first.cookie, headers });
      assert.equal(result.status, 403);
      assert.equal(result.setCookie, null);
    }
    const noOrigin = await fetch(`${origin}/api/v1/auth/refresh`, { method: "POST", headers: { Cookie: first.cookie, "X-Session-Refresh": "1", "Content-Type": "application/json" }, body: "{}" });
    assert.equal(noOrigin.status, 403);
    assert.equal((await login(true, undefined)).status, 200);
    assert.equal((await call("/auth/password", { body: { phone, password }, headers: { Origin: "https://evil.example" } })).status, 403);
    assert.equal((await deviceFor(first.cookie)).consumed_at, null);
    const preflight = await call("/auth/refresh", { method: "OPTIONS", headers: { "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type,x-session-refresh" } });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get("access-control-allow-origin"), origin);
    assert.equal(preflight.headers.get("access-control-allow-credentials"), "true");
    assert.ok(preflight.headers.get("access-control-allow-headers").toLowerCase().includes("x-session-refresh"));
  });

  await t.test("concurrent refresh returns one success and a retryable conflict without revoking the device", async () => {
    const first = await login();
    const results = await Promise.all([refresh(first.cookie), refresh(first.cookie)]);
    assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
    assert.equal(results.find(result => result.status === 409).setCookie, null);
    const next = results.find(result => result.status === 200);
    assert.equal((await refresh(next.cookie)).status, 200);
    assert.equal((await deviceFor(first.cookie)).revoked_at, null);
  });

  await t.test("reuse beyond the short concurrency grace revokes the device and its access sessions", async () => {
    const first = await login();
    const next = await refresh(first.cookie);
    await db.query("UPDATE remembered_device_tokens SET consumed_at=now()-interval '16 seconds' WHERE token_hash=$1", [hash(token(first.cookie))]);
    const replay = await refresh(first.cookie);
    assert.equal(replay.status, 401);
    assert.ok(replay.setCookie.includes("Max-Age=0"));
    assert.equal((await refresh(next.cookie)).status, 401);
    for (const result of [first, next]) assert.equal((await call("/me", { method: "GET", access: result.body.accessToken })).status, 401);
    assert.ok((await deviceFor(first.cookie)).revoked_at);
  });

  await t.test("refresh respects both idle expiry and the absolute ninety-day boundary", async () => {
    const first = await login();
    const firstDevice = await deviceFor(first.cookie);
    await db.query("UPDATE remembered_devices SET expires_at=now()-interval '1 second' WHERE id=$1", [firstDevice.id]);
    assert.equal((await refresh(first.cookie)).status, 401);
    const lastDay = await login();
    const device = await deviceFor(lastDay.cookie);
    await db.query("UPDATE remembered_devices SET absolute_expires_at=now()+interval '5 seconds',expires_at=now()+interval '5 seconds' WHERE id=$1", [device.id]);
    const next = await refresh(lastDay.cookie);
    assert.equal(next.status, 200);
    assert.ok(Date.parse(next.body.rememberedUntil) <= Date.now() + 5100);
  });

  await t.test("cookie-only logout works after access expiry and revokes all access from that device", async () => {
    const first = await login();
    const next = await refresh(first.cookie);
    await db.query("UPDATE sessions SET expires_at=now()-interval '1 second' WHERE id=$1", [first.body.actor.sessionId]);
    const result = await call("/auth/logout", { cookie: next.cookie, access: first.body.accessToken });
    assert.equal(result.status, 200);
    assert.ok(result.setCookie.includes("Max-Age=0"));
    assert.equal((await refresh(next.cookie)).status, 401);
    assert.equal((await call("/me", { method: "GET", access: next.body.accessToken })).status, 401);
  });

  await t.test("password reset invalidates every device and active session", async () => {
    const first = await login();
    const other = await login();
    const reset = await fixture.request("POST", `/access/users/${ids.drivers[0]}/password`, { phone }, admin.accessToken);
    assert.equal(reset.status, 201);
    password = reset.body.password;
    for (const result of [first, other]) {
      assert.equal((await refresh(result.cookie)).status, 401);
      assert.equal((await call("/me", { method: "GET", access: result.body.accessToken })).status, 401);
    }
    assert.equal((await login()).status, 200);
  });

  await t.test("inactive, unapproved, unscoped and auth-version mismatched users cannot refresh", async () => {
    for (const column of ["active", "approved"]) {
      const first = await login();
      await db.query(`UPDATE users SET ${column}=false WHERE id=$1`, [ids.drivers[0]]);
      assert.equal((await refresh(first.cookie)).status, 401);
      assert.equal((await call("/auth/device-status", { cookie: first.cookie })).body.rememberedDevice, false);
      await db.query(`UPDATE users SET ${column}=true WHERE id=$1`, [ids.drivers[0]]);
    }
    const versionMismatch = await login();
    await db.query("UPDATE users SET auth_version=auth_version+1 WHERE id=$1", [ids.drivers[0]]);
    assert.equal((await refresh(versionMismatch.cookie)).status, 401);
    const noGrant = await login();
    await db.query("DELETE FROM access_grants WHERE user_id=$1", [ids.drivers[0]]);
    assert.equal((await refresh(noGrant.cookie)).status, 401);
    await db.query("INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id) SELECT $1,legal_entity_id,region_id,project_id,responsibility_scope_id FROM access_grants WHERE user_id=$2", [ids.drivers[0],ids.drivers[1]]);
  });

  await t.test("revoking an employee invalidates the remembered device across an API restart", async () => {
    const first = await login();
    const result = await fixture.request("POST", `/access/users/${ids.drivers[0]}/revoke`, { reasonCode: "access_review" }, admin.accessToken);
    assert.equal(result.status, 200);
    await fixture.restartApi();
    assert.equal((await refresh(first.cookie)).status, 401);
    assert.equal((await call("/auth/device-status", { cookie: first.cookie })).body.rememberedDevice, false);
  });
});
