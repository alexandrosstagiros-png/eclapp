'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const JSZip = require('../recovered/node_modules/jszip');
const { analyze } = require('../recovered/apps/api/src/modules/fleet-maintenance/fleet-model');
const { generateFleetReport } = require('../recovered/apps/api/src/modules/fleet-maintenance/fleet-report');

function row(index) { return { sourceRow: index + 2, orderId: String(index), plate: 'а123аа797', name: 'Диагностика', group: 'Двигатель', node: 'ДВС', vehicleGroup: 'Газель', status: 'Финиш', positionType: index % 2 ? 'работа' : 'запчасть',
  openedOn: '2025-' + String(index % 12 + 1).padStart(2, '0') + '-01', completedOn: String(2025 + Math.floor(index / 12)) + '-' + String(index % 12 + 1).padStart(2, '0') + '-01', amountCents: 10001, supplier: 'Сервис', quantity: 1, unitPriceCents: 10001, odometerKm: 1000 + index }; }
test('report uses authoritative full filtered totals and produces editable native charts and tables', async () => {
  const analytics = analyze(Array.from({ length: 25 }, (_, index) => row(index)), { pageSize: 1, status: 'finished' });
  const original = JSON.stringify(analytics);
  const bytes = await generateFleetReport({ analytics, dataset: { fileName: 'Источник.xlsx', createdAt: '2026-09-24' }, scope: 'Москва', generatedAt: '2026-09-24T10:00:00Z' });
  const zip = await JSZip.loadAsync(bytes);
  const slides = Object.keys(zip.files).filter(path => /^ppt\/slides\/slide\d+\.xml$/.test(path));
  assert.ok(slides.length >= 11);
  const texts = (await Promise.all(slides.map(path => zip.file(path).async('string')))).join('\n');
  assert.ok(texts.includes('2 500,25') || texts.includes('2 500,25'), 'full sum appears despite a one-row detail page');
  assert.match(texts, /2027-01/); assert.match(texts, /Все|Финиш/);
  assert.match(texts, /<a:tbl>/); assert.match(texts, /<c:chart/);
  assert.ok(Object.keys(zip.files).some(path => /^ppt\/embeddings\/.*\.xlsx$/.test(path)), 'chart data stays editable');
  const chartXml = await zip.file('ppt/charts/chart1.xml').async('string');
  assert.match(chartXml, /<c:min val="0"\/>/, 'positive bar charts start at zero');
  assert.equal(JSON.stringify(analytics), original);
  const notes = await zip.file('ppt/notesSlides/notesSlide1.xml').async('string');
  assert.match(notes, /Источник.xlsx/); assert.match(notes, /Москва/);
  assert.equal(Object.keys(zip.files).some(path => /vbaProject|externalLink/i.test(path)), false);
});

test('long labels continue without font shrinking or silently removing source text; empty filters remain explicit', async () => {
  const longName = Array.from({ length: 100 }, (_, i) => 'деталь' + i).join(' ');
  const analytics = analyze([row(0)]);
  analytics.positions[0].name = longName;
  const zip = await JSZip.loadAsync(await generateFleetReport({ analytics }));
  const slides = Object.keys(zip.files).filter(path => /^ppt\/slides\/slide\d+\.xml$/.test(path));
  const texts = (await Promise.all(slides.map(path => zip.file(path).async('string')))).join('\n');
  for (let i = 0; i < 100; i++) assert.ok(texts.includes('деталь' + i));
  assert.match(texts, /Наименования с наибольшими затратами \(2\//);
  const emptyZip = await JSZip.loadAsync(await generateFleetReport({ analytics: analyze([], { vehicleGroup: 'Нет' }) }));
  const emptyText = (await Promise.all(Object.keys(emptyZip.files).filter(path => /^ppt\/slides\/slide\d+\.xml$/.test(path)).map(path => emptyZip.file(path).async('string')))).join('');
  assert.match(emptyText, /По выбранным фильтрам данных нет/);
  await assert.rejects(generateFleetReport({}), error => error.status === 400);
});

test('fuel and maintenance report state their whole-scope coverage without changing repair totals', async () => {
  const analytics = analyze([row(0)], { dateFrom: '2025-01-01', dateTo: '2025-01-31' });
  const zip = await JSZip.loadAsync(await generateFleetReport({ analytics, operations: { records: { vehicles: [{ id: 'v1', payload: { plate: 'а123аа797' } }], fuel: [{ id: 'f1', payload: { vehicleId: 'v1', date: '2026-08-01', litres: 20, amountCents: 800000 } }] }, maintenance: [{ vehicleId: 'v1', label: 'Замена масла', status: 'overdue', dueOn: '2026-08-01', dueOdometerKm: 9000 }] } }));
  const texts = (await Promise.all(Object.keys(zip.files).filter(path => /^ppt\/slides\/slide\d+\.xml$/.test(path)).map(path => zip.file(path).async('string')))).join('\n');
  assert.match(texts, /Топливо не входит в сумму ремонтов/);
  assert.match(texts, /Фильтры ремонтных затрат не применяются/);
  assert.match(texts, /Просрочено/);
  assert.equal(analytics.summary.amountCents, 10001);
});
