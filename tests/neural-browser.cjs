'use strict';
// Full application against an isolated database, without provider keys or real messages.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createTestServer } = require('./local-test-server.cjs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const fixture = await createTestServer({ builtFrontend: process.env.NEURAL_BUILT_FRONTEND === 'true' });
  let browser;
  try {
    const { ids, request, devLogin, adminPool } = fixture;
    await adminPool.query('UPDATE access_grants SET finance_visible=true,personal_data_visible=true WHERE user_id=$1', [ids.admin]);
    const admin = await devLogin(ids.admin), dispatcher = await devLogin(ids.dispatcher);
    const api = async (method, route, body) => {
      const response = await request(method, route, body, admin.accessToken);
      assert.ok([200, 201].includes(response.status), `${route}: ${JSON.stringify(response.body)}`);
      return response.body;
    };
    const chat = await api('POST', '/team/conversations', { id: randomUUID(), responsibilityScopeId: ids.scope, kind: 'channel', title: 'Итоги команды', memberIds: [] });
    await api('POST', '/team/messages', { id: randomUUID(), responsibilityScopeId: ids.scope, conversationId: chat.id, parentId: null, text: 'Задача: согласовать стоимость ремонта до пятницы.' });
    browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'Europe/Moscow' });
    await context.addInitScript(session => sessionStorage.setItem('ecl.session.v2', JSON.stringify({ session })), { ...admin, rememberedDevice: false });
    const page = await context.newPage(), errors = [];
    page.setDefaultTimeout(15000); page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${fixture.origin}/?section=neural`);
    await page.getByRole('heading', { name: 'Нейросети', exact: true }).waitFor();
    const tabs = page.getByRole('navigation', { name: 'Разделы нейросетей', exact: true });
    await page.getByRole('button', { name: 'Создать сводку', exact: true }).click();
    await page.getByLabel('Чат для публикации', { exact: true }).selectOption(chat.id);
    await page.getByRole('button', { name: 'Опубликовать сводку в чат', exact: true }).click();
    await page.getByText('Сводка опубликована в выбранном чате команды.', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Опубликовать сводку в чат', exact: true }).click();
    await page.getByText('Эта сводка уже опубликована в выбранном чате. Повторное сообщение не создавалось.', { exact: true }).waitFor();
    const count = await adminPool.query('SELECT count(*)::int AS count FROM team_messages WHERE conversation_id=$1', [chat.id]);
    assert.equal(count.rows[0].count, 2, 'one source message and one summary publication');
    await tabs.getByRole('button', { name: 'Модели и задачи', exact: true }).click();
    await page.getByRole('heading', { name: 'Подключения', exact: true }).waitFor();
    for (let index = 1; index <= 2; index++) {
      await page.getByRole('button', { name: 'Добавить модель', exact: true }).click();
      await page.getByLabel(`Название настройки · модель ${index}`, { exact: true }).fill(index === 1 ? 'Быстрая сводка' : 'Проверка цен');
      await page.getByLabel(`Провайдер · модель ${index}`, { exact: true }).selectOption(index === 1 ? 'openai' : 'anthropic');
      await page.getByLabel(`Идентификатор модели · модель ${index}`, { exact: true }).fill(index === 1 ? 'fixture-summary' : 'fixture-prices');
      await page.getByLabel(`Входящие токены · модель ${index}`, { exact: true }).fill('1.25');
      await page.getByLabel(`Исходящие токены · модель ${index}`, { exact: true }).fill('5');
    }
    await page.getByLabel('Сводка сообщений', { exact: true }).selectOption({ label: 'Быстрая сводка · fixture-summary' });
    await page.getByLabel('Анализ цен заказ-нарядов', { exact: true }).selectOption({ label: 'Проверка цен · fixture-prices' });
    await page.getByRole('button', { name: 'Сохранить настройки', exact: true }).click();
    await page.getByText('Настройки нейросетей сохранены', { exact: true }).waitFor();
    const settings = await api('GET', `/neural/settings?responsibilityScopeId=${ids.scope}`);
    assert.equal(settings.profiles.length, 2);
    assert.notEqual(settings.tasks.conversation_summary, settings.tasks.work_order_prices);
    await page.reload();
    await tabs.getByRole('button', { name: 'Модели и задачи', exact: true }).click();
    await page.getByLabel('Название настройки · модель 1', { exact: true }).waitFor();
    assert.equal(await page.getByLabel('Название настройки · модель 1', { exact: true }).inputValue(), 'Быстрая сводка');
    await page.getByLabel('Название настройки · модель 1', { exact: true }).fill('Несохранённый черновик');
    page.once('dialog', dialog => dialog.dismiss());
    await tabs.getByRole('button', { name: 'Расходы', exact: true }).click();
    assert.equal(await page.getByLabel('Название настройки · модель 1', { exact: true }).inputValue(), 'Несохранённый черновик');
    page.once('dialog', dialog => dialog.accept());
    await tabs.getByRole('button', { name: 'Расходы', exact: true }).click();
    await page.getByRole('heading', { name: 'Расход токенов и денег', exact: true }).waitFor();
    await page.getByText('За этот период запросов нет.', { exact: true }).first().waitFor();
    assert.equal(await page.getByRole('alert').count(), 0);
    for (const [status, currency, cost, input, output] of [['success', 'USD', '0.0125', 5000, 1250], ['success', 'RUB', '1.5', 300, 100], ['failed', 'USD', null, null, null]]) {
      await adminPool.query(`INSERT INTO neural_usage(id,responsibility_scope_id,actor_id,task,profile_id,provider,model,status,input_tokens,output_tokens,cost,currency,pricing,completed_at)
        VALUES($1,$2,$3,'conversation_summary','fixture','openai','fixture-summary',$4,$5,$6,$7,$8,'{}',clock_timestamp())`,
      [randomUUID(), ids.scope, ids.admin, status, input, output, cost, currency]);
    }
    await page.getByRole('button', { name: 'Обновить расходы', exact: true }).click();
    const history = page.getByRole('table', { name: 'История запросов', exact: true });
    await history.waitFor();
    assert.equal(await history.getByRole('row').count(), 4);
    await history.getByText('нет данных / нет данных', { exact: true }).waitFor();
    await history.getByText('Не рассчитана', { exact: true }).waitFor();
    assert.equal(await page.getByRole('table', { name: 'По моделям', exact: true }).getByRole('row').count(), 2);
    await tabs.getByRole('button', { name: 'Анализ цен', exact: true }).click();
    await page.getByRole('heading', { name: 'Анализ адекватности цен', exact: true }).waitFor();
    await page.getByLabel('Область автопарка', { exact: true }).waitFor();
    const output = path.resolve(__dirname, '../.local/neural-browser-qa');
    await fs.mkdir(output, { recursive: true });
    await tabs.getByRole('button', { name: 'Модели и задачи', exact: true }).click();
    await page.getByLabel('Название настройки · модель 1', { exact: true }).waitFor();
    await page.screenshot({ path: path.join(output, 'models-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'mobile settings fit viewport');
    await page.screenshot({ path: path.join(output, 'models-mobile.png'), fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole('navigation', { name: 'Разделы', exact: true }).getByRole('button', { name: 'Команда', exact: true }).click();
    await page.getByRole('heading', { name: 'Команда', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Сводки', exact: true }).count(), 0, 'summary moved out of Team');
    const staff = await browser.newContext();
    await staff.addInitScript(session => sessionStorage.setItem('ecl.session.v2', JSON.stringify({ session })), { ...dispatcher, rememberedDevice: false });
    const staffPage = await staff.newPage(); staffPage.on('pageerror', error => errors.push(error.message));
    await staffPage.goto(`${fixture.origin}/?section=neural`);
    await staffPage.getByRole('heading', { name: 'Нейросети', exact: true }).waitFor();
    assert.equal(await staffPage.getByRole('button', { name: 'Модели и задачи', exact: true }).count(), 0);
    assert.equal(await staffPage.getByRole('button', { name: 'Расходы', exact: true }).count(), 0);
    assert.deepEqual(errors, []);
    console.log('Neural full-app browser checks passed:', output);
  } finally { if (browser) await browser.close(); await fixture.close(); }
})().catch(error => { console.error(error); process.exit(1); });
