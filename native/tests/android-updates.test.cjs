'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { patchAndroidManifest } = require('../scripts/mobile.cjs');

const template = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-permission android:name="android.permission.INTERNET" />
    <application android:usesCleartextTraffic="true">
        <activity android:name=".MainActivity" android:exported="true" />
    </application>
</manifest>
`;

test('GitHub APK updates add one private scoped provider and remain reproducible', () => {
  const manifest = patchAndroidManifest(template, 'github');
  assert.equal(patchAndroidManifest(manifest, 'github'), manifest);
  assert.equal((manifest.match(/android.permission.REQUEST_INSTALL_PACKAGES/g) || []).length, 1);
  assert.equal((manifest.match(/ru.ecl.workspace.updates.UpdateFileProvider/g) || []).length, 1);
  assert.match(manifest, /android:authorities="\$\{applicationId\}.ecl.updates"/);
  assert.match(manifest, /android:exported="false"\s+android:grantUriPermissions="true"/);
  assert.match(manifest, /android:usesCleartextTraffic="false"/);
  assert.match(manifest, /android.permission.CAMERA/);
  assert.match(manifest, /android.permission.RECORD_AUDIO/);
  const paths = fs.readFileSync(path.join(__dirname, '..', 'android-updates', 'ecl_update_paths.xml'), 'utf8');
  assert.match(paths, /<cache-path name="ecl_updates" path="updates\/" \/>/);
  assert.doesNotMatch(paths, /external-path|root-path|path="\."/);
});

test('switching to store distribution removes APK installer permission and provider', () => {
  const github = patchAndroidManifest(template, 'github');
  const store = patchAndroidManifest(github, 'store');
  assert.doesNotMatch(store, /REQUEST_INSTALL_PACKAGES|UpdateFileProvider|\.ecl.updates/);
  assert.match(store, /android.permission.INTERNET/);
  assert.match(store, /android.permission.RECORD_AUDIO/);
  assert.equal(patchAndroidManifest(store, 'store'), store);
  assert.equal(patchAndroidManifest(store, 'github'), github);
});

test('ambiguous updater provider and unknown channel fail instead of publishing altered permissions', () => {
  const unmanaged = template.replace('    </application>', '        <provider android:name="ru.ecl.workspace.updates.UpdateFileProvider" />\n    </application>');
  assert.throws(() => patchAndroidManifest(unmanaged, 'github'), /Unmanaged Android update provider/);
  assert.throws(() => patchAndroidManifest(template, 'silent'), /Unknown Android update channel/);
});
