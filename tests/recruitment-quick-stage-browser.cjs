'use strict';
// Real API + disposable PostgreSQL; synthetic records only, never the local app database.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createTestServer } = require('./local-test-server.cjs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const fixture = await createTestServer({ builtFrontend: process.env.RECRUITMENT_BUILT_FRONTEND === 'true' });
  const out = path.resolve(__dirname, '../.local/recruitment-quick-stage-browser-qa');
  let browser, releasePending;
  try {
    await fs.mkdir(out, { recursive: true });
    const { ids, request, adminPool: db } = fixture;
    await db.query('UPDATE access_grants SET personal_data_visible=true WHERE user_id=ANY($1::uuid[])', [[ids.admin, ids.dispatcher]]);
    const admin = await fixture.devLogin(ids.admin);
    async function save(collection, body, token = admin.accessToken) {
      const result = await request('PUT', `/recruitment/${collection}`, body, token);
      assert.equal(result.status, 200, JSON.stringify(result.body));
      return result.body;
    }
    async function snapshot() {
      const result = await request('GET', `/recruitment?responsibilityScopeId=${ids.scope}`, undefined, admin.accessToken);
      assert.equal(result.status, 200, JSON.stringify(result.body));
      return result.body;
    }
    const base = () => ({ id: randomUUID(), responsibilityScopeId: ids.scope, version: 0 });
    const demands = [];
    for (const title of ['Первый проект · быстрый статус', 'Второй проект · очень длинное название потребности для проверки мобильной карточки']) {
      demands.push(await save('requests', { ...base(), title, city: 'Москва', kind: 'driver', quantity: 2, priority: 'normal', status: 'open', recruiterId: ids.admin }));
    }
    const candidate = await save('candidates', { ...base(), fullName: 'Тест быстрого статуса · два подбора', phone: '+79990102201',
      city: 'Тула', kind: 'driver', recruiterId: ids.dispatcher, source: 'manual' });
    const applications = [];
    for (let index = 0; index < demands.length; index++) {
      applications.push(await save('applications', { ...base(), candidateId: candidate.id, requestId: demands[index].id,
        recruiterId: ids.dispatcher, stage: index ? 'contact' : 'new', reason: index ? '' : 'Сохранить комментарий', startDate: null }));
    }
    // Cards newer than the target make the preservation of a real scroll position observable.
    for (let index = 0; index < 8; index++) {
      await save('candidates', { ...base(), fullName: `Тест быстрого статуса · сосед ${index + 1}`, phone: `+7999010230${index}`,
        city: 'Тула', kind: 'driver', recruiterId: ids.dispatcher, source: 'manual' });
    }
    const initial = await snapshot();
    const initialEvents = initial.events.filter(item => item.applicationId === applications[0].id);
    browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
    const errors = [], dialogs = [];
    async function newPage(session, viewport) {
      const context = await browser.newContext({ viewport, timezoneId: 'Europe/Moscow' });
      await context.addInitScript(value => sessionStorage.setItem('ecl.session.v2', JSON.stringify({ session: value })), { ...session, rememberedDevice: false });
      const target = await context.newPage();
      target.setDefaultTimeout(15000);
      target.on('pageerror', error => errors.push(error.message));
      target.on('dialog', dialog => { dialogs.push(dialog.message()); void dialog.dismiss(); });
      await target.goto(`${fixture.origin}/?section=recruitment`);
      await target.getByRole('navigation', { name: 'Разделы рекрутинга' }).getByRole('button', { name: 'Кандидаты', exact: true }).click();
      await target.getByRole('button', { name: 'Список', exact: true }).click();
      return target;
    }
    const page = await newPage(admin, { width: 1440, height: 900 });
    const card = (target, person) => target.locator('.recruitment-worklist tbody tr').filter({ has: target.getByRole('button', { name: person.fullName, exact: true }) });
    const row = (target, person, demand) => card(target, person).locator('.recruitment-quick-stage').filter({ has: target.getByLabel(`Статус подбора · ${demand.title}`, { exact: true }) });
    const stage = (target, person, demand) => row(target, person, demand).getByLabel(`Статус подбора · ${demand.title}`, { exact: true });
    const first = () => row(page, candidate, demands[0]);
    const firstStage = () => stage(page, candidate, demands[0]);
    const secondStage = () => stage(page, candidate, demands[1]);
    const isApplicationPut = response => response.url().endsWith('/recruitment/applications') && response.request().method() === 'PUT';
    const waitUntilEditable = (target, demand) => target.waitForFunction(label => {
      const element = [...document.querySelectorAll('select')].find(item => item.getAttribute('aria-label') === label);
      return element && !element.disabled;
    }, `Статус подбора · ${demand.title}`);
    let putCount = 0;
    page.on('request', outgoing => { if (outgoing.url().endsWith('/recruitment/applications') && outgoing.method() === 'PUT') putCount++; });
    async function chooseStage(target, person, demand, value, expectedStatus = 200) {
      const responsePromise = target.waitForResponse(isApplicationPut);
      await stage(target, person, demand).selectOption(value);
      const response = await responsePromise;
      assert.equal(response.status(), expectedStatus, await response.text());
      if (expectedStatus === 200) {
        await row(target, person, demand).getByText('Статус сохранён', { exact: true }).waitFor();
        await waitUntilEditable(target, demand);
      }
      return response.json();
    }
    await page.getByLabel('Город кандидата', { exact: true }).selectOption('Тула');
    await page.getByLabel('Рекрутер', { exact: true }).selectOption(ids.dispatcher);
    await page.getByLabel('Поиск', { exact: true }).fill('Тест быстрого статуса');
    await firstStage().waitFor();
    assert.equal(await card(page, candidate).locator('.recruitment-quick-stage').count(), 2);
    assert.equal(await firstStage().inputValue(), 'new');
    assert.equal(await secondStage().inputValue(), 'contact');
    await first().getByText(demands[0].title, { exact: true }).waitFor();
    await row(page, candidate, demands[1]).getByText(demands[1].title, { exact: true }).waitFor();
    await firstStage().scrollIntoViewIfNeeded();
    const mountedCard = await card(page, candidate).elementHandle();
    const mountedGrid = await page.locator('.recruitment-worklist').elementHandle();
    const mountedSelect = await firstStage().elementHandle();
    const scrollBefore = await firstStage().evaluate(element => {
      const ancestors = [];
      for (let node = element.parentElement; node; node = node.parentElement) {
        if (node.scrollHeight > node.clientHeight && node.scrollTop) ancestors.push({ node, top: node.scrollTop });
      }
      window.__quickStageScroll = ancestors;
      return ancestors.map(({ top }) => top);
    });
    assert.ok(scrollBefore.some(value => value > 0), 'the status is tested in an actually scrolled list');
    let markIntercepted;
    const intercepted = new Promise(resolve => { markIntercepted = resolve; });
    const pendingGate = new Promise(resolve => { releasePending = resolve; });
    const delaySave = async route => {
      if (route.request().method() !== 'PUT') return route.continue();
      markIntercepted();
      await pendingGate;
      await route.continue();
    };
    await page.route('**/recruitment/applications', delaySave);
    const pendingResponse = page.waitForResponse(isApplicationPut);
    await firstStage().selectOption('interview');
    await intercepted;
    await first().getByText('Сохраняем…', { exact: true }).waitFor();
    assert.equal(await firstStage().isDisabled(), true, 'the saving application is locked');
    assert.equal(await first().getByText('Статус сохранён', { exact: true }).count(), 0, 'no success before the response');
    assert.equal(await page.getByRole('dialog').count(), 0);
    releasePending(); releasePending = null;
    const savedResponse = await pendingResponse;
    assert.equal(savedResponse.status(), 200, await savedResponse.text());
    const saved = await savedResponse.json();
    await first().getByText('Статус сохранён', { exact: true }).waitFor();
    await waitUntilEditable(page, demands[0]);
    await page.unroute('**/recruitment/applications', delaySave);
    assert.equal(saved.id, applications[0].id);
    assert.equal(saved.version, applications[0].version + 1);
    assert.equal(saved.stage, 'interview');
    assert.equal(saved.reason, applications[0].reason, 'quick changes preserve other application fields');
    assert.equal(await mountedCard.evaluate(element => element.isConnected), true, 'candidate row stays mounted');
    assert.equal(await mountedGrid.evaluate(element => element.isConnected), true, 'candidate table stays mounted');
    assert.equal(await mountedSelect.evaluate(element => element.isConnected), true, 'focused control stays mounted');
    const scrollAfter = await page.evaluate(() => window.__quickStageScroll.map(({ node, top }) => ({ connected: node.isConnected, before: top, after: node.scrollTop })));
    assert.ok(scrollAfter.every(({ connected, before, after }) => connected && Math.abs(after - before) <= 2), `scroll is retained: ${JSON.stringify(scrollAfter)}`);
    assert.equal(await page.getByLabel('Поиск', { exact: true }).inputValue(), 'Тест быстрого статуса');
    assert.equal(await page.getByLabel('Город кандидата', { exact: true }).inputValue(), 'Тула');
    assert.equal(await page.getByLabel('Рекрутер', { exact: true }).inputValue(), ids.dispatcher);
    const afterOrdinary = await snapshot();
    assert.deepEqual(afterOrdinary.applications.find(item => item.id === applications[1].id), applications[1], 'the second application is unchanged');
    const events = afterOrdinary.events.filter(item => item.applicationId === applications[0].id);
    assert.equal(events.length, initialEvents.length + 1);
    assert.deepEqual(events.slice(0, initialEvents.length), initialEvents, 'existing stage history is immutable');
    assert.equal(events.at(-1).fromStage, 'new');
    assert.equal(events.at(-1).toStage, 'interview');
    assert.equal(events.at(-1).actorId, ids.admin);
    await page.screenshot({ path: path.join(out, 'quick-status-desktop.png'), fullPage: true });
    console.log('PASS ordinary status saves only the selected application, records history and retains filters, DOM and scroll');

    const beforeSpecial = putCount;
    await firstStage().selectOption('hired');
    const date = first().getByLabel('Дата выхода в работу', { exact: true });
    await date.waitFor();
    assert.equal(await date.getAttribute('required') !== null, true);
    assert.equal(await page.getByRole('dialog').count(), 0);
    await date.fill('');
    await first().getByRole('button', { name: 'Сохранить статус', exact: true }).click();
    assert.equal(await date.evaluate(element => element.validity.valueMissing), true);
    assert.equal(putCount, beforeSpecial, 'required hire date blocks a write');
    await date.fill('2026-09-25');
    await first().getByRole('button', { name: 'Отмена', exact: true }).click();
    assert.equal(await firstStage().inputValue(), 'interview');
    assert.equal(await date.count(), 0);
    assert.equal(putCount, beforeSpecial, 'cancel does not write');
    await firstStage().selectOption('hired');
    await date.fill('2026-09-25');
    const hireResponse = page.waitForResponse(isApplicationPut);
    await first().getByRole('button', { name: 'Сохранить статус', exact: true }).click();
    const hired = await hireResponse;
    assert.equal(hired.status(), 200, await hired.text());
    assert.equal((await hired.json()).startDate, '2026-09-25');
    await first().getByText('Статус сохранён', { exact: true }).waitFor();
    await waitUntilEditable(page, demands[0]);
    assert.equal(await firstStage().inputValue(), 'hired');
    assert.equal(await date.count(), 0);

    const second = () => row(page, candidate, demands[1]);
    const beforeRejection = putCount;
    await secondStage().selectOption('rejected');
    const reason = second().getByLabel('Причина отказа', { exact: true });
    await reason.waitFor();
    assert.equal(await reason.getAttribute('required') !== null, true);
    await reason.fill('');
    await second().getByRole('button', { name: 'Сохранить статус', exact: true }).click();
    assert.equal(await reason.evaluate(element => element.validity.valueMissing), true);
    assert.equal(putCount, beforeRejection, 'required rejection reason blocks a write');
    await reason.fill('   ');
    await second().getByRole('button', { name: 'Сохранить статус', exact: true }).click();
    await second().getByRole('alert').waitFor();
    assert.equal(putCount, beforeRejection, 'whitespace-only reasons are not saved');
    await reason.fill('Синтетический кандидат выбрал другой проект');
    const rejectionResponse = page.waitForResponse(isApplicationPut);
    await second().getByRole('button', { name: 'Сохранить статус', exact: true }).click();
    const rejected = await rejectionResponse;
    assert.equal(rejected.status(), 200, await rejected.text());
    assert.equal((await rejected.json()).reason, 'Синтетический кандидат выбрал другой проект');
    await second().getByText('Статус сохранён', { exact: true }).waitFor();
    await waitUntilEditable(page, demands[1]);
    assert.equal(await firstStage().inputValue(), 'hired');
    console.log('PASS hire and rejection use inline required fields; cancel leaves the stored stage unchanged');

    const beforeFailure = (await snapshot()).applications.find(item => item.id === applications[0].id);
    const failSave = async route => route.request().method() === 'PUT'
      ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'Синтетическая ошибка сохранения' }) })
      : route.continue();
    await page.route('**/recruitment/applications', failSave);
    await chooseStage(page, candidate, demands[0], 'reserve', 500);
    await first().getByRole('alert').waitFor();
    assert.equal(await first().getByText('Статус сохранён', { exact: true }).count(), 0);
    assert.equal(await firstStage().inputValue(), 'hired', 'failed save restores the confirmed stage');
    assert.equal(await firstStage().isEnabled(), true, 'a temporary error permits retry');
    assert.deepEqual((await snapshot()).applications.find(item => item.id === applications[0].id), beforeFailure);
    await page.unroute('**/recruitment/applications', failSave);
    const retried = await chooseStage(page, candidate, demands[0], 'reserve');
    assert.equal(retried.version, beforeFailure.version + 1);
    assert.equal(await first().getByRole('alert').count(), 0);
    console.log('PASS failed saves show a local error without false success and can be retried');

    const beforeConflict = (await snapshot()).applications.find(item => item.id === applications[0].id);
    const concurrent = await save('applications', { ...beforeConflict, stage: 'contact', reason: 'Изменение другого рекрутера' });
    await chooseStage(page, candidate, demands[0], 'interview', 409);
    await first().getByRole('alert').waitFor();
    assert.equal(await firstStage().isDisabled(), true, 'conflicted row requires explicit refresh');
    assert.equal(await secondStage().isEnabled(), true, 'a conflict is local to one row');
    assert.equal(await first().getByText('Статус сохранён', { exact: true }).count(), 0);
    assert.deepEqual((await snapshot()).applications.find(item => item.id === applications[0].id), concurrent, 'stale client cannot overwrite another recruiter');
    await secondStage().selectOption('hired');
    const otherDate = second().getByLabel('Дата выхода в работу', { exact: true });
    await otherDate.fill('2026-09-28');
    assert.equal(await firstStage().isDisabled(), true, 'editing another row cannot unlock a conflict');
    assert.deepEqual(dialogs, [], 'ordinary changes and inline editing have not required any dialog');
    await first().getByRole('button', { name: 'Обновить данные', exact: true }).click();
    assert.equal(dialogs.length, 1, 'refreshing another row asks before discarding an unsaved draft');
    assert.match(dialogs[0], /несохранённые изменения/);
    assert.equal(await otherDate.inputValue(), '2026-09-28', 'dismissed refresh preserves the other row draft');
    assert.equal(await firstStage().isDisabled(), true, 'dismissed refresh preserves the existing conflict');
    await second().getByRole('button', { name: 'Отмена', exact: true }).click();
    assert.equal(await firstStage().isDisabled(), true, 'cancelling another row cannot unlock a conflict');
    await first().getByRole('button', { name: 'Обновить данные', exact: true }).click();
    await firstStage().waitFor({ state: 'visible' });
    await page.waitForFunction(label => {
      const element = document.querySelector(`select[aria-label="${label}"]`);
      return element && element.value === 'contact' && !element.disabled;
    }, `Статус подбора · ${demands[0].title}`);
    assert.equal(await first().getByRole('alert').count(), 0);
    const afterRefresh = await chooseStage(page, candidate, demands[0], 'interview');
    assert.equal(afterRefresh.version, concurrent.version + 1, 'refresh adopts the current optimistic-lock version');
    assert.equal(afterRefresh.reason, concurrent.reason, 'refresh preserves the concurrent edit');
    assert.equal(await page.getByLabel('Поиск', { exact: true }).inputValue(), 'Тест быстрого статуса');
    console.log('PASS 409 preserves concurrent edits and explicit refresh enables a new save');

    // The full candidate card uses the same inline editor for each distinct application.
    await card(page, candidate).getByRole('button', { name: candidate.fullName, exact: true }).click();
    const detail = page.getByRole('dialog', { name: `Карточка ${candidate.fullName}`, exact: true });
    const detailStage = demand => detail.getByLabel(`Статус подбора · ${demand.title}`, { exact: true });
    await detailStage(demands[0]).waitFor();
    assert.equal(await detail.locator('.recruitment-quick-stage').count(), 2);
    assert.equal(await detailStage(demands[0]).inputValue(), 'interview');
    assert.equal(await detailStage(demands[1]).inputValue(), 'rejected');
    const detailSaving = page.waitForResponse(isApplicationPut);
    await detailStage(demands[0]).selectOption('qualified');
    const detailResponse = await detailSaving;
    assert.equal(detailResponse.status(), 200, await detailResponse.text());
    assert.equal((await detailResponse.json()).id, applications[0].id);
    await detail.getByText('Статус сохранён', { exact: true }).waitFor();
    assert.equal(await detailStage(demands[1]).inputValue(), 'rejected', 'The other application in the full card is unchanged');
    assert.equal(await page.getByRole('dialog').count(), 1, 'Changing stage does not open another form');
    await page.waitForFunction(label => {
      const control = document.querySelector(`[role="dialog"] select[aria-label="${label}"]`);
      return control && !control.disabled;
    }, `Статус подбора · ${demands[0].title}`);
    const detailBeforeConflict = (await snapshot()).applications.find(item => item.id === applications[0].id);
    const detailConcurrent = await save('applications', { ...detailBeforeConflict, stage: 'interview', reason: 'Параллельное изменение при открытой карточке' });
    let detailPending = page.waitForResponse(isApplicationPut);
    await detailStage(demands[0]).selectOption('reserve');
    assert.equal((await detailPending).status(), 409);
    await detail.getByRole('alert').waitFor();
    assert.equal(await detailStage(demands[0]).isDisabled(), true);
    await detail.getByRole('button', { name: 'Обновить данные', exact: true }).click();
    await page.waitForFunction(label => {
      const control = document.querySelector(`[role="dialog"] select[aria-label="${label}"]`);
      return control && control.value === 'interview' && !control.disabled;
    }, `Статус подбора · ${demands[0].title}`);
    detailPending = page.waitForResponse(isApplicationPut);
    await detailStage(demands[0]).selectOption('qualified');
    const detailRetried = await detailPending;
    assert.equal(detailRetried.status(), 200, await detailRetried.text());
    const detailSaved = await detailRetried.json();
    assert.equal(detailSaved.version, detailConcurrent.version + 1);
    assert.equal(detailSaved.reason, detailConcurrent.reason);
    await detail.getByText('Статус сохранён', { exact: true }).waitFor();
    await detail.getByRole('button', { name: 'Закрыть карточку', exact: true }).click();
    assert.equal(await firstStage().inputValue(), 'qualified', 'The candidate list reflects the confirmed detail edit');
    console.log('PASS full candidate detail changes only the selected application inline; conflict refresh preserves the concurrent version and fields');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByLabel('Поиск', { exact: true }).fill(candidate.fullName);
    await firstStage().selectOption('hired');
    await first().getByLabel('Дата выхода в работу', { exact: true }).waitFor();
    await first().scrollIntoViewIfNeeded();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'inline editor and long request title fit mobile');
    await page.screenshot({ path: path.join(out, 'quick-status-mobile.png'), fullPage: true });
    await first().getByRole('button', { name: 'Отмена', exact: true }).click();

    const externalId = randomUUID();
    await db.query(`INSERT INTO users(id,display_name,role,active,approved) VALUES($1,'Внешний рекрутер · быстрый статус','external_recruiter',true,true)`, [externalId]);
    await db.query(`INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id,personal_data_visible)
      VALUES($1,$2,$3,$4,$5,true)`, [externalId, ids.legal, ids.region, ids.project, ids.scope]);
    const grant = await save('access', { responsibilityScopeId: ids.scope, userId: externalId, requestIds: demands.map(item => item.id), status: 'active', expiresAt: null, version: 0 });
    const external = await fixture.devLogin(externalId);
    const own = await save('candidates', { ...base(), fullName: 'Свой тестовый кандидат внешнего рекрутера', phone: '+79990102202',
      city: 'Тула', kind: 'driver', recruiterId: externalId, source: 'manual' }, external.accessToken);
    const ownApplication = await save('applications', { ...base(), candidateId: own.id, requestId: demands[0].id, recruiterId: externalId, stage: 'new' }, external.accessToken);
    const externalPage = await newPage(external, { width: 390, height: 844 });
    await stage(externalPage, own, demands[0]).waitFor();
    assert.equal(await externalPage.getByText(candidate.fullName, { exact: true }).count(), 0, 'company candidate is absent');
    assert.equal(await externalPage.locator('.recruitment-worklist tbody tr').count(), 1);
    const externalSaved = await chooseStage(externalPage, own, demands[0], 'contact');
    assert.equal(externalSaved.id, ownApplication.id);
    assert.equal(externalSaved.recruiterId, externalId);
    const forbidden = await request('PUT', '/recruitment/applications', { ...afterRefresh, stage: 'reserve', recruiterId: externalId }, external.accessToken);
    assert.equal(forbidden.status, 403, 'foreign application writes remain protected by the API');
    assert.ok(await externalPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'external quick stage fits mobile');
    await save('access', { ...grant, responsibilityScopeId: ids.scope, status: 'revoked' });
    await chooseStage(externalPage, own, demands[0], 'interview', 403);
    await externalPage.getByRole('alert').filter({ hasText: 'Доступ к потребностям мог быть отозван или его срок истёк' }).waitFor();
    assert.equal(await externalPage.locator('.recruitment-worklist tbody tr').count(), 0, 'revoked access clears candidate data');
    const persistedOwn = (await snapshot()).applications.find(item => item.id === ownApplication.id);
    assert.equal(persistedOwn.stage, 'contact', 'revoked recruiter cannot change their previously visible application');
    assert.equal(persistedOwn.version, externalSaved.version);
    assert.deepEqual(errors, []);
    assert.equal(dialogs.length, 1, 'only cross-row refresh with unsaved changes required confirmation');
    console.log('PASS mobile inline edits, external ownership and revoked-access protection');
  } finally {
    releasePending?.();
    if (browser) await browser.close();
    await fixture.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
