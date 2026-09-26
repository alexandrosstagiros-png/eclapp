'use strict';
// Actual browser, HTTP API and disposable PostgreSQL. Synthetic employees only.
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const { createTestServer } = require('./local-test-server.cjs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const fixture = await createTestServer({ builtFrontend: process.env.RECRUITER_BUILT_FRONTEND === 'true' });
  const out = path.resolve(__dirname, '../.local/recruiter-role-browser-qa');
  let browser;
  try {
    await fs.mkdir(out, { recursive: true });
    await fixture.adminPool.query('UPDATE access_grants SET personal_data_visible=true WHERE user_id=$1 AND responsibility_scope_id=$2', [fixture.ids.admin, fixture.ids.scope]);
    const seedAdmin = await fixture.devLogin(fixture.ids.admin);
    const phone = '+79990008421';
    const issued = await fixture.request('POST', `/access/users/${fixture.ids.admin}/password`, { phone }, seedAdmin.accessToken);
    assert.equal(issued.status, 201);
    browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => dialog.accept());
    await page.goto(fixture.origin);
    await page.locator('#login-phone').fill(phone);
    await page.locator('#login-password').fill(issued.body.password);
    await page.getByRole('button', { name: 'Войти', exact: true }).click();
    await page.getByRole('heading', { name: 'Сотрудники', exact: true }).waitFor();

    await page.getByRole('button', { name: 'Добавить тестового сотрудника', exact: true }).click();
    const form = page.getByRole('form', { name: 'Добавить сотрудника для демо', exact: true });
    await form.getByLabel(/^Роль/).selectOption({ label: 'Рекрутер' });
    await form.getByLabel(/^Область работы/).selectOption(fixture.ids.scope);
    const creationResponse = page.waitForResponse(response => response.url().endsWith('/access/employees/demo') && response.request().method() === 'POST');
    await form.getByRole('button', { name: 'Создать тестовый профиль', exact: true }).click();
    const creation = await creationResponse;
    assert.equal(creation.status(), 201);
    const employee = await creation.json();
    assert.equal(employee.role, 'recruiter');
    assert.match(employee.displayName, /Тестовый рекрутер/);
    await page.getByRole('heading', { name: 'Выдать доступ по телефону', exact: true }).waitFor();
    await page.getByRole('button', { name: 'К списку', exact: true }).click();
    const card = page.locator('article.employee-card').filter({ hasText: employee.displayName });
    await card.getByText('Рекрутер', { exact: true }).waitFor();
    await page.screenshot({ path: path.join(out, 'recruiter-created-desktop.png'), fullPage: true });

    const impersonationResponse = page.waitForResponse(response => response.url().endsWith('/auth/impersonate') && response.request().method() === 'POST');
    const firstSnapshot = page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/recruitment/worklist') && response.request().method() === 'GET');
    await card.getByRole('button', { name: 'Войти как сотрудник', exact: true }).click();
    const impersonation = await impersonationResponse;
    assert.equal(impersonation.status(), 200);
    const child = await impersonation.json();
    assert.equal(child.actor.id, employee.id);
    assert.equal(child.actor.role, 'recruiter');
    assert.equal((await firstSnapshot).status(), 200);
    await page.getByRole('heading', { name: 'Рекрутинг', exact: true }).waitFor();
    await page.getByRole('heading', { name: 'Нет кандидатов по выбранным условиям', exact: true }).waitFor();
    const navigation = page.getByRole('navigation', { name: 'Разделы', exact: true });
    assert.equal(await navigation.getByRole('button', { name: 'Рекрутинг', exact: true }).getAttribute('aria-current'), 'page');
    for (const label of ['Планирование', 'Рейсы', 'Финансы и 1С', 'Сотрудники']) {
      assert.equal(await navigation.getByRole('button', { name: label, exact: true }).count(), 0, `Recruiter must not see ${label}`);
    }
    assert.equal(await page.getByText('Нет доступных областей подбора', { exact: true }).count(), 0);
    console.log('PASS create recruiter through employee form, impersonate and open the recruiting workspace with restricted navigation');

    await page.getByRole('navigation', { name: 'Разделы рекрутинга', exact: true }).getByRole('button', { name: 'Потребности', exact: true }).click();
    await page.getByRole('button', { name: 'Создать потребность', exact: true }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Потребность в подборе', exact: true });
    await dialog.getByLabel('Название потребности', { exact: true }).fill('Синтетическая потребность браузера');
    await dialog.getByLabel('Город', { exact: true }).fill('Москва');
    await dialog.getByLabel('Нужно водителей', { exact: true }).fill('2');
    await dialog.getByLabel('Рекрутер', { exact: true }).selectOption(employee.id);
    const saveResponse = page.waitForResponse(response => response.url().endsWith('/recruitment/requests') && response.request().method() === 'PUT');
    await dialog.getByRole('button', { name: 'Сохранить', exact: true }).click();
    const saved = await saveResponse;
    assert.equal(saved.status(), 200);
    const demand = await saved.json();
    assert.equal(demand.recruiterId, employee.id);
    assert.equal(demand.quantity, 2);
    await dialog.waitFor({ state: 'hidden' });
    await page.getByRole('navigation', { name: 'Разделы рекрутинга', exact: true }).getByRole('button', { name: 'Потребности', exact: true }).click();
    await page.getByRole('heading', { name: demand.title, exact: true }).waitFor();
    await page.screenshot({ path: path.join(out, 'recruiter-workspace-desktop.png'), fullPage: true });
    await page.reload();
    await page.getByRole('heading', { name: 'Рекрутинг', exact: true }).waitFor();
    await page.getByRole('navigation', { name: 'Разделы рекрутинга', exact: true }).getByRole('button', { name: 'Потребности', exact: true }).click();
    await page.getByRole('heading', { name: demand.title, exact: true }).waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Recruiter screen fits the mobile viewport');
    await page.screenshot({ path: path.join(out, 'recruiter-workspace-mobile.png'), fullPage: true });
    console.log('PASS recruiter saves a demand through the UI, reload preserves it, and mobile layout fits');

    await page.getByRole('button', { name: 'Вернуться в админку', exact: true }).click();
    await page.getByRole('heading', { name: 'Сотрудники', exact: true }).waitFor();
    await page.locator('article.employee-card').filter({ hasText: employee.displayName }).waitFor();
    assert.equal((await fixture.request('GET', '/me', undefined, child.accessToken)).status, 401);
    assert.deepEqual(errors, []);
    console.log('PASS return to administrator, child session revoked, no browser JavaScript errors');
  } finally {
    if (browser) await browser.close();
    await fixture.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
