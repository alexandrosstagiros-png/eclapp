'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, createHash } = require('node:crypto');
require('../recovered/node_modules/reflect-metadata');
const { createTestServer } = require('./local-test-server.cjs');
const { DatabaseService } = require('../recovered/apps/api/src/platform/database.service');
const { IdentityRepository } = require('../recovered/apps/api/src/modules/identity-access/infrastructure/identity.repository');
const { AuditService } = require('../recovered/apps/api/src/modules/audit/application/audit.service');
const { TeamService } = require('../recovered/apps/api/src/modules/team/team.service');
const { TeamOutcomesService, periodFor } = require('../recovered/apps/api/src/modules/team/team-outcomes');

test('Moscow reporting periods cover Friday, month-end, leap years and local Monday boundaries', () => {
  assert.deepEqual(periodFor('weekly', new Date('2026-09-27T21:00:00Z')), { kind: 'weekly', start: '2026-09-28', end: '2026-10-04', dueAt: '2026-10-02T20:59:59.999Z', timeZone: 'Europe/Moscow' });
  assert.equal(periodFor('weekly', new Date('2026-09-27T20:59:59.999Z')).start, '2026-09-21');
  assert.equal(periodFor('monthly', new Date('2028-02-15T00:00:00Z')).dueAt, '2028-02-29T20:59:59.999Z');
  assert.equal(periodFor('monthly', new Date('2026-12-31T21:00:00Z')).end, '2027-01-31');
  for (const value of ['2026-09-22', '2026-02-30', 'not-a-date']) assert.throws(() => periodFor('weekly', new Date(), value));
});

test('manager outcomes preserve assignments, private drafts, current hierarchy and exactly-once recognition', { timeout: 180000 }, async t => {
  const f = await createTestServer({ staffTeamActors: true }), { ids, request, adminPool: db } = f;
  const applicationDb = new DatabaseService({ value: { databaseUrl: process.env.DATABASE_URL } });
  t.after(async () => { await applicationDb.onApplicationShutdown(); await f.close(); });
  const identity = new IdentityRepository(applicationDb), team = new TeamService(applicationDb, identity, new AuditService()), worker = new TeamOutcomesService(applicationDb, team);
  const scopeTuple = [ids.legal, ids.region, ids.project, ids.scope], topId = ids.drivers[0], managerId = ids.drivers[1], employeeId = ids.dispatcher, outsiderId = randomUUID();
  await db.query("INSERT INTO users(id,display_name,role,active,approved) VALUES($1,'Другой руководитель','dispatcher',true,true)", [outsiderId]);
  await db.query('INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id) VALUES($1,$2,$3,$4,$5)', [outsiderId, ...scopeTuple]);
  for (const [userId, manager] of [[managerId, topId], [employeeId, managerId]]) await db.query(`INSERT INTO team_organization_employees(legal_entity_id,region_id,project_id,responsibility_scope_id,user_id,manager_id,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7)`, [...scopeTuple, userId, manager, ids.admin]);
  const admin = await f.devLogin(ids.admin), top = await f.devLogin(topId), manager = await f.devLogin(managerId), employee = await f.devLogin(employeeId), outsider = await f.devLogin(outsiderId);
  const call = (method, path, body, session = manager) => request(method, path, body, session.accessToken);
  const scoped = path => `${path}?responsibilityScopeId=${ids.scope}`;
  const ok = result => { assert.ok([200, 201].includes(result.status), `HTTP ${result.status}: ${JSON.stringify(result.body)}`); return result.body; };
  const list = async (kind = 'weekly', session = manager) => ok(await call('GET', `${scoped('/team/outcomes')}&kind=${kind}`, undefined, session));
  const detail = async (id, session = manager) => ok(await call('GET', scoped(`/team/outcomes/${id}`), undefined, session));
  const recognition = async () => ok(await call('GET', scoped('/team/recognition'), undefined, employee)).recognition;
  const saveBody = (report, patch = {}) => ({ responsibilityScopeId: ids.scope, operationId: randomUUID(), version: report.version,
    done: 'Выполнена задача', inProgress: 'В работе согласование', blockers: 'нет', nextMonthFocus: '', gratitude: [], submit: false, ...patch });
  let weekly, monthly, submitted;

  await t.test('lifecycle tick assigns current weekly and monthly reports before anyone opens the page and deduplicates replicas', async () => {
    assert.equal(Number((await db.query('SELECT count(*) FROM team_outcome_reports')).rows[0].count), 0);
    await worker.onModuleInit();
    assert.equal(worker.timer, undefined, 'test lifecycle never starts background timers');
    const holder = await db.connect();
    let running;
    try {
      await holder.query('BEGIN');
      await holder.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [[topId, managerId].sort()[0]]);
      running = worker.tick();
      let waiting = false;
      for (let attempt = 0; attempt < 100 && !waiting; attempt++) {
        waiting = (await db.query("SELECT 1 FROM pg_stat_activity WHERE usename='transport_app' AND wait_event_type='Lock'")).rowCount > 0;
        if (!waiting) await new Promise(resolve => setTimeout(resolve, 10));
      }
      assert.equal(waiting, true, 'materialization overlaps an existing user transaction');
      await holder.query("SET LOCAL lock_timeout='1s'");
      await team.lockScope(holder, { legalEntityId: ids.legal, regionId: ids.region, projectId: ids.project, responsibilityScopeId: ids.scope });
      // The worker must wait before the scope lock, so a current user's request
      // can finish without a users→scope→foreign-key-users deadlock.
    } finally {
      await holder.query('ROLLBACK'); holder.release();
      if (running) await running;
    }
    await Promise.all([worker.tick(), new TeamOutcomesService(applicationDb, team).tick()]);
    const assignments = (await db.query('SELECT owner_id,kind,subordinate_ids FROM team_outcome_reports')).rows;
    assert.equal(assignments.length, 4);
    assert.deepEqual(new Set(assignments.map(row => row.owner_id)), new Set([topId, managerId]));
    const own = await list(); weekly = own.reports.find(row => row.ownerId === managerId);
    monthly = (await list('monthly')).reports.find(row => row.ownerId === managerId);
    assert.equal(weekly.canEdit, true); assert.equal(own.reports.length, 1);
    assert.equal((await list('weekly', top)).reports.length, 2);
    assert.equal((await list('weekly', admin)).reports.length, 2);
    assert.equal((await list('weekly', employee)).reports.length, 0);
    assert.equal((await list('weekly', outsider)).reports.length, 0);
    assert.ok(Number.isFinite(Date.parse(own.featureStartedAt)));
  });

  await t.test('drafts are private and unsubmitted thanks confer no crowns; long Russian content fits the route parser', async () => {
    const body = saveBody(weekly, { done: 'Д'.repeat(6000), inProgress: 'В'.repeat(6000), blockers: 'П'.repeat(6000), gratitude: [{ recipientId: employeeId, reason: 'Помощь с задачей' }] });
    weekly = ok(await call('PUT', `/team/outcomes/${weekly.id}`, body));
    assert.equal(weekly.hasDraft, true); assert.equal(weekly.done.length, 6000);
    assert.deepEqual(await recognition(), []);
    for (const session of [top, admin]) {
      const hidden = await detail(weekly.id, session);
      assert.equal(hidden.contentVisible, false); assert.equal(hidden.hasDraft, true);
      for (const key of ['done', 'inProgress', 'blockers', 'gratitude']) assert.equal(hidden[key], undefined);
    }
    assert.equal((await call('GET', scoped(`/team/outcomes/${weekly.id}`), undefined, outsider)).status, 404);
    const otherWrite = await call('PUT', `/team/outcomes/${weekly.id}`, saveBody(weekly), admin);
    assert.equal(otherWrite.status, 403);
  });

  await t.test('required fields, strict inputs and recipient authorization fail atomically', async () => {
    const cases = [
      [saveBody(weekly, { submit: true, blockers: '' }), 400],
      [saveBody(weekly, { submit: 'true' }), 400],
      [saveBody(weekly, { dueAt: new Date().toISOString() }), 400],
      [saveBody(weekly, { gratitude: [{ recipientId: managerId, reason: 'Себе' }] }), 400],
      [saveBody(weekly, { submit: true, gratitude: [{ recipientId: employeeId, reason: '' }] }), 400],
      [saveBody(weekly, { gratitude: [{ recipientId: randomUUID(), reason: 'Чужой' }] }), 403],
      [saveBody(weekly, { gratitude: [{ recipientId: employeeId, reason: 'Раз' }, { recipientId: employeeId, reason: 'Два' }] }), 400],
    ];
    for (const [body, status] of cases) assert.equal((await call('PUT', `/team/outcomes/${weekly.id}`, body)).status, status);
    assert.equal((await detail(weekly.id)).version, weekly.version);
    assert.deepEqual(await recognition(), []);
    assert.equal((await call('PUT', `/team/outcomes/${monthly.id}`, saveBody(monthly, { submit: true }))).status, 400);
    const foreign = randomUUID(); await db.query('INSERT INTO responsibility_scopes VALUES($1,$2,$3)', [foreign, ids.project, 'Чужая область']);
    assert.equal((await call('GET', `/team/outcomes?responsibilityScopeId=${foreign}`, undefined, admin)).status, 403);
  });

  await t.test('concurrent drafts use versions, submission retries grant exactly one crown and submitted reports are immutable', async () => {
    const outcomes = await Promise.all([call('PUT', `/team/outcomes/${weekly.id}`, saveBody(weekly, { done: 'Первый вариант' })), call('PUT', `/team/outcomes/${weekly.id}`, saveBody(weekly, { done: 'Второй вариант' }))]);
    assert.deepEqual(outcomes.map(row => row.status).sort(), [200, 409]);
    weekly = await detail(weekly.id);
    const body = saveBody(weekly, { submit: true, gratitude: [{ recipientId: employeeId, reason: 'За помощь в завершении задачи' }] });
    const results = await Promise.all([call('PUT', `/team/outcomes/${weekly.id}`, body), call('PUT', `/team/outcomes/${weekly.id}`, body)]);
    submitted = ok(results[0]); assert.deepEqual(ok(results[1]), submitted);
    assert.equal(submitted.status, 'submitted'); assert.equal(submitted.canEdit, false);
    assert.deepEqual(await recognition(), [{ userId: employeeId, count: 1 }]);
    assert.equal((await call('PUT', `/team/outcomes/${weekly.id}`, { ...body, done: 'Подмена' })).status, 409);
    assert.equal((await call('PUT', `/team/outcomes/${weekly.id}`, saveBody(submitted))).status, 409);
    assert.equal((await detail(weekly.id, top)).done, submitted.done);
    await f.restartApi();
    assert.deepEqual(ok(await call('PUT', `/team/outcomes/${weekly.id}`, body)), submitted);
    assert.deepEqual(await recognition(), [{ userId: employeeId, count: 1 }]);
    await assert.rejects(db.query("UPDATE team_outcome_reports SET done='forbidden' WHERE id=$1", [weekly.id]), error => error.code === '23514');
    await assert.rejects(db.query("INSERT INTO team_outcome_recognition(report_id,recipient_id,legal_entity_id,region_id,project_id,responsibility_scope_id,reason) VALUES($1,$2,$3,$4,$5,$6,'late forged')", [weekly.id, outsiderId, ...scopeTuple]), error => error.code === '23514');
  });

  await t.test('late monthly submission is explicit and raises recognition once for that distinct report', async () => {
    const actor = await identity.actorByToken(createHash('sha256').update(manager.accessToken).digest('hex'));
    const clocked = new TeamOutcomesService(applicationDb, team);
    clocked.now = () => new Date(monthly.dueAt);
    assert.equal((await clocked.detail(actor, monthly.id, ids.scope)).status, 'pending', 'the last millisecond of the due day remains on time');
    clocked.now = () => new Date(new Date(monthly.dueAt).getTime() + 1);
    assert.equal((await clocked.detail(actor, monthly.id, ids.scope)).status, 'overdue');
    const result = await clocked.save(actor, monthly.id, saveBody(monthly, { submit: true, nextMonthFocus: 'Улучшить согласование', gratitude: [{ recipientId: employeeId, reason: 'За результаты месяца' }] }), randomUUID());
    assert.equal(result.late, true);
    assert.deepEqual(await recognition(), [{ userId: employeeId, count: 2 }]);
  });

  await t.test('current hierarchy gates submitted reports while dismissed-manager assignments and old periods remain durable', async () => {
    await db.query('UPDATE team_organization_employees SET manager_id=$2 WHERE responsibility_scope_id=$3 AND user_id=$1', [managerId, outsiderId, ids.scope]);
    assert.equal((await call('GET', scoped(`/team/outcomes/${weekly.id}`), undefined, top)).status, 404);
    assert.equal((await detail(weekly.id, outsider)).done, submitted.done);
    await db.query('UPDATE team_organization_employees SET manager_id=$2 WHERE responsibility_scope_id=$3 AND user_id=$1', [employeeId, outsiderId, ids.scope]);
    const oldTop = (await list('weekly', admin)).reports.find(row => row.ownerId === topId);
    assert.ok(oldTop && oldTop.status !== 'submitted', 'unsubmitted assignment remains after losing every subordinate');
    await worker.tick(new Date(Date.now() + 8 * 86400000));
    assert.equal((await db.query('SELECT id FROM team_outcome_reports WHERE id=$1', [oldTop.id])).rowCount, 1);
    await db.query('UPDATE users SET active=false WHERE id=$1', [topId]);
    assert.ok((await list('weekly', admin)).reports.some(row => row.id === oldTop.id));
  });

  await t.test('drivers, external accounts, revoked grants and revoked impersonation parents cannot read or submit', async () => {
    const child = ok(await call('POST', '/auth/impersonate', { userId: outsiderId }, admin));
    const own = (await list('weekly', outsider)).reports.find(row => row.ownerId === outsiderId);
    assert.ok(own);
    assert.equal((await call('PUT', `/team/outcomes/${own.id}`, saveBody(own), child)).status, 403);
    await db.query('UPDATE sessions SET revoked_at=clock_timestamp() WHERE user_id=$1 AND impersonation_parent_session_id IS NULL', [ids.admin]);
    assert.equal((await call('GET', scoped('/team/outcomes'), undefined, child)).status, 401);
    await db.query('DELETE FROM access_grants WHERE user_id=$1 AND responsibility_scope_id=$2', [managerId, ids.scope]);
    assert.equal((await call('GET', scoped(`/team/outcomes/${weekly.id}`))).status, 403);
    for (const role of ['driver', 'external_recruiter']) {
      const id = randomUUID(); await db.query('INSERT INTO users(id,display_name,role,active,approved) VALUES($1,$2,$3,true,true)', [id, 'Недопустимая роль', role]);
      await db.query('INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id) VALUES($1,$2,$3,$4,$5)', [id, ...scopeTuple]);
      const session = await f.devLogin(id);
      assert.equal((await call('GET', scoped('/team/outcomes'), undefined, session)).status, 403);
      assert.equal((await call('GET', scoped('/team/recognition'), undefined, session)).status, 403);
    }
  });
});
