"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createTestServer } = require('./local-test-server.cjs');

test('recruitment stores protected candidate, demand, application and reminder records through PostgreSQL and HTTP', { timeout: 180_000 }, async t => {
  const fixture = await createTestServer();
  t.after(() => fixture.close());
  const { request, devLogin, adminPool: db, ids } = fixture;
  const owned = [ids.legal, ids.region, ids.project, ids.scope];
  const other = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  const peerScope = randomUUID();
  await db.query('INSERT INTO legal_entities VALUES($1,$2)', [other[0], 'Synthetic recruiting company']);
  await db.query('INSERT INTO regions VALUES($1,$2,$3)', [other[1], 'Synthetic recruiting region', 'Asia/Yekaterinburg']);
  await db.query('INSERT INTO projects VALUES($1,$2,$3,$4)', [other[2], 'Synthetic recruiting project', other[0], other[1]]);
  await db.query('INSERT INTO responsibility_scopes VALUES($1,$2,$3)', [other[3], other[2], 'Synthetic foreign recruiting scope']);
  await db.query('INSERT INTO responsibility_scopes VALUES($1,$2,$3)', [peerScope, other[2], 'Synthetic foreign company peer scope']);
  async function grant(id, scope = owned, personalData = true) {
    await db.query(`INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id,personal_data_visible)
      VALUES($1,$2,$3,$4,$5,$6)`, [id, ...scope, personalData]);
  }
  async function employee(role, scope = owned, options = {}) {
    const id = randomUUID();
    await db.query('INSERT INTO users(id,display_name,role,active,approved) VALUES($1,$2,$3,$4,$5)', [id, `Synthetic recruiter ${id}`, role, options.active ?? true, options.approved ?? true]);
    if (scope) await grant(id, scope, options.personalData ?? true);
    return id;
  }
  function expect(response, status) {
    assert.equal(response.status, status, `Expected HTTP ${status}, got ${response.status}: ${JSON.stringify(response.body)}`);
    return response.body;
  }
  const managerId = await employee('manager');
  const secondId = await employee('manager');
  const foreignId = await employee('manager', other);
  const manager = await devLogin(managerId);
  const second = await devLogin(secondId);
  const foreign = await devLogin(foreignId);
  const unprivilegedId = await employee('manager', owned, { personalData: false });
  const unprivileged = await devLogin(unprivilegedId);
  const ineligible = [foreignId, unprivilegedId, await employee('manager', [other[0], other[1], other[2], peerScope]), await employee('driver'), await employee('manager', owned, { active: false }), await employee('manager', owned, { approved: false })];
  const scopeQuery = (scope = ids.scope) => `/recruitment?responsibilityScopeId=${scope}`;
  const put = (kind, body, token = manager.accessToken) => request('PUT', `/recruitment/${kind}`, body, token);
  const snapshot = async (scope = ids.scope, token = manager.accessToken) => expect(await request('GET', scopeQuery(scope), undefined, token), 200);
  let phoneSequence = 1000000;
  const candidateInput = (patch = {}) => ({ id: randomUUID(), responsibilityScopeId: ids.scope, version: 0, fullName: 'Синтетический Кандидат', phone: `+7999${++phoneSequence}`, city: 'Москва', kind: 'driver', recruiterId: managerId, source: 'manual', archived: false, ...patch });
  const requestInput = (patch = {}) => ({ id: randomUUID(), responsibilityScopeId: ids.scope, version: 0, title: 'Водитель: синтетическая потребность', city: 'Москва', kind: 'driver', quantity: 3, priority: 'normal', status: 'open', recruiterId: managerId, ...patch });
  const applicationInput = (patch = {}) => ({ id: randomUUID(), responsibilityScopeId: ids.scope, version: 0, candidateId: candidate.id, requestId: demand.id, recruiterId: managerId, stage: 'new', ...patch });
  const taskInput = (patch = {}) => ({ id: randomUUID(), responsibilityScopeId: ids.scope, version: 0, candidateId: candidate.id, title: 'Позвонить синтетическому кандидату', dueAt: new Date(Date.now() - 60_000).toISOString(), assigneeId: managerId, status: 'open', ...patch });
  let candidate, demand, application, task, foreignCandidate, foreignDemand;
  const sensitiveName = 'Синтетический Секретный Кандидат';
  const sensitiveNote = 'SYNTHETIC_PRIVATE_RECRUITMENT_NOTE';

  await t.test('requires an eligible current actor with a personal-data company grant', async () => {
    for (const route of ['/recruitment/context', scopeQuery(), '/recruitment/reminders']) expect(await request('GET', route), 401);
    for (const kind of ['candidates', 'requests', 'applications', 'tasks']) expect(await request('PUT', `/recruitment/${kind}`, {}), 401);
    for (const role of ['driver', 'document_specialist', 'mechanic', 'auditor']) {
      const login = await devLogin(await employee(role));
      expect(await request('GET', '/recruitment/context', undefined, login.accessToken), 403);
      expect(await request('GET', scopeQuery(), undefined, login.accessToken), 403);
      expect(await request('GET', '/recruitment/reminders', undefined, login.accessToken), 403);
    }
    assert.deepEqual(expect(await request('GET', '/recruitment/context', undefined, unprivileged.accessToken), 200).scopes, []);
    expect(await request('GET', scopeQuery(), undefined, unprivileged.accessToken), 403);
    expect(await request('GET', scopeQuery(peerScope), undefined, manager.accessToken), 403);
    expect(await request('GET', scopeQuery(other[3]), undefined, manager.accessToken), 403);
    expect(await request('GET', scopeQuery(), undefined, foreign.accessToken), 403);
    const context = expect(await request('GET', '/recruitment/context', undefined, manager.accessToken), 200);
    assert.equal(context.scopes.length, 1);
    assert.equal(context.scopes[0].responsibilityScopeId, ids.scope);
    assert.equal(context.scopes[0].projectId, ids.project);
    assert.equal(context.scopes[0].timeZone, 'Europe/Moscow');
    const result = await snapshot();
    for (const collection of ['candidates', 'requests', 'applications', 'tasks', 'events']) assert.deepEqual(result[collection], []);
    assert.deepEqual(result.integrations, { hh: 'external_links', oneC: 'not_connected', messengers: 'not_connected' });
    assert.ok(result.recruiters.some(item => item.id === managerId));
    assert.ok(result.recruiters.some(item => item.id === secondId));
    for (const id of ineligible) assert.ok(!result.recruiters.some(item => item.id === id));
    for (const recruiter of result.recruiters) assert.deepEqual(Object.keys(recruiter).sort(), ['id', 'name']);
    const response = await fetch(`${fixture.origin}/api/v1${scopeQuery()}`, { headers: { Authorization: `Bearer ${manager.accessToken}` } });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('cache-control') || '', /no-store/i);
  });
  await t.test('creates normalized candidates and demand cards, preserving fields across server restarts', async () => {
    candidate = expect(await put('candidates', candidateInput({ fullName: sensitiveName, phone: '8 (999) 123-45-67', district: 'Северный', licenseCategories: 'B, C', experience: 'Три года', notes: sensitiveNote, hhUrl: 'https://hh.ru/resume/synthetic-only' })), 200);
    assert.equal(candidate.version, 1);
    assert.equal(candidate.phone, '+79991234567');
    assert.equal(candidate.fullName, sensitiveName);
    assert.equal(candidate.district, 'Северный');
    assert.ok(Number.isFinite(Date.parse(candidate.createdAt)));
    demand = expect(await put('requests', requestInput({ neededBy: '2026-10-01', payTerms: 'Синтетический тариф за смену', schedule: '5/2', vehicleRequirements: 'Категория C', notes: sensitiveNote })), 200);
    assert.equal(demand.version, 1);
    assert.equal(demand.quantity, 3);
    assert.equal(demand.neededBy, '2026-10-01');
    const before = await snapshot();
    assert.deepEqual(before.candidates.find(item => item.id === candidate.id), candidate);
    assert.deepEqual(before.requests.find(item => item.id === demand.id), demand);
    await fixture.restartApi();
    assert.deepEqual(await snapshot(), before);
    assert.deepEqual((await snapshot(ids.scope, second.accessToken)).candidates[0], candidate);
    foreignCandidate = expect(await put('candidates', candidateInput({ responsibilityScopeId: other[3], recruiterId: foreignId, phone: candidate.phone }), foreign.accessToken), 200);
    foreignDemand = expect(await put('requests', requestInput({ responsibilityScopeId: other[3], recruiterId: foreignId }), foreign.accessToken), 200);
    assert.ok(!(await snapshot()).candidates.some(item => item.id === foreignCandidate.id));
    assert.equal((await snapshot(other[3], foreign.accessToken)).candidates[0].id, foreignCandidate.id);
  });
  await t.test('validates identity, recruiter eligibility, dates and safe hh links before writes', async () => {
    for (const patch of [{ phone: 'wrong' }, { fullName: '' }, { city: '' }, { kind: 'truck' }, { source: 'unknown' }, { archived: 'yes' }, { id: 'not-a-uuid' }]) {
      expect(await put('candidates', candidateInput(patch)), 400);
    }
    for (const id of ineligible) {
      expect(await put('candidates', candidateInput({ recruiterId: id })), 400);
      expect(await put('requests', requestInput({ recruiterId: id })), 400);
    }
    for (const hhUrl of ['javascript:alert(1)', 'http://hh.ru/vacancy/1', 'https://hh.ru.evil.example/vacancy/1', 'https://hh.ru@evil.example/', 'https://evil.example/?next=https://hh.ru', 'https://hh.ru:8443/vacancy/1']) {
      expect(await put('candidates', candidateInput({ hhUrl })), 400);
      expect(await put('requests', requestInput({ hhUrl })), 400);
    }
    for (const patch of [{ quantity: 0 }, { quantity: 1.5 }, { quantity: 10001 }, { status: 'hired' }, { neededBy: '2026-02-30' }, { priority: 'invalid' }, { publishedAt: 'not-a-date' }, { publishedAt: '2000-01-01T00:00:00.000Z' }]) {
      expect(await put('requests', requestInput(patch)), 400);
    }
    expect(await request('GET', scopeQuery('invalid'), undefined, manager.accessToken), 400);
    expect(await put('candidates', candidateInput({ responsibilityScopeId: other[3] })), 403);
    demand = expect(await put('requests', { ...demand, hhUrl: 'https://hh.ru/vacancy/123456', publishedAt: new Date().toISOString() }), 200);
    assert.equal(demand.version, 2);
    assert.equal(demand.hhUrl, 'https://hh.ru/vacancy/123456');
  });
  await t.test('retains incomplete source rows while requiring real quantities and cities before opening them', async () => {
    let paused = expect(await put('requests', requestInput({ status: 'paused', quantity: null, city: '', sourceDetails: 'Untrusted initial source' })), 200);
    assert.equal(paused.quantity, null);
    assert.equal(paused.city, '');
    assert.equal(paused.sourceDetails, '');
    const closed = expect(await put('requests', requestInput({ status: 'closed', quantity: 0, city: '' })), 200);
    assert.equal(closed.quantity, 0);
    const sourceDetails = 'Проекты, строка 17\nИсходное описание: ' + 'Подробности без сокращения. '.repeat(200);
    await db.query('UPDATE recruitment_requests SET source_details=$2 WHERE id=$1', [paused.id, sourceDetails]);
    assert.equal((await snapshot()).requests.find(row => row.id === paused.id).sourceDetails, sourceDetails);
    paused = expect(await put('requests', { ...paused, title: 'Уточнённое название', sourceDetails: 'Untrusted replacement' }), 200);
    assert.equal(paused.sourceDetails, sourceDetails);
    const { sourceDetails: omitted, ...ordinaryEdit } = paused;
    paused = expect(await put('requests', { ...ordinaryEdit, notes: 'Рабочая заметка' }), 200);
    assert.equal(paused.sourceDetails, sourceDetails);
    for (const patch of [{ status: 'open' }, { status: 'open', quantity: 0, city: 'Москва' }, { status: 'open', quantity: 2 }]) {
      expect(await put('requests', { ...paused, ...patch }), 400);
    }
    assert.deepEqual((await snapshot()).requests.find(row => row.id === paused.id), paused);
    for (const [quantity, city] of [[null, 'Москва'], [0, 'Москва'], [2, '']]) {
      await assert.rejects(db.query("UPDATE recruitment_requests SET status='open',quantity=$2,city=$3 WHERE id=$1", [paused.id, quantity, city]), error => error.code === '23514');
    }
    await assert.rejects(db.query('UPDATE recruitment_requests SET source_details=$2 WHERE id=$1', [paused.id, 'x'.repeat(100001)]), error => error.code === '23514');
    assert.equal((await db.query("SELECT has_column_privilege('transport_app','recruitment_requests','source_details','UPDATE') AS allowed")).rows[0].allowed, false);
    paused = expect(await put('requests', { ...paused, status: 'open', quantity: 2, city: 'Москва' }), 200);
    assert.equal(paused.status, 'open');
    assert.equal(paused.quantity, 2);
    assert.equal(paused.sourceDetails, sourceDetails);
  });
  await t.test('phone uniqueness and optimistic versions prevent duplicate and lost concurrent writes', async () => {
    for (const phone of ['89991234567', '9991234567', '+7 999 123 45 67']) {
      const error = expect(await put('candidates', candidateInput({ phone })), 409);
      assert.ok(/RECRUITMENT_/.test(JSON.stringify(error)), 'Conflict retains an actionable recruiting error code');
      assert.ok(/[А-Яа-яЁё]/.test(JSON.stringify(error)), 'Conflict includes a Russian explanation');
    }
    const phone = '+79991112233';
    const duplicates = await Promise.all([put('candidates', candidateInput({ phone })), put('candidates', candidateInput({ phone }), second.accessToken)]);
    assert.deepEqual(duplicates.map(item => item.status).sort(), [200, 409]);
    assert.equal((await snapshot()).candidates.filter(item => item.phone === phone).length, 1);
    const before = candidate;
    const writes = await Promise.all([put('candidates', { ...before, district: 'Западный' }), put('candidates', { ...before, district: 'Восточный' }, second.accessToken)]);
    assert.deepEqual(writes.map(item => item.status).sort(), [200, 409]);
    candidate = writes.find(item => item.status === 200).body;
    assert.equal(candidate.version, before.version + 1);
    assert.deepEqual((await snapshot()).candidates.find(item => item.id === candidate.id), candidate);
    expect(await put('candidates', before), 409);
    const existing = demand;
    demand = expect(await put('requests', { ...existing, quantity: 4 }, second.accessToken), 200);
    expect(await put('requests', { ...existing, quantity: 5 }), 409);
    assert.equal((await snapshot()).requests.find(item => item.id === demand.id).quantity, 4);
  });
  await t.test('validates application relationships and retains immutable stage history', async () => {
    for (const patch of [{ candidateId: foreignCandidate.id }, { requestId: foreignDemand.id }, { candidateId: randomUUID() }, { requestId: randomUUID() }, { stage: 'invalid' }, { stage: 'rejected' }, { stage: 'hired' }, { stage: 'hired', startDate: '2026-02-30' }, { recruiterId: ineligible[0] }]) {
      expect(await put('applications', applicationInput(patch)), 400);
    }
    const carrier = expect(await put('candidates', candidateInput({ kind: 'carrier', vehicleType: 'Фургон', vehicleDimensions: '4 × 2 × 2 м', vehicleCapacity: '1,5 т' })), 200);
    expect(await put('applications', applicationInput({ candidateId: carrier.id })), 400);
    application = expect(await put('applications', applicationInput()), 200);
    assert.equal(application.version, 1);
    expect(await put('applications', applicationInput()), 409);
    const initialEvents = (await snapshot()).events.filter(item => item.applicationId === application.id);
    assert.equal(initialEvents.length, 1);
    assert.equal(initialEvents[0].fromStage, null);
    assert.equal(initialEvents[0].toStage, 'new');
    assert.equal(initialEvents[0].actorId, managerId);
    const alternative = expect(await put('requests', requestInput({ title: 'Другая синтетическая потребность' })), 200);
    expect(await put('applications', { ...application, requestId: alternative.id }), 400);
    expect(await put('applications', { ...application, candidateId: carrier.id }), 400);
    const original = application;
    application = expect(await put('applications', { ...application, stage: 'interview' }), 200);
    expect(await put('applications', { ...original, stage: 'contact' }, second.accessToken), 409);
    application = expect(await put('applications', { ...application, reason: 'Синтетическое пояснение' }), 200);
    assert.equal((await snapshot()).events.filter(item => item.applicationId === application.id).length, 2);
    application = expect(await put('applications', { ...application, stage: 'hired', startDate: '2026-09-17' }), 200);
    assert.equal(application.startDate, '2026-09-17');
    const events = (await snapshot()).events.filter(item => item.applicationId === application.id).sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));
    assert.deepEqual(events.map(item => [item.fromStage, item.toStage]), [[null, 'new'], ['new', 'interview'], ['interview', 'hired']]);
    assert.deepEqual(events[0], initialEvents[0]);
    const refused = expect(await put('applications', applicationInput({ requestId: alternative.id, stage: 'rejected', reason: 'Синтетический отказ' })), 200);
    assert.equal(refused.reason, 'Синтетический отказ');
    demand = expect(await put('requests', { ...demand, status: 'closed' }), 200);
    const nextCandidate = expect(await put('candidates', candidateInput()), 200);
    expect(await put('applications', applicationInput({ candidateId: nextCandidate.id })), 400);
    application = expect(await put('applications', { ...application, stage: 'reserve' }), 200);
    assert.equal(application.stage, 'reserve');
    assert.equal((await snapshot()).requests.find(item => item.id === demand.id).quantity, 4);
  });
  await t.test('full stage history remains readable and rejects extra events atomically while allowing other edits', async () => {
    const capacityScope = randomUUID();
    const capacityTuple = [ids.legal, ids.region, ids.project, capacityScope];
    await db.query('INSERT INTO responsibility_scopes VALUES($1,$2,$3)', [capacityScope, ids.project, 'Synthetic event-cap scope']);
    await grant(managerId, capacityTuple);
    const capCandidate = expect(await put('candidates', candidateInput({ responsibilityScopeId: capacityScope })), 200);
    const capDemand = expect(await put('requests', requestInput({ responsibilityScopeId: capacityScope })), 200);
    let capApplication = expect(await put('applications', applicationInput({ responsibilityScopeId: capacityScope, candidateId: capCandidate.id, requestId: capDemand.id })), 200);
    const nextCandidate = expect(await put('candidates', candidateInput({ responsibilityScopeId: capacityScope })), 200);
    const initialHistory = (await snapshot(capacityScope)).events;
    assert.equal(initialHistory.length, 1);
    try {
      await db.query(`INSERT INTO recruitment_events(id,legal_entity_id,region_id,project_id,responsibility_scope_id,application_id,from_stage,to_stage,occurred_at,actor_id)
        SELECT gen_random_uuid(),$1,$2,$3,$4,$5,'new','contact','2001-01-01T00:00:00Z',$6 FROM generate_series(1,49999)`, [...capacityTuple, capApplication.id, managerId]);
      expect(await put('applications', { ...capApplication, stage: 'interview', reason: 'Must not be stored on failed write' }), 400);
      const refusedNewId = randomUUID();
      expect(await put('applications', applicationInput({ id: refusedNewId, responsibilityScopeId: capacityScope, candidateId: nextCandidate.id, requestId: capDemand.id })), 400);
      const unchanged = await snapshot(capacityScope);
      assert.equal(unchanged.events.length, 50000);
      assert.deepEqual(unchanged.applications.find(item => item.id === capApplication.id), capApplication);
      assert.ok(!unchanged.applications.some(item => item.id === refusedNewId));
      assert.equal(Number((await db.query("SELECT count(*) AS count FROM audit_events WHERE payload->>'entityId'=$1", [capApplication.id])).rows[0].count), 1);
      capApplication = expect(await put('applications', { ...capApplication, reason: 'Комментарий без изменения этапа' }), 200);
      assert.equal(capApplication.version, 2);
      const updated = await snapshot(capacityScope);
      assert.equal(updated.events.length, 50000);
      assert.deepEqual(updated.applications.find(item => item.id === capApplication.id), capApplication);
    } finally {
      await db.query("DELETE FROM recruitment_events WHERE responsibility_scope_id=$1 AND occurred_at='2001-01-01T00:00:00Z'", [capacityScope]);
    }
    assert.deepEqual((await snapshot(capacityScope)).events, initialHistory);
    await db.query('DELETE FROM access_grants WHERE user_id=$1 AND responsibility_scope_id=$2', [managerId, capacityScope]);
  });
  await t.test('reminders are durable, assigned, due and strictly scoped with completion and reopening', async () => {
    for (const patch of [{ candidateId: foreignCandidate.id }, { candidateId: randomUUID() }, { assigneeId: ineligible[0] }, { dueAt: 'not-a-date' }, { title: '' }, { status: 'invalid' }]) expect(await put('tasks', taskInput(patch)), 400);
    task = expect(await put('tasks', taskInput({ notes: sensitiveNote })), 200);
    const assignedElsewhere = expect(await put('tasks', taskInput({ assigneeId: secondId })), 200);
    const future = expect(await put('tasks', taskInput({ dueAt: new Date(Date.now() + 3_600_000).toISOString() })), 200);
    const foreignTask = expect(await put('tasks', taskInput({ responsibilityScopeId: other[3], candidateId: foreignCandidate.id, assigneeId: foreignId }), foreign.accessToken), 200);
    const due = async (token = manager.accessToken) => expect(await request('GET', '/recruitment/reminders', undefined, token), 200);
    const initial = await due();
    assert.ok(Number.isFinite(Date.parse(initial.serverTime)));
    assert.deepEqual(initial.tasks.map(item => item.id), [task.id]);
    assert.equal(initial.tasks[0].candidateName, sensitiveName);
    assert.ok(initial.tasks[0].scopeName);
    assert.ok(!initial.tasks.some(item => [assignedElsewhere.id, future.id, foreignTask.id].includes(item.id)));
    assert.deepEqual((await due(second.accessToken)).tasks.map(item => item.id), [assignedElsewhere.id]);
    assert.deepEqual((await due(foreign.accessToken)).tasks.map(item => item.id), [foreignTask.id]);
    assert.deepEqual((await due(unprivileged.accessToken)).tasks, []);
    await fixture.restartApi();
    assert.deepEqual((await due()).tasks, initial.tasks);
    const open = task;
    task = expect(await put('tasks', { ...task, status: 'done' }), 200);
    assert.ok(Number.isFinite(Date.parse(task.completedAt)));
    assert.deepEqual((await due()).tasks, []);
    expect(await put('tasks', { ...open, status: 'done' }), 409);
    task = expect(await put('tasks', { ...task, status: 'open' }), 200);
    assert.equal(task.completedAt, null);
    assert.deepEqual((await due()).tasks.map(item => item.id), [task.id]);
    await grant(managerId, other);
    const crossScopeAssigned = expect(await put('tasks', taskInput({ responsibilityScopeId: other[3], candidateId: foreignCandidate.id, assigneeId: managerId }), foreign.accessToken), 200);
    assert.deepEqual((await due()).tasks.map(item => item.id).sort(), [task.id, crossScopeAssigned.id].sort());
    await db.query('DELETE FROM access_grants WHERE user_id=$1 AND responsibility_scope_id=$2', [managerId, other[3]]);
    assert.deepEqual((await due()).tasks.map(item => item.id), [task.id]);
  });
  await t.test('audit records retain attribution without copying candidate PII or triggering external sends', async () => {
    const idsToCheck = [candidate.id, demand.id, application.id, task.id];
    const rows = (await db.query("SELECT payload FROM audit_events WHERE payload->>'entityId'=ANY($1::text[])", [idsToCheck])).rows;
    assert.ok(rows.length >= 12);
    assert.ok(rows.some(row => row.payload.actorId === managerId));
    assert.ok(rows.some(row => row.payload.actorId === secondId));
    for (const row of rows) {
      assert.equal(row.payload.scope.responsibilityScopeId, ids.scope);
      assert.match(row.payload.action, /^recruitment\./);
    }
    const serialized = JSON.stringify(rows);
    for (const privateValue of [sensitiveName, sensitiveNote, candidate.phone, 'Синтетическое пояснение', 'Синтетический отказ']) assert.ok(!serialized.includes(privateValue), `Audit leaked ${privateValue}`);
    assert.equal(Number((await db.query('SELECT count(*) AS count FROM telegram_deliveries')).rows[0].count), 0);
  });
  await t.test('revoked grants, sessions and role eligibility immediately remove access without admin bypass', async () => {
    await db.query('UPDATE access_grants SET personal_data_visible=false WHERE user_id=$1', [managerId]);
    expect(await request('GET', scopeQuery(), undefined, manager.accessToken), 403);
    expect(await put('candidates', candidate), 403);
    expect(await put('requests', demand), 403);
    expect(await put('applications', application), 403);
    expect(await put('tasks', task), 403);
    assert.deepEqual(expect(await request('GET', '/recruitment/reminders', undefined, manager.accessToken), 200).tasks, []);
    await db.query('UPDATE sessions SET revoked_at=clock_timestamp() WHERE user_id=$1', [secondId]);
    for (const route of ['/recruitment/context', scopeQuery(), '/recruitment/reminders']) expect(await request('GET', route, undefined, second.accessToken), 401);
    const admin = await devLogin(ids.admin);
    expect(await request('GET', scopeQuery(), undefined, admin.accessToken), 403);
    await db.query('UPDATE access_grants SET personal_data_visible=true WHERE user_id=$1', [ids.admin]);
    assert.ok((await snapshot(ids.scope, admin.accessToken)).candidates.some(item => item.id === candidate.id));
    await db.query('UPDATE access_grants SET personal_data_visible=true WHERE user_id=$1', [ids.dispatcher]);
    const dispatcher = await devLogin(ids.dispatcher);
    assert.ok((await snapshot(ids.scope, dispatcher.accessToken)).candidates.some(item => item.id === candidate.id));
    await db.query('UPDATE users SET active=false WHERE id=$1', [foreignId]);
    expect(await request('GET', scopeQuery(other[3]), undefined, foreign.accessToken), 401);
    expect(await request('GET', '/recruitment/reminders', undefined, foreign.accessToken), 401);
  });
});
