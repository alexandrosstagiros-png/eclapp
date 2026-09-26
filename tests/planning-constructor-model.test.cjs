const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

const frontend = path.resolve(__dirname, '../recovered/apps/office-web/src');
const modelPromise = import(pathToFileURL(path.join(frontend, 'planning-model.js')));
const fieldsPromise = import(pathToFileURL(path.join(frontend, 'planning-fields.js')));

function column(key, overrides = {}) {
  return { key, label: key, source: 'manual', type: 'text', owner: 'assignment', required: false, defaultValue: '', ...overrides };
}
function template(columns, overrides = {}) {
  return { id: 'custom-form', version: 3, label: 'Форма нового клиента', kind: 'table', custom: true,
    sections: [{ id: 'main', label: 'Основная заявка', columns }], ...overrides };
}
function row(overrides = {}) {
  return { id: 'assignment', driverId: 'driver', vehicleId: 'vehicle', status: 'work', departureTime: '04:35',
    tripCount: 2, comment: '', clientFields: {}, ...overrides };
}
const context = {
  businessDate: '2028-02-29',
  drivers: [{ id: 'driver', name: 'Иванов Тест Тестович' }],
  vehicles: [{ id: 'vehicle', label: 'ТЕСТ001', capacityKg: 1250, bodyType: 'refrigerated' }],
};

test('constructor field ownership follows the actual source, and manual fields retain their chosen owner', async () => {
  const { columnOwner } = await fieldsPromise;
  for (const source of ['driver_phone', 'driver_passport', 'document_number', 'medical_book_valid_to', 'client_driver_id']) {
    assert.equal(columnOwner(column('field', { source, owner: 'vehicle' })), 'driver', source);
  }
  for (const source of ['vehicle_plate', 'payload_kg', 'tonnage', 'trailer_plate', 'tracker_imei', 'tray_capacity', 'body_height']) {
    assert.equal(columnOwner(column('field', { source, owner: 'assignment' })), 'vehicle', source);
  }
  assert.equal(columnOwner(column('field', { source: 'planning_date', owner: 'driver' })), 'assignment');
  for (const owner of ['assignment', 'driver', 'vehicle']) assert.equal(columnOwner(column('field', { owner })), owner);
  assert.equal(columnOwner({ source: 'manual' }), 'assignment');
});

test('constructor source choices cover linked catalog data, manual document fields and every built-in source', async () => {
  const { FIELD_SOURCES } = await fieldsPromise;
  const { PLANNING_TEMPLATES } = await modelPromise;
  const choices = new Map(FIELD_SOURCES.map(source => [source.value, source]));
  assert.equal(choices.size, FIELD_SOURCES.length, 'source choices must be unique');
  for (const source of PLANNING_TEMPLATES.flatMap(t => t.sections.flatMap(s => s.columns.map(c => c.source)))) {
    assert.ok(choices.has(source), `built-in source ${source} must remain editable in a copied form`);
  }
  for (const [source, type, owner] of [
    ['driver_name', 'text', 'driver'], ['vehicle_plate', 'text', 'vehicle'], ['payload_kg', 'number', 'vehicle'],
    ['planning_date', 'date', 'assignment'], ['arrival_time', 'time', 'assignment'], ['trip_count', 'number', 'assignment'],
    ['driver_phone', 'text', 'driver'], ['driver_passport', 'text', 'driver'], ['driver_address', 'text', 'driver'],
    ['driver_registration_address', 'text', 'driver'], ['driver_snils', 'text', 'driver'], ['driver_birth_date', 'date', 'driver'],
    ['driver_license_full', 'text', 'driver'], ['payload_capacity', 'text', 'vehicle'], ['ownership_type', 'text', 'vehicle'],
    ['actual_carrier', 'text', 'vehicle'], ['vehicle_condition_notes', 'text', 'vehicle'],
    ['vehicle_brand', 'text', 'vehicle'], ['vehicle_model', 'text', 'vehicle'], ['vehicle_registration_certificate', 'text', 'vehicle'],
  ]) {
    assert.equal(choices.get(source).type, type);
    assert.equal(choices.get(source).owner, owner);
    assert.doesNotMatch(choices.get(source).label, /^Ручной ввод:/);
  }
  for (const source of ['document_number', 'document_issuer', 'tracker_imei']) {
    assert.match(choices.get(source).label, /^Ручной ввод:/, `${source} must not promise absent catalog data`);
  }
});

test('client values honor explicit blanks and zero, then available automatic data, then the configured default', async () => {
  const { clientValue } = await modelPromise;
  const t = template([]);
  const c = column('name', { source: 'driver_name', defaultValue: 'Ожидается водитель' });
  assert.equal(clientValue(t, c, row(), context), 'Иванов Тест Тестович');
  assert.equal(clientValue(t, c, row({ driverId: null }), context), 'Ожидается водитель');
  assert.equal(clientValue(t, c, row({ clientFields: { name: '' } }), context), '');
  assert.equal(clientValue(t, c, row({ clientFields: { name: 0 } }), context), 0);
  assert.equal(clientValue(t, column('route', { defaultValue: 'Склад — магазин' }), row(), context), 'Склад — магазин');
  const expected = { sequence: '4', trip_count: '2', planning_date: '2028-02-29', loading_date: '2028-02-29',
    arrival_date: '2028-02-29', driver_surname: 'Иванов', vehicle_plate: 'ТЕСТ001', arrival_time: '04:35',
    loading_time: '04:35', payload_kg: '1250', tonnage: '1.25', vehicle_body_type: 'Рефрижератор', comment: 'Въезд со двора' };
  for (const [source, value] of Object.entries(expected)) {
    assert.equal(clientValue(t, column(source, { source }), row({ comment: 'Въезд со двора' }), context, 3), value, source);
  }
  const zeroCapacity = { ...context, vehicles: [{ id: 'vehicle', capacityKg: 0 }] };
  assert.equal(clientValue(t, column('capacity', { source: 'payload_kg', defaultValue: '1000' }), row(), zeroCapacity), '0');
  assert.equal(clientValue(t, column('phone', { source: 'driver_phone', defaultValue: 'Уточнить' }), row(), context), 'Уточнить');
});

test('adopting a form pins an independent version snapshot and preserves assignments when labels or order change', async () => {
  const { adoptTemplate } = await modelPromise;
  const oldTemplate = template([column('phone', { source: 'driver_phone' }), column('route')], { version: 1 });
  const nextTemplate = template([column('route', { label: 'Адреса по порядку' }), column('phone', { source: 'driver_phone', label: 'Мобильный' })]);
  const plan = { id: 'plan', version: 4, templateId: oldTemplate.id, templateVersion: 1, templateSnapshot: oldTemplate,
    businessDate: context.businessDate, rows: [row({ confirmed: true, comment: 'Срочная доставка', clientFields: { phone: '+70000000000', route: 'А → Б' } })] };
  const original = structuredClone(plan);
  const adopted = adoptTemplate(plan, nextTemplate);
  assert.deepEqual(plan, original, 'adopting must not mutate the currently displayed/saved plan');
  assert.equal(adopted.templateVersion, 3);
  assert.equal(adopted.version, 4, 'plan concurrency version is independent of template version');
  assert.deepEqual(adopted.rows, plan.rows);
  assert.deepEqual(adopted.templateSnapshot, nextTemplate);
  nextTemplate.sections[0].columns[0].label = 'Изменено после принятия';
  assert.equal(adopted.templateSnapshot.sections[0].columns[0].label, 'Адреса по порядку');
  adopted.rows[0].clientFields.route = 'В → Г';
  assert.equal(plan.rows[0].clientFields.route, 'А → Б');
  assert.equal(plan.templateSnapshot.version, 1, 'old plans keep their former form version');
});

test('changing a column source, type or manual owner removes incompatible overrides without losing unrelated fields', async () => {
  const { adoptTemplate } = await modelPromise;
  const before = template([
    column('source', { source: 'driver_phone' }), column('type'), column('owner', { owner: 'driver' }),
    column('unchanged', { source: 'vehicle_plate', owner: 'assignment' }), column('blank'),
  ]);
  const after = template([
    column('source', { source: 'vehicle_plate' }), column('type', { type: 'date' }), column('owner', { owner: 'vehicle' }),
    column('unchanged', { source: 'vehicle_plate', owner: 'vehicle', label: 'Новый заголовок' }), column('blank'),
  ], { version: 4 });
  const plan = { templateId: before.id, templateSnapshot: before,
    rows: [row({ clientFields: { source: 'Старый телефон', type: 'Свободный текст', owner: 'Реквизит водителя', unchanged: 'ТЕСТ002', blank: '' } })] };
  const adopted = adoptTemplate(plan, after);
  assert.deepEqual(adopted.rows[0].clientFields, { unchanged: 'ТЕСТ002', blank: '' });
  assert.equal(plan.rows[0].clientFields.source, 'Старый телефон');
});

test('adopting a replacement for a legacy built-in plan compares columns even without a saved snapshot', async () => {
  const { adoptTemplate, templateFor } = await modelPromise;
  const builtin = templateFor('general');
  const before = builtin.sections[0].columns.find(c => c.source === 'driver_phone');
  const same = builtin.sections[0].columns.find(c => c.source === 'route');
  const replacement = template([{ ...before, source: 'vehicle_plate' }, { ...same, label: 'Новый заголовок маршрута' }]);
  const plan = { templateId: 'general', rows: [row({ clientFields: { [before.key]: 'Старый телефон', [same.key]: 'А — Б' } })] };
  assert.deepEqual(adoptTemplate(plan, replacement).rows[0].clientFields, { [same.key]: 'А — Б' });
  assert.equal(plan.rows[0].clientFields[before.key], 'Старый телефон');
});

test('applying a changed 50-field form discards removed overrides so the replacement field fits the plan limit', async () => {
  const { adoptTemplate } = await modelPromise;
  const columns = Array.from({ length: 50 }, (_, index) => column(`field_${index}`));
  const before = template(columns);
  const after = template([...columns.slice(1), column('replacement')], { version: 4 });
  const fields = Object.fromEntries(columns.map(c => [c.key, `Значение ${c.key}`]));
  const original = { templateId: before.id, templateSnapshot: before, rows: [row({ clientFields: fields })] };
  const changed = adoptTemplate(original, after);
  assert.equal(Object.keys(changed.rows[0].clientFields).length, 49);
  assert.ok(!Object.hasOwn(changed.rows[0].clientFields, 'field_0'));
  changed.rows[0].clientFields.replacement = 'Новое значение';
  assert.equal(Object.keys(changed.rows[0].clientFields).length, 50);
  assert.equal(Object.keys(original.rows[0].clientFields).length, 50, 'the old plan stays intact');
});

test('required fields block only exported assignments and point back to the original row', async () => {
  const { clientFieldIssues } = await modelPromise;
  const t = template([column('contact', { required: true, defaultValue: 'Дежурный' })]);
  const rows = [
    row({ id: 'off', status: 'off', clientFields: { contact: '' } }),
    row({ id: 'active', clientFields: { contact: '   ' } }),
    row({ id: 'reserve', status: 'reserve', clientFields: { contact: '' } }),
    row({ id: 'paid', status: 'paid_reserve', clientFields: { contact: '' } }),
    row({ id: 'default' }),
    row({ id: 'cancelled', status: 'cancelled', clientFields: { contact: '' } }),
  ];
  assert.deepEqual(clientFieldIssues(t, rows, context).map(issue => [issue.rowId, issue.rowIndex, issue.key]),
    [['active', 1, 'contact'], ['paid', 3, 'contact']]);
  const sequence = template([column('sequence', { source: 'sequence', type: 'number', required: true })]);
  assert.deepEqual(clientFieldIssues(sequence, rows, context), []);
});

test('custom date/time/number fields reject impossible values while allowing empty optional fields and legacy formats', async () => {
  const { clientFieldIssues } = await modelPromise;
  for (const [type, valid, invalid] of [
    ['date', ['2028-02-29', '2026-09-16'], ['2027-02-29', '2026-04-31', '2026-13-01', '16.09.2026']],
    ['time', ['00:00', '23:59'], ['24:00', '10:60', '9:05', 'утро']],
    ['number', ['0', '-2', '0.25', '.5'], ['NaN', 'Infinity', '12 кг', '=1+1']],
  ]) {
    const t = template([column('value', { type })]);
    for (const value of [...valid, '']) assert.deepEqual(clientFieldIssues(t, [row({ clientFields: { value } })], context), [], `${type}: ${value}`);
    for (const value of invalid) {
      assert.equal(clientFieldIssues(t, [row({ clientFields: { value } })], context).length, 1, `${type}: ${value}`);
    }
  }
  const legacy = template([column('departure', { type: 'time' })], { custom: false });
  assert.deepEqual(clientFieldIssues(legacy, [row({ clientFields: { departure: 'ночь / по звонку' } })], context), []);
});

test('custom exports preserve section and column order, format dates and neutralize spreadsheet formulas in headers and data', async () => {
  const { exportSections } = await modelPromise;
  const t = template([], { sections: [
    { id: 'client', label: 'Клиенту', columns: [column('phone', { label: '+ Контакт' }), column('date', { label: 'Дата', source: 'planning_date', type: 'date' }), column('order', { source: 'sequence' })] },
    { id: 'gate', label: 'На проходную', columns: [column('name', { label: 'Водитель', source: 'driver_name' }), column('note', { label: 'Примечание' })] },
  ] });
  const rows = [row({ status: 'repair' }), row({ clientFields: { phone: '+70000000000', note: ' \t=HYPERLINK("x")\nстрока' } }), row({ status: 'paid_reserve' })];
  const exported = exportSections(t, rows, context);
  assert.deepEqual(exported.map(section => section.id), ['client', 'gate']);
  assert.deepEqual(exported[0].headers, ['+ Контакт', 'Дата', 'order']);
  assert.deepEqual(exported[0].rows, [['+70000000000', '29.02.2028', '1'], ['', '29.02.2028', '2']]);
  assert.ok(exported[0].csv.startsWith('\uFEFF"\'+ Контакт";"Дата";"order"'));
  assert.match(exported[0].csv, /"'\+70000000000"/);
  assert.match(exported[1].csv, /HYPERLINK\(""x""\)/);
  assert.match(exported[1].tsv, /' +=HYPERLINK\("x"\) строка/);
  const textExport = exportSections({ ...t, kind: 'text' }, rows, context);
  assert.match(textExport[0].text, /^Заявка на: 29\.02\.2028\n\n\+ Контакт: \+70000000000\nДата: 29\.02\.2028\norder: 1/);
  assert.match(textExport[1].text, /Водитель: Иванов Тест Тестович\nПримечание:/);
});

test('server authoritative built-ins exactly match all sixteen frontend starter forms', async () => {
  const { PLANNING_TEMPLATES } = await modelPromise;
  const authoritative = require('../recovered/apps/api/src/modules/planning/planning-builtins.json');
  assert.equal(PLANNING_TEMPLATES.length, 16);
  assert.deepEqual(authoritative, PLANNING_TEMPLATES,
    'saving a built-in plan must pin the same columns, labels and sources that the manager saw');
});
