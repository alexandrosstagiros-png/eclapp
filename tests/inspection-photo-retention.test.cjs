'use strict';

// The database, employees, images and worker runs in this suite are disposable.
// It never reads application .env files or connects to the local app database.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createRequire } = require('node:module');
const { randomUUID, createHash } = require('node:crypto');
const { createTestServer } = require('./local-test-server.cjs');
const appRequire = createRequire(path.resolve(__dirname, '../recovered/package.json'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const photoItem = { id: 'front_photo', section: 'vehicle', kind: 'photo', label: 'Кабина спереди', instruction: 'Фото кабины', required: true, critical: false };

async function eventually(read, predicate, message, timeout = 12000) {
  const deadline = Date.now() + timeout;
  let result;
  do {
    result = await read();
    if (predicate(result)) return result;
    await new Promise(resolve => setTimeout(resolve, 50));
  } while (Date.now() < deadline);
  assert.fail(`${message}: ${JSON.stringify(result)}`);
}

test('inspection photo compression and three-calendar-month retention preserve the reports', { timeout: 180000 }, async t => {
  const f = await createTestServer({ inspectionPhotoMaintenance: false });
  const { Pool } = appRequire('pg');
  const appPool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
  const database = { async transaction(action) {
    const client = await appPool.connect();
    try { await client.query('BEGIN'); const result = await action(client); await client.query('COMMIT'); return result; }
    catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  } };
  const { AuditService } = appRequire('./apps/api/src/modules/audit/application/audit.service.js');
  const { InspectionPhotoLifecycleWorker } = appRequire('./apps/api/src/modules/inspections/infra/inspection-photo-lifecycle.worker.js');
  const sharp = appRequire('sharp');
  const worker = new InspectionPhotoLifecycleWorker(database, new AuditService());
  t.after(async () => { await worker.onModuleDestroy?.(); await appPool.end(); await f.close(); });
  const { ids, adminPool: db, devLogin, request } = f;
  const scope = { legalEntityId: ids.legal, regionId: ids.region, projectId: ids.project, responsibilityScopeId: ids.scope };
  await db.query('UPDATE access_grants SET personal_data_visible=true WHERE user_id=$1', [ids.admin]);
  await db.query('UPDATE access_grants SET inspection_photo_delete=true WHERE user_id=$1', [ids.mechanic]);
  const driver = await devLogin(ids.drivers[0]), chief = await devLogin(ids.mechanic), admin = await devLogin(ids.admin);
  const ok = (response, status = 200) => { assert.equal(response.status, status, JSON.stringify(response.body)); return response.body; };
  const call = (session, method, route, body) => request(method, route, body, session.accessToken);
  const detail = async id => ok(await call(chief, 'GET', `/inspections/submissions/${id}`));
  const row = async id => (await db.query('SELECT * FROM inspection_photos WHERE id=$1', [id])).rows[0];
  const review = async (report, decision = 'accepted') => ok(await call(chief, 'POST', `/inspections/submissions/${report.id}/review`, {
    idempotencyKey: randomUUID(), decision, reason: decision === 'returned' ? 'Уточните замечание водителя' : null,
  }), 201);
  const template = ok(await call(chief, 'POST', '/inspections/templates', { idempotencyKey: randomUUID(), expectedVersion: 0, title: 'Синтетический КО: хранение фото', scope, items: [photoItem] }), 201);
  // A real, patterned high-resolution PNG makes decoded content, compression,
  // image dimensions and hashes verifiable instead of checking only a mock.
  const width = 1600, height = 900, raw = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const offset = (y * width + x) * 3;
    raw[offset] = (x * 7 + y) & 255;
    raw[offset + 1] = (x + y * 5) & 255;
    raw[offset + 2] = (x ^ y) & 255;
  }
  const png = await sharp(raw, { raw: { width, height, channels: 3 } }).png({ compressionLevel: 0 }).toBuffer();
  assert.ok(png.length > 4_000_000 && png.length <= 5_242_880);
  const tinyWithMetadata = await sharp({ create: { width: 1, height: 1, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png({ compressionLevel: 9 }).toBuffer();
  const tinyChunks = [tinyWithMetadata.subarray(0, 8)];
  for (let offset = 8; offset < tinyWithMetadata.length;) {
    const end = offset + tinyWithMetadata.readUInt32BE(offset) + 12;
    if (['IHDR', 'IDAT', 'IEND'].includes(tinyWithMetadata.toString('ascii', offset + 4, offset + 8))) tinyChunks.push(tinyWithMetadata.subarray(offset, end));
    offset = end;
  }
  const tiny = Buffer.concat(tinyChunks); // 70-byte valid transparent PNG: already smaller than its WebP candidate.
  async function trip(reference) {
    const id = randomUUID();
    await db.query(`INSERT INTO trips(id,reference,business_date,project_id,region_id,legal_entity_id,responsibility_scope_id,vehicle_id,route_summary)
      SELECT $1,$2,business_date,project_id,region_id,legal_entity_id,responsibility_scope_id,vehicle_id,'Synthetic retention route' FROM trips WHERE id=$3`, [id, reference, ids.trips[0]]);
    await db.query('INSERT INTO trip_assignments(trip_id,user_id,active) VALUES($1,$2,true)', [id, ids.drivers[0]]);
    return id;
  }
  async function photo(tripId, { bytes = png, age = '0 seconds', uploadedAt = null } = {}) {
    const id = randomUUID();
    await db.query(`INSERT INTO inspection_photos(id,trip_id,driver_id,template_id,item_id,mime_type,content,byte_size,sha256,uploaded_at)
      VALUES($1,$2,$3,$4,'front_photo','image/png',$5,$6,$7,coalesce($8::timestamptz,clock_timestamp()-$9::interval))`,
    [id, tripId, ids.drivers[0], template.id, bytes, bytes.length, sha(bytes), uploadedAt, age]);
    return { id, tripId, bytes };
  }
  async function submit(p, expectedRevision = 0, overrides = {}) {
    return ok(await call(driver, 'POST', `/inspections/trips/${p.tripId}/submissions`, {
      idempotencyKey: randomUUID(), templateId: template.id, expectedRevision, occurredAt: new Date().toISOString(),
      comment: 'Сохранить общий комментарий', answers: [{ itemId: photoItem.id, result: 'ok', comment: 'Сохранить ответ водителя', photoIds: [p.id] }], ...overrides,
    }), 201);
  }
  async function historicalReport(p, decision) {
    const id = randomUUID(), client = await db.connect();
    try {
      await client.query('BEGIN');
      // Model records that already existed before retention was introduced.
      // Only this disposable fixture bypasses the new-link expiry guard; the
      // assembly, immutability, timestamp and foreign-key guards remain active.
      await client.query('ALTER TABLE inspection_answer_photos DISABLE TRIGGER inspection_answer_photos_live');
      await client.query(`INSERT INTO inspection_submissions(id,trip_id,driver_id,template_id,vehicle_id,business_date,legal_entity_id,region_id,project_id,responsibility_scope_id,revision,comment,occurred_at,submitted_at,has_critical_defects)
        SELECT $1,t.id,$2,$3,t.vehicle_id,t.business_date,t.legal_entity_id,t.region_id,t.project_id,t.responsibility_scope_id,1,'Исторический комментарий',p.uploaded_at,p.uploaded_at,false
        FROM trips t JOIN inspection_photos p ON p.trip_id=t.id WHERE p.id=$4`, [id, ids.drivers[0], template.id, p.id]);
      await client.query("INSERT INTO inspection_answers(submission_id,template_id,item_id,result,comment) VALUES($1,$2,'front_photo','ok','Исторический ответ')", [id, template.id]);
      await client.query("INSERT INTO inspection_answer_photos(submission_id,item_id,photo_id,trip_id,driver_id,template_id) VALUES($1,'front_photo',$2,$3,$4,$5)", [id, p.id, p.tripId, ids.drivers[0], template.id]);
      if (decision) await client.query(`INSERT INTO inspection_reviews(id,submission_id,decision,reason,reviewed_by,reviewed_at)
        VALUES($1,$2,$3,$4,$5,clock_timestamp())`, [randomUUID(), id, decision, decision === 'returned' ? 'Исторический возврат' : null, ids.mechanic]);
      await client.query('ALTER TABLE inspection_answer_photos ENABLE TRIGGER inspection_answer_photos_live');
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
    return detail(id);
  }
  const download = async id => fetch(`${f.origin}/api/v1/inspections/photos/${id}/download`, { headers: { Authorization: `Bearer ${driver.accessToken}` } });
  let accepted, acceptedReport, previousReport, pending, returned, unlinked;

  await t.test('only accepted evidence is compressed, once, with valid downloadable image metadata', async () => {
    pending = await photo(await trip('RETENTION-PENDING'));
    await submit(pending);
    returned = await photo(await trip('RETENTION-RETURNED'));
    await review(await submit(returned), 'returned');
    unlinked = await photo(await trip('RETENTION-UNLINKED-RECENT'));
    accepted = await photo(await trip('RETENTION-ACCEPTED'));
    previousReport = await submit(accepted);
    await review(previousReport, 'returned');
    acceptedReport = await submit(accepted, 1, { occurredAt: previousReport.occurredAt });
    const before = await worker.runOnce();
    assert.equal(before.compressed, 0, 'Pending and returned inspections keep full uploaded images');
    assert.deepEqual((await row(accepted.id)).content, png);
    await review(acceptedReport);
    const summary = await worker.runOnce();
    assert.equal(summary.compressed, 1);
    const compressed = await row(accepted.id);
    assert.equal(compressed.compression_status, 'complete');
    assert.ok(compressed.compressed_at); assert.ok(compressed.compression_checked_at);
    assert.equal(compressed.byte_size, png.length); assert.equal(compressed.sha256, sha(png)); assert.equal(compressed.mime_type, 'image/png');
    assert.ok(compressed.stored_byte_size < png.length / 2, 'Accepted image should be substantially smaller');
    assert.equal(compressed.content.length, compressed.stored_byte_size);
    assert.equal(sha(compressed.content), compressed.stored_sha256);
    const decoded = await sharp(compressed.content).metadata();
    assert.equal(compressed.stored_mime_type, `image/${decoded.format}`);
    assert.ok(decoded.width <= width && decoded.height <= height);
    assert.equal(decoded.exif, undefined);
    const response = await download(accepted.id);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), compressed.stored_mime_type);
    assert.equal(Number(response.headers.get('content-length')), compressed.content.length);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), compressed.content);
    for (const original of [previousReport, acceptedReport]) {
      const current = await detail(original.id), meta = current.photos.find(p => p.id === accepted.id);
      assert.deepEqual(current.answers, original.answers); assert.equal(current.comment, original.comment);
      assert.equal(meta.originalByteSize, png.length); assert.equal(meta.byteSize, compressed.content.length);
      assert.equal(meta.sha256, compressed.stored_sha256); assert.equal(meta.mimeType, compressed.stored_mime_type);
      assert.ok(meta.compressedAt); assert.ok(meta.autoDeleteAt);
    }
    for (const p of [pending, returned, unlinked]) {
      const current = await row(p.id);
      assert.deepEqual(current.content, png); assert.equal(current.compressed_at, null);
    }
    const after = await worker.runOnce();
    assert.equal(after.compressed, 0); assert.deepEqual(await row(accepted.id), compressed, 'Maintenance must not recompress already processed content');
  });

  await t.test('a smaller original is retained and malformed legacy images do not block other accepted photos', async () => {
    const small = await photo(await trip('RETENTION-ALREADY-SMALL'), { bytes: tiny });
    await review(await submit(small));
    const invalidBytes = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.from('synthetic-invalid-image')]);
    const broken = await photo(await trip('RETENTION-INVALID'), { bytes: invalidBytes });
    await review(await submit(broken));
    const another = await photo(await trip('RETENTION-VALID-AFTER-INVALID'));
    await review(await submit(another));
    const summary = await worker.runOnce();
    assert.equal(summary.compressed, 1); assert.equal(summary.unchanged, 1); assert.equal(summary.failed, 1);
    const smallRow = await row(small.id);
    assert.equal(smallRow.compression_status, 'complete'); assert.deepEqual(smallRow.content, tiny);
    assert.equal(smallRow.stored_byte_size, tiny.length); assert.equal(smallRow.stored_sha256, sha(tiny));
    const invalid = await row(broken.id);
    assert.deepEqual(invalid.content, invalidBytes); assert.equal(invalid.compression_status, 'failed');
    assert.ok(invalid.compression_attempts > 0); assert.equal(invalid.compression_next_attempt_at, null);
    assert.ok((await row(another.id)).compressed_at);
    assert.equal((await worker.runOnce()).failed, 0, 'Permanently invalid images must not be retried on every pass');
  });

  await t.test('expiry uses calendar months from upload, blocks download and reuse before the next sweep, and retains records', async () => {
    const moscowCalendar = (await db.query("SELECT inspection_photo_expiry('2024-05-30T22:00:00Z'::timestamptz) AS deadline")).rows[0].deadline;
    assert.equal(moscowCalendar.toISOString(), '2024-08-30T22:00:00.000Z', 'Calendar arithmetic follows the app Moscow timezone across midnight');
    const janEnd = await photo(await trip('RETENTION-CALENDAR-END'), { uploadedAt: '2024-01-31T12:34:56.789Z', bytes: tiny });
    const janReport = await historicalReport(janEnd, 'accepted');
    assert.equal(janReport.photos[0].autoDeleteAt, '2024-04-30T12:34:56.789Z');
    const octEnd = await photo(await trip('RETENTION-CALENDAR-YEAR'), { uploadedAt: '2023-10-31T12:34:56.789Z', bytes: tiny });
    const octReport = await historicalReport(octEnd, 'returned');
    assert.equal(octReport.photos[0].autoDeleteAt, '2024-01-31T12:34:56.789Z');
    const expiredAccepted = await photo(await trip('RETENTION-OLD-ACCEPTED'), { age: '3 months 1 hour', bytes: tiny });
    const acceptedLate = await historicalReport(expiredAccepted, 'accepted');
    assert.ok(Date.now() - Date.parse(acceptedLate.review.reviewedAt) < 60000, 'Acceptance is recent although upload is expired');
    const expiredPending = await photo(await trip('RETENTION-OLD-PENDING'), { age: '3 months 1 hour', bytes: tiny });
    const pendingOld = await historicalReport(expiredPending, null);
    const expiredReturned = await photo(await trip('RETENTION-OLD-RETURNED'), { age: '3 months 1 hour', bytes: tiny });
    const returnedOld = await historicalReport(expiredReturned, 'returned');
    const expiredUnlinked = await photo(await trip('RETENTION-OLD-UNLINKED'), { age: '3 months 1 hour', bytes: tiny });
    const notDue = await photo(await trip('RETENTION-NOT-DUE'), { age: '3 months - 1 hour', bytes: tiny });
    const deadline = (await db.query("SELECT clock_timestamp()>=uploaded_at+interval '3 months' AS due FROM inspection_photos WHERE id=$1", [notDue.id])).rows[0].due;
    assert.equal(deadline, false);
    for (const p of [janEnd, octEnd, expiredAccepted, expiredPending, expiredReturned, expiredUnlinked]) {
      assert.ok((await row(p.id)).content, 'The expiry guard is independent of the next maintenance pass');
      assert.equal((await download(p.id)).status, 404);
    }
    ok(await call(driver, 'POST', `/inspections/trips/${expiredReturned.tripId}/submissions`, {
      idempotencyKey: randomUUID(), templateId: template.id, expectedRevision: 1, occurredAt: returnedOld.occurredAt,
      comment: 'Попытка использовать просроченное фото', answers: [{ itemId: photoItem.id, result: 'ok', comment: '', photoIds: [expiredReturned.id] }],
    }), 400);
    const unavailable = ok(await call(driver, 'POST', `/inspections/trips/${expiredUnlinked.tripId}/submissions`, {
      idempotencyKey: randomUUID(), templateId: template.id, expectedRevision: 0, occurredAt: new Date().toISOString(),
      comment: 'Локальный черновик содержит ранее загруженное фото', answers: [{ itemId: photoItem.id, result: 'ok', comment: '', photoIds: [expiredUnlinked.id] }],
    }), 400);
    assert.equal(unavailable.code, 'INSPECTION_PHOTOS_UNAVAILABLE');
    assert.deepEqual(unavailable.unavailablePhotoIds, [expiredUnlinked.id]);
    const summary = await worker.runOnce();
    assert.equal(summary.deleted, 6); assert.equal(summary.compressed, 0);
    for (const p of [janEnd, octEnd, expiredAccepted, expiredPending, expiredReturned, expiredUnlinked]) {
      const deleted = await row(p.id);
      assert.equal(deleted.content, null); assert.ok(deleted.deleted_at); assert.equal(deleted.deleted_by, null);
      assert.equal(deleted.deletion_reason, 'retention'); assert.equal(deleted.sha256, sha(p.bytes));
    }
    for (const original of [janReport, octReport, acceptedLate, pendingOld, returnedOld]) {
      const retained = await detail(original.id);
      assert.equal(retained.status, original.status); assert.deepEqual(retained.answers, original.answers);
      assert.deepEqual(retained.review, original.review); assert.equal(retained.comment, original.comment);
      assert.equal(retained.photos[0].deletionReason, 'retention'); assert.ok(retained.photos[0].deletedAt);
      assert.equal(retained.photos[0].canDelete, false);
    }
    assert.deepEqual((await row(notDue.id)).content, tiny);
    assert.equal((await download(notDue.id)).status, 200);
    assert.equal((await worker.runOnce()).deleted, 0);
  });

  await t.test('concurrent worker passes process each photo once and cannot resurrect manually deleted images', async () => {
    const compressedPhoto = await photo(await trip('RETENTION-CONCURRENT-COMPRESS'));
    await review(await submit(compressedPhoto));
    const expired = await photo(await trip('RETENTION-CONCURRENT-EXPIRE'), { age: '4 months', bytes: tiny });
    const manually = await photo(await trip('RETENTION-MANUAL'));
    await review(await submit(manually));
    const manual = ok(await call(admin, 'POST', `/inspections/photos/${manually.id}/delete`, { idempotencyKey: randomUUID() }), 201);
    assert.equal(manual.deletedBy, ids.admin);
    const secondWorker = new InspectionPhotoLifecycleWorker(database, new AuditService());
    const summaries = await Promise.all([worker.runOnce(), secondWorker.runOnce()]);
    assert.equal(summaries.reduce((n, result) => n + result.deleted, 0), 1);
    assert.equal(summaries.reduce((n, result) => n + result.compressed, 0), 1);
    const manualAfter = await row(manually.id);
    assert.equal(manualAfter.content, null); assert.equal(manualAfter.deletion_reason, 'manual'); assert.equal(manualAfter.compressed_at, null);
    assert.equal(manualAfter.deleted_by, ids.admin); assert.equal(manualAfter.deleted_at.toISOString(), manual.deletedAt);
    const actions = (await db.query("SELECT payload->>'entityId' AS id,payload->>'action' AS action FROM audit_events WHERE payload->>'entityId'=ANY($1::text[])", [[compressedPhoto.id, expired.id]])).rows;
    assert.equal(actions.filter(entry => entry.id === compressedPhoto.id && /compress/.test(entry.action)).length, 1);
    assert.equal(actions.filter(entry => entry.id === expired.id && /delet|expir|retention/.test(entry.action)).length, 1);
    await assert.rejects(appPool.query('UPDATE inspection_photos SET content=$2,deleted_at=NULL,deleted_by=NULL,deletion_reason=NULL WHERE id=$1', [manually.id, png]));
    await assert.rejects(db.query('DELETE FROM inspection_photos WHERE id=$1', [expired.id]));
  });

  await t.test('MAX photo references use current compressed bytes and reject removed or expired evidence', async () => {
    const session = await devLogin(ids.drivers[0]);
    // Create a web-channel session in this synthetic fixture; MAX download links
    // are also used by the ordinary web photo preview component.
    await db.query("UPDATE sessions SET channel='web' WHERE token_hash=$1", [sha(Buffer.from(session.accessToken))]);
    const prepare = (p, actor = session) => call(actor, 'POST', '/max/downloads', {
      filename: 'original-photo.png', contentType: 'image/png', contentBase64: tiny.toString('base64'), inspectionPhotoId: p.id,
    });
    const p = await photo(await trip('RETENTION-MAX-COMPRESS'));
    const report = await submit(p);
    const staged = ok(await prepare(p), 201);
    await review(report);
    assert.equal((await worker.runOnce()).compressed, 1);
    const current = await row(p.id);
    const head = await fetch(staged.url, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(head.headers.get('content-type'), current.stored_mime_type);
    assert.equal(Number(head.headers.get('content-length')), current.content.length);
    assert.match(head.headers.get('content-disposition'), /webp/);
    const read = await fetch(staged.url);
    assert.equal(read.status, 200); assert.deepEqual(Buffer.from(await read.arrayBuffer()), current.content);
    const stagedBeforeDelete = ok(await prepare(p), 201);
    ok(await call(admin, 'POST', `/inspections/photos/${p.id}/delete`, { idempotencyKey: randomUUID() }), 201);
    assert.equal((await fetch(stagedBeforeDelete.url, { method: 'HEAD' })).status, 404);
    assert.equal((await fetch(stagedBeforeDelete.url)).status, 404);
    ok(await prepare(p), 404);
    const expired = await photo(await trip('RETENTION-MAX-EXPIRED'), { age: '4 months', bytes: tiny });
    ok(await prepare(expired), 404);
    const peer = await devLogin(ids.drivers[1]);
    await db.query("UPDATE sessions SET channel='web' WHERE token_hash=$1", [sha(Buffer.from(peer.accessToken))]);
    ok(await prepare(accepted, peer), 404, 'A caller cannot turn another driver’s photo into a download link');
  });

  await t.test('database guards reject premature retention, unaccepted compression and changes to upload evidence', async () => {
    await assert.rejects(appPool.query(`UPDATE inspection_photos SET content=NULL,deleted_at=clock_timestamp(),deleted_by=NULL,deletion_reason='retention' WHERE id=$1`, [pending.id]), /one-way removal/);
    await assert.rejects(appPool.query(`UPDATE inspection_photos SET content=$2,stored_mime_type='image/webp',stored_byte_size=$3,stored_sha256=$4,
      compressed_at=clock_timestamp(),compression_status='complete',compression_attempts=1,compression_checked_at=clock_timestamp() WHERE id=$1`,
    [pending.id, tiny, tiny.length, sha(tiny)]), /Only accepted live/);
    await assert.rejects(db.query("UPDATE inspection_photos SET uploaded_at=uploaded_at-interval '4 months' WHERE id=$1", [pending.id]), /upload evidence.*immutable/);
    await assert.rejects(db.query("UPDATE inspection_photos SET sha256=repeat('0',64) WHERE id=$1", [accepted.id]), /upload evidence.*immutable/);
    assert.deepEqual((await row(pending.id)).content, png);
    assert.equal((await row(pending.id)).compression_attempts, 0);
  });

  await t.test('transient compression failures persist retry backoff and preserve downloadable originals', async () => {
    const retry = await photo(await trip('RETENTION-TEMPORARY-COMPRESSION-FAILURE'));
    await review(await submit(retry));
    let attempts = 0;
    const unavailableCompressor = async () => {
      attempts++;
      const error = new Error('Synthetic image encoder timeout');
      error.code = 'INSPECTION_PHOTO_COMPRESSION_TIMEOUT'; error.retryable = true;
      throw error;
    };
    const retryWorker = new InspectionPhotoLifecycleWorker(database, new AuditService(), unavailableCompressor);
    const firstAttempt = await retryWorker.runOnce();
    assert.equal(firstAttempt.failed, 1); assert.equal(attempts, 1);
    const stored = await row(retry.id);
    assert.equal(stored.compression_status, 'pending'); assert.equal(stored.compression_attempts, 1);
    assert.equal(stored.compression_error, 'INSPECTION_PHOTO_COMPRESSION_TIMEOUT');
    assert.ok(stored.compression_next_attempt_at.getTime() > Date.now() + 4 * 60000);
    assert.deepEqual(stored.content, png); assert.equal(stored.compressed_at, null);
    assert.equal((await retryWorker.runOnce()).failed, 0); assert.equal(attempts, 1);
    assert.equal((await worker.runOnce()).compressed, 0, 'Retry deadline also applies to other worker instances');
    const available = await download(retry.id);
    assert.equal(available.status, 200); assert.deepEqual(Buffer.from(await available.arrayBuffer()), png);
  });

  await t.test('startup automatically catches up accepted and expired photos without user interaction', async () => {
    const backlog = await photo(await trip('RETENTION-STARTUP-COMPRESS'));
    await review(await submit(backlog));
    const expired = await photo(await trip('RETENTION-STARTUP-DELETE'), { age: '4 months', bytes: tiny });
    process.env.INSPECTION_PHOTO_MAINTENANCE_ENABLED = 'true';
    await f.restartApi();
    await eventually(() => row(backlog.id), result => !!result.compressed_at, 'Startup did not compress accepted backlog');
    await eventually(() => row(expired.id), result => result.content === null, 'Startup did not delete expired backlog');
    const report = await detail(acceptedReport.id);
    assert.equal(report.status, 'accepted'); assert.deepEqual(report.answers, acceptedReport.answers);
    assert.deepEqual((await row(pending.id)).content, png); assert.deepEqual((await row(returned.id)).content, png);
  });
});
