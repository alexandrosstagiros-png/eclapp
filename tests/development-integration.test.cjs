"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { createTestServer } = require("./local-test-server.cjs");

test("employees submit private development tickets and administrators carry them through both funnels", { timeout: 180_000 }, async t => {
  const fixture = await createTestServer();
  t.after(() => fixture.close());
  const { request, devLogin, adminPool: db, ids } = fixture;
  const owned = [ids.legal, ids.region, ids.project, ids.scope];
  const foreignTuple = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  const peerScope = randomUUID();
  await db.query("INSERT INTO legal_entities VALUES($1,$2)", [foreignTuple[0], "Synthetic foreign company"]);
  await db.query("INSERT INTO regions VALUES($1,$2,$3)", [foreignTuple[1], "Synthetic foreign region", "Asia/Yekaterinburg"]);
  await db.query("INSERT INTO projects VALUES($1,$2,$3,$4)", [foreignTuple[2], "Synthetic foreign project", foreignTuple[0], foreignTuple[1]]);
  await db.query("INSERT INTO responsibility_scopes VALUES($1,$2,$3)", [foreignTuple[3], foreignTuple[2], "Synthetic foreign scope"]);
  await db.query("INSERT INTO responsibility_scopes VALUES($1,$2,$3)", [peerScope, ids.project, "Synthetic second team"]);

  async function grant(userId, tuple = owned) {
    await db.query(`INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id)
      VALUES($1,$2,$3,$4,$5)`, [userId, ...tuple]);
  }
  async function employee(role, tuple = owned) {
    const id = randomUUID();
    await db.query("INSERT INTO users(id,display_name,role,active,approved) VALUES($1,$2,$3,true,true)", [id, `Synthetic ${role}`, role]);
    if (tuple) await grant(id, tuple);
    return id;
  }
  function expect(response, status) {
    assert.equal(response.status, status, `Expected HTTP ${status}, got ${response.status}: ${JSON.stringify(response.body)}`);
    return response.body;
  }
  function deniedRecord(response) {
    assert.ok([403, 404].includes(response.status), `Private record must be inaccessible, got ${response.status}: ${JSON.stringify(response.body)}`);
  }
  await grant(ids.admin, [ids.legal, ids.region, ids.project, peerScope]);
  const employeeId = await employee("tender_specialist");
  const peerId = await employee("recruiter");
  const foreignId = await employee("mechanic", foreignTuple);
  const admin = await devLogin(ids.admin);
  const staff = await devLogin(employeeId);
  const peer = await devLogin(peerId);
  const foreign = await devLogin(foreignId);
  const snapshotRoute = (scope = ids.scope) => `/development?responsibilityScopeId=${scope}`;
  const detailRoute = (id, scope = ids.scope) => `/development/tickets/${id}?responsibilityScopeId=${scope}`;
  const read = (token = staff.accessToken, scope = ids.scope) => request("GET", snapshotRoute(scope), undefined, token);
  const detail = (id, token = staff.accessToken, scope = ids.scope) => request("GET", detailRoute(id, scope), undefined, token);
  const ticketInput = (patch = {}) => ({
    id: randomUUID(), responsibilityScopeId: ids.scope, version: 0, title: "Не сохраняется срок тендера",
    description: "Открыл карточку, изменил срок и сохранил. После обновления осталась старая дата.",
    section: "tenders", status: "new", ...patch,
  });
  const editInput = (record, patch = {}) => ({ ...Object.fromEntries(["id", "responsibilityScopeId", "title", "description", "section", "status", "version"].map(key => [key, record[key]])), ...patch });
  const put = (body, token = staff.accessToken) => request("PUT", "/development/tickets", body, token);
  const commentInput = (patch = {}) => ({ id: randomUUID(), responsibilityScopeId: ids.scope, ticketId: ticket.id, text: "Повторяется на второй карточке", ...patch });
  const comment = (body, token = staff.accessToken) => request("POST", "/development/comments", body, token);
  let ticket, peerTicket, foreignTicket;

  await t.test("current internal accounts receive their exact granted scopes and external recruiters are excluded", async () => {
    for (const route of ["/development/context", snapshotRoute(), detailRoute(randomUUID())]) {
      expect(await request("GET", route), 401);
    }
    expect(await request("PUT", "/development/tickets", {}), 401);
    expect(await request("POST", "/development/comments", {}), 401);
    const context = expect(await request("GET", "/development/context", undefined, staff.accessToken), 200);
    assert.equal(context.canManage, false);
    assert.deepEqual(context.scopes.map(scope => scope.responsibilityScopeId), [ids.scope]);
    assert.equal(context.scopes[0].projectId, ids.project);
    const adminContext = expect(await request("GET", "/development/context", undefined, admin.accessToken), 200);
    assert.equal(adminContext.canManage, true);
    assert.deepEqual(new Set(adminContext.scopes.map(scope => scope.responsibilityScopeId)), new Set([ids.scope, peerScope]));
    for (const scope of [peerScope, foreignTuple[3]]) expect(await read(staff.accessToken, scope), 403);
    expect(await read(admin.accessToken, foreignTuple[3]), 403);
    assert.deepEqual(expect(await read(), 200).tickets, []);
    expect(await detail(randomUUID()), 404);
    const external = await devLogin(await employee("external_recruiter"));
    for (const route of ["/development/context", snapshotRoute(), detailRoute(randomUUID())]) {
      expect(await request("GET", route, undefined, external.accessToken), 403);
    }
    expect(await put(ticketInput(), external.accessToken), 403);
    expect(await comment({ id: randomUUID(), responsibilityScopeId: ids.scope, ticketId: randomUUID(), text: "Denied external comment" }, external.accessToken), 403);
  });

  await t.test("employees can report a problem without personal-data permissions and cannot forge author or number", async () => {
    expect(await put(ticketInput({ authorId: peerId, authorName: "Подмена автора", number: 999999, createdAt: "2000-01-01" })), 400);
    const initialInput = ticketInput();
    ticket = expect(await put(initialInput), 200);
    assert.equal(ticket.version, 1);
    assert.equal(ticket.status, "new");
    assert.equal(ticket.authorId, employeeId);
    assert.equal(ticket.authorName, "Synthetic tender_specialist");
    assert.ok(Number.isSafeInteger(ticket.number) && ticket.number > 0 && ticket.number !== 999999);
    assert.ok(Number.isFinite(Date.parse(ticket.createdAt)));
    assert.notEqual(ticket.createdAt, "2000-01-01");
    assert.deepEqual(expect(await put(initialInput), 200), ticket);
    expect(await put({ ...initialInput, title: "Different payload under the same create key" }), 409);
    expect(await put(initialInput, admin.accessToken), 409);
    expect(await put(ticketInput({ status: "in_progress" }), admin.accessToken), 400);
    peerTicket = expect(await put(ticketInput({ title: "Добавить уточнение в рекрутинг", section: "recruitment" }), peer.accessToken), 200);
    foreignTicket = expect(await put(ticketInput({ responsibilityScopeId: foreignTuple[3], title: "Проверить ремонт", section: "fleet" }), foreign.accessToken), 200);
    assert.deepEqual(expect(await read(), 200).tickets.map(item => item.id), [ticket.id]);
    assert.deepEqual(expect(await read(peer.accessToken), 200).tickets.map(item => item.id), [peerTicket.id]);
    assert.deepEqual(new Set(expect(await read(admin.accessToken), 200).tickets.map(item => item.id)), new Set([ticket.id, peerTicket.id]));
    assert.equal(expect(await detail(ticket.id, admin.accessToken), 200).ticket.authorName, "Сотрудник");
    await db.query("UPDATE access_grants SET personal_data_visible=true WHERE user_id=$1 AND responsibility_scope_id=$2", [ids.admin, ids.scope]);
    const saved = expect(await detail(ticket.id), 200);
    assert.deepEqual(saved.ticket, ticket);
    assert.equal(saved.events.length, 1);
    assert.equal(saved.events[0].type, "created");
    assert.equal(saved.events[0].actorId, employeeId);
    await fixture.restartApi();
    assert.deepEqual(expect(await detail(ticket.id), 200), saved);
  });

  await t.test("every internal operational role can create, read, edit and comment on its own ticket", async () => {
    for (const role of ["driver", "dispatcher", "manager", "recruiter", "document_specialist", "mechanic", "auditor", "tender_specialist"]) {
      const id = await employee(role);
      const session = await devLogin(id);
      const context = expect(await request("GET", "/development/context", undefined, session.accessToken), 200);
      assert.equal(context.canManage, false);
      let own = expect(await put(ticketInput({ title: `Синтетическая заявка ${role}` }), session.accessToken), 200);
      assert.equal(own.authorId, id);
      own = expect(await put(editInput(own, { description: "Сотрудник уточнил описание" }), session.accessToken), 200);
      assert.equal(own.version, 2);
      assert.equal(own.description, "Сотрудник уточнил описание");
      const event = expect(await comment(commentInput({ ticketId: own.id }), session.accessToken), 201);
      assert.equal(event.actorId, id);
      assert.deepEqual(expect(await read(session.accessToken), 200).tickets.map(item => item.id), [own.id]);
      assert.equal(expect(await detail(own.id, session.accessToken), 200).events.filter(event => event.type === "comment").length, 1);
      deniedRecord(await detail(ticket.id, session.accessToken));
    }
  });

  await t.test("employees cannot inspect, edit or comment on coworkers' tickets or move workflow stages", async () => {
    for (const status of ["clarifying", "ready", "in_progress", "review", "done"]) {
      expect(await put(ticketInput({ status })), 400);
      expect(await put(editInput(ticket, { status })), 403);
    }
    deniedRecord(await detail(peerTicket.id));
    deniedRecord(await put(editInput(peerTicket, { title: "Attempted coworker overwrite" })));
    deniedRecord(await comment(commentInput({ ticketId: peerTicket.id, text: "Attempted coworker comment" })));
    assert.deepEqual(expect(await detail(peerTicket.id, peer.accessToken), 200).ticket, peerTicket);
    assert.deepEqual(expect(await detail(ticket.id), 200).ticket, ticket);
  });

  await t.test("scope isolation checks the full legal-entity, region, project and responsibility tuple", async () => {
    expect(await detail(foreignTicket.id, staff.accessToken, foreignTuple[3]), 403);
    deniedRecord(await detail(foreignTicket.id));
    expect(await put(ticketInput({ responsibilityScopeId: foreignTuple[3] })), 403);
    deniedRecord(await put(editInput(foreignTicket, { responsibilityScopeId: ids.scope })));
    deniedRecord(await comment(commentInput({ ticketId: foreignTicket.id })));
    const adminPeerTicket = expect(await put(ticketInput({ responsibilityScopeId: peerScope }), admin.accessToken), 200);
    deniedRecord(await put(editInput(adminPeerTicket, { responsibilityScopeId: ids.scope }), admin.accessToken));
    deniedRecord(await detail(adminPeerTicket.id, admin.accessToken));
    for (const index of [0, 1, 2]) {
      const inconsistentTuple = owned.slice();
      inconsistentTuple[index] = foreignTuple[index];
      const mismatchedId = await employee("manager", null);
      await assert.rejects(grant(mismatchedId, inconsistentTuple), error => error.code === "23503");
      const mismatched = await devLogin(mismatchedId);
      assert.deepEqual(expect(await request("GET", "/development/context", undefined, mismatched.accessToken), 200).scopes, []);
      expect(await read(mismatched.accessToken), 403);
      expect(await put(ticketInput(), mismatched.accessToken), 403);
      expect(await comment(commentInput(), mismatched.accessToken), 403);
    }
  });

  await t.test("invalid payloads and identifiers leave the ticket and its history unchanged", async () => {
    const before = expect(await detail(ticket.id), 200);
    for (const patch of [{ title: "" }, { title: "x".repeat(201) }, { description: "x".repeat(6001) }, { title: "a\u0000b" },
      { section: "unknown" }, { status: "released" }, { id: "not-a-uuid" }, { version: -1 }, { version: "1" }]) {
      expect(await put(editInput(ticket, patch)), 400);
    }
    expect(await request("GET", snapshotRoute("invalid"), undefined, staff.accessToken), 400);
    expect(await request("GET", detailRoute("invalid"), undefined, staff.accessToken), 400);
    for (const patch of [{ text: "  " }, { text: "x".repeat(4001) }, { ticketId: "bad" }, { id: "bad" }]) {
      expect(await comment(commentInput(patch)), 400);
    }
    assert.deepEqual(expect(await detail(ticket.id), 200), before);
  });

  await t.test("concurrent edits use versions so only one update can replace a ticket", async () => {
    const before = ticket;
    const writes = await Promise.all([
      put(editInput(before, { description: "Первое уточнение сотрудника" })),
      put(editInput(before, { description: "Второе уточнение администратора" }), admin.accessToken),
    ]);
    assert.deepEqual(writes.map(item => item.status).sort(), [200, 409]);
    ticket = writes.find(item => item.status === 200).body;
    assert.equal(ticket.version, before.version + 1);
    expect(await put(editInput(before, { title: "Stale ticket title" })), 409);
    assert.deepEqual(expect(await detail(ticket.id), 200).ticket, ticket);
  });

  await t.test("comments are attributed immutable events and retries do not duplicate them", async () => {
    const body = commentInput({ text: "Уточнение: срок пропадает только после повторного входа" });
    expect(await comment({ ...body, actorId: ids.admin, actorName: "Подмена автора", createdAt: "2000-01-01" }), 400);
    const event = expect(await comment(body), 201);
    assert.equal(event.type, "comment");
    assert.equal(event.ticketId, ticket.id);
    assert.equal(event.actorId, employeeId);
    assert.equal(event.text, body.text);
    assert.ok(Number.isFinite(Date.parse(event.createdAt)));
    assert.deepEqual(expect(await comment(body), 201), event);
    expect(await comment({ ...body, text: "Attempt to overwrite comment" }), 409);
    expect(await comment(body, admin.accessToken), 409);
    const otherOwn = expect(await put(ticketInput({ title: "Другая заявка того же автора" })), 200);
    expect(await comment({ ...body, ticketId: otherOwn.id }), 409);
    const adminComment = expect(await comment(commentInput({ text: "Ошибка воспроизведена, приступаем к исправлению" }), admin.accessToken), 201);
    const saved = expect(await detail(ticket.id), 200);
    assert.equal(saved.events.filter(item => item.id === event.id).length, 1);
    assert.deepEqual(saved.events.filter(item => item.type === "comment"), [event, { ...adminComment, actorName: "Сотрудник" }]);
  });

  await t.test("one ticket retains its number, author and history through analytics and production", async () => {
    const identity = { id: ticket.id, number: ticket.number, authorId: ticket.authorId, createdAt: ticket.createdAt };
    for (const status of ["clarifying", "ready", "in_progress", "review", "done"]) {
      const oldVersion = ticket.version;
      ticket = expect(await put(editInput(ticket, { status }), admin.accessToken), 200);
      assert.equal(ticket.status, status);
      assert.equal(ticket.version, oldVersion + 1);
      assert.deepEqual(Object.fromEntries(Object.keys(identity).map(key => [key, ticket[key]])), identity);
      const employeeView = expect(await detail(ticket.id), 200);
      assert.equal(employeeView.ticket.status, status);
      assert.equal(employeeView.events.at(-1).type, "status");
      assert.equal(employeeView.events.at(-1).toStatus, status);
      assert.equal(employeeView.events.at(-1).actorId, ids.admin);
    }
    const saved = expect(await detail(ticket.id), 200);
    assert.deepEqual(saved.events.filter(event => event.type === "status").map(event => [event.fromStatus, event.toStatus]), [
      ["new", "clarifying"], ["clarifying", "ready"], ["ready", "in_progress"], ["in_progress", "review"], ["review", "done"],
    ]);
    assert.equal(saved.events.filter(event => event.type === "created").length, 1);
    assert.equal(saved.events.filter(event => event.type === "comment").length, 2);
    assert.equal(expect(await read(admin.accessToken), 200).tickets.filter(item => item.id === ticket.id).length, 1);
    await fixture.restartApi();
    assert.deepEqual(expect(await detail(ticket.id), 200), saved);
  });

  await t.test("grant and session revocation immediately block existing sessions, including administrators", async () => {
    await db.query("DELETE FROM access_grants WHERE user_id=$1 AND responsibility_scope_id=$2", [employeeId, ids.scope]);
    expect(await read(), 403);
    expect(await detail(ticket.id), 403);
    expect(await put(editInput(ticket, { title: "Write after grant revocation" })), 403);
    expect(await comment(commentInput({ text: "Comment after grant revocation" })), 403);
    assert.deepEqual(expect(await request("GET", "/development/context", undefined, staff.accessToken), 200).scopes, []);
    assert.deepEqual(expect(await detail(ticket.id, admin.accessToken), 200).ticket, ticket);
    await db.query("UPDATE sessions SET revoked_at=clock_timestamp() WHERE user_id=$1", [peerId]);
    expect(await read(peer.accessToken), 401);
    expect(await detail(peerTicket.id, peer.accessToken), 401);
    expect(await put(editInput(peerTicket), peer.accessToken), 401);
    expect(await comment(commentInput({ ticketId: peerTicket.id }), peer.accessToken), 401);
    await db.query("DELETE FROM access_grants WHERE user_id=$1 AND responsibility_scope_id=$2", [ids.admin, ids.scope]);
    expect(await read(admin.accessToken), 403);
    expect(await detail(ticket.id, admin.accessToken), 403);
    expect(await put(editInput(ticket, { status: "review" }), admin.accessToken), 403);
    expect(await comment(commentInput(), admin.accessToken), 403);
  });
});
