'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID, randomBytes, createHash } = require('node:crypto');
const { createTestServer } = require('./local-test-server.cjs');
const { CommunicationsService } = require('../recovered/apps/api/src/modules/communications/application/communications.service');
const { CommunicationsRepository } = require('../recovered/apps/api/src/modules/communications/infra/communications.repository');
const { IdentityRepository } = require('../recovered/apps/api/src/modules/identity-access/infrastructure/identity.repository');
const { AuditService } = require('../recovered/apps/api/src/modules/audit/application/audit.service');
const { TelegramCommunicationsService } = require('../recovered/apps/api/src/modules/communications/application/telegram-communications.service');
const { TelegramDeliveryWorker } = require('../recovered/apps/api/src/modules/communications/infra/telegram-delivery.worker');

test('driver requests retain their history and exchange scoped in-app replies without Telegram delivery', { timeout: 180000 }, async t => {
  const f = await createTestServer();
  t.after(() => f.close());
  const { ids, adminPool: db, request, devLogin } = f;
  const scope = { legalEntityId: ids.legal, regionId: ids.region, projectId: ids.project, responsibilityScopeId: ids.scope };
  const ok = (response, status = 200) => { assert.equal(response.status, status, JSON.stringify(response.body)); return response.body; };
  const admin = await devLogin(ids.admin), driver = await devLogin(ids.drivers[0]), peerDriver = await devLogin(ids.drivers[1]);
  await db.query('UPDATE access_grants SET personal_data_visible=true,finance_visible=true WHERE user_id=$1', [ids.admin]);
  const call = (method, route, body, session = admin) => request(method, route, body, session.accessToken);
  const create = (body = {}, session = driver) => call('POST', '/communications/tickets', {
    idempotencyKey: randomUUID(), department: 'transport', kind: 'question', subject: 'Синтетическое обращение водителя', scope, ...body }, session);
  const detail = (id, session = admin) => call('GET', `/communications/tickets/${id}`, undefined, session);
  const messages = (id, session = admin, before) => call('GET', `/communications/tickets/${id}/messages${before ? `?before=${before}` : ''}`, undefined, session);
  const send = (id, text, session = admin, key = randomUUID()) => call('POST', `/communications/tickets/${id}/messages`, { idempotencyKey: key, text }, session);
  const queue = (session = admin, scopeId = ids.scope, cursor) => call('GET', `/communications/driver-requests?responsibilityScopeId=${scopeId}${cursor ? `&cursor=${cursor}` : ''}`, undefined, session);
  const act = (ticket, action, session = admin, reason) => call('POST', `/communications/tickets/${ticket.id}/actions`, {
    idempotencyKey: randomUUID(), expectedVersion: ticket.version, action, ...(reason ? { reason } : {}) }, session);
  async function employee(role, { department, finance = false, personal = true, selectedScope = ids.scope } = {}) {
    const id = randomUUID();
    await db.query("INSERT INTO users(id,display_name,role,active,approved) VALUES($1,'Synthetic request employee',$2,true,true)", [id, role]);
    await db.query(`INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id,personal_data_visible,finance_visible)
      VALUES($1,$2,$3,$4,$5,$6,$7)`, [id, ids.legal, ids.region, ids.project, selectedScope, personal, finance]);
    if (department) await db.query(`INSERT INTO communications_memberships(user_id,department,legal_entity_id,region_id,project_id,responsibility_scope_id,enabled,updated_by)
      VALUES($1,$2,$3,$4,$5,$6,true,$7)`, [id, department, ids.legal, ids.region, ids.project, selectedScope, ids.admin]);
    return { id, ...(await devLogin(id)) };
  }
  const transport = await employee('dispatcher', { department: 'transport' });
  const outsider = await employee('manager');
  const tender = await employee('tender_specialist', { department: 'transport' });
  const external = await employee('external_recruiter', { department: 'transport', finance: true });
  const accounting = await employee('document_specialist', { department: 'accounting', finance: true });
  const noFinance = await employee('document_specialist', { department: 'accounting' });
  const noPersonal = await employee('manager', { department: 'transport', personal: false });
  const legacyId = randomUUID(), legacyMessageId = randomUUID();
  let ticket, financeTicket;

  await t.test('migration retains legacy text and ticket versions, marks driver requests and cancels pending deliveries', async () => {
    // Reconstruct only the pre-048 shape in this disposable DB, then apply the real migration.
    await db.query('DROP TABLE communications_driver_requests; ALTER TABLE communications_messages DROP COLUMN origin; ALTER TABLE communications_messages ALTER COLUMN update_id SET NOT NULL');
    await db.query(`INSERT INTO communications_tickets(id,reference,department,original_department,kind,subject,requester_id,legal_entity_id,region_id,project_id,responsibility_scope_id)
      VALUES($1,$2,'transport','transport','question','Исторический вопрос',$3,$4,$5,$6,$7)`, [legacyId, `OLD-${legacyId}`, ids.drivers[0], ids.legal, ids.region, ids.project, ids.scope]);
    await db.query('INSERT INTO telegram_inbound_updates(update_id) VALUES(9000001)');
    await db.query(`INSERT INTO communications_messages(id,ticket_id,sender_id,department,update_id,content,sha256)
      VALUES($1,$2,$3,'transport',9000001,$4,$5)`, [legacyMessageId, legacyId, ids.drivers[0], 'Старый текст из Telegram', createHash('sha256').update('Старый текст из Telegram').digest('hex')]);
    const deliveryId = randomUUID();
    await db.query(`INSERT INTO telegram_deliveries(id,ticket_id,sender_id,recipient_id,origin,chat_id,department,content)
      VALUES($1,$2,$3,$4,'application','990001','transport','Историческая ожидающая отправка')`, [deliveryId, legacyId, ids.drivers[0], transport.id]);
    const sql = await fs.readFile(path.resolve(__dirname, '../recovered/infra/db/migrations/048_driver_requests_application.sql'), 'utf8');
    const client = await db.connect();
    try { await client.query('BEGIN'); await client.query(sql); await client.query('COMMIT'); }
    catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
    assert.equal((await db.query('SELECT version FROM communications_tickets WHERE id=$1', [legacyId])).rows[0].version, 1);
    assert.equal((await db.query('SELECT 1 FROM communications_driver_requests WHERE ticket_id=$1', [legacyId])).rowCount, 1);
    assert.deepEqual((await db.query('SELECT status,error_code FROM telegram_deliveries WHERE id=$1', [deliveryId])).rows[0], { status: 'failed', error_code: 'ACCESS_REVOKED' });
    const history = ok(await messages(legacyId, driver));
    assert.equal(history.messages[0].id, legacyMessageId);
    assert.equal(history.messages[0].text, 'Старый текст из Telegram');
    assert.equal(history.messages[0].origin, 'telegram');
    assert.equal(ok(await detail(legacyId)).applicationOnly, true);
  });

  await t.test('driver creation atomically stores the first multiline message and retries cannot duplicate or alter it', async () => {
    process.env.TELEGRAM_COMMUNICATIONS_ENABLED = 'true';
    process.env.TELEGRAM_BOT_USERNAME = 'synthetic_requests_bot';
    process.env.TELEGRAM_WEBHOOK_SECRET = randomBytes(32).toString('hex');
    for (const [userId, chatId] of [[ids.drivers[0], '990000'], [transport.id, '990001'], [ids.admin, '990002']]) {
      await db.query("INSERT INTO channel_identities(user_id,provider,provider_user_id) VALUES($1,'telegram',$2)", [userId, chatId]);
    }
    const key = randomUUID(), text = 'Нужен ответ отдела\nВторая строка';
    const responses = await Promise.all([create({ idempotencyKey: key, text }), create({ idempotencyKey: key, text })]);
    ticket = ok(responses[0], 201);
    assert.equal(ok(responses[1], 201).id, ticket.id);
    assert.equal(ticket.applicationOnly, true); assert.equal(ticket.canMessage, true);
    const page = ok(await messages(ticket.id, driver));
    assert.equal(page.messages.length, 1); assert.equal(page.messages[0].text, text); assert.equal(page.messages[0].origin, 'application');
    ok(await create({ idempotencyKey: key, text: 'Другой текст' }), 409);
    assert.equal((await db.query('SELECT 1 FROM telegram_deliveries WHERE ticket_id=$1', [ticket.id])).rowCount, 0);
    const catalog = ok(await call('GET', '/communications/catalog', undefined, driver));
    assert.equal(catalog.telegram.configured, false);
    assert.deepEqual(catalog.memberships, []);
  });

  await t.test('queue and detail enforce ownership, department membership, privacy flags, admin authority and exact scope', async () => {
    financeTicket = ok(await create({ department: 'accounting', subject: 'Расчёт водителя', text: 'Вопрос о расчёте' }), 201);
    assert.ok(ok(await queue()).items.some(row => row.id === ticket.id));
    assert.ok(ok(await queue()).items.some(row => row.id === financeTicket.id));
    assert.equal((await db.query('SELECT 1 FROM communications_memberships WHERE user_id=$1', [ids.admin])).rowCount, 0);
    assert.deepEqual(ok(await queue(outsider)).items, []);
    assert.deepEqual(ok(await queue(noPersonal)).items, []);
    assert.deepEqual(ok(await queue(noFinance)).items, []);
    assert.deepEqual(ok(await queue(accounting)).items.map(row => row.id), [financeTicket.id]);
    assert.ok(ok(await queue(transport)).items.some(row => row.id === ticket.id));
    assert.ok(!ok(await queue(transport)).items.some(row => row.id === financeTicket.id));
    ok(await queue(driver), 403); ok(await queue(external), 403);
    ok(await detail(ticket.id, peerDriver), 404); ok(await messages(ticket.id, peerDriver), 404); ok(await send(ticket.id, 'Не своё', peerDriver), 404);
    ok(await detail(ticket.id, outsider), 404); ok(await detail(financeTicket.id, noFinance), 404);
    ok(await detail(ticket.id, tender)); ok(await queue(tender));
    ok(await call('GET', '/communications/catalog', undefined, tender));
    ok(await call('GET', '/communications/tickets?view=mine', undefined, tender), 403);
    ok(await create({}, tender), 403);
    const staffTicketId = randomUUID();
    await db.query(`INSERT INTO communications_tickets(id,reference,department,original_department,kind,subject,requester_id,legal_entity_id,region_id,project_id,responsibility_scope_id)
      VALUES($1,$2,'transport','transport','question','Старое обращение сотрудника',$3,$4,$5,$6,$7)`, [staffTicketId, `STAFF-${staffTicketId}`, outsider.id, ids.legal, ids.region, ids.project, ids.scope]);
    ok(await detail(staffTicketId, tender), 404); ok(await messages(staffTicketId, tender), 404);
    ok(await send(staffTicketId, 'Недопустимое расширение доступа', tender), 404);
    assert.ok(!ok(await queue()).items.some(row => row.id === staffTicketId));
    const mine = ok(await call('GET', '/communications/tickets?view=mine', undefined, driver));
    assert.ok(mine.items.every(row => row.requester.id === ids.drivers[0]));
    const foreignScope = randomUUID();
    await db.query('INSERT INTO responsibility_scopes(id,project_id,name) VALUES($1,$2,$3)', [foreignScope, ids.project, 'Synthetic foreign request scope']);
    ok(await queue(admin, foreignScope), 403);
    const foreignDriver = await employee('driver', { selectedScope: foreignScope });
    const foreign = ok(await create({ scope: { ...scope, responsibilityScopeId: foreignScope } }, foreignDriver), 201);
    ok(await detail(foreign.id), 404); ok(await messages(foreign.id), 404);
    const malformed = await employee('access_admin');
    await db.query('UPDATE access_grants SET responsibility_scope_id=$2 WHERE user_id=$1', [malformed.id, foreignScope]);
    ok(await detail(ticket.id, malformed), 404);
    await db.query('UPDATE access_grants SET finance_visible=false WHERE user_id=$1', [ids.admin]);
    assert.ok(!ok(await queue()).items.some(row => row.id === financeTicket.id));
    ok(await detail(financeTicket.id), 404);
    await db.query('UPDATE access_grants SET finance_visible=true WHERE user_id=$1', [ids.admin]);
  });

  await t.test('replies are durable, idempotent and immediately available to the owner without external delivery', async () => {
    const key = randomUUID();
    const replies = await Promise.all([send(ticket.id, 'Ответ отдела\nПодробности', transport, key), send(ticket.id, 'Ответ отдела\nПодробности', transport, key)]);
    const first = ok(replies[0], 201); assert.equal(ok(replies[1], 201).id, first.id);
    assert.equal(first.authorId, transport.id); assert.equal(first.origin, 'application');
    ok(await send(ticket.id, 'Изменённый ответ', transport, key), 409);
    ok(await send(financeTicket.id, 'Ответ отдела\nПодробности', transport, key), 404);
    ok(await send(ticket.id, 'Ответ администратора'), 201);
    const page = ok(await messages(ticket.id, driver));
    assert.equal(page.messages.length, 3); assert.equal(page.hasMore, false); assert.equal(page.nextBefore, null);
    assert.equal((await db.query('SELECT 1 FROM telegram_deliveries WHERE ticket_id=$1', [ticket.id])).rowCount, 0);
    await f.restartApi();
    assert.deepEqual(ok(await messages(ticket.id, driver)), page);
    assert.equal(ok(await send(ticket.id, 'Ответ отдела\nПодробности', transport, key), 201).id, first.id);
  });

  await t.test('administrator can take and resolve driver requests without membership while owners reopen or escalate', async () => {
    let current = ok(await detail(ticket.id)); assert.ok(current.actions.includes('take'));
    current = ok(await act(current, 'take', transport), 201);
    const adminView = ok(await detail(ticket.id)); assert.ok(adminView.actions.includes('resolve')); assert.ok(adminView.actions.includes('take'));
    current = ok(await act(adminView, 'take'), 201); assert.equal(current.assignee.id, ids.admin);
    current = ok(await act(current, 'resolve', admin, 'Вопрос решён в приложении'), 201); assert.equal(current.canMessage, false);
    ok(await send(ticket.id, 'После закрытия', driver), 409);
    current = ok(await act(current, 'reopen', driver), 201); assert.equal(current.status, 'new');
    current = ok(await act(current, 'escalate', driver, 'Нужно решение администрации'), 201); assert.equal(current.department, 'administration');
    ok(await detail(ticket.id, transport), 404);
    assert.ok(!ok(await queue(transport)).items.some(row => row.id === ticket.id));
    assert.ok(ok(await queue()).items.some(row => row.id === ticket.id));
    assert.equal(current.history.length, 6);
    assert.equal((await db.query('SELECT 1 FROM telegram_deliveries WHERE ticket_id=$1', [ticket.id])).rowCount, 0);
  });

  await t.test('revoked grants, memberships, sessions and parent impersonation sessions stop both reads and writes', async () => {
    const active = ok(await create({ text: 'Проверка отзыва прав' }), 201);
    ok(await detail(active.id, transport));
    await db.query('UPDATE communications_memberships SET enabled=false WHERE user_id=$1', [transport.id]);
    ok(await messages(active.id, transport), 404); ok(await send(active.id, 'Недопустимый ответ', transport), 404);
    await db.query('UPDATE communications_memberships SET enabled=true WHERE user_id=$1', [transport.id]);
    const grant = (await db.query('SELECT * FROM access_grants WHERE user_id=$1', [transport.id])).rows[0];
    await db.query('DELETE FROM access_grants WHERE user_id=$1', [transport.id]);
    ok(await queue(transport), 403); ok(await messages(active.id, transport), 404);
    await db.query(`INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id,finance_visible,personal_data_visible)
      VALUES($1,$2,$3,$4,$5,$6,$7)`, [grant.user_id,grant.legal_entity_id,grant.region_id,grant.project_id,grant.responsibility_scope_id,grant.finance_visible,grant.personal_data_visible]);
    const parent = await devLogin(ids.admin);
    const child = ok(await call('POST', '/auth/impersonate', { userId: outsider.id }, parent));
    assert.deepEqual(ok(await queue(child)).items, []); ok(await detail(active.id, child), 404);
    const otherAdmin = await employee('access_admin');
    const administratorChild = ok(await call('POST', '/auth/impersonate', { userId: otherAdmin.id }, parent));
    assert.deepEqual(ok(await queue(administratorChild)).items, []); ok(await detail(active.id, administratorChild), 404);
    const memberChild = ok(await call('POST', '/auth/impersonate', { userId: transport.id }, parent));
    ok(await detail(active.id, memberChild));
    await db.query('UPDATE sessions SET revoked_at=clock_timestamp() WHERE token_hash=$1', [createHash('sha256').update(parent.accessToken).digest('hex')]);
    ok(await messages(active.id, memberChild), 401); ok(await send(active.id, 'После отзыва', memberChild), 401);
    const revoked = await devLogin(ids.drivers[0]);
    await db.query('UPDATE sessions SET revoked_at=clock_timestamp() WHERE token_hash=$1', [createHash('sha256').update(revoked.accessToken).digest('hex')]);
    ok(await messages(active.id, revoked), 401); ok(await send(active.id, 'После выхода', revoked), 401);
  });

  await t.test('Telegram links, inbound messages and queued deliveries cannot disclose driver conversations', async () => {
    ok(await call('POST', `/communications/tickets/${legacyId}/telegram-link`, {}, driver), 403);
    ok(await call('POST', `/communications/tickets/${legacyId}/telegram-link`, {}), 403);
    const database = { pool: db, transaction: async fn => {
      const client = await db.connect();
      try { await client.query('BEGIN'); const value = await fn(client); await client.query('COMMIT'); return value; }
      catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
    } };
    const identity = new IdentityRepository(database), audit = new AuditService();
    const core = new CommunicationsService(new CommunicationsRepository(database), identity, audit);
    const incoming = new TelegramCommunicationsService(database, core, audit);
    const before = (await db.query('SELECT count(*)::int AS count FROM communications_messages')).rows[0].count;
    const delivered = randomUUID();
    await db.query(`INSERT INTO telegram_deliveries(id,ticket_id,sender_id,recipient_id,origin,chat_id,department,content,force_reply,status,telegram_message_id,sent_at)
      VALUES($1,$2,$3,$4,'application','990001','transport','Старое приглашение ответить',true,'sent',777,clock_timestamp())`, [delivered, legacyId, ids.drivers[0], transport.id]);
    const update = (id, chatId, text) => ({ update_id: id, message: { message_id: id, from: { id: chatId, is_bot: false }, chat: { id: chatId, type: 'private' }, reply_to_message: { message_id: 777 }, text } });
    await incoming.receive(update(9000002, 990000, 'Водитель через Telegram'), randomUUID());
    await incoming.receive(update(9000003, 990001, 'Ответ сотрудника через Telegram'), randomUUID());
    const oldLink = `c_${randomBytes(24).toString('base64url')}`;
    await db.query('INSERT INTO communications_telegram_links(token_hash,ticket_id,actor_id,expires_at) VALUES($1,$2,$3,clock_timestamp()+interval \'10 minutes\')',
      [createHash('sha256').update(oldLink).digest('hex'), legacyId, transport.id]);
    const beforeDelivery = (await db.query('SELECT count(*)::int AS count FROM telegram_deliveries')).rows[0].count;
    await incoming.receive(update(9000004, 990001, `/start ${oldLink}`), randomUUID());
    assert.equal((await db.query('SELECT count(*)::int AS count FROM telegram_deliveries')).rows[0].count, beforeDelivery);
    assert.equal((await db.query('SELECT count(*)::int AS count FROM communications_messages')).rows[0].count, before);
    const pendingId = randomUUID();
    await db.query(`INSERT INTO telegram_deliveries(id,ticket_id,sender_id,recipient_id,origin,chat_id,department,content)
      VALUES($1,$2,$3,$4,'application','990001','transport','Не отправлять')`, [pendingId, legacyId, ids.admin, transport.id]);
    let sent = 0;
    const worker = new TelegramDeliveryWorker(database, core, identity, audit);
    assert.equal(await worker.drain({ send: async () => { sent++; return { messageId: 888 }; } }), true);
    assert.equal(sent, 0);
    assert.deepEqual((await db.query('SELECT status,error_code FROM telegram_deliveries WHERE id=$1', [pendingId])).rows[0], { status: 'failed', error_code: 'ACCESS_REVOKED' });
    await db.query("UPDATE users SET role='dispatcher' WHERE id=$1", [ids.drivers[0]]);
    assert.equal(ok(await detail(legacyId)).applicationOnly, true);
    await db.query("UPDATE users SET role='driver' WHERE id=$1", [ids.drivers[0]]);
  });

  await t.test('invalid messages and a failed initial-message write leave no ticket or idempotency orphan', async () => {
    for (const text of ['', ' ', null, 123, 'x'.repeat(3501), 'bad\u0000text']) {
      ok(await create({ text }), 400); ok(await send(legacyId, text, driver), 400);
    }
    ok(await call('POST', `/communications/tickets/${legacyId}/messages`, { idempotencyKey: randomUUID(), text: 'Подмена', authorId: ids.admin }, driver), 400);
    const count = async () => (await db.query(`SELECT (SELECT count(*) FROM communications_tickets)::int AS tickets,
      (SELECT count(*) FROM communications_driver_requests)::int AS driver_requests,(SELECT count(*) FROM communications_requests)::int AS requests`)).rows[0];
    const before = await count(), key = randomUUID();
    await db.query(`CREATE FUNCTION test_message_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.content='Синтетический сбой' THEN RAISE EXCEPTION 'Synthetic failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER test_message_failure BEFORE INSERT ON communications_messages FOR EACH ROW EXECUTE FUNCTION test_message_failure()`);
    try { ok(await create({ idempotencyKey: key, text: 'Синтетический сбой' }), 500); assert.deepEqual(await count(), before); }
    finally { await db.query('DROP TRIGGER test_message_failure ON communications_messages; DROP FUNCTION test_message_failure()'); }
    ok(await create({ idempotencyKey: key, text: 'Синтетический сбой' }), 201);
  });

  await t.test('message and queue pagination have no gaps or duplicates and history remains immutable', async () => {
    const pageTicket = ok(await create({ text: 'Первое' }), 201);
    for (let index = 0; index < 103; index++) ok(await send(pageTicket.id, `Сообщение ${index}`, driver), 201);
    const latest = ok(await messages(pageTicket.id, driver)), older = ok(await messages(pageTicket.id, driver, latest.nextBefore));
    assert.equal(latest.messages.length, 100); assert.equal(latest.hasMore, true);
    assert.equal(older.messages.length, 4); assert.equal(older.hasMore, false);
    const combined = [...older.messages, ...latest.messages];
    assert.equal(new Set(combined.map(row => row.id)).size, 104);
    assert.equal(combined[0].text, 'Первое'); assert.equal(combined.at(-1).text, 'Сообщение 102');
    for (let index = 0; index < 52; index++) ok(await create({ subject: `Страница обращений ${index}` }), 201);
    const first = ok(await queue()), second = ok(await queue(admin, ids.scope, first.nextCursor));
    assert.equal(first.items.length, 50); assert.ok(first.nextCursor); assert.ok(second.items.length > 0);
    const all = [...first.items, ...second.items];
    assert.equal(new Set(all.map(row => row.id)).size, all.length);
    await assert.rejects(db.query('UPDATE communications_messages SET content=content WHERE id=$1', [legacyMessageId]));
    await assert.rejects(db.query('DELETE FROM communications_driver_requests WHERE ticket_id=$1', [legacyId]));
    const audit = (await db.query("SELECT payload FROM audit_events WHERE payload->>'action'='communications.application_message_recorded' LIMIT 1")).rows[0].payload;
    assert.ok(audit.metadata.sha256); assert.equal(JSON.stringify(audit).includes('Нужен ответ отдела'), false);
  });
});
