'use strict';
// Real API + disposable PostgreSQL. The clipboard and hh window are mocked;
// this test never publishes a vacancy or contacts a real hh account.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createTestServer } = require('./local-test-server.cjs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const fixture = await createTestServer({ builtFrontend: process.env.RECRUITMENT_BUILT_FRONTEND === 'true' });
  const out = path.resolve(__dirname, '../.local/recruitment-hh-browser-qa');
  let browser, releasePending;
  try {
    await fs.mkdir(out, { recursive: true });
    const { ids, request, adminPool: db } = fixture;
    await db.query('UPDATE access_grants SET personal_data_visible=true WHERE user_id=$1', [ids.admin]);
    await db.query('UPDATE users SET display_name=$2 WHERE id=$1', [ids.admin, 'СЕКРЕТ_ИМЯ_РЕКРУТЕРА']);
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
      neededBy: '2027-01-20', requiresSecurity: true,
      schedule: 'График 5/2, начало в 08:00', payTerms: 'От 150000 рублей за месяц',
      warehouseAddress: 'Тестовый склад, улица Примерная, 17', routeInfo: 'Доставка по востоку города',
      driverRequirements: 'Категория B, стаж от трёх лет', vehicleRequirements: 'Фургон до 3,5 тонны',
      trainingTerms: 'Обучение два оплачиваемых дня', notes: 'СЕКРЕТ_ВНУТРЕННИЙ_КОММЕНТАРИЙ',
      publicBrief: 'СЕКРЕТ_ИНСТРУКЦИЯ_РЕКРУТЕРУ',
    };
    const create = (title, overrides = {}) => save({ ...defaults, id: randomUUID(), title, ...overrides });
    const main = await create('Водитель на доставку · hh');
    await db.query('UPDATE recruitment_requests SET source_details=$2 WHERE id=$1', [main.id, 'СЕКРЕТ_ИСХОДНАЯ_ТАБЛИЦА']);
    const initial = await stored(main.id);
    const conflict = await create('Потребность для проверки конфликта · hh');
    const long = await create('Подробная потребность · hh', {
      payTerms: 'Подробные условия оплаты. '.repeat(35), routeInfo: 'Подробное описание маршрута. '.repeat(30),
      driverRequirements: 'Подробные требования к водителю. '.repeat(25),
    });
    const paused = await create('Приостановленная потребность · hh', { status: 'paused' });
    const closed = await create('Закрытая потребность · hh', { status: 'closed' });
    let existing = await create('Уже опубликованная вакансия · hh');
    existing = await save({ ...existing, hhUrl: 'https://hh.ru/vacancy/123456780', publishedAt: new Date().toISOString() });

    browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
    const errors = [];
    async function newPage(session, viewport = { width: 1440, height: 1000 }) {
      const context = await browser.newContext({ viewport, timezoneId: 'Europe/Moscow' });
      await context.addInitScript(value => {
        sessionStorage.setItem('ecl.session.v2', JSON.stringify({ session: value }));
        window.__hhTest = { clipboard: [], opened: [], clipboardFails: false, popupThrows: false, popupReturnsNull: false };
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
          writeText: async text => {
            if (window.__hhTest.clipboardFails) throw new DOMException('Synthetic clipboard denial', 'NotAllowedError');
            window.__hhTest.clipboard.push(text);
          },
        } });
        const originalExecCommand = document.execCommand.bind(document);
        document.execCommand = (command, ...args) => command === 'copy' ? false : originalExecCommand(command, ...args);
        window.open = (url, target, features) => {
          window.__hhTest.opened.push({ url, target, features });
          if (window.__hhTest.popupThrows) throw new Error('Synthetic popup failure');
          return window.__hhTest.popupReturnsNull ? null : { opener: null, closed: false, close() { this.closed = true; } };
        };
      }, { ...session, rememberedDevice: false });
      // A regression that uses a real link instead of the mock still cannot contact hh.
      await context.route(/^https:\/\/(?:[^/]+\.)?hh\.ru(?:\/|$)/, route => route.abort());
      const target = await context.newPage();
      target.setDefaultTimeout(15000);
      target.on('pageerror', error => errors.push(error.message));
      target.on('dialog', dialog => dialog.accept());
      await target.goto(`${fixture.origin}/?section=recruitment`);
      await target.getByRole('navigation', { name: 'Разделы рекрутинга' }).getByRole('button', { name: 'Потребности', exact: true }).click();
      return target;
    }
    const page = await newPage(admin);
    const card = (target, demand) => target.locator('.recruitment-request-card').filter({ has: target.getByRole('heading', { name: demand.title, exact: true }) });
    const modal = target => target.getByRole('dialog', { name: 'Вакансия на hh', exact: true });
    const detail = (target, demand) => target.getByRole('dialog', { name: `Потребность ${demand.title}`, exact: true });
    const titleInput = target => modal(target).getByLabel('Название вакансии', { exact: true });
    const bodyInput = target => modal(target).getByLabel('Текст вакансии', { exact: true });
    const linkInput = target => modal(target).getByLabel('Ссылка на опубликованную вакансию', { exact: true });
    const copyButton = target => modal(target).getByRole('button', { name: 'Скопировать и открыть hh', exact: true });
    const saveButton = target => modal(target).getByRole('button', { name: 'Сохранить ссылку', exact: true });
    const isRequestPut = response => response.url().endsWith('/recruitment/requests') && response.request().method() === 'PUT';
    let putCount = 0;
    page.on('request', outgoing => { if (outgoing.url().endsWith('/recruitment/requests') && outgoing.method() === 'PUT') putCount++; });
    async function openFromCard(demand, label = 'Разместить на hh') {
      await card(page, demand).getByRole('button', { name: label, exact: true }).click();
      await modal(page).waitFor();
    }
    async function closeModal() {
      await modal(page).getByRole('button', { name: 'Закрыть', exact: true }).click();
      await modal(page).waitFor({ state: 'hidden' });
    }

    await openFromCard(main);
    assert.equal(await titleInput(page).inputValue(), main.title);
    const publicText = await bodyInput(page).inputValue();
    for (const key of ['city', 'district', 'schedule', 'payTerms', 'warehouseAddress', 'routeInfo', 'driverRequirements', 'vehicleRequirements', 'trainingTerms']) {
      assert.ok(publicText.includes(main[key]), `public draft includes ${key}`);
    }
    assert.ok(!`${await titleInput(page).inputValue()}\n${publicText}`.includes('СЕКРЕТ_'), 'no staff notes, imported source, recruiter identity or recruiter instructions in public copy');
    assert.equal(await linkInput(page).inputValue(), '');
    assert.equal(putCount, 0, 'preparing a vacancy does not mark it published');
    assert.deepEqual(await stored(main.id), initial);
    await page.screenshot({ path: path.join(out, 'hh-prepared-desktop.png') });

    const editedTitle = 'Водитель категории B на доставку';
    const editedBody = 'Москва, Лефортово.\nГрафик 5/2. Оплата от 150000 рублей.';
    await titleInput(page).fill(editedTitle);
    await bodyInput(page).fill(editedBody);
    await copyButton(page).click();
    await page.waitForFunction(() => window.__hhTest.clipboard.length === 1 && window.__hhTest.opened.length === 1);
    const copied = await page.evaluate(() => window.__hhTest);
    assert.equal(copied.clipboard[0], `${editedTitle}\n\n${editedBody}`);
    assert.equal(copied.opened[0].url, 'https://hh.ru/employer/vacancy/create');
    assert.equal(copied.opened[0].target, '_blank');
    assert.match(copied.opened[0].features, /noopener/);
    assert.match(copied.opened[0].features, /noreferrer/);
    assert.equal(putCount, 0, 'copying/opening hh does not save a request');
    assert.deepEqual(await stored(main.id), initial, 'opening hh never starts publication metrics');
    console.log('PASS card prepares editable public text, excludes internal fields, and copies/opens hh without publishing');

    await page.evaluate(() => {
      window.__hhTest.nativeAnchors = [];
      window.__hhNativeRestore = { hadTauri: Object.hasOwn(window, '__TAURI__'), tauri: window.__TAURI__, click: HTMLAnchorElement.prototype.click };
      window.__TAURI__ = {};
      HTMLAnchorElement.prototype.click = function () {
        window.__hhTest.nativeAnchors.push({ href: this.href, target: this.target, rel: this.rel });
      };
    });
    let native;
    try {
      await copyButton(page).click();
      await page.waitForFunction(() => window.__hhTest.nativeAnchors.length === 1 && window.__hhTest.clipboard.length === 2);
      native = await page.evaluate(() => window.__hhTest);
    } finally {
      await page.evaluate(() => {
        HTMLAnchorElement.prototype.click = window.__hhNativeRestore.click;
        if (window.__hhNativeRestore.hadTauri) window.__TAURI__ = window.__hhNativeRestore.tauri;
        else delete window.__TAURI__;
        delete window.__hhNativeRestore;
      });
    }
    assert.deepEqual(native.nativeAnchors, [{ href: 'https://hh.ru/employer/vacancy/create', target: '_blank', rel: 'noopener noreferrer' }]);
    assert.equal(native.clipboard.at(-1), `${editedTitle}\n\n${editedBody}`);
    assert.equal(native.opened.length, copied.opened.length, 'native shell uses its anchor routing instead of window.open');
    assert.equal(putCount, 0);
    console.log('PASS native shell copies the same text and invokes external-browser anchor routing');

    await page.evaluate(() => { window.__hhTest.popupReturnsNull = true; });
    await copyButton(page).click();
    await modal(page).getByText(/Если вкладка не открылась/).waitFor();
    assert.equal(await modal(page).getByRole('link', { name: 'Открыть hh ↗', exact: true }).getAttribute('href'), 'https://hh.ru/employer/vacancy/create');
    await page.evaluate(() => { window.__hhTest.popupThrows = true; });
    await copyButton(page).click();
    await modal(page).getByRole('status').filter({ hasText: 'Не удалось открыть hh' }).waitFor();
    await page.evaluate(() => { window.__hhTest.popupThrows = false; window.__hhTest.clipboardFails = true; });
    await copyButton(page).click();
    await modal(page).getByRole('alert').waitFor();
    const manual = modal(page).getByLabel('Текст для ручного копирования', { exact: true });
    await manual.waitFor();
    assert.equal(await manual.inputValue(), `${editedTitle}\n\n${editedBody}`);
    assert.equal(await manual.getAttribute('readonly') !== null, true);
    assert.equal(await titleInput(page).inputValue(), editedTitle);
    assert.equal(await bodyInput(page).inputValue(), editedBody);
    assert.equal(putCount, 0);
    await page.setViewportSize({ width: 390, height: 844 });
    await manual.scrollIntoViewIfNeeded();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'hh form fits mobile viewport');
    const bounds = await modal(page).boundingBox();
    assert.ok(bounds && bounds.x >= -1 && bounds.x + bounds.width <= 391, 'dialog is not wider than mobile viewport');
    await page.screenshot({ path: path.join(out, 'hh-manual-copy-mobile.png') });
    await saveButton(page).scrollIntoViewIfNeeded();
    const mobileSave = await saveButton(page).boundingBox();
    assert.ok(mobileSave && mobileSave.y >= 0 && mobileSave.y + mobileSave.height <= 845, 'save action is reachable by scrolling the mobile form');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.evaluate(() => { window.__hhTest.clipboardFails = false; window.__hhTest.popupReturnsNull = false; });
    console.log('PASS blocked clipboard and missing popup retain text, expose manual fallback, and fit mobile');

    for (const invalid of ['https://hh.ru/resume/12345678', 'https://hh.ru.evil.example/vacancy/12345678', 'http://hh.ru/vacancy/12345678', 'https://hh.ru/vacancy/not-a-number']) {
      await linkInput(page).fill(invalid);
      await saveButton(page).click();
      await modal(page).getByRole('alert').last().waitFor();
      assert.equal(putCount, 0, `invalid vacancy URL does not write: ${invalid}`);
      assert.equal(await linkInput(page).inputValue(), invalid);
    }
    await linkInput(page).fill('https://hh.ru/vacancy/123456789');
    let markIntercepted;
    const intercepted = new Promise(resolve => { markIntercepted = resolve; });
    const pendingGate = new Promise(resolve => { releasePending = resolve; });
    const delayedSave = async route => {
      if (route.request().method() !== 'PUT') return route.continue();
      markIntercepted();
      await pendingGate;
      await route.continue();
    };
    await page.route('**/recruitment/requests', delayedSave);
    const savedResponse = page.waitForResponse(isRequestPut);
    await saveButton(page).evaluate(button => { button.click(); button.click(); });
    await intercepted;
    assert.equal(putCount, 1, 'rapid double submit starts one save');
    assert.equal(await modal(page).getByRole('button', { name: 'Сохраняем…', exact: true }).isDisabled(), true);
    assert.equal((await stored(main.id)).publishedAt, null, 'no optimistic publication date before server success');
    releasePending(); releasePending = null;
    const response = await savedResponse;
    assert.equal(response.status(), 200, await response.text());
    await modal(page).waitFor({ state: 'hidden' });
    await page.unroute('**/recruitment/requests', delayedSave);
    await page.getByText('Ссылка на вакансию hh сохранена', { exact: true }).waitFor();
    const after = await stored(main.id);
    assert.equal(after.hhUrl, 'https://hh.ru/vacancy/123456789');
    assert.ok(after.publishedAt && Date.parse(after.publishedAt) >= Date.parse(after.createdAt));
    assert.equal(after.version, initial.version + 1);
    for (const [key, value] of Object.entries(initial)) {
      if (!['hhUrl', 'publishedAt', 'version', 'updatedAt'].includes(key)) assert.deepEqual(after[key], value, `hh save preserves ${key}`);
    }
    await card(page, main).getByRole('button', { name: 'Вакансия на hh', exact: true }).waitFor();
    await page.reload();
    await page.getByRole('navigation', { name: 'Разделы рекрутинга' }).getByRole('button', { name: 'Потребности', exact: true }).click();
    await openFromCard(main, 'Вакансия на hh');
    assert.equal(await linkInput(page).inputValue(), after.hhUrl, 'saved link survives reload');
    await closeModal();
    console.log('PASS explicit validated URL save is single-flight, persists link/date and preserves request fields');

    await openFromCard(existing, 'Вакансия на hh');
    await linkInput(page).fill('https://spb.hh.ru/vacancy/123456781');
    const existingResponse = page.waitForResponse(isRequestPut);
    await saveButton(page).click();
    assert.equal((await existingResponse).status(), 200);
    await modal(page).waitFor({ state: 'hidden' });
    const updatedExisting = await stored(existing.id);
    assert.equal(updatedExisting.hhUrl, 'https://spb.hh.ru/vacancy/123456781');
    assert.equal(updatedExisting.publishedAt, existing.publishedAt, 'editing an existing link preserves original publication date');

    await card(page, long).getByRole('button', { name: 'Подробнее о потребности', exact: true }).click();
    await detail(page, long).getByRole('button', { name: 'Разместить на hh', exact: true }).click();
    await modal(page).waitFor();
    assert.ok((await bodyInput(page).inputValue()).includes(long.routeInfo), 'long source text is not silently truncated');
    assert.ok((await titleInput(page).inputValue()).length + (await bodyInput(page).inputValue()).length + 2 > 2000);
    assert.equal(await copyButton(page).isDisabled(), true, 'hh generation limit blocks overlong copy');
    await bodyInput(page).fill('Краткое описание вакансии.');
    assert.equal(await copyButton(page).isEnabled(), true);
    await closeModal();
    if (await detail(page, long).count()) await detail(page, long).getByRole('button', { name: 'Закрыть потребность', exact: true }).click();
    for (const demand of [paused, closed]) {
      assert.equal(await card(page, demand).getByRole('button', { name: 'Разместить на hh', exact: true }).count(), 0);
      await card(page, demand).getByRole('button', { name: 'Подробнее о потребности', exact: true }).click();
      assert.equal(await detail(page, demand).getByRole('button', { name: 'Разместить на hh', exact: true }).count(), 0);
      await detail(page, demand).getByRole('button', { name: 'Закрыть потребность', exact: true }).click();
    }
    console.log('PASS existing date, demand-detail entry, explicit length limit and paused/closed visibility');

    await openFromCard(conflict);
    const conflictTitle = 'Мой несохранённый заголовок';
    const conflictBody = 'Мой несохранённый текст вакансии.';
    const conflictUrl = 'https://hh.ru/vacancy/123456790';
    await titleInput(page).fill(conflictTitle);
    await bodyInput(page).fill(conflictBody);
    await linkInput(page).fill(conflictUrl);
    const competing = await save({ ...conflict, notes: 'Правка коллеги, которую нельзя потерять' });
    const conflictResponse = page.waitForResponse(isRequestPut);
    await saveButton(page).click();
    assert.equal((await conflictResponse).status(), 409);
    await modal(page).getByRole('alert').waitFor();
    assert.equal(await titleInput(page).inputValue(), conflictTitle);
    assert.equal(await bodyInput(page).inputValue(), conflictBody);
    assert.equal(await linkInput(page).inputValue(), conflictUrl);
    assert.deepEqual(await stored(conflict.id), competing, 'conflicting save cannot overwrite a colleague or falsely mark publication');
    await page.screenshot({ path: path.join(out, 'hh-conflict-desktop.png') });
    await closeModal();
    console.log('PASS version conflict preserves local text/link and never overwrites a concurrent change');

    const externalId = randomUUID();
    await db.query("INSERT INTO users(id,display_name,role,active,approved) VALUES($1,'Внешний рекрутер · hh','external_recruiter',true,true)", [externalId]);
    await db.query('INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id,personal_data_visible) VALUES($1,$2,$3,$4,$5,true)', [externalId, ids.legal, ids.region, ids.project, ids.scope]);
    const granted = await request('PUT', '/recruitment/access', { responsibilityScopeId: ids.scope, userId: externalId, requestIds: [main.id, conflict.id], status: 'active', expiresAt: null, version: 0 }, admin.accessToken);
    assert.equal(granted.status, 200, JSON.stringify(granted.body));
    const externalPage = await newPage(await fixture.devLogin(externalId), { width: 390, height: 844 });
    for (const demand of [main, conflict]) {
      await card(externalPage, demand).waitFor();
      assert.equal(await card(externalPage, demand).getByRole('button', { name: /^(Разместить на hh|Вакансия на hh)$/ }).count(), 0);
      await card(externalPage, demand).getByRole('button', { name: 'Подробнее о потребности', exact: true }).click();
      assert.equal(await detail(externalPage, demand).getByRole('button', { name: /^(Разместить на hh|Вакансия на hh)$/ }).count(), 0);
      await detail(externalPage, demand).getByRole('button', { name: 'Закрыть потребность', exact: true }).click();
    }
    assert.deepEqual(errors, []);
    console.log('PASS external recruiters have no publication or link-edit action');
  } finally {
    if (releasePending) releasePending();
    if (browser) await browser.close();
    await fixture.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
