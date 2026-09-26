'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createTestServer } = require('./local-test-server.cjs');
const { paddedJpeg } = require('./team-profile-fixture.cjs');

test('large profile, task and outcome requests retain audit attribution, correlation and impersonation restrictions', { timeout: 180000 }, async t => {
  const f = await createTestServer({ staffTeamActors: true });
  t.after(() => f.close());
  const { ids, adminPool: db } = f;
  await db.query(`INSERT INTO team_organization_employees(legal_entity_id,region_id,project_id,responsibility_scope_id,user_id,manager_id,updated_by)
    VALUES($1,$2,$3,$4,$5,$6,$7)`, [ids.legal, ids.region, ids.project, ids.scope, ids.drivers[0], ids.dispatcher, ids.admin]);
  const admin = await f.devLogin(ids.admin);
  const impersonation = await f.request('POST', '/auth/impersonate', { userId: ids.dispatcher }, admin.accessToken);
  assert.equal(impersonation.status, 200);
  const child = impersonation.body;
  async function mutation(method, route, body, action, session = child) {
    const res = await fetch(f.origin + '/api/v1' + route, { method,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.accessToken }, body: JSON.stringify(body) });
    const saved = await res.json();
    assert.ok([200, 201].includes(res.status), JSON.stringify(saved));
    const correlation = res.headers.get('x-correlation-id');
    assert.match(correlation, /^[a-f0-9-]{36}$/);
    assert.match(res.headers.get('cache-control'), /no-store/);
    const events = (await db.query("SELECT payload FROM audit_events WHERE payload->>'correlationId'=$1 AND payload->>'action'=$2", [correlation, action])).rows;
    assert.equal(events.length, 1, `${action} must share the HTTP request correlation`);
    const event = events[0].payload;
    assert.equal(event.actorId, ids.dispatcher);
    if (session.actor.impersonation) {
      assert.equal(event.metadata.impersonation.administratorId, ids.admin);
      assert.equal(event.metadata.impersonation.targetUserId, ids.dispatcher);
      assert.equal(event.metadata.impersonation.sessionId, session.actor.sessionId);
    } else assert.equal(event.metadata.impersonation, undefined);
    return saved;
  }
  await mutation('PUT', '/profile', { operationId: randomUUID(), version: 0, contacts: 'Synthetic contact',
    photo: { contentBase64: paddedJpeg().toString('base64') } }, 'profile.updated');
  const task = await mutation('POST', '/team/tasks', { id: randomUUID(), responsibilityScopeId: ids.scope, operationId: randomUUID(),
    title: 'Audit task', description: 'Created by an impersonated manager', assigneeId: ids.drivers[0], dueDate: '2026-12-20' }, 'team.task.create');
  await mutation('PUT', '/team/tasks/' + task.id, { responsibilityScopeId: ids.scope, operationId: randomUUID(), version: task.version,
    title: 'Updated audit task', description: task.description, assigneeId: ids.drivers[0], dueDate: '2026-12-20' }, 'team.task.edit');
  const reports = await f.request('GET', `/team/outcomes?responsibilityScopeId=${ids.scope}&kind=weekly`, undefined, child.accessToken);
  assert.equal(reports.status, 200);
  const report = reports.body.reports.find(row => row.ownerId === ids.dispatcher);
  assert.ok(report);
  const outcomeInput = { responsibilityScopeId: ids.scope, operationId: randomUUID(), version: report.version,
    done: 'D'.repeat(6000), inProgress: 'P'.repeat(6000), blockers: 'B'.repeat(6000), nextMonthFocus: '', gratitude: [], submit: false };
  const denied = await f.request('PUT', '/team/outcomes/' + report.id, outcomeInput, child.accessToken);
  assert.equal(denied.status, 403, 'impersonation cannot submit or edit an employee outcome');
  assert.equal((await db.query('SELECT version FROM team_outcome_reports WHERE id=$1', [report.id])).rows[0].version, report.version);
  const owner = await f.devLogin(ids.dispatcher);
  await mutation('PUT', '/team/outcomes/' + report.id, outcomeInput, 'team.outcome.draft_saved', owner);
});
