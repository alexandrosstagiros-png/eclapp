#!/usr/bin/env node
'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { createHash, randomUUID } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { execFileSync } = require('node:child_process');
const { paths, PORT, PG_PORT, ORIGIN, appRequire, ensureDirectory, atomicJson, readJson,
  readCredentials, connectionConfig, openAdminPool, localEnvironment } = require('./runtime.cjs');

const PHONE = '+79990000001';
const BANNER = '<aside class="local-app-banner" role="note"><strong>Локальный тест ЕЦЛ</strong><span>Изменения приложения сохраняются на этом Mac. Передача в 1С — отдельной кнопкой.</span></aside>';
const BANNER_CSS = '.local-app-banner{display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:4px 14px;box-sizing:border-box;padding:9px 18px;background:#edf4ff;color:#315680;border-bottom:1px solid #cedcf1;font:12px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.local-app-banner strong{font-weight:700}.local-app-banner span{font-size:11px}html[data-theme="dark"] .local-app-banner{background:#172b44;color:#b7cee9;border-color:#2a425e}@media(max-width:600px){.local-app-banner{justify-content:flex-start;padding:8px 12px}.local-app-banner span{font-size:10px}}';
const CSS_FILES = ['app.css', 'planning.css', 'planning-builder.css', 'planning-calendar.css', 'recruitment.css', 'recruitment-onboarding.css', 'tenders.css', 'fleet-maintenance.css', 'fleet-operations.css', 'team.css', 'driver-requests.css', 'team-tasks.css', 'team-outcomes.css', 'profile.css', 'birthdays.css', 'attachment-photos.css', 'inspection-workflow.css', 'employee-planning-access.css', 'neural.css', 'local-one-c.css'];

function ownProcess(pid) {
  if (!Number.isInteger(pid) || pid <= 1) return false;
  try { return execFileSync('/bin/ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8' }).includes(paths.server); }
  catch { return false; }
}
async function lock() {
  for (let attempt = 0; attempt < 2; attempt++) {
    try { await fs.writeFile(paths.lock, JSON.stringify({ pid: process.pid }), { flag: 'wx', mode: 0o600 }); return; }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const previous = await readJson(paths.lock);
      if (ownProcess(previous?.pid)) throw new Error('Локальное приложение уже запущено.');
      await fs.unlink(paths.lock).catch(error => { if (error.code !== 'ENOENT') throw error; });
    }
  }
  throw new Error('Не удалось получить блокировку локального приложения.');
}
async function bootstrap(pool) {
  const { ids, seed } = appRequire(path.join(paths.recovered, 'scripts/seed.cjs'));
  await pool.query('CREATE TABLE IF NOT EXISTS local_app_metadata (key text PRIMARY KEY, value jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp())');
  const initialized = (await pool.query("SELECT 1 FROM local_app_metadata WHERE key='synthetic_seed_v1'")).rowCount;
  if (!initialized) {
    await seed();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('UPDATE access_grants SET personal_data_visible=true,finance_visible=true WHERE user_id=$1', [ids.admin]);
      await client.query("UPDATE users SET display_name='Администратор · локальный тест' WHERE id=$1", [ids.admin]);
      await client.query("UPDATE projects SET name='Локальный тест · учебный проект' WHERE id=$1", [ids.project]);
      await client.query("INSERT INTO local_app_metadata(key,value) VALUES('synthetic_seed_v1',$1::jsonb)", [JSON.stringify({ appliedAt: new Date().toISOString(), synthetic: true })]);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  const existing = (await pool.query('SELECT user_id FROM phone_credentials WHERE user_id=$1', [ids.admin])).rowCount;
  let login = await readJson(paths.login);
  if (existing) {
    if (!login) throw new Error('Пароль локального администратора уже задан, но login.json отсутствует. Автоматический сброс пароля не выполняется.');
    await fs.chmod(paths.login, 0o600);
    return;
  }
  const { generatePassword, hashPassword } = appRequire(path.join(paths.recovered, 'apps/api/src/modules/identity-access/infrastructure/password-auth.js'));
  if (!login) {
    login = { schemaVersion: 'transport.local-app.login.v1', url: ORIGIN, userId: ids.admin, role: 'access_admin',
      phone: PHONE, password: generatePassword(), issuedAt: new Date().toISOString(), localOnly: true };
    // Save before committing the password so a interrupted first launch can resume
    // with the same generated password instead of losing access to the new account.
    await atomicJson(paths.login, login);
  }
  if (login.userId !== ids.admin || login.phone !== PHONE || typeof login.password !== 'string' || login.password.length < 20) {
    throw new Error('Неверный файл входа локального администратора.');
  }
  const credential = await hashPassword(login.password);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`INSERT INTO phone_credentials(user_id,phone,password_salt,password_hash,hash_algorithm,created_by)
      VALUES($1,$2,$3,$4,$5,$1)`, [ids.admin, PHONE, credential.password_salt, credential.password_hash, credential.hash_algorithm]);
    await client.query('UPDATE users SET auth_version=auth_version+1 WHERE id=$1', [ids.admin]);
    await client.query('SELECT append_audit($1::jsonb)', [JSON.stringify({ schemaVersion: 1, actorId: ids.admin,
      action: 'access.password_issued', entityType: 'user', entityId: ids.admin, channel: 'system', correlationId: randomUUID(),
      metadata: { method: 'password', bootstrap: true, localOnly: true } })]);
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

async function main() {
  process.umask(0o077);
  await ensureDirectory();
  await lock();
  const instance = { schemaVersion: 'transport.local-app.runtime.v1', instanceId: randomUUID(), pid: process.pid,
    url: ORIGIN, status: 'starting', startedAt: new Date().toISOString(), loginPath: paths.login,
    credentialsPath: paths.credentials, logPath: paths.log, database: { host: '127.0.0.1', port: PG_PORT, name: 'transport_local' } };
  let cluster, clusterStarted = false, app, apiOrigin, adminPool, server, closing;
  const shutdown = async (exitCode = 0) => {
    if (closing) return closing;
    closing = (async () => {
      instance.status = 'stopping'; await atomicJson(paths.state, instance);
      if (server) await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
      if (app) await app.close().catch(() => {});
      if (adminPool) await adminPool.end().catch(() => {});
      if (clusterStarted) await cluster.stop();
      instance.status = exitCode ? 'failed' : 'stopped'; instance.stoppedAt = new Date().toISOString();
      await atomicJson(paths.state, instance);
      const held = await readJson(paths.lock);
      if (held?.pid === process.pid) await fs.unlink(paths.lock);
      process.exitCode = exitCode;
    })();
    return closing;
  };
  try {
    await atomicJson(paths.state, instance);
    const credentials = await readCredentials({ create: true });
    const environment = localEnvironment(credentials);
    // OCR is an explicit local opt-in, never inherited from a shell/.env. The
    // token is read only from the owner's private file and never printed.
    const ocrPath = path.join(paths.data, 'ocr.json');
    const ocrStat = await fs.stat(ocrPath).catch(error => { if(error.code==='ENOENT')return null;throw error; });
    if(ocrStat) {
      if(ocrStat.size>8192 || (ocrStat.mode & 0o077))throw new Error('Локальная настройка OCR должна иметь права 0600 и размер не более 8 КБ.');
      const config=await readJson(ocrPath);
      if(config?.provider!=='vk' || typeof config.token!=='string' || !config.token.trim() || config.token.length>4096 || /[\u0000-\u0020\u007f]/.test(config.token))throw new Error('Проверьте локальную настройку VK OCR.');
      environment.VK_OCR_TOKEN=config.token;
    }
    const dadataPath = path.join(paths.data, 'dadata.json');
    const dadataStat = await fs.stat(dadataPath).catch(error => { if(error.code==='ENOENT')return null;throw error; });
    if(dadataStat) {
      if(dadataStat.size>4096 || (dadataStat.mode & 0o077))throw new Error('Локальная настройка DaData должна иметь права 0600 и размер не более 4 КБ.');
      const config=await readJson(dadataPath);
      if(config?.provider!=='dadata' || typeof config.apiKey!=='string' || !/^[A-Za-z0-9_-]{16,256}$/.test(config.apiKey))throw new Error('Проверьте локальную настройку DaData.');
      environment.DADATA_API_KEY=config.apiKey;
    }
    environment.ONBOARDING_PHOTO_DIR=path.join(paths.root,'.local','onboarding-photos');
    Object.assign(environment, await require('./neural-config.cjs').readNeuralEnvironment(path.join(paths.data, 'neural.json')));
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, environment);
    const nativeName = `@embedded-postgres/${process.platform === 'win32' ? 'windows' : process.platform}-${process.arch}`;
    const nativeRoot = path.dirname(path.dirname(appRequire.resolve(nativeName)));
    execFileSync(process.execPath, [path.join(nativeRoot, 'scripts/hydrate-symlinks.js')], { cwd: nativeRoot, env: environment, stdio: 'pipe' });
    const { default: EmbeddedPostgres } = await import(pathToFileURL(appRequire.resolve('embedded-postgres')));
    // This process owns shutdown ordering: HTTP -> Nest -> DB pools -> PostgreSQL.
    // Keep the dependency's exit fallback, but avoid its competing signal handler.
    const exitHook = appRequire('async-exit-hook');
    for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) exitHook.unhookEvent(signal);
    for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.once(signal, () => { shutdown().then(() => process.exit(0), () => process.exit(1)); });
    cluster = new EmbeddedPostgres({ databaseDir: paths.db, user: 'postgres', password: credentials.database.adminPassword,
      port: PG_PORT, authMethod: 'scram-sha-256', persistent: true,
      postgresFlags: ['-h', '127.0.0.1', '-c', 'unix_socket_directories='], onLog() {}, onError() {} });
    const initialized = await fs.stat(path.join(paths.db, 'PG_VERSION')).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; });
    if (!initialized) await cluster.initialise();
    await cluster.start(); clusterStarted = true;
    const { Pool } = appRequire('pg');
    const catalog = new Pool(connectionConfig(credentials, true, 'postgres'));
    try {
      if (!(await catalog.query("SELECT 1 FROM pg_database WHERE datname='transport_local'")).rowCount) await catalog.query('CREATE DATABASE transport_local');
    } finally { await catalog.end(); }
    process.chdir(paths.recovered);
    const { migrate } = appRequire(path.join(paths.recovered, 'scripts/migrate.cjs'));
    await migrate();
    adminPool = await openAdminPool();
    await bootstrap(adminPool);
    console.log('Читаем справочники существующей локальной 1С. Ожидание — до двух минут.');
    try {
      const { importCatalogs } = require('../one-c-local/import-planning.cjs');
      const imported = await importCatalogs(adminPool, { adminId: '10000000-0000-4000-8000-000000000005' });
      instance.catalogs = { status: 'ready', syncedAt: new Date().toISOString(), drivers: imported.drivers, vehicles: imported.vehicles, scopes: imported.scopes.length };
      console.log(`Справочники 1С обновлены: водителей ${imported.drivers}, автомобилей ${imported.vehicles}, проектов ${imported.scopes.length}.`);
    } catch (error) {
      instance.catalogs = { status: 'unavailable', attemptedAt: new Date().toISOString() };
      console.warn(`Справочники 1С не обновлены: ${safeError(error)} Приложение запускается с сохранёнными локальными данными и связями.`);
    }
    await atomicJson(paths.state, instance);
    const { createApp } = appRequire(path.join(paths.recovered, 'apps/api/src/bootstrap.js'));
    const signalListeners = new Map(['SIGINT', 'SIGTERM', 'SIGHUP'].map(signal => [signal, new Set(process.listeners(signal))]));
    ({ app } = await createApp());
    // createApp installs Nest's process-exiting signal listeners. This launcher
    // calls app.close() itself before stopping its PostgreSQL process.
    for (const [signal, previous] of signalListeners) {
      for (const listener of process.listeners(signal)) if (!previous.has(listener)) process.removeListener(signal, listener);
    }
    await app.listen(0, '127.0.0.1');
    apiOrigin = `http://127.0.0.1:${app.getHttpServer().address().port}`;
    const frontend = path.join(paths.recovered, 'apps/office-web/src');
    server = http.createServer(async (req, res) => {
      const json = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); };
      res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer');
      if (req.headers.host !== `127.0.0.1:${PORT}` || (req.headers.origin && req.headers.origin !== ORIGIN) || req.headers['sec-fetch-site'] === 'cross-site') return json(403, { message: 'Доступ только с локального адреса приложения.' });
      let url;
      try { url = new URL(req.url, ORIGIN); } catch { return json(400, { message: 'Некорректный локальный адрес.' }); }
      if (url.origin !== ORIGIN) return json(403, { message: 'Запросы к другим серверам не поддерживаются.' });
      if (url.pathname === '/__local/status' && req.method === 'GET') return json(instance.status === 'ready' ? 200 : 503, {
        kind: 'ecl-persistent-local-app', instanceId: instance.instanceId, pid: process.pid, ready: instance.status === 'ready', url: ORIGIN,
      });
      if (url.pathname.startsWith('/api/')) {
        const headers = { ...req.headers, host: new URL(apiOrigin).host };
        for (const key of Object.keys(headers)) if (key.startsWith('x-forwarded-') || key === 'forwarded') delete headers[key];
        const upstream = http.request(new URL(`${url.pathname}${url.search}`, apiOrigin), { method: req.method, headers }, response => {
          res.writeHead(response.statusCode, response.headers); response.pipe(res);
        });
        upstream.on('error', () => { if (!res.headersSent) json(502, { message: 'Локальный API временно недоступен.' }); else res.destroy(); });
        req.on('aborted', () => upstream.destroy()); req.pipe(upstream); return;
      }
      if (!['GET', 'HEAD'].includes(req.method)) return json(405, { message: 'Метод не поддерживается.' });
      try {
        let bytes, extension;
        if (url.pathname === '/__local/banner.css') { bytes = Buffer.from(BANNER_CSS); extension = '.css'; }
        else {
          let relative;
          if (url.pathname === '/favicon.svg') relative = 'favicon.svg';
          else if (/^\/assets\/[a-zA-Z0-9_.-]+\.js$/.test(url.pathname)) {
            const filename = path.basename(url.pathname);
            const exists = await fs.stat(path.join(frontend, filename)).then(stat => stat.isFile(), () => false);
            relative = exists ? filename : `assets/${filename}`;
          } else if (/^\/assets\/[a-zA-Z0-9_.-]+$/.test(url.pathname)) relative = url.pathname.slice(1);
          else if (url.pathname === '/' || url.pathname === '/index.html' || !path.extname(url.pathname)) relative = 'index.html';
          if (!relative) return json(404, { message: 'Файл не найден.' });
          extension = path.extname(relative);
          if (relative === 'assets/app.css') {
            const parts = [];
            for (const filename of CSS_FILES) {
              try { parts.push(await fs.readFile(path.join(frontend, 'assets', filename)), Buffer.from('\n')); }
              catch (error) { if (filename !== 'local-one-c.css' || error.code !== 'ENOENT') throw error; }
            }
            bytes = Buffer.concat(parts);
          } else bytes = await fs.readFile(path.join(frontend, relative));
          if (relative === 'index.html') bytes = Buffer.from(bytes.toString('utf8')
            .replace(/<title>[^<]*<\/title>/, '<title>ЕЦЛ · Локальный тест приложения</title>')
            .replace('</head>', '<link rel="stylesheet" href="/__local/banner.css"></head>')
            .replace('<body>', `<body>${BANNER}`));
        }
        const inline = extension === '.html' ? [...bytes.toString('utf8').matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => `'sha256-${createHash('sha256').update(match[1]).digest('base64')}'`).join(' ') : '';
        res.setHeader('Content-Security-Policy', `default-src 'self'; script-src 'self' ${inline}; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`);
        const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };
        res.writeHead(200, { 'Content-Type': types[extension] || 'application/octet-stream' }); res.end(req.method === 'HEAD' ? undefined : bytes);
      } catch (error) { json(error.code === 'ENOENT' ? 404 : 500, { message: 'Локальный файл недоступен.' }); }
    });
    server.requestTimeout = 240000;
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(PORT, '127.0.0.1', resolve); });
    const ready = await fetch(`${apiOrigin}/api/v1/health/ready`, { signal: AbortSignal.timeout(10000) });
    if (!ready.ok) throw new Error('Проверка готовности локального API не прошла.');
    instance.status = 'ready'; instance.readyAt = new Date().toISOString(); await atomicJson(paths.state, instance);
    console.log(`Локальное приложение готово: ${ORIGIN}`);
    console.log(`Пароль хранится только в локальном файле: ${paths.login}`);
  } catch (error) {
    console.error(`Запуск локального приложения не выполнен: ${safeError(error)}`);
    await shutdown(1);
  }
}
function safeError(error) {
  const code = error?.code;
  if (code === 'EADDRINUSE') return 'локальный порт занят; другой процесс не остановлен.';
  if (error instanceof Error && !/postgres(?:ql)?:\/\/|password|credential|token|secret/i.test(error.message)) return error.message.slice(0, 700);
  return 'проверьте локальную PostgreSQL и миграции. Существующие данные сохранены.';
}
if (require.main === module) main().catch(error => { console.error(safeError(error)); process.exitCode = 1; });
module.exports = { main, ownProcess };
