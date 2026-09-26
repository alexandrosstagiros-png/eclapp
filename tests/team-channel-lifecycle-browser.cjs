'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createTestServer } = require('./local-test-server.cjs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const f = await createTestServer({ staffTeamActors: true, builtFrontend: process.env.TEAM_BUILT_FRONTEND === 'true' });
  let browser;
  try {
    const { ids } = f, admin = await f.devLogin(ids.admin), employeeSession = await f.devLogin(ids.drivers[0]);
    const api = async (method, route, body, session = admin) => {
      const result = await f.request(method, route, body, session.accessToken);
      assert.ok([200, 201].includes(result.status), `${method} ${route}: ${result.status} ${JSON.stringify(result.body)}`);
      return result.body;
    };
    const channels = [];
    for (const title of ['Новости компании', 'Рабочие вопросы', 'Обсуждения команды']) channels.push(await api('POST', '/team/conversations', { id: randomUUID(), responsibilityScopeId: ids.scope, kind: 'channel', title, memberIds: [] }));
    const history = await api('POST', '/team/messages', { id: randomUUID(), responsibilityScopeId: ids.scope, conversationId: channels[1].id, text: 'История канала сохраняется в архиве' }, employeeSession);
    browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
    const errors = [];
    async function pageFor(session) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      await context.addInitScript(value => sessionStorage.setItem('ecl.session.v2', JSON.stringify({ session: value })), { ...session, rememberedDevice: false });
      const page = await context.newPage(); page.setDefaultTimeout(20000); page.on('pageerror', error => errors.push(error.message));
      await page.goto(`${f.origin}/?section=team`);
      await page.getByRole('heading', { name: 'Команда', exact: true }).waitFor();
      return page;
    }
    const administrator = await pageFor(admin), employee = await pageFor(employeeSession);
    const activeList = page => page.locator('.team-chat-sidebar section[aria-label="Каналы"]');
    const activeTitles = page => activeList(page).locator('.team-chat-item .team-chat-label strong').allTextContents();
    const openChannel = (page, title) => page.locator('.team-chat-sidebar').getByText(title, { exact: true }).click();
    async function openMenu(page) {
      await page.getByRole('button', { name: 'Действия чата', exact: true }).click();
      await page.getByRole('menu').waitFor();
    }
    async function action(page, label) {
      await openMenu(page);
      await page.getByRole('menuitem', { name: label, exact: true }).click();
    }
    async function waitForOrder(page, titles) {
      await page.waitForFunction(expected => JSON.stringify([...document.querySelectorAll('.team-chat-sidebar section[aria-label="Каналы"] .team-chat-item .team-chat-label strong')].map(node => node.textContent)) === JSON.stringify(expected), titles, { timeout: 25000 });
    }
    async function menuFits(page) {
      const bounds = await page.getByRole('menu').boundingBox(), viewport = page.viewportSize();
      assert.ok(bounds && bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= viewport.width + 1 && bounds.y + bounds.height <= viewport.height + 1, `Overflow menu must fit viewport: ${JSON.stringify({ bounds, viewport })}`);
    }
    async function showArchive(page) {
      const toggle = page.getByRole('button', { name: /Архив каналов/ });
      await toggle.waitFor();
      if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
    }

    await openChannel(employee, channels[1].title);
    await openMenu(employee);
    for (const label of ['Переместить выше', 'Переместить ниже', 'Архивировать канал', 'Вернуть из архива', 'Удалить канал']) assert.equal(await employee.getByRole('menuitem', { name: label, exact: true }).count(), 0);
    await employee.keyboard.press('Escape');
    await administrator.bringToFront();
    await openChannel(administrator, channels[1].title);
    const initial = await activeTitles(administrator), index = initial.indexOf(channels[1].title);
    assert.ok(index > 0, 'fixture provides a channel with a previous neighbor');
    const reordered = [...initial]; [reordered[index - 1], reordered[index]] = [reordered[index], reordered[index - 1]];
    await action(administrator, 'Переместить выше');
    await waitForOrder(administrator, reordered);
    await employee.bringToFront(); await waitForOrder(employee, reordered);
    await administrator.bringToFront();
    await action(administrator, 'Переместить ниже'); await waitForOrder(administrator, initial);
    await administrator.reload(); await openChannel(administrator, channels[1].title); await waitForOrder(administrator, initial);

    await action(administrator, 'Архивировать канал');
    let dialog = administrator.getByRole('dialog', { name: 'Архивировать канал?', exact: true });
    await dialog.getByRole('button', { name: 'Архивировать', exact: true }).click();
    await dialog.waitFor({ state: 'detached' });
    await administrator.getByText('Канал в архиве. Переписка доступна для чтения.', { exact: true }).waitFor();
    assert.equal(await activeList(administrator).getByText(channels[1].title, { exact: true }).count(), 0);
    assert.equal(await administrator.getByLabel('Сообщение в чат', { exact: true }).count(), 0);
    await showArchive(administrator); await openChannel(administrator, channels[1].title);
    await administrator.getByLabel('Переписка', { exact: true }).getByText(history.text, { exact: true }).waitFor();
    await employee.bringToFront();
    await employee.getByText('Канал в архиве. Переписка доступна для чтения.', { exact: true }).waitFor({ timeout: 25000 });
    assert.equal(await employee.getByLabel('Сообщение в чат', { exact: true }).count(), 0);
    assert.equal(await activeList(employee).getByText(channels[1].title, { exact: true }).count(), 0);
    await openMenu(employee);
    assert.equal(await employee.getByRole('menuitem', { name: 'Вернуть из архива', exact: true }).count(), 0);
    assert.equal(await employee.getByRole('menuitem', { name: 'Удалить канал', exact: true }).count(), 0);
    await employee.keyboard.press('Escape');

    await administrator.bringToFront();
    const output = path.resolve(__dirname, '../.local/team-channel-lifecycle-qa'); await fs.mkdir(output, { recursive: true });
    await openMenu(administrator); await menuFits(administrator);
    assert.equal(await administrator.getByRole('menuitem', { name: 'Переместить выше', exact: true }).count(), 0);
    await administrator.screenshot({ path: path.join(output, 'archive-menu-desktop.png'), fullPage: false });
    await administrator.keyboard.press('Escape');
    await action(administrator, 'Вернуть из архива');
    await administrator.getByLabel('Сообщение в чат', { exact: true }).waitFor();
    await activeList(administrator).getByText(channels[1].title, { exact: true }).waitFor();
    await employee.bringToFront(); await employee.getByLabel('Сообщение в чат', { exact: true }).waitFor({ timeout: 25000 });

    await administrator.bringToFront();
    await administrator.setViewportSize({ width: 390, height: 844 });
    await administrator.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.ok(await administrator.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await openMenu(administrator); await menuFits(administrator);
    await administrator.screenshot({ path: path.join(output, 'channel-menu-mobile.png'), fullPage: false });
    await administrator.keyboard.press('Escape');
    await action(administrator, 'Удалить канал');
    dialog = administrator.getByRole('dialog', { name: 'Удалить канал?', exact: true });
    await dialog.getByRole('button', { name: 'Отмена', exact: true }).click();
    await dialog.waitFor({ state: 'detached' });
    await administrator.getByLabel('Переписка', { exact: true }).getByText(history.text, { exact: true }).waitFor();
    await action(administrator, 'Архивировать канал');
    await administrator.getByRole('dialog', { name: 'Архивировать канал?', exact: true }).getByRole('button', { name: 'Архивировать', exact: true }).click();
    await administrator.getByText('Канал в архиве. Переписка доступна для чтения.', { exact: true }).waitFor();
    await action(administrator, 'Удалить канал');
    dialog = administrator.getByRole('dialog', { name: 'Удалить канал?', exact: true });
    await administrator.screenshot({ path: path.join(output, 'delete-confirmation-mobile.png'), fullPage: false });
    await dialog.getByRole('button', { name: 'Удалить канал', exact: true }).click();
    await dialog.waitFor({ state: 'detached' });
    await administrator.getByLabel('Переписка', { exact: true }).getByText(history.text, { exact: true }).waitFor({ state: 'detached' });
    assert.equal(await administrator.locator('.team-chat-sidebar').getByText(channels[1].title, { exact: true }).count(), 0);
    await employee.bringToFront();
    await employee.getByLabel('Переписка', { exact: true }).getByText(history.text, { exact: true }).waitFor({ state: 'detached', timeout: 25000 });
    await administrator.reload();
    await activeList(administrator).getByText(channels[0].title, { exact: true }).waitFor();
    assert.equal(await administrator.locator('.team-chat-sidebar').getByText(channels[1].title, { exact: true }).count(), 0);
    assert.ok(await administrator.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await administrator.screenshot({ path: path.join(output, 'remaining-channels-mobile.png'), fullPage: true });
    assert.deepEqual(errors, []);
    console.log('PASS channel browser: administrator overflow reorder up/down, shared persistent order, archive/read-only live history, employee controls hidden, restore, delete cancellation/confirmation, reload, 390px menus');
  } finally { if (browser) await browser.close(); await f.close(); }
})().catch(error => { console.error(error.stack || error.message); process.exit(1); });
