'use strict';
// Scale a polling interval down so a normal paced read spans several ticks.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createTestServer } = require('./local-test-server.cjs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
  const fixture = await createTestServer({ staffTeamActors: true });
  let browser;
  try {
    const { ids } = fixture;
    const session = await fixture.devLogin(ids.admin);
    const title = 'Задача после медленного чтения';
    const created = await fixture.request('POST', '/team/tasks', {
      id: randomUUID(), operationId: randomUUID(), responsibilityScopeId: ids.scope,
      title, description: 'Регрессия частого polling', assigneeId: ids.drivers[0], dueDate: null,
    }, session.accessToken);
    assert.equal(created.status, 201, JSON.stringify(created));
    browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    await context.addInitScript(value => {
      sessionStorage.setItem('ecl.session.v2', JSON.stringify({ session: value }));
      const interval = window.setInterval.bind(window);
      window.__taskPollTicks = 0;
      window.setInterval = (callback, delay, ...args) => delay === 15000
        ? interval(() => {
          if (window.__taskStopPolling) return;
          window.__taskPollTicks++; callback(...args);
        }, 50)
        : interval(callback, delay, ...args);
    }, { ...session, rememberedDevice: false });
    const page = await context.newPage(); page.setDefaultTimeout(10000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    let reads = 0;
    let holdNextTaskList = false, taskListHeld, releaseTaskList;
    const heldTaskList = new Promise(resolve => { taskListHeld = resolve; });
    const taskListRelease = new Promise(resolve => { releaseTaskList = resolve; });
    await page.route(/\/api\/v1\/team\/(?:tasks|organization)\?/, async route => {
      if (route.request().method() !== 'GET') return route.continue();
      reads++;
      try {
        const response = await route.fetch();
        if (holdNextTaskList && new URL(route.request().url()).pathname.endsWith('/team/tasks')) {
          holdNextTaskList = false;
          taskListHeld();
          await taskListRelease;
        }
        await new Promise(resolve => setTimeout(resolve, 150));
        await route.fulfill({ response });
      } catch { /* Context changes and mutations may cancel a pending read. */ }
    });
    await page.goto(`${fixture.origin}/?section=team`);
    await page.getByRole('navigation', { name: 'Разделы команды', exact: true }).getByRole('button', { name: 'Задачи', exact: true }).click();
    const card = page.getByRole('button', { name: `Открыть задачу: ${title}`, exact: true });
    await card.waitFor();
    assert.ok(await page.evaluate(() => window.__taskPollTicks) >= 3, 'initial data survives several polling ticks');
    await card.click();
    await page.getByRole('button', { name: 'Редактировать задачу', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Редактировать задачу', exact: true });
    const updatedTitle = 'Сохранено во время фонового чтения';
    await dialog.getByLabel('Название задачи', { exact: true }).fill(updatedTitle);
    holdNextTaskList = true;
    // Keep the pre-save list response in flight until the mutation has finished.
    await Promise.race([heldTaskList, new Promise((_, reject) => {
      setTimeout(() => reject(new Error('background list did not start')), 10000).unref();
    })]);
    const saving = page.waitForResponse(response => response.url().endsWith(`/team/tasks/${created.body.id}`) && response.request().method() === 'PUT');
    await dialog.getByRole('button', { name: 'Сохранить задачу', exact: true }).click();
    assert.equal((await saving).status(), 200);
    releaseTaskList();
    await page.getByRole('button', { name: `Открыть задачу: ${updatedTitle}`, exact: true }).waitFor();
    const readsAfterSave = reads;
    await page.waitForFunction(() => window.__taskPollTicks >= 20);
    await page.waitForTimeout(700);
    assert.ok(reads > readsAfterSave, 'polling continues after a mutation');
    assert.equal(await page.getByRole('button', { name: `Открыть задачу: ${updatedTitle}`, exact: true }).count(), 1);
    assert.equal(await page.getByRole('button', { name: `Открыть задачу: ${title}`, exact: true }).count(), 0);
    await page.evaluate(() => { window.__taskStopPolling = true; });
    await page.getByText('Обновляем задачи…', { exact: true }).waitFor({ state: 'hidden' });
    assert.deepEqual(errors, []);
    console.log('PASS slow task reads survive multiple polling ticks; saving cancels stale reads and polling continues with the saved task');
  } finally { if (browser) await browser.close(); await fixture.close(); }
})().catch(error => { console.error(error.stack); process.exit(1); });
