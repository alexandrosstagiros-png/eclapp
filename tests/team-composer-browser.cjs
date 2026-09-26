'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createTestServer } = require('./local-test-server.cjs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async()=>{
  const f=await createTestServer({staffTeamActors: true, builtFrontend:process.env.TEAM_BUILT_FRONTEND==='true'});let browser;
  try {
    const session=await f.devLogin(f.ids.drivers[0]), recipient=await f.devLogin(f.ids.drivers[1]);
    const call=async(method,route,body,actor=session)=>{const r=await f.request(method,route,body,actor.accessToken);assert.ok([200,201].includes(r.status),`HTTP${r.status} ${route}: ${JSON.stringify(r.body)}`);return r.body;};
    const people=(await call('GET',`/team/people?responsibilityScopeId=${f.ids.scope}`)).people;
    const recipientLabel=people.find(person=>person.id===f.ids.drivers[1]).displayName;
    const channel=await call('POST','/team/conversations',{id:randomUUID(),responsibilityScopeId:f.ids.scope,kind:'channel',title:'Панель общения',memberIds:[]});
    await call('POST','/team/conversations',{id:randomUUID(),responsibilityScopeId:f.ids.scope,kind:'channel',title:'Другой чат',memberIds:[]});
    browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{}),args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']});
    const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
    await context.addInitScript(value=>sessionStorage.setItem('ecl.session.v2',JSON.stringify({session:value})),{...session,rememberedDevice:false});
    await context.addInitScript(()=>{
      window.__capturedStreams=[];
      const original=navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices);
      if(original)navigator.mediaDevices.getUserMedia=async constraints=>{const stream=await original(constraints);window.__capturedStreams.push(stream);return stream;};
      class SyntheticSpeechRecognition {
        start(){this.onstart?.();setTimeout(()=>{const item=[{transcript:'Проверка диктовки текста',confidence:1}];item.isFinal=true;this.onresult?.({resultIndex:0,results:[item]});},100);}
        stop(){this.onend?.();}abort(){this.onend?.();}
      }
      window.SpeechRecognition=SyntheticSpeechRecognition;
    });
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
    await page.goto(f.origin+'/?section=team');await page.getByText('Панель общения',{exact:true}).first().click();
    const composer=page.locator('form.team-composer').first(), editor=composer.getByLabel('Сообщение в чат',{exact:true});
    const toolbar=async name=>composer.getByRole('button',{name,exact:true}).click();
    for(const name of ['Добавить вложение','Форматирование текста','Добавить эмодзи','Упомянуть сотрудника','Записать видео','Голос и диктовка','Команды'])assert.equal(await composer.getByRole('button',{name,exact:true}).count(),1);
    await editor.fill('Важное сообщение');await editor.evaluate(element=>element.select());await toolbar('Форматирование текста');await composer.getByRole('button',{name:'Жирный',exact:true}).click();
    assert.match(await editor.inputValue(),/\*\*Важное сообщение\*\*/);
    await composer.getByRole('button',{name:'Отправить',exact:true}).click();
    await page.locator('.team-message-content strong').getByText('Важное сообщение',{exact:true}).waitFor();
    await editor.fill('');await toolbar('Добавить эмодзи');
    await composer.getByRole('button',{name:'Эмодзи 👍',exact:true}).click();assert.ok((await editor.inputValue()).includes('👍'));
    await editor.fill('/');await composer.getByRole('button',{name:/^\/task/}).click();assert.match(await editor.inputValue(),/Задача:/);
    await editor.fill('Проверка отметки ');await toolbar('Упомянуть сотрудника');
    await composer.getByRole('button').filter({hasText:recipientLabel}).click();
    assert.ok((await editor.inputValue()).includes(f.ids.drivers[1]));
    await composer.getByRole('button',{name:'Отправить',exact:true}).click();
    await page.waitForFunction(()=>document.querySelectorAll('.team-message').length>=2);
    const inbox=await call('GET',`/team/mentions?responsibilityScopeId=${f.ids.scope}`,undefined,recipient);assert.equal(inbox.unreadCount,1);
    await editor.fill('Коллеги');await toolbar('Упомянуть сотрудника');await composer.getByRole('button',{name:/Упомянуть всех/}).click();
    assert.match(await editor.inputValue(),/Коллеги @all/);await composer.getByRole('button',{name:'Отправить',exact:true}).click();
    await page.waitForFunction(()=>document.querySelectorAll('.team-message').length>=3);
    // The compression test uses an in-memory synthetic image, never personal photos.
    const photo=Buffer.from(await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=2200;canvas.height=1600;const ctx=canvas.getContext('2d'),pixels=ctx.createImageData(canvas.width,canvas.height);let seed=17;for(let i=0;i<pixels.data.length;i+=4){for(let j=0;j<3;j++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;pixels.data[i+j]=seed>>>24;}pixels.data[i+3]=255;}ctx.putImageData(pixels,0,0);return canvas.toDataURL('image/png').split(',')[1];}),'base64');
    await composer.getByLabel('Прикрепить файлы к сообщению',{exact:true}).setInputFiles({name:'Тестовое фото.png',mimeType:'image/png',buffer:photo});
    await composer.getByRole('button',{name:'Отправить',exact:true}).click();
    let detail=await call('GET',`/team/conversations/${channel.id}?responsibilityScopeId=${f.ids.scope}`);
    let imageFile=detail.messages.flatMap(m=>m.attachments).find(file=>file.kind==='image');assert.ok(imageFile);assert.equal(imageFile.mimeType,'image/jpeg');assert.ok(imageFile.byteSize<photo.length);
    await page.getByRole('button',{name:`Открыть ${imageFile.filename}`,exact:true}).click();
    await page.waitForFunction(()=>[...document.querySelectorAll('.team-message img')].some(img=>img.complete && img.naturalWidth>0));
    const dimensions=await page.locator('.team-message img').first().evaluate(img=>({width:img.naturalWidth,height:img.naturalHeight}));assert.ok(Math.max(dimensions.width,dimensions.height)<=1920);
    await composer.getByLabel('Прикрепить файлы без сжатия к сообщению',{exact:true}).setInputFiles({name:'Оригинал.png',mimeType:'image/png',buffer:photo});
    await composer.getByRole('button',{name:'Отправить',exact:true}).click();
    await page.getByRole('button',{name:'Скачать Оригинал.png',exact:true}).waitFor();
    detail=await call('GET',`/team/conversations/${channel.id}?responsibilityScopeId=${f.ids.scope}`);
    const original=detail.messages.flatMap(m=>m.attachments).find(file=>file.filename==='Оригинал.png');assert.ok(!original.kind || original.kind==='file');assert.equal(original.byteSize,photo.length);
    const downloaded=await fetch(`${f.origin}/api/v1/team/attachments/${original.id}?responsibilityScopeId=${f.ids.scope}`,{headers:{Authorization:`Bearer ${session.accessToken}`}});assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()),photo);
    const record=async(mode,menu,kind)=>{
      await toolbar(mode==='voice'?'Голос и диктовка':'Записать видео');await composer.getByRole('button',{name:menu,exact:true}).click();
      const dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'Начать запись',exact:true}).click();
      await dialog.getByRole('button',{name:/^Остановить/}).waitFor();
      await page.waitForTimeout(1500);await dialog.getByRole('button',{name:/^Остановить/}).click();
      await dialog.getByRole('button',{name:'Прикрепить запись',exact:true}).click();
      await page.waitForFunction(()=>window.__capturedStreams.every(stream=>stream.getTracks().every(track=>track.readyState==='ended')));
      await composer.getByRole('button',{name:'Отправить',exact:true}).click();
      await page.waitForFunction(()=>!document.querySelector('.team-draft-files'));
      const data=await call('GET',`/team/conversations/${channel.id}?responsibilityScopeId=${f.ids.scope}`), file=data.messages.flatMap(m=>m.attachments).find(file=>file.kind===kind);
      assert.ok(file,`${kind} saved`);assert.ok(file.byteSize>0 && file.byteSize<8*1024*1024);
      await page.getByRole('button',{name:`Открыть ${file.filename}`,exact:true}).click();
      const media=page.locator(kind==='audio'?'.team-message audio':'.team-message video').last();await media.waitFor();
      await media.evaluate(element=>{if(element.readyState>=1)return;return new Promise((resolve,reject)=>{element.addEventListener('loadedmetadata',resolve,{once:true});element.addEventListener('error',()=>reject(new Error('Media decode failed')),{once:true});});});
    };
    await record('voice','Голосовое сообщение','audio');await record('video','Видеосообщение','video');await record('round','Круглое видео','round');
    await toolbar('Голос и диктовка');await composer.getByRole('button',{name:'Диктовка в текст',exact:true}).click();
    let dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'Начать диктовку',exact:true}).click();
    await dialog.getByText('Проверка диктовки текста',{exact:true}).waitFor();
    await dialog.getByRole('button',{name:/^Остановить/}).click();await dialog.getByRole('button',{name:'Вставить текст',exact:true}).click();assert.ok((await editor.inputValue()).includes('Проверка диктовки текста'));
    // Navigating to another chat cancels recording and must never attach to it.
    await toolbar('Записать видео');await composer.getByRole('button',{name:'Видеосообщение',exact:true}).click();dialog=page.getByRole('dialog');
    await dialog.getByRole('button',{name:'Начать запись',exact:true}).click();await dialog.getByRole('button',{name:/^Остановить/}).waitFor();
    await dialog.getByRole('button',{name:'Закрыть',exact:true}).click();await page.waitForFunction(()=>window.__capturedStreams.every(stream=>stream.getTracks().every(track=>track.readyState==='ended')));
    // A permission request can resolve after the person has closed the dialog.
    await page.evaluate(()=>{window.__regularCapture=navigator.mediaDevices.getUserMedia;navigator.mediaDevices.getUserMedia=constraints=>new Promise(resolve=>{window.__releaseCapture=async()=>resolve(await window.__regularCapture(constraints));});});
    await toolbar('Записать видео');await composer.getByRole('button',{name:'Видеосообщение',exact:true}).click();dialog=page.getByRole('dialog');
    await dialog.getByRole('button',{name:'Начать запись',exact:true}).click();await page.waitForFunction(()=>Boolean(window.__releaseCapture));
    await dialog.getByRole('button',{name:'Закрыть',exact:true}).click();await page.evaluate(()=>window.__releaseCapture());
    await page.waitForFunction(()=>window.__capturedStreams.every(stream=>stream.getTracks().every(track=>track.readyState==='ended')));
    await page.evaluate(()=>{navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('Synthetic denial','NotAllowedError');};});
    await toolbar('Голос и диктовка');await composer.getByRole('button',{name:'Голосовое сообщение',exact:true}).click();dialog=page.getByRole('dialog');
    await dialog.getByRole('button',{name:'Начать запись',exact:true}).click();await dialog.getByRole('alert').waitFor();
    await dialog.getByRole('button',{name:'Закрыть',exact:true}).click();await page.evaluate(()=>{navigator.mediaDevices.getUserMedia=window.__regularCapture;});
    const output=path.resolve(__dirname,'../.local/team-composer-qa');await fs.mkdir(output,{recursive:true});
    await page.screenshot({path:path.join(output,'composer-desktop.png'),fullPage:true});
    await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:path.join(output,'composer-mobile.png'),fullPage:true});assert.deepEqual(errors,[]);
    const recipientContext=await browser.newContext({viewport:{width:1440,height:1000}});
    await recipientContext.addInitScript(value=>sessionStorage.setItem('ecl.session.v2',JSON.stringify({session:value})),{...recipient,rememberedDevice:false});
    const recipientPage=await recipientContext.newPage();recipientPage.on('pageerror',error=>errors.push(error.message));
    await recipientPage.goto(f.origin+'/?section=team');await recipientPage.getByRole('button',{name:'Упоминания · 2',exact:true}).click();
    await recipientPage.getByRole('button',{name:/^Открыть упоминание:/}).first().click();
    await recipientPage.getByRole('heading',{name:'Сообщение с упоминанием',exact:true}).waitFor();
    // Read receipts are now sent only after the message is actually visible.
    await recipientPage.getByRole('dialog').locator('.team-message').last().scrollIntoViewIfNeeded();
    await recipientPage.getByRole('button',{name:'Упоминания · 1',exact:true}).waitFor();
    assert.equal((await call('GET',`/team/mentions?responsibilityScopeId=${f.ids.scope}`,undefined,recipient)).unreadCount,1);
    await recipientPage.reload();await recipientPage.getByRole('button',{name:'Упоминания · 1',exact:true}).waitFor();assert.deepEqual(errors,[]);
    console.log('PASS composer: formatting, emoji, slash commands, individual/all mentions, compressed photo vs exact original, real fake-device voice/video/round recording and playback, dictation event flow, capture cleanup, mobile');
  }finally{if(browser)await browser.close();await f.close();}
})().catch(error=>{console.error(error.stack||error.message);process.exit(1);});
