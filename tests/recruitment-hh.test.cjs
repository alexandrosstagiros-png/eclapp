const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const helpers = import(pathToFileURL(path.resolve(__dirname, '../recovered/apps/office-web/src/recruitment-hh.js')).href);

test('hh vacancy draft includes public work terms and excludes internal recruitment information', async () => {
  const { hhVacancyDraft, hhPublicationText } = await helpers;
  const publicFields = {
    title: 'Водитель категории C', city: 'Казань', district: 'Советский район',
    payTerms: 'От 90 000 рублей после налогов', schedule: '5/2 с 08:00',
    warehouseAddress: 'Склад на Промышленной, 12', routeInfo: 'Доставка по городу',
    driverRequirements: 'Категория C, опыт от года', vehicleRequirements: 'Фургон 3 тонны',
    trainingTerms: 'Оплачиваемая стажировка 2 дня',
  };
  const sensitiveValues = [
    'Служебное замечание о клиенте', 'Исходная строка таблицы', 'Инструкция только для рекрутера',
    'Сотрудник Иванов', '+79998887766', 'private@example.test', 'internal-project-uuid',
    'Секретная ставка агенту', 'Результат проверки СБ',
  ];
  const draft = hhVacancyDraft({
    ...publicFields,
    notes: sensitiveValues[0], sourceDetails: { text: sensitiveValues[1] }, publicBrief: sensitiveValues[2],
    recruiterName: sensitiveValues[3], recruiterPhone: sensitiveValues[4],
    staff: [{ name: sensitiveValues[3], email: sensitiveValues[5] }], projectId: sensitiveValues[6],
    recruiterReward: sensitiveValues[7], securityNotes: sensitiveValues[8],
    quantity: 17, priority: 'urgent', neededBy: '2027-01-01', hhUrl: 'https://hh.ru/vacancy/12345',
  });
  const text = hhPublicationText(draft);
  for (const value of Object.values(publicFields)) assert.ok(text.includes(value), `Public field missing: ${value}`);
  for (const value of sensitiveValues) assert.ok(!text.includes(value), `Internal information leaked: ${value}`);
  assert.equal(draft.hhTitle, publicFields.title);
  assert.deepEqual(draft, hhVacancyDraft(publicFields), 'Additional request metadata must not affect exported content');
});

test('empty work terms produce no invented pay, duties, contacts, or placeholder text', async () => {
  const { hhVacancyDraft, hhPublicationText } = await helpers;
  const driver = hhVacancyDraft({ city: '', district: null, payTerms: undefined, schedule: '  \n  ' });
  assert.deepEqual(driver, { hhTitle: 'Водитель', hhText: '' });
  assert.equal(hhPublicationText(driver), 'Водитель');
  assert.deepEqual(hhVacancyDraft({ kind: 'carrier' }), { hhTitle: 'Водитель с личным грузовым автомобилем', hhText: '' });
  assert.equal(hhVacancyDraft({ title: 'Экспедитор', kind: 'carrier' }).hhTitle, 'Экспедитор');
});

test('public multiline terms remain complete even when the generation limit is exceeded', async () => {
  const { HH_TEXT_LIMIT, hhVacancyDraft, hhPublicationText } = await helpers;
  const longTerms = `Первая строка\n  Вторая строка с отступом\n\n${'Условия работы. '.repeat(200)}Конец условий`;
  const demand = { title: 'Водитель', payTerms: `  ${longTerms}  `, routeInfo: 'Первая точка\nВторая точка' };
  const original = structuredClone(demand);
  const draft = hhVacancyDraft(demand);
  assert.ok(draft.hhText.includes(longTerms), 'Text must not be truncated or have internal line breaks removed');
  assert.ok(draft.hhText.includes('Первая точка\nВторая точка'));
  assert.ok(hhPublicationText(draft).length > HH_TEXT_LIMIT, 'Over-limit text remains available for user editing');
  assert.deepEqual(demand, original, 'Preparing text must not mutate the request');
});

test('publication text counts the title, separator, and body against the 2000-character limit', async () => {
  const { HH_TEXT_LIMIT, hhPublicationText } = await helpers;
  assert.equal(HH_TEXT_LIMIT, 2000);
  assert.equal(hhPublicationText({ hhTitle: '  Водитель  ', hhText: '\nУсловия\nМаршрут\n' }), 'Водитель\n\nУсловия\nМаршрут');
  assert.equal(hhPublicationText({ hhTitle: '   ', hhText: '  Описание  ' }), 'Описание');
  assert.equal(hhPublicationText({ hhTitle: 'Название', hhText: '   ' }), 'Название');
  assert.equal(hhPublicationText({}), '');
  const exact = { hhTitle: 'Водитель', hhText: 'я'.repeat(HH_TEXT_LIMIT - 'Водитель'.length - 2) };
  assert.equal(hhPublicationText(exact).length, HH_TEXT_LIMIT);
  assert.equal(hhPublicationText({ ...exact, hhText: `${exact.hhText}я` }).length, HH_TEXT_LIMIT + 1);
});

test('vacancy URLs accept only hh vacancy pages, including regional hosts and existing query strings', async () => {
  const { hhVacancyUrl } = await helpers;
  const valid = [
    'https://hh.ru/vacancy/123456789',
    'https://kazan.hh.ru/vacancy/123456789/',
    'https://hh.ru/vacancy/123456789?from=vacancy_search_list&hhtmFrom=vacancy_search_list#contacts',
    'https://spb.hh.ru/vacancy/1',
  ];
  for (const url of valid) assert.equal(hhVacancyUrl(url), url);
  assert.equal(hhVacancyUrl('  https://HH.RU/vacancy/123  '), 'https://hh.ru/vacancy/123');
  assert.equal(hhVacancyUrl('https://hh.ru:443/vacancy/123'), 'https://hh.ru/vacancy/123', 'Standard HTTPS port is normalized');
});

test('vacancy URLs reject lookalike domains, credentials, other hh pages, and invalid identifiers', async () => {
  const { hhVacancyUrl } = await helpers;
  const invalid = [
    undefined, null, '', 'not a url', '//hh.ru/vacancy/123',
    'http://hh.ru/vacancy/123', 'javascript:alert(1)', 'ftp://hh.ru/vacancy/123',
    'https://hh.ru.evil.test/vacancy/123', 'https://evilhh.ru/vacancy/123', 'https://hh-ru.test/vacancy/123',
    'https://user@hh.ru/vacancy/123', 'https://user:password@hh.ru/vacancy/123',
    'https://hh.ru@evil.test/vacancy/123', 'https://hh.ru:8443/vacancy/123',
    'https://hh.ru/resume/123', 'https://hh.ru/employer/vacancy/create', 'https://hh.ru/vacancy/123/edit',
    'https://hh.ru/vacancy/0', 'https://hh.ru/vacancy/0123', 'https://hh.ru/vacancy/-1',
    'https://hh.ru/vacancy/', 'https://hh.ru/vacancy/12abc', 'https://hh.ru/vacancy/123//',
  ];
  for (const value of invalid) assert.equal(hhVacancyUrl(value), null, `Unexpected accepted value: ${String(value)}`);
});

test('vacancy URL length is bounded without silently truncating a query', async () => {
  const { hhVacancyUrl } = await helpers;
  const prefix = 'https://hh.ru/vacancy/123?from=';
  const atLimit = `${prefix}${'a'.repeat(2048 - prefix.length)}`;
  assert.equal(atLimit.length, 2048);
  assert.equal(hhVacancyUrl(atLimit), atLimit);
  assert.equal(hhVacancyUrl(`${atLimit}a`), null);
});
