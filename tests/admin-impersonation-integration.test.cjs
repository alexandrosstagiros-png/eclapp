"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { createTestServer } = require("./local-test-server.cjs");

// Real HTTP requests against an isolated PostgreSQL cluster; no production data.
test("administrator impersonation preserves employee permissions and the original administrator session", { timeout: 180000 }, async t => {
  const f = await createTestServer();
  t.after(() => f.close());
  const { adminPool: db, ids } = f;
  async function call(method, route, body, bearer, cookie) {
    const response = await fetch(`${f.origin}/api/v1${route}`, {
      method, headers: { "Content-Type": "application/json", Origin: f.origin, "X-Session-Refresh": "1",
        ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}), ...(cookie ? { Cookie: cookie } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(10000),
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null, setCookie: response.headers.get("set-cookie") };
  }
  function expect(result, status) {
    assert.equal(result.status, status, JSON.stringify(result.body));
    return result.body;
  }
  const me = bearer => call("GET", "/me", undefined, bearer);
  const start = (parent, userId, cookie) => call("POST", "/auth/impersonate", { userId }, parent?.accessToken, cookie);
  const stop = (child, cookie) => call("POST", "/auth/impersonate/stop", {}, child?.accessToken, cookie);
  async function employee(role = "driver", { grant = true, scope = ids.scope, finance = false, personal = false } = {}) {
    const id = randomUUID();
    await db.query("INSERT INTO users(id,display_name,role,approved) VALUES($1,'Synthetic impersonation employee',$2,true)", [id, role]);
    await db.query("INSERT INTO employee_directory(user_id,source_kind) VALUES($1,'existing')", [id]);
    if (grant) await db.query("INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id,finance_visible,personal_data_visible) VALUES($1,$2,$3,$4,$5,$6,$7)", [id, ids.legal, ids.region, ids.project, scope, finance, personal]);
    return id;
  }
  const admin = await f.devLogin(ids.admin);

  await t.test("start uses exactly the employee role and grants and returns a bounded child session", async () => {
    const direct = await f.devLogin(ids.drivers[0]);
    const response = await start(admin, ids.drivers[0]);
    const child = expect(response, 200);
    assert.equal(response.setCookie, null);
    assert.equal(child.actor.id, ids.drivers[0]);
    assert.equal(child.actor.role, "driver");
    assert.deepEqual(child.actor.grants, direct.actor.grants);
    assert.deepEqual(child.actor.impersonation, {
      administratorId: admin.actor.id, administratorDisplayName: admin.actor.displayName, parentSessionId: admin.actor.sessionId,
    });
    assert.notEqual(child.accessToken, admin.accessToken);
    assert.notEqual(child.actor.sessionId, admin.actor.sessionId);
    assert.equal(child.refreshToken, undefined);
    assert.ok(Date.parse(child.expiresAt) <= Date.parse(admin.expiresAt));
    assert.ok(Date.parse(child.expiresAt) <= Date.now() + 30 * 60000);
    assert.deepEqual(expect(await me(child.accessToken), 200).impersonation, child.actor.impersonation);
    const trips = expect(await call("GET", "/trips", undefined, child.accessToken), 200);
    assert.deepEqual(trips.items.map(trip => trip.id), [ids.trips[0]]);
    expect(await call("GET", `/trips/${ids.trips[1]}`, undefined, child.accessToken), 404);
    expect(await call("GET", "/access/employees", undefined, child.accessToken), 403);
    expect(await call("POST", "/notifications/max/link", { initData: "synthetic-invalid-data" }, child.accessToken), 403);
    const persisted = (await db.query("SELECT impersonation_parent_session_id FROM sessions WHERE id=$1", [child.actor.sessionId])).rows[0];
    assert.equal(persisted.impersonation_parent_session_id, admin.actor.sessionId);
    await f.restartApi();
    assert.equal(expect(await me(child.accessToken), 200).impersonation.parentSessionId, admin.actor.sessionId);
    const stopped = await stop(child);
    expect(stopped, 200);
    assert.equal(stopped.setCookie, null);
    expect(await me(child.accessToken), 401);
    expect(await me(admin.accessToken), 200);
  });

  await t.test("anonymous, non-admin, self, nested and malformed impersonation are rejected without cookies", async () => {
    const driver = await f.devLogin(ids.drivers[0]);
    for (const [parent, target, status] of [[null, ids.drivers[0], 401], [driver, ids.drivers[1], 403], [admin, ids.admin, 403], [admin, randomUUID(), 403]]) {
      const result = await start(parent, target);
      expect(result, status);
      assert.equal(result.setCookie, null);
    }
    for (const body of [{}, { userId: "invalid" }, { userId: ids.drivers[0], role: "access_admin" }]) {
      const result = await call("POST", "/auth/impersonate", body, admin.accessToken);
      expect(result, 400);
      assert.equal(result.setCookie, null);
    }
    const child = expect(await start(admin, await employee("access_admin")), 200);
    const nested = await start(child, ids.drivers[0]);
    expect(nested, 403);
    assert.equal(nested.setCookie, null);
    for (const [route, body] of [
      [`/access/users/${ids.drivers[0]}/password`, { phone: "+79995550222" }],
      [`/access/users/${ids.drivers[0]}/revoke`, { reasonCode: "access_review" }],
      ["/access/employees/demo", { role: "driver", scopeId: ids.scope, idempotencyKey: randomUUID() }],
    ]) expect(await call("POST", route, body, child.accessToken), 403);
    expect(await me(driver.accessToken), 200);
    expect(await stop(child), 200);
    for (const session of [admin, null]) {
      const result = await stop(session);
      assert.ok([400, 401, 403].includes(result.status), JSON.stringify(result.body));
      assert.equal(result.setCookie, null);
    }
  });

  await t.test("full scope tuples and both sensitive-data flags are required; directory agrees", async () => {
    const outsideScope = randomUUID();
    await db.query("INSERT INTO responsibility_scopes(id,project_id,name) VALUES($1,$2,'Outside impersonation scope')", [outsideScope, ids.project]);
    const allowed = await employee();
    const inactive = await employee();
    const unapproved = await employee();
    await db.query("UPDATE users SET active=false WHERE id=$1", [inactive]);
    await db.query("UPDATE users SET approved=false WHERE id=$1", [unapproved]);
    const denied = [inactive, unapproved, await employee("driver", { grant: false }), await employee("driver", { scope: outsideScope }),
      await employee("driver", { finance: true }), await employee("driver", { personal: true })];
    const mixed = await employee();
    await db.query("INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id) VALUES($1,$2,$3,$4,$5)", [mixed, ids.legal, ids.region, ids.project, outsideScope]);
    denied.push(mixed);
    for (const id of denied) {
      const result = await start(admin, id);
      expect(result, 403);
      assert.equal(result.setCookie, null);
    }
    const items = expect(await call("GET", "/access/employees?limit=50", undefined, admin.accessToken), 200).items;
    assert.equal(items.find(row => row.id === allowed).canImpersonate, true);
    for (const id of [ids.admin, inactive, unapproved]) assert.equal(items.find(row => row.id === id).canImpersonate, false);
    for (const id of denied.slice(2)) assert.equal(items.some(row => row.id === id), false);
    const fullAdminId = await employee("access_admin", { finance: true, personal: true });
    const fullAdmin = await f.devLogin(fullAdminId);
    const target = await employee("mechanic", { personal: true });
    const direct = await f.devLogin(target);
    const child = expect(await start(fullAdmin, target), 200);
    assert.equal(child.actor.role, "mechanic");
    assert.deepEqual(child.actor.grants, direct.actor.grants);
    assert.equal(child.actor.grants[0].financeVisible, false);
    assert.equal(child.actor.grants[0].personalDataVisible, true);
    expect(await stop(child), 200);
  });

  await t.test("each request revalidates parent session, admin identity, scope and employee eligibility", async () => {
    const cases = [
      ["parent expiry", (parent) => db.query("UPDATE sessions SET expires_at=now()-interval '1 second' WHERE id=$1", [parent.actor.sessionId])],
      ["parent revocation", (parent) => db.query("UPDATE sessions SET revoked_at=now() WHERE id=$1", [parent.actor.sessionId])],
      ["parent auth version", (parent) => db.query("UPDATE users SET auth_version=auth_version+1 WHERE id=$1", [parent.actor.id])],
      ["parent inactive", (parent) => db.query("UPDATE users SET active=false WHERE id=$1", [parent.actor.id])],
      ["parent unapproved", (parent) => db.query("UPDATE users SET approved=false WHERE id=$1", [parent.actor.id])],
      ["parent role change", (parent) => db.query("UPDATE users SET role='driver' WHERE id=$1", [parent.actor.id])],
      ["parent grant removal", (parent) => db.query("DELETE FROM access_grants WHERE user_id=$1", [parent.actor.id])],
      ["target added finance flag", (_parent, id) => db.query("UPDATE access_grants SET finance_visible=true WHERE user_id=$1", [id])],
      ["target inactive", (_parent, id) => db.query("UPDATE users SET active=false WHERE id=$1", [id])],
      ["target auth version", (_parent, id) => db.query("UPDATE users SET auth_version=auth_version+1 WHERE id=$1", [id])],
    ];
    for (const [name, invalidate] of cases) {
      const parent = await f.devLogin(await employee("access_admin"));
      const target = await employee();
      const child = expect(await start(parent, target), 200);
      await invalidate(parent, target);
      assert.equal((await me(child.accessToken)).status, 401, name);
      const stopped = await stop(child);
      assert.equal(stopped.setCookie, null, name);
    }
    const shortParent = await f.devLogin(await employee("access_admin"));
    await db.query("UPDATE sessions SET expires_at=now()+interval '90 seconds' WHERE id=$1", [shortParent.actor.sessionId]);
    const child = expect(await start(shortParent, ids.drivers[0]), 200);
    const expiry = (await db.query("SELECT expires_at FROM sessions WHERE id=$1", [shortParent.actor.sessionId])).rows[0].expires_at;
    assert.ok(Date.parse(child.expiresAt) <= expiry.getTime());
    expect(await stop(child), 200);
  });

  await t.test("start and stop leave the administrator remembered cookie usable and never issue a child device", async () => {
    const parentId = await employee("access_admin");
    const issued = expect(await call("POST", `/access/users/${parentId}/password`, { phone: "+79995550111" }, admin.accessToken), 201);
    const login = await call("POST", "/auth/password", { phone: issued.phone, password: issued.password });
    const parent = expect(login, 200);
    const cookie = login.setCookie.split(";")[0];
    const result = await start(parent, ids.drivers[0], cookie);
    const child = expect(result, 200);
    assert.equal(result.setCookie, null);
    const stored = (await db.query("SELECT remembered_device_id FROM sessions WHERE id=$1", [child.actor.sessionId])).rows[0];
    assert.equal(stored.remembered_device_id, null);
    const stopped = await stop(child, cookie);
    expect(stopped, 200);
    assert.equal(stopped.setCookie, null);
    const repeated = await stop(child, cookie);
    assert.equal(repeated.setCookie, null);
    expect(await me(parent.accessToken), 200);
    const refreshedResponse = await call("POST", "/auth/refresh", {}, undefined, cookie);
    const refreshed = expect(refreshedResponse, 200);
    const refreshedCookie = refreshedResponse.setCookie.split(";")[0];
    assert.equal(refreshed.actor.id, parentId);
    assert.equal(refreshed.actor.impersonation, undefined);
    const loggedOutChild = expect(await start(refreshed, ids.drivers[0], refreshedCookie), 200);
    const logout = await call("POST", "/auth/logout", {}, loggedOutChild.accessToken, refreshedCookie);
    expect(logout, 200);
    assert.equal(logout.setCookie, null);
    expect(await me(loggedOutChild.accessToken), 401);
    expect(await me(refreshed.accessToken), 200);
    assert.equal(expect(await call("POST", "/auth/device-status", {}, undefined, refreshedCookie), 200).rememberedDevice, true);
    const dependent = expect(await start(refreshed, ids.drivers[0], refreshedCookie), 200);
    expect(await call("POST", "/auth/logout", {}, refreshed.accessToken, refreshedCookie), 200);
    expect(await me(dependent.accessToken), 401);
    const freshParent = await f.devLogin(parentId);
    const resetDependent = expect(await start(freshParent, ids.drivers[0]), 200);
    expect(await call("POST", `/access/users/${parentId}/password`, { phone: issued.phone }, admin.accessToken), 201);
    expect(await me(resetDependent.accessToken), 401);
  });

  await t.test("audit records the original administrator for start, employee actions and stop without leaking context", async () => {
    const eventId = randomUUID();
    const employeeNotice = randomUUID();
    const adminNotice = randomUUID();
    await db.query(`INSERT INTO notification_events(id,event_key,payload_hash,type,legal_entity_id,region_id,project_id,
      responsibility_scope_id,title,body,entity_type,entity_id,actor_id,occurred_at)
      VALUES($1,$2,$3,'dispatcher_message',$4,$5,$6,$7,'Synthetic notice','Audit regression test','notification_message',$1,$8,now())`,
      [eventId, `impersonation:${eventId}`, "a".repeat(64), ids.legal, ids.region, ids.project, ids.scope, ids.admin]);
    await db.query("INSERT INTO notifications(id,event_id,recipient_id) VALUES($1,$2,$3),($4,$2,$5)", [employeeNotice,eventId,ids.drivers[0],adminNotice,ids.admin]);
    const child = expect(await start(admin, ids.drivers[0]), 200);
    expect(await call("POST", `/notifications/${employeeNotice}/ack`, {}, child.accessToken), 200);
    expect(await call("POST", `/notifications/${adminNotice}/ack`, {}, admin.accessToken), 200);
    expect(await stop(child), 200);
    const events = (await db.query("SELECT payload FROM audit_events")).rows.map(row => row.payload);
    const business = events.find(event => event.action === "notifications.acknowledged" && event.entityId === employeeNotice);
    assert.ok(business, "employee action is audited");
    assert.equal(business.actorId, ids.drivers[0]);
    const attribution = { ...child.actor.impersonation, targetUserId: ids.drivers[0], sessionId: child.actor.sessionId };
    assert.deepEqual(business.metadata.impersonation, attribution);
    for (const action of ["auth.impersonation_started", "auth.impersonation_stopped"]) {
      const event = events.find(event => event.action === action && event.metadata?.impersonation?.sessionId === child.actor.sessionId);
      assert.ok(event, action);
      assert.equal(event.actorId, ids.admin);
      assert.deepEqual(event.metadata.impersonation, attribution);
    }
    const ordinary = events.find(event => event.action === "notifications.acknowledged" && event.entityId === adminNotice);
    assert.ok(ordinary);
    assert.equal(ordinary.actorId, ids.admin);
    assert.equal(ordinary.metadata?.impersonation, undefined);
    const serialized = JSON.stringify(events);
    assert.equal(serialized.includes(child.accessToken), false);
    assert.equal(serialized.includes(admin.accessToken), false);
  });

});
