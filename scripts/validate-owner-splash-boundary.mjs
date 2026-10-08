import { readFile } from 'node:fs/promises';

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

const [
  environment,
  routes,
  server,
  storage,
  replacement,
  image,
  ui,
  learnerDelivery,
  learnerLaunch,
  migration,
  splashStore,
] = await Promise.all([
  source('.env.example'),
  source('apps/admin/lib/server/admin-splash-routes.ts'),
  source('apps/admin/lib/server/admin-splash-server.ts'),
  source('apps/admin/lib/server/private-splash-storage.ts'),
  source('apps/admin/lib/server/replace-splash.ts'),
  source('apps/admin/lib/server/splash-image.ts'),
  source('apps/admin/app/components/SplashReplacementPanel.tsx'),
  source('apps/website/lib/launch-splash.ts'),
  source('apps/website/app/components/LaunchScreen.tsx'),
  source('database/migrations/0011_owner_splash_replacement.sql'),
  source('apps/admin/lib/server/postgres-splash-store.ts'),
]);

const errors = [];
function requireText(body, expected, label) {
  if (!body.includes(expected)) errors.push(`${label}: ${expected}`);
}

requireText(
  environment,
  'LEARNBOX_ADMIN_SPLASH_REPLACEMENT_ENABLED=false',
  'Replacement must default to disabled',
);
requireText(environment, '# BLOB_READ_WRITE_TOKEN=', 'Private token must have no example value');
requireText(
  environment,
  'LEARNBOX_DYNAMIC_SPLASH_ENABLED=false',
  'Learner delivery must default to disabled',
);
requireText(
  server,
  "LEARNBOX_ADMIN_SPLASH_REPLACEMENT_ENABLED !== 'true'",
  'Server flag must fail closed',
);
requireText(server, 'BLOB_READ_WRITE_TOKEN', 'Server must require private storage');
requireText(server, 'readAdminAuthConfig', 'Server must share the owner passkey boundary');

for (const required of [
  'assertTrustedAdminMutation',
  'verifyAdminCsrf',
  '!session.recent',
  'maximumImageBytes',
  'idempotencyKeyPattern',
  "'Cache-Control': 'private, no-store'",
  "'Cross-Origin-Resource-Policy': 'same-origin'",
]) {
  requireText(routes, required, 'Protected route requirement missing');
}

for (const required of ["access: 'private'", 'addRandomSuffix: false', 'assertSplashObjectKey']) {
  requireText(storage, required, 'Private storage requirement missing');
}
if (/https?:\/\//.test(storage))
  errors.push('Private storage adapter must not contain a public URL.');

for (const required of [
  'randomUUID',
  'admin/splash/${versionId}.webp',
  'previousObjectKey',
  'queueCleanup',
]) {
  requireText(replacement, required, 'Atomic replacement requirement missing');
}

for (const required of [
  "['jpeg', 'png', 'webp']",
  'maximumInputBytes',
  'minimumWidth',
  'minimumHeight',
  '.webp(',
]) {
  requireText(image, required, 'Image normalization requirement missing');
}

for (const required of [
  "'/api/splash/current'",
  "'/api/splash/replace'",
  "'/api/splash/revert'",
  'crypto.randomUUID()',
  "'/api/auth/reauth/options'",
  "'/api/auth/reauth/verify'",
]) {
  requireText(ui, required, 'Owner UI requirement missing');
}
for (const forbidden of ['زمان‌بندی', 'آیکون برنامه', 'تاریخچه', 'حذف اسپلش', 'objectKey']) {
  if (ui.includes(forbidden)) errors.push(`Owner UI exposes excluded control/detail: ${forbidden}`);
}
if (/localStorage|sessionStorage|console\./.test(ui)) {
  errors.push('Owner splash UI must not persist or log sensitive state.');
}

for (const required of [
  "environment.LEARNBOX_DYNAMIC_SPLASH_ENABLED !== 'true'",
  "access: 'private'",
  "'Cache-Control': 'no-store'",
  "'Cross-Origin-Resource-Policy': 'same-origin'",
]) {
  requireText(learnerDelivery, required, 'Learner splash delivery requirement missing');
}
if (/https?:\/\//.test(learnerDelivery)) {
  errors.push('Learner splash delivery must not contain a public Blob URL.');
}
// M4.1: the canonical bytes live in splash_versions.image_data, so a missing (legacy) blob token
// must only remove the blob fallback. Requiring it in the config made a promoted splash 404.
if (/if \(!blobToken\) return null/.test(learnerDelivery)) {
  errors.push(
    'Learner splash delivery must not require BLOB_READ_WRITE_TOKEN to deliver DB bytes.',
  );
}
requireText(
  learnerDelivery,
  'image_data IS NOT NULL',
  'Learner delivery must read canonical bytes',
);
// M4.1: revert must deactivate the pointer only — never destroy a version, its bytes or the trail.
requireText(routes, 'createSplashRevertRoute', 'Revert route must exist in the guarded module');
if (/DELETE\s+FROM\s+splash_versions/i.test(splashStore)) {
  errors.push('Splash store must never delete a version row or its image bytes.');
}
// The only permitted deletion of a replacement action is an abandoned, never-completed reservation.
for (const match of splashStore.matchAll(/DELETE FROM splash_replacement_actions[\s\S]{0,120}/g)) {
  if (!match[0].includes("status = 'pending'")) {
    errors.push('Replacement history may only be deleted while still pending.');
  }
}
requireText(
  splashStore,
  'DELETE FROM current_splash WHERE singleton_id = 1',
  'Revert must deactivate by deleting only the current pointer',
);
requireText(splashStore, "'splash.reverted'", 'Revert must be audited');
for (const required of ["'/api/launch/splash'", 'activeLaunchExperience.imagePath']) {
  requireText(learnerLaunch, required, 'Learner launch fallback requirement missing');
}

for (const required of [
  'CREATE TABLE splash_versions',
  'CREATE TABLE current_splash',
  'CREATE TABLE splash_replacement_actions',
  'CREATE TABLE private_media_cleanup_jobs',
]) {
  requireText(migration, required, 'Persistence requirement missing');
}

if (errors.length) {
  throw new Error(`Owner splash boundary is unsafe:\n- ${errors.join('\n- ')}`);
}

console.info('Owner splash replacement is private, protected and disabled by default.');
