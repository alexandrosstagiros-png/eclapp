'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createRequire } = require('node:module');
const { pathToFileURL } = require('node:url');

const appRequire = createRequire(path.resolve(__dirname, '../recovered/package.json'));
const embeddedPostgres = pathToFileURL(appRequire.resolve('embedded-postgres')).href;
const browserScripts = fs.readdirSync(__dirname).filter(name => name.endsWith('-browser.cjs'))
  .map(name => ({ name, source: fs.readFileSync(path.join(__dirname, name), 'utf8') }))
  .filter(({ source }) => /require\((['"])\.\/local-test-server\.cjs\1\)/.test(source));

// Importing embedded-postgres installs a beforeExit hook which requests exit(0).
// Run each actual CLI failure handler in a child with that dependency loaded:
// merely assigning process.exitCode would incorrectly make this child succeed.
test('browser CLI failures remain failures after asynchronous cleanup and PostgreSQL exit hooks', { timeout: 60000 }, async t => {
  assert.ok(browserScripts.length > 0);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'browser-exit-status-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  for (const { name, source } of browserScripts) {
    await t.test(name, () => {
      const terminalCatch = source.match(/\}\)\(\)\.catch\(([\s\S]+)\);\s*$/);
      assert.ok(terminalCatch, 'The browser entry point must expose a terminal failure handler');
      const marker = path.join(directory, name);
      const script = `
        import fs from 'node:fs/promises';
        import assert from 'node:assert/strict';
        await import(${JSON.stringify(embeddedPostgres)});
        (async () => {
          try { assert.fail('synthetic browser assertion failure'); }
          finally { await fs.writeFile(${JSON.stringify(marker)}, 'cleanup completed'); }
        })().catch(${terminalCatch[1]});
      `;
      const child = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', timeout: 15000 });
      assert.equal(child.error, undefined, child.error?.message);
      assert.equal(child.signal, null);
      assert.equal(fs.readFileSync(marker, 'utf8'), 'cleanup completed');
      assert.match(child.stderr, /synthetic browser assertion failure/);
      assert.equal(child.status, 1, `${name} must fail its shell/npm command after cleanup; stderr: ${child.stderr}`);
    });
  }
});
