"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createHmac } = require("node:crypto");
const { MaxAuthAdapter, MaxAuthError } = require("./max-auth.cjs");

const TOKEN = "test-only-max-token-never-use-in-production";
const AUTH_TIME = 1789509600;
// Independent fixture generated using Python's hmac + urllib.parse, not this adapter.
const GOLDEN = "auth_date=1789509600&query_id=test-max-session&user=%7B%22id%22%3A123456789%2C%22first_name%22%3A%22%D0%A2%D0%B5%D1%81%D1%82%22%2C%22last_name%22%3A%22%D0%9F%D0%BE%D0%BB%D1%8C%D0%B7%D0%BE%D0%B2%D0%B0%D1%82%D0%B5%D0%BB%D1%8C%22%7D&chat=%7B%22id%22%3A12%2C%22type%22%3A%22DIALOG%22%7D&hash=3fd8a6b5363a9bc1c225d9895eee62d86580762e2d994b0a6b71b6b5116e2dec";
const adapter = (seconds = AUTH_TIME) => new MaxAuthAdapter(TOKEN, 300, () => seconds * 1000);

function signed(overrides = {}, omitted = []) {
  const fields = {
    auth_date: String(AUTH_TIME),
    query_id: "session with spaces + symbols=",
    user: JSON.stringify({ id: 123456789, first_name: "Тест" }),
    ...overrides,
  };
  for (const key of omitted) delete fields[key];
  const canonical = Object.keys(fields).sort().map(key => `${key}=${fields[key]}`).join("\n");
  const key = createHmac("sha256", "WebAppData").update(TOKEN).digest();
  const hash = createHmac("sha256", key).update(canonical).digest("hex");
  return new URLSearchParams({ ...fields, hash }).toString();
}

test("accepts independently signed MAX fixture with Unicode", () => {
  const identity = adapter().verify(GOLDEN);
  assert.equal(identity.provider, "max");
  assert.equal(identity.providerUserId, "123456789");
  assert.equal(identity.expiresAt.getTime(), (AUTH_TIME + 300) * 1000);
  assert.match(identity.replayHash, /^[0-9a-f]{64}$/);
  assert.deepEqual(Object.keys(identity).sort(), ["expiresAt", "provider", "providerUserId", "replayHash"]);
});

test("canonical replay key is stable across ordering and URL encodings", () => {
  const original = signed();
  const reordered = original.split("&").reverse().join("&").replace(/\+/g, "%20");
  assert.equal(adapter().verify(original).replayHash, adapter().verify(reordered).replayHash);
  const p = new URLSearchParams(original);
  p.set("hash", p.get("hash").toUpperCase());
  assert.equal(adapter().verify(original).replayHash, adapter().verify(p.toString()).replayHash);
});

test("different signed identity/session data produces a different replay key", () => {
  assert.notEqual(adapter().verify(signed()).replayHash,
    adapter().verify(signed({ query_id: "other-session" })).replayHash);
});

test("rejects modified user and wrong bot token", () => {
  assert.throws(() => adapter().verify(GOLDEN.replace("123456789", "123456788")), MaxAuthError);
  const wrong = new MaxAuthAdapter("another-bot-token", 300, () => AUTH_TIME * 1000);
  assert.throws(() => wrong.verify(GOLDEN), MaxAuthError);
});

test("checks exact expiration and future clock boundaries", () => {
  assert.doesNotThrow(() => adapter(AUTH_TIME + 299).verify(GOLDEN));
  assert.throws(() => adapter(AUTH_TIME + 300).verify(GOLDEN), MaxAuthError);
  assert.doesNotThrow(() => adapter(AUTH_TIME - 30).verify(GOLDEN));
  assert.throws(() => adapter(AUTH_TIME - 31).verify(GOLDEN), MaxAuthError);
});

for (const [name, payload] of [
  ["empty input", ""],
  ["non-string input", {}],
  ["oversized input", "x=" + "a".repeat(16384)],
  ["missing signature", "auth_date=1789509600&user=%7B%22id%22%3A1%7D"],
  ["invalid signature length", GOLDEN.replace(/hash=.*/, "hash=abc")],
  ["non-hex signature", GOLDEN.replace(/hash=.*/, "hash=" + "z".repeat(64))],
  ["duplicate signature", GOLDEN + "&hash=" + "0".repeat(64)],
  ["duplicate encoded signature", GOLDEN + "&%68ash=" + "0".repeat(64)],
  ["duplicate user", GOLDEN + "&user=%7B%22id%22%3A1%7D"],
  ["malformed percent escape", GOLDEN + "&extra=%XZ"],
  ["invalid UTF-8", GOLDEN + "&extra=%FF"],
  ["empty pair", GOLDEN + "&"],
  ["newlines in canonical value", signed({ query_id: "x\nuser=y" })],
  ["missing date", signed({}, ["auth_date"])],
  ["non-integer date", signed({ auth_date: "1789509600.5" })],
  ["missing user", signed({}, ["user"])],
  ["invalid user JSON", signed({ user: "{" })],
  ["null user", signed({ user: "null" })],
  ["array user", signed({ user: "[]" })],
  ["string user id", signed({ user: '{"id":"123"}' })],
  ["zero user id", signed({ user: '{"id":0}' })],
  ["negative user id", signed({ user: '{"id":-1}' })],
  ["unsafe integer user id", signed({ user: '{"id":9007199254740992}' })],
]) {
  test(`rejects ${name}`, () => assert.throws(() => adapter().verify(payload), MaxAuthError));
}

test("does not derive local roles or access from signed MAX profile fields", () => {
  const identity = adapter().verify(signed({ user: '{"id":123,"role":"access_admin","approved":true}' }));
  assert.equal(identity.providerUserId, "123");
  assert.equal(identity.role, undefined);
  assert.equal(identity.approved, undefined);
});

test("rejects invalid configuration and never serializes bot token", () => {
  assert.throws(() => new MaxAuthAdapter(""), TypeError);
  assert.throws(() => new MaxAuthAdapter(TOKEN, 0), RangeError);
  assert.throws(() => new MaxAuthAdapter(TOKEN, 3601), RangeError);
  assert.equal(JSON.stringify(adapter()), "{}");
});
