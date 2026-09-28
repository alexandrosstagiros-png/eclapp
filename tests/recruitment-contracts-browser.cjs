'use strict';

// A disposable PostgreSQL/API fixture and synthetic identities/documents only.
// This suite never reads credentials or records from the installed local app.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createTestServer } = require('./local-test-server.cjs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const fixture = await createTestServer({ builtFrontend: process.env.RECRUITMENT_BUILT_FRONTEND === 'true' });
  const output = path.resolve(__dirname, '../.local/recruitment-contracts-browser-qa');
  const errors = [], consoleErrors = [];
  let browser;
  try {
    await fs.mkdir(output, { recursive: true });
    const { ids, adminPool: db } = fixture;
    await db.query('UPDATE access_grants SET personal_data_visible=true WHERE user_id=$1', [ids.admin]);
    const admin = await fixture.devLogin(ids.admin);
    const recruiterId = randomUUID();
    await db.query("INSERT INTO users(id,display_name,role,active,approved) VALUES($1,'Синтетический рекрутер договоров','recruiter',true,true)", [recruiterId]);
    await db.query('INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id,personal_data_visible) VALUES($1,$2,$3,$4,$5,true)', [recruiterId, ids.legal, ids.region, ids.project, ids.scope]);
    const recruiter = await fixture.devLogin(recruiterId);
    async function api(method, route, body, session = recruiter) {
      const response = await fixture.request(method, route, body, session.accessToken);
      assert.ok([200, 201].includes(response.status), `${method} ${route}: ${response.status} ${JSON.stringify(response.body)}`);
      return response.body;
    }
    const contractApi = (method, route, body, session) => api(method, `/recruitment/contracts${route}`, body, session);
    const candidate = await api('PUT', '/recruitment/candidates', {
      id: randomUUID(), version: 0, responsibilityScopeId: ids.scope, fullName: 'Синтетический водитель договоров',
      phone: '+79990007301', city: 'Москва', kind: 'driver', source: 'manual', recruiterId,
    });
    const onboardingTemplate = await api('PUT', '/recruitment/onboarding/templates', {
      id: randomUUID(), version: 0, responsibilityScopeId: ids.scope,
      name: 'Синтетическая анкета для договора', destination: 'Тестовое оформление', employmentType: 'ip',
      description: 'Только тестовые данные', privacyNotice: 'Синтетические данные браузерной проверки.', active: true,
      fields: [
        { id: 'full_name', label: 'ФИО', type: 'text', required: true },
        { id: 'tax_id', label: 'ИНН', type: 'text', required: false },
      ], documents: [],
    }, admin);
    let onboarding = await api('POST', '/recruitment/onboarding/sessions', { templateId: onboardingTemplate.id, candidateId: candidate.id });
    onboarding = await api('PUT', `/recruitment/onboarding/sessions/${onboarding.id}`, {
      version: onboarding.version, values: { full_name: candidate.fullName, tax_id: 'SYNTHETIC-INN-7301' },
    });
    const baseline = (await db.query('SELECT (SELECT count(*) FROM recruitment_applications)::int AS applications, (SELECT count(*) FROM recruitment_workflow_events)::int AS events')).rows[0];

    browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
    async function pageFor(session) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'Europe/Moscow', acceptDownloads: true });
      await context.addInitScript(value => {
        sessionStorage.setItem('ecl.session.v2', JSON.stringify({ session: { ...value, rememberedDevice: false } }));
        window.print = () => { window.contractPrintCalls = (window.contractPrintCalls || 0) + 1; };
      }, session);
      const page = await context.newPage();
      page.setDefaultTimeout(20000);
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
      page.on('dialog', dialog => dialog.accept());
      await page.goto(`${fixture.origin}/?section=recruitment&recruitmentTab=onboarding`);
      await page.getByRole('navigation', { name: 'Разделы оформления' }).waitFor();
      return page;
    }
    const nav = page => page.getByRole('navigation', { name: 'Разделы оформления' });
    function pending(page, method, route) {
      const promise = page.waitForResponse(response => response.request().method() === method && new URL(response.url()).pathname.endsWith(`/recruitment/contracts${route}`));
      void promise.catch(() => {});
      return promise;
    }
    async function result(promise) {
      const response = await promise;
      assert.ok([200, 201].includes(response.status()), `${response.request().method()} ${new URL(response.url()).pathname}: ${response.status()} ${await response.text()}`);
      return response.json();
    }
    async function fits(page) {
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Contract interface fits the mobile viewport');
    }

    const builder = await pageFor(admin);
    await nav(builder).getByRole('button', { name: 'Шаблоны договоров', exact: true }).click();
    await builder.getByRole('button', { name: 'Создать шаблон договора', exact: true }).click();
    await builder.getByLabel('Название шаблона договора', { exact: true }).fill('Синтетический договор перевозки');
    await builder.getByLabel('Тип оформления договора', { exact: true }).selectOption('ip');
    await builder.getByLabel('Код поля 2', { exact: true }).fill('tax_id');
    await builder.getByLabel('Название поля 2', { exact: true }).fill('ИНН');
    await builder.getByLabel('Код поля 3', { exact: true }).fill('delivery_address');
    await builder.getByLabel('Название поля 3', { exact: true }).fill('Адрес оказания услуг');
    await builder.getByLabel('Тип поля 3', { exact: true }).selectOption('textarea');
    await builder.getByLabel('Обязательное поле 3', { exact: true }).check();
    const originalTemplateText = 'СИНТЕТИЧЕСКИЙ ДОГОВОР № {{contract_number}} от {{contract_date}}\nИсполнитель: {{full_name}}. ИНН: {{tax_id}}.\nАдрес: {{delivery_address}}.\nПервая редакция условий.';
    await builder.getByLabel('Текст шаблона договора', { exact: true }).fill(originalTemplateText);
    const draftSaving = pending(builder, 'PUT', '/templates');
    await builder.getByRole('button', { name: 'Сохранить черновик шаблона', exact: true }).click();
    let template = await result(draftSaving);
    assert.equal(template.publishedVersion, 0);
    assert.equal(template.draft.text, originalTemplateText);
    console.log('PASS a template draft is retained without becoming available for issuing contracts');

    const publishing = pending(builder, 'PUT', '/templates');
    await builder.getByRole('button', { name: 'Опубликовать шаблон', exact: true }).click();
    template = await result(publishing);
    assert.ok(template.publishedVersion > 0);
    const firstPublishedVersion = template.publishedVersion;
    await builder.screenshot({ path: path.join(output, 'template-desktop.png'), fullPage: true });
    await builder.setViewportSize({ width: 390, height: 844 });
    await fits(builder);
    await builder.screenshot({ path: path.join(output, 'template-mobile.png'), fullPage: true });
    await builder.setViewportSize({ width: 1440, height: 1000 });

    const office = await pageFor(recruiter);
    await nav(office).getByRole('button', { name: 'Шаблоны договоров', exact: true }).waitFor();
    await nav(office).getByRole('button', { name: 'Договоры', exact: true }).click();
    await office.getByRole('button', { name: 'Создать договор', exact: true }).click();
    await office.getByLabel('Найти кандидата для договора', { exact: true }).fill(candidate.fullName);
    await office.getByLabel('Кандидат для договора', { exact: true }).selectOption(candidate.id);
    await office.getByLabel('Анкета для договора', { exact: true }).selectOption(onboarding.id);
    await office.getByLabel('Шаблон договора', { exact: true }).selectOption(template.id);
    const creating = pending(office, 'POST', '/documents');
    await office.getByRole('button', { name: 'Создать черновик договора', exact: true }).click();
    let contract = await result(creating);
    assert.equal(contract.candidateId, candidate.id);
    assert.equal(contract.onboardingSessionId, onboarding.id);
    assert.equal(await office.getByLabel('ФИО', { exact: true }).inputValue(), candidate.fullName);
    assert.equal(await office.getByLabel('ИНН', { exact: true }).inputValue(), 'SYNTHETIC-INN-7301');
    await office.getByLabel('Номер договора', { exact: true }).fill('TEST-7301');
    await office.getByLabel('Дата договора', { exact: true }).fill('2026-09-27');
    await office.getByLabel('Адрес оказания услуг', { exact: true }).fill('Синтетическая улица, 1\nТестовый пункт выдачи');
    const contractText = `${originalTemplateText}\nИндивидуальное условие. <script>window.contractInjection = true</script>`;
    await office.getByLabel('Текст договора', { exact: true }).fill(contractText);
    const saving = pending(office, 'PUT', `/documents/${contract.id}`);
    await office.getByRole('button', { name: 'Сохранить договор', exact: true }).click();
    contract = await result(saving);
    assert.equal(contract.text, contractText);
    assert.equal(contract.date, '2026-09-27', 'Date-only values survive the Moscow server timezone unchanged');
    assert.equal(contract.values.delivery_address, 'Синтетическая улица, 1\nТестовый пункт выдачи');
    assert.ok(contract.renderedText.includes(candidate.fullName));
    assert.ok(contract.renderedText.includes('27.09.2026'));
    assert.ok(!contract.renderedText.includes('{{full_name}}'));
    const preview = office.getByLabel('Предпросмотр договора', { exact: true });
    assert.ok((await preview.innerText()).includes('<script>window.contractInjection = true</script>'));
    assert.equal(await office.evaluate(() => window.contractInjection), undefined);
    await office.screenshot({ path: path.join(output, 'contract-draft-desktop.png'), fullPage: true });
    await office.setViewportSize({ width: 390, height: 844 });
    await fits(office);
    await office.screenshot({ path: path.join(output, 'contract-draft-mobile.png'), fullPage: true });
    await office.setViewportSize({ width: 1440, height: 1000 });
    console.log('PASS recruiter creates a linked contract, reuses candidate/questionnaire values and edits its own text with a safe preview');

    const issuing = pending(office, 'POST', `/documents/${contract.id}/issue`);
    await office.getByRole('checkbox', { name: 'Данные, организация и текст проверены. После выпуска редактирование будет закрыто.', exact: true }).check();
    await office.getByRole('button', { name: 'Выпустить договор', exact: true }).click();
    contract = await result(issuing);
    assert.equal(contract.status, 'issued');
    assert.equal(contract.templateSnapshot.version, firstPublishedVersion);
    const issuedText = contract.renderedText;
    const issuedVersion = contract.version;
    const editableText = office.getByLabel('Текст договора', { exact: true });
    assert.ok(await editableText.count() === 0 || await editableText.isDisabled(), 'Issued contract text is immutable in the editor');

    const htmlDownloading = office.waitForEvent('download');
    await office.getByRole('button', { name: 'Скачать HTML', exact: true }).click();
    const htmlDownload = await htmlDownloading;
    assert.match(htmlDownload.suggestedFilename(), /\.html$/);
    const html = await fs.readFile(await htmlDownload.path(), 'utf8');
    assert.ok(html.includes('&lt;script&gt;window.contractInjection = true&lt;/script&gt;'));
    const exported = await office.evaluate(value => {
      const parsed = new DOMParser().parseFromString(value, 'text/html');
      return { text: parsed.querySelector('pre')?.textContent, scripts: parsed.querySelectorAll('script').length };
    }, html);
    assert.equal(exported.text, issuedText);
    assert.equal(exported.scripts, 0);
    await htmlDownload.saveAs(path.join(output, 'issued-contract.html'));
    const printing = office.waitForEvent('popup');
    await office.getByRole('button', { name: 'Печать / сохранить PDF', exact: true }).click();
    const printed = await printing;
    printed.on('pageerror', error => errors.push(error.message));
    await printed.waitForFunction(() => window.contractPrintCalls === 1);
    assert.equal(await printed.locator('pre').textContent(), issuedText);
    assert.equal(await printed.locator('script').count(), 0);
    assert.equal(await printed.evaluate(() => window.opener), null);
    assert.equal(await printed.evaluate(() => window.contractInjection), undefined);
    await printed.screenshot({ path: path.join(output, 'contract-print-desktop.png'), fullPage: true });
    await printed.close();
    console.log('PASS HTML export and print use the frozen document, escaping markup and isolating the print window');

    // A template change must never rewrite a previously issued person's document.
    const secondTemplateText = originalTemplateText.replace('Первая редакция условий.', 'Вторая редакция условий — только для новых договоров.');
    await builder.getByLabel('Текст шаблона договора', { exact: true }).fill(secondTemplateText);
    const republishing = pending(builder, 'PUT', '/templates');
    await builder.getByRole('button', { name: 'Опубликовать шаблон', exact: true }).click();
    template = await result(republishing);
    assert.ok(template.publishedVersion > firstPublishedVersion);
    const frozen = await contractApi('GET', `/documents/${contract.id}`);
    assert.equal(frozen.version, issuedVersion);
    assert.equal(frozen.renderedText, issuedText);
    assert.equal(frozen.templateSnapshot.version, firstPublishedVersion);
    assert.equal(frozen.templateSnapshot.text, originalTemplateText);
    console.log('PASS republishing a template preserves the issued contract and its original template version');

    // Minimal synthetic PDF; no real signature, identity document or recipient.
    const signedPdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n');
    await office.getByLabel('Дата подписания', { exact: true }).fill('2026-09-27');
    await office.getByLabel('Подписанный договор', { exact: true }).setInputFiles({ name: 'synthetic-signed-contract.pdf', mimeType: 'application/pdf', buffer: signedPdf });
    const signing = pending(office, 'POST', `/documents/${contract.id}/sign`);
    await office.getByRole('button', { name: 'Загрузить подписанный договор', exact: true }).click();
    contract = await result(signing);
    assert.equal(contract.status, 'signed');
    assert.equal(contract.signedDate, '2026-09-27');
    assert.equal(contract.renderedText, issuedText);
    assert.equal(contract.signedFile.fileName, 'synthetic-signed-contract.pdf');
    const downloaded = await fetch(`${fixture.origin}/api/v1/recruitment/contracts/documents/${contract.id}/signed-file`, { headers: { Authorization: `Bearer ${recruiter.accessToken}` } });
    assert.equal(downloaded.status, 200);
    assert.match(downloaded.headers.get('content-disposition'), /^attachment/);
    assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), signedPdf);
    const downloading = office.waitForEvent('download');
    await office.getByRole('button', { name: 'Скачать подписанный договор', exact: true }).click();
    const download = await downloading;
    assert.equal(download.suggestedFilename(), 'synthetic-signed-contract.pdf');
    assert.deepEqual(await fs.readFile(await download.path()), signedPdf);
    await office.screenshot({ path: path.join(output, 'contract-signed-desktop.png'), fullPage: true });
    await office.setViewportSize({ width: 390, height: 844 });
    await fits(office);
    await office.screenshot({ path: path.join(output, 'contract-signed-mobile.png'), fullPage: true });
    await office.setViewportSize({ width: 1440, height: 1000 });

    // Trash is reversible even for signed contracts; it never changes the frozen document or its file.
    const signedFile = structuredClone(contract.signedFile);
    let lifecycle = pending(office, 'POST', `/documents/${contract.id}/delete`);
    await office.getByRole('button', { name: 'Удалить договор', exact: true }).click();
    contract = await result(lifecycle);
    assert.ok(contract.deletedAt);
    assert.equal(contract.status, 'signed');
    assert.equal(contract.renderedText, issuedText);
    assert.deepEqual(contract.signedFile, signedFile);
    assert.ok(!(await contractApi('GET', '/context')).documents.some(item => item.id === contract.id));
    assert.equal((await fixture.request('GET', `/recruitment/contracts/documents/${contract.id}`, undefined, recruiter.accessToken)).status, 403);
    await office.getByLabel('Показывать договоры', { exact: true }).selectOption('deleted');
    await office.getByRole('button', { name: `Вернуть договор из корзины: ${contract.number}`, exact: true }).waitFor();
    assert.equal(await office.getByRole('button', { name: 'Сохранить договор', exact: true }).count(), 0);
    lifecycle = pending(office, 'POST', `/documents/${contract.id}/restore`);
    await office.getByRole('button', { name: `Вернуть договор из корзины: ${contract.number}`, exact: true }).click();
    contract = await result(lifecycle);
    assert.equal(contract.deletedAt, null);
    assert.equal(contract.status, 'signed');
    assert.equal(contract.renderedText, issuedText);
    assert.deepEqual(contract.signedFile, signedFile);
    const restoredFile = await fetch(`${fixture.origin}/api/v1/recruitment/contracts/documents/${contract.id}/signed-file`, { headers: { Authorization: `Bearer ${recruiter.accessToken}` } });
    assert.equal(restoredFile.status, 200);
    assert.deepEqual(Buffer.from(await restoredFile.arrayBuffer()), signedPdf);
    console.log('PASS a recruiter moves a signed contract to trash and restores it with unchanged signed content and bytes');

    // Recruiters may delete/restore an accessible shared template without editing somebody else's text.
    await nav(office).getByRole('button', { name: 'Шаблоны договоров', exact: true }).click();
    assert.equal(await office.getByRole('button', { name: 'Создать шаблон договора', exact: true }).count(), 0);
    await office.getByRole('button', { name: `Открыть шаблон договора: ${template.published.name}`, exact: true }).click();
    const shared = await contractApi('GET', `/templates/${template.id}`);
    assert.equal(shared.canEdit, false);
    assert.equal(shared.canDelete, true);
    assert.equal(await office.getByRole('button', { name: 'Опубликовать шаблон', exact: true }).count(), 0);
    lifecycle = pending(office, 'POST', `/templates/${template.id}/delete`);
    await office.getByRole('button', { name: 'Удалить шаблон', exact: true }).click();
    template = await result(lifecycle);
    assert.ok(template.deletedAt);
    assert.ok(!(await contractApi('GET', '/context')).templates.some(item => item.id === template.id));
    assert.equal((await contractApi('GET', `/documents/${contract.id}`)).templateId, template.id);
    await office.getByLabel('Показывать шаблоны', { exact: true }).selectOption('deleted');
    lifecycle = pending(office, 'POST', `/templates/${template.id}/restore`);
    await office.getByRole('button', { name: `Вернуть шаблон из корзины: ${template.published.name}`, exact: true }).click();
    template = await result(lifecycle);
    assert.equal(template.deletedAt, null);
    assert.equal(template.publishedVersion, firstPublishedVersion + 1);
    await office.getByLabel('Показывать шаблоны', { exact: true }).selectOption('active');
    await office.getByRole('button', { name: `Открыть шаблон договора: ${template.published.name}`, exact: true }).click();
    lifecycle = pending(office, 'POST', `/templates/${template.id}/delete`);
    await office.getByRole('button', { name: 'Удалить шаблон', exact: true }).click();
    template = await result(lifecycle);
    console.log('PASS shared template deletion/restoration keeps its version history and existing document references');

    // Recover only the source template snapshot; personal values and bespoke document edits stay private.
    await nav(office).getByRole('button', { name: 'Договоры', exact: true }).click();
    await office.getByRole('button', { name: `Открыть договор: ${contract.number}`, exact: true }).click();
    const recovering = pending(office, 'POST', `/documents/${contract.id}/restore-template`);
    await office.getByRole('button', { name: 'Восстановить шаблон', exact: true }).click();
    let recovered = await result(recovering);
    assert.notEqual(recovered.id, template.id);
    assert.equal(recovered.createdBy, recruiterId);
    assert.equal(recovered.canEdit, true);
    assert.equal(recovered.publishedVersion, 0);
    assert.equal(recovered.draft.text, originalTemplateText);
    assert.deepEqual(recovered.draft.fields, frozen.templateSnapshot.fields);
    for (const value of [candidate.fullName, 'SYNTHETIC-INN-7301', 'Синтетическая улица', 'TEST-7301', 'Индивидуальное условие']) {
      assert.ok(!JSON.stringify(recovered.draft).includes(value), `Recovered template does not contain filled document data: ${value}`);
    }
    const unchangedSource = await contractApi('GET', `/documents/${contract.id}`);
    assert.equal(unchangedSource.templateId, template.id);
    assert.equal(unchangedSource.renderedText, issuedText);
    assert.ok((await contractApi('GET', `/templates/${template.id}?deleted=true`)).deletedAt);
    await office.getByLabel('Текст шаблона договора', { exact: true }).waitFor();
    assert.equal(await office.getByLabel('Текст шаблона договора', { exact: true }).inputValue(), originalTemplateText);
    await office.screenshot({ path: path.join(output, 'recovered-template-desktop.png'), fullPage: true });
    await office.setViewportSize({ width: 390, height: 844 });
    await fits(office);
    await office.screenshot({ path: path.join(output, 'recovered-template-mobile.png'), fullPage: true });
    await office.setViewportSize({ width: 1440, height: 1000 });
    const publishingRecovered = pending(office, 'PUT', '/templates');
    await office.getByRole('button', { name: 'Опубликовать шаблон', exact: true }).click();
    recovered = await result(publishingRecovered);
    assert.equal(recovered.publishedVersion, 1);
    let blank = await contractApi('POST', '/documents', { templateId: recovered.id });
    assert.equal(blank.status, 'draft');
    assert.equal(blank.number, '');
    assert.equal(blank.date, null);
    assert.equal(blank.candidateId, null);
    assert.ok(Object.values(blank.values).every(value => value === ''));
    console.log('PASS recovery creates a new editable unfilled template from the original edition after its source template was deleted');

    // Draft deletion and restoration remain reversible and never resurrect the deleted original template.
    await nav(office).getByRole('button', { name: 'Договоры', exact: true }).click();
    await office.getByRole('button', { name: `Открыть договор: ${blank.id}`, exact: true }).click();
    lifecycle = pending(office, 'POST', `/documents/${blank.id}/delete`);
    await office.getByRole('button', { name: 'Удалить договор', exact: true }).click();
    blank = await result(lifecycle);
    assert.equal(blank.status, 'draft');
    await office.getByLabel('Показывать договоры', { exact: true }).selectOption('deleted');
    lifecycle = pending(office, 'POST', `/documents/${blank.id}/restore`);
    await office.getByRole('button', { name: `Вернуть договор из корзины: ${blank.id}`, exact: true }).click();
    blank = await result(lifecycle);
    assert.equal(blank.deletedAt, null);
    assert.equal(blank.status, 'draft');
    assert.ok(Object.values(blank.values).every(value => value === ''));
    assert.ok((await contractApi('GET', `/templates/${template.id}?deleted=true`)).deletedAt);
    console.log('PASS an unfilled draft survives its own trash/restore cycle without altering the deleted source template');

    const after = (await db.query('SELECT (SELECT count(*) FROM recruitment_applications)::int AS applications, (SELECT count(*) FROM recruitment_workflow_events)::int AS events')).rows[0];
    assert.deepEqual(after, baseline, 'Issuing/signing does not invent a recruitment stage or confirmed employment');
    assert.deepEqual(errors, []);
    assert.deepEqual(consoleErrors, []);
    console.log('PASS signed attachment bytes, immutable issued text, role-specific controls and responsive desktop/mobile contract interface without browser errors');
  } catch (error) {
    console.error('Browser errors:', errors, consoleErrors);
    if (browser) for (const [index, page] of browser.contexts().flatMap(context => context.pages()).entries()) {
      await page.screenshot({ path: path.join(output, `failure-${index}.png`), fullPage: true }).catch(() => {});
      console.error(`Failure page ${index}: ${(await page.locator('body').innerText()).slice(-6500)}`);
    }
    throw error;
  } finally {
    if (browser) await browser.close();
    await fixture.close();
  }
})().catch(error => { console.error(error.stack || error.message); process.exit(1); });
