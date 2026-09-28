'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
require('../recovered/node_modules/reflect-metadata');
const { createTestServer } = require('./local-test-server.cjs');
const { DatabaseService } = require('../recovered/apps/api/src/platform/database.service');
const { IdentityRepository } = require('../recovered/apps/api/src/modules/identity-access/infrastructure/identity.repository');
const { AuditService } = require('../recovered/apps/api/src/modules/audit/application/audit.service');
const { TeamService } = require('../recovered/apps/api/src/modules/team/team.service');
const { TeamInsightsService } = require('../recovered/apps/api/src/modules/team/team-insights');

test('daily fleet reports use existing chat and scheduler with scope authorization, deduplication and durable recovery', { timeout: 180000 }, async t => {
  const fixture = await createTestServer(), { ids, request, devLogin, adminPool: db } = fixture;
  const applicationDb = new DatabaseService({ value: { databaseUrl: process.env.DATABASE_URL } });
  t.after(async () => { await applicationDb.onApplicationShutdown(); await fixture.close(); });
  const team = new TeamService(applicationDb, new IdentityRepository(applicationDb), new AuditService());
  const worker = () => new TeamInsightsService(applicationDb, team);
  const peerScope = randomUUID(), ungrantedScope = randomUUID(), channelId = randomUUID(), date = '2026-09-25';
  for (const [scopeId, name] of [[peerScope, 'Synthetic city'], [ungrantedScope, 'Synthetic inaccessible']])
    await db.query('INSERT INTO responsibility_scopes(id,project_id,name) VALUES($1,$2,$3)', [scopeId, ids.project, name]);
  await db.query('UPDATE access_grants SET personal_data_visible=true WHERE user_id=$1', [ids.admin]);
  await db.query(`INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id,personal_data_visible)
    VALUES($1,$2,$3,$4,$5,true)`, [ids.admin, ids.legal, ids.region, ids.project, peerScope]);
  const admin = await devLogin(ids.admin), token = admin.accessToken;
  async function employee(role, personal = false) {
    const userId = randomUUID();
    await db.query('INSERT INTO users(id,display_name,role,active,approved) VALUES($1,$2,$3,true,true)', [userId, `Synthetic ${role}`, role]);
    await db.query(`INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id,personal_data_visible)
      VALUES($1,$2,$3,$4,$5,$6)`, [userId, ids.legal, ids.region, ids.project, ids.scope, personal]);
    return { userId, ...(await devLogin(userId)) };
  }
  const dispatcher = await employee('dispatcher'), limitedAdmin = await employee('access_admin');
  const vehicleId = '60000000-0000-4000-8000-000000000001';
  let rows = [{ id: randomUUID(), vehicleId, driverId: ids.drivers?.[0] || null, status: 'work', tripCount: 3,
    reporting: { block: 'crew', fleetType: 'own', actualTrips: 1, crewRequired: 2, crewPresent: 2 },
    comment: 'NEVER_SHARE_PRIVATE_COMMENT', clientFields: { passport: 'NEVER_SHARE_PRIVATE_PASSPORT' } }];
  await db.query(`INSERT INTO planning_plans(id,business_date,legal_entity_id,region_id,project_id,responsibility_scope_id,template_id,rows,created_by,updated_by)
    VALUES($1,$2,$3,$4,$5,$6,'general',$7::jsonb,$8,$8)`, [randomUUID(), date, ids.legal, ids.region, ids.project, ids.scope, JSON.stringify(rows), ids.admin]);
  const expect = (result, status = 200) => { assert.equal(result.status, status, JSON.stringify(result.body)); return result.body; };
  const reportInput = (businessDate = date, sourceScopeIds = [ids.scope]) => ({ responsibilityScopeId: ids.scope, businessDate, sourceScopeIds });
  const preview = (input = reportInput(), bearer = token) => request('GET', `/team/fleet-reports?responsibilityScopeId=${input.responsibilityScopeId}&businessDate=${input.businessDate}&sourceScopeIds=${input.sourceScopeIds.join(',')}${input.conversationId ? `&conversationId=${input.conversationId}` : ''}`, undefined, bearer);
  const publish = (input = reportInput(), bearer = token) => request('POST', '/team/fleet-reports', input, bearer);
  const due = new Date('2026-09-25T15:00:00Z');
  const scheduleInput = { responsibilityScopeId: ids.scope, enabled: true, frequency: 'daily', time: '18:00', timeZone: 'Europe/Moscow', weekday: 1,
    recipientIds: [], reportKind: 'fleet_release', sourceScopeIds: [ids.scope, peerScope].sort(), reportDayOffset: 0 };
  let publication, schedule;
  async function setDue(at) { await db.query('UPDATE team_summary_schedules SET enabled=true,next_run_at=$2,next_attempt_at=$2,attempts=0,last_error=NULL WHERE id=$1', [schedule.id, at]); }

  await t.test('preview requires current source access and has no chat side effects', async () => {
    expect(await preview(reportInput(), ''), 401);
    expect(await preview(reportInput(), dispatcher.accessToken), 403);
    expect(await preview(reportInput(), limitedAdmin.accessToken), 403);
    expect(await preview(reportInput(date, [ungrantedScope])), 403);
    expect(await publish(reportInput(date, [ungrantedScope])), 403);
    expect(await preview({ ...reportInput(), businessDate: '2026-02-30' }), 400);
    const report = expect(await preview());
    assert.equal(report.summary.total, 1); assert.equal(report.summary.onLine, 1); assert.equal(report.summary.actualTrips, 1);
    assert.equal(report.summary.plannedTrips, 3);
    assert.ok(!report.text.includes('NEVER_SHARE_PRIVATE'));
    assert.equal(Number((await db.query('SELECT count(*) FROM team_conversations')).rows[0].count), 0);
    const context = expect(await request('GET', '/team/context', undefined, limitedAdmin.accessToken));
    assert.equal(context.workScopes[0].personalDataVisible, false);
  });
  await t.test('concurrent publications reuse Отчёты in another company scope and create one ordinary message', async () => {
    expect(await request('POST', '/team/conversations', { id: channelId, responsibilityScopeId: peerScope, kind: 'channel', title: 'Отчёты', visibility: 'public', memberIds: [] }, token), 201);
    const results = await Promise.all([publish(), publish()]);
    publication = expect(results[0], 201);
    assert.equal(expect(results[1], 201).messageId, publication.messageId);
    assert.equal(publication.conversationId, channelId);
    assert.equal(publication.responsibilityScopeId, peerScope);
    const messages = (await db.query('SELECT * FROM team_messages')).rows;
    assert.equal(messages.length, 1); assert.equal(messages[0].responsibility_scope_id, peerScope); assert.equal(messages[0].version, 1);
    assert.equal(Number((await db.query('SELECT count(*) FROM team_message_originals')).rows[0].count), 1);
    const visible = expect(await request('GET', '/team/conversations', undefined, dispatcher.accessToken));
    assert.ok(visible.conversations.some(channel => channel.id === channelId));
    const detail = expect(await request('GET', `/team/conversations/${channelId}?responsibilityScopeId=${peerScope}`, undefined, dispatcher.accessToken));
    assert.ok(detail.messages.some(message => message.id === publication.messageId));
  });
  await t.test('explicit republication edits the same message with immutable original and change cursor', async () => {
    const old = (await db.query('SELECT * FROM team_messages WHERE id=$1', [publication.messageId])).rows[0];
    rows = rows.map(row => ({ ...row, reporting: { ...row.reporting, actualTrips: 2 } }));
    await db.query('UPDATE planning_plans SET rows=$2::jsonb WHERE responsibility_scope_id=$1', [ids.scope, JSON.stringify(rows)]);
    const updated = expect(await publish(), 201);
    assert.equal(updated.messageId, publication.messageId); assert.equal(updated.report.summary.actualTrips, 2); assert.equal(updated.unchanged, false);
    const saved = (await db.query('SELECT * FROM team_messages WHERE id=$1', [publication.messageId])).rows[0];
    assert.equal(saved.version, 2); assert.ok(BigInt(saved.change_seq) > BigInt(old.change_seq));
    assert.equal((await db.query('SELECT payload FROM team_message_originals WHERE message_id=$1', [publication.messageId])).rows[0].payload.text, old.text);
    assert.equal(Number((await db.query("SELECT count(*) FROM team_control_operations WHERE message_id=$1 AND action='edit'", [publication.messageId])).rows[0].count), 1);
    assert.equal(expect(await publish(), 201).unchanged, true);
  });
  await t.test('one company fleet schedule is reusable from every granted anchor and separated from chat summaries', async () => {
    const saved = await Promise.all([request('PUT', '/team/schedules', scheduleInput, token), request('PUT', '/team/schedules', scheduleInput, token)]);
    schedule = expect(saved[0]); assert.equal(expect(saved[1]).id, schedule.id);
    const otherAnchor = expect(await request('PUT', '/team/schedules', { ...scheduleInput, responsibilityScopeId: peerScope }, token));
    assert.equal(otherAnchor.id, schedule.id); assert.equal(otherAnchor.nextRunAt, schedule.nextRunAt);
    expect(await request('PUT', '/team/schedules', { ...scheduleInput, id: randomUUID() }, token), 409);
    const fleet = expect(await request('GET', `/team/schedules?responsibilityScopeId=${peerScope}&reportKind=fleet_release`, undefined, token));
    assert.equal(fleet.schedules.length, 1); assert.deepEqual(fleet.schedules[0].sourceScopeIds, scheduleInput.sourceScopeIds);
    const summaries = expect(await request('GET', `/team/schedules?responsibilityScopeId=${ids.scope}`, undefined, token));
    assert.deepEqual(summaries.schedules, []);
    rows = rows.map(row => ({ ...row, reporting: { ...row.reporting, actualTrips: 3 } }));
    await db.query('UPDATE planning_plans SET rows=$2::jsonb WHERE responsibility_scope_id=$1', [ids.scope, JSON.stringify(rows)]);
    await setDue(due);
    await Promise.all([worker().tick(due), worker().tick(due)]);
    const run = (await db.query('SELECT * FROM team_summary_runs WHERE schedule_id=$1', [schedule.id])).rows[0];
    assert.equal(run.status, 'succeeded'); assert.equal(run.message_id, publication.messageId); assert.equal(run.summary_id, null);
    const updated = (await db.query('SELECT version,text FROM team_messages WHERE id=$1', [publication.messageId])).rows[0];
    assert.equal(updated.version, 3, '18:00 refresh updates the same morning message once even with concurrent replicas');
    assert.match(updated.text, /подтверждено 3/);
    assert.equal(Number((await db.query('SELECT count(*) FROM team_summaries')).rows[0].count), 0);
  });
  await t.test('restarted worker publishes the next local date and missing data remains explicit', async () => {
    const nextDay = new Date(due.getTime() + 86400000);
    const results = await worker().tick(nextDay);
    assert.equal(results[0].status, 'succeeded');
    const message = (await db.query('SELECT * FROM team_messages WHERE id=$1', [results[0].messageId])).rows[0];
    assert.match(message.text, /2026-09-26/); assert.match(message.text, /отсутствие данных/);
    assert.equal(Number((await db.query('SELECT count(*) FROM team_messages')).rows[0].count), 2);
    assert.deepEqual(await worker().tick(nextDay), []);
  });
  await t.test('revocation of any source stops scheduled disclosure and unauthorized preview', async () => {
    const nextDay = new Date(due.getTime() + 2 * 86400000);
    await db.query('UPDATE access_grants SET personal_data_visible=false WHERE user_id=$1 AND responsibility_scope_id=$2', [ids.admin, peerScope]);
    const result = await worker().tick(nextDay);
    assert.equal(result[0].error, 'ACCESS_REVOKED');
    const saved = (await db.query('SELECT * FROM team_summary_schedules WHERE id=$1', [schedule.id])).rows[0];
    assert.equal(saved.enabled, false); assert.equal(saved.last_error, 'ACCESS_REVOKED');
    expect(await preview(reportInput(date, [ids.scope, peerScope])), 403);
    assert.equal(Number((await db.query('SELECT count(*) FROM team_messages')).rows[0].count), 2);
    await db.query('UPDATE access_grants SET personal_data_visible=true WHERE user_id=$1 AND responsibility_scope_id=$2', [ids.admin, peerScope]);
  });
  await t.test('generation failure retries durably and recovery creates exactly one message', async () => {
    const nextDay = new Date(due.getTime() + 3 * 86400000); await setDue(nextDay);
    const failing = worker(); failing.fleet.build = async () => { throw new Error('Synthetic report failure'); };
    assert.equal((await failing.tick(nextDay))[0].error, 'FLEET_REPORT_GENERATION_FAILED');
    assert.deepEqual(await worker().tick(new Date(nextDay.getTime() + 30000)), []);
    const results = await worker().tick(new Date(nextDay.getTime() + 60000)); assert.equal(results[0].status, 'succeeded');
    const run = (await db.query('SELECT * FROM team_summary_runs WHERE schedule_id=$1 AND scheduled_for=$2', [schedule.id, nextDay])).rows[0];
    assert.equal(run.attempts, 2); assert.equal(run.message_id, results[0].messageId);
  });
  await t.test('archived reports channel is preserved and stops automatic publication', async () => {
    const nextDay = new Date(due.getTime() + 4 * 86400000); await setDue(nextDay);
    const old = (await db.query('SELECT version FROM team_conversations WHERE id=$1', [channelId])).rows[0];
    expect(await request('PUT', `/team/conversations/${channelId}/lifecycle`, { responsibilityScopeId: peerScope, operationId: randomUUID(), version: old.version, action: 'archive' }, token));
    expect(await publish(reportInput('2026-09-29')), 409);
    assert.equal((await worker().tick(nextDay))[0].error, 'FLEET_REPORT_CHANNEL_UNAVAILABLE');
    assert.equal((await db.query('SELECT enabled FROM team_summary_schedules WHERE id=$1', [schedule.id])).rows[0].enabled, false);
    assert.equal(Number((await db.query('SELECT count(*) FROM team_conversations')).rows[0].count), 1);
    expect(await request('PUT', `/team/conversations/${channelId}/lifecycle`, { responsibilityScopeId: peerScope, operationId: randomUUID(), version: old.version + 1, action: 'restore' }, token));
  });
  await t.test('deleted daily message is never restored or duplicated', async () => {
    const old = (await db.query('SELECT version FROM team_messages WHERE id=$1', [publication.messageId])).rows[0];
    expect(await request('PUT', `/team/messages/${publication.messageId}/deletion`, { responsibilityScopeId: peerScope, operationId: randomUUID(), version: old.version }, token));
    expect(await publish(), 409);
    const deleted = (await db.query('SELECT * FROM team_messages WHERE id=$1', [publication.messageId])).rows[0];
    assert.ok(deleted.deleted_at); assert.equal(deleted.text, '');
    await setDue(due); assert.equal((await worker().tick(due))[0].error, 'FLEET_REPORT_DELETED');
    assert.equal(Number((await db.query('SELECT count(*) FROM team_messages WHERE id=$1', [publication.messageId])).rows[0].count), 1);
  });
  await t.test('explicit existing target supports selected cross-company sources without broadening grants', async () => {
    const target = [randomUUID(), randomUUID(), randomUUID(), randomUUID()], targetChannel = randomUUID();
    await db.query('INSERT INTO legal_entities(id,name) VALUES($1,$2)', [target[0], 'Synthetic report destination']);
    await db.query('INSERT INTO regions(id,name,time_zone) VALUES($1,$2,$3)', [target[1], 'Synthetic destination city', 'Europe/Moscow']);
    await db.query('INSERT INTO projects(id,name,legal_entity_id,region_id) VALUES($1,$2,$3,$4)', [target[2], 'Synthetic destination project', target[0], target[1]]);
    await db.query('INSERT INTO responsibility_scopes(id,project_id,name) VALUES($1,$2,$3)', [target[3], target[2], 'Synthetic destination scope']);
    await db.query(`INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id,personal_data_visible)
      VALUES($1,$2,$3,$4,$5,false)`, [ids.admin, ...target]);
    expect(await request('POST', '/team/conversations', { id: targetChannel, responsibilityScopeId: target[3], kind: 'channel', title: 'Отчеты', visibility: 'public', memberIds: [] }, token), 201);
    const input = { responsibilityScopeId: target[3], businessDate: date, sourceScopeIds: [ids.scope] };
    expect(await preview(input), 403); expect(await publish(input), 403);
    const explicit = { ...input, conversationId: targetChannel };
    assert.equal(expect(await preview(explicit)).summary.onLine, 1);
    const posted = expect(await publish(explicit), 201); assert.equal(posted.conversationId, targetChannel);
    const message = (await db.query('SELECT * FROM team_messages WHERE id=$1', [posted.messageId])).rows[0];
    assert.equal(message.legal_entity_id, target[0]); assert.equal(message.responsibility_scope_id, target[3]);
    const targetSchedule = expect(await request('PUT', '/team/schedules', { ...scheduleInput, responsibilityScopeId: target[3], sourceScopeIds: [ids.scope], conversationId: targetChannel }, token));
    assert.equal(targetSchedule.conversationId, targetChannel);
    const runAt = new Date('2026-09-30T15:00:00Z');
    await db.query('UPDATE team_summary_schedules SET next_run_at=$2,next_attempt_at=$2 WHERE id=$1', [targetSchedule.id, runAt]);
    const ran = await worker().tick(runAt); assert.equal(ran[0].status, 'succeeded');
    assert.equal((await db.query('SELECT conversation_id FROM team_messages WHERE id=$1', [ran[0].messageId])).rows[0].conversation_id, targetChannel);
    await db.query('DELETE FROM access_grants WHERE user_id=$1 AND responsibility_scope_id=$2', [ids.admin, target[3]]);
    expect(await preview(explicit), 403);
    assert.equal((await worker().tick(new Date(runAt.getTime() + 86400000)))[0].error, 'ACCESS_REVOKED');
    assert.equal((await db.query('SELECT personal_data_visible FROM access_grants WHERE user_id=$1 AND responsibility_scope_id=$2', [ids.admin, ids.scope])).rows[0].personal_data_visible, true);
  });
  await t.test('assembly guards still reject originals attached after the parent transaction committed', async () => {
    const detachedMessage = randomUUID(), detachedConversation = randomUUID();
    await db.query(`INSERT INTO team_messages(id,legal_entity_id,region_id,project_id,responsibility_scope_id,conversation_id,text,author_id,author_name)
      VALUES($1,$2,$3,$4,$5,$6,'Synthetic committed parent',$7,'Synthetic author')`, [detachedMessage, ids.legal, ids.region, ids.project, peerScope, channelId, ids.admin]);
    await assert.rejects(applicationDb.transaction(client => client.query(`INSERT INTO team_message_originals(message_id,legal_entity_id,region_id,project_id,responsibility_scope_id,conversation_id,payload)
      VALUES($1,$2,$3,$4,$5,$6,'{}'::jsonb)`, [detachedMessage, ids.legal, ids.region, ids.project, peerScope, channelId])), error => error.code === '23514');
    await db.query(`INSERT INTO team_conversations(id,legal_entity_id,region_id,project_id,responsibility_scope_id,kind,title,created_by)
      VALUES($1,$2,$3,$4,$5,'channel','Synthetic committed parent',$6)`, [detachedConversation, ids.legal, ids.region, ids.project, peerScope, ids.admin]);
    await assert.rejects(applicationDb.transaction(client => client.query(`INSERT INTO team_conversation_originals(conversation_id,legal_entity_id,region_id,project_id,responsibility_scope_id,payload)
      VALUES($1,$2,$3,$4,$5,'{}'::jsonb)`, [detachedConversation, ids.legal, ids.region, ids.project, peerScope])), error => error.code === '23514');
  });
  await t.test('first scheduled report creates one ordinary channel with its original inside a savepoint', async () => {
    const target = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
    await db.query('INSERT INTO legal_entities(id,name) VALUES($1,$2)', [target[0], 'Synthetic automatic channel']);
    await db.query('INSERT INTO regions(id,name,time_zone) VALUES($1,$2,$3)', [target[1], 'Synthetic automatic city', 'Europe/Moscow']);
    await db.query('INSERT INTO projects(id,name,legal_entity_id,region_id) VALUES($1,$2,$3,$4)', [target[2], 'Synthetic automatic project', target[0], target[1]]);
    await db.query('INSERT INTO responsibility_scopes(id,project_id,name) VALUES($1,$2,$3)', [target[3], target[2], 'Synthetic automatic scope']);
    await db.query(`INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id,personal_data_visible)
      VALUES($1,$2,$3,$4,$5,true)`, [ids.admin, ...target]);
    const fresh = expect(await request('PUT', '/team/schedules', { ...scheduleInput, responsibilityScopeId: target[3], sourceScopeIds: [target[3]] }, token));
    await db.query('UPDATE team_summary_schedules SET next_run_at=$2,next_attempt_at=$2 WHERE id=$1', [fresh.id, due]);
    const result = await worker().tick(due); assert.equal(result[0].status, 'succeeded');
    const channels = (await db.query('SELECT * FROM team_conversations WHERE legal_entity_id=$1', [target[0]])).rows;
    assert.equal(channels.length, 1); assert.equal(channels[0].title, 'Отчеты');
    assert.equal(Number((await db.query('SELECT count(*) FROM team_conversation_originals WHERE conversation_id=$1', [channels[0].id])).rows[0].count), 1);
    assert.equal(Number((await db.query('SELECT count(*) FROM team_message_originals WHERE message_id=$1', [result[0].messageId])).rows[0].count), 1);
    assert.deepEqual(await worker().tick(due), []);
  });
});

test('automatic daily fleet coverage follows real planning sources and current grants across the shared system', { timeout: 180000 }, async t => {
  const fixture = await createTestServer(), { ids, request, devLogin, adminPool: db } = fixture;
  const applicationDb = new DatabaseService({ value: { databaseUrl: process.env.DATABASE_URL } });
  t.after(async () => { await applicationDb.onApplicationShutdown(); await fixture.close(); });
  const team = new TeamService(applicationDb, new IdentityRepository(applicationDb), new AuditService());
  const worker = () => new TeamInsightsService(applicationDb, team);
  const date = '2026-10-01', due = new Date(`${date}T15:00:00Z`);
  const base = { legal: ids.legal, region: ids.region, project: ids.project, scope: ids.scope };
  const expect = (result, status = 200) => { assert.equal(result.status, status, JSON.stringify(result.body)); return result.body; };
  const scopeIds = report => report.sourceScopes.map(source => source.responsibilityScopeId).sort();
  async function grant(scope, userId = ids.admin, personal = true) {
    await db.query(`INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id,personal_data_visible)
      VALUES($1,$2,$3,$4,$5,$6)`, [userId, scope.legal, scope.region, scope.project, scope.scope, personal]);
  }
  async function newScope(label, { company = base, personal = true, granted = true } = {}) {
    const scope = { ...company, scope: randomUUID() };
    await db.query('INSERT INTO responsibility_scopes(id,project_id,name) VALUES($1,$2,$3)', [scope.scope, scope.project, label]);
    if (granted) await grant(scope, ids.admin, personal);
    return scope;
  }
  async function newCompany(label) {
    const company = { legal: randomUUID(), region: randomUUID(), project: randomUUID() };
    await db.query('INSERT INTO legal_entities(id,name) VALUES($1,$2)', [company.legal, label]);
    await db.query('INSERT INTO regions(id,name,time_zone) VALUES($1,$2,$3)', [company.region, label, 'Europe/Moscow']);
    await db.query('INSERT INTO projects(id,name,legal_entity_id,region_id) VALUES($1,$2,$3,$4)', [company.project, label, company.legal, company.region]);
    return company;
  }
  async function plan(scope, businessDate, block, actualTrips = 1) {
    const rows = [{ id: randomUUID(), vehicleId: randomUUID(), status: 'work', tripCount: actualTrips,
      reporting: { block, fleetType: 'own', actualTrips, ...(block === 'crew' ? { crewRequired: 2, crewPresent: 2 } : {}) } }];
    await db.query(`INSERT INTO planning_plans(id,business_date,legal_entity_id,region_id,project_id,responsibility_scope_id,template_id,rows,created_by,updated_by)
      VALUES($1,$2,$3,$4,$5,$6,'general',$7::jsonb,$8,$8)`, [randomUUID(), businessDate, scope.legal, scope.region, scope.project, scope.scope, JSON.stringify(rows), ids.admin]);
  }
  async function resource(scope, source, kind, active) {
    if (source === 'import') {
      await db.query(`INSERT INTO planning_imported_resources(id,legal_entity_id,region_id,project_id,responsibility_scope_id,kind,label,active)
        VALUES($1,$2,$3,$4,$5,$6,'Synthetic imported resource',$7)`, [randomUUID(), scope.legal, scope.region, scope.project, scope.scope, kind, active]);
    } else {
      await db.query(`INSERT INTO planning_one_c_scopes(responsibility_scope_id,source_namespace,client_ref,project_ref)
        VALUES($1,$2,$3,$4)`, [scope.scope, randomUUID(), randomUUID(), randomUUID()]);
      await db.query(`INSERT INTO planning_one_c_resources(responsibility_scope_id,kind,local_id,source_ref,label,active)
        VALUES($1,$2,$3,$4,'Synthetic 1C resource',$5)`, [scope.scope, kind, randomUUID(), randomUUID(), active]);
    }
  }
  await db.query('UPDATE access_grants SET personal_data_visible=true WHERE user_id=$1', [ids.admin]);
  await plan(base, date, 'crew');
  const empty = await newScope('Synthetic granted non-planning workspace');
  const tripOnly = await newScope('Synthetic historical trip workspace');
  const tripId = randomUUID();
  await db.query(`INSERT INTO trips(id,reference,business_date,legal_entity_id,region_id,project_id,responsibility_scope_id,vehicle_id,route_summary)
    VALUES($1,$2,'2026-09-01',$3,$4,$5,$6,$7,'Synthetic historical route')`, [tripId, `SYN-${tripId}`, tripOnly.legal, tripOnly.region, tripOnly.project, tripOnly.scope, '60000000-0000-4000-8000-000000000001']);
  const evidence = [base.scope, tripOnly.scope];
  const excluded = [empty.scope];
  for (const source of ['import', 'one-c']) for (const [kind, active] of [['vehicle', true], ['driver', true], ['vehicle', false]]) {
    const scope = await newScope(`Synthetic ${source} ${kind} ${active ? 'active' : 'inactive'}`);
    await resource(scope, source, kind, active);
    (kind === 'vehicle' && active ? evidence : excluded).push(scope.scope);
  }
  const ungranted = await newScope('Synthetic Team-expanded scope only', { granted: false });
  const personalHidden = await newScope('Synthetic source without personal-data access', { personal: false });
  for (const scope of [ungranted, personalHidden]) { await plan(scope, date, 'city', 99); excluded.push(scope.scope); }
  const token = (await devLogin(ids.admin)).accessToken;
  const autoInput = { responsibilityScopeId: ids.scope, businessDate: date };
  const preview = (input = autoInput, bearer = token) => {
    const params = new URLSearchParams({ responsibilityScopeId: input.responsibilityScopeId, businessDate: input.businessDate });
    if (Object.hasOwn(input, 'sourceScopeIds')) params.set('sourceScopeIds', input.sourceScopeIds.join(','));
    if (input.conversationId) params.set('conversationId', input.conversationId);
    return request('GET', `/team/fleet-reports?${params}`, undefined, bearer);
  };
  const scheduleInput = { responsibilityScopeId: ids.scope, enabled: true, frequency: 'daily', time: '18:00', timeZone: 'Europe/Moscow', weekday: 1,
    recipientIds: [], reportKind: 'fleet_release', reportDayOffset: 0 };

  await t.test('omitted and empty sources use planning evidence without accepting Team-expanded or hidden grants', async () => {
    for (const input of [autoInput, { ...autoInput, sourceScopeIds: [] }]) {
      const report = expect(await preview(input));
      assert.deepEqual(scopeIds(report), evidence.slice().sort());
      assert.equal(report.summary.total, 1); assert.equal(report.summary.actualTrips, 1);
      assert.equal(report.blocks.find(block => block.id === 'crew').total, 1);
      assert.ok(excluded.every(scopeId => !scopeIds(report).includes(scopeId)));
    }
    assert.deepEqual(scopeIds(expect(await preview({ ...autoInput, sourceScopeIds: [ids.scope] }))), [ids.scope]);
    expect(await preview({ ...autoInput, sourceScopeIds: [ungranted.scope] }), 403);
    expect(await preview({ ...autoInput, sourceScopeIds: [personalHidden.scope] }), 403);
    assert.equal(Number((await db.query('SELECT count(*) FROM team_conversations')).rows[0].count), 0);
  });

  await t.test('no personal grant remains forbidden while a valid grant without planning evidence yields explicit no data', async () => {
    async function employee(scope, personal) {
      const userId = randomUUID();
      await db.query("INSERT INTO users(id,display_name,role,active,approved) VALUES($1,'Synthetic automatic reporter','access_admin',true,true)", [userId]);
      await grant(scope, userId, personal);
      return (await devLogin(userId)).accessToken;
    }
    const hiddenToken = await employee(base, false);
    expect(await preview(autoInput, hiddenToken), 403);
    expect(await request('POST', '/team/fleet-reports', { ...autoInput, sourceScopeIds: [] }, hiddenToken), 403);
    expect(await request('PUT', '/team/schedules', scheduleInput, hiddenToken), 403);
    const emptyToken = await employee(empty, true), input = { responsibilityScopeId: empty.scope, businessDate: date };
    const report = expect(await preview(input, emptyToken));
    assert.deepEqual(scopeIds(report), []); assert.equal(report.coverage.sourceScopeCount, 0); assert.equal(report.summary.total, 0);
    assert.match(report.text, /Нет учтённых машин/);
    assert.equal(expect(await request('POST', '/team/fleet-reports', input, emptyToken), 201).report.summary.total, 0);
  });

  await t.test('an actual shared chat combines crew and city data added after saving its automatic schedule', async () => {
    const target = await newScope('Synthetic existing reports destination', { company: await newCompany('Synthetic shared chat company'), personal: false });
    const channelId = randomUUID();
    expect(await request('POST', '/team/conversations', { id: channelId, responsibilityScopeId: target.scope, kind: 'channel', title: 'Отчеты', visibility: 'public', memberIds: [] }, token), 201);
    const input = { responsibilityScopeId: target.scope, businessDate: date, conversationId: channelId };
    const saved = expect(await request('PUT', '/team/schedules', { ...scheduleInput, responsibilityScopeId: target.scope, conversationId: channelId }, token));
    assert.deepEqual(saved.sourceScopeIds, []);
    assert.deepEqual((await db.query('SELECT source_scope_ids FROM team_summary_schedules WHERE id=$1', [saved.id])).rows[0].source_scope_ids, []);
    assert.equal(expect(await request('PUT', '/team/schedules', { ...scheduleInput, responsibilityScopeId: target.scope, conversationId: channelId, sourceScopeIds: [] }, token)).id, saved.id);
    assert.deepEqual(scopeIds(expect(await preview(input))), evidence.slice().sort());

    const city = await newScope('Synthetic later city delivery', { company: await newCompany('Synthetic city operations') });
    await plan(city, date, 'city', 2);
    const expectedSources = [...evidence, city.scope].sort();
    const report = expect(await preview(input));
    assert.deepEqual(scopeIds(report), expectedSources);
    assert.equal(report.summary.total, 2); assert.equal(report.summary.onLine, 2); assert.equal(report.summary.actualTrips, 3);
    assert.equal(report.blocks.find(block => block.id === 'crew').total, 1);
    assert.equal(report.blocks.find(block => block.id === 'city').total, 1);
    assert.deepEqual(scopeIds(expect(await preview(autoInput))), evidence.slice().sort(), 'without a selected target auto coverage stays in the anchor company');
    expect(await preview({ ...autoInput, sourceScopeIds: [city.scope] }), 403);
    assert.deepEqual(scopeIds(expect(await preview({ ...input, sourceScopeIds: [ids.scope] }))), [ids.scope], 'explicit saved sources remain exact');

    await db.query('UPDATE team_summary_schedules SET next_run_at=$2,next_attempt_at=$2 WHERE id=$1', [saved.id, due]);
    const first = await worker().tick(due);
    assert.equal(first.length, 1); assert.equal(first[0].status, 'succeeded');
    const message = (await db.query('SELECT conversation_id,text FROM team_messages WHERE id=$1', [first[0].messageId])).rows[0];
    assert.equal(message.conversation_id, channelId); assert.match(message.text, /Учтено машин: 2/);
    assert.match(message.text, /Экипажный блок/); assert.match(message.text, /Городская доставка/);
    const repeated = expect(await request('POST', '/team/fleet-reports', { ...input, sourceScopeIds: [] }, token), 201);
    assert.equal(repeated.messageId, first[0].messageId); assert.equal(repeated.unchanged, true);

    const nextDate = '2026-10-02';
    await plan(base, nextDate, 'crew', 8); await plan(city, nextDate, 'city', 2);
    await db.query('UPDATE access_grants SET personal_data_visible=false WHERE user_id=$1 AND responsibility_scope_id=$2', [ids.admin, ids.scope]);
    const nextReport = expect(await preview({ ...input, businessDate: nextDate }));
    assert.deepEqual(scopeIds(nextReport), expectedSources.filter(scopeId => scopeId !== ids.scope));
    assert.equal(nextReport.summary.total, 1); assert.equal(nextReport.summary.actualTrips, 2);
    const second = await worker().tick(new Date(`${nextDate}T15:00:00Z`));
    assert.equal(second[0].status, 'succeeded');
    const secondMessage = (await db.query('SELECT text FROM team_messages WHERE id=$1', [second[0].messageId])).rows[0];
    assert.match(secondMessage.text, /Учтено машин: 1/);
    assert.equal((await db.query('SELECT enabled FROM team_summary_schedules WHERE id=$1', [saved.id])).rows[0].enabled, true);

    await db.query('UPDATE access_grants SET personal_data_visible=false WHERE user_id=$1', [ids.admin]);
    expect(await preview(input), 403);
    const revoked = await worker().tick(new Date('2026-10-03T15:00:00Z'));
    assert.equal(revoked[0].error, 'ACCESS_REVOKED');
    assert.equal((await db.query('SELECT enabled FROM team_summary_schedules WHERE id=$1', [saved.id])).rows[0].enabled, false);
  });
});
