"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { createTestServer } = require("./local-test-server.cjs");

test("recruiter role can be created, authenticated and used only within its permitted recruiting company", { timeout: 180_000 }, async t => {
  const fixture = await createTestServer();
  t.after(() => fixture.close());
  const { request, devLogin, adminPool: db, ids } = fixture;
  const personalScope = randomUUID();
  const foreignScope = randomUUID();
  const foreignLegal = randomUUID(), foreignRegion = randomUUID(), foreignProject = randomUUID();
  await db.query("INSERT INTO legal_entities(id,name) VALUES($1,$2)", [foreignLegal, "Synthetic foreign company"]);
  await db.query("INSERT INTO regions(id,name,time_zone) VALUES($1,$2,$3)", [foreignRegion, "Synthetic foreign region", "Europe/Moscow"]);
  await db.query("INSERT INTO projects(id,name,legal_entity_id,region_id) VALUES($1,$2,$3,$4)", [foreignProject, "Synthetic foreign project", foreignLegal, foreignRegion]);
  await db.query("INSERT INTO responsibility_scopes(id,project_id,name) VALUES($1,$2,$3),($4,$5,$6)", [
    personalScope, ids.project, "Synthetic recruiter personal-data scope", foreignScope, foreignProject, "Synthetic foreign scope",
  ]);
  await db.query(`INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id,finance_visible,personal_data_visible)
    VALUES($1,$2,$3,$4,$5,true,true)`, [ids.admin, ids.legal, ids.region, ids.project, personalScope]);
  const admin = await devLogin(ids.admin);
  const input = (scopeId = ids.scope, role = "recruiter") => ({ role, scopeId, idempotencyKey: randomUUID() });
  function expect(response, status) {
    assert.equal(response.status, status, `Expected HTTP ${status}, got ${response.status}: ${JSON.stringify(response.body)}`);
    return response.body;
  }
  const create = (body, token = admin.accessToken) => request("POST", "/access/employees/demo", body, token);
  const grants = async id => (await db.query(`SELECT legal_entity_id,region_id,project_id,responsibility_scope_id,
    finance_visible,personal_data_visible FROM access_grants WHERE user_id=$1`, [id])).rows;
  const snapshotRoute = scope => `/recruitment?responsibilityScopeId=${scope}`;
  let limited, recruiter, session;

  await t.test("options and employee search accept the recruiter role without exposing administrator creation", async () => {
    assert.ok((await db.query("SELECT name FROM schema_migrations WHERE name LIKE '026_%'")).rowCount);
    const options = expect(await request("GET", "/access/employees/options", undefined, admin.accessToken), 200);
    assert.equal(options.demoCreationEnabled, true);
    assert.ok(options.roles.includes("recruiter"));
    assert.ok(!options.roles.includes("access_admin"));
    assert.ok(options.scopes.some(scope => scope.id === personalScope));
    assert.ok(!options.scopes.some(scope => scope.id === foreignScope));
    assert.deepEqual(expect(await request("GET", "/access/employees?role=recruiter", undefined, admin.accessToken), 200).items, []);
    expect(await create(input(ids.scope, "access_admin")), 400);
    expect(await create(input(foreignScope)), 403);
    expect(await create({ ...input(), personalDataVisible: true }), 400);
  });

  await t.test("creation inherits only the selected scope personal-data grant and idempotently creates one account", async () => {
    const body = input();
    const responses = await Promise.all([create(body), create(body)]);
    limited = expect(responses[0], 201);
    assert.equal(expect(responses[1], 201).id, limited.id);
    assert.equal(limited.role, "recruiter");
    assert.equal(limited.sourceKind, "demo_manual");
    assert.equal(limited.active, true);
    assert.equal(limited.approved, true);
    assert.match(limited.displayName, /Тестовый рекрутер/);
    assert.deepEqual(await grants(limited.id), [{
      legal_entity_id: ids.legal, region_id: ids.region, project_id: ids.project,
      responsibility_scope_id: ids.scope, finance_visible: false, personal_data_visible: false,
    }]);
    assert.equal((await db.query("SELECT 1 FROM employee_creation_requests WHERE actor_id=$1 AND idempotency_key=$2", [ids.admin, body.idempotencyKey])).rowCount, 1);
    expect(await create({ ...body, scopeId: personalScope }), 409);
    const login = await devLogin(limited.id);
    assert.equal(login.actor.role, "recruiter");
    assert.deepEqual(expect(await request("GET", "/recruitment/context", undefined, login.accessToken), 200).scopes, []);
    expect(await request("GET", snapshotRoute(ids.scope), undefined, login.accessToken), 403);
    expect(await request("GET", snapshotRoute(personalScope), undefined, login.accessToken), 403);
    assert.deepEqual(expect(await request("GET", "/recruitment/reminders", undefined, login.accessToken), 200).tasks, []);
  });

  await t.test("a recruiter receives an existing personal-data grant but never finance access", async () => {
    recruiter = expect(await create(input(personalScope)), 201);
    assert.equal(recruiter.role, "recruiter");
    assert.deepEqual(await grants(recruiter.id), [{
      legal_entity_id: ids.legal, region_id: ids.region, project_id: ids.project,
      responsibility_scope_id: personalScope, finance_visible: false, personal_data_visible: true,
    }]);
    const list = expect(await request("GET", "/access/employees?role=recruiter", undefined, admin.accessToken), 200);
    assert.deepEqual(list.items.map(item => item.id).sort(), [limited.id, recruiter.id].sort());
    for (const [id, personalDataVisible] of [[limited.id, false], [recruiter.id, true]]) {
      const events = (await db.query("SELECT payload FROM audit_events WHERE payload->>'action'='access.demo_user_created' AND payload->>'entityId'=$1", [id])).rows;
      assert.equal(events.length, 1);
      assert.equal(events[0].payload.metadata.role, "recruiter");
      assert.equal(events[0].payload.metadata.financeVisible, false);
      assert.equal(events[0].payload.metadata.personalDataVisible, personalDataVisible);
    }
  });

  await t.test("existing demo roles keep their previous restricted grants", async () => {
    for (const role of ["driver", "dispatcher", "manager", "document_specialist", "mechanic"]) {
      const employee = expect(await create(input(personalScope, role)), 201);
      const [grant] = await grants(employee.id);
      assert.equal(grant.finance_visible, false, `${role} must not inherit finance access`);
      assert.equal(grant.personal_data_visible, false, `${role} must preserve its existing demo defaults`);
    }
  });

  await t.test("dev and phone authentication preserve the recruiter role and its exact scope", async () => {
    const development = await devLogin(recruiter.id);
    assert.equal(development.actor.role, "recruiter");
    assert.equal(development.actor.grants.length, 1);
    assert.equal(development.actor.grants[0].responsibilityScopeId, personalScope);
    const credentials = expect(await request("POST", `/access/users/${recruiter.id}/password`, { phone: "+79990007321" }, admin.accessToken), 201);
    session = expect(await request("POST", "/auth/password", { phone: credentials.phone, password: credentials.password }), 200);
    assert.equal(session.actor.id, recruiter.id);
    assert.equal(session.actor.role, "recruiter");
    assert.equal(session.actor.channel, "web");
    assert.equal(expect(await request("GET", "/me", undefined, session.accessToken), 200).role, "recruiter");
  });

  await t.test("recruiting records are available across the company without granting access to other companies or sections", async () => {
    const token = session.accessToken;
    const context = expect(await request("GET", "/recruitment/context", undefined, token), 200);
    assert.deepEqual(new Set(context.scopes.map(scope => scope.responsibilityScopeId)), new Set([ids.scope, personalScope]));
    const before = expect(await request("GET", snapshotRoute(personalScope), undefined, token), 200);
    assert.ok(before.recruiters.some(item => item.id === recruiter.id));
    assert.ok(!before.recruiters.some(item => item.id === limited.id));
    const candidate = expect(await request("PUT", "/recruitment/candidates", {
      id: randomUUID(), responsibilityScopeId: personalScope, version: 0,
      fullName: "Синтетический кандидат рекрутера", phone: "+79990007322", city: "Москва",
      kind: "driver", recruiterId: recruiter.id, source: "manual", archived: false,
    }, token), 200);
    assert.equal(candidate.version, 1);
    const demand = expect(await request("PUT", "/recruitment/requests", {
      id: randomUUID(), responsibilityScopeId: personalScope, version: 0,
      title: "Синтетическая потребность рекрутера", city: "Москва", kind: "driver", quantity: 1,
      priority: "normal", status: "open", recruiterId: recruiter.id,
    }, token), 200);
    const application = expect(await request("PUT", "/recruitment/applications", {
      id: randomUUID(), responsibilityScopeId: personalScope, version: 0,
      candidateId: candidate.id, requestId: demand.id, recruiterId: recruiter.id, stage: "interview",
    }, token), 200);
    const saved = expect(await request("GET", snapshotRoute(personalScope), undefined, token), 200);
    assert.deepEqual(saved.candidates.find(item => item.id === candidate.id), candidate);
    assert.deepEqual(saved.applications.find(item => item.id === application.id), application);
    expect(await request("GET", snapshotRoute(ids.scope), undefined, token), 200);
    expect(await request("GET", snapshotRoute(foreignScope), undefined, token), 403);
    expect(await request("PUT", "/recruitment/candidates", { ...candidate, id: randomUUID(), version: 0, responsibilityScopeId: foreignScope }, token), 403);
    for (const route of ["/planning/context", "/finance/tariffs", "/finance/registries", "/access/employees", "/access/employees/options"]) {
      expect(await request("GET", route, undefined, token), 403);
    }
    assert.deepEqual(expect(await request("GET", "/trips", undefined, token), 200), { items: [], nextCursor: null });
    expect(await request("GET", `/trips/${ids.trips[0]}`, undefined, token), 404);
    expect(await create(input(personalScope), token), 403);
    expect(await request("POST", `/access/users/${ids.drivers[0]}/password`, { phone: "+79990007323" }, token), 403);
  });
});
