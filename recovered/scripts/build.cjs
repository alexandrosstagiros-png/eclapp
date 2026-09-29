"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { minify } = require("terser");
const root = path.resolve(__dirname, "..");
const hash = data => crypto.createHash("sha256").update(data).digest("hex");
function copyTree(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (/\.test\.cjs$|\.map$/.test(entry.name)) continue;
    const source = path.join(from, entry.name), target = path.join(to, entry.name);
    if (entry.isDirectory()) copyTree(source, target);
    else if (entry.name.endsWith(".js") || entry.name.endsWith(".cjs")) {
      const checked = spawnSync(process.execPath, ["--check", source], { encoding: "utf8" });
      if (checked.status !== 0) throw new Error(`Syntax check failed: ${source}\n${checked.stderr}`);
      fs.writeFileSync(target, fs.readFileSync(source, "utf8").replace(/^\/\/# sourceMappingURL=.*$/gm, ""));
    } else fs.copyFileSync(source, target);
  }
}
async function build() {
  for (const relative of ["apps/api", "packages/contracts", "apps/driver-web"]) {
    const dir = path.join(root, relative);
    fs.rmSync(path.join(dir, "dist"), { recursive: true, force: true });
    copyTree(path.join(dir, "src"), path.join(dir, "dist"));
  }
  const web = path.join(root, "apps/office-web");
  const moduleNames = new Map();
  const modules = [];
  for (const name of ["company-work-request", "planning-templates", "planning-fields", "planning-model", "planning-builder", "planning-calendar-model", "planning-calendar", "planning", "attachment-photos", "recruitment-contract-packs", "recruitment-contracts", "recruitment-onboarding", "recruitment-board-drag", "recruitment-hh", "recruitment", "tenders", "development", "team-media", "inspection-workflow", "chief-mechanic-access", "employee-planning-access", "driver-requests", "profile", "birthdays", "team-notifications", "team-tasks", "team-outcomes", "team-response-metrics", "team", "fleet-operations", "fleet-maintenance", "neural", "finance-ledger"]) {
    let content = fs.readFileSync(path.join(web, `src/${name}.js`), "utf8");
    for (const [dependency, filename] of moduleNames) content = content.replaceAll(`./${dependency}.js`, `./${filename}`);
    const compiled = await minify(content, { module: true, compress: true, mangle: true });
    if (!compiled.code) throw new Error(`Empty frontend module: ${name}`);
    const filename = `${name}-${hash(compiled.code).slice(0, 12)}.js`;
    moduleNames.set(name, filename);
    modules.push({ filename, code: compiled.code });
  }
  let source = fs.readFileSync(path.join(web, "src/app.js"), "utf8");
  for (const [dependency, filename] of moduleNames) source = source.replaceAll(`./${dependency}.js`, `./${filename}`);
  const result = await minify(source, { module: true, compress: true, mangle: true, format: { comments: /@license|@preserve|^!/ } });
  if (!result.code) throw new Error("Empty frontend output");
  const css = Buffer.concat([fs.readFileSync(path.join(web, "src/assets/app.css")), Buffer.from('\n'), fs.readFileSync(path.join(web, "src/assets/planning.css")), Buffer.from('\n'), fs.readFileSync(path.join(web, "src/assets/planning-builder.css")), Buffer.from('\n'), fs.readFileSync(path.join(web, "src/assets/planning-calendar.css")), Buffer.from("\n"), fs.readFileSync(path.join(web, "src/assets/recruitment.css")), Buffer.from("\n"), fs.readFileSync(path.join(web, "src/assets/recruitment-onboarding.css")), Buffer.from("\n"), fs.readFileSync(path.join(web, "src/assets/tenders.css"))]);
  const jsName = `app-${hash(result.code).slice(0, 12)}.js`;
  const fleetCss = Buffer.concat([css,Buffer.from('\n'),fs.readFileSync(path.join(web,'src/assets/fleet-maintenance.css')),Buffer.from('\n'),fs.readFileSync(path.join(web,'src/assets/fleet-operations.css')),Buffer.from('\n'),fs.readFileSync(path.join(web,'src/assets/development.css')),Buffer.from('\n'),fs.readFileSync(path.join(web,'src/assets/team.css')),Buffer.from('\n'),fs.readFileSync(path.join(web,'src/assets/driver-requests.css')),Buffer.from('\n'),fs.readFileSync(path.join(web,'src/assets/team-tasks.css')),Buffer.from('\n'),fs.readFileSync(path.join(web,'src/assets/team-outcomes.css')),Buffer.from('\n'),fs.readFileSync(path.join(web,'src/assets/profile.css')),Buffer.from('\n'),fs.readFileSync(path.join(web,'src/assets/birthdays.css')),Buffer.from('\n'),fs.readFileSync(path.join(web,'src/assets/attachment-photos.css')),Buffer.from('\n'),fs.readFileSync(path.join(web,'src/assets/inspection-workflow.css')),Buffer.from('\n'),fs.readFileSync(path.join(web,'src/assets/employee-planning-access.css')),Buffer.from('\n'),fs.readFileSync(path.join(web,'src/assets/neural.css')),Buffer.from('\n'),fs.readFileSync(path.join(web,'src/assets/finance-ledger.css'))]);
  const cssName = `app-${hash(fleetCss).slice(0, 12)}.css`;
  fs.rmSync(path.join(web, "dist"), { recursive: true, force: true });
  fs.mkdirSync(path.join(web, "dist/assets"), { recursive: true });
  fs.writeFileSync(path.join(web, "dist/assets", jsName), result.code);
  for (const entry of modules) fs.writeFileSync(path.join(web, "dist/assets", entry.filename), entry.code);
  fs.writeFileSync(path.join(web, "dist/assets", cssName), fleetCss);
  for (const name of fs.readdirSync(path.join(web, "src/assets"))) {
    if (!["app.css", "planning.css", "planning-builder.css", "planning-calendar.css", "recruitment.css", "recruitment-onboarding.css", "tenders.css", "fleet-maintenance.css", "fleet-operations.css", "development.css", "team.css", "driver-requests.css", "team-tasks.css", "team-outcomes.css", "profile.css", "birthdays.css", "attachment-photos.css", "inspection-workflow.css", "employee-planning-access.css", "neural.css", "finance-ledger.css"].includes(name)) fs.copyFileSync(path.join(web, "src/assets", name), path.join(web, "dist/assets", name));
  }
  const html = fs.readFileSync(path.join(web, "src/index.html"), "utf8")
    .replace("/assets/app.js", `/assets/${jsName}`).replace("/assets/app.css", `/assets/${cssName}`)
    .replace(/\s*<link rel="stylesheet" href="\/assets\/development\.css" \/>/, "");
  if (!html.includes(jsName) || !html.includes(cssName)) throw new Error("HTML asset references missing");
  fs.writeFileSync(path.join(web, "dist/index.html"), html);
  const inlineScripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  if (inlineScripts.length !== 1) throw new Error("Expected one inline theme script for CSP");
  const cspHash = crypto.createHash("sha256").update(inlineScripts[0][1]).digest("base64");
  const nginxPath = path.join(root, "infra/deploy/transport-miniapp.nginx.conf");
  fs.writeFileSync(nginxPath, fs.readFileSync(nginxPath, "utf8").replace(/sha256-[A-Za-z0-9+/=]+/g, `sha256-${cspHash}`));
  fs.copyFileSync(path.join(web, "src/favicon.svg"), path.join(web, "dist/favicon.svg"));
  const manifest = { frontend: jsName, stylesheet: cssName, sourceSha256: hash(source), frontendSha256: hash(result.code) };
  fs.writeFileSync(path.join(root, "build-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  console.log(JSON.stringify(manifest));
}
build().catch(error => { console.error(error.message); process.exitCode = 1; });
