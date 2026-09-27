import { execFile } from 'node:child_process';
import { access, readdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

const execFileAsync = promisify(execFile);

export const secureStoragePreferencePaths = [
  'learnbox.reviewQueue.v1.xml',
  'FlutterSecureKeyStorage:learnbox.reviewQueue.v1.xml',
  'FlutterSecureStorageConfiguration:learnbox.reviewQueue.v1.xml',
  'FlutterSecureStorageConfiguration.xml',
];

export function validatePackagedSecureStorage({ manifest, rulesTree }) {
  if (!/android:allowBackup="false"/.test(manifest)) {
    throw new Error('Packaged Android manifest must keep android:allowBackup="false".');
  }
  if (
    !/android:dataExtractionRules="(?:@xml\/data_extraction_rules|@ref\/0x[0-9a-f]+)"/i.test(
      manifest,
    )
  ) {
    throw new Error('Packaged Android manifest must link @xml/data_extraction_rules.');
  }

  const cloudStart = rulesTree.indexOf('E: cloud-backup');
  const transferStart = rulesTree.indexOf('E: device-transfer');
  if (cloudStart < 0 || transferStart < 0 || transferStart <= cloudStart) {
    throw new Error(
      'Packaged data extraction rules must contain cloud-backup and device-transfer.',
    );
  }

  const sections = {
    'cloud-backup': rulesTree.slice(cloudStart, transferStart),
    'device-transfer': rulesTree.slice(transferStart),
  };
  for (const [sectionName, section] of Object.entries(sections)) {
    for (const preferencePath of secureStoragePreferencePaths) {
      if (!section.includes(`A: path="${preferencePath}"`)) {
        throw new Error(`Packaged ${sectionName} rules must exclude ${preferencePath}.`);
      }
    }
  }
}

async function validateApk(apkPath) {
  const sdkRoot = process.env.ANDROID_SDK_ROOT ?? process.env.ANDROID_HOME;
  if (!sdkRoot) {
    throw new Error('ANDROID_SDK_ROOT or ANDROID_HOME is required.');
  }
  const apkanalyzer = path.join(sdkRoot, 'cmdline-tools', 'latest', 'bin', 'apkanalyzer');
  await access(apkanalyzer, constants.X_OK);
  const aapt2 = await findLatestAapt2(sdkRoot);
  const [{ stdout: manifest }, { stdout: rulesTree }] = await Promise.all([
    execFileAsync(apkanalyzer, ['manifest', 'print', apkPath]),
    execFileAsync(aapt2, [
      'dump',
      'xmltree',
      '--file',
      'res/xml/data_extraction_rules.xml',
      apkPath,
    ]),
  ]);

  validatePackagedSecureStorage({ manifest, rulesTree });
  console.log('Packaged Android manifest and extraction rules protect secure review storage.');
}

async function findLatestAapt2(sdkRoot) {
  const buildToolsRoot = path.join(sdkRoot, 'build-tools');
  const versions = (await readdir(buildToolsRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }));
  for (const version of versions) {
    const candidate = path.join(buildToolsRoot, version, 'aapt2');
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Continue to the next installed Build Tools version.
    }
  }
  throw new Error('No executable aapt2 was found in Android Build Tools.');
}

const isMain =
  process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  const apkFlagIndex = process.argv.indexOf('--apk');
  const apkPath = apkFlagIndex >= 0 ? process.argv[apkFlagIndex + 1] : null;
  if (!apkPath) {
    throw new Error('Usage: node scripts/validate-mobile-android-secure-storage.mjs --apk <path>');
  }
  await validateApk(path.resolve(apkPath));
}
