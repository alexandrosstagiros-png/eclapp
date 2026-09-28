'use strict';
// Native mouse/touch input, real API and a disposable PostgreSQL fixture only.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createTestServer } = require('./local-test-server.cjs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const fixture = await createTestServer({ builtFrontend: process.env.RECRUITMENT_BUILT_FRONTEND === 'true' });
  const out = path.resolve(__dirname, '../.local/recruitment-board-drag-browser-qa');
  let browser, releasePending;
  const errors = [], writes = [];
  try {
    await fs.mkdir(out, { recursive: true });
    const { ids, adminPool: db } = fixture;
    await db.query('UPDATE access_grants SET personal_data_visible=true WHERE user_id=$1', [ids.admin]);
    const admin = await fixture.devLogin(ids.admin);
    const api = async (method, route, body, session = admin) => {
      const response = await fixture.request(method, `/recruitment${route}`, body, session.accessToken);
      assert.equal(response.status, 200, `${method} ${route}: ${response.status} ${JSON.stringify(response.body)}`);
      return response.body;
    };
    const base = () => ({ id: randomUUID(), responsibilityScopeId: ids.scope, version: 0 });
    const save = (collection, body, session) => api('PUT', `/${collection}`, body, session);
    const snapshot = () => api('GET', `?responsibilityScopeId=${ids.scope}`);
    const stored = async id => (await snapshot()).applications.find(item => item.id === id);
    const demands = [];
    for (let index = 0; index < 2; index++) demands.push(await save('requests', { ...base(), title: `Перенос: проект ${index + 1}`, city: 'Москва', kind: 'driver', quantity: 2, priority: 'normal', status: 'open', recruiterId: ids.admin, requiresSecurity: Boolean(index) }));
    const candidate = await save('candidates', { ...base(), fullName: 'Синтетический кандидат для переноса', phone: '+79990770101', city: 'Москва', kind: 'driver', source: 'manual', recruiterId: ids.admin });
    const applications = [];
    for (let index = 0; index < 2; index++) applications.push(await save('applications', { ...base(), candidateId: candidate.id, requestId: demands[index].id, recruiterId: ids.admin, stage: index ? 'security' : 'new' }));
    browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
    const put = response => response.url().endsWith('/recruitment/applications') && response.request().method() === 'PUT';
    const pendingPut = page => { const pending = page.waitForResponse(put); void pending.catch(() => {}); return pending; };
    async function pageFor(session, touch = false) {
      const context = await browser.newContext({ viewport: touch ? { width: 390, height: 844 } : { width: 1440, height: 1100 }, timezoneId: 'Europe/Moscow', ...(touch ? { isMobile: true, hasTouch: true } : {}) });
      await context.addInitScript(value => sessionStorage.setItem('ecl.session.v2', JSON.stringify({ session: { ...value, rememberedDevice: false } })), session);
      const page = await context.newPage(); page.setDefaultTimeout(15000);
      page.on('pageerror', error => errors.push(error.message));
      page.on('dialog', dialog => dialog.dismiss());
      page.on('request', request => { if (request.url().endsWith('/recruitment/applications') && request.method() === 'PUT') writes.push(request.postDataJSON()); });
      await page.goto(`${fixture.origin}/?section=recruitment`);
      await page.getByRole('button', { name: 'По этапам', exact: true }).click();
      await page.locator('.recruitment-board [data-stage]').first().waitFor();
      assert.equal(await page.locator('.recruitment-board [data-stage]').count(), 10);
      return page;
    }
    const card = (page, id) => page.locator(`.recruitment-board [data-application-id="${id}"]`);
    const column = (page, stage) => page.locator(`.recruitment-board [data-stage="${stage}"]`);
    const select = (page, id) => card(page, id).locator('.recruitment-quick-stage select');
    const inStage = (page, id, stage) => column(page, stage).locator(`[data-application-id="${id}"]`);
    async function waitReady(page, id) {
      await page.waitForFunction(id => {
        const select = document.querySelector(`.recruitment-board [data-application-id="${id}"] .recruitment-quick-stage select`);
        return select && !select.disabled;
      }, id);
    }
    async function waitVisibleCard(page, id) {
      await page.waitForFunction(id => {
        const card = document.querySelector(`.recruitment-board [data-application-id="${id}"]`);
        const board = card?.closest('.recruitment-board');
        if (!card || !board) return false;
        const box = card.getBoundingClientRect(), outer = board.getBoundingClientRect();
        return box.left >= Math.max(0, outer.left) - 1 && box.right <= Math.min(innerWidth, outer.right) + 1 && box.bottom > 0 && box.top < innerHeight;
      }, id);
    }
    async function startMouse(page, id) {
      const element = card(page, id);
      await element.scrollIntoViewIfNeeded();
      const handle = element.locator('[data-drag-handle]');
      const pointElement = await handle.count() ? handle.first() : element.locator('.recruitment-meta').first();
      const box = await pointElement.boundingBox(); assert.ok(box);
      const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      await page.mouse.move(point.x, point.y); await page.mouse.down();
      await page.mouse.move(point.x + 14, point.y + 4, { steps: 5 });
      return point;
    }
    // Move by native input to an initially offscreen column; edge scrolling must make it reachable.
    async function moveToColumn(page, stage, move) {
      const board = page.locator('.recruitment-board');
      for (let attempt = 0; attempt < 90; attempt++) {
        const outer = await board.boundingBox(), target = await column(page, stage).boundingBox();
        const view = page.viewportSize();
        const left = Math.max(outer.x, 0), right = Math.min(outer.x + outer.width, view.width);
        const top = Math.max(outer.y, 0), bottom = Math.min(outer.y + outer.height, view.height);
        const y = Math.min(bottom - 15, Math.max(top + 25, target.y + 25));
        const visibleLeft = Math.max(left + 12, target.x + 12), visibleRight = Math.min(right - 12, target.x + target.width - 12);
        if (visibleRight - visibleLeft > 35) {
          await move((visibleLeft + visibleRight) / 2, y);
          return;
        }
        await move(target.x >= right ? right - 8 : left + 8, y);
        await page.waitForTimeout(75);
      }
      throw new Error(`Drag auto-scroll did not reach stage ${stage}`);
    }
    async function drag(page, id, stage) {
      await startMouse(page, id);
      await moveToColumn(page, stage, (x, y) => page.mouse.move(x, y, { steps: 3 }));
      await page.mouse.up();
    }
    async function response(pending, status = 200) {
      const result = await pending; assert.equal(result.status(), status, await result.text()); return result.json();
    }
    async function noWrite(page, id, action) {
      const before = await stored(id), count = writes.length;
      await action();
      // Allow a scheduled gesture/save callback to surface before asserting absence.
      await page.waitForTimeout(180);
      assert.equal(writes.length, count);
      assert.deepEqual(await stored(id), before);
      await inStage(page, id, before.stage).waitFor();
    }
    const page = await pageFor(admin);
    const primary = applications[0].id, secondary = applications[1].id;
    assert.equal(await card(page, primary).count(), 1);
    assert.equal(await card(page, secondary).count(), 1);
    assert.equal(await column(page, 'contact').locator('[data-application-id]').count(), 0);
    let markPending;
    const intercepted = new Promise(resolve => { markPending = resolve; });
    const gate = new Promise(resolve => { releasePending = resolve; });
    const hold = async route => { if (route.request().method() !== 'PUT') return route.continue(); markPending(); await gate; await route.continue(); };
    await page.route('**/recruitment/applications', hold);
    let pending = pendingPut(page);
    await drag(page, primary, 'contact');
    await Promise.race([intercepted, new Promise((_, reject) => setTimeout(() => reject(new Error('Native mouse drop did not dispatch an application update')), 15000))]);
    await inStage(page, primary, 'new').waitFor();
    await card(page, primary).getByText('Сохраняем…', { exact: true }).waitFor();
    assert.equal(await inStage(page, primary, 'contact').count(), 0, 'The card cannot move before server confirmation');
    releasePending(); releasePending = null;
    const moved = await response(pending); assert.equal(moved.id, primary); assert.equal(moved.stage, 'contact');
    await waitReady(page, primary); await inStage(page, primary, 'contact').waitFor();
    await waitVisibleCard(page, primary);
    await page.unroute('**/recruitment/applications', hold);
    assert.deepEqual(await stored(secondary), applications[1], 'Two applications of one candidate remain independent');
    console.log('PASS native mouse drop into an empty column waits for server confirmation and preserves the other application');

    // Native select is also a keyboard route to the same stage transition.
    await select(page, primary).focus();
    pending = pendingPut(page);
    // Type-ahead works in native macOS selects without relying on a headed popup menu.
    const keyboard = await page.context().newCDPSession(page);
    await keyboard.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'К', code: 'KeyR', text: 'К', unmodifiedText: 'к', windowsVirtualKeyCode: 82 });
    await keyboard.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'К', code: 'KeyR', windowsVirtualKeyCode: 82 });
    assert.equal((await response(pending)).stage, 'qualified');
    await waitReady(page, primary); await inStage(page, primary, 'qualified').waitFor();
    assert.equal(await page.getByRole('dialog').count(), 0);
    console.log('PASS board card supports its inline stage control using only the keyboard');

    await noWrite(page, primary, () => drag(page, primary, 'qualified'));
    await noWrite(page, primary, async () => { await startMouse(page, primary); await page.mouse.move(10, 20, { steps: 5 }); await page.mouse.up(); });
    await noWrite(page, primary, async () => { await startMouse(page, primary); await moveToColumn(page, 'interview', (x, y) => page.mouse.move(x, y)); await page.keyboard.press('Escape'); await page.mouse.up(); });
    console.log('PASS same-column, outside-board and Escape cancellation do not write or move a card');

    const beforeSpecial = writes.length;
    await drag(page, primary, 'hired');
    const hireDate = card(page, primary).getByLabel('Дата выхода в работу', { exact: true });
    await hireDate.waitFor(); await inStage(page, primary, 'qualified').waitFor();
    await waitVisibleCard(page, primary);
    assert.equal(writes.length, beforeSpecial);
    await hireDate.fill(''); await card(page, primary).getByRole('button', { name: 'Сохранить статус', exact: true }).click();
    assert.equal(await hireDate.evaluate(element => element.validity.valueMissing), true);
    assert.equal(writes.length, beforeSpecial);
    await card(page, primary).getByRole('button', { name: 'Отмена', exact: true }).click();
    assert.equal((await stored(primary)).stage, 'qualified');
    await drag(page, primary, 'hired'); await hireDate.fill('2026-09-29');
    pending = pendingPut(page); await card(page, primary).getByRole('button', { name: 'Сохранить статус', exact: true }).click();
    assert.equal((await response(pending)).startDate, '2026-09-29');
    await waitReady(page, primary); await inStage(page, primary, 'hired').waitFor();
    await waitVisibleCard(page, primary);
    const beforeRejected = writes.length;
    await drag(page, primary, 'rejected');
    const reason = card(page, primary).getByLabel('Причина отказа', { exact: true }); await reason.waitFor();
    await inStage(page, primary, 'hired').waitFor(); assert.equal(writes.length, beforeRejected);
    await reason.fill(''); await card(page, primary).getByRole('button', { name: 'Сохранить статус', exact: true }).click();
    assert.equal(writes.length, beforeRejected);
    await reason.fill('Синтетическая причина отказа');
    pending = pendingPut(page); await card(page, primary).getByRole('button', { name: 'Сохранить статус', exact: true }).click();
    assert.equal((await response(pending)).reason, 'Синтетическая причина отказа');
    await waitReady(page, primary); await inStage(page, primary, 'rejected').waitFor();
    await waitVisibleCard(page, primary);
    assert.ok(await page.locator('.recruitment-board').evaluate(element => element.scrollLeft > 0), 'Distant stages are reached through edge auto-scroll');
    console.log('PASS drop to hire/rejection retains the original card until inline required values are confirmed; distant columns are reachable');

    const beforeSecurity = await stored(secondary);
    pending = pendingPut(page); await drag(page, secondary, 'internship');
    await response(pending, 400);
    await card(page, secondary).getByRole('alert').waitFor(); await inStage(page, secondary, 'security').waitFor();
    await waitVisibleCard(page, secondary);
    assert.deepEqual(await stored(secondary), beforeSecurity, 'Real security prerequisite rejection never moves or mutates the card');
    const beforeConflict = await stored(primary);
    const concurrent = await save('applications', { ...beforeConflict, stage: 'contact' });
    pending = pendingPut(page); await drag(page, primary, 'reserve'); await response(pending, 409);
    await card(page, primary).getByRole('alert').waitFor(); await inStage(page, primary, 'rejected').waitFor();
    await waitVisibleCard(page, primary);
    assert.equal(await select(page, primary).isDisabled(), true);
    assert.deepEqual(await stored(primary), concurrent);
    await card(page, primary).getByRole('button', { name: 'Обновить данные', exact: true }).click();
    await waitReady(page, primary); await inStage(page, primary, 'contact').waitFor();
    console.log('PASS real API 400 and 409 keep the confirmed card position, protect history and require refresh after conflict');

    await card(page, primary).scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(out, 'board-desktop.png'), fullPage: true });
    const mobile = await pageFor(admin, true), cdp = await mobile.context().newCDPSession(mobile);
    const touch = async (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' || type === 'touchCancel' ? [] : [{ x, y, id: 1, radiusX: 4, radiusY: 4, force: 1 }] });
    async function touchPoint(id) {
      await card(mobile, id).scrollIntoViewIfNeeded();
      const element = card(mobile, id).locator('[data-drag-handle]');
      const box = await (await element.count() ? element.first() : card(mobile, id).locator('.recruitment-meta').first()).boundingBox();
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    }
    await noWrite(mobile, primary, async () => {
      const point = await touchPoint(primary); await touch('touchStart', point.x, point.y);
      await touch('touchMove', point.x, point.y - 65); await touch('touchEnd');
    });
    await noWrite(mobile, primary, async () => {
      const point = await touchPoint(primary); await touch('touchStart', point.x, point.y); await mobile.waitForTimeout(550);
      assert.equal(await mobile.locator('.recruitment-board').getAttribute('data-drag-active'), 'true');
      await touch('touchMove', point.x + 20, point.y); await touch('touchCancel');
    });
    const point = await touchPoint(primary); await touch('touchStart', point.x, point.y); await mobile.waitForTimeout(550);
    assert.equal(await mobile.locator('.recruitment-board').getAttribute('data-drag-active'), 'true');
    await moveToColumn(mobile, 'qualified', (x, y) => touch('touchMove', x, y));
    pending = pendingPut(mobile); await touch('touchEnd');
    assert.equal((await response(pending)).stage, 'qualified');
    await waitReady(mobile, primary); await inStage(mobile, primary, 'qualified').waitFor();
    await waitVisibleCard(mobile, primary);
    assert.ok(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await mobile.screenshot({ path: path.join(out, 'board-mobile.png'), fullPage: true });
    console.log('PASS native short touch movement and touchcancel do not write; long hold moves the intended card without mobile overflow');

    const externalId = randomUUID();
    await db.query("INSERT INTO users(id,display_name,role,active,approved) VALUES($1,'Синтетический внешний рекрутер доски','external_recruiter',true,true)", [externalId]);
    await db.query('INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id,personal_data_visible) VALUES($1,$2,$3,$4,$5,true)', [externalId, ids.legal, ids.region, ids.project, ids.scope]);
    const grant = await save('access', { responsibilityScopeId: ids.scope, userId: externalId, requestIds: [demands[0].id], status: 'active', version: 0 });
    const external = await fixture.devLogin(externalId);
    const own = await save('candidates', { ...base(), fullName: 'Свой кандидат внешней доски', phone: '+79990770102', city: 'Москва', kind: 'driver', source: 'manual', recruiterId: externalId }, external);
    const ownApplication = await save('applications', { ...base(), candidateId: own.id, requestId: demands[0].id, recruiterId: externalId, stage: 'new' }, external);
    const ext = await pageFor(external);
    assert.equal(await card(ext, primary).count(), 0); assert.equal(await card(ext, secondary).count(), 0);
    pending = pendingPut(ext); await drag(ext, ownApplication.id, 'contact');
    assert.equal((await response(pending)).id, ownApplication.id); await waitReady(ext, ownApplication.id);
    const denied = await fixture.request('PUT', '/recruitment/applications', { ...(await stored(primary)), stage: 'reserve' }, external.accessToken);
    assert.equal(denied.status, 403);
    await save('access', { ...grant, responsibilityScopeId: ids.scope, status: 'revoked' });
    pending = pendingPut(ext); await drag(ext, ownApplication.id, 'qualified'); await response(pending, 403);
    await ext.getByRole('alert').filter({ hasText: 'Доступ к потребностям мог быть отозван' }).waitFor();
    assert.equal(await card(ext, ownApplication.id).count(), 0);
    assert.equal((await stored(ownApplication.id)).stage, 'contact');
    assert.deepEqual(errors, []);
    console.log('PASS external drag respects ownership and revoked access; no JavaScript errors');
  } catch (error) {
    if (browser) for (const [index, page] of browser.contexts().flatMap(context => context.pages()).entries()) {
      await page.screenshot({ path: path.join(out, `failure-${index}.png`), fullPage: true }).catch(() => {});
      console.error(`Failure page ${index}: ${(await page.locator('body').innerText()).slice(-5000)}`);
    }
    throw error;
  } finally { releasePending?.(); if (browser) await browser.close(); await fixture.close(); }
})().catch(error => { console.error(error.stack || error.message); process.exit(1); });
