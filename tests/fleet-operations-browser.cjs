'use strict';
// End-to-end native fleet workflow against disposable PostgreSQL and the actual app.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createTestServer } = require('./local-test-server.cjs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const fixture = await createTestServer({ builtFrontend: process.env.FLEET_BUILT_FRONTEND === 'true' });
  const output = path.resolve(__dirname, '../.local/fleet-browser-qa');
  let browser;
  try {
    await fs.mkdir(output, { recursive: true });
    await fixture.adminPool.query('UPDATE access_grants SET finance_visible=true WHERE user_id=$1', [fixture.ids.admin]);
    let admin = await fixture.devLogin(fixture.ids.admin);
    const password = await fixture.request('POST', `/access/users/${fixture.ids.admin}/password`, { phone: '+79990008921' }, admin.accessToken);
    assert.equal(password.status, 201);
    admin = await fixture.devLogin(fixture.ids.admin);
    browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('dialog', d => d.accept());
    async function login(target, phone, secret) {
      await target.goto(fixture.origin);
      await target.locator('#login-phone').fill(phone);
      await target.locator('#login-password').fill(secret);
      await target.getByRole('button', { name: 'Войти', exact: true }).click();
    }
    await login(page, '+79990008921', password.body.password);
    await page.getByRole('navigation', { name: 'Разделы', exact: true }).getByRole('button', { name: 'Автопарк', exact: true }).click();
    await page.getByRole('button', { name: 'Заказ-наряды', exact: true }).first().click();
    const ops = page.locator('.fleet-ops').first();
    async function tab(name) { await ops.getByRole('button', { name, exact: true }).first().click(); await ops.getByRole('heading', { name, exact: true }).waitFor(); }
    async function add(name, fill) {
      await tab(name);
      await ops.getByRole('button', { name: 'Добавить', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await fill(dialog);
      const response = page.waitForResponse(r => r.url().includes('/fleet-operations/') && r.request().method() === 'PUT');
      await dialog.getByRole('button', { name: 'Сохранить', exact: true }).click();
      const result = await response;
      assert.equal(result.status(), 200, await result.text());
      const record = await result.json();
      await dialog.waitFor({ state: 'hidden' });
      return record;
    }
    const vehicle = await add('Автомобили', async d => { await d.getByLabel('Госномер').fill('А123АА777'); await d.getByLabel('Пробег, км').fill('1000'); });
    const warehouse = await add('Склады', d => d.getByLabel('Название склада').fill('Тестовый склад'));
    const part = await add('Номенклатура', d => d.getByLabel('Наименование').fill('Фильтр тестовый'));
    const vendor = await add('Подрядчики', d => d.getByLabel('Название', { exact: false }).fill('Тестовый поставщик'));
    await tab('Склад');
    await ops.getByRole('button', { name: 'Начальный остаток', exact: true }).click();
    let dialog = page.getByRole('dialog');
    await dialog.getByLabel('Запчасть').selectOption(part.id);
    await dialog.getByLabel('Склад').selectOption(warehouse.id);
    await dialog.getByLabel('Количество').fill('2');
    await dialog.getByLabel('Стоимость единицы').fill('100');
    await dialog.getByLabel('Основание / документ').fill('Тестовая инвентаризация');
    await dialog.getByRole('button', { name: 'Записать остаток', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    const purchase = await add('Закупки', async d => {
      await d.getByLabel('Номер закупки').fill('БРАУЗЕР-ЗАКУПКА');
      await d.getByLabel('Поставщик').selectOption(vendor.id);
      await d.getByLabel('Склад приёмки').selectOption(warehouse.id);
      await d.getByRole('button', { name: 'Добавить позицию' }).click();
      await d.getByLabel('Номенклатура').selectOption(part.id);
      await d.getByLabel('Количество').fill('2');
      await d.getByLabel('Цена закупки').fill('300');
    });
    async function action(title, button) {
      const row = ops.getByRole('row').filter({ hasText: title });
      await row.getByRole('button', { name: button, exact: true }).click();
      const d = page.getByRole('dialog');
      const response = page.waitForResponse(r => r.url().endsWith('/action') && r.request().method() === 'POST');
      await d.getByRole('button', { name: button, exact: true }).click();
      const result = await response; assert.equal(result.status(), 201, await result.text());
      await d.waitFor({ state: 'hidden' });
    }
    await action('БРАУЗЕР-ЗАКУПКА', 'Заказать');
    await action('БРАУЗЕР-ЗАКУПКА', 'Принять на склад');
    await add('Заказ-наряды', async d => {
      await d.getByLabel('Номер заказ-наряда').fill('БРАУЗЕР-РЕМОНТ');
      await d.getByLabel('Автомобиль').selectOption(vehicle.id);
      await d.getByLabel('Выполнение').selectOption('internal');
      await d.getByRole('button', { name: 'Добавить позицию' }).click();
      await d.getByLabel('Тип позиции').selectOption('запчасть');
      await d.getByLabel('Номенклатура').selectOption(part.id);
      await d.getByLabel('Источник запчасти').selectOption('warehouse');
      await d.getByLabel('Склад списания').selectOption(warehouse.id);
      await d.getByLabel('Цена за единицу').fill('999');
    });
    await action('БРАУЗЕР-РЕМОНТ', 'Завершить');
    const state = await fixture.request('GET', `/fleet-operations?responsibilityScopeId=${fixture.ids.scope}`, undefined, admin.accessToken);
    assert.equal(state.status, 200, JSON.stringify(state.body));
    assert.equal(state.body.stock[0].quantity, 3);
    assert.equal(state.body.stock[0].amountCents, 60000);
    assert.equal(state.body.records.orders[0].lines[0].amountCents, 20000);
    await tab('Склад');
    await ops.getByRole('cell', { name: 'Фильтр тестовый', exact: true }).waitFor();
    await page.screenshot({ path: path.join(output, 'stock-desktop.png'), fullPage: true });
    console.log('PASS real app: fleet navigation, vehicle/vendor/part/warehouse creation, stock opening, purchase receipt, weighted repair completion');

    const driverId = randomUUID();
    await fixture.adminPool.query("INSERT INTO users(id,display_name,role,active,approved) VALUES($1,'Тестовый водитель','driver',true,true)", [driverId]);
    await fixture.adminPool.query('INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id,finance_visible) VALUES($1,$2,$3,$4,$5,false)', [driverId, fixture.ids.legal, fixture.ids.region, fixture.ids.project, fixture.ids.scope]);
    const dp = await fixture.request('POST', `/access/users/${driverId}/password`, { phone: '+79990008922' }, admin.accessToken);
    assert.equal(dp.status, 201);
    // Reload driver options after the newly provisioned employee.
    await ops.getByRole('button', { name: 'Обновить', exact: true }).click();
    await add('Водители', async d => { await d.getByLabel('Автомобиль').selectOption(vehicle.id); await d.getByLabel('Водитель').selectOption(driverId); });
    const driverContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const driverPage = await driverContext.newPage(); driverPage.on('pageerror', e => errors.push(e.message));
    await login(driverPage, '+79990008922', dp.body.password);
    await driverPage.getByRole('navigation', { name: 'Разделы', exact: true }).getByRole('button', { name: 'Мой автомобиль', exact: true }).click();
    await driverPage.getByRole('button', { name: 'Записать заправку', exact: true }).click();
    dialog = driverPage.getByRole('dialog');
    await dialog.getByLabel('Количество топлива').fill('10.25');
    await dialog.getByLabel('Цена литра').fill('65');
    await dialog.getByLabel('Пробег, км').fill('1100');
    await dialog.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    await driverPage.getByText('Заявка отправлена ответственному за автопарк.').waitFor();
    await driverPage.screenshot({ path: path.join(output, 'driver-mobile.png'), fullPage: true });
    const overflow = await driverPage.evaluate(() => [...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > innerWidth + 1).slice(0,12).map(e => ({ tag:e.tagName, cls:e.className, width:e.getBoundingClientRect().width, text:e.textContent.slice(0,100) })));
    assert.equal(await driverPage.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, JSON.stringify(overflow));
    await tab('Заявки водителей');
    await ops.getByRole('button', { name: 'Обновить', exact: true }).click();
    await action('Заправка', 'Принять');
    await tab('Топливо');
    await ops.getByText(/10,25 л/).first().waitFor();
    const final = await fixture.request('GET', `/fleet-operations?responsibilityScopeId=${fixture.ids.scope}`, undefined, admin.accessToken);
    assert.equal(final.body.records.fuel.length, 1); assert.equal(final.body.records.fuel[0].amountCents, 66625);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(output, 'operations-mobile.png'), fullPage: true });
    const staffOverflow = await page.evaluate(() => [...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > innerWidth + 1).slice(0,12).map(e => ({ tag:e.tagName, cls:e.className, width:e.getBoundingClientRect().width, text:e.textContent.slice(0,100) })));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, JSON.stringify(staffOverflow));
    assert.deepEqual(errors, []);
    console.log('PASS driver assignment, mobile fuel report and staff acceptance, isolated costs, responsive rendering, zero browser exceptions');
  } finally { await browser?.close(); await fixture.close(); }
})().catch(e => { console.error(e); process.exit(1); });
