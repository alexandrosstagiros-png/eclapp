#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { syncVersion, versionFromTag } = require('./release-version.cjs');
const { releaseRepository, signingKeyId, iosRelease } = require('./release-artifacts.cjs');

function androidVersionCode(version) {
  const [major, minor, patch] = versionFromTag(`v${version}`).split('.').map(Number);
  const code = major * 1_000_000 + minor * 1_000 + patch;
  if (minor > 999 || patch > 999 || code < 1 || code > 2_100_000_000) {
    throw new Error('Android versions require minor/patch <= 999 and versionCode between 1 and 2100000000.');
  }
  return code;
}

function prepareRelease(nativeDir, tag, repository, iosUrl = process.env.NATIVE_IOS_STORE_URL) {
  releaseRepository(repository);
  const config = JSON.parse(fs.readFileSync(path.join(nativeDir, 'src-tauri/tauri.conf.json'), 'utf8'));
  signingKeyId(config.plugins?.updater?.pubkey || '');
  const version = versionFromTag(tag);
  const versionCode = androidVersionCode(version);
  const channelFile = path.join(nativeDir, 'update-channel.json');
  const channel = JSON.parse(fs.readFileSync(channelFile, 'utf8'));
  channel.repository = repository;
  if (iosUrl) channel.iosUrl = iosRelease(iosUrl, version).url;
  syncVersion(nativeDir, tag);
  fs.writeFileSync(channelFile, `${JSON.stringify(channel, null, 2)}\n`);
  const overlay = {
    bundle: { createUpdaterArtifacts: true, android: { versionCode } },
    plugins: { updater: { endpoints: [`https://github.com/${repository}/releases/latest/download/latest.json`] } },
  };
  const outDir = path.join(nativeDir, 'artifacts');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'release-config.json'), `${JSON.stringify(overlay, null, 2)}\n`);
  return version;
}

module.exports = { androidVersionCode, prepareRelease };
if (require.main === module) {
  try { console.log(prepareRelease(path.resolve(__dirname, '..'), process.argv[2], process.env.NATIVE_RELEASE_REPOSITORY)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
