'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createTestServer } = require('./local-test-server.cjs');

test('task pagination preserves PostgreSQL microseconds and checks cursor access', { timeout: 180000 }, async t => {
  const f = await createTestServer({ staffTeamActors: true });
  t.after(() => f.close());
  const { ids, adminPool: db } = f;
  const admin = await f.devLogin(ids.admin), employee = await f.devLogin(ids.drivers[0]);
  const call = (method, route, body, session = admin) => f.request(method, route, body, session.accessToken);
  const ok = result => {
    assert.ok([200, 201].includes(result.status), `${result.status} ${JSON.stringify(result.body)}`);
    return result.body;
  };
  const conversation = ok(await call('POST', '/team/conversations', {
    id: randomUUID(), responsibilityScopeId: ids.scope, kind: 'channel', title: 'Task pagination', memberIds: [],
  }));
  const message = ok(await call('POST', '/team/messages', {
    id: randomUUID(), responsibilityScopeId: ids.scope, conversationId: conversation.id, text: 'Task source',
  }));
  await db.query(`INSERT INTO team_tasks(id,legal_entity_id,region_id,project_id,responsibility_scope_id,
    title,author_id,assignee_id,conversation_id,message_id,updated_by,updated_at)
    SELECT gen_random_uuid(),$1,$2,$3,$4,'Task '||n,$5,$6,$7,$8,$5,
      '2026-09-20 12:00:00.123000+00'::timestamptz+CASE WHEN n<=102 THEN interval '456 microseconds' ELSE interval '999 microseconds' END
    FROM generate_series(1,205) n`, [ids.legal, ids.region, ids.project, ids.scope, ids.admin, ids.drivers[0], conversation.id, message.id]);
  const expected = (await db.query('SELECT id FROM team_tasks WHERE responsibility_scope_id=$1 ORDER BY updated_at DESC,id DESC', [ids.scope])).rows.map(row => row.id);
  for (const [label, session] of [['administrator', admin], ['assignee', employee]]) await t.test(`${label} receives every task once across timestamp ties`, async () => {
    const found = [], sizes = [];
    let before;
    do {
      const page = ok(await call('GET', `/team/tasks?responsibilityScopeId=${ids.scope}${before ? `&before=${before}` : ''}`, undefined, session));
      sizes.push(page.tasks.length);
      found.push(...page.tasks.map(row => row.id));
      if (!page.hasMore) { assert.equal(page.nextBefore, null); break; }
      assert.equal(page.nextBefore, page.tasks.at(-1).id);
      before = page.nextBefore;
      assert.ok(sizes.length < 4, 'pagination must advance');
    } while (true);
    assert.deepEqual(sizes, [100, 100, 5]);
    assert.deepEqual(found, expected);
    assert.equal(new Set(found).size, 205);
  });
  await t.test('inaccessible and nonexistent task IDs cannot be used as cursors', async () => {
    const hidden = randomUUID();
    await db.query(`INSERT INTO team_tasks(id,legal_entity_id,region_id,project_id,responsibility_scope_id,
      title,author_id,assignee_id,conversation_id,message_id,updated_by)
      VALUES($1,$2,$3,$4,$5,'Private task',$6,$7,$8,$9,$6)`,
    [hidden, ids.legal, ids.region, ids.project, ids.scope, ids.admin, ids.drivers[1], conversation.id, message.id]);
    for (const id of [hidden, randomUUID()]) assert.equal((await call('GET', `/team/tasks?responsibilityScopeId=${ids.scope}&before=${id}`, undefined, employee)).status, 404);
  });
});
