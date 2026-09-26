'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { createRequire } = require('node:module');
const { randomBytes } = require('node:crypto');

const ROOT = path.resolve(__dirname, '../..');
const RECOVERED = path.join(ROOT, 'recovered');
const DATA = path.join(ROOT, '.local/local-app');
const PORT = 18514;
const PG_PORT = 18515;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const paths = Object.freeze({ root: ROOT, recovered: RECOVERED, data: DATA, db: path.join(DATA, 'db'),
  credentials: path.join(DATA, 'credentials.json'), login: path.join(DATA, 'login.json'),
  state: path.join(DATA, 'state.json'), lock: path.join(DATA, 'server.lock'),
  log: path.join(DATA, 'launcher.log'), server: path.join(__dirname, 'server.cjs') });
const appRequire = createRequire(path.join(RECOVERED, 'package.json'));

async function ensureDirectory() {
  await fs.mkdir(DATA, { recursive: true, mode: 0o700 });
  await fs.chmod(DATA, 0o700);
}
async function atomicJson(file, value) {
  const temporary = `${file}.${process.pid}.${randomBytes(5).toString('hex')}.tmp`;
  try {
    await fs.writeFile(temporary, JSON.stringify(value, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    await fs.rename(temporary, file);
    await fs.chmod(file, 0o600);
  } finally { await fs.unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
}
async function readJson(file) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
function validateCredentials(value) {
  const database = value?.database;
  if (value?.schemaVersion !== 'transport.local-app.credentials.v1' || !database ||
      database.host !== '127.0.0.1' || database.port !== PG_PORT || database.name !== 'transport_local' ||
      database.adminUser !== 'postgres' || database.appUser !== 'transport_app' ||
      !/^[a-f0-9]{64}$/.test(database.adminPassword) || !/^[a-f0-9]{64}$/.test(database.appPassword)) {
    throw new Error('Неверный формат локальных настроек PostgreSQL.');
  }
  return value;
}
async function readCredentials({ create = false } = {}) {
  const stored = await readJson(paths.credentials);
  if (stored) { await fs.chmod(paths.credentials, 0o600); return validateCredentials(stored); }
  if (!create) throw new Error('Локальное приложение ещё не инициализировано.');
  if (await fs.stat(path.join(paths.db, 'PG_VERSION')).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; })) {
    throw new Error('Локальная PostgreSQL уже существует, но credentials.json отсутствует. Данные сохранены; автоматический сброс не выполняется.');
  }
  const value = { schemaVersion: 'transport.local-app.credentials.v1', createdAt: new Date().toISOString(), database: {
    host: '127.0.0.1', port: PG_PORT, name: 'transport_local', adminUser: 'postgres',
    adminPassword: randomBytes(32).toString('hex'), appUser: 'transport_app', appPassword: randomBytes(32).toString('hex'),
  } };
  await atomicJson(paths.credentials, value);
  return value;
}
function connectionConfig(credentials, admin = false, databaseName) {
  const value = validateCredentials(credentials).database;
  return { host: value.host, port: value.port, database: databaseName || value.name,
    user: admin ? value.adminUser : value.appUser, password: admin ? value.adminPassword : value.appPassword,
    max: 3, connectionTimeoutMillis: 5000, statement_timeout: 15000 };
}
function connectionUrl(credentials, admin = false) {
  const config = connectionConfig(credentials, admin);
  return `postgresql://${config.user}:${config.password}@${config.host}:${config.port}/${config.database}`;
}
async function openAdminPool() {
  const { Pool } = appRequire('pg');
  const pool = new Pool(connectionConfig(await readCredentials(), true));
  pool.on('error', () => process.stderr.write('Локальное соединение PostgreSQL недоступно.\n'));
  return pool;
}
// Only OS process settings are inherited. Application flags, tokens, NODE_OPTIONS,
// proxy settings and remote database URLs never enter this local runtime.
function cleanEnvironment(source = process.env) {
  const environment = {};
  for (const key of ['HOME', 'PATH', 'TMPDIR', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TZ', 'USER', 'LOGNAME', 'SHELL']) {
    if (typeof source[key] === 'string') environment[key] = source[key];
  }
  return environment;
}
function localEnvironment(credentials) {
  return { ...cleanEnvironment(), NODE_ENV: 'development', HOST: '127.0.0.1', PORT: String(PORT),
    DATABASE_URL: connectionUrl(credentials), MIGRATION_DATABASE_URL: connectionUrl(credentials, true),
    APP_DB_PASSWORD: credentials.database.appPassword, DEV_AUTH_ENABLED: 'false', DEMO_AUTH_ENABLED: 'false',
    DEMO_EMPLOYEE_CREATION_ENABLED: 'true', SESSION_TTL_SECONDS: '3600', TRUST_PROXY_LOOPBACK: 'false', ALLOWED_ORIGINS: ORIGIN,
    LOCAL_ONE_C_ENABLED: 'true', ONE_C_HTTP_ENABLED: 'false',
    TELEGRAM_COMMUNICATIONS_ENABLED: 'false', TELEGRAM_ONBOARDING_ENABLED: 'false', MAX_NOTIFICATIONS_ENABLED: 'false',
  };
}
module.exports = { ROOT, RECOVERED, DATA, PORT, PG_PORT, ORIGIN, paths, appRequire, ensureDirectory,
  atomicJson, readJson, readCredentials, connectionConfig, openAdminPool, cleanEnvironment, localEnvironment };
