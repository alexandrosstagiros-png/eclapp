'use strict';
// Real API + disposable PostgreSQL; synthetic demand records only.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createTestServer } = require('./local-test-server.cjs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const fixture = await createTestServer({ builtFrontend: process.env.RECRUITMENT_BUILT_FRONTEND === 'true' });
  const out = path.resolve(__dirname, '../.local/recruitment-request-status-browser-qa');
  let browser, releasePending;
  try {
    await fs.mkdir(out, { recursive: true });
    const { ids, request, adminPool: db } = fixture;
    await db.query('UPDATE access_grants SET personal_data_visible=true WHERE user_id=$1', [ids.admin]);
    const admin = await fixture.devLogin(ids.admin);
    async function save(body) {
      const result = await request('PUT', '/recruitment/requests', body, admin.accessToken);
      assert.equal(result.status, 200, JSON.stringify(result.body));
      return result.body;
    }
    async function stored(id) {
      const result = await request('GET', '/recruitment', undefined, admin.accessToken);
      assert.equal(result.status, 200, JSON.stringify(result.body));
      return result.body.requests.find(item => item.id === id);
    }
    const defaults = {
      responsibilityScopeId: ids.scope, version: 0, city: 'Москва', district: 'Лефортово',
      kind: 'driver', quantity: 3, priority: 'urgent', status: 'open', recruiterId: ids.admin,
      neededBy: '2027-01-20', requiresSecurity: true, schedule: 'График 5/2, начало в 08:00',
      payTerms: 'От 150000 рублей за месяц', warehouseAddress: 'Тестовый склад, улица Примерная, 17',
      routeInfo: 'Доставка по востоку города', driverRequirements: 'Категория B, стаж от трёх лет',
      vehicleRequirements: 'Фургон до 3,5 тонны', trainingTerms: 'Обучение два оплачиваемых дня',
      notes: 'Внутренний комментарий должен сохраниться', publicBrief: 'Условия для внешнего рекрутера',
    };
    const create = (title, overrides = {}) => save({ ...defaults, id: randomUUID(), title: `Статус потребности · ${title}`, ...overrides });
    const main = await create('основной проект');
    await db.query('UPDATE recruitment_requests SET source_details=$2 WHERE id=$1', [main.id, 'Исходная строка импортированной таблицы: сохранить полностью']);
    let published = await create('другой проект с опубликованной вакансией');
    published = await save({ ...published, hhUrl: 'https://hh.ru/vacancy/123456789', publishedAt: new Date().toISOString() });
    const conflict = await create('конкурентное изменение');
    const incomplete = await create('не указаны город и количество', { city: '', quantity: null, status: 'paused' });
    const zero = await create('нулевое количество и очень длинное название для проверки мобильной карточки', { quantity: 0, status: 'paused' });
    const initial = await stored(main.id);
    const initialPublished = await stored(published.id);
    const initialIncomplete = await stored(incomplete.id);
    const initialZero = await stored(zero.id);
    function assertPreserved(before, after, extraChanged = []) {
      for (const [key, value] of Object.entries(before)) {
        if (!['status', 'version', 'updatedAt', ...extraChanged].includes(key)) assert.deepEqual(after[key], value, `status save preserves ${key}`);
      }
      assert.equal(after.version, before.version + 1, 'one status change produces one version');
    }
    browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
    const errors = [], dialogs = [];
    let acceptNextDialog = false;
    async function newPage(session, viewport = { width: 1440, height: 1000 }) {
      const context = await browser.newContext({ viewport, timezoneId: 'Europe/Moscow' });
      await context.addInitScript(value => sessionStorage.setItem('ecl.session.v2', JSON.stringify({ session: value })), { ...session, rememberedDevice: false });
      const target = await context.newPage();
      target.setDefaultTimeout(15000);
      target.on('pageerror', error => errors.push(error.message));
      target.on('dialog', dialog => {
        dialogs.push(dialog.message());
        const accept = acceptNextDialog;
        acceptNextDialog = false;
        void (accept ? dialog.accept() : dialog.dismiss());
      });
      await target.goto(`${fixture.origin}/?section=recruitment`);
      await target.getByRole('navigation', { name: 'Разделы рекрутинга' }).getByRole('button', { name: 'Потребности', exact: true }).click();
      return target;
    }
    const page = await newPage(admin);
    const card = (target, demand) => target.locator('.recruitment-request-card').filter({ has: target.getByRole('heading', { name: demand.title, exact: true }) });
    const status = (target, demand) => card(target, demand).getByLabel('Статус потребности', { exact: true });
    const isRequestPut = response => response.url().endsWith('/recruitment/requests') && response.request().method() === 'PUT';
    const isRecruitmentGet = response => new URL(response.url()).pathname.endsWith('/recruitment') && response.request().method() === 'GET';
    const waitEditable = (target, demand, value) => card(target, demand).getByLabel('Статус потребности', { exact: true }).evaluate(async (element, expected) => {
      const started = Date.now();
      while (element.isConnected && (element.disabled || element.value !== expected)) {
        if (Date.now() - started > 14000) throw new Error(`Status did not become editable: ${element.value}`);
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      if (!element.isConnected) throw new Error('Status control was replaced while waiting');
    }, value);
    async function choose(demand, value, expectedStatus = 200) {
      const pending = page.waitForResponse(isRequestPut);
      await status(page, demand).selectOption(value);
      const response = await pending;
      assert.equal(response.status(), expectedStatus, await response.text());
      if (expectedStatus === 200) {
        await card(page, demand).getByText('Статус сохранён', { exact: true }).waitFor();
        await waitEditable(page, demand, value);
      } else await card(page, demand).getByRole('alert').waitFor();
      return response.json();
    }
    let putCount = 0;
    page.on('request', outgoing => { if (outgoing.url().endsWith('/recruitment/requests') && outgoing.method() === 'PUT') putCount++; });
    await page.getByLabel('Поиск', { exact: true }).fill('Статус потребности');
    await page.getByLabel('Город потребности', { exact: true }).selectOption('Москва');
    await page.getByLabel('Ответственный за потребность', { exact: true }).selectOption(ids.admin);
    await status(page, main).waitFor();
    assert.deepEqual(await status(page, main).locator('option').evaluateAll(options => options.map(option => [option.value, option.textContent])), [
      ['open', 'Открыта'], ['paused', 'Приостановлена'], ['closed', 'Закрыта'],
    ]);
    await card(page, main).getByRole('button', { name: 'Разместить на hh', exact: true }).waitFor();
    const mountedCard = await card(page, main).elementHandle();
    const mountedSelect = await status(page, main).elementHandle();
    let markIntercepted;
    const intercepted = new Promise(resolve => { markIntercepted = resolve; });
    const pendingGate = new Promise(resolve => { releasePending = resolve; });
    const delaySave = async route => {
      if (route.request().method() !== 'PUT' || route.request().postDataJSON().id !== main.id) return route.continue();
      markIntercepted();
      await pendingGate;
      await route.continue();
    };
    await page.route('**/recruitment/requests', delaySave);
    const pendingResponse = page.waitForResponse(response => isRequestPut(response) && response.request().postDataJSON().id === main.id);
    await status(page, main).selectOption('paused');
    await intercepted;
    await card(page, main).getByText('Сохраняем…', { exact: true }).waitFor();
    assert.equal(await status(page, main).isDisabled(), true);
    assert.equal(await status(page, main).inputValue(), 'open', 'pending save keeps the committed status');
    assert.equal(await card(page, main).getByText('Статус сохранён', { exact: true }).count(), 0);
    assert.deepEqual(await stored(main.id), initial, 'no optimistic database write or hh date');
    assert.equal(await status(page, published).isDisabled(), true, 'the existing shared mutation lock prevents overlapping writes');
    assert.equal(await card(page, published).getByText('Сохраняем…', { exact: true }).count(), 0, 'pending feedback belongs only to the active card');
    assert.deepEqual(await stored(published.id), initialPublished, 'the other request is unchanged');
    assert.equal(await page.getByRole('dialog').count(), 0, 'status change never opens a demand dialog');
    releasePending(); releasePending = null;
    const savedResponse = await pendingResponse;
    assert.equal(savedResponse.status(), 200, await savedResponse.text());
    await card(page, main).getByText('Статус сохранён', { exact: true }).waitFor();
    await waitEditable(page, main, 'paused');
    await page.unroute('**/recruitment/requests', delaySave);
    assertPreserved(initial, await stored(main.id));
    assert.equal(await mountedCard.evaluate(element => element.isConnected), true, 'the demand card stays mounted');
    assert.equal(await mountedSelect.evaluate(element => element.isConnected), true, 'the status control stays mounted');
    assert.equal(await card(page, main).getByRole('button', { name: 'Разместить на hh', exact: true }).count(), 0);
    const changedPublished = await choose(published, 'closed');
    assert.equal(changedPublished.status, 'closed');
    assertPreserved(initialPublished, await stored(published.id));
    for (const value of ['closed', 'open']) {
      const before = await stored(main.id);
      await choose(main, value);
      assertPreserved(before, await stored(main.id));
      assert.equal(await card(page, main).getByRole('button', { name: 'Разместить на hh', exact: true }).count(), Number(value === 'open'));
    }
    assert.equal(await page.getByLabel('Поиск', { exact: true }).inputValue(), 'Статус потребности');
    assert.equal(await page.getByLabel('Город потребности', { exact: true }).inputValue(), 'Москва');
    assert.equal(await page.getByLabel('Ответственный за потребность', { exact: true }).inputValue(), ids.admin);
    assert.equal(putCount, 4, 'each selection produces exactly one request');
    await page.screenshot({ path: path.join(out, 'request-status-desktop.png'), fullPage: true });
    console.log('PASS full status cycle saves directly, preserves all fields and hh dates, updates hh visibility and shows pending feedback locally');

    for (const code of [400, 500]) {
      const before = await stored(main.id);
      const failSave = route => route.request().method() === 'PUT'
        ? route.fulfill({ status: code, contentType: 'application/json', body: JSON.stringify({ message: `Синтетическая ошибка ${code}` }) })
        : route.continue();
      await page.route('**/recruitment/requests', failSave);
      await choose(main, 'paused', code);
      assert.equal(await status(page, main).inputValue(), 'open');
      assert.equal(await status(page, main).isEnabled(), true, 'temporary errors allow retry');
      assert.equal(await card(page, main).getByText('Статус сохранён', { exact: true }).count(), 0);
      assert.equal(await card(page, published).getByRole('alert').count(), 0, 'errors remain local to the failed card');
      assert.deepEqual(await stored(main.id), before);
      await page.unroute('**/recruitment/requests', failSave);
      await choose(main, 'paused');
      assert.equal(await card(page, main).getByRole('alert').count(), 0);
      assertPreserved(before, await stored(main.id));
      await choose(main, 'open');
    }
    console.log('PASS 400 and 500 leave the confirmed status unchanged, show a local error and permit a successful retry');

    const competing = await save({ ...conflict, status: 'closed', notes: 'Сохранить изменение другого рекрутера', schedule: 'Новый график коллеги' });
    await choose(conflict, 'paused', 409);
    assert.equal(await status(page, conflict).inputValue(), 'open');
    assert.equal(await status(page, conflict).isDisabled(), true, '409 requires a refresh before another save');
    assert.equal(await status(page, main).isEnabled(), true);
    assert.deepEqual(await stored(conflict.id), competing, 'a stale client cannot overwrite a concurrent change');
    await choose(main, 'closed');
    assert.equal(await status(page, conflict).isDisabled(), true, 'saving another card cannot clear the conflict');
    const refreshedResponse = page.waitForResponse(isRecruitmentGet);
    await card(page, conflict).getByRole('button', { name: 'Обновить потребность', exact: true }).click();
    assert.equal((await refreshedResponse).status(), 200);
    await status(page, conflict).waitFor();
    await waitEditable(page, conflict, 'closed');
    assert.equal(await card(page, conflict).getByRole('alert').count(), 0);
    const afterRefresh = await choose(conflict, 'open');
    assert.equal(afterRefresh.version, competing.version + 1);
    assertPreserved(competing, await stored(conflict.id));
    assert.equal(await page.getByRole('dialog').count(), 0);
    console.log('PASS real 409 preserves a concurrent edit and explicit refresh adopts its fields and version');

    await page.getByLabel('Город потребности', { exact: true }).selectOption('');
    const beforeDraft = putCount;
    await status(page, incomplete).selectOption('open');
    const city = card(page, incomplete).getByLabel('Город для открытия потребности', { exact: true });
    const quantity = card(page, incomplete).getByLabel('Количество для открытия потребности', { exact: true });
    await city.waitFor();
    assert.equal(await city.inputValue(), '');
    assert.equal(await quantity.inputValue(), '', 'unspecified quantity is not silently defaulted');
    assert.equal(putCount, beforeDraft, 'an incomplete request is not submitted by selecting open');
    await card(page, incomplete).getByRole('button', { name: 'Открыть потребность', exact: true }).click();
    assert.equal(putCount, beforeDraft, 'required fields block the save');
    assert.deepEqual(await stored(incomplete.id), initialIncomplete);
    await city.fill('Москва');
    await quantity.fill('2');
    const openedResponse = page.waitForResponse(isRequestPut);
    await card(page, incomplete).getByRole('button', { name: 'Открыть потребность', exact: true }).click();
    assert.equal((await openedResponse).status(), 200);
    await card(page, incomplete).getByText('Статус сохранён', { exact: true }).waitFor();
    await waitEditable(page, incomplete, 'open');
    assert.equal(await city.count(), 0, 'inline completion disappears after success');
    const opened = await stored(incomplete.id);
    assert.equal(opened.city, 'Москва');
    assert.equal(opened.quantity, 2);
    assert.equal(opened.status, 'open');
    assertPreserved(initialIncomplete, opened, ['city', 'quantity']);
    await card(page, incomplete).getByRole('button', { name: 'Разместить на hh', exact: true }).waitFor();

    await page.setViewportSize({ width: 390, height: 844 });
    const beforeCancel = putCount;
    await status(page, zero).selectOption('open');
    const zeroCity = card(page, zero).getByLabel('Город для открытия потребности', { exact: true });
    const zeroQuantity = card(page, zero).getByLabel('Количество для открытия потребности', { exact: true });
    await zeroCity.waitFor();
    assert.equal(await zeroCity.inputValue(), 'Москва', 'existing valid city is prefilled');
    assert.equal(await zeroQuantity.inputValue(), '', 'zero quantity requires an explicit positive value');
    await zeroQuantity.fill('4');
    await zeroQuantity.scrollIntoViewIfNeeded();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'status control and inline form fit the 390px viewport');
    const mobileBounds = await status(page, zero).boundingBox();
    assert.ok(mobileBounds && mobileBounds.x >= -1 && mobileBounds.x + mobileBounds.width <= 391, 'status control stays within the mobile viewport');
    await page.screenshot({ path: path.join(out, 'request-status-mobile.png'), fullPage: true });
    await card(page, zero).screenshot({ path: path.join(out, 'request-status-mobile-card.png') });
    await card(page, zero).getByRole('button', { name: 'Отмена', exact: true }).click();
    assert.equal(await zeroCity.count(), 0);
    assert.equal(await status(page, zero).inputValue(), 'paused');
    assert.equal(putCount, beforeCancel, 'cancel never saves the inline draft');
    assert.deepEqual(await stored(zero.id), initialZero);
    assert.equal(await page.getByRole('dialog').count(), 0, 'incomplete reopening also stays on the list');
    assert.deepEqual(dialogs, [], 'status changes and inline completion need no modal or confirmation');
    console.log('PASS missing city/quantity can be supplied inline; null and zero are not invented; cancel preserves the request; mobile fits');

    // Explicitly opening the full editor may discard a draft once, but must not
    // leave that discarded draft behind or ask about it again when closing.
    await status(page, zero).selectOption('open');
    await zeroCity.fill('Санкт-Петербург');
    await zeroQuantity.fill('4');
    acceptNextDialog = true;
    await card(page, zero).getByRole('button', { name: 'Изменить потребность', exact: true }).click();
    const fullEditor = page.getByRole('dialog', { name: 'Потребность в подборе', exact: true });
    await fullEditor.waitFor();
    assert.equal(dialogs.length, 1, 'opening the full editor asks once before discarding the inline draft');
    assert.match(dialogs[0], /несохранённые изменения/);
    assert.equal(await fullEditor.getByLabel('Город', { exact: true }).inputValue(), initialZero.city, 'full editor starts with stored fields');
    await fullEditor.getByRole('button', { name: 'Закрыть', exact: true }).click();
    await fullEditor.waitFor({ state: 'hidden' });
    assert.equal(dialogs.length, 1, 'closing an untouched full editor does not ask about the discarded draft again');
    assert.equal(await zeroCity.count(), 0);
    assert.equal(await status(page, zero).inputValue(), 'paused');
    assert.equal(putCount, beforeCancel);
    assert.deepEqual(await stored(zero.id), initialZero);
    console.log('PASS switching explicitly to the full editor discards an inline draft once and leaves no hidden unsaved state');

    await page.reload();
    await page.getByRole('navigation', { name: 'Разделы рекрутинга' }).getByRole('button', { name: 'Потребности', exact: true }).click();
    for (const [demand, value] of [[main, 'closed'], [published, 'closed'], [conflict, 'open'], [incomplete, 'open'], [zero, 'paused']]) {
      await status(page, demand).waitFor();
      assert.equal(await status(page, demand).inputValue(), value, 'confirmed status survives reload');
    }
    assert.equal((await stored(main.id)).publishedAt, null, 'changing status never marks an unpublished demand as published');
    assert.equal((await stored(published.id)).publishedAt, initialPublished.publishedAt);
    assert.equal((await stored(main.id)).sourceDetails, initial.sourceDetails);
    console.log('PASS confirmed statuses, publication date and imported source survive reload');

    const externalId = randomUUID();
    await db.query("INSERT INTO users(id,display_name,role,active,approved) VALUES($1,'Внешний рекрутер · статусы потребностей','external_recruiter',true,true)", [externalId]);
    await db.query('INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id,personal_data_visible) VALUES($1,$2,$3,$4,$5,true)', [externalId, ids.legal, ids.region, ids.project, ids.scope]);
    const granted = await request('PUT', '/recruitment/access', { responsibilityScopeId: ids.scope, userId: externalId, requestIds: [conflict.id, incomplete.id], status: 'active', expiresAt: null, version: 0 }, admin.accessToken);
    assert.equal(granted.status, 200, JSON.stringify(granted.body));
    const externalPage = await newPage(await fixture.devLogin(externalId), { width: 390, height: 844 });
    for (const demand of [conflict, incomplete]) {
      await card(externalPage, demand).waitFor();
      assert.equal(await status(externalPage, demand).count(), 0, 'external recruiters cannot change demand status');
      assert.equal(await card(externalPage, demand).getByRole('button', { name: 'Изменить потребность', exact: true }).count(), 0);
    }
    assert.deepEqual(errors, []);
    assert.equal(dialogs.length, 1, 'only explicit full editing with an unsaved draft requires confirmation');
    console.log('PASS external recruiters retain read-only demand cards without inline status controls');
  } finally {
    releasePending?.();
    if (browser) await browser.close();
    await fixture.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
