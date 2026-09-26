'use strict';
// Real HTTP API and disposable PostgreSQL with synthetic users only.
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const { createTestServer } = require('./local-test-server.cjs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const f = await createTestServer({ builtFrontend: process.env.IMPERSONATION_BUILT_FRONTEND === 'true' });
  const out = path.resolve(__dirname, '../.local/impersonation-browser-qa');
  let browser;
  try {
    await fs.mkdir(out, { recursive: true });
    const seedAdmin = await f.devLogin(f.ids.admin);
    const phone = '+79990000888';
    const issued = await f.request('POST', `/access/users/${f.ids.admin}/password`, { phone }, seedAdmin.accessToken);
    assert.equal(issued.status, 201);
    const names = (await f.adminPool.query('SELECT id,display_name FROM users WHERE id=ANY($1::uuid[])', [f.ids.drivers])).rows;
    browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => dialog.accept());
    await page.goto(f.origin);
    await page.locator('#login-phone').fill(phone);
    await page.locator('#login-password').fill(issued.body.password);
    const loginResponse = page.waitForResponse(response => response.url().endsWith('/auth/password') && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Войти', exact: true }).click();
    const adminSession = await (await loginResponse).json();
    await page.getByRole('heading', { name: 'Сотрудники', exact: true }).waitFor();
    const cookieValue = async () => (await context.cookies()).find(cookie => cookie.name === 'ecl_refresh_dev')?.value;
    const initialCookie = await cookieValue();
    assert.ok(initialCookie, 'remembered administrator cookie exists');
    const enter = async (userId) => {
      const name = names.find(row => row.id === userId).display_name;
      const card = page.locator('article.employee-card').filter({ hasText: name });
      const response = page.waitForResponse(response => response.url().endsWith('/auth/impersonate') && response.request().method() === 'POST');
      await card.getByRole('button', { name: 'Войти как сотрудник', exact: true }).click();
      const result = await response;
      assert.equal(result.status(), 200);
      const child = await result.json();
      assert.equal(child.actor.id, userId);
      assert.equal(child.actor.role, 'driver');
      await page.getByRole('button', { name: 'Вернуться в админку', exact: true }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Войти как сотрудник', exact: true }).count(), 0);
      assert.equal(await cookieValue(), initialCookie);
      return child;
    };
    const child = await enter(f.ids.drivers[0]);
    await page.screenshot({ path: path.join(out, 'impersonation-desktop.png'), fullPage: true });
    await page.reload();
    await page.getByRole('button', { name: 'Вернуться в админку', exact: true }).waitFor();
    assert.equal(await cookieValue(), initialCookie, 'reload keeps the administrator device credential');
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'banner fits mobile viewport');
    await page.screenshot({ path: path.join(out, 'impersonation-mobile.png'), fullPage: true });
    await page.getByRole('button', { name: 'Вернуться в админку', exact: true }).click();
    await page.getByRole('heading', { name: 'Сотрудники', exact: true }).waitFor();
    assert.equal((await f.request('GET', '/me', undefined, child.accessToken)).status, 401);
    assert.equal((await f.request('GET', '/me', undefined, adminSession.accessToken)).status, 200);
    assert.equal(await cookieValue(), initialCookie);
    console.log('PASS enter, reload, mobile banner, return, child revocation and parent cookie preservation');

    await page.setViewportSize({ width: 1440, height: 1000 });
    const expired = await enter(f.ids.drivers[1]);
    await f.adminPool.query("UPDATE sessions SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1", [expired.actor.sessionId]);
    await page.reload();
    await page.getByRole('heading', { name: 'Сотрудники', exact: true }).waitFor();
    assert.equal(await cookieValue(), initialCookie);
    console.log('PASS expired employee session restores administrator without changing remembered identity');

    const revoked = await enter(f.ids.drivers[0]);
    await f.adminPool.query('UPDATE users SET auth_version=auth_version+1 WHERE id=$1', [f.ids.admin]);
    await page.reload();
    await page.locator('#login-phone').waitFor();
    assert.equal((await f.request('GET', '/me', undefined, revoked.accessToken)).status, 401);
    assert.equal(await page.locator('#login-phone').inputValue(), phone);
    assert.deepEqual(errors, []);
    console.log('PASS administrator revocation ends impersonation; saved phone remains; no JavaScript errors');
  } finally {
    if (browser) await browser.close();
    await f.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
