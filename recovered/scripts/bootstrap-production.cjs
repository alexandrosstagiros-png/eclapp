#!/usr/bin/env node
"use strict";

// One-time setup of a fully migrated, empty production database. Read credentials
// from a private JSON file; never pass passwords as command arguments or log them.
const fs = require("node:fs");
const path = require("node:path");
const { createHash, randomUUID } = require("node:crypto");
const { Pool } = require("pg");
const { normalizePhone, hashPassword } = require("../apps/api/src/modules/identity-access/infrastructure/password-auth.js");

class BootstrapError extends Error {}
const fail = message => { throw new BootstrapError(message); };
const quoteIdentifier = value => '"' + value.replaceAll('"', '""') + '"';
const migrationDirectory = path.resolve(__dirname, "../infra/db/migrations");

function validateInput(value) {
  const allowed = new Set(["phone", "name", "password", "organizationName", "regionName", "timeZone", "projectName", "scopeName"]);
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(key => !allowed.has(key)))
    fail("Invalid bootstrap configuration fields.");
  const name = (key, fallback, maximum = 160) => {
    const raw = value[key] ?? fallback;
    if (typeof raw !== "string" || !raw.trim() || raw.trim().length > maximum || /[\x00-\x1f\x7f]/.test(raw))
      fail(`Invalid ${key}.`);
    return raw.trim();
  };
  const phone = normalizePhone(value.phone);
  if (!phone) fail("A valid administrator phone number is required.");
  if (typeof value.password !== "string" || value.password.length < 20 || value.password.length > 128 || Buffer.byteLength(value.password) > 512)
    fail("Administrator password must contain 20 to 128 characters and at most 512 UTF-8 bytes.");
  const timeZone = name("timeZone", "Europe/Moscow", 100);
  try { new Intl.DateTimeFormat("en", { timeZone }).format(); }
  catch { fail("Invalid timeZone."); }
  return {
    phone, password: value.password, name: name("name"), organizationName: name("organizationName", undefined, 200),
    regionName: name("regionName", "Основной регион"), timeZone,
    projectName: name("projectName", "Основная деятельность"), scopeName: name("scopeName", "Основная область"),
  };
}

function readPrivateConfig(filename) {
  if (!filename || !path.isAbsolute(filename)) fail("Use --config with an absolute path to a private JSON file.");
  let descriptor;
  try {
    descriptor = fs.openSync(filename, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    const stat = fs.fstatSync(descriptor);
    if (!stat.isFile() || (stat.mode & 0o077) !== 0 || stat.size > 16384)
      fail("Bootstrap configuration must be a private regular file (0600 or 0400), no larger than 16 KiB.");
    let value;
    try { value = JSON.parse(fs.readFileSync(descriptor, "utf8")); }
    catch { fail("Bootstrap configuration is not valid JSON."); }
    return validateInput(value);
  } catch (error) {
    if (error instanceof BootstrapError) throw error;
    fail("Cannot read the private bootstrap configuration file.");
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

async function requireEmptyMigratedDatabase(client) {
  // Serialize both bootstrap invocations and the existing migration runner.
  await client.query("SELECT pg_advisory_xact_lock(917042001)");
  const expected = fs.readdirSync(migrationDirectory).filter(file => file.endsWith(".sql")).sort();
  const applied = (await client.query("SELECT name,checksum FROM schema_migrations ORDER BY name")).rows;
  const checksums = new Map(applied.map(row => [row.name, row.checksum]));
  if (checksums.size !== expected.length || expected.some(file => checksums.get(file) !== createHash("sha256").update(fs.readFileSync(path.join(migrationDirectory, file))).digest("hex")))
    fail("Database migrations do not match this release. Apply the release migrations before bootstrap.");

  const tables = (await client.query(`SELECT c.relname AS name FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p')
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid='pg_class'::regclass
        AND d.objid=c.oid AND d.deptype='e') ORDER BY c.relname`)).rows.map(row => row.name);
  // Block concurrent inserts while checking emptiness and provisioning the first
  // identity. This is a one-time operation on an empty database, before API start.
  await client.query(`LOCK TABLE ${tables.map(name => `public.${quoteIdentifier(name)}`).join(",")} IN SHARE ROW EXCLUSIVE MODE`);
  const defaults = new Set(["schema_migrations", "audit_head", "notification_settings", "team_outcome_state"]);
  for (const table of tables) {
    if (defaults.has(table)) continue;
    if ((await client.query(`SELECT 1 FROM public.${quoteIdentifier(table)} LIMIT 1`)).rowCount)
      fail("Production bootstrap requires an empty application database; existing records were left unchanged.");
  }
  const audit = (await client.query("SELECT sequence,event_hash FROM audit_head WHERE singleton")).rows;
  const settings = (await client.query("SELECT enabled_at FROM notification_settings WHERE singleton")).rows;
  if (audit.length !== 1 || String(audit[0].sequence) !== "0" || audit[0].event_hash !== "0".repeat(64) || settings.length !== 1 || settings[0].enabled_at !== null)
    fail("Database initialization state is not empty; existing records were left unchanged.");
}

async function bootstrapProduction(value, { connectionString = process.env.MIGRATION_DATABASE_URL } = {}) {
  const input = validateInput(value);
  let connection;
  try { connection = new URL(connectionString); }
  catch { fail("MIGRATION_DATABASE_URL is required."); }
  if (!["postgres:", "postgresql:"].includes(connection.protocol)) fail("Invalid migration database connection protocol.");
  const credential = await hashPassword(input.password);
  const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 5000, statement_timeout: 15000 });
  const ids = Object.fromEntries(["userId", "legalEntityId", "regionId", "projectId", "responsibilityScopeId"].map(key => [key, randomUUID()]));
  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout='5s'");
    await requireEmptyMigratedDatabase(client);
    await client.query("INSERT INTO legal_entities(id,name) VALUES($1,$2)", [ids.legalEntityId, input.organizationName]);
    await client.query("INSERT INTO regions(id,name,time_zone) VALUES($1,$2,$3)", [ids.regionId, input.regionName, input.timeZone]);
    await client.query("INSERT INTO projects(id,name,legal_entity_id,region_id) VALUES($1,$2,$3,$4)", [ids.projectId, input.projectName, ids.legalEntityId, ids.regionId]);
    await client.query("INSERT INTO responsibility_scopes(id,project_id,name) VALUES($1,$2,$3)", [ids.responsibilityScopeId, ids.projectId, input.scopeName]);
    await client.query("INSERT INTO users(id,display_name,role,active,approved) VALUES($1,$2,'access_admin',true,true)", [ids.userId, input.name]);
    await client.query("INSERT INTO employee_directory(user_id,source_kind) VALUES($1,'existing')", [ids.userId]);
    await client.query(`INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id,personal_data_visible,finance_visible)
      VALUES($1,$2,$3,$4,$5,true,true)`, [ids.userId, ids.legalEntityId, ids.regionId, ids.projectId, ids.responsibilityScopeId]);
    await client.query(`INSERT INTO phone_credentials(user_id,phone,password_salt,password_hash,hash_algorithm,created_by)
      VALUES($1,$2,$3,$4,$5,$1)`, [ids.userId, input.phone, credential.password_salt, credential.password_hash, credential.hash_algorithm]);
    await client.query("SELECT append_audit($1::jsonb)", [JSON.stringify({
      schemaVersion: 1, actorId: ids.userId, action: "access.production_bootstrapped", entityType: "user", entityId: ids.userId,
      channel: "system", correlationId: randomUUID(), scope: { legalEntityId: ids.legalEntityId, regionId: ids.regionId, projectId: ids.projectId, responsibilityScopeId: ids.responsibilityScopeId },
      metadata: { role: "access_admin", method: "password", bootstrap: true, synthetic: false },
    })]);
    await client.query("COMMIT");
    return { status: "created", ...ids, administratorName: input.name, organizationName: input.organizationName };
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client?.release();
    await pool.end();
  }
}

async function main(args = process.argv.slice(2)) {
  if (process.env.NODE_ENV !== "production") fail("Production bootstrap requires NODE_ENV=production.");
  if (args.length !== 2 || args[0] !== "--config") fail("Usage: bootstrap-production.cjs --config /absolute/private/bootstrap.json");
  const result = await bootstrapProduction(readPrivateConfig(args[1]));
  process.stdout.write(JSON.stringify(result) + "\n");
}

if (require.main === module) main().catch(error => {
  // PostgreSQL errors can contain statement parameters. Never print raw errors.
  process.stderr.write(error instanceof BootstrapError ? error.message + "\n" : "Production bootstrap failed. Check database access, migrations and initialization state.\n");
  process.exitCode = 1;
});
module.exports = { bootstrapProduction, validateInput, readPrivateConfig, BootstrapError };
