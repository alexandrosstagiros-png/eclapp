'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { aggregateDailyReport, ownership } = require('../recovered/apps/api/src/modules/planning/planning-daily-report');
const DATE = '2026-09-28';
const scope = (overrides = {}) => ({ legalEntityId: randomUUID(), regionId: randomUUID(), projectId: randomUUID(), responsibilityScopeId: randomUUID(), regionName: 'Москва', projectName: 'Хофф', scopeName: 'Доставка', ...overrides });
const row = (overrides = {}) => ({ id: randomUUID(), vehicleId: randomUUID(), driverId: randomUUID(), status: 'work', tripCount: 1, ...overrides });
function report(rows, extra = {}) {
  const source = extra.scope || scope();
  return aggregateDailyReport({ businessDate: DATE, sourceScopes: [source], plans: [{ businessDate: DATE, responsibilityScopeId: source.responsibilityScopeId, rows }], ...extra });
}
const issue = (result, code) => result.issues.find(value => value.code === code);

test('daily report reproduces both fleet baselines with one denominator and separate additional trips', () => {
  const crew = scope(), city = scope({ regionName: 'Санкт-Петербург', projectName: 'Город' });
  function fleet(count, own, releasedOwn, releasedHired, block, repair) {
    return Array.from({ length: count }, (_, i) => {
      const owned = i < own, released = owned ? i < releasedOwn : i - own < releasedHired;
      return row({ status: released ? 'work' : owned && i < releasedOwn + repair ? 'repair' : 'off',
        reporting: { block, fleetType: owned ? 'own' : 'subcontracted', actualTrips: released ? 1 : 0,
          ...(block === 'crew' ? { crewRequired: 2, crewPresent: 2 } : {}) } });
    });
  }
  const crewRows = fleet(188, 32, 17, 93, 'crew', 7), cityRows = fleet(191, 103, 62, 49, 'city', 1);
  cityRows[0].reporting.actualTrips = 3;
  const result = aggregateDailyReport({ businessDate: DATE, sourceScopes: [crew, city], plans: [
    { businessDate: DATE, responsibilityScopeId: crew.responsibilityScopeId, rows: crewRows },
    { businessDate: DATE, responsibilityScopeId: city.responsibilityScopeId, rows: cityRows },
  ] });
  const a = result.blocks.find(value => value.id === 'crew'), b = result.blocks.find(value => value.id === 'city');
  assert.equal(a.total, 188); assert.equal(a.onLine, 110); assert.equal(a.releasePercent, 58.5);
  assert.equal(a.fleet.own.repair, 7); assert.equal(a.technicalReadiness, 78.1);
  assert.equal(b.total, 191); assert.equal(b.onLine, 111); assert.equal(b.releasePercent, 58.1);
  assert.equal(b.actualTrips, 113); assert.equal(b.extraTrips, 2); assert.equal(b.fleet.own.total, 103);
  assert.equal(result.summary.total, 379); assert.equal(result.summary.onLine, 221);
  assert.equal(result.summary.notReleased + result.summary.onLine + result.summary.unconfirmed, 379);
  assert.match(result.text, /Учтено машин: 379/); assert.ok(result.text.length <= 12000);
});

test('work, confirmed and arrived flags do not fabricate actual release; absent resources are not idle', () => {
  const result = report([row({ confirmed: true, arrived: true, reporting: { block: 'city', fleetType: 'own' } }), row({ vehicleId: null, status: 'no_driver' })]);
  assert.equal(result.summary.total, 1); assert.equal(result.summary.planned, 1); assert.equal(result.summary.onLine, 0);
  assert.equal(result.summary.unconfirmed, 1); assert.equal(result.summary.notReleased, 0);
  assert.equal(result.summary.reasons.no_driver, 0); assert.equal(result.coverage.unallocatedRows, 1);
  assert.ok(issue(result, 'actual_unknown'));
});

test('distinct attended trip IDs establish actual release and manual fact overrides with visible conflict', () => {
  const source = scope(), vehicleId = randomUUID(), first = randomUUID(), second = randomUUID();
  const attendance = [first, first, second].map(tripId => ({ businessDate: DATE, responsibilityScopeId: source.responsibilityScopeId, vehicleId, tripId }));
  let result = report([row({ vehicleId })], { scope: source, attendance });
  assert.equal(result.summary.onLine, 1); assert.equal(result.summary.actualTrips, 2); assert.equal(result.summary.extraTrips, 1);
  result = report([row({ vehicleId, status: 'no_work', reporting: { actualTrips: 0 } })], { scope: source, attendance });
  assert.equal(result.summary.onLine, 0); assert.equal(result.summary.notReleased, 1); assert.equal(result.summary.actualTrips, 0);
  assert.ok(issue(result, 'actual_override'));
});

test('same vehicle across scopes is counted once and conflicting attribution has its own groups', () => {
  const a = scope(), b = scope(), vehicleId = randomUUID(), manager1 = randomUUID(), manager2 = randomUUID();
  const rows = [row({ vehicleId, tripCount: 2, reporting: { actualTrips: 2, block: 'crew', fleetType: 'own', managerId: manager1 } }), row({ vehicleId, tripCount: 3, reporting: { actualTrips: 2, block: 'city', fleetType: 'subcontracted', managerId: manager2 } })];
  const result = aggregateDailyReport({ businessDate: DATE, sourceScopes: [a, b], managers: [{ id: manager1, name: 'А' }, { id: manager2, name: 'Б' }], plans: [
    { businessDate: DATE, responsibilityScopeId: a.responsibilityScopeId, rows: [rows[0]] },
    { businessDate: DATE, responsibilityScopeId: b.responsibilityScopeId, rows: [rows[1]] },
  ] });
  assert.equal(result.summary.total, 1); assert.equal(result.summary.actualTrips, 2); assert.equal(result.summary.plannedTrips, 3);
  assert.equal(result.blocks[0].id, 'conflict'); assert.equal(result.byCity[0].id, 'conflict');
  assert.equal(result.byClient[0].id, 'conflict'); assert.equal(result.byManager[0].id, 'conflict');
  assert.equal(result.summary.fleet.unknown.total, 1); assert.ok(issue(result, 'duplicate_vehicle')); assert.ok(issue(result, 'fleet_conflict'));
});

test('unknown classification remains unknown and last editor never becomes manager', () => {
  const source = scope(), id = randomUUID(), result = report([row({ vehicleId: id })], { scope: source,
    plans: [{ businessDate: DATE, responsibilityScopeId: source.responsibilityScopeId, updatedBy: 'manager', rows: [row({ vehicleId: id })] }],
    vehicles: [{ id, responsibilityScopeId: source.responsibilityScopeId, ownershipType: 'Свой / Наём' }], managers: [{ id: 'manager', name: 'Редактор' }] });
  assert.equal(result.blocks[0].id, 'unknown'); assert.equal(result.summary.fleet.unknown.total, 1); assert.equal(result.byManager[0].id, 'unknown');
  assert.ok(issue(result, 'block_unknown')); assert.ok(issue(result, 'manager_unknown'));
});

test('ownership resolves only exact unambiguous aliases and real fleet type supplies fallback', () => {
  for (const value of ['Свой', 'Собственный парк', ' own ']) assert.equal(ownership(value), 'own');
  for (const value of ['Наём', 'Наемный', 'subcontracted']) assert.equal(ownership(value), 'subcontracted');
  for (const value of ['Свой / Наём', 'аренда', '', null, 'наемный или свой']) assert.equal(ownership(value), null);
  const source = scope(), id = randomUUID();
  const result = report([row({ vehicleId: id })], { scope: source, vehicles: [{ id, responsibilityScopeId: source.responsibilityScopeId, fleetType: 'own', ownershipType: 'Наем' }] });
  assert.equal(result.summary.fleet.own.total, 1);
});

test('crew completeness is counted independently, released incomplete crew is a visible contradiction', () => {
  const result = report([row({ reporting: { block: 'crew', fleetType: 'own', actualTrips: 1, crewRequired: 2, crewPresent: 1 } }),
    row({ status: 'crew_shortage', reporting: { block: 'crew', crewRequired: 2, crewPresent: 0 } })]);
  assert.equal(result.summary.crew.assessed, 2); assert.equal(result.summary.crew.short, 2);
  assert.equal(result.summary.onLine, 1); assert.equal(result.summary.reasons.crew_shortage, 1);
  assert.ok(issue(result, 'crew_short_released'));
});

test('missing dates, empty plans and zero denominator preserve no-data semantics', () => {
  const source = scope();
  const result = aggregateDailyReport({ businessDate: DATE, sourceScopes: [source], plans: [{ businessDate: '2026-09-27', responsibilityScopeId: source.responsibilityScopeId, rows: [row()] }] });
  assert.equal(result.summary.total, 0); assert.equal(result.summary.releasePercent, null); assert.equal(result.summary.technicalReadiness, null);
  assert.equal(result.coverage.planCount, 0); assert.deepEqual(result.coverage.missingScopeIds, [source.responsibilityScopeId]);
  assert.ok(issue(result, 'missing_plan')); assert.match(result.text, /отсутствие данных/); assert.doesNotMatch(result.text, /NaN|Infinity/);
  assert.throws(() => aggregateDailyReport({ businessDate: '2026-02-30' }));
});

test('conflicting statuses never manufacture repair readiness, actual fact still wins with warning', () => {
  const id = randomUUID();
  const result = report([row({ vehicleId: id, reporting: { actualTrips: 1, fleetType: 'own' } }), row({ vehicleId: id, status: 'repair', reporting: { fleetType: 'own' } })]);
  assert.equal(result.summary.total, 1); assert.equal(result.summary.onLine, 1); assert.equal(result.summary.technicalReadiness, null);
  assert.ok(issue(result, 'status_conflict')); assert.ok(issue(result, 'release_status_conflict'));
});

test('conflicting positive trip counts retain proven release while exact trips require review', () => {
  const vehicleId = randomUUID(), result = report([row({ vehicleId, reporting: { actualTrips: 1 } }), row({ vehicleId, reporting: { actualTrips: 2 } })]);
  assert.equal(result.summary.onLine, 1); assert.equal(result.summary.unconfirmed, 0); assert.equal(result.summary.actualTrips, 0);
  assert.equal(result.summary.onLineWithoutTripCount, 1);
  assert.equal(result.summary.unknownTripVehicles, 1);
  assert.ok(issue(result, 'actual_conflict'));
  const mixed = report([row({ vehicleId, reporting: { actualTrips: 0 } }), row({ vehicleId, reporting: { actualTrips: 1 } })]);
  assert.equal(mixed.summary.onLine, 0); assert.equal(mixed.summary.unconfirmed, 1);
});

test('observed actual release without a plan appears with missing coverage and no invented block', () => {
  const source = scope(), vehicleId = randomUUID();
  const result = aggregateDailyReport({ businessDate: DATE, sourceScopes: [source], attendance: [{ businessDate: DATE, vehicleId, tripId: randomUUID(), responsibilityScopeId: source.responsibilityScopeId }] });
  assert.equal(result.summary.total, 1); assert.equal(result.summary.onLine, 1); assert.equal(result.summary.planned, 0);
  assert.equal(result.blocks[0].id, 'unknown'); assert.ok(issue(result, 'missing_plan')); assert.ok(issue(result, 'actual_without_plan'));
});

test('large report keeps exact full totals and diagnostics while bounding chat text', () => {
  const sourceScopes = Array.from({ length: 220 }, (_, i) => scope({ regionName: `Город ${i} ${'x'.repeat(200)}`, projectName: `Проект ${i}` }));
  const result = aggregateDailyReport({ businessDate: DATE, sourceScopes, plans: sourceScopes.map(source => ({ businessDate: DATE, responsibilityScopeId: source.responsibilityScopeId, rows: [row({ reporting: { actualTrips: 1 } })] })) });
  assert.equal(result.summary.total, 220); assert.equal(result.byCity.length, 220); assert.equal(result.byClient.length, 220);
  assert.ok(result.text.length <= 12000); assert.match(result.text, /строки сокращены/); assert.match(result.text, /Проверка данных/);
});

test('public report text hides manager names while authorized preview keeps its source labels', () => {
  const source = scope(), managerId = randomUUID(), input = { businessDate: DATE, sourceScopes: [source],
    managers: [{ id: managerId, name: 'Синтетическое Имя Менеджера' }], plans: [{ businessDate: DATE,
      responsibilityScopeId: source.responsibilityScopeId, rows: [row({ reporting: { managerId, block: 'city', actualTrips: 1 } })] }] };
  const preview = aggregateDailyReport(input), published = aggregateDailyReport(input, { publicAudience: true });
  assert.match(preview.text, /Синтетическое Имя Менеджера/);
  assert.doesNotMatch(published.text, /Синтетическое Имя Менеджера/);
  assert.match(published.text, new RegExp(`Менеджер · ${managerId.slice(-6)}`));
  assert.equal(published.byManager[0].label, 'Синтетическое Имя Менеджера');
});

test('hidden crew fields on a city assignment cannot create a crew shortage warning', () => {
  const result = report([row({ reporting: { block: 'city', actualTrips: 1, crewRequired: 2, crewPresent: 1 } })]);
  assert.equal(result.summary.crew.assessed, 0); assert.equal(result.summary.crew.short, 0);
  assert.equal(issue(result, 'crew_short_released'), undefined);
});

test('unrecognized imported status cannot claim technical readiness', () => {
  const result = report([row({ status: 'legacy_unknown', reporting: { block: 'city', fleetType: 'own' } })]);
  assert.equal(result.summary.technicalReadiness, null); assert.equal(result.summary.unconfirmed, 1);
  assert.ok(issue(result, 'status_unknown'));
});

test('each delivery block carries its own city, client and manager breakdown with reconciling ownership totals', () => {
  const source = scope(), managerId = randomUUID(), rows = [
    row({ reporting: { block: 'crew', managerId, actualTrips: 1, fleetType: 'own', crewRequired: 2, crewPresent: 2 } }),
    row({ status: 'repair', reporting: { block: 'crew', managerId, actualTrips: 0, fleetType: 'own' } }),
    row({ reporting: { block: 'city', managerId, actualTrips: 2, fleetType: 'subcontracted' } }),
  ];
  const result = report(rows, { scope: source, managers: [{ id: managerId, name: 'Общий менеджер' }] });
  const crew = result.blocks.find(block => block.id === 'crew'), city = result.blocks.find(block => block.id === 'city');
  for (const key of ['byCity', 'byClient', 'byManager']) {
    assert.equal(crew[key].length, 1); assert.equal(crew[key][0].total, 2); assert.equal(crew[key][0].onLine, 1);
    assert.equal(crew[key][0].fleet.own.total, 2); assert.equal(crew[key][0].fleet.own.repair, 1);
    assert.equal(city[key][0].total, 1); assert.equal(city[key][0].onLine, 1);
    assert.equal(city[key][0].fleet.subcontracted.total, 1); assert.equal(city[key][0].extraTrips, 1);
  }
  assert.equal(result.byManager[0].total, 3);
  assert.equal((result.text.match(/По менеджерам/g) || []).length, 2);
  assert.equal((result.text.match(/Общий менеджер/g) || []).length, 2);
});

test('long first block cannot truncate totals of a later block', () => {
  const sourceScopes = Array.from({ length: 180 }, (_, i) => scope({ regionName: `Город ${i}`, projectName: `Проект ${i}` }));
  const result = aggregateDailyReport({ businessDate: DATE, sourceScopes, plans: sourceScopes.map((source, i) => ({ businessDate: DATE,
    responsibilityScopeId: source.responsibilityScopeId, rows: [row({ reporting: { block: i === 179 ? 'crew' : 'city', actualTrips: 1 } })] })) });
  assert.match(result.text, /Городская доставка: учтено 179/);
  assert.match(result.text, /Экипажный блок: учтено 1/);
  assert.match(result.text, /Проверка данных/); assert.ok(result.text.length <= 12000);
});

test('one shared catalogue scope separates explicit customers and cities without creating new scopes', () => {
  const source = scope({ regionName: 'Москва', projectName: 'Планирование · справочник из файла' }), first = randomUUID(), second = randomUUID();
  const result = report([
    row({ vehicleId: first, reporting: { block: 'crew', cityName: 'Санкт-Петербург', clientName: 'Хофф', fleetType: 'own' } }),
    row({ vehicleId: second, reporting: { block: 'crew', cityName: 'Казань', clientName: 'Лемана', fleetType: 'subcontracted' } }),
  ], { scope: source, attendance: [first, second].map(vehicleId => ({ businessDate: DATE, responsibilityScopeId: source.responsibilityScopeId, vehicleId, tripId: randomUUID() })) });
  assert.equal(result.summary.total, 2); assert.equal(result.summary.onLine, 2);
  assert.deepEqual(new Set(result.byCity.map(group => group.id)), new Set(['label:санкт-петербург', 'label:казань']));
  assert.deepEqual(new Set(result.byClient.map(group => group.id)), new Set(['label:хофф', 'label:лемана']));
  assert.ok(result.byCity.every(group => group.total === 1 && group.onLine === 1));
  assert.equal(result.blocks[0].byCity.length, 2); assert.equal(result.blocks[0].byClient.length, 2);
  assert.equal(issue(result, 'city_conflict'), undefined); assert.equal(issue(result, 'client_conflict'), undefined);
  assert.match(result.text, /Санкт-Петербург: 1/); assert.match(result.text, /Лемана: 1/);
});

test('explicit attribution normalizes case, ё and whitespace while preserving legacy scope IDs without overrides', () => {
  const source = scope(), result = report([
    row({ reporting: { cityName: '  Орёл  ', clientName: '  Хофф   Север ', actualTrips: 1 } }),
    row({ reporting: { cityName: 'ОРЕЛ', clientName: 'ХОФФ СЕВЕР', actualTrips: 1 } }),
    row({ reporting: { cityName: '', clientName: null, actualTrips: 1 } }),
  ], { scope: source });
  assert.equal(result.byCity.find(group => group.id === 'label:орел').total, 2);
  assert.equal(result.byClient.find(group => group.id === 'label:хофф север').total, 2);
  assert.equal(result.byCity.find(group => group.id === source.regionId).total, 1);
  assert.equal(result.byClient.find(group => group.id === source.projectId).total, 1);
  const legacy = report([row()], { scope: source });
  assert.equal(legacy.byCity[0].id, source.regionId); assert.equal(legacy.byCity[0].label, source.regionName);
  assert.equal(legacy.byClient[0].id, source.projectId); assert.equal(legacy.byClient[0].label, source.projectName);
});

test('contradictory explicit city or customer names keep a shared vehicle in conflict groups once', () => {
  const vehicleId = randomUUID(), result = report([
    row({ vehicleId, reporting: { cityName: 'Москва', clientName: 'Хофф', actualTrips: 1 } }),
    row({ vehicleId, reporting: { cityName: 'Казань', clientName: 'Лемана', actualTrips: 1 } }),
  ]);
  assert.equal(result.summary.total, 1); assert.equal(result.summary.onLine, 1);
  assert.equal(result.byCity[0].id, 'conflict'); assert.equal(result.byClient[0].id, 'conflict');
  assert.ok(issue(result, 'city_conflict')); assert.ok(issue(result, 'client_conflict'));
});
