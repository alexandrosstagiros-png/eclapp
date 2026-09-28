'use strict';

// Disposable database, synthetic identities, and mocked lookup responses only.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createTestServer } = require('./local-test-server.cjs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const fixture = await createTestServer({ builtFrontend: process.env.RECRUITMENT_BUILT_FRONTEND === 'true' });
  const output = path.resolve(__dirname, '../.local/recruitment-contract-packs-browser-qa');
  const errors = [];
  let browser, page;
  try {
    await fs.mkdir(output, { recursive: true });
    const { ids, adminPool: db } = fixture;
    await db.query('UPDATE access_grants SET personal_data_visible=true WHERE user_id=$1', [ids.admin]);
    const session = await fixture.devLogin(ids.admin);
    async function api(method, route, body) {
      const response = await fixture.request(method, route, body, session.accessToken);
      assert.equal(response.status, 200, `${method} ${route}: ${JSON.stringify(response.body)}`);
      return response.body;
    }
    const base = '/recruitment/contracts';
    const candidate = await api('PUT', '/recruitment/candidates', {
      id: randomUUID(), version: 0, responsibilityScopeId: ids.scope,
      fullName: 'Синтетический водитель комплекта', phone: '+79990004701', city: 'Москва',
      kind: 'driver', source: 'manual', recruiterId: ids.admin,
    });
    await api('PUT', `${base}/templates`, {
      id: randomUUID(), version: 0, responsibilityScopeId: ids.scope,
      name: 'Синтетический собственный шаблон', employmentType: 'employee', state: 'published',
      text: 'Собственный документ: {{full_name}}', fields: [{ id: 'full_name', label: 'ФИО работника', type: 'text', required: true }],
    });
    browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'Europe/Moscow', acceptDownloads: true });
    await context.addInitScript(value => {
      sessionStorage.setItem('ecl.session.v2', JSON.stringify({ session: { ...value, rememberedDevice: false } }));
      window.print = () => { window.packPrintCalls = (window.packPrintCalls || 0) + 1; };
    }, session);
    page = await context.newPage();
    page.setDefaultTimeout(20000);
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => dialog.accept());
    await page.goto(`${fixture.origin}/?section=recruitment&recruitmentTab=onboarding`);
    const kinds = page.getByRole('navigation', { name: 'Вид оформления' });
    const nav = page.getByRole('navigation', { name: 'Разделы оформления' });
    const packs = () => page.locator('.contract-pack-workspace');
    async function settled() {
      await page.waitForFunction(() => !document.body.innerText.includes('Подбираем документы и общие поля…'));
    }
    const catalog = kind => api('GET', `${base}/packs/catalog?responsibilityScopeId=${ids.scope}&kind=${kind}`);
    const pending = (method, suffix) => page.waitForResponse(response => response.request().method() === method && new URL(response.url()).pathname.endsWith(`${base}${suffix}`));
    async function result(response) {
      const value = await response;
      assert.equal(value.status(), 200, await value.text());
      return value.json();
    }
    await kinds.waitFor();
    await page.getByRole('button', { name: 'Добавить шаблоны комплекта', exact: true }).click();
    await page.getByText('Документы комплекта', { exact: true }).waitFor();
    await settled();
    let employeeCatalog = await catalog('employee');
    assert.equal(employeeCatalog.selectedTemplateIds.length, 8);
    const firstBase = employeeCatalog.templates.find(item => item.category === 'base');
    await page.getByRole('checkbox', { name: `Включить: ${firstBase.name}`, exact: true }).uncheck();
    await page.getByText('Выбрано: 7', { exact: true }).waitFor(); await settled();
    await page.getByRole('checkbox', { name: `Включить: ${firstBase.name}`, exact: true }).check();
    await page.getByText('Выбрано: 8', { exact: true }).waitFor(); await settled();
    assert.equal(await packs().locator('.contract-pack-options').filter({ has: page.locator('summary', { hasText: 'Дополнительные документы' }) }).getAttribute('open'), null);
    await page.getByLabel('Найти кандидата для комплекта', { exact: true }).fill(candidate.fullName);
    await page.getByLabel('Кандидат для комплекта', { exact: true }).selectOption(candidate.id);
    await settled();
    // Photo entry reuses the installed OCR questionnaire and existing editor.
    await page.getByRole('button', { name: 'Заполнить по фото', exact: true }).click();
    await page.getByRole('button', { name: 'Сохранить поля', exact: true }).waitFor();
    const onboarding = await api('GET', '/recruitment/onboarding/context');
    const source = onboarding.sessions.find(item => item.candidateId === candidate.id);
    assert.ok(source, 'Photo flow creates a linked questionnaire');
    const detail = await api('GET', `/recruitment/onboarding/sessions/${source.id}`);
    assert.equal(detail.templateSnapshot.name, 'Водитель · ТК');
    assert.ok(detail.templateSnapshot.fields.some(field => field.ocrKey));
    await api('PUT', `/recruitment/onboarding/sessions/${source.id}`, {
      version: detail.version, values: { ...detail.values, full_name: candidate.fullName, passport_number: 'SYNTHETIC-PASSPORT-4701' },
    });
    await page.getByRole('button', { name: 'Оформить комплект', exact: true }).click();
    await settled();
    await page.waitForFunction(() => document.getElementById('pack-employee-passport_number')?.value === 'SYNTHETIC-PASSPORT-4701');
    assert.equal(await page.locator('#pack-employee-full_name').inputValue(), candidate.fullName);
    const beforeValidation = (await db.query('SELECT count(*)::int AS count FROM recruitment_contract_packs')).rows[0].count;
    await page.getByRole('button', { name: 'Оформить комплект', exact: true }).click();
    assert.equal((await db.query('SELECT count(*)::int AS count FROM recruitment_contract_packs')).rows[0].count, beforeValidation);
    assert.ok(await page.locator('[aria-invalid="true"]').count());

    async function fillRequired(kind, selectedCatalog) {
      for (const item of selectedCatalog.fields) {
        if (!item.required || ['contract_number', 'contract_date'].includes(item.id)) continue;
        const input = page.locator(`#pack-${kind}-${item.id}`);
        if (!(await input.count()) || (await input.inputValue()).trim()) continue;
        await input.evaluate(node => { const parent = node.closest('details'); if (parent) parent.open = true; });
        await input.fill(item.type === 'date' ? (item.notBeforeContractDate ? '2027-12-31' : '2026-09-28') :
          item.id === 'company_name' ? 'Синтетическая компания <script>window.packInjection=true</script>' :
          item.type === 'tel' ? '+79990004701' : `Синтетическое ${item.label}`);
      }
    }
    await fillRequired('employee', employeeCatalog);
    await page.locator('#pack-employee-company_name').fill('Синтетическая компания <script>window.packInjection=true</script>');
    const saving = pending('PUT', '/packs/settings');
    await page.getByRole('button', { name: 'Сохранить реквизиты организации', exact: true }).click();
    await result(saving); await settled();
    await page.screenshot({ path: path.join(output, 'employee-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: path.join(output, 'employee-mobile.png'), fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });

    // A successfully committed response lost in transit must retry with the same key.
    let lost = true;
    const requests = [];
    await page.route('**/api/v1/recruitment/contracts/packs', async route => {
      requests.push(route.request().postDataJSON());
      if (!lost) return route.continue();
      lost = false;
      const committed = await route.fetch();
      assert.equal(committed.status(), 200, await committed.text());
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'RECRUITMENT_SYNTHETIC_FAILURE', message: 'Синтетическая потеря ответа после сохранения' }) });
    });
    await page.getByRole('button', { name: 'Оформить комплект', exact: true }).click();
    await packs().getByRole('alert').filter({ hasText: 'Синтетическая потеря' }).waitFor();
    assert.equal(await page.locator('#pack-employee-passport_number').inputValue(), 'SYNTHETIC-PASSPORT-4701');
    const issuance = pending('POST', '/packs');
    await page.getByRole('button', { name: 'Оформить комплект', exact: true }).click();
    const employeePack = await result(issuance);
    await page.getByLabel('Готовый комплект', { exact: true }).waitFor();
    assert.equal(requests.length, 2);
    assert.equal(requests[0].idempotencyKey, requests[1].idempotencyKey);
    assert.equal(employeePack.documents.length, 8);
    assert.equal((await db.query('SELECT count(*)::int AS count FROM recruitment_contract_packs')).rows[0].count, beforeValidation + 1);
    assert.match(employeePack.number, /^ТК-2026-/);
    const downloading = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Скачать комплект HTML', exact: true }).click();
    const download = await downloading, html = await fs.readFile(await download.path(), 'utf8');
    assert.equal((html.match(/<article\b/g) || []).length, 8);
    assert.match(html, /break-before:page/);
    assert.ok(html.includes('&lt;script&gt;window.packInjection=true&lt;/script&gt;'));
    assert.equal(await page.evaluate(() => window.packInjection), undefined);
    const popupPromise = page.waitForEvent('popup');
    await page.getByRole('button', { name: 'Печать / PDF комплекта', exact: true }).click();
    const popup = await popupPromise;
    await popup.waitForFunction(() => document.querySelectorAll('article').length === 8);
    await popup.close();
    console.log('PASS employee OCR questionnaire → shared fields → atomic pack, stable retry key, safe combined HTML and print');

    await kinds.getByRole('button', { name: 'Перевозчик', exact: true }).click();
    await page.getByRole('button', { name: 'Добавить шаблоны комплекта', exact: true }).click();
    await page.getByText('Документы комплекта', { exact: true }).waitFor(); await settled();
    let carrierCatalog = await catalog('carrier');
    assert.equal(carrierCatalog.selectedTemplateIds.length, 1);
    assert.equal(await page.locator('#pack-carrier-company_name').inputValue(), 'Синтетическая компания <script>window.packInjection=true</script>');
    assert.equal(await page.locator('#pack-carrier-company_name').isVisible(), false, 'Saved company fields start collapsed');
    await page.route('**/api/v1/recruitment/contracts/party-lookup', async route => {
      const { query } = route.request().postDataJSON();
      if (query === '0000000000') return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'RECRUITMENT_SYNTHETIC_FAILURE', message: 'Сервис недоступен' }) });
      if (query === '1111111111') await new Promise(resolve => setTimeout(resolve, 500));
      return route.fulfill({ json: { configured: true, suggestions: [{ id: query, label: `Перевозчик ${query}`, status: 'ACTIVE', values: {
        carrier_type: 'Юридическое лицо', carrier_name: `Синтетический перевозчик ${query}`, carrier_inn: query,
        carrier_kpp: '770701001', carrier_ogrn: '1027700132195', carrier_address: 'Синтетический адрес, 1',
        carrier_signer_name: 'Синтетический подписант', carrier_signer_basis: 'Устав', carrier_signer_title: 'Директор',
      } }] } });
    });
    await page.route('**/api/v1/recruitment/contracts/bank-lookup', route => route.fulfill({ json: {
      configured: true, suggestions: [{ id: '044525225', label: 'Синтетический банк', status: 'ACTIVE', values: {
        carrier_bank: 'Синтетический банк', carrier_bik: '044525225', carrier_correspondent_account: '30101810400000000225',
      } }],
    } }));
    await page.getByLabel('ИНН или ОГРН перевозчика', { exact: true }).fill('0000000000');
    await page.getByRole('button', { name: 'Заполнить по ИНН', exact: true }).click();
    await page.getByText(/Введите реквизиты вручную или повторите запрос/).waitFor();
    await page.getByLabel('ИНН или ОГРН перевозчика', { exact: true }).fill('1111111111');
    await page.getByRole('button', { name: 'Заполнить по ИНН', exact: true }).click();
    await page.getByLabel('ИНН или ОГРН перевозчика', { exact: true }).fill('7707083893');
    await page.getByRole('button', { name: 'Заполнить по ИНН', exact: true }).click();
    await page.getByRole('button', { name: 'Подставить реквизиты: Перевозчик 7707083893', exact: true }).click();
    await page.waitForTimeout(600);
    assert.equal(await page.getByText('Перевозчик 1111111111', { exact: true }).count(), 0, 'Aborted stale lookup cannot overwrite current result');
    assert.equal(await page.locator('#pack-carrier-carrier_name').inputValue(), 'Синтетический перевозчик 7707083893');
    await page.getByLabel('БИК банка перевозчика', { exact: true }).fill('044525225');
    await page.getByRole('button', { name: 'Заполнить банк', exact: true }).click();
    await page.getByRole('button', { name: 'Подставить реквизиты: Синтетический банк', exact: true }).click();
    assert.equal(await page.locator('#pack-carrier-carrier_account').inputValue(), '', 'Lookup never invents a settlement account');
    const project = carrierCatalog.templates.find(item => item.category === 'project');
    const opticom = carrierCatalog.templates.find(item => item.catalogKey === 'carrier-opticom');
    await page.getByRole('checkbox', { name: `Включить: ${opticom.name}`, exact: true }).check(); await settled();
    await page.locator('summary').filter({ hasText: /^Предпросмотр документов$/ }).click();
    await page.locator('.contract-pack-preview > summary').filter({ hasText: opticom.name }).click();
    await page.getByText(/В исходнике суммы без НДС/).waitFor();
    assert.ok((await packs().innerText()).includes('Исходник B21:'));
    await page.getByRole('checkbox', { name: `Включить: ${opticom.name}`, exact: true }).uncheck(); await settled();
    await page.getByRole('checkbox', { name: `Включить: ${project.name}`, exact: true }).check(); await settled();
    const selected = [...carrierCatalog.selectedTemplateIds, project.id];
    carrierCatalog = await api('GET', `${base}/packs/catalog?responsibilityScopeId=${ids.scope}&kind=carrier&templateIds=${selected.join(',')}`);
    assert.equal(await page.locator('#pack-carrier-carrier_name').inputValue(), 'Синтетический перевозчик 7707083893');
    await fillRequired('carrier', carrierCatalog);
    // Moving between kinds preserves unfinished fields entirely in memory.
    await kinds.getByRole('button', { name: 'Водитель · ТК', exact: true }).click();
    await page.getByLabel('Готовый комплект', { exact: true }).waitFor();
    await kinds.getByRole('button', { name: 'Перевозчик', exact: true }).click(); await settled();
    assert.equal(await page.locator('#pack-carrier-carrier_name').inputValue(), 'Синтетический перевозчик 7707083893');
    await page.screenshot({ path: path.join(output, 'carrier-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: path.join(output, 'carrier-mobile.png'), fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    const issuingCarrier = pending('POST', '/packs');
    await page.getByRole('button', { name: 'Оформить комплект', exact: true }).click();
    const carrierPack = await result(issuingCarrier);
    assert.equal(carrierPack.documents.length, 2);
    assert.match(carrierPack.number, /^ПР-2026-/);
    await nav.getByRole('button', { name: 'Договоры', exact: true }).click();
    await page.getByRole('button', { name: `Открыть комплект: ${carrierPack.number}`, exact: true }).click();
    await page.getByLabel('Готовый комплект', { exact: true }).waitFor();
    assert.equal(await page.locator('.contract-pack-preview').count(), 2);
    await page.getByRole('button', { name: 'К списку договоров', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: `Открыть договор: ${carrierPack.number}`, exact: true }).count(), 2);
    assert.deepEqual(errors, []);
    console.log('PASS carrier party/bank lookup fallback and cancellation, one optional project, saved organization, draft preservation and pack history');
  } catch (error) {
    if (page) {
      await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }).catch(() => {});
      console.error((await page.locator('body').innerText()).slice(-7500));
    }
    console.error('Browser errors:', errors);
    throw error;
  } finally {
    if (browser) await browser.close();
    await fixture.close();
  }
})().catch(error => { console.error(error.stack || error.message); process.exit(1); });
