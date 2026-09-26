'use strict';
// Real API, isolated PostgreSQL and synthetic staff/assignments only.
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const { randomUUID } = require('node:crypto');
const { createTestServer } = require('./local-test-server.cjs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const f = await createTestServer({ builtFrontend: process.env.PLANNING_BUILT_FRONTEND === 'true' });
  let browser, page;
  const out = path.resolve(__dirname, '../.local/planning-calendar-qa');
  try {
    await fs.mkdir(out, { recursive: true });
    const dates = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08'];
    await f.adminPool.query('UPDATE access_grants SET personal_data_visible=true WHERE user_id=ANY($1::uuid[])', [[f.ids.admin, f.ids.dispatcher]]);
    await f.adminPool.query("UPDATE users SET role='manager',display_name='Менеджер календаря' WHERE id=$1", [f.ids.dispatcher]);
    const admin = await f.devLogin(f.ids.admin), phone = '+79990000777';
    const issued = await f.request('POST', `/access/users/${f.ids.dispatcher}/password`, { phone }, admin.accessToken);
    assert.equal(issued.status, 201);
    const login = await f.request('POST', '/auth/password', { phone, password: issued.body.password });
    assert.equal(login.status, 200);
    const token = login.body.accessToken;
    const options = await f.request('GET', `/planning/options?responsibilityScopeId=${f.ids.scope}`, undefined, token);
    assert.equal(options.status, 200);
    const [driverA, driverB] = options.body.drivers;
    const vehicle = options.body.vehicles[0];
    assert.ok(driverA && driverB && vehicle);
    const templateId = randomUUID();
    const column = (key, label, type, source, owner = 'assignment') => ({ key, label, type, source, owner, required: false, defaultValue: '', hint: '' });
    const definition = label => ({ label, kind: 'table', sections: [{ id: 'main', label: 'Заявка', columns: [
      column('route', 'Маршрут', 'text', 'manual'), column('load', 'Погрузка', 'date', 'loading_date'),
      column('passport_day', 'Дата выдачи', 'date', 'document_issue_date', 'driver'),
      column('driver_note', 'Допуск водителя', 'text', 'manual', 'driver'),
      column('vehicle_note', 'Допуск машины', 'text', 'manual', 'vehicle'),
    ] }] });
    const form1 = await f.request('PUT', '/planning/templates', { responsibilityScopeId: f.ids.scope, id: templateId, version: 0, definition: definition('Клиент · старая форма'), makeDefault: false }, token);
    assert.equal(form1.status, 200, JSON.stringify(form1.body));
    const form2 = await f.request('PUT', '/planning/templates', { responsibilityScopeId: f.ids.scope, id: templateId, version: 1, definition: definition('Клиент · новая форма'), makeDefault: false }, token);
    assert.equal(form2.status, 200);
    const row = (driver, comment) => ({ id: randomUUID(), driverId: driver.id, vehicleId: vehicle.id, departureTime: '05:15', status: 'work', confirmed: true, requestCreated: true, arrived: true, tripCount: 2, comment,
      clientFields: { route: 'Склад А — магазин Б', load: dates[0], passport_day: '2020-01-01', driver_note: 'Водитель А', vehicle_note: 'Машина А' } });
    const seeded = await f.request('PUT', '/planning', { businessDate: dates[0], responsibilityScopeId: f.ids.scope, templateId, templateVersion: 1, rows: [row(driverA, 'Первый рейс для календаря'), row(driverB, 'Второй рейс для календаря')], version: 0 }, token);
    assert.equal(seeded.status, 200, JSON.stringify(seeded.body));
    const read = async date => {
      const result = await f.request('GET', `/planning?date=${date}&responsibilityScopeId=${f.ids.scope}`, undefined, token);
      assert.equal(result.status, 200); return result.body;
    };
    browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => dialog.accept());
    await page.goto(f.origin);
    await page.locator('#login-phone').fill(phone);
    await page.locator('#login-password').fill(issued.body.password);
    await page.getByRole('button', { name: 'Войти', exact: true }).click();
    await page.getByLabel('Дата рейсов', { exact: true }).waitFor();
    await page.getByLabel('Дата рейсов', { exact: true }).fill(dates[0]);
    await page.locator('.planning-assignment').first().waitFor();
    await page.getByRole('button', { name: 'Календарь', exact: true }).click();
    const calendar = page.getByRole('region', { name: 'Календарь планирования', exact: true });
    await calendar.getByRole('grid', { name: 'Рейсы по дням', exact: true }).waitFor();
    const cell = (r, c) => calendar.locator(`[data-cal-row="${r}"][data-cal-col="${c}"]`);
    const aIndex = await calendar.locator('.planning-cal-lane').allTextContents().then(labels => labels.indexOf(driverA.name));
    const bIndex = await calendar.locator('.planning-cal-lane').allTextContents().then(labels => labels.indexOf(driverB.name));
    assert.ok(aIndex >= 0 && bIndex >= 0);
    await cell(aIndex, 0).hover();
    const tooltip = page.getByRole('tooltip');
    await tooltip.waitFor();
    assert.ok((await tooltip.innerText()).includes('Первый рейс для календаря'));
    assert.ok((await tooltip.innerText()).includes(vehicle.label));
    await page.screenshot({ path: path.join(out, 'desktop-hover.png'), fullPage: true });
    const fill = async (r1, c1, r2, c2) => {
      await cell(r1, c1).click();
      const handle = calendar.getByRole('button', { name: 'Протянуть выделенные ячейки', exact: true });
      const from = await handle.boundingBox(), to = await cell(r2, c2).boundingBox();
      assert.ok(from && to);
      await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
      await page.mouse.down();
      await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
      await page.mouse.up();
      await calendar.getByRole('region', { name: 'Проверка копирования', exact: true }).waitFor();
      await calendar.getByRole('button', { name: 'Применить копирование', exact: true }).click();
    };
    await fill(aIndex, 0, aIndex, 2);
    assert.equal(await cell(aIndex, 1).locator('.planning-cal-trip').count(), 1);
    assert.equal(await cell(aIndex, 2).locator('.planning-cal-trip').count(), 1);
    await fill(aIndex, 1, bIndex, 1);
    assert.equal(await cell(bIndex, 1).locator('.planning-cal-trip').count(), 1);
    assert.ok((await cell(bIndex, 1).innerText()).includes('Без машины'));
    await cell(aIndex, 0).click();
    await calendar.getByRole('button', { name: 'Копировать день', exact: true }).click();
    await calendar.getByRole('button', { name: `Копировать на ${dates[3]}`, exact: true }).click();
    await calendar.getByRole('button', { name: 'Проверить копирование · 1 дн.', exact: true }).click();
    await calendar.getByRole('button', { name: 'Применить копирование', exact: true }).click();
    assert.equal(await cell(aIndex, 3).locator('.planning-cal-trip').count(), 1);
    assert.equal(await cell(bIndex, 3).locator('.planning-cal-trip').count(), 1);
    const details = calendar.getByRole('complementary', { name: 'Детали рейсов', exact: true });
    // Complete the paired vehicle deliberately after moving the assignment to another driver.
    await cell(bIndex, 1).click();
    await details.getByRole('button', { name: 'Изменить рейс', exact: true }).click();
    await details.getByLabel('Машина рейса', { exact: true }).selectOption(vehicle.id);
    await details.getByLabel('Время выхода', { exact: true }).fill('06:45');
    await details.getByRole('button', { name: 'Применить изменения рейса', exact: true }).click();
    assert.ok((await cell(bIndex, 1).innerText()).includes(vehicle.label));
    await cell(aIndex, 1).click();
    await details.getByRole('button', { name: 'Изменить рейс', exact: true }).click();
    await details.getByLabel('Время выхода', { exact: true }).fill('07:30');
    await details.getByLabel('Комментарий', { exact: true }).fill('Изменено прямо в календаре');
    assert.equal(await calendar.getByRole('button', { name: 'Сохранить календарь', exact: true }).isDisabled(), true);
    await details.getByRole('button', { name: 'Применить изменения рейса', exact: true }).click();
    assert.ok((await cell(aIndex, 1).innerText()).includes('07:30'));
    const save = async () => {
      const ready = page.waitForResponse(response => response.request().method() === 'PUT' && response.url().endsWith('/api/v1/planning/calendar'));
      await calendar.getByRole('button', { name: 'Сохранить календарь', exact: true }).click();
      return ready;
    };
    const saved = await save();
    assert.equal(saved.status(), 200, JSON.stringify(await saved.json()));
    const tuesday = await read(dates[1]);
    assert.equal(tuesday.rows.length, 2); assert.equal(tuesday.templateId, templateId); assert.equal(tuesday.templateVersion, 1);
    const sameDriver = tuesday.rows.find(item => item.driverId === driverA.id), changedDriver = tuesday.rows.find(item => item.driverId === driverB.id);
    assert.equal(sameDriver.departureTime, '07:30'); assert.equal(sameDriver.comment, 'Изменено прямо в календаре');
    assert.equal(sameDriver.clientFields.load, dates[1]); assert.equal(sameDriver.clientFields.passport_day, '2020-01-01');
    assert.deepEqual([sameDriver.confirmed, sameDriver.requestCreated, sameDriver.arrived], [false, false, false]);
    assert.equal(changedDriver.vehicleId, vehicle.id); assert.equal(changedDriver.departureTime, '06:45');
    assert.deepEqual(changedDriver.clientFields, { route: 'Склад А — магазин Б', load: dates[1] });
    assert.equal((await read(dates[3])).rows.length, 2); assert.equal((await read(dates[3])).templateVersion, 1);
    assert.deepEqual(await read(dates[0]), seeded.body, 'the source day must remain unchanged');
    await calendar.getByRole('button', { name: 'Обновить', exact: true }).click();
    await cell(aIndex, 1).getByText('07:30', { exact: true }).waitFor();
    await cell(aIndex, 1).click();
    await page.screenshot({ path: path.join(out, 'desktop-calendar.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'calendar must contain wide-grid scrolling at 390px');
    await page.screenshot({ path: path.join(out, 'mobile-calendar.png'), fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await calendar.getByLabel('Строки', { exact: true }).selectOption('vehicle');
    await calendar.getByRole('columnheader', { name: 'Машина / день', exact: true }).waitFor();
    assert.ok((await calendar.innerText()).includes('Без машины'));
    await calendar.getByLabel('Строки', { exact: true }).selectOption('driver');
    await calendar.getByRole('button', { name: 'Месяц', exact: true }).click();
    await calendar.locator('[data-cal-col="30"]').first().waitFor();
    await calendar.getByRole('button', { name: 'Неделя', exact: true }).click();
    await cell(aIndex, 1).getByText('07:30', { exact: true }).waitFor();
    // Keyboard clipboard uses the same preview/undo transaction as pointer fill.
    await cell(aIndex, 2).click();
    await cell(aIndex, 2).press('Control+c');
    await cell(aIndex, 2).press('ArrowRight');
    await cell(aIndex, 3).press('ArrowRight');
    await cell(aIndex, 4).press('Control+v');
    await calendar.getByRole('region', { name: 'Проверка копирования', exact: true }).waitFor();
    await calendar.getByRole('button', { name: 'Применить копирование', exact: true }).click();
    assert.equal(await cell(aIndex, 4).locator('.planning-cal-trip').count(), 1);
    await calendar.getByRole('button', { name: 'Отменить действие', exact: true }).click();
    assert.equal(await cell(aIndex, 4).locator('.planning-cal-trip').count(), 0);
    assert.equal(await calendar.getByRole('button', { name: 'Сохранить календарь', exact: true }).isDisabled(), true);
    // Stale browser edits must remain visible after an atomic version conflict.
    const concurrent = await read(dates[1]);
    const concurrentSave = await f.request('PUT', '/planning', { businessDate: dates[1], responsibilityScopeId: f.ids.scope, templateId: concurrent.templateId, templateVersion: concurrent.templateVersion, version: concurrent.version, rows: concurrent.rows.map(item => ({ ...item, comment: 'Другой менеджер сохранил' })) }, token);
    assert.equal(concurrentSave.status, 200);
    await cell(aIndex, 1).click();
    await details.getByRole('button', { name: 'Изменить рейс', exact: true }).click();
    await details.getByLabel('Комментарий', { exact: true }).fill('Мой несохранённый вариант');
    await details.getByRole('button', { name: 'Применить изменения рейса', exact: true }).click();
    assert.equal((await save()).status(), 409);
    await calendar.getByText(/Другой менеджер уже изменил один из дней/).waitFor();
    assert.ok((await details.innerText()).includes('Мой несохранённый вариант'));
    // Revocation clears detailed plans and disables any further manipulation.
    await f.adminPool.query('UPDATE access_grants SET personal_data_visible=false WHERE user_id=$1', [f.ids.dispatcher]);
    await calendar.getByRole('button', { name: 'Обновить', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'У вас нет доступа к этому плану.' }).waitFor();
    assert.equal(await page.locator('.planning-cal-trip').count(), 0);
    assert.equal(await page.getByRole('tooltip').count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Сохранить календарь', exact: true }).count(), 0);
    assert.equal(await page.getByText('Мой несохранённый вариант', { exact: true }).count(), 0);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ managerLogin: 'passed', hoverDetails: 'passed', pointerFillBothAxes: 'passed', historicalSourceForm: 'passed', dayCopy: 'passed', inlineEdit: 'passed', atomicSave: 'passed', persistedReload: 'passed', mobileOverflow: false, monthAndVehicleViews: 'passed', keyboardCopyPasteUndo: 'passed', conflictRetainsDraft: 'passed', revokedAccessClearsData: 'passed', javascriptErrors: 0, builtFrontend: process.env.PLANNING_BUILT_FRONTEND === 'true', screenshots: out }));
  } catch (error) {
    if (page) await page.screenshot({ path: path.join(out, 'failure.png'), fullPage: true }).catch(() => {});
    throw error;
  } finally { if (browser) await browser.close(); await f.close(); }
})().catch(error => { console.error(error.stack); process.exit(1); });
