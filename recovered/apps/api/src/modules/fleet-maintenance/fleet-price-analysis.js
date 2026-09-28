// SPDX-License-Identifier: MIT
'use strict';

const DAY = 86400000;
const MIN_ORDERS = 3;
const LOOKBACK_DAYS = 365;
const ALERT_PERCENT = 25;
const normalize = value => String(value ?? '').normalize('NFKC').trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ');
function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const ms = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value ? ms : null;
}
function median(values) {
  const sorted = values.slice().sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
const round = value => Math.round(value * 100) / 100;
const currency = row => normalize(row.currency || 'RUB').toUpperCase();
function comparableKey(row) {
  return JSON.stringify(['name', 'positionType', 'unit', 'partBrand', 'vehicleBrand', 'vehicleGroup'].map(key => normalize(row[key]))
    .concat([currency(row), row.ownWorkReported === true ? 'internal' : 'external']));
}
function validPrice(row) {
  return Boolean(normalize(row.name) && normalize(row.positionType) && normalize(row.unit) &&
    typeof row.quantity === 'number' && Number.isFinite(row.quantity) && row.quantity > 0 &&
    Number.isSafeInteger(row.amountCents) && row.amountCents > 0 && Number.isFinite(row.amountCents / row.quantity));
}
function sum(values) {
  const amount = values.reduce((total, value) => total + BigInt(value || 0), 0n);
  return amount <= BigInt(Number.MAX_SAFE_INTEGER) && amount >= BigInt(Number.MIN_SAFE_INTEGER) ? Number(amount) : null;
}
function listPriceOrders(rows, search = '', limit = 500) {
  const grouped = new Map(), query = normalize(search);
  for (const row of rows) {
    if (!row.orderId) continue;
    const key = String(row.orderId);
    let order = grouped.get(key);
    if (!order) grouped.set(key, order = { orderId: key, orderNumber: row.orderNumber || key, plate: row.plate || '',
      openedOn: row.openedOn || null, completedOn: row.completedOn || null, lineCount: 0, amounts: [] });
    order.lineCount++;
    if (Number.isSafeInteger(row.amountCents)) order.amounts.push(row.amountCents);
  }
  const orders = [...grouped.values()].filter(order => !query || normalize(`${order.orderId} ${order.orderNumber} ${order.plate}`).includes(query))
    .sort((a, b) => String(b.completedOn || b.openedOn || '').localeCompare(String(a.completedOn || a.openedOn || '')) || a.orderId.localeCompare(b.orderId));
  return { total: orders.length, items: orders.slice(0, limit).map(({ amounts, ...order }) => ({ ...order, amountCents: sum(amounts) })) };
}
function analyzePrices(rows, orderId, today = new Date().toISOString().slice(0, 10)) {
  const targets = rows.filter(row => String(row.orderId) === orderId);
  if (!targets.length) { const error = new Error('Заказ-наряд не найден в выбранной области.'); error.status = 400; throw error; }
  if (targets.length > 1000) { const error = new Error('В заказ-наряде более 1 000 позиций. Разделите документ перед анализом.'); error.status = 400; throw error; }
  const index = new Map();
  for (const row of rows) {
    if (!row.orderId || String(row.orderId) === orderId || !validPrice(row) || !date(row.completedOn) || !['финиш', 'completed', 'завершен', 'закрыт'].includes(normalize(row.status))) continue;
    const key = comparableKey(row);
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(row);
  }
  const items = targets.map((row, indexNumber) => {
    const asOf = [row.completedOn, row.openedOn].find(value => date(value) !== null && value <= today) || null;
    const item = { index: indexNumber + 1, sourceRow: row.sourceRow, name: row.name || 'Без наименования', positionType: row.positionType,
      unit: row.unit || '', currency: currency(row), quantity: row.quantity, amountCents: row.amountCents,
      quotedUnitPriceCents: row.unitPriceCents, effectiveUnitPriceCents: validPrice(row) ? round(row.amountCents / row.quantity) : null,
      status: 'insufficient_data', comparisonOrderCount: 0, evidence: [], asOf };
    if (!validPrice(row)) return { ...item, reason: 'Нужны положительная сумма и количество, наименование, тип позиции и единица измерения.' };
    if (!asOf) return { ...item, reason: 'Нет корректной даты заказ-наряда для исторического сравнения.' };
    const cutoff = date(asOf), grouped = new Map();
    for (const previous of index.get(comparableKey(row)) || []) {
      const completed = date(previous.completedOn);
      if (completed > cutoff || completed < cutoff - LOOKBACK_DAYS * DAY) continue;
      const key = String(previous.orderId);
      let sample = grouped.get(key);
      if (!sample) grouped.set(key, sample = { orderId: key, orderNumber: previous.orderNumber || key,
        completedOn: previous.completedOn, supplier: previous.supplier || '', quantity: 0, amountCents: 0 });
      sample.quantity += previous.quantity;
      sample.amountCents += previous.amountCents;
    }
    const samples = [...grouped.values()].filter(sample => Number.isSafeInteger(sample.amountCents) && Number.isFinite(sample.quantity) && sample.quantity > 0)
      .map(sample => ({ ...sample, effectiveUnitPriceCents: sample.amountCents / sample.quantity }))
      .sort((a, b) => b.completedOn.localeCompare(a.completedOn) || a.orderId.localeCompare(b.orderId));
    item.comparisonOrderCount = samples.length;
    item.evidence = samples.slice(0, 5).map(sample => ({ ...sample, effectiveUnitPriceCents: round(sample.effectiveUnitPriceCents) }));
    if (samples.length < MIN_ORDERS) return { ...item, reason: `Найдено ${samples.length} сопоставимых завершённых заказ-нарядов; нужно минимум ${MIN_ORDERS}.` };
    const prices = samples.map(sample => sample.effectiveUnitPriceCents), benchmark = median(prices);
    const deviationPercent = ((row.amountCents / row.quantity) / benchmark - 1) * 100;
    const benchmarkAmount = Math.round(benchmark * row.quantity);
    return { ...item, status: deviationPercent > ALERT_PERCENT ? 'above_history' : deviationPercent < -ALERT_PERCENT ? 'below_history' : 'within_history',
      medianUnitPriceCents: round(benchmark), minUnitPriceCents: round(Math.min(...prices)), maxUnitPriceCents: round(Math.max(...prices)),
      deviationPercent: round(deviationPercent), benchmarkAmountCents: Number.isSafeInteger(benchmarkAmount) ? benchmarkAmount : null };
  });
  const comparable = items.filter(item => item.status !== 'insufficient_data');
  return { orderId, orderNumber: targets[0].orderNumber || orderId, plate: targets[0].plate || '', generatedAt: new Date().toISOString(),
    method: 'historical_comparison', currency: 'RUB',
    methodDescription: 'Фактическая сумма позиции делится на количество: скидки и корректировки включены. Сравнение с медианой отдельных завершённых заказ-нарядов за 365 дней до даты документа в той же области. Совпадают наименование, тип, единица, бренд детали, бренд и группа ТС, валюта и выполнение своими силами. Минимум 3 заказ-наряда, порог отклонения ±25%.',
    limitation: 'Это сравнение с собственной историей, а не подтверждение текущих рыночных цен. Отклонение — повод проверить комплектацию, условия работ и документы.',
    summary: { lineCount: items.length, comparedCount: comparable.length, insufficientCount: items.length - comparable.length,
      aboveCount: items.filter(item => item.status === 'above_history').length,
      belowCount: items.filter(item => item.status === 'below_history').length,
      amountCents: sum(items.map(item => Number.isSafeInteger(item.amountCents) ? item.amountCents : 0)) }, items };
}
function analysisPrompt(result) {
  return JSON.stringify({ orderId: result.orderId, summary: result.summary, method: result.methodDescription, limitation: result.limitation,
    items: result.items.slice(0, 100).map(({ evidence, ...item }) => ({ ...item, evidence: evidence.slice(0, 3) })),
    omittedPositions: Math.max(0, result.items.length - 100) });
}
module.exports = { analyzePrices, listPriceOrders, analysisPrompt };
