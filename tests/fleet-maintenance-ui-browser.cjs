"use strict";
// Isolated native React workspace against the real HTTP API and disposable PostgreSQL.
// No requests to production. Synthetic workbook rows and staff exist only in this fixture.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { createRequire } = require("node:module");
const { createTestServer } = require("./local-test-server.cjs");
const root = path.resolve(__dirname, "..");
const appRequire = createRequire(path.join(root, "recovered/package.json"));
const { build } = appRequire("esbuild");
const ExcelJS = appRequire("exceljs");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

async function workbook(count = 205, amount = 20) {
  const book = new ExcelJS.Workbook(),
    sheet = book.addWorksheet("Позиции");
  sheet.addRow([
    "ЗН_id",
    "Номер ЗН",
    "Дата открытия",
    "Месяц открытия",
    "Госномер",
    "Бренд ТС",
    "Марка",
    "Год",
    "Тип ТС",
    "Пробег, км",
    "Тип позиции",
    "Группа",
    "Узел",
    "Наименование",
    "Бренд",
    "Кол-во",
    "Ед.",
    "Цена за ед., ₽",
    "Сумма, ₽",
    "Долив (не замена)",
    "Шины",
    "Подрядчик",
    "Своими силами",
    "Статус ЗН",
    "Дата завершения",
    "Месяц завершения",
    "Группа (авто)",
    "Узел (авто)",
  ]);
  for (let i = 0; i < count; i++)
    sheet.addRow([
      i + 1,
      `QA-${i + 1}`,
      new Date("2026-01-01T00:00:00Z"),
      "2026-01",
      i % 2 ? "В222ВВ777" : "А111АА777",
      "ГАЗ",
      "Тестовый парк",
      2021,
      "Грузовой",
      10000 + i,
      i % 2 ? "работа" : "запчасть",
      i % 3 ? "ТО" : "Подвеска",
      "Фильтры",
      `Позиция ${i % 4}`,
      "",
      1,
      "шт.",
      amount,
      amount,
      false,
      false,
      i % 2 ? "Тестовый сервис" : "",
      false,
      "Финиш",
      new Date(i < 120 ? "2026-01-02T00:00:00Z" : "2026-02-03T00:00:00Z"),
      i < 120 ? "2026-01" : "2026-02",
      "ТО",
      "Фильтры",
    ]);
  const rec = book.addWorksheet("Сверка с Ремонтами");
  rec.addRow(["Сверка"]);
  rec.addRow([
    "Госномер",
    "Месяц",
    "Марка",
    "Заказ-наряды",
    "Ремонты",
    "Разница",
    "Комментарий",
    "ЗН",
  ]);
  return Buffer.from(await book.xlsx.writeBuffer());
}

(async () => {
  const fixture = await createTestServer(),
    output = path.join(root, ".local/fleet-ui-qa");
  let browser;
  try {
    await fs.mkdir(output, { recursive: true });
    await fixture.adminPool.query(
      "UPDATE access_grants SET finance_visible=true WHERE user_id=$1",
      [fixture.ids.admin],
    );
    const peer = randomUUID(),
      auditorId = randomUUID();
    await fixture.adminPool.query(
      "INSERT INTO responsibility_scopes(id,project_id,name) VALUES($1,$2,$3)",
      [peer, fixture.ids.project, "Я — пустая область теста"],
    );
    await fixture.adminPool.query(
      "INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id,finance_visible) VALUES($1,$2,$3,$4,$5,true)",
      [
        fixture.ids.admin,
        fixture.ids.legal,
        fixture.ids.region,
        fixture.ids.project,
        peer,
      ],
    );
    await fixture.adminPool.query(
      "INSERT INTO users(id,display_name,role,active,approved) VALUES($1,'Синтетический аудитор','auditor',true,true)",
      [auditorId],
    );
    await fixture.adminPool.query(
      "INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id,finance_visible) VALUES($1,$2,$3,$4,$5,true)",
      [
        auditorId,
        fixture.ids.legal,
        fixture.ids.region,
        fixture.ids.project,
        fixture.ids.scope,
      ],
    );
    const admin = await fixture.devLogin(fixture.ids.admin),
      auditor = await fixture.devLogin(auditorId);
    const entry = `import React from './recovered/node_modules/react/index.js';
      import {createRoot} from './recovered/node_modules/react-dom/client.js';
      import {createFleetMaintenanceWorkspace} from './recovered/apps/office-web/src/fleet-maintenance.js';
      import {createFleetOperationsWorkspace} from './recovered/apps/office-web/src/fleet-operations.js';
      const authenticatedFetch=(p,o={},t)=>fetch('/api/v1'+p,{...o,headers:{...(o.body&&!(o.body instanceof FormData)?{'Content-Type':'application/json'}:{}),...o.headers,Authorization:'Bearer '+t}});
      const request=async(p,o,t)=>{const r=await authenticatedFetch(p,o,t);const b=await r.json();if(!r.ok)throw Object.assign(new Error(b.message||'Request failed'),{status:r.status});return b};
      const OperationsWorkspace=createFleetOperationsWorkspace(React,{request});
      const C=createFleetMaintenanceWorkspace(React,{request,authenticatedFetch,OperationsWorkspace});const root=createRoot(document.getElementById('root'));
      window.mountFleet=s=>root.render(React.createElement(C,{token:s.accessToken,actor:s.actor,onExpired:()=>{window.expired=true}}));window.mountFleet(window.fixtureSession);`;
    const bundle = (
      await build({
        stdin: {
          contents: entry,
          resolveDir: root,
          sourcefile: "fleet-ui-test-entry.js",
        },
        write: false,
        bundle: true,
        format: "iife",
        platform: "browser",
      })
    ).outputFiles[0].text;
    const css = (
      await Promise.all(
        ["fleet-maintenance.css", "fleet-operations.css"].map((file) =>
          fs.readFile(
            path.join(root, "recovered/apps/office-web/src/assets", file),
            "utf8",
          ),
        ),
      )
    ).join("\n");
    browser = await chromium.launch({
      headless: true,
      executablePath:
        process.env.CHROME_PATH ||
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      acceptDownloads: true,
    });
    await context.addInitScript((session) => {
      window.fixtureSession = session;
    }, admin);
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/fleet-ui-test", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#f5f7fa;font:14px Arial,sans-serif}.button{border:1px solid #dce2e9;border-radius:8px;background:white;color:#172235;padding:9px 13px} ${css}</style><div id="root"></div><script src="/fleet-ui-test.js"></script></html>`,
      }),
    );
    await page.route("**/fleet-ui-test.js", (route) =>
      route.fulfill({ contentType: "text/javascript", body: bundle }),
    );
    await page.goto(`${fixture.origin}/fleet-ui-test`);
    assert.equal(await page.getByLabel("Проект", { exact: true }).count(), 0);
    await page
      .getByRole("heading", { name: "Добавьте первый источник" })
      .waitFor();
    await page
      .getByRole("button", { name: "Загрузить файл", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Загрузка исходных позиций",
    });
    await dialog
      .locator("input[type=file]")
      .setInputFiles({
        name: "synthetic-fleet-ui.xlsx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        buffer: await workbook(),
      });
    await dialog
      .getByRole("button", { name: "Проверить файл", exact: true })
      .click();
    await dialog
      .getByRole("button", { name: "Заменить активный снимок", exact: true })
      .waitFor();
    const before = await fixture.request(
      "GET",
      `/fleet-maintenance?responsibilityScopeId=${fixture.ids.scope}`,
      undefined,
      admin.accessToken,
    );
    assert.equal(before.body.dataset, null);
    await dialog
      .getByRole("button", { name: "Заменить активный снимок", exact: true })
      .click();
    await dialog.waitFor({ state: "hidden" });
    await page.locator(".fleet-kpi.is-primary").waitFor();
    assert.match(
      (await page.locator(".fleet-kpi.is-primary").innerText()).replace(
        /\s/g,
        "",
      ),
      /4100,00/,
    );
    console.log(
      "PASS preview does not activate; explicit commit updates complete server totals",
    );
    await page.screenshot({
      path: path.join(output, "overview-desktop.png"),
      fullPage: true,
    });
    const [presentation] = await Promise.all([
      page.waitForEvent("download"),
      page
        .getByRole("button", { name: "Презентация PPTX", exact: true })
        .click(),
    ]);
    const pptxPath = path.join(output, "filtered-report.pptx");
    await presentation.saveAs(pptxPath);
    const pptx = await fs.readFile(pptxPath);
    assert.equal(pptx.subarray(0, 2).toString(), "PK");
    assert.ok(pptx.length > 10000);
    console.log(
      "PASS presentation download uses the real report.pptx endpoint",
    );

    await page
      .getByRole("navigation", { name: "Разделы обслуживания" })
      .getByRole("button", { name: "Позиции", exact: true })
      .click();
    await page.locator(".fleet-positions-table tbody tr").first().waitFor();
    assert.equal(
      await page.locator(".fleet-positions-table tbody tr").count(),
      50,
    );
    await page.getByRole("button", { name: "Далее", exact: true }).click();
    await page.getByText("Страница 2 из 5", { exact: true }).waitFor();
    assert.match(
      await page.locator(".fleet-positions-table caption").innerText(),
      /Суммы и повторы/,
    );
    const [csv] = await Promise.all([
      page.waitForEvent("download"),
      page
        .getByRole("button", { name: "Выгрузить все строки CSV", exact: true })
        .click(),
    ]);
    const csvPath = path.join(output, "full-filtered.csv");
    await csv.saveAs(csvPath);
    assert.equal(
      (await fs.readFile(csvPath, "utf8")).trim().split("\r\n").length,
      206,
    );
    console.log(
      "PASS pagination limits only visible details; CSV contains all 205 source rows",
    );

    await page
      .getByRole("navigation", { name: "Разделы обслуживания" })
      .getByRole("button", { name: "Обзор", exact: true })
      .click();
    await page
      .locator(".fleet-segment")
      .getByRole("button", { name: "Позиции", exact: true })
      .click();
    await page
      .locator(".fleet-rank-wrap")
      .getByRole("button", { name: "Позиция 0", exact: true })
      .click();
    await page.getByText(/52 строк · итог/).waitFor();
    assert.equal(
      await page.locator(".fleet-positions-table tbody tr").count(),
      50,
    );
    await page
      .getByRole("button", { name: "Сбросить фильтры", exact: true })
      .click();
    await page.getByText(/205 строк · итог/).waitFor();
    console.log(
      "PASS position ranking drills to exact name and type, preserving full totals",
    );

    await page
      .getByRole("navigation", { name: "Разделы обслуживания" })
      .getByRole("button", { name: "Качество данных", exact: true })
      .click();
    await page.locator(".fleet-quality-item").first().waitFor();
    await page
      .locator(".fleet-quality-item")
      .filter({ hasText: "Подрядчик" })
      .getByRole("button", { name: "Показать позиции" })
      .click();
    await page.getByText(/103 строк · итог/).waitFor();
    await page
      .getByRole("button", { name: "Сбросить фильтры", exact: true })
      .click();
    console.log(
      "PASS issue drill selects affected source rows without altering them",
    );

    await page
      .getByRole("navigation", { name: "Разделы обслуживания" })
      .getByRole("button", { name: "Сверка", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Подтверждённые связи автомобилей" })
      .waitFor();
    await page
      .getByLabel("Госномер в источнике", { exact: true })
      .fill("А111АА777");
    await page
      .getByLabel("Стабильный ключ автомобиля", { exact: true })
      .fill("в222вв777");
    await page
      .getByLabel("Основной госномер", { exact: true })
      .fill("В222ВВ777");
    await page
      .getByLabel("Основание: VIN / ID и источник проверки", { exact: true })
      .fill("Проверено по синтетическому VIN UI-TEST");
    assert.equal(
      await page
        .getByRole("button", {
          name: "Сохранить подтверждённую связь",
          exact: true,
        })
        .isDisabled(),
      true,
    );
    await page
      .getByLabel("Я проверил идентичность машины", { exact: false })
      .check();
    await page
      .getByRole("button", {
        name: "Сохранить подтверждённую связь",
        exact: true,
      })
      .click();
    await page
      .getByText("Подтверждённая связь сохранена.", { exact: false })
      .waitFor();
    console.log(
      "PASS vehicle merge requires explicit confirmation and source evidence",
    );

    await page
      .getByRole("navigation", { name: "Разделы обслуживания" })
      .getByRole("button", { name: "Обзор", exact: true })
      .click();
    await page.locator(".fleet-kpi.is-primary").waitFor();
    await page.getByLabel("Период с", { exact: true }).fill("2026-01-01");
    await page.getByLabel("Период по", { exact: true }).fill("2025-12-31");
    await page
      .getByText("Начало периода позже конца.", { exact: false })
      .waitFor();
    assert.equal(await page.locator(".fleet-kpi.is-primary").count(), 0);
    await page
      .getByRole("button", { name: "Сбросить фильтры", exact: true })
      .click();
    await page.locator(".fleet-kpi.is-primary").waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: path.join(output, "overview-mobile.png"),
      fullPage: true,
    });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
      "Workspace should not overflow viewport",
    );
    console.log(
      "PASS invalid dates hide stale totals; mobile viewport has no horizontal page overflow",
    );

    let release, observed;
    const gate = new Promise((resolve) => {
        release = resolve;
      }),
      intercepted = new Promise((resolve) => {
        observed = resolve;
      });
    await page.route(`**/api/v1/fleet-maintenance?**`, async (route) => {
      const url = new URL(route.request().url());
      if (
        url.searchParams.get("responsibilityScopeId") === "company" &&
        url.searchParams.get("search") === "Позиция"
      ) {
        const response = await route.fetch();
        observed();
        await gate;
        await route.fulfill({ response }).catch(() => {});
      } else await route.continue();
    });
    await page.getByLabel("Поиск позиции", { exact: true }).fill("Позиция");
    await intercepted;
    await page.getByLabel("Период с", { exact: true }).fill("2027-01-01");
    await page.getByLabel("Период по", { exact: true }).fill("2026-01-01");
    release();
    await page.waitForTimeout(500);
    assert.equal(await page.locator(".fleet-kpi.is-primary").count(), 0);
    console.log("PASS late response cannot restore totals for stale filters");
    await page.getByRole("button", { name: "Сбросить фильтры", exact: true }).click();
    await page.locator(".fleet-kpi.is-primary").waitFor();

    await page
      .getByRole("navigation", { name: "Разделы обслуживания" })
      .getByRole("button", { name: "Заказ-наряды", exact: true })
      .click();
    const putNative = async (kind, payload) => {
      const result = await fixture.request(
        "PUT",
        `/fleet-operations/${kind}`,
        {
          id: randomUUID(),
          version: 0,
          responsibilityScopeId: peer,
          ...payload,
        },
        admin.accessToken,
      );
      assert.equal(result.status, 200, JSON.stringify(result.body));
      return result.body;
    };
    const vehicle = await putNative("vehicles", {
      plate: "Е555ЕЕ777",
      vin: "SYNTHETIC-UI-NATIVE",
      brand: "ГАЗ",
      model: "Фургон",
      group: "Собственный парк",
      odometerKm: 1000,
    });
    const order = await putNative("orders", {
      vehicleId: vehicle.id,
      openedOn: "2026-09-01",
      status: "draft",
      odometerKm: 1000,
      execution: "internal",
      lines: [
        {
          id: randomUUID(),
          type: "работа",
          name: "Регулировка",
          group: "ТО",
          node: "Двигатель",
          quantity: 1,
          unit: "ч",
          unitPriceCents: 123450,
          discountPercent: 0,
          adjustmentCents: 0,
          adjustmentReason: "",
          stockSource: "none",
          partId: null,
          warehouseId: null,
        },
      ],
    });
    const completed = await fixture.request(
      "POST",
      `/fleet-operations/orders/${order.id}/action`,
      {
        responsibilityScopeId: peer,
        version: order.version,
        action: "complete",
        idempotencyKey: randomUUID(),
        completedOn: "2026-09-02",
      },
      admin.accessToken,
    );
    assert.equal(completed.status, 201, JSON.stringify(completed.body));
    await page
      .getByRole("navigation", { name: "Разделы обслуживания" })
      .getByRole("button", { name: "Обзор", exact: true })
      .click();
    await page.locator(".fleet-kpi.is-primary").waitFor();
    const companyState = await fixture.request("GET", "/fleet-maintenance?responsibilityScopeId=company", undefined, admin.accessToken);
    const formattedTotal = new Intl.NumberFormat('ru-RU', {style: 'currency', currency: 'RUB', maximumFractionDigits: 2}).format(companyState.body.analytics.summary.amountCents / 100).replace(/\s/g, '');
    assert.ok((await page.locator(".fleet-kpi.is-primary").innerText()).replace(/\s/g, '').includes(formattedTotal));
    assert.equal(companyState.body.nativeRowCount, 1);
    assert.equal(await page.getByLabel("Проект", { exact: true }).count(), 0);
    const nativeState = await fixture.request(
      "GET",
      `/fleet-maintenance?responsibilityScopeId=${peer}`,
      undefined,
      admin.accessToken,
    );
    assert.equal(nativeState.body.dataset, null);
    assert.equal(nativeState.body.nativeRowCount, 1);
    console.log(
      "PASS native records from another scope join imported analytics without a project selector",
    );

    await page.evaluate((session) => window.mountFleet(session), auditor);
    await page.getByText("Только чтение", { exact: true }).waitFor();
    await page.locator(".fleet-kpi.is-primary").waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "Загрузить файл", exact: true })
        .isDisabled(),
      true,
    );
    await page
      .getByRole("navigation", { name: "Разделы обслуживания" })
      .getByRole("button", { name: "Сверка", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Подтверждённые связи автомобилей" })
      .waitFor();
    assert.equal(
      await page
        .getByLabel("Госномер в источнике", { exact: true })
        .isDisabled(),
      true,
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS auditor can read but cannot upload or change links; zero browser errors",
    );
  } finally {
    if (browser) await browser.close();
    await fixture.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
