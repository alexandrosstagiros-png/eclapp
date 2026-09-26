'use strict';
// Real API and browser with a disposable database and synthetic employees only.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createTestServer } = require('./local-test-server.cjs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const fixture = await createTestServer({ staffTeamActors: true, builtFrontend: process.env.TEAM_BUILT_FRONTEND === 'true' });
  let browser;
  try {
    const { ids, request, devLogin, adminPool } = fixture;
    await adminPool.query('UPDATE access_grants SET personal_data_visible=true');
    const admin = await devLogin(ids.admin);
    const api = async (method, route, body, session = admin) => {
      const result = await request(method, route, body, session.accessToken);
      assert.ok([200, 201].includes(result.status), `${method} ${route}: ${result.status} ${JSON.stringify(result.body)}`);
      return result.body;
    };
    // Derive fixtures from the server's calendar day, so timezone and year rollover
    // do not make the test depend on the machine's local clock or current month.
    const { today } = await api('GET', '/team/birthdays');
    const upcomingDate = days => new Date(Date.parse(`${today}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
    const people = [
      { id: ids.drivers[0], name: 'Анна Сегодня', days: 0 },
      { id: ids.drivers[1], name: 'Борис Завтра', days: 1 },
      { id: ids.specialist, name: 'Вера Через Десять Дней', days: 10 },
      { id: ids.dispatcher, name: 'Георгий Через Сорок Пять Дней', days: 45 },
    ].map(person => ({ ...person, birthDate: `1988-${upcomingDate(person.days).slice(5)}` }));
    for (const person of people) {
      await adminPool.query('UPDATE users SET display_name=$2 WHERE id=$1', [person.id, person.name]);
      await adminPool.query(`INSERT INTO user_profiles(user_id,birth_date) VALUES($1,$2)
        ON CONFLICT(user_id) DO UPDATE SET birth_date=EXCLUDED.birth_date`, [person.id, person.birthDate]);
    }
    const employee = await devLogin(people[0].id);
    const peer = await devLogin(people[1].id);
    const initial = await api('GET', '/team/birthdays');
    assert.equal(initial.today, today);
    assert.equal(initial.missingBirthDateCount, 2);
    assert.deepEqual(initial.employees.map(person => [person.userId, person.daysUntil]), people.map(person => [person.id, person.days]));
    for (const person of people) {
      const value = initial.employees.find(value => value.userId === person.id);
      assert.equal(value.birthDate, person.birthDate);
      assert.equal(value.nextBirthday, upcomingDate(person.days));
      assert.equal(value.congratulated, false);
    }
    // Privacy must hold in actual responses even with broad personal-data access.
    const restricted = await api('GET', `/team/profiles/${people[0].id}`, undefined, peer);
    assert.equal(Object.hasOwn(restricted, 'birthDate'), false);
    assert.equal(restricted.birthdayDay, Number(people[0].birthDate.slice(8)));
    assert.equal(restricted.birthdayMonth, Number(people[0].birthDate.slice(5, 7)));
    const ownProfile = await api('GET', '/profile', undefined, employee);
    assert.equal(Object.hasOwn(ownProfile, 'birthDate'), false);
    assert.equal(ownProfile.birthdayDay, restricted.birthdayDay);
    assert.equal(ownProfile.birthdayMonth, restricted.birthdayMonth);
    const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
    const dayMonthLabel = `${restricted.birthdayDay} ${months[restricted.birthdayMonth - 1]}`;
    assert.equal((await api('GET', `/team/profiles/${people[0].id}`)).birthDate, people[0].birthDate);
    assert.equal((await request('GET', '/team/birthdays', undefined, employee.accessToken)).status, 403);
    assert.equal((await request('PUT', `/team/birthdays/${people[0].id}/congratulation`, { occurrenceDate: today, congratulated: true }, employee.accessToken)).status, 403);
    assert.equal((await request('PUT', `/team/birthdays/${ids.mechanic}/date`, { birthDate: people[0].birthDate, version: 0 }, employee.accessToken)).status, 403);

    const channel = await api('POST', '/team/conversations', {
      id: randomUUID(), responsibilityScopeId: ids.scope, kind: 'channel', title: 'Проверка профилей сотрудников', memberIds: [],
    });
    const message = await api('POST', '/team/messages', {
      id: randomUUID(), responsibilityScopeId: ids.scope, conversationId: channel.id, text: 'Синтетическое сообщение для проверки профиля.',
    }, employee);

    browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
    const errors = [], failed = [], output = path.resolve(__dirname, '../.local/team-birthdays-qa');
    await fs.mkdir(output, { recursive: true });
    async function pageFor(session, section) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'Europe/Moscow' });
      await context.addInitScript(value => sessionStorage.setItem('ecl.session.v2', JSON.stringify({ session: value })), { ...session, rememberedDevice: false });
      const page = await context.newPage();
      page.setDefaultTimeout(20000);
      page.on('pageerror', error => errors.push(error.message));
      page.on('response', response => { if (response.status() >= 500) failed.push(`${response.status()} ${response.url()}`); });
      await page.goto(`${fixture.origin}/?section=${section}`);
      return page;
    }
    async function assertFits(page) {
      const overflow = await page.evaluate(() => ({
        width: innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        elements: [...document.querySelectorAll('.birthdays-workspace *')]
          .filter(element => element.getBoundingClientRect().right > innerWidth + 1)
          .slice(-8).map(element => ({ tag: element.tagName, className: element.className })),
      }));
      assert.ok(overflow.scrollWidth <= overflow.width, JSON.stringify(overflow));
    }
    const administrator = await pageFor(admin, 'team');
    await administrator.getByRole('heading', { name: 'Команда', exact: true }).waitFor();
    await administrator.locator('.birthdays-reminder').waitFor();
    await administrator.locator('.birthdays-nav-count').first().waitFor();
    assert.equal(await administrator.locator('.birthdays-nav-count').first().textContent(), '1');
    await administrator.getByRole('button', { name: /^Поздравления/ }).first().click();
    await administrator.getByRole('heading', { name: 'Поздравления', exact: true }).waitFor();
    assert.equal(new URL(administrator.url()).searchParams.get('section'), 'birthdays');
    const row = id => administrator.locator(`.birthdays-row[data-user-id="${id}"]`);
    const upcomingIds = () => administrator.locator('.birthdays-upcoming .birthdays-row').evaluateAll(rows => rows.map(row => row.dataset.userId));
    await row(people[0].id).waitFor();
    assert.equal(await administrator.locator('.birthdays-today .birthdays-row').count(), 1);
    assert.deepEqual(await upcomingIds(), people.slice(1, 3).map(person => person.id));
    await administrator.getByRole('button', { name: '7 дней', exact: true }).click();
    assert.deepEqual(await upcomingIds(), [people[1].id]);
    await administrator.getByRole('button', { name: 'Все ближайшие', exact: true }).click();
    assert.deepEqual(await upcomingIds(), people.slice(1).map(person => person.id));
    await administrator.getByRole('button', { name: '30 дней', exact: true }).click();
    assert.deepEqual(await upcomingIds(), people.slice(1, 3).map(person => person.id));

    // An administrator can populate missing dates without revealing their year
    // to employees, and can remove an incorrectly entered date afterward.
    await administrator.getByRole('button', { name: 'Без даты', exact: true }).click();
    const missingRow = () => administrator.locator(`.birthdays-row[data-user-id="${ids.mechanic}"]`);
    await missingRow().getByRole('button', { name: 'Указать дату рождения: Механик', exact: true }).click();
    await missingRow().getByLabel('Дата рождения: Механик', { exact: true }).fill(people[0].birthDate);
    await missingRow().getByRole('button', { name: 'Указать дату рождения: Механик', exact: true }).click();
    assert.equal(await missingRow().getByLabel('Дата рождения: Механик', { exact: true }).inputValue(), people[0].birthDate);
    // The employee changes their own contacts after the administrator opened an
    // older version. A stale date save must preserve both the draft and contacts.
    const mechanic = await devLogin(ids.mechanic);
    const mechanicBefore = await api('GET', '/profile', undefined, mechanic);
    await api('PUT', '/profile', {
      operationId: randomUUID(), version: mechanicBefore.version, contacts: 'Новый рабочий контакт механика',
    }, mechanic);
    const staleSave = administrator.waitForResponse(response => response.request().method() === 'PUT' && response.url().includes(`/team/birthdays/${ids.mechanic}/date`));
    await missingRow().getByRole('button', { name: 'Сохранить дату', exact: true }).click();
    assert.equal((await staleSave).status(), 409);
    await administrator.getByRole('alert').filter({ hasText: 'Профиль уже изменён' }).waitFor();
    assert.equal(await missingRow().getByLabel('Дата рождения: Механик', { exact: true }).inputValue(), people[0].birthDate);
    const reloaded = administrator.waitForResponse(response => response.request().method() === 'GET' && new URL(response.url()).pathname === '/api/v1/team/birthdays');
    administrator.once('dialog', dialog => dialog.accept());
    await administrator.getByRole('button', { name: 'Обновить', exact: true }).click();
    assert.equal((await reloaded).status(), 200);
    await administrator.locator('.birthdays-date-editor').waitFor({ state: 'detached' });
    await administrator.getByRole('button', { name: 'Обновить', exact: true }).waitFor();
    await missingRow().getByRole('button', { name: 'Указать дату рождения: Механик', exact: true }).click();
    await missingRow().getByLabel('Дата рождения: Механик', { exact: true }).fill(people[0].birthDate);
    await missingRow().getByRole('button', { name: 'Сохранить дату', exact: true }).click();
    await administrator.locator(`.birthdays-today .birthdays-row[data-user-id="${ids.mechanic}"]`).waitFor();
    await administrator.waitForFunction(() => document.querySelector('.birthdays-nav-count')?.textContent === '2');
    let birthdays = await api('GET', '/team/birthdays');
    assert.equal(birthdays.missingBirthDateCount, 1);
    assert.equal(birthdays.employees.find(person => person.userId === ids.mechanic).birthDate, people[0].birthDate);
    const mechanicForEmployee = await api('GET', `/team/profiles/${ids.mechanic}`, undefined, employee);
    assert.equal(Object.hasOwn(mechanicForEmployee, 'birthDate'), false);
    assert.equal(mechanicForEmployee.birthdayDay, restricted.birthdayDay);
    assert.equal(mechanicForEmployee.birthdayMonth, restricted.birthdayMonth);
    assert.equal(mechanicForEmployee.contacts, 'Новый рабочий контакт механика');
    await missingRow().getByRole('button', { name: 'Изменить дату рождения: Механик', exact: true }).click();
    await missingRow().getByLabel('Дата рождения: Механик', { exact: true }).fill('');
    await missingRow().getByRole('button', { name: 'Сохранить дату', exact: true }).click();
    await missingRow().getByRole('button', { name: 'Указать дату рождения: Механик', exact: true }).waitFor();
    await administrator.waitForFunction(() => document.querySelector('.birthdays-nav-count')?.textContent === '1');
    birthdays = await api('GET', '/team/birthdays');
    assert.equal(birthdays.missingBirthDateCount, 2);
    assert.equal(birthdays.employees.some(person => person.userId === ids.mechanic), false);
    await administrator.getByRole('button', { name: '30 дней', exact: true }).click();

    const toggle = () => row(people[0].id).getByRole('button', { name: `Поздравили: ${people[0].name}`, exact: true });
    assert.equal(await toggle().getAttribute('aria-pressed'), 'false');
    const saved = administrator.waitForResponse(response => response.request().method() === 'PUT' && response.url().includes(`/team/birthdays/${people[0].id}/congratulation`));
    await toggle().click();
    assert.equal((await saved).status(), 200);
    await administrator.locator(`.birthdays-row[data-user-id="${people[0].id}"] button[aria-pressed="true"]`).waitFor();
    await administrator.locator('.birthdays-nav-count').waitFor({ state: 'detached' });
    assert.equal((await api('GET', '/team/birthdays')).employees.find(person => person.userId === people[0].id).congratulated, true);
    await administrator.reload();
    await administrator.getByRole('heading', { name: 'Поздравления', exact: true }).waitFor();
    await administrator.locator(`.birthdays-row[data-user-id="${people[0].id}"] button[aria-pressed="true"]`).waitFor();
    assert.equal(await administrator.locator('.birthdays-nav-count').count(), 0);
    await toggle().click();
    await administrator.locator(`.birthdays-row[data-user-id="${people[0].id}"] button[aria-pressed="false"]`).waitFor();
    await administrator.locator('.birthdays-nav-count').first().waitFor();
    assert.equal(await administrator.locator('.birthdays-nav-count').first().textContent(), '1');
    assert.equal((await api('GET', '/team/birthdays')).employees.find(person => person.userId === people[0].id).congratulated, false);
    await assertFits(administrator);
    await administrator.screenshot({ path: path.join(output, 'birthdays-desktop.png'), fullPage: true });
    await administrator.setViewportSize({ width: 390, height: 844 });
    await assertFits(administrator);
    await administrator.screenshot({ path: path.join(output, 'birthdays-mobile.png'), fullPage: true });
    await administrator.setViewportSize({ width: 1440, height: 1000 });

    async function openProfile(page) {
      await page.goto(`${fixture.origin}/?section=team`);
      await page.getByText(channel.title, { exact: true }).first().click();
      await page.locator(`[data-message-id="${message.id}"]`).getByRole('button', { name: `Профиль: ${people[0].name}`, exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Профиль сотрудника', exact: true });
      await dialog.locator('dl').waitFor();
      return dialog;
    }
    let dialog = await openProfile(administrator);
    const birthdayText = dialog => dialog.locator('dt').filter({ hasText: /^Дата рождения$/ }).evaluate(term => term.nextElementSibling.textContent);
    const adminDateText = await birthdayText(dialog);
    assert.equal(adminDateText, people[0].birthDate.split('-').reverse().join('.'));
    await administrator.screenshot({ path: path.join(output, 'profile-admin-desktop.png'), fullPage: true });
    await dialog.getByRole('button', { name: 'Закрыть', exact: true }).click();
    const colleague = await pageFor(peer, 'birthdays');
    await colleague.getByRole('button', { name: 'Настройки профиля', exact: true }).waitFor();
    assert.equal(await colleague.getByRole('button', { name: /^Поздравления/ }).count(), 0);
    assert.equal(await colleague.locator('.birthdays-workspace, .birthdays-reminder, .birthdays-nav-count').count(), 0);
    dialog = await openProfile(colleague);
    const colleagueDateText = await birthdayText(dialog);
    assert.equal(colleagueDateText, dayMonthLabel);
    assert.ok(!/1988|\d{4}/.test(colleagueDateText), `Colleague birthday must not contain a year: ${colleagueDateText}`);
    assert.ok(colleagueDateText.includes(String(restricted.birthdayDay)), `Colleague birthday must include the day: ${colleagueDateText}`);
    assert.equal(await dialog.locator('[datetime*="1988"], [title*="1988"]').count(), 0);
    await colleague.setViewportSize({ width: 390, height: 844 });
    await assertFits(colleague);
    await colleague.screenshot({ path: path.join(output, 'profile-colleague-mobile.png'), fullPage: true });
    await dialog.getByRole('button', { name: 'Закрыть', exact: true }).click();

    // Editing an unrelated field must not erase a hidden stored birth date.
    const own = await pageFor(employee, 'profile');
    await own.getByRole('heading', { name: 'Настройки', exact: true }).waitFor();
    await own.getByLabel('Почта', { exact: true }).waitFor();
    assert.equal(await own.locator('.profile-birthday-readonly p').textContent(), dayMonthLabel);
    assert.equal(await own.locator('input[type="date"]').count(), 0);
    assert.equal(await own.locator('input[value*="1988"], [datetime*="1988"], [title*="1988"]').count(), 0);
    assert.ok(!(await own.locator('.profile-settings').innerText()).includes('1988'));
    await own.getByLabel('Почта', { exact: true }).fill('birthday-employee@example.test');
    const update = own.waitForResponse(response => response.request().method() === 'PUT' && new URL(response.url()).pathname === '/api/v1/profile');
    await own.getByRole('button', { name: 'Сохранить профиль', exact: true }).click();
    const updateResponse = await update;
    assert.equal(updateResponse.status(), 200);
    assert.equal(Object.hasOwn(await updateResponse.json(), 'birthDate'), false);
    assert.equal(Object.hasOwn(updateResponse.request().postDataJSON(), 'birthDate'), false);
    await own.getByText('Профиль сохранён.', { exact: true }).waitFor();
    assert.equal((await adminPool.query('SELECT birth_date::text AS "birthDate" FROM user_profiles WHERE user_id=$1', [people[0].id])).rows[0].birthDate, people[0].birthDate);
    await own.reload();
    await own.getByLabel('Почта', { exact: true }).waitFor();
    assert.equal(await own.getByLabel('Почта', { exact: true }).inputValue(), 'birthday-employee@example.test');
    await own.setViewportSize({ width: 390, height: 844 });
    await assertFits(own);
    await own.screenshot({ path: path.join(output, 'settings-employee-mobile.png'), fullPage: true });
    assert.deepEqual(errors, []);
    assert.deepEqual(failed, []);
    console.log('PASS birthdays browser: admin reminders, 7/30/all/missing filters, date entry/removal, stale edit409 retains draft and refresh/retry preserves contacts, badges, completion/reload/revert, nonadmin API/UI restrictions, profile year privacy, unrelated self-edit preserves birthday, desktop/mobile fit');
  } finally {
    if (browser) await browser.close();
    await fixture.close();
  }
})().catch(error => { console.error(error.stack || error.message); process.exit(1); });
