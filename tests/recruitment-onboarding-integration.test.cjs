'use strict';

// Real HTTP, PostgreSQL and disposable disk storage. All identities and images
// are synthetic. The OCR provider is deliberately left unconfigured.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createTestServer } = require('./local-test-server.cjs');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC', 'base64');
const JPEG = Buffer.from('/9j/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9sAQwACAgICAgIDAgIDBQMDAwUGBQUFBQYIBgYGBgYICggICAgICAoKCgoKCgoKDAwMDAwMDg4ODg4PDw8PDw8PDw8P/9sAQwECAgIEBAQHBAQHEAsJCxAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQ/90ABAAB/9oADAMBAAIRAxEAPwD4vooor+Uz/fw//9k=', 'base64');
const PRIVATE_VALUE = 'SYNTHETIC-PASSPORT-4271-123456';
const STAFF = '/recruitment/onboarding';
const PUBLIC = '/recruitment-onboarding';

test('onboarding keeps private forms, one-use candidate links and 72-hour originals isolated', { timeout: 240000 }, async t => {
  const fixture = await createTestServer();
  t.after(() => fixture.close());
  const { ids, request, devLogin, adminPool: db } = fixture;
  const photoDirectory = process.env.ONBOARDING_PHOTO_DIR;
  assert.ok(photoDirectory && path.resolve(photoDirectory).startsWith(path.resolve(fixture.directory) + path.sep), 'Photo storage must be isolated inside the disposable fixture');
  const ownScope = [ids.legal, ids.region, ids.project, ids.scope];
  const foreignLegal = randomUUID(), foreignProject = randomUUID(), foreignScope = randomUUID();
  await db.query('INSERT INTO legal_entities VALUES($1,$2)', [foreignLegal, 'Synthetic foreign company']);
  await db.query('INSERT INTO projects VALUES($1,$2,$3,$4)', [foreignProject, 'Synthetic foreign project', foreignLegal, ids.region]);
  await db.query('INSERT INTO responsibility_scopes VALUES($1,$2,$3)', [foreignScope, foreignProject, 'Synthetic foreign scope']);
  async function actor(role, scope = ownScope, pd = true) {
    const id = randomUUID();
    await db.query('INSERT INTO users(id,display_name,role,active,approved) VALUES($1,$2,$3,true,true)', [id, `Synthetic ${role} ${id}`, role]);
    await db.query('INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id,personal_data_visible) VALUES($1,$2,$3,$4,$5,$6)', [id, ...scope, pd]);
    return { id, ...(await devLogin(id)) };
  }
  const manager = await actor('manager');
  const recruiter = await actor('recruiter');
  const peer = await actor('recruiter');
  const admin = await actor('access_admin');
  const noPD = await actor('recruiter', ownScope, false);
  const external = await actor('external_recruiter');
  const foreign = await actor('manager', [foreignLegal, ids.region, foreignProject, foreignScope]);
  const dispatcher = await devLogin(ids.dispatcher);
  const ok = result => {
    assert.ok([200, 201].includes(result.status), `HTTP ${result.status}: ${JSON.stringify(result.body)}`);
    return result.body;
  };
  const rejected = (result, statuses, message) => {
    assert.ok(statuses.includes(result.status), `${message || 'Request rejected'}: HTTP ${result.status} ${JSON.stringify(result.body)}`);
  };
  const auth = (method, route, body, who = recruiter) => request(method, STAFF + route, body, who.accessToken);
  const pub = (route, body) => request('POST', PUBLIC + route, body);
  const templateBody = (patch = {}) => ({
    id: randomUUID(), version: 0, responsibilityScopeId: ids.scope,
    name: 'Synthetic office onboarding', destination: 'Оптиком', employmentType: 'ip',
    description: 'Оформление в офисе', privacyNotice: 'Тестовая информация об обработке данных.', active: true,
    fields: [
      { id: 'full_name', label: 'ФИО', type: 'text', required: true, ocrKey: 'name' },
      { id: 'passport_number', label: 'Номер паспорта', type: 'text', required: false, ocrKey: 'number' },
      { id: 'shift', label: 'Смена', type: 'select', required: false, options: ['Утро', 'Вечер'] },
    ],
    documents: [
      { id: 'passport_main', label: 'Паспорт: основной разворот', type: 'passport', required: true },
      { id: 'license_front', label: 'ВУ: лицевая сторона', type: 'driver_license_front', required: false },
    ], ...patch,
  });
  const template = ok(await auth('PUT', '/templates', templateBody(), manager));
  const newSession = async (who = recruiter, form = template, patch = {}) => ok(await auth('POST', '/sessions', { templateId: form.id, ...patch }, who));
  const current = async (session, who = recruiter) => ok(await auth('GET', `/sessions/${session.id}`, undefined, who));
  const photoBody = (patch = {}) => ({ documentId: 'passport_main', mimeType: 'image/png', base64: PNG.toString('base64'), ...patch });
  const upload = async (session, who = recruiter, patch = {}) => ok(await auth('POST', `/sessions/${session.id}/photos`, photoBody(patch), who));
  const review = async (photo, who = recruiter) => ok(await auth('POST', `/photos/${photo.id}/review`, {}, who));
  const link = async (session, who = recruiter) => ok(await auth('POST', `/sessions/${session.id}/link`, {}, who));
  const binary = async (photo, who) => fetch(`${fixture.origin}/api/v1${STAFF}/photos/${photo.id}/content`, { headers: who ? { Authorization: `Bearer ${who.accessToken}` } : {} });
  async function diskFiles(directory = photoDirectory) {
    const entries = await fs.readdir(directory, { withFileTypes: true }).catch(error => error.code === 'ENOENT' ? [] : Promise.reject(error));
    const nested = await Promise.all(entries.map(entry => entry.isDirectory() ? diskFiles(path.join(directory, entry.name)) : [path.join(directory, entry.name)]));
    return nested.flat();
  }

  await t.test('role, personal-data and company boundaries protect every private route', async () => {
    rejected(await request('GET', `${STAFF}/context`), [401]);
    for (const who of [noPD, external, dispatcher]) rejected(await auth('GET', '/context', undefined, who), [403]);
    for (const who of [recruiter, peer, noPD, external]) rejected(await auth('PUT', '/templates', templateBody(), who), [403]);
    rejected(await auth('PUT', '/templates', templateBody({ responsibilityScopeId: foreignScope }), manager), [403, 404]);
    assert.equal(ok(await auth('GET', '/context', undefined, manager)).canManageTemplates, true);
    assert.equal(ok(await auth('GET', '/context', undefined, admin)).canManageTemplates, true);
    const ownContext = ok(await auth('GET', '/context'));
    assert.equal(ownContext.canManageTemplates, false);
    assert.equal(ownContext.retentionHours, 72);
    assert.equal(ownContext.ocr.provider, 'vk');
    assert.equal(ownContext.ocr.configured, false);
    const session = await newSession();
    const photo = await upload(session);
    for (const who of [peer, foreign, noPD, external]) {
      rejected(await auth('GET', `/sessions/${session.id}`, undefined, who), [403, 404]);
      rejected(await auth('PUT', `/sessions/${session.id}`, { version: session.version, values: { full_name: 'Denied' } }, who), [403, 404]);
      rejected(await auth('POST', `/sessions/${session.id}/link`, {}, who), [403, 404]);
      rejected(await auth('POST', `/sessions/${session.id}/photos`, photoBody(), who), [403, 404]);
      rejected(await auth('POST', `/photos/${photo.id}/review`, {}, who), [403, 404]);
      rejected(await auth('POST', `/photos/${photo.id}/recognize`, {}, who), [403, 404]);
      assert.ok([403, 404].includes((await binary(photo, who)).status));
    }
    assert.equal((await binary(photo)).status, 401);
    for (const who of [manager, admin]) assert.equal((await current(session, who)).id, session.id);
    assert.ok(!ok(await auth('GET', '/context', undefined, peer)).sessions.some(row => row.id === session.id));
    assert.ok(!ok(await auth('GET', '/context', undefined, foreign)).templates.some(row => row.id === template.id));
    assert.ok(ok(await auth('GET', '/context', undefined, manager)).sessions.some(row => row.id === session.id));
    rejected(await auth('POST', '/sessions', { templateId: template.id }, foreign), [403, 404]);
  });

  await t.test('template snapshots and optimistic versions prevent silent schema or field replacement', async () => {
    let form = ok(await auth('PUT', '/templates', templateBody(), manager));
    let session = await newSession(recruiter, form);
    const oldSnapshot = structuredClone(session.templateSnapshot);
    const staleForm = structuredClone(form);
    form = ok(await auth('PUT', '/templates', { ...form, name: 'Changed template', fields: [...form.fields, { id: 'new_field', label: 'Новое поле', type: 'text', required: true }] }, manager));
    assert.equal(form.version, staleForm.version + 1);
    rejected(await auth('PUT', '/templates', { ...staleForm, name: 'Stale template' }, manager), [409]);
    assert.deepEqual((await current(session)).templateSnapshot, oldSnapshot);
    const later = await newSession(recruiter, form);
    assert.equal(later.templateSnapshot.name, 'Changed template');
    assert.ok(later.templateSnapshot.fields.some(field => field.id === 'new_field'));
    const version = session.version;
    session = ok(await auth('PUT', `/sessions/${session.id}`, { version, values: { full_name: 'Synthetic Candidate', passport_number: PRIVATE_VALUE } }));
    assert.equal(session.version, version + 1);
    rejected(await auth('PUT', `/sessions/${session.id}`, { version, values: { full_name: 'Stale Candidate' } }), [409]);
    assert.equal((await current(session)).values.passport_number, PRIVATE_VALUE);
    rejected(await auth('PUT', `/sessions/${session.id}`, { version: session.version, values: { full_name: 'Candidate', unknown_secret: 'Unexpected' } }), [400, 422]);
  });

  await t.test('public preview returns only the immutable form and rotating links expire or revoke', async () => {
    let session = await newSession();
    session = ok(await auth('PUT', `/sessions/${session.id}`, { version: session.version, values: { full_name: 'PRIVATE-CANDIDATE-NAME', passport_number: PRIVATE_VALUE } }));
    const photo = await upload(session);
    const first = await link(session);
    const tokenRow = (await db.query('SELECT row_to_json(s) AS row FROM recruitment_onboarding_sessions s WHERE id=$1', [session.id])).rows[0].row;
    assert.match(tokenRow.token_hash, /^[a-f0-9]{64}$/);
    assert.ok(!JSON.stringify(tokenRow).includes(first.token), 'The database keeps only a digest of the candidate link token');
    assert.ok(!JSON.stringify(await current(session)).includes(first.token), 'Existing candidate tokens cannot be retrieved through session metadata');
    const preview = ok(await pub('/preview', { token: first.token }));
    assert.ok(preview.template);
    assert.equal(preview.retentionHours, 72);
    assert.ok(new Date(first.expiresAt) > new Date(Date.now() + 6 * 24 * 3600000));
    for (const secret of [PRIVATE_VALUE, 'PRIVATE-CANDIDATE-NAME', photo.id, PNG.toString('base64')]) assert.ok(!JSON.stringify(preview).includes(secret));
    for (const key of ['values', 'photos', 'candidateName', 'candidateId', 'session']) assert.ok(!Object.hasOwn(preview, key));
    const tampered = (first.token[0] === 'a' ? 'b' : 'a') + first.token.slice(1);
    rejected(await pub('/preview', { token: tampered }), [400, 403, 404, 410]);
    const second = await link(session);
    assert.notEqual(second.token, first.token);
    rejected(await pub('/preview', { token: first.token }), [403, 404, 410]);
    ok(await pub('/preview', { token: second.token }));
    ok(await auth('POST', `/sessions/${session.id}/revoke-link`, {}));
    rejected(await pub('/preview', { token: second.token }), [403, 404, 410]);
    const expiring = await link(session);
    await db.query("UPDATE recruitment_onboarding_sessions SET link_expires_at=clock_timestamp()-interval '1 second' WHERE id=$1", [session.id]);
    for (const [route, body] of [['/preview', { token: expiring.token }], ['/upload', { token: expiring.token, ...photoBody() }], ['/submit', { token: expiring.token, values: { full_name: 'Expired' } }]]) rejected(await pub(route, body), [403, 404, 410]);
  });

  await t.test('public uploads validate MIME, magic, base64 and maximum decoded size before persistence', async () => {
    const session = await newSession();
    const invitation = await link(session);
    const before = (await db.query('SELECT count(*)::int AS count FROM recruitment_onboarding_photos')).rows[0].count;
    for (const patch of [
      { mimeType: 'image/svg+xml', base64: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString('base64') },
      { mimeType: 'image/jpeg' },
      { base64: Buffer.from('Not an image').toString('base64') },
      { base64: 'not valid base64!' },
      { documentId: 'not_in_form' },
    ]) rejected(await pub('/upload', { token: invitation.token, ...photoBody(patch) }), [400, 422]);
    const oversized = Buffer.alloc(10 * 1024 * 1024 + 1);
    PNG.copy(oversized);
    rejected(await pub('/upload', { token: invitation.token, ...photoBody({ base64: oversized.toString('base64') }) }), [400, 413, 422]);
    assert.equal((await db.query('SELECT count(*)::int AS count FROM recruitment_onboarding_photos')).rows[0].count, before);
    const png = ok(await pub('/upload', { token: invitation.token, ...photoBody() }));
    const jpeg = await upload(session, recruiter, { documentId: 'license_front', mimeType: 'image/jpeg', base64: JPEG.toString('base64') });
    for (const [photo, bytes, mimeType] of [[png, PNG, 'image/png'], [jpeg, JPEG, 'image/jpeg']]) {
      assert.equal(photo.byteSize, bytes.length);
      assert.equal(photo.mimeType, mimeType);
      assert.equal(new Date(photo.expiresAt) - new Date(photo.uploadedAt), 72 * 3600000);
      assert.ok(!JSON.stringify(photo).includes(bytes.toString('base64')));
      assert.ok(!/storage(Path|Key)|storage_key|file_path/.test(JSON.stringify(photo)));
      const response = await binary(photo, recruiter);
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type'), new RegExp(`^${mimeType}`));
      assert.match(response.headers.get('cache-control'), /no-store/);
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
    }
    const stored = (await db.query('SELECT row_to_json(p) AS row FROM recruitment_onboarding_photos p WHERE id=$1', [png.id])).rows[0].row;
    assert.ok(!JSON.stringify(stored).includes(PNG.toString('base64')), 'Database keeps metadata, not original photograph bytes');
  });

  await t.test('submission validates mandatory fields and photos then consumes the public link once', async () => {
    const session = await newSession();
    const invitation = await link(session);
    rejected(await pub('/submit', { token: invitation.token, values: {} }), [400, 422]);
    rejected(await pub('/submit', { token: invitation.token, values: { full_name: 'Synthetic Candidate' } }), [400, 422]);
    ok(await pub('/upload', { token: invitation.token, ...photoBody() }));
    rejected(await pub('/submit', { token: invitation.token, values: { full_name: '   ' } }), [400, 422]);
    rejected(await pub('/submit', { token: invitation.token, values: { full_name: 'Synthetic Candidate', shift: 'Not listed' } }), [400, 422]);
    const results = await Promise.all([
      pub('/submit', { token: invitation.token, values: { full_name: 'Synthetic Candidate', shift: 'Утро' } }),
      pub('/submit', { token: invitation.token, values: { full_name: 'Synthetic Candidate', shift: 'Утро' } }),
    ]);
    assert.equal(results.filter(result => [200, 201].includes(result.status)).length, 1, 'Only one simultaneous submission succeeds');
    rejected(results.find(result => ![200, 201].includes(result.status)), [403, 404, 409, 410]);
    const submitted = await current(session);
    assert.equal(submitted.status, 'submitted');
    assert.equal(submitted.linkActive, false);
    assert.equal(submitted.values.full_name, 'Synthetic Candidate');
    rejected(await pub('/preview', { token: invitation.token }), [403, 404, 410]);
    rejected(await pub('/upload', { token: invitation.token, ...photoBody() }), [403, 404, 410]);
  });

  await t.test('missing OCR configuration preserves the original for manual review and private values survive deletion', async () => {
    let session = await newSession();
    session = ok(await auth('PUT', `/sessions/${session.id}`, { version: session.version, values: { full_name: 'Synthetic Manual Candidate', passport_number: PRIVATE_VALUE } }));
    const beforeFiles = new Set(await diskFiles());
    const photo = await upload(session);
    const createdFiles = (await diskFiles()).filter(file => !beforeFiles.has(file));
    assert.ok(createdFiles.length > 0, 'An uploaded original exists on disk');
    rejected(await auth('POST', `/photos/${photo.id}/recognize`, {}), [503]);
    assert.equal((await binary(photo, recruiter)).status, 200, 'OCR failure retains the photograph');
    rejected(await auth('POST', '/photos/delete', { photoIds: [photo.id] }), [400, 409, 422]);
    session = await current(session);
    rejected(await auth('POST', `/sessions/${session.id}/verify`, { version: session.version, values: session.values }), [400, 409, 422]);
    const checked = await review(photo);
    assert.ok(checked.reviewedAt);
    session = await current(session);
    rejected(await auth('POST', `/sessions/${session.id}/verify`, { version: session.version, values: {} }), [400, 422]);
    const invitation = await link(session);
    session = await current(session);
    const verified = ok(await auth('POST', `/sessions/${session.id}/verify`, { version: session.version, values: session.values }));
    assert.equal(verified.status, 'verified');
    assert.equal(verified.linkActive, false);
    rejected(await pub('/preview', { token: invitation.token }), [403, 404, 410]);
    assert.equal(ok(await auth('POST', '/photos/delete', { photoIds: [photo.id] })).deleted, 1);
    assert.ok([404, 410].includes((await binary(photo, recruiter)).status));
    for (const file of createdFiles) await assert.rejects(fs.access(file), { code: 'ENOENT' });
    const after = await current(session);
    assert.equal(after.values.passport_number, PRIVATE_VALUE);
    assert.equal(after.status, 'verified');
    assert.ok(after.photos.find(row => row.id === photo.id).deletedAt);
  });

  await t.test('bulk deletion checks every owner and review before deleting any photograph', async () => {
    const own = await newSession(), other = await newSession(peer);
    const checked = await upload(own), unchecked = await upload(own), foreignPhoto = await upload(other, peer);
    await review(checked);
    await review(foreignPhoto, peer);
    rejected(await auth('POST', '/photos/delete', { photoIds: [checked.id, foreignPhoto.id] }), [403, 404]);
    assert.equal((await binary(checked, recruiter)).status, 200);
    assert.equal((await binary(foreignPhoto, peer)).status, 200);
    rejected(await auth('POST', '/photos/delete', { photoIds: [checked.id, unchecked.id] }), [400, 409, 422]);
    assert.equal((await binary(checked, recruiter)).status, 200);
    assert.equal((await binary(unchecked, recruiter)).status, 200);
  });

  await t.test('new office edits revoke candidate access and the newest required image must be reviewed', async () => {
    let session = await newSession();
    const invitation = await link(session);
    session = await current(session);
    session = ok(await auth('PUT', `/sessions/${session.id}`, { version: session.version, values: { full_name: 'Office revision' } }));
    assert.equal(session.linkActive, false);
    rejected(await pub('/submit', { token: invitation.token, values: { full_name: 'Stale remote revision' } }), [403, 404, 410]);
    assert.equal((await current(session)).values.full_name, 'Office revision');
    const first = await upload(session);
    await review(first);
    session = await current(session);
    const reviewedVersion = session.version;
    const replacement = await upload(session);
    session = await current(session);
    assert.ok(session.version > reviewedVersion, 'New evidence invalidates the previous editor version');
    rejected(await auth('POST', `/sessions/${session.id}/verify`, { version: session.version, values: session.values }), [400, 409, 422]);
    await review(replacement);
    session = await current(session);
    assert.equal(ok(await auth('POST', `/sessions/${session.id}/verify`, { version: session.version, values: session.values })).status, 'verified');
  });

  await t.test('candidate access ends when the actual link issuer loses personal-data access', async () => {
    const issuer = await actor('manager');
    const session = await newSession();
    const invitation = await link(session, issuer);
    ok(await pub('/preview', { token: invitation.token }));
    await db.query('UPDATE access_grants SET personal_data_visible=false WHERE user_id=$1', [issuer.id]);
    rejected(await auth('GET', '/context', undefined, issuer), [403]);
    rejected(await pub('/preview', { token: invitation.token }), [403, 404, 410]);
    rejected(await pub('/upload', { token: invitation.token, ...photoBody() }), [403, 404, 410]);
    rejected(await pub('/submit', { token: invitation.token, values: { full_name: 'Revoked issuer' } }), [403, 404, 410]);
    assert.equal((await current(session)).createdBy, recruiter.id, 'Revocation is based on the issuer even when the session owner is still authorized');
  });

  await t.test('72-hour expiry denies original content and startup cleanup destroys even unreviewed originals', async () => {
    let session = await newSession();
    session = ok(await auth('PUT', `/sessions/${session.id}`, { version: session.version, values: { full_name: 'Synthetic Retention Candidate', passport_number: PRIVATE_VALUE } }));
    const beforeFiles = new Set(await diskFiles());
    const photo = await upload(session);
    const createdFiles = (await diskFiles()).filter(file => !beforeFiles.has(file));
    assert.ok(createdFiles.length > 0);
    await db.query("UPDATE recruitment_onboarding_photos SET uploaded_at=now()-interval '73 hours',expires_at=now()-interval '1 hour' WHERE id=$1", [photo.id]);
    assert.ok([404, 410].includes((await binary(photo, recruiter)).status));
    rejected(await auth('POST', `/photos/${photo.id}/recognize`, {}), [404, 410]);
    rejected(await auth('POST', `/photos/${photo.id}/review`, {}), [404, 410]);
    await fixture.restartApi();
    const after = await current(session);
    const removed = after.photos.find(row => row.id === photo.id);
    assert.ok(removed.deletedAt, 'Expired unreviewed photo is marked deleted');
    assert.ok(removed.deletionReason);
    for (const file of createdFiles) await assert.rejects(fs.access(file), { code: 'ENOENT' });
    assert.equal(after.values.passport_number, PRIVATE_VALUE);
    assert.equal(removed.reviewedAt, null, 'Retention cleanup does not falsely mark a review');
  });

  await t.test('one filesystem failure does not stop retention cleanup and the failed original is retried', async () => {
    const session = await newSession();
    const blocked = await upload(session), removable = await upload(session);
    await db.query("UPDATE recruitment_onboarding_photos SET uploaded_at=now()-interval '75 hours',expires_at=now()-interval '3 hours' WHERE id=$1", [blocked.id]);
    await db.query("UPDATE recruitment_onboarding_photos SET uploaded_at=now()-interval '74 hours',expires_at=now()-interval '2 hours' WHERE id=$1", [removable.id]);
    const blockedPath = path.join(photoDirectory, `${blocked.id}.bin`);
    const originalRm = fs.rm;
    fs.rm = async (target, ...options) => {
      if (String(target) === blockedPath) throw Object.assign(new Error('Synthetic retention unlink failure'), { code: 'EACCES' });
      return originalRm.call(fs, target, ...options);
    };
    try {
      await fixture.restartApi();
      const after = await current(session);
      assert.equal(after.photos.find(photo => photo.id === blocked.id).deletedAt, null, 'Failure must not falsely claim the original was destroyed');
      assert.ok(after.photos.find(photo => photo.id === removable.id).deletedAt, 'The next expired original is still destroyed');
      await fs.access(blockedPath);
      await assert.rejects(fs.access(path.join(photoDirectory, `${removable.id}.bin`)), { code: 'ENOENT' });
      assert.ok([404, 410].includes((await binary(blocked, recruiter)).status), 'Expired bytes remain inaccessible even if physical deletion fails');
      assert.equal(ok(await auth('GET', '/context')).cleanup.failed, true);
    } finally { fs.rm = originalRm; }
    await fixture.restartApi();
    assert.ok((await current(session)).photos.find(photo => photo.id === blocked.id).deletedAt);
    await assert.rejects(fs.access(blockedPath), { code: 'ENOENT' });
    assert.equal(ok(await auth('GET', '/context')).cleanup.failed, false);
  });

  await t.test('ordinary recruiting cards and audit never receive onboarding values, image bytes or link secrets', async () => {
    const session = await newSession();
    const invitation = await link(session);
    const response = ok(await request('GET', '/recruitment', undefined, manager.accessToken));
    const audit = (await db.query("SELECT payload FROM audit_events WHERE payload->>'action' LIKE '%onboarding%' ")).rows;
    for (const value of [JSON.stringify(response), JSON.stringify(audit)]) {
      for (const secret of [PRIVATE_VALUE, invitation.token, PNG.toString('base64')]) assert.ok(!value.includes(secret));
    }
  });
});
