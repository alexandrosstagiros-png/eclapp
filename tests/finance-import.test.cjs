'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const path = require('node:path');
const appRequire = createRequire(
  path.resolve(__dirname, '../recovered/package.json'),
);
const ExcelJS = appRequire('exceljs');
const {
  parseFinanceImport,
  parseBankExchange,
} = require('../recovered/apps/api/src/modules/finance/domain/finance-import');
const parse = (text, sourceType = 'suppliers', extension = 'csv') =>
  parseFinanceImport({
    buffer: Buffer.from(text),
    fileName: 'Synthetic.' + extension,
    sourceType,
  });

test('supplier import preserves uncertainty, exact cents, source evidence and possible duplicates', async () => {
  const result = await parse(
    'Дата внесения;Плательщик;Сумма;Получатель;Счет/дата;Назначение;Срок оплаты;закр\n01.09.2026;ООО Тест;100,05;ООО Связь;123 от 01.09.2026;Услуги;15.09.2026;1с\n01.09.2026;ООО Тест;100,05;ООО Связь;123 от 01.09.2026;Услуги;15.09.2026;1с',
  );
  assert.equal(result.rows.length, 2);
  assert.equal(result.summary.totalKopecks, 20010);
  assert.equal(result.rows[0].operation.kind, 'plan');
  assert.equal(result.rows[0].operation.amountKopecks, 10005);
  assert.equal(result.rows[0].operation.confirmation, 'provisional');
  assert.equal(result.rows[0].operation.dueDate, '2026-09-15');
  assert.equal(result.rows[0].raw.status, '1с');
  assert.ok(result.rows[1].issues.some((value) => /повтор/.test(value)));
  assert.notEqual(result.rows[0].sourceId, result.rows[1].sourceId);
  assert.equal(
    result.rows[0].sourceFingerprint,
    result.rows[1].sourceFingerprint,
  );
  const replay = await parse(
    'Дата внесения;Плательщик;Сумма;Получатель;Счет/дата;Назначение;Срок оплаты;закр\n01.09.2026;ООО Тест;100,05;ООО Связь;123 от 01.09.2026;Услуги;15.09.2026;1с\n01.09.2026;ООО Тест;100,05;ООО Связь;123 от 01.09.2026;Услуги;15.09.2026;1с',
  );
  assert.deepEqual(result, replay);
});

test('cash dates never override unpaid state; invalid dates and unknown flow are visible', async () => {
  const result = await parse(
    'Дата факт;Сумма;Получатель;Назначение;Тип;Статус\n01.09.2026;50;А;Тест;Расход;Не оплачено\n31.02.2026;20;Б;Тест;Приход;Оплачено\n01.09.2026;10;В;Тест;;',
    'cash',
  );
  assert.equal(result.rows[0].operation.kind, 'plan');
  assert.ok(result.rows[0].issues.some((value) => /противоречит/.test(value)));
  assert.equal(result.rows[1].operation.date, null);
  assert.equal(result.rows[1].operation.kind, 'plan');
  assert.equal(result.rows[2].status, 'error');
  assert.equal(result.rows[2].operation.amountKopecks, null);
});

test('CSV quoted fields, blank dates, signs and unsafe amounts are preserved or rejected explicitly', async () => {
  const result = await parse(
    'date,amount,counterparty,description,due_date\n,"1 200,01",A,"Literal \"\"quoted\"\" text; =HYPERLINK(x)",\n2026-09-01,9999999999999999999,A,test,',
  );
  assert.equal(result.rows[0].operation.amountKopecks, 120001);
  assert.equal(result.rows[0].operation.date, null);
  assert.match(result.rows[0].operation.description, /=HYPERLINK/);
  // Invalid numeric rows must not disappear with a healthy count.
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[1].status, 'error');
});

test('1C bank export uses booked dates, payment direction and exact amounts; internal sides remain linked candidates', () => {
  const text = [
    '1CClientBankExchange',
    'РасчСчет=our1',
    'РасчСчет=our2',
    'СекцияДокумент=Платежное поручение',
    'Номер=123',
    'Дата=01.09.2026',
    'Сумма=100.05',
    'ПлательщикСчет=our1',
    'ПолучательСчет=outside',
    'Получатель1=Test',
    'ДатаСписано=02.09.2026',
    'НазначениеПлатежа=Счет 1',
    'КонецДокумента',
    'СекцияДокумент=Платежное поручение',
    'Номер=124',
    'Дата=01.09.2026',
    'Сумма=200.00',
    'ПлательщикСчет=our1',
    'ПолучательСчет=our2',
    'ДатаСписано=01.09.2026',
    'ДатаПоступило=01.09.2026',
    'КонецДокумента',
    'КонецФайла',
  ].join('\n');
  const result = parseBankExchange(text, 'a'.repeat(64));
  assert.equal(result.rows.length, 3);
  assert.equal(result.rows[0].operation.kind, 'cash_out');
  assert.equal(result.rows[0].operation.date, '2026-09-02');
  assert.equal(result.rows[0].operation.amountKopecks, 10005);
  assert.equal(result.rows[0].operation.confirmation, 'confirmed');
  assert.equal(result.rows[1].raw.transferCandidate, true);
  assert.equal(result.rows[2].operation.kind, 'cash_in');
  assert.throws(
    () => parseBankExchange(text.replace('КонецФайла', ''), 'hash'),
    /оборвана/,
  );
});

test('fuel cost is not assumed to be sales revenue', async () => {
  const result = await parse(
    'ID операции;Дата;Карта;Литры;Товар;Сумма со скидкой\na-1;01.09.2026;card;10.5;ДТ;630.00',
    'fuel',
  );
  assert.equal(result.rows[0].fuel.costKopecks, 63000);
  assert.equal(result.rows[0].operation.amountKopecks, null);
  assert.equal(result.rows[0].status, 'error');
  assert.equal(result.rows[0].sourceId, 'a-1');
});

test('XLSX archives skipped explicitly; active invoice row is not a cash movement', async () => {
  const book = new ExcelJS.Workbook();
  for (const name of ['Поставщики', 'Архив 2024']) {
    const sheet = book.addWorksheet(name);
    sheet.addRow(['Дата', 'Сумма', 'Получатель', 'Назначение']);
    sheet.addRow([
      new Date('2026-09-01T00:00:00Z'),
      123.45,
      'Synthetic',
      'Service',
    ]);
  }
  const notes = book.addWorksheet('Распределение Расходов');
  notes.addRow(['Платить с организации', 'Подрядчик']);
  const result = await parseFinanceImport({
    buffer: Buffer.from(await book.xlsx.writeBuffer()),
    fileName: 'synthetic.xlsx',
    sourceType: 'suppliers',
  });
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].operation.amountKopecks, 12345);
  assert.equal(result.rows[0].sourceSheet, 'Поставщики');
  assert.equal(result.ignoredSheets.length, 2);
  assert.match(result.ignoredSheets[0].reason, /Архив/);
});

test('1C canonical exchange requires stable original identifiers and source-base namespace', async () => {
  const payload = {
    schemaVersion: 'finance.import.v1',
    sourceSystem: '1C',
    sourceBaseId: 'accounting',
    operations: [
      {
        kind: 'sale',
        date: '2026-09-01',
        amountKopecks: 10000,
        source: { id: 'doc1', version: 3 },
      },
    ],
  };
  const result = await parse(JSON.stringify(payload), 'one_c', 'json');
  assert.equal(result.rows[0].operation.source.id, 'accounting:doc1');
  assert.equal(result.rows[0].operation.source.version, '3');
  payload.operations[0].source.id = null;
  await assert.rejects(
    parse(JSON.stringify(payload), 'one_c', 'json'),
    /постоянный/,
  );
});
