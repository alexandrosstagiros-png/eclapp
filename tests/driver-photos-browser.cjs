'use strict';

// Real local PostgreSQL/API, synthetic accounts, and Chromium's fake camera.
// No production services, credentials, or physical camera are used.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createTestServer } = require('./local-test-server.cjs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const fixture = await createTestServer({ builtFrontend: process.env.TEAM_BUILT_FRONTEND === 'true' });
  let browser;
  const errors = [];
  try {
    const { ids, request, devLogin } = fixture;
    await fixture.adminPool.query('UPDATE access_grants SET personal_data_visible=true WHERE user_id=$1', [ids.specialist]);
    const driver = await devLogin(ids.drivers[0]);
    const otherDriver = await devLogin(ids.drivers[1]);
    const specialist = await devLogin(ids.specialist);
    const mechanic = await devLogin(ids.mechanic);
    async function api(session, method, route, body) {
      const result = await request(method, route, body, session.accessToken);
      assert.ok([200, 201].includes(result.status), `${method} ${route}: ${result.status} ${JSON.stringify(result.body)}`);
      return result.body;
    }
    const itemLabel = 'Кабина спереди';
    await api(mechanic, 'POST', '/inspections/templates', {
      idempotencyKey: randomUUID(), expectedVersion: 0, title: 'Проверка фотографий КО',
      scope: { legalEntityId: ids.legal, regionId: ids.region, projectId: ids.project, responsibilityScopeId: ids.scope },
      items: [{ id: 'front_photo', section: 'vehicle', kind: 'photo', label: itemLabel, instruction: 'Сфотографируйте кабину.', required: true, critical: false }],
    });

    browser = await chromium.launch({
      headless: true,
      args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
      ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
    });
    const unexpectedDownloads = [], popups = [];
    async function pageFor(session, section, camera = false) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true, ...(camera ? { permissions: ['camera'] } : {}) });
      await context.addInitScript(value => {
        sessionStorage.setItem('ecl.session.v2', JSON.stringify({ session: value }));
        // Wrap the browser's real fake-device implementation to verify cleanup.
        window.__cameraTracks = [];
        window.__denyCamera = false;
        const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        navigator.mediaDevices.getUserMedia = async constraints => {
          if (window.__denyCamera) throw new DOMException('Synthetic permission denial', 'NotAllowedError');
          const stream = await original(constraints);
          window.__cameraTracks.push(...stream.getTracks());
          return stream;
        };
      }, { ...session, rememberedDevice: false });
      const page = await context.newPage();
      page.setDefaultTimeout(20_000);
      page.on('pageerror', error => { errors.push(error.message); console.error(error.stack || error.message); });
      page.on('popup', popup => popups.push(popup.url()));
      page.on('download', download => unexpectedDownloads.push(download.suggestedFilename()));
      await page.goto(`${fixture.origin}/?section=${section}`);
      return page;
    }
    async function openDocuments(page) {
      await page.locator('.trip-card').filter({ hasText: 'DEMO-001' }).click();
      await page.locator('.workflow-section').getByRole('button', { name: 'Документы', exact: true }).click();
      await page.locator('.workflow-content').waitFor();
    }
    async function imageReady(locator) {
      await locator.waitFor();
      await locator.evaluate(image => image.decode());
      assert.ok(await locator.evaluate(image => image.naturalWidth > 0 && image.naturalHeight > 0), 'Preview contains a decoded image');
    }
    async function tracksStopped(page) {
      await page.waitForFunction(() => window.__cameraTracks.length > 0 && window.__cameraTracks.every(track => track.readyState === 'ended'));
    }
    async function openCamera(page, scope) {
      await page.bringToFront();
      await scope.getByRole('button', { name: /^Сфотографировать/ }).click();
      const dialog = page.getByRole('dialog');
      await dialog.waitFor();
      await dialog.locator('video').waitFor();
      await page.waitForFunction(() => [...document.querySelectorAll('[role="dialog"] video, dialog video')].some(video => video.readyState >= 2 && video.videoWidth > 0));
      return dialog;
    }
    async function capturePhoto(page, scope, retake = false) {
      const dialog = await openCamera(page, scope);
      await dialog.getByRole('button', { name: 'Сделать снимок', exact: true }).click();
      await imageReady(dialog.locator('img'));
      if (retake) {
        await dialog.getByRole('button', { name: 'Переснять', exact: true }).click();
        await page.waitForFunction(() => [...document.querySelectorAll('[role="dialog"] video, dialog video')].some(video => video.readyState >= 2 && video.videoWidth > 0));
        await dialog.getByRole('button', { name: 'Сделать снимок', exact: true }).click();
        await imageReady(dialog.locator('img'));
      }
      await dialog.getByRole('button', { name: 'Использовать фото', exact: true }).click();
      await dialog.waitFor({ state: 'detached' });
      await tracksStopped(page);
    }
    async function verifyJpeg(route, session) {
      const result = await fetch(`${fixture.origin}/api/v1${route}`, { headers: { Authorization: `Bearer ${session.accessToken}` } });
      assert.equal(result.status, 200);
      assert.match(result.headers.get('content-type'), /^image\/jpeg/);
      const bytes = Buffer.from(await result.arrayBuffer());
      assert.deepEqual([...bytes.subarray(0, 3)], [0xff, 0xd8, 0xff]);
      assert.ok(bytes.length > 1000, 'Camera produced a nonempty JPEG');
      const forbidden = await fetch(`${fixture.origin}/api/v1${route}`, { headers: { Authorization: `Bearer ${otherDriver.accessToken}` } });
      assert.equal(forbidden.status, 404, 'Other drivers cannot read the photo');
      return bytes;
    }
    async function previewAndZoom(page, thumbnail) {
      await thumbnail.click();
      const dialog = page.getByRole('dialog');
      await dialog.waitFor();
      await imageReady(dialog.locator('img'));
      const before = await dialog.locator('img').boundingBox();
      await dialog.getByRole('button', { name: 'Увеличить фотографию', exact: true }).click();
      const after = await dialog.locator('img').boundingBox();
      assert.ok(after.width > before.width || after.height > before.height, 'Zoom enlarges the displayed photograph');
      await page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'detached' });
      assert.ok(await thumbnail.evaluate(node => node === document.activeElement || node.contains(document.activeElement)), 'Closing preview restores focus');
    }

    const dp = await pageFor(driver, 'trips', true);
    await openDocuments(dp);
    const upload = dp.locator('.upload-box');
    await upload.getByRole('button', { name: 'Выбрать файл', exact: true }).waitFor();

    // Cancellation and component removal must release the camera stream.
    await openCamera(dp, upload);
    await dp.keyboard.press('Escape');
    await dp.getByRole('dialog').waitFor({ state: 'detached' });
    await tracksStopped(dp);
    await openCamera(dp, upload);
    await dp.locator('.workflow-section').getByRole('button', { name: 'Факт рейса', exact: true }).evaluate(button => button.click());
    await dp.getByRole('dialog').waitFor({ state: 'detached' });
    await tracksStopped(dp);
    await dp.locator('.workflow-section').getByRole('button', { name: 'Документы', exact: true }).click();

    await capturePhoto(dp, upload, true);
    await imageReady(upload.locator('img'));
    const savedDocument = dp.waitForResponse(response => response.url().endsWith(`/workflow/trips/${ids.trips[0]}/documents`) && response.request().method() === 'POST');
    await upload.getByRole('button', { name: 'Загрузить документ', exact: true }).click();
    const saved = await savedDocument;
    assert.ok([200, 201].includes(saved.status()), await saved.text());
    const document = await saved.json();
    const documentRoute = `/workflow/documents/${document.id}/download`;
    await imageReady(dp.locator('.document-card img').first());
    const capturedJpeg = await verifyJpeg(documentRoute, specialist);

    // A denied camera leaves the ordinary file chooser usable, including PDF.
    await dp.evaluate(() => { window.__denyCamera = true; });
    await upload.getByRole('button', { name: 'Сфотографировать', exact: true }).click();
    await dp.getByRole('alert').filter({ hasText: /камер/i }).waitFor();
    const deniedCamera = dp.getByRole('dialog', { name: 'Сфотографировать', exact: true });
    assert.equal(await deniedCamera.getByLabel('Фото с камеры устройства', { exact: true }).getAttribute('capture'), 'environment');
    const nativeChooser = dp.waitForEvent('filechooser');
    await deniedCamera.getByRole('button', { name: 'Открыть камеру устройства', exact: true }).click();
    await (await nativeChooser).setFiles({ name: 'снимок-камеры.jpg', mimeType: 'image/jpeg', buffer: capturedJpeg });
    await imageReady(deniedCamera.locator('img'));
    await deniedCamera.getByRole('button', { name: 'Использовать фото', exact: true }).click();
    await deniedCamera.waitFor({ state: 'detached' });
    await imageReady(upload.locator('img'));
    await upload.getByRole('button', { name: 'Убрать выбранный файл', exact: true }).click();
    await upload.getByRole('button', { name: 'Выбрать файл', exact: true }).waitFor();
    const pdfBytes = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n');
    await upload.getByLabel('Тип документа').selectOption('waybill');
    await upload.getByRole('group', { name: 'Файл или фотография', exact: true }).locator('input[type="file"]').setInputFiles({ name: 'путевой-лист.pdf', mimeType: 'application/pdf', buffer: pdfBytes });
    await upload.getByRole('button', { name: 'Загрузить документ', exact: true }).click();
    await dp.locator('.document-card').filter({ hasText: '.pdf' }).waitFor();
    await dp.evaluate(() => { window.__denyCamera = false; });

    // The specialist can recover a failed preview without downloading a file.
    const sp = await pageFor(specialist, 'trips');
    const previewPattern = `**/api/v1${documentRoute}`;
    await sp.route(previewPattern, route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Synthetic preview failure' }) }));
    await openDocuments(sp);
    await sp.locator('.document-card').first().scrollIntoViewIfNeeded();
    await sp.locator('.document-card').getByRole('button', { name: /Повторить/ }).click({ trial: true });
    await sp.unroute(previewPattern);
    await sp.locator('.document-card').getByRole('button', { name: /Повторить/ }).click();
    await imageReady(sp.locator('.document-card img').first());
    await previewAndZoom(sp, sp.locator('.document-card').filter({ has: sp.locator('img') }).getByRole('button', { name: /Открыть/ }));
    const pdfCard = sp.locator('.document-card').filter({ hasText: 'путевой-лист.pdf' });
    assert.equal(await pdfCard.locator('img').count(), 0, 'PDF stays available as a file');
    assert.equal(await pdfCard.getByRole('button', { name: /Открыть/ }).count(), 0);
    await pdfCard.getByRole('button', { name: 'Скачать', exact: true }).waitFor();

    // The same camera workflow delivers inspection evidence to the mechanic.
    await dp.getByRole('button', { name: 'Контрольный осмотр', exact: true }).click();
    await dp.getByRole('button', { name: 'Начать КО', exact: true }).click();
    const item = dp.locator('.ko-form-item').filter({ hasText: itemLabel });
    await item.getByRole('button', { name: 'В порядке', exact: true }).click();
    await capturePhoto(dp, item);
    await imageReady(item.locator('.ko-draft-photo img'));
    await dp.getByRole('button', { name: 'Отправить КО', exact: true }).click();
    await dp.getByRole('heading', { name: 'КО передан механику', exact: true }).waitFor();
    const state = await api(driver, 'GET', `/inspections/trips/${ids.trips[0]}`);
    assert.equal(state.submissions.length, 1);
    const inspectionPhoto = state.submissions[0].answers[0].photoIds[0];
    await verifyJpeg(`/inspections/photos/${inspectionPhoto}/download`, mechanic);
    const mp = await pageFor(mechanic, 'inspections');
    await mp.locator('.ko-queue-item').filter({ hasText: 'DEMO-001' }).click();
    await imageReady(mp.locator('.ko-review-panel .ko-photos img'));
    await previewAndZoom(mp, mp.locator('.ko-review-panel .ko-photos').getByRole('button', { name: /Открыть/ }));

    const output = path.resolve(__dirname, '../.local/driver-photos-qa');
    await fs.mkdir(output, { recursive: true });
    await sp.screenshot({ path: path.join(output, 'documents-desktop.png'), fullPage: true });
    await mp.setViewportSize({ width: 390, height: 844 });
    assert.ok(await mp.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile inspection page fits the viewport');
    await mp.locator('.ko-review-panel .ko-photos').getByRole('button', { name: /Открыть/ }).click();
    const mobileDialog = mp.getByRole('dialog');
    await imageReady(mobileDialog.locator('img'));
    const bounds = await mobileDialog.boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 391, 'Mobile preview stays inside the screen');
    await mobileDialog.getByRole('button', { name: 'Увеличить фотографию', exact: true }).click();
    assert.ok(await mp.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Zoom scroll is contained inside the viewer');
    await mp.screenshot({ path: path.join(output, 'inspection-photo-mobile.png'), fullPage: true });
    await mp.keyboard.press('Escape');
    assert.deepEqual(errors, []);
    assert.deepEqual(unexpectedDownloads, [], 'Viewing photos never triggers file downloads');
    assert.deepEqual(popups, [], 'Photographs open inside the application');
    const pdfDownload = sp.waitForEvent('download');
    await pdfCard.getByRole('button', { name: 'Скачать', exact: true }).click();
    const downloadedPdf = await pdfDownload;
    assert.equal(downloadedPdf.suggestedFilename(), 'путевой-лист.pdf');
    assert.deepEqual(await fs.readFile(await downloadedPdf.path()), pdfBytes, 'Existing PDF download preserves the uploaded bytes');
    console.log('PASS driver photos browser: real camera JPEG capture/retake, cancellation/unmount cleanup, denied-camera file fallback, document and inspection delivery, reviewer thumbnails/zoom/retry, PDF compatibility, driver access isolation, mobile viewer');
  } catch (error) {
    console.error('Browser errors:', errors);
    if (browser) {
      const output = path.resolve(__dirname, '../.local/driver-photos-qa');
      await fs.mkdir(output, { recursive: true });
      for (const [index, page] of browser.contexts().flatMap(context => context.pages()).entries()) {
        await page.screenshot({ path: path.join(output, `failure-${index}.png`), fullPage: true }).catch(() => {});
        console.error(`Failure page ${index}: ${(await page.locator('body').innerText()).slice(-6000)}`);
      }
    }
    throw error;
  } finally {
    if (browser) await browser.close();
    await fixture.close();
  }
})().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
