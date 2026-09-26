'use strict';
// Real browser/API and disposable PostgreSQL. All users and tasks are synthetic.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createTestServer } = require('./local-test-server.cjs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const fixture = await createTestServer({ builtFrontend: process.env.RECRUITMENT_BUILT_FRONTEND === 'true' });
  const out = path.resolve(__dirname, '../.local/recruitment-reminder-browser-qa');
  let browser;
  try {
    await fs.mkdir(out, { recursive: true });
    const { adminPool: db, ids } = fixture;
    await db.query('UPDATE access_grants SET personal_data_visible=true WHERE user_id=ANY($1::uuid[])', [[ids.admin, ids.dispatcher]]);
    await db.query("UPDATE users SET role='manager',display_name='Рекрутер двух тестовых областей' WHERE id=$1", [ids.dispatcher]);
    const admin = await fixture.devLogin(ids.admin);
    const phone = '+79990000992';
    const credentials = await fixture.request('POST', `/access/users/${ids.dispatcher}/password`, { phone }, admin.accessToken);
    assert.equal(credentials.status, 201);
    const secondScope = randomUUID();
    await db.query('INSERT INTO responsibility_scopes VALUES($1,$2,$3)', [secondScope, ids.project, 'Ночная тестовая группа']);
    for (const userId of [ids.dispatcher, ids.admin]) {
      await db.query(`INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id,personal_data_visible)
        VALUES($1,$2,$3,$4,$5,true)`, [userId, ids.legal, ids.region, ids.project, secondScope]);
    }
    const manager = await fixture.devLogin(ids.dispatcher);
    const createTask = async (title, scopeId, assigneeId, minutesAgo) => {
      const result = await fixture.request('PUT', '/recruitment/tasks', {
        id: randomUUID(), version: 0, responsibilityScopeId: scopeId, candidateId: null,
        title, assigneeId, dueAt: new Date(Date.now() - minutesAgo * 60_000).toISOString(), status: 'open', notes: '',
      }, manager.accessToken);
      assert.equal(result.status, 200, JSON.stringify(result.body));
      return result.body;
    };
    const earlier = await createTask('Сначала позвонить по ночной группе', secondScope, ids.dispatcher, 180);
    const later = await createTask('Затем позвонить по дневной группе', ids.scope, ids.dispatcher, 60);
    const colleague = await createTask('Чужая задача не должна попасть в мои напоминания', secondScope, ids.admin, 240);
    browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'Europe/Moscow' });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => dialog.accept());
    await page.goto(fixture.origin);
    await page.locator('#login-phone').fill(phone);
    await page.locator('#login-password').fill(credentials.body.password);
    await page.getByRole('button', { name: 'Войти', exact: true }).click();
    await page.getByRole('heading', { name: 'Планирование', exact: true }).waitFor();
    await page.getByText('Напоминания по подбору: 2', { exact: true }).waitFor();

    const openTasks = () => page.getByRole('button', { name: 'Открыть задачи', exact: true }).click();
    const assertOwnScope = async (scopeId, task) => {
      await page.getByRole('heading', { name: 'Рекрутинг', exact: true }).waitFor();
      await page.getByRole('heading', { name: task.title, exact: true }).waitFor();
      assert.equal(await page.getByLabel('Проект и область ответственности', { exact: true }).count(), 0);
      assert.equal(await page.getByLabel('Фильтр по проекту', { exact: true }).count(), 0);
      assert.equal(await page.getByLabel('Рекрутер', { exact: true }).inputValue(), ids.dispatcher);
      assert.equal(await page.getByRole('navigation', { name: 'Разделы рекрутинга' }).getByRole('button', { name: 'Задачи', exact: true }).getAttribute('aria-pressed'), 'true');
      assert.equal(await page.getByRole('button', { name: 'Открытые', exact: true }).getAttribute('aria-pressed'), 'true');
      assert.equal(await page.locator('.recruitment-task-card').count(), task.id === earlier.id ? 2 : 1);
      assert.equal(await page.getByRole('heading', { name: colleague.title, exact: true }).count(), 0);
    };
    const complete = async task => {
      const card = page.locator('.recruitment-task-card').filter({ has: page.getByRole('heading', { name: task.title, exact: true }) });
      const pending = page.waitForResponse(response => response.url().endsWith('/recruitment/tasks') && response.request().method() === 'PUT');
      await card.getByRole('button', { name: 'Выполнить', exact: true }).click();
      const result = await pending;
      assert.equal(result.status(), 200);
      const saved = await result.json();
      assert.equal(saved.id, task.id);
      assert.equal(saved.status, 'done');
      assert.ok(saved.completedAt);
    };

    await openTasks();
    await assertOwnScope(secondScope, earlier);
    await page.screenshot({ path: path.join(out, 'earliest-reminder-scope.png'), fullPage: true });
    console.log('PASS global notice opens earliest assigned task in its own scope with self filter; colleague task excluded');

    await fixture.restartApi();
    await page.reload();
    await page.getByText('Напоминания по подбору: 2', { exact: true }).waitFor();
    await openTasks();
    await assertOwnScope(secondScope, earlier);
    console.log('PASS both due reminders survive API restart and browser reload');

    await complete(earlier);
    await page.getByText('Напоминания по подбору: 1', { exact: true }).waitFor();
    // Keep the panel mounted: the second click must move between scopes in place.
    await openTasks();
    await assertOwnScope(ids.scope, later);
    await page.screenshot({ path: path.join(out, 'next-reminder-scope.png'), fullPage: true });
    await complete(later);
    await page.locator('.recruitment-reminder').waitFor({ state: 'hidden' });
    await page.reload();
    await page.getByRole('heading', { name: 'Рекрутинг', exact: true }).waitFor();
    const reminderResponse = await fixture.request('GET', '/recruitment/reminders', undefined, manager.accessToken);
    assert.equal(reminderResponse.status, 200);
    assert.deepEqual(reminderResponse.body.tasks, []);
    assert.equal(await page.locator('.recruitment-reminder').count(), 0);
    const firstSnapshot = await fixture.request('GET', `/recruitment?responsibilityScopeId=${ids.scope}`, undefined, manager.accessToken);
    const secondSnapshot = await fixture.request('GET', `/recruitment?responsibilityScopeId=${secondScope}`, undefined, manager.accessToken);
    assert.equal(firstSnapshot.body.tasks.find(task => task.id === later.id).status, 'done');
    assert.equal(secondSnapshot.body.tasks.find(task => task.id === earlier.id).status, 'done');
    assert.equal(secondSnapshot.body.tasks.find(task => task.id === colleague.id).status, 'open');
    assert.deepEqual(errors, []);
    console.log('PASS completing earliest task moves the next notice to scope one; completions persist and no colleague notifications leak');
  } finally {
    if (browser) await browser.close();
    await fixture.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
