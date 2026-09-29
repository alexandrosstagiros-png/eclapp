'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
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
    const date = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Moscow',
    }).format(new Date());
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
    const base = {
      legalEntityId: ids.legal,
      responsibilityScopeId: ids.scope,
      version: 0,
    };
    const delivery = await api('PUT', '/catalogs/directions', {
      ...base,
      name: 'Доставка',
    });
    const crews = await api('PUT', '/catalogs/directions', {
      ...base,
      name: 'Экипажный блок',
    });
    const article = await api('PUT', '/catalogs/articles', {
      ...base,
      name: 'Общие услуги',
      category: 'expense',
      directionIds: [delivery.id, crews.id],
    });
    const restricted = await api('PUT', '/catalogs/articles', {
      ...base,
      name: 'Только доставка',
      category: 'expense',
      directionIds: [delivery.id],
    });
    const party = await api('PUT', '/catalogs/counterparties', {
      ...base,
      name: 'Поставщик услуг для проверки',
      roles: ['supplier'],
    });
    const account = await api('PUT', '/catalogs/accounts', {
      ...base,
      name: 'Банк для проверки распределения',
      type: 'bank',
    });
    const rule = await api('PUT', '/catalogs/allocationRules', {
      ...base,
      name: 'Пополам',
      effectiveFrom: `${date.slice(0, 7)}-01`,
      articleId: article.id,
      weights: [
        { directionId: delivery.id, percent: 50 },
        { directionId: crews.id, percent: 50 },
      ],
    });
    const expense = await api('POST', '/operations', {
      ...base,
      kind: 'expense',
      date,
      amountKopecks: 12000,
      vatKopecks: 2000,
      counterpartyId: party.id,
      directionId: delivery.id,
      articleId: restricted.id,
      description: 'Общая аренда для распределения',
    });
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
    page.on('pageerror', (error) => errors.push(error.message));
    page.setDefaultTimeout(15000);
    await page.goto(`${fixture.origin}/?section=finance`);
    await page.getByRole('heading', { name: 'Финансы', exact: true }).waitFor();
    const nav = page.getByRole('navigation', {
      name: 'Разделы финансов',
      exact: true,
    });
    await nav.getByRole('button', { name: 'Операции', exact: true }).click();
    const modal = page.getByRole('dialog', {
      name: 'Распределение по направлениям',
      exact: true,
    });
    const snapshot = () => api('GET', '');
    const live = async (description) =>
      (await snapshot()).operations.items.find(
        (item) =>
          item.description === description &&
          !item.reversed &&
          item.kind !== 'reversal',
      );
    const open = async (description) => {
      const operation = await live(description);
      assert.ok(operation, description);
      await page.getByRole('button', { name: 'Обновить', exact: true }).click();
      await page
        .locator(`tr[data-operation-id="${operation.id}"]`)
        .getByRole('button', { name: 'Распределить', exact: true })
        .click();
      await modal.waitFor();
      return operation;
    };
    const shares = async (first, second) => {
      await modal
        .getByLabel('Доля: Доставка, %', { exact: true })
        .fill(String(first));
      await modal
        .getByLabel('Доля: Экипажный блок, %', { exact: true })
        .fill(String(second));
    };
    const save = async () => {
      const response = page.waitForResponse(
        (value) =>
          /\/finance\/ledger\/operations\/[^/]+$/.test(value.url()) &&
          value.request().method() === 'PATCH',
      );
      await modal
        .getByRole('button', { name: 'Сохранить распределение', exact: true })
        .click();
      const result = await response;
      assert.equal(result.status(), 200, await result.text());
      await modal.waitFor({ state: 'hidden' });
      return result.json();
    };
    const formatted = (amount) =>
      new Intl.NumberFormat('ru-RU', {
        style: 'currency',
        currency: 'RUB',
      }).format(amount / 100);
    const costPostings = (operation) =>
      operation.postings.filter((row) => row.account === 'expense');
    const byDirection = (rows, directionId) =>
      rows
        .filter((row) => row.directionId === directionId)
        .reduce((sum, row) => sum + row.amountKopecks, 0);

    await open(expense.description);
    await shares(60, 30);
    assert.ok(
      await modal
        .getByRole('button', { name: 'Сохранить распределение', exact: true })
        .isDisabled(),
    );
    await modal
      .getByText('Итого: 90% · осталось 10%', { exact: true })
      .waitFor();
    await shares(60, 40);
    assert.ok(
      await modal
        .getByRole('button', { name: 'Сохранить распределение', exact: true })
        .isDisabled(),
      'A restricted article cannot silently span other directions',
    );
    await modal
      .getByLabel('Статья распределения', { exact: true })
      .selectOption(article.id);
    const preview = modal.getByRole('table', {
      name: 'Распределение операции',
      exact: true,
    });
    const deliveryPreview = preview
      .getByRole('row')
      .filter({ hasText: 'Доставка' });
    assert.equal(
      await deliveryPreview.getByRole('cell').nth(2).innerText(),
      formatted(7200),
    );
    assert.equal(
      await deliveryPreview.getByRole('cell').nth(3).innerText(),
      formatted(6000),
    );
    await save();
    let current = await live(expense.description);
    assert.equal(current.allocationMethod, 'manual');
    assert.equal(byDirection(costPostings(current), delivery.id), 6000);
    assert.equal(byDirection(costPostings(current), crews.id), 4000);
    assert.equal((await snapshot()).reports.pnl.expenseKopecks, 10000);
    assert.equal(
      (await snapshot()).catalogs.allocationRules.length,
      1,
      'One-off distribution must not create a catalog record',
    );
    console.log(
      'PASS direct one-off distribution validates 100%, previews VAT and changes to an applicable article without new rules',
    );

    await open(expense.description);
    assert.equal(
      await modal.getByLabel('Доля: Доставка, %', { exact: true }).inputValue(),
      '60',
    );
    await modal
      .getByLabel('Взять доли из правила', { exact: true })
      .selectOption(rule.id);
    assert.equal(
      await modal.getByLabel('Доля: Доставка, %', { exact: true }).inputValue(),
      '50',
    );
    await save();
    current = await live(expense.description);
    assert.equal(current.allocationMethod, 'rule');
    assert.equal(current.allocationRule.id, rule.id);
    await open(expense.description);
    await shares(25, 75);
    assert.equal(
      await modal
        .getByLabel('Взять доли из правила', { exact: true })
        .inputValue(),
      '',
    );
    await save();
    current = await live(expense.description);
    assert.equal(current.allocationMethod, 'manual');
    assert.equal(byDirection(costPostings(current), delivery.id), 2500);
    assert.equal(byDirection(costPostings(current), crews.id), 7500);
    assert.equal((await snapshot()).catalogs.allocationRules.length, 1);
    console.log(
      'PASS existing split reopens, named rule is reused and edited percentages become one-off',
    );

    const bankPreview = await api('POST', '/imports/preview', {
      legalEntityId: ids.legal,
      sourceType: 'bank',
      fileName: 'distribution-bank.csv',
      contentBase64: Buffer.from(
        `date;expense;description;source_id\n${date};300.01;Банковская общая выплата;distribution-bank-1\n`,
      ).toString('base64'),
    });
    const rowNumber = bankPreview.rows[0].rowNumber;
    await api('POST', `/imports/${bankPreview.id}/commit`, {
      selectedRows: [rowNumber],
      overrides: {
        [rowNumber]: {
          cashAccountId: account.id,
          responsibilityScopeId: ids.scope,
          reviewed: true,
        },
      },
    });
    const beforeBank = await snapshot();
    const originalBank = await open('Банковская общая выплата');
    await modal.getByText(/Доли распределяют выплату в ДДС/).waitFor();
    assert.equal(
      await modal.getByLabel(/Дата операции|Сумма, ₽|Счёт или касса/).count(),
      0,
    );
    await shares(50, 50);
    const bankCells = await modal
      .getByRole('table', { name: 'Распределение операции', exact: true })
      .locator('tbody tr td:last-child')
      .allTextContents();
    assert.deepEqual(
      new Set(bankCells),
      new Set([formatted(15000), formatted(15001)]),
    );
    await save();
    const afterBank = await snapshot();
    const bank = await live('Банковская общая выплата');
    assert.equal(bank.amountKopecks, originalBank.amountKopecks);
    assert.equal(bank.date, originalBank.date);
    assert.equal(bank.cashAccountId, originalBank.cashAccountId);
    assert.equal(bank.source.system, 'bank');
    assert.equal(bank.source.id, originalBank.source.id);
    assert.equal(
      afterBank.reports.pnl.expenseKopecks,
      beforeBank.reports.pnl.expenseKopecks,
    );
    assert.equal(
      afterBank.reports.cf.outflowKopecks,
      beforeBank.reports.cf.outflowKopecks,
    );
    assert.equal(
      bank.cashFlows.reduce((sum, row) => sum + row.amountKopecks, 0),
      -30001,
    );
    assert.equal(afterBank.reports.balance.differenceKopecks, 0);
    await open('Банковская общая выплата');
    const output = path.resolve(__dirname, '../.local/finance-ui');
    await fs.mkdir(output, { recursive: true });
    await modal.screenshot({
      path: path.join(output, 'finance-distribution-desktop.png'),
    });
    await page.setViewportSize({ width: 390, height: 844 });
    const mobileModal = await modal.boundingBox();
    assert.ok(mobileModal.x >= 0 && mobileModal.x + mobileModal.width <= 391);
    const scrollArea = modal.locator('.fl-table-scroll');
    const mobileTable = await scrollArea.boundingBox();
    assert.ok(
      mobileTable.x >= mobileModal.x &&
        mobileTable.x + mobileTable.width <= mobileModal.x + mobileModal.width,
    );
    await modal.screenshot({
      path: path.join(output, 'finance-distribution-mobile.png'),
    });
    await modal.getByRole('button', { name: 'Отмена', exact: true }).click();
    await page.setViewportSize({ width: 1440, height: 1000 });
    console.log(
      'PASS imported bank split preserves date, money, account and source, reconciles pennies and creates no PnL expense; mobile layout fits',
    );

    const paidExpense = await api('POST', '/operations', {
      ...base,
      kind: 'expense',
      date,
      amountKopecks: 24000,
      vatKopecks: 4000,
      counterpartyId: party.id,
      directionId: delivery.id,
      articleId: restricted.id,
      description: 'Частично оплаченная аренда',
    });
    const directPayment = await api('POST', '/operations', {
      ...base,
      kind: 'payment_out',
      date,
      amountKopecks: 12000,
      counterpartyId: party.id,
      cashAccountId: account.id,
      allocations: [{ documentId: paidExpense.id, amountKopecks: 12000 }],
      source: { system: 'bank', id: 'paid-distribution-bank', version: '1' },
      description: 'Оплата аренды по документу',
    });
    const beforePaid = await snapshot();
    await open(directPayment.description);
    await modal
      .getByText('Частично оплаченная аренда', { exact: true })
      .waitFor();
    assert.equal(
      await modal.getByLabel('Доля: Доставка, %', { exact: true }).count(),
      0,
    );
    await modal
      .getByRole('button', { name: 'Распределить расход', exact: true })
      .click();
    await shares(30, 70);
    await modal
      .getByLabel('Статья распределения', { exact: true })
      .selectOption(article.id);
    const paidResult = await save();
    assert.equal(paidResult.distributionEffects.replayedOperations, 1);
    const afterPaid = await snapshot();
    const cost = await live(paidExpense.description),
      payment = await live(directPayment.description);
    assert.equal(byDirection(costPostings(cost), delivery.id), 6000);
    assert.equal(byDirection(costPostings(cost), crews.id), 14000);
    assert.equal(byDirection(payment.cashFlows, delivery.id), -3600);
    assert.equal(byDirection(payment.cashFlows, crews.id), -8400);
    assert.equal(payment.amountKopecks, directPayment.amountKopecks);
    assert.equal(payment.date, directPayment.date);
    assert.equal(payment.cashAccountId, directPayment.cashAccountId);
    assert.equal(
      afterPaid.reports.pnl.expenseKopecks,
      beforePaid.reports.pnl.expenseKopecks,
    );
    assert.equal(
      afterPaid.reports.cf.outflowKopecks,
      beforePaid.reports.cf.outflowKopecks,
    );
    assert.equal(
      afterPaid.reports.payables.find((item) => item.id === cost.id)
        .remainingKopecks,
      12000,
    );
    console.log(
      'PASS linked bank payment opens paid expense; expense and direct payment are redistributed atomically without changing remaining debt or totals',
    );

    const advanceExpense = await api('POST', '/operations', {
      ...base,
      kind: 'expense',
      date,
      amountKopecks: 10000,
      counterpartyId: party.id,
      directionId: delivery.id,
      articleId: article.id,
      description: 'Услуга закрытая авансом',
    });
    const advance = await api('POST', '/operations', {
      ...base,
      kind: 'supplier_advance',
      date,
      amountKopecks: 7000,
      counterpartyId: party.id,
      cashAccountId: account.id,
      directionId: delivery.id,
      description: 'Предоплата общих услуг',
    });
    await api('POST', '/settlements', {
      ...base,
      paymentId: advance.id,
      date,
      allocations: [{ documentId: advanceExpense.id, amountKopecks: 5000 }],
    });
    const beforeAdvance = await snapshot();
    await open(advance.description);
    await modal.getByText('Связанные расходы · PnL', { exact: true }).waitFor();
    await shares(20, 80);
    await save();
    const redistributedAdvance = await live(advance.description);
    assert.equal(
      byDirection(redistributedAdvance.cashFlows, delivery.id),
      -1400,
    );
    assert.equal(byDirection(redistributedAdvance.cashFlows, crews.id), -5600);
    const afterAdvance = await snapshot();
    assert.equal(
      afterAdvance.reports.cf.outflowKopecks,
      beforeAdvance.reports.cf.outflowKopecks,
    );
    assert.equal(
      afterAdvance.reports.pnl.expenseKopecks,
      beforeAdvance.reports.pnl.expenseKopecks,
    );
    assert.equal(
      afterAdvance.reports.payables.find(
        (item) => item.id === advanceExpense.id,
      ).remainingKopecks,
      5000,
    );
    assert.equal(afterAdvance.reports.balance.differenceKopecks, 0);
    console.log(
      'PASS settled advance can redistribute its own CF while expense PnL and settlement amounts remain unchanged',
    );
    assert.deepEqual(errors, []);
  } finally {
    if (browser) await browser.close();
    await fixture.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
