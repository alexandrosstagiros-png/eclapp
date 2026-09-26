'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, createHash } = require('node:crypto');
const { createTestServer } = require('./local-test-server.cjs');
const { MAX_ATTACHMENT_BYTES } = require('../recovered/apps/api/src/modules/team/team-input');

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const attachment = (bytes, filename = 'Документ команды.bin', mimeType = 'application/octet-stream', id = randomUUID()) => ({ id, filename, mimeType, contentBase64: bytes.toString('base64') });
const metadata = (file, bytes) => ({ id: file.id, filename: file.filename.normalize('NFC').trim(), mimeType: file.mimeType, byteSize: bytes.length, sha256: hash(bytes) });
const safeMessage = message => {
  for (const file of message.attachments || []) {
    assert.deepEqual(Object.keys(file).sort(), ['byteSize', 'filename', 'id', 'mimeType', 'sha256']);
    assert.equal(file.contentBase64, undefined);
    assert.equal(file.content, undefined);
    assert.equal(file.data, undefined);
  }
};

test('corporate attachments round-trip durably and preserve scoped conversation authorization', { timeout: 180000 }, async t => {
  const f = await createTestServer({ staffTeamActors: true });
  t.after(() => f.close());
  const { ids, request, devLogin, adminPool: db } = f;
  const admin = await devLogin(ids.admin), alice = await devLogin(ids.drivers[0]), bob = await devLogin(ids.drivers[1]), outsider = await devLogin(ids.dispatcher);
  const scopeTuple = [ids.legal, ids.region, ids.project, ids.scope];
  const scoped = path => `${path}?responsibilityScopeId=${ids.scope}`;
  const call = (method, path, body, session = alice) => request(method, path, body, session?.accessToken);
  const ok = result => { assert.ok([200, 201].includes(result.status), `Expected successful API result, got HTTP ${result.status}: ${JSON.stringify(result.body)}`); return result.body; };
  const denied = response => assert.ok([401, 403, 404].includes(response.status), `Expected denied download, got HTTP ${response.status}`);
  const input = (conversationId, patch = {}) => ({ id: randomUUID(), responsibilityScopeId: ids.scope, conversationId, parentId: null, text: 'Задача: проверить вложение.', ...patch });
  const send = (body, session = alice) => call('POST', '/team/messages', body, session);
  const createConversation = async (kind, memberIds = []) => ok(await call('POST', '/team/conversations', { id: randomUUID(), responsibilityScopeId: ids.scope, kind, title: 'Переписка с вложениями', memberIds }));
  async function download(id, session = alice, scopeId = ids.scope) {
    const response = await fetch(`${f.origin}/api/v1/team/attachments/${id}?responsibilityScopeId=${scopeId}`, { headers: session ? { Authorization: `Bearer ${session.accessToken}` } : {}, signal: AbortSignal.timeout(10000) });
    return { status: response.status, headers: response.headers, bytes: Buffer.from(await response.arrayBuffer()) };
  }
  async function attachmentCount(attachmentIds) {
    return Number((await db.query('SELECT count(*) FROM team_attachments WHERE id=ANY($1::uuid[])', [attachmentIds])).rows[0].count);
  }
  const channel = await createConversation('channel'), direct = await createConversation('direct', [ids.drivers[0], ids.drivers[1]]);
  const secret = `SYNTHETIC_ATTACHMENT_CONTENT_${randomUUID()}`;
  const bytes = Buffer.concat([Buffer.from(secret, 'utf8'), Buffer.from(Array.from({ length: 256 }, (_, index) => index))]);
  const file = attachment(bytes, 'План перевозок № 7.bin'), rootInput = input(channel.id, { attachments: [file] });
  let root, branch, privateMessage, privateFile, emptyFile, htmlFile;

  await t.test('binary bytes, Russian filename, computed metadata and secure download headers survive restart', async () => {
    root = ok(await send(rootInput));
    assert.deepEqual(root.attachments, [metadata(file, bytes)]);
    safeMessage(root);
    let result = await download(file.id, bob);
    assert.equal(result.status, 200);
    assert.deepEqual(result.bytes, bytes);
    assert.equal(hash(result.bytes), root.attachments[0].sha256);
    assert.match(result.headers.get('content-type'), /^application\/octet-stream(?:;|$)/);
    assert.match(result.headers.get('content-disposition'), /^attachment;/);
    const encodedName = result.headers.get('content-disposition').match(/filename\*=UTF-8''([^;]+)/i)?.[1];
    assert.equal(decodeURIComponent(encodedName || ''), file.filename);
    assert.equal(result.headers.get('x-content-type-options'), 'nosniff');
    assert.match(result.headers.get('cache-control'), /no-store/);
    assert.match(result.headers.get('content-security-policy'), /sandbox|default-src 'none'/);
    const detail = ok(await call('GET', scoped(`/team/conversations/${channel.id}`)));
    assert.deepEqual(detail.messages.find(message => message.id === root.id).attachments, root.attachments);
    detail.messages.forEach(safeMessage);
    await f.restartApi();
    result = await download(file.id, bob);
    assert.equal(result.status, 200);
    assert.deepEqual(result.bytes, bytes);
    assert.deepEqual(ok(await send(rootInput)), root, 'retry after process restart returns the persisted message and metadata');
  });

  await t.test('file-only posts, zero-byte files and nested branches expose metadata without embedding content', async () => {
    emptyFile = attachment(Buffer.alloc(0), 'Пустой.txt', 'text/plain');
    branch = ok(await send(input(channel.id, { text: '', parentId: root.id, attachments: [emptyFile] })));
    assert.equal(branch.text, '');
    assert.equal(branch.parentId, root.id);
    assert.deepEqual(branch.attachments, [metadata(emptyFile, Buffer.alloc(0))]);
    const empty = await download(emptyFile.id, bob);
    assert.equal(empty.status, 200);
    assert.equal(empty.bytes.length, 0);
    htmlFile = attachment(Buffer.from('<p>Синтетический документ для скачивания</p>'), 'Материал.html', 'text/html');
    const nested = ok(await send(input(channel.id, { text: '', parentId: branch.id, attachments: [htmlFile] })));
    const source = ok(await call('GET', scoped(`/team/messages/${nested.id}`)));
    assert.deepEqual(source.ancestors.map(message => message.id), [root.id, branch.id]);
    assert.deepEqual(source.ancestors[0].attachments, root.attachments);
    assert.deepEqual(source.ancestors[1].attachments, branch.attachments);
    assert.equal(source.message.attachments[0].id, htmlFile.id);
    [source.message, ...source.ancestors].forEach(safeMessage);
    const result = await download(htmlFile.id);
    assert.equal(result.headers.get('content-type').split(';')[0], 'application/octet-stream', 'active document types are downloaded as bytes');
    assert.match(result.headers.get('content-disposition'), /^attachment;/);
    for (const text of ['', '   ']) assert.equal((await send(input(channel.id, { text, attachments: [] }))).status, 400);
    const textOnly = ok(await send(input(channel.id, { text: 'Текст без файлов.' })));
    assert.deepEqual(textOnly.attachments, []);
  });

  await t.test('attachment metadata is restored for branch ancestors outside the current history page', async () => {
    await db.query("UPDATE team_messages SET created_at='2000-01-01T00:00:00Z' WHERE id=$1", [root.id]);
    const replies = Array.from({ length: 105 }, () => randomUUID());
    await db.query(`INSERT INTO team_messages(id,legal_entity_id,region_id,project_id,responsibility_scope_id,conversation_id,parent_id,text,author_id,author_name,created_at)
      SELECT x.id,$1,$2,$3,$4,$5,$6,'Синтетический ответ',$7,'Сотрудник',clock_timestamp()+x.n*interval '1 microsecond'
      FROM unnest($8::uuid[]) WITH ORDINALITY AS x(id,n)`, [...scopeTuple, channel.id, root.id, ids.drivers[0], replies]);
    const detail = ok(await call('GET', scoped(`/team/conversations/${channel.id}`)));
    assert.equal(detail.hasMore, true);
    assert.equal(detail.messages.some(message => message.id === root.id), false);
    assert.deepEqual(detail.ancestors.find(message => message.id === root.id).attachments, root.attachments);
    detail.ancestors.forEach(safeMessage);
  });

  await t.test('concurrent retries are idempotent and conflicting attachment data is atomic', async () => {
    const current = ok(await call('GET', scoped(`/team/messages/${root.id}`))).message;
    const retries = await Promise.all([send(rootInput), send(rootInput)]);
    retries.forEach(response => assert.deepEqual(ok(response), current));
    assert.equal(await attachmentCount([file.id]), 1);
    for (const patch of [{ filename: 'Иное имя.bin' }, { mimeType: 'application/pdf' }, { contentBase64: Buffer.from('Другие байты').toString('base64') }, { id: randomUUID() }]) {
      const changed = await send({ ...rootInput, attachments: [{ ...file, ...patch }] });
      assert.equal(changed.status, 409, 'reusing a message UUID with a different immutable file must conflict');
    }
    assert.equal((await send({ ...rootInput, attachments: [] })).status, 409);
    const unattached = attachment(Buffer.from('must roll back'), 'Не сохранять.txt', 'text/plain');
    const conflict = input(channel.id, { attachments: [unattached, file] });
    assert.equal((await send(conflict)).status, 409);
    assert.equal(await attachmentCount([unattached.id]), 0);
    assert.equal((await db.query('SELECT 1 FROM team_messages WHERE id=$1', [conflict.id])).rowCount, 0);
    assert.equal(await attachmentCount([file.id]), 1);
  });

  await t.test('forged metadata, unsafe filenames, invalid base64 and oversized counts reject before persistence', async () => {
    const invalidFiles = [
      { ...attachment(Buffer.from('x')), byteSize: 999 },
      { ...attachment(Buffer.from('x')), sha256: 'a'.repeat(64) },
      { ...attachment(Buffer.from('x')), messageId: root.id },
      { ...attachment(Buffer.from('x')), responsibilityScopeId: randomUUID() },
      { ...attachment(Buffer.from('x')), contentBase64: 'not base64!' },
      { ...attachment(Buffer.from('x')), contentBase64: 'Zg' },
      { ...attachment(Buffer.from('x')), contentBase64: 'Zh==' },
      { ...attachment(Buffer.from('x')), contentBase64: 'Zg==\n' },
      { ...attachment(Buffer.from('x')), contentBase64: 42 },
      { ...attachment(Buffer.from('x')), mimeType: 'text/plain\r\nInjected: yes' },
      { ...attachment(Buffer.from('x')), id: 'not-a-uuid' },
      ...['../секрет.txt', 'папка/файл.txt', 'папка\\файл.txt', 'bad\u0000.txt', 'bad\r\n.txt', 'bad\u202E.txt', '', 'я'.repeat(128)].map(filename => attachment(Buffer.from('x'), filename)),
    ];
    for (const invalid of invalidFiles) {
      const body = input(channel.id, { attachments: [invalid] });
      assert.equal((await send(body)).status, 400, `Invalid attachment was accepted: ${Object.keys(invalid).join(',')}`);
      assert.equal((await db.query('SELECT 1 FROM team_messages WHERE id=$1', [body.id])).rowCount, 0);
    }
    const duplicate = attachment(Buffer.from('x'));
    for (const attachments of [[duplicate, duplicate], Array.from({ length: 6 }, () => attachment(Buffer.from('x'))), 'forged-array']) {
      const body = input(channel.id, { attachments });
      assert.equal((await send(body)).status, 400);
      assert.equal((await db.query('SELECT 1 FROM team_messages WHERE id=$1', [body.id])).rowCount, 0);
    }
  });

  await t.test('the upload parser accepts valid large files and enforces the aggregate message byte limit', async () => {
    const large = Buffer.alloc(65536, 0xa5), largeFile = attachment(large, 'Большой файл.bin');
    const result = ok(await send(input(channel.id, { text: '', attachments: [largeFile] })));
    assert.equal(result.attachments[0].byteSize, large.length);
    assert.deepEqual((await download(largeFile.id, bob)).bytes, large);
    const half = Buffer.alloc(MAX_ATTACHMENT_BYTES / 2, 0x5a);
    const boundaryFiles = [attachment(half, 'Первая половина.bin'), attachment(half, 'Вторая половина.bin')];
    const boundary = ok(await send(input(channel.id, { text: '', attachments: boundaryFiles })));
    assert.equal(boundary.attachments.reduce((sum, item) => sum + item.byteSize, 0), MAX_ATTACHMENT_BYTES);
    const excess = input(channel.id, { text: '', attachments: [attachment(half), attachment(Buffer.alloc(MAX_ATTACHMENT_BYTES / 2 + 1))] });
    assert.equal((await send(excess)).status, 400);
    assert.equal((await db.query('SELECT 1 FROM team_messages WHERE id=$1', [excess.id])).rowCount, 0);
    assert.equal(await attachmentCount(excess.attachments.map(item => item.id)), 0);
  });

  await t.test('private attachments obey membership and administrator reads are audited without write access', async () => {
    privateFile = attachment(Buffer.from(secret + ': PRIVATE'), 'Личный документ.bin');
    privateMessage = ok(await send(input(direct.id, { text: 'Задача: проверить личный документ.', attachments: [privateFile] })));
    assert.equal((await download(privateFile.id, bob)).status, 200);
    denied(await download(privateFile.id, outsider));
    denied(await download(privateFile.id, null));
    const administratorDownload = await download(privateFile.id, admin);
    assert.equal(administratorDownload.status, 200);
    assert.deepEqual(administratorDownload.bytes, Buffer.from(secret + ': PRIVATE'));
    const audit = (await db.query("SELECT payload FROM audit_events WHERE payload->>'action'='team.attachment.admin_download' AND payload->>'actorId'=$1", [ids.admin])).rows;
    assert.equal(audit.length, 1);
    assert.ok(JSON.stringify(audit[0].payload).includes(privateFile.id));
    const deniedFile = attachment(Buffer.from('Denied admin write'));
    assert.equal((await send(input(direct.id, { text: '', attachments: [deniedFile] }), admin)).status, 403);
    assert.equal(await attachmentCount([deniedFile.id]), 0);
    const unrelated = attachment(Buffer.from('Denied unrelated write'));
    assert.ok([403, 404].includes((await send(input(direct.id, { attachments: [unrelated] }), outsider)).status));
    assert.equal(await attachmentCount([unrelated.id]), 0);
  });

  await t.test('sharing a summary does not grant attachment access and no content leaks through JSON or audit', async () => {
    const report = ok(await call('POST', '/team/summaries', { responsibilityScopeId: ids.scope }, admin));
    assert.ok(report.sourceMessageIds.includes(privateMessage.id));
    ok(await call('PUT', `/team/summaries/${report.id}/sharing`, { responsibilityScopeId: ids.scope, recipientIds: [ids.dispatcher] }, admin));
    const summaries = ok(await call('GET', scoped('/team/summaries'), undefined, outsider));
    assert.ok(summaries.summaries.some(item => item.id === report.id));
    denied(await download(privateFile.id, outsider));
    const lists = ok(await call('GET', scoped('/team/conversations'), undefined, admin));
    const audit = (await db.query('SELECT payload FROM audit_events')).rows;
    for (const value of [lists, summaries, audit]) {
      const serialized = JSON.stringify(value);
      assert.equal(serialized.includes(secret), false, 'binary attachment contents must never leak through lists, audit, or summaries');
      assert.equal(serialized.includes(file.contentBase64), false);
      assert.equal(serialized.includes(privateFile.contentBase64), false);
      assert.equal(serialized.includes('contentBase64'), false);
    }
  });

  await t.test('wrong scope, external accounts, revoked grants and disabled users cannot download', async () => {
    const alternate = randomUUID(), externalId = randomUUID();
    await db.query('INSERT INTO responsibility_scopes(id,project_id,name) VALUES($1,$2,$3)', [alternate, ids.project, 'Другая область вложений']);
    await db.query('INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id) VALUES($1,$2,$3,$4,$5)', [ids.admin, ids.legal, ids.region, ids.project, alternate]);
    denied(await download(privateFile.id, admin, alternate));
    denied(await download(file.id, alice, alternate));
    denied(await download(randomUUID(), admin));
    await db.query("INSERT INTO users(id,display_name,role,active,approved) VALUES($1,'Внешний сотрудник','external_recruiter',true,true)", [externalId]);
    await db.query('INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id) VALUES($1,$2,$3,$4,$5)', [externalId, ...scopeTuple]);
    const external = await devLogin(externalId);
    denied(await download(file.id, external));
    await db.query('DELETE FROM access_grants WHERE user_id=$1', [ids.drivers[1]]);
    denied(await download(privateFile.id, bob));
    denied(await download(file.id, bob));
    await db.query('UPDATE users SET active=false WHERE id=$1', [ids.drivers[0]]);
    assert.equal((await download(file.id, alice)).status, 401);
  });
});
