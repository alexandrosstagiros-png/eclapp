'use strict';

// All data, sessions and PostgreSQL storage belong to the disposable local fixture.
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, createHash } = require('node:crypto');
const { createTestServer } = require('./local-test-server.cjs');

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jL1sAAAAASUVORK5CYII=', 'base64');
const photoItem = { id: 'front_photo', section: 'vehicle', kind: 'photo', label: 'Кабина спереди', instruction: 'Фото кабины', required: true, critical: false };
const textItem = { id: 'driver_note', section: 'other', kind: 'text', label: 'Замечания водителя', instruction: 'Пояснение', required: true, critical: false };

test('inspection rework preserves evidence, counts active returns and restricts physical photo deletion', { timeout: 180000 }, async t => {
  const f = await createTestServer();
  t.after(() => f.close());
  const { ids, adminPool: db, request, devLogin } = f;
  const scope = { legalEntityId: ids.legal, regionId: ids.region, projectId: ids.project, responsibilityScopeId: ids.scope };
  await db.query('UPDATE access_grants SET personal_data_visible=true WHERE user_id=ANY($1::uuid[])', [[ids.admin, ids.dispatcher]]);
  await db.query('UPDATE access_grants SET inspection_photo_delete=true WHERE user_id=$1', [ids.mechanic]);
  const driver = await devLogin(ids.drivers[0]), peer = await devLogin(ids.drivers[1]);
  const chief = await devLogin(ids.mechanic), admin = await devLogin(ids.admin), dispatcher = await devLogin(ids.dispatcher);
  const ok = (response, status = 200) => { assert.equal(response.status, status, JSON.stringify(response.body)); return response.body; };
  const call = (session, method, route, body) => request(method, route, body, session.accessToken);
  const state = async (tripId = ids.trips[0], session = driver) => ok(await call(session, 'GET', `/inspections/trips/${tripId}`));
  const attention = async (session = driver) => ok(await call(session, 'GET', '/inspections/attention'));
  const detail = async (id, session = driver) => ok(await call(session, 'GET', `/inspections/submissions/${id}`));
  const remove = (photoId, session = admin, key = randomUUID()) => call(session, 'POST', `/inspections/photos/${photoId}/delete`, { idempotencyKey: key });
  const review = async (submission, decision = 'returned', reason = 'Уточните комментарий; остальные фото подходят') =>
    ok(await call(chief, 'POST', `/inspections/submissions/${submission.id}/review`, { idempotencyKey: randomUUID(), decision, reason }), 201);
  const publish = async (expectedVersion, items) => ok(await call(chief, 'POST', '/inspections/templates', {
    idempotencyKey: randomUUID(), expectedVersion, title: `Синтетический КО v${expectedVersion + 1}`, scope, items,
  }), 201);
  const upload = (tripId, templateId, expectedRevision = 0, session = driver) => call(session, 'POST', `/inspections/trips/${tripId}/photos`, {
    idempotencyKey: randomUUID(), templateId, itemId: 'front_photo', mimeType: 'image/png', contentBase64: png.toString('base64'), expectedRevision,
  });
  const answers = photoIds => [
    { itemId: 'front_photo', result: 'ok', comment: 'Фотографии сохранены', photoIds },
    { itemId: 'driver_note', result: 'ok', comment: 'Исходный ответ\nВторая строка', photoIds: [] },
  ];
  const submissionBody = (template, expectedRevision, photoIds, overrides = {}) => ({
    idempotencyKey: randomUUID(), templateId: template.id, expectedRevision, occurredAt: new Date().toISOString(),
    answers: answers(photoIds), comment: 'Исходный общий комментарий', ...overrides,
  });
  const submit = (tripId, body, session = driver) => call(session, 'POST', `/inspections/trips/${tripId}/submissions`, body);
  async function employee(role, responsibilityScopeId = ids.scope) {
    const id = randomUUID();
    await db.query("INSERT INTO users(id,display_name,role,active,approved) VALUES($1,'Synthetic inspection employee',$2,true,true)", [id, role]);
    await db.query(`INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id,personal_data_visible,inspection_photo_delete)
      VALUES($1,$2,$3,$4,$5,true,false)`, [id, ids.legal, ids.region, ids.project, responsibilityScopeId]);
    return { id, ...(await devLogin(id)) };
  }
  async function trip(reference, driverId = ids.drivers[0], responsibilityScopeId = ids.scope) {
    const id = randomUUID();
    await db.query(`INSERT INTO trips(id,reference,business_date,project_id,region_id,legal_entity_id,responsibility_scope_id,vehicle_id,route_summary)
      SELECT $1,$2,business_date,project_id,region_id,legal_entity_id,$3,vehicle_id,'Synthetic inspection route' FROM trips WHERE id=$4`, [id, reference, responsibilityScopeId, ids.trips[0]]);
    await db.query('INSERT INTO trip_assignments(trip_id,user_id,active) VALUES($1,$2,true)', [id, driverId]);
    return id;
  }
  async function datedPhoto(tripId, templateId, age, driverId = ids.drivers[0]) {
    const id = randomUUID();
    // INSERT models historical data without disabling an immutable-evidence trigger.
    const result = await db.query(`INSERT INTO inspection_photos(id,trip_id,driver_id,template_id,item_id,mime_type,content,byte_size,sha256,uploaded_at)
      VALUES($1,$2,$3,$4,'front_photo','image/png',$5,$6,$7,clock_timestamp()-$8::interval)
      RETURNING id,uploaded_at AS "uploadedAt",uploaded_at+interval '1 month' AS "deleteAvailableAt"`,
    [id, tripId, driverId, templateId, png, png.length, createHash('sha256').update(png).digest('hex'), age]);
    return result.rows[0];
  }
  const ordinary = await employee('mechanic');
  const foreignScope = randomUUID();
  await db.query("INSERT INTO responsibility_scopes(id,project_id,name) VALUES($1,$2,'Synthetic foreign inspection scope')", [foreignScope, ids.project]);
  const foreignChief = await employee('mechanic', foreignScope), foreignAdmin = await employee('access_admin', foreignScope);
  await db.query('UPDATE access_grants SET inspection_photo_delete=true WHERE user_id=$1', [foreignChief.id]);
  const template = await publish(0, [photoItem, textItem]);
  let first, second, third, photo1, photo2, replacement, updatedTemplate;

  await t.test('only returned latest revisions require attention, and reading does not acknowledge them', async () => {
    assert.deepEqual(await attention(), { count: 0, items: [] });
    const originalUpload = { idempotencyKey: randomUUID(), templateId: template.id, itemId: 'front_photo', mimeType: 'image/png', contentBase64: png.toString('base64') };
    photo1 = ok(await call(driver, 'POST', `/inspections/trips/${ids.trips[0]}/photos`, originalUpload), 201);
    assert.equal(ok(await call(driver, 'POST', `/inspections/trips/${ids.trips[0]}/photos`, { ...originalUpload, expectedRevision: 0 }), 201).id, photo1.id,
      'An offline upload made before the revision field was introduced retains its retry identity');
    photo2 = ok(await upload(ids.trips[0], template.id), 201);
    first = ok(await submit(ids.trips[0], submissionBody(template, 0, [photo1.id, photo2.id])), 201);
    await review(first);
    const pending = await attention();
    assert.equal(pending.count, 1); assert.equal(pending.items.length, 1);
    assert.equal(pending.items[0].tripId, ids.trips[0]); assert.equal(pending.items[0].tripReference, 'DEMO-001');
    assert.equal(pending.items[0].submissionId, first.id); assert.equal(pending.items[0].revision, 1);
    assert.match(pending.items[0].reason, /Уточните комментарий/); assert.ok(Date.parse(pending.items[0].reviewedAt));
    await state(); await detail(first.id);
    assert.deepEqual(await attention(), pending, 'Opening the report must not hide an unresolved return');
    assert.deepEqual(await attention(peer), { count: 0, items: [] });
    ok(await call(dispatcher, 'GET', '/inspections/attention'), 403);
    ok(await call(admin, 'GET', '/inspections/attention'), 403);
    ok(await call(peer, 'GET', `/inspections/submissions/${first.id}`), 404);
  });

  await t.test('returned forms retain their original template and reuse existing photos without uploads', async () => {
    updatedTemplate = await publish(1, [{ ...photoItem, label: 'Новые требования к кабине' }, textItem]);
    assert.equal((await state()).template.id, updatedTemplate.id);
    replacement = ok(await upload(ids.trips[0], template.id, 1), 201);
    const newTrip = await trip('REWORK-OLD-TEMPLATE-DENIED');
    ok(await upload(newTrip, template.id), 409);
    const body = submissionBody(template, 1, [photo1.id, replacement.id], {
      occurredAt: first.occurredAt, comment: 'Уточнён общий комментарий',
      answers: answers([photo1.id, replacement.id]).map(answer => answer.itemId === 'driver_note' ? { ...answer, comment: 'Уточнён только этот ответ' } : answer),
    });
    second = ok(await submit(ids.trips[0], body), 201);
    assert.equal(second.revision, 2); assert.equal(second.template.id, template.id);
    assert.equal(second.occurredAt, first.occurredAt); assert.equal(second.comment, body.comment);
    assert.deepEqual(second.answers, body.answers.map(answer => ({ ...answer, photoIds: [...answer.photoIds].sort() })));
    assert.deepEqual((await detail(first.id)).answers, first.answers, 'The original answers remain immutable');
    assert.equal((await db.query('SELECT count(*)::int AS n FROM inspection_answer_photos WHERE photo_id=$1', [photo1.id])).rows[0].n, 2);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM inspection_photos WHERE trip_id=$1', [ids.trips[0]])).rows[0].n, 3);
    assert.deepEqual(await attention(), { count: 0, items: [] });
    assert.equal(ok(await submit(ids.trips[0], body), 201).id, second.id, 'A delivery retry is idempotent');
    ok(await submit(ids.trips[0], { ...body, idempotencyKey: randomUUID() }), 409);
    ok(await upload(ids.trips[0], template.id, 1), 409);
    await review(second);
    assert.equal((await attention()).items[0].submissionId, second.id);
  });

  await t.test('admin deletion clears photo bytes immediately but preserves reports, reviews and all historical references', async () => {
    const adminBefore = await detail(second.id, admin), chiefBefore = await detail(second.id, chief);
    assert.equal(adminBefore.photos.find(photo => photo.id === photo1.id).canDelete, true);
    assert.equal(chiefBefore.photos.find(photo => photo.id === photo1.id).canDelete, false);
    ok(await remove(photo1.id, driver), 403); ok(await remove(photo1.id, dispatcher), 403);
    ok(await remove(photo1.id, ordinary), 403); ok(await remove(photo1.id, chief), 403);
    ok(await remove(photo1.id, foreignChief), 404); ok(await remove(photo1.id, foreignAdmin), 404);
    const key = randomUUID();
    const deletion = ok(await remove(photo1.id, admin, key), 201);
    assert.equal(deletion.id, photo1.id); assert.equal(deletion.deletedBy, ids.admin); assert.equal(deletion.canDelete, false);
    assert.ok(Date.parse(deletion.deletedAt));
    assert.deepEqual(ok(await remove(photo1.id, admin, key), 201), deletion);
    assert.deepEqual(ok(await remove(photo1.id, admin), 201), deletion, 'A fresh retry also leaves the first deletion unchanged');
    const bytes = (await db.query('SELECT content,byte_size,sha256,deleted_at,deleted_by FROM inspection_photos WHERE id=$1', [photo1.id])).rows[0];
    assert.equal(bytes.content, null); assert.equal(bytes.byte_size, png.length); assert.equal(bytes.sha256, photo1.sha256);
    assert.equal(bytes.deleted_by, ids.admin);
    for (const submission of [first, second]) {
      const report = await detail(submission.id);
      assert.equal(report.status, 'returned'); assert.ok(report.review);
      assert.deepEqual(report.answers, submission.answers);
      const tombstone = report.photos.find(photo => photo.id === photo1.id);
      assert.equal(tombstone.deletedAt, deletion.deletedAt); assert.equal(tombstone.deletedBy, ids.admin); assert.equal(tombstone.canDelete, false);
    }
    for (const session of [driver, chief, admin]) {
      const response = await fetch(`${f.origin}/api/v1/inspections/photos/${photo1.id}/download`, { headers: { Authorization: `Bearer ${session.accessToken}` } });
      assert.equal(response.status, 404, 'Deleted bytes are no longer downloadable');
    }
    ok(await submit(ids.trips[0], submissionBody(template, 2, [photo1.id])), 400);
    assert.equal((await attention()).count, 1, 'A failed edit cannot clear the return');
    third = ok(await submit(ids.trips[0], submissionBody(template, 2, [replacement.id], { occurredAt: first.occurredAt })), 201);
    assert.equal(third.revision, 3); assert.deepEqual(await attention(), { count: 0, items: [] });
    await review(third, 'accepted', null);
    const queue = ok(await call(admin, 'GET', '/inspections/queue?status=accepted'));
    assert.ok(queue.items.some(item => item.id === third.id));
    await assert.rejects(db.query('DELETE FROM inspection_photos WHERE id=$1', [photo1.id]));
    await assert.rejects(db.query('UPDATE inspection_answers SET comment=comment WHERE submission_id=$1', [first.id]));
    await assert.rejects(db.query('UPDATE inspection_photos SET content=$2,deleted_at=NULL,deleted_by=NULL WHERE id=$1', [photo1.id, png]));
  });

  await t.test('only a chief mechanic can delete at the calendar month boundary, with exact scoped permissions', async () => {
    const tripId = await trip('DELETE-MONTH-BOUNDARY');
    const eligible = await datedPhoto(tripId, updatedTemplate.id, '1 month');
    const tooEarly = await datedPhoto(tripId, updatedTemplate.id, '1 month - 1 hour');
    const report = ok(await submit(tripId, submissionBody(updatedTemplate, 0, [eligible.id, tooEarly.id])), 201);
    const view = await detail(report.id, chief);
    assert.equal(view.photos.find(photo => photo.id === eligible.id).deleteAvailableAt, eligible.deleteAvailableAt.toISOString());
    assert.equal(view.photos.find(photo => photo.id === eligible.id).canDelete, true);
    assert.equal(view.photos.find(photo => photo.id === tooEarly.id).canDelete, false);
    ok(await remove(eligible.id, ordinary), 403); ok(await remove(tooEarly.id, chief), 403);
    ok(await remove(eligible.id, foreignChief), 404);
    const key = randomUUID();
    const removed = ok(await remove(eligible.id, chief, key), 201);
    assert.equal(removed.deletedBy, ids.mechanic); assert.deepEqual(ok(await remove(eligible.id, chief, key), 201), removed);
    assert.equal((await detail(report.id, chief)).photos.find(photo => photo.id === tooEarly.id).deletedAt, null);
    // Revoking only the chief permission must take effect for the already-issued session.
    await db.query('UPDATE access_grants SET inspection_photo_delete=false WHERE user_id=$1', [ids.mechanic]);
    ok(await remove(eligible.id, chief), 403);
    const revokedView = await detail(report.id, chief);
    assert.equal(revokedView.photos.find(photo => photo.id === tooEarly.id).canDelete, false);
    assert.equal(revokedView.photos.find(photo => photo.id === tooEarly.id).deleteAvailableAt, null);
    await db.query('UPDATE access_grants SET inspection_photo_delete=true WHERE user_id=$1', [ids.mechanic]);
    const deniedGrant = await employee('mechanic');
    await db.query('UPDATE access_grants SET inspection_photo_delete=true,personal_data_visible=false WHERE user_id=$1', [deniedGrant.id]);
    ok(await remove(tooEarly.id, deniedGrant), 403);
    const selected = await detail(report.id, admin);
    assert.equal(selected.photos.find(photo => photo.id === tooEarly.id).canDelete, true);
    await review(report, 'accepted', null);
  });

  await t.test('attention spans more than one queue page, ignores unassigned reports, and preserves historical inspection time', async () => {
    const records = [];
    for (let index = 0; index < 55; index++) {
      const tripId = await trip(`ATTENTION-${String(index).padStart(3, '0')}`);
      const photo = await datedPhoto(tripId, template.id, '35 days');
      const submissionId = randomUUID(), client = await db.connect();
      try {
        await client.query('BEGIN');
        await client.query(`INSERT INTO inspection_submissions(id,trip_id,driver_id,template_id,vehicle_id,business_date,legal_entity_id,region_id,project_id,responsibility_scope_id,revision,comment,occurred_at,submitted_at,has_critical_defects)
          SELECT $1,id,$2,$3,vehicle_id,business_date,legal_entity_id,region_id,project_id,responsibility_scope_id,1,'Исторический осмотр',clock_timestamp()-interval '35 days',clock_timestamp()-interval '35 days',false FROM trips WHERE id=$4`, [submissionId, ids.drivers[0], template.id, tripId]);
        for (const answer of answers([photo.id])) {
          await client.query('INSERT INTO inspection_answers(submission_id,template_id,item_id,result,comment) VALUES($1,$2,$3,$4,$5)', [submissionId, template.id, answer.itemId, answer.result, answer.comment]);
          for (const photoId of answer.photoIds) await client.query('INSERT INTO inspection_answer_photos(submission_id,item_id,photo_id,trip_id,driver_id,template_id) VALUES($1,$2,$3,$4,$5,$6)', [submissionId, answer.itemId, photoId, tripId, ids.drivers[0], template.id]);
        }
        await client.query("INSERT INTO inspection_reviews(id,submission_id,decision,reason,reviewed_by) VALUES($1,$2,'returned','Уточнение исторического отчёта',$3)", [randomUUID(), submissionId, ids.mechanic]);
        await client.query('COMMIT');
      } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
      records.push({ tripId, submissionId, photoId: photo.id });
    }
    const all = await attention();
    assert.equal(all.count, 55); assert.equal(all.items.length, 55);
    assert.equal(new Set(all.items.map(item => item.tripId)).size, 55);
    assert.ok(all.items.every(item => records.some(record => record.submissionId === item.submissionId)));
    await db.query('UPDATE trip_assignments SET active=false WHERE trip_id=$1', [records[1].tripId]);
    assert.equal((await attention()).count, 54);
    const historical = await detail(records[0].submissionId);
    const historicalBody = submissionBody(template, 1, [records[0].photoId], { occurredAt: historical.occurredAt });
    const reworked = ok(await submit(records[0].tripId, historicalBody), 201);
    assert.equal(reworked.occurredAt, historical.occurredAt);
    assert.ok(Date.now() - Date.parse(reworked.occurredAt) > 30 * 86400000);
    assert.equal(ok(await submit(records[0].tripId, historicalBody), 201).id, reworked.id);
    assert.equal((await attention()).count, 53, 'The latest pending revision supersedes its old returned version');
    assert.equal((await attention(peer)).count, 0);
    const grant = (await db.query('DELETE FROM access_grants WHERE user_id=$1 RETURNING *', [ids.drivers[0]])).rows[0];
    assert.deepEqual(await attention(), { count: 0, items: [] });
    await db.query('INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id) VALUES($1,$2,$3,$4,$5)', [grant.user_id, grant.legal_entity_id, grant.region_id, grant.project_id, grant.responsibility_scope_id]);
    assert.equal((await attention()).count, 53);
    await f.restartApi();
    assert.equal((await attention()).count, 53);
    assert.equal((await detail(first.id)).photos.find(photo => photo.id === photo1.id).deletedBy, ids.admin);
  });

  await t.test('history filters the selected driver before the 100-report limit and enforces ownership', async () => {
    const tripId = await trip('HISTORY-MANY-DRIVERS');
    await db.query('INSERT INTO trip_assignments(trip_id,user_id,active) VALUES($1,$2,true)', [tripId, ids.drivers[1]]);
    const ownPhoto = await datedPhoto(tripId, updatedTemplate.id, '6 days');
    const peerPhoto = await datedPhoto(tripId, updatedTemplate.id, '2 days', ids.drivers[1]);
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query(`INSERT INTO inspection_submissions(id,trip_id,driver_id,template_id,vehicle_id,business_date,legal_entity_id,region_id,project_id,responsibility_scope_id,revision,comment,occurred_at,submitted_at,has_critical_defects)
        SELECT gen_random_uuid(),t.id,$2,$3,t.vehicle_id,t.business_date,t.legal_entity_id,t.region_id,t.project_id,t.responsibility_scope_id,1,'Older driver report',clock_timestamp()-interval '6 days',clock_timestamp()-interval '6 days',false FROM trips t WHERE t.id=$1`, [tripId, ids.drivers[0], updatedTemplate.id]);
      await client.query(`INSERT INTO inspection_submissions(id,trip_id,driver_id,template_id,vehicle_id,business_date,legal_entity_id,region_id,project_id,responsibility_scope_id,revision,comment,occurred_at,submitted_at,has_critical_defects)
        SELECT gen_random_uuid(),t.id,$2,$3,t.vehicle_id,t.business_date,t.legal_entity_id,t.region_id,t.project_id,t.responsibility_scope_id,n,'Other driver revision',clock_timestamp()-interval '2 days'+n*interval '1 second',clock_timestamp()-interval '2 days'+n*interval '1 second',false
        FROM trips t CROSS JOIN generate_series(1,100) n WHERE t.id=$1`, [tripId, ids.drivers[1], updatedTemplate.id]);
      await client.query(`INSERT INTO inspection_answers(submission_id,template_id,item_id,result,comment)
        SELECT s.id,s.template_id,i.id,'ok','Синтетическая история' FROM inspection_submissions s JOIN inspection_template_items i ON i.template_id=s.template_id WHERE s.trip_id=$1`, [tripId]);
      await client.query(`INSERT INTO inspection_answer_photos(submission_id,item_id,photo_id,trip_id,driver_id,template_id)
        SELECT s.id,'front_photo',CASE WHEN s.driver_id=$2 THEN $3::uuid ELSE $4::uuid END,s.trip_id,s.driver_id,s.template_id FROM inspection_submissions s WHERE s.trip_id=$1`, [tripId, ids.drivers[0], ownPhoto.id, peerPhoto.id]);
      await client.query(`INSERT INTO inspection_reviews(id,submission_id,decision,reason,reviewed_by)
        SELECT gen_random_uuid(),s.id,'returned','Историческая доработка',$2 FROM inspection_submissions s WHERE s.trip_id=$1 AND s.revision<100`, [tripId, ids.mechanic]);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
    const unfiltered = await state(tripId, admin);
    assert.equal(unfiltered.submissions.length, 100);
    assert.ok(unfiltered.submissions.every(report => report.driver.id === ids.drivers[1]));
    const ownHistory = ok(await call(admin, 'GET', `/inspections/trips/${tripId}?driverId=${ids.drivers[0]}`));
    assert.equal(ownHistory.submissions.length, 1, 'The older selected-driver report cannot be hidden by another driver\'s newer versions');
    assert.equal(ownHistory.submissions[0].driver.id, ids.drivers[0]);
    const peerHistory = ok(await call(chief, 'GET', `/inspections/trips/${tripId}?driverId=${ids.drivers[1]}`));
    assert.equal(peerHistory.submissions.length, 100);
    assert.equal(new Set(peerHistory.submissions.map(report => report.revision)).size, 100);
    assert.equal(ok(await call(driver, 'GET', `/inspections/trips/${tripId}?driverId=${ids.drivers[0]}`)).submissions.length, 1);
    ok(await call(driver, 'GET', `/inspections/trips/${tripId}?driverId=${ids.drivers[1]}`), 403);
    ok(await call(admin, 'GET', `/inspections/trips/${tripId}?driverId=invalid`), 400);
    ok(await call(foreignAdmin, 'GET', `/inspections/trips/${tripId}?driverId=${ids.drivers[0]}`), 404);
  });
});
