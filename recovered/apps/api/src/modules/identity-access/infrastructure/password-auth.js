"use strict";
const { randomBytes, scrypt, timingSafeEqual } = require("node:crypto");
const { promisify } = require("node:util");
const derive = promisify(scrypt);
const options = { N: 16384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 };
const ALGORITHM = "scrypt-v1";
const MAX_PASSWORD_CHARS = 128;

function normalizePhone(value) {
    if (typeof value !== "string" || value.length > 64 || !/^[+0-9 ()\-]+$/.test(value)) return undefined;
    let phone = value.replace(/[ ()\-]/g, "");
    if (/^8\d{10}$/.test(phone)) phone = "+7" + phone.slice(1);
    else if (/^7\d{10}$/.test(phone)) phone = "+" + phone;
    return /^\+[1-9]\d{7,14}$/.test(phone) ? phone : undefined;
}
function boundedPassword(password) {
    return typeof password === "string" && password.length > 0 &&
        password.length <= MAX_PASSWORD_CHARS && Buffer.byteLength(password, "utf8") <= 512;
}
async function hashPassword(password) {
    if (!boundedPassword(password)) throw new TypeError("Invalid password length");
    const salt = randomBytes(32);
    const key = await derive(password, salt, 64, options);
    return { password_salt: salt.toString("hex"), password_hash: key.toString("hex"), hash_algorithm: ALGORITHM };
}
async function verifyPassword(password, credential) {
    if (!boundedPassword(password)) return false;
    const validRecord = credential?.hash_algorithm === ALGORITHM &&
        /^[a-f0-9]{64}$/.test(credential.password_salt) && /^[a-f0-9]{128}$/.test(credential.password_hash);
    // Unknown phone numbers perform the same bounded KDF as known accounts.
    const salt = validRecord ? credential.password_salt : "0".repeat(64);
    const expected = validRecord ? credential.password_hash : "0".repeat(128);
    const actual = await derive(password, Buffer.from(salt, "hex"), 64, options);
    const matches = timingSafeEqual(actual, Buffer.from(expected, "hex"));
    return Boolean(validRecord && matches);
}
const generatePassword = () => randomBytes(32).toString("base64url");
module.exports = { normalizePhone, boundedPassword, hashPassword, verifyPassword, generatePassword };
