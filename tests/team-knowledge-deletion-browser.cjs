'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createTestServer } = require('./local-test-server.cjs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

// This suite creates and deletes only synthetic imports in its own disposable
// PostgreSQL cluster. No persistent application URL or credentials are read.
(async () => {
  const fixture = await createTestServer({ staffTeamActors: true, builtFrontend: process.env.TEAM_BUILT_FRONTEND === 'true' });
  let browser;
  try {
    const { ids, adminPool } = fixture;
    const alternate = randomUUID();
    await adminPool.query("INSERT INTO responsibility_scopes(id,project_id,name) VALUES($1,$2,'Вторая учебная область')", [alternate, ids.project]);
    await adminPool.query('INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id) VALUES($1,$2,$3,$4,$5)', [ids.admin, ids.legal, ids.region, ids.project, alternate]);
    const admin = await fixture.devLogin(ids.admin);
    const employeeSession = await fixture.devLogin(ids.drivers[0]);
    const editorSession = await fixture.devLogin(ids.dispatcher);
    const ok = result => { assert.ok([200, 201].includes(result.status), `HTTP ${result.status}: ${JSON.stringify(result.body)}`); return result.body; };
    ok(await fixture.request('PUT', '/team/knowledge-permissions', {
      responsibilityScopeId: ids.scope, userId: ids.dispatcher, canCreate: false, canEdit: true,
    }, admin.accessToken));
    const title = 'Инструкция по перевозке';
    const variants = [
      { folderPath: 'Учебные документы/Старая редакция', body: 'Устаревший порядок работы. Синтетическая инструкция для удаления.' },
      { folderPath: 'Учебные документы/Новая редакция', body: 'Действующая редакция инструкции. Этот самостоятельный вариант должен сохраниться.' },
    ];
    for (const variant of variants) {
      const imported = ok(await fixture.request('POST', '/team/articles/import', {
        responsibilityScopeIds: [ids.scope, alternate], visibility: 'scope', title,
        body: variant.body, folderPath: variant.folderPath, sourcePath: `${variant.folderPath}/Инструкция.docx`,
        sourceArchive: 'Учебный архив.zip',
        file: { filename: 'Инструкция.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', contentBase64: Buffer.from(variant.body).toString('base64') },
      }, admin.accessToken));
      assert.equal(imported.createdCount, 2);
    }
    async function activeArticles(scope) {
      return ok(await fixture.request('GET', `/team/articles${scope ? `?responsibilityScopeId=${scope}` : ''}`, undefined, admin.accessToken)).articles;
    }
    assert.equal((await activeArticles()).length, 2);
    assert.equal((await adminPool.query('SELECT count(*)::integer AS n FROM team_articles')).rows[0].n, 4);
    const output = path.resolve(__dirname, '../.local/team-knowledge-deletion-qa');
    await fs.mkdir(output, { recursive: true });
    browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
    const errors = [];
    async function pageFor(session, mobile = false) {
      const context = await browser.newContext({
        ...(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 } : { viewport: { width: 1440, height: 1000 } }),
      });
      await context.addInitScript(value => sessionStorage.setItem('ecl.session.v2', JSON.stringify({ session: value })), { ...session, rememberedDevice: false });
      const page = await context.newPage();
      page.setDefaultTimeout(20000);
      page.deletionRequests = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('request', request => {
        if (request.method() === 'PUT' && /\/team\/articles\/[^/]+\/deletion$/.test(new URL(request.url()).pathname)) page.deletionRequests.push(request.postDataJSON());
      });
      await page.goto(`${fixture.origin}/?section=team`);
      await openKnowledge(page);
      return page;
    }
    const search = page => page.getByLabel('Поиск по базе знаний', { exact: true });
    const cards = page => page.locator('.team-knowledge-results .team-article-item');
    async function openKnowledge(page) {
      await page.getByRole('navigation', { name: 'Разделы команды' }).getByRole('button', { name: 'База знаний', exact: true }).click();
      await search(page).waitFor();
    }
    async function selectOld(page) {
      await search(page).fill('устаревший порядок');
      await page.getByText('Найдено документов: 1', { exact: true }).waitFor();
      await cards(page).click();
      await page.getByRole('heading', { name: title, exact: true }).waitFor();
    }
    async function openActions(page) {
      await page.getByRole('button', { name: 'Действия инструкции', exact: true }).click();
      await page.getByRole('menu').waitFor();
    }
    async function deletionDialog(page) {
      await openActions(page);
      await page.getByRole('menuitem', { name: 'Удалить инструкцию', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Удалить инструкцию?', exact: true });
      await dialog.waitFor();
      return dialog;
    }
    async function noDelete(page, editor) {
      await selectOld(page);
      const menuButton = page.getByRole('button', { name: 'Действия инструкции', exact: true });
      if (await menuButton.count()) await openActions(page);
      assert.equal(await page.getByRole('menuitem', { name: 'Удалить инструкцию', exact: true }).count(), 0);
      assert.equal(await page.getByRole('button', { name: 'Удалить инструкцию', exact: true }).count(), 0);
      const editCount = await page.getByRole('menuitem', { name: 'Редактировать', exact: true }).count() + await page.getByRole('button', { name: 'Редактировать', exact: true }).count();
      assert.equal(editCount, editor ? 1 : 0, 'Delegated editing must not imply deletion rights');
      await page.keyboard.press('Escape');
    }
    const employee = await pageFor(employeeSession);
    const editor = await pageFor(editorSession);
    await noDelete(employee, false);
    await noDelete(editor, true);
    console.log('PASS employee and delegated editor cannot delete instructions');

    const desktop = await pageFor(admin);
    await selectOld(desktop);
    const cancelled = await deletionDialog(desktop);
    await desktop.screenshot({ path: path.join(output, 'delete-confirmation-desktop.png'), fullPage: false });
    await cancelled.getByRole('button', { name: 'Отмена', exact: true }).click();
    await cancelled.waitFor({ state: 'detached' });
    assert.equal(desktop.deletionRequests.length, 0, 'Cancellation must not send a deletion request');
    assert.equal((await activeArticles()).length, 2);
    for (const scope of [ids.scope, alternate]) assert.equal((await activeArticles(scope)).length, 2);
    await desktop.getByRole('heading', { name: title, exact: true }).waitFor();
    console.log('PASS administrator cancel preserves the instruction and both scope copies');

    const staleDialog = await deletionDialog(desktop);
    const oldArticle = (await activeArticles()).find(article => article.body === variants[0].body);
    // A concurrent save advances the version while retaining identical text,
    // so the later successful delete must still remove the two exact copies.
    const saved = ok(await fixture.request('PUT', '/team/articles', {
      id: oldArticle.id, responsibilityScopeId: oldArticle.responsibilityScopeId,
      version: oldArticle.version, title: oldArticle.title, body: oldArticle.body,
    }, admin.accessToken));
    assert.equal(saved.version, oldArticle.version + 1);
    const staleConfirm = staleDialog.getByRole('button', { name: 'Удалить инструкцию', exact: true });
    if (await staleConfirm.isEnabled()) {
      const pendingConflict = desktop.waitForResponse(response => response.request().method() === 'PUT' && /\/team\/articles\/[^/]+\/deletion$/.test(new URL(response.url()).pathname));
      await staleConfirm.click();
      assert.equal((await pendingConflict).status(), 409, 'A stale confirmation must be rejected');
    }
    await staleDialog.getByText('Инструкция или доступ к ней изменились. Закройте окно и проверьте актуальный список перед удалением.', { exact: true }).waitFor();
    assert.equal(await staleConfirm.isEnabled(), false);
    assert.equal((await adminPool.query('SELECT count(*)::integer AS n FROM team_articles WHERE deleted_at IS NOT NULL')).rows[0].n, 0);
    assert.equal((await activeArticles()).length, 2);
    await staleDialog.getByRole('button', { name: 'Отмена', exact: true }).click();
    await staleDialog.waitFor({ state: 'detached' });
    const freshDialog = await deletionDialog(desktop);
    assert.equal(await freshDialog.getByRole('button', { name: 'Удалить инструкцию', exact: true }).isEnabled(), true);
    await freshDialog.getByRole('button', { name: 'Отмена', exact: true }).click();
    await freshDialog.waitFor({ state: 'detached' });
    console.log('PASS concurrent edit rejects stale confirmation, disables deletion and preserves all records');

    const mobile = await pageFor(admin, true);
    await selectOld(mobile);
    const confirmed = await deletionDialog(mobile);
    const bounds = await confirmed.boundingBox(), viewport = mobile.viewportSize();
    assert.ok(bounds && bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= viewport.width + 1 && bounds.y + bounds.height <= viewport.height + 1, `Mobile dialog must fit viewport: ${JSON.stringify(bounds)}`);
    await mobile.screenshot({ path: path.join(output, 'delete-confirmation-mobile.png'), fullPage: false });
    const pendingResponse = mobile.waitForResponse(response => response.request().method() === 'PUT' && /\/team\/articles\/[^/]+\/deletion$/.test(new URL(response.url()).pathname));
    await confirmed.getByRole('button', { name: 'Удалить инструкцию', exact: true }).click();
    const response = await pendingResponse;
    assert.equal(response.status(), 200);
    const deleted = await response.json();
    assert.equal(deleted.deletedCount, 2);
    assert.equal(new Set(deleted.deletedIds).size, 2);
    await confirmed.waitFor({ state: 'detached' });
    assert.equal(mobile.deletionRequests.length, 1);
    for (const scope of [ids.scope, alternate]) {
      const remaining = await activeArticles(scope);
      assert.equal(remaining.length, 1);
      assert.equal(remaining[0].body, variants[1].body);
    }
    assert.equal((await activeArticles()).length, 1);
    assert.equal((await adminPool.query('SELECT count(*)::integer AS n FROM team_articles')).rows[0].n, 4, 'Soft deletion must preserve underlying article records');
    console.log('PASS mobile confirmation deletes every exact imported copy and preserves the distinct variant');

    for (const page of [mobile, desktop, employee, editor]) {
      await page.reload();
      await openKnowledge(page);
      await search(page).fill('устаревший порядок');
      await page.getByText('Найдено документов: 0', { exact: true }).waitFor();
      assert.equal(await cards(page).count(), 0);
      await search(page).fill('');
      await page.getByText('Найдено документов: 1', { exact: true }).waitFor();
      assert.equal(await cards(page).count(), 1);
      await cards(page).click();
      await page.locator('.team-document-body').getByText(variants[1].body, { exact: true }).waitFor();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }
    await mobile.screenshot({ path: path.join(output, 'remaining-variant-mobile.png'), fullPage: true });
    assert.deepEqual(errors, []);
    console.log('PASS deleted instruction stays absent after search/reload for administrator, employee and editor; counts and mobile layout remain correct');
  } finally {
    if (browser) await browser.close();
    await fixture.close();
  }
})().catch(error => { console.error(error.stack || error.message); process.exit(1); });
