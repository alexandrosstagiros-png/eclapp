"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizePhone, boundedPassword, hashPassword, verifyPassword, generatePassword } = require("../recovered/apps/api/src/modules/identity-access/infrastructure/password-auth.js");

test("phone input normalization accepts documented formats and rejects ambiguous control input", () => {
  for (const phone of ["+79991234567", "79991234567", "8 (999) 123-45-67"]) assert.equal(normalizePhone(phone), "+79991234567");
  assert.equal(normalizePhone("+1 (202) 555-0123"), "+12025550123");
  for (const phone of [null, 79991234567, "", "9991234567", "+7.999.123.45.67", "+7\n9991234567", "+7\t9991234567", "++79991234567", "+0 9991234567", "+1234567890123456", " ".repeat(65)]) assert.equal(normalizePhone(phone), undefined);
});

test("password input is bounded without trimming or converting values", async () => {
  for (const value of [undefined, null, 123, "", "x".repeat(129)]) assert.equal(boundedPassword(value), false);
  assert.equal(boundedPassword("x".repeat(128)), true);
  await assert.rejects(hashPassword("x".repeat(129)), /Invalid password length/);
});

test("scrypt salts are independent and exact password bytes matter", async () => {
  const password = " Synthetic-Password-Only ";
  const first = await hashPassword(password);
  const second = await hashPassword(password);
  assert.notEqual(first.password_salt, second.password_salt);
  assert.notEqual(first.password_hash, second.password_hash);
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword(password.trim(), first), false);
  assert.equal(await verifyPassword("different", first), false);
});

test("unknown or malformed credential records always fail verification", async () => {
  const valid = await hashPassword("Synthetic-password");
  for (const record of [undefined, null, {}, { ...valid, hash_algorithm: "plain" }, { ...valid, password_hash: "bad" }, { ...valid, password_salt: "bad" }]) assert.equal(await verifyPassword("Synthetic-password", record), false);
});

test("generated passwords contain a full fresh 256-bit random value", () => {
  const first = generatePassword();
  const second = generatePassword();
  assert.match(first, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(Buffer.from(first, "base64url").length, 32);
  assert.notEqual(first, second);
});
