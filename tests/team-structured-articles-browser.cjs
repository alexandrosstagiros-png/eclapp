'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createTestServer } = require('./local-test-server.cjs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

// Every organization position, draft and article below belongs to an isolated
// synthetic fixture. The persistent local application's data is never read.
(async () => {
  const fixture = await createTestServer({ staffTeamActors: true, builtFrontend: process.env.TEAM_BUILT_FRONTEND === 'true' });
  let browser;
  try {
    const { ids, adminPool } = fixture;
    const sameCompanyScope = randomUUID();
    // Keep the seed's «Дневная группа» first in the server's named work-context
    // ordering, while retaining another scope to test company-wide audiences.
    await adminPool.query("INSERT INTO responsibility_scopes(id,project_id,name) VALUES($1,$2,'Я · Вторая учебная область')", [sameCompanyScope, ids.project]);
    await adminPool.query('INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id) VALUES($1,$2,$3,$4,$5)', [ids.admin, ids.legal, ids.region, ids.project, sameCompanyScope]);
    async function addCompany(name) {
      const legalId = randomUUID(), projectId = randomUUID(), scopeId = randomUUID();
      await adminPool.query('INSERT INTO legal_entities(id,name) VALUES($1,$2)', [legalId, name]);
      await adminPool.query('INSERT INTO projects(id,name,legal_entity_id,region_id) VALUES($1,$2,$3,$4)', [projectId, name, legalId, ids.region]);
      await adminPool.query('INSERT INTO responsibility_scopes(id,project_id,name) VALUES($1,$2,$3)', [scopeId, projectId, name]);
      await adminPool.query('INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id) VALUES($1,$2,$3,$4,$5)', [ids.admin, legalId, ids.region, projectId, scopeId]);
      return scopeId;
    }
    const foreignScope = await addCompany('Чужая учебная компания');
    const emptyScope = await addCompany('Я · Компания без должностей');
    // New articles use the account's work context; the unified UI has no project
    // selector. Give the empty-company scenario its own administrator so its
    // audience and inline position are exercised in the intended company.
    const emptyAdministratorId = randomUUID();
    await adminPool.query("INSERT INTO users(id,display_name,role,active,approved) VALUES($1,'Администратор компании без должностей','access_admin',true,true)", [emptyAdministratorId]);
    await adminPool.query(`INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id)
      SELECT $1,legal_entity_id,region_id,project_id,responsibility_scope_id FROM access_grants
      WHERE user_id=$2 AND responsibility_scope_id=$3`, [emptyAdministratorId, ids.admin, emptyScope]);
    await adminPool.query('UPDATE access_grants SET personal_data_visible=true WHERE user_id=ANY($1::uuid[]) AND responsibility_scope_id=$2', [[ids.admin, ids.dispatcher], ids.scope]);
    const admin = await fixture.devLogin(ids.admin), editor = await fixture.devLogin(ids.dispatcher), emptyAdmin = await fixture.devLogin(emptyAdministratorId);
    const ok = result => { assert.ok([200, 201].includes(result.status), `HTTP ${result.status}: ${JSON.stringify(result.body)}`); return result.body; };
    const api = async (method, route, body, session = admin) => ok(await fixture.request(method, route, body, session.accessToken));
    async function position(scope, title) {
      const id = randomUUID();
      return api('PUT', `/team/organization/positions/${id}`, { responsibilityScopeId: scope, operationId: randomUUID(), version: 0, title });
    }
    const dispatcherPosition = await position(ids.scope, 'Диспетчер перевозок');
    const supervisorPosition = await position(sameCompanyScope, 'Руководитель второй области');
    const foreignPosition = await position(foreignScope, 'Чужая должность');
    await api('PUT', '/team/knowledge-permissions', { responsibilityScopeId: ids.scope, userId: ids.dispatcher, canCreate: false, canEdit: true });
    browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
    const output = path.resolve(__dirname, '../.local/team-structured-articles-qa');
    await fs.mkdir(output, { recursive: true });
    const errors = [];
    async function openKnowledge(page) {
      await page.getByRole('navigation', { name: 'Разделы команды' }).getByRole('button', { name: 'База знаний', exact: true }).click();
      await page.getByLabel('Поиск по базе знаний', { exact: true }).waitFor();
    }
    async function pageFor(session, mobile = false) {
      const context = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 1000 } });
      await context.addInitScript(value => sessionStorage.setItem('ecl.session.v2', JSON.stringify({ session: value })), { ...session, rememberedDevice: false });
      const page = await context.newPage();
      page.setDefaultTimeout(20000);
      page.articleSaveRequests = [];
      page.on('request', request => {
        if (request.method() === 'PUT' && new URL(request.url()).pathname === '/api/v1/team/articles') page.articleSaveRequests.push(request.postDataJSON());
      });
      page.on('pageerror', error => errors.push(error.message));
      page.on('dialog', dialog => dialog.accept());
      await page.goto(`${fixture.origin}/?section=team`);
      await openKnowledge(page);
      return page;
    }
    const field = (page, name) => page.getByLabel(name, { exact: true });
    const saveButton = page => page.getByRole('button', { name: 'Сохранить статью', exact: true });
    async function assertRequired(page, label) {
      assert.equal(await field(page, label).evaluate(node => node.validity.valueMissing), true, `${label} must reject an empty value`);
      const before = page.articleSaveRequests.length;
      if (await saveButton(page).isEnabled()) await saveButton(page).click();
      assert.equal(page.articleSaveRequests.length, before, 'Browser validation must prevent a save request');
    }
    const metadata = (page, label) => page.locator('dt').filter({ hasText: new RegExp(`^${label}$`) }).locator('xpath=following-sibling::dd[1]');
    const articleTitle = 'Передача смены диспетчеру';
    const values = {
      'Тема': articleTitle,
      'Причина создания': 'Требуется единый порядок передачи смены.',
      'Задача создания': 'Передать смену следующему диспетчеру без пропусков.',
      'Текст': 'Проверьте текущие рейсы. Передайте сведения следующему диспетчеру.',
      'Результат': 'Следующий диспетчер подтвердил получение смены.',
    };
    async function newArticle(page, scope) {
      const positions = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/team/article-positions'
        && new URL(response.url()).searchParams.get('responsibilityScopeId') === scope && response.request().method() === 'GET');
      await page.getByRole('button', { name: 'Новая статья', exact: true }).click();
      await field(page, 'Тема').waitFor();
      assert.equal((await positions).status(), 200, 'The audience directory must load from the expected work context');
      assert.equal(await field(page, 'Проект').count(), 0, 'The unified editor has no project selector');
    }
    async function selectArticle(page) {
      await page.locator('.team-knowledge-results .team-article-item').filter({ hasText: articleTitle }).click();
      await page.getByRole('heading', { name: articleTitle, exact: true }).waitFor();
    }
    async function editArticle(page) {
      await page.getByRole('button', { name: 'Действия инструкции', exact: true }).click();
      await page.getByRole('menuitem', { name: 'Редактировать', exact: true }).click();
      await field(page, 'Тема').waitFor();
      await page.waitForFunction(() => {
        const select = document.querySelector('.team-article-audience select');
        return select && !select.disabled;
      });
    }
    async function save(page) {
      const pending = page.waitForResponse(response => response.request().method() === 'PUT' && new URL(response.url()).pathname === '/api/v1/team/articles');
      await saveButton(page).click();
      const response = await pending;
      assert.equal(response.status(), 200);
      await page.getByRole('heading', { name: articleTitle, exact: true }).waitFor();
      return response.json();
    }
    const emptyAdministrator = await pageFor(emptyAdmin);
    await newArticle(emptyAdministrator, emptyScope);
    await field(emptyAdministrator, 'Тема').fill('Несохранённый учебный черновик');
    await field(emptyAdministrator, 'Причина создания').fill('Черновик должен остаться после добавления должности.');
    assert.equal(await field(emptyAdministrator, 'Для кого').locator('option[value]:not([value=""])').count(), 0);
    await emptyAdministrator.getByRole('button', { name: 'Добавить должность', exact: true }).click();
    await field(emptyAdministrator, 'Название должности').fill('Новая учебная должность');
    const pendingPosition = emptyAdministrator.waitForResponse(response => response.request().method() === 'PUT' && /\/team\/organization\/positions\/[^/]+$/.test(new URL(response.url()).pathname));
    await emptyAdministrator.getByRole('button', { name: 'Сохранить должность', exact: true }).click();
    const positionResponse = await pendingPosition;
    assert.equal(positionResponse.status(), 200);
    assert.equal(positionResponse.request().postDataJSON().responsibilityScopeId, emptyScope);
    assert.equal(await field(emptyAdministrator, 'Тема').inputValue(), 'Несохранённый учебный черновик');
    assert.equal(await field(emptyAdministrator, 'Причина создания').inputValue(), 'Черновик должен остаться после добавления должности.');
    assert.equal((await api('GET', `/team/article-positions?responsibilityScopeId=${emptyScope}`)).positions.length, 1);
    await emptyAdministrator.getByRole('button', { name: 'Отменить', exact: true }).click();
    await emptyAdministrator.context().close();
    assert.equal((await api('GET', '/team/articles')).articles.length, 0);
    console.log('PASS empty-company inline position creation preserves the unsaved article draft');

    const administrator = await pageFor(admin);
    await newArticle(administrator, ids.scope);
    assert.equal(await metadata(administrator, 'Автор').textContent(), admin.actor.displayName);
    assert.equal((await metadata(administrator, 'Версия').textContent()).trim(), '1');
    await assertRequired(administrator, 'Тема');
    for (const [label, value] of Object.entries(values)) await field(administrator, label).fill(value);
    await assertRequired(administrator, 'Для кого');
    const audience = field(administrator, 'Для кого');
    await audience.locator(`option[value="${dispatcherPosition.id}"]`).waitFor({ state: 'attached' });
    assert.equal(await audience.locator(`option[value="${supervisorPosition.id}"]`).count(), 1, 'Company positions include a second authorized scope');
    assert.equal(await audience.locator(`option[value="${foreignPosition.id}"]`).count(), 0, 'Another company position cannot be selected');
    await audience.selectOption(dispatcherPosition.id);
    assert.equal(await audience.inputValue(), '', 'Adding one audience position resets the chooser');
    await audience.selectOption(supervisorPosition.id);
    for (const [label, value] of Object.entries(values)) {
      await field(administrator, label).fill('');
      await assertRequired(administrator, label);
      await field(administrator, label).fill(value);
    }
    await administrator.screenshot({ path: path.join(output, 'structured-editor-desktop.png'), fullPage: true });
    const created = await save(administrator);
    assert.equal(created.structured, true);
    assert.equal(administrator.articleSaveRequests.at(-1).responsibilityScopeId, ids.scope);
    assert.equal(created.version, 1);
    assert.equal(created.authorId, admin.actor.id);
    assert.equal(created.updatedByName, null);
    assert.ok(created.createdAt);
    assert.deepEqual(new Set(created.audiencePositionIds), new Set([dispatcherPosition.id, supervisorPosition.id]));
    const creationDate = (await metadata(administrator, 'Дата').textContent()).trim();
    assert.ok(creationDate);
    assert.equal(await metadata(administrator, 'Отредактировал').count(), 0);
    await administrator.reload();
    await openKnowledge(administrator);
    await selectArticle(administrator);
    assert.equal((await metadata(administrator, 'Версия').textContent()).trim(), '1');
    assert.equal((await metadata(administrator, 'Дата').textContent()).trim(), creationDate);
    console.log('PASS mandatory structured fields, company audience, author and version 1 persist after reload');

    const editorPage = await pageFor(editor);
    await selectArticle(editorPage);
    await editArticle(editorPage);
    const editedReason = 'Редактор уточнил причину: контрольная сверка смены.';
    await field(editorPage, 'Причина создания').fill(editedReason);
    assert.equal(await saveButton(editorPage).isEnabled(), true, 'Changing only a structured field marks the draft dirty');
    const revised = await save(editorPage);
    assert.equal(revised.version, 2);
    assert.equal(revised.authorId, created.authorId);
    assert.equal(revised.authorName, created.authorName);
    assert.equal(revised.createdAt, created.createdAt);
    assert.equal(revised.updatedById, editor.actor.id);
    assert.equal(revised.updatedByName, editor.actor.displayName);
    assert.equal(revised.reason, editedReason);
    assert.equal(revised.body, created.body);
    assert.equal(await metadata(editorPage, 'Автор').textContent(), created.authorName);
    assert.equal(await metadata(editorPage, 'Отредактировал').textContent(), editor.actor.displayName);
    assert.equal((await metadata(editorPage, 'Версия').textContent()).trim(), '2');
    await field(editorPage, 'Поиск по базе знаний').fill('контрольная сверка');
    await editorPage.getByText('Найдено документов: 1', { exact: true }).waitFor();
    console.log('PASS a second editor changes only the reason, retains the original author/date and is shown at version 2; structured text is searchable');

    await administrator.reload();
    await openKnowledge(administrator);
    await selectArticle(administrator);
    await editArticle(administrator);
    await field(administrator, 'Задача создания').fill('Автор уточнил задачу передачи смены.');
    const authoredAgain = await save(administrator);
    assert.equal(authoredAgain.version, 3);
    assert.equal(authoredAgain.updatedById, admin.actor.id);
    assert.equal(authoredAgain.updatedByName, null);
    assert.equal(await metadata(administrator, 'Отредактировал').count(), 0);
    assert.equal((await metadata(administrator, 'Версия').textContent()).trim(), '3');
    assert.equal((await metadata(administrator, 'Дата').textContent()).trim(), creationDate);
    console.log('PASS the author edits at version 3 without an extra editor label');

    await editArticle(administrator);
    const localReason = 'Несохранённая локальная причина должна остаться в черновике.';
    await field(administrator, 'Причина создания').fill(localReason);
    const concurrent = await api('PUT', '/team/articles', {
      id: authoredAgain.id, responsibilityScopeId: ids.scope, version: authoredAgain.version,
      title: authoredAgain.title, body: authoredAgain.body, reason: authoredAgain.reason,
      purpose: authoredAgain.purpose, result: 'Результат параллельной правки второго редактора.',
      audiencePositionIds: authoredAgain.audiencePositionIds,
    }, editor);
    assert.equal(concurrent.version, 4);
    if (await saveButton(administrator).isEnabled()) {
      const pendingConflict = administrator.waitForResponse(response => response.request().method() === 'PUT' && new URL(response.url()).pathname === '/api/v1/team/articles');
      await saveButton(administrator).click();
      assert.equal((await pendingConflict).status(), 409);
    }
    await administrator.getByRole('heading', { name: 'Статья изменилась во время редактирования', exact: true }).waitFor();
    assert.equal(await field(administrator, 'Причина создания').inputValue(), localReason);
    const current = (await api('GET', '/team/articles')).articles.find(article => article.id === created.id);
    assert.equal(current.version, 4);
    assert.equal(current.reason, editedReason);
    assert.equal(current.result, concurrent.result);
    await administrator.getByRole('button', { name: 'Отменить', exact: true }).click();
    console.log('PASS stale-version conflict preserves the local structured draft and the latest saved version');

    const mobile = await pageFor(admin, true);
    await selectArticle(mobile);
    assert.equal(await metadata(mobile, 'Автор').textContent(), created.authorName);
    assert.equal(await metadata(mobile, 'Отредактировал').textContent(), editor.actor.displayName);
    assert.equal((await metadata(mobile, 'Версия').textContent()).trim(), '4');
    await mobile.screenshot({ path: path.join(output, 'structured-reader-mobile.png'), fullPage: true });
    await editArticle(mobile);
    for (const label of Object.keys(values)) assert.ok((await field(mobile, label).inputValue()).trim());
    assert.equal(await field(mobile, 'Для кого').locator(`option[value="${foreignPosition.id}"]`).count(), 0);
    assert.equal(await mobile.locator('.team-document-source').count(), 0);
    assert.ok(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await mobile.screenshot({ path: path.join(output, 'structured-editor-mobile.png'), fullPage: true });
    assert.deepEqual(errors, []);
    console.log('PASS structured reader/editor and company-limited audience fit the mobile viewport');
  } finally {
    if (browser) await browser.close();
    await fixture.close();
  }
})().catch(error => { console.error(error.stack || error.message); process.exit(1); });
