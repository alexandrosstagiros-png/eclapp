'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createTestServer } = require('./local-test-server.cjs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async()=>{
  const f=await createTestServer({staffTeamActors: true, builtFrontend:process.env.TEAM_BUILT_FRONTEND==='true'});let browser;
  try {
    const admin=await f.devLogin(f.ids.admin), employee=await f.devLogin(f.ids.drivers[0]);
    const bytes=Buffer.from('Синтетический исходный документ\n\u0000\u0001');
    for(let index=1;index<=16;index++){
      const folderPath=index<=14?'Общая информация/Транспорт':index===15?'Общая информация/Рекрутинг':'Папка сотрудника';
      const filename=`Инструкция ${index}.docx`;
      const response=await f.request('POST','/team/articles/import',{responsibilityScopeIds:[f.ids.scope],visibility:'scope',sourcePath:`${folderPath}/${filename}`,folderPath,title:`Инструкция ${index}`,body:`Содержание документа ${index}.\n${index===13?'Уникальный поисковый термин: калибровка.':'Учебный материал.'}`,sourceArchive:'Синтетический архив.zip',file:{filename,mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',contentBase64:bytes.toString('base64')}},admin.accessToken);
      assert.ok([200,201].includes(response.status),`Import HTTP${response.status}`);
    }
    browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
    const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
    await context.addInitScript(value=>sessionStorage.setItem('ecl.session.v2',JSON.stringify({session:value})),{...employee,rememberedDevice:false});
    const page=await context.newPage(), errors=[];page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(15000);
    await page.goto(f.origin+'/?section=team');
    await page.getByRole('navigation',{name:'Разделы команды'}).getByRole('button',{name:'База знаний',exact:true}).click();
    const folder=page.getByLabel('Папка базы знаний',{exact:true});await folder.waitFor();
    await page.waitForFunction(()=>document.querySelectorAll('.team-knowledge-results .team-article-item').length===12);
    await folder.selectOption('Общая информация');
    await page.getByText('Найдено документов: 15',{exact:true}).waitFor();
    await folder.selectOption('Общая информация/Транспорт');
    await page.getByText('Найдено документов: 14',{exact:true}).waitFor();
    const titles=await page.locator('.team-knowledge-results .team-article-item strong').allTextContents();
    assert.deepEqual(titles,Array.from({length:12},(_,i)=>`Инструкция ${i+1}`));
    await page.getByRole('button',{name:'Следующая страница документов',exact:true}).click();
    assert.equal(await page.locator('.team-knowledge-results .team-article-item').count(),2);
    await page.getByLabel('Поиск по базе знаний',{exact:true}).fill('калибровка');
    await page.getByText('Найдено документов: 1',{exact:true}).waitFor();
    await page.locator('.team-knowledge-results .team-article-item').click();
    await page.getByRole('heading',{name:'Инструкция 13',exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Редактировать',exact:true}).count(),0);
    assert.equal(await page.locator('.team-document-source').count(),0);
    assert.equal(await page.getByRole('button',{name:/^Скачать оригинал/}).count(),0);
    const output=path.resolve(__dirname,'../.local/team-knowledge-qa');await fs.mkdir(output,{recursive:true});
    await page.screenshot({path:path.join(output,'knowledge-desktop.png'),fullPage:true});
    await page.getByLabel('Поиск по базе знаний',{exact:true}).fill('нет такого документа');
    assert.equal(await page.locator('.team-knowledge-results .team-article-item').count(),0);
    await page.getByLabel('Поиск по базе знаний',{exact:true}).fill('');await folder.selectOption('');
    await page.getByText('Найдено документов: 16',{exact:true}).waitFor();
    await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    assert.equal(await page.locator('.team-document-source').count(),0);
    assert.equal(await page.getByRole('button',{name:/^Скачать оригинал/}).count(),0);
    await page.screenshot({path:path.join(output,'knowledge-mobile.png'),fullPage:true});
    assert.deepEqual(errors,[]);
    console.log('PASS knowledge browser: nested folders, parent selection, natural sorting, pagination, full-text search, read-only imported policies, source block hidden, mobile');
  }finally{if(browser)await browser.close();await f.close();}
})().catch(error=>{console.error(error.stack||error.message);process.exitCode=1;});
