'use strict';
// Starts the existing local ECL installation, then opens the packaged macOS app.
// This launcher uses the existing manager, which preserves its database.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
if (process.platform !== 'darwin') {
  console.error('Этот запуск предназначен для локальной установки ЕЦЛ на Mac. На других устройствах укажите адрес сервера в приложении.');
  process.exit(1);
}
const candidates = [
  path.join(os.homedir(), 'Applications/ECL.app'),
  path.join(root, 'native/target/universal-apple-darwin/release/bundle/macos/ECL.app'),
  path.join(root, 'native/target/release/bundle/macos/ECL.app'),
  path.join(root, 'native/target/debug/bundle/macos/ECL.app'),
];
const app = candidates.find(candidate => fs.existsSync(candidate));
if (!app) {
  console.error('Сначала соберите приложение: cd native && npm run build -- --bundles app');
  process.exit(1);
}
const started = spawnSync(process.execPath, [path.join(root, 'integrations/local-app/manage.cjs'), 'start'], { cwd: root, stdio: 'inherit' });
if (started.status !== 0) process.exit(started.status || 1);
const opened = spawnSync('/usr/bin/open', [app], { stdio: 'inherit' });
process.exit(opened.status || 0);
