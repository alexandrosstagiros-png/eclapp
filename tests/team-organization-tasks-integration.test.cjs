"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { createTestServer } = require("./local-test-server.cjs");
test(
  "scoped hierarchy and tasks use current authority and one atomic direct-message assignment",
  { timeout: 180000 },
  async (t) => {
    const f = await createTestServer({ staffTeamActors: true });
    t.after(() => f.close());
    const { ids, adminPool: db } = f,
      scope = ids.scope;
    const admin = await f.devLogin(ids.admin),
      manager = await f.devLogin(ids.dispatcher),
      lead = await f.devLogin(ids.drivers[0]),
      employee = await f.devLogin(ids.drivers[1]),
      outsider = await f.devLogin(ids.mechanic);
    const call = (method, route, body, session = admin) =>
      f.request(method, route, body, session.accessToken);
    const scoped = (route) => `${route}?responsibilityScopeId=${scope}`;
    const ok = (result) => {
      assert.ok(
        [200, 201].includes(result.status),
        `${result.status} ${JSON.stringify(result.body)}`,
      );
      return result.body;
    };
    const org = async (session = admin) =>
      ok(await call("GET", scoped("/team/organization"), undefined, session));
    const changePerson = async (id, managerId, patch = {}) => {
      const person = (await org()).people.find((p) => p.id === id);
      return call("PUT", `/team/organization/employees/${id}`, {
        responsibilityScopeId: scope,
        operationId: randomUUID(),
        version: person?.version || 0,
        managerId,
        positionId: person?.positionId || null,
        ...patch,
      });
    };
    const taskBody = (assigneeId = ids.drivers[1], patch = {}) => ({
      id: randomUUID(),
      responsibilityScopeId: scope,
      operationId: randomUUID(),
      title: "Синтетическая задача",
      description: "Проверить этапы и согласовать результат",
      assigneeId,
      dueDate: "2026-12-20",
      ...patch,
    });
    let created, original, position;
    await t.test(
      "positions are separate from security roles; manager chains reject cycles, self and unknown members",
      async () => {
        const body = {
            responsibilityScopeId: scope,
            operationId: randomUUID(),
            version: 0,
            title: "Руководитель отдела",
          },
          id = randomUUID();
        position = ok(
          await call("PUT", `/team/organization/positions/${id}`, body),
        );
        assert.deepEqual(
          ok(await call("PUT", `/team/organization/positions/${id}`, body)),
          position,
        );
        ok(await changePerson(ids.dispatcher, ids.admin, { positionId: id }));
        ok(await changePerson(ids.drivers[0], ids.dispatcher));
        ok(await changePerson(ids.drivers[1], ids.drivers[0]));
        assert.equal(
          (
            await db.query("SELECT role FROM users WHERE id=$1", [
              ids.dispatcher,
            ])
          ).rows[0].role,
          "dispatcher",
        );
        assert.deepEqual(
          new Set((await org(manager)).assignableIds),
          new Set(ids.drivers),
        );
        assert.equal(
          (await changePerson(ids.dispatcher, ids.drivers[1])).status,
          400,
        );
        assert.equal(
          (await changePerson(ids.drivers[1], ids.drivers[1])).status,
          400,
        );
        assert.equal(
          (await changePerson(ids.drivers[1], randomUUID())).status,
          403,
        );
        assert.equal(
          (
            await call(
              "PUT",
              `/team/organization/positions/${randomUUID()}`,
              { ...body, operationId: randomUUID() },
              manager,
            )
          ).status,
          403,
        );
        const concurrent = await Promise.all([
          changePerson(ids.mechanic, ids.specialist),
          changePerson(ids.specialist, ids.mechanic),
        ]);
        assert.deepEqual(
          concurrent.map((result) => result.status).sort(),
          [200, 400],
          "concurrent hierarchy writes cannot create a cycle",
        );
        assert.equal(
          (
            await call(
              "PUT",
              `/team/organization/employees/${ids.drivers[1]}`,
              {
                responsibilityScopeId: scope,
                operationId: randomUUID(),
                version: 1,
                managerId: ids.dispatcher,
                positionId: null,
              },
              manager,
            )
          ).status,
          403,
        );
      },
    );
    await t.test(
      "chain assignment creates one task, one DM message and one mention, with scoped ordinary chat ACLs",
      async () => {
        original = taskBody();
        created = ok(await call("POST", "/team/tasks", original, manager));
        const repeated = ok(
          await call("POST", "/team/tasks", original, manager),
        );
        assert.deepEqual(repeated, created);
        assert.equal(
          (
            await db.query(
              "SELECT count(*)::int AS n FROM team_task_messages WHERE task_id=$1",
              [created.id],
            )
          ).rows[0].n,
          1,
        );
        const detail = ok(
          await call(
            "GET",
            scoped(`/team/conversations/${created.conversationId}`),
            undefined,
            employee,
          ),
        );
        assert.equal(detail.conversation.visibility, "private");
        assert.deepEqual(
          new Set(detail.conversation.memberIds),
          new Set([ids.dispatcher, ids.drivers[1]]),
        );
        const message = detail.messages.find((m) => m.id === created.messageId);
        assert.ok(message.text.includes(original.title));
        assert.deepEqual(message.mentions.userIds, [ids.drivers[1]]);
        assert.equal(
          (
            await db.query(
              "SELECT count(*)::int AS n FROM team_message_mentions WHERE message_id=$1 AND user_id=$2",
              [created.messageId, ids.drivers[1]],
            )
          ).rows[0].n,
          1,
        );
        assert.equal(
          (
            await call(
              "GET",
              scoped(`/team/conversations/${created.conversationId}`),
              undefined,
              lead,
            )
          ).status,
          404,
          "supervisor may see task, not private discussion",
        );
        const supervisorTask = ok(
          await call(
            "GET",
            scoped(`/team/tasks/${created.id}`),
            undefined,
            lead,
          ),
        );
        assert.equal(supervisorTask.canChangeStatus, true);
        assert.equal(supervisorTask.canOpenConversation, false);
        assert.equal(
          (
            await call(
              "GET",
              scoped(`/team/tasks/${created.id}`),
              undefined,
              outsider,
            )
          ).status,
          404,
        );
        assert.equal(
          (
            await call(
              "POST",
              "/team/tasks",
              taskBody(ids.dispatcher),
              employee,
            )
          ).status,
          403,
          "no upwards assignment",
        );
        assert.equal(
          (await call("POST", "/team/tasks", taskBody(ids.mechanic), manager))
            .status,
          403,
          "no sideways assignment",
        );
        assert.equal(
          (
            await call(
              "POST",
              "/team/tasks",
              { ...original, title: "Changed retry" },
              manager,
            )
          ).status,
          409,
        );
      },
    );
    await t.test(
      "versioned state changes serialize concurrent writers and retries return latest state",
      async () => {
        const body = {
          responsibilityScopeId: scope,
          operationId: randomUUID(),
          version: created.version,
          status: "in_progress",
        };
        const results = await Promise.all([
          call("PUT", `/team/tasks/${created.id}/status`, body, employee),
          call(
            "PUT",
            `/team/tasks/${created.id}/status`,
            { ...body, operationId: randomUUID(), status: "done" },
            lead,
          ),
        ]);
        assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
        created = ok(results.find((r) => r.status === 200));
        const done = {
          responsibilityScopeId: scope,
          operationId: randomUUID(),
          version: created.version,
          status: "done",
        };
        created = ok(
          await call("PUT", `/team/tasks/${created.id}/status`, done, manager),
        );
        assert.deepEqual(
          ok(await call("POST", "/team/tasks", original, manager)),
          created,
          "creation retry is a read, never reopens task",
        );
        assert.equal(
          (
            await call(
              "PUT",
              `/team/tasks/${created.id}`,
              {
                responsibilityScopeId: scope,
                operationId: randomUUID(),
                version: created.version,
                title: "Unauthorized edit",
                description: "",
                assigneeId: ids.drivers[1],
                dueDate: null,
              },
              employee,
            )
          ).status,
          403,
        );
        assert.deepEqual(
          ok(
            await call(
              "PUT",
              `/team/tasks/${created.id}/status`,
              done,
              manager,
            ),
          ),
          created,
        );
      },
    );
    await t.test(
      "changing hierarchy revokes former supervisors immediately; author and assignee retain explicit access",
      async () => {
        ok(await changePerson(ids.drivers[1], ids.dispatcher));
        assert.equal(
          (
            await call(
              "GET",
              scoped(`/team/tasks/${created.id}`),
              undefined,
              lead,
            )
          ).status,
          404,
        );
        assert.equal(
          ok(
            await call("GET", scoped("/team/tasks"), undefined, lead),
          ).tasks.some((task) => task.id === created.id),
          false,
        );
        assert.equal(
          (
            await call(
              "PUT",
              `/team/tasks/${created.id}/status`,
              {
                responsibilityScopeId: scope,
                operationId: randomUUID(),
                version: created.version,
                status: "todo",
              },
              lead,
            )
          ).status,
          404,
        );
        assert.equal(
          ok(
            await call(
              "GET",
              scoped(`/team/tasks/${created.id}`),
              undefined,
              employee,
            ),
          ).id,
          created.id,
        );
        assert.equal(
          ok(
            await call(
              "GET",
              scoped(`/team/tasks/${created.id}`),
              undefined,
              manager,
            ),
          ).id,
          created.id,
        );
      },
    );
    await t.test(
      "slow mode cannot be bypassed with a task; failed assignment is fully rolled back",
      async () => {
        ok(
          await call(
            "PUT",
            `/team/conversations/${created.conversationId}/moderation`,
            {
              responsibilityScopeId: scope,
              operationId: randomUUID(),
              enabled: true,
            },
          ),
        );
        const blocked = taskBody(),
          before = (
            await db.query(
              "SELECT count(*)::int AS n FROM team_messages WHERE conversation_id=$1",
              [created.conversationId],
            )
          ).rows[0].n;
        assert.equal(
          (await call("POST", "/team/tasks", blocked, manager)).status,
          429,
        );
        assert.equal(
          (
            await db.query(
              "SELECT count(*)::int AS n FROM team_tasks WHERE id=$1",
              [blocked.id],
            )
          ).rows[0].n,
          0,
        );
        assert.equal(
          (
            await db.query(
              "SELECT count(*)::int AS n FROM team_messages WHERE conversation_id=$1",
              [created.conversationId],
            )
          ).rows[0].n,
          before,
        );
        ok(
          await call(
            "PUT",
            `/team/conversations/${created.conversationId}/moderation`,
            {
              responsibilityScopeId: scope,
              operationId: randomUUID(),
              enabled: false,
            },
          ),
        );
        const retried = ok(await call("POST", "/team/tasks", blocked, manager));
        assert.equal(
          retried.conversationId,
          created.conversationId,
          "existing DM reused",
        );
        await db.query(
          `CREATE FUNCTION test_reject_task_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.title='Synthetic rollback marker' THEN RAISE EXCEPTION 'synthetic failure'; END IF; RETURN NEW; END; $$; CREATE TRIGGER test_task_rollback BEFORE INSERT ON team_tasks FOR EACH ROW EXECUTE FUNCTION test_reject_task_insert()`,
        );
        const counts = async () =>
          (
            await db.query(
              "SELECT (SELECT count(*) FROM team_conversations)::int AS chats,(SELECT count(*) FROM team_messages)::int AS messages,(SELECT count(*) FROM team_tasks)::int AS tasks",
            )
          ).rows[0];
        const previous = await counts();
        const failed = await call(
          "POST",
          "/team/tasks",
          taskBody(ids.mechanic, { title: "Synthetic rollback marker" }),
        );
        assert.equal(failed.status, 500);
        assert.deepEqual(await counts(), previous);
      },
    );
    await t.test(
      "reassignment notifies the new assignee exactly once and hides task metadata from former assignee",
      async () => {
        const edit = {
          responsibilityScopeId: scope,
          operationId: randomUUID(),
          version: created.version,
          title: created.title,
          description: created.description,
          assigneeId: ids.drivers[0],
          dueDate: created.dueDate,
        };
        created = ok(
          await call("PUT", `/team/tasks/${created.id}`, edit, manager),
        );
        assert.equal(created.assigneeId, ids.drivers[0]);
        assert.deepEqual(
          ok(await call("PUT", `/team/tasks/${created.id}`, edit, manager)),
          created,
        );
        assert.equal(
          (
            await db.query(
              "SELECT count(*)::int AS n FROM team_task_messages WHERE task_id=$1",
              [created.id],
            )
          ).rows[0].n,
          2,
        );
        assert.equal(
          (
            await call(
              "GET",
              scoped(`/team/tasks/${created.id}`),
              undefined,
              employee,
            )
          ).status,
          404,
        );
        const old = (
          await db.query(
            "SELECT message_id FROM team_task_messages WHERE task_id=$1 AND assignment_version=1",
            [created.id],
          )
        ).rows[0].message_id;
        const source = ok(
          await call(
            "GET",
            scoped(`/team/messages/${old}`),
            undefined,
            employee,
          ),
        );
        assert.equal(source.message.taskId, undefined);
      },
    );
    await t.test(
      "opposite assignments by two administrators lock identity rows before the scope without deadlock",
      async () => {
        await db.query("UPDATE users SET role='access_admin' WHERE id=$1", [
          ids.mechanic,
        ]);
        const secondAdmin = await f.devLogin(ids.mechanic);
        const results = await Promise.all([
          call(
            "POST",
            "/team/tasks",
            taskBody(ids.mechanic, { title: "Admin A to B" }),
            admin,
          ),
          call(
            "POST",
            "/team/tasks",
            taskBody(ids.admin, { title: "Admin B to A" }),
            secondAdmin,
          ),
        ]);
        const tasks = results.map(ok);
        assert.equal(tasks[0].conversationId, tasks[1].conversationId);
        assert.equal(
          (
            await db.query(
              "SELECT count(*)::int AS n FROM team_messages WHERE id=ANY($1::uuid[])",
              [tasks.map((task) => task.messageId)],
            )
          ).rows[0].n,
          2,
        );
      },
    );
    await t.test(
      "scope/session revocation and ineligible roles cannot gain org or task authority",
      async () => {
        const wrongScope = randomUUID();
        await db.query(
          "INSERT INTO responsibility_scopes(id,project_id,name) VALUES($1,$2,'Synthetic other scope')",
          [wrongScope, ids.project],
        );
        await db.query(
          "INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id) VALUES($1,$2,$3,$4,$5)",
          [ids.admin, ids.legal, ids.region, ids.project, wrongScope],
        );
        assert.equal(
          (
            await call(
              "GET",
              `/team/tasks/${created.id}?responsibilityScopeId=${wrongScope}`,
            )
          ).status,
          404,
        );
        await db.query("UPDATE users SET role='driver' WHERE id=$1", [
          ids.mechanic,
        ]);
        const driver = await f.devLogin(ids.mechanic);
        assert.equal(
          (await call("GET", scoped("/team/organization"), undefined, driver))
            .status,
          403,
        );
        assert.equal(
          (await changePerson(ids.mechanic, ids.dispatcher)).status,
          403,
        );
        await db.query(
          "UPDATE users SET role='external_recruiter' WHERE id=$1",
          [ids.specialist],
        );
        const external = await f.devLogin(ids.specialist);
        assert.equal(
          (await call("GET", scoped("/team/organization"), undefined, external))
            .status,
          403,
        );
        assert.equal(
          (await changePerson(ids.specialist, ids.dispatcher)).status,
          403,
        );
        await db.query(
          "DELETE FROM access_grants WHERE user_id=$1 AND responsibility_scope_id=$2",
          [ids.drivers[0], scope],
        );
        assert.equal(
          (
            await call(
              "GET",
              scoped(`/team/tasks/${created.id}`),
              undefined,
              lead,
            )
          ).status,
          403,
        );
        await db.query(
          "UPDATE users SET auth_version=auth_version+1 WHERE id=$1",
          [ids.dispatcher],
        );
        assert.equal(
          (await call("POST", "/team/tasks", original, manager)).status,
          401,
        );
      },
    );
  },
);
