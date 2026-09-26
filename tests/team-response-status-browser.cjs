'use strict';

// Real browser + real API, isolated synthetic PostgreSQL. No .env or deployed data.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createTestServer } = require('./local-test-server.cjs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const f = await createTestServer({ staffTeamActors: true, builtFrontend: process.env.TEAM_BUILT_FRONTEND === 'true' });
  let browser;
  try {
    const { ids, request, devLogin, adminPool: db } = f;
    await db.query('UPDATE access_grants SET personal_data_visible=true');
    await db.query("UPDATE users SET display_name=CASE id WHEN $1 THEN 'Анна Автор' WHEN $2 THEN 'Борис Коллега' ELSE display_name END WHERE id=ANY($3::uuid[])", [ids.drivers[0], ids.drivers[1], ids.drivers]);
    const admin = await devLogin(ids.admin), alice = await devLogin(ids.drivers[0]), bob = await devLogin(ids.drivers[1]);
    const api = async (method, route, body, session = admin) => {
      const response = await request(method, route, body, session.accessToken);
      assert.ok([200, 201].includes(response.status), `${method} ${route}: ${response.status} ${JSON.stringify(response.body)}`);
      return response.body;
    };
    const scoped = route => `${route}?responsibilityScopeId=${ids.scope}`;
    const create = (title, kind = 'channel', memberIds = [], session = alice) => api('POST', '/team/conversations', { id: randomUUID(), responsibilityScopeId: ids.scope, kind, title, memberIds }, session);
    const send = (conversation, text, session = alice, parentId = null) => api('POST', '/team/messages', { id: randomUUID(), responsibilityScopeId: ids.scope, conversationId: conversation.id, text, parentId }, session);
    const channel = await create('Статусы прочтения');
    const root = await send(channel, 'Корень обсуждения для прочтения');
    const branch = await send(channel, 'Ответ в скрытой ветке', alice, root.id);
    browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
    const errors = [], failed = [], output = path.resolve(__dirname, '../.local/team-response-status-qa');
    await fs.mkdir(output, { recursive: true });
    async function pageFor(session) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'Europe/Moscow' });
      await context.addInitScript(value => sessionStorage.setItem('ecl.session.v2', JSON.stringify({ session: value })), { ...session, rememberedDevice: false });
      const page = await context.newPage(); page.setDefaultTimeout(20000);
      page.on('pageerror', error => errors.push(error.message));
      page.on('response', response => { if (response.status() >= 500 || (response.status() === 404 && new URL(response.url()).pathname.startsWith('/assets/'))) failed.push(`${response.status()} ${response.url()}`); });
      await page.goto(`${f.origin}/?section=team`);
      await page.getByRole('heading', { name: 'Команда', exact: true }).waitFor();
      return page;
    }
    const tabs = page => page.getByRole('navigation', { name: 'Разделы команды' });
    const row = (page, id) => page.locator(`[data-message-id="${id}"]`).first();
    const receipt = (page, id) => row(page, id).locator('.team-message-delivery');
    async function selectChannel(page) {
      await tabs(page).getByRole('button', { name: 'Обсуждения', exact: true }).click();
      await page.locator('.team-chat-item').filter({ hasText: channel.title }).click();
      await row(page, root.id).waitFor();
    }
    async function assertFits(page) {
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Page must fit viewport without horizontal overflow');
    }
    async function assertQuietReceipt(page, id) {
      assert.ok(await receipt(page, id).evaluate(element => {
        const card = element.closest('.team-message').getBoundingClientRect(), bounds = element.getBoundingClientRect(), style = getComputedStyle(element);
        return bounds.width <= 36 && bounds.height <= 24 && bounds.right <= card.right + 1 && bounds.bottom <= card.bottom + 1 && bounds.left >= card.left + card.width / 2 && bounds.top >= card.top + card.height / 2 && parseFloat(style.opacity) <= 0.8;
      }), 'Receipt is small and remains within its message card');
    }

    const author = await pageFor(alice);
    await selectChannel(author);
    await receipt(author, root.id).locator('svg').waitFor();
    assert.equal(await receipt(author, root.id).getAttribute('data-status'), 'sent');
    assert.equal(await receipt(author, root.id).getAttribute('aria-label'), 'Отправлено · пока никто не прочитал');
    assert.equal(await tabs(author).getByRole('button', { name: 'Скорость ответов', exact: true }).count(), 0);
    await author.getByLabel('Сообщение в чат', { exact: true }).fill('Черновик остаётся при прочтении');
    const refreshedRead = author.waitForResponse(async response => {
      const url = new URL(response.url());
      if (!url.pathname.endsWith(`/team/conversations/${channel.id}/changes`) || !url.searchParams.get('readMessageIds')?.includes(root.id)) return false;
      const data = await response.json();
      return data.messages?.length === 0 && data.readStatuses?.some(message => message.id === root.id && message.delivery?.status === 'read');
    }, { timeout: 40000 });
    const reader = await pageFor(bob);
    await selectChannel(reader);
    await reader.waitForFunction(async ({ id, scope, token, messageId }) => {
      const response = await fetch(`/api/v1/team/conversations/${id}?responsibilityScopeId=${scope}`, { headers: { Authorization: `Bearer ${token}` } });
      return (await response.json()).messages.some(message => message.id === messageId && !message.isUnread);
    }, { id: channel.id, scope: ids.scope, token: bob.accessToken, messageId: root.id });
    assert.equal(await receipt(reader, root.id).count(), 0, 'Incoming messages do not display a sender receipt');
    const detail = await api('GET', scoped(`/team/conversations/${channel.id}`), undefined, bob);
    assert.equal(detail.messages.find(message => message.id === branch.id).isUnread, true, 'Collapsed branch remains unread');
    await author.bringToFront();
    await author.locator(`[data-message-id="${root.id}"] .team-message-delivery[data-status="read"]`).waitFor({ timeout: 30000 });
    await refreshedRead;
    assert.equal(await receipt(author, root.id).getAttribute('aria-label'), 'Прочитали: 1');
    assert.equal(await author.getByLabel('Сообщение в чат', { exact: true }).inputValue(), 'Черновик остаётся при прочтении');
    assert.equal(Number((await db.query('SELECT count(*) FROM team_messages WHERE conversation_id=$1', [channel.id])).rows[0].count), 2, 'Read update requires no extra message');
    await assertQuietReceipt(author, root.id);
    await author.screenshot({ path: path.join(output, 'read-status-desktop.png'), fullPage: true });

    await row(author, root.id).getByRole('button', { name: /Открыть ветку:/ }).first().click();
    await receipt(author, branch.id).waitFor();
    assert.equal(await receipt(author, branch.id).getAttribute('data-status'), 'sent');
    await reader.bringToFront();
    await row(reader, root.id).getByRole('button', { name: /Открыть ветку:/ }).first().click();
    await row(reader, branch.id).scrollIntoViewIfNeeded();
    await reader.waitForFunction(async ({ id, scope, token, messageId }) => {
      const response = await fetch(`/api/v1/team/conversations/${id}?responsibilityScopeId=${scope}`, { headers: { Authorization: `Bearer ${token}` } });
      return (await response.json()).messages.some(message => message.id === messageId && !message.isUnread);
    }, { id: channel.id, scope: ids.scope, token: bob.accessToken, messageId: branch.id });
    await author.bringToFront();
    await author.locator(`[data-message-id="${branch.id}"] .team-message-delivery[data-status="read"]`).waitFor({ timeout: 30000 });
    // An edited version needs another visible read even when ordinary unread count stays zero.
    await tabs(reader).getByRole('button', { name: 'База знаний', exact: true }).click();
    const edited = await api('PUT', `/team/messages/${root.id}`, { responsibilityScopeId: ids.scope, operationId: randomUUID(), version: root.version, text: 'Корень обсуждения после уточнения' }, alice);
    const unreadEdit = (await api('GET', scoped(`/team/conversations/${channel.id}`), undefined, bob)).messages.find(message => message.id === root.id);
    assert.equal(unreadEdit.isUnread, false); assert.equal(unreadEdit.requiresReadReceipt, true);
    await author.bringToFront();
    await author.locator(`[data-message-id="${root.id}"][data-message-version="${edited.version}"] .team-message-delivery[data-status="sent"]`).first().waitFor({ timeout: 30000 });
    await reader.bringToFront(); await selectChannel(reader);
    await reader.waitForFunction(async ({ id, scope, token, messageId, version }) => {
      const response = await fetch(`/api/v1/team/conversations/${id}?responsibilityScopeId=${scope}`, { headers: { Authorization: `Bearer ${token}` } });
      return (await response.json()).messages.some(message => message.id === messageId && message.version === version && !message.requiresReadReceipt);
    }, { id: channel.id, scope: ids.scope, token: bob.accessToken, messageId: root.id, version: edited.version });
    await author.bringToFront();
    await author.locator(`[data-message-id="${root.id}"][data-message-version="${edited.version}"] .team-message-delivery[data-status="read"]`).first().waitFor({ timeout: 30000 });
    await author.setViewportSize({ width: 390, height: 844 });
    await assertFits(author); await assertQuietReceipt(author, branch.id);
    await author.screenshot({ path: path.join(output, 'read-status-mobile.png'), fullPage: true });

    // Fixed, synthetic message times make statistics independent of test speed.
    const anchor = Date.now();
    async function sendAt(conversation, text, session, secondsAgo, parentId = null) {
      const message = await send(conversation, text, session, parentId);
      await db.query('UPDATE team_messages SET created_at=$2 WHERE id=$1', [message.id, new Date(anchor - secondsAgo * 1000)]);
      return message;
    }
    const direct = await create('Ответы Бориса', 'direct', [ids.admin, ids.drivers[1]], admin);
    await sendAt(direct, 'Первый вопрос', admin, 7200);
    await sendAt(direct, 'Дополнение к вопросу', admin, 7140);
    await sendAt(direct, 'Ответ Бориса через три минуты', bob, 7020);
    await sendAt(direct, 'Продолжение ответа не отдельная реакция', bob, 6960);
    const pendingQuestion = await sendAt(direct, 'Следующий вопрос пока без ответа', admin, 6900);
    const work = await create('Замеры ответов', 'channel', [], admin);
    const requestMessage = await sendAt(work, 'Поручение в канале', admin, 6500);
    await sendAt(work, 'Первый ответ в ветке через пять минут', bob, 6200, requestMessage.id);
    await sendAt(work, 'Уточнение в той же ветке', bob, 5900, requestMessage.id);
    const older = await create('Ответы Анны', 'direct', [ids.admin, ids.drivers[0]], admin);
    await sendAt(older, 'Вопрос двадцать дней назад', admin, 20 * 86400);
    await sendAt(older, 'Ответ за одну минуту', alice, 20 * 86400 - 60);

    const metrics = await api('GET', `${scoped('/team/response-metrics')}&days=30`);
    const bobMetrics = metrics.employees.find(employee => employee.userId === ids.drivers[1]);
    assert.equal(bobMetrics.responseCount, 2); assert.equal(bobMetrics.averageResponseSeconds, 240); assert.equal(bobMetrics.medianResponseSeconds, 240);
    assert.equal(bobMetrics.directResponseCount, 1); assert.equal(bobMetrics.channelResponseCount, 1); assert.equal(bobMetrics.pendingDirectCount, 1);
    assert.equal((await request('GET', scoped('/team/response-metrics'), undefined, alice.accessToken)).status, 403);

    const administrator = await pageFor(admin);
    await administrator.locator('.team-chat-item').filter({ hasText: 'Борис Коллега' }).click();
    await receipt(administrator, pendingQuestion.id).waitFor();
    assert.equal(await receipt(administrator, pendingQuestion.id).getAttribute('aria-label'), 'Отправлено');
    await reader.reload();
    await reader.locator('.team-chat-item').filter({ hasText: 'Администратор доступа' }).click();
    await row(reader, pendingQuestion.id).scrollIntoViewIfNeeded();
    await reader.waitForFunction(async ({ id, scope, token, messageId }) => {
      const response = await fetch(`/api/v1/team/conversations/${id}?responsibilityScopeId=${scope}`, { headers: { Authorization: `Bearer ${token}` } });
      return (await response.json()).messages.some(message => message.id === messageId && !message.requiresReadReceipt && !message.isUnread);
    }, { id: direct.id, scope: ids.scope, token: bob.accessToken, messageId: pendingQuestion.id });
    await administrator.bringToFront();
    await administrator.locator(`[data-message-id="${pendingQuestion.id}"] .team-message-delivery[data-status="read"]`).waitFor({ timeout: 30000 });
    assert.equal(await receipt(administrator, pendingQuestion.id).getAttribute('aria-label'), 'Прочитано');
    await tabs(administrator).getByRole('button', { name: 'Скорость ответов', exact: true }).click();
    const panel = administrator.locator('.team-response-metrics');
    await panel.getByRole('heading', { name: 'Скорость ответов', exact: true }).waitFor();
    const metricRow = userId => panel.locator(`[data-employee-id="${userId}"]`);
    await metricRow(ids.drivers[1]).waitFor();
    assert.match(await metricRow(ids.drivers[1]).innerText(), /Борис Коллега/);
    assert.match(await metricRow(ids.drivers[1]).innerText(), /4\s*мин/);
    assert.match(await metricRow(ids.drivers[0]).innerText(), /1\s*мин/);
    await panel.getByLabel('Найти сотрудника', { exact: true }).fill('Борис');
    await metricRow(ids.drivers[0]).waitFor({ state: 'detached' });
    assert.equal(await panel.locator('[data-employee-id]').count(), 1);
    await administrator.screenshot({ path: path.join(output, 'response-metrics-desktop.png'), fullPage: true });
    await panel.getByLabel('Найти сотрудника', { exact: true }).fill('');
    const [periodResponse] = await Promise.all([
      administrator.waitForResponse(response => new URL(response.url()).pathname.endsWith('/team/response-metrics') && new URL(response.url()).searchParams.get('days') === '7'),
      panel.getByLabel('Период статистики').selectOption('7'),
    ]);
    assert.equal(periodResponse.status(), 200);
    await administrator.waitForFunction(userId => {
      const element = document.querySelector(`.team-response-metrics [data-employee-id="${userId}"]`);
      return element && !/1\s*мин/.test(element.textContent);
    }, ids.drivers[0]);
    for (const width of [1280, 1024, 900, 768, 390]) {
      await administrator.setViewportSize({ width, height: 844 });
      await assertFits(administrator);
    }
    await administrator.screenshot({ path: path.join(output, 'response-metrics-mobile.png'), fullPage: true });
    assert.deepEqual(errors, []); assert.deepEqual(failed, []);
    console.log('PASS response status browser: subtle direct/channel own-message receipts update without new messages, hidden branches remain unread, edits require rereading, draft retained, admin-only response metrics, exact 4-minute averages, periods/search, desktop/mobile');
  } finally {
    if (browser) await browser.close();
    await f.close();
  }
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
