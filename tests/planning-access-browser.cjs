'use strict';
// Full administrator/dispatcher workflow using a disposable database only.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createTestServer } = require('./local-test-server.cjs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const fixture = await createTestServer({ builtFrontend: process.env.PLANNING_BUILT_FRONTEND === 'true' });
  const out = path.resolve(__dirname, '../.local/planning-access-browser-qa');
  let browser, page, own;
  try {
    await fs.mkdir(out, { recursive: true });
    const { ids, adminPool: db, request, devLogin } = fixture;
    const extraScope = randomUUID(), limitedScope = randomUUID();
    await db.query('UPDATE access_grants SET personal_data_visible=true WHERE user_id=$1', [ids.admin]);
    await db.query('UPDATE access_grants SET personal_data_visible=false WHERE user_id=$1', [ids.dispatcher]);
    await db.query('INSERT INTO responsibility_scopes(id,project_id,name) VALUES($1,$3,$4),($2,$3,$5)',
      [extraScope, limitedScope, ids.project, 'Вечерняя группа', 'Область без персональных данных']);
    await db.query(`INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id,personal_data_visible)
      VALUES($1,$2,$3,$4,$5,true),($1,$2,$3,$4,$6,false)`, [ids.admin, ids.legal, ids.region, ids.project, extraScope, limitedScope]);
    let admin = await devLogin(ids.admin);
    const adminPassword = await request('POST', `/access/users/${ids.admin}/password`, { phone: '+79990008101' }, admin.accessToken);
    assert.equal(adminPassword.status, 201);
    admin = await devLogin(ids.admin);
    const dispatcherPassword = await request('POST', `/access/users/${ids.dispatcher}/password`, { phone: '+79990008102' }, admin.accessToken);
    assert.equal(dispatcherPassword.status, 201);
    const dispatcherSession = await request('POST', '/auth/password', {
      phone: dispatcherPassword.body.phone, password: dispatcherPassword.body.password,
    });
    assert.equal(dispatcherSession.status, 200);
    const credentialsBefore = (await db.query('SELECT * FROM phone_credentials WHERE user_id=$1', [ids.dispatcher])).rows[0];
    browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
    page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    own = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.setDefaultTimeout(15000); own.setDefaultTimeout(15000);
    const errors = [];
    for (const p of [page, own]) p.on('pageerror', error => errors.push(error.message));
    async function login(p, credential, section) {
      await p.goto(`${fixture.origin}/?section=${section}`);
      await p.locator('#login-phone').fill(credential.phone);
      await p.locator('#login-password').fill(credential.password);
      await p.getByRole('button', { name: 'Войти', exact: true }).click();
    }
    await login(page, adminPassword.body, 'access');
    await page.getByRole('heading', { name: 'Сотрудники', exact: true }).waitFor();
    await login(own, dispatcherPassword.body, 'planning');
    await own.getByRole('heading', { name: 'Нет доступных проектов', exact: true }).waitFor();
    await own.getByText(/Настроить планирование/).waitFor();
    const card = page.locator('article.employee-card').filter({ hasText: 'Диспетчер' });
    await card.getByRole('button', { name: 'Настроить планирование', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Настроить планирование', exact: true });
    const scope = id => dialog.locator(`[data-scope-id="${id}"]`);
    await scope(ids.scope).waitFor();
    await scope(limitedScope).getByRole('checkbox').first().check();
    assert.equal(await scope(limitedScope).getByRole('checkbox', { name: 'Разрешить доступ к персональным данным', exact: true }).isEnabled(), false);
    await scope(limitedScope).getByRole('checkbox').first().uncheck();
    await scope(ids.scope).getByRole('checkbox', { name: 'Разрешить доступ к персональным данным', exact: true }).check();
    await scope(ids.scope).getByRole('checkbox').first().uncheck();
    await scope(ids.scope).getByRole('checkbox').first().check();
    assert.equal(await scope(ids.scope).getByRole('checkbox', { name: 'Разрешить доступ к персональным данным', exact: true }).isChecked(), true);
    await page.keyboard.press('Escape');
    await dialog.getByRole('button', { name: 'Продолжить редактирование', exact: true }).click();
    async function saveSettings(status = 200) {
      const pending = page.waitForResponse(response => response.url().endsWith(`/access/employees/${ids.dispatcher}/planning-access`)
        && response.request().method() === 'PUT' && response.status() === status);
      await dialog.getByRole('button', { name: 'Сохранить настройки', exact: true }).click();
      assert.equal((await pending).status(), status);
    }
    console.log('CHECK settings editor loaded');
    await page.screenshot({ path: path.join(out, 'settings-desktop.png'), fullPage: false });
    // Expired access triggers real remembered-device renewal while saving this draft.
    const browserSession = await page.evaluate(() => JSON.parse(sessionStorage.getItem('ecl.session.v2')).session);
    await db.query("UPDATE sessions SET expires_at=now()-interval '1 second' WHERE id=$1", [browserSession.actor.sessionId]);
    const refresh = page.waitForResponse(response => response.url().endsWith('/auth/refresh') && response.status() === 200);
    await saveSettings();
    await refresh;
    await dialog.waitFor({ state: 'hidden' });
    await page.getByText(/Настройки планирования для.*сохранены/).waitFor();
    const context = await request('GET', '/planning/context', undefined, dispatcherSession.body.accessToken);
    assert.equal(context.status, 200);
    assert.deepEqual(context.body.scopes.map(item => item.responsibilityScopeId), [ids.scope]);
    console.log('CHECK planning access granted');
    await own.reload();
    await own.getByRole('button', { name: 'Добавить первое назначение', exact: true }).waitFor();
    await own.getByRole('button', { name: 'Добавить первое назначение', exact: true }).click();
    const row = own.locator('.planning-assignment').first();
    await row.getByRole('combobox', { name: 'Водитель', exact: true }).selectOption(ids.drivers[0]);
    await row.getByLabel('Комментарий менеджера', { exact: true }).fill('Проверка настроенного доступа');
    await own.getByRole('button', { name: 'Сохранить план', exact: true }).click();
    await own.getByText('План сохранён', { exact: true }).waitFor();

    console.log('CHECK plan saved');

    // A second administrator changes permissions while the first keeps a draft.
    await card.getByRole('button', { name: 'Настроить планирование', exact: true }).click();
    await scope(ids.scope).waitFor();
    const snapshot = await request('GET', `/access/employees/${ids.dispatcher}/planning-access`, undefined, admin.accessToken);
    const concurrent = await request('PUT', `/access/employees/${ids.dispatcher}/planning-access`, {
      version: snapshot.body.version, grants: [...snapshot.body.grants, { scopeId: extraScope, personalDataVisible: true }],
    }, admin.accessToken);
    assert.equal(concurrent.status, 200);
    await scope(ids.scope).getByRole('checkbox', { name: 'Разрешить доступ к персональным данным', exact: true }).uncheck();
    await saveSettings(409);
    await dialog.getByRole('alert').waitFor();
    await dialog.getByRole('button', { name: /Загрузить актуальные/ }).click();
    await scope(extraScope).getByRole('checkbox', { name: 'Разрешить доступ к персональным данным', exact: true }).waitFor();
    assert.equal(await scope(extraScope).getByRole('checkbox', { name: 'Разрешить доступ к персональным данным', exact: true }).isChecked(), true);

    console.log('CHECK conflict reloaded');

    // Explicitly remove a scope and revoke planning in the retained scope.
    await scope(extraScope).getByRole('checkbox').first().uncheck();
    await scope(ids.scope).getByRole('checkbox', { name: 'Разрешить доступ к персональным данным', exact: true }).uncheck();
    await dialog.getByRole('checkbox', { name: /Подтверждаю/ }).check();
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Settings fit mobile viewport');
    assert.ok(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth), 'Settings dialog has no horizontal overflow');
    await page.screenshot({ path: path.join(out, 'settings-mobile.png'), fullPage: false });
    await saveSettings();
    await dialog.waitFor({ state: 'hidden' });
    await own.reload();
    await own.getByRole('heading', { name: 'Нет доступных проектов', exact: true }).waitFor();
    assert.deepEqual((await db.query('SELECT * FROM phone_credentials WHERE user_id=$1', [ids.dispatcher])).rows[0], credentialsBefore);
    const denied = await request('GET', `/planning?date=2026-09-26&responsibilityScopeId=${ids.scope}`, undefined, dispatcherSession.body.accessToken);
    assert.equal(denied.status, 403);

    console.log('CHECK access revoked');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole('button', { name: 'Добавить диспетчера / менеджера', exact: true }).click();
    const create = page.getByRole('dialog', { name: 'Добавить диспетчера / менеджера', exact: true });
    await create.getByLabel('Имя сотрудника', { exact: true }).fill('Синтетический менеджер планирования');
    await create.getByLabel('Роль', { exact: true }).selectOption('manager');
    await create.getByLabel('Область работы', { exact: true }).selectOption(ids.scope);
    await create.getByRole('checkbox', { name: 'Разрешить доступ к персональным данным', exact: true }).check();
    const creation = page.waitForResponse(response => response.url().endsWith('/access/employees/planner') && response.request().method() === 'POST');
    await create.getByRole('button', { name: 'Создать сотрудника', exact: true }).click();
    const createdResponse = await creation;
    assert.equal(createdResponse.status(), 201);
    const employee = await createdResponse.json();
    assert.equal(employee.sourceKind, 'internal_manual');
    assert.equal(employee.role, 'manager');
    await page.getByRole('heading', { name: 'Выдать доступ по телефону', exact: true }).waitFor();
    const password = await request('POST', `/access/users/${employee.id}/password`, { phone: '+79990008103' }, admin.accessToken);
    assert.equal(password.status, 201);
    const manager = await browser.newPage(); manager.setDefaultTimeout(15000);
    manager.on('pageerror', error => errors.push(error.message));
    await login(manager, password.body, 'planning');
    await manager.getByRole('heading', { name: 'Планирование', exact: true }).waitFor();
    await manager.locator('.planning-assignment').first().waitFor();
    assert.equal(await manager.getByLabel('Комментарий менеджера', { exact: true }).inputValue(), 'Проверка настроенного доступа');
    assert.deepEqual(errors, []);
    console.log('PASS administrator configures existing dispatcher, saves plan, resolves permission conflict, revokes planning, confirms scope removal, preserves credentials, creates named manager, mobile dialogs');
  } catch (error) {
    console.error(error.message);
    for (const [name, tab] of [['admin', page], ['dispatcher', own]]) if (tab && !tab.isClosed()) {
      await tab.screenshot({ path: path.join(out, `failure-${name}.png`), fullPage: true }).catch(() => {});
      await fs.writeFile(path.join(out, `failure-${name}.txt`), await tab.locator('body').innerText().catch(() => '')).catch(() => {});
    }
    throw error;
  } finally {
    if (browser) await browser.close();
    await fixture.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
