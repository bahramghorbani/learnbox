import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { validatePackagedSecureStorage } from './validate-mobile-android-secure-storage.mjs';

const manifest = `
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
  <application android:allowBackup="false"
    android:dataExtractionRules="@xml/data_extraction_rules" />
</manifest>`;

const securePreferencePaths = [
  'learnbox.reviewQueue.v1.xml',
  'FlutterSecureKeyStorage:learnbox.reviewQueue.v1.xml',
  'FlutterSecureStorageConfiguration:learnbox.reviewQueue.v1.xml',
  'FlutterSecureStorageConfiguration.xml',
];

const rulesTree = `
E: data-extraction-rules
  E: cloud-backup
${securePreferencePaths
  .map((path) => `    E: exclude\n      A: domain="sharedpref"\n      A: path="${path}"`)
  .join('\n')}
  E: device-transfer
${securePreferencePaths
  .map((path) => `    E: exclude\n      A: domain="sharedpref"\n      A: path="${path}"`)
  .join('\n')}
`;

test('accepts packaged manifest and rules that exclude all secure-storage artifacts', () => {
  assert.doesNotThrow(() => validatePackagedSecureStorage({ manifest, rulesTree }));
});

test('accepts the packaged resource ID emitted by apkanalyzer', () => {
  assert.doesNotThrow(() =>
    validatePackagedSecureStorage({
      manifest: manifest.replace('@xml/data_extraction_rules', '@ref/0x7f0e0000'),
      rulesTree,
    }),
  );
});

test('rejects a packaged rule set with one device-transfer exclusion missing', () => {
  const missingPath = 'FlutterSecureStorageConfiguration.xml';
  const secondOccurrence = rulesTree.lastIndexOf(`A: path="${missingPath}"`);
  const mismatchedRules =
    rulesTree.slice(0, secondOccurrence) +
    rulesTree.slice(secondOccurrence).replace(`A: path="${missingPath}"`, 'A: path="wrong.xml"');

  assert.throws(
    () => validatePackagedSecureStorage({ manifest, rulesTree: mismatchedRules }),
    /device-transfer.*FlutterSecureStorageConfiguration\.xml/,
  );
});

test('rejects a packaged manifest that allows backup', () => {
  assert.throws(
    () =>
      validatePackagedSecureStorage({
        manifest: manifest.replace('allowBackup="false"', 'allowBackup="true"'),
        rulesTree,
      }),
    /allowBackup/,
  );
});

test('root check runs the mobile Android secure-storage contract', async () => {
  const packageJson = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8'),
  );

  assert.match(packageJson.scripts.check, /pnpm test:mobile-android-storage/);
});
