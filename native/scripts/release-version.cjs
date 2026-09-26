#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

function versionFromTag(tag) {
  const match = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(tag || '');
  if (!match || match.slice(1).some((part) => Number(part) > 65535)) {
    throw new Error('Release tag must be stable vMAJOR.MINOR.PATCH (each component 0–65535).');
  }
  return match.slice(1).join('.');
}

function compareVersions(a, b) {
  const left = versionFromTag(a.startsWith('v') ? a : `v${a}`).split('.').map(Number);
  const right = versionFromTag(b.startsWith('v') ? b : `v${b}`).split('.').map(Number);
  for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return Math.sign(left[i] - right[i]);
  return 0;
}

function syncVersion(nativeDir, tag) {
  const version = versionFromTag(tag);
  const changes = new Map();
  for (const relative of ['package.json', 'package-lock.json', 'src-tauri/tauri.conf.json']) {
    const file = path.join(nativeDir, relative);
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    value.version = version;
    if (relative === 'package-lock.json') {
      if (!value.packages?.['']) throw new Error('Expected npm lockfile root package.');
      value.packages[''].version = version;
    }
    changes.set(file, `${JSON.stringify(value, null, 2)}\n`);
  }
  const manifest = path.join(nativeDir, 'src-tauri/Cargo.toml');
  const oldManifest = fs.readFileSync(manifest, 'utf8');
  const packageMatch = /(^\[package\]\r?\n[\s\S]*?^version\s*=\s*")[^"]+("\s*$)/m;
  if (!packageMatch.test(oldManifest)) throw new Error('Shell Cargo package version not found.');
  changes.set(manifest, oldManifest.replace(packageMatch, `$1${version}$2`));
  const lockFile = path.join(nativeDir, 'Cargo.lock');
  const oldLock = fs.readFileSync(lockFile, 'utf8');
  const lockMatch = /(\[\[package\]\]\r?\nname = "ecl-native"\r?\nversion = ")[^"]+("\r?\n)/;
  if (!lockMatch.test(oldLock)) throw new Error('Shell package missing from Cargo.lock.');
  changes.set(lockFile, oldLock.replace(lockMatch, `$1${version}$2`));
  // Validate everything before changing any file. Dependency versions are untouched.
  for (const [file, content] of changes) fs.writeFileSync(file, content);
  return version;
}

module.exports = { versionFromTag, compareVersions, syncVersion };
if (require.main === module) {
  try { console.log(syncVersion(path.resolve(__dirname, '..'), process.argv[2])); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
