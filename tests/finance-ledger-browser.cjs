'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const { randomUUID } = require('node:crypto');
const { createTestServer } = require('./local-test-server.cjs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const fixture = await createTestServer({
    builtFrontend: process.env.FINANCE_BUILT_FRONTEND === 'true',
  });
  let browser;
  try {
    const { ids } = fixture;
    await fixture.adminPool.query(
      'UPDATE access_grants SET finance_visible=true WHERE user_id=$1',
      [ids.admin],
    );
    const session = await fixture.devLogin(ids.admin);
    const api = async (method, route, body) => {
      if (method === 'GET' && (!route || route.startsWith('?')))
        route += `${route ? '&' : '?'}from=2020-01-01&to=2030-12-31`;
      const response = await fixture.request(
        method,
        `/finance/ledger${route}`,
        body && { ...body, idempotencyKey: randomUUID() },
        session.accessToken,
      );
      assert.ok(
        [200, 201].includes(response.status),
        `${route}: ${JSON.stringify(response.body)}`,
      );
      return response.body;
    };
    const common = {
      legalEntityId: ids.legal,
      responsibilityScopeId: ids.scope,
      version: 0,
    };
    const party = await api('PUT', '/catalogs/counterparties', {
      ...common,
      name: 'Синтетический клиент и перевозчик',
      inn: '7701234567',
      roles: ['customer', 'carrier'],
    });
    const direction = await api('PUT', '/catalogs/directions', {
      ...common,
      name: 'Доставка',
    });
    const otherDirection = await api('PUT', '/catalogs/directions', {
      ...common,
      name: 'Топливо',
    });
    const account = await api('PUT', '/catalogs/accounts', {
      ...common,
      name: 'Синтетический банк',
      type: 'bank',
    });
    const transportArticle = await api('PUT', '/catalogs/articles', {
      ...common,
      name: 'Перевозки',
      category: 'income',
      directionIds: [],
    });
    const reviewedArticle = await api('PUT', '/catalogs/articles', {
      ...common,
      name: 'Проверено',
      category: 'expense',
      directionIds: [],
    });
    const communicationArticle = await api('PUT', '/catalogs/articles', {
      ...common,
      name: 'Связь',
      category: 'expense',
      directionIds: [],
    });
    const now = new Date(),
      date = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Moscow',
      }).format(now);
    browser = await chromium.launch({
      headless: true,
      ...(process.env.CHROME_PATH
        ? { executablePath: process.env.CHROME_PATH }
        : {}),
    });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      timezoneId: 'Europe/Moscow',
    });
    await context.addInitScript(
      (value) =>
        sessionStorage.setItem(
          'ecl.session.v2',
          JSON.stringify({ session: value }),
        ),
      { ...session, rememberedDevice: false },
    );
    const page = await context.newPage(),
      errors = [];
    if (process.env.FINANCE_BROWSER_DEBUG) {
      page.on('request', (request) => {
        if (request.url().includes('/finance/ledger'))
          console.log(
            'REQUEST',
            request.method(),
            request.url().split('/finance/ledger')[1],
          );
      });
      page.on('response', (response) => {
        if (response.url().includes('/finance/ledger'))
          console.log(
            'RESPONSE',
            response.status(),
            response.url().split('/finance/ledger')[1],
          );
      });
    }
    page.on('pageerror', (error) => errors.push(error.message));
    page.setDefaultTimeout(15000);
    await page.goto(`${fixture.origin}/?section=finance`);
    await page.getByRole('heading', { name: 'Финансы', exact: true }).waitFor();
    await page.waitForFunction(() =>
      document.querySelector('.fl-workspace[aria-busy="false"]'),
    );
    if (await page.locator('.fl-alert').count())
      throw new Error(await page.locator('.fl-alert').innerText());
    assert.match(
      await page.locator('.fl-quality').innerText(),
      /Операции не загружены|NO_DATA/,
    );
    const nav = page.getByRole('navigation', {
      name: 'Разделы финансов',
      exact: true,
    });
    assert.equal(await nav.getByRole('button').count(), 4);
    await page.getByRole('button', { name: '+ Операция', exact: true }).click();
    const form = page.getByRole('dialog', {
      name: 'Новая операция',
      exact: true,
    });
    await form.getByLabel('Сумма, ₽', { exact: true }).fill('100');
    await form.getByLabel('Контрагент', { exact: true }).selectOption(party.id);
    await form
      .getByLabel('Направление', { exact: true })
      .selectOption(direction.id);
    await form
      .getByLabel('Статья', { exact: true })
      .selectOption(transportArticle.id);
    await form
      .getByLabel('Назначение', { exact: true })
      .fill('Выполненная перевозка');
    await form.getByLabel('Срок по договору', { exact: true }).fill(date);
    if (await form.getByLabel('Проект операции', { exact: true }).count())
      await form
        .getByLabel('Проект операции', { exact: true })
        .selectOption(ids.scope);
    await form
      .getByRole('button', { name: 'Сохранить операцию', exact: true })
      .click();
    await form.waitFor({ state: 'hidden' });
    let state = await api('GET', '');
    const sale = state.operations.items.find(
      (item) => item.description === 'Выполненная перевозка',
    );
    assert.ok(sale);
    await api('POST', '/operations', {
      ...common,
      kind: 'expense',
      date,
      amountKopecks: 7000,
      counterpartyId: party.id,
      directionId: direction.id,
      description: 'Услуги перевозчика',
      article: 'Перевозчики',
      dueDate: date,
    });
    await api('POST', '/operations', {
      ...common,
      kind: 'payment_in',
      date,
      amountKopecks: 4000,
      counterpartyId: party.id,
      directionId: direction.id,
      cashAccountId: account.id,
      description: 'Частичная оплата клиента',
    });
    await page.getByRole('button', { name: 'Обновить', exact: true }).click();
    await nav
      .getByRole('button', { name: 'Взаиморасчёты', exact: true })
      .click();
    await page
      .getByRole('table', { name: 'Задолженность', exact: true })
      .getByRole('row')
      .filter({ hasText: 'Выполненная перевозка' })
      .waitFor();
    await page
      .getByRole('button', { name: 'Связать оплату', exact: true })
      .click();
    const settle = page.getByRole('dialog', {
      name: 'Связать оплату',
      exact: true,
    });
    await settle
      .getByLabel('Оплата', { exact: true })
      .selectOption({ label: 'Частичная оплата клиента · 40,00 ₽' });
    await settle.getByLabel('Документ', { exact: true }).selectOption(sale.id);
    await settle.getByLabel('Сумма погашения, ₽', { exact: true }).fill('40');
    await settle
      .getByRole('button', { name: 'Связать оплату', exact: true })
      .click();
    await settle.waitFor({ state: 'hidden' });
    state = await api('GET', '');
    assert.equal(state.reports.pnl.profitKopecks, 3000);
    assert.equal(state.reports.cf.closingKopecks, 4000);
    assert.equal(
      state.reports.receivables.find((item) => item.id === sale.id)
        .remainingKopecks,
      6000,
    );
    assert.equal(state.reports.payables[0].remainingKopecks, 7000);
    assert.equal(state.reports.balance.differenceKopecks, 0);
    console.log(
      'PASS create accrual and link partial payment through UI; three reports reconcile',
    );

    await page
      .getByLabel('Сверить документ Выполненная перевозка', { exact: true })
      .check();
    await page
      .getByRole('button', { name: 'Сверить выбранный реестр', exact: true })
      .click();
    const reconciliation = page.getByRole('dialog', {
      name: 'Сверка реестра',
      exact: true,
    });
    await reconciliation
      .getByLabel('Реестр или основание сверки', { exact: true })
      .fill('Тестовый реестр за период');
    await reconciliation
      .getByRole('button', { name: 'Сохранить сверку', exact: true })
      .click();
    await reconciliation.waitFor({ state: 'hidden' });
    state = await api('GET', '');
    assert.equal(
      state.catalogs.reconciliations[0].confirmedAmountKopecks,
      10000,
    );
    assert.equal(
      state.reports.receivables.find((item) => item.id === sale.id)
        .remainingKopecks,
      6000,
    );
    await nav
      .getByRole('button', { name: 'Платёжный календарь', exact: true })
      .click();
    if (process.env.FINANCE_BROWSER_DEBUG) {
      await page.getByRole('heading', { name: 'Платёжный календарь', exact: true }).waitFor();
      console.log('CALENDAR DEBUG', JSON.stringify((await api('GET', '')).calendar));
      console.log('CALENDAR UI', await page.locator('.fl-workspace').innerText());
    }
    const paymentDate = page
      .getByLabel('Дата платежа: Выполненная перевозка', { exact: true })
      .first();
    const next = new Date(`${date}T12:00:00`);
    next.setDate(next.getDate() + 1);
    const expectedDate = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
    await paymentDate.fill(expectedDate);
    const planResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith('/finance/ledger/catalogs/plans') &&
        response.request().method() === 'PUT',
    );
    await paymentDate.blur();
    assert.equal((await planResponse).status(), 200);
    state = await api('GET', '');
    assert.equal(
      state.reports.receivables.find((item) => item.id === sale.id)
        .remainingKopecks,
      6000,
    );
    assert.equal(
      state.operations.items.find((item) => item.id === sale.id).reversed,
      false,
    );
    console.log(
      'PASS registry confirmation and calendar rescheduling preserve partial payment',
    );

    await api('POST', '/operations', {
      ...common,
      kind: 'expense',
      date,
      amountKopecks: 500,
      counterpartyId: party.id,
      directionId: direction.id,
      description: 'Расход для классификации',
      article: 'Прочее',
    });
    await page.getByRole('button', { name: 'Обновить', exact: true }).click();
    await nav.getByRole('button', { name: 'Операции', exact: true }).click();
    const row = page
      .getByRole('table', { name: 'Финансовые операции', exact: true })
      .getByRole('row')
      .filter({ hasText: 'Расход для классификации' });
    await row
      .getByLabel('Направление: Расход для классификации', { exact: true })
      .selectOption(otherDirection.id);
    const patchResponse = page.waitForResponse(
      (response) =>
        /\/finance\/ledger\/operations\/.+/.test(response.url()) &&
        response.request().method() === 'PATCH',
    );
    await row.getByRole('button', { name: 'Сохранить', exact: true }).click();
    const patched = await patchResponse;
    assert.equal(patched.status(), 200, await patched.text());
    await page.waitForFunction(() =>
      [...document.querySelectorAll('tr[data-operation-id]')]
        .filter((row) => row.textContent.includes('Расход для классификации'))
        .some(
          (row) => row.querySelector('.fl-badge')?.textContent === 'Отменено',
        ),
    );
    await page
      .getByLabel('Выбрать операцию Расход для классификации', { exact: true })
      .filter({ visible: true })
      .all()
      .then(async (checks) => {
        for (const check of checks)
          if (await check.isEnabled()) await check.check();
      });
    await page
      .getByLabel('Статья для выбранных', { exact: true })
      .selectOption(reviewedArticle.id);
    await page
      .getByRole('button', { name: 'Применить к выбранным', exact: true })
      .click();
    await page.getByText('Изменения сохранены.', { exact: true }).waitFor();
    await nav
      .getByRole('button', { name: 'Платёжный календарь', exact: true })
      .click();
    await page
      .getByRole('button', { name: '+ План платежа', exact: true })
      .click();
    const plan = page.getByRole('dialog', {
      name: 'План платежа',
      exact: true,
    });
    await plan
      .getByLabel('Назначение плана', { exact: true })
      .fill('Аренда следующего месяца');
    await plan.getByLabel('Плановая сумма, ₽', { exact: true }).fill('25');
    await plan
      .getByLabel('Счёт плана', { exact: true })
      .selectOption(account.id);
    if (await plan.getByLabel('Проект плана', { exact: true }).count())
      await plan
        .getByLabel('Проект плана', { exact: true })
        .selectOption(ids.scope);
    await plan
      .getByRole('button', { name: 'Сохранить план', exact: true })
      .click();
    await plan.waitFor({ state: 'hidden' });
    await page
      .getByRole('table', { name: 'Назначить дату', exact: true })
      .getByRole('row')
      .filter({ hasText: 'Аренда следующего месяца' })
      .waitFor();
    console.log(
      'PASS inline and bulk edits, plans without dates stay in visible queue',
    );

    await page
      .getByRole('button', { name: 'Загрузить файл', exact: true })
      .click();
    const imported = page.getByRole('dialog', {
      name: 'Загрузка финансовых данных',
      exact: true,
    });
    await imported.getByLabel('Файл', { exact: true }).setInputFiles({
      name: 'synthetic-bank.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(
        `date;income;description;inn;source_id\n${date};15;Поступление из проверочной выписки;7701234567;browser-bank-1\n`,
      ),
    });
    await imported
      .getByRole('button', { name: 'Проверить файл', exact: true })
      .click();
    await imported
      .getByLabel('Выбрать строки страницы', { exact: true })
      .check();
    await imported
      .getByLabel('Счёт выбранных строк', { exact: true })
      .selectOption(account.id);
    await imported
      .getByLabel('Направление выбранных строк', { exact: true })
      .selectOption(direction.id);
    if (
      await imported
        .getByLabel('Проект выбранных строк', { exact: true })
        .count()
    )
      await imported
        .getByLabel('Проект выбранных строк', { exact: true })
        .selectOption(ids.scope);
    await imported
      .getByRole('button', { name: 'Применить к строкам', exact: true })
      .click();
    await imported
      .getByLabel(
        'Замечания выбранных строк проверены, соответствия подтверждены',
        { exact: true },
      )
      .check();
    const importResponse = page.waitForResponse((response) =>
      /\/imports\/.+\/commit$/.test(response.url()),
    );
    await imported
      .getByRole('button', { name: 'Перенести выбранные (1)', exact: true })
      .click();
    const importResult = await importResponse;
    assert.equal(importResult.status(), 201, await importResult.text());
    await imported.getByText('Перенесено', { exact: true }).waitFor();
    await imported
      .getByRole('button', { name: 'Закончить проверку', exact: true })
      .click();
    await nav.getByRole('button', { name: 'Операции', exact: true }).click();
    const importedRow = page
      .getByRole('table', { name: 'Финансовые операции', exact: true })
      .getByRole('row')
      .filter({ hasText: 'Поступление из проверочной выписки' })
      .filter({ has: page.locator('select[aria-label^="Вид:"]') });
    await importedRow
      .getByLabel('Вид: Поступление из проверочной выписки', { exact: true })
      .selectOption('payment_in');
    await importedRow
      .getByLabel('Контрагент: Поступление из проверочной выписки', {
        exact: true,
      })
      .selectOption(party.id);
    const classifiedResponse = page.waitForResponse(
      (response) =>
        /\/operations\/.+/.test(response.url()) &&
        response.request().method() === 'PATCH',
    );
    await importedRow
      .getByRole('button', { name: 'Сохранить', exact: true })
      .click();
    assert.equal((await classifiedResponse).status(), 200);
    state = await api('GET', '');
    assert.equal(state.reports.cf.closingKopecks, 5500);
    assert.equal(state.reports.balance.differenceKopecks, 0);
    assert.equal(
      state.controls.some(
        (item) => item.code === 'SUSPENSE_BALANCE' && item.amountKopecks !== 0,
      ),
      false,
    );
    const activePayment = state.operations.items.find(
      (item) =>
        item.description === 'Поступление из проверочной выписки' &&
        item.kind === 'payment_in' &&
        !item.reversed,
    );
    const activeRow = page.locator(
      `tr[data-operation-id="${activePayment.id}"]`,
    );
    await activeRow
      .getByRole('button', { name: 'Изменить', exact: true })
      .click();
    const correction = page.getByRole('dialog', {
      name: 'Изменение операции',
      exact: true,
    });
    await correction
      .getByLabel('Подтверждение операции', { exact: true })
      .selectOption('confirmed');
    const correctedResponse = page.waitForResponse(
      (response) =>
        /\/operations\/.+/.test(response.url()) &&
        response.request().method() === 'PATCH',
    );
    await correction
      .getByRole('button', { name: 'Сохранить операцию', exact: true })
      .click();
    const correctedResult = await correctedResponse;
    assert.equal(correctedResult.status(), 200, await correctedResult.text());
    await correction.waitFor({ state: 'hidden' });
    state = await api('GET', '');
    assert.ok(
      state.operations.items.some(
        (item) =>
          item.description === 'Поступление из проверочной выписки' &&
          item.kind === 'payment_in' &&
          !item.reversed &&
          item.status === 'confirmed',
      ),
    );
    console.log(
      'PASS file preview, bulk mapping, suspense classification and full operation correction',
    );

    await nav.getByRole('button', { name: 'Отчёты', exact: true }).click();
    await page
      .getByRole('button', { name: 'Начальные остатки', exact: true })
      .click();
    const opening = page.getByRole('dialog', {
      name: 'Начальные остатки',
      exact: true,
    });
    await opening
      .getByLabel('Источник остатков', { exact: true })
      .fill('Подтвержденная тестовая сверка');
    if (await opening.getByLabel('Проект остатков', { exact: true }).count())
      await opening
        .getByLabel('Проект остатков', { exact: true })
        .selectOption(ids.scope);
    await opening.getByLabel('Остаток 1, ₽', { exact: true }).fill('10');
    await opening
      .getByLabel('Счёт остатка 1', { exact: true })
      .selectOption(account.id);
    assert.equal(
      await opening
        .getByRole('button', {
          name: 'Сохранить начальные остатки',
          exact: true,
        })
        .isEnabled(),
      false,
    );
    await opening.getByLabel('Остаток 2, ₽', { exact: true }).fill('10');
    await opening
      .getByRole('button', { name: 'Сохранить начальные остатки', exact: true })
      .click();
    await opening.waitFor({ state: 'hidden' });
    state = await api('GET', '');
    assert.equal(state.reports.balance.differenceKopecks, 0);
    assert.ok(state.operations.items.some((item) => item.kind === 'opening'));

    await page
      .getByRole('button', { name: 'Справочники и распределение', exact: true })
      .click();
    const catalogNav = page.getByRole('navigation', {
      name: 'Финансовые справочники',
      exact: true,
    });
    await catalogNav
      .getByRole('button', { name: 'Счета и кассы', exact: true })
      .click();
    await page
      .getByRole('table', { name: 'Счета и кассы', exact: true })
      .getByRole('row')
      .filter({ hasText: 'Синтетический банк' })
      .getByRole('button', { name: 'Изменить', exact: true })
      .click();
    await page
      .getByLabel('Дата остатка по выписке', { exact: true })
      .fill(date);
    await page.getByLabel('Остаток по выписке, ₽', { exact: true }).fill('65');
    await page
      .getByRole('button', { name: 'Сохранить запись', exact: true })
      .click();
    await page
      .getByLabel('Дата остатка по выписке', { exact: true })
      .waitFor({ state: 'hidden' });
    state = await api('GET', '');
    assert.equal(
      state.catalogs.accounts.find((item) => item.id === account.id)
        .statementBalanceKopecks,
      6500,
    );
    assert.equal(
      state.controls.some((item) =>
        ['CASH_STATEMENT_DIFFERENCE', 'CASH_STATEMENT_UNVERIFIED'].includes(
          item.code,
        ),
      ),
      false,
    );
    await catalogNav
      .getByRole('button', { name: 'Правила и топливные карты', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Добавить запись', exact: true })
      .click();
    await page
      .getByLabel('Название', { exact: true })
      .fill('Тестовая карта Роснефти');
    await page.getByLabel('Вид правила', { exact: true }).selectOption('fuel');
    await page
      .getByLabel('Контрагент правила', { exact: true })
      .selectOption(party.id);
    await page
      .getByLabel('Направление правила', { exact: true })
      .selectOption(otherDirection.id);
    await page.getByLabel('Оператор карты', { exact: true }).selectOption('RN');
    await page
      .getByLabel('Номер топливной карты', { exact: true })
      .fill('1234567890');
    await page
      .getByLabel('Поставщик по карте', { exact: true })
      .selectOption(party.id);
    await page.getByLabel('Цена литра, ₽', { exact: true }).fill('60');
    await page.getByLabel('НДС продажи, %', { exact: true }).fill('20');
    await page.getByLabel('НДС закупки, %', { exact: true }).fill('20');
    const fuelRuleResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith('/catalogs/classificationRules') &&
        response.request().method() === 'PUT',
    );
    await page
      .getByRole('button', { name: 'Сохранить запись', exact: true })
      .click();
    const fuelRuleResult = await fuelRuleResponse;
    assert.equal(fuelRuleResult.status(), 200, await fuelRuleResult.text());
    await page
      .getByRole('table', { name: 'Правила и топливные карты', exact: true })
      .getByText('Тестовая карта Роснефти', { exact: true })
      .waitFor();
    state = await api('GET', '');
    assert.equal(
      state.catalogs.classificationRules[0].pricing.priceKopecksPerLitre,
      6000,
    );
    assert.equal(state.catalogs.classificationRules[0].provider, 'RN');

    await catalogNav
      .getByRole('button', { name: 'Регулярные платежи', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Добавить запись', exact: true })
      .click();
    await page.getByLabel('Название', { exact: true }).fill('Регулярная связь');
    await page
      .getByLabel('Состояние графика', { exact: true })
      .selectOption('approved');
    await page.getByLabel('Ежемесячная сумма, ₽', { exact: true }).fill('2');
    const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const recurringStart = `${previousMonth.getFullYear()}-${String(previousMonth.getMonth() + 1).padStart(2, '0')}-01`;
    await page
      .getByLabel('Начало графика', { exact: true })
      .fill(recurringStart);
    await page
      .getByLabel('Контрагент графика', { exact: true })
      .selectOption(party.id);
    await page
      .getByLabel('Счёт графика', { exact: true })
      .selectOption(account.id);
    if (await page.getByLabel('Проект графика', { exact: true }).count())
      await page
        .getByLabel('Проект графика', { exact: true })
        .selectOption(ids.scope);
    await page
      .getByLabel('Начислять расход за наступивший период', { exact: true })
      .check();
    await page
      .getByLabel('Статья начисления', { exact: true })
      .selectOption(communicationArticle.id);
    await page
      .getByRole('button', { name: 'Сохранить запись', exact: true })
      .click();
    await page
      .getByRole('table', { name: 'Регулярные платежи', exact: true })
      .getByText('Регулярная связь', { exact: true })
      .waitFor();
    await page.getByRole('button', { name: 'К финансам', exact: true }).click();
    await page.getByLabel('Период с', { exact: true }).fill(recurringStart);
    await page
      .getByRole('button', { name: 'Из данных приложения', exact: true })
      .click();
    const native = page.getByRole('dialog', {
      name: 'Данные приложения',
      exact: true,
    });
    const nativeResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith('/sources/preview') &&
        response.request().method() === 'POST',
    );
    await native
      .getByRole('button', { name: 'Проверить данные приложения', exact: true })
      .click();
    const nativeResult = await nativeResponse;
    assert.equal(nativeResult.status(), 201, await nativeResult.text());
    await native
      .getByRole('table', {
        name: 'Предварительная проверка импорта',
        exact: true,
      })
      .getByRole('row')
      .filter({ hasText: 'Регулярная связь' })
      .waitFor();
    await native
      .getByRole('button', { name: 'Закончить проверку', exact: true })
      .click();
    console.log(
      'PASS balanced openings, fuel pricing rule and recurring accrual source preview',
    );

    await nav.getByRole('button', { name: 'Отчёты', exact: true }).click();
    await page
      .getByRole('button', { name: 'Баланс · Balance', exact: true })
      .click();
    await page
      .getByRole('table', { name: 'Баланс · Balance', exact: true })
      .waitFor();
    const output = path.resolve(__dirname, '../.local/finance-ui');
    await fs.mkdir(output, { recursive: true });
    await page.screenshot({
      path: path.join(output, 'finance-desktop.png'),
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      'Finance stays within mobile viewport',
    );
    await page.screenshot({
      path: path.join(output, 'finance-mobile.png'),
      fullPage: true,
    });
    await page
      .getByRole('button', { name: 'Тарифы, зарплаты и 1С', exact: true })
      .click();
    await page
      .getByRole('heading', { name: 'Финансы и 1С', exact: true })
      .waitFor();
    await page
      .getByRole('button', {
        name: '← Отчёты, календарь и операции',
        exact: true,
      })
      .click();
    await page.getByRole('heading', { name: 'Финансы', exact: true }).waitFor();
    assert.deepEqual(errors, []);
    console.log(
      'PASS report views, responsive table containment, legacy tools remain accessible, no browser errors',
    );
  } catch (error) {
    console.error('FINANCE BROWSER FAILURE', error);
    throw error;
  } finally {
    if (browser) await browser.close();
    await fixture.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
