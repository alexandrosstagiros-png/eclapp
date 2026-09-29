'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const nativeRoot = path.resolve(__dirname, '..');
const source = path.resolve(nativeRoot, '../recovered/apps/office-web/src');
const output = path.join(nativeRoot, 'dist');
const { minify } = require(path.resolve(nativeRoot, '../recovered/node_modules/terser'));
const cssFiles = ['app', 'planning', 'planning-builder', 'planning-calendar', 'recruitment', 'recruitment-onboarding', 'tenders', 'fleet-maintenance', 'fleet-operations', 'development', 'team', 'driver-requests', 'team-tasks', 'team-outcomes', 'profile', 'birthdays', 'attachment-photos', 'inspection-workflow', 'employee-planning-access', 'neural', 'finance-ledger'];
const hash = data => crypto.createHash('sha256').update(data).digest('hex');

async function build() {
  fs.rmSync(output, { recursive: true, force: true });
  fs.mkdirSync(path.join(output, 'assets'), { recursive: true });
  const manifest = { source: 'recovered/apps/office-web/src', files: {} };
  for (const name of fs.readdirSync(source).filter(name => name.endsWith('.js')).sort()) {
    let code = fs.readFileSync(path.join(source, name), 'utf8');
    if (name === 'app.js') {
      // Native sessions deliberately do not issue persistent refresh cookies.
      const rememberDefault = 'const [rememberDevice, setRememberDevice] = h.useState(true);';
      if (!code.includes(rememberDefault)) throw new Error('Native auth adaptation needs review: rememberDevice default changed');
      code = code.replace(rememberDefault, 'const [rememberDevice, setRememberDevice] = h.useState(false);')
        .replace('На общем устройстве снимите эту отметку.', 'После закрытия приложения потребуется снова войти. Пароль не сохраняется.');
    }
    const compiled = await minify(code, { module: true, compress: true, mangle: true, format: { comments: /@license|@preserve|^!/ } });
    if (!compiled.code) throw new Error(`Empty compiled module: ${name}`);
    fs.writeFileSync(path.join(output, 'assets', name), compiled.code);
    manifest.files[name] = hash(compiled.code);
  }
  const css = cssFiles.map(name => fs.readFileSync(path.join(source, 'assets', `${name}.css`), 'utf8')).join('\n');
  fs.writeFileSync(path.join(output, 'assets', 'app.css'), css);
  manifest.files['app.css'] = hash(css);
  for (const entry of fs.readdirSync(path.join(source, 'assets'), { withFileTypes: true })) {
    if (!entry.isFile() || /\.(?:css|js|map|cjs)$/.test(entry.name)) continue;
    fs.copyFileSync(path.join(source, 'assets', entry.name), path.join(output, 'assets', entry.name));
  }
  for (const name of fs.readdirSync(path.join(nativeRoot, 'frontend'))) {
    if (!/\.(?:js|mjs|css)$/.test(name)) continue;
    fs.copyFileSync(path.join(nativeRoot, 'frontend', name), path.join(output, 'assets', name));
  }
  fs.copyFileSync(path.join(source, 'favicon.svg'), path.join(output, 'favicon.svg'));
  fs.writeFileSync(path.join(output, 'index.html'), `<!doctype html>
<html lang="ru"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="theme-color" content="#e8edf1" /><meta name="referrer" content="no-referrer" />
<meta name="description" content="ЕЦЛ — рейсы, команда, документы и планирование." />
<title>ЕЦЛ · Единый центр логистики</title>
<script src="/assets/theme.js"></script><link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="stylesheet" href="/assets/app.css" /><link rel="stylesheet" href="/assets/native.css" />
<script type="module" src="/assets/bootstrap.mjs"></script></head>
<body><div id="root"></div><div id="native-shell"></div></body></html>\n`);
  fs.writeFileSync(path.join(output, 'build-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`Native UI ready: ${Object.keys(manifest.files).length - 1} application modules, ${cssFiles.length} stylesheets.`);
}
build().catch(error => { console.error(error.message); process.exitCode = 1; });
