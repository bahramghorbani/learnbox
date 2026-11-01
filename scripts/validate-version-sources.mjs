#!/usr/bin/env node
/**
 * Version-source boundary.
 *
 * LearnBox versions three products independently: the Learner PWA, Admin Web and Android. The rule this validator protects is simple and easy to break by accident:
 *
 *   each product has exactly ONE authoritative version declaration, it is that product's own
 *   file, and no product may display, import or inherit another product's version.
 *
 * A shared constant, a cross-app import or a hardcoded fallback would all make a shipped build
 * able to advertise a version it does not have. See docs/release/VERSIONING.md.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];

function read(relativePath) {
  return readFileSync(resolve(repositoryRoot, relativePath), 'utf8');
}

function check(condition, message) {
  if (!condition) {
    failures.push(message);
  }
}

const semver = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

// --- One authoritative declaration per product -------------------------------------------

const products = [
  {
    name: 'Learner PWA',
    tagPrefix: 'learner/v',
    versionFile: 'apps/website/package.json',
    nextConfig: 'apps/website/next.config.mjs',
    accessor: 'apps/website/lib/learner-app-version.ts',
    envVar: 'NEXT_PUBLIC_LEARNBOX_LEARNER_VERSION',
    surface: 'apps/website/app/components/ProfileScreen.tsx',
    accessorImport: 'learnerAppVersion',
  },
  {
    name: 'Admin Web',
    tagPrefix: 'admin/v',
    versionFile: 'apps/admin/package.json',
    nextConfig: 'apps/admin/next.config.mjs',
    accessor: 'apps/admin/lib/admin-app-version.ts',
    envVar: 'NEXT_PUBLIC_LEARNBOX_ADMIN_VERSION',
    surface: 'apps/admin/app/components/AdminSidebar.tsx',
    accessorImport: 'adminAppVersion',
  },
];

const declaredVersions = new Map();

for (const product of products) {
  const manifest = JSON.parse(read(product.versionFile));
  check(
    typeof manifest.version === 'string' && semver.test(manifest.version),
    `${product.name}: ${product.versionFile} must declare a semver version (got ${String(manifest.version)}).`,
  );
  declaredVersions.set(product.name, manifest.version);

  const config = read(product.nextConfig);
  check(
    config.includes("('./package.json')"),
    `${product.name}: ${product.nextConfig} must read its OWN ./package.json as the version source.`,
  );
  check(
    config.includes(`${product.envVar}:`),
    `${product.name}: ${product.nextConfig} must inject ${product.envVar}.`,
  );
  for (const other of products) {
    if (other === product) continue;
    check(
      !config.includes(other.envVar),
      `${product.name}: ${product.nextConfig} must not reference ${other.name}'s ${other.envVar}.`,
    );
  }

  const accessor = read(product.accessor);
  check(
    accessor.includes(`process.env.${product.envVar}`),
    `${product.name}: ${product.accessor} must read process.env.${product.envVar}.`,
  );
  // No hardcoded fallback version: an uninjected build shows nothing, never a placeholder.
  check(
    !/['"`]\d+\.\d+\.\d+/.test(accessor),
    `${product.name}: ${product.accessor} must not contain a hardcoded fallback version.`,
  );
  check(
    !/\bimport\b[^\n]*\.\.\/\.\.\/\.\./.test(accessor),
    `${product.name}: ${product.accessor} must stay app-local and import no cross-app module.`,
  );

  const surface = read(product.surface);
  check(
    surface.includes(product.accessorImport),
    `${product.name}: ${product.surface} must render its version through ${product.accessorImport}().`,
  );
  for (const other of products) {
    if (other === product) continue;
    check(
      !surface.includes(other.accessorImport),
      `${product.name}: ${product.surface} must not use ${other.name}'s version accessor.`,
    );
  }
}

// --- Android -------------------------------------------------------------------------------
//
// Android owns its version in the Gradle application module. `versionCode` is global across
// store flavors: a Bazaar upload consumes the next code just as a Myket upload does.
const androidVersionFile = 'apps/android/app/build.gradle.kts';
const androidVersionSource = read(androidVersionFile);
const androidVersionNames = [
  ...androidVersionSource.matchAll(/^\s*versionName\s*=\s*"([^"]+)"\s*$/gm),
];
const androidVersionCodes = [...androidVersionSource.matchAll(/^\s*versionCode\s*=\s*(\d+)\s*$/gm)];
check(
  androidVersionNames.length === 1 && semver.test(androidVersionNames[0]?.[1] ?? ''),
  `${androidVersionFile} must declare exactly one semver versionName.`,
);
check(
  androidVersionCodes.length === 1 && Number(androidVersionCodes[0]?.[1]) > 0,
  `${androidVersionFile} must declare exactly one positive integer versionCode.`,
);
const androidVersionName = androidVersionNames[0]?.[1];
const androidVersionCode = androidVersionCodes[0]?.[1];

// --- iOS ---------------------------------------------------------------------------------
const iosVersionFile = 'apps/ios/LearnBox.xcodeproj/project.pbxproj';
const iosSource = read(iosVersionFile);
const iosVersionNames = new Set(
  [...iosSource.matchAll(/MARKETING_VERSION = ([^;]+);/g)].map((m) => m[1]),
);
const iosBuilds = new Set(
  [...iosSource.matchAll(/CURRENT_PROJECT_VERSION = ([^;]+);/g)].map((m) => m[1]),
);
const [iosVersionName] = iosVersionNames;
const [iosBuild] = iosBuilds;
check(
  iosVersionNames.size === 1 && semver.test(iosVersionName ?? ''),
  `${iosVersionFile} must declare one semver MARKETING_VERSION across all configurations.`,
);
check(
  iosBuilds.size === 1 && /^\d+$/.test(iosBuild ?? '') && Number(iosBuild) > 0,
  `${iosVersionFile} must declare one positive integer CURRENT_PROJECT_VERSION across all configurations.`,
);

// --- Store submissions ledger -------------------------------------------------------------
//
// A build number is never reused for another artifact in the same store, and the checked-in build
// number never falls below the highest one submitted to any store.
const ledgerFile = 'docs/release/STORE_SUBMISSIONS.md';
const ledger = read(ledgerFile);
const ledgerBody = ledger.split('<!-- ledger:start -->')[1]?.split('<!-- ledger:end -->')[0] ?? '';
const submissions = ledgerBody
  .split('\n')
  .filter((line) => /^\|\s*(android|ios)\s*\|/.test(line))
  .map((line) => {
    const [platform, store, version, build, , sha256, , status] = line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim());
    return { platform, store, version, build: Number(build), sha256, status };
  });
check(submissions.length > 0, `${ledgerFile} must list the submitted store builds.`);
const statuses = ['submitted', 'in_review', 'published', 'rejected', 'superseded'];
const artifactByBuild = new Map();
for (const row of submissions) {
  const label = `${ledgerFile}: ${row.platform}/${row.store} build ${row.build}`;
  check(
    semver.test(row.version) && Number.isInteger(row.build) && row.build > 0,
    `${label} needs a semver version and positive build.`,
  );
  check(/^[0-9a-f]{64}$/.test(row.sha256), `${label} needs the artifact SHA-256.`);
  check(statuses.includes(row.status), `${label} has unknown status ${row.status}.`);
  const key = `${row.platform}#${row.store}#${row.build}`;
  const prior = artifactByBuild.get(key);
  check(
    !prior || prior === row.sha256,
    `${label} reuses a build number already used by another artifact.`,
  );
  artifactByBuild.set(key, row.sha256);
}
const maxBuild = (platform) =>
  Math.max(0, ...submissions.filter((row) => row.platform === platform).map((row) => row.build));
check(
  Number(androidVersionCode) >= maxBuild('android'),
  `${androidVersionFile} versionCode ${androidVersionCode} is below the highest submitted Android build ${maxBuild('android')}.`,
);
check(
  Number(iosBuild) >= maxBuild('ios'),
  `${iosVersionFile} CURRENT_PROJECT_VERSION ${iosBuild} is below the highest submitted iOS build ${maxBuild('ios')}.`,
);

// --- Documented release-tag architecture --------------------------------------------------

const versioningDoc = read('docs/release/VERSIONING.md');
for (const product of products) {
  check(
    versioningDoc.includes(product.tagPrefix),
    `docs/release/VERSIONING.md must document the ${product.tagPrefix}X.Y.Z tag namespace.`,
  );
}
check(
  versioningDoc.includes('android/v'),
  'docs/release/VERSIONING.md must document the android/vX.Y.Z tag namespace.',
);
check(
  versioningDoc.includes('ios/v') && versioningDoc.includes('STORE_SUBMISSIONS.md'),
  'docs/release/VERSIONING.md must document the ios/vX.Y.Z tags and the store submissions ledger.',
);
check(
  versioningDoc.includes('versionCode'),
  'docs/release/VERSIONING.md must document the Android versionCode rule.',
);

// --- Report -------------------------------------------------------------------------------

if (failures.length > 0) {
  console.error('Version-source boundary violations:');
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}

console.log('Version sources are independent and authoritative:');
for (const product of products) {
  console.log(
    `  - ${product.name}: ${declaredVersions.get(product.name)} (${product.versionFile}) -> tags ${product.tagPrefix}X.Y.Z`,
  );
}
console.log(
  `  - Android: ${androidVersionName ?? 'invalid'}+${androidVersionCode ?? 'invalid'} (${androidVersionFile}) -> tags android/vX.Y.Z`,
);
console.log(
  `  - iOS: ${iosVersionName ?? 'invalid'}+${iosBuild ?? 'invalid'} (${iosVersionFile}) -> tags ios/vX.Y.Z`,
);
console.log(
  `  - Store ledger: ${submissions.length} submissions; next Android build > ${maxBuild('android')}, next iOS build > ${maxBuild('ios')}`,
);
