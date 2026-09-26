'use strict';
// Real API + disposable PostgreSQL; synthetic candidates only, never the local app database.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createTestServer } = require('./local-test-server.cjs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const fixture = await createTestServer({ builtFrontend: process.env.RECRUITMENT_BUILT_FRONTEND === 'true' });
  const out = path.resolve(__dirname, '../.local/recruitment-demand-candidates-browser-qa');
  let browser;
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
    const base = () => ({ id: randomUUID(), responsibilityScopeId: ids.scope, version: 0 });
    const demands = [];
    for (const title of ['ЮРАЛ · тест', 'АШАН · тест']) demands.push(await save('requests', {
      ...base(), title, city: 'Москва', kind: 'driver', quantity: 2, priority: 'normal', status: 'open', recruiterId: ids.admin,
    }));
    await save('requests', { ...base(), title: 'Без привязок · тест', city: 'Москва', kind: 'driver', quantity: 1,
      priority: 'normal', status: 'open', recruiterId: ids.admin });
    const candidate = await save('candidates', { ...base(), fullName: 'Тестовый кандидат на два проекта', phone: '+79990101101',
      city: 'Тула', kind: 'driver', recruiterId: ids.dispatcher, source: 'manual' });
    const applications = [];
    for (let index = 0; index < demands.length; index++) applications.push(await save('applications', {
      ...base(), candidateId: candidate.id, requestId: demands[index].id, recruiterId: ids.dispatcher, stage: index ? 'contact' : 'new',
    }));
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
    await tabs.getByRole('button', { name: 'Кандидаты', exact: true }).click();
    await page.getByLabel('Город кандидата', { exact: true }).selectOption('Тула');
    await page.getByLabel('Рекрутер', { exact: true }).selectOption(ids.dispatcher);
    await page.getByLabel('Поиск', { exact: true }).fill(candidate.fullName);
    await page.getByRole('button', { name: candidate.fullName, exact: true }).waitFor();
    await tabs.getByRole('button', { name: 'Потребности', exact: true }).click();
    assert.equal(await page.getByLabel('Поиск', { exact: true }).inputValue(), '');
    assert.equal(await page.getByLabel('Город потребности', { exact: true }).inputValue(), '');
    assert.equal(await page.getByLabel('Ответственный за потребность', { exact: true }).inputValue(), '');
    const card = (target, demand) => target.locator('.recruitment-request-card').filter({ has: target.getByRole('heading', { name: demand.title, exact: true }) });
    const count = target => target.locator('dt').filter({ hasText: /^Кандидатов$/ }).locator('xpath=following-sibling::dd[1]');
    const detail = (target, demand) => target.getByRole('dialog', { name: `Потребность ${demand.title}`, exact: true });
    async function expectCards(target, name, stages) {
      for (let index = 0; index < demands.length; index++) {
        const row = card(target, demands[index]);
        await row.getByText(name, { exact: true }).waitFor();
        await row.getByText(stages[index], { exact: true }).waitFor();
        assert.equal(await count(row).textContent(), '1', `one saved link for ${demands[index].title}`);
      }
    }
    await expectCards(page, candidate.fullName, ['Новый', 'Первый контакт']);
    assert.equal(await page.locator('.recruitment-request-card').count(), 3);
    await page.getByRole('checkbox', { name: 'С кандидатами', exact: true }).check();
    assert.equal(await page.locator('.recruitment-request-card').count(), 2);
    assert.equal(await page.getByRole('heading', { name: 'Без привязок · тест', exact: true }).count(), 0);
    await page.getByLabel('Город потребности', { exact: true }).selectOption('Москва');
    await expectCards(page, candidate.fullName, ['Новый', 'Первый контакт']);
    assert.equal(await page.locator('.recruitment-request-card').count(), 2);
    for (const [label, expected] of [['Кандидаты', '1'], ['Подборы', '2'], ['Потребности с кандидатами', '2']]) {
      assert.equal(await page.locator('.recruitment-metric').filter({ has: page.getByText(label, { exact: true }) }).locator('strong').textContent(), expected);
    }
    await tabs.getByRole('button', { name: 'Кандидаты', exact: true }).click();
    assert.equal(await page.getByLabel('Поиск', { exact: true }).inputValue(), candidate.fullName);
    assert.equal(await page.getByLabel('Город кандидата', { exact: true }).inputValue(), 'Тула');
    assert.equal(await page.getByLabel('Рекрутер', { exact: true }).inputValue(), ids.dispatcher);
    await tabs.getByRole('button', { name: 'Потребности', exact: true }).click();
    assert.equal(await page.getByLabel('Город потребности', { exact: true }).inputValue(), 'Москва');
    assert.equal(await page.getByRole('checkbox', { name: 'С кандидатами', exact: true }).isChecked(), true);
    await expectCards(page, candidate.fullName, ['Новый', 'Первый контакт']);
    await page.screenshot({ path: path.join(out, 'two-demand-cards-desktop.png'), fullPage: true });
    for (let index = 0; index < demands.length; index++) {
      await card(page, demands[index]).getByRole('button', { name: 'Подробнее о потребности', exact: true }).click();
      const dialog = detail(page, demands[index]);
      await dialog.getByText(candidate.fullName, { exact: true }).waitFor();
      await dialog.getByText(index ? 'Первый контакт' : 'Новый', { exact: true }).waitFor();
      await dialog.getByRole('button', { name: 'Закрыть потребность', exact: true }).click();
    }
    console.log('PASS one candidate appears in both demand cards and details despite a different candidate city');

    await card(page, demands[0]).getByRole('button', { name: 'Подробнее о потребности', exact: true }).click();
    await detail(page, demands[0]).getByRole('button', { name: 'Открыть кандидата', exact: true }).click();
    const candidateDialog = page.getByRole('dialog', { name: `Карточка ${candidate.fullName}`, exact: true });
    await candidateDialog.getByRole('heading', { name: candidate.fullName, exact: true }).waitFor();
    await candidateDialog.getByRole('button', { name: 'Закрыть карточку', exact: true }).click();
    await card(page, demands[0]).getByRole('button', { name: 'Подробнее о потребности', exact: true }).click();
    await detail(page, demands[0]).getByRole('button', { name: 'Изменить этап', exact: true }).click();
    const form = page.getByRole('dialog');
    assert.equal(await form.getByLabel('Потребность', { exact: true }).inputValue(), demands[0].id);
    assert.equal(await form.getByLabel('Кандидат', { exact: true }).inputValue(), candidate.id);
    await form.getByLabel('Этап подбора', { exact: true }).selectOption('interview');
    const changedResponse = page.waitForResponse(response => response.url().endsWith('/recruitment/applications') && response.request().method() === 'PUT');
    await form.getByRole('button', { name: 'Сохранить', exact: true }).click();
    const changed = await changedResponse;
    assert.equal(changed.status(), 200, await changed.text());
    const saved = await changed.json();
    assert.equal(saved.id, applications[0].id);
    assert.equal(saved.stage, 'interview');
    await page.getByRole('heading', { name: 'Подбор кандидата', exact: true }).waitFor({ state: 'hidden' });
    if (await detail(page, demands[0]).count()) {
      await detail(page, demands[0]).getByText('Собеседование', { exact: true }).waitFor();
      await detail(page, demands[0]).getByRole('button', { name: 'Закрыть потребность', exact: true }).click();
    } else await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await expectCards(page, candidate.fullName, ['Собеседование', 'Первый контакт']);
    const snapshot = await request('GET', `/recruitment?responsibilityScopeId=${ids.scope}`, undefined, admin.accessToken);
    assert.equal(snapshot.status, 200);
    assert.deepEqual(snapshot.body.applications.filter(item => item.candidateId === candidate.id).map(item => [item.requestId, item.stage]).sort(),
      [[demands[0].id, 'interview'], [demands[1].id, 'contact']].sort());
    await page.setViewportSize({ width: 390, height: 844 });
    await card(page, demands[0]).getByRole('button', { name: 'Подробнее о потребности', exact: true }).click();
    await detail(page, demands[0]).getByText(candidate.fullName, { exact: true }).scrollIntoViewIfNeeded();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'candidate links fit mobile');
    await page.screenshot({ path: path.join(out, 'demand-candidates-mobile.png'), fullPage: true });
    console.log('PASS demand links open candidate, update only selected application and fit mobile');

    const externalId = randomUUID();
    await db.query(`INSERT INTO users(id,display_name,role,active,approved) VALUES($1,'Внешний рекрутер · связи','external_recruiter',true,true)`, [externalId]);
    await db.query(`INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id,personal_data_visible)
      VALUES($1,$2,$3,$4,$5,true)`, [externalId, ids.legal, ids.region, ids.project, ids.scope]);
    await save('access', { responsibilityScopeId: ids.scope, userId: externalId, requestIds: demands.map(item => item.id), status: 'active', expiresAt: null, version: 0 });
    const external = await fixture.devLogin(externalId);
    const own = await save('candidates', { ...base(), fullName: 'Свой кандидат внешнего рекрутера', phone: '+79990101102',
      city: 'Калуга', kind: 'driver', recruiterId: externalId, source: 'manual' }, external.accessToken);
    for (const demand of demands) await save('applications', { ...base(), candidateId: own.id, requestId: demand.id, recruiterId: externalId, stage: 'new' }, external.accessToken);
    const extContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await extContext.addInitScript(session => sessionStorage.setItem('ecl.session.v2', JSON.stringify({ session })), { ...external, rememberedDevice: false });
    const externalPage = await extContext.newPage();
    externalPage.setDefaultTimeout(15000);
    externalPage.on('pageerror', error => errors.push(error.message));
    await externalPage.goto(`${fixture.origin}/?section=recruitment`);
    await externalPage.getByRole('navigation', { name: 'Разделы рекрутинга' }).getByRole('button', { name: 'Потребности', exact: true }).click();
    await externalPage.getByLabel('Город потребности', { exact: true }).selectOption('Москва');
    await expectCards(externalPage, own.fullName, ['Новый', 'Новый']);
    assert.equal(await externalPage.getByText(candidate.fullName, { exact: true }).count(), 0);
    for (const demand of demands) {
      await card(externalPage, demand).getByRole('button', { name: 'Подробнее о потребности', exact: true }).click();
      await detail(externalPage, demand).getByText(own.fullName, { exact: true }).waitFor();
      assert.equal(await detail(externalPage, demand).getByText(candidate.fullName, { exact: true }).count(), 0);
      await detail(externalPage, demand).getByRole('button', { name: 'Закрыть потребность', exact: true }).click();
    }
    assert.deepEqual(errors, []);
    console.log('PASS external recruiter sees own links in both demands and no company candidate identity');
  } finally {
    if (browser) await browser.close();
    await fixture.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
