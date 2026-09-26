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

test('closed-channel summaries require explicit report sharing and never confer source access', { timeout: 180000 }, async t => {
  const fixture = await createTestServer({ staffTeamActors: true });
  const applicationDb = new DatabaseService({ value: { databaseUrl: process.env.DATABASE_URL } });
  t.after(async () => { await applicationDb.onApplicationShutdown(); await fixture.close(); });
  const { ids, request, adminPool: db } = fixture;
  const admin = await fixture.devLogin(ids.admin), author = await fixture.devLogin(ids.drivers[0]), recipient = await fixture.devLogin(ids.dispatcher);
  const scope = ids.scope, scoped = path => `${path}?responsibilityScopeId=${scope}`;
  const call = (method, path, body, session = admin) => request(method, path, body, session.accessToken);
  const ok = result => { assert.ok([200, 201].includes(result.status), `HTTP ${result.status}: ${JSON.stringify(result.body)}`); return result.body; };
  const reports = async session => ok(await call('GET', scoped('/team/summaries'), undefined, session)).summaries;
  const due = new Date(Date.now() + 60000), periodStart = new Date(due.getTime() - 86400000);

  // The administrator's standing sharing instruction predates the closed channel.
  const schedule = ok(await call('PUT', '/team/schedules', { id: randomUUID(), responsibilityScopeId: scope, enabled: true,
    frequency: 'daily', time: '09:00', timeZone: 'Europe/Moscow', weekday: 1, recipientIds: [ids.dispatcher] }));
  const channel = ok(await call('POST', '/team/conversations', { id: randomUUID(), responsibilityScopeId: scope,
    kind: 'channel', visibility: 'private', title: 'Закрытый синтетический канал', memberIds: [ids.drivers[0], ids.drivers[1]] }, admin));
  const file = { id: randomUUID(), filename: 'Синтетический закрытый файл.txt', mimeType: 'text/plain',
    contentBase64: Buffer.from(`private-file-${randomUUID()}`).toString('base64') };
  const root = ok(await call('POST', '/team/messages', { id: randomUUID(), responsibilityScopeId: scope, conversationId: channel.id,
    parentId: null, text: 'Задача: подготовить закрытый план.', attachments: [file] }, author));
  const branch = ok(await call('POST', '/team/messages', { id: randomUUID(), responsibilityScopeId: scope, conversationId: channel.id,
    parentId: root.id, text: 'Риск: задержка закрытого проекта.' }, author));

  async function assertSourcesRemainPrivate() {
    const visible = ok(await call('GET', scoped('/team/conversations'), undefined, recipient)).conversations;
    assert.ok(!visible.some(item => item.id === channel.id));
    assert.ok(!JSON.stringify(visible).includes(channel.title));
    for (const path of [`/team/conversations/${channel.id}`, `/team/messages/${root.id}`, `/team/messages/${branch.id}`]) {
      assert.equal((await call('GET', scoped(path), undefined, recipient)).status, 404, path);
    }
    const response = await fetch(`${fixture.origin}/api/v1${scoped(`/team/attachments/${file.id}`)}`, {
      headers: { Authorization: `Bearer ${recipient.accessToken}` }, signal: AbortSignal.timeout(10000),
    });
    assert.equal(response.status, 404);
    await response.arrayBuffer();
  }
  function assertSnapshot(report) {
    assert.equal(report.messageCount, 2);
    assert.deepEqual(new Set(report.sourceMessageIds), new Set([root.id, branch.id]));
    assert.ok(report.items.some(item => item.text === root.text));
    assert.ok(report.items.some(item => item.text === branch.text));
    for (const hiddenMetadata of [channel.title, file.filename, file.contentBase64]) {
      assert.ok(!JSON.stringify(report).includes(hiddenMetadata), 'reports embed message excerpts, not additional private metadata or file bytes');
    }
  }

  await t.test('private generation, explicit frozen report sharing and revocation leave source ACL unchanged', async () => {
    assert.equal((await call('POST', '/team/summaries', { responsibilityScopeId: scope, periodStart: periodStart.toISOString(), periodEnd: due.toISOString() }, recipient)).status, 403);
    const report = ok(await call('POST', '/team/summaries', { responsibilityScopeId: scope, periodStart: periodStart.toISOString(), periodEnd: due.toISOString() }));
    assertSnapshot(report);
    assert.deepEqual(report.recipientIds, []);
    assert.equal((await reports(recipient)).length, 0);
    await assertSourcesRemainPrivate();
    ok(await call('PUT', `/team/summaries/${report.id}/sharing`, { responsibilityScopeId: scope, recipientIds: [ids.dispatcher] }));
    await fixture.restartApi();
    const shared = (await reports(recipient)).find(item => item.id === report.id);
    assertSnapshot(shared);
    assert.deepEqual(shared.recipientIds, [ids.dispatcher]);
    await assertSourcesRemainPrivate();
    const adminSource = ok(await call('GET', scoped(`/team/messages/${branch.id}`)));
    assert.equal(adminSource.ancestors[0].attachments[0].id, file.id);
    ok(await call('PUT', `/team/summaries/${report.id}/sharing`, { responsibilityScopeId: scope, recipientIds: [] }));
    assert.ok(!(await reports(recipient)).some(item => item.id === report.id));
  });

  await t.test('a standing explicit schedule shares its full report without granting closed-channel membership', async () => {
    await db.query('UPDATE team_summary_schedules SET next_run_at=$2,next_attempt_at=$2,last_period_end=$3 WHERE id=$1', [schedule.id, due, periodStart]);
    const worker = new TeamInsightsService(applicationDb, new TeamService(applicationDb, new IdentityRepository(applicationDb), new AuditService()));
    const result = await worker.tick(due);
    assert.equal(result.length, 1);
    assert.equal(result[0].status, 'succeeded');
    const shared = (await reports(recipient)).find(item => item.scheduleId === schedule.id);
    assertSnapshot(shared);
    assert.deepEqual(shared.recipientIds, [ids.dispatcher]);
    await assertSourcesRemainPrivate();
    assert.equal((await db.query('SELECT 1 FROM team_members WHERE conversation_id=$1 AND user_id=$2', [channel.id, ids.dispatcher])).rowCount, 0);
    assert.deepEqual(await worker.tick(due), [], 'the occurrence remains deduplicated');
  });
});
