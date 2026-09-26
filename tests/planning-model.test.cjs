const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const modulePromise = import(pathToFileURL(path.resolve(__dirname, '../recovered/apps/office-web/src/planning-model.js')));

test('client formats keep regional distinctions and independent Metro groups', async () => {
  const model = await modulePromise;
  assert.equal(model.suggestTemplate('Метро', 'Казань'), 'metro_kazan');
  assert.equal(model.suggestTemplate('Метро | Санкт-Петербург'), 'metro');
  assert.equal(model.suggestTemplate('Алиди', 'Уфа'), 'alidi_ufa');
  assert.equal(model.suggestTemplate('Алиди', 'Москва'), 'general');
  assert.equal(model.templateFor('metro').sections.length, 2);
  assert.equal(model.templateFor('metro_kazan').sections[0].columns[0].label, 'Компания');
  assert.equal(model.templateFor('metro').sections[0].columns[0].label, '№ п/п');
  const miratorg = model.templateFor('miratorg_kazan').sections[0].columns;
  assert.deepEqual(miratorg.filter(c => c.label === 'День').map(c => c.source), ['morning_time', 'day_time']);
  const appia = model.templateFor('appia').sections[0].columns;
  assert.equal(appia.length, 18);
  assert.equal(appia[15].source, 'trailer_plate');
  assert.equal(appia[16].source, 'mkad_entry_code');
});

test('explicit plan date, timezone and loading/delivery dates do not drift together', async () => {
  const m = await modulePromise;
  const instant = new Date('2026-09-16T22:30:00Z');
  assert.equal(m.tomorrow('Europe/Moscow', instant), '2026-09-18');
  assert.equal(m.tomorrow('UTC', instant), '2026-09-17');
  const t = m.templateFor('lamoda'), columns = t.sections[0].columns;
  const row = { clientFields: {} }, context = { businessDate: '2026-09-18' };
  assert.equal(m.clientValue(t, columns.find(c => c.source === 'loading_date'), row, context), '2026-09-18');
  assert.equal(m.clientValue(t, columns.find(c => c.source === 'delivery_date'), row, context), '');
  const column = columns.find(c => c.source === 'loading_date');
  row.clientFields[column.key] = '2026-09-17';
  assert.equal(m.clientValue(t, column, row, context), '2026-09-17');
  row.clientFields[column.key] = '';
  assert.equal(m.clientValue(t, column, row, context), '');
});

test('exports include only active/paid reserve, preserve order, zero and spreadsheet escaping', async () => {
  const m = await modulePromise;
  const t = m.templateFor('general');
  const row = { id: 'one', status: 'work', driverId: 'driver', vehicleId: 'vehicle', departureTime: '05:15', comment: ' \t=HYPERLINK("x")', clientFields: { general_driver_phone: '+79990000000', general_route: '0' } };
  const context = { businessDate: '2026-09-18', drivers: [{ id: 'driver', name: 'Тестовый Водитель' }], vehicles: [{ id: 'vehicle', label: 'ТЕСТ001' }] };
  const [section] = m.exportSections(t, [row, { ...row, status: 'off' }, { ...row, status: 'paid_reserve' }], context);
  assert.equal(section.rows.length, 2);
  assert.equal(section.rows[0][1], '18.09.2026');
  assert.equal(section.rows[0][6], '0');
  assert.ok(section.csv.startsWith('\uFEFF'));
  assert.ok(section.tsv.includes("'+79990000000"));
  assert.match(section.tsv, /' +=HYPERLINK/);
  assert.ok(!section.tsv.includes('\t\t=HYPERLINK'));
  assert.equal(m.safeSpreadsheetCell('plain'), 'plain');
  assert.equal(m.safeSpreadsheetCell('\n@SUM(A1)'), "'\n@SUM(A1)");
});

test('Grand Capital exports route lines and Metro surname differs from full name', async () => {
  const m = await modulePromise;
  const row = { status: 'work', driverId: 'd', clientFields: {} };
  const context = { businessDate: '2026-10-01', drivers: [{ id: 'd', name: 'Иванов Тест Тестович' }] };
  const metro = m.templateFor('metro');
  assert.equal(m.clientValue(metro, metro.sections[0].columns.at(-1), row, context), 'Иванов');
  assert.equal(m.clientValue(metro, metro.sections[1].columns[0], row, context), 'Иванов Тест Тестович');
  const [exported] = m.exportSections(m.templateFor('grand_capital'), [row], context);
  assert.match(exported.text, /^Заявка на: 01\.10\.2026/);
  assert.match(exported.text, /Ф.И.О. водителя: Иванов Тест Тестович/);
});

test('row fields link only the selected driver or vehicle and keep explicit blank and zero overrides', async () => {
  const m = await modulePromise;
  const row = m.newPlanningRow();
  assert.deepEqual(row.extraFields, []);
  row.driverId = 'driver-a'; row.vehicleId = 'vehicle-a';
  const context = {
    drivers: [
      { id: 'driver-a', name: 'Тестовый Водитель', planningData: { driver_passport: 'Тестовый паспорт А', driver_phone: '+70000000001', driver_inn: '000000000001', driver_address: 'Тестовый адрес А' } },
      { id: 'driver-b', planningData: { driver_passport: 'Тестовый паспорт Б' } },
    ],
    vehicles: [
      { id: 'vehicle-a', planningData: { vehicle_brand: 'Тестовая марка', vehicle_registration_certificate: 'Тестовое СТС', payload_kg: 1500, pallet_capacity: 0 } },
      { id: 'vehicle-b', planningData: { vehicle_registration_certificate: 'СТС другой машины' } },
    ],
  };
  const passport = m.newExtraField('driver_passport');
  assert.equal(passport.owner, 'driver'); assert.equal(passport.type, 'text');
  assert.ok(passport.id); assert.notEqual(passport.id, m.newExtraField('driver_passport').id);
  assert.ok(!Object.hasOwn(passport, 'value'), 'automatic data must not become a manual override');
  assert.equal(m.extraFieldValue(passport, row, context), 'Тестовый паспорт А');
  assert.equal(m.extraFieldValue(passport, { ...row, driverId: 'driver-b' }, context), 'Тестовый паспорт Б');
  assert.equal(m.extraFieldValue(passport, { ...row, driverId: null }, context), '');
  assert.equal(m.extraFieldValue({ ...passport, value: '' }, row, context), '');
  assert.equal(m.extraFieldValue({ ...passport, value: 'Поправка' }, row, context), 'Поправка');
  assert.equal(m.extraFieldValue(m.newExtraField('vehicle_registration_certificate'), row, context), 'Тестовое СТС');
  assert.equal(m.extraFieldValue(m.newExtraField('vehicle_model'), row, context), 'Тестовая марка');
  assert.equal(m.extraFieldValue(m.newExtraField('pallet_capacity'), row, context), '0');
  assert.equal(m.extraFieldValue(m.newExtraField('tonnage'), row, context), '1.5');
  assert.equal(m.extraFieldValue(m.newExtraField('driver_name_inn_phone'), row, context), 'Тестовый Водитель, 000000000001, +70000000001');
  assert.equal(m.extraFieldValue({ ...m.newExtraField(), value: 0 }, row, context), 0);
  const phone = m.templateFor('general').sections[0].columns.find(column => column.source === 'driver_phone');
  assert.equal(m.clientValue(m.templateFor('general'), phone, row, context), '+70000000001', 'client form columns use the same linked catalog data');
});

test('changing a client form preserves independent row field definitions and values', async () => {
  const m = await modulePromise;
  const original = { templateId: 'general', rows: [{ ...m.newPlanningRow(), extraFields: [{ ...m.newExtraField('driver_passport'), value: 'Уточнённые данные' }] }] };
  const adopted = m.adoptTemplate(original, m.templateFor('metro'));
  assert.deepEqual(adopted.rows[0].extraFields, original.rows[0].extraFields);
  adopted.rows[0].extraFields[0].value = 'Изменено';
  adopted.rows[0].extraFields.push(m.newExtraField('driver_address'));
  assert.equal(original.rows[0].extraFields[0].value, 'Уточнённые данные');
  assert.equal(original.rows[0].extraFields.length, 1);
});

test('exports union row additions on the right without adding another row’s data or losing duplicate fields', async () => {
  const m = await modulePromise;
  const passport = { ...m.newExtraField('driver_passport'), label: 'Паспорт' };
  const extra = { ...m.newExtraField(), label: 'Дополнение', value: '=1+1' };
  const context = { businessDate: '2028-02-29', drivers: [{ id: 'd', planningData: { driver_passport: 'Паспорт из справочника' } }] };
  const rows = [
    { id: 'a', status: 'work', driverId: 'd', extraFields: [passport, { ...passport, id: 'second', value: 'Второе значение' }, extra] },
    { id: 'b', status: 'work', driverId: 'd', extraFields: [] },
    { id: 'c', status: 'paid_reserve', extraFields: [{ ...passport, id: 'third', value: 'Другой паспорт' }, { ...m.newExtraField('driver_birth_date'), label: 'Дата рождения', value: '1990-01-02' }] },
    { id: 'off', status: 'off', extraFields: [{ ...extra, label: 'Исключённое поле' }] },
  ];
  for (const section of m.exportSections(m.templateFor('metro'), rows, context)) {
    assert.deepEqual(section.headers.slice(-4), ['Паспорт', 'Паспорт', 'Дополнение', 'Дата рождения']);
    assert.deepEqual(section.rows.map(row => row.slice(-4)), [
      ['Паспорт из справочника', 'Второе значение', '=1+1', ''], ['', '', '', ''], ['Другой паспорт', '', '', '02.01.1990'],
    ]);
    assert.ok(!section.headers.includes('Исключённое поле'));
    assert.match(section.csv, /"'=1\+1"/);
  }
  const text = m.exportSections(m.templateFor('grand_capital'), rows, context)[0].text.split('\n\n');
  assert.match(text[1], /Паспорт: Паспорт из справочника\nПаспорт: Второе значение\nДополнение: =1\+1/);
  assert.doesNotMatch(text[2], /Паспорт:|Дополнение:|Дата рождения:/);
  assert.match(text[3], /Паспорт: Другой паспорт\nДата рождения: 02\.01\.1990/);
});

test('row field validation checks explicit and linked typed data even for built-in client forms', async () => {
  const m = await modulePromise;
  const field = { ...m.newExtraField('driver_birth_date'), value: '2027-02-29' };
  const row = { id: 'active', status: 'work', driverId: 'd', extraFields: [field] };
  const template = m.templateFor('general');
  const issues = m.clientFieldIssues(template, [{ ...row, id: 'off', status: 'off' }, row], {});
  assert.equal(issues.length, 1);
  assert.equal(issues[0].key, field.id); assert.equal(issues[0].extraFieldId, field.id); assert.equal(issues[0].rowIndex, 1);
  for (const [type, value] of [['number', '12 кг'], ['time', '24:00'], ['date', '0000-01-01']]) {
    assert.equal(m.clientFieldIssues(template, [{ ...row, extraFields: [{ ...field, type, value }] }], {}).length, 1);
  }
  assert.deepEqual(m.clientFieldIssues(template, [{ ...row, extraFields: [{ ...field, value: '' }] }], {}), []);
  const linked = m.newExtraField('driver_birth_date');
  assert.equal(m.clientFieldIssues(template, [{ ...row, extraFields: [linked] }], { drivers: [{ id: 'd', planningData: { driver_birth_date: '2027-02-29' } }] }).length, 1);
});
