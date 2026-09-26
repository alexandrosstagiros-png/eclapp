'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createTestServer } = require('./local-test-server.cjs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

// A disposable synthetic database is essential: the two copies model the same
// imported document made available to different responsibility scopes.
(async () => {
  const fixture = await createTestServer({ staffTeamActors: true, builtFrontend: process.env.TEAM_BUILT_FRONTEND === 'true' });
  let browser;
  try {
    const { ids, adminPool } = fixture;
    const alternate = randomUUID();
    await adminPool.query("INSERT INTO responsibility_scopes(id,project_id,name) VALUES($1,$2,'Вторая учебная область')", [alternate, ids.project]);
    await adminPool.query('INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id) VALUES($1,$2,$3,$4,$5)', [ids.admin, ids.legal, ids.region, ids.project, alternate]);
    const admin = await fixture.devLogin(ids.admin);
    const originalBytes = Buffer.from('Синтетический исходный документ\n\u0000\u0001');
    for (let index = 1; index <= 16; index++) {
      const folderPath = index <= 14 ? 'Общая информация/Транспорт' : index === 15 ? 'Общая информация/Рекрутинг' : 'Папка сотрудника';
      const filename = `Инструкция ${index}.docx`;
      const response = await fixture.request('POST', '/team/articles/import', {
        responsibilityScopeIds: [ids.scope, alternate], visibility: 'scope',
        sourcePath: `${folderPath}/${filename}`, folderPath, title: `Инструкция ${index}`,
        body: `Содержание документа ${index}.\n${index === 13 ? 'Уникальный поисковый термин: калибровка.' : 'Учебный материал.'}`,
        sourceArchive: 'Синтетический архив.zip',
        file: { filename, mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', contentBase64: originalBytes.toString('base64') },
      }, admin.accessToken);
      assert.ok([200, 201].includes(response.status), `Import HTTP ${response.status}: ${JSON.stringify(response.body)}`);
      assert.equal(response.body.createdCount, 2);
    }
    assert.equal((await adminPool.query('SELECT count(*)::integer AS n FROM team_article_imports')).rows[0].n, 32, 'Underlying scope copies must remain intact');
    for (const scope of [ids.scope, alternate]) {
      const scoped = await fixture.request('GET', `/team/articles?responsibilityScopeId=${scope}`, undefined, admin.accessToken);
      assert.equal(scoped.status, 200);
      assert.equal(scoped.body.articles.length, 16, 'An explicit scope retains its complete document list');
    }
    const aggregate = await fixture.request('GET', '/team/articles', undefined, admin.accessToken);
    assert.equal(aggregate.status, 200);
    assert.equal(aggregate.body.articles.length, 16, 'Company-wide list must expose each identical imported document once');
    assert.equal(new Set(aggregate.body.articles.map(article => article.title)).size, 16);
    assert.ok(aggregate.body.articles.every(article => article.canEdit), 'The selected copy must preserve administrator editing rights');

    browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
    const output = path.resolve(__dirname, '../.local/team-knowledge-dedup-qa');
    await fs.mkdir(output, { recursive: true });
    const errors = [];
    for (const mobile of [false, true]) {
      const variant = mobile ? 'mobile' : 'desktop';
      const context = await browser.newContext({
        acceptDownloads: true,
        ...(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 } : { viewport: { width: 1440, height: 1000 } }),
      });
      await context.addInitScript(value => sessionStorage.setItem('ecl.session.v2', JSON.stringify({ session: value })), { ...admin, rememberedDevice: false });
      const page = await context.newPage();
      page.setDefaultTimeout(15000);
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`${fixture.origin}/?section=team`);
      await page.getByRole('navigation', { name: 'Разделы команды' }).getByRole('button', { name: 'База знаний', exact: true }).click();
      const folder = page.getByLabel('Папка базы знаний', { exact: true });
      const search = page.getByLabel('Поиск по базе знаний', { exact: true });
      const cards = page.locator('.team-knowledge-results .team-article-item');
      await page.getByText('Найдено документов: 16', { exact: true }).waitFor();
      assert.equal(await folder.locator('option[value=""]').textContent(), 'Все папки (16)');
      assert.equal(await cards.count(), 12);
      const firstPage = await cards.locator('strong').allTextContents();
      assert.equal(new Set(firstPage).size, 12);
      await page.getByRole('button', { name: 'Следующая страница документов', exact: true }).click();
      assert.equal(await cards.count(), 4);
      const secondPage = await cards.locator('strong').allTextContents();
      assert.equal(new Set([...firstPage, ...secondPage]).size, 16, 'No duplicate card may occur across pages');

      await folder.selectOption('Общая информация');
      await page.getByText('Найдено документов: 15', { exact: true }).waitFor();
      await folder.selectOption('Общая информация/Транспорт');
      await page.getByText('Найдено документов: 14', { exact: true }).waitFor();
      assert.deepEqual(await cards.locator('strong').allTextContents(), Array.from({ length: 12 }, (_, index) => `Инструкция ${index + 1}`));
      await page.getByRole('button', { name: 'Следующая страница документов', exact: true }).click();
      assert.deepEqual(await cards.locator('strong').allTextContents(), ['Инструкция 13', 'Инструкция 14']);
      await page.screenshot({ path: path.join(output, `unique-pagination-${variant}.png`), fullPage: true });

      await search.fill('калибровка');
      await page.getByText('Найдено документов: 1', { exact: true }).waitFor();
      assert.equal(await cards.count(), 1);
      await cards.click();
      await page.getByRole('heading', { name: 'Инструкция 13', exact: true }).waitFor();
      assert.equal(await page.locator('.team-document-source').count(), 0);
      assert.equal(await page.getByRole('button', { name: /^Скачать оригинал/ }).count(), 0);
      await page.getByRole('button', { name: 'Действия инструкции', exact: true }).click();
      await page.getByRole('menuitem', { name: 'Редактировать', exact: true }).click();
      await page.getByRole('heading', { name: 'Редактирование статьи', exact: true }).waitFor();
      assert.equal(await page.locator('.team-document-source').count(), 0, 'The article editor must also omit the original-file block');
      assert.equal(await page.getByRole('button', { name: /^Скачать оригинал/ }).count(), 0);
      await page.getByRole('button', { name: 'Отменить', exact: true }).click();
      await page.getByRole('heading', { name: 'Инструкция 13', exact: true }).waitFor();
      await page.screenshot({ path: path.join(output, `unique-search-${variant}.png`), fullPage: true });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${variant} must fit its viewport`);
      await search.fill('несуществующий документ');
      await page.getByText('Найдено документов: 0', { exact: true }).waitFor();
      assert.equal(await cards.count(), 0);
      await search.fill('');
      await folder.selectOption('');
      await page.getByText('Найдено документов: 16', { exact: true }).waitFor();
      await context.close();
      console.log(`PASS knowledge dedup ${variant}: 32 scoped copies appear as 16 unique documents; folder counts, unique pagination, full-text search, editor access and hidden original-file block in reader/editor`);
    }
    assert.deepEqual(errors, []);
    assert.equal((await adminPool.query('SELECT count(*)::integer AS n FROM team_article_imports')).rows[0].n, 32, 'Browser reads must not delete scoped originals');
  } finally {
    if (browser) await browser.close();
    await fixture.close();
  }
})().catch(error => { console.error(error.stack || error.message); process.exit(1); });
