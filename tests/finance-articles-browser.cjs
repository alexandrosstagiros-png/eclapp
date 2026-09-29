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
    const fuel = await api('PUT', '/catalogs/directions', {
      ...base,
      name: 'Топливо',
    });
    const party = await api('PUT', '/catalogs/counterparties', {
      ...base,
      name: 'Синтетический арендодатель',
      roles: ['supplier'],
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
    const header = page.locator('.fl-workspace > header');
    const nav = page.getByRole('navigation', {
      name: 'Разделы финансов',
      exact: true,
    });
    const openArticles = async () => {
      await header.getByRole('button', { name: 'Статьи', exact: true }).click();
      await page
        .getByRole('navigation', {
          name: 'Финансовые справочники',
          exact: true,
        })
        .getByRole('button', { name: 'Статьи', exact: true })
        .waitFor();
    };
    const back = () =>
      page.getByRole('button', { name: 'К финансам', exact: true }).click();
    const companyForm = page.getByRole('form', {
      name: 'Запись справочника',
      exact: true,
    });
    const catalogSave = async () => {
      const response = page.waitForResponse(
        (value) =>
          value.url().endsWith('/catalogs/articles') &&
          value.request().method() === 'PUT',
      );
      await companyForm
        .getByRole('button', { name: 'Сохранить статью', exact: true })
        .click();
      const result = await response;
      assert.equal(result.status(), 200, await result.text());
      await companyForm.waitFor({ state: 'hidden' });
      return result.json();
    };
    await openArticles();
    await page
      .getByRole('button', { name: 'Добавить статью', exact: true })
      .click();
    await companyForm
      .getByLabel('Название', { exact: true })
      .fill('Аренда офиса');
    await companyForm
      .getByLabel('Код статьи', { exact: true })
      .fill('OFFICE_RENT');
    await companyForm
      .getByLabel('Тип статьи', { exact: true })
      .selectOption('income');
    await companyForm.getByLabel('Группа статьи', { exact: true }).fill('Офис');
    await companyForm
      .getByLabel('Описание статьи', { exact: true })
      .fill('Синтетическая статья с применимостью к двум направлениям');
    await companyForm
      .getByLabel('Для всех направлений', { exact: true })
      .uncheck();
    await companyForm.getByLabel('Доставка', { exact: true }).check();
    await companyForm.getByLabel('Экипажный блок', { exact: true }).check();
    assert.equal(
      await companyForm.getByLabel(/Компания записи|Проект|Область/).count(),
      0,
    );
    const rent = await catalogSave();
    assert.deepEqual(
      new Set(rent.directionIds),
      new Set([delivery.id, crews.id]),
    );
    const articles = page.getByRole('table', { name: 'Статьи', exact: true });
    await articles.getByText('Аренда офиса', { exact: true }).waitFor();
    await page.getByLabel('Поиск статей', { exact: true }).fill('OFFICE_RENT');
    await page.getByLabel('Тип статей', { exact: true }).selectOption('income');
    await page
      .getByLabel('Группа статей', { exact: true })
      .selectOption('Офис');
    await articles.getByText('Аренда офиса', { exact: true }).waitFor();
    await page.getByLabel('Поиск статей', { exact: true }).fill('');
    await back();

    await page.getByRole('button', { name: '+ Операция', exact: true }).click();
    const operation = page.getByRole('dialog', {
      name: 'Новая операция',
      exact: true,
    });
    await operation
      .getByLabel('Вид операции', { exact: true })
      .selectOption('expense');
    await operation.getByLabel('Сумма, ₽', { exact: true }).fill('100');
    await operation
      .getByLabel('Контрагент', { exact: true })
      .selectOption(party.id);
    await operation
      .getByLabel('Направление', { exact: true })
      .selectOption(fuel.id);
    assert.equal(
      await operation
        .getByLabel('Статья', { exact: true })
        .locator(`option[value="${rent.id}"]`)
        .count(),
      0,
    );
    await operation
      .getByLabel('Направление', { exact: true })
      .selectOption(delivery.id);
    await operation
      .getByLabel('Назначение', { exact: true })
      .fill('Проверка обязательной статьи');
    await operation
      .getByRole('button', { name: 'Сохранить операцию', exact: true })
      .click();
    await operation
      .getByText('Выберите статью из справочника или добавьте новую.', {
        exact: true,
      })
      .waitFor();
    assert.equal((await api('GET', '')).operations.total, 0);
    await operation.getByLabel('Статья', { exact: true }).selectOption(rent.id);
    await operation
      .getByLabel('Назначение', { exact: true })
      .fill('Прямой расход доставки');
    if (await operation.getByLabel('Проект операции', { exact: true }).count())
      await operation
        .getByLabel('Проект операции', { exact: true })
        .selectOption(ids.scope);
    await operation
      .getByRole('button', { name: 'Сохранить операцию', exact: true })
      .click();
    await operation.waitFor({ state: 'hidden' });
    let state = await api('GET', '');
    const expense = state.operations.items.find(
      (item) => item.description === 'Прямой расход доставки',
    );
    assert.equal(expense.articleId, rent.id);
    assert.equal(expense.article, 'Аренда офиса');
    assert.equal(state.reports.pnl.revenueKopecks, 0);
    assert.equal(
      (await api('GET', `?directionId=${delivery.id}`)).reports.pnl
        .expenseKopecks,
      10000,
    );
    assert.equal(
      (await api('GET', `?directionId=${crews.id}`)).reports.pnl.expenseKopecks,
      0,
    );
    console.log(
      'PASS article creation, grouping, search and applicability; category never changes accounting and direct expense stays 100%',
    );

    await page.getByRole('button', { name: '+ Операция', exact: true }).click();
    await operation
      .getByLabel('Вид операции', { exact: true })
      .selectOption('expense');
    await operation.getByLabel('Сумма, ₽', { exact: true }).fill('12.34');
    await operation
      .getByLabel('Контрагент', { exact: true })
      .selectOption(party.id);
    await operation
      .getByLabel('Направление', { exact: true })
      .selectOption(crews.id);
    await operation
      .getByLabel('Назначение', { exact: true })
      .fill('Операция с быстрым добавлением статьи');
    if (await operation.getByLabel('Проект операции', { exact: true }).count())
      await operation
        .getByLabel('Проект операции', { exact: true })
        .selectOption(ids.scope);
    const operationDate = await operation
      .getByLabel('Дата операции', { exact: true })
      .inputValue();
    await operation
      .getByRole('button', { name: '+ Статья', exact: true })
      .click();
    await operation
      .getByLabel('Название новой статьи', { exact: true })
      .fill('Связь');
    await operation
      .getByLabel('Тип новой статьи', { exact: true })
      .selectOption('expense');
    await operation
      .getByLabel('Группа новой статьи', { exact: true })
      .fill('Офис');
    await operation
      .getByRole('button', {
        name: 'Добавить статью в справочник',
        exact: true,
      })
      .click();
    await operation
      .getByLabel('Название новой статьи', { exact: true })
      .waitFor({ state: 'hidden' });
    assert.equal(
      await operation.getByLabel('Сумма, ₽', { exact: true }).inputValue(),
      '12.34',
    );
    assert.equal(
      await operation.getByLabel('Дата операции', { exact: true }).inputValue(),
      operationDate,
    );
    assert.equal(
      await operation.getByLabel('Направление', { exact: true }).inputValue(),
      crews.id,
    );
    assert.equal(
      await operation.getByLabel('Назначение', { exact: true }).inputValue(),
      'Операция с быстрым добавлением статьи',
    );
    await operation
      .getByRole('button', { name: 'Сохранить операцию', exact: true })
      .click();
    await operation.waitFor({ state: 'hidden' });
    state = await api('GET', '');
    const communication = state.catalogs.articles.find(
      (item) => item.name === 'Связь',
    );
    assert.equal(
      state.operations.items.find(
        (item) => item.description === 'Операция с быстрым добавлением статьи',
      ).articleId,
      communication.id,
    );
    console.log(
      'PASS quick article creation preserves amount, date, direction and operation draft',
    );

    await openArticles();
    await page.getByLabel('Тип статей', { exact: true }).selectOption('');
    await articles
      .getByRole('row')
      .filter({ hasText: 'Аренда офиса' })
      .getByRole('button', { name: 'Изменить', exact: true })
      .click();
    await companyForm
      .getByLabel('Название', { exact: true })
      .fill('Аренда помещений');
    const renamed = await catalogSave();
    assert.equal(renamed.id, rent.id);
    state = await api('GET', '');
    assert.equal(
      state.operations.items.find((item) => item.id === expense.id).article,
      'Аренда офиса',
    );
    assert.ok(
      state.reports.pnl.rows.some(
        (item) =>
          item.articleId === rent.id &&
          item.articleNames.includes('Аренда офиса'),
      ),
    );
    await back();
    await nav.getByRole('button', { name: 'Отчёты', exact: true }).click();
    await page
      .getByRole('button', { name: 'Прибыли и убытки · PnL', exact: true })
      .click();
    await page
      .getByRole('table', { name: 'Прибыли и убытки · PnL', exact: true })
      .getByText('В документах: Аренда офиса', { exact: true })
      .waitFor();
    const drillResponse = page.waitForResponse(
      (response) =>
        response.url().includes(`/finance/ledger?`) &&
        new URL(response.url()).searchParams.get('articleId') === rent.id,
    );
    await page
      .getByRole('button', { name: 'Аренда помещений', exact: true })
      .click();
    assert.equal((await drillResponse).status(), 200);
    await page.locator(`tr[data-operation-id="${expense.id}"]`).waitFor();
    console.log(
      'PASS catalog rename preserves document snapshots and report drill uses stable article ID',
    );

    await openArticles();
    const archiveResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith('/catalogs/articles') &&
        response.request().method() === 'PUT',
    );
    await articles
      .getByRole('row')
      .filter({ hasText: 'Аренда помещений' })
      .getByRole('button', { name: 'В архив', exact: true })
      .click();
    assert.equal((await archiveResponse).status(), 200);
    await page
      .getByLabel('Состояние статей', { exact: true })
      .selectOption('archived');
    await articles.getByText('Аренда помещений', { exact: true }).waitFor();
    await back();
    await nav.getByRole('button', { name: 'Операции', exact: true }).click();
    await page
      .locator(`tr[data-operation-id="${expense.id}"]`)
      .getByRole('button', { name: 'Изменить', exact: true })
      .click();
    const editOperation = page.getByRole('dialog', {
      name: 'Изменение операции',
      exact: true,
    });
    assert.equal(
      await editOperation.getByLabel('Статья', { exact: true }).inputValue(),
      rent.id,
    );
    await editOperation
      .getByLabel('Назначение', { exact: true })
      .fill('Прямой расход после правки');
    await editOperation
      .getByRole('button', { name: 'Сохранить операцию', exact: true })
      .click();
    await editOperation.waitFor({ state: 'hidden' });
    state = await api('GET', '');
    const corrected = state.operations.items.find(
      (item) =>
        item.description === 'Прямой расход после правки' && !item.reversed,
    );
    assert.equal(corrected.articleId, rent.id);
    assert.equal(corrected.article, 'Аренда офиса');
    await page.getByRole('button', { name: '+ Операция', exact: true }).click();
    await operation
      .getByLabel('Направление', { exact: true })
      .selectOption(delivery.id);
    assert.equal(
      await operation
        .getByLabel('Статья', { exact: true })
        .locator(`option[value="${rent.id}"]`)
        .count(),
      0,
    );
    await operation
      .getByRole('button', { name: 'Отмена', exact: true })
      .click();
    await openArticles();
    await page
      .getByLabel('Состояние статей', { exact: true })
      .selectOption('archived');
    const restoreResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith('/catalogs/articles') &&
        response.request().method() === 'PUT',
    );
    await articles
      .getByRole('row')
      .filter({ hasText: 'Аренда помещений' })
      .getByRole('button', { name: 'Восстановить', exact: true })
      .click();
    assert.equal((await restoreResponse).status(), 200);
    await page
      .getByLabel('Состояние статей', { exact: true })
      .selectOption('active');
    await articles.getByText('Аренда помещений', { exact: true }).waitFor();
    const output = path.resolve(__dirname, '../.local/finance-ui');
    await fs.mkdir(output, { recursive: true });
    await page.screenshot({
      path: path.join(output, 'finance-articles-desktop.png'),
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await articles.getByText('Аренда помещений', { exact: true }).waitFor();
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      'Article catalog must not overflow the mobile viewport',
    );
    await page.screenshot({
      path: path.join(output, 'finance-articles-mobile.png'),
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    console.log(
      'PASS archive prevents new selection, preserves existing correction and restore returns the same catalog item',
    );

    await back();
    await nav.getByRole('button', { name: 'Операции', exact: true }).click();
    const correctedRow = page.locator(
      `tr[data-operation-id="${corrected.id}"]`,
    );
    await correctedRow
      .getByLabel('Статья: Прямой расход после правки', { exact: true })
      .selectOption('');
    const clearResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/operations/${corrected.id}`) &&
        response.request().method() === 'PATCH',
    );
    await correctedRow
      .getByRole('button', { name: 'Сохранить', exact: true })
      .click();
    assert.equal((await clearResponse).status(), 200);
    state = await api('GET', '');
    const cleared = state.operations.items.find(
      (item) =>
        item.description === 'Прямой расход после правки' && !item.reversed,
    );
    assert.equal(cleared.articleId, null);
    assert.notEqual(cleared.article, 'Аренда офиса');
    assert.notEqual(cleared.article, 'Аренда помещений');
    console.log(
      'PASS explicit empty selection clears both article ID and historical text',
    );

    const legacy = await api('POST', '/operations', {
      ...base,
      kind: 'expense',
      date: operationDate,
      amountKopecks: 500,
      directionId: delivery.id,
      counterpartyId: party.id,
      article: 'Старая ручная статья',
      description: 'Исторический расход',
    });
    await page.getByRole('button', { name: 'Обновить', exact: true }).click();
    await nav.getByRole('button', { name: 'Операции', exact: true }).click();
    const clearDrill = page.getByRole('button', {
      name: 'Показать все статьи',
      exact: true,
    });
    if (await clearDrill.count()) await clearDrill.click();
    const legacyRow = page.locator(`tr[data-operation-id="${legacy.id}"]`);
    await legacyRow
      .getByRole('button', { name: 'Изменить', exact: true })
      .click();
    await editOperation
      .getByLabel('Статья', { exact: true })
      .locator('option[value="__legacy_article__"]')
      .waitFor({ state: 'attached' });
    await editOperation
      .getByLabel('Назначение', { exact: true })
      .fill('Исторический расход после правки');
    await editOperation
      .getByRole('button', { name: 'Сохранить операцию', exact: true })
      .click();
    await editOperation.waitFor({ state: 'hidden' });
    state = await api('GET', '');
    assert.ok(
      state.operations.items.some(
        (item) =>
          item.description === 'Исторический расход после правки' &&
          item.article === 'Старая ручная статья' &&
          !item.articleId,
      ),
    );
    assert.deepEqual(errors, []);
    console.log(
      'PASS unlinked legacy article text survives unrelated edits; no browser errors',
    );
  } finally {
    if (browser) await browser.close();
    await fixture.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
