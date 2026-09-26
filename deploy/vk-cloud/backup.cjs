'use strict';
// Installed root-owned. Called by systemd as ecl-migrate, never as root.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {spawnSync} = require('node:child_process');
const target = process.argv[2];
let temporary;
try {
  if (!/^\/var\/lib\/ecl\/migration-backups\/[a-zA-Z0-9_-]+\.dump$/.test(target || '')) throw Error('Invalid backup destination');
  const url = new URL(process.env.MIGRATION_DATABASE_URL);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw Error('Invalid database URL');
  const escape = value => {
    if (/[\r\n]/.test(value)) throw Error('Invalid PostgreSQL credential');
    return value.replaceAll('\\', '\\\\').replaceAll(':', '\\:');
  };
  const env = {PATH:'/usr/bin:/bin', LANG:'C.UTF-8', PGCONNECT_TIMEOUT:'15',
    PGHOST:url.hostname, PGPORT:url.port || '5432', PGDATABASE:decodeURIComponent(url.pathname.slice(1)),
    PGUSER:decodeURIComponent(url.username)};
  const sslKeys = {sslmode:'PGSSLMODE', sslrootcert:'PGSSLROOTCERT', sslcert:'PGSSLCERT', sslkey:'PGSSLKEY', channel_binding:'PGCHANNELBINDING'};
  for (const [key, value] of url.searchParams) {
    if (!sslKeys[key]) throw Error('Unsupported connection parameter in backup URL: ' + key);
    env[sslKeys[key]] = value;
  }
  for (const key of Object.values(sslKeys)) if (!env[key] && process.env[key]) env[key] = process.env[key];
  temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'ecl-pg-'));
  env.PGPASSFILE = path.join(temporary, 'pgpass');
  fs.writeFileSync(env.PGPASSFILE, [env.PGHOST,env.PGPORT,env.PGDATABASE,env.PGUSER,decodeURIComponent(url.password)].map(escape).join(':')+'\n', {mode:0o600});
  const fd = fs.openSync(target, 'wx', 0o600);
  // Preserve ACLs: module permissions from already-applied migrations are not replayed.
  const result = spawnSync('/usr/lib/postgresql/17/bin/pg_dump', ['--format=custom','--no-owner','--no-password'], {env, stdio:['ignore',fd,'pipe'], timeout:1800000});
  fs.closeSync(fd);
  // Database errors can contain SQL/user data; the deploy log only gets a generic error.
  if (result.status !== 0) {fs.unlinkSync(target); throw Error('Database backup failed; deployment was stopped before migrations');}
  if (fs.statSync(target).size === 0) throw Error('Empty database backup');
  console.log('Pre-migration database backup completed');
} catch (error) {
  console.error(error.message.startsWith('Database backup') ? error.message : 'Cannot create database backup; check connection and PostgreSQL 17 client configuration');
  process.exitCode = 1;
} finally {
  if (temporary) fs.rmSync(temporary, {recursive:true,force:true});
}
