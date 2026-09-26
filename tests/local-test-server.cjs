"use strict";

// Disposable PostgreSQL + real API + same-origin static frontend for regression
// tests and manual browser checks. This never reads a .env file or remote DB URL.
const fs = require("node:fs/promises");
const path = require("node:path");
const http = require("node:http");
const net = require("node:net");
const { randomBytes } = require("node:crypto");
const { createRequire } = require("node:module");
const { pathToFileURL } = require("node:url");
const { execFileSync } = require("node:child_process");

const workspace = path.resolve(__dirname, "..");
const recovered = path.join(workspace, "recovered");
const appRequire = createRequire(path.join(recovered, "package.json"));
const { Pool } = appRequire("pg");
const { ids } = appRequire(path.join(recovered, "scripts/seed.cjs"));

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

async function createTestServer({ staffTeamActors = false, telegramOnboarding = false, inspectionPhotoMaintenance = false, builtFrontend = false, builtFrontendRoot = process.env.PLANNING_FRONTEND_ROOT } = {}) {
  const previousEnvironment = { ...process.env };
  const { default: EmbeddedPostgres } = await import(pathToFileURL(appRequire.resolve("embedded-postgres")));
  const nativeName = `@embedded-postgres/${process.platform === "win32" ? "windows" : process.platform}-${process.arch}`;
  const nativeRoot = path.dirname(path.dirname(appRequire.resolve(nativeName)));
  execFileSync(process.execPath, [path.join(nativeRoot, "scripts/hydrate-symlinks.js")], { cwd: nativeRoot, stdio: "pipe" });
  await fs.mkdir(path.join(workspace, ".local"), { recursive: true });
  const directory = await fs.mkdtemp(path.join(workspace, ".local/test-password-"));
  await fs.chmod(directory, 0o700);
  const pgPort = await freePort();
  const pgPassword = randomBytes(32).toString("hex");
  const appPassword = randomBytes(32).toString("hex");
  const devKey = randomBytes(32).toString("hex");
  const cluster = new EmbeddedPostgres({
    databaseDir: path.join(directory, "db"), user: "postgres", password: pgPassword,
    port: pgPort, authMethod: "scram-sha-256", persistent: false,
    postgresFlags: ["-h", "127.0.0.1", "-c", "unix_socket_directories="],
    onLog() {}, onError() {},
  });
  let app;
  let apiOrigin;
  let adminPool;
  const adminClientEnds = new Set();
  let server;
  let started = false;
  let closed = false;
  async function close() {
    if (closed) return;
    closed = true;
    try {
      if (server) await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
      if (app) await app.close();
      if (adminPool) {
        await adminPool.end();
        // pg-pool can resolve end() after removing idle clients from its list,
        // before their sockets actually emit end. Stopping PostgreSQL in that
        // gap sends 57P01 to an otherwise idle test client and fails the suite.
        await Promise.all([...adminClientEnds]);
      }
    } finally {
      if (started) await cluster.stop();
      await fs.rm(directory, { recursive: true, force: true });
      for (const key of Object.keys(process.env)) if (!(key in previousEnvironment)) delete process.env[key];
      Object.assign(process.env, previousEnvironment);
    }
  }
  try {
    await cluster.initialise();
    await cluster.start();
    started = true;
    await cluster.createDatabase("password_test");
    const migrationUrl = `postgresql://postgres:${pgPassword}@127.0.0.1:${pgPort}/password_test`;
    adminPool = new Pool({ connectionString: migrationUrl });
    adminPool.on("connect", client => {
      const ended = new Promise(resolve => client.once("end", resolve));
      adminClientEnds.add(ended);
      ended.then(() => adminClientEnds.delete(ended));
    });
    await adminPool.query("CREATE ROLE transport_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT");
    const frontendRoot = builtFrontend && builtFrontendRoot ? path.resolve(builtFrontendRoot) : path.join(recovered, builtFrontend ? "apps/office-web/dist" : "apps/office-web/src");
    server = http.createServer(async (incoming, outgoing) => {
      const url = new URL(incoming.url, "http://127.0.0.1");
      if (url.pathname.startsWith("/api/")) {
        if (!apiOrigin) { outgoing.writeHead(503); outgoing.end(); return; }
        const upstream = http.request(new URL(incoming.url, apiOrigin), {
          method: incoming.method, headers: { ...incoming.headers, host: new URL(apiOrigin).host },
        }, response => { outgoing.writeHead(response.statusCode, response.headers); response.pipe(outgoing); });
        upstream.on("error", () => { outgoing.writeHead(502); outgoing.end(); });
        incoming.pipe(upstream);
        return;
      }
      let relative;
      if (!builtFrontend && url.pathname === "/assets/app.js") relative = "app.js";
      else if (!builtFrontend && /^\/assets\/planning(?:-model|-templates|-fields|-builder|-calendar|-calendar-model)?\.js$/.test(url.pathname)) relative = path.basename(url.pathname);
      else if (!builtFrontend && /^\/assets\/recruitment(?:-model|-onboarding)?\.js$/.test(url.pathname)) relative = path.basename(url.pathname);
      else if (!builtFrontend && url.pathname === "/assets/tenders.js") relative = "tenders.js";
      else if (!builtFrontend && url.pathname === "/assets/birthdays.js") relative = "birthdays.js";
      else if (!builtFrontend && /^\/assets\/(?:attachment-photos|inspection-workflow|chief-mechanic-access|employee-planning-access)\.js$/.test(url.pathname)) relative = path.basename(url.pathname);
      else if (!builtFrontend && url.pathname === "/assets/profile.js") relative = "profile.js";
      else if (!builtFrontend && url.pathname === "/assets/driver-requests.js") relative = "driver-requests.js";
      else if (!builtFrontend && url.pathname === "/assets/development.js") relative = "development.js";
      else if (!builtFrontend && /^\/assets\/team(?:-media|-tasks|-outcomes|-notifications|-response-metrics)?\.js$/.test(url.pathname)) relative = path.basename(url.pathname);
      else if (!builtFrontend && /^\/assets\/fleet-(maintenance|operations)\.js$/.test(url.pathname)) relative = path.basename(url.pathname);
      else if (url.pathname === "/favicon.svg") relative = "favicon.svg";
      else if (/^\/assets\/[a-zA-Z0-9_.-]+$/.test(url.pathname)) relative = url.pathname.slice(1);
      else if (url.pathname === "/" || !path.extname(url.pathname)) relative = "index.html";
      if (!relative) { outgoing.writeHead(404); outgoing.end(); return; }
      try {
        let bytes = await fs.readFile(path.join(frontendRoot, relative));
        if (!builtFrontend && relative === "assets/app.css") bytes = Buffer.concat([bytes, Buffer.from('\n'), await fs.readFile(path.join(frontendRoot, 'assets/planning.css')), Buffer.from('\n'), await fs.readFile(path.join(frontendRoot, 'assets/planning-builder.css')), Buffer.from('\n'), await fs.readFile(path.join(frontendRoot, 'assets/planning-calendar.css')), Buffer.from('\n'), await fs.readFile(path.join(frontendRoot, 'assets/recruitment.css')), Buffer.from('\n'), await fs.readFile(path.join(frontendRoot, 'assets/tenders.css'))]);
        if (!builtFrontend && relative === "assets/app.css") bytes = Buffer.concat([bytes,Buffer.from('\n'),await fs.readFile(path.join(frontendRoot,'assets/fleet-maintenance.css')),Buffer.from('\n'),await fs.readFile(path.join(frontendRoot,'assets/fleet-operations.css')),Buffer.from('\n'),await fs.readFile(path.join(frontendRoot,'assets/team.css')),Buffer.from('\n'),await fs.readFile(path.join(frontendRoot,'assets/driver-requests.css')),Buffer.from('\n'),await fs.readFile(path.join(frontendRoot,'assets/team-tasks.css')),Buffer.from('\n'),await fs.readFile(path.join(frontendRoot,'assets/team-outcomes.css')),Buffer.from('\n'),await fs.readFile(path.join(frontendRoot,'assets/profile.css')),Buffer.from('\n'),await fs.readFile(path.join(frontendRoot,'assets/birthdays.css')),Buffer.from('\n'),await fs.readFile(path.join(frontendRoot,'assets/attachment-photos.css')),Buffer.from('\n'),await fs.readFile(path.join(frontendRoot,'assets/inspection-workflow.css')),Buffer.from('\n'),await fs.readFile(path.join(frontendRoot,'assets/employee-planning-access.css'))]);
        if (!builtFrontend && relative === "assets/app.css") bytes = Buffer.concat([bytes,Buffer.from('\n'),await fs.readFile(path.join(frontendRoot,'assets/recruitment-onboarding.css'))]);
        const types = { ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8", ".svg": "image/svg+xml" };
        outgoing.writeHead(200, { "Content-Type": types[path.extname(relative)] ?? "application/octet-stream", "Cache-Control": "no-store" });
        outgoing.end(bytes);
      } catch { outgoing.writeHead(404); outgoing.end(); }
    });
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const origin = `http://127.0.0.1:${server.address().port}`;
    Object.assign(process.env, {
      NODE_ENV: "test", HOST: "127.0.0.1", PORT: "3000",
      DATABASE_URL: `postgresql://transport_app:${appPassword}@127.0.0.1:${pgPort}/password_test`,
      MIGRATION_DATABASE_URL: migrationUrl, APP_DB_PASSWORD: appPassword,
      DEV_AUTH_ENABLED: "true", DEV_AUTH_KEY: devKey,
      DEMO_AUTH_ENABLED: "false", DEMO_EMPLOYEE_CREATION_ENABLED: "true",
      MAX_BOT_TOKEN: `synthetic-max-${randomBytes(32).toString("hex")}`,
      TELEGRAM_BOT_TOKEN: `100001:${randomBytes(32).toString("base64url")}`,
      TELEGRAM_COMMUNICATIONS_ENABLED: "false", TELEGRAM_ONBOARDING_ENABLED: "false",
      INSPECTION_PHOTO_MAINTENANCE_ENABLED: String(inspectionPhotoMaintenance),
      MAX_AUTH_MAX_AGE_SECONDS: "300", TELEGRAM_AUTH_MAX_AGE_SECONDS: "300",
      SESSION_TTL_SECONDS: "1800", TRUST_PROXY_LOOPBACK: "false", ALLOWED_ORIGINS: origin,
      ONBOARDING_PHOTO_DIR: path.join(directory, 'onboarding-photos'),
    });
    // Disposable tests must never inherit a paid OCR credential or real spool.
    delete process.env.YANDEX_OCR_API_KEY;
    delete process.env.YANDEX_OCR_FOLDER_ID;
    delete process.env.VK_OCR_TOKEN;
    delete process.env.ONBOARDING_OCR_PROVIDER;
    if (telegramOnboarding) Object.assign(process.env, {
      TELEGRAM_ONBOARDING_ENABLED: "true",
      TELEGRAM_BOT_USERNAME: "synthetic_ecl_bot",
      TELEGRAM_WEBHOOK_SECRET: randomBytes(32).toString("hex"),
      TELEGRAM_MINIAPP_URL: "https://synthetic-fixture.invalid/",
      ALLOWED_ORIGINS: `${origin},https://synthetic-fixture.invalid`,
    });
    for (const script of ["migrate.cjs", "seed.cjs"]) {
      execFileSync(process.execPath, [path.join(recovered, "scripts", script)], { cwd: recovered, env: process.env, stdio: "pipe" });
    }
    if (staffTeamActors) await adminPool.query("UPDATE users SET role='dispatcher' WHERE id=ANY($1::uuid[])", [ids.drivers]);
    const { createApp } = appRequire(path.join(recovered, "apps/api/src/bootstrap.js"));
    async function restartApi() {
      if (app) await app.close();
      ({ app } = await createApp());
      await app.listen(0, "127.0.0.1");
      apiOrigin = `http://127.0.0.1:${app.getHttpServer().address().port}`;
    }
    await restartApi();
    async function request(method, route, body, bearer, headers = {}) {
      const response = await fetch(`${origin}/api/v1${route}`, {
        method, headers: { "Content-Type": "application/json", ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}), ...headers },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(10_000),
      });
      return { status: response.status, body: await response.json() };
    }
    async function devLogin(userId) {
      const result = await request("POST", "/auth/dev", { userId }, undefined, { "X-Dev-Auth-Key": devKey });
      if (result.status !== 200) throw new Error(`Synthetic dev login returned ${result.status}`);
      return result.body;
    }
    return { adminPool, origin, request, devLogin, ids, close, directory, restartApi };
  } catch (error) { await close(); throw error; }
}

async function main() {
  const fixture = await createTestServer();
  for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, async () => { await fixture.close(); process.exit(0); });
  try {
    const profiles = [];
    // Each response is a freshly generated password for this disposable database.
    for (const [userId, phone, role] of [[ids.admin, "+79990000001", "access_admin"], [ids.drivers[0], "+79990000002", "driver"]]) {
      const admin = await fixture.devLogin(ids.admin);
      const response = await fixture.request("POST", `/access/users/${userId}/password`, { phone }, admin.accessToken);
      if (![200, 201].includes(response.status)) throw new Error(`Synthetic password setup returned ${response.status}`);
      profiles.push({ userId, role, phone, password: response.body.password });
    }
    const metadata = { fixture: "LOCAL SYNTHETIC DATA ONLY", url: fixture.origin, profiles };
    const metadataPath = path.join(fixture.directory, "browser-fixture.json");
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), { mode: 0o600 });
    console.log(JSON.stringify({ ...metadata, metadataPath }, null, 2));
  } catch (error) {
    await fixture.close();
    throw error;
  }
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { createTestServer };
