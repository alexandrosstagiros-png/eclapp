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

test('durable team summaries execute, retry, deduplicate and revalidate current authorization', { timeout: 180000 }, async t => {
  const fixture = await createTestServer({ staffTeamActors: true }), db = fixture.adminPool, { ids, request } = fixture;
  const applicationDb = new DatabaseService({ value: { databaseUrl: process.env.DATABASE_URL } });
  t.after(async () => { await applicationDb.onApplicationShutdown(); await fixture.close(); });
  const team = new TeamService(applicationDb, new IdentityRepository(applicationDb), new AuditService());
  const makeWorker = () => new TeamInsightsService(applicationDb, team);
  const worker = makeWorker(), admin = await fixture.devLogin(ids.admin);
  const scope = [ids.legal, ids.region, ids.project, ids.scope], peer = randomUUID(), other = randomUUID(), conversation = randomUUID();
  for (const userId of [peer, other]) {
    await db.query("INSERT INTO users(id,display_name,role,active,approved) VALUES($1,'Synthetic summary recipient','dispatcher',true,true)", [userId]);
    await db.query('INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id) VALUES($1,$2,$3,$4,$5)', [userId, ...scope]);
  }
  await db.query("INSERT INTO team_conversations(id,legal_entity_id,region_id,project_id,responsibility_scope_id,kind,title,created_by,visibility) VALUES($1,$2,$3,$4,$5,'direct','Synthetic private dialogue',$6,'private')", [conversation, ...scope, peer]);
  for (const userId of [peer, other]) await db.query('INSERT INTO team_members(conversation_id,legal_entity_id,region_id,project_id,responsibility_scope_id,user_id) VALUES($1,$2,$3,$4,$5,$6)', [conversation, ...scope, userId]);
  async function message(at, text, parentId = null) {
    const messageId = randomUUID();
    await db.query("INSERT INTO team_messages(id,legal_entity_id,region_id,project_id,responsibility_scope_id,conversation_id,parent_id,text,author_id,author_name,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'Synthetic source',$10)", [messageId, ...scope, conversation, parentId, text, peer, at]);
    return messageId;
  }
  const due = new Date('2026-09-25T06:00:00Z');
  async function schedule(at = due, recipientIds = [peer]) {
    const input = { id: randomUUID(), responsibilityScopeId: ids.scope, enabled: true, frequency: 'daily', time: '09:00', timeZone: 'Europe/Moscow', weekday: 1, recipientIds };
    const result = await request('PUT', '/team/schedules', input, admin.accessToken);
    assert.equal(result.status, 200, JSON.stringify(result.body));
    const retry = await request('PUT', '/team/schedules', input, admin.accessToken);
    assert.equal(retry.status, 200);
    assert.equal(retry.body.nextRunAt, result.body.nextRunAt, 'idempotent saves preserve the due occurrence');
    await db.query('UPDATE team_summary_schedules SET next_run_at=$2,next_attempt_at=$2 WHERE id=$1', [input.id, at]);
    return input.id;
  }
  const firstMessage = await message(new Date(due.getTime() - 3600000), 'Нужно подготовить предложение. Возможность роста есть.'), scheduleId = await schedule();

  await t.test('concurrent replicas create one private-dialogue report and one occurrence record', async () => {
    await Promise.all([worker.runOnce(due), makeWorker().tick(due)]);
    const reports = (await db.query('SELECT * FROM team_summaries WHERE schedule_id=$1', [scheduleId])).rows;
    assert.equal(reports.length, 1);
    assert.equal(reports[0].message_count, 1);
    assert.deepEqual(reports[0].source_message_ids, [firstMessage]);
    assert.deepEqual(reports[0].recipient_ids, [peer]);
    assert.equal(reports[0].items[0].text, 'Нужно подготовить предложение. Возможность роста есть.');
    const runs = (await db.query('SELECT * FROM team_summary_runs WHERE schedule_id=$1', [scheduleId])).rows;
    assert.equal(runs.length, 1);
    assert.equal(runs[0].status, 'succeeded');
    assert.equal(runs[0].attempts, 1);
    assert.deepEqual(await worker.tick(due), []);
  });
  await t.test('a restarted worker resumes the persisted next run without overlapping the previous period', async () => {
    const secondMessage = await message(new Date(due.getTime() + 3600000), 'Риск задержки. Предлагаю автоматизировать согласование.', firstMessage);
    const nextDay = new Date(due.getTime() + 86400000);
    await makeWorker().tick(nextDay);
    const reports = (await db.query('SELECT * FROM team_summaries WHERE schedule_id=$1 ORDER BY period_end', [scheduleId])).rows;
    assert.equal(reports.length, 2);
    assert.deepEqual(reports[1].source_message_ids, [secondMessage]);
    assert.equal(reports[1].period_start.toISOString(), reports[0].period_end.toISOString());
    assert.equal(reports[1].period_end.toISOString(), nextDay.toISOString());
  });
  await t.test('a failed transaction persists a bounded retry and recovery creates no duplicate', async () => {
    const nextDay = new Date(due.getTime() + 2 * 86400000), failed = makeWorker();
    failed.build = async () => { throw new Error('synthetic bounded generation failure'); };
    const failedResult = await failed.tick(nextDay);
    assert.equal(failedResult[0].status, 'failed');
    let saved = (await db.query('SELECT * FROM team_summary_schedules WHERE id=$1', [scheduleId])).rows[0];
    assert.equal(saved.enabled, true);
    assert.equal(saved.attempts, 1);
    assert.equal(saved.last_error, 'SUMMARY_GENERATION_FAILED');
    assert.equal(saved.next_attempt_at.toISOString(), new Date(nextDay.getTime() + 60000).toISOString());
    assert.deepEqual(await worker.tick(new Date(nextDay.getTime() + 30000)), []);
    await worker.tick(new Date(nextDay.getTime() + 60000));
    const run = (await db.query('SELECT * FROM team_summary_runs WHERE schedule_id=$1 AND scheduled_for=$2', [scheduleId, nextDay])).rows[0];
    assert.equal(run.status, 'succeeded');
    assert.equal(run.attempts, 2);
    assert.equal(Number((await db.query('SELECT count(*) FROM team_summaries WHERE schedule_id=$1', [scheduleId])).rows[0].count), 3);
    await db.query('UPDATE team_summary_schedules SET enabled=false WHERE id=$1', [scheduleId]);
  });
  await t.test('revoked recipient grants stop scheduled disclosure and retain an actionable failure', async () => {
    const blocked = await schedule();
    await db.query('DELETE FROM access_grants WHERE user_id=$1', [peer]);
    await worker.tick(due);
    const saved = (await db.query('SELECT * FROM team_summary_schedules WHERE id=$1', [blocked])).rows[0];
    assert.equal(saved.enabled, false); assert.equal(saved.last_error, 'ACCESS_REVOKED');
    assert.equal(Number((await db.query('SELECT count(*) FROM team_summaries WHERE schedule_id=$1', [blocked])).rows[0].count), 0);
    await db.query('INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id) VALUES($1,$2,$3,$4,$5)', [peer, ...scope]);
  });
  for (const restriction of ['inactive', 'role', 'grant']) await t.test(`current schedule owner ${restriction} restriction blocks generation without a user session`, async () => {
    const blocked = await schedule(due, []);
    if (restriction === 'inactive') await db.query('UPDATE users SET active=false WHERE id=$1', [ids.admin]);
    if (restriction === 'role') await db.query("UPDATE users SET role='dispatcher' WHERE id=$1", [ids.admin]);
    if (restriction === 'grant') await db.query('DELETE FROM access_grants WHERE user_id=$1 AND responsibility_scope_id=$2', [ids.admin, ids.scope]);
    await worker.tick(due);
    const saved = (await db.query('SELECT * FROM team_summary_schedules WHERE id=$1', [blocked])).rows[0];
    assert.equal(saved.enabled, false); assert.equal(saved.last_error, 'ACCESS_REVOKED');
    assert.equal(Number((await db.query('SELECT count(*) FROM team_summaries WHERE schedule_id=$1', [blocked])).rows[0].count), 0);
    if (restriction === 'inactive') await db.query('UPDATE users SET active=true WHERE id=$1', [ids.admin]);
    if (restriction === 'role') await db.query("UPDATE users SET role='access_admin' WHERE id=$1", [ids.admin]);
    if (restriction === 'grant') await db.query('INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id,personal_data_visible) VALUES($1,$2,$3,$4,$5,true)', [ids.admin, ...scope]);
  });
  await t.test('test lifecycle does not start background work or create an external sender', async () => {
    const isolated = makeWorker();
    isolated.onModuleInit();
    assert.equal(isolated.timer, undefined);
    await isolated.onModuleDestroy();
  });
});
