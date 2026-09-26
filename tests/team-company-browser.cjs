"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { createTestServer } = require("./local-test-server.cjs");
const { articleStructure, createArticlePosition } = require("./team-article-fixtures.cjs");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

(async () => {
  const fixture = await createTestServer({
    staffTeamActors: true,
    builtFrontend: process.env.TEAM_BUILT_FRONTEND === "true",
  });
  let browser;
  try {
    const { ids, adminPool, devLogin, request } = fixture;
    const otherProject = randomUUID(),
      otherScope = randomUUID();
    await adminPool.query(
      "INSERT INTO projects(id,name,legal_entity_id,region_id) VALUES($1,$2,$3,$4)",
      [otherProject, "Второй проект", ids.legal, ids.region],
    );
    await adminPool.query(
      "INSERT INTO responsibility_scopes(id,project_id,name) VALUES($1,$2,$3)",
      [otherScope, otherProject, "Другая команда"],
    );
    await adminPool.query(
      "INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id,personal_data_visible) VALUES($1,$2,$3,$4,$5,true)",
      [ids.admin, ids.legal, ids.region, otherProject, otherScope],
    );
    await adminPool.query(
      "UPDATE access_grants SET project_id=$2,responsibility_scope_id=$3 WHERE user_id=$1",
      [ids.drivers[1], otherProject, otherScope],
    );
    await adminPool.query(
      "UPDATE access_grants SET personal_data_visible=true",
    );
    await adminPool.query(
      "UPDATE users SET display_name=CASE id WHEN $1 THEN 'Сотрудник первого проекта' WHEN $2 THEN 'Сотрудник второго проекта' ELSE display_name END WHERE id=ANY($3::uuid[])",
      [ids.drivers[0], ids.drivers[1], ids.drivers],
    );
    const admin = await devLogin(ids.admin),
      employee = await devLogin(ids.drivers[0]),
      peer = await devLogin(ids.drivers[1]);
    const api = async (method, route, body, session = admin) => {
      const result = await request(method, route, body, session.accessToken);
      assert.ok(
        [200, 201].includes(result.status),
        `${method} ${route}: ${result.status} ${JSON.stringify(result.body)}`,
      );
      return result.body;
    };
    const createChat = async (
      title,
      sourceScope,
      session = admin,
      extra = {},
    ) =>
      api(
        "POST",
        "/team/conversations",
        {
          id: randomUUID(),
          responsibilityScopeId: sourceScope,
          kind: "channel",
          title,
          memberIds: [],
          ...extra,
        },
        session,
      );
    const first = await createChat("Общая работа первого проекта", ids.scope);
    const second = await createChat(
      "Общая работа второго проекта",
      otherScope,
      peer,
    );
    const privateChat = await createChat(
      "Исторический закрытый канал",
      otherScope,
      admin,
      { visibility: "private", memberIds: [ids.drivers[1], ids.mechanic] },
    );
    await adminPool.query(
      "UPDATE team_conversations SET created_by=$2 WHERE id=$1",
      [privateChat.id, ids.drivers[1]],
    );
    const direct = await api(
      "POST",
      "/team/conversations",
      {
        id: randomUUID(),
        responsibilityScopeId: otherScope,
        kind: "direct",
        title: "",
        memberIds: [ids.drivers[1], ids.mechanic],
      },
      peer,
    );
    await api(
      "POST",
      "/team/messages",
      {
        id: randomUUID(),
        responsibilityScopeId: otherScope,
        conversationId: second.id,
        text: "История другого проекта",
        parentId: null,
      },
      peer,
    );
    for (const [scope, title] of [
      [ids.scope, "Инструкция первого проекта"],
      [otherScope, "Инструкция второго проекта"],
    ]) {
      const articlePosition = await createArticlePosition(fixture, admin, scope);
      await api("PUT", "/team/articles", {
        id: randomUUID(),
        responsibilityScopeId: scope,
        title,
        body: "Сохранённое содержание инструкции",
        version: 0,
        ...articleStructure(articlePosition),
      });
    }
    browser = await chromium.launch({
      headless: true,
      ...(process.env.CHROME_PATH
        ? { executablePath: process.env.CHROME_PATH }
        : {}),
    });
    const errors = [];
    async function pageFor(session) {
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
      page.on("pageerror", (error) =>
        errors.push(error.stack || error.message),
      );
      page.on("dialog", (dialog) => dialog.accept());
      const stylesheet = page.waitForResponse((response) =>
        /\/assets\/app[^/]*\.css$/.test(new URL(response.url()).pathname),
      );
      await page.goto(`${fixture.origin}/?section=team`);
      assert.equal(
        (await stylesheet).status(),
        200,
        "The complete app stylesheet must load for visual assertions",
      );
      try {
        await page
          .getByRole("heading", { name: "Команда", exact: true })
          .waitFor();
      } catch (error) {
        console.error(
          "Startup page errors",
          errors,
          await page.locator("body").innerText(),
        );
        await page.screenshot({
          path: path.resolve(
            __dirname,
            "../.local/team-company-qa/startup-failure.png",
          ),
          fullPage: true,
        });
        throw error;
      }
      await page
        .getByText("Общая работа второго проекта", { exact: true })
        .first()
        .waitFor();
      return page;
    }
    const employeePage = await pageFor(employee);
    assert.equal(
      await employeePage.getByLabel("Область команды", { exact: true }).count(),
      0,
    );
    assert.equal(await employeePage.locator(".team-heading select").count(), 0);
    assert.equal(
      await employeePage
        .getByText("Исторический закрытый канал", { exact: true })
        .count(),
      0,
    );
    assert.equal(
      (
        await api("GET", "/team/conversations", undefined, employee)
      ).conversations.some((row) => row.id === direct.id),
      false,
    );
    await employeePage
      .getByText("Общая работа первого проекта", { exact: true })
      .first()
      .waitFor();
    await employeePage
      .getByText("Общая работа второго проекта", { exact: true })
      .first()
      .click();
    await employeePage
      .getByText("История другого проекта", { exact: true })
      .waitFor();
    await employeePage
      .getByLabel("Сообщение в чат", { exact: true })
      .fill("Сообщение через единую команду");
    await employeePage
      .getByRole("button", { name: "Отправить", exact: true })
      .click();
    await employeePage
      .locator(".team-message")
      .filter({ hasText: "Сообщение через единую команду" })
      .waitFor();
    const sent = await adminPool.query(
      "SELECT responsibility_scope_id FROM team_messages WHERE conversation_id=$1 AND text=$2",
      [second.id, "Сообщение через единую команду"],
    );
    assert.equal(sent.rows[0].responsibility_scope_id, otherScope);
    // A late detail response must not replace the chat selected afterwards.
    await employeePage
      .getByText("Общая работа первого проекта", { exact: true })
      .first()
      .click();
    let releaseDetail, detailStarted;
    const heldDetail = new Promise((resolve) => {
      releaseDetail = resolve;
    });
    const enteredDetail = new Promise((resolve) => {
      detailStarted = resolve;
    });
    const delayedPath = `**/api/v1/team/conversations/${second.id}?*`;
    await employeePage.route(delayedPath, async (route) => {
      detailStarted();
      await heldDetail;
      await route.continue().catch(() => {});
    });
    await employeePage
      .getByText("Общая работа второго проекта", { exact: true })
      .first()
      .click();
    await enteredDetail;
    await employeePage
      .getByText("Общая работа первого проекта", { exact: true })
      .first()
      .click();
    releaseDetail();
    await employeePage
      .getByText("Начните обсуждение", { exact: true })
      .waitFor();
    assert.equal(
      await employeePage
        .locator(".team-message")
        .filter({ hasText: "История другого проекта" })
        .count(),
      0,
    );
    await employeePage.unroute(delayedPath);
    // Missing source scope must clear the cached list instead of guessing a project.
    const listPath = (url) => url.pathname === "/api/v1/team/conversations";
    await employeePage.route(listPath, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          conversations: [
            {
              id: second.id,
              title: "Чат без источника",
              kind: "channel",
              visibility: "public",
              memberIds: [],
            },
          ],
        }),
      }),
    );
    await employeePage
      .getByRole("button", { name: "Обновить команду", exact: true })
      .click();
    await employeePage
      .getByText("Не удалось проверить список чатов. Обновите команду.", {
        exact: true,
      })
      .waitFor();
    assert.equal(await employeePage.locator(".team-chat-item").count(), 0);
    await employeePage.unroute(listPath);
    await employeePage
      .getByRole("button", { name: "Обновить команду", exact: true })
      .click();
    await employeePage
      .getByText("Общая работа второго проекта", { exact: true })
      .first()
      .waitFor();
    await employeePage
      .getByRole("button", { name: "Создать канал", exact: true })
      .first()
      .click();
    let dialog = employeePage.getByRole("dialog", {
      name: "Новый канал",
      exact: true,
    });
    assert.equal(
      await dialog
        .getByRole("checkbox", { name: "Закрытый канал", exact: true })
        .count(),
      0,
    );
    await dialog
      .getByLabel("Название канала", { exact: true })
      .fill("Канал сотрудника");
    await dialog
      .getByRole("button", { name: "Создать канал", exact: true })
      .click();
    await dialog.waitFor({ state: "detached" });
    await employeePage
      .getByRole("button", { name: "Действия чата", exact: true })
      .click();
    assert.equal(
      await employeePage
        .getByRole("menuitem", { name: "Доступ к чату", exact: true })
        .count(),
      0,
    );
    await employeePage.keyboard.press("Escape");
    const adminPage = await pageFor(admin);
    await adminPage
      .getByText("Исторический закрытый канал", { exact: true })
      .first()
      .click();
    await adminPage
      .getByRole("button", { name: "Действия чата", exact: true })
      .click();
    await adminPage
      .getByRole("menuitem", { name: "Доступ к чату", exact: true })
      .click();
    dialog = adminPage.getByRole("dialog", {
      name: "Доступ к чату",
      exact: true,
    });
    const creatorCheckbox = dialog
      .getByRole("group", { name: "Участники закрытого чата", exact: true })
      .getByRole("checkbox", {
        name: "Сотрудник второго проекта",
        exact: true,
      });
    assert.equal(await creatorCheckbox.isEnabled(), true);
    await creatorCheckbox.uncheck();
    await dialog
      .getByRole("button", { name: "Сохранить доступ", exact: true })
      .click();
    await dialog.waitFor({ state: "detached" });
    const changed = await api(
      "GET",
      `/team/conversations/${privateChat.id}?responsibilityScopeId=${otherScope}`,
    );
    assert.equal(
      changed.conversation.memberIds.includes(ids.drivers[1]),
      false,
    );
    await adminPage
      .getByRole("button", { name: "База знаний", exact: true })
      .click();
    await adminPage
      .getByText("Инструкция первого проекта", { exact: true })
      .first()
      .waitFor();
    await adminPage
      .getByText("Инструкция второго проекта", { exact: true })
      .first()
      .waitFor();
    await adminPage
      .getByText("Инструкция второго проекта", { exact: true })
      .first()
      .click();
    for (const text of [
      "Правка другого проекта",
      "Повторная правка другого проекта",
    ]) {
      await adminPage
        .getByRole("button", { name: "Действия инструкции", exact: true })
        .click();
      await adminPage
        .getByRole("menuitem", { name: "Редактировать", exact: true })
        .click();
      await adminPage.getByLabel("Текст", { exact: true }).fill(text);
      await adminPage
        .getByRole("button", { name: "Сохранить статью", exact: true })
        .click();
      await adminPage
        .locator(".team-document-body")
        .filter({ hasText: text })
        .waitFor();
    }
    const editedArticle = await adminPool.query(
      "SELECT responsibility_scope_id,body FROM team_articles WHERE title=$1",
      ["Инструкция второго проекта"],
    );
    assert.equal(editedArticle.rows[0].responsibility_scope_id, otherScope);
    assert.equal(
      editedArticle.rows[0].body,
      "Повторная правка другого проекта",
    );
    await adminPage
      .getByRole("button", { name: "Сводки", exact: true })
      .click();
    await adminPage
      .getByLabel("Проект", { exact: true })
      .selectOption(otherScope);
    assert.equal(
      await adminPage.getByLabel("Проект", { exact: true }).inputValue(),
      otherScope,
    );
    await adminPage
      .getByRole("button", { name: "Обсуждения", exact: true })
      .click();
    await adminPage
      .getByText("Общая работа первого проекта", { exact: true })
      .first()
      .waitFor();
    await adminPage
      .getByText("Общая работа второго проекта", { exact: true })
      .first()
      .waitFor();
    assert.equal(
      await adminPage.getByLabel("Проект", { exact: true }).count(),
      0,
    );
    const output = path.resolve(__dirname, "../.local/team-company-qa");
    await fs.mkdir(output, { recursive: true });
    await employeePage.screenshot({
      path: path.join(output, "company-desktop.png"),
      fullPage: true,
    });
    await employeePage.setViewportSize({ width: 390, height: 844 });
    assert.ok(
      await employeePage.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await employeePage.screenshot({
      path: path.join(output, "company-mobile.png"),
      fullPage: true,
    });
    assert.deepEqual(errors, []);
    console.log(
      "PASS company team browser: common list across grants/projects, original source writes and repeated article edits, stale detail and malformed-list guards, private/direct history hidden, admin-only audience and removable creator, aggregated knowledge, preserved work projects, mobile",
    );
  } finally {
    if (browser) await browser.close();
    await fixture.close();
  }
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
