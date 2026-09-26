'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createTestServer } = require('./local-test-server.cjs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
  const f = await createTestServer({ builtFrontend: process.env.TEAM_BUILT_FRONTEND === 'true' }); let browser;
  try {
    const { ids, request, devLogin } = f;
    await f.adminPool.query('UPDATE access_grants SET personal_data_visible=true,finance_visible=true WHERE user_id=$1', [ids.admin]);
    const admin = await devLogin(ids.admin), driver = await devLogin(ids.drivers[0]), other = await devLogin(ids.drivers[1]);
    const api = async (method, route, body, session=admin) => { const r=await request(method,route,body,session.accessToken); assert.ok([200,201].includes(r.status),`${method} ${route}: ${r.status} ${JSON.stringify(r.body)}`); return r.body; };
    browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
    const errors=[];
    async function pageFor(session, section) {
      const context=await browser.newContext({viewport:{width:1440,height:1000}});
      await context.addInitScript(value=>sessionStorage.setItem('ecl.session.v2',JSON.stringify({session:value})),{...session,rememberedDevice:false});
      const page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',err=>errors.push(err.message));
      await page.goto(`${f.origin}/?section=${section}`);return page;
    }
    const dp=await pageFor(driver,'team');
    await dp.getByRole('heading',{name:'Связь с отделами',exact:true}).waitFor();
    assert.equal(await dp.getByRole('button',{name:'Команда',exact:true}).count(),0);
    assert.ok(!/telegram|телеграм/i.test(await dp.locator('.driver-requests').innerText()));
    assert.equal((await request('GET','/team/context',undefined,driver.accessToken)).status,403);
    await dp.getByRole('button',{name:'Новое обращение',exact:true}).click();
    const form=dp.getByRole('form',{name:'Новое обращение',exact:true});
    assert.equal(await form.getByLabel('Проект',{exact:true}).count(),0);
    await form.getByLabel('Отдел',{exact:true}).selectOption('transport');
    await form.getByLabel('Тема обращения',{exact:true}).fill('Осмотр перед следующим рейсом');
    await form.getByLabel('Текст обращения',{exact:true}).fill('Нужна проверка давления в шинах до выезда.');
    await form.getByRole('button',{name:'Отправить обращение',exact:true}).click();
    await dp.getByRole('log',{name:'Сообщения обращения'}).getByText('Нужна проверка давления в шинах до выезда.',{exact:true}).waitFor();
    const ticket=(await api('GET','/communications/tickets?view=mine',undefined,driver)).items[0];
    assert.equal(ticket.applicationOnly,true);
    assert.equal((await request('GET',`/communications/tickets/${ticket.id}/messages`,undefined,other.accessToken)).status,404);
    const ap=await pageFor(admin,'team');
    await ap.getByRole('navigation',{name:'Разделы команды'}).getByRole('button',{name:'Запросы водителей',exact:true}).click();
    await ap.locator('.driver-request-item').filter({hasText:ticket.subject}).click();
    await ap.getByRole('log',{name:'Сообщения обращения'}).getByText('Нужна проверка давления в шинах до выезда.',{exact:true}).waitFor();
    // The global refresh must fetch the queue and open thread without remounting or losing a draft.
    // Hide only from the polling guard so an automatic interval cannot satisfy this regression.
    await ap.evaluate(()=>Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'}));
    const retainedDraft='Черновик ответа до обновления';
    await ap.getByLabel('Сообщение в обращение',{exact:true}).fill(retainedDraft);
    const arriving=await api('POST','/communications/tickets',{idempotencyKey:randomUUID(),department:'transport',kind:'question',subject:'Новое обращение для ручного обновления',text:'Проверка обновления очереди.',scope:ticket.scope},driver);
    await api('POST',`/communications/tickets/${ticket.id}/messages`,{idempotencyKey:randomUUID(),text:'Уточнение водителя перед ручным обновлением.'},driver);
    assert.equal(await ap.locator('.driver-request-item').filter({hasText:arriving.subject}).count(),0);
    await ap.getByRole('button',{name:'Обновить команду',exact:true}).click();
    await ap.locator('.driver-request-item').filter({hasText:arriving.subject}).waitFor();
    await ap.getByRole('log',{name:'Сообщения обращения'}).getByText('Уточнение водителя перед ручным обновлением.',{exact:true}).waitFor();
    assert.equal(await ap.getByLabel('Сообщение в обращение',{exact:true}).inputValue(),retainedDraft);
    assert.equal(await ap.locator('.driver-request-item.is-active').filter({hasText:ticket.subject}).count(),1);
    await ap.getByLabel('Сообщение в обращение',{exact:true}).fill('');
    await ap.evaluate(()=>delete document.visibilityState);
    await ap.getByRole('button',{name:'Взять в работу',exact:true}).click();
    await ap.getByRole('form',{name:'Взять в работу',exact:true}).getByRole('button',{name:'Подтвердить',exact:true}).click();
    await ap.getByRole('button',{name:'Отметить решённым',exact:true}).waitFor();
    await ap.getByLabel('Сообщение в обращение',{exact:true}).fill('Подъезжайте к механику в 14:00, проверим перед выездом.');
    await ap.getByRole('button',{name:'Отправить ответ',exact:true}).click();
    await ap.getByRole('log',{name:'Сообщения обращения'}).getByText('Подъезжайте к механику в 14:00, проверим перед выездом.',{exact:true}).waitFor();
    await dp.bringToFront();
    await dp.getByRole('log',{name:'Сообщения обращения'}).getByText('Подъезжайте к механику в 14:00, проверим перед выездом.',{exact:true}).waitFor({timeout:25000});
    await dp.getByLabel('Сообщение в обращение',{exact:true}).fill('Спасибо, буду вовремя.');
    await dp.getByRole('button',{name:'Отправить ответ',exact:true}).click();
    await dp.getByRole('log',{name:'Сообщения обращения'}).getByText('Спасибо, буду вовремя.',{exact:true}).waitFor();
    await ap.bringToFront();
    await ap.getByRole('log',{name:'Сообщения обращения'}).getByText('Спасибо, буду вовремя.',{exact:true}).waitFor({timeout:25000});
    // Draft is retained on failed sending, and the same idempotency key is reused on retry.
    await ap.getByLabel('Сообщение в обращение',{exact:true}).fill('Проверка закончена, можно выезжать.');
    let failedKey;
    await ap.route(`**/communications/tickets/${ticket.id}/messages`,async route=>{
      if(route.request().method()!=='POST')return route.continue();
      failedKey=route.request().postDataJSON().idempotencyKey;
      await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Проверка сбоя'})});
    });
    await ap.getByRole('button',{name:'Отправить ответ',exact:true}).click();
    await ap.locator('.driver-request-error').waitFor();
    assert.equal(await ap.getByLabel('Сообщение в обращение',{exact:true}).inputValue(),'Проверка закончена, можно выезжать.');
    await ap.unroute(`**/communications/tickets/${ticket.id}/messages`);
    const retry=ap.waitForRequest(r=>r.url().endsWith(`/communications/tickets/${ticket.id}/messages`)&&r.method()==='POST');
    await ap.getByRole('button',{name:'Отправить ответ',exact:true}).click();
    assert.equal((await retry).postDataJSON().idempotencyKey,failedKey);
    await ap.getByRole('log',{name:'Сообщения обращения'}).getByText('Проверка закончена, можно выезжать.',{exact:true}).waitFor();
    await ap.getByRole('button',{name:'Отметить решённым',exact:true}).click();
    await ap.getByLabel('Результат решения',{exact:true}).fill('Давление проверено, автомобиль готов.');
    await ap.getByRole('form',{name:'Отметить решённым',exact:true}).getByRole('button',{name:'Подтвердить',exact:true}).click();
    await ap.getByText('Обращение решено. Для продолжения водитель может открыть его повторно.',{exact:true}).waitFor();
    await dp.reload();await dp.locator('.driver-request-item').filter({hasText:ticket.subject}).click();
    await dp.getByRole('button',{name:'Открыть повторно',exact:true}).click();
    await dp.getByRole('form',{name:'Открыть повторно',exact:true}).getByRole('button',{name:'Подтвердить',exact:true}).click();
    await dp.getByLabel('Сообщение в обращение',{exact:true}).waitFor();
    const output=path.resolve(__dirname,'../.local/driver-requests-qa');await fs.mkdir(output,{recursive:true});
    await ap.screenshot({path:path.join(output,'requests-desktop.png'),fullPage:true});
    await dp.setViewportSize({width:390,height:844});
    assert.ok(await dp.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile layout fits screen');
    await dp.screenshot({path:path.join(output,'driver-mobile.png'),fullPage:true});
    assert.equal((await f.adminPool.query('SELECT count(*)::integer AS n FROM telegram_deliveries WHERE ticket_id=$1',[ticket.id])).rows[0].n,0);
    // More than one page arrives while the driver is already reading the thread.
    const empty=await api('POST','/communications/tickets',{idempotencyKey:randomUUID(),department:'transport',kind:'question',subject:'Проверка длинного диалога',scope:ticket.scope},driver);
    await dp.reload();await dp.locator('.driver-request-item').filter({hasText:empty.subject}).click();
    await dp.getByText('Напишите сообщение по обращению.',{exact:true}).waitFor();
    await f.adminPool.query(`INSERT INTO communications_messages(id,ticket_id,sender_id,department,content,sha256,origin,created_at)
      SELECT gen_random_uuid(),$1,$2,'transport','Поток ответа '||n,encode(digest('Поток ответа '||n,'sha256'),'hex'),'application',clock_timestamp()+n*interval '1 millisecond' FROM generate_series(1,105) n`,[empty.id,ids.admin]);
    await dp.bringToFront();await dp.getByRole('log').getByText('Поток ответа 105',{exact:true}).waitFor({timeout:25000});
    await dp.getByRole('button',{name:'Ранние сообщения',exact:true}).click();
    await dp.getByRole('log').getByText('Поток ответа 1',{exact:true}).waitFor();
    assert.equal(await dp.locator('.driver-request-message').count(),105);
    // Current permissions authoritatively remove cached queue items and an open thread.
    await ap.reload();await ap.getByRole('navigation',{name:'Разделы команды'}).getByRole('button',{name:'Запросы водителей',exact:true}).click();
    await ap.locator('.driver-request-item').filter({hasText:ticket.subject}).click();
    await ap.getByRole('log').getByText('Проверка закончена, можно выезжать.',{exact:true}).waitFor();
    await f.adminPool.query('UPDATE access_grants SET personal_data_visible=false WHERE user_id=$1',[ids.admin]);
    const revokedQueue=ap.waitForResponse(async response=>{
      const url=new URL(response.url());
      return response.status()===200 && url.pathname==='/api/v1/communications/driver-requests'
        && url.searchParams.get('responsibilityScopeId')===ticket.scope.responsibilityScopeId
        && (await response.json()).items.length===0;
    },{timeout:25000});
    await ap.bringToFront();await ap.getByRole('log').waitFor({state:'detached',timeout:25000});
    // The thread can lose access before the separately scheduled queue refresh finishes.
    await revokedQueue;
    await ap.waitForFunction(()=>document.querySelectorAll('.driver-request-item').length===0,{},{timeout:25000});
    assert.equal(await ap.locator('.driver-request-item').count(),0);
    assert.equal(await ap.getByLabel('Проект',{exact:true}).count(),0);
    const emptyQueue=await ap.locator('.driver-request-list').innerText();
    assert.ok(!emptyQueue.includes('выбранную область'),'Empty queue describes the unified workspace');
    assert.ok(emptyQueue.includes('из учётных записей водителей'));
    assert.ok(emptyQueue.includes('через раздел «Сотрудники»'));
    assert.deepEqual(errors,[]);
    console.log('PASS driver requests browser: creation, scoped staff queue, manual refresh preserves draft and selection, unified empty state, bidirectional polling, draft and idempotent retry, resolve/reopen, persistence, driver Team denial, no Telegram deliveries, mobile');
  } finally {if(browser)await browser.close();await f.close();}
})().catch(err=>{console.error(err.stack||err.message);process.exit(1);});
