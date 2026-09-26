'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createTestServer } = require('./local-test-server.cjs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
  const f=await createTestServer({staffTeamActors:true,builtFrontend:process.env.TEAM_BUILT_FRONTEND==='true'});let browser;
  try {
    const {ids,request,devLogin}=f;
    const admin=await devLogin(ids.admin),staff=await devLogin(ids.drivers[0]),peer=await devLogin(ids.drivers[1]);
    const api=async(method,route,body,session=admin)=>{const r=await request(method,route,body,session.accessToken);assert.ok([200,201].includes(r.status),`${route}: ${r.status} ${JSON.stringify(r.body)}`);return r.body;};
    const conversation=await api('POST','/team/conversations',{id:randomUUID(),responsibilityScopeId:ids.scope,kind:'channel',title:'Совместная работа',memberIds:[]});
    const send=(text,session=staff,parentId=null)=>api('POST','/team/messages',{id:randomUUID(),responsibilityScopeId:ids.scope,conversationId:conversation.id,parentId,text},session);
    const first=await send('Первоначальное сообщение сотрудника');
    const second=await send('Сообщение другого участника',peer);
    await send('Ответ в ветке сохраняется',peer,first.id);
    browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
    const errors=[];
    async function pageFor(session) {
      const context=await browser.newContext({viewport:{width:1440,height:1000}});
      await context.addInitScript(value=>sessionStorage.setItem('ecl.session.v2',JSON.stringify({session:value})),{...session,rememberedDevice:false});
      const page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
      await page.goto(`${f.origin}/?section=team`);
      try { await page.getByText('Совместная работа',{exact:true}).first().click(); } catch(error) { console.error('Team startup:',JSON.stringify({pageErrors:errors,body:await page.locator('body').innerText()}));throw error; }
      return page;
    }
    const employee=await pageFor(staff),administrator=await pageFor(admin);
    const row=(page,id)=>page.locator(`[data-message-id="${id}"]`).first();
    async function messageAction(page,id,name) {
      await row(page,id).getByRole('button',{name:'Действия сообщения',exact:true}).click();
      await page.getByRole('menuitem',{name,exact:true}).click();
    }
    async function chatAction(page,name) {
      await page.getByRole('button',{name:'Действия чата',exact:true}).click();
      await page.getByRole('menuitem',{name,exact:true}).click();
    }
    async function assertMenuFits(page) {
      const menu=page.getByRole('menu');await menu.waitFor();
      const bounds=await menu.boundingBox(),viewport=page.viewportSize();
      assert.ok(bounds&&bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=viewport.width+1&&bounds.y+bounds.height<=viewport.height+1,`Menu must fit viewport: ${JSON.stringify({bounds,viewport})}`);
    }
    await employee.bringToFront();
    assert.equal(await employee.getByRole('menuitem').count(),0);
    assert.equal(await employee.getByRole('button',{name:'Редактировать сообщение',exact:true}).count(),0);
    assert.equal(await employee.getByRole('button',{name:'Удалить сообщение',exact:true}).count(),0);
    const peerMenu=row(employee,second.id).getByRole('button',{name:'Действия сообщения',exact:true});
    await peerMenu.click();await assertMenuFits(employee);
    assert.equal(await employee.getByRole('menuitem',{name:'Редактировать сообщение',exact:true}).count(),0);
    assert.equal(await employee.getByRole('menuitem',{name:'Удалить сообщение',exact:true}).count(),0);
    await employee.keyboard.press('Escape');await employee.getByRole('menu').waitFor({state:'hidden'});
    assert.equal(await peerMenu.evaluate(button=>button===document.activeElement),true);
    await peerMenu.click();await employee.getByLabel('Сообщение в чат',{exact:true}).click();await employee.getByRole('menu').waitFor({state:'hidden'});
    await messageAction(employee,second.id,`Открыть ветку: ${second.text.slice(0,60)}`);
    await employee.getByRole('complementary',{name:'Ветка обсуждения'}).waitFor();
    await employee.getByRole('button',{name:'Закрыть ветку',exact:true}).click();
    const chatMenu=employee.getByRole('button',{name:'Действия чата',exact:true});
    await chatMenu.click();await assertMenuFits(employee);
    await employee.getByRole('menuitem',{name:'Настройки уведомлений чата',exact:true}).waitFor();
    await employee.keyboard.press('Escape');await employee.getByRole('menu').waitFor({state:'hidden'});
    assert.equal(await chatMenu.evaluate(button=>button===document.activeElement),true);
    const ownMenu=row(employee,first.id).getByRole('button',{name:'Действия сообщения',exact:true});
    await ownMenu.click();const items=employee.getByRole('menuitem');
    await employee.keyboard.press('End');assert.equal(await items.last().evaluate(item=>item===document.activeElement),true);
    await employee.keyboard.press('Home');assert.equal(await items.first().evaluate(item=>item===document.activeElement),true);
    await employee.keyboard.press('ArrowDown');assert.equal(await items.nth(1).evaluate(item=>item===document.activeElement),true);
    await employee.keyboard.press('ArrowUp');assert.equal(await items.first().evaluate(item=>item===document.activeElement),true);
    await employee.keyboard.press('Tab');await employee.getByRole('menu').waitFor({state:'hidden'});
    await messageAction(employee,first.id,'Редактировать сообщение');
    let dialog=employee.getByRole('dialog',{name:'Редактировать сообщение',exact:true});
    await dialog.getByLabel('Текст сообщения',{exact:true}).fill('Исправленное сообщение сотрудника');
    await dialog.getByRole('button',{name:'Сохранить сообщение',exact:true}).click();
    await row(employee,first.id).getByText('Исправленное сообщение сотрудника',{exact:true}).waitFor();
    assert.equal(await row(employee,first.id).getByRole('button',{name:'Действия сообщения',exact:true}).evaluate(button=>button===document.activeElement),true);
    await administrator.bringToFront();
    await row(administrator,first.id).getByText('Исправленное сообщение сотрудника',{exact:true}).waitFor({timeout:25000});
    // Administrator can change another author's message.
    await messageAction(administrator,second.id,'Редактировать сообщение');
    dialog=administrator.getByRole('dialog',{name:'Редактировать сообщение',exact:true});
    await dialog.getByLabel('Текст сообщения',{exact:true}).fill('Уточнено администратором');
    await dialog.getByRole('button',{name:'Сохранить сообщение',exact:true}).click();
    await row(administrator,second.id).getByText('Уточнено администратором',{exact:true}).waitFor();
    await employee.bringToFront();
    await row(employee,second.id).getByText('Уточнено администратором',{exact:true}).waitFor({timeout:25000});
    await row(employee,second.id).getByRole('button',{name:'Добавить реакцию',exact:true}).click();
    await employee.getByRole('button',{name:'Поставить реакцию 👍',exact:true}).click();
    const reaction=row(employee,second.id).getByRole('button',{name:'Реакция 👍: 1',exact:true});await reaction.waitFor();assert.equal(await reaction.getAttribute('aria-pressed'),'true');
    await reaction.click();await reaction.waitFor({state:'detached'});
    await row(employee,second.id).getByRole('button',{name:'Добавить реакцию',exact:true}).click();await employee.getByRole('button',{name:'Поставить реакцию ❤️',exact:true}).click();
    await administrator.bringToFront();await row(administrator,second.id).getByRole('button',{name:'Реакция ❤️: 1',exact:true}).waitFor({timeout:25000});
    // Deleting a root leaves its branch reachable, while removing content and reactions.
    await messageAction(administrator,first.id,'Удалить сообщение');
    await administrator.getByRole('dialog',{name:'Удалить сообщение?',exact:true}).getByRole('button',{name:'Удалить сообщение',exact:true}).click();
    await row(administrator,first.id).getByText('Сообщение удалено администратором',{exact:true}).waitFor();
    await row(administrator,first.id).getByRole('button',{name:/Открыть ветку:/}).click();
    await administrator.getByRole('complementary',{name:'Ветка обсуждения'}).getByText('Ответ в ветке сохраняется',{exact:true}).waitFor();
    await administrator.getByRole('button',{name:'Закрыть ветку',exact:true}).click();
    await employee.bringToFront();await row(employee,first.id).getByText('Сообщение удалено администратором',{exact:true}).waitFor({timeout:25000});
    // Own deletion is available too.
    const own=await send('Сообщение для удаления автором');await employee.reload();await employee.getByText('Совместная работа',{exact:true}).first().click();
    await messageAction(employee,own.id,'Удалить сообщение');
    await employee.getByRole('dialog',{name:'Удалить сообщение?',exact:true}).getByRole('button',{name:'Удалить сообщение',exact:true}).click();
    await row(employee,own.id).getByText('Сообщение удалено',{exact:true}).waitFor();
    const recent=await send('Последнее сообщение перед ограничением');
    await administrator.bringToFront();await chatAction(administrator,'Антиконфликтный режим');
    await administrator.getByRole('dialog',{name:'Антиконфликтный режим',exact:true}).getByRole('button',{name:'Включить на 1 час',exact:true}).click();
    await administrator.locator('.team-moderation-banner').waitFor();
    await employee.bringToFront();await employee.locator('.team-moderation-banner').waitFor({timeout:25000});
    await employee.getByLabel('Сообщение в чат',{exact:true}).fill('Черновик остаётся до снятия ограничения');
    assert.equal(await employee.getByRole('button',{name:'Отправить',exact:true}).isEnabled(),false);
    const throttled=await request('POST','/team/messages',{id:randomUUID(),responsibilityScopeId:ids.scope,conversationId:conversation.id,parentId:null,text:'Обход кнопки запрещён'},staff.accessToken);assert.equal(throttled.status,429);
    await send('Администратор может писать без паузы',admin);
    await administrator.bringToFront();await chatAction(administrator,'Антиконфликтный режим');
    await administrator.getByRole('dialog',{name:'Антиконфликтный режим',exact:true}).getByRole('button',{name:'Отключить досрочно',exact:true}).click();
    await employee.bringToFront();await employee.locator('.team-moderation-banner').waitFor({state:'detached',timeout:25000});
    assert.equal(await employee.getByLabel('Сообщение в чат',{exact:true}).inputValue(),'Черновик остаётся до снятия ограничения');
    await employee.getByRole('button',{name:'Отправить',exact:true}).click();
    await employee.getByText('Черновик остаётся до снятия ограничения',{exact:true}).waitFor();
    const output=path.resolve(__dirname,'../.local/team-controls-qa');await fs.mkdir(output,{recursive:true});
    await administrator.bringToFront();await administrator.getByRole('button',{name:'Действия чата',exact:true}).click();await assertMenuFits(administrator);
    await administrator.screenshot({path:path.join(output,'chat-menu-desktop.png'),fullPage:false});
    await administrator.keyboard.press('Escape');
    await administrator.screenshot({path:path.join(output,'controls-desktop.png'),fullPage:true});
    await employee.bringToFront();
    await employee.setViewportSize({width:390,height:844});assert.ok(await employee.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await employee.getByRole('button',{name:'Действия чата',exact:true}).click();await assertMenuFits(employee);
    await employee.keyboard.press('Escape');await employee.getByRole('menu').waitFor({state:'hidden'});
    await row(employee,recent.id).getByRole('button',{name:'Действия сообщения',exact:true}).click();await assertMenuFits(employee);
    await employee.screenshot({path:path.join(output,'message-menu-mobile.png'),fullPage:false});
    await employee.getByLabel('Сообщение в чат',{exact:true}).click();await employee.getByRole('menu').waitFor({state:'hidden'});
    await employee.screenshot({path:path.join(output,'controls-mobile.png'),fullPage:true});
    assert.deepEqual(errors,[]);
    console.log('PASS controls browser: own/admin edit/delete, other-owner controls hidden, overflow keyboard/outside/focus/viewport, empty branch, live updates, reactions add/remove, deleted branch, hourly moderation and early disable, server throttle, draft preserved, mobile');
  }finally{if(browser)await browser.close();await f.close();}
})().catch(e=>{console.error(e.stack||e.message);process.exit(1);});
