// Runs only against a disposable fixture with synthetic credentials.
// Usage: ECL_BROWSER_QA_MODULE=/absolute/playwright-core ECL_BROWSER_FIXTURE=/absolute/fixture.json node password.e2e.cjs
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { chromium } = require(process.env.ECL_BROWSER_QA_MODULE);
const fixture = JSON.parse(
  fs.readFileSync(process.env.ECL_BROWSER_FIXTURE, "utf8"),
);
const base = new URL(fixture.url);
assert.ok(
  ["127.0.0.1", "localhost"].includes(base.hostname),
  "Only disposable local fixtures are allowed",
);
const admin = fixture.profiles.find(
  (profile) => profile.role === "access_admin",
);
const driver = fixture.profiles.find((profile) => profile.role === "driver");
const output = path.dirname(process.env.ECL_BROWSER_FIXTURE);
const updatedPasswords = new Map();
function rememberFixturePassword(phone, password) {
  updatedPasswords.set(phone, password);
  fs.writeFileSync(
    process.env.ECL_BROWSER_FIXTURE,
    JSON.stringify(
      {
        ...fixture,
        profiles: fixture.profiles.map((profile) => ({
          ...profile,
          password: updatedPasswords.get(profile.phone) || profile.password,
        })),
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
}
(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.ECL_CHROME_PATH ||
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const ok = (label) => process.stdout.write("PASS " + label + "\n");
  const login = async (phone, password) => {
    await page.getByLabel("Номер телефона", { exact: true }).fill(phone);
    await page.locator("#login-password").fill(password);
    await page.getByRole("button", { name: "Войти", exact: true }).click();
  };
  const expectAdmin = async () => {
    await page
      .getByRole("heading", { name: "Сотрудники", exact: true })
      .waitFor();
    await page.locator("article.employee-card").first().waitFor();
  };
  const logout = async () => {
    await page
      .getByRole("button", { name: "Выйти из кабинета", exact: true })
      .click();
    await page.locator("#login-phone").waitFor();
  };
  try {
    const actorNames = {};
    for (const profile of [admin, driver]) {
      const response = await context.request.post(
        fixture.url + "/api/v1/auth/password",
        {
          data: {
            phone: profile.phone,
            password: profile.password,
            rememberDevice: false,
          },
        },
      );
      assert.ok(response.ok());
      actorNames[profile.phone] = (await response.json()).actor.displayName;
    }
    const cardForPhone = (phone) =>
      page
        .locator("article.employee-card")
        .filter({ has: page.getByText(actorNames[phone], { exact: true }) });
    const newCredential = async () => {
      const card = page.getByRole("region", { name: "Новый пароль" });
      await card.getByRole("heading", { name: "Новый пароль готов" }).waitFor();
      return {
        card,
        password: await card.locator("input[type=text]").inputValue(),
      };
    };
    await page.goto(fixture.url);
    await page.locator("#login-phone").waitFor();
    await page.screenshot({
      path: path.join(output, "phone-login-desktop.png"),
    });
    const desktopInput = await page.locator("#login-password").boundingBox();
    const desktopToggle = await page
      .getByRole("button", { name: "Показать пароль", exact: true })
      .boundingBox();
    assert.ok(desktopInput.width >= 180);
    assert.ok(Math.abs(desktopInput.y - desktopToggle.y) <= 1);
    await login(admin.phone, "deliberately-incorrect");
    await page
      .getByRole("alert")
      .filter({ hasText: "Неверный телефон или пароль" })
      .waitFor();
    ok("wrong password is a generic credential error");
    await login(admin.phone, admin.password);
    await expectAdmin();
    ok("primary phone/password login");
    await page.reload();
    await expectAdmin();
    ok("session restored after refresh without messenger SDK");
    assert.equal(
      await page
        .getByRole("button", { name: /Пригласить в (Telegram|MAX)/ })
        .count(),
      0,
    );
    ok("legacy messenger invitation buttons are hidden");
    const driverCard = cardForPhone(driver.phone);
    assert.equal(await driverCard.count(), 1);
    await driverCard
      .getByRole("button", { name: "Сбросить пароль", exact: true })
      .click();
    await page.getByLabel("Телефон сотрудника").fill(admin.phone);
    await page
      .getByRole("button", { name: "Сбросить и показать новый пароль" })
      .click();
    await page
      .getByRole("alert")
      .filter({ hasText: "Этот телефон уже используется другим сотрудником" })
      .waitFor();
    ok("duplicate employee phone shows phone-specific conflict");
    await page.getByLabel("Телефон сотрудника").fill(driver.phone);
    await page
      .getByRole("button", { name: "Сбросить и показать новый пароль" })
      .click();
    const driverIssued = await newCredential();
    const newDriverPassword = driverIssued.password;
    rememberFixturePassword(driver.phone, newDriverPassword);
    assert.ok(newDriverPassword.length >= 12);
    await driverIssued.card
      .getByRole("button", { name: "Скопировать данные для входа" })
      .click();
    await driverIssued.card.getByRole("status").waitFor();
    await page.screenshot({
      path: path.join(output, "issued-password-synthetic.png"),
    });
    await driverIssued.card
      .getByRole("button", { name: "Скрыть пароль", exact: true })
      .click();
    assert.equal(
      await page.getByRole("region", { name: "Новый пароль" }).count(),
      0,
    );
    ok("employee password reset displays credential once with copy feedback");
    await logout();
    assert.equal(await page.locator("#login-phone").inputValue(), admin.phone);
    assert.equal(await page.locator("#login-password").inputValue(), "");
    ok("logout remembers phone and clears password");
    await login(driver.phone, driver.password);
    await page
      .getByRole("alert")
      .filter({ hasText: "Неверный телефон или пароль" })
      .waitFor();
    await login(driver.phone, newDriverPassword);
    await page
      .getByRole("button", { name: "Выйти из кабинета", exact: true })
      .waitFor();
    assert.equal(
      await page
        .getByRole("heading", { name: "Сотрудники", exact: true })
        .count(),
      0,
    );
    ok("employee old password rejected, new password retains driver role");
    await page.reload();
    await page
      .getByRole("button", { name: "Выйти из кабинета", exact: true })
      .waitFor();
    await logout();
    await login(admin.phone, admin.password);
    await expectAdmin();
    await cardForPhone(admin.phone)
      .getByRole("button", { name: "Сбросить пароль", exact: true })
      .click();
    await page.getByLabel("Телефон сотрудника").fill(admin.phone);
    await page
      .getByRole("button", { name: "Сбросить и показать новый пароль" })
      .click();
    const adminIssued = await newCredential();
    const newAdminPassword = adminIssued.password;
    rememberFixturePassword(admin.phone, newAdminPassword);
    assert.equal(
      await page
        .getByRole("heading", { name: "Сотрудники", exact: true })
        .count(),
      0,
    );
    const cache = await page.evaluate(() =>
      sessionStorage.getItem("ecl.session.v2"),
    );
    assert.equal(cache, null);
    ok("self reset clears revoked session and isolates one-time result screen");
    await adminIssued.card
      .getByRole("button", { name: "Сохранил пароль, перейти ко входу" })
      .click();
    await login(admin.phone, admin.password);
    await page
      .getByRole("alert")
      .filter({ hasText: "Неверный телефон или пароль" })
      .waitFor();
    await login(admin.phone, newAdminPassword);
    await expectAdmin();
    ok("self-reset new password works and previous password is rejected");
    await logout();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: path.join(output, "phone-login-mobile.png"),
    });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
      false,
    );
    const mobileInput = await page.locator("#login-password").boundingBox();
    const mobileToggle = await page
      .getByRole("button", { name: "Показать пароль", exact: true })
      .boundingBox();
    assert.ok(mobileInput.width >= 140);
    assert.ok(Math.abs(mobileInput.y - mobileToggle.y) <= 1);
    ok("desktop/mobile password controls aligned, wide enough, no overflow");
    assert.deepEqual(pageErrors, []);
    ok("no browser JavaScript errors");
    const updated = {
      ...fixture,
      profiles: fixture.profiles.map((profile) => ({
        ...profile,
        password:
          profile.role === "access_admin"
            ? newAdminPassword
            : profile.role === "driver"
              ? newDriverPassword
              : profile.password,
      })),
    };
    fs.writeFileSync(
      process.env.ECL_BROWSER_FIXTURE,
      JSON.stringify(updated, null, 2),
      { mode: 0o600 },
    );
  } finally {
    await context.close();
    await browser.close();
  }
})().catch((error) => {
  process.stderr.write(error.stack + "\n");
  process.exitCode = 1;
});
