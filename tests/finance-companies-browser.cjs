'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createTestServer } = require('./local-test-server.cjs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

// All companies and grants below live only in the disposable test database.
const checkDigit = (digits, weights) =>
  String(
    (weights.reduce(
      (sum, weight, index) => sum + weight * Number(digits[index]),
      0,
    ) %
      11) %
      10,
  );
const legalBase = '770999001';
const legalInn =
  legalBase + checkDigit(legalBase, [2, 4, 10, 3, 5, 9, 4, 6, 8]);
const personalBase = '7709990012';
const personalFirst =
  personalBase + checkDigit(personalBase, [7, 2, 4, 10, 3, 5, 9, 4, 6, 8]);
const personalInn =
  personalFirst + checkDigit(personalFirst, [3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8]);

(async () => {
  const fixture = await createTestServer({
    builtFrontend: process.env.FINANCE_BUILT_FRONTEND === 'true',
  });
  let browser;
  try {
    const { ids, adminPool: db } = fixture;
    await db.query(
      'UPDATE access_grants SET finance_visible=true WHERE user_id=$1',
      [ids.admin],
    );
    const admin = await fixture.devLogin(ids.admin);
    browser = await chromium.launch({
      headless: true,
      ...(process.env.CHROME_PATH
        ? { executablePath: process.env.CHROME_PATH }
        : {}),
    });
    const errors = [];
    async function open(session) {
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
      const page = await context.newPage();
      page.on('pageerror', (error) => errors.push(error.message));
      page.setDefaultTimeout(15000);
      await page.goto(`${fixture.origin}/?section=finance`);
      await page
        .getByRole('heading', { name: 'Финансы', exact: true })
        .waitFor();
      await page
        .getByRole('button', { name: 'Свои компании', exact: true })
        .click();
      await page
        .getByRole('table', { name: 'Свои компании', exact: true })
        .waitFor();
      return { context, page };
    }
    const { page } = await open(admin);
    const catalogNav = page.getByRole('navigation', {
      name: 'Финансовые справочники',
      exact: true,
    });
    assert.equal(
      await catalogNav
        .getByRole('button', { name: 'Свои компании', exact: true })
        .getAttribute('aria-pressed'),
      'true',
    );
    await page
      .getByRole('button', { name: 'Добавить компанию', exact: true })
      .click();
    const form = page.getByRole('form', {
      name: 'Реквизиты своей компании',
      exact: true,
    });
    await form
      .getByLabel('Название', { exact: true })
      .fill('Синтетическая компания браузера');
    await form.getByLabel('КПП компании', { exact: true }).fill('770901001');
    await form
      .getByLabel('Тип компании', { exact: true })
      .selectOption('sole_proprietor');
    assert.equal(
      await form.getByLabel('КПП компании', { exact: true }).count(),
      0,
    );
    await form
      .getByLabel('Тип компании', { exact: true })
      .selectOption('legal_entity');
    assert.equal(
      await form.getByLabel('КПП компании', { exact: true }).inputValue(),
      '',
    );
    await form.getByLabel('ИНН компании', { exact: true }).fill(legalInn);
    await form.getByLabel('КПП компании', { exact: true }).fill('770901001');
    const output = path.resolve(__dirname, '../.local/finance-ui');
    await fs.mkdir(output, { recursive: true });
    await page.screenshot({
      path: path.join(output, 'finance-company-form.png'),
      fullPage: true,
    });
    assert.equal(
      await form.getByLabel(/Проект|Область|Регион|Компания записи/).count(),
      0,
    );
    const createResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith('/finance/ledger/companies') &&
        response.request().method() === 'PUT',
    );
    await form
      .getByRole('button', { name: 'Сохранить компанию', exact: true })
      .click();
    const createdResponse = await createResponse;
    assert.equal(createdResponse.status(), 200, await createdResponse.text());
    const created = await createdResponse.json();
    const creationBody = createdResponse.request().postDataJSON();
    for (const key of [
      'projectId',
      'regionId',
      'responsibilityScopeId',
      'legalEntityId',
    ])
      assert.equal(Object.hasOwn(creationBody, key), false);
    await form.waitFor({ state: 'hidden' });
    await page.waitForFunction(
      (id) =>
        document.querySelector('select[aria-label="Компания"]')?.value === id,
      created.id,
    );
    assert.equal(
      await page
        .getByLabel('Компания', { exact: true })
        .locator(`option[value="${created.id}"]`)
        .textContent(),
      created.name,
    );
    const stateResponse = await fixture.request(
      'GET',
      '/finance/ledger',
      undefined,
      admin.accessToken,
    );
    assert.equal(stateResponse.status, 200);
    assert.ok(
      stateResponse.body.context.scopes.some(
        (scope) => scope.legalEntityId === created.id,
      ),
    );
    assert.equal(
      stateResponse.body.context.legalEntities.find(
        (company) => company.id === created.id,
      ).organizationKind,
      'legal_entity',
    );
    console.log(
      'PASS create company in existing catalog; selectors and authorized accounting context update automatically',
    );

    const companies = page.getByRole('table', {
      name: 'Свои компании',
      exact: true,
    });
    await companies
      .getByRole('row')
      .filter({ hasText: created.name })
      .getByRole('button', { name: 'Изменить', exact: true })
      .click();
    await form
      .getByLabel('Название', { exact: true })
      .fill('Синтетическая компания после правки');
    await form
      .getByLabel('Полное наименование', { exact: true })
      .fill(
        'Общество с ограниченной ответственностью «Синтетическая компания»',
      );
    await form
      .getByLabel('Юридический адрес', { exact: true })
      .fill('Тестовый адрес, дом 1');
    const editResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith('/finance/ledger/companies') &&
        response.request().method() === 'PUT',
    );
    await form
      .getByRole('button', { name: 'Сохранить компанию', exact: true })
      .click();
    const editedResponse = await editResponse;
    assert.equal(editedResponse.status(), 200, await editedResponse.text());
    const edited = await editedResponse.json();
    assert.equal(edited.id, created.id);
    assert.equal(edited.version, created.version + 1);
    await form.waitFor({ state: 'hidden' });
    await companies
      .getByText('Синтетическая компания после правки', { exact: true })
      .waitFor();
    assert.equal(
      await companies
        .getByRole('button', { name: /Удалить|В архив|Восстановить/ })
        .count(),
      0,
    );
    console.log(
      'PASS edit company with version check; names and optional details preserved without deletion controls',
    );

    await page
      .getByRole('button', { name: 'Добавить компанию', exact: true })
      .click();
    await form
      .getByLabel('Название', { exact: true })
      .fill('Синтетический ИП браузера');
    await form
      .getByLabel('Тип компании', { exact: true })
      .selectOption('sole_proprietor');
    await form.getByLabel('ИНН компании', { exact: true }).fill(personalInn);
    assert.equal(await form.getByLabel('ОГРНИП', { exact: true }).count(), 1);
    const ipResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith('/finance/ledger/companies') &&
        response.request().method() === 'PUT',
    );
    await form
      .getByRole('button', { name: 'Сохранить компанию', exact: true })
      .click();
    const ipResult = await ipResponse;
    assert.equal(ipResult.status(), 200, await ipResult.text());
    const ip = await ipResult.json();
    assert.equal(ip.organizationKind, 'sole_proprietor');
    assert.ok(!ip.kpp);
    await form.waitFor({ state: 'hidden' });
    await companies
      .getByText('Синтетический ИП браузера', { exact: true })
      .waitFor();
    console.log(
      'PASS individual proprietor creation clears KPP and uses twelve-digit INN',
    );

    const reviewerId = randomUUID();
    await db.query(
      'INSERT INTO users(id,display_name,role,active,approved) VALUES($1,$2,$3,true,true)',
      [reviewerId, 'Synthetic company reviewer', 'manager'],
    );
    await db.query(
      'INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id,finance_visible) VALUES($1,$2,$3,$4,$5,true)',
      [reviewerId, ids.legal, ids.region, ids.project, ids.scope],
    );
    const reviewer = await fixture.devLogin(reviewerId);
    const { page: readonly } = await open(reviewer);
    assert.equal(
      await readonly
        .getByRole('button', { name: 'Добавить компанию', exact: true })
        .count(),
      0,
    );
    assert.equal(
      await readonly
        .getByRole('table', { name: 'Свои компании', exact: true })
        .getByRole('button', { name: 'Изменить', exact: true })
        .count(),
      0,
    );
    assert.equal(
      await readonly
        .getByRole('form', { name: 'Реквизиты своей компании', exact: true })
        .count(),
      0,
    );
    assert.deepEqual(errors, []);
    console.log(
      'PASS non-admin can read permitted companies without edit controls; no browser errors',
    );
  } finally {
    if (browser) await browser.close();
    await fixture.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
