// Disposable localhost fixture only. No production accounts or external messages.
// ECL_BROWSER_QA_MODULE=/absolute/playwright-core ECL_BROWSER_FIXTURE=/absolute/fixture.json node durable-notifications.e2e.cjs
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { chromium } = require(process.env.ECL_BROWSER_QA_MODULE);
const fixture = JSON.parse(
  fs.readFileSync(process.env.ECL_BROWSER_FIXTURE, "utf8"),
);
assert.ok(["localhost", "127.0.0.1"].includes(new URL(fixture.url).hostname));
const admin = fixture.profiles.find((p) => p.role === "access_admin");
const driver = fixture.profiles.find((p) => p.role === "driver");
const output = path.dirname(process.env.ECL_BROWSER_FIXTURE);
const sessionKey = "ecl.session.v2";
const qaTitle = `Synthetic urgent QA ${Date.now()}`;
const pass = (label) => process.stdout.write(`PASS ${label}\n`);
(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.ECL_CHROME_PATH ||
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  });
  const errors = [];
  const contexts = [];
  async function newContext(options = {}) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      ...options,
    });
    contexts.push(context);
    context.on("page", (page) =>
      page.on("pageerror", (e) => errors.push(e.message)),
    );
    return context;
  }
  async function login(page, profile, remember = true) {
    await page.goto(fixture.url);
    await page.locator("#login-phone").fill(profile.phone);
    await page.locator("#login-password").fill(profile.password);
    await page
      .getByLabel("Запомнить вход на этом устройстве")
      .setChecked(remember);
    await page.getByRole("button", { name: "Войти", exact: true }).click();
    await page
      .getByRole("button", { name: "Выйти из кабинета", exact: true })
      .waitFor();
  }
  async function signedIn(page) {
    await page
      .getByRole("button", { name: "Выйти из кабинета", exact: true })
      .waitFor();
  }
  async function token(page) {
    return page.evaluate(
      (k) => JSON.parse(sessionStorage.getItem(k)).session.accessToken,
      sessionKey,
    );
  }
  async function openNotifications(page) {
    const details = page.locator("details.max-notifications");
    if (!((await details.getAttribute("open")) !== null))
      await details.locator("summary").click();
    await page
      .getByRole("region", { name: "Уведомления", exact: true })
      .waitFor();
    return details;
  }
  try {
    const context = await newContext();
    const page = await context.newPage();
    await page.goto(fixture.url);
    assert.equal(
      await page.getByLabel("Запомнить вход на этом устройстве").isChecked(),
      true,
    );
    await login(page, admin);
    const originalToken = await token(page);
    const cookies = await context.cookies();
    assert.ok(cookies.some((c) => c.httpOnly && c.expires > 0));
    assert.ok(
      !(await page.evaluate(() => document.cookie)).includes(
        cookies.find((c) => c.httpOnly).value,
      ),
    );
    const storage = await page.evaluate(() => JSON.stringify(localStorage));
    assert.ok(!storage.includes(originalToken));
    assert.ok(!storage.includes(cookies.find((c) => c.httpOnly).value));
    let panel = await openNotifications(page);
    await panel
      .getByText("Вход сохранён на этом устройстве.", { exact: true })
      .waitFor();
    await panel.getByText("MAX ещё не подключён", { exact: true }).waitFor();
    pass(
      "remember-device default, HttpOnly cookie, no refresh or access secrets in localStorage",
    );

    // A fresh tab has no sessionStorage. Two tabs coordinate refresh with Web Locks.
    const tabs = await Promise.all([context.newPage(), context.newPage()]);
    const refreshResponses = [];
    for (const tab of tabs)
      tab.on("response", (r) => {
        if (r.url().endsWith("/auth/refresh"))
          refreshResponses.push(r.status());
      });
    await Promise.all(tabs.map((p) => p.goto(fixture.url)));
    await Promise.all(tabs.map(signedIn));
    assert.deepEqual(refreshResponses.sort(), [200, 200]);
    assert.notEqual(await token(tabs[0]), originalToken);
    pass(
      "empty sessionStorage restores remembered login in two concurrent tabs",
    );
    await Promise.all(tabs.map((p) => p.close()));

    await panel
      .getByRole("button", { name: "Отправить уведомление", exact: true })
      .click();
    const composer = panel.locator("form.notification-composer");
    const scopeSelect = composer.getByLabel("Область работы");
    await scopeSelect.locator("option").nth(1).waitFor({ state: "attached" });
    const scopeIds = await scopeSelect
      .locator("option")
      .evaluateAll((options) => options.map((o) => o.value).filter(Boolean));
    let selectedScope;
    let recipientData;
    for (const scopeId of scopeIds) {
      const response = await context.request.get(
        fixture.url + "/api/v1/notifications/recipients?scopeId=" + scopeId,
        { headers: { Authorization: "Bearer " + (await token(page)) } },
      );
      assert.equal(response.status(), 200);
      const data = await response.json();
      if (data.items.some((p) => p.id === driver.userId)) {
        selectedScope = scopeId;
        recipientData = data.items;
        break;
      }
    }
    assert.ok(selectedScope, "fixture driver in admin scope");
    await scopeSelect.selectOption(selectedScope);
    const target = recipientData.find((p) => p.id === driver.userId);
    const checkboxes = composer.locator("input[type=checkbox]");
    await checkboxes.first().waitFor();
    assert.equal(
      await checkboxes.evaluateAll(
        (items) => items.filter((i) => i.checked).length,
      ),
      0,
    );
    assert.ok(
      await composer
        .getByRole("button", { name: "Отправить выбранным (0)", exact: true })
        .isDisabled(),
    );
    await composer.getByLabel("Заголовок", { exact: true }).fill(qaTitle);
    await composer
      .getByLabel("Сообщение", { exact: true })
      .fill("Only synthetic local driver; no external delivery.");

    // Simulate an expired protected access response. Cookie refresh/retry must keep draft UI mounted.
    let injected401 = false;
    await page.route("**/api/v1/notifications/status", async (route) => {
      if (!injected401) {
        injected401 = true;
        return route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({ message: "Synthetic expired access" }),
        });
      }
      return route.continue();
    });
    const renewed = page.waitForResponse(
      (r) => r.url().endsWith("/auth/refresh") && r.status() === 200,
    );
    await panel.getByRole("button", { name: "Обновить", exact: true }).click();
    await renewed;
    await page.waitForFunction(
      ({ key, old }) =>
        JSON.parse(sessionStorage.getItem(key)).session.accessToken !== old,
      { key: sessionKey, old: originalToken },
    );
    assert.equal(
      await composer.getByLabel("Заголовок", { exact: true }).inputValue(),
      qaTitle,
    );
    assert.equal(
      await composer.getByLabel("Сообщение", { exact: true }).inputValue(),
      "Only synthetic local driver; no external delivery.",
    );
    await page.unroute("**/api/v1/notifications/status");
    pass("401 refresh/retry preserves open composer and unsaved fields");

    await composer
      .locator("label.notification-recipient")
      .filter({ hasText: target.displayName })
      .getByRole("checkbox")
      .check();
    await composer
      .getByRole("region", { name: "Предпросмотр уведомления" })
      .getByText(target.displayName, { exact: false })
      .waitFor();
    const sent = page.waitForResponse(
      (r) =>
        r.url().endsWith("/notifications/messages") &&
        r.request().method() === "POST",
    );
    await composer
      .getByRole("button", { name: "Отправить выбранным (1)", exact: true })
      .click();
    const sentResponse = await sent;
    assert.equal(sentResponse.status(), 201);
    const submitted = sentResponse.request().postDataJSON();
    assert.deepEqual(submitted.recipientIds, [driver.userId]);
    await composer.getByText(/Уведомление передано в очередь: 1/).waitFor();
    pass("explicit single recipient, preview and real scoped API enqueue");
    await page.screenshot({
      path: path.join(output, "notifications-desktop.png"),
    });

    // Driver has no sending controls and can acknowledge their own notification.
    const driverContext = await newContext({
      viewport: { width: 390, height: 844 },
    });
    const driverPage = await driverContext.newPage();
    await login(driverPage, driver);
    const driverPanel = await openNotifications(driverPage);
    await driverPanel.getByText(qaTitle, { exact: true }).waitFor();
    assert.equal(
      await driverPanel
        .getByRole("button", { name: "Отправить уведомление", exact: true })
        .count(),
      0,
    );
    const item = driverPanel
      .locator("article.notification-item")
      .filter({ hasText: qaTitle });
    await item
      .getByRole("button", { name: "Подтвердить", exact: true })
      .click();
    await item.getByText("Подтверждено", { exact: true }).waitFor();
    assert.equal(
      await item
        .getByRole("button", { name: "Подтвердить", exact: true })
        .count(),
      0,
    );
    const bounds = await driverPanel
      .locator(".notification-popover")
      .boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 390);
    assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= 844 + 1);
    assert.ok(
      await driverPage.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    );
    await driverPage.screenshot({
      path: path.join(output, "notifications-mobile.png"),
    });
    pass("driver role hides composer, ACK works, mobile popup fits viewport");

    // Actual expired cached access: restore obtains a new session cookie-backed.
    await page.evaluate((k) => {
      const value = JSON.parse(sessionStorage.getItem(k));
      value.session.expiresAt = new Date(0).toISOString();
      sessionStorage.setItem(k, JSON.stringify(value));
    }, sessionKey);
    await page.reload();
    await signedIn(page);
    pass("expired cached session renews instead of demanding password");
    await page
      .getByRole("button", { name: "Выйти из кабинета", exact: true })
      .click();
    await page.locator("#login-phone").waitFor();
    await page.reload();
    await page.locator("#login-phone").waitFor();
    assert.equal(await page.locator("#login-phone").inputValue(), admin.phone);
    assert.equal(await page.locator("#login-password").inputValue(), "");
    assert.equal((await context.cookies()).filter((c) => c.httpOnly).length, 0);
    pass(
      "logout revokes remembered login, reload stays logged out and keeps only phone",
    );

    const optoutContext = await newContext({
      viewport: { width: 390, height: 844 },
    });
    const optoutPage = await optoutContext.newPage();
    await login(optoutPage, admin, false);
    assert.equal(
      (await optoutContext.cookies()).filter((c) => c.httpOnly).length,
      0,
    );
    const optoutTab = await optoutContext.newPage();
    await optoutTab.goto(fixture.url);
    await optoutTab.locator("#login-phone").waitFor();
    const input = await optoutTab.locator("#login-password").boundingBox();
    const toggle = await optoutTab
      .getByRole("button", { name: "Показать пароль", exact: true })
      .boundingBox();
    assert.ok(input.width >= 140 && Math.abs(input.y - toggle.y) <= 1);
    await optoutTab.screenshot({
      path: path.join(output, "remember-login-mobile.png"),
    });
    pass(
      "remember-device opt-out requires password in new tab; mobile login layout intact",
    );
    // Real MAX launch-data validation errors must not invalidate a phone session.
    const maxContext = await newContext();
    await maxContext.addInitScript(() => {
      window.WebApp = {
        initData: "auth_date=1&hash=expired-synthetic",
        platform: "desktop",
        requestContact: () =>
          Promise.reject(new Error("Synthetic consent declined")),
      };
    });
    const maxPage = await maxContext.newPage();
    const maxLink = maxPage.waitForResponse((r) =>
      r.url().endsWith("/notifications/max/link"),
    );
    await login(maxPage, admin);
    const maxResponse = await maxLink;
    assert.equal(maxResponse.status(), 400);
    const maxPanel = await openNotifications(maxPage);
    await maxPanel
      .getByText(
        "Откройте приложение через бота MAX заново, чтобы подключить уведомления.",
        { exact: true },
      )
      .waitFor();
    await signedIn(maxPage);
    assert.equal(await maxPage.locator("#login-phone").count(), 0);
    pass(
      "expired MAX launch data returns link guidance while phone session stays signed in",
    );

    // Shorten only client expiry metadata: timer should refresh before expiration.
    const timerContext = await newContext();
    let shortLogin = true;
    await timerContext.route("**/api/v1/auth/password", async (route) => {
      const response = await route.fetch();
      const data = await response.json();
      if (shortLogin && response.ok()) {
        shortLogin = false;
        data.expiresAt = new Date(Date.now() + 62500).toISOString();
      }
      await route.fulfill({ response, json: data });
    });
    const timerPage = await timerContext.newPage();
    const timerRefresh = timerPage.waitForResponse(
      (r) => r.url().endsWith("/auth/refresh") && r.status() === 200,
    );
    await login(timerPage, admin);
    await timerRefresh;
    await signedIn(timerPage);
    assert.ok(
      await timerPage.evaluate(
        (k) =>
          Date.parse(JSON.parse(sessionStorage.getItem(k)).session.expiresAt) -
            Date.now() >
          25 * 60 * 1000,
        sessionKey,
      ),
    );
    pass("proactive timer renews access before expiry without logout");
    assert.deepEqual(errors, []);
    pass("no browser JavaScript errors");
  } catch (error) {
    for (const [i, ctx] of contexts.entries())
      for (const [j, p] of ctx.pages().entries()) {
        await p
          .screenshot({ path: path.join(output, `failure-${i}-${j}.png`) })
          .catch(() => {});
        console.log(
          (
            await p
              .locator("body")
              .innerText()
              .catch(() => "")
          ).slice(0, 4000),
        );
      }
    throw error;
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
