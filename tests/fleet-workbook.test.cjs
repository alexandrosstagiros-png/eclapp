'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const ExcelJS = require('../recovered/node_modules/exceljs');
const { parseWorkbook, MAX_FILE_BYTES } = require('../recovered/apps/api/src/modules/fleet-maintenance/fleet-workbook');
const { analyze, reconcile } = require('../recovered/apps/api/src/modules/fleet-maintenance/fleet-model');
const headers = ['ЗН_id', 'Номер ЗН', 'Дата открытия', 'Госномер', 'Марка', 'Пробег, км', 'Тип позиции', 'Группа', 'Узел', 'Наименование', 'Кол-во', 'Цена за ед., ₽', 'Сумма, ₽', 'Подрядчик', 'Своими силами', 'Статус ЗН', 'Дата завершения'];
function values(patch = {}) {
  const data = { 'ЗН_id': 1, 'Номер ЗН': 'А-1', 'Дата открытия': '2026-07-01', 'Госномер': 'а123аа797', 'Марка': 'Газель', 'Пробег, км': 1000, 'Тип позиции': 'работа', 'Группа': 'Двигатель', 'Узел': 'ДВС', 'Наименование': 'Диагностика', 'Кол-во': 1, 'Цена за ед., ₽': '1.005', 'Сумма, ₽': '1.005', 'Подрядчик': '', 'Своими силами': true, 'Статус ЗН': 'Финиш', 'Дата завершения': '2026-07-01', ...patch };
  return headers.map(header => data[header]);
}
async function workbook(make) { const book = new ExcelJS.Workbook(); const sheet = book.addWorksheet('Позиции'); sheet.addRow(headers); sheet.addRow(values()); if (make) make(book, sheet); return Buffer.from(await book.xlsx.writeBuffer()); }

test('xlsx parses only actual source, cached values and typed dates; references and snapshot remain explicit', async () => {
  const buffer = await workbook((book, sheet) => {
    sheet.getCell('C2').value = new Date('2026-07-01T00:00:00Z');
    sheet.getCell('M2').value = { formula: '1+1', result: 1.005 };
    sheet.getCell('J2').value = { richText: [{ text: 'Диагно' }, { text: 'стика' }] };
    sheet.addRow(values({ 'ЗН_id': 2, 'Сумма, ₽': '-1.005', 'Наименование': '=HYPERLINK("evil")' }));
    const dash = book.addWorksheet('Дашборд'); dash.addRow(['Итого', 999999]);
    const ref = book.addWorksheet('Марки'); ref.addRow(['Госномер', 'Марка', 'Год']); ref.addRow(['в111вв797', 'УАЗ', 2021]);
    const rec = book.addWorksheet('Сверка с Ремонтами'); rec.addRow(['Исторический частичный снимок']); rec.addRow(['Марка', 'Машина', 'Месяц', 'Завгар, ₽', '«Ремонты», ₽', 'Разница, ₽', 'Наряды в Завгаре за месяц', 'Комментарий']); rec.addRow(['Газель', 'а123аа797', '2026-07', 100, 120, 20, '1', 'проверить']);
  });
  const parsed = await parseWorkbook(buffer, 'test.xlsx');
  assert.equal(parsed.rows.length, 2); assert.equal(parsed.rows[0].sourceRow, 2);
  assert.equal(parsed.rows[0].amountCents, 101); assert.equal(parsed.rows[1].amountCents, -101);
  assert.equal(parsed.rows[0].openedOn, '2026-07-01'); assert.equal(parsed.rows[0].name, 'Диагностика');
  assert.equal(parsed.rows[1].name, '=HYPERLINK("evil")');
  assert.equal(parsed.rows[0].ownWorkReported, true); assert.equal(parsed.rows[0].supplier, '');
  assert.equal(parsed.rows[0].referenceVehicleMissing, true);
  assert.equal(parsed.metadata.amountCents, 0);
  assert.equal(parsed.reconciliation.rows[0].sourceAmountCents, 10000);
  assert.equal(reconcile(parsed.reconciliation, parsed.rows).rows[0].differenceCents, 12000);
});

test('CSV preserves quoted separators, multiline text, source physical rows, duplicates and decimals', async () => {
  const encode = value => '"' + String(value).replaceAll('"', '""') + '"';
  const data = values({ 'Наименование': 'Деталь; "новая"\nвторая строка', 'Сумма, ₽': '1 234,56', 'Цена за ед., ₽': '1 500,00' });
  const content = '\ufeff' + [headers, data, data].map(row => row.map(encode).join(';')).join('\r\n');
  const parsed = await parseWorkbook(Buffer.from(content), 'Импорт.CSV');
  assert.equal(parsed.rows.length, 2); assert.equal(parsed.rows[0].amountCents, 123456); assert.equal(parsed.rows[1].sourceRow, 4);
  assert.equal(parsed.rows[0].name, 'Деталь; "новая"\nвторая строка'); assert.equal(parsed.metadata.referenceAvailable, false);
  assert.equal(parsed.rows[0].referenceVehicleMissing, undefined);
  const result = analyze(parsed.rows); assert.equal(result.summary.amountCents, 246912);
  assert.equal(result.quality.items.find(item => item.code === 'duplicate_candidates').count, 2);
});

test('xlsx source boundaries do not inherit old workbook filters', async () => {
  const buffer = await workbook((book, sheet) => {
    sheet.autoFilter = 'A1:Q2';
    sheet.getRow(32788).values = values({ 'ЗН_id': 2, 'Сумма, ₽': 50 });
    sheet.getRow(35644).values = values({ 'ЗН_id': 3, 'Сумма, ₽': 70 });
  });
  const parsed = await parseWorkbook(buffer, 'test.xlsx');
  assert.deepEqual(parsed.rows.map(row => row.sourceRow), [2, 32788, 35644]);
  assert.equal(parsed.metadata.amountCents, 12101);
});

test('invalid and oversized files fail explicitly with safe Russian validation messages', async () => {
  for (const [buffer, file] of [[Buffer.alloc(0), 'a.xlsx'], [Buffer.alloc(MAX_FILE_BYTES + 1), 'a.xlsx'], [Buffer.from('invalid'), 'a.xlsx'], [Buffer.from('a,b\n1,2'), 'a.csv'], [Buffer.from([0xff, 0xfe]), 'a.csv'], [Buffer.from('x'), 'a.xls']]) {
    await assert.rejects(parseWorkbook(buffer, file), error => error.status === 400 && /[а-яА-Я]/.test(error.message) && !/node_modules|TypeError|stack/.test(error.message));
  }
  await assert.rejects(parseWorkbook(await workbook((book, sheet) => { sheet.getCell('M2').value = null; }), 'a.xlsx'), /не заполнено/);
  await assert.rejects(parseWorkbook(await workbook((book, sheet) => { sheet.getCell('C2').value = '2026-02-30'; }), 'a.xlsx'), /календарная дата/);
  await assert.rejects(parseWorkbook(await workbook((book, sheet) => { sheet.getCell('M2').value = '100000000000000.00'; }), 'a.xlsx'), /диапазон/);
  await assert.rejects(parseWorkbook(await workbook((book, sheet) => { sheet.spliceRows(2, 1); }), 'a.xlsx'), /нет строк данных/);
});

test('declared archive expansion and the source row limit are enforced before acceptance', async () => {
  const buffer = await workbook();
  const directory = buffer.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  assert.ok(directory > 0);
  const forged = Buffer.from(buffer); forged.writeUInt32LE(161 * 1024 * 1024, directory + 24);
  await assert.rejects(parseWorkbook(forged, 'huge.xlsx'), /160 МиБ/);
  const shortHeaders = 'ЗН_id;Госномер;Тип позиции;Наименование;Сумма, ₽;Дата завершения\n';
  const content = shortHeaders + '1;а123аа797;работа;Работа;1;2026-07-01\n'.repeat(100001);
  await assert.rejects(parseWorkbook(Buffer.from(content), 'many.csv'), /100 000/);
});

test('actual supplied source reconciles all audited row/amount controls without dashboard dependency', { skip: !process.env.FLEET_SOURCE_XLSX, timeout: 120000 }, async () => {
  const source = process.env.FLEET_SOURCE_XLSX;
  const parsed = await parseWorkbook(await fs.readFile(source), source);
  assert.equal(parsed.rows.length, 35643); assert.equal(parsed.metadata.sourceLastRow, 35644);
  assert.equal(parsed.metadata.amountCents, 9210335726);
  assert.equal(parsed.referenceVehicles.length, 142);
  assert.equal(parsed.reconciliation.rows.length, 463);
  const result = analyze(parsed.rows, { dateFrom: '2026-07-01', dateTo: '2026-07-31' });
  assert.equal(result.summary.rowCount, 2319); assert.equal(result.summary.amountCents, 624693614);
  assert.equal(result.summary.orderCount, 302); assert.equal(result.summary.vehicleCount, 111);
  assert.equal(result.suppliers[0].key, '__missing__');
  assert.equal(parsed.rows.filter(row => row.sourceRow > 32787).reduce((sum, row) => sum + row.amountCents, 0), 707687227);
  assert.equal(parsed.rows.filter(row => row.referenceVehicleMissing).length, 1458);
});
