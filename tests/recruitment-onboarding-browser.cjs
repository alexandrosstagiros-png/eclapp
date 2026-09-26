'use strict';

// Disposable PostgreSQL/API, synthetic forms and Chromium's generated camera.
// OCR credentials are absent; no document is sent to an external service.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createTestServer } = require('./local-test-server.cjs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const fixture = await createTestServer({ builtFrontend: process.env.RECRUITMENT_BUILT_FRONTEND === 'true' });
  const output = path.resolve(__dirname, '../.local/recruitment-onboarding-browser-qa');
  const errors = [], requestUrls = [], downloads = [], popups = [];
  let browser;
  try {
    const { ids, request, devLogin, adminPool: db } = fixture;
    await fs.mkdir(output, { recursive: true });
    await db.query('UPDATE access_grants SET personal_data_visible=true WHERE user_id=$1', [ids.admin]);
    const manager = await devLogin(ids.admin);
    const recruiterId = randomUUID();
    await db.query("INSERT INTO users(id,display_name,role,active,approved) VALUES($1,'Синтетический рекрутер','recruiter',true,true)", [recruiterId]);
    await db.query('INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id,personal_data_visible) VALUES($1,$2,$3,$4,$5,true)', [recruiterId, ids.legal, ids.region, ids.project, ids.scope]);
    const recruiter = await devLogin(recruiterId);
    const staffRoute = '/recruitment/onboarding';
    async function api(method, route, body, session = recruiter) {
      const response = await request(method, staffRoute + route, body, session.accessToken);
      assert.ok([200, 201].includes(response.status), `${method} ${route}: ${response.status} ${JSON.stringify(response.body)}`);
      return response.body;
    }
    const template = await api('PUT', '/templates', {
      id: randomUUID(), version: 0, responsibilityScopeId: ids.scope,
      name: 'Оптиком · ИП · тестовая форма', destination: 'Оптиком', employmentType: 'ip',
      description: 'Оформление водителя в офисе', privacyNotice: 'Синтетическая форма для проверки. Фото удаляются через 72 часа.', active: true,
      fields: [
        { id: 'full_name', label: 'ФИО', type: 'text', required: true, ocrKey: 'name' },
        { id: 'passport_number', label: 'Номер паспорта', type: 'text', required: false, ocrKey: 'number' },
      ],
      documents: [{ id: 'passport_main', label: 'Паспорт: основной разворот', type: 'passport', required: true }],
    }, manager);
    assert.equal((await api('GET', '/context')).ocr.configured, false);
    browser = await chromium.launch({
      headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
      ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
    });
    async function pageFor(session, camera = false) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'Europe/Moscow', ...(camera ? { permissions: ['camera'] } : {}) });
      await context.addInitScript(value => {
        if (value) sessionStorage.setItem('ecl.session.v2', JSON.stringify({ session: { ...value, rememberedDevice: false } }));
        window.__cameraTracks = [];
        window.__denyCamera = false;
        if (navigator.mediaDevices?.getUserMedia) {
          const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
          navigator.mediaDevices.getUserMedia = async constraints => {
            if (window.__denyCamera) throw new DOMException('Synthetic camera denial', 'NotAllowedError');
            const stream = await original(constraints);
            window.__cameraTracks.push(...stream.getTracks());
            return stream;
          };
        }
      }, session || null);
      const page = await context.newPage();
      page.setDefaultTimeout(20000);
      page.on('pageerror', error => errors.push(error.message));
      page.on('request', outgoing => requestUrls.push(outgoing.url()));
      page.on('download', download => downloads.push(download.suggestedFilename()));
      page.on('popup', popup => popups.push(popup.url()));
      page.on('dialog', dialog => dialog.accept());
      return page;
    }
    function responsePending(page, predicate) {
      const pending = page.waitForResponse(predicate);
      void pending.catch(() => {});
      return pending;
    }
    async function imageReady(locator) {
      await locator.waitFor();
      await locator.evaluate(image => image.decode());
      assert.ok(await locator.evaluate(image => image.naturalWidth > 0 && image.naturalHeight > 0));
    }
    const tracksStopped = page => page.waitForFunction(() => window.__cameraTracks.length > 0 && window.__cameraTracks.every(track => track.readyState === 'ended'));
    async function camera(page, container) {
      await page.bringToFront();
      await container.getByRole('button', { name: /^Сфотографировать/ }).click();
      const dialog = page.getByRole('dialog');
      await dialog.waitFor();
      await page.waitForFunction(() => [...document.querySelectorAll('[role="dialog"] video')].some(video => video.readyState >= 2 && video.videoWidth > 0));
      return dialog;
    }
    const builder = await pageFor(manager);
    await builder.goto(`${fixture.origin}/?section=recruitment&recruitmentTab=onboarding`);
    await builder.getByRole('navigation', { name: 'Разделы оформления' }).getByRole('button', { name: 'Конструктор форм', exact: true }).click();
    await builder.getByRole('button', { name: 'Создать форму', exact: true }).click();
    await builder.getByLabel('Название формы', { exact: true }).fill('Синтетическая форма самозанятого');
    await builder.getByLabel('Направление оформления', { exact: true }).fill('Тестовое направление');
    await builder.getByLabel('Тип оформления', { exact: true }).selectOption('self_employed');
    await builder.getByLabel('Проект формы', { exact: true }).selectOption(ids.scope);
    await builder.getByLabel('Информация об обработке данных', { exact: true }).fill('Синтетическое уведомление для локальной проверки.');
    await builder.getByLabel('Название поля 2', { exact: true }).fill('ИНН');
    await builder.getByLabel('Тип поля 2', { exact: true }).selectOption('text');
    await builder.getByRole('button', { name: 'Добавить документ', exact: true }).click();
    await builder.getByLabel('Тип документа 2', { exact: true }).selectOption('other');
    await builder.getByLabel('Название документа 2', { exact: true }).fill('Справка о статусе самозанятого');
    await builder.screenshot({ path: path.join(output, 'form-constructor-desktop.png'), fullPage: true });
    const publishing = responsePending(builder, response => response.url().endsWith('/onboarding/templates') && response.request().method() === 'PUT');
    await builder.getByRole('button', { name: 'Опубликовать форму', exact: true }).click();
    const publishedResponse = await publishing;
    assert.equal(publishedResponse.status(), 200, await publishedResponse.text());
    const published = await publishedResponse.json();
    assert.equal(published.active, true);
    assert.equal(published.employmentType, 'self_employed');
    assert.ok(published.fields.some(field => field.label === 'ИНН' && field.type === 'text'));
    assert.ok(published.documents.some(document => document.label === 'Справка о статусе самозанятого'));
    const office = await pageFor(recruiter, true);
    await office.goto(`${fixture.origin}/?section=recruitment&recruitmentTab=onboarding`);
    const nav = office.getByRole('navigation', { name: 'Разделы оформления' });
    await nav.waitFor();
    assert.equal(await nav.getByRole('button', { name: 'Конструктор форм', exact: true }).count(), 0, 'Recruiters cannot open the constructor');
    await office.getByLabel('Направление', { exact: true }).selectOption('Оптиком');
    await office.getByLabel('Тип оформления', { exact: true }).selectOption('ip');
    await office.getByLabel('Форма оформления', { exact: true }).selectOption(template.id);
    const creating = responsePending(office, response => response.url().endsWith(`${staffRoute}/sessions`) && response.request().method() === 'POST');
    await office.getByRole('button', { name: 'Начать оформление', exact: true }).click();
    const createdResponse = await creating;
    assert.ok([200, 201].includes(createdResponse.status()), await createdResponse.text());
    let session = await createdResponse.json();
    const doc = office.getByRole('region', { name: 'Паспорт: основной разворот', exact: true });
    await doc.waitFor();
    await office.getByLabel(/^ФИО(?: \*)?$/).fill('Синтетический водитель в офисе');
    await office.getByLabel('Номер паспорта', { exact: true }).fill('TEST-ONLY-4271');
    const saving = responsePending(office, response => response.url().endsWith(`${staffRoute}/sessions/${session.id}`) && response.request().method() === 'PUT');
    await office.getByRole('button', { name: 'Сохранить поля', exact: true }).click();
    assert.equal((await saving).status(), 200);
    const issuing = responsePending(office, response => response.url().endsWith(`/sessions/${session.id}/link`) && response.request().method() === 'POST');
    await office.getByRole('button', { name: 'Создать ссылку кандидату', exact: true }).click();
    const officeInvitation = await (await issuing).json();
    const generatedLink = await office.getByLabel('Личная ссылка кандидата', { exact: true }).inputValue();
    assert.equal(new URL(generatedLink).search, '');
    assert.equal(new URL(generatedLink).hash, `#onboarding=${officeInvitation.token}`);
    await office.getByRole('button', { name: 'Скопировать ссылку', exact: true }).waitFor();
    const revoking = responsePending(office, response => response.url().endsWith(`/sessions/${session.id}/revoke-link`) && response.request().method() === 'POST');
    await office.getByRole('button', { name: 'Отозвать ссылку', exact: true }).click();
    assert.equal((await revoking).status(), 200);
    await office.getByLabel('Личная ссылка кандидата', { exact: true }).waitFor({ state: 'detached' });
    // Opening and cancelling never leave the device stream active.
    await camera(office, doc);
    await office.keyboard.press('Escape');
    await office.getByRole('dialog').waitFor({ state: 'detached' });
    await tracksStopped(office);
    const capture = await camera(office, doc);
    await capture.getByRole('button', { name: 'Сделать снимок', exact: true }).click();
    await imageReady(capture.locator('img'));
    await capture.getByRole('button', { name: 'Переснять', exact: true }).click();
    await office.waitForFunction(() => [...document.querySelectorAll('[role="dialog"] video')].some(video => video.readyState >= 2 && video.videoWidth > 0));
    await capture.getByRole('button', { name: 'Сделать снимок', exact: true }).click();
    await imageReady(capture.locator('img'));
    await capture.getByRole('button', { name: 'Использовать фото', exact: true }).click();
    await capture.waitFor({ state: 'detached' });
    await tracksStopped(office);
    assert.equal((await api('GET', `/sessions/${session.id}`)).photos.length, 0, 'Taking a photograph requires an explicit upload after preview');
    await imageReady(doc.locator('img').first());
    const uploading = responsePending(office, response => response.url().endsWith(`/sessions/${session.id}/photos`) && response.request().method() === 'POST');
    await doc.getByRole('button', { name: 'Загрузить фото', exact: true }).click();
    const uploadedResponse = await uploading;
    assert.ok([200, 201].includes(uploadedResponse.status()), await uploadedResponse.text());
    const photo = await uploadedResponse.json();
    const content = await fetch(`${fixture.origin}/api/v1${staffRoute}/photos/${photo.id}/content`, { headers: { Authorization: `Bearer ${recruiter.accessToken}` } });
    assert.equal(content.status, 200);
    const capturedJpeg = Buffer.from(await content.arrayBuffer());
    assert.deepEqual([...capturedJpeg.subarray(0, 3)], [0xff, 0xd8, 0xff]);
    assert.ok(capturedJpeg.length > 1000);
    await imageReady(doc.locator('.attachment-photo-thumbnail img').first());
    await doc.getByRole('button', { name: /^Открыть фото/ }).first().click();
    const preview = office.getByRole('dialog');
    await imageReady(preview.locator('img'));
    await preview.getByRole('button', { name: 'Увеличить фотографию', exact: true }).click();
    await office.keyboard.press('Escape');
    await preview.waitFor({ state: 'detached' });
    const reviewing = responsePending(office, response => response.url().endsWith(`/photos/${photo.id}/review`) && response.request().method() === 'POST');
    await doc.getByRole('checkbox', { name: 'Фото и данные сверены', exact: true }).check();
    await doc.getByRole('button', { name: 'Снимок проверен', exact: true }).click();
    assert.equal((await reviewing).status(), 200);
    await office.getByRole('checkbox', { name: 'Обязательные документы и все данные проверены', exact: true }).check();
    const verifying = responsePending(office, response => response.url().endsWith(`/sessions/${session.id}/verify`) && response.request().method() === 'POST');
    await office.getByRole('button', { name: 'Завершить проверку', exact: true }).click();
    assert.equal((await verifying).status(), 200);
    await nav.getByRole('button', { name: 'Фотографии', exact: true }).click();
    await office.getByRole('checkbox', { name: /^Выбрать фото:/ }).check();
    const deleting = responsePending(office, response => response.url().endsWith('/onboarding/photos/delete') && response.request().method() === 'POST');
    await office.getByRole('button', { name: /^Удалить выбранные фото/ }).click();
    assert.equal((await deleting).status(), 200);
    session = await api('GET', `/sessions/${session.id}`);
    assert.equal(session.status, 'verified');
    assert.equal(session.values.passport_number, 'TEST-ONLY-4271');
    assert.ok(session.photos.find(item => item.id === photo.id).deletedAt);
    await office.screenshot({ path: path.join(output, 'photos-after-review-desktop.png'), fullPage: true });

    // The candidate opens the same immutable form without an employee account.
    const remoteSession = await api('POST', '/sessions', { templateId: template.id });
    await api('PUT', `/sessions/${remoteSession.id}`, { version: remoteSession.version, values: { full_name: 'PRIVATE-STAFF-DRAFT', passport_number: 'PRIVATE-STAFF-NUMBER' } });
    const invitation = await api('POST', `/sessions/${remoteSession.id}/link`, {});
    const candidate = await pageFor(null, true);
    await candidate.setViewportSize({ width: 390, height: 844 });
    await candidate.goto(`${fixture.origin}/#onboarding=${invitation.token}`);
    await candidate.getByRole('button', { name: 'Отправить документы', exact: true }).waitFor();
    assert.ok(!(await candidate.locator('body').innerText()).includes('PRIVATE-STAFF'));
    assert.equal(await candidate.getByLabel(/^ФИО(?: \*)?$/).inputValue(), '');
    await candidate.getByLabel(/^ФИО(?: \*)?$/).fill('Синтетический кандидат по ссылке');
    await candidate.getByLabel('Номер паспорта', { exact: true }).fill('REMOTE-TEST-ONLY');
    const publicDoc = candidate.getByRole('region', { name: 'Паспорт: основной разворот', exact: true });
    // Denied camera must keep the device's native capture/file fallback usable.
    await candidate.evaluate(() => { window.__denyCamera = true; });
    await publicDoc.getByRole('button', { name: /^Сфотографировать/ }).click();
    const fallback = candidate.getByRole('dialog');
    await fallback.getByRole('alert').waitFor();
    assert.equal(await fallback.getByLabel('Фото с камеры устройства', { exact: true }).getAttribute('capture'), 'environment');
    const largePng = Buffer.from(await candidate.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 4000; canvas.height = 3000;
      const context = canvas.getContext('2d');
      context.fillStyle = '#edf3fb'; context.fillRect(0, 0, 4000, 3000);
      context.fillStyle = '#174b85'; context.fillRect(200, 200, 3600, 1000);
      context.fillStyle = '#ffffff'; context.font = 'bold 180px sans-serif'; context.fillText('SYNTHETIC DOCUMENT', 300, 650);
      return canvas.toDataURL('image/png').split(',')[1];
    }), 'base64');
    const chooser = candidate.waitForEvent('filechooser');
    await fallback.getByRole('button', { name: 'Открыть камеру устройства', exact: true }).click();
    await (await chooser).setFiles({ name: 'synthetic-large-camera.png', mimeType: 'image/png', buffer: largePng });
    await imageReady(fallback.locator('img'));
    await fallback.getByRole('button', { name: 'Использовать фото', exact: true }).click();
    await fallback.waitFor({ state: 'detached' });
    await imageReady(publicDoc.locator('img').first());
    assert.ok(await publicDoc.locator('img').first().evaluate(image => image.naturalWidth <= 2160 && image.naturalHeight <= 2160), 'Large phone images are resized to the OCR provider limits before staging');
    const publicUploading = responsePending(candidate, response => response.url().endsWith('/recruitment-onboarding/upload'));
    await publicDoc.getByRole('button', { name: 'Загрузить фото', exact: true }).click();
    assert.ok([200, 201].includes((await publicUploading).status()));
    assert.ok(await candidate.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Public mobile form fits the viewport');
    await candidate.screenshot({ path: path.join(output, 'candidate-mobile.png'), fullPage: true });
    const submitting = responsePending(candidate, response => response.url().endsWith('/recruitment-onboarding/submit'));
    await candidate.getByRole('checkbox', { name: 'Я ознакомился(ась) с информацией об обработке данных', exact: true }).check();
    await candidate.getByRole('button', { name: 'Отправить документы', exact: true }).click();
    assert.ok([200, 201].includes((await submitting).status()));
    const submitted = await api('GET', `/sessions/${remoteSession.id}`);
    assert.equal(submitted.status, 'submitted');
    assert.equal(submitted.linkActive, false);
    assert.equal(submitted.values.full_name, 'Синтетический кандидат по ссылке');
    assert.equal(submitted.photos.length, 1);
    const storedImage = await fetch(`${fixture.origin}/api/v1${staffRoute}/photos/${submitted.photos[0].id}/content`, { headers: { Authorization: `Bearer ${recruiter.accessToken}` } });
    assert.equal(storedImage.status, 200);
    const dimensions = await office.evaluate(async ({ content, mimeType }) => {
      const image = new Image();
      image.src = `data:${mimeType};base64,${content}`;
      await image.decode();
      return { width: image.naturalWidth, height: image.naturalHeight };
    }, { content: Buffer.from(await storedImage.arrayBuffer()).toString('base64'), mimeType: storedImage.headers.get('content-type') });
    assert.ok(dimensions.width <= 2160 && dimensions.height <= 2160, 'The stored original matches the prepared preview limits');
    for (const token of [invitation.token, officeInvitation.token]) assert.ok(!requestUrls.some(url => url.includes(token)), 'Link token never occurs in HTTP request URLs');
    const storage = await candidate.evaluate(() => ({ local: JSON.stringify({ ...localStorage }), session: JSON.stringify({ ...sessionStorage }) }));
    assert.ok(!storage.local.includes(invitation.token) && !storage.session.includes(invitation.token), 'Public link tokens are not retained in browser storage');
    await candidate.getByRole('heading', { name: 'Документы отправлены', exact: true }).waitFor();
    assert.equal(new URL(candidate.url()).hash, '', 'Successful submission removes the consumed token from browser history');
    await candidate.goto(`${fixture.origin}/#onboarding=${invitation.token}`);
    await candidate.getByText(/ссылк.*(недействительна|истек|отозван)|документы.*отправлены/i).first().waitFor();
    assert.deepEqual(errors, []);
    assert.deepEqual(downloads, []);
    assert.deepEqual(popups, []);
    console.log('PASS onboarding browser: destination form, office camera capture/retake/cancel, guarded preview, manual values, review/delete, public mobile form and denied-camera fallback, one-use submission, token privacy');
  } catch (error) {
    console.error('Browser errors:', errors);
    if (browser) for (const [index, page] of browser.contexts().flatMap(context => context.pages()).entries()) {
      await page.screenshot({ path: path.join(output, `failure-${index}.png`), fullPage: true }).catch(() => {});
      console.error(`Failure page ${index}: ${(await page.locator('body').innerText()).slice(-5000)}`);
    }
    throw error;
  } finally {
    if (browser) await browser.close();
    await fixture.close();
  }
})().catch(error => { console.error(error.stack || error.message); process.exit(1); });
