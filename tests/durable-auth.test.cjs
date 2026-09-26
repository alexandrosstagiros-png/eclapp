"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { rememberedCookie, readRememberedCookie, requireTrustedAuthOrigin, cookieName } = require("../recovered/apps/api/src/modules/identity-access/interface/remembered-cookie.js");
const prod = { nodeEnv: "production", allowedOrigins: ["https://logistics.example"] };
const token = "a".repeat(43);

test("production refresh cookie is host-only, HttpOnly, Secure and partitioned for embedded mini apps", () => {
  const value = rememberedCookie(prod, token, new Date(Date.now() + 30 * 86400000));
  for (const attribute of ["__Secure-ecl_refresh=", "Path=/api/v1/auth", "HttpOnly", "SameSite=None", "Secure", "Partitioned"]) assert.ok(value.includes(attribute));
  assert.equal(value.includes("Domain="), false);
  const maxAge = Number(/Max-Age=(\d+)/.exec(value)[1]);
  assert.ok(maxAge >= 2591990 && maxAge <= 2592000);
});

test("clearing refresh cookie uses identical production scope and immediate expiry", () => {
  const value = rememberedCookie(prod);
  assert.ok(value.startsWith("__Secure-ecl_refresh=;"));
  assert.ok(value.includes("Max-Age=0;"));
  assert.ok(value.includes("Path=/api/v1/auth"));
  assert.ok(value.includes("SameSite=None; Secure; Partitioned"));
});

test("local test cookie works over loopback HTTP and never uses the production name", () => {
  const config = { nodeEnv: "test" };
  const value = rememberedCookie(config, token, new Date(Date.now() + 100000));
  assert.equal(cookieName(config), "ecl_refresh_dev");
  assert.ok(value.includes("HttpOnly; SameSite=Lax"));
  assert.equal(value.includes("Secure"), false);
});

test("cookie parsing rejects duplicate, malformed and oversized credentials", () => {
  const name = cookieName(prod);
  assert.equal(readRememberedCookie({ headers: { cookie: `other=x; ${name}=${token}` } }, prod), token);
  for (const cookie of [undefined, `${name}=bad`, `${name}=${token}; ${name}=${token}`, "x".repeat(17000), `${name}=${encodeURIComponent(token + "=")}`]) assert.equal(readRememberedCookie({ headers: { cookie } }, prod), undefined);
});

test("refresh requires both trusted Origin and the custom preflight header", () => {
  const good = { origin: prod.allowedOrigins[0], "x-session-refresh": "1" };
  assert.doesNotThrow(() => requireTrustedAuthOrigin({ headers: good }, prod, true));
  for (const headers of [{}, { origin: "null", "x-session-refresh": "1" }, { origin: "https://evil.example", "x-session-refresh": "1" }, { origin: prod.allowedOrigins[0] }, { "x-session-refresh": "1" }]) assert.throws(() => requireTrustedAuthOrigin({ headers }, prod, true), error => error.getStatus() === 403);
  assert.doesNotThrow(() => requireTrustedAuthOrigin({ headers: {} }, prod));
  assert.throws(() => requireTrustedAuthOrigin({ headers: { "sec-fetch-site": "cross-site" } }, prod), error => error.getStatus() === 403);
});
