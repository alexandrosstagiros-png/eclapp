"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createTestServer } = require('./local-test-server.cjs');
function definition(label = 'Синтетическая форма') {
  return { label, kind: 'table', sections: [{ id: 's_main', label: 'Раздел клиента', columns: [
    { key: 'c_driver', label: 'Водитель', type: 'text', source: 'driver_name', owner: 'driver', required: true, defaultValue: '', hint: '' },
    { key: 'c_gate', label: 'КПП', type: 'text', source: 'manual', owner: 'assignment', required: true, defaultValue: 'Синтетический КПП', hint: '' },
  ] }] };
}
function expect(response, status) {
  assert.equal(response.status, status, `Expected HTTP ${status}, got ${response.status}: ${JSON.stringify(response.body)}`);
  return response.body;
}
test('versioned client form constructor persists authoritative snapshots and exact scoped defaults', { timeout: 180_000 }, async t => {
  const fixture = await createTestServer(); t.after(() => fixture.close());
  const { request, devLogin, ids, adminPool: db } = fixture;
  await db.query("UPDATE users SET role='manager' WHERE id=$1", [ids.dispatcher]);
  await db.query('UPDATE access_grants SET personal_data_visible=true WHERE user_id=ANY($1::uuid[])', [[ids.dispatcher, ids.admin]]);
  const manager = await devLogin(ids.dispatcher), admin = await devLogin(ids.admin), driver = await devLogin(ids.drivers[0]);
  const peerScope = randomUUID();
  await db.query('INSERT INTO responsibility_scopes(id,project_id,name) VALUES($1,$2,$3)', [peerScope, ids.project, 'Синтетическая другая область']);
  await db.query(`INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id,personal_data_visible)
    VALUES($1,$2,$3,$4,$5,true)`, [ids.admin, ids.legal, ids.region, ids.project, peerScope]);
  const templatesPath = scope => `/planning/templates?responsibilityScopeId=${scope}`;
  const readPlan = day => `/planning?responsibilityScopeId=${ids.scope}&date=${day}`;
  const templateId = randomUUID(), secondId = randomUUID();
  const body = (patch = {}) => ({ responsibilityScopeId: ids.scope, id: templateId, version: 0, definition: definition(), makeDefault: true, ...patch });
  const plan = (patch = {}) => ({ businessDate: '2026-09-17', responsibilityScopeId: ids.scope, templateId, templateVersion: 1,
    version: 0, rows: [{ id: randomUUID(), comment: 'SYNTHETIC_PRIVATE_COMMENT', clientFields: { c_gate: 'SYNTHETIC_PRIVATE_GATE' } }], ...patch });
  let firstTemplate, firstPlan;
  await t.test('requires current role and personal-data scope and provides the frozen builtin catalog', async () => {
    expect(await request('GET', templatesPath(ids.scope)), 401);
    expect(await request('PUT', '/planning/templates', body()), 401);
    expect(await request('GET', templatesPath(ids.scope), undefined, driver.accessToken), 403);
    expect(await request('PUT', '/planning/templates', body(), driver.accessToken), 403);
    expect(await request('GET', templatesPath(peerScope), undefined, manager.accessToken), 403);
    const catalog = expect(await request('GET', templatesPath(ids.scope), undefined, manager.accessToken), 200);
    assert.equal(catalog.templates.length, 16); assert.equal(catalog.defaultTemplateId, null);
    assert.ok(catalog.templates.every(template => template.version === 1 && template.custom === false));
    assert.equal(catalog.templates.find(template => template.id === 'metro').sections.length, 2);
    expect(await request('PUT', '/planning/templates', body({ id: 'general' }), manager.accessToken), 400);
    expect(await request('PUT', '/planning/templates', body({ definition: { ...definition(), script: 'arbitrary code' } }), manager.accessToken), 400);
  });
  await t.test('creates a scoped version and pins its authoritative definition in a plan', async () => {
    firstTemplate = expect(await request('PUT', '/planning/templates', body(), manager.accessToken), 200).template;
    assert.equal(firstTemplate.id, templateId); assert.equal(firstTemplate.version, 1); assert.equal(firstTemplate.custom, true);
    const list = expect(await request('GET', templatesPath(ids.scope), undefined, admin.accessToken), 200);
    assert.equal(list.defaultTemplateId, templateId);
    assert.deepEqual(list.templates.find(template => template.id === templateId), firstTemplate);
    const draft = plan();
    firstPlan = expect(await request('PUT', '/planning', draft, manager.accessToken), 200);
    assert.deepEqual(firstPlan.templateSnapshot, firstTemplate); assert.equal(firstPlan.templateVersion, 1);
    assert.equal(firstPlan.rows[0].driverId, null); // Required fields may be incomplete in a shared draft.
    expect(await request('PUT', '/planning', { ...draft, templateSnapshot: definition('FORGED') }, manager.accessToken), 400);
    expect(await request('PUT', '/planning', plan({ businessDate: '2026-09-18', templateVersion: undefined }), manager.accessToken), 400);
    expect(await request('PUT', '/planning', plan({ businessDate: '2026-09-18', templateVersion: 99 }), manager.accessToken), 400);
  });
  await t.test('publishing changes leaves existing and subsequently edited old-version plans unchanged', async () => {
    const changed = definition('Новая версия клиента');
    changed.sections[0].columns[1].label = 'Изменённое название КПП';
    changed.sections[0].columns.push({ key: 'c_count', label: 'Рейсы', source: 'trip_count', type: 'number', owner: 'assignment', required: false, defaultValue: '', hint: '' });
    const second = expect(await request('PUT', '/planning/templates', body({ version: 1, definition: changed }), admin.accessToken), 200).template;
    assert.equal(second.version, 2);
    assert.deepEqual(expect(await request('GET', readPlan('2026-09-17'), undefined, manager.accessToken), 200).templateSnapshot, firstTemplate);
    const edited = expect(await request('PUT', '/planning', plan({ version: 1, rows: firstPlan.rows }), manager.accessToken), 200);
    assert.deepEqual(edited.templateSnapshot, firstTemplate); assert.equal(edited.templateVersion, 1);
    const later = expect(await request('PUT', '/planning', plan({ businessDate: '2026-09-18', templateVersion: 2 }), manager.accessToken), 200);
    assert.deepEqual(later.templateSnapshot, second);
    const catalog = expect(await request('GET', templatesPath(ids.scope), undefined, manager.accessToken), 200);
    assert.equal(catalog.templates.filter(template => template.id === templateId).length, 1);
    assert.equal(catalog.templates.find(template => template.id === templateId).version, 2);
    await fixture.restartApi();
    assert.deepEqual(expect(await request('GET', readPlan('2026-09-17'), undefined, manager.accessToken), 200).templateSnapshot, firstTemplate);
  });
  await t.test('default bindings are isolated and clearing another form never clears the selected default', async () => {
    assert.equal(expect(await request('PUT', '/planning/templates', body({ id: secondId }), manager.accessToken), 200).defaultTemplateId, secondId);
    assert.equal(expect(await request('PUT', '/planning/templates', body({ version: 2, makeDefault: false }), manager.accessToken), 200).defaultTemplateId, secondId);
    assert.equal(expect(await request('PUT', '/planning/templates', body({ id: secondId, version: 1, makeDefault: false }), manager.accessToken), 200).defaultTemplateId, null);
    const other = expect(await request('GET', templatesPath(peerScope), undefined, admin.accessToken), 200);
    assert.equal(other.templates.length, 16); assert.equal(other.defaultTemplateId, null);
    expect(await request('PUT', '/planning', plan({ responsibilityScopeId: peerScope }), admin.accessToken), 400);
    expect(await request('PUT', '/planning/templates', body({ responsibilityScopeId: peerScope, version: 3 }), admin.accessToken), 403);
    expect(await request('PUT', '/planning/templates', body({ responsibilityScopeId: peerScope, id: randomUUID() }), manager.accessToken), 403);
    expect(await request('PUT', '/planning/templates', { ...body(), legalEntityId: randomUUID() }, manager.accessToken), 400);
  });
  await t.test('optimistic editing handles concurrent create/update and immutable versions lack runtime update privileges', async () => {
    const race = body({ id: randomUUID() });
    const created = await Promise.all([request('PUT', '/planning/templates', race, manager.accessToken), request('PUT', '/planning/templates', race, admin.accessToken)]);
    assert.deepEqual(created.map(result => result.status).sort(), [200, 409]);
    const updates = await Promise.all([request('PUT', '/planning/templates', { ...race, version: 1, definition: definition('A') }, manager.accessToken), request('PUT', '/planning/templates', { ...race, version: 1, definition: definition('B') }, admin.accessToken)]);
    assert.deepEqual(updates.map(result => result.status).sort(), [200, 409]);
    assert.equal(Number((await db.query('SELECT count(*) AS count FROM planning_template_versions WHERE template_id=$1', [race.id])).rows[0].count), 2);
    const permission = (await db.query("SELECT has_table_privilege('transport_app','planning_template_versions','UPDATE') AS update,has_table_privilege('transport_app','planning_template_versions','DELETE') AS delete")).rows[0];
    assert.deepEqual(permission, { update: false, delete: false });
    const events = (await db.query("SELECT payload FROM audit_events WHERE payload->>'action' LIKE 'planning.%'")).rows;
    assert.ok(events.some(event => event.payload.action === 'planning.template_created'));
    assert.ok(events.some(event => event.payload.action === 'planning.template_updated'));
    assert.ok(!JSON.stringify(events).includes('SYNTHETIC_PRIVATE')); assert.ok(!JSON.stringify(events).includes('Синтетический КПП'));
  });
  await t.test('legacy builtin requests and stored pre-migration plans resolve v1, while unknown forms fail', async () => {
    const legacy = expect(await request('PUT', '/planning', plan({ businessDate: '2026-09-21', templateId: 'metro', templateVersion: undefined }), manager.accessToken), 200);
    assert.equal(legacy.templateVersion, 1); assert.equal(legacy.templateSnapshot.custom, false);
    await db.query('UPDATE planning_plans SET template_version=NULL,template_snapshot=NULL WHERE id=$1', [legacy.id]);
    const loaded = expect(await request('GET', readPlan('2026-09-21'), undefined, manager.accessToken), 200);
    assert.deepEqual(loaded.templateSnapshot, legacy.templateSnapshot);
    expect(await request('PUT', '/planning', plan({ businessDate: '2026-09-22', templateId: 'unknown', templateVersion: undefined }), manager.accessToken), 400);
    expect(await request('PUT', '/planning', plan({ businessDate: '2026-09-22', templateId: 'general', templateVersion: 2 }), manager.accessToken), 400);
  });
  await t.test('revoking scope or session immediately blocks constructor data and mutations', async () => {
    await db.query('UPDATE access_grants SET personal_data_visible=false WHERE user_id=$1', [ids.dispatcher]);
    expect(await request('GET', templatesPath(ids.scope), undefined, manager.accessToken), 403);
    expect(await request('PUT', '/planning/templates', body({ version: 3 }), manager.accessToken), 403);
    expect(await request('GET', readPlan('2026-09-17'), undefined, manager.accessToken), 403);
    await db.query('UPDATE sessions SET revoked_at=clock_timestamp() WHERE user_id=$1', [ids.admin]);
    expect(await request('GET', templatesPath(ids.scope), undefined, admin.accessToken), 401);
  });
});
