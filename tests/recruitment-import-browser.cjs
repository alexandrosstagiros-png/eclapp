'use strict';
// Imported request values through real API + disposable PostgreSQL; all data synthetic.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createTestServer } = require('./local-test-server.cjs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const fixture = await createTestServer({ builtFrontend: process.env.RECRUITMENT_BUILT_FRONTEND === 'true' });
  const out = path.resolve(__dirname, '../.local/recruitment-import-browser-qa');
  let browser;
  try {
    await fs.mkdir(out, { recursive: true });
    const { ids, request, adminPool: db } = fixture;
    await db.query('UPDATE access_grants SET personal_data_visible=true WHERE user_id=$1', [ids.admin]);
    const admin = await fixture.devLogin(ids.admin);
    const sourceDetails = 'Лист: Проекты · строка 18\nПотребность: не указана\nТариф: 4 500 ₽ + доплата\nПримечание: сохранить  два пробела\n<img src=x onerror="window.importUnsafe=true">\n' + 'Длинное_исходное_значение_'.repeat(30);
    async function makeRequest(title, quantity, status, kind) {
      const result = await request('PUT', '/recruitment/requests', { id: randomUUID(), responsibilityScopeId: ids.scope, version: 0,
        title, quantity, status, kind, city: '', priority: 'normal', recruiterId: ids.admin, notes: 'Внутренний комментарий', publicBrief: 'Условия для рекрутера' }, admin.accessToken);
      assert.equal(result.status, 200, JSON.stringify(result.body));
      await db.query('UPDATE recruitment_requests SET source_details=$2 WHERE id=$1', [result.body.id, sourceDetails]);
      return result.body;
    }
    const unknown = await makeRequest('Количество ещё не уточнено', null, 'paused', 'driver');
    const zero = await makeRequest('Нулевая потребность перевозчиков', 0, 'closed', 'carrier');
    browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'Europe/Moscow' });
    await context.addInitScript(session => sessionStorage.setItem('ecl.session.v2', JSON.stringify({ session })), { ...admin, rememberedDevice: false });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => dialog.accept());
    await page.goto(`${fixture.origin}/?section=recruitment`);
    const tabs = page.getByRole('navigation', { name: 'Разделы рекрутинга' });
    await tabs.getByRole('button', { name: 'Потребности', exact: true }).click();
    const unknownCard = page.locator('.recruitment-request-card').filter({ has: page.getByRole('heading', { name: unknown.title, exact: true }) });
    const zeroCard = page.locator('.recruitment-request-card').filter({ has: page.getByRole('heading', { name: zero.title, exact: true }) });
    await unknownCard.getByText('Не уточнено', { exact: true }).waitFor();
    assert.equal(await zeroCard.locator('.recruitment-demand-quantity strong').textContent(), '0');
    await page.screenshot({ path: path.join(out, 'unknown-zero-desktop.png'), fullPage: true });
    await unknownCard.getByRole('button', { name: 'Подробнее о потребности', exact: true }).click();
    let dialog = page.getByRole('dialog');
    const source = dialog.locator('.recruitment-source-details');
    assert.equal(await source.evaluate(element => element.open), false);
    await source.getByText('Данные из исходной таблицы', { exact: true }).click();
    assert.equal(await source.locator('.recruitment-source-text').textContent(), sourceDetails);
    assert.equal(await source.locator('img,script,input,textarea,[contenteditable]').count(), 0);
    assert.equal(await source.locator('.recruitment-source-text').evaluate(element => getComputedStyle(element).whiteSpace), 'pre-wrap');
    assert.equal(await page.evaluate(() => window.importUnsafe === true), false);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'source detail fits mobile');
    await source.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(out, 'source-details-mobile.png'), fullPage: true });
    await dialog.getByRole('button', { name: 'Изменить потребность', exact: true }).click();
    dialog = page.getByRole('dialog');
    assert.equal(await dialog.getByLabel('Нужно водителей', { exact: true }).inputValue(), '');
    assert.equal(await dialog.getByLabel('Нужно водителей', { exact: true }).evaluate(element => element.required), false);
    assert.equal(await dialog.getByLabel('Нужно водителей', { exact: true }).getAttribute('min'), '0');
    assert.equal(await dialog.getByLabel('Город', { exact: true }).evaluate(element => element.required), false);
    assert.equal(await dialog.getByText('Данные из исходной таблицы', { exact: true }).count(), 0, 'source is not an editable form field');
    async function saveRequest(expectedQuantity, expectedStatus) {
      const response = page.waitForResponse(result => result.url().endsWith('/recruitment/requests') && result.request().method() === 'PUT');
      await page.getByRole('dialog').getByRole('button', { name: 'Сохранить', exact: true }).click();
      const result = await response;
      assert.equal(result.status(), 200, await result.text());
      const sent = result.request().postDataJSON(), saved = await result.json();
      assert.equal(sent.quantity, expectedQuantity);
      assert.equal(Object.hasOwn(sent, 'sourceDetails'), false);
      assert.equal(saved.quantity, expectedQuantity);
      assert.equal(saved.status, expectedStatus);
      assert.equal(saved.sourceDetails, sourceDetails, 'readonly source survives an ordinary save');
      await page.getByRole('dialog').waitFor({ state: 'hidden' });
      return saved;
    }
    await saveRequest(null, 'paused');
    await unknownCard.getByRole('button', { name: 'Изменить потребность', exact: true }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByLabel('Статус потребности', { exact: true }).selectOption('open');
    for (const label of ['Нужно водителей', 'Город']) {
      assert.equal(await dialog.getByLabel(label, { exact: true }).evaluate(element => element.required), true);
      assert.equal(await dialog.getByLabel(label, { exact: true }).evaluate(element => element.checkValidity()), false);
    }
    assert.equal(await dialog.getByLabel('Нужно водителей', { exact: true }).getAttribute('min'), '1');
    await dialog.getByLabel('Нужно водителей', { exact: true }).fill('2');
    await dialog.getByLabel('Город', { exact: true }).fill('Москва');
    await saveRequest(2, 'open');
    await unknownCard.getByRole('button', { name: 'Изменить потребность', exact: true }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByLabel('Статус потребности', { exact: true }).selectOption('closed');
    await dialog.getByLabel('Нужно водителей', { exact: true }).fill('');
    await dialog.getByLabel('Город', { exact: true }).fill('');
    await saveRequest(null, 'closed');
    await zeroCard.getByRole('button', { name: 'Изменить потребность', exact: true }).click();
    assert.equal(await page.getByRole('dialog').getByLabel('Нужно машин', { exact: true }).inputValue(), '0');
    await saveRequest(0, 'closed');
    console.log('PASS unknown and zero quantities, status-specific required fields, readonly safe source text and preservation');

    const externalId = randomUUID();
    await db.query(`INSERT INTO users(id,display_name,role,active,approved) VALUES($1,'Импорт: внешний рекрутер','external_recruiter',true,true)`, [externalId]);
    await db.query(`INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id,personal_data_visible)
      VALUES($1,$2,$3,$4,$5,true)`, [externalId, ids.legal, ids.region, ids.project, ids.scope]);
    const access = await request('PUT', '/recruitment/access', { responsibilityScopeId: ids.scope, userId: externalId, requestIds: [unknown.id, zero.id], status: 'active', expiresAt: null, version: 0 }, admin.accessToken);
    assert.equal(access.status, 200, JSON.stringify(access.body));
    const external = await fixture.devLogin(externalId);
    const externalData = await request('GET', `/recruitment?responsibilityScopeId=${ids.scope}`, undefined, external.accessToken);
    assert.equal(externalData.status, 200);
    for (const item of externalData.body.requests) assert.equal(Object.hasOwn(item, 'sourceDetails'), false);
    const extContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await extContext.addInitScript(session => sessionStorage.setItem('ecl.session.v2', JSON.stringify({ session })), { ...external, rememberedDevice: false });
    const externalPage = await extContext.newPage();
    externalPage.on('pageerror', error => errors.push(error.message));
    await externalPage.goto(`${fixture.origin}/?section=recruitment`);
    await externalPage.getByRole('navigation', { name: 'Разделы рекрутинга', exact: true }).getByRole('button', { name: 'Потребности', exact: true }).click();
    await externalPage.getByRole('heading', { name: unknown.title, exact: true }).waitFor();
    await externalPage.locator('.recruitment-request-card').filter({ has: externalPage.getByRole('heading', { name: unknown.title, exact: true }) }).getByRole('button', { name: 'Подробнее о потребности', exact: true }).click();
    assert.equal(await externalPage.locator('.recruitment-source-details').count(), 0);
    assert.equal(await externalPage.getByText('Внутренний комментарий', { exact: true }).count(), 0);
    assert.deepEqual(errors, []);
    console.log('PASS external recruitment keeps unknown quantity and never receives imported source details');
  } finally {
    if (browser) await browser.close();
    await fixture.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
