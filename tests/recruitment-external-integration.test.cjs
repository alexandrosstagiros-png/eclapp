'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createTestServer } = require('./local-test-server.cjs');

test('external recruiting enforces allowlists and durable factual activity', { timeout: 180_000 }, async t => {
  const fixture = await createTestServer();
  t.after(() => fixture.close());
  const { request, devLogin, adminPool: db, ids } = fixture;
  const scope = [ids.legal, ids.region, ids.project, ids.scope];
  const peerScope = randomUUID(), peerLegal = randomUUID(), peerProject = randomUUID();
  await db.query('INSERT INTO legal_entities VALUES($1,$2)', [peerLegal, 'Other company']);
  await db.query('INSERT INTO projects VALUES($1,$2,$3,$4)', [peerProject, 'Other company project', peerLegal, ids.region]);
  await db.query('INSERT INTO responsibility_scopes VALUES($1,$2,$3)', [peerScope, peerProject, 'Unshared company scope']);
  const expect = (result, status = 200) => {
    assert.equal(result.status, status, JSON.stringify(result.body));
    return result.body;
  };
  async function employee(role, scoped = true) {
    const id = randomUUID();
    await db.query('INSERT INTO users(id,display_name,role,active,approved) VALUES($1,$2,$3,true,true)', [id, `Synthetic ${role} ${id}`, role]);
    if (scoped) await db.query(`INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id,personal_data_visible)
      VALUES($1,$2,$3,$4,$5,true)`, [id, ...scope]);
    return { id, ...(await devLogin(id)) };
  }
  const manager = await employee('manager');
  const staff = await employee('recruiter');
  const external = await employee('external_recruiter');
  const second = await employee('external_recruiter');
  const observer = await employee('external_recruiter');
  const outOfScope = await employee('external_recruiter', false);
  const get = (route, user = manager) => request('GET', route, undefined, user.accessToken);
  const put = (kind, body, user = manager) => request('PUT', `/recruitment/${kind}`, body, user.accessToken);
  const post = (kind, body, user = external) => request('POST', `/recruitment/${kind}`, body, user.accessToken);
  const url = '/recruitment?responsibilityScopeId=' + ids.scope;
  const accessUrl = '/recruitment/access?responsibilityScopeId=' + ids.scope;
  const activityUrl = '/recruitment/activity?responsibilityScopeId=' + ids.scope;
  const view = id => ({ responsibilityScopeId: ids.scope, requestId: id });
  const demandBody = (patch = {}) => ({ id: randomUUID(), responsibilityScopeId: ids.scope, version: 0, title: 'Public demand', city: 'Москва', kind: 'driver', quantity: 2, priority: 'normal', status: 'open', recruiterId: manager.id, notes: 'INTERNAL_SECRET', publicBrief: 'Опубликованная информация', warehouseAddress: 'Адрес склада', routeInfo: '100 км дом — дом', trainingTerms: 'Обучение 2 дня', driverRequirements: 'Категория B', ...patch });
  let nextPhone = 9100000;
  const candidateBody = (owner = external, patch = {}) => ({ id: randomUUID(), responsibilityScopeId: ids.scope, version: 0, fullName: 'Synthetic Candidate', phone: `+7999${++nextPhone}`, city: 'Москва', kind: 'driver', recruiterId: owner.id, source: 'manual', ...patch });
  const demand = expect(await put('requests', demandBody()));
  await db.query('UPDATE recruitment_requests SET source_details=$2 WHERE id=$1', [demand.id, 'PRIVATE_ORIGINAL_COMPANY_SOURCE']);
  const hiddenDemand = expect(await put('requests', demandBody({ title: 'SECRET_NEED' })));
  let own, ownApp, ownTask, access;
  async function setAccess(user, requestIds, patch = {}) {
    return put('access', { responsibilityScopeId: ids.scope, userId: user.id, requestIds, status: 'active', expiresAt: null, version: 0, ...patch });
  }
  await t.test('scope grant alone denies everything; only management can explicitly assign needs', async () => {
    assert.deepEqual(expect(await get('/recruitment/context', external)).scopes, []);
    expect(await get(url, external), 403);
    expect(await put('candidates', candidateBody(), external), 403);
    expect(await post('visits', { responsibilityScopeId: ids.scope }), 403);
    for (const user of [external, staff]) {
      expect(await get(accessUrl, user), 403);
      expect(await get(activityUrl, user), 403);
      expect(await put('access', { responsibilityScopeId: ids.scope, userId: external.id, requestIds: [demand.id], status: 'active', version: 0 }, user), 403);
    }
    expect(await get('/recruitment/access?responsibilityScopeId=' + peerScope), 403);
    expect(await setAccess(outOfScope, [demand.id]), 403);
    expect(await setAccess(external, [randomUUID()]), 403);
    access = expect(await setAccess(external, [demand.id]));
    assert.equal(access.version, 1);
    assert.equal(access.accessState, 'active');
    expect(await setAccess(external, [hiddenDemand.id]), 409);
    expect(await setAccess(second, [hiddenDemand.id]));
    expect(await setAccess(observer, [demand.id]));
    const list = expect(await get(accessUrl));
    assert.ok(list.users.some(user => user.id === external.id));
    assert.ok(!list.users.some(user => user.id === outOfScope.id));
    assert.equal(list.grants.find(grant => grant.userId === external.id).requestIds[0], demand.id);
    const context = expect(await get('/recruitment/context', external));
    assert.equal(context.scopes.length, 1);
    assert.equal(context.scopes[0].accessVersion, access.version);
    assert.equal(context.scopes[0].accessExpiresAt, null);
    assert.ok(!Object.hasOwn(context.scopes[0], 'legalEntityName'));
  });
  await t.test('external reads expose only public approved cards and own recruiting data', async () => {
    assert.equal(expect(await get(url)).requests.find(row => row.id === demand.id).sourceDetails, 'PRIVATE_ORIGINAL_COMPANY_SOURCE');
    const companyCandidate = expect(await put('candidates', candidateBody(manager, { fullName: 'PRIVATE_COMPANY_CANDIDATE' })));
    const secondCandidate = expect(await put('candidates', candidateBody(second), second));
    own = expect(await put('candidates', candidateBody(), external));
    const appBody = patch => ({ id: randomUUID(), responsibilityScopeId: ids.scope, version: 0, candidateId: own.id, requestId: demand.id, recruiterId: external.id, stage: 'new', ...patch });
    expect(await put('applications', appBody({ requestId: hiddenDemand.id }), external), 403);
    expect(await put('applications', appBody({ candidateId: companyCandidate.id }), external), 403);
    expect(await put('applications', appBody({ recruiterId: second.id }), external), 403);
    expect(await put('applications', appBody({ candidateId: companyCandidate.id })), 403);
    ownApp = expect(await put('applications', appBody(), external));
    const taskBody = patch => ({ id: randomUUID(), responsibilityScopeId: ids.scope, version: 0, title: 'Позвонить', candidateId: own.id, assigneeId: external.id, dueAt: new Date(Date.now() - 1000).toISOString(), status: 'open', ...patch });
    expect(await put('tasks', taskBody({ candidateId: secondCandidate.id }), external), 403);
    expect(await put('tasks', taskBody({ assigneeId: second.id }), external), 403);
    expect(await put('tasks', taskBody({ candidateId: companyCandidate.id })), 403);
    ownTask = expect(await put('tasks', taskBody(), external));
    expect(await put('requests', demandBody(), external), 403);
    expect(await put('requests', { ...demand, quantity: 4 }, external), 403);
    expect(await put('candidates', { ...companyCandidate, recruiterId: external.id }, external), 403);
    expect(await put('candidates', candidateBody(manager), external), 403);
    const data = expect(await get(url, external));
    assert.deepEqual(data.requests.map(row => row.id), [demand.id]);
    assert.equal(data.requests[0].publicBrief, demand.publicBrief);
    assert.equal(data.requests[0].warehouseAddress, demand.warehouseAddress);
    assert.ok(!Object.hasOwn(data.requests[0], 'notes'));
    assert.ok(!Object.hasOwn(data.requests[0], 'sourceDetails'));
    assert.ok(!Object.hasOwn(data.requests[0], 'recruiterId'));
    assert.deepEqual(data.candidates.map(row => row.id), [own.id]);
    assert.deepEqual(data.applications.map(row => row.id), [ownApp.id]);
    assert.deepEqual(data.tasks.map(row => row.id), [ownTask.id]);
    assert.deepEqual(data.events.map(row => row.applicationId), [ownApp.id]);
    assert.deepEqual(data.recruiters.map(row => row.id), [external.id]);
    assert.ok(!JSON.stringify(data).includes('INTERNAL_SECRET'));
    assert.ok(!JSON.stringify(data).includes('PRIVATE_ORIGINAL_COMPANY_SOURCE'));
    assert.ok(!JSON.stringify(data).includes('PRIVATE_COMPANY_CANDIDATE'));
    assert.deepEqual(expect(await get('/recruitment/reminders', external)).tasks.map(row => row.id), [ownTask.id]);
  });
  await t.test('cross-scope writes and view events cannot bypass assignment or ownership', async () => {
    await db.query(`INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id,personal_data_visible)
      VALUES($1,$2,$3,$4,$5,true)`, [manager.id, peerLegal, ids.region, peerProject, peerScope]);
    const peerDemand = expect(await put('requests', demandBody({ responsibilityScopeId: peerScope })));
    expect(await setAccess(external, [peerDemand.id], { version: access.version }), 403);
    expect(await get('/recruitment?responsibilityScopeId=' + peerScope, external), 403);
    expect(await put('candidates', candidateBody(external, { responsibilityScopeId: peerScope }), external), 403);
    expect(await post('request-views', view(hiddenDemand.id)), 403);
    expect(await post('request-views', view(peerDemand.id)), 403);
    expect(await post('visits', { responsibilityScopeId: peerScope }), 403);
  });
  await t.test('authoritative events dedupe explicit views, ignore passive reloads and retain true actor attribution', async () => {
    const before = Number((await db.query("SELECT count(*) FROM recruitment_activity WHERE actor_id=$1 AND kind='scope_visit'", [external.id])).rows[0].count);
    for (let i = 0; i < 3; i++) expect(await get(url, external));
    assert.equal(Number((await db.query("SELECT count(*) FROM recruitment_activity WHERE actor_id=$1 AND kind='scope_visit'", [external.id])).rows[0].count), before);
    assert.equal(expect(await post('visits', { responsibilityScopeId: ids.scope }), 201).recorded, true);
    assert.equal(expect(await post('visits', { responsibilityScopeId: ids.scope, occurredAt: '2000-01-01', userId: second.id }), 201).recorded, false);
    assert.equal(expect(await post('request-views', view(demand.id)), 201).recorded, true);
    assert.equal(expect(await post('request-views', view(demand.id)), 201).recorded, false);
    ownApp = expect(await put('applications', { ...ownApp, stage: 'contact' }, external));
    ownApp = expect(await put('applications', { ...ownApp, reason: 'Note only' }, external));
    ownApp = expect(await put('applications', { ...ownApp, stage: 'hired', startDate: '2026-09-20' }, external));
    ownTask = expect(await put('tasks', { ...ownTask, status: 'done' }, external));
    ownTask = expect(await put('tasks', { ...ownTask, status: 'open' }, external));
    ownTask = expect(await put('tasks', { ...ownTask, status: 'done' }, external));
    const report = expect(await get(activityUrl));
    const row = report.rows.find(row => row.userId === external.id);
    assert.equal(row.visits, 1);
    assert.equal(row.dataReads, 1, 'direct reads are server recorded and bucket-deduped');
    assert.equal(row.activeDays, 1);
    assert.equal(row.requestViews, 1);
    assert.equal(row.uniqueRequests, 1);
    assert.equal(row.candidatesAdded, 1);
    assert.equal(row.contactsRecorded, 0);
    assert.equal(row.applicationsAdded, 1);
    assert.equal(row.stageChanges, 2);
    assert.equal(row.progressed, 1);
    assert.equal(row.hired, 1);
    assert.equal(row.completedTasks, 1, 'reopening and recompleting cannot inflate completed task count');
    assert.equal(row.attention.flagged, false);
    const activityBefore = await db.query('SELECT * FROM recruitment_activity WHERE actor_id=$1 ORDER BY occurred_at,id', [external.id]);
    await fixture.restartApi();
    assert.deepEqual((await db.query('SELECT * FROM recruitment_activity WHERE actor_id=$1 ORDER BY occurred_at,id', [external.id])).rows, activityBefore.rows);
    ownApp = expect(await put('applications', { ...ownApp, stage: 'paperwork' }, manager));
    assert.equal(expect(await get(activityUrl)).rows.find(row => row.userId === external.id).stageChanges, 2, 'manager action does not count as recruiter work');
  });
  await t.test('report windows, observation threshold and calendar days use persisted server events', async () => {
    const sessionId = (await db.query('SELECT id FROM sessions WHERE user_id=$1 LIMIT 1', [observer.id])).rows[0].id;
    for (const daysAgo of [8, 6, 4, 2, 0]) await db.query(`INSERT INTO recruitment_activity(id,legal_entity_id,region_id,project_id,responsibility_scope_id,
      actor_id,session_id,kind,entity_id,request_id,dedupe_key,occurred_at) VALUES($1,$2,$3,$4,$5,$6,$7,'request_view',$8,$8,$9,clock_timestamp()-($10::integer*interval '1 day'))`,
      [randomUUID(), ...scope, observer.id, sessionId, demand.id, randomUUID(), daysAgo]);
    const report30 = expect(await get(activityUrl + '&days=30'));
    const row = report30.rows.find(row => row.userId === observer.id);
    assert.equal(row.observedDays, 8);
    assert.equal(row.activeDays, 5);
    assert.equal(row.requestViews, 5);
    assert.equal(row.attention.flagged, true);
    assert.match(row.attention.reason, /проверьте/);
    const report7 = expect(await get(activityUrl + '&days=7')).rows.find(row => row.userId === observer.id);
    assert.equal(report7.activeDays, 4);
    assert.equal(report7.requestViews, 4);
    assert.equal(report7.attention.flagged, false);
    expect(await get(activityUrl + '&days=31'), 400);
    expect(await get(activityUrl + '&days=0'), 400);
    expect(await get(activityUrl + '&days=90'));
    // Candidate creation by a manager must not count as the recruiter's work.
    // The observer's own saved contact is substantive, even without a new
    // application, completed task or stage change.
    const contacted = expect(await put('candidates', candidateBody(observer), manager));
    assert.equal(expect(await get(activityUrl)).rows.find(row => row.userId === observer.id).attention.flagged, true);
    const contactBody = { id: randomUUID(), responsibilityScopeId: ids.scope, candidateId: contacted.id,
      result: 'connected', notes: 'Synthetic contact note', actorId: manager.id };
    for (const saved of await Promise.all([post('contacts', contactBody, observer), post('contacts', contactBody, observer)])) expect(saved, 201);
    expect(await post('contacts', { ...contactBody, notes: 'Changed retry' }, observer), 409);
    const reportAfterContact = expect(await get(activityUrl));
    const afterContact = reportAfterContact.rows.find(row => row.userId === observer.id);
    assert.equal(afterContact.contactsRecorded, 1, 'same contact id and failed retries cannot inflate contact count');
    assert.equal(afterContact.candidatesAdded, 0);
    assert.equal(afterContact.applicationsAdded, 0);
    assert.equal(afterContact.completedTasks, 0);
    assert.equal(afterContact.attention.flagged, false);
    assert.match(reportAfterContact.metricDefinitions.contactsRecorded, /не подтверждает состоявшийся разговор/);
    const contactEvent = (await db.query("SELECT actor_id,entity_id FROM recruitment_activity WHERE kind='contact_recorded' AND entity_id=$1", [contactBody.id])).rows;
    assert.deepEqual(contactEvent, [{ actor_id: observer.id, entity_id: contactBody.id }]);
    assert.equal(Number((await db.query("SELECT count(*) FROM audit_events WHERE payload->>'action'='recruitment.access.updated'")).rows[0].count), 3);
  });
  await t.test('concurrent grant editors cannot overwrite each other and expiry input is validated', async () => {
    const current = expect(await get(accessUrl)).grants.find(row => row.userId === observer.id);
    const parallel = await Promise.all([
      setAccess(observer, [demand.id], { version: current.version }),
      setAccess(observer, [demand.id, hiddenDemand.id], { version: current.version }),
    ]);
    assert.deepEqual(parallel.map(result => result.status).sort(), [200, 409]);
    const updated = parallel.find(result => result.status === 200).body;
    assert.equal(updated.version, current.version + 1);
    assert.deepEqual(expect(await get(accessUrl)).grants.find(row => row.userId === observer.id).requestIds, updated.requestIds);
    expect(await setAccess(observer, [demand.id], { version: updated.version, expiresAt: '2000-01-01T00:00:00Z' }), 400);
    expect(await setAccess(observer, [demand.id], { version: updated.version, expiresAt: 'bad-date' }), 400);
  });
  await t.test('acting-as actions remain uncounted and activity is append-only for the application role', async () => {
    await db.query('UPDATE access_grants SET personal_data_visible=true WHERE user_id=$1', [ids.admin]);
    const admin = await devLogin(ids.admin);
    const child = expect(await request('POST', '/auth/impersonate', { userId: external.id }, admin.accessToken), 200);
    const before = Number((await db.query('SELECT count(*) FROM recruitment_activity WHERE actor_id=$1', [external.id])).rows[0].count);
    expect(await get(url, child));
    assert.equal(expect(await post('visits', { responsibilityScopeId: ids.scope }, child), 201).recorded, false);
    assert.equal(expect(await post('request-views', view(demand.id), child), 201).recorded, false);
    const childCandidate = expect(await put('candidates', candidateBody(), child));
    expect(await put('applications', { id: randomUUID(), responsibilityScopeId: ids.scope, version: 0, candidateId: childCandidate.id, requestId: demand.id, recruiterId: external.id, stage: 'new' }, child));
    expect(await post('contacts', { id: randomUUID(), responsibilityScopeId: ids.scope, candidateId: childCandidate.id,
      result: 'inquiry', source: 'avito' }, child), 201);
    assert.equal(Number((await db.query('SELECT count(*) FROM recruitment_activity WHERE actor_id=$1', [external.id])).rows[0].count), before);
    const privileges = (await db.query("SELECT has_table_privilege('transport_app','recruitment_activity','UPDATE') AS update, has_table_privilege('transport_app','recruitment_activity','DELETE') AS delete")).rows[0];
    assert.equal(privileges.update, false);
    assert.equal(privileges.delete, false);
    const payload = JSON.stringify((await db.query('SELECT * FROM recruitment_activity')).rows);
    assert.ok(!payload.includes('INTERNAL_SECRET'));
    assert.ok(!payload.includes(own.phone));
  });
  await t.test('request removal, expiry, revocation and scope removal immediately deny reads, writes and reminders', async () => {
    access = expect(await setAccess(external, [hiddenDemand.id], { version: access.version }));
    const reduced = expect(await get(url, external));
    assert.deepEqual(reduced.requests.map(row => row.id), [hiddenDemand.id]);
    assert.deepEqual(reduced.candidates, []);
    assert.deepEqual(reduced.applications, []);
    assert.deepEqual(reduced.tasks, []);
    assert.deepEqual(reduced.events, []);
    expect(await put('candidates', { ...own, notes: 'edit' }, external), 403);
    expect(await put('applications', { ...ownApp, stage: 'contact' }, external), 403);
    expect(await put('tasks', { ...ownTask, status: 'open' }, external), 403);
    access = expect(await setAccess(external, [demand.id], { version: access.version }));
    await db.query("UPDATE recruitment_external_access SET expires_at=clock_timestamp()-interval '1 second' WHERE user_id=$1", [external.id]);
    expect(await get(url, external), 403);
    expect(await put('candidates', candidateBody(), external), 403);
    assert.deepEqual(expect(await get('/recruitment/context', external)).scopes, []);
    assert.deepEqual(expect(await get('/recruitment/reminders', external)).tasks, []);
    assert.equal(expect(await get(activityUrl)).rows.find(row => row.userId === external.id).accessState, 'expired');
    access = expect(await setAccess(external, [demand.id], { version: access.version, status: 'revoked' }));
    expect(await get(url, external), 403);
    expect(await post('request-views', view(demand.id)), 403);
    assert.equal(expect(await get(activityUrl)).rows.find(row => row.userId === external.id).accessState, 'revoked');
    access = expect(await setAccess(external, [demand.id], { version: access.version }));
    await db.query('DELETE FROM access_grants WHERE user_id=$1', [external.id]);
    expect(await get(url, external), 403);
    expect(await post('visits', { responsibilityScopeId: ids.scope }), 403);
    assert.equal(expect(await get(activityUrl)).rows.find(row => row.userId === external.id).accessState, 'revoked');
    assert.ok(expect(await get(activityUrl)).rows.find(row => row.userId === external.id).candidatesAdded > 0);
  });
});
