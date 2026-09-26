'use strict';

// Real API + disposable PostgreSQL + generated pixels; no real accounts or photos.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { createTestServer } = require('./local-test-server.cjs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const fixture = await createTestServer({ builtFrontend: process.env.TEAM_BUILT_FRONTEND === 'true' });
  let browser;
  const errors = [], uploads = [], unexpectedDownloads = [];
  const output = path.resolve(__dirname, '../.local/inspection-rework-qa');
  try {
    const { ids, adminPool: db, request, devLogin } = fixture;
    await db.query('UPDATE access_grants SET personal_data_visible=true WHERE user_id=$1', [ids.admin]);
    await db.query('UPDATE access_grants SET inspection_photo_delete=true WHERE user_id=$1', [ids.mechanic]);
    const driver = await devLogin(ids.drivers[0]), chief = await devLogin(ids.mechanic), admin = await devLogin(ids.admin);
    async function api(session, method, route, body) {
      const result = await request(method, route, body, session.accessToken);
      assert.ok([200, 201].includes(result.status), `${method} ${route}: ${result.status} ${JSON.stringify(result.body)}`);
      return result.body;
    }
    browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
    const painter = await browser.newPage();
    const contentBase64 = await painter.evaluate(() => {
      const canvas = document.createElement('canvas'); canvas.width = 200; canvas.height = 120;
      const context = canvas.getContext('2d'); context.fillStyle = '#187597'; context.fillRect(0, 0, 200, 120);
      context.fillStyle = 'white'; context.font = '18px sans-serif'; context.fillText('Synthetic photo', 20, 64);
      return canvas.toDataURL('image/png').split(',')[1];
    });
    await painter.close();
    const png = Buffer.from(contentBase64, 'base64');
    const scope = { legalEntityId: ids.legal, regionId: ids.region, projectId: ids.project, responsibilityScopeId: ids.scope };
    const items = [
      { id: 'front_photo', section: 'vehicle', kind: 'photo', label: 'Кабина спереди', instruction: 'Сфотографируйте кабину', required: true, critical: false },
      { id: 'driver_note', section: 'other', kind: 'text', label: 'Замечания водителя', instruction: 'Сообщите механику', required: true, critical: false },
      { id: 'brakes', section: 'equipment', kind: 'check', label: 'Тормоза', instruction: 'Проверьте тормоза', required: true, critical: true },
    ];
    const template = await api(chief, 'POST', '/inspections/templates', { idempotencyKey: randomUUID(), expectedVersion: 0, title: 'Синтетическая проверка доработки', scope, items });
    async function trip(reference, oldBusinessDate = false) {
      const id = randomUUID();
      await db.query(`INSERT INTO trips(id,reference,business_date,project_id,region_id,legal_entity_id,responsibility_scope_id,vehicle_id,route_summary)
        SELECT $1,$2,business_date-CASE WHEN $3::boolean THEN 35 ELSE 0 END,project_id,region_id,legal_entity_id,responsibility_scope_id,vehicle_id,'Synthetic browser route' FROM trips WHERE id=$4`, [id, reference, oldBusinessDate, ids.trips[0]]);
      await db.query('INSERT INTO trip_assignments(trip_id,user_id,active) VALUES($1,$2,true)', [id, ids.drivers[0]]);
      return id;
    }
    async function photo(tripId, aged = false) {
      if (!aged) return api(driver, 'POST', `/inspections/trips/${tripId}/photos`, { idempotencyKey: randomUUID(), templateId: template.id, itemId: 'front_photo', mimeType: 'image/png', contentBase64 });
      const id = randomUUID();
      await db.query(`INSERT INTO inspection_photos(id,trip_id,driver_id,template_id,item_id,mime_type,content,byte_size,sha256,uploaded_at)
        VALUES($1,$2,$3,$4,'front_photo','image/png',$5,$6,$7,clock_timestamp()-interval '1 month')`, [id, tripId, ids.drivers[0], template.id, png, png.length, createHash('sha256').update(png).digest('hex')]);
      return { id };
    }
    async function submit(tripId, photoIds) {
      return api(driver, 'POST', `/inspections/trips/${tripId}/submissions`, {
        idempotencyKey: randomUUID(), templateId: template.id, expectedRevision: 0, occurredAt: new Date().toISOString(), comment: 'Исходный общий комментарий\nВторая строка',
        answers: [
          { itemId: 'front_photo', result: 'ok', comment: 'Фото сделано утром', photoIds },
          { itemId: 'driver_note', result: 'ok', comment: 'Исходный ответ водителя', photoIds: [] },
          { itemId: 'brakes', result: 'ok', comment: 'Тормоза проверены', photoIds: [] },
        ],
      });
    }
    async function returnReport(report, reason = 'Уточните только комментарий к осмотру') {
      return api(chief, 'POST', `/inspections/submissions/${report.id}/review`, { idempotencyKey: randomUUID(), decision: 'returned', reason });
    }
    const photo1 = await photo(ids.trips[0]), photo2 = await photo(ids.trips[0]);
    const original = await submit(ids.trips[0], [photo1.id, photo2.id]);
    await returnReport(original);
    const olderTrip = await trip('REWORK-OLDER-TRIP', true), olderPhoto = await photo(olderTrip);
    const olderReport = await submit(olderTrip, [olderPhoto.id]);
    await returnReport(olderReport, 'Уточните старый рейс');
    const agedTrip = await trip('DELETE-AGED-PHOTO'), agedPhoto = await photo(agedTrip, true);
    const agedReport = await submit(agedTrip, [agedPhoto.id]);
    // A published change must not force a returned form onto a different checklist.
    await api(chief, 'POST', '/inspections/templates', { idempotencyKey: randomUUID(), expectedVersion: 1, title: 'Следующая версия требований', scope,
      items: [...items, { id: 'new_requirement', section: 'other', kind: 'check', label: 'Новое требование', instruction: '', required: true, critical: false }] });
    async function pageFor(session, section) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, acceptDownloads: true });
      await context.addInitScript(value => sessionStorage.setItem('ecl.session.v2', JSON.stringify({ session: value })), { ...session, rememberedDevice: false });
      const page = await context.newPage(); page.setDefaultTimeout(20000);
      page.on('pageerror', error => { errors.push(error.message); console.error(error.stack || error.message); });
      page.on('download', download => unexpectedDownloads.push(download.suggestedFilename()));
      page.on('request', request => { if (request.method() === 'POST' && /\/inspections\/trips\/[^/]+\/photos$/.test(request.url())) uploads.push(request.url()); });
      await page.goto(`${fixture.origin}/?section=${section}`);
      return page;
    }
    async function imageReady(photo) {
      // Remote previews create their <img> only after IntersectionObserver sees
      // the card. Scroll its existing container into view before awaiting it.
      await photo.scrollIntoViewIfNeeded();
      const image = photo.locator('img').first();
      await image.waitFor(); await image.evaluate(node => node.decode());
      assert.ok(await image.evaluate(node => node.naturalWidth > 0));
    }
    async function badge(page, count) {
      const marker = page.getByLabel(`Требуют доработки: ${count}`, { exact: true });
      await marker.first().waitFor({ state: 'attached' });
      assert.ok(await marker.count() >= 1);
    }
    async function openCorrection(page, reference = 'DEMO-001') {
      await page.getByRole('button', { name: /^Контрольный осмотр/ }).first().click();
      const loaded = page.waitForResponse(response => response.request().method() === 'GET' && response.url().includes(`/inspections/trips/${ids.trips[0]}`));
      await page.locator('.ko-attention-card').filter({ hasText: reference }).getByRole('button', { name: 'Исправить КО', exact: true }).click();
      assert.equal((await loaded).status(), 200);
      await page.waitForFunction(() => document.querySelector('.ko-driver .page-heading button')?.disabled === false);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await page.locator('.ko-form-item').first().waitFor();
    }
    async function sendCorrection(page) {
      const saved = page.waitForResponse(response => response.url().endsWith(`/inspections/trips/${ids.trips[0]}/submissions`) && response.request().method() === 'POST');
      await page.getByRole('button', { name: 'Отправить исправления', exact: true }).click();
      const response = await saved;
      assert.ok([200, 201].includes(response.status()), await response.text());
      await page.getByRole('heading', { name: 'КО передан механику', exact: true }).waitFor();
      return response.json();
    }
    async function selectReport(page, reference) {
      await page.locator('.ko-queue-item').filter({ hasText: reference }).click();
      await page.locator('.ko-review-panel .ko-photo-item').first().waitFor();
    }
    async function deletePhoto(page, item) {
      page.once('dialog', dialog => dialog.accept());
      const response = page.waitForResponse(response => /\/inspections\/photos\/[^/]+\/delete$/.test(response.url()) && response.request().method() === 'POST');
      await item.getByRole('button', { name: /^Удалить фото:/ }).click();
      const result = await response; assert.equal(result.status(), 201, await result.text());
      await page.locator('.ko-review-panel').getByText('Фото удалено', { exact: true }).first().waitFor();
    }

    const dp = await pageFor(driver, 'trips');
    await badge(dp, 2);
    await dp.getByRole('button', { name: /^Контрольный осмотр/ }).first().click();
    await dp.locator('.ko-attention-list').waitFor();
    assert.equal(await dp.locator('.ko-attention-card').count(), 2);
    await dp.locator('.ko-attention-card').filter({ hasText: 'REWORK-OLDER-TRIP' }).waitFor();
    await openCorrection(dp);
    const front = dp.locator('.ko-form-item').filter({ hasText: 'Кабина спереди' });
    const note = dp.locator('.ko-form-item').filter({ hasText: 'Замечания водителя' });
    const brakes = dp.locator('.ko-form-item').filter({ hasText: 'Тормоза' });
    assert.equal(await dp.locator('.ko-form-item').count(), 3, 'Returned report keeps its original checklist');
    for (const item of [front, note, brakes]) assert.equal(await item.getByRole('button', { name: 'В порядке', exact: true }).getAttribute('aria-pressed'), 'true');
    assert.equal(await front.locator('textarea').inputValue(), 'Фото сделано утром');
    assert.equal(await note.locator('textarea').inputValue(), 'Исходный ответ водителя');
    assert.equal(await brakes.locator('textarea').inputValue(), 'Тормоза проверены');
    assert.equal(await dp.getByLabel(/^Общий комментарий механику/).inputValue(), original.comment);
    assert.equal(await front.locator('.ko-draft-photo').count(), 2);
    await imageReady(front.locator('.ko-draft-photo').first());
    await badge(dp, 2);
    assert.equal((await api(driver, 'GET', '/inspections/attention')).count, 2, 'Opening correction does not dismiss the return');
    await note.locator('textarea').fill('Уточнённый ответ без повторных фото');
    await dp.getByLabel(/^Общий комментарий механику/).fill('Уточнённый общий комментарий');
    await dp.getByText('Сохранено на устройстве', { exact: true }).waitFor();
    await dp.reload();
    if (!await dp.locator('.ko-form-item').count()) await openCorrection(dp);
    await dp.locator('.ko-form-item').first().waitFor();
    assert.equal(await note.locator('textarea').inputValue(), 'Уточнённый ответ без повторных фото');
    assert.equal(await dp.getByLabel(/^Общий комментарий механику/).inputValue(), 'Уточнённый общий комментарий');
    await front.locator('.ko-draft-photo').nth(1).waitFor();
    assert.equal(await front.locator('.ko-draft-photo').count(), 2);
    await imageReady(front.locator('.ko-draft-photo').first());
    const second = await sendCorrection(dp);
    assert.equal(second.revision, 2); assert.equal(second.occurredAt, original.occurredAt);
    assert.deepEqual(second.answers.find(answer => answer.itemId === 'front_photo').photoIds.sort(), [photo1.id, photo2.id].sort());
    assert.equal(uploads.length, 0, 'Editing saved answers must not upload existing photos again');
    await badge(dp, 1);

    const mp = await pageFor(chief, 'inspections');
    await selectReport(mp, 'DEMO-001');
    await imageReady(mp.locator('.ko-review-panel .ko-photo-item').first());
    const recentCard = mp.locator('.ko-review-panel .ko-photo-item').first();
    assert.equal(await recentCard.getByRole('button', { name: /^Удалить фото:/ }).isDisabled(), true);
    const recent = (await api(chief, 'GET', `/inspections/submissions/${second.id}`)).photos[0];
    const futureDate = new Date(recent.deleteAvailableAt).toLocaleDateString('ru-RU');
    assert.ok((await recentCard.innerText()).includes(futureDate), 'Chief sees when the month expires');
    await mp.getByLabel(/^Комментарий к решению/).fill('Замените только одно фото, остальное подходит');
    await mp.getByRole('button', { name: 'Вернуть на доработку', exact: true }).click();
    await mp.locator('.ko-queue-item').filter({ hasText: 'DEMO-001' }).waitFor({ state: 'detached' });
    await dp.reload(); await badge(dp, 2); await openCorrection(dp);
    assert.equal(await note.locator('textarea').inputValue(), 'Уточнённый ответ без повторных фото');
    await front.locator('.ko-draft-photo').nth(1).getByRole('button', { name: /^Удалить фото/ }).click();
    assert.equal(await front.locator('.ko-draft-photo').count(), 1);
    await front.locator('input[type="file"]').first().setInputFiles({ name: 'replacement.png', mimeType: 'image/png', buffer: png });
    await imageReady(front.locator('.ko-draft-photo').nth(1));
    const submissionPattern = `**/api/v1/inspections/trips/${ids.trips[0]}/submissions`;
    let racedBody;
    await dp.route(submissionPattern, async route => {
      if (route.request().method() === 'POST' && !racedBody) {
        racedBody = route.request().postDataJSON();
        const retainedId = racedBody.answers.find(answer => answer.itemId === 'front_photo').photoIds.find(id => [photo1.id, photo2.id].includes(id));
        assert.ok(retainedId, 'The in-flight correction still contains one original photograph');
        await api(admin, 'POST', `/inspections/photos/${retainedId}/delete`, { idempotencyKey: randomUUID() });
      }
      await route.continue();
    });
    const rejectedAttempt = dp.waitForResponse(response => response.url().endsWith(`/inspections/trips/${ids.trips[0]}/submissions`) && response.request().method() === 'POST');
    await dp.getByRole('button', { name: 'Отправить исправления', exact: true }).click();
    assert.equal((await rejectedAttempt).status(), 400, 'A photo deleted after preflight must be rejected by the API');
    await dp.getByRole('alert').filter({ hasText: 'Фото были удалены или срок их хранения истёк' }).waitFor();
    await dp.unroute(submissionPattern);
    assert.equal(uploads.length, 1, 'Replacing one photograph uploads one new file, even when submission fails');
    assert.equal(await note.locator('textarea').inputValue(), 'Уточнённый ответ без повторных фото');
    assert.equal(await dp.getByLabel(/^Общий комментарий механику/).inputValue(), 'Уточнённый общий комментарий');
    assert.equal(await note.locator('textarea').isEditable(), true, 'A definitive rejection unlocks the saved draft');
    assert.equal(await front.locator('.ko-draft-photo').count(), 1, 'Only the deleted remote photo is removed');
    assert.equal((await api(driver, 'GET', '/inspections/attention')).count, 2);
    const firstNewPhoto = racedBody.answers.find(answer => answer.itemId === 'front_photo').photoIds.find(id => ![photo1.id, photo2.id].includes(id));
    assert.ok(firstNewPhoto);
    // The recovered editable state, including the successfully uploaded replacement,
    // survives a reload; the next send must not upload that replacement twice.
    await dp.reload(); await openCorrection(dp);
    await front.locator('.ko-draft-photo').first().waitFor();
    assert.equal(await note.locator('textarea').inputValue(), 'Уточнённый ответ без повторных фото');
    assert.equal(await front.locator('.ko-draft-photo').count(), 1);
    await front.locator('input[type="file"]').first().setInputFiles({ name: 'replacement-after-delete.png', mimeType: 'image/png', buffer: png });
    await imageReady(front.locator('.ko-draft-photo').nth(1));
    const third = await sendCorrection(dp);
    assert.equal(third.revision, 3); assert.equal(uploads.length, 2, 'Recovery uploads only the missing photo and reuses the previous successful upload');
    const oldIds = new Set([photo1.id, photo2.id]);
    const thirdIds = third.answers.find(answer => answer.itemId === 'front_photo').photoIds;
    assert.equal(thirdIds.filter(id => oldIds.has(id)).length, 0); assert.equal(thirdIds.length, 2);
    assert.ok(thirdIds.includes(firstNewPhoto));
    await badge(dp, 1);
    await mp.getByRole('button', { name: 'Обновить', exact: true }).click();
    await selectReport(mp, 'DEMO-001');
    await mp.getByRole('button', { name: 'Принять КО', exact: true }).click();
    await mp.locator('.ko-queue-item').filter({ hasText: 'DEMO-001' }).waitFor({ state: 'detached' });

    // A chief can remove aged bytes, and the inspection remains readable.
    await selectReport(mp, 'DELETE-AGED-PHOTO');
    const oldCard = mp.locator('.ko-review-panel .ko-photo-item').first();
    assert.equal(await oldCard.getByRole('button', { name: /^Удалить фото:/ }).isEnabled(), true);
    await deletePhoto(mp, oldCard);
    assert.equal((await api(chief, 'GET', `/inspections/submissions/${agedReport.id}`)).photos[0].deletedBy, ids.mechanic);

    // The admin can remove a recent photo without changing the accepted KO.
    const ap = await pageFor(admin, 'inspections');
    await ap.getByRole('button', { name: /^Контрольный осмотр/ }).first().click();
    await ap.getByRole('group', { name: 'Статус осмотра', exact: true }).getByRole('button', { name: 'КО принят', exact: true }).click();
    await selectReport(ap, 'DEMO-001');
    const adminCard = ap.locator('.ko-review-panel .ko-photo-item').first();
    assert.equal(await adminCard.getByRole('button', { name: /^Удалить фото:/ }).isEnabled(), true);
    await deletePhoto(ap, adminCard);
    const accepted = await api(admin, 'GET', `/inspections/submissions/${third.id}`);
    assert.equal(accepted.status, 'accepted'); assert.equal(accepted.photos.filter(photo => photo.deletedAt).length, 1);
    assert.equal((await api(driver, 'GET', '/inspections/attention')).count, 1);
    await fs.mkdir(output, { recursive: true });
    await ap.screenshot({ path: path.join(output, 'admin-deleted-photo-desktop.png'), fullPage: true });
    await dp.setViewportSize({ width: 390, height: 844 });
    await dp.goto(`${fixture.origin}/?section=inspections`); await badge(dp, 1);
    await dp.waitForFunction(() => {
      const navigation = document.querySelector('.mobile-navigation');
      const marker = navigation?.querySelector('[aria-label="Требуют доработки: 1"]');
      const current = navigation?.querySelector('button[aria-current="page"]');
      if (!navigation || !marker || !current) return false;
      const nav = navigation.getBoundingClientRect(), badge = marker.getBoundingClientRect(), button = current.getBoundingClientRect();
      const left = Math.max(0, nav.left), right = Math.min(innerWidth, nav.right);
      return badge.width > 0 && badge.left >= left && badge.right <= right && badge.top >= 0 && badge.bottom <= innerHeight && button.left >= left && button.right <= right;
    });
    assert.match(await dp.locator('.ko-start').innerText(), /Синтетическая проверка доработки · 3/, 'The returned report summary names its original template');
    assert.ok(await dp.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile correction page fits viewport');
    await dp.screenshot({ path: path.join(output, 'driver-return-badge-mobile.png'), fullPage: true });
    assert.deepEqual(errors, []); assert.deepEqual(unexpectedDownloads, []);
    console.log('PASS inspection rework browser: menu badge, cross-trip returns, original-template prefilling, durable edited draft, zero-upload correction, single-photo replacement, concurrent deletion recovery without duplicate uploads, review lifecycle, chief calendar-month deletion, immediate admin deletion and mobile layout');
  } catch (error) {
    console.error('Browser errors:', errors);
    if (browser) {
      await fs.mkdir(output, { recursive: true });
      for (const [index, page] of browser.contexts().flatMap(context => context.pages()).entries()) {
        await page.screenshot({ path: path.join(output, `failure-${index}.png`), fullPage: true }).catch(() => {});
        console.error(`Failure page ${index}: ${(await page.locator('body').innerText()).slice(-6500)}`);
      }
    }
    throw error;
  } finally {
    if (browser) await browser.close();
    await fixture.close();
  }
})().catch(error => { console.error(error.stack || error.message); process.exit(1); });
