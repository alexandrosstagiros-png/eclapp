'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createTestServer } = require('./local-test-server.cjs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

// All writes use a newly-created synthetic database. Never point this suite at
// the persistent local application or an existing user's channels.
(async () => {
  const fixture = await createTestServer({ staffTeamActors: true, builtFrontend: process.env.TEAM_BUILT_FRONTEND === 'true' });
  let browser;
  try {
    const admin = await fixture.devLogin(fixture.ids.admin);
    const employeeSession = await fixture.devLogin(fixture.ids.drivers[0]);
    const channels = [];
    for (const title of ['Новости', 'Проекты', 'Вопросы', 'Обсуждения', 'Планы']) {
      const result = await fixture.request('POST', '/team/conversations', {
        id: randomUUID(), responsibilityScopeId: fixture.ids.scope, kind: 'channel', title, memberIds: [],
      }, admin.accessToken);
      assert.equal(result.status, 201, JSON.stringify(result.body));
      channels.push(result.body);
    }
    const output = path.resolve(__dirname, '../.local/team-channel-drag-qa');
    await fs.mkdir(output, { recursive: true });
    browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
    const errors = [];
    async function pageFor(session, mobile = false) {
      const context = await browser.newContext(mobile
        ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 }
        : { viewport: { width: 1440, height: 1000 } });
      await context.addInitScript(value => sessionStorage.setItem('ecl.session.v2', JSON.stringify({ session: value })), { ...session, rememberedDevice: false });
      const page = await context.newPage();
      page.setDefaultTimeout(20000);
      page.on('pageerror', error => errors.push(error.message));
      page.orderRequests = [];
      page.on('request', request => {
        if (request.method() === 'PUT' && /\/team\/conversations\/[^/]+\/order$/.test(new URL(request.url()).pathname)) page.orderRequests.push(request.postDataJSON());
      });
      await page.goto(`${fixture.origin}/?section=team`);
      await page.getByRole('heading', { name: 'Команда', exact: true }).waitFor();
      await page.locator('.team-chat-sidebar').getByText(channels[4].title, { exact: true }).waitFor();
      return page;
    }
    const listSelector = '.team-chat-sidebar section[aria-label="Каналы"]';
    const row = (page, channel) => page.locator(`[data-reorder-channel="${channel.id}"]`);
    const titles = page => page.locator(`${listSelector} .team-chat-label strong`).allTextContents();
    async function waitOrder(page, expected) {
      await page.waitForFunction(({ selector, expected }) => JSON.stringify([...document.querySelectorAll(selector)].map(node => node.textContent)) === JSON.stringify(expected), { selector: `${listSelector} .team-chat-label strong`, expected });
    }
    function moved(order, title, target, placement) {
      const next = order.filter(value => value !== title);
      next.splice(next.indexOf(target) + (placement === 'after' ? 1 : 0), 0, title);
      return next;
    }
    async function point(locator, placement) {
      const box = await locator.boundingBox();
      assert.ok(box, 'Channel must be visible');
      return { x: box.x + box.width / 2, y: box.y + box.height * (placement === 'before' ? .2 : placement === 'after' ? .8 : .5) };
    }
    const administrator = await pageFor(admin);
    await row(administrator, channels[1]).click();
    const initial = await titles(administrator);
    const selected = await administrator.locator(`${listSelector} .is-selected`).getAttribute('data-reorder-channel');
    async function mouseDrag(source, target, placement, cancel = false) {
      const from = await point(row(administrator, source));
      const to = await point(row(administrator, target), placement);
      await administrator.mouse.move(from.x, from.y);
      await administrator.mouse.down();
      await administrator.mouse.move(to.x, to.y, { steps: 8 });
      await row(administrator, source).filter({ has: administrator.locator('.team-channel-grip') }).waitFor();
      await administrator.waitForFunction(id => document.querySelector(`[data-reorder-channel="${id}"]`)?.classList.contains('is-dragging'), source.id);
      await administrator.locator(`[data-reorder-channel="${target.id}"].drop-${placement}`).waitFor();
      await administrator.screenshot({ path: path.join(output, cancel ? 'mouse-cancel.png' : 'mouse-insertion.png'), fullPage: false });
      if (cancel) await administrator.keyboard.press('Escape');
      await administrator.mouse.up();
      await administrator.locator('.team-chat-item.is-dragging').waitFor({ state: 'detached' });
    }
    let expected = moved(initial, channels[4].title, channels[0].title, 'before');
    await mouseDrag(channels[4], channels[0], 'before');
    await waitOrder(administrator, expected);
    assert.equal(administrator.orderRequests.length, 1);
    assert.equal(administrator.orderRequests[0].targetId, channels[0].id);
    assert.equal(administrator.orderRequests[0].placement, 'before');
    assert.ok(Number.isInteger(administrator.orderRequests[0].targetVersion));
    assert.equal(await administrator.locator(`${listSelector} .is-selected`).getAttribute('data-reorder-channel'), selected, 'Dragging must not select another channel');
    await administrator.reload();
    await waitOrder(administrator, expected);
    console.log('PASS mouse multi-position drag and reload persistence');
    const countBeforeCancel = administrator.orderRequests.length;
    await mouseDrag(channels[0], channels[3], 'after', true);
    assert.deepEqual(await titles(administrator), expected);
    assert.equal(administrator.orderRequests.length, countBeforeCancel, 'Escape must not save a move');
    console.log('PASS Escape cancels mouse drag without an order request');

    const mobile = await pageFor(admin, true);
    await mobile.bringToFront();
    const cdp = await mobile.context().newCDPSession(mobile);
    const touch = async (type, position) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: position ? [{ ...position, id: 1, radiusX: 1, radiusY: 1, force: 1 }] : [] });
    // Bring the source and its previous neighbor into the sidebar's viewport.
    await row(mobile, channels[1]).evaluate(node => node.scrollIntoView({ block: 'center' }));
    let from = await point(row(mobile, channels[1]));
    await touch('touchStart', from);
    await mobile.waitForTimeout(650);
    await mobile.locator(`[data-reorder-channel="${channels[1].id}"].is-dragging`).waitFor();
    let to = await point(row(mobile, channels[0]), 'before');
    await touch('touchMove', to);
    await mobile.locator(`[data-reorder-channel="${channels[0].id}"].drop-before`).waitFor();
    await mobile.screenshot({ path: path.join(output, 'touch-insertion-mobile.png'), fullPage: false });
    await touch('touchEnd');
    expected = moved(expected, channels[1].title, channels[0].title, 'before');
    await waitOrder(mobile, expected);
    assert.equal(mobile.orderRequests.length, 1);
    assert.equal(mobile.orderRequests[0].targetId, channels[0].id);
    await mobile.screenshot({ path: path.join(output, 'reordered-mobile.png'), fullPage: false });
    await mobile.reload();
    await waitOrder(mobile, expected);
    console.log('PASS emulated real touch long-press drag and reload persistence');

    await row(mobile, channels[0]).scrollIntoViewIfNeeded();
    await mobile.waitForTimeout(750);
    const countBeforeTap = mobile.orderRequests.length;
    await row(mobile, channels[0]).tap();
    await mobile.waitForFunction(id => document.querySelector(`[data-reorder-channel="${id}"]`)?.getAttribute('aria-pressed') === 'true', channels[0].id);
    assert.equal(mobile.orderRequests.length, countBeforeTap, 'Ordinary tap must only select');
    assert.deepEqual(await titles(mobile), expected);
    console.log('PASS ordinary touch tap selects without reordering');

    await row(mobile, channels[1]).scrollIntoViewIfNeeded();
    from = await point(row(mobile, channels[1]));
    await touch('touchStart', from);
    await touch('touchMove', { x: from.x, y: from.y - 35 });
    await mobile.waitForTimeout(650);
    assert.equal(await mobile.locator('.team-chat-item.is-dragging').count(), 0, 'Swipe before hold must cancel drag activation');
    await touch('touchMove', { x: from.x, y: from.y - 65 });
    await touch('touchEnd');
    assert.equal(mobile.orderRequests.length, countBeforeTap, 'Ordinary swipe must not save a move');
    assert.deepEqual(await titles(mobile), expected);
    assert.ok(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile must fit its viewport');
    console.log('PASS pre-hold swipe scroll does not reorder');

    await row(mobile, channels[1]).evaluate(node => node.scrollIntoView({ block: 'center' }));
    from = await point(row(mobile, channels[1]));
    const countBeforeMultitouch = mobile.orderRequests.length;
    await touch('touchStart', from);
    await mobile.waitForTimeout(650);
    await mobile.locator(`[data-reorder-channel="${channels[1].id}"].is-dragging`).waitFor();
    to = await point(row(mobile, channels[0]), 'after');
    await touch('touchMove', to);
    await mobile.locator(`[data-reorder-channel="${channels[0].id}"].drop-after`).waitFor();
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [
        { ...to, id: 1, radiusX: 1, radiusY: 1, force: 1 },
        { x: to.x + 35, y: to.y + 15, id: 2, radiusX: 1, radiusY: 1, force: 1 },
      ],
    });
    await mobile.locator('.team-chat-item.is-dragging').waitFor({ state: 'detached' });
    assert.equal(await mobile.locator('.drop-before, .drop-after').count(), 0, 'Second finger must remove the insertion indicator');
    await touch('touchEnd');
    assert.equal(mobile.orderRequests.length, countBeforeMultitouch, 'Releasing a multi-touch gesture must not save a move');
    assert.deepEqual(await titles(mobile), expected);
    await mobile.reload();
    await waitOrder(mobile, expected);
    console.log('PASS second finger cancels an active drag and release never saves it');

    const employee = await pageFor(employeeSession);
    assert.equal(await employee.locator('[data-reorder-channel]').count(), 0);
    await employee.locator(listSelector).getByText(channels[0].title, { exact: true }).click();
    await employee.getByRole('button', { name: 'Действия чата', exact: true }).click();
    await employee.getByRole('menu').waitFor();
    for (const label of ['Переместить выше', 'Переместить ниже', 'Архивировать канал', 'Удалить канал']) assert.equal(await employee.getByRole('menuitem', { name: label, exact: true }).count(), 0);
    await waitOrder(employee, expected);
    assert.deepEqual(errors, []);
    console.log('PASS employee sees shared order but has no drag, archive, or delete controls');
  } finally {
    if (browser) await browser.close();
    await fixture.close();
  }
})().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
