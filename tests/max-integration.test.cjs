"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createHmac, createHash, randomBytes, randomUUID } = require("node:crypto");
const fs = require("node:fs/promises");
const { existsSync, readdirSync } = require("node:fs");
const path = require("node:path");
const net = require("node:net");
const { pathToFileURL } = require("node:url");
const { createRequire } = require("node:module");
const { execFileSync } = require("node:child_process");

const workspace = path.resolve(__dirname, "..");
const recovered = path.join(workspace, "recovered");
const appRequire = createRequire(path.join(recovered, "package.json"));
const { Pool } = appRequire("pg");
const ids = {
  driver: "10000000-0000-4000-8000-000000000001",
  otherDriver: "10000000-0000-4000-8000-000000000002",
  specialist: "10000000-0000-4000-8000-000000000003",
  dispatcher: "10000000-0000-4000-8000-000000000004",
  admin: "10000000-0000-4000-8000-000000000005",
  mechanic: "10000000-0000-4000-8000-000000000006",
  trip: "70000000-0000-4000-8000-000000000001",
  otherTrip: "70000000-0000-4000-8000-000000000002",
};

async function freeLoopbackPort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

function signInitData(botToken, userId, extra = {}) {
  const params = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: randomUUID(),
    user: JSON.stringify({ id: Number(userId), first_name: "Synthetic integration user" }),
    ...extra,
  });
  const canonical = [...params.entries()]
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, value]) => `${key}=${value}`).join("\n");
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  params.set("hash", createHmac("sha256", secret).update(canonical).digest("hex"));
  return params.toString();
}

function originalScript(name) {
  const candidates = [
    path.join(recovered, "scripts", name),
    path.join(workspace, ".local/server-full/scripts", name),
  ];
  const found = candidates.find(existsSync);
  assert.ok(found, `Recovered ${name} must be available`);
  return found;
}

test("MAX authentication with migrated PostgreSQL and the actual HTTP API", { timeout: 120_000 }, async t => {
  const { default: EmbeddedPostgres } = await import(pathToFileURL(appRequire.resolve("embedded-postgres")));
  const nativeName = `@embedded-postgres/${process.platform === "win32" ? "windows" : process.platform}-${process.arch}`;
  const nativeRoot = path.dirname(path.dirname(appRequire.resolve(nativeName)));
  // npm --ignore-scripts skips this package's required native library symlinks.
  execFileSync(process.execPath, [path.join(nativeRoot, "scripts/hydrate-symlinks.js")], {
    cwd: nativeRoot,
    stdio: "pipe",
  });
  await fs.mkdir(path.join(workspace, ".local"), { recursive: true });
  const directory = await fs.mkdtemp(path.join(workspace, ".local/test-max-integration-"));
  await fs.chmod(directory, 0o700);
  const pgPort = await freeLoopbackPort();
  const pgPassword = randomBytes(32).toString("hex");
  const appPassword = randomBytes(32).toString("hex");
  const maxToken = `synthetic-max-${randomBytes(32).toString("hex")}`;
  const telegramToken = `100001:${randomBytes(32).toString("base64url")}`;
  const devKey = randomBytes(32).toString("hex");
  const migrationUrl = `postgresql://postgres:${pgPassword}@127.0.0.1:${pgPort}/max_integration`;
  const appUrl = `postgresql://transport_app:${appPassword}@127.0.0.1:${pgPort}/max_integration`;
  const pgLog = [];
  const cluster = new EmbeddedPostgres({
    databaseDir: path.join(directory, "db"),
    user: "postgres",
    password: pgPassword,
    port: pgPort,
    authMethod: "scram-sha-256",
    persistent: false,
    postgresFlags: ["-h", "127.0.0.1", "-c", "unix_socket_directories="],
    onLog: message => pgLog.push(String(message)),
    onError: message => pgLog.push(String(message)),
  });
  let app;
  let adminPool;
  let runtimePool;
  let started = false;
  const previousEnvironment = { ...process.env };
  t.after(async () => {
    try {
      if (app) await app.close();
      if (runtimePool) await runtimePool.end();
      if (adminPool) await adminPool.end();
    } finally {
      if (started) await cluster.stop();
      await fs.rm(directory, { recursive: true, force: true });
      for (const key of Object.keys(process.env)) if (!(key in previousEnvironment)) delete process.env[key];
      Object.assign(process.env, previousEnvironment);
    }
  });
  await cluster.initialise();
  await cluster.start();
  started = true;
  await cluster.createDatabase("max_integration");
  adminPool = new Pool({ connectionString: migrationUrl });
  // The recovered migrator must create its own restricted runtime role on a
  // completely fresh database before applying migrations which grant privileges.
  Object.assign(process.env, {
    NODE_ENV: "test",
    HOST: "127.0.0.1",
    DATABASE_URL: appUrl,
    MIGRATION_DATABASE_URL: migrationUrl,
    APP_DB_PASSWORD: appPassword,
    DEV_AUTH_ENABLED: "true",
    DEV_AUTH_KEY: devKey,
    DEMO_AUTH_ENABLED: "false",
    DEMO_EMPLOYEE_CREATION_ENABLED: "false",
    MAX_BOT_TOKEN: maxToken,
    TELEGRAM_BOT_TOKEN: telegramToken,
    TELEGRAM_COMMUNICATIONS_ENABLED: "false",
    TELEGRAM_ONBOARDING_ENABLED: "false",
    MAX_AUTH_MAX_AGE_SECONDS: "300",
    TELEGRAM_AUTH_MAX_AGE_SECONDS: "300",
    SESSION_TTL_SECONDS: "1800",
    TRUST_PROXY_LOOPBACK: "false",
    ALLOWED_ORIGINS: "http://127.0.0.1",
    PORT: "3000",
  });
  const scriptEnv = { ...process.env, NODE_PATH: path.join(recovered, "node_modules") };
  for (const script of ["migrate.cjs", "seed.cjs"]) {
    execFileSync(process.execPath, [originalScript(script)], { cwd: recovered, env: scriptEnv, stdio: "pipe" });
  }
  runtimePool = new Pool({ connectionString: appUrl });
  const { createApp } = appRequire(path.join(recovered, "apps/api/src/bootstrap.js"));
  ({ app } = await createApp());
  await app.listen(0, "127.0.0.1");
  const origin = `http://127.0.0.1:${app.getHttpServer().address().port}/api/v1`;
  async function request(method, route, body, bearer, extraHeaders = {}) {
    const response = await fetch(origin + route, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
        ...extraHeaders,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(10_000),
    });
    const result = await response.json();
    return { status: response.status, body: result };
  }
  function expectStatus(response, status) {
    // Do not include response bodies in failures: successful responses contain
    // ephemeral session/invitation tokens, even though all keys are test-only.
    assert.equal(response.status, status, `Expected HTTP ${status}, got ${response.status}`);
    return response.body;
  }
  const downloadBody = {
    filename: "test.csv",
    contentType: "text/csv;charset=utf-8",
    contentBase64: Buffer.from("a,b\n1,2").toString("base64"),
  };
  async function readDownload(url, method = "GET") {
    // The configured public origin is separate from the ephemeral listener;
    // preserve the returned path while sending only to this isolated test API.
    return fetch(new URL(new URL(url).pathname, new URL(origin).origin), {
      method, signal: AbortSignal.timeout(10_000),
    });
  }
  const providerId = "823456789";
  let adminSession;
  let maxSession;
  let telegramSession;
  let dispatcherSession;
  let invitation;

  await t.test("all recovered migrations apply and runtime database role is restricted", async () => {
    const migrations = (await adminPool.query("SELECT name FROM schema_migrations ORDER BY name")).rows.map(row => row.name);
    assert.deepEqual(migrations, readdirSync(path.join(recovered, "infra/db/migrations")).filter(name => name.endsWith(".sql")).sort());
    assert.ok(migrations.includes("017_max_auth.sql"));
    const privileges = (await runtimePool.query("SELECT rolsuper,rolcreatedb,rolcreaterole,rolbypassrls FROM pg_roles WHERE rolname=current_user")).rows[0];
    assert.deepEqual(privileges, { rolsuper: false, rolcreatedb: false, rolcreaterole: false, rolbypassrls: false });
  });

  await t.test("synthetic administrator can create an employee-specific MAX invitation", async () => {
    adminSession = expectStatus(await request("POST", "/auth/dev", { userId: ids.admin }, undefined, { "X-Dev-Auth-Key": devKey }), 200);
    invitation = expectStatus(await request("POST", "/access/max-invitations", { userId: ids.driver, maxUserId: providerId }, adminSession.accessToken), 201);
    assert.equal(invitation.userId, ids.driver);
    assert.match(invitation.invitationToken, /^[A-Za-z0-9_-]{43}$/);
  });

  await t.test("an invitation rejects a different signed MAX identity", async () => {
    expectStatus(await request("POST", "/auth/max", { initData: signInitData(maxToken, "999999999"), invitationToken: invitation.invitationToken }), 401);
    assert.equal((await adminPool.query("SELECT count(*)::int AS total FROM channel_identities")).rows[0].total, 0);
  });

  await t.test("failed first login rolls back replay and correct invitation then binds MAX", async () => {
    const initData = signInitData(maxToken, providerId);
    expectStatus(await request("POST", "/auth/max", { initData }), 401);
    maxSession = expectStatus(await request("POST", "/auth/max", { initData, invitationToken: invitation.invitationToken }), 200);
    assert.equal(maxSession.actor.id, ids.driver);
    assert.equal(maxSession.actor.channel, "max");
    assert.equal(maxSession.actor.role, "driver");
    assert.equal(maxSession.actor.grants.length, 1);
    const consumed = (await adminPool.query("SELECT consumed_at IS NOT NULL AS consumed FROM max_invitations WHERE user_id=$1", [ids.driver])).rows[0];
    assert.equal(consumed.consumed, true);
    expectStatus(await request("POST", "/auth/max", { initData, invitationToken: invitation.invitationToken }), 401);
  });

  await t.test("MAX bearer session exposes the same actor and only the assigned trip", async () => {
    const me = expectStatus(await request("GET", "/me", undefined, maxSession.accessToken), 200);
    assert.equal(me.id, ids.driver);
    assert.equal(me.channel, "max");
    const trips = expectStatus(await request("GET", "/trips", undefined, maxSession.accessToken), 200);
    assert.deepEqual(trips.items.map(trip => trip.id), [ids.trip]);
    expectStatus(await request("GET", `/trips/${ids.trip}`, undefined, maxSession.accessToken), 200);
    expectStatus(await request("GET", `/trips/${ids.otherTrip}`, undefined, maxSession.accessToken), 404);
  });

  await t.test("identical concurrent signed logins issue exactly one session", async () => {
    const initData = signInitData(maxToken, providerId);
    const before = (await adminPool.query("SELECT count(*)::int AS total FROM sessions WHERE user_id=$1 AND channel='max'", [ids.driver])).rows[0].total;
    const responses = await Promise.all([request("POST", "/auth/max", { initData }), request("POST", "/auth/max", { initData })]);
    assert.deepEqual(responses.map(result => result.status).sort(), [200, 401]);
    const after = (await adminPool.query("SELECT count(*)::int AS total FROM sessions WHERE user_id=$1 AND channel='max'", [ids.driver])).rows[0].total;
    assert.equal(after, before + 1);
    const reordered = [...new URLSearchParams(initData)].reverse();
    expectStatus(await request("POST", "/auth/max", { initData: new URLSearchParams(reordered).toString() }), 401);
  });

  await t.test("altered signature, expired payload, and Telegram-signed MAX payload are rejected", async () => {
    const params = new URLSearchParams(signInitData(maxToken, providerId));
    const hash = params.get("hash");
    params.set("hash", (hash[0] === "0" ? "1" : "0") + hash.slice(1));
    expectStatus(await request("POST", "/auth/max", { initData: params.toString() }), 401);
    expectStatus(await request("POST", "/auth/max", { initData: signInitData(maxToken, providerId, { auth_date: String(Math.floor(Date.now() / 1000) - 301) }) }), 401);
    expectStatus(await request("POST", "/auth/max", { initData: signInitData(telegramToken, providerId) }), 401);
  });

  await t.test("equal numeric MAX and Telegram identities remain attached to different employees", async () => {
    const tgInvitation = expectStatus(await request("POST", "/access/invitations", { userId: ids.otherDriver, telegramUserId: providerId }, adminSession.accessToken), 201);
    telegramSession = expectStatus(await request("POST", "/auth/telegram", { initData: signInitData(telegramToken, providerId), invitationToken: tgInvitation.invitationToken }), 200);
    assert.equal(telegramSession.actor.id, ids.otherDriver);
    assert.equal(telegramSession.actor.channel, "telegram");
    const binding = (await adminPool.query("SELECT provider,user_id FROM channel_identities WHERE provider_user_id=$1 ORDER BY provider", [providerId])).rows;
    assert.deepEqual(binding, [{ provider: "max", user_id: ids.driver }, { provider: "telegram", user_id: ids.otherDriver }]);
    const trips = expectStatus(await request("GET", "/trips", undefined, telegramSession.accessToken), 200);
    assert.deepEqual(trips.items.map(trip => trip.id), [ids.otherTrip]);
  });

  await t.test("MAX file download supports HEAD, exact bytes and secure attachment headers", async () => {
    const download = expectStatus(await request("POST", "/max/downloads", downloadBody, maxSession.accessToken), 201);
    assert.match(new URL(download.url).pathname, /^\/api\/v1\/max\/downloads\/[A-Za-z0-9_-]{43}$/);
    assert.ok(new Date(download.expiresAt).getTime() > Date.now());
    const head = await readDownload(download.url, "HEAD");
    assert.equal(head.status, 200);
    assert.equal(head.headers.get("content-type"), "text/csv;charset=utf-8");
    assert.equal(head.headers.get("content-length"), "7");
    assert.equal(await head.text(), "");
    const response = await readDownload(download.url);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), "a,b\n1,2");
    assert.equal(response.headers.get("content-disposition"), "attachment; filename=\"download\"; filename*=UTF-8''test.csv");
    assert.equal(response.headers.get("cache-control"), "no-store, private");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    assert.equal((await readDownload(download.url)).status, 404);
    assert.equal((await readDownload(download.url, "HEAD")).status, 404);
  });

  await t.test("download creation requires a MAX session and validates filenames and contents", async () => {
    expectStatus(await request("POST", "/max/downloads", downloadBody), 401);
    expectStatus(await request("POST", "/max/downloads", downloadBody, adminSession.accessToken), 403);
    expectStatus(await request("POST", "/max/downloads", downloadBody, telegramSession.accessToken), 403);
    for (const body of [
      {},
      { ...downloadBody, filename: "../test.csv" },
      { ...downloadBody, filename: "file\r\nX-Test: injected" },
      { ...downloadBody, contentType: "text/csv\r\nX-Test: injected" },
      { ...downloadBody, contentBase64: "invalid!" },
      { ...downloadBody, contentBase64: "" },
      { ...downloadBody, userId: ids.admin },
    ]) expectStatus(await request("POST", "/max/downloads", body, maxSession.accessToken), 400);
    assert.equal((await readDownload("http://127.0.0.1/api/v1/max/downloads/invalid-token")).status, 404);
  });

  await t.test("one download can be consumed only once under concurrent GET requests", async () => {
    const download = expectStatus(await request("POST", "/max/downloads", downloadBody, maxSession.accessToken), 201);
    const responses = await Promise.all([readDownload(download.url), readDownload(download.url)]);
    assert.deepEqual(responses.map(response => response.status).sort(), [200, 404]);
    assert.equal(await responses.find(response => response.status === 200).text(), "a,b\n1,2");
  });

  await t.test("MAX download body parser accepts real files larger than the default JSON limit", async () => {
    const bytes = Buffer.alloc(256 * 1024, "x");
    const download = expectStatus(await request("POST", "/max/downloads", {
      ...downloadBody, contentBase64: bytes.toString("base64"),
    }, maxSession.accessToken), 201);
    const response = await readDownload(download.url);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-length"), String(bytes.length));
    assert.equal(Buffer.compare(Buffer.from(await response.arrayBuffer()), bytes), 0);
  });

  await t.test("MAX download accepts the full 8 MiB file boundary without regex overflow", async () => {
    const bytes = Buffer.alloc(8 * 1024 * 1024, 1);
    const download = expectStatus(await request("POST", "/max/downloads", {
      filename: "boundary.bin", contentType: "application/octet-stream", contentBase64: bytes.toString("base64"),
    }, maxSession.accessToken), 201);
    const response = await readDownload(download.url);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-length"), String(bytes.length));
    assert.equal(Buffer.compare(Buffer.from(await response.arrayBuffer()), bytes), 0);
  });

  await t.test("MAX limits each employee to two pending files and frees capacity after consumption", async () => {
    const first = expectStatus(await request("POST", "/max/downloads", downloadBody, maxSession.accessToken), 201);
    const second = expectStatus(await request("POST", "/max/downloads", downloadBody, maxSession.accessToken), 201);
    expectStatus(await request("POST", "/max/downloads", downloadBody, maxSession.accessToken), 429);
    assert.equal((await readDownload(first.url)).status, 200);
    const third = expectStatus(await request("POST", "/max/downloads", downloadBody, maxSession.accessToken), 201);
    assert.equal((await readDownload(second.url)).status, 200);
    assert.equal((await readDownload(third.url)).status, 200);
  });

  await t.test("MAX attendance persists channel and audit through restricted runtime role", async () => {
    const attendance = expectStatus(await request("POST", `/workflow/trips/${ids.trip}/attendance`, {
      idempotencyKey: randomUUID(), kind: "accept", occurredAt: new Date().toISOString(),
    }, maxSession.accessToken), 201);
    const row = (await adminPool.query("SELECT channel,actor_id,kind FROM workflow_attendance WHERE id=$1", [attendance.id])).rows[0];
    assert.deepEqual(row, { channel: "max", actor_id: ids.driver, kind: "accept" });
    const audit = (await adminPool.query("SELECT payload->>'channel' AS channel FROM audit_events WHERE payload->>'action'='attendance.accept' ORDER BY sequence DESC LIMIT 1")).rows[0];
    assert.equal(audit.channel, "max");
  });

  await t.test("a MAX driver cannot administer invitations and invalid MAX IDs fail validation", async () => {
    expectStatus(await request("POST", "/access/max-invitations", { userId: ids.specialist, maxUserId: "12345678" }, maxSession.accessToken), 403);
    expectStatus(await request("POST", "/access/max-invitations", { userId: ids.specialist, maxUserId: "9007199254740992" }, adminSession.accessToken), 400);
    expectStatus(await request("POST", "/access/max-invitations", { userId: ids.specialist, maxUserId: "-1" }, adminSession.accessToken), 400);
  });

  await t.test("different MAX identities racing for one employee cannot create two bindings", async () => {
    const firstId = "734567890";
    const secondId = "734567891";
    const first = expectStatus(await request("POST", "/access/max-invitations", { userId: ids.dispatcher, maxUserId: firstId }, adminSession.accessToken), 201);
    // A historical/staged duplicate invitation is inserted only in this isolated
    // fixture to test the repository race beyond the normal invalidation flow.
    const secondToken = randomBytes(32).toString("base64url");
    await adminPool.query("INSERT INTO max_invitations(id,user_id,max_user_id,token_hash,expires_at,created_by) VALUES($1,$2,$3,$4,now()+interval '1 hour',$5)", [
      randomUUID(), ids.dispatcher, secondId, createHash("sha256").update(secondToken).digest("hex"), ids.admin,
    ]);
    const responses = await Promise.all([
      request("POST", "/auth/max", { initData: signInitData(maxToken, firstId), invitationToken: first.invitationToken }),
      request("POST", "/auth/max", { initData: signInitData(maxToken, secondId), invitationToken: secondToken }),
    ]);
    assert.deepEqual(responses.map(response => response.status).sort(), [200, 401]);
    dispatcherSession = responses.find(response => response.status === 200).body;
    const bindings = (await adminPool.query("SELECT provider_user_id FROM channel_identities WHERE provider='max' AND user_id=$1", [ids.dispatcher])).rows;
    assert.equal(bindings.length, 1);
    assert.ok([firstId, secondId].includes(bindings[0].provider_user_id));
  });

  await t.test("unknown MAX identity does not provision an employee or inherit Telegram access", async () => {
    const before = (await adminPool.query("SELECT count(*)::int AS total FROM users")).rows[0].total;
    expectStatus(await request("POST", "/auth/max", { initData: signInitData(maxToken, "923456789") }), 401);
    assert.equal((await adminPool.query("SELECT count(*)::int AS total FROM users")).rows[0].total, before);
    const unboundId = "523456789";
    const tgInvite = expectStatus(await request("POST", "/access/invitations", { userId: ids.specialist, telegramUserId: unboundId }, adminSession.accessToken), 201);
    expectStatus(await request("POST", "/auth/telegram", { initData: signInitData(telegramToken, unboundId), invitationToken: tgInvite.invitationToken }), 200);
    expectStatus(await request("POST", "/auth/max", { initData: signInitData(maxToken, unboundId), invitationToken: tgInvite.invitationToken }), 401);
  });

  await t.test("revocation invalidates MAX sessions and fresh MAX login while Telegram peer stays valid", async () => {
    const firstDownload = expectStatus(await request("POST", "/max/downloads", downloadBody, maxSession.accessToken), 201);
    const secondDownload = expectStatus(await request("POST", "/max/downloads", downloadBody, maxSession.accessToken), 201);
    expectStatus(await request("POST", `/access/users/${ids.driver}/revoke`, { reasonCode: "access_review" }, adminSession.accessToken), 200);
    expectStatus(await request("GET", "/me", undefined, maxSession.accessToken), 401);
    expectStatus(await request("GET", "/trips", undefined, maxSession.accessToken), 401);
    expectStatus(await request("POST", "/auth/max", { initData: signInitData(maxToken, providerId) }), 401);
    expectStatus(await request("GET", "/me", undefined, telegramSession.accessToken), 200);
    assert.equal((await readDownload(firstDownload.url)).status, 404);
    assert.equal((await readDownload(secondDownload.url, "HEAD")).status, 404);
    assert.equal((await readDownload(secondDownload.url)).status, 404);
  });

  await t.test("revocation also expires outstanding MAX invitations", async () => {
    const invite = expectStatus(await request("POST", "/access/max-invitations", { userId: ids.specialist, maxUserId: "423456789" }, adminSession.accessToken), 201);
    expectStatus(await request("POST", `/access/users/${ids.specialist}/revoke`, { reasonCode: "employment_ended" }, adminSession.accessToken), 200);
    expectStatus(await request("POST", "/auth/max", { initData: signInitData(maxToken, "423456789"), invitationToken: invite.invitationToken }), 401);
    const row = (await adminPool.query("SELECT expires_at <= now() AS expired FROM max_invitations WHERE user_id=$1", [ids.specialist])).rows[0];
    assert.equal(row.expired, true);
  });

  await t.test("MAX session logout revokes the bearer token", async () => {
    const download = expectStatus(await request("POST", "/max/downloads", downloadBody, dispatcherSession.accessToken), 201);
    expectStatus(await request("POST", "/auth/logout", {}, dispatcherSession.accessToken), 200);
    expectStatus(await request("GET", "/me", undefined, dispatcherSession.accessToken), 401);
    assert.equal((await readDownload(download.url)).status, 404);
  });
});
