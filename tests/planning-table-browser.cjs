'use strict';
// Real browser, disposable PostgreSQL and synthetic manager credentials only.
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const { createTestServer } = require('./local-test-server.cjs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const fixture = await createTestServer({ builtFrontend: process.env.PLANNING_BUILT_FRONTEND === 'true' });
  const output = path.resolve(__dirname, '../.local/planning-table-qa');
  let browser;
  try {
    await fixture.adminPool.query('UPDATE access_grants SET personal_data_visible=true WHERE user_id=ANY($1::uuid[])', [[fixture.ids.admin, fixture.ids.dispatcher]]);
    await fixture.adminPool.query("UPDATE users SET role='manager',display_name='Менеджер табличного планирования' WHERE id=$1", [fixture.ids.dispatcher]);
    await fixture.adminPool.query("UPDATE projects SET name='APPIA Данон' WHERE id=$1", [fixture.ids.project]);
    const admin = await fixture.devLogin(fixture.ids.admin);
    const issued = await fixture.request('POST', `/access/users/${fixture.ids.dispatcher}/password`, { phone: '+79990000778' }, admin.accessToken);
    assert.equal(issued.status, 201);
    const login = await fixture.request('POST', '/auth/password', { phone: '+79990000778', password: issued.body.password });
    assert.equal(login.status, 200);
    const token = login.body.accessToken;
    const options = await fixture.request('GET', `/planning/options?responsibilityScopeId=${fixture.ids.scope}`, undefined, token);
    assert.equal(options.status, 200);
    browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => dialog.accept());
    await page.goto(fixture.origin);
    await page.locator('#login-phone').fill('+79990000778');
    await page.locator('#login-password').fill(issued.body.password);
    await page.getByRole('button', { name: 'Войти', exact: true }).click();
    await page.getByRole('heading', { name: 'Планирование', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Добавить первое назначение', exact: true }).click();
    const card = page.locator('.planning-assignment').first();
    await card.getByLabel('Водитель', { exact: true }).selectOption(fixture.ids.drivers[0]);
    await card.getByLabel('Машина', { exact: true }).selectOption(options.body.vehicles[0].id);
    await card.getByLabel('Время выхода, назначение 1', { exact: true }).fill('05:15');
    await card.getByLabel('Комментарий менеджера', { exact: true }).fill('Исходное назначение');
    const businessDate = await page.getByLabel('Дата рейсов', { exact: true }).inputValue();
    const saveButton = page.getByRole('button', { name: 'Сохранить план', exact: true });
    const savePlan = async () => {
      const response = page.waitForResponse(result => result.url().endsWith('/planning') && result.request().method() === 'PUT');
      await saveButton.click();
      assert.equal((await response).status(), 200);
      await page.getByText('Все изменения сохранены', { exact: true }).waitFor();
    };
    await savePlan();

    const display = page.getByRole('group', { name: 'Отображение назначений', exact: true });
    const cardsButton = display.getByRole('button', { name: 'Карточки', exact: true });
    const tableButton = display.getByRole('button', { name: 'Таблица', exact: true });
    const table = page.locator('.planning-assignment-table');
    const firstRow = table.locator('tbody tr').first();
    const columnsButton = page.getByRole('button', { name: 'Колонки', exact: true });
    const columnSettings = page.getByRole('region', { name: 'Настройка колонок', exact: true });
    const headerNames = async () => (await table.getByRole('columnheader').allTextContents()).map(text => text.trim());
    await tableButton.click();
    await table.waitFor();
    assert.equal(await tableButton.getAttribute('aria-pressed'), 'true');
    assert.equal(await cardsButton.getAttribute('aria-pressed'), 'false');
    assert.equal(await page.locator('.planning-assignment').count(), 0);
    assert.equal(await table.locator('tbody tr').count(), 1);
    const defaultHeaders = await headerNames();
    for (const label of ['Водитель', 'Машина', 'Время выхода', 'Статус', 'Рейсов', 'Выход подтверждён', 'Комментарий менеджера']) {
      assert.ok(defaultHeaders.includes(label), `Default table includes ${label}`);
    }
    assert.equal(await saveButton.isDisabled(), true, 'Changing layout does not change the plan');

    await columnsButton.click();
    const requiredColumn = columnSettings.getByRole('checkbox', { name: 'Водитель', exact: true });
    assert.equal(await requiredColumn.isChecked(), true);
    assert.equal(await requiredColumn.isDisabled(), true);
    await columnSettings.getByRole('checkbox', { name: 'Выход подтверждён', exact: true }).uncheck();
    await columnSettings.getByRole('checkbox', { name: 'Заявка создана', exact: true }).check();
    await columnSettings.getByRole('checkbox', { name: 'Номер телефона Водителя', exact: true }).check();
    assert.equal(await table.getByRole('columnheader', { name: 'Выход подтверждён', exact: true }).count(), 0);
    await table.getByRole('columnheader', { name: 'Заявка создана', exact: true }).waitFor();
    await table.getByRole('columnheader', { name: 'Номер телефона Водителя', exact: true }).waitFor();
    assert.equal(await saveButton.isDisabled(), true, 'Column visibility does not dirty the plan');
    await columnSettings.getByRole('button', { name: 'Готово', exact: true }).focus();
    await page.keyboard.press('Escape');
    await columnSettings.waitFor({ state: 'hidden' });
    assert.equal(await columnsButton.evaluate(element => element === document.activeElement), true, 'Closing column settings restores focus');
    const customizedHeaders = await headerNames();
    await page.reload();
    await table.waitFor();
    assert.equal(await tableButton.getAttribute('aria-pressed'), 'true');
    assert.deepEqual(await headerNames(), customizedHeaders, 'Customized columns survive reload');
    assert.equal(await saveButton.isDisabled(), true);
    const storageKey = `office:planning:view:v1:${encodeURIComponent(fixture.ids.dispatcher)}`;
    const stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), storageKey);
    assert.equal(stored.version, 1);
    assert.equal(stored.layout, 'table');
    assert.ok(stored.columns.includes('client:appia:appia_ap'));
    assert.equal(stored.columns.includes('confirmed'), false);

    await firstRow.getByLabel('Комментарий менеджера, назначение 1', { exact: true }).fill('Черновик из таблицы');
    await firstRow.getByLabel('Время выхода, назначение 1', { exact: true }).fill('06:45');
    await firstRow.getByLabel('Заявка создана, назначение 1', { exact: true }).check();
    await firstRow.getByLabel('Номер телефона Водителя, назначение 1', { exact: true }).fill('+79990000001');
    await cardsButton.click();
    await card.waitFor();
    assert.equal(await card.getByLabel('Комментарий менеджера', { exact: true }).inputValue(), 'Черновик из таблицы');
    assert.equal(await card.getByLabel('Время выхода, назначение 1', { exact: true }).inputValue(), '06:45');
    assert.equal(await card.getByLabel('Заявка создана', { exact: true }).isChecked(), true);
    await page.getByText('Есть несохранённые изменения', { exact: true }).waitFor();
    await tableButton.click();
    assert.equal(await firstRow.getByLabel('Комментарий менеджера, назначение 1', { exact: true }).inputValue(), 'Черновик из таблицы');
    assert.equal(await firstRow.getByLabel('Номер телефона Водителя, назначение 1', { exact: true }).inputValue(), '+79990000001');
    await savePlan();
    const saved = await fixture.request('GET', `/planning?date=${businessDate}&responsibilityScopeId=${fixture.ids.scope}`, undefined, token);
    assert.equal(saved.status, 200);
    assert.equal(saved.body.rows.length, 1);
    assert.equal(saved.body.rows[0].comment, 'Черновик из таблицы');
    assert.equal(saved.body.rows[0].departureTime, '06:45');
    assert.equal(saved.body.rows[0].requestCreated, true);
    assert.equal(saved.body.rows[0].clientFields.appia_ap, '+79990000001');
    await page.reload();
    await table.waitFor();
    assert.equal(await firstRow.getByLabel('Комментарий менеджера, назначение 1', { exact: true }).inputValue(), 'Черновик из таблицы');
    assert.equal(await firstRow.getByLabel('Номер телефона Водителя, назначение 1', { exact: true }).inputValue(), '+79990000001');
    assert.deepEqual(await headerNames(), customizedHeaders);

    const search = page.getByLabel('Поиск назначений', { exact: true });
    await search.fill('Черновик из таблицы');
    assert.equal(await table.locator('tbody tr').count(), 1);
    await search.fill('Несуществующее назначение');
    await page.getByRole('heading', { name: 'Назначения не найдены', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Очистить поиск', exact: true }).click();
    await table.waitFor();
    await page.getByRole('button', { name: '+ Добавить назначение', exact: true }).click();
    assert.equal(await tableButton.getAttribute('aria-pressed'), 'true', 'Adding an assignment keeps table layout');
    assert.equal(await table.locator('tbody tr').count(), 2);
    await table.getByRole('button', { name: 'Удалить назначение 2', exact: true }).click();
    assert.equal(await table.locator('tbody tr').count(), 1);
    assert.equal(await tableButton.getAttribute('aria-pressed'), 'true', 'Deleting an assignment keeps table layout');

    await columnsButton.click();
    await columnSettings.getByRole('button', { name: 'По умолчанию', exact: true }).click();
    assert.deepEqual(await headerNames(), defaultHeaders, 'Reset restores all default columns');
    await columnSettings.getByRole('button', { name: 'Готово', exact: true }).click();
    assert.equal(await saveButton.isDisabled(), true);
    await fs.mkdir(output, { recursive: true });
    await page.locator('.planning-assignment-table-wrap .planning-table-scroll').evaluate(element => { element.scrollLeft = 0; });
    await page.screenshot({ path: path.join(output, 'desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(output, 'mobile.png'), fullPage: true });
    const mobileWidth = await page.evaluate(() => ({
      viewport: innerWidth, page: document.documentElement.scrollWidth,
      overflow: [...document.querySelectorAll('body *')]
        .filter(element => !element.closest('.mobile-navigation') && (!element.closest('.planning-table-scroll') || element.matches('.visually-hidden')))
        .map(element => ({ tag: element.tagName, className: element.className, text: element.textContent.slice(0, 80), parent: element.parentElement?.className, grandparent: element.parentElement?.parentElement?.className, left: element.getBoundingClientRect().left, right: element.getBoundingClientRect().right, position: getComputedStyle(element).position, width: getComputedStyle(element).width, detailsOpen: element.closest('details')?.open }))
        .filter(element => element.right > innerWidth || element.left < 0).slice(0, 15),
    }));
    if (mobileWidth.page > mobileWidth.viewport) console.error('Mobile overflow:', JSON.stringify(mobileWidth));
    assert.ok(mobileWidth.page <= mobileWidth.viewport, `Table overflows inside its scroll container only: ${JSON.stringify(mobileWidth)}`);
    await columnsButton.click();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Column settings fit the mobile viewport');
    await page.screenshot({ path: path.join(output, 'mobile-columns.png'), fullPage: true });

    await page.evaluate(key => localStorage.setItem(key, '{invalid-json'), storageKey);
    await page.reload();
    await card.waitFor();
    assert.equal(await cardsButton.getAttribute('aria-pressed'), 'true', 'Corrupted preferences fall back to cards');
    await tableButton.click();
    assert.deepEqual(await headerNames(), defaultHeaders, 'Corrupted preferences restore default columns');
    assert.equal(await saveButton.isDisabled(), true);
    await page.addInitScript(() => {
      const write = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key.startsWith('office:planning:view:')) throw new DOMException('Test storage unavailable', 'SecurityError');
        return write.call(this, key, value);
      };
    });
    await page.reload();
    await table.waitFor();
    await columnsButton.click();
    await columnSettings.getByText('Настройки действуют до закрытия раздела: браузер не разрешает их сохранить.', { exact: true }).waitFor();
    await columnSettings.getByRole('checkbox', { name: 'Прибыл', exact: true }).check();
    await table.getByRole('columnheader', { name: 'Прибыл', exact: true }).waitFor();
    assert.equal(await saveButton.isDisabled(), true, 'Storage failures do not block the plan or dirty it');
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ tableColumns: 'passed', preferenceReload: 'passed', preferencesDoNotDirtyPlan: 'passed', draftSwitching: 'passed', editableCells: 'passed', clientFieldSave: 'passed', search: 'passed', tableAddDelete: 'passed', columnReset: 'passed', malformedPreferences: 'passed', unavailableStorage: 'passed', mobileOverflow: false, javascriptErrors: 0, screenshots: output }));
  } finally {
    if (browser) await browser.close();
    await fixture.close();
  }
})().catch(error => { console.error(error.stack); process.exit(1); });
