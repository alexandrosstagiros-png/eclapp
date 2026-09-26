"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs/promises");
const { randomBytes } = require("node:crypto");
const { createRequire } = require("node:module");
const { spawnSync } = require("node:child_process");
const { createTestServer } = require("./local-test-server.cjs");
const { applicationConnectionString } = require("../recovered/scripts/migrate.cjs");
const recovered = path.resolve(__dirname, "../recovered");
const appRequire = createRequire(path.join(recovered, "package.json"));
const { Pool } = appRequire("pg");

test("external runtime connection replaces credentials while retaining the same database and TLS options", () => {
  const password = "Synthetic %:/?@#& password=32";
  const result = applicationConnectionString("postgresql://admin:admin-secret@db.example:5433/transport?sslmode=verify-full&sslrootcert=%2Fetc%2Fssl%2Fdb.pem&user=admin&password=override", password);
  const url = new URL(result);
  assert.equal(url.username, "transport_app");
  assert.equal(decodeURIComponent(url.password), password);
  assert.equal(url.hostname, "db.example"); assert.equal(url.port, "5433"); assert.equal(url.pathname, "/transport");
  assert.equal(url.searchParams.get("sslmode"), "verify-full");
  assert.equal(url.searchParams.get("sslrootcert"), "/etc/ssl/db.pem");
  assert.equal(url.searchParams.has("user"), false); assert.equal(url.searchParams.has("password"), false);
  assert.throws(() => applicationConnectionString("https://db.example/transport", password), /protocol/);
});

test("managed PostgreSQL migrations succeed without role-management privileges and fail before writes for unsafe credentials", { timeout: 180000 }, async t => {
  // The existing fixture also exercises unchanged default/internal migration.
  // Every database and credential below belongs to its disposable PG17 cluster.
  const fixture = await createTestServer();
  let db;
  const clientEnds = new Set();
  t.after(async () => {
    if (db) { await db.end(); await Promise.all([...clientEnds]); }
    await fixture.close();
  });
  const ownerPassword = randomBytes(24).toString("base64url");
  const appPassword = "Synthetic %:/?@#& application password=32";
  await fixture.adminPool.query("CREATE ROLE synthetic_managed_owner LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOINHERIT");
  const ownerAlter = (await fixture.adminPool.query("SELECT format('ALTER ROLE synthetic_managed_owner PASSWORD %L', $1::text) AS sql", [ownerPassword])).rows[0].sql;
  await fixture.adminPool.query(ownerAlter);
  const appAlter = (await fixture.adminPool.query("SELECT format('ALTER ROLE transport_app PASSWORD %L', $1::text) AS sql", [appPassword])).rows[0].sql;
  await fixture.adminPool.query(appAlter);
  await fixture.adminPool.query("CREATE DATABASE external_role_test OWNER synthetic_managed_owner");
  const migrationUrl = new URL(process.env.MIGRATION_DATABASE_URL);
  migrationUrl.pathname = "/external_role_test";
  migrationUrl.username = "synthetic_managed_owner";
  migrationUrl.password = encodeURIComponent(ownerPassword);
  db = new Pool({ connectionString: migrationUrl.href, max: 1 });
  db.on("connect", client => {
    const ended = new Promise(resolve => client.once("end", resolve));
    clientEnds.add(ended); ended.then(() => clientEnds.delete(ended));
  });
  const settings = { ...process.env, NODE_ENV: "production", MIGRATION_DATABASE_URL: migrationUrl.href,
    APP_DB_ROLE_MANAGEMENT: "external", APP_DB_PASSWORD: appPassword };
  const run = patch => spawnSync(process.execPath, [path.join(recovered, "scripts/migrate.cjs")], {
    cwd: recovered, env: { ...settings, ...patch }, encoding: "utf8", timeout: 45000,
  });
  const noSecrets = result => {
    for (const secret of [ownerPassword, appPassword, migrationUrl.href])
      assert.equal((result.stdout + result.stderr).includes(secret), false);
  };
  const noSchemaWrites = async () => {
    assert.equal((await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public'")).rowCount, 0);
  };

  await t.test("missing role is refused before schema_migrations is created", async () => {
    await fixture.adminPool.query("ALTER ROLE transport_app RENAME TO synthetic_saved_runtime");
    try {
      const result = run(); noSecrets(result);
      assert.equal(result.status, 1); assert.match(result.stderr, /pre-created transport_app/);
      await noSchemaWrites();
    } finally { await fixture.adminPool.query("ALTER ROLE synthetic_saved_runtime RENAME TO transport_app"); }
  });

  await t.test("elevated flags and non-login runtime roles are refused before schema writes", async () => {
    for (const [unsafe, safe] of [["SUPERUSER", "NOSUPERUSER"], ["CREATEDB", "NOCREATEDB"], ["CREATEROLE", "NOCREATEROLE"], ["BYPASSRLS", "NOBYPASSRLS"], ["NOLOGIN", "LOGIN"]]) {
      await fixture.adminPool.query(`ALTER ROLE transport_app ${unsafe}`);
      try {
        const result = run(); noSecrets(result);
        assert.equal(result.status, 1, unsafe); assert.match(result.stderr, /without elevated database privileges/);
        await noSchemaWrites();
      } finally { await fixture.adminPool.query(`ALTER ROLE transport_app ${safe}`); }
    }
  });

  await t.test("wrong password and invalid role-management mode fail before schema writes", async () => {
    const wrong = run({ APP_DB_PASSWORD: "Wrong-synthetic-password-32" }); noSecrets(wrong);
    assert.equal(wrong.status, 1); assert.match(wrong.stderr, /Cannot authenticate/);
    await noSchemaWrites();
    const invalid = run({ APP_DB_ROLE_MANAGEMENT: "automatic" }); noSecrets(invalid);
    assert.equal(invalid.status, 1); assert.match(invalid.stderr, /must be internal or external/);
    await noSchemaWrites();
  });

  await t.test("unprivileged database owner applies and repeats all migrations without altering runtime credentials", async () => {
    const permissions = (await db.query(`SELECT rolsuper,rolcreatedb,rolcreaterole,rolbypassrls,
      (SELECT count(*)::int FROM pg_auth_members WHERE member=r.oid) AS memberships
      FROM pg_roles r WHERE rolname=current_user`)).rows[0];
    assert.deepEqual(permissions, { rolsuper: false, rolcreatedb: false, rolcreaterole: false, rolbypassrls: false, memberships: 0 });
    const before = (await fixture.adminPool.query("SELECT rolpassword FROM pg_authid WHERE rolname='transport_app'")).rows[0].rolpassword;
    const first = run(); noSecrets(first);
    assert.equal(first.status, 0, first.stderr); assert.match(first.stdout, /Applied: 065_/);
    assert.equal((await db.query("SELECT extname FROM pg_extension WHERE extname='pgcrypto'")).rowCount, 1);
    assert.equal((await db.query("SELECT tableowner FROM pg_tables WHERE schemaname='public' AND tablename='users'")).rows[0].tableowner, "synthetic_managed_owner");
    const repeated = run(); noSecrets(repeated);
    assert.equal(repeated.status, 0, repeated.stderr); assert.match(repeated.stdout, /Unchanged: 065_/);
    assert.equal((await fixture.adminPool.query("SELECT rolpassword FROM pg_authid WHERE rolname='transport_app'")).rows[0].rolpassword, before);
    assert.equal((await db.query("SELECT 1 FROM users")).rowCount, 0);
  });

  await t.test("production bootstrap and HTTP login work against externally provisioned runtime role", async () => {
    const bootstrap = { phone: "+79990008124", name: "Synthetic managed administrator", password: "Synthetic-production-login-32", organizationName: "Synthetic managed organization" };
    const configPath = path.join(fixture.directory, "external-bootstrap.json");
    await fs.writeFile(configPath, JSON.stringify(bootstrap), { mode: 0o600 });
    const result = spawnSync(process.execPath, [path.join(recovered, "scripts/bootstrap-production.cjs"), "--config", configPath], {
      cwd: recovered, env: settings, encoding: "utf8", timeout: 20000,
    });
    noSecrets(result); assert.equal((result.stdout + result.stderr).includes(bootstrap.password), false);
    assert.equal(result.status, 0, result.stderr);
    const created = JSON.parse(result.stdout);
    Object.assign(process.env, settings, {
      DATABASE_URL: applicationConnectionString(migrationUrl.href, appPassword),
      DEV_AUTH_ENABLED: "false", DEMO_AUTH_ENABLED: "false", DEMO_EMPLOYEE_CREATION_ENABLED: "false",
      ALLOWED_ORIGINS: "https://managed-bootstrap.example.invalid", LOCAL_ONE_C_ENABLED: "false", ONE_C_HTTP_ENABLED: "false",
      MAX_NOTIFICATIONS_ENABLED: "false", TELEGRAM_COMMUNICATIONS_ENABLED: "false", TELEGRAM_ONBOARDING_ENABLED: "false",
    });
    delete process.env.DEV_AUTH_KEY;
    await fixture.restartApi();
    assert.equal((await fixture.request("GET", "/health/ready")).status, 200);
    const login = await fixture.request("POST", "/auth/password", { phone: bootstrap.phone, password: bootstrap.password, rememberDevice: false });
    assert.equal(login.status, 200); assert.equal(login.body.actor.id, created.userId);
    assert.equal((await fixture.request("GET", "/access/employees/options", undefined, login.body.accessToken)).status, 200);
  });
});
