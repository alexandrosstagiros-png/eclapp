"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { randomUUID } = require("node:crypto");
const { createRequire } = require("node:module");
const { spawn, execFileSync } = require("node:child_process");
const { createTestServer } = require("./local-test-server.cjs");
const { validateInput, readPrivateConfig } = require("../recovered/scripts/bootstrap-production.cjs");
const recovered = path.resolve(__dirname, "../recovered");
const appRequire = createRequire(path.join(recovered, "package.json"));
const { Pool } = appRequire("pg");
const script = path.join(recovered, "scripts/bootstrap-production.cjs");
const config = {
  phone: "+79990008123", name: "Synthetic production administrator",
  password: "Synthetic-bootstrap-password-32", organizationName: "Synthetic production company",
};

test("production bootstrap validates private configuration without printing supplied values", async t => {
  assert.equal(validateInput({ ...config, phone: "8 (999) 000-81-23" }).phone, config.phone);
  for (const patch of [{ phone: "invalid" }, { password: "too short" }, { organizationName: "" }, { name: "name\nline" }, { timeZone: "not/a/timezone" }, { extra: true }])
    assert.throws(() => validateInput({ ...config, ...patch }));
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ecl-bootstrap-config-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const filename = path.join(directory, "input.json");
  await fs.writeFile(filename, JSON.stringify(config), { mode: 0o600 });
  assert.equal(readPrivateConfig(filename).name, config.name);
  await fs.chmod(filename, 0o644);
  assert.throws(() => readPrivateConfig(filename), /private regular file/);
  await fs.chmod(filename, 0o600);
  const link = path.join(directory, "link.json");
  await fs.symlink(filename, link);
  assert.throws(() => readPrivateConfig(link), /Cannot read/);
  await fs.writeFile(filename, "{" + config.password);
  assert.throws(() => readPrivateConfig(filename), error => !error.message.includes(config.password) && /valid JSON/.test(error.message));
});

test("empty production bootstrap is atomic, refuses existing data and enables the real restricted HTTP API", { timeout: 180000 }, async t => {
  // Reuse the existing disposable PG17 fixture, then make a separate unseeded
  // database. No production connection or personal local data is ever read.
  const fixture = await createTestServer();
  let db;
  const clientEnds = new Set();
  t.after(async () => {
    if (db) { await db.end(); await Promise.all([...clientEnds]); }
    await fixture.close();
  });
  await fixture.adminPool.query("CREATE DATABASE production_bootstrap_test");
  const migrationUrl = new URL(process.env.MIGRATION_DATABASE_URL);
  migrationUrl.pathname = "/production_bootstrap_test";
  const runtimeUrl = new URL(process.env.DATABASE_URL);
  runtimeUrl.pathname = "/production_bootstrap_test";
  db = new Pool({ connectionString: migrationUrl.href, max: 2 });
  db.on("connect", client => {
    const ended = new Promise(resolve => client.once("end", resolve));
    clientEnds.add(ended); ended.then(() => clientEnds.delete(ended));
  });
  Object.assign(process.env, {
    NODE_ENV: "production", MIGRATION_DATABASE_URL: migrationUrl.href, DATABASE_URL: runtimeUrl.href,
    DEV_AUTH_ENABLED: "false", DEMO_AUTH_ENABLED: "false", DEMO_EMPLOYEE_CREATION_ENABLED: "false",
    ALLOWED_ORIGINS: "https://bootstrap.example.invalid", LOCAL_ONE_C_ENABLED: "false", ONE_C_HTTP_ENABLED: "false",
    MAX_NOTIFICATIONS_ENABLED: "false", TELEGRAM_COMMUNICATIONS_ENABLED: "false", TELEGRAM_ONBOARDING_ENABLED: "false",
  });
  delete process.env.DEV_AUTH_KEY;
  execFileSync(process.execPath, [path.join(recovered, "scripts/migrate.cjs")], { cwd: recovered, env: process.env, stdio: "pipe", timeout: 30000 });
  const filename = path.join(fixture.directory, "production-bootstrap.json");
  await fs.writeFile(filename, JSON.stringify(config), { mode: 0o600 });
  const run = () => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, "--config", filename], { cwd: recovered, env: { ...process.env }, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    const timeout = setTimeout(() => child.kill("SIGKILL"), 20000);
    child.stdout.setEncoding("utf8").on("data", value => { stdout += value; });
    child.stderr.setEncoding("utf8").on("data", value => { stderr += value; });
    child.on("error", error => { clearTimeout(timeout); reject(error); });
    child.on("close", status => { clearTimeout(timeout); resolve({ status, stdout, stderr }); });
  });
  const noSecrets = result => {
    assert.equal((result.stdout + result.stderr).includes(config.password), false);
    assert.equal((result.stdout + result.stderr).includes(config.phone), false);
    assert.equal((result.stdout + result.stderr).includes(migrationUrl.href), false);
  };
  const empty = async () => {
    const result = await db.query(`SELECT (SELECT count(*) FROM users) AS users,
      (SELECT count(*) FROM legal_entities) AS companies,(SELECT count(*) FROM phone_credentials) AS credentials,
      (SELECT count(*) FROM audit_events) AS audit`);
    assert.deepEqual(result.rows[0], { users: "0", companies: "0", credentials: "0", audit: "0" });
  };

  await t.test("refuses an incompletely migrated release", async () => {
    const migration = (await db.query("SELECT name,checksum FROM schema_migrations ORDER BY name DESC LIMIT 1")).rows[0];
    await db.query("UPDATE schema_migrations SET checksum=$2 WHERE name=$1", [migration.name, "0".repeat(64)]);
    const result = await run(); noSecrets(result);
    assert.equal(result.status, 1); assert.match(result.stderr, /migrations do not match/);
    await empty();
    await db.query("UPDATE schema_migrations SET checksum=$2 WHERE name=$1", [migration.name, migration.checksum]);
  });

  await t.test("refuses unrelated existing business data without adding an administrator", async () => {
    const id = randomUUID();
    await db.query("INSERT INTO vehicles(id,label,body_type,capacity_kg,fleet_type) VALUES($1,'Synthetic existing vehicle','box',1000,'own')", [id]);
    const result = await run(); noSecrets(result);
    assert.equal(result.status, 1); assert.match(result.stderr, /empty application database/);
    await empty();
    assert.equal((await db.query("SELECT id FROM vehicles WHERE id=$1", [id])).rowCount, 1);
    await db.query("DELETE FROM vehicles WHERE id=$1", [id]);
  });

  await t.test("rolls back all identity and organization records when a later insert fails", async () => {
    await db.query(`CREATE FUNCTION bootstrap_test_reject() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'Synthetic credential insert failure'; END $$;
      CREATE TRIGGER bootstrap_test_reject BEFORE INSERT ON phone_credentials FOR EACH ROW EXECUTE FUNCTION bootstrap_test_reject()`);
    const result = await run(); noSecrets(result);
    assert.equal(result.status, 1); assert.equal(result.stdout, "");
    assert.doesNotMatch(result.stderr, /Synthetic credential insert failure/);
    await empty();
    for (const table of ["regions", "projects", "responsibility_scopes", "access_grants", "employee_directory"])
      assert.equal((await db.query(`SELECT 1 FROM ${table}`)).rowCount, 0);
    await db.query("DROP TRIGGER bootstrap_test_reject ON phone_credentials; DROP FUNCTION bootstrap_test_reject()");
  });

  let created;
  await t.test("concurrent bootstrap creates exactly one approved administrator and no demo records", async () => {
    const results = await Promise.all([run(), run()]);
    results.forEach(noSecrets);
    assert.deepEqual(results.map(result => result.status).sort(), [0, 1]);
    const succeeded = results.find(result => result.status === 0);
    assert.equal(succeeded.stderr, "");
    created = JSON.parse(succeeded.stdout);
    assert.equal(created.status, "created");
    const users = (await db.query("SELECT id,role,active,approved FROM users")).rows;
    assert.deepEqual(users, [{ id: created.userId, role: "access_admin", active: true, approved: true }]);
    for (const table of ["trips", "vehicles", "recruitment_candidates", "tender_items", "team_messages"])
      assert.equal((await db.query(`SELECT 1 FROM ${table}`)).rowCount, 0);
    const employee = (await db.query("SELECT source_kind FROM employee_directory WHERE user_id=$1", [created.userId])).rows[0];
    assert.equal(employee.source_kind, "existing");
    const stored = (await db.query("SELECT password_salt,password_hash,hash_algorithm FROM phone_credentials")).rows[0];
    assert.match(stored.password_hash, /^[a-f0-9]{128}$/); assert.match(stored.password_salt, /^[a-f0-9]{64}$/);
    assert.equal(stored.hash_algorithm, "scrypt-v1");
    assert.equal(JSON.stringify((await db.query("SELECT payload FROM audit_events")).rows).includes(config.password), false);
  });

  await t.test("repeat invocation cannot replace the existing password", async () => {
    const before = (await db.query("SELECT password_hash FROM phone_credentials")).rows[0].password_hash;
    await fs.writeFile(filename, JSON.stringify({ ...config, password: "Different-synthetic-password-32" }), { mode: 0o600 });
    const result = await run(); noSecrets(result);
    assert.equal(result.status, 1); assert.match(result.stderr, /empty application database/);
    assert.equal((await db.query("SELECT password_hash FROM phone_credentials")).rows[0].password_hash, before);
  });

  await t.test("password login, administration and readiness work in production with least privilege", async () => {
    await fixture.restartApi();
    assert.equal((await fixture.request("GET", "/health/ready")).status, 200);
    assert.equal((await fixture.request("POST", "/auth/dev", { userId: created.userId })).status, 404);
    const login = await fixture.request("POST", "/auth/password", { phone: config.phone, password: config.password, rememberDevice: false });
    assert.equal(login.status, 200);
    assert.equal(login.body.actor.id, created.userId); assert.equal(login.body.actor.role, "access_admin");
    assert.equal(login.body.actor.grants.length, 1);
    assert.equal(login.body.actor.grants[0].personalDataVisible, true);
    const options = await fixture.request("GET", "/access/employees/options", undefined, login.body.accessToken);
    assert.equal(options.status, 200); assert.equal(options.body.demoCreationEnabled, false);
    assert.equal(options.body.plannerCreationEnabled, true); assert.equal(options.body.recruiterCreationEnabled, true);
    const directory = await fixture.request("GET", "/access/employees", undefined, login.body.accessToken);
    assert.equal(directory.status, 200); assert.equal(directory.body.items.length, 1);
    const privileges = (await db.query(`SELECT rolsuper,rolcreatedb,rolcreaterole,rolbypassrls,
      has_table_privilege('transport_app','audit_events','UPDATE,DELETE,TRUNCATE') AS audit_mutation
      FROM pg_roles WHERE rolname='transport_app'`)).rows[0];
    assert.deepEqual(privileges, { rolsuper: false, rolcreatedb: false, rolcreaterole: false, rolbypassrls: false, audit_mutation: false });
  });
});
