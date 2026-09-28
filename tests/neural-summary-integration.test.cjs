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

test('summary publication uses Team permissions, deduplicates and supports scheduled/model summaries', { timeout: 180000 }, async t => {
  const fixture = await createTestServer({ staffTeamActors: true });
  const appDb = new DatabaseService({ value: { databaseUrl: process.env.DATABASE_URL } });
  t.after(async () => { await appDb.onApplicationShutdown(); await fixture.close(); });
  const { ids, request, adminPool: db } = fixture;
  const admin = await fixture.devLogin(ids.admin), peer = await fixture.devLogin(ids.dispatcher);
  const scope = ids.scope;
  const call = (method, path, body, session = admin) => request(method, path, body, session.accessToken);
  const ok = result => { assert.ok([200, 201].includes(result.status), JSON.stringify(result)); return result.body; };
  const channel = ok(await call('POST', '/team/conversations', { id: randomUUID(), responsibilityScopeId: scope, kind: 'channel', title: 'Сводки синтетической команды', memberIds: [] }));
  const closed = ok(await call('POST', '/team/conversations', { id: randomUUID(), responsibilityScopeId: scope, kind: 'channel', visibility: 'private', title: 'Личная переписка источника', memberIds: [ids.dispatcher] }));
  const source = ok(await call('POST', '/team/messages', { id: randomUUID(), responsibilityScopeId: scope, conversationId: closed.id, text: 'Нужно проверить сроки. Риск задержки пока не подтвержден.' }, peer));
  const due = new Date(Date.now() + 30000), start = new Date(due.getTime() - 86400000);
  const report = ok(await call('POST', '/team/summaries', { responsibilityScopeId: scope, periodStart: start.toISOString(), periodEnd: due.toISOString() }));
  const publish = (target = channel.id, session = admin) => call('POST', `/team/summaries/${report.id}/publish`, { responsibilityScopeId: scope, conversationId: target }, session);
  await t.test('only administrators with posting rights can publish', async () => {
    assert.equal((await publish(channel.id, peer)).status, 403);
    assert.equal((await publish(closed.id)).status, 403);
    assert.equal((await publish(randomUUID())).status, 404);
    assert.equal((await db.query('SELECT * FROM team_summary_publications WHERE summary_id=$1', [report.id])).rowCount, 0);
  });
  await t.test('parallel publication creates one ordinary chat message and does not expand source access', async () => {
    const results = await Promise.all([publish(), publish()]);
    const published = results.map(ok);
    assert.equal(published[0].messageId, published[1].messageId);
    assert.equal(published.filter(item => item.reused).length, 1);
    const saved = (await db.query('SELECT text FROM team_messages WHERE id=$1', [published[0].messageId])).rows[0];
    assert.match(saved.text, /Риск задержки пока не подтвержден/);
    assert.equal((await db.query('SELECT * FROM team_message_originals WHERE message_id=$1', [published[0].messageId])).rowCount, 1);
    assert.equal((await db.query('SELECT * FROM team_members WHERE conversation_id=$1 AND user_id=$2', [closed.id, ids.admin])).rowCount, 0);
    assert.equal((await db.query('SELECT recipient_ids FROM team_summaries WHERE id=$1', [report.id])).rows[0].recipient_ids.length, 0);
    await db.query('UPDATE team_conversations SET archived_at=clock_timestamp(),archived_by=$2 WHERE id=$1', [channel.id, ids.admin]);
    assert.equal((await publish()).status, 409, 'even retries revalidate archived target');
    await db.query('UPDATE team_conversations SET archived_at=NULL,archived_by=NULL WHERE id=$1', [channel.id]);
  });
  await t.test('a selected chat may use another Team scope in the same company', async () => {
    const targetScope = randomUUID();
    await db.query('INSERT INTO responsibility_scopes(id,project_id,name) VALUES($1,$2,$3)', [targetScope, ids.project, 'Чат другого подразделения']);
    const target = ok(await call('POST', '/team/conversations', { id: randomUUID(), responsibilityScopeId: targetScope, kind: 'channel', title: 'Публикация другой области', memberIds: [] }));
    const published = ok(await publish(target.id));
    assert.equal(published.responsibilityScopeId, targetScope);
    assert.equal((await db.query('SELECT responsibility_scope_id FROM team_messages WHERE id=$1', [published.messageId])).rows[0].responsibility_scope_id, targetScope);
    assert.equal((await db.query('SELECT responsibility_scope_id FROM team_summaries WHERE id=$1', [report.id])).rows[0].responsibility_scope_id, scope);
  });
  const team = new TeamService(appDb, new IdentityRepository(appDb), new AuditService());
  const worker = new TeamInsightsService(appDb, team);
  await t.test('scheduled summary publishes once and retains the summary as its run result', async () => {
    const schedule = ok(await call('PUT', '/team/schedules', { id: randomUUID(), responsibilityScopeId: scope, enabled: true, frequency: 'daily', time: '09:00', timeZone: 'Europe/Moscow', weekday: 1, recipientIds: [], conversationId: channel.id }));
    await db.query('UPDATE team_summary_schedules SET next_run_at=$2,next_attempt_at=$2,last_period_end=$3 WHERE id=$1', [schedule.id, due, start]);
    const result = await worker.tick(due);
    assert.equal(result[0].status, 'succeeded', JSON.stringify(result));
    const run = (await db.query('SELECT * FROM team_summary_runs WHERE schedule_id=$1', [schedule.id])).rows[0];
    assert.ok(run.summary_id); assert.ok(run.message_id);
    assert.deepEqual(await worker.tick(due), []);
    const publication = (await db.query('SELECT * FROM team_summary_publications WHERE summary_id=$1', [run.summary_id])).rows[0];
    assert.equal(publication.message_id, run.message_id);
  });
  await t.test('a removed scheduler owner cannot post to a private target or incur model usage', async () => {
    const privateTarget = ok(await call('POST', '/team/conversations', { id: randomUUID(), responsibilityScopeId: scope, kind: 'channel', visibility: 'private', title: 'Закрытая публикация', memberIds: [ids.admin, ids.dispatcher] }));
    const schedule = ok(await call('PUT', '/team/schedules', { id: randomUUID(), responsibilityScopeId: scope, enabled: true, frequency: 'daily', time: '09:00', timeZone: 'Europe/Moscow', weekday: 1, recipientIds: [], conversationId: privateTarget.id }));
    await db.query('UPDATE team_summary_schedules SET next_run_at=$2,next_attempt_at=$2,last_period_end=$3 WHERE id=$1', [schedule.id, due, start]);
    await db.query('DELETE FROM team_members WHERE conversation_id=$1 AND user_id=$2', [privateTarget.id, ids.admin]);
    const previousRun = worker.neural.run;
    let calls = 0;
    worker.neural.run = async () => { calls++; throw new Error('must not run'); };
    const result = await worker.tick(due);
    worker.neural.run = previousRun;
    assert.equal(result[0].error, 'ACCESS_REVOKED');
    assert.equal(calls, 0);
    assert.equal((await db.query('SELECT * FROM team_summaries WHERE schedule_id=$1', [schedule.id])).rowCount, 0);
  });
  await t.test('configured model supplies overview while exact source excerpts remain unchanged', async () => {
    worker.neural.run = async (_client, _actor, _scope, input) => {
      assert.equal(input.task, 'conversation_summary');
      assert.ok(JSON.parse(input.prompt).messages.some(message => message.id === source.id));
      return { text: 'Сроки требуют проверки; задержка не подтверждена.', usageId: randomUUID(), provider: 'openai', model: 'synthetic-model', inputTokens: 80, outputTokens: 20, cost: '0.001', currency: 'USD' };
    };
    const generated = await worker.generate(admin.actor, { responsibilityScopeId: scope, periodStart: start.toISOString(), periodEnd: due.toISOString() }, randomUUID());
    assert.equal(generated.mode, 'ai');
    assert.match(generated.overview, /задержка не подтверждена/);
    assert.equal(generated.ai.model, 'synthetic-model');
    assert.ok(generated.sourceMessageIds.includes(source.id));
    assert.equal(generated.messageCount, 1, "published summaries are excluded from later summaries to avoid feedback");
    assert.ok(generated.items.some(item => item.text === source.text && item.sourceMessageIds.includes(source.id)));
  });
});
