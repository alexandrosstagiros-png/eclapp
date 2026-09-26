'use strict';
// Real browser + disposable database. Every document value below is synthetic.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs/promises');
const { createTestServer } = require('./local-test-server.cjs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const fixture = await createTestServer({ builtFrontend: process.env.PLANNING_BUILT_FRONTEND === 'true' });
  const output = path.resolve(__dirname, '../.local/planning-row-fields-qa');
  let browser;
  try {
    const { ids, adminPool: db } = fixture;
    await db.query('UPDATE access_grants SET personal_data_visible=true WHERE user_id=ANY($1::uuid[])', [[ids.admin, ids.dispatcher]]);
    await db.query("UPDATE users SET role='manager',display_name='Менеджер проверки полей' WHERE id=$1", [ids.dispatcher]);
    const admin = await fixture.devLogin(ids.admin);
    const issued = await fixture.request('POST', `/access/users/${ids.dispatcher}/password`, { phone: '+79990000779' }, admin.accessToken);
    assert.equal(issued.status, 201);
    const login = await fixture.request('POST', '/auth/password', { phone: '+79990000779', password: issued.body.password });
    assert.equal(login.status, 200);
    const token = login.body.accessToken;
    const options = await fixture.request('GET', `/planning/options?responsibilityScopeId=${ids.scope}`, undefined, token);
    assert.equal(options.status, 200);
    const vehicleId = options.body.vehicles[0].id;
    const driverIds = ids.drivers.slice(0, 2);
    const passports = ['SYNTHETIC-PASSPORT-ONE', 'SYNTHETIC-PASSPORT-TWO'];
    for (const [kind, resourceId, data] of [
      ['driver', driverIds[0], { driver_passport: passports[0], driver_address: 'Синтетическая улица 1' }],
      ['driver', driverIds[1], { driver_passport: passports[1], driver_address: 'Синтетическая улица 2' }],
      ['vehicle', vehicleId, { vehicle_registration_certificate: 'SYNTHETIC-STS-ONE', vehicle_brand: 'Тестовый фургон' }],
    ]) await db.query(`INSERT INTO planning_resource_data(legal_entity_id,region_id,project_id,responsibility_scope_id,kind,resource_id,data,source_sha256,source_name,source_row)
      VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,'synthetic-browser-fixture.xlsx',2)`, [ids.legal, ids.region, ids.project, ids.scope, kind, resourceId, JSON.stringify(data), 'a'.repeat(64)]);

    browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    const errors = [], confirmations = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => { confirmations.push(dialog.message()); return dialog.accept(); });
    await page.goto(fixture.origin);
    await page.locator('#login-phone').fill('+79990000779');
    await page.locator('#login-password').fill(issued.body.password);
    await page.getByRole('button', { name: 'Войти', exact: true }).click();
    await page.getByRole('heading', { name: 'Планирование', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Добавить первое назначение', exact: true }).waitFor();
    const businessDate = await page.getByLabel('Дата рейсов', { exact: true }).inputValue();
    const initial = await fixture.request('PUT', '/planning', { businessDate, responsibilityScopeId: ids.scope, templateId: 'general', version: 0,
      rows: driverIds.map((driverId, index) => ({ id: randomUUID(), driverId, vehicleId, departureTime: '08:30', comment: `Синтетическая строка ${index + 1}` })),
    }, token);
    assert.equal(initial.status, 200);
    await page.reload();
    await page.locator('.planning-assignment').first().waitFor();
    await page.getByRole('group', { name: 'Отображение назначений', exact: true }).getByRole('button', { name: 'Таблица', exact: true }).click();
    const table = page.locator('.planning-assignment-table');
    const row = table.locator('tbody tr').first(), secondRow = table.locator('tbody tr').nth(1);
    const modal = page.locator('dialog.planning-row-dialog');
    const loadPlan = async () => {
      const response = await fixture.request('GET', `/planning?date=${businessDate}&responsibilityScopeId=${ids.scope}`, undefined, token);
      assert.equal(response.status, 200);
      return response.body;
    };
    const save = async (container = page) => {
      const pending = page.waitForResponse(response => response.url().endsWith('/planning') && response.request().method() === 'PUT');
      await container.getByRole('button', { name: 'Сохранить план', exact: true }).click();
      assert.equal((await pending).status(), 200);
      await container.getByText('Все изменения сохранены', { exact: true }).waitFor();
    };
    const expectOpen = async () => {
      await modal.waitFor();
      assert.equal(await modal.evaluate(element => element.open && element.matches(':modal')), true, 'Card is a native modal dialog');
    };

    // Inline controls keep their existing behaviour; row surfaces and keyboard open the card.
    await row.getByLabel('Комментарий менеджера, назначение 1', { exact: true }).click();
    assert.equal(await modal.count(), 0);
    await row.getByLabel('Водитель, назначение 1', { exact: true }).selectOption(driverIds[0]);
    assert.equal(await modal.count(), 0);
    await row.getByLabel('Выход подтверждён, назначение 1', { exact: true }).check();
    assert.equal(await modal.count(), 0);
    await row.locator('th').click({ position: { x: 3, y: 3 } });
    await expectOpen();
    await modal.getByRole('button', { name: 'Закрыть карточку', exact: true }).click();
    await row.focus();
    await page.keyboard.press('Enter');
    await expectOpen();
    await modal.getByLabel('Комментарий менеджера', { exact: true }).fill('Комментарий из карточки');
    await modal.getByLabel('Время выхода, назначение 1', { exact: true }).fill('09:45');
    await save(modal);
    await page.keyboard.press('Escape');
    await modal.waitFor({ state: 'detached' });
    assert.equal(await row.evaluate(element => element === document.activeElement), true, 'Escape restores row keyboard focus');
    await page.keyboard.press('Space');
    await expectOpen();
    await modal.getByRole('button', { name: 'Готово', exact: true }).click();
    await page.reload();
    await table.waitFor();
    assert.equal(await row.getByLabel('Комментарий менеджера, назначение 1', { exact: true }).inputValue(), 'Комментарий из карточки');
    assert.equal(await row.getByLabel('Время выхода, назначение 1', { exact: true }).inputValue(), '09:45');
    assert.equal((await loadPlan()).rows[0].comment, 'Комментарий из карточки');

    const addField = async (source, label, preview) => {
      await row.getByRole('button', { name: 'Добавить поле в назначение 1', exact: true }).click();
      await expectOpen();
      await modal.getByLabel('Данные для подстановки', { exact: true }).selectOption(source);
      await modal.getByLabel('Название поля', { exact: true }).fill(label);
      assert.ok((await modal.locator('.planning-extra-preview').textContent()).includes(preview));
      await modal.getByRole('button', { name: 'Добавить поле', exact: true }).click();
      await modal.waitFor({ state: 'detached' });
    };
    await addField('driver_passport', 'Паспорт для клиента', passports[0]);
    await addField('vehicle_registration_certificate', 'СТС для клиента', 'SYNTHETIC-STS-ONE');
    const passport = row.getByLabel('Паспорт для клиента, дополнительное поле, назначение 1', { exact: true });
    const certificate = row.getByLabel('СТС для клиента, дополнительное поле, назначение 1', { exact: true });
    assert.equal(await passport.inputValue(), passports[0]);
    assert.equal(await certificate.inputValue(), 'SYNTHETIC-STS-ONE');
    assert.equal(await secondRow.locator('.planning-extra-cell').count(), 0, 'Only the chosen row acquires additional fields');
    await passport.fill('SYNTHETIC-MANUAL-OVERRIDE');
    assert.equal(await modal.count(), 0, 'Typing an additional value does not open the card');
    await save();
    assert.equal((await loadPlan()).rows[0].extraFields[0].value, 'SYNTHETIC-MANUAL-OVERRIDE');
    await page.reload();
    await table.waitFor();
    assert.equal(await passport.inputValue(), 'SYNTHETIC-MANUAL-OVERRIDE');
    await row.getByRole('button', { name: 'Вернуть подстановку: Паспорт для клиента, дополнительное поле, назначение 1', exact: true }).click();
    assert.equal(await passport.inputValue(), passports[0]);
    await passport.fill('SYNTHETIC-OLD-DRIVER-OVERRIDE');
    await row.getByLabel('Водитель, назначение 1', { exact: true }).selectOption(driverIds[1]);
    assert.ok(confirmations.some(message => message.startsWith('Сменить водителя?')));
    assert.equal(await passport.inputValue(), passports[1], 'Changing driver clears the previous driver override and keeps its binding');
    assert.equal(await certificate.inputValue(), 'SYNTHETIC-STS-ONE');
    await save();
    const saved = await loadPlan();
    assert.equal(saved.rows[0].extraFields.length, 2);
    assert.equal(Object.hasOwn(saved.rows[0].extraFields[0], 'value'), false);
    assert.deepEqual(saved.rows[1].extraFields, []);

    // The preview/export extends its headers, but the adjacent assignment stays blank.
    await page.getByRole('button', { name: 'Форма клиента', exact: true }).click();
    const preview = page.locator('.planning-client-table').first();
    await preview.waitFor();
    const headers = await preview.locator('thead th').allTextContents();
    for (const [label, value] of [['Паспорт для клиента', passports[1]], ['СТС для клиента', 'SYNTHETIC-STS-ONE']]) {
      const index = headers.indexOf(label);
      assert.ok(index >= 0);
      assert.equal(await preview.locator('tbody tr').first().locator('td').nth(index).textContent(), value);
      assert.equal(await preview.locator('tbody tr').nth(1).locator('td').nth(index).textContent(), '—');
    }
    const downloaded = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Скачать CSV', exact: true }).first().click();
    const stream = await (await downloaded).createReadStream();
    let csv = ''; for await (const chunk of stream) csv += chunk.toString('utf8');
    assert.equal(csv.split(passports[1]).length - 1, 1);
    assert.equal(csv.split('SYNTHETIC-STS-ONE').length - 1, 1);
    assert.ok(csv.split('\r\n')[2].endsWith(';"";""'), 'CSV preserves empty extra cells for the other row');
    await preview.locator('tbody tr').first().locator('td').first().click();
    await expectOpen();
    assert.equal(await modal.getByLabel('Комментарий менеджера', { exact: true }).inputValue(), 'Комментарий из карточки');
    await page.keyboard.press('Escape');
    await modal.waitFor({ state: 'detached' });

    await page.getByRole('button', { name: 'Назначения', exact: true }).click();
    await fs.mkdir(output, { recursive: true });
    await page.screenshot({ path: path.join(output, 'desktop.png'), fullPage: true });
    await table.locator('tbody tr').first().locator('.planning-table-extras').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, 'desktop-row-fields.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    const openButton = row.getByRole('button', { name: 'Редактировать назначение 1', exact: true });
    await openButton.click();
    await expectOpen();
    const geometry = await modal.evaluate(element => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: innerWidth, height: innerHeight,
        scrollWidth: element.scrollWidth, clientWidth: element.clientWidth };
    });
    assert.ok(geometry.left >= 0 && geometry.right <= geometry.width && geometry.top >= 0 && geometry.bottom <= geometry.height, JSON.stringify(geometry));
    assert.ok(geometry.scrollWidth <= geometry.clientWidth, 'Mobile card has no horizontal overflow');
    await page.screenshot({ path: path.join(output, 'mobile-card.png') });
    await modal.locator('.planning-extra-section').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, 'mobile-row-fields.png') });
    await page.keyboard.press('Escape');
    await modal.waitFor({ state: 'detached' });
    assert.equal(await openButton.evaluate(element => element === document.activeElement), true, 'Escape restores the invoking button focus');
    assert.equal(await page.evaluate(() => document.body.style.overflow), '');
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ rowClickAndKeyboard: 'passed', nativeDialog: 'passed', inlineControls: 'passed', cardPersistence: 'passed', isolatedRowFields: 'passed', linkedDriverAndVehicle: 'passed', overrideAndReset: 'passed', driverSwitch: 'passed', previewAndCsvIsolation: 'passed', mobileDialog: 'passed', focusRestoration: 'passed', javascriptErrors: 0, screenshots: output }));
  } finally {
    if (browser) await browser.close();
    await fixture.close();
  }
})().catch(error => { console.error(error.stack); process.exit(1); });
