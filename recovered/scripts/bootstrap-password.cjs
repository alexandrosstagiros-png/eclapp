#!/usr/bin/env node
'use strict';
// Run once using the application's restricted DATABASE_URL; phone comes from stdin.
// stdout contains the one-time credential JSON. Keep stdout private and do not log it.
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { Pool } = require('pg');
const helper = path.join(__dirname, '../apps/api/dist/modules/identity-access/infrastructure/password-auth.js');
const { normalizePhone, generatePassword, hashPassword } = require(helper);
const fail = message => { const error = new Error(message); error.safe = true; throw error; };

async function main() {
  const input = Buffer.alloc(1025);
  let length = 0;
  while (length < input.length) {
    const read = fs.readSync(0, input, length, input.length - length, null);
    if (!read) break;
    length += read;
  }
  if (length > 1024) fail('Phone input is too long.');
  const phone = normalizePhone(input.subarray(0, length).toString('utf8').trim());
  input.fill(0);
  if (!phone) fail('A valid phone number is required on stdin.');
  if (!process.env.DATABASE_URL) fail('Application DATABASE_URL is required.');
  const connection = new URL(process.env.DATABASE_URL);
  if (!['postgres:', 'postgresql:'].includes(connection.protocol) || connection.username === 'postgres')
    fail('Use the restricted application database role.');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1,
    connectionTimeoutMillis: 5000, statement_timeout: 10000 });
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(917042018)');
    const administrators = await client.query(`SELECT id FROM users
      WHERE role='access_admin' AND active AND approved ORDER BY id FOR UPDATE`);
    if (administrators.rows.length !== 1) fail('Bootstrap requires exactly one active, approved access administrator.');
    const userId = administrators.rows[0].id;
    if (!(await client.query('SELECT 1 FROM access_grants WHERE user_id=$1 LIMIT 1', [userId])).rowCount)
      fail('The administrator must already have access scopes.');
    if ((await client.query('SELECT 1 FROM phone_credentials WHERE user_id=$1', [userId])).rowCount)
      fail('Administrator password is already configured; use authenticated password reset.');
    if ((await client.query('SELECT 1 FROM phone_credentials WHERE phone=$1', [phone])).rowCount)
      fail('Phone number is already assigned.');
    const password = generatePassword();
    const credential = await hashPassword(password);
    await client.query(`INSERT INTO phone_credentials
      (user_id,phone,password_salt,password_hash,hash_algorithm,created_by) VALUES($1,$2,$3,$4,$5,$1)`,
      [userId, phone, credential.password_salt, credential.password_hash, credential.hash_algorithm]);
    await client.query('UPDATE users SET auth_version=auth_version+1 WHERE id=$1', [userId]);
    await client.query('UPDATE sessions SET revoked_at=clock_timestamp() WHERE user_id=$1 AND revoked_at IS NULL', [userId]);
    await client.query('DELETE FROM phone_login_attempts WHERE phone_hash=$1', [createHash('sha256').update(phone).digest('hex')]);
    await client.query('SELECT append_audit($1::jsonb)', [JSON.stringify({
      schemaVersion: 1, actorId: userId, action: 'access.password_issued', entityType: 'user',
      entityId: userId, channel: 'system', correlationId: randomUUID(), metadata: { method: 'password', bootstrap: true },
    })]);
    await client.query('COMMIT');
    // The generated plaintext exists only in this response, never in DB or audit.
    process.stdout.write(JSON.stringify({ userId, phone, password, issuedAt: new Date().toISOString() }) + '\n');
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client?.release();
    await pool.end();
  }
}
main().catch(error => {
  process.stderr.write(error.safe ? error.message + '\n' : 'Password bootstrap failed; no credential was returned.\n');
  process.exitCode = 1;
});
