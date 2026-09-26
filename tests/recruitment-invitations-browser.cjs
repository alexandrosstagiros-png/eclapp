'use strict';
// Full UI through real API + disposable PostgreSQL. All accounts are synthetic.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createTestServer } = require('./local-test-server.cjs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const fixture = await createTestServer({ builtFrontend: process.env.RECRUITMENT_BUILT_FRONTEND === 'true' });
  const out = path.resolve(__dirname, '../.local/recruitment-invitations-browser-qa');
  let browser;
  try {
    await fs.mkdir(out, { recursive: true });
    await fixture.adminPool.query('UPDATE access_grants SET personal_data_visible=true WHERE user_id=$1', [fixture.ids.admin]);
    let admin = await fixture.devLogin(fixture.ids.admin);
    const adminPhone = '+79990000871';
    const issued = await fixture.request('POST', `/access/users/${fixture.ids.admin}/password`, { phone: adminPhone }, admin.accessToken);
    assert.equal(issued.status, 201);
    admin = await fixture.devLogin(fixture.ids.admin);
    const demandResult = await fixture.request('PUT', '/recruitment/requests', { id: randomUUID(), responsibilityScopeId: fixture.ids.scope, version: 0, title: 'Приватная потребность для приглашённого', kind: 'driver', city: 'Москва', quantity: 3, priority: 'normal', status: 'open', recruiterId: fixture.ids.admin, publicBrief: 'Описание для приглашённого', notes: 'ВНУТРЕННИЙ СЕКРЕТ ПРИГЛАШЕНИЯ' }, admin.accessToken);
    assert.equal(demandResult.status, 200, JSON.stringify(demandResult.body));
    const demand = demandResult.body;
    browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'Europe/Moscow', permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => dialog.accept());
    page.setDefaultTimeout(15000);
    async function login(target) {
      await target.goto(fixture.origin);
      await target.locator('#login-phone').fill(adminPhone);
      await target.locator('#login-password').fill(issued.body.password);
      await target.getByRole('button', { name: 'Войти', exact: true }).click();
      await target.getByRole('button', { name: 'Рекрутинг', exact: true }).click();
      await target.getByRole('navigation', { name: 'Разделы рекрутинга' }).getByRole('button', { name: 'Доступ рекрутеров', exact: true }).click();
      await target.getByRole('button', { name: 'Пригласить по ссылке', exact: true }).waitFor();
    }
    await login(page);
    assert.ok((await context.cookies()).some(cookie => /refresh|device/.test(cookie.name)), 'remembered admin cookie established');
    async function generateInvite(accessExpiresAt) {
      await page.getByRole('button', { name: 'Пригласить по ссылке', exact: true }).click();
      const dialog = page.getByRole('dialog');
      assert.equal(await dialog.locator('input[type="tel"],input[type="password"]').count(), 0);
      assert.equal(await dialog.getByLabel('Имя внешнего рекрутера', { exact: true }).count(), 0);
      await dialog.getByText('Выбрано: 1 из 1', { exact: true }).waitFor();
      if (accessExpiresAt) {
        const localExpiry = await page.evaluate(iso => { const date = new Date(iso); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }, accessExpiresAt);
        await dialog.getByLabel('Доступ до', { exact: true }).fill(localExpiry);
      }
      const response = page.waitForResponse(res => res.url().endsWith('/recruitment/invitations') && res.request().method() === 'POST');
      await dialog.getByRole('button', { name: 'Сгенерировать ссылку', exact: true }).click();
      const result = await (await response).json();
      const link = await dialog.getByLabel('Ссылка-приглашение', { exact: true }).inputValue();
      assert.ok(link.includes('#recruitment-invite='));
      assert.equal(new URL(link).searchParams.get('token'), null);
      assert.equal(new URL(link).searchParams.get('section'), 'recruitment');
      assert.equal(await page.evaluate(token => JSON.stringify(localStorage).includes(token) || JSON.stringify(sessionStorage).includes(token), result.invitationToken), false);
      return { result, link, dialog };
    }
    const first = await generateInvite();
    await first.dialog.getByRole('button', { name: 'Скопировать ссылку', exact: true }).click();
    await first.dialog.getByRole('button', { name: 'Ссылка скопирована', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), first.link);
    await page.screenshot({ path: path.join(out, 'invite-link-desktop.png'), fullPage: true });
    await first.dialog.getByRole('button', { name: 'Закрыть', exact: true }).last().click();
    await page.getByText('Ожидает входа', { exact: true }).waitFor();
    console.log('PASS admin creates and copies one-use link without name or phone');

    // Same browser had an admin session + remembered cookie. Invitation must not restore it.
    const previousSession = await page.evaluate(() => sessionStorage.getItem('ecl.session.v2'));
    const apiBeforeAccept = [], requestsBeforeAccept = [];
    page.on('request', request => { requestsBeforeAccept.push(request); if (request.url().includes('/api/v1/')) apiBeforeAccept.push(request); });
    await page.goto(first.link);
    await page.getByLabel('Ваше имя', { exact: true }).waitFor();
    assert.equal(await page.getByText(demand.title, { exact: true }).count(), 0);
    assert.ok(requestsBeforeAccept.every(request => new URL(request.url()).origin === fixture.origin), 'public invite has no third-party requests');
    assert.ok(requestsBeforeAccept.every(request => !request.url().includes(first.result.invitationToken)), 'fragment token never enters a network URL');
    assert.ok(apiBeforeAccept.every(request => !request.headers().authorization), 'invitation public requests carry no previous bearer');
    assert.ok(!apiBeforeAccept.some(request => /\/auth\/refresh|\/me(?:\?|$)|\/recruitment\?/.test(request.url())), 'no restored admin APIs before accepting invitation');
    assert.equal(await page.evaluate(() => sessionStorage.getItem('ecl.session.v2')), previousSession, 'existing session untouched before acceptance');
    await page.getByRole('button', { name: 'Перейти к обычному входу', exact: true }).click();
    await page.getByRole('heading', { name: 'Рекрутинг', exact: true }).waitFor();
    assert.equal(new URL(page.url()).hash, '');
    assert.equal(await page.evaluate(() => JSON.parse(sessionStorage.getItem('ecl.session.v2')).session.actor.role), 'access_admin');
    apiBeforeAccept.length = 0;
    await page.goto(first.link);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByLabel('Ваше имя', { exact: true }).fill('Рекрутер по приглашению');
    await page.getByLabel('Номер телефона', { exact: true }).fill('+79990000872');
    const password = 'RecruiterTest2026!';
    await page.getByLabel('Придумайте пароль', { exact: true }).fill(password);
    await page.getByLabel('Повторите пароль', { exact: true }).fill('DifferentTest2026!');
    await page.getByRole('button', { name: 'Зарегистрироваться и войти', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Пароли не совпадают' }).waitFor();
    assert.ok(!apiBeforeAccept.some(request => request.url().endsWith('/recruitment-invitations/accept')));
    await page.getByLabel('Повторите пароль', { exact: true }).fill(password);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'signup fits mobile');
    await page.screenshot({ path: path.join(out, 'invite-signup-mobile.png'), fullPage: true });
    const acceptedResponse = page.waitForResponse(res => res.url().endsWith('/recruitment-invitations/accept'));
    await page.getByRole('button', { name: 'Зарегистрироваться и войти', exact: true }).click();
    const accepted = await (await acceptedResponse).json();
    assert.equal(accepted.actor.role, 'external_recruiter');
    await page.getByRole('heading', { name: demand.title, exact: true }).waitFor();
    assert.equal(new URL(page.url()).hash, '');
    assert.equal(await page.getByText('ВНУТРЕННИЙ СЕКРЕТ ПРИГЛАШЕНИЯ', { exact: true }).count(), 0);
    const stored = await page.evaluate(() => ({ local: JSON.stringify(localStorage), session: JSON.stringify(sessionStorage) }));
    for (const raw of Object.values(stored)) { assert.ok(!raw.includes(password)); assert.ok(!raw.includes(first.result.invitationToken)); }
    assert.equal(await page.evaluate(() => JSON.parse(sessionStorage.getItem('ecl.session.v2')).session.actor.role), 'external_recruiter');
    await page.reload();
    await page.getByRole('heading', { name: demand.title, exact: true }).waitFor();
    assert.equal(await page.evaluate(() => JSON.parse(sessionStorage.getItem('ecl.session.v2')).session.actor.role), 'external_recruiter');
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();
    await page.locator('#login-phone').waitFor();
    assert.equal(await page.getByRole('heading', { name: 'Рекрутинг', exact: true }).count(), 0, 'old remembered admin cookie was cleared');
    console.log('PASS same-device isolation, cancel restore, mobile signup, external persistence and old cookie cleared');

    await page.goto(first.link);
    await page.getByRole('alert').filter({ hasText: 'Приглашение недоступно' }).waitFor();
    assert.equal(await page.getByLabel('Ваше имя', { exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Перейти к обычному входу', exact: true }).click();
    await login(page);
    await page.getByText('Использовано', { exact: true }).waitFor();
    await page.getByRole('heading', { name: 'Рекрутер по приглашению', exact: true }).waitFor();
    const revoke = await generateInvite();
    await revoke.dialog.getByRole('button', { name: 'Закрыть', exact: true }).last().click();
    await page.getByRole('button', { name: 'Отозвать приглашение', exact: true }).click();
    await page.getByText('Приглашение отозвано', { exact: true }).waitFor();
    await page.getByText('Отозвано', { exact: true }).waitFor();
    const publicContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'Europe/Moscow' });
    const publicPage = await publicContext.newPage();
    publicPage.on('pageerror', error => errors.push(error.message));
    await publicPage.goto(revoke.link);
    await publicPage.getByRole('alert').filter({ hasText: 'Приглашение недоступно' }).waitFor();
    assert.equal(await publicPage.getByText(demand.title, { exact: true }).count(), 0);
    console.log('PASS used and revoked links unavailable; accepted identity visible to company');

    const expired = await generateInvite();
    await expired.dialog.getByRole('button', { name: 'Закрыть', exact: true }).last().click();
    await fixture.adminPool.query("UPDATE recruitment_invitations SET created_at=clock_timestamp()-interval '2 days',expires_at=clock_timestamp()-interval '1 minute' WHERE id=$1", [expired.result.id]);
    await publicPage.goto(expired.link);
    await publicPage.getByRole('alert').filter({ hasText: 'Приглашение недоступно' }).waitFor();
    assert.equal(await publicPage.getByLabel('Ваше имя', { exact: true }).count(), 0);
    console.log('PASS expired invitation cannot open signup');

    const conflict = await generateInvite(new Date(new Date(first.result.accessExpiresAt).getTime() + 86400000).toISOString());
    await conflict.dialog.getByRole('button', { name: 'Закрыть', exact: true }).last().click();
    await publicPage.goto(conflict.link);
    await publicPage.getByRole('button', { name: 'У меня есть аккаунт', exact: true }).click();
    await publicPage.getByLabel('Номер телефона', { exact: true }).fill('+79990000872');
    await publicPage.getByLabel('Пароль', { exact: true }).fill(password);
    const conflictResponse = publicPage.waitForResponse(res => res.url().endsWith('/recruitment-invitations/accept'));
    await publicPage.getByRole('button', { name: 'Войти и принять приглашение', exact: true }).click();
    assert.equal((await conflictResponse).status(), 409);
    await publicPage.getByRole('alert').filter({ hasText: 'Попросите администратора изменить потребности и срок' }).waitFor();
    assert.equal(await publicPage.evaluate(() => sessionStorage.getItem('ecl.session.v2')), null, 'conflict does not sign in');
    assert.equal((await fixture.request('POST', '/recruitment-invitations/preview', { token: conflict.result.invitationToken })).body.ready, true, 'conflict does not consume invitation');
    const unchangedAccess = await fixture.request('GET', `/recruitment/access?responsibilityScopeId=${fixture.ids.scope}`, undefined, admin.accessToken);
    assert.equal(unchangedAccess.body.grants.find(grant => grant.userId === accepted.actor.id).expiresAt, first.result.accessExpiresAt, 'conflict does not extend existing access');
    console.log('PASS differing access expiry explains conflict without consuming invite or changing access');

    const repeat = await generateInvite(first.result.accessExpiresAt);
    await repeat.dialog.getByRole('button', { name: 'Закрыть', exact: true }).last().click();
    await publicPage.goto(repeat.link);
    await publicPage.getByRole('button', { name: 'У меня есть аккаунт', exact: true }).click();
    assert.equal(await publicPage.getByLabel('Ваше имя', { exact: true }).count(), 0);
    await publicPage.getByLabel('Номер телефона', { exact: true }).fill('+79990000872');
    await publicPage.getByLabel('Пароль', { exact: true }).fill(password);
    await publicPage.screenshot({ path: path.join(out, 'invite-existing-desktop.png'), fullPage: true });
    await publicPage.getByRole('button', { name: 'Войти и принять приглашение', exact: true }).click();
    await publicPage.getByRole('heading', { name: demand.title, exact: true }).waitFor();
    const result = await fixture.adminPool.query('SELECT id FROM users WHERE id=$1', [accepted.actor.id]);
    assert.equal(result.rowCount, 1);
    assert.equal(await publicPage.evaluate(() => JSON.parse(sessionStorage.getItem('ecl.session.v2')).session.actor.id), accepted.actor.id);
    console.log('PASS existing external account accepts link without duplicate identity');
    assert.deepEqual(errors, []);
  } finally {
    if (browser) await browser.close();
    await fixture.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
