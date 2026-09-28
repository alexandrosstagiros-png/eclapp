'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const { planInput } = require('../recovered/apps/api/src/modules/planning/planning-input');
const plan = rows => ({ businessDate: '2026-09-28', responsibilityScopeId: randomUUID(), templateId: 'general', version: 0, rows });
const row = patch => ({ id: randomUUID(), vehicleId: randomUUID(), status: 'work', ...patch });
const invalid = fn => assert.throws(fn, error => error.getStatus() === 400);

test('daily facts distinguish unknown from explicit zero and preserve real operational incidents', () => {
  const managerId = randomUUID();
  const reporting = { block: 'crew', fleetType: 'own', managerId, actualTrips: 2, crewRequired: 2, crewPresent: 2 };
  assert.deepEqual(planInput(plan([row({ reporting })])).rows[0].reporting, reporting);
  assert.equal(planInput(plan([row({ reporting: { actualTrips: null } })])).rows[0].reporting.actualTrips, null);
  assert.equal(planInput(plan([row({ reporting: { actualTrips: 0 } })])).rows[0].reporting.actualTrips, 0);
  assert.equal(Object.hasOwn(planInput(plan([row({})])).rows[0], 'reporting'), false, 'legacy plans remain unchanged');
  const labels = planInput(plan([row({ reporting: { cityName: ' Санкт-Петербург ', clientName: 'Хофф' } })])).rows[0].reporting;
  assert.equal(labels.cityName, 'Санкт-Петербург');
  assert.equal(labels.clientName, 'Хофф');
  for (const patch of [{ actualTrips: -1 }, { actualTrips: 1.5 }, { actualTrips: '2' }, { actualTrips: 1000 }, { crewRequired: 0 },
    { crewPresent: 100 }, { block: 'guessed' }, { fleetType: 'rent' }, { managerId: 'name' }, { extra: true }, { cityName: 123 }, { clientName: 'x'.repeat(101) }, { cityName: 'a\nb' }]) {
    invalid(() => planInput(plan([row({ reporting: { ...reporting, ...patch } })])));
  }
  invalid(() => planInput(plan([row({ vehicleId: null, reporting })])));
  for (const status of ['off', 'repair', 'sick', 'no_work', 'no_driver', 'crew_shortage', 'failed', 'reserve', 'paid_reserve', 'transferred', 'cancelled']) {
    assert.equal(planInput(plan([row({ status, reporting })])).rows[0].reporting.actualTrips, 2, 'real releases must remain recordable even when other facts require review');
    assert.equal(planInput(plan([row({ status, reporting: { actualTrips: 0 } })])).rows[0].status, status);
  }
  assert.equal(planInput(plan([row({ reporting: { ...reporting, crewPresent: 1 } })])).rows[0].reporting.crewPresent, 1);
});

test('calendar copy and resource replacement cannot carry yesterday release facts to a different day or vehicle', async () => {
  const model = await import(pathToFileURL(path.resolve(__dirname, '../recovered/apps/office-web/src/planning-model.js')));
  const calendar = await import(pathToFileURL(path.resolve(__dirname, '../recovered/apps/office-web/src/planning-calendar-model.js')));
  const reporting = { block: 'crew', managerId: randomUUID(), fleetType: 'own', actualTrips: 2, crewRequired: 2, crewPresent: 2 };
  const sourceRow = row({ reporting, driverId: randomUUID(), confirmed: true, arrived: true, clientFields: {} });
  const source = { ...plan([sourceRow]), templateVersion: 1, templateSnapshot: model.templateFor('general') };
  const copied = calendar.copyCalendarDays({ plans: { '2026-09-28': source }, sourceDate: '2026-09-28', targetDates: ['2026-09-29'] });
  const copy = copied.plans['2026-09-29'].rows[0];
  assert.deepEqual(copy.reporting, { ...reporting, actualTrips: null, crewPresent: null });
  assert.equal(sourceRow.reporting.actualTrips, 2);
  assert.equal(copy.arrived, false);
  const replacement = calendar.changeCalendarAssignment(sourceRow, { vehicleId: randomUUID() }, model.templateFor('general'));
  assert.deepEqual(replacement.reporting, { ...reporting, fleetType: null, actualTrips: null, crewPresent: null });
  assert.equal(replacement.confirmed, false);
  const otherDriver = calendar.changeCalendarAssignment(sourceRow, { driverId: randomUUID() }, model.templateFor('general'));
  assert.equal(otherDriver.reporting.actualTrips, null);
  assert.equal(otherDriver.reporting.fleetType, 'own');
});
