'use strict';
// A real PostgreSQL + NestJS fixture; never reads the user's local application
// credentials or a production .env. Secrets only travel over child stdin.
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createTestServer } = require('../../tests/local-test-server.cjs');

async function main() {
  const fixture = await createTestServer();
  try {
    const admin = await fixture.devLogin(fixture.ids.admin);
    const issued = await fixture.request('POST', `/access/users/${fixture.ids.drivers[0]}/password`,
      { phone: '+79990004567' }, admin.accessToken);
    assert.equal(issued.status, 201, 'Synthetic driver credentials must be issued');
    const binary = path.resolve(__dirname, '../target/debug/examples/api-smoke' + (process.platform === 'win32' ? '.exe' : ''));
    const child = spawn(binary, [], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    const completed = new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', code => code === 0 ? resolve() : reject(new Error(`Native API check failed (${code}): ${stderr.slice(0, 1200)}`)));
    });
    child.stdin.end(JSON.stringify({ serverUrl: fixture.origin, phone: issued.body.phone, password: issued.body.password, expectedRole: 'driver' }));
    await completed;
    const result = JSON.parse(stdout);
    console.log(JSON.stringify(result));
  } finally {
    await fixture.close();
  }
}
main().then(() => process.exit(0)).catch(error => { console.error(error.message); process.exit(1); });
