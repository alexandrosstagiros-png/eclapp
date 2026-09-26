'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {createTestServer}=require('./local-test-server.cjs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
  const f=await createTestServer({staffTeamActors:true,builtFrontend:process.env.TEAM_BUILT_FRONTEND==='true'});let browser;
  try{
    const {ids,devLogin,request}=f;
    await f.adminPool.query("UPDATE access_grants SET personal_data_visible=true");
    await f.adminPool.query("UPDATE users SET display_name=CASE id WHEN $1 THEN 'Автор закрытого чата' WHEN $2 THEN 'Первый участник' WHEN $3 THEN 'Новый участник' ELSE display_name END WHERE id=ANY($4::uuid[])",[ids.drivers[0],ids.drivers[1],ids.mechanic,[ids.drivers[0],ids.drivers[1],ids.mechanic]]);
    const admin=await devLogin(ids.admin),owner=await devLogin(ids.drivers[0]),peer=await devLogin(ids.drivers[1]),outsider=await devLogin(ids.mechanic);
    const api=async(method,route,body,session=admin)=>{const r=await request(method,route,body,session.accessToken);assert.ok([200,201].includes(r.status),`${method} ${route}: ${r.status} ${JSON.stringify(r.body)}`);return r.body;};
    const scoped=route=>`${route}?responsibilityScopeId=${ids.scope}`;
    await api('POST','/team/conversations',{id:randomUUID(),responsibilityScopeId:ids.scope,kind:'channel',title:'Открытая работа',memberIds:[]});
    browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
    const errors=[];
    async function pageFor(session){
      const context=await browser.newContext({viewport:{width:1440,height:1000}});
      await context.addInitScript(value=>sessionStorage.setItem('ecl.session.v2',JSON.stringify({session:value})),{...session,rememberedDevice:false});
      const page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',err=>errors.push(err.message));
      await page.goto(`${f.origin}/?section=team`);await page.getByRole('heading',{name:'Команда',exact:true}).waitFor();return page;
    }
    async function openChatAccess(page) {
      await page.getByRole('button',{name:'Действия чата',exact:true}).click();
      await page.getByRole('menuitem',{name:'Доступ к чату',exact:true}).click();
    }
    const ad=await pageFor(admin);
    await ad.getByRole('button',{name:'Создать канал',exact:true}).first().click();
    let dialog=ad.getByRole('dialog',{name:'Новый канал',exact:true});
    await dialog.getByLabel('Название канала',{exact:true}).fill('Закрытый проект');
    await dialog.getByRole('checkbox',{name:'Закрытый канал',exact:true}).check();
    const group=dialog.getByRole('group',{name:'Участники закрытого чата',exact:true});
    await group.getByRole('checkbox',{name:'Администратор доступа',exact:true}).uncheck();
    await group.getByRole('checkbox',{name:'Автор закрытого чата',exact:true}).check();
    await group.getByRole('checkbox',{name:'Первый участник',exact:true}).check();
    await dialog.getByRole('button',{name:'Создать канал',exact:true}).click();
    await dialog.waitFor({state:'detached'});
    const a=await pageFor(owner);
    await a.getByText('Закрытый проект',{exact:true}).first().click();
    await a.getByLabel('Сообщение в чат',{exact:true}).fill('Закрытая задача по проекту');
    await a.getByRole('button',{name:'Отправить',exact:true}).click();
    await a.getByLabel('Переписка',{exact:true}).getByText('Закрытая задача по проекту',{exact:true}).waitFor();
    const privateChat=(await api('GET',scoped('/team/conversations'),undefined,owner)).conversations.find(item=>item.title==='Закрытый проект');
    assert.equal(privateChat.visibility,'private');assert.deepEqual([...privateChat.memberIds].sort(),[ids.drivers[0],ids.drivers[1]].sort());
    const p=await pageFor(peer),o=await pageFor(outsider);
    await p.getByText('Закрытый проект',{exact:true}).first().click();await p.getByLabel('Переписка',{exact:true}).getByText('Закрытая задача по проекту',{exact:true}).waitFor();
    await o.getByText('Открытая работа',{exact:true}).first().waitFor();
    assert.equal(await o.getByText('Закрытый проект',{exact:true}).count(),0);
    assert.equal((await request('GET',scoped(`/team/conversations/${privateChat.id}`),undefined,outsider.accessToken)).status,404);
    // Original administrator oversight still applies, without posting as a member.
    await ad.getByText('Закрытый проект',{exact:true}).first().click();await ad.getByLabel('Переписка',{exact:true}).getByText('Закрытая задача по проекту',{exact:true}).waitFor();
    assert.equal(await ad.getByLabel('Сообщение в чат',{exact:true}).count(),0);
    await ad.bringToFront();await openChatAccess(ad);
    dialog=ad.getByRole('dialog',{name:'Доступ к чату',exact:true});
    await dialog.getByRole('group',{name:'Участники закрытого чата',exact:true}).getByRole('checkbox',{name:'Первый участник',exact:true}).uncheck();
    await dialog.getByRole('group',{name:'Участники закрытого чата',exact:true}).getByRole('checkbox',{name:'Новый участник',exact:true}).check();
    await dialog.getByRole('button',{name:'Сохранить доступ',exact:true}).click();
    await dialog.waitFor({state:'detached'});
    await p.bringToFront();await p.getByLabel('Переписка',{exact:true}).getByText('Закрытая задача по проекту',{exact:true}).waitFor({state:'detached',timeout:25000});
    assert.equal(await p.getByText('Закрытый проект',{exact:true}).count(),0);
    assert.equal((await request('GET',scoped(`/team/conversations/${privateChat.id}`),undefined,peer.accessToken)).status,404);
    await o.bringToFront();await o.getByText('Закрытый проект',{exact:true}).first().waitFor({timeout:25000});
    await o.getByText('Закрытый проект',{exact:true}).first().click();await o.getByLabel('Переписка',{exact:true}).getByText('Закрытая задача по проекту',{exact:true}).waitFor();
    await o.getByRole('button',{name:'Действия чата',exact:true}).click();
    assert.equal(await o.getByRole('menuitem',{name:'Доступ к чату',exact:true}).count(),0);
    await o.keyboard.press('Escape');
    // Make an existing private channel public, then close it again.
    await ad.bringToFront();await openChatAccess(ad);
    dialog=ad.getByRole('dialog',{name:'Доступ к чату',exact:true});await dialog.getByRole('checkbox',{name:'Закрытый канал',exact:true}).uncheck();await dialog.getByRole('button',{name:'Сохранить доступ',exact:true}).click();await dialog.waitFor({state:'detached'});
    await p.bringToFront();await p.getByText('Закрытый проект',{exact:true}).first().waitFor({timeout:25000});
    await p.getByText('Закрытый проект',{exact:true}).first().click();await p.getByLabel('Переписка',{exact:true}).getByText('Закрытая задача по проекту',{exact:true}).waitFor();
    await ad.bringToFront();await openChatAccess(ad);
    dialog=ad.getByRole('dialog',{name:'Доступ к чату',exact:true});await dialog.getByRole('checkbox',{name:'Закрытый канал',exact:true}).check();
    await dialog.getByRole('group',{name:'Участники закрытого чата',exact:true}).getByRole('checkbox',{name:'Автор закрытого чата',exact:true}).check();
    await dialog.getByRole('group',{name:'Участники закрытого чата',exact:true}).getByRole('checkbox',{name:'Новый участник',exact:true}).check();
    await dialog.getByRole('button',{name:'Сохранить доступ',exact:true}).click();await dialog.waitFor({state:'detached'});
    await p.bringToFront();await p.getByLabel('Переписка',{exact:true}).getByText('Закрытая задача по проекту',{exact:true}).waitFor({state:'detached',timeout:25000});
    await a.reload();await a.getByText('Закрытый проект',{exact:true}).first().click();await a.getByLabel('Переписка',{exact:true}).getByText('Закрытая задача по проекту',{exact:true}).waitFor();
    const result=await api('PUT',`/team/conversations/${privateChat.id}/moderation`,{responsibilityScopeId:ids.scope,operationId:randomUUID(),enabled:true});
    assert.equal(result.intervalSeconds,300);
    await a.bringToFront();await a.locator('.team-moderation-banner').filter({hasText:'5 минут'}).waitFor({timeout:25000});
    const output=path.resolve(__dirname,'../.local/team-private-channels-qa');await fs.mkdir(output,{recursive:true});
    await ad.bringToFront();await openChatAccess(ad);await ad.screenshot({path:path.join(output,'access-desktop.png'),fullPage:true});
    await ad.getByRole('dialog',{name:'Доступ к чату',exact:true}).getByRole('button',{name:'Закрыть',exact:true}).click();
    await a.setViewportSize({width:390,height:844});assert.ok(await a.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await a.screenshot({path:path.join(output,'private-mobile.png'),fullPage:true});
    assert.deepEqual(errors,[]);
    console.log('PASS private channels browser: administrator-selected membership, hidden from others, administrator oversight, change members with cache revocation, public/private conversion, reload, five-minute mode, mobile');
  }finally{if(browser)await browser.close();await f.close();}
})().catch(err=>{console.error(err.stack||err.message);process.exitCode=1;});
