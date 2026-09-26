'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { paths, ORIGIN, readJson, openAdminPool } = require('../local-app/runtime.cjs');
const { recordsFromPlan, TARGET } = require('./import-local.cjs');

(async () => {
  const plan = await readJson(path.join(paths.root, '.local/recruitment-import/plan.json'));
  const login = await readJson(paths.login);
  const response = await fetch(ORIGIN + '/api/v1/auth/password', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN, 'X-Session-Refresh': '1' },
    body: JSON.stringify({ phone: login.phone, password: login.password, rememberDevice: false }) });
  assert.equal(response.status, 200);
  const session = await response.json();
  const headers = { Authorization: 'Bearer ' + session.accessToken };
  let browser;
  try {
    const request = await fetch(`${ORIGIN}/api/v1/recruitment?responsibilityScopeId=${TARGET.responsibilityScopeId}`, { headers });
    assert.equal(request.status, 200);
    const snapshot = await request.json();
    const expected = recordsFromPlan(plan, login.userId);
    assert.equal(snapshot.requests.length, expected.length);
    for (const record of expected) {
      const actual = snapshot.requests.find(row => row.id === record.payload.id);
      assert.ok(actual, record.sourceKey);
      for (const [key, value] of Object.entries(record.payload)) {
        if (key !== 'version') assert.deepEqual(actual[key], value, `${record.sourceKey}: ${key}`);
      }
      assert.equal(actual.version, 1);
      assert.equal(actual.sourceDetails, record.sourceDetails);
    }
    assert.equal(snapshot.candidates.length, 0); assert.equal(snapshot.applications.length, 0);
    const { chromium } = require(process.env.PLAYWRIGHT_MODULE);
    browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'Europe/Moscow' });
    await context.addInitScript(value => sessionStorage.setItem('ecl.session.v2', JSON.stringify({ session: value })), { ...session, rememberedDevice: false });
    const page = await context.newPage(); const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(ORIGIN + '/?section=recruitment');
    await page.getByLabel('Фильтр по проекту', { exact: true }).selectOption(TARGET.responsibilityScopeId);
    await page.getByRole('navigation', { name: 'Разделы рекрутинга' }).getByRole('button', { name: 'Потребности', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('.recruitment-request-card').length === 142);
    const out = path.join(paths.root, '.local/recruitment-import');
    await page.screenshot({ path: path.join(out, 'local-import-desktop.png') });
    for (const [kind, count] of [['driver', 85], ['carrier', 57]]) {
      await page.getByLabel('Направление', { exact: true }).selectOption(kind);
      await page.waitForFunction(expectedCount => document.querySelectorAll('.recruitment-request-card').length === expectedCount, count);
    }
    await page.getByLabel('Направление', { exact: true }).selectOption('driver');
    const sample = expected.find(r => r.sourceKey === 'Проекты:7');
    await page.getByLabel('Поиск', { exact: true }).fill(sample.payload.title);
    await page.locator('.recruitment-request-card').getByRole('button', { name: 'Подробнее о потребности', exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    const source = page.getByRole('dialog').locator('.recruitment-source-details');
    await source.getByText('Данные из исходной таблицы', { exact: true }).click();
    assert.equal(await source.locator('.recruitment-source-text').textContent(), sample.sourceDetails);
    await source.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(out, 'local-import-source-mobile.png') });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(errors, []);
    const pool = await openAdminPool();
    try {
      const migrations = (await pool.query("SELECT name FROM schema_migrations WHERE name LIKE '031_%'")).rows;
      assert.equal(migrations.length, 1);
      const accessCount = Number((await pool.query('SELECT count(*) FROM recruitment_external_access WHERE responsibility_scope_id=$1', [TARGET.responsibilityScopeId])).rows[0].count);
      assert.equal(accessCount, 0);
    } finally { await pool.end(); }
    const result = { checkedRecords: expected.length, drivers: 85, carriers: 57, valuesAndSourceMatch: true, browserDesktop: true, browserMobile: true, externalAccessAssigned: false, javascriptErrors: errors.length };
    await fs.writeFile(path.join(out, 'verification.json'), JSON.stringify(result, null, 2) + '\n', { mode: 0o600 });
    console.log(JSON.stringify(result, null, 2));
  } finally {
    if (browser) await browser.close();
    await fetch(ORIGIN + '/api/v1/auth/logout', { method: 'POST', headers: { ...headers, Origin: ORIGIN, 'X-Session-Refresh': '1' } });
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
