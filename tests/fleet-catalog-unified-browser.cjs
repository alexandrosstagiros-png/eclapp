'use strict';
// New catalog entries follow a service vehicle without exposing storage scopes.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createTestServer } = require('./local-test-server.cjs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const fixture = await createTestServer();
  let browser;
  try {
    const { ids, adminPool: db } = fixture;
    const secondary = randomUUID();
    await db.query('UPDATE responsibility_scopes SET name=$2 WHERE id=$1', [ids.scope, 'AAA primary']);
    await db.query('UPDATE access_grants SET finance_visible=true WHERE user_id=$1', [ids.admin]);
    await db.query('INSERT INTO responsibility_scopes(id,project_id,name) VALUES($1,$2,$3)', [secondary, ids.project, 'ZZZ secondary']);
    await db.query('INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id,finance_visible) VALUES($1,$2,$3,$4,$5,true)', [ids.admin, ids.legal, ids.region, ids.project, secondary]);
    const session = await fixture.devLogin(ids.admin);
    const api = async (method, path, body) => {
      const response = await fixture.request(method, path, body, session.accessToken);
      assert.ok(response.status >= 200 && response.status < 300, JSON.stringify(response));
      return response.body;
    };
    browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    await context.addInitScript(value => sessionStorage.setItem('ecl.session.v2', JSON.stringify({ session: value })), { ...session, rememberedDevice: false });
    const page = await context.newPage(); page.setDefaultTimeout(20000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => dialog.accept());
    const ops = page.locator('.fleet-ops').first();
    const openWorkspace = async () => {
      await page.goto(`${fixture.origin}/?section=fleet`);
      await page.getByRole('button', { name: 'Заказ-наряды', exact: true }).first().click();
      await ops.getByRole('button', { name: 'Добавить', exact: true }).waitFor();
    };
    const tab = async name => {
      await ops.getByRole('button', { name, exact: true }).first().click();
      await ops.getByRole('heading', { name, exact: true }).waitFor();
    };
    const add = async (name, fill, expectedScope) => {
      await tab(name); await ops.getByRole('button', { name: 'Добавить', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await fill(dialog);
      const pending = page.waitForResponse(response => response.url().includes('/fleet-operations/') && response.request().method() === 'PUT');
      await dialog.getByRole('button', { name: 'Сохранить', exact: true }).click();
      const response = await pending;
      assert.equal(response.status(), 200, await response.text());
      assert.equal(response.request().postDataJSON().responsibilityScopeId, expectedScope);
      const record = await response.json();
      await dialog.waitFor({ state: 'hidden' });
      await ops.getByRole('button', { name: 'Добавить', exact: true }).waitFor({ state: 'visible' });
      return record;
    };
    await openWorkspace();
    await add('Подрядчики', async dialog => {
      assert.equal(await dialog.getByLabel('Автомобиль для обслуживания', { exact: true }).count(), 0);
      await dialog.getByLabel('Название', { exact: false }).fill('Подрядчик до первой машины');
    }, ids.scope);
    const firstVehicle = await api('PUT', '/fleet-operations/vehicles', { id: randomUUID(), responsibilityScopeId: ids.scope, version: 0, status: 'active', plate: 'А111АА777' });
    const vehicle = await api('PUT', '/fleet-operations/vehicles', { id: randomUUID(), responsibilityScopeId: secondary, version: 0, status: 'active', plate: 'В222ВВ777' });
    await openWorkspace();
    const catalogFill = (field, value) => async dialog => {
      await dialog.getByLabel('Автомобиль для обслуживания', { exact: true }).selectOption(vehicle.id);
      await dialog.getByLabel(field, { exact: false }).fill(value);
    };
    const vendor = await add('Подрядчики', catalogFill('Название', 'Сервис второй машины'), secondary);
    const part = await add('Номенклатура', catalogFill('Наименование', 'Фильтр второй машины'), secondary);
    const warehouse = await add('Склады', catalogFill('Название склада', 'Склад второй машины'), secondary);
    await tab('Склад');
    await ops.getByRole('button', { name: 'Начальный остаток', exact: true }).click();
    let dialog = page.getByRole('dialog');
    await dialog.getByLabel('Запчасть', { exact: true }).selectOption(part.id);
    await dialog.getByLabel('Склад', { exact: true }).selectOption(warehouse.id);
    await dialog.getByLabel('Количество', { exact: true }).fill('2');
    await dialog.getByLabel('Стоимость единицы', { exact: false }).fill('100');
    await dialog.getByLabel('Основание / документ', { exact: true }).fill('Проверка рабочего каталога');
    await dialog.getByRole('button', { name: 'Записать остаток', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    const order = await add('Заказ-наряды', async editor => {
      await editor.getByLabel('Номер заказ-наряда', { exact: true }).fill('РЕМОНТ-ВТОРОЙ-МАШИНЫ');
      await editor.getByLabel('Автомобиль', { exact: true }).selectOption(vehicle.id);
      await editor.getByLabel('Выполнение', { exact: true }).selectOption('contractor');
      await editor.getByLabel('Подрядчик', { exact: true }).selectOption(vendor.id);
      await editor.getByRole('button', { name: 'Добавить позицию', exact: true }).click();
      await editor.getByLabel('Тип позиции', { exact: true }).selectOption('запчасть');
      await editor.getByLabel('Номенклатура', { exact: true }).selectOption(part.id);
      await editor.getByLabel('Источник запчасти', { exact: true }).selectOption('warehouse');
      await editor.getByLabel('Склад списания', { exact: true }).selectOption(warehouse.id);
    }, secondary);
    const row = ops.getByRole('row').filter({ hasText: order.number });
    await row.getByRole('button', { name: 'Завершить', exact: true }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Завершить', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    const state = await api('GET', `/fleet-operations?responsibilityScopeId=${secondary}`);
    assert.equal(state.records.orders[0].status, 'completed');
    assert.equal(state.records.orders[0].contractorId, vendor.id);
    assert.equal(state.stock[0].quantity, 1);
    const firstState = await api('GET', `/fleet-operations?responsibilityScopeId=${ids.scope}`);
    assert.equal(firstState.records.vehicles[0].id, firstVehicle.id);
    assert.equal(firstState.records.parts.length, 0);
    assert.equal(firstState.stock.length, 0);
    assert.equal(await page.getByLabel('Проект', { exact: true }).count(), 0);
    assert.deepEqual(errors, []);
    console.log('PASS catalogs can be created before vehicles and for a vehicle in any accessible scope; repair uses its vendor and stock without crossing scopes');
  } finally { if (browser) await browser.close(); await fixture.close(); }
})().catch(error => { console.error(error.stack); process.exit(1); });
