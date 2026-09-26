#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { versionFromTag } = require('./release-version.cjs');
const { signatureFor } = require('./release-artifacts.cjs');

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}

function command(executable, args, cwd) {
  const result = spawnSync(executable, args, { cwd, stdio: 'inherit', shell: false });
  if (result.error || result.status !== 0) throw new Error(`${path.basename(executable)} failed (${result.status ?? 'not started'}).`);
}

function main(tag) {
  const nativeDir = path.resolve(__dirname, '..');
  const version = versionFromTag(tag);
  for (const name of ['ANDROID_KEYSTORE_BASE64', 'ANDROID_KEYSTORE_PASSWORD', 'ANDROID_KEY_ALIAS', 'ANDROID_KEY_PASSWORD', 'TAURI_SIGNING_PRIVATE_KEY']) {
    if (!process.env[name]) throw new Error(`Required release secret is missing: ${name}`);
  }
  const sdk = process.env.ANDROID_HOME;
  if (!sdk) throw new Error('ANDROID_HOME is missing.');
  const buildTools = path.join(sdk, 'build-tools/36.0.0');
  const apks = walk(path.join(nativeDir, 'src-tauri/gen/android/app/build/outputs/apk'))
    .filter((file) => file.endsWith('.apk') && /release/i.test(file) && !/debug/i.test(file));
  if (apks.length !== 1) throw new Error(`Expected one release APK, found ${apks.length}.`);
  const outputDir = path.join(nativeDir, 'artifacts/release');
  fs.mkdirSync(outputDir, { recursive: true });
  const tempDir = fs.mkdtempSync(path.join(nativeDir, 'artifacts/android-signing-'));
  const keystore = path.join(tempDir, 'release.keystore');
  const aligned = path.join(tempDir, 'aligned.apk');
  const output = path.join(outputDir, `ECL_${version}_arm64.apk`);
  try {
    fs.writeFileSync(keystore, Buffer.from(process.env.ANDROID_KEYSTORE_BASE64, 'base64'), { mode: 0o600 });
    command(path.join(buildTools, 'zipalign'), ['-f', '-P', '16', '4', apks[0], aligned], nativeDir);
    command(path.join(buildTools, 'apksigner'), ['sign', '--v4-signing-enabled', 'false', '--ks', keystore, '--ks-key-alias', process.env.ANDROID_KEY_ALIAS,
      '--ks-pass', 'env:ANDROID_KEYSTORE_PASSWORD', '--key-pass', 'env:ANDROID_KEY_PASSWORD', '--out', output, aligned], nativeDir);
    command(path.join(buildTools, 'apksigner'), ['verify', '--verbose', '--print-certs', output], nativeDir);
    command(path.join(buildTools, 'zipalign'), ['-c', '-P', '16', '4', output], nativeDir);
    command(process.execPath, [path.join(nativeDir, 'node_modules/@tauri-apps/cli/tauri.js'), 'signer', 'sign', '--app-version', version, output], nativeDir);
    const config = JSON.parse(fs.readFileSync(path.join(nativeDir, 'src-tauri/tauri.conf.json'), 'utf8'));
    signatureFor(output, config.plugins?.updater?.pubkey, version);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

if (require.main === module) {
  try { main(process.argv[2]); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
