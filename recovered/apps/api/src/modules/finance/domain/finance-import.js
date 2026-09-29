'use strict';

// Sources are evidence, never commands. No formulas, macros or external links run.
const { createHash } = require('node:crypto');
const { TextDecoder } = require('node:util');
const {
  checkZip,
  cellValue,
  cents,
  date,
  csvRecords,
  MAX_FILE_BYTES,
} = require('../../fleet-maintenance/fleet-workbook');
const MAX_ROWS = 100000;
const SOURCE_TYPES = ['bank', 'suppliers', 'cash', 'fuel', 'one_c'];
const digest = (value) =>
  createHash('sha256')
    .update(
      typeof value === 'string' || Buffer.isBuffer(value)
        ? value
        : JSON.stringify(value),
    )
    .digest('hex');
const text = (value) => {
  const val = cellValue(value);
  return val == null ? '' : String(val).trim();
};
const norm = (value) =>
  text(value)
    .toLocaleLowerCase('ru')
    .replace(/ё/g, 'е')
    .replace(/[\s\u00a0\u202f]+/g, ' ')
    .replace(/[«»"\n]/g, '')
    .trim();
const fail = (message) => {
  const e = new Error(message);
  e.code = 'FINANCE_IMPORT_INVALID';
  e.status = 400;
  e.statusCode = 400;
  throw e;
};
const HEADERS = {
  date: [
    'date',
    'дата',
    'дата операции',
    'дата внесения',
    'дата внесения счета',
    'дата занесения расхода',
    'дата платежа',
    'дата факт',
    'дата фактическая',
    'дата и время',
    'дата/время',
    'дата транзакции',
    'дата и время операции',
  ],
  amount: [
    'amount',
    'amount_rub',
    'сумма',
    'сумма руб',
    'сумма, руб.',
    'сумма, руб',
    'сумма с ндс',
    'сумма оплаты',
    'сумма операции',
    'сумма документа',
  ],
  income: ['income', 'приход', 'поступление', 'зачисление', 'кредит'],
  expense: ['expense', 'расход', 'списание', 'дебет'],
  counterparty: [
    'counterparty',
    'контрагент',
    'получатель',
    'наименование получателя',
    'поставщик',
    'покупатель',
    'заказчик',
    'от кого',
    'кому',
  ],
  inn: ['inn', 'инн', 'инн контрагента', 'инн получателя'],
  kpp: ['kpp', 'кпп', 'кпп контрагента'],
  counterpartyAccount: [
    'counterparty_account',
    'счет контрагента',
    'счет получателя',
    'р/с получателя',
  ],
  ownEntity: [
    'legal_entity',
    'плательщик',
    'своя компания',
    'компания',
    'организация',
    'юрлицо',
    'юридическое лицо',
  ],
  ownInn: ['own_inn', 'инн плательщика', 'инн организации'],
  ownAccount: [
    'account',
    'own_account',
    'свой счет',
    'счет организации',
    'счет плательщика',
  ],
  description: [
    'description',
    'назначение',
    'назначение платежа',
    'наименование',
    'наименование расхода',
    'комментарий',
    'основание',
    'описание',
    'за что',
  ],
  document: [
    'document',
    'счет/дата',
    'счет/ дата',
    'счет',
    '№ счета',
    '№ счета, дата',
    'номер счета',
    'документ',
    'номер документа',
    '№ документа',
  ],
  dueDate: ['due_date', 'срок оплаты', 'оплатить до', 'договорный срок'],
  plannedDate: ['planned_date', 'плановая дата', 'дата план'],
  accrualDate: ['accrual_date', 'для pnl', 'период услуги', 'дата начисления'],
  vat: ['vat', 'vat_amount', 'сумма ндс', 'ндс сумма'],
  vatRate: [
    'vat_rate',
    'ндс',
    'ставка ндс',
    'ндс, %',
    'ндс/без ндс',
    '% ставка ндс',
  ],
  article: ['article', 'статья', 'статья расходов'],
  status: ['status', 'статус', 'закр', '1с', 'отправлено в завгар'],
  sourceId: [
    'source_id',
    'id',
    'id операции',
    'идентификатор операции',
    'номер транзакции',
    'transaction_id',
  ],
  card: ['card', 'карта', 'номер карты', '№ карты', 'топливная карта'],
  litres: [
    'litres',
    'литры',
    'количество',
    'кол-во',
    'кол-во, л',
    'объем',
    'объем, л',
    'количество, л',
  ],
  product: [
    'product',
    'товар',
    'вид топлива',
    'продукт',
    'наименование товара',
    'топливо',
    'товар / услуга',
    'товар/услуга',
    'номенклатура',
  ],
  cost: [
    'cost',
    'сумма со скидкой',
    'сумма с учетом скидки',
    'стоимость со скидкой',
    'стоимостьсоскидкой',
    'сумма после скидки',
    'сумма транзакции с учетом скидки',
  ],
  sale: ['sale_amount', 'сумма продажи', 'продажная стоимость'],
  kind: ['kind', 'тип', 'тип операции', 'операция', 'вид операции'],
};
const ALIASES = new Map(
  Object.entries(HEADERS).flatMap(([key, aliases]) =>
    aliases.map((alias) => [norm(alias), key]),
  ),
);
function columns(cells) {
  const result = {};
  cells.forEach((cell, index) => {
    const key =
      ALIASES.get(norm(cell).replace(/\s*\(.*?\)\s*$/, '')) ||
      ALIASES.get(norm(cell));
    if (key && result[key] == null) result[key] = index;
  });
  return result;
}
function score(map, sourceType) {
  const money =
    map.amount != null ||
    map.income != null ||
    map.expense != null ||
    map.cost != null;
  if (sourceType === 'fuel')
    return map.card != null && map.litres != null ? Object.keys(map).length : 0;
  return money &&
    (map.date != null || map.counterparty != null || map.document != null)
    ? Object.keys(map).length
    : 0;
}
function optionalDate(value, row, name, issues, date1904) {
  if (cellValue(value) == null || text(value) === '') return null;
  try {
    let val = cellValue(value);
    // Source time is retained in provenance; ledger date is the local date printed in the export.
    if (typeof val === 'string') {
      const m = /^(\d{4}-\d{2}-\d{2}|\d{2}\.\d{2}\.\d{4})(?:[ T].*)?$/.exec(
        val.trim(),
      );
      if (m) val = m[1];
    }
    return date(val, row, name, date1904);
  } catch {
    issues.push(name + ': требуется корректная дата');
    return null;
  }
}
function optionalAmount(value, row, label, issues) {
  if (text(value) === '') return null;
  try {
    return cents(value, row, label, true);
  } catch {
    issues.push(label + ': некорректная сумма');
    return null;
  }
}
function rowFromCells(cells, map, provenance, sourceType, date1904) {
  const get = (key) => (map[key] == null ? null : cellValue(cells[map[key]]));
  const issues = [],
    row = provenance.sourceRow;
  const amount = optionalAmount(get('amount'), row, 'Сумма', issues);
  const income = optionalAmount(get('income'), row, 'Поступление', issues);
  const expense = optionalAmount(get('expense'), row, 'Списание', issues);
  const cost = optionalAmount(get('cost'), row, 'Стоимость закупки', issues);
  const sale = optionalAmount(get('sale'), row, 'Стоимость продажи', issues);
  if (
    ['amount', 'income', 'expense', 'cost', 'sale'].every(
      (key) => text(get(key)) === '',
    ) &&
    sourceType !== 'fuel'
  )
    return null;
  if (
    /^(?:итого|всего|остаток|сальдо|общая сумма)(?:\s|:|$)/i.test(
      cells.slice(0, 3).map(text).join(' ').trim(),
    )
  )
    return null;
  let operationKind = 'plan',
    flow = 'out',
    selectedAmount = amount;
  if (sourceType === 'bank' || sourceType === 'cash') {
    const kind = norm(get('kind'));
    if (income > 0 && expense > 0) {
      issues.push(
        'В одной строке одновременно приход и расход: разделите операции',
      );
      selectedAmount = null;
    } else if (income > 0) {
      flow = 'in';
      selectedAmount = income;
    } else if (expense > 0) {
      flow = 'out';
      selectedAmount = expense;
    } else if (/^(приход|поступление|зачисление|in|cash_in)$/.test(kind))
      flow = 'in';
    else if (/^(расход|списание|out|cash_out)$/.test(kind)) flow = 'out';
    else if (amount < 0) flow = 'out';
    else {
      issues.push(
        'Укажите приход или расход: знак положительной суммы не определяет направление денег',
      );
      selectedAmount = null;
    }
    operationKind = flow === 'in' ? 'cash_in' : 'cash_out';
  }
  if (sourceType === 'fuel') {
    operationKind = 'fuel_sale';
    selectedAmount = sale;
    if (sale == null)
      issues.push(
        'Нужна продажная стоимость по договору покупателя; закупочная сумма не является выручкой',
      );
  }
  const postedDate = optionalDate(
    get('date'),
    row,
    'Дата источника',
    issues,
    date1904,
  );
  const dueDate = optionalDate(
    get('dueDate'),
    row,
    'Срок оплаты',
    issues,
    date1904,
  );
  const plannedDate = optionalDate(
    get('plannedDate'),
    row,
    'Плановая дата',
    issues,
    date1904,
  );
  const accrualDate = optionalDate(
    get('accrualDate'),
    row,
    'Период начисления',
    issues,
    date1904,
  );
  const description =
    text(get('description')) ||
    text(get('document')) ||
    'Импорт из ' + provenance.sourceSheet;
  const sourceStatus = text(get('status'));
  if (sourceType === 'suppliers')
    issues.push(
      'Счет/заявка: подтвердите обязательство и срок; оплата и расход не подтверждены',
    );
  if (
    (sourceType === 'cash' || sourceType === 'bank') &&
    (!postedDate || /не\s*оплач|план|ожида/i.test(sourceStatus))
  ) {
    operationKind = 'plan';
    issues.push('Нет однозначного подтверждения фактической оплаты');
    if (postedDate && /не\s*оплач/i.test(sourceStatus))
      issues.push('Дата противоречит статусу «Не оплачено»');
  }
  if (!postedDate) issues.push('Требуется дата операции');
  const vatKopecks = optionalAmount(get('vat'), row, 'НДС', issues);
  if (vatKopecks == null && text(get('vatRate')))
    issues.push(
      'В источнике указан признак/ставка НДС; сумма налога требует подтверждения',
    );
  const stableId = text(get('sourceId'));
  const significant = {
    date: postedDate,
    amount: selectedAmount,
    income,
    expense,
    cost,
    sale,
    party: norm(get('counterparty')),
    own: norm(get('ownEntity')),
    document: norm(get('document')),
    description: norm(description),
    card: text(get('card')),
    litres: text(get('litres')),
    time: text(get('date')),
  };
  const fingerprint = digest(significant);
  const operation = {
    kind: operationKind,
    flow,
    date: postedDate,
    amountKopecks: selectedAmount == null ? null : Math.abs(selectedAmount),
    dueDate,
    plannedDate: plannedDate || (operationKind === 'plan' ? dueDate : null),
    description,
    confirmation: 'provisional',
    article: text(get('article')),
    source: {
      system: sourceType,
      id:
        stableId ||
        provenance.fileHash + ':' + provenance.sourceSheet + ':' + row,
      version: '1',
    },
  };
  if (vatKopecks != null) operation.vatKopecks = Math.abs(vatKopecks);
  if (accrualDate) operation.accrualDate = accrualDate;
  const output = {
    ...provenance,
    sourceId: operation.source.id,
    sourceFingerprint: fingerprint,
    status: selectedAmount == null ? 'error' : 'review',
    issues,
    operation,
    counterparty: {
      name: text(get('counterparty')),
      inn: text(get('inn')),
      kpp: text(get('kpp')),
      bankAccount: text(get('counterpartyAccount')),
    },
    ownEntity: {
      name: text(get('ownEntity')),
      inn: text(get('ownInn')),
      bankAccount: text(get('ownAccount')),
    },
    raw: {
      date: text(get('date')),
      status: sourceStatus,
      document: text(get('document')),
      vatRate: text(get('vatRate')),
      dueDate: text(get('dueDate')),
    },
  };
  if (sourceType === 'fuel')
    output.fuel = {
      card: text(get('card')),
      litres: text(get('litres')),
      product: text(get('product')),
      costKopecks: cost ?? amount,
      saleKopecks: sale,
      operationType: text(get('kind')),
    };
  return output;
}
function decode(buffer, sourceType) {
  try {
    return new TextDecoder('utf-8', { fatal: true })
      .decode(buffer)
      .replace(/^\ufeff/, '');
  } catch {
    if (
      sourceType === 'bank' &&
      buffer.subarray(0, 20).toString('ascii').includes('1CClientBankExchange')
    )
      return new TextDecoder('windows-1251').decode(buffer);
    fail(
      'Текстовый файл должен быть UTF-8; выписка 1С также поддерживает Windows-1251.',
    );
  }
}
function parseBankExchange(content, fileHash) {
  if (!content.startsWith('1CClientBankExchange'))
    fail('Ожидается выписка 1CClientBankExchange.');
  if (!/(?:^|\r?\n)КонецФайла(?:\r?\n|$)/.test(content))
    fail('Выписка оборвана: отсутствует КонецФайла.');
  const rows = [],
    ownAccounts = new Set(),
    controls = [];
  let document = null,
    statement = null,
    physicalLine = 0;
  for (const line of content.split(/\r?\n/)) {
    physicalLine++;
    const separator = line.indexOf('='),
      key = separator < 0 ? line.trim() : line.slice(0, separator).trim(),
      value = separator < 0 ? '' : line.slice(separator + 1).trim();
    if (key === 'СекцияРасчСчет') {
      statement = {};
      continue;
    }
    if (key === 'КонецРасчСчет') {
      if (statement) controls.push(statement);
      statement = null;
      continue;
    }
    if (key === 'СекцияДокумент') {
      if (document) fail('В выписке не закрыта секция документа.');
      document = { documentType: value, sourceRow: physicalLine };
      continue;
    }
    if (key === 'КонецДокумента') {
      if (!document) fail('Неверная структура документа выписки.');
      rows.push(document);
      if (rows.length > MAX_ROWS) fail('В выписке больше 100 000 операций.');
      document = null;
      continue;
    }
    if (document) {
      if (Object.prototype.hasOwnProperty.call(document, key))
        fail('Повторяющийся реквизит документа выписки: ' + key);
      document[key] = value;
    } else {
      if (key === 'РасчСчет') ownAccounts.add(value);
      if (statement) statement[key] = value;
    }
  }
  if (document || statement) fail('Выписка содержит незавершенную секцию.');
  const output = [];
  for (const source of rows) {
    const issues = [],
      amount = optionalAmount(source.Сумма, source.sourceRow, 'Сумма', issues);
    const debit = ownAccounts.has(source.ПлательщикСчет),
      credit = ownAccounts.has(source.ПолучательСчет);
    const sides = [];
    if (debit)
      sides.push({
        flow: 'out',
        account: source.ПлательщикСчет,
        date: source.ДатаСписано,
        party: 'Получатель',
      });
    if (credit)
      sides.push({
        flow: 'in',
        account: source.ПолучательСчет,
        date: source.ДатаПоступило,
        party: 'Плательщик',
      });
    if (!sides.length)
      sides.push({
        flow: null,
        account: null,
        date: null,
        party: 'Получатель',
      });
    for (const side of sides) {
      const rowIssues = [...issues],
        day = optionalDate(
          side.date,
          source.sourceRow,
          'Фактическая дата банка',
          rowIssues,
          false,
        );
      if (!side.flow)
        rowIssues.push(
          'Счет документа не сопоставлен со своими счетами выписки',
        );
      if (!day) rowIssues.push('Нет фактической даты банковской операции');
      if (debit && credit)
        rowIssues.push(
          'Перевод между своими счетами: связать обе стороны без внешнего оборота',
        );
      const fingerprint = digest([
        side.account,
        source.Номер,
        source.Дата,
        side.flow,
        amount,
        source.ПлательщикСчет,
        source.ПолучательСчет,
        source.НазначениеПлатежа,
      ]);
      const sourceId =
        source.ИдентификаторДокумента || source.Идентификатор || null;
      output.push({
        rowNumber: output.length + 1,
        sourceSheet: 'Выписка',
        sourceRow: source.sourceRow,
        fileHash,
        sourceId: sourceId
          ? sourceId + ':' + side.account + ':' + side.flow
          : fileHash + ':' + source.sourceRow + ':' + side.flow,
        sourceFingerprint: fingerprint,
        status: side.flow && day && amount != null ? 'review' : 'error',
        issues: rowIssues,
        operation: {
          kind: side.flow === 'in' ? 'cash_in' : 'cash_out',
          date: day,
          amountKopecks: amount == null ? null : Math.abs(amount),
          description: source.НазначениеПлатежа || '',
          confirmation: 'confirmed',
          source: {
            system: 'bank',
            id: sourceId
              ? sourceId + ':' + side.account + ':' + side.flow
              : fileHash + ':' + source.sourceRow + ':' + side.flow,
            version: '1',
          },
        },
        counterparty: {
          name: source[side.party + '1'] || source[side.party] || '',
          inn: source[side.party + 'ИНН'] || '',
          kpp: source[side.party + 'КПП'] || '',
          bankAccount: source[side.party + 'Счет'] || '',
        },
        ownEntity: {
          name:
            source[(side.flow === 'out' ? 'Плательщик' : 'Получатель') + '1'] ||
            '',
          inn:
            source[
              (side.flow === 'out' ? 'Плательщик' : 'Получатель') + 'ИНН'
            ] || '',
          bankAccount: side.account,
        },
        raw: {
          document: source.Номер || '',
          documentDate: source.Дата || '',
          transferCandidate: debit && credit,
        },
      });
    }
  }
  return { rows: output, controls };
}
function canonicalRows(content, fileHash) {
  let payload;
  try {
    payload = JSON.parse(content);
  } catch {
    fail('Некорректный JSON выгрузки 1С.');
  }
  if (
    payload.schemaVersion !== 'finance.import.v1' ||
    !Array.isArray(payload.operations) ||
    !payload.sourceSystem ||
    !payload.sourceBaseId
  )
    fail(
      'Для 1С нужен контракт finance.import.v1: sourceSystem, sourceBaseId и operations.',
    );
  if (payload.operations.length > MAX_ROWS)
    fail('В выгрузке больше 100 000 операций.');
  return payload.operations.map((operation, index) => {
    if (
      !operation ||
      typeof operation !== 'object' ||
      Array.isArray(operation) ||
      !operation.source?.id
    )
      fail('Каждой операции 1С нужен постоянный source.id.');
    const safe = JSON.parse(JSON.stringify(operation)),
      id = String(payload.sourceBaseId) + ':' + String(operation.source.id);
    safe.source = {
      system: 'one_c',
      id,
      version: String(operation.source.version || '1'),
    };
    const issues = [];
    if (!safe.date) issues.push('Требуется дата');
    if (!Number.isSafeInteger(safe.amountKopecks) && safe.kind !== 'opening')
      issues.push('Требуется точная сумма в копейках');
    // Validation of accounting meaning/identities belongs to buildOperation in the committing transaction.
    return {
      rowNumber: index + 1,
      sourceSheet: payload.sourceBaseId,
      sourceRow: index + 1,
      fileHash,
      sourceId: id,
      sourceFingerprint: digest(safe),
      operation: safe,
      counterparty: operation.counterparty || {},
      ownEntity: operation.ownEntity || {},
      status: issues.length ? 'error' : 'review',
      issues,
      raw: { declaredSource: String(payload.sourceSystem) },
    };
  });
}
async function parseFinanceImport({
  buffer,
  fileName,
  sourceType,
  selectedSheets,
}) {
  if (!SOURCE_TYPES.includes(sourceType))
    fail('Выберите источник: банк, поставщики, касса, топливо или 1С.');
  if (
    !Buffer.isBuffer(buffer) ||
    !buffer.length ||
    buffer.length > MAX_FILE_BYTES
  )
    fail('Размер файла должен быть от 1 байта до 20 МиБ.');
  if (
    selectedSheets != null &&
    (!Array.isArray(selectedSheets) ||
      selectedSheets.some((value) => typeof value !== 'string'))
  )
    fail('Некорректный список листов.');
  const extension = String(fileName).toLowerCase().split('.').pop(),
    fileHash = digest(buffer),
    ignoredSheets = [],
    worksheets = [],
    controls = [];
  let rows = [];
  if (extension === 'json' && sourceType === 'one_c')
    rows = canonicalRows(decode(buffer, sourceType), fileHash);
  else if (extension === 'txt' && sourceType === 'bank') {
    const result = parseBankExchange(decode(buffer, sourceType), fileHash);
    rows = result.rows;
    controls.push(...result.controls);
  } else if (extension === 'csv')
    worksheets.push({
      name: 'CSV',
      date1904: false,
      records: csvRecords(decode(buffer, sourceType)),
    });
  else if (extension === 'xlsx') {
    checkZip(buffer);
    const ExcelJS = require('exceljs'),
      workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(buffer);
    } catch {
      fail('Не удалось прочитать XLSX.');
    }
    if (workbook.worksheets.length > 300) fail('В книге больше 300 листов.');
    for (const sheet of workbook.worksheets) {
      if (selectedSheets?.length && !selectedSheets.includes(sheet.name)) {
        ignoredSheets.push({ sheet: sheet.name, reason: 'Не выбран' });
        continue;
      }
      if (/архив/i.test(sheet.name) && !selectedSheets?.includes(sheet.name)) {
        ignoredSheets.push({
          sheet: sheet.name,
          reason: 'Архив: не является открытой задолженностью',
        });
        continue;
      }
      if (
        sourceType === 'fuel' &&
        !/^(RN|РН|LC|ЛК)$/i.test(sheet.name) &&
        !selectedSheets?.includes(sheet.name)
      ) {
        ignoredSheets.push({
          sheet: sheet.name,
          reason: 'Не исходный лист пролива RN/LC',
        });
        continue;
      }
      const records = [];
      sheet.eachRow((row, sourceRow) => {
        if (records.length >= MAX_ROWS)
          fail('Лист содержит больше 100 000 строк.');
        if (row.actualCellCount > 300)
          fail('Лист содержит слишком много колонок.');
        records.push({ sourceRow, cells: row.values.slice(1) });
      });
      worksheets.push({
        name: sheet.name,
        date1904: Boolean(workbook.properties.date1904),
        records,
      });
    }
  } else fail('Поддерживаются XLSX, CSV, выписка 1С TXT и контракт 1С JSON.');
  for (const sheet of worksheets) {
    let candidate = null;
    for (const record of sheet.records.slice(0, 30)) {
      const map = columns(record.cells),
        value = score(map, sourceType);
      if (value > (candidate?.score || 0))
        candidate = { ...record, map, score: value };
    }
    if (!candidate) {
      ignoredSheets.push({
        sheet: sheet.name,
        reason:
          'Структура не распознана; графики/заметки требуют отдельного сопоставления',
      });
      continue;
    }
    const cashDates = candidate.cells
      .map((cell, index) => (ALIASES.get(norm(cell)) === 'date' ? index : -1))
      .filter((index) => index >= 0);
    const cashSplit =
      sourceType === 'cash' &&
      candidate.map.income != null &&
      candidate.map.expense != null &&
      cashDates.length === 2
        ? cashDates[1]
        : null;
    for (const record of sheet.records) {
      if (record.sourceRow <= candidate.sourceRow) continue;
      if (rows.length >= MAX_ROWS)
        fail('Импорт содержит больше 100 000 операций.');
      if (cashSplit != null) {
        for (const [side, start, end] of [
          ['in', 0, cashSplit],
          ['out', cashSplit, candidate.cells.length],
        ]) {
          const row = rowFromCells(
            record.cells.slice(start, end),
            columns(candidate.cells.slice(start, end)),
            {
              fileHash,
              sourceSheet: sheet.name,
              sourceRow: record.sourceRow,
              rowNumber: rows.length + 1,
            },
            sourceType,
            sheet.date1904,
          );
          if (row) {
            row.sourceId += ':' + side;
            row.operation.source.id = row.sourceId;
            rows.push(row);
          }
        }
      } else {
        const row = rowFromCells(
          record.cells,
          candidate.map,
          {
            fileHash,
            sourceSheet: sheet.name,
            sourceRow: record.sourceRow,
            rowNumber: rows.length + 1,
          },
          sourceType,
          sheet.date1904,
        );
        if (row) rows.push(row);
      }
    }
  }
  if (!rows.length)
    fail(
      'Не найдены распознаваемые операции. Выберите соответствующий источник или подготовьте CSV с заголовками date,amount,counterparty,description.',
    );
  const fingerprints = new Map(),
    ids = new Set();
  let total = 0n;
  for (const row of rows) {
    const previous = fingerprints.get(row.sourceFingerprint);
    if (previous) {
      row.issues.push(
        'Возможный повтор строки ' +
          previous.rowNumber +
          ': проверьте связь, строки не удалены',
      );
      previous.issues.push('Есть похожая строка ' + row.rowNumber);
    } else fingerprints.set(row.sourceFingerprint, row);
    if (ids.has(row.sourceId)) {
      row.status = 'error';
      row.issues.push('Повтор постоянного ID источника');
    }
    ids.add(row.sourceId);
    if (Number.isSafeInteger(row.operation.amountKopecks))
      total += BigInt(row.operation.amountKopecks);
  }
  if (total > BigInt(Number.MAX_SAFE_INTEGER))
    fail('Итог импорта превышает предел точного расчета.');
  return {
    schemaVersion: 'finance.import.v1',
    sourceType,
    fileName: String(fileName),
    sha256: fileHash,
    rows,
    ignoredSheets,
    controls,
    summary: {
      rowCount: rows.length,
      totalKopecks: Number(total),
      reviewCount: rows.filter((row) => row.status === 'review').length,
      errorCount: rows.filter((row) => row.status === 'error').length,
      ignoredSheetCount: ignoredSheets.length,
      paymentPolicy:
        'Факт оплаты подтверждается выпиской или кассой, не статусом счета; неподтвержденные строки требуют проверки.',
    },
  };
}
module.exports = {
  parseFinanceImport,
  parseBankExchange,
  SOURCE_TYPES,
  MAX_FILE_BYTES,
};
