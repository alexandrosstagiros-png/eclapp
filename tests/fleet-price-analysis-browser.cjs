'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createRequire } = require('node:module');
const { createTestServer } = require('./local-test-server.cjs');
const root = path.resolve(__dirname, '..');
const appRequire = createRequire(path.join(root, 'recovered/package.json'));
const { build } = appRequire('esbuild');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const fixture = await createTestServer(); let browser;
  try {
    const { ids, adminPool: db, devLogin } = fixture;
    await db.query('UPDATE access_grants SET finance_visible=true WHERE user_id=$1', [ids.admin]);
    const peer = randomUUID(), dataset = randomUUID();
    await db.query('INSERT INTO responsibility_scopes(id,project_id,name) VALUES($1,$2,$3)', [peer, ids.project, 'Пустая область']);
    await db.query('INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id,finance_visible) VALUES($1,$2,$3,$4,$5,true)', [ids.admin, ids.legal, ids.region, ids.project, peer]);
    const rows = ['one', 'two', 'three', 'target'].map(orderId => ({ orderId, orderNumber: orderId, sourceRow: orderId, name: 'Фильтр',
      positionType: 'запчасть', vehicleBrand: 'ГАЗ', vehicleGroup: 'Газель', partBrand: '', quantity: 1, unit: 'шт.',
      amountCents: orderId === 'target' ? 20000 : 10000, unitPriceCents: 10000, ownWorkReported: false, status: 'Финиш',
      openedOn: orderId === 'target' ? '2026-03-01' : '2026-01-01', completedOn: orderId === 'target' ? '2026-03-02' : '2026-01-02' }));
    await db.query(`INSERT INTO fleet_maintenance_datasets(id,legal_entity_id,region_id,project_id,responsibility_scope_id,file_name,file_hash,row_count,metadata,payload,created_by)
      VALUES($1,$2,$3,$4,$5,'browser.csv',$6,4,'{}',$7::jsonb,$8)`, [dataset, ids.legal, ids.region, ids.project, ids.scope, 'b'.repeat(64), JSON.stringify({ rows }), ids.admin]);
    await db.query(`INSERT INTO fleet_maintenance_state(legal_entity_id,region_id,project_id,responsibility_scope_id,active_dataset_id,version,updated_by)
      VALUES($1,$2,$3,$4,$5,1,$6)`, [ids.legal, ids.region, ids.project, ids.scope, dataset, ids.admin]);
    const session = await devLogin(ids.admin);
    const entry = `import React from './recovered/node_modules/react/index.js';
      import {createRoot} from './recovered/node_modules/react-dom/client.js';
      import {createWorkOrderPriceAnalysis} from './recovered/apps/office-web/src/fleet-maintenance.js';
      const request=async(p,o={},t)=>{const r=await fetch('/api/v1'+p,{...o,headers:{'Content-Type':'application/json',Authorization:'Bearer '+t}});const b=await r.json();if(!r.ok)throw Object.assign(new Error(b.message||'Request failed'),{status:r.status});return b;};
      const C=createWorkOrderPriceAnalysis(React,{request});const root=createRoot(document.getElementById('root'));
      root.render(React.createElement(C,{token:window.fixtureSession.accessToken,actor:window.fixtureSession.actor,onExpired:()=>{window.expired=true;}}));`;
    const bundle = (await build({ stdin: { contents: entry, resolveDir: root, sourcefile: 'fleet-price-analysis-entry.js' }, write: false, bundle: true, format: 'iife', platform: 'browser' })).outputFiles[0].text;
    const css = await fs.readFile(path.join(root, 'recovered/apps/office-web/src/assets/fleet-maintenance.css'), 'utf8');
    browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.addInitScript(value => { window.fixtureSession = value; }, session);
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/price-analysis-test', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:16px;font:14px Arial,sans-serif}.button{padding:12px} ${css}</style><div id="root"></div><script src="/price-analysis-test.js"></script></html>` }));
    await page.route('**/price-analysis-test.js', route => route.fulfill({ contentType: 'text/javascript', body: bundle }));
    await page.goto(`${fixture.origin}/price-analysis-test`);
    await page.getByLabel('Заказ-наряд для анализа', { exact: true }).selectOption('target');
    await page.getByRole('button', { name: 'Проверить адекватность цен', exact: true }).click();
    await page.getByText('Выше истории', { exact: true }).waitFor();
    await page.getByText(/Выполнено локальное сравнение, без расхода токенов/).waitFor();
    await page.getByText('Примеры из истории (3)', { exact: true }).click();
    assert.equal(await page.locator('details ul li').count(), 3);
    await page.getByLabel('Заказ-наряд для анализа', { exact: true }).selectOption('one');
    assert.equal(await page.getByText('Выше истории', { exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Проверить адекватность цен', exact: true }).click();
    await page.getByText('Недостаточно данных', { exact: true }).waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.getByLabel('Область автопарка', { exact: true }).selectOption(peer);
    await page.getByRole('option', { name: 'Заказ-наряды не найдены', exact: true }).waitFor({ state: 'attached' });
    assert.equal(await page.getByRole('button', { name: 'Проверить адекватность цен', exact: true }).isEnabled(), false);
    await page.getByLabel('Область автопарка', { exact: true }).selectOption(ids.scope);
    await page.getByLabel('Заказ-наряд для анализа', { exact: true }).selectOption('target');
    await db.query('UPDATE access_grants SET finance_visible=false WHERE user_id=$1', [ids.admin]);
    await page.getByRole('button', { name: 'Проверить адекватность цен', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: /Нет доступа/ }).waitFor();
    assert.equal(await page.getByText('Выше истории', { exact: true }).count(), 0);
    assert.deepEqual(errors, []);
    console.log('Fleet price analysis browser passed: real HTTP result, history evidence, order/scope changes, mobile layout, revoked finance.');
  } finally { await browser?.close(); await fixture.close(); }
})().catch(error => { console.error(error); process.exit(1); });
