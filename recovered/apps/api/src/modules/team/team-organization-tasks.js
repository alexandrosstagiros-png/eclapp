// SPDX-License-Identifier: MIT
"use strict";
const { randomUUID } = require("node:crypto");
const {
  Injectable,
  Inject,
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  Req,
  Header,
  UseGuards,
} = require("@nestjs/common");
const { DatabaseService } = require("../../platform/database.service");
const { AuthGuard } = require("../identity-access/interface/auth.guard");
const {
  CurrentActor,
} = require("../identity-access/interface/current-actor.decorator");
const {
  TeamService,
  tuple,
  whereScope,
  response,
  canManage,
  ROLES,
} = require("./team.service");
const {
  object,
  uuid,
  fail,
  conflict,
  forbidden,
  unavailable,
} = require("./team-input");
const STATUSES = Object.freeze(["todo", "in_progress", "done"]);
const TASK_COLUMNS = `id,title,description,author_id AS "authorId",assignee_id AS "assigneeId",due_date::text AS "dueDate",status,version,
  conversation_id AS "conversationId",message_id AS "messageId",created_at AS "createdAt",updated_at AS "updatedAt"`;
function text(value, maximum, label, optional = false) {
  if (
    typeof value !== "string" ||
    value.length > maximum ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)
  )
    fail(`Проверьте поле «${label}».`);
  const result = value.trim();
  if (!optional && !result) fail(`Заполните поле «${label}».`);
  return result;
}
function version(value, minimum = 1) {
  if (!Number.isSafeInteger(value) || value < minimum || value >= 2147483646)
    fail("Укажите актуальную версию записи.");
  return value;
}
function dueDate(value) {
  if (value == null || value === "") return null;
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !value.startsWith("20") ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString().slice(0, 10) !== value
  )
    fail("Укажите корректную дату срока.");
  return value;
}
function taskInput(body, create = false) {
  object(body, [
    "responsibilityScopeId",
    "operationId",
    ...(create ? ["id"] : ["version"]),
    "title",
    "description",
    "assigneeId",
    "dueDate",
  ]);
  return {
    responsibilityScopeId: uuid(body.responsibilityScopeId),
    operationId: uuid(body.operationId),
    ...(create ? { id: uuid(body.id) } : { version: version(body.version) }),
    title: text(body.title, 200, "название"),
    description: text(body.description ?? "", 8000, "описание", true),
    assigneeId: uuid(body.assigneeId),
    dueDate: dueDate(body.dueDate),
  };
}
// All hierarchy consumers use current, active, approved scope members. A removed
// manager breaks the authority path rather than passing rights through a ghost node.
async function loadOrganization(client, team, actor, scope) {
  const people = await team.workPeopleRows(client, actor, scope);
  const rows = await client.query(
    `SELECT user_id AS "userId",manager_id AS "managerId",position_id AS "positionId",version FROM team_organization_employees WHERE ${whereScope()}`,
    tuple(scope),
  );
  const positions = await client.query(
    `SELECT id,title,version FROM team_organization_positions WHERE ${whereScope()} ORDER BY title,id`,
    tuple(scope),
  );
  const byUser = new Map(rows.rows.map((row) => [row.userId, row]));
  return {
    people: people.map((person) => {
      const row = byUser.get(person.id);
      return {
        ...person,
        managerId: row?.managerId || null,
        positionId: row?.positionId || null,
        positionTitle:
          positions.rows.find((p) => p.id === row?.positionId)?.title || "",
        version: row?.version || 0,
      };
    }),
    positions: positions.rows,
  };
}
function subordinateIds(organization, managerId) {
  const people = organization.people || [],
    active = new Set(people.map((person) => person.id)),
    found = new Set(),
    queue = [managerId];
  if (!active.has(managerId)) return found;
  for (let index = 0; index < queue.length; index++)
    for (const person of people) {
      if (
        person.managerId === queue[index] &&
        person.id !== managerId &&
        !found.has(person.id)
      ) {
        found.add(person.id);
        queue.push(person.id);
      }
    }
  return found;
}
function isSupervisor(organization, managerId, userId) {
  return (
    managerId !== userId && subordinateIds(organization, managerId).has(userId)
  );
}
function taskPermissions(row, actor, organization) {
  const supervisor = isSupervisor(organization, actor.id, row.assigneeId),
    manager = canManage(actor);
  return {
    canView:
      manager ||
      row.authorId === actor.id ||
      row.assigneeId === actor.id ||
      supervisor,
    canEdit: manager || row.authorId === actor.id || supervisor,
    canChangeStatus:
      manager ||
      row.authorId === actor.id ||
      row.assigneeId === actor.id ||
      supervisor,
  };
}
function publicTask(row, actor, organization, memberIds = []) {
  const permissions = taskPermissions(row, actor, organization);
  const name = (id) =>
    organization.people.find((person) => person.id === id)?.displayName ||
    "Недоступный сотрудник";
  return {
    ...response(row),
    authorName: name(row.authorId),
    assigneeName: name(row.assigneeId),
    canEdit: permissions.canEdit,
    canChangeStatus: permissions.canChangeStatus,
    canOpenConversation: canManage(actor) || memberIds.includes(actor.id),
  };
}
// Called only inside the task transaction and after current hierarchy checks.
// The standard DM is reused, and the standard slow-mode rule also applies here.
async function assignTaskMessage(
  client,
  team,
  actor,
  scope,
  assigneeId,
  task,
  correlationId,
) {
  const memberIds = [actor.id, assigneeId].sort();
  const existing = await client.query(
    `SELECT c.id FROM team_conversations c WHERE ${whereScope(1, "c")} AND c.kind='direct'
    AND ARRAY(SELECT m.user_id FROM team_members m WHERE m.conversation_id=c.id ORDER BY m.user_id)=$5::uuid[] ORDER BY c.created_at,c.id LIMIT 1`,
    [...tuple(scope), memberIds],
  );
  const conversationId = existing.rows[0]?.id || randomUUID();
  if (!existing.rowCount) {
    await client.query(
      `INSERT INTO team_conversations(id,legal_entity_id,region_id,project_id,responsibility_scope_id,kind,title,visibility,created_by)
      VALUES($1,$2,$3,$4,$5,'direct','Личный чат','private',$6)`,
      [conversationId, ...tuple(scope), actor.id],
    );
    for (const id of memberIds)
      await client.query(
        `INSERT INTO team_members(conversation_id,legal_entity_id,region_id,project_id,responsibility_scope_id,user_id) VALUES($1,$2,$3,$4,$5,$6)`,
        [conversationId, ...tuple(scope), id],
      );
    await client.query(
      `INSERT INTO team_conversation_originals(conversation_id,legal_entity_id,region_id,project_id,responsibility_scope_id,payload) VALUES($1,$2,$3,$4,$5,$6::jsonb)`,
      [
        conversationId,
        ...tuple(scope),
        JSON.stringify({
          kind: "direct",
          title: "Личный чат",
          visibility: "private",
          memberIds,
        }),
      ],
    );
  }
  await team.enforceConversationInterval(client, actor, scope, conversationId);
  const label = (task.assigneeName || "Сотрудник").replace(
    /[\[\]\\\r\n]/g,
    " ",
  );
  const messageId = randomUUID(),
    message =
      `@[${label}](user:${assigneeId})\n` +
      `Задача: ${task.title}\n${task.description ? `${task.description}\n` : ""}${task.dueDate ? `Срок: ${task.dueDate}\n` : ""}Задача доступна в разделе «Задачи».`
        .replace(/@\[/g, "＠[")
        .replace(/(^|[\s(])@all(?=$|[\s.,!?;:)\]])/g, "$1＠all");
  await client.query(
    `INSERT INTO team_messages(id,legal_entity_id,region_id,project_id,responsibility_scope_id,conversation_id,text,author_id,author_name,mention_user_ids)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      messageId,
      ...tuple(scope),
      conversationId,
      message,
      actor.id,
      actor.displayName,
      [assigneeId],
    ],
  );
  await client.query(
    `INSERT INTO team_message_originals(message_id,legal_entity_id,region_id,project_id,responsibility_scope_id,conversation_id,payload)
    VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)`,
    [
      messageId,
      ...tuple(scope),
      conversationId,
      JSON.stringify({
        conversationId,
        parentId: null,
        text: message,
        mentions: { userIds: [assigneeId], all: false },
        attachments: [],
      }),
    ],
  );
  await client.query(
    `INSERT INTO team_message_mentions(message_id,legal_entity_id,region_id,project_id,responsibility_scope_id,conversation_id,user_id) VALUES($1,$2,$3,$4,$5,$6,$7)`,
    [messageId, ...tuple(scope), conversationId, assigneeId],
  );
  await client.query(
    `UPDATE team_conversations SET updated_at=clock_timestamp() WHERE ${whereScope()} AND id=$5`,
    [...tuple(scope), conversationId],
  );
  await team.auditWrite(
    client,
    actor,
    scope,
    correlationId,
    "team.message.created",
    "team_messages",
    messageId,
    {
      conversationId,
      taskId: task.id,
      attachmentCount: 0,
      mentionCount: 1,
      mentionAll: false,
    },
  );
  return { conversationId, messageId };
}
async function taskMessageMetadata(client, actor, scope, messageIds) {
  if (!messageIds.length) return new Map();
  if (actor.sourceGrants && !actor.sourceGrants.some(grant => tuple(grant).every((value, index) => value === tuple(scope)[index]))) return new Map();
  const messages = await client.query(
    `SELECT l.message_id AS "messageId",t.id,t.author_id AS "authorId",t.assignee_id AS "assigneeId" FROM team_task_messages l JOIN team_tasks t ON t.id=l.task_id WHERE ${whereScope(1, "l")} AND l.message_id=ANY($5::uuid[])`,
    [...tuple(scope), messageIds],
  );
  if (!messages.rowCount) return new Map();
  const people = await client.query(
    `SELECT u.id,e.manager_id AS "managerId" FROM users u JOIN access_grants g ON g.user_id=u.id
    LEFT JOIN team_organization_employees e ON e.user_id=u.id AND e.responsibility_scope_id=g.responsibility_scope_id
    WHERE ${whereScope(1, "g")} AND u.active AND u.approved AND u.role=ANY($5::text[])`,
    [...tuple(scope), ROLES],
  );
  return new Map(
    messages.rows.map((row) => [
      row.messageId,
      taskPermissions(row, actor, { people: people.rows }).canView
        ? { taskId: row.id, taskAvailable: true }
        : { taskAvailable: false },
    ]),
  );
}
class TeamOrganizationTasksService {
  constructor(database, team) {
    this.database = database;
    this.team = team;
  }
  async context(client, supplied, scopeId) {
    const actor = await this.team.current(client, supplied),
      scope = await this.team.workScope(client, actor, uuid(scopeId));
    await this.team.lockScope(client, scope);
    return {
      actor,
      scope,
      organization: await loadOrganization(client, this.team, actor, scope),
    };
  }
  async operation(client, actor, scope, id, action, input) {
    await this.team.lockRecord(
      client,
      "organization-task-operation",
      input.operationId,
    );
    const found = await client.query(
      `SELECT actor_id AS "actorId",entity_id AS "entityId",action,responsibility_scope_id AS "scopeId",payload=$2::jsonb AS matches FROM team_organization_task_operations WHERE id=$1`,
      [input.operationId, JSON.stringify(input)],
    );
    const old = found.rows[0];
    if (!old) return false;
    if (
      old.actorId !== actor.id ||
      old.entityId !== id ||
      old.action !== action ||
      old.scopeId !== scope.responsibilityScopeId ||
      !old.matches
    )
      conflict("Идентификатор операции уже использован с другими данными.");
    return true;
  }
  async record(client, actor, scope, id, action, input, correlationId) {
    await client.query(
      `INSERT INTO team_organization_task_operations(id,legal_entity_id,region_id,project_id,responsibility_scope_id,actor_id,entity_id,action,payload)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,
      [
        input.operationId,
        ...tuple(scope),
        actor.id,
        id,
        action,
        JSON.stringify(input),
      ],
    );
    await this.team.auditWrite(
      client,
      actor,
      scope,
      correlationId,
      `team.${action === "employee" || action === "position" ? "organization" : "task"}.${action}`,
      action === "employee"
        ? "team_organization_employees"
        : action === "position"
          ? "team_organization_positions"
          : "team_tasks",
      id,
      { operationId: input.operationId },
    );
  }
  async organization(supplied, scopeId) {
    return this.database.transaction(async (client) => {
      const { actor, organization } = await this.context(
        client,
        supplied,
        scopeId,
      );
      return {
        ...organization,
        canManage: canManage(actor),
        assignableIds: this.assignable(organization, actor),
      };
    });
  }
  assignable(organization, actor) {
    return canManage(actor)
      ? organization.people
          .filter((person) => person.id !== actor.id)
          .map((person) => person.id)
      : [...subordinateIds(organization, actor.id)];
  }
  async savePosition(supplied, idValue, body, correlationId) {
    object(body, ["responsibilityScopeId", "operationId", "version", "title"]);
    const id = uuid(idValue),
      input = {
        responsibilityScopeId: uuid(body.responsibilityScopeId),
        operationId: uuid(body.operationId),
        version: version(body.version, 0),
        title: text(body.title, 120, "должность"),
      };
    return this.database.transaction(async (client) => {
      const { actor, scope } = await this.context(
        client,
        supplied,
        input.responsibilityScopeId,
      );
      if (!canManage(actor))
        forbidden("Оргструктуру меняет администратор области.");
      await this.team.lockRecord(client, "organization-position", id);
      const existing = (
        await client.query(
          `SELECT id,title,version FROM team_organization_positions WHERE ${whereScope()} AND id=$5`,
          [...tuple(scope), id],
        )
      ).rows[0];
      if (await this.operation(client, actor, scope, id, "position", input)) {
        if (!existing) unavailable();
        return existing;
      }
      if ((existing?.version || 0) !== input.version) conflict();
      if (
        (
          await client.query(
            `SELECT id FROM team_organization_positions WHERE ${whereScope()} AND title=$5 AND id<>$6`,
            [...tuple(scope), input.title, id],
          )
        ).rowCount
      )
        conflict("Такая должность уже существует.");
      let saved;
      if (existing)
        saved = await client.query(
          `UPDATE team_organization_positions SET title=$6,version=version+1,updated_at=clock_timestamp(),updated_by=$7 WHERE ${whereScope()} AND id=$5 RETURNING id,title,version`,
          [...tuple(scope), id, input.title, actor.id],
        );
      else {
        if (
          (
            await client.query(
              "SELECT id FROM team_organization_positions WHERE id=$1",
              [id],
            )
          ).rowCount
        )
          conflict();
        saved = await client.query(
          `INSERT INTO team_organization_positions(id,legal_entity_id,region_id,project_id,responsibility_scope_id,title,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,title,version`,
          [id, ...tuple(scope), input.title, actor.id],
        );
      }
      await this.record(
        client,
        actor,
        scope,
        id,
        "position",
        input,
        correlationId,
      );
      return saved.rows[0];
    });
  }
  async saveEmployee(supplied, idValue, body, correlationId) {
    object(body, [
      "responsibilityScopeId",
      "operationId",
      "version",
      "managerId",
      "positionId",
    ]);
    const id = uuid(idValue),
      input = {
        responsibilityScopeId: uuid(body.responsibilityScopeId),
        operationId: uuid(body.operationId),
        version: version(body.version, 0),
        managerId:
          body.managerId == null || body.managerId === ""
            ? null
            : uuid(body.managerId),
        positionId:
          body.positionId == null || body.positionId === ""
            ? null
            : uuid(body.positionId),
      };
    return this.database.transaction(async (client) => {
      await this.team.identity.lockUsers(
        client,
        [
          supplied.id,
          supplied.impersonation?.administratorId,
          id,
          input.managerId,
        ].filter(Boolean),
      );
      const { actor, scope, organization } = await this.context(
        client,
        supplied,
        input.responsibilityScopeId,
      );
      if (!canManage(actor))
        forbidden("Оргструктуру меняет администратор области.");
      const person = organization.people.find((person) => person.id === id);
      if (
        !person ||
        (input.managerId &&
          !organization.people.some((person) => person.id === input.managerId))
      )
        forbidden(
          "Сотрудник и руководитель должны иметь действующий доступ к этой области.",
        );
      if (input.managerId === id) fail("Сотрудник не может руководить собой.");
      if (
        input.positionId &&
        !organization.positions.some(
          (position) => position.id === input.positionId,
        )
      )
        fail("Выберите должность из этой области.");
      if (await this.operation(client, actor, scope, id, "employee", input))
        return person;
      if (person.version !== input.version) conflict();
      const all = (
        await client.query(
          `SELECT user_id,manager_id FROM team_organization_employees WHERE ${whereScope()}`,
          tuple(scope),
        )
      ).rows;
      const managers = new Map(
        all.map((person) => [person.user_id, person.manager_id]),
      );
      managers.set(id, input.managerId);
      const visited = new Set([id]);
      let next = input.managerId;
      while (next) {
        if (visited.has(next))
          fail("В цепочке руководителей не должно быть циклов.");
        visited.add(next);
        next = managers.get(next);
      }
      await client.query(
        `INSERT INTO team_organization_employees(legal_entity_id,region_id,project_id,responsibility_scope_id,user_id,manager_id,position_id,updated_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(responsibility_scope_id,user_id) DO UPDATE SET manager_id=EXCLUDED.manager_id,position_id=EXCLUDED.position_id,version=team_organization_employees.version+1,updated_at=clock_timestamp(),updated_by=EXCLUDED.updated_by`,
        [...tuple(scope), id, input.managerId, input.positionId, actor.id],
      );
      await this.record(
        client,
        actor,
        scope,
        id,
        "employee",
        input,
        correlationId,
      );
      return (
        await loadOrganization(client, this.team, actor, scope)
      ).people.find((person) => person.id === id);
    });
  }
  async row(client, scope, id) {
    const found = await client.query(
      `SELECT ${TASK_COLUMNS} FROM team_tasks WHERE ${whereScope()} AND id=$5`,
      [...tuple(scope), id],
    );
    if (!found.rowCount) unavailable();
    return found.rows[0];
  }
  async dto(client, row, actor, scope, organization) {
    if (!taskPermissions(row, actor, organization).canView) unavailable();
    const members = await client.query(
      `SELECT user_id FROM team_members WHERE ${whereScope()} AND conversation_id=$5`,
      [...tuple(scope), row.conversationId],
    );
    return publicTask(
      row,
      actor,
      organization,
      members.rows.map((member) => member.user_id),
    );
  }
  async tasks(supplied, query) {
    return this.database.transaction(async (client) => {
      const { actor, scope, organization } = await this.context(
        client,
        supplied,
        query.responsibilityScopeId,
      );
      const accessible = [actor.id, ...subordinateIds(organization, actor.id)];
      let before = null;
      if (query.before) {
        before = await this.row(client, scope, uuid(query.before));
        if (!taskPermissions(before, actor, organization).canView)
          unavailable();
      }
      const rows = await client.query(
        `SELECT ${TASK_COLUMNS} FROM team_tasks WHERE ${whereScope()} AND ($5::boolean OR author_id=$6 OR assignee_id=ANY($7::uuid[]))
        AND ($8::uuid IS NULL OR (updated_at,id)<(SELECT updated_at,id FROM team_tasks WHERE id=$8)) ORDER BY updated_at DESC,id DESC LIMIT 101`,
        [
          ...tuple(scope),
          canManage(actor),
          actor.id,
          accessible,
          // Resolve the validated cursor in PostgreSQL: JS Date loses microseconds.
          before?.id || null,
        ],
      );
      const hasMore = rows.rows.length > 100,
        selected = rows.rows.slice(0, 100),
        tasks = [];
      for (const row of selected)
        tasks.push(await this.dto(client, row, actor, scope, organization));
      return {
        tasks,
        hasMore,
        nextBefore: hasMore ? tasks.at(-1).id : null,
        assignableIds: this.assignable(organization, actor),
        canManage: canManage(actor),
      };
    });
  }
  async task(supplied, id, scopeId) {
    return this.database.transaction(async (client) => {
      const { actor, scope, organization } = await this.context(
        client,
        supplied,
        scopeId,
      );
      return this.dto(
        client,
        await this.row(client, scope, uuid(id)),
        actor,
        scope,
        organization,
      );
    });
  }
  async taskMessageLink(client, scope, id, row) {
    await client.query(
      `INSERT INTO team_task_messages(task_id,legal_entity_id,region_id,project_id,responsibility_scope_id,assignment_version,assignee_id,conversation_id,message_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        id,
        ...tuple(scope),
        row.version,
        row.assigneeId,
        row.conversationId,
        row.messageId,
      ],
    );
  }
  async createTask(supplied, body, correlationId) {
    const input = taskInput(body, true);
    return this.database.transaction(async (client) => {
      await this.team.identity.lockUsers(
        client,
        [
          supplied.id,
          supplied.impersonation?.administratorId,
          input.assigneeId,
        ].filter(Boolean),
      );
      const { actor, scope, organization } = await this.context(
        client,
        supplied,
        input.responsibilityScopeId,
      );
      await this.team.lockRecord(client, "task", input.id);
      const old = (
        await client.query(
          `SELECT ${TASK_COLUMNS} FROM team_tasks WHERE ${whereScope()} AND id=$5`,
          [...tuple(scope), input.id],
        )
      ).rows[0];
      if (old) {
        if (!taskPermissions(old, actor, organization).canView) unavailable();
        if (
          await this.operation(client, actor, scope, input.id, "create", input)
        )
          return this.dto(client, old, actor, scope, organization);
        conflict("Идентификатор задачи уже использован.");
      }
      if (!this.assignable(organization, actor).includes(input.assigneeId))
        forbidden(
          "Задачу можно назначить только действующему подчинённому по цепочке руководителей.",
        );
      if (await this.operation(client, actor, scope, input.id, "create", input))
        unavailable();
      if (
        (
          await client.query("SELECT id FROM team_tasks WHERE id=$1", [
            input.id,
          ])
        ).rowCount
      )
        conflict();
      const link = await assignTaskMessage(
        client,
        this.team,
        actor,
        scope,
        input.assigneeId,
        {
          ...input,
          assigneeName: organization.people.find(
            (person) => person.id === input.assigneeId,
          )?.displayName,
        },
        correlationId,
      );
      const saved = await client.query(
        `INSERT INTO team_tasks(id,legal_entity_id,region_id,project_id,responsibility_scope_id,title,description,author_id,assignee_id,due_date,conversation_id,message_id,updated_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$8) RETURNING ${TASK_COLUMNS}`,
        [
          input.id,
          ...tuple(scope),
          input.title,
          input.description,
          actor.id,
          input.assigneeId,
          input.dueDate,
          link.conversationId,
          link.messageId,
        ],
      );
      await this.taskMessageLink(client, scope, input.id, saved.rows[0]);
      await this.record(
        client,
        actor,
        scope,
        input.id,
        "create",
        input,
        correlationId,
      );
      return this.dto(client, saved.rows[0], actor, scope, organization);
    });
  }
  async changeTask(supplied, idValue, body, action, correlationId) {
    const id = uuid(idValue);
    let input;
    if (action === "status") {
      object(body, [
        "responsibilityScopeId",
        "operationId",
        "version",
        "status",
      ]);
      if (!STATUSES.includes(body.status)) fail("Выберите статус задачи.");
      input = {
        responsibilityScopeId: uuid(body.responsibilityScopeId),
        operationId: uuid(body.operationId),
        version: version(body.version),
        status: body.status,
      };
    } else input = taskInput(body);
    return this.database.transaction(async (client) => {
      await this.team.identity.lockUsers(
        client,
        [
          supplied.id,
          supplied.impersonation?.administratorId,
          input.assigneeId,
        ].filter(Boolean),
      );
      const { actor, scope, organization } = await this.context(
          client,
          supplied,
          input.responsibilityScopeId,
        ),
        old = await this.row(client, scope, id),
        permission = taskPermissions(old, actor, organization);
      if (!permission.canView) unavailable();
      if (
        !(action === "status" ? permission.canChangeStatus : permission.canEdit)
      )
        forbidden("Недостаточно прав для изменения задачи.");
      if (await this.operation(client, actor, scope, id, action, input))
        return this.dto(client, old, actor, scope, organization);
      if (old.version !== input.version)
        conflict("Задача уже изменена. Обновите её перед сохранением.");
      let saved;
      if (action === "status")
        saved = await client.query(
          `UPDATE team_tasks SET status=$6,version=version+1,updated_at=clock_timestamp(),updated_by=$7 WHERE ${whereScope()} AND id=$5 RETURNING ${TASK_COLUMNS}`,
          [...tuple(scope), id, input.status, actor.id],
        );
      else {
        let link = old;
        if (old.assigneeId !== input.assigneeId) {
          if (!this.assignable(organization, actor).includes(input.assigneeId))
            forbidden(
              "Нового исполнителя можно выбрать только среди действующих подчинённых.",
            );
          link = await assignTaskMessage(
            client,
            this.team,
            actor,
            scope,
            input.assigneeId,
            {
              ...input,
              id,
              assigneeName: organization.people.find(
                (person) => person.id === input.assigneeId,
              )?.displayName,
            },
            correlationId,
          );
        }
        saved = await client.query(
          `UPDATE team_tasks SET title=$6,description=$7,assignee_id=$8,due_date=$9,conversation_id=$10,message_id=$11,version=version+1,updated_at=clock_timestamp(),updated_by=$12 WHERE ${whereScope()} AND id=$5 RETURNING ${TASK_COLUMNS}`,
          [
            ...tuple(scope),
            id,
            input.title,
            input.description,
            input.assigneeId,
            input.dueDate,
            link.conversationId,
            link.messageId,
            actor.id,
          ],
        );
        if (old.assigneeId !== input.assigneeId)
          await this.taskMessageLink(client, scope, id, saved.rows[0]);
      }
      await this.record(client, actor, scope, id, action, input, correlationId);
      return this.dto(client, saved.rows[0], actor, scope, organization);
    });
  }
}
Injectable()(TeamOrganizationTasksService);
Inject(DatabaseService)(TeamOrganizationTasksService, undefined, 0);
Inject(TeamService)(TeamOrganizationTasksService, undefined, 1);
class TeamOrganizationTasksController {
  constructor(service) {
    this.service = service;
  }
  organization(actor, scope) {
    return this.service.organization(actor, scope);
  }
  saveEmployee(actor, id, body, req) {
    return this.service.saveEmployee(actor, id, body, req.correlationId);
  }
  savePosition(actor, id, body, req) {
    return this.service.savePosition(actor, id, body, req.correlationId);
  }
  tasks(actor, query) {
    return this.service.tasks(actor, query);
  }
  task(actor, id, scope) {
    return this.service.task(actor, id, scope);
  }
  createTask(actor, body, req) {
    return this.service.createTask(actor, body, req.correlationId);
  }
  editTask(actor, id, body, req) {
    return this.service.changeTask(actor, id, body, "edit", req.correlationId);
  }
  status(actor, id, body, req) {
    return this.service.changeTask(
      actor,
      id,
      body,
      "status",
      req.correlationId,
    );
  }
}
Inject(TeamOrganizationTasksService)(
  TeamOrganizationTasksController,
  undefined,
  0,
);
Controller("team")(TeamOrganizationTasksController);
UseGuards(AuthGuard)(TeamOrganizationTasksController);
for (const [name, decorator] of [
  ["organization", Get("organization")],
  ["saveEmployee", Put("organization/employees/:id")],
  ["savePosition", Put("organization/positions/:id")],
  ["tasks", Get("tasks")],
  ["task", Get("tasks/:id")],
  ["createTask", Post("tasks")],
  ["editTask", Put("tasks/:id")],
  ["status", Put("tasks/:id/status")],
]) {
  const descriptor = Object.getOwnPropertyDescriptor(
    TeamOrganizationTasksController.prototype,
    name,
  );
  decorator(TeamOrganizationTasksController.prototype, name, descriptor);
  Header("Cache-Control", "no-store")(
    TeamOrganizationTasksController.prototype,
    name,
    descriptor,
  );
  CurrentActor()(TeamOrganizationTasksController.prototype, name, 0);
}
Query("responsibilityScopeId")(
  TeamOrganizationTasksController.prototype,
  "organization",
  1,
);
Query()(TeamOrganizationTasksController.prototype, "tasks", 1);
Param("id")(TeamOrganizationTasksController.prototype, "task", 1);
Query("responsibilityScopeId")(
  TeamOrganizationTasksController.prototype,
  "task",
  2,
);
Body()(TeamOrganizationTasksController.prototype, "createTask", 1);
Req()(TeamOrganizationTasksController.prototype, "createTask", 2);
for (const name of ["saveEmployee", "savePosition", "editTask", "status"]) {
  Param("id")(TeamOrganizationTasksController.prototype, name, 1);
  Body()(TeamOrganizationTasksController.prototype, name, 2);
  Req()(TeamOrganizationTasksController.prototype, name, 3);
}
module.exports = {
  TeamOrganizationTasksService,
  TeamOrganizationTasksController,
  loadOrganization,
  subordinateIds,
  isSupervisor,
  taskPermissions,
  assignTaskMessage,
  taskInput,
  taskMessageMetadata,
  STATUSES,
};
