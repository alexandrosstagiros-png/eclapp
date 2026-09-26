#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { versionFromTag } = require('./release-version.cjs');

function releaseRepository(repository) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository || '') || repository.includes('..')) {
    throw new Error('Release repository must be an owner/repository name.');
  }
  return repository;
}

function decodeBase64(value) {
  const text = value.trim();
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(text) || text.length % 4 === 1) throw new Error('Invalid signing envelope.');
  return Buffer.from(text, 'base64');
}

function signingKeyId(publicKey) {
  const lines = decodeBase64(publicKey).toString('utf8').trim().split(/\r?\n/);
  if (lines.length !== 2 || !lines[0].startsWith('untrusted comment:')) throw new Error('Expected a Tauri updater public key.');
  const key = decodeBase64(lines[1]);
  if (key.length !== 42 || key.subarray(0, 2).toString() !== 'Ed') throw new Error('Invalid updater public key.');
  return key.subarray(2, 10).toString('hex');
}

function signatureFor(file, publicKey, expectedVersion) {
  const signature = fs.readFileSync(`${file}.sig`, 'utf8').trim();
  const lines = decodeBase64(signature).toString('utf8').trim().split(/\r?\n/);
  if (lines.length !== 4 || !lines[0].startsWith('untrusted comment:') || !lines[2].startsWith('trusted comment:')) {
    throw new Error(`Invalid Tauri signature for ${path.basename(file)}.`);
  }
  const packet = decodeBase64(lines[1]);
  if (packet.length !== 74 || !['Ed', 'ED'].includes(packet.subarray(0, 2).toString()) || decodeBase64(lines[3]).length !== 64) {
    throw new Error(`Malformed updater signature for ${path.basename(file)}.`);
  }
  if (packet.subarray(2, 10).toString('hex') !== signingKeyId(publicKey)) {
    throw new Error('Signing key does not match the public key embedded in the app.');
  }
  if (expectedVersion) {
    const version = lines[2].slice('trusted comment:'.length).trim().split('\t').find((field) => field.startsWith('version:'))?.slice(8);
    if (version !== expectedVersion) throw new Error('Updater signature must bind the artifact to the release version.');
  }
  // Cryptographic verification occurs again in the native updater before installation.
  return signature;
}

function exactlyOne(directory, suffix) {
  const files = fs.readdirSync(directory).filter((name) => name.endsWith(suffix));
  if (files.length !== 1) throw new Error(`Expected exactly one ${suffix} in ${directory}, found ${files.length}.`);
  const file = path.join(directory, files[0]);
  if (!fs.statSync(file).isFile() || fs.statSync(file).size === 0) throw new Error(`Empty artifact: ${file}`);
  return file;
}

function collectArtifacts(nativeDir, platform, tag, outDir) {
  const version = versionFromTag(tag);
  const conf = JSON.parse(fs.readFileSync(path.join(nativeDir, 'src-tauri/tauri.conf.json'), 'utf8'));
  const publicKey = conf.plugins?.updater?.pubkey;
  signingKeyId(publicKey || '');
  let sources;
  if (platform === 'macos') {
    const bundle = path.join(nativeDir, 'target/universal-apple-darwin/release/bundle');
    sources = [
      [exactlyOne(path.join(bundle, 'macos'), '.app.tar.gz'), `ECL_${version}_universal.app.tar.gz`, true],
      [exactlyOne(path.join(bundle, 'dmg'), '.dmg'), `ECL_${version}_universal.dmg`, false],
    ];
  } else if (platform === 'windows') {
    sources = [[exactlyOne(path.join(nativeDir, 'target/x86_64-pc-windows-msvc/release/bundle/nsis'), '.exe'), `ECL_${version}_x64-setup.exe`, true]];
  } else throw new Error('Expected platform macos or windows.');
  for (const [file, , signed] of sources) if (signed) signatureFor(file, publicKey, version);
  fs.mkdirSync(outDir, { recursive: true });
  for (const [file, name, signed] of sources) {
    fs.copyFileSync(file, path.join(outDir, name));
    if (signed) fs.copyFileSync(`${file}.sig`, path.join(outDir, `${name}.sig`));
  }
}

function iosRelease(iosUrl, version) {
  if (!iosUrl && !version) return null;
  if (!iosUrl || !version) throw new Error('iOS distribution URL and independent published version are both required.');
  versionFromTag(`v${version}`);
  const url = new URL(iosUrl);
  if (url.protocol !== 'https:' || !['apps.apple.com', 'testflight.apple.com'].includes(url.hostname) || url.username || url.password || url.port) {
    throw new Error('Invalid iOS App Store/TestFlight URL.');
  }
  return { version, url: url.href };
}

function createManifest({ directory, repository, tag, publicKey, notes = '', pubDate = new Date().toISOString(), android = false, iosUrl, iosVersion }) {
  const version = versionFromTag(tag);
  const base = `https://github.com/${releaseRepository(repository)}/releases/download/${tag}/`;
  if (!Number.isFinite(Date.parse(pubDate))) throw new Error('Invalid publication date.');
  const mac = `ECL_${version}_universal.app.tar.gz`;
  const win = `ECL_${version}_x64-setup.exe`;
  const dmg = `ECL_${version}_universal.dmg`;
  for (const name of [mac, win, dmg]) {
    const file = path.join(directory, name);
    if (!fs.statSync(file).isFile() || fs.statSync(file).size === 0) throw new Error(`Missing artifact: ${name}`);
  }
  const macEntry = { signature: signatureFor(path.join(directory, mac), publicKey, version), url: base + mac };
  const winEntry = { signature: signatureFor(path.join(directory, win), publicKey, version), url: base + win };
  const manifest = {
    version, notes, pub_date: new Date(pubDate).toISOString(),
    platforms: { 'darwin-aarch64': macEntry, 'darwin-x86_64': macEntry, 'windows-x86_64': winEntry },
  };
  const mobile = {};
  const apk = `ECL_${version}_arm64.apk`;
  if (android) {
    const file = path.join(directory, apk);
    if (!fs.statSync(file).isFile() || fs.statSync(file).size === 0) throw new Error('Android release was enabled but its APK is missing.');
    mobile.android = { version, url: base + apk, signature: signatureFor(file, publicKey, version),
      sha256: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') };
  }
  const ios = iosRelease(iosUrl, iosVersion);
  if (ios) mobile.ios = ios;
  if (Object.keys(mobile).length) manifest.mobile = mobile;
  fs.writeFileSync(path.join(directory, 'latest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  const expected = [mac, `${mac}.sig`, win, `${win}.sig`, dmg, 'latest.json'];
  if (android) expected.push(apk, `${apk}.sig`);
  const hashes = expected.map((name) => `${crypto.createHash('sha256').update(fs.readFileSync(path.join(directory, name))).digest('hex')}  ${name}`);
  fs.writeFileSync(path.join(directory, 'SHA256SUMS.txt'), `${hashes.join('\n')}\n`);
  return manifest;
}

module.exports = { releaseRepository, signingKeyId, signatureFor, collectArtifacts, iosRelease, createManifest };
if (require.main === module) {
  try {
    const [action, platformOrDirectory, tag] = process.argv.slice(2);
    const nativeDir = path.resolve(__dirname, '..');
    if (action === 'collect') collectArtifacts(nativeDir, platformOrDirectory, tag, path.join(nativeDir, 'artifacts/release'));
    else if (action === 'manifest') {
      const conf = JSON.parse(fs.readFileSync(path.join(nativeDir, 'src-tauri/tauri.conf.json'), 'utf8'));
      createManifest({ directory: path.resolve(platformOrDirectory), tag, repository: process.env.NATIVE_RELEASE_REPOSITORY,
        publicKey: conf.plugins?.updater?.pubkey, notes: process.env.NATIVE_RELEASE_NOTES || `ЕЦЛ ${versionFromTag(tag)}`,
        android: process.env.NATIVE_ANDROID_RELEASE_ENABLED === 'true', iosUrl: process.env.NATIVE_IOS_STORE_URL,
        iosVersion: process.env.NATIVE_IOS_VERSION });
    } else throw new Error('Usage: release-artifacts.cjs collect <macos|windows> <tag> | manifest <directory> <tag>');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
