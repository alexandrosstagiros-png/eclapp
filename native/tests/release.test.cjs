'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { versionFromTag, compareVersions, syncVersion } = require('../scripts/release-version.cjs');
const { releaseRepository, signingKeyId, signatureFor, createManifest, iosRelease } = require('../scripts/release-artifacts.cjs');
const { prepareRelease, androidVersionCode } = require('../scripts/prepare-release.cjs');

const keyId = Buffer.from('0102030405060708', 'hex');
const publicKey = Buffer.from(`untrusted comment: test only\n${Buffer.concat([Buffer.from('Ed'), keyId, Buffer.alloc(32, 9)]).toString('base64')}\n`).toString('base64');
// Structural fixtures, not valid cryptographic signatures. Clients verify actual signatures.
function signature(version = '1.2.3', id = keyId) {
  return Buffer.from(`untrusted comment: test only\n${Buffer.concat([Buffer.from('ED'), id, Buffer.alloc(64, 7)]).toString('base64')}\ntrusted comment: timestamp:123\tfile:test\tversion:${version}\n${Buffer.alloc(64, 8).toString('base64')}\n`).toString('base64');
}

function temp(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ecl-release-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function nativeFixture(directory) {
  fs.mkdirSync(path.join(directory, 'src-tauri'));
  fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ name: 'ecl-native', version: '0.1.0' }));
  fs.writeFileSync(path.join(directory, 'package-lock.json'), JSON.stringify({ version: '0.1.0', packages: { '': { version: '0.1.0' }, dependency: { version: '4.5.6' } } }));
  fs.writeFileSync(path.join(directory, 'src-tauri/tauri.conf.json'), JSON.stringify({ version: '0.1.0', plugins: { updater: { pubkey: publicKey } } }));
  fs.writeFileSync(path.join(directory, 'src-tauri/Cargo.toml'), '[package]\nname = "ecl-native"\nversion = "0.1.0"\n\n[dependencies]\nthing = { version = "2" }\n');
  fs.writeFileSync(path.join(directory, 'Cargo.lock'), 'version = 4\n\n[[package]]\nname = "ecl-native"\nversion = "0.1.0"\n\n[[package]]\nname = "ecl-native-core"\nversion = "0.1.0"\n');
  fs.writeFileSync(path.join(directory, 'update-channel.json'), JSON.stringify({ repository: 'old/repo', androidDistribution: 'github', iosUrl: null }));
}

function artifactsFixture(directory, android = false) {
  for (const name of ['ECL_1.2.3_universal.app.tar.gz', 'ECL_1.2.3_x64-setup.exe', 'ECL_1.2.3_universal.dmg', ...(android ? ['ECL_1.2.3_arm64.apk'] : [])]) {
    fs.writeFileSync(path.join(directory, name), `test artifact ${name}`);
    if (!name.endsWith('.dmg')) fs.writeFileSync(path.join(directory, `${name}.sig`), signature());
  }
}

test('only immutable stable release tag syntax is accepted and versions sort numerically', () => {
  assert.equal(versionFromTag('v1.20.3'), '1.20.3');
  for (const invalid of ['1.2.3', 'v01.2.3', 'v1.2.3-beta', 'v1.2.3+abc', 'v1.2.70000', 'v1.2.3\n', 'v1.2.3;echo bad']) {
    assert.throws(() => versionFromTag(invalid));
  }
  assert.equal(compareVersions('1.10.0', 'v1.9.9'), 1);
  assert.equal(compareVersions('v2.0.0', '2.0.0'), 0);
});

test('release version synchronizes package and Cargo locks without changing dependencies', (t) => {
  const directory = temp(t);
  nativeFixture(directory);
  assert.equal(syncVersion(directory, 'v1.2.3'), '1.2.3');
  assert.equal(JSON.parse(fs.readFileSync(path.join(directory, 'package-lock.json'))).packages[''].version, '1.2.3');
  assert.equal(JSON.parse(fs.readFileSync(path.join(directory, 'package-lock.json'))).packages.dependency.version, '4.5.6');
  assert.match(fs.readFileSync(path.join(directory, 'src-tauri/Cargo.toml'), 'utf8'), /thing = \{ version = "2" \}/);
  assert.match(fs.readFileSync(path.join(directory, 'Cargo.lock'), 'utf8'), /name = "ecl-native-core"\nversion = "0.1.0"/);
});

test('malformed Cargo lock fails before modifying any version file', (t) => {
  const directory = temp(t);
  nativeFixture(directory);
  fs.writeFileSync(path.join(directory, 'Cargo.lock'), 'version = 4\n');
  assert.throws(() => syncVersion(directory, 'v1.2.3'), /missing/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(directory, 'package.json'))).version, '0.1.0');
});

test('release overlay and native mobile channel use the same public repository', (t) => {
  const directory = temp(t);
  nativeFixture(directory);
  prepareRelease(directory, 'v1.2.3', 'company/public-updates');
  const overlay = JSON.parse(fs.readFileSync(path.join(directory, 'artifacts/release-config.json')));
  const channel = JSON.parse(fs.readFileSync(path.join(directory, 'update-channel.json')));
  assert.equal(channel.repository, 'company/public-updates');
  assert.equal(channel.androidDistribution, 'github');
  assert.deepEqual(overlay.plugins.updater.endpoints, ['https://github.com/company/public-updates/releases/latest/download/latest.json']);
  assert.equal(overlay.bundle.createUpdaterArtifacts, true);
  assert.equal(overlay.bundle.android.versionCode, 1002003);
  prepareRelease(directory, 'v1.2.4', 'company/public-updates', 'https://apps.apple.com/app/id123');
  assert.equal(JSON.parse(fs.readFileSync(path.join(directory, 'update-channel.json'))).iosUrl, 'https://apps.apple.com/app/id123');
  assert.throws(() => prepareRelease(directory, 'v1.2.5', 'company/public-updates', 'https://evil.example/download.ipa'));
  assert.equal(JSON.parse(fs.readFileSync(path.join(directory, 'package.json'))).version, '1.2.4');
  assert.throws(() => androidVersionCode('1.1000.0'));
  assert.throws(() => releaseRepository('owner/repo/../../other'));
});

test('manifest rejects mismatched signing keys, unbound versions and missing signatures', (t) => {
  const directory = temp(t);
  const file = path.join(directory, 'app');
  assert.equal(signingKeyId(publicKey), keyId.toString('hex'));
  fs.writeFileSync(`${file}.sig`, signature('1.2.3', Buffer.alloc(8, 3)));
  assert.throws(() => signatureFor(file, publicKey, '1.2.3'), /does not match/);
  fs.writeFileSync(`${file}.sig`, signature('1.2.2'));
  assert.throws(() => signatureFor(file, publicKey, '1.2.3'), /release version/);
  fs.writeFileSync(`${file}.sig`, 'unsigned');
  assert.throws(() => signatureFor(file, publicKey, '1.2.3'));
});

test('universal macOS and Windows are required before latest.json can be published', (t) => {
  const directory = temp(t);
  artifactsFixture(directory);
  const manifest = createManifest({ directory, repository: 'company/updates', tag: 'v1.2.3', publicKey });
  assert.deepEqual(Object.keys(manifest.platforms).sort(), ['darwin-aarch64', 'darwin-x86_64', 'windows-x86_64']);
  assert.equal(manifest.platforms['darwin-aarch64'].url, manifest.platforms['darwin-x86_64'].url);
  assert.match(manifest.platforms['windows-x86_64'].url, /releases\/download\/v1\.2\.3\/ECL_1\.2\.3_x64-setup\.exe$/);
  assert.equal(manifest.mobile, undefined);
  assert.equal(fs.readFileSync(path.join(directory, 'SHA256SUMS.txt'), 'utf8').trim().split('\n').length, 6);
  fs.unlinkSync(path.join(directory, 'ECL_1.2.3_x64-setup.exe.sig'));
  assert.throws(() => createManifest({ directory, repository: 'company/updates', tag: 'v1.2.3', publicKey }));
});

test('Android manifest only advertises an enabled signed APK with its own version', (t) => {
  const directory = temp(t);
  artifactsFixture(directory);
  assert.throws(() => createManifest({ directory, repository: 'company/updates', tag: 'v1.2.3', publicKey, android: true }));
  artifactsFixture(directory, true);
  const manifest = createManifest({ directory, repository: 'company/updates', tag: 'v1.2.3', publicKey, android: true });
  assert.equal(manifest.mobile.android.version, '1.2.3');
  assert.match(manifest.mobile.android.sha256, /^[a-f0-9]{64}$/);
  assert.equal(manifest.mobile.android.signature, signature());
});

test('iOS notification requires independently published version and a trusted store URL', () => {
  assert.equal(iosRelease(), null);
  assert.deepEqual(iosRelease('https://testflight.apple.com/join/abc', '1.1.0'), { version: '1.1.0', url: 'https://testflight.apple.com/join/abc' });
  assert.throws(() => iosRelease('https://github.com/org/app.ipa', '1.2.3'));
  assert.throws(() => iosRelease('https://apps.apple.com/app/id123', undefined));
  assert.throws(() => iosRelease('https://user:secret@apps.apple.com/app/id123', '1.2.3'));
});
