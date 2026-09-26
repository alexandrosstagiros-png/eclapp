'use strict';

// Generated pixels and a disposable PostgreSQL database only. No live photo data.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { createTestServer } = require('./local-test-server.cjs');
const sharp = require('../recovered/node_modules/sharp');
const { DatabaseService } = require('../recovered/apps/api/src/platform/database.service');
const { AuditService } = require('../recovered/apps/api/src/modules/audit/application/audit.service');
const { InspectionPhotoLifecycleWorker } = require('../recovered/apps/api/src/modules/inspections/infra/inspection-photo-lifecycle.worker');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const fixture = await createTestServer({ inspectionPhotoMaintenance: false, builtFrontend: process.env.TEAM_BUILT_FRONTEND === 'true' });
  const database = new DatabaseService({ value: { databaseUrl: process.env.DATABASE_URL } });
  const worker = new InspectionPhotoLifecycleWorker(database, new AuditService());
  let browser;
  const errors = [], downloads = [], photoResponses = [];
  const output = path.resolve(__dirname, '../.local/inspection-photo-retention-qa');
  try {
    const { ids, adminPool: db, request, devLogin } = fixture;
    const driver = await devLogin(ids.drivers[0]), mechanic = await devLogin(ids.mechanic);
    const scope = { legalEntityId: ids.legal, regionId: ids.region, projectId: ids.project, responsibilityScopeId: ids.scope };
    async function api(session, method, route, body) {
      const response = await request(method, route, body, session.accessToken);
      assert.ok([200, 201].includes(response.status), `${method} ${route}: ${response.status} ${JSON.stringify(response.body)}`);
      return response.body;
    }
    const template = await api(mechanic, 'POST', '/inspections/templates', {
      idempotencyKey: randomUUID(), expectedVersion: 0, title: 'Проверка хранения фото', scope,
      items: [{ id: 'front_photo', section: 'vehicle', kind: 'photo', label: 'Кабина спереди', instruction: 'Снимок кабины', required: true, critical: false }],
    });
    const width = 2100, height = 1400, raw = Buffer.alloc(width * height * 3);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 3;
      raw[offset] = (x / width * 160 + (y % 31)) & 255;
      raw[offset + 1] = (y / height * 160 + (x % 31)) & 255;
      raw[offset + 2] = (x ^ y) & 255;
    }
    const jpeg = await sharp(raw, { raw: { width, height, channels: 3 } }).jpeg({ quality: 97 }).toBuffer();
    const photo = await api(driver, 'POST', `/inspections/trips/${ids.trips[0]}/photos`, {
      idempotencyKey: randomUUID(), templateId: template.id, itemId: 'front_photo', mimeType: 'image/jpeg', contentBase64: jpeg.toString('base64'),
    });
    const answers = [{ itemId: 'front_photo', result: 'ok', comment: 'Кабина проверена', photoIds: [photo.id] }];
    const original = await api(driver, 'POST', `/inspections/trips/${ids.trips[0]}/submissions`, {
      idempotencyKey: randomUUID(), templateId: template.id, expectedRevision: 0, occurredAt: new Date().toISOString(), comment: 'Первый комментарий', answers,
    });
    await api(mechanic, 'POST', `/inspections/submissions/${original.id}/review`, { idempotencyKey: randomUUID(), decision: 'returned', reason: 'Уточните комментарий' });
    const accepted = await api(driver, 'POST', `/inspections/trips/${ids.trips[0]}/submissions`, {
      idempotencyKey: randomUUID(), templateId: template.id, expectedRevision: 1, occurredAt: original.occurredAt, comment: 'Проверено перед выездом', answers,
    });
    await api(mechanic, 'POST', `/inspections/submissions/${accepted.id}/review`, { idempotencyKey: randomUUID(), decision: 'accepted', reason: null });

    const oldTrip = randomUUID(), oldPhoto = randomUUID(), oldReport = randomUUID();
    await db.query(`INSERT INTO trips(id,reference,business_date,project_id,region_id,legal_entity_id,responsibility_scope_id,vehicle_id,route_summary)
      SELECT $1,'RETENTION-OLD-ACCEPTED',business_date-100,project_id,region_id,legal_entity_id,responsibility_scope_id,vehicle_id,'Synthetic historical inspection' FROM trips WHERE id=$2`, [oldTrip, ids.trips[0]]);
    await db.query('INSERT INTO trip_assignments(trip_id,user_id,active) VALUES($1,$2,true)', [oldTrip, ids.drivers[0]]);
    await db.query(`INSERT INTO inspection_photos(id,trip_id,driver_id,template_id,item_id,mime_type,content,byte_size,sha256,uploaded_at)
      VALUES($1,$2,$3,$4,'front_photo','image/jpeg',$5,$6,$7,clock_timestamp()-interval '3 months 1 minute')`,
    [oldPhoto, oldTrip, ids.drivers[0], template.id, jpeg, jpeg.length, createHash('sha256').update(jpeg).digest('hex')]);
    const seed = await db.connect();
    try {
      await seed.query('BEGIN');
      // Reproduce a report that existed before retention was introduced. Only the
      // new-link expiry guard is bypassed, solely within this disposable fixture.
      await seed.query('ALTER TABLE inspection_answer_photos DISABLE TRIGGER inspection_answer_photos_live');
      await seed.query(`INSERT INTO inspection_submissions(id,trip_id,driver_id,template_id,vehicle_id,business_date,legal_entity_id,region_id,project_id,responsibility_scope_id,revision,comment,occurred_at,submitted_at,has_critical_defects)
        SELECT $1,t.id,$2,$3,t.vehicle_id,t.business_date,t.legal_entity_id,t.region_id,t.project_id,t.responsibility_scope_id,1,'Сохранённый исторический комментарий',p.uploaded_at,p.uploaded_at,false
        FROM trips t JOIN inspection_photos p ON p.trip_id=t.id WHERE p.id=$4`, [oldReport, ids.drivers[0], template.id, oldPhoto]);
      await seed.query("INSERT INTO inspection_answers(submission_id,template_id,item_id,result,comment) VALUES($1,$2,'front_photo','ok','Исторический ответ водителя')", [oldReport, template.id]);
      await seed.query("INSERT INTO inspection_answer_photos(submission_id,item_id,photo_id,trip_id,driver_id,template_id) VALUES($1,'front_photo',$2,$3,$4,$5)", [oldReport, oldPhoto, oldTrip, ids.drivers[0], template.id]);
      await seed.query("INSERT INTO inspection_reviews(id,submission_id,decision,reason,reviewed_by,reviewed_at) VALUES($1,$2,'accepted',NULL,$3,clock_timestamp())", [randomUUID(), oldReport, ids.mechanic]);
      await seed.query('ALTER TABLE inspection_answer_photos ENABLE TRIGGER inspection_answer_photos_live');
      await seed.query('COMMIT');
    } catch (error) { await seed.query('ROLLBACK'); throw error; } finally { seed.release(); }

    const processed = await worker.runOnce();
    assert.equal(processed.compressed, 1); assert.equal(processed.deleted, 1);
    const detail = await api(mechanic, 'GET', `/inspections/submissions/${accepted.id}`);
    const storedPhoto = detail.photos[0];
    assert.equal(storedPhoto.mimeType, 'image/webp'); assert.ok(storedPhoto.compressedAt); assert.ok(storedPhoto.autoDeleteAt);
    assert.deepEqual(detail.answers, answers); assert.equal(detail.status, 'accepted');

    browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, acceptDownloads: true });
    await context.addInitScript(value => sessionStorage.setItem('ecl.session.v2', JSON.stringify({ session: value })), { ...mechanic, rememberedDevice: false });
    const page = await context.newPage(); page.setDefaultTimeout(20000);
    page.on('pageerror', error => errors.push(error.message));
    page.on('download', download => downloads.push(download.suggestedFilename()));
    page.on('response', response => {
      if (/\/inspections\/photos\/[^/]+\/download$/.test(response.url())) photoResponses.push({ url: response.url(), status: response.status(), type: response.headers()['content-type'] });
    });
    await page.goto(`${fixture.origin}/?section=inspections`);
    await page.getByRole('group', { name: 'Статус осмотра', exact: true }).getByRole('button', { name: 'КО принят', exact: true }).click();
    async function select(reference) {
      const back = page.getByRole('button', { name: '← К списку осмотров', exact: true });
      if (await back.isVisible()) await back.click();
      await page.locator('.ko-queue-item').filter({ hasText: reference }).click();
      await page.locator('.ko-review-panel .ko-photo-item').first().waitFor();
      await page.locator('.ko-review-panel .ko-photo-item').first().scrollIntoViewIfNeeded();
    }
    async function ready(image) {
      await image.waitFor(); await image.evaluate(node => node.decode());
      const size = await image.evaluate(node => ({ width: node.naturalWidth, height: node.naturalHeight }));
      assert.deepEqual(size, { width: 1600, height: 1067 });
    }
    const panel = page.locator('.ko-review-panel');
    await select('DEMO-001');
    const card = panel.locator('.ko-photo-item').first();
    await ready(card.locator('img'));
    await card.getByText('Сжато после принятия осмотра', { exact: true }).waitFor();
    const date = new Date(storedPhoto.autoDeleteAt).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    assert.equal(await card.locator('.ko-photo-retention').innerText(), `Автоудаление: ${date} МСК`);
    await card.getByRole('button', { name: /^Открыть фото:/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Просмотр фотографии', exact: true });
    await ready(dialog.locator('img'));
    await dialog.getByRole('button', { name: 'Увеличить фотографию', exact: true }).click();
    assert.equal(await dialog.getByLabel('Масштаб', { exact: true }).innerText(), '125%');
    await dialog.getByRole('button', { name: 'Закрыть просмотр', exact: true }).click();
    const history = panel.locator('.ko-history');
    await history.getByText('Предыдущие версии осмотра', { exact: true }).waitFor();
    await history.locator('summary').click();
    await history.getByText('Уточните комментарий', { exact: true }).waitFor();
    await history.getByText('Первый комментарий', { exact: true }).waitFor();
    await ready(history.locator('.ko-photo-item img'));
    assert.ok(photoResponses.some(response => response.url.endsWith(`/${photo.id}/download`) && response.status === 200 && response.type === 'image/webp'));
    await fs.mkdir(output, { recursive: true });
    await page.screenshot({ path: path.join(output, 'compressed-photo-desktop.png'), fullPage: true });

    await select('RETENTION-OLD-ACCEPTED');
    await panel.getByText('Фото удалено автоматически', { exact: true }).waitFor();
    await panel.getByText('Истёк срок хранения: 3 месяца с загрузки.', { exact: true }).waitFor();
    await panel.getByText('Сохранённый исторический комментарий', { exact: true }).waitFor();
    await panel.getByText('Исторический ответ водителя', { exact: true }).waitFor();
    await panel.getByText('Фотоотчёт принят без замечаний.', { exact: true }).waitFor();
    assert.equal(await panel.locator('.ko-photo-item img').count(), 0);
    assert.equal(await panel.getByRole('button', { name: /^Удалить фото:/ }).count(), 0);
    const historical = await api(mechanic, 'GET', `/inspections/submissions/${oldReport}`);
    assert.equal(historical.status, 'accepted'); assert.equal(historical.photos[0].deletionReason, 'retention');
    const unavailable = await fetch(`${fixture.origin}/api/v1/inspections/photos/${oldPhoto}/download`, { headers: { Authorization: `Bearer ${mechanic.accessToken}` } });
    assert.equal(unavailable.status, 404);

    await page.setViewportSize({ width: 390, height: 844 });
    await panel.getByText('Фото удалено автоматически', { exact: true }).scrollIntoViewIfNeeded();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Retention marker fits the mobile viewport');
    await page.screenshot({ path: path.join(output, 'expired-photo-mobile.png'), fullPage: true });
    await select('DEMO-001');
    await ready(card.locator('img'));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Compressed photo and deadline fit the mobile viewport');
    await card.getByRole('button', { name: /^Открыть фото:/ }).click();
    await ready(dialog.locator('img'));
    assert.ok(await dialog.evaluate(node => { const box = node.getBoundingClientRect(); return box.left >= 0 && box.right <= innerWidth; }), 'Mobile photo viewer fits viewport');
    await page.screenshot({ path: path.join(output, 'compressed-photo-mobile-viewer.png'), fullPage: true });
    await dialog.getByRole('button', { name: 'Закрыть просмотр', exact: true }).click();

    // A device may retain a never-submitted draft for months. If its earlier
    // upload expires, the definitive API error must unlock the form and reuse
    // the local image, without asking the driver to take another photograph.
    const draftTrip = randomUUID();
    await db.query(`INSERT INTO trips(id,reference,business_date,project_id,region_id,legal_entity_id,responsibility_scope_id,vehicle_id,route_summary)
      SELECT $1,'RETENTION-DRAFT-RECOVERY',business_date,project_id,region_id,legal_entity_id,responsibility_scope_id,vehicle_id,'Synthetic cached draft' FROM trips WHERE id=$2`, [draftTrip, ids.trips[0]]);
    await db.query('INSERT INTO trip_assignments(trip_id,user_id,active) VALUES($1,$2,true)', [draftTrip, ids.drivers[0]]);
    const driverContext = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
    await driverContext.addInitScript(value => sessionStorage.setItem('ecl.session.v2', JSON.stringify({ session: value })), { ...driver, rememberedDevice: false });
    const dp = await driverContext.newPage(); dp.setDefaultTimeout(20000);
    dp.on('pageerror', error => errors.push(error.message));
    dp.on('download', download => downloads.push(download.suggestedFilename()));
    let uploadCount = 0, expiredId;
    dp.on('request', request => { if (request.method() === 'POST' && request.url().endsWith(`/inspections/trips/${draftTrip}/photos`)) uploadCount++; });
    await dp.goto(`${fixture.origin}/?section=inspections`);
    await dp.locator('.ko-trip-picker select').selectOption(draftTrip);
    await dp.getByRole('button', { name: 'Начать КО', exact: true }).click();
    const form = dp.locator('.ko-form-item').first();
    await form.getByRole('button', { name: 'В порядке', exact: true }).click();
    await form.locator('textarea').fill('Сохранённый ответ после истечения срока');
    await dp.getByLabel(/^Общий комментарий механику/).fill('Не требовать повторную съёмку');
    await form.locator('input[type="file"]').first().setInputFiles({ name: 'local-inspection.jpg', mimeType: 'image/jpeg', buffer: jpeg });
    await form.locator('.ko-draft-photo img').evaluate(image => image.decode());
    const submitPattern = `**/api/v1/inspections/trips/${draftTrip}/submissions`;
    await dp.route(submitPattern, async route => {
      if (route.request().method() === 'POST' && !expiredId) {
        expiredId = route.request().postDataJSON().answers[0].photoIds[0];
        const clock = await db.connect();
        try {
          await clock.query('BEGIN');
          // Only advance the age of this unlinked synthetic upload; production
          // upload timestamps stay immutable and no real database is involved.
          await clock.query('ALTER TABLE inspection_photos DISABLE TRIGGER inspection_photos_lifecycle');
          await clock.query("UPDATE inspection_photos SET uploaded_at=clock_timestamp()-interval '3 months 1 minute' WHERE id=$1", [expiredId]);
          await clock.query('ALTER TABLE inspection_photos ENABLE TRIGGER inspection_photos_lifecycle');
          await clock.query('COMMIT');
        } catch (error) { await clock.query('ROLLBACK'); throw error; } finally { clock.release(); }
      }
      await route.continue();
    });
    const rejected = dp.waitForResponse(response => response.url().endsWith(`/inspections/trips/${draftTrip}/submissions`) && response.request().method() === 'POST');
    await dp.getByRole('button', { name: 'Отправить КО', exact: true }).click();
    const failure = await rejected;
    assert.equal(failure.status(), 400);
    const failureBody = await failure.json();
    assert.equal(failureBody.code, 'INSPECTION_PHOTOS_UNAVAILABLE');
    assert.deepEqual(failureBody.unavailablePhotoIds, [expiredId]);
    await dp.getByRole('alert').filter({ hasText: 'Ответы и снимки на устройстве сохранены' }).waitFor();
    await dp.unroute(submitPattern);
    assert.equal(uploadCount, 1);
    assert.equal(await form.locator('textarea').inputValue(), 'Сохранённый ответ после истечения срока');
    assert.equal(await form.locator('textarea').isEditable(), true);
    assert.equal(await form.locator('.ko-draft-photo').count(), 1);
    assert.match(await form.locator('.ko-draft-photo figcaption').innerText(), /^На устройстве/);
    await dp.reload();
    await dp.locator('.ko-trip-picker select').selectOption(draftTrip);
    await form.locator('textarea').waitFor();
    assert.equal(await form.locator('textarea').inputValue(), 'Сохранённый ответ после истечения срока');
    assert.equal(await dp.getByLabel(/^Общий комментарий механику/).inputValue(), 'Не требовать повторную съёмку');
    await form.locator('.ko-draft-photo img').evaluate(image => image.decode());
    const delivered = dp.waitForResponse(response => response.url().endsWith(`/inspections/trips/${draftTrip}/submissions`) && response.request().method() === 'POST');
    await dp.getByRole('button', { name: 'Отправить КО', exact: true }).click();
    const response = await delivered;
    assert.equal(response.status(), 201, await response.text());
    const recovered = await response.json();
    assert.equal(uploadCount, 2, 'Only the expired upload is sent again; no file selection or camera retake');
    assert.notEqual(recovered.answers[0].photoIds[0], expiredId);
    assert.equal(recovered.answers[0].comment, 'Сохранённый ответ после истечения срока');
    assert.equal(recovered.comment, 'Не требовать повторную съёмку');
    await dp.getByRole('heading', { name: 'КО передан механику', exact: true }).waitFor();
    assert.ok(await dp.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Recovered draft fits the mobile viewport');
    await dp.screenshot({ path: path.join(output, 'expired-draft-recovered-mobile.png'), fullPage: true });
    assert.deepEqual(errors, []); assert.deepEqual(downloads, []);
    console.log('PASS inspection photo retention browser: real WebP thumbnail and zoom, compression/deadline labels, previous report history, automatic deletion marker and preserved answers/review, expired cached upload recovery with local photo preserved through reload, mobile layout; no browser errors or forced downloads');
  } catch (error) {
    if (browser) {
      await fs.mkdir(output, { recursive: true });
      for (const [index, page] of browser.contexts().flatMap(context => context.pages()).entries()) {
        await page.screenshot({ path: path.join(output, `failure-${index}.png`), fullPage: true }).catch(() => {});
        console.error(`Failure page ${index}: ${(await page.locator('body').innerText()).slice(-6500)}`);
      }
    }
    console.error('Browser errors:', errors);
    throw error;
  } finally {
    if (browser) await browser.close();
    await worker.onModuleDestroy(); await database.onApplicationShutdown(); await fixture.close();
  }
})().catch(error => { console.error(error.stack || error.message); process.exit(1); });
