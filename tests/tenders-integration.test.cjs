"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { createTestServer } = require("./local-test-server.cjs");

test("tender specialists are created by administrators and work only in their authorized opportunity scope", { timeout: 180_000 }, async t => {
  const fixture = await createTestServer();
  t.after(() => fixture.close());
  const { request, devLogin, adminPool: db, ids } = fixture;
  const peerScope = randomUUID();
  const foreignScope = randomUUID();
  await db.query("INSERT INTO responsibility_scopes(id,project_id,name) VALUES($1,$2,$3),($4,$2,$5)", [
    peerScope, ids.project, "Synthetic second tender team", foreignScope, "Synthetic inaccessible tender team",
  ]);
  await db.query(`INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id)
    VALUES($1,$2,$3,$4,$5)`, [ids.admin, ids.legal, ids.region, ids.project, peerScope]);
  const admin = await devLogin(ids.admin);
  let specialist;
  let session;
  let customer;
  let peerCustomer;
  let tender;
  let firstComment;
  let latestComment;

  function expect(response, status) {
    assert.equal(response.status, status, `Expected HTTP ${status}, got ${response.status}: ${JSON.stringify(response.body)}`);
    return response.body;
  }
  const snapshotRoute = (scope = ids.scope) => `/tenders?responsibilityScopeId=${scope}`;
  const read = (token = session.accessToken, scope = ids.scope) => request("GET", snapshotRoute(scope), undefined, token);
  const createSpecialist = (patch = {}, token = admin.accessToken) => request("POST", "/access/employees/tender-specialist", {
    idempotencyKey: randomUUID(), scopeId: ids.scope, displayName: "Синтетический тендерный специалист", ...patch,
  }, token);
  const customerInput = (patch = {}) => ({ id: randomUUID(), responsibilityScopeId: ids.scope, version: 0, name: "Синтетический заказчик", ...patch });
  const tenderInput = (patch = {}) => ({
    id: randomUUID(), responsibilityScopeId: ids.scope, version: 0, customerId: customer?.id ?? randomUUID(),
    title: "Синтетическая доставка по Москве", status: "planned", vehicleCount: "5–8",
    requirements: "8 паллет, рефрижератор", deliveryType: "city", expectedLaunch: null,
    launchNotes: "Конец октября, год пока не уточнён", submissionDeadline: "2026-10-05",
    nextStep: "Уточнить требования", nextStepDue: "2026-10-01", kind: "tender", closeReason: "", winReason: "", ...patch,
  });
  const putCustomer = (body, token = session.accessToken) => request("PUT", "/tenders/customers", body, token);
  const putTender = (body, token = session.accessToken) => request("PUT", "/tenders/items", body, token);
  function updateInput(patch = {}) {
    return tenderInput(Object.fromEntries([
      "id", "responsibilityScopeId", "version", "customerId", "title", "status", "vehicleCount", "requirements", "deliveryType",
      "expectedLaunch", "launchNotes", "submissionDeadline", "nextStep", "nextStepDue", "kind", "closeReason", "winReason",
    ].map(key => [key, tender[key]]).concat(Object.entries(patch))));
  }
  const commentInput = (text, patch = {}) => ({ id: randomUUID(), responsibilityScopeId: ids.scope, tenderId: tender?.id ?? randomUUID(), text, ...patch });
  const comment = (body, token = session.accessToken) => request("POST", "/tenders/comments", body, token);
  async function employee(role, scope = ids.scope) {
    const id = randomUUID();
    await db.query("INSERT INTO users(id,display_name,role,active,approved) VALUES($1,$2,$3,true,true)", [id, `Synthetic denied ${role}`, role]);
    await db.query(`INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id,personal_data_visible)
      VALUES($1,$2,$3,$4,$5,true)`, [id, ids.legal, ids.region, ids.project, scope]);
    return id;
  }

  await t.test("administrator options expose the role and real creation works with demo creation disabled", async () => {
    assert.equal((await db.query("SELECT name FROM schema_migrations WHERE name LIKE '032_%'")).rowCount, 1);
    const options = expect(await request("GET", "/access/employees/options", undefined, admin.accessToken), 200);
    assert.equal(options.tenderCreationEnabled, true);
    assert.ok(options.roles.includes("tender_specialist"));
    assert.ok(options.scopes.some(scope => scope.id === ids.scope));
    assert.ok(!options.scopes.some(scope => scope.id === foreignScope));
    expect(await createSpecialist({ scopeId: foreignScope }), 403);
    process.env.DEMO_EMPLOYEE_CREATION_ENABLED = "false";
    await fixture.restartApi();
    const creation = { idempotencyKey: randomUUID() };
    try {
      const disabled = expect(await request("GET", "/access/employees/options", undefined, admin.accessToken), 200);
      assert.equal(disabled.demoCreationEnabled, false);
      assert.equal(disabled.tenderCreationEnabled, true);
      specialist = expect(await createSpecialist(creation), 201);
      assert.equal(expect(await createSpecialist(creation), 201).id, specialist.id);
      expect(await createSpecialist({ ...creation, scopeId: peerScope }), 409);
    } finally {
      process.env.DEMO_EMPLOYEE_CREATION_ENABLED = "true";
      await fixture.restartApi();
    }
    assert.equal(specialist.role, "tender_specialist");
    assert.equal(specialist.sourceKind, "internal_manual");
    assert.equal(specialist.active, true);
    assert.equal(specialist.approved, true);
    const grants = (await db.query(`SELECT legal_entity_id,region_id,project_id,responsibility_scope_id,
      finance_visible,personal_data_visible FROM access_grants WHERE user_id=$1`, [specialist.id])).rows;
    assert.deepEqual(grants, [{ legal_entity_id: ids.legal, region_id: ids.region, project_id: ids.project,
      responsibility_scope_id: ids.scope, finance_visible: false, personal_data_visible: false }]);
    const list = expect(await request("GET", "/access/employees?role=tender_specialist", undefined, admin.accessToken), 200);
    assert.ok(list.items.some(item => item.id === specialist.id && item.role === "tender_specialist"));
    const demo = expect(await request("POST", "/access/employees/demo", {
      role: "tender_specialist", scopeId: peerScope, idempotencyKey: randomUUID(),
    }, admin.accessToken), 201);
    assert.equal(demo.role, "tender_specialist");
    assert.equal(demo.sourceKind, "demo_manual");
  });

  await t.test("the created employee signs in with phone/password and gets only the selected scope", async () => {
    const credentials = expect(await request("POST", `/access/users/${specialist.id}/password`, { phone: "+79990008431" }, admin.accessToken), 201);
    session = expect(await request("POST", "/auth/password", { phone: credentials.phone, password: credentials.password }), 200);
    assert.equal(session.actor.id, specialist.id);
    assert.equal(session.actor.role, "tender_specialist");
    assert.equal(session.actor.channel, "web");
    assert.equal(expect(await request("GET", "/me", undefined, session.accessToken), 200).role, "tender_specialist");
    const context = expect(await request("GET", "/tenders/context", undefined, session.accessToken), 200);
    assert.deepEqual(context.scopes.map(scope => scope.responsibilityScopeId), [ids.scope]);
    assert.equal(context.scopes[0].projectId, ids.project);
    assert.deepEqual(expect(await read(), 200), { customers: [], tenders: [], events: [] });
    const adminContext = expect(await request("GET", "/tenders/context", undefined, admin.accessToken), 200);
    assert.deepEqual(new Set(adminContext.scopes.map(scope => scope.responsibilityScopeId)), new Set([ids.scope, peerScope]));
    for (const scope of [peerScope, foreignScope]) expect(await read(session.accessToken, scope), 403);
    for (const route of ["/trips", "/planning/context", "/recruitment/context", "/access/employees/options", "/access/employees", "/notifications"]) {
      expect(await request("GET", route, undefined, session.accessToken), 403);
    }
    expect(await createSpecialist({}, session.accessToken), 403);
  });

  await t.test("unauthenticated users and every other operational role are denied on reads and writes", async () => {
    for (const route of ["/tenders/context", snapshotRoute()]) expect(await request("GET", route), 401);
    expect(await request("PUT", "/tenders/customers", customerInput()), 401);
    expect(await request("PUT", "/tenders/items", {}), 401);
    expect(await request("POST", "/tenders/comments", {}), 401);
    for (const role of ["driver", "dispatcher", "manager", "recruiter", "external_recruiter", "document_specialist", "mechanic", "auditor"]) {
      const other = await devLogin(await employee(role));
      for (const route of ["/tenders/context", snapshotRoute()]) expect(await request("GET", route, undefined, other.accessToken), 403);
      expect(await putCustomer(customerInput(), other.accessToken), 403);
      expect(await putTender(tenderInput(), other.accessToken), 403);
      expect(await comment(commentInput("Synthetic denied comment"), other.accessToken), 403);
      expect(await putTender({}, other.accessToken), 403);
      expect(await comment({}, other.accessToken), 403);
    }
  });

  await t.test("customers and opportunities persist with uncertain capacity and separate deadline and launch", async () => {
    customer = expect(await putCustomer(customerInput()), 200);
    assert.equal(customer.version, 1);
    peerCustomer = expect(await putCustomer(customerInput({ responsibilityScopeId: peerScope, name: "Synthetic peer customer" }), admin.accessToken), 200);
    tender = expect(await putTender(tenderInput()), 200);
    assert.equal(tender.version, 1);
    assert.equal(tender.status, "planned");
    assert.equal(tender.vehicleCount, "5–8");
    assert.equal(tender.expectedLaunch, null);
    assert.equal(tender.launchNotes, "Конец октября, год пока не уточнён");
    assert.equal(tender.submissionDeadline, "2026-10-05");
    const saved = expect(await read(), 200);
    assert.deepEqual(saved.customers, [customer]);
    assert.deepEqual(saved.tenders, [tender]);
    assert.equal(saved.events.filter(event => event.type === "created" && event.tenderId === tender.id).length, 1);
    assert.equal(JSON.stringify(saved).includes(peerCustomer.id), false);
    await fixture.restartApi();
    assert.deepEqual(expect(await read(), 200), saved);
  });

  await t.test("cross-scope customers, item ids and comments cannot bypass the exact scope grant", async () => {
    expect(await putCustomer(customerInput({ responsibilityScopeId: peerScope })), 403);
    expect(await putTender(tenderInput({ responsibilityScopeId: peerScope, customerId: peerCustomer.id })), 403);
    expect(await putTender(tenderInput({ customerId: peerCustomer.id })), 400);
    expect(await putTender(tenderInput({ customerId: randomUUID() })), 400);
    const peerItem = expect(await putTender(tenderInput({ responsibilityScopeId: peerScope, customerId: peerCustomer.id }), admin.accessToken), 200);
    expect(await putTender(tenderInput({ id: peerItem.id, version: peerItem.version })), 403);
    expect(await comment(commentInput("Wrong scope", { tenderId: peerItem.id })), 400);
    expect(await putCustomer(customerInput({ id: peerCustomer.id, version: peerCustomer.version })), 403);
    const peerUser = await devLogin(await employee("tender_specialist", peerScope));
    expect(await read(peerUser.accessToken), 403);
    const peerData = expect(await read(peerUser.accessToken, peerScope), 200);
    assert.deepEqual(peerData.customers.map(item => item.id), [peerCustomer.id]);
    assert.deepEqual(peerData.tenders.map(item => item.id), [peerItem.id]);
    assert.equal(peerData.events.some(event => event.tenderId === tender.id), false);
  });

  await t.test("version conflicts preserve the latest customer and tender changes", async () => {
    const staleCustomer = { id: customer.id, responsibilityScopeId: ids.scope, version: customer.version, name: customer.name };
    customer = expect(await putCustomer({ ...staleCustomer, name: "Синтетический заказчик — уточнено" }), 200);
    expect(await putCustomer({ ...staleCustomer, name: "Stale name" }), 409);
    const stale = updateInput();
    tender = expect(await putTender(updateInput({ status: "in_progress" })), 200);
    assert.equal(tender.version, 2);
    expect(await putTender({ ...stale, title: "Stale opportunity title" }), 409);
    const saved = expect(await read(), 200);
    assert.equal(saved.customers.find(item => item.id === customer.id).name, customer.name);
    assert.equal(saved.tenders.find(item => item.id === tender.id).title, tender.title);
    assert.equal(saved.tenders.find(item => item.id === tender.id).status, "in_progress");
  });

  await t.test("comments are idempotent immutable events and status changes preserve the last actual comment", async () => {
    const firstInput = commentInput("Уточнили требования к автомобилям");
    firstComment = expect(await comment(firstInput), 201);
    assert.equal(firstComment.type, "comment");
    assert.equal(firstComment.actorId, specialist.id);
    assert.equal(firstComment.customerId, customer.id);
    assert.equal(firstComment.text, firstInput.text);
    assert.ok(Number.isFinite(Date.parse(firstComment.createdAt)));
    assert.deepEqual(expect(await comment(firstInput), 201), firstComment);
    expect(await comment({ ...firstInput, text: "Attempt to overwrite history" }), 409);
    const secondTender = expect(await putTender(tenderInput({ title: "Синтетическое расширение", kind: "expansion" })), 200);
    expect(await comment({ ...firstInput, tenderId: secondTender.id }), 409);
    latestComment = expect(await comment(commentInput("Предложение отправлено, ожидаем решение")), 201);
    tender = expect(await putTender(updateInput({ status: "awaiting_decision" })), 200);
    const saved = expect(await read(), 200);
    const history = saved.events.filter(event => event.tenderId === tender.id);
    assert.deepEqual(history.map(event => event.type), ["created", "status", "comment", "comment", "status"]);
    assert.ok(history.every((event, index) => index === 0 || Date.parse(history[index - 1].createdAt) <= Date.parse(event.createdAt)));
    assert.deepEqual(history.filter(event => event.type === "comment"), [firstComment, latestComment]);
    assert.equal(history.filter(event => event.type === "comment").at(-1).text, latestComment.text);
    assert.equal(history.at(-1).fromStatus, "in_progress");
    assert.equal(history.at(-1).toStatus, "awaiting_decision");
    assert.equal(history.filter(event => event.id === firstComment.id).length, 1);
  });

  await t.test("wins and closed outcomes require reasons before changing state or adding an event", async () => {
    const before = expect(await read(), 200);
    expect(await putTender(updateInput({ status: "won", winReason: "   " })), 400);
    expect(await putTender(updateInput({ status: "closed", closeReason: "" })), 400);
    assert.deepEqual(expect(await read(), 200), before);
    tender = expect(await putTender(updateInput({ status: "won", winReason: "Заказчик подтвердил заказ на 5 авто", expectedLaunch: "2026-10-20" })), 200);
    assert.equal(tender.status, "won");
    assert.equal(tender.expectedLaunch, "2026-10-20");
    assert.equal(tender.submissionDeadline, "2026-10-05");
    tender = expect(await putTender(updateInput({ status: "closed", closeReason: "Заказчик отменил запуск" })), 200);
    assert.equal(tender.status, "closed");
    assert.equal(tender.closeReason, "Заказчик отменил запуск");
    const saved = expect(await read(), 200);
    assert.equal(saved.events.filter(event => event.tenderId === tender.id && event.type === "comment").at(-1).id, latestComment.id);
    const outcomes = saved.events.filter(event => event.tenderId === tender.id && event.type === "status");
    assert.ok(outcomes.find(event => event.toStatus === "won").text.includes("Заказчик подтвердил заказ на 5 авто"));
    assert.ok(outcomes.find(event => event.toStatus === "closed").text.includes("Заказчик отменил запуск"));
    tender = expect(await putTender(updateInput({ status: "planned", closeReason: "", winReason: "" })), 200);
    const reopened = expect(await read(), 200);
    for (const outcome of outcomes) assert.deepEqual(reopened.events.find(event => event.id === outcome.id), outcome);
    assert.equal(reopened.tenders.find(item => item.id === tender.id).status, "planned");
  });

  await t.test("revoking the grant immediately blocks existing sessions from reading or changing records", async () => {
    await db.query("DELETE FROM access_grants WHERE user_id=$1 AND responsibility_scope_id=$2", [specialist.id, ids.scope]);
    expect(await read(), 403);
    expect(await putCustomer(customerInput()), 403);
    expect(await putTender(updateInput({ title: "Write after revocation" })), 403);
    expect(await comment(commentInput("Comment after revocation")), 403);
    assert.deepEqual(expect(await request("GET", "/tenders/context", undefined, session.accessToken), 200).scopes, []);
    const saved = expect(await read(admin.accessToken), 200);
    assert.equal(saved.tenders.find(item => item.id === tender.id).title, tender.title);
    assert.equal(saved.events.some(event => event.text === "Comment after revocation"), false);
  });
});
