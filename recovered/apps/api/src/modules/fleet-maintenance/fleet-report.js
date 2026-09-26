'use strict';

// Application report generator: consume the same authoritative analytics object
// as the screen. No workbook re-import, page-based totals or hidden reaggregation.
const PptxGenJS = require('pptxgenjs');
const COLORS = { ink: '142C42', muted: '526477', blue: '1664B8', teal: '008779', pale: 'EDF3F8', border: 'D6E0E9', white: 'FFFFFF' };
const RUBLES = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const COUNT = new Intl.NumberFormat('ru-RU');
function money(value) { return value == null ? 'Нет данных' : RUBLES.format(value / 100) + ' ₽'; }
function count(value) { return COUNT.format(value || 0); }
function safeText(value) { return String(value == null ? '' : value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ''); }
function wrap(value, chars) {
  const lines = [];
  for (const paragraph of safeText(value).split(/\r?\n/)) {
    let line = '';
    for (let word of paragraph.split(/\s+/).filter(Boolean)) {
      while (word.length > chars) { if (line) { lines.push(line); line = ''; } lines.push(word.slice(0, chars)); word = word.slice(chars); }
      if (!word) continue;
      if (line.length + word.length + 1 > chars) { lines.push(line); line = word; } else line += (line ? ' ' : '') + word;
    }
    lines.push(line);
  }
  return lines.length ? lines : [''];
}
function filterLines(filters = {}) {
  const fields = [['vehicleGroup', 'Группа ТС'], ['vehicleKey', 'Автомобиль'], ['group', 'Группа затрат'], ['node', 'Узел'], ['positionType', 'Тип позиции'], ['positionName', 'Наименование'], ['supplier', 'Подрядчик'], ['search', 'Поиск'], ['orderId', 'Заказ-наряд'], ['issueCode', 'Проверка качества']];
  return [
    ['Период', (filters.dateFrom || 'Начало истории') + ' — ' + (filters.dateTo || 'Конец истории')],
    ['Основание периода', filters.dateBasis === 'opened' ? 'Дата открытия' : 'Дата завершения'],
    ['Статусы', filters.status === 'finished' ? 'Только «Финиш»' : filters.status === 'unfinished' ? 'Все, кроме «Финиш»' : 'Все статусы, включая незавершённые'],
    ...fields.filter(([key]) => filters[key]).map(([key, label]) => [label, key === 'supplier' && filters[key] === '__missing__' ? 'Не указан' : safeText(filters[key])]),
  ];
}

async function generateFleetReport({ analytics, dataset = null, scope = null, reconciliation = null, operations = null, generatedAt = new Date().toISOString() } = {}) {
  if (!analytics || !analytics.summary || !Number.isSafeInteger(analytics.summary.amountCents)) { const error = new Error('Нет рассчитанных данных для отчёта.'); error.status = 400; throw error; }
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE'; pptx.author = 'ЕЦЛ'; pptx.subject = 'Ремонт и обслуживание автопарка'; pptx.title = 'Отчёт по ремонту автопарка'; pptx.company = 'ЕЦЛ'; pptx.lang = 'ru-RU';
  pptx.theme = { headFontFace: 'Arial', bodyFontFace: 'Arial', lang: 'ru-RU' };
  const summary = analytics.summary, filters = analytics.filters || {}, fileName = safeText(dataset && dataset.fileName || 'Текущие данные ЕЦЛ').split(/[\\/]/).at(-1);
  const scopeLabel = typeof scope === 'string' ? scope : scope && (scope.scopeName || scope.projectName || scope.name) || 'Выбранная область ответственности';
  const source = 'Источник: ' + fileName + '. ' + safeText(scopeLabel) + '. Сформировано: ' + safeText(generatedAt) + '.';
  const period = (filters.dateFrom || 'Начало истории') + ' — ' + (filters.dateTo || 'Конец истории');
  let number = 0;
  function slide(title, note = '') {
    const page = pptx.addSlide(); number++; page.background = { color: COLORS.white };
    page.addText(safeText(title), { x: .55, y: .35, w: 12.1, h: .68, fontFace: 'Arial', fontSize: 30, bold: true, color: COLORS.ink, margin: 0, breakLine: false });
    page.addText('ЕЦЛ  /  Ремонт автопарка', { x: .55, y: 7.03, w: 10.6, h: .2, fontSize: 10, color: COLORS.muted, margin: 0 });
    page.addText(String(number), { x: 12.1, y: 7.03, w: .6, h: .2, fontSize: 10, align: 'right', color: COLORS.muted, margin: 0 });
    page.addNotes(source + '\n' + note + '\nФильтры: ' + JSON.stringify(filters));
    return page;
  }
  function paragraph(page, value, y = 1.45, height = 4.7, size = 20) {
    page.addText(safeText(value), { x: .65, y, w: 12.0, h: height, fontSize: size, fontFace: 'Arial', color: COLORS.ink, margin: 0, valign: 'top', paraSpaceAfterPt: 14, breakLine: false });
  }
  function tablePages(title, headers, rows, widths, note = '', charsOverride) {
    if (!rows.length) { paragraph(slide(title, note), 'По выбранным фильтрам данных нет.'); return; }
    const chars = charsOverride || widths.map(width => Math.max(9, Math.floor(width * 8.3)));
    const physical = [];
    for (const cells of rows) {
      const wrapped = cells.map((cell, index) => wrap(cell, chars[index]));
      const max = Math.max(...wrapped.map(lines => lines.length));
      // A single long source label continues on another page instead of shrinking
      // its font, clipping it or silently dropping characters.
      for (let start = 0; start < max; start += 8) physical.push({ cells: wrapped.map(lines => lines.slice(start, start + 8).join('\n')), lines: Math.min(8, max - start) });
    }
    const pages = []; let current = [], lineCount = 0;
    for (const item of physical) {
      const cost = item.lines + .6;
      if (current.length && lineCount + cost > 12.9) { pages.push(current); current = []; lineCount = 0; }
      current.push(item); lineCount += cost;
    }
    if (current.length) pages.push(current);
    pages.forEach((items, index) => {
      const page = slide(title + (pages.length > 1 ? ' (' + (index + 1) + '/' + pages.length + ')' : ''), note);
      const cells = [headers.map(text => ({ text: safeText(text), options: { fill: COLORS.ink, color: COLORS.white, bold: true, fontSize: 16 } })),
        ...items.map((item, rowIndex) => item.cells.map((text, col) => ({ text, options: { fill: rowIndex % 2 ? COLORS.white : COLORS.pale, color: COLORS.ink, align: col ? 'right' : 'left' } })))];
      page.addTable(cells, { x: .6, y: 1.35, w: 12.1, colW: widths, rowH: [.5, ...items.map(item => .32 * item.lines + .16)], fontFace: 'Arial', fontSize: 17, margin: [.06, .08, .06, .08],
        border: { type: 'solid', color: COLORS.border, pt: .6 }, autoPage: false, valign: 'mid' });
      if (note) page.addText(safeText(note), { x: .65, y: 6.23, w: 12.0, h: .58, fontSize: 12, color: COLORS.muted, margin: 0, valign: 'top' });
    });
  }
  function chart(title, entries, { horizontal = false, label = entry => entry.label, note = '', series = null } = {}) {
    const page = slide(title, note);
    if (!entries.length) { paragraph(page, 'По выбранным фильтрам данных нет.'); return; }
    const labels = entries.map(label), data = series || [{ name: 'Сумма, ₽', labels, values: entries.map(entry => entry.amountCents / 100) }];
    const axisMinimum = Math.min(0, ...data.flatMap(item => item.values));
    page.addChart(pptx.ChartType.bar, data, { x: .55, y: 1.35, w: 12.05, h: 4.85, catAxisLabelFontFace: 'Arial', catAxisLabelFontSize: horizontal ? 16 : 14,
      valAxisLabelFontFace: 'Arial', valAxisLabelFontSize: 12, valAxisLabelFormatCode: '#,##0', valAxisMinVal: axisMinimum, catAxisLineShow: false, valAxisLineShow: false,
      catAxisLabelColor: COLORS.ink, valAxisLabelColor: COLORS.muted, chartColors: [COLORS.blue, COLORS.teal], showTitle: false, showLegend: data.length > 1,
      legendPos: 'b', legendFontSize: 15, showValue: false, barDir: horizontal ? 'bar' : 'col', catAxisLabelRotate: 0, showBorder: false,
      showCatName: false, showSerName: false, gapSizePct: 70, showMarker: false, valGridLine: { color: COLORS.border, width: 1 } });
    page.addText(note || 'Суммы в рублях. Точные значения приведены в таблицах.', { x: .65, y: 6.28, w: 12.0, h: .52, fontSize: 13, color: COLORS.muted, margin: 0 });
  }

  const cover = slide('Ремонт и обслуживание автопарка');
  cover.addText('Отчёт по затратам', { x: .65, y: 1.6, w: 11.5, h: .8, fontSize: 42, bold: true, color: COLORS.ink, margin: 0 });
  paragraph(cover, safeText(scopeLabel) + '\n' + period, 2.65, 1.4, 24);
  paragraph(cover, money(summary.amountCents), 4.55, .8, 36);
  cover.addText(count(summary.orderCount) + ' заказов-нарядов   /   ' + count(summary.vehicleCount) + ' автомобилей в выборке', { x: .65, y: 5.6, w: 12.0, h: .55, fontSize: 20, color: COLORS.muted, margin: 0 });

  tablePages('Основные показатели', ['Показатель', 'Значение'], [
    ['Сумма позиций', money(summary.amountCents)], ['Работы', money(summary.laborCents)], ['Запчасти', money(summary.partsCents)],
    ['Заказы-наряды', count(summary.orderCount)], ['Автомобили с позициями', count(summary.vehicleCount)], ['Позиции', count(summary.rowCount)],
    ['Средняя сумма на заказ-наряд', money(summary.averageOrderCents)], ['Средняя сумма на автомобиль в выборке', money(summary.averageVehicleCents)],
  ], [8.1, 4], 'Показатели используют всю отфильтрованную выборку. Страница таблицы позиций не ограничивает расчёты.');

  const months = analytics.months || [];
  const monthChunks = months.length ? Array.from({ length: Math.ceil(months.length / 12) }, (_, index) => months.slice(index * 12, index * 12 + 12)) : [[]];
  monthChunks.forEach((entries, index) => chart('Расходы по месяцам' + (monthChunks.length > 1 ? ' (' + (index + 1) + '/' + monthChunks.length + ')' : ''), entries, { note: 'Основание периода: ' + (filters.dateBasis === 'opened' ? 'дата открытия' : 'дата завершения') + '. Частичный месяц нельзя сравнивать с полным без поправки на период.' }));
  tablePages('Расходы по месяцам', ['Месяц', 'Сумма, ₽', 'ЗН', 'ТС'], months.map(entry => [entry.label, money(entry.amountCents), count(entry.orderCount), count(entry.vehicleCount)]), [3.8, 4.3, 2, 2]);

  const groups = analytics.groups || [];
  chart('Крупнейшие группы затрат', groups.slice(0, 8), { horizontal: true, label: (entry, index) => String(index + 1), note: 'Первые ' + Math.min(8, groups.length) + ' групп по сумме. Номера соответствуют порядку строк следующей таблицы. Полный перечень групп сохранён в таблице.' });
  tablePages('Группы затрат', ['Группа', 'Сумма, ₽', 'Доля', 'ЗН'], groups.map((entry, index) => [(index + 1) + '. ' + entry.label, money(entry.amountCents), entry.share == null ? '—' : (entry.share * 100).toFixed(1) + '%', count(entry.orderCount)]), [6.6, 3.1, 1.2, 1.2]);
  tablePages('Группы автомобилей', ['Группа ТС', 'Сумма, ₽', 'ТС', 'ЗН'], (analytics.vehicleGroups || []).map(entry => [entry.label, money(entry.amountCents), count(entry.vehicleCount), count(entry.orderCount)]), [6.6, 3.1, 1.2, 1.2], 'Это распределение расходов. Разные пробеги, возраст и состав ремонтов не позволяют по нему оценить надёжность марок.');

  const vehicles = analytics.vehicles || [];
  chart('Автомобили с наибольшими затратами', vehicles.slice(0, 10), { horizontal: true, note: 'Первые ' + Math.min(10, vehicles.length) + ' автомобилей по сумме. Рейтинг расходов требует проверки пробега и условий эксплуатации.' });
  tablePages('Автомобили с наибольшими затратами', ['Автомобиль', 'Группа ТС', 'Сумма, ₽', 'ЗН'], vehicles.slice(0, 20).map(entry => [entry.plate || entry.label, entry.vehicleGroup, money(entry.amountCents), count(entry.orderCount)]), [2.5, 5, 3.4, 1.2], 'Показаны первые ' + Math.min(20, vehicles.length) + ' из ' + vehicles.length + ' автомобилей по сумме. Полная детализация доступна в разделе «Позиции» и CSV.');

  chart('Работы и запчасти', [{ label: 'Работы', amountCents: summary.laborCents }, { label: 'Запчасти', amountCents: summary.partsCents }], { horizontal: true,
    note: 'Состав суммы по типу позиции. Признак «своими силами» из импорта не доказывает внутреннюю себестоимость.' });
  tablePages('Наименования с наибольшими затратами', ['Наименование', 'Тип', 'Сумма, ₽'], (analytics.positions || []).slice(0, 15).map(entry => [entry.name || entry.label, entry.positionType, money(entry.amountCents)]), [7.2, 1.7, 3.2], 'Первые ' + Math.min(15, (analytics.positions || []).length) + ' наименований по сумме. Запчасти и работы с одинаковым названием учитываются отдельно.');
  tablePages('Подрядчики', ['Подрядчик', 'Сумма, ₽', 'ЗН'], (analytics.suppliers || []).slice(0, 20).map(entry => [entry.label, money(entry.amountCents), count(entry.orderCount)]), [7.5, 3.4, 1.2], 'Первые ' + Math.min(20, (analytics.suppliers || []).length) + ' подрядчиков по сумме. «Не указан» сохраняет неопределённость источника.');

  const quality = analytics.quality || { items: [], affectedRows: 0, issueCount: 0 };
  tablePages('Качество данных', ['Проверка', 'Позиций', 'Сумма позиций, ₽'], (quality.items || []).map(item => [item.label, count(item.count), money(item.amountCents)]), [7.2, 1.7, 3.2],
    'Затронуто ' + count(quality.affectedRows) + ' позиций. Одна позиция может иметь несколько замечаний. Суммы замечаний пересекаются и не складываются.');
  const examples = (quality.items || []).flatMap(issue => (issue.examples || []).slice(0, 2).map(example => [issue.label, String(example.sourceRow), safeText(example.plate), safeText(example.message)]));
  tablePages('Примеры для проверки', ['Проверка', 'Строка', 'ТС', 'Наблюдение'], examples, [3.2, 1.5, 2, 5.4], 'До двух примеров на проверку из текущей выборки. Повторы и корректировки сохранены в суммах. Это признаки для проверки первичных документов.');

  if (reconciliation && reconciliation.kind !== 'none' && reconciliation.summary) {
    const rec = reconciliation.summary;
    const page = slide('Сохранённая сверка', reconciliation.notice);
    paragraph(page, 'Сверка имеет отдельный исторический охват. Фильтры аналитического отчёта к сохранённому снимку не применяются.\n\nПокрыто пар «автомобиль–месяц»: ' + count(rec.coveredKeys) + '.\nСумма текущих позиций для этих пар: ' + money(rec.currentAmountCents) + '.\nСумма второго реестра в снимке: ' + money(rec.comparisonAmountCents) + '.\nРазница второго реестра и текущих позиций: ' + money(rec.differenceCents) + '.', 1.4, 4.8, 21);
    tablePages('Крупнейшие расхождения сверки', ['ТС / месяц', 'Текущие позиции, ₽', 'Второй реестр, ₽', 'Разница, ₽'], (reconciliation.rows || []).slice(0, 15).map(entry => [entry.plate + '\n' + entry.month, money(entry.currentAmountCents), money(entry.comparisonAmountCents), money(entry.differenceCents)]), [3.4, 2.9, 2.9, 2.9], 'Первые 15 покрытых пар по абсолютной разнице. Частичный исторический снимок нельзя считать сверкой с полным независимым реестром.');
  } else {
    paragraph(slide('Сверка с другим реестром'), 'В выбранном наборе нет сохранённой сверки.\n\nДля независимого контроля нужен полный второй реестр за тот же период с устойчивыми идентификаторами автомобилей и одинаковым правилом включения затрат.', 1.6, 4.6, 24);
  }

  if (operations && operations.records) {
    const records = operations.records, flat = value => value && value.payload ? { ...value.payload, id: value.id } : value;
    const fuel = (records.fuel || []).map(flat), vehiclesById = new Map((records.vehicles || []).map(flat).map(vehicle => [vehicle.id, vehicle.plate]));
    tablePages('Топливо в текущем учёте', ['Дата', 'Автомобиль', 'Литры', 'Сумма, ₽'], fuel.slice().sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 20).map(item => [item.date, vehiclesById.get(item.vehicleId) || 'ТС не найдено', new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3 }).format(item.litres), money(item.amountCents)]), [2.4, 3.9, 2, 3.8], 'Последние 20 заправок всей области ответственности. Фильтры ремонтных затрат здесь не применяются. Топливо не входит в сумму ремонтов.');
    const statuses = { overdue: 'Просрочено', soon: 'Скоро', scheduled: 'Запланировано', unknown: 'Недостаточно данных', inactive: 'Неактивно' };
    tablePages('План технического обслуживания', ['Автомобиль / ТО', 'Состояние', 'Срок', 'Порог, км'], (operations.maintenance || []).map(item => [(vehiclesById.get(item.vehicleId) || 'ТС не найдено') + '\n' + item.label, statuses[item.status] || item.status, item.dueOn || 'Не указан', item.dueOdometerKm == null ? 'Не указан' : count(item.dueOdometerKm)]), [5.1, 3, 2, 2], 'Текущий план всей области ответственности. Фильтры ремонтных затрат не применяются. Статус зависит от актуальности одометра.');
  }

  tablePages('Источник и фильтры', ['Параметр', 'Значение'], [['Источник', fileName], ['Область ответственности', scopeLabel], ['Снимок загружен', dataset && dataset.createdAt ? String(dataset.createdAt) : 'Данные приложения'],
    ['Сформировано', generatedAt], ...filterLines(filters)], [4.1, 8], 'Отчёт содержит суммы позиций из источника и собственных документов ЕЦЛ в выбранной области.');
  paragraph(slide('Определения и ограничения'), 'Сумма источника имеет приоритет перед количеством × ценой. Скидки, возвраты и другие корректировки требуют основания.\n\nЧисло автомобилей означает автомобили с позициями в выборке. Для ₽/км, простоев и полной стоимости владения нужны пробег периода, даты фактической недоступности и дополнительные затраты.\n\nПовторные строки сохраняются. Совпадение текста не доказывает двойное списание.\n\nСвязи госномеров объединяют автомобили только после подтверждения стабильного идентификатора.', 1.35, 5.25, 21);
  const output = await pptx.write({ outputType: 'nodebuffer', compression: true });
  return Buffer.isBuffer(output) ? output : Buffer.from(output);
}

module.exports = { generateFleetReport };
