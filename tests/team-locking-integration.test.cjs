'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { setTimeout: delay } = require('node:timers/promises');
require('../recovered/node_modules/reflect-metadata');
const { createTestServer } = require('./local-test-server.cjs');
const { IdentityRepository } = require('../recovered/apps/api/src/modules/identity-access/infrastructure/identity.repository');
const { TeamService } = require('../recovered/apps/api/src/modules/team/team.service');
const { TeamInsightsService } = require('../recovered/apps/api/src/modules/team/team-insights');

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

test('team references coexist with concurrent readers without weakening identity revalidation', { timeout: 180000 }, async t => {
  const f = await createTestServer({ staffTeamActors: true });
  t.after(() => f.close());
  const { ids, adminPool: db } = f;
  const alice = await f.devLogin(ids.drivers[0]), bob = await f.devLogin(ids.drivers[1]), admin = await f.devLogin(ids.admin);
  const call = (method, route, body, session = alice) => f.request(method, route, body, session.accessToken);
  const scoped = route => `${route}?responsibilityScopeId=${ids.scope}`;
  const ok = result => {
    assert.ok([200, 201].includes(result.status), `${result.status} ${JSON.stringify(result.body)}`);
    return result.body;
  };
  const conversationBody = patch => ({ id: randomUUID(), responsibilityScopeId: ids.scope, kind: 'channel', title: 'Concurrent team references', memberIds: [], ...patch });
  const channel = ok(await call('POST', '/team/conversations', conversationBody()));
  const messageBody = patch => ({ id: randomUUID(), responsibilityScopeId: ids.scope, conversationId: channel.id, parentId: null, text: 'Message', ...patch });
  const mention = { text: `@[Bob](user:${ids.drivers[1]}) please read`, mentions: { userIds: [ids.drivers[1]], all: false } };

  // The writer holds the scope, then the other request acquires the recipient's
  // identity lock before waiting for that scope. Real FK checks must still finish.
  async function overlap(write, concurrent = () => call('GET', scoped('/team/conversations'), undefined, bob), insights = false) {
    const scopeReady = deferred(), recipientReady = deferred();
    const current = TeamService.prototype.current, lockScope = TeamService.prototype.lockScope;
    const lockInsights = TeamInsightsService.prototype.lockUsers;
    let gated = false;
    TeamService.prototype.current = async function(client, supplied) {
      const actor = await current.call(this, client, supplied);
      if (!insights && actor.id === ids.drivers[1]) recipientReady.resolve();
      return actor;
    };
    TeamInsightsService.prototype.lockUsers = async function(client, userIds) {
      await lockInsights.call(this, client, userIds);
      if (insights && userIds.includes(ids.drivers[1])) recipientReady.resolve();
    };
    TeamService.prototype.lockScope = async function(client, scope) {
      await lockScope.call(this, client, scope);
      if (!gated) {
        gated = true;
        scopeReady.resolve();
        await recipientReady.promise;
      }
    };
    let first, second;
    try {
      first = write();
      await scopeReady.promise;
      second = concurrent();
      const results = await Promise.all([first, second]);
      return results.map(ok);
    } finally {
      recipientReady.resolve();
      await Promise.allSettled([first, second]);
      TeamService.prototype.current = current;
      TeamService.prototype.lockScope = lockScope;
      TeamInsightsService.prototype.lockUsers = lockInsights;
    }
  }

  for (const [label, patch] of [['explicit mention', mention], ['@all audience', { text: '@all please read', mentions: { userIds: [], all: true } }]]) {
    await t.test(`${label} sends while the recipient reads conversations`, async () => {
      const [saved] = await overlap(() => call('POST', '/team/messages', messageBody(patch)));
      assert.equal((await db.query('SELECT 1 FROM team_message_mentions WHERE message_id=$1 AND user_id=$2', [saved.id, ids.drivers[1]])).rowCount, 1);
    });
  }
  await t.test('editing a message can add an actively reading recipient', async () => {
    const original = ok(await call('POST', '/team/messages', messageBody()));
    const [saved] = await overlap(() => call('PUT', `/team/messages/${original.id}`, {
      responsibilityScopeId: ids.scope, operationId: randomUUID(), version: original.version, ...mention,
    }));
    assert.equal(saved.version, 2);
    assert.equal((await db.query('SELECT 1 FROM team_message_mentions WHERE message_id=$1 AND user_id=$2 AND message_version=2', [saved.id, ids.drivers[1]])).rowCount, 1);
  });
  for (const kind of ['direct', 'channel']) await t.test(`${kind} creation can enroll an actively reading member`, async () => {
    const [saved] = await overlap(() => call('POST', '/team/conversations', conversationBody({
      kind, visibility: 'private', memberIds: [ids.admin, ids.drivers[1]],
    }), admin));
    assert.ok(saved.memberIds.includes(ids.drivers[1]));
  });
  await t.test('channel membership changes can enroll an actively reading member', async () => {
    const [saved] = await overlap(() => call('PUT', `/team/conversations/${channel.id}/access`, {
      responsibilityScopeId: ids.scope, operationId: randomUUID(), version: channel.version,
      visibility: 'private', memberIds: [ids.admin, ids.drivers[0], ids.drivers[1]],
    }, admin));
    assert.ok(saved.memberIds.includes(ids.drivers[1]));
  });
  await t.test('summary schedule recipient locks remain compatible with message references', async () => {
    const [saved, schedule] = await overlap(() => call('POST', '/team/messages', messageBody(mention)), () => call('PUT', '/team/schedules', {
      responsibilityScopeId: ids.scope, id: randomUUID(), enabled: false, frequency: 'daily',
      time: '09:00', timeZone: 'Europe/Moscow', weekday: 1, recipientIds: [ids.drivers[1]],
    }, admin), true);
    assert.ok(saved.id);
    assert.deepEqual(schedule.recipientIds, [ids.drivers[1]]);
  });

  async function waitForLock(pid) {
    const until = Date.now() + 5000;
    while (Date.now() < until) {
      const row = (await db.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1', [pid])).rows[0];
      if (row?.wait_event_type === 'Lock') return;
      await delay(10);
    }
    assert.fail(`Expected database backend ${pid} to wait for its identity lock`);
  }
  for (const restriction of ['grants', 'role', 'active']) await t.test(`a waiting request observes committed ${restriction} revocation`, async () => {
    const client = await db.connect(), entered = deferred();
    const identity = new IdentityRepository({ pool: db });
    const current = TeamService.prototype.current;
    let pending;
    try {
      await client.query('BEGIN');
      await identity.lockUsers(client, [ids.drivers[1]]);
      if (restriction === 'grants') await client.query('DELETE FROM access_grants WHERE user_id=$1', [ids.drivers[1]]);
      if (restriction === 'role') await client.query("UPDATE users SET role='external_recruiter' WHERE id=$1", [ids.drivers[1]]);
      if (restriction === 'active') await client.query('UPDATE users SET active=false WHERE id=$1', [ids.drivers[1]]);
      TeamService.prototype.current = async function(connection, supplied) {
        if (supplied.id === ids.drivers[1]) entered.resolve(connection.processID);
        return current.call(this, connection, supplied);
      };
      const input = messageBody({ text: 'Must not be saved after revocation' });
      pending = call('POST', '/team/messages', input, bob);
      await waitForLock(await entered.promise);
      await client.query('COMMIT');
      const result = await pending;
      assert.equal(result.status, restriction === 'grants' ? 403 : 401);
      assert.equal((await db.query('SELECT 1 FROM team_messages WHERE id=$1', [input.id])).rowCount, 0);
    } finally {
      await client.query('ROLLBACK');
      await Promise.allSettled([pending]);
      TeamService.prototype.current = current;
      client.release();
      await db.query("UPDATE users SET role='dispatcher',active=true WHERE id=$1", [ids.drivers[1]]);
      await db.query('INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING', [ids.drivers[1], ids.legal, ids.region, ids.project, ids.scope]);
    }
  });
  await t.test('revocation waits until an already authorized read finishes', async () => {
    const client = await db.connect(), locked = deferred(), release = deferred();
    const current = TeamService.prototype.current;
    let reading, revoking;
    try {
      TeamService.prototype.current = async function(connection, supplied) {
        const actor = await current.call(this, connection, supplied);
        if (actor.id === ids.drivers[1]) { locked.resolve(); await release.promise; }
        return actor;
      };
      reading = call('GET', scoped('/team/conversations'), undefined, bob);
      await locked.promise;
      await client.query('BEGIN');
      revoking = new IdentityRepository({ pool: db }).lockUsers(client, [ids.drivers[1]]);
      await waitForLock(client.processID);
      release.resolve();
      ok(await reading);
      await revoking;
      await client.query('DELETE FROM access_grants WHERE user_id=$1', [ids.drivers[1]]);
      await client.query('COMMIT');
      assert.equal((await call('GET', scoped('/team/conversations'), undefined, bob)).status, 403);
    } finally {
      release.resolve();
      await Promise.allSettled([reading, revoking]);
      await client.query('ROLLBACK');
      client.release();
      TeamService.prototype.current = current;
    }
  });
});
