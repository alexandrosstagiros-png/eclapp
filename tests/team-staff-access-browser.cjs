'use strict';
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createTestServer } = require('./local-test-server.cjs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const STAFF = ['dispatcher', 'manager', 'recruiter', 'tender_specialist', 'document_specialist', 'mechanic', 'access_admin', 'auditor'];
(async () => {
  const f = await createTestServer({ builtFrontend: process.env.TEAM_BUILT_FRONTEND === 'true' });
  let browser;
  try {
    const { ids, adminPool: db } = f;
    const sessions = new Map();
    for (const role of [...STAFF, 'driver', 'external_recruiter']) {
      const id = randomUUID();
      const name = role === 'manager' ? 'Офисный сотрудник' : role === 'recruiter' ? 'Удалённый сотрудник' : `Проверка доступа ${role}`;
      await db.query('INSERT INTO users(id,display_name,role,active,approved) VALUES($1,$2,$3,true,true)', [id, name, role]);
      await db.query('INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id,personal_data_visible,finance_visible) VALUES($1,$2,$3,$4,$5,true,true)', [id, ids.legal, ids.region, ids.project, ids.scope]);
      sessions.set(role, await f.devLogin(id));
    }
    const admin = sessions.get('access_admin');
    const channel = await f.request('POST', '/team/conversations', { id: randomUUID(), responsibilityScopeId: ids.scope, kind: 'channel', title: 'Только сотрудники компании', memberIds: [] }, admin.accessToken);
    assert.equal(channel.status, 201, JSON.stringify(channel.body));
    for (const role of STAFF) {
      const response = await f.request('GET', '/team/context', undefined, sessions.get(role).accessToken);
      assert.equal(response.status, 200, role);
      const list = await f.request('GET', '/team/conversations', undefined, sessions.get(role).accessToken);
      assert.ok(list.body.conversations.some(item => item.id === channel.body.id), role);
    }
    const people = await f.request('GET', '/team/people', undefined, admin.accessToken);
    assert.ok(people.body.people.every(person => STAFF.includes(person.role)));
    const scope = `responsibilityScopeId=${ids.scope}`;
    const routes = ['/team/context', '/team/people', '/team/conversations', '/team/unread', '/team/mentions', '/team/notification-preferences', '/team/profile-directory', `/team/profiles/${ids.admin}`, `/team/conversations/${channel.body.id}?${scope}`, '/team/articles', '/team/adaptation', `/team/organization?${scope}`, `/team/tasks?${scope}`, `/team/outcomes?kind=weekly&${scope}`, `/team/summaries?${scope}`, `/team/schedules?${scope}`, '/team/birthdays'];
    for (const role of ['driver', 'external_recruiter']) {
      const session = sessions.get(role);
      for (const route of routes) assert.equal((await f.request('GET', route, undefined, session.accessToken)).status, 403, `${role} ${route}`);
      assert.equal((await f.request('POST', '/team/conversations', { id: randomUUID(), responsibilityScopeId: ids.scope, kind: 'channel', title: 'Запрещённый канал', memberIds: [] }, session.accessToken)).status, 403);
      assert.equal((await f.request('POST', '/team/messages', { id: randomUUID(), responsibilityScopeId: ids.scope, conversationId: channel.body.id, text: 'Запрещённое сообщение' }, session.accessToken)).status, 403);
    }
    assert.equal((await db.query('SELECT count(*)::int AS n FROM team_messages')).rows[0].n, 0);
    console.log('PASS all eight staff roles allowed; drivers and external recruiters denied on 17 read routes and both write routes, even with personal/finance grants');
    browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
    for (const role of ['manager', 'recruiter', 'driver', 'external_recruiter']) {
      const session = sessions.get(role);
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      await context.addInitScript(value => sessionStorage.setItem('ecl.session.v2', JSON.stringify({ session: value })), { ...session, rememberedDevice: false });
      const page = await context.newPage(); page.setDefaultTimeout(15000);
      const errors = [], teamRequests = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/v1/team/')) teamRequests.push(request.url()); });
      await page.goto(`${f.origin}/?section=team`);
      if (['manager', 'recruiter'].includes(role)) {
        await page.getByRole('heading', { name: 'Команда', exact: true }).waitFor();
        await page.getByText('Только сотрудники компании', { exact: true }).first().waitFor();
        assert.ok(await page.getByRole('button', { name: 'Команда', exact: true }).count());
      } else {
        await page.waitForURL(url => url.searchParams.get('section') === (role === 'driver' ? 'communications' : 'recruitment'));
        await page.getByRole('button', { name: 'Настройки', exact: true }).first().waitFor();
        assert.equal(await page.getByRole('button', { name: 'Команда', exact: true }).count(), 0);
        assert.equal(await page.getByRole('heading', { name: 'Команда', exact: true }).count(), 0);
        assert.deepEqual(teamRequests, [], `No Team background requests for ${role}`);
        await page.reload();
        await page.getByRole('button', { name: 'Настройки', exact: true }).first().waitFor();
        assert.equal(await page.getByRole('button', { name: 'Команда', exact: true }).count(), 0);
      }
      assert.deepEqual(errors, []); await context.close();
      console.log(`PASS menu and direct URL: ${role}`);
    }
  } finally { if (browser) await browser.close(); await f.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
