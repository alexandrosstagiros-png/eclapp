'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createTestServer } = require('./local-test-server.cjs');
const { buildDailyReport } = require('../recovered/apps/api/src/modules/planning/planning-daily-report');

test('daily report reads exact dated planning and actual trip facts in one PostgreSQL snapshot without document data', { timeout: 180000 }, async t => {
  const fixture = await createTestServer(), db = fixture.adminPool, { ids } = fixture;
  t.after(() => fixture.close());
  const source = { legalEntityId: ids.legal, regionId: ids.region, projectId: ids.project, responsibilityScopeId: ids.scope };
  const tuple = [ids.legal, ids.region, ids.project, ids.scope], date = '2026-09-28';
  const vehicle = randomUUID(), imported = randomUUID(), otherScope = randomUUID();
  await db.query("INSERT INTO vehicles VALUES($1,'Synthetic report vehicle','box',1500,'own')", [vehicle]);
  await db.query("INSERT INTO responsibility_scopes VALUES($1,$2,'Synthetic excluded scope')", [otherScope, ids.project]);
  const rows = [{ id: randomUUID(), vehicleId: vehicle, driverId: ids.drivers[0], status: 'work', tripCount: 2,
    comment: 'PRIVATE_COMMENT_SENTINEL', clientFields: { passport: 'PRIVATE_PASSPORT_SENTINEL' },
    reporting: { block: 'city', managerId: ids.admin, cityName: 'Казань', clientName: 'Хофф' } },
  { id: randomUUID(), vehicleId: imported, status: 'no_work', tripCount: 1, reporting: { block: 'crew', crewRequired: 2, crewPresent: 2, cityName: 'Санкт-Петербург', clientName: 'Лемана' } }];
  async function plan(scopeId, businessDate, data) {
    await db.query(`INSERT INTO planning_plans(id,business_date,legal_entity_id,region_id,project_id,responsibility_scope_id,template_id,rows,created_by,updated_by)
      VALUES($1,$2,$3,$4,$5,$6,'generic',$7::jsonb,$8,$8)`, [randomUUID(), businessDate, ...tuple.slice(0, 3), scopeId, JSON.stringify(data), ids.admin]);
  }
  await plan(ids.scope, date, rows);
  await plan(otherScope, date, [{ id: randomUUID(), vehicleId: randomUUID(), status: 'repair', reporting: { block: 'city' } }]);
  await plan(ids.scope, '2026-09-27', [{ id: randomUUID(), vehicleId: randomUUID(), status: 'repair', reporting: { block: 'city' } }]);
  await db.query(`INSERT INTO planning_resource_data(legal_entity_id,region_id,project_id,responsibility_scope_id,kind,resource_id,data,source_sha256,source_name,source_row)
    VALUES($1,$2,$3,$4,'vehicle',$5,$6::jsonb,$7,'synthetic.csv',2)`, [...tuple, imported, JSON.stringify({ ownership_type: 'Наём', vehicle_condition_notes: 'PRIVATE_NOTES_SENTINEL' }), '0'.repeat(64)]);
  for (let index = 0; index < 3; index++) {
    const tripId = randomUUID();
    await db.query(`INSERT INTO trips(id,reference,business_date,legal_entity_id,region_id,project_id,responsibility_scope_id,vehicle_id,route_summary)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,'Synthetic daily route')`, [tripId, `SYN-${tripId}`, date, ...tuple, vehicle]);
    if (index < 2) for (const kind of ['check_in', 'check_out']) await db.query(`INSERT INTO workflow_attendance(id,trip_id,actor_id,kind,occurred_at,channel)
      VALUES($1,$2,$3,$4,$5,'dev')`, [randomUUID(), tripId, ids.drivers[0], kind, `${date}T10:00:00Z`]);
  }
  const actor = { id: ids.admin, grants: [{ ...source, personalDataVisible: true }] };
  const connection = await db.connect();
  try {
    await connection.query('BEGIN'); await connection.query('SET LOCAL ROLE transport_app');
    let queries = 0;
    const reader = { query: (...args) => { queries += 1; return connection.query(...args); } };
    const result = await buildDailyReport(reader, actor, [source], date);
    assert.equal(queries, 1);
    assert.equal(result.summary.total, 2); assert.equal(result.summary.onLine, 1); assert.equal(result.summary.actualTrips, 2); assert.equal(result.summary.extraTrips, 1);
    assert.equal(result.summary.fleet.own.total, 1); assert.equal(result.summary.fleet.subcontracted.total, 1); assert.equal(result.summary.reasons.no_work, 1);
    assert.equal(result.coverage.planCount, 1); assert.equal(result.summary.fleet.own.repair, 0);
    assert.deepEqual(new Set(result.byCity.map(group => group.id)), new Set(['label:казань', 'label:санкт-петербург']));
    assert.deepEqual(new Set(result.byClient.map(group => group.id)), new Set(['label:хофф', 'label:лемана']));
    const name = (await connection.query('SELECT display_name FROM users WHERE id=$1', [ids.admin])).rows[0].display_name;
    assert.ok(result.text.includes(name));
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE_COMMENT|PRIVATE_PASSPORT|PRIVATE_NOTES/);
    const publicReport = await buildDailyReport(connection, actor, [source], date, { publicAudience: true });
    assert.ok(!publicReport.text.includes(name));
    const hidden = await buildDailyReport(connection, { id: ids.drivers[0], grants: [{ ...source, personalDataVisible: false }] }, [source], date);
    assert.ok(!hidden.text.includes(name));
    await connection.query('ROLLBACK');
  } finally { connection.release(); }
});
