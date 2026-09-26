"use strict";
const assert = require("node:assert/strict"),
  fs = require("node:fs/promises"),
  path = require("node:path");
const { randomUUID } = require("node:crypto");
const { createTestServer } = require("./local-test-server.cjs");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
(async () => {
  const f = await createTestServer({
    staffTeamActors: true,
    builtFrontend: process.env.TEAM_BUILT_FRONTEND === "true",
  });
  let browser;
  try {
    const { ids } = f,
      scope = ids.scope;
    await f.adminPool.query(
      "UPDATE access_grants SET personal_data_visible=true",
    );
    const admin = await f.devLogin(ids.admin),
      manager = await f.devLogin(ids.dispatcher),
      lead = await f.devLogin(ids.drivers[0]),
      employee = await f.devLogin(ids.drivers[1]);
    const api = async (method, route, body, session = admin) => {
      const result = await f.request(method, route, body, session.accessToken);
      assert.ok(
        [200, 201].includes(result.status),
        `${result.status} ${JSON.stringify(result.body)}`,
      );
      return result.body;
    };
    const scoped = (route) => `${route}?responsibilityScopeId=${scope}`;
    browser = await chromium.launch({
      headless: true,
      ...(process.env.CHROME_PATH
        ? { executablePath: process.env.CHROME_PATH }
        : {}),
    });
    const errors = [];
    const pageFor = async (session) => {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
      });
      await context.addInitScript(
        (value) =>
          sessionStorage.setItem(
            "ecl.session.v2",
            JSON.stringify({ session: value }),
          ),
        { ...session, rememberedDevice: false },
      );
      const page = await context.newPage();
      page.setDefaultTimeout(20000);
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("dialog", (dialog) => dialog.accept());
      await page.goto(`${f.origin}/?section=team`);
      await page
        .getByRole("navigation", { name: "Разделы команды" })
        .getByRole("button", { name: "Задачи", exact: true })
        .click();
      await page
        .getByRole("heading", {
          name: "От поручения к результату",
          exact: true,
        })
        .waitFor();
      return page;
    };
    const administrator = await pageFor(admin);
    await administrator
      .getByRole("button", { name: "Оргструктура", exact: true })
      .click();
    const orgDialog = administrator.getByRole("dialog", {
      name: "Оргструктура",
      exact: true,
    });
    await orgDialog
      .getByRole("button", { name: "Должности", exact: true })
      .click();
    await orgDialog
      .getByRole("button", { name: "Добавить должность", exact: true })
      .click();
    await orgDialog
      .getByLabel("Название должности", { exact: true })
      .fill("Руководитель направления");
    await orgDialog
      .getByRole("button", { name: "Сохранить должность", exact: true })
      .click();
    await orgDialog
      .getByText(
        "Должность сохранена. Системные права сотрудников не меняются.",
        { exact: true },
      )
      .waitFor();
    const organization = await api("GET", scoped("/team/organization")),
      position = organization.positions.find(
        (position) => position.title === "Руководитель направления",
      );
    assert.ok(position);
    await orgDialog
      .getByRole("button", { name: "Сотрудники", exact: true })
      .click();
    const configure = async (name, managerId, positionId = "") => {
      await orgDialog
        .getByRole("button", { name: `Настроить ${name}`, exact: true })
        .click();
      await orgDialog
        .getByLabel("Руководитель сотрудника", { exact: true })
        .selectOption(managerId);
      if (positionId)
        await orgDialog
          .getByLabel("Должность сотрудника", { exact: true })
          .selectOption(positionId);
      await orgDialog
        .getByRole("button", { name: "Сохранить сотрудника", exact: true })
        .click();
      await orgDialog
        .getByRole("button", { name: "Сохранить сотрудника", exact: true })
        .waitFor({ state: "visible" });
      await administrator.waitForFunction(
        () =>
          !document.querySelector('.team-org-editor button[type="submit"]')
            ?.disabled === false,
      );
    };
    await configure("Диспетчер", ids.admin, position.id);
    await configure("Водитель 01", ids.dispatcher);
    await configure("Водитель 02", ids.drivers[0]);
    const output = path.resolve(__dirname, "../.local/team-tasks-qa");
    await fs.mkdir(output, { recursive: true });
    await administrator.screenshot({
      path: path.join(output, "organization-desktop.png"),
      fullPage: true,
    });
    await orgDialog
      .getByRole("button", { name: "Закрыть оргструктура", exact: true })
      .click();
    const managerPage = await pageFor(manager);
    assert.equal(
      await managerPage
        .getByRole("button", { name: "Оргструктура", exact: true })
        .count(),
      0,
    );
    await managerPage
      .getByRole("button", { name: "Новая задача", exact: true })
      .click();
    let dialog = managerPage.getByRole("dialog", {
      name: "Новая задача",
      exact: true,
    });
    await dialog
      .getByLabel("Название задачи", { exact: true })
      .fill("Согласовать график команды");
    await dialog
      .getByLabel("Описание задачи", { exact: true })
      .fill("Проверить загрузку команды и согласовать новый график.");
    await dialog
      .getByLabel("Исполнитель", { exact: true })
      .selectOption(ids.drivers[1]);
    await dialog.getByLabel("Срок задачи", { exact: true }).fill("2026-12-20");
    await dialog
      .getByRole("button", { name: "Поставить задачу", exact: true })
      .click();
    dialog = managerPage.getByRole("dialog", { name: "Задача", exact: true });
    await dialog
      .getByRole("heading", { name: "Согласовать график команды", exact: true })
      .waitFor();
    let task = (
      await api("GET", scoped("/team/tasks"), undefined, manager)
    ).tasks.find((task) => task.title === "Согласовать график команды");
    assert.ok(task);
    assert.equal(task.assigneeId, ids.drivers[1]);
    const messages = await api(
      "GET",
      scoped(`/team/conversations/${task.conversationId}`),
      undefined,
      employee,
    );
    assert.equal(
      messages.messages.filter((message) => message.id === task.messageId)
        .length,
      1,
    );
    assert.deepEqual(messages.messages[0].mentions.userIds, [ids.drivers[1]]);
    await dialog
      .getByRole("button", { name: "Закрыть задача", exact: true })
      .click();
    await managerPage
      .getByRole("region", { name: "Выполнить", exact: true })
      .getByRole("button", {
        name: "Открыть задачу: Согласовать график команды",
        exact: true,
      })
      .waitFor();
    await managerPage.screenshot({
      path: path.join(output, "tasks-desktop.png"),
      fullPage: true,
    });
    const employeePage = await pageFor(employee);
    assert.equal(
      await employeePage
        .getByRole("button", { name: "Новая задача", exact: true })
        .isEnabled(),
      false,
    );
    await employeePage
      .getByRole("button", {
        name: "Открыть задачу: Согласовать график команды",
        exact: true,
      })
      .click();
    let employeeDialog = employeePage.getByRole("dialog", {
      name: "Задача",
      exact: true,
    });
    assert.equal(
      await employeeDialog
        .getByRole("button", { name: "Редактировать задачу", exact: true })
        .count(),
      0,
    );
    await employeeDialog
      .getByRole("button", { name: "Статус: В процессе", exact: true })
      .click();
    await employeeDialog
      .getByRole("button", { name: "Статус: В процессе", exact: true })
      .waitFor();
    await employeePage.waitForFunction(
      () =>
        document
          .querySelector('[aria-label="Статус: В процессе"]')
          ?.getAttribute("aria-pressed") === "true",
    );
    await employeeDialog
      .getByRole("button", { name: "Статус: Сделано", exact: true })
      .click();
    await employeePage.waitForFunction(
      () =>
        document
          .querySelector('[aria-label="Статус: Сделано"]')
          ?.getAttribute("aria-pressed") === "true",
    );
    await employeeDialog
      .getByRole("button", { name: "Закрыть задача", exact: true })
      .click();
    await employeePage
      .getByRole("region", { name: "Сделано", exact: true })
      .getByRole("button", {
        name: "Открыть задачу: Согласовать график команды",
        exact: true,
      })
      .waitFor();
    await managerPage.bringToFront();
    await managerPage
      .getByRole("button", {
        name: "Открыть задачу: Согласовать график команды",
        exact: true,
      })
      .click();
    dialog = managerPage.getByRole("dialog", { name: "Задача", exact: true });
    await dialog
      .getByRole("button", { name: "Редактировать задачу", exact: true })
      .click();
    dialog = managerPage.getByRole("dialog", {
      name: "Редактировать задачу",
      exact: true,
    });
    await dialog
      .getByLabel("Название задачи", { exact: true })
      .fill("Согласовать обновлённый график");
    task = await api(
      "GET",
      scoped(`/team/tasks/${task.id}`),
      undefined,
      manager,
    );
    await api(
      "PUT",
      `/team/tasks/${task.id}/status`,
      {
        responsibilityScopeId: scope,
        operationId: randomUUID(),
        version: task.version,
        status: "todo",
      },
      employee,
    );
    if (
      await dialog
        .getByRole("button", { name: "Сохранить задачу", exact: true })
        .isEnabled()
    )
      await dialog
        .getByRole("button", { name: "Сохранить задачу", exact: true })
        .click();
    await dialog.getByText("Задача уже изменилась", { exact: true }).waitFor();
    assert.equal(
      await dialog.getByLabel("Название задачи", { exact: true }).inputValue(),
      "Согласовать обновлённый график",
    );
    await dialog
      .getByRole("button", {
        name: "Сохранить мой вариант после проверки",
        exact: true,
      })
      .click();
    await dialog
      .getByRole("button", { name: "Сохранить задачу", exact: true })
      .click();
    dialog = managerPage.getByRole("dialog", { name: "Задача", exact: true });
    await dialog
      .getByRole("heading", {
        name: "Согласовать обновлённый график",
        exact: true,
      })
      .waitFor();
    await dialog
      .getByRole("button", { name: "Закрыть задача", exact: true })
      .click();
    const leadPage = await pageFor(lead);
    await leadPage
      .getByRole("button", {
        name: "Открыть задачу: Согласовать обновлённый график",
        exact: true,
      })
      .click();
    const leadDialog = leadPage.getByRole("dialog", {
      name: "Задача",
      exact: true,
    });
    await leadDialog
      .getByRole("heading", {
        name: "Согласовать обновлённый график",
        exact: true,
      })
      .waitFor();
    assert.equal(
      await leadDialog
        .getByRole("button", { name: "Открыть личный чат", exact: true })
        .count(),
      0,
    );
    await administrator.bringToFront();
    await administrator
      .getByRole("button", { name: "Оргструктура", exact: true })
      .click();
    await configure("Водитель 02", ids.dispatcher);
    await orgDialog
      .getByRole("button", { name: "Закрыть оргструктура", exact: true })
      .click();
    await leadPage.bringToFront();
    await leadDialog.waitFor({ state: "detached", timeout: 25000 });
    assert.equal(
      await leadPage
        .getByRole("button", {
          name: "Открыть задачу: Согласовать обновлённый график",
          exact: true,
        })
        .count(),
      0,
    );
    await managerPage.setViewportSize({ width: 390, height: 844 });
    assert.ok(
      await managerPage.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await managerPage.screenshot({
      path: path.join(output, "tasks-mobile.png"),
      fullPage: true,
    });
    assert.deepEqual(errors, []);
    console.log(
      "PASS tasks browser: admin positions and manager chain, transitive assignment, atomic DM mention, kanban todo/in-progress/done, assignee controls, conflict draft preserved, supervisor revocation, mobile",
    );
  } finally {
    if (browser) await browser.close();
    await f.close();
  }
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
