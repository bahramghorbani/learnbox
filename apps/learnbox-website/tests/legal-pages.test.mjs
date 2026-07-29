import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import test from 'node:test';

const appRoot = resolve(import.meta.dirname, '..');
const nextBin = resolve(appRoot, 'node_modules/next/dist/bin/next');
const buildRoot = resolve(appRoot, '.next');
const landingPublicEnvironmentVariables = [
  'NEXT_PUBLIC_SITE_URL',
  'NEXT_PUBLIC_WEB_APP_URL',
  'NEXT_PUBLIC_CAFE_BAZAAR_URL',
  'NEXT_PUBLIC_TELEGRAM_URL',
  'NEXT_PUBLIC_INSTAGRAM_URL',
  'NEXT_PUBLIC_LINKEDIN_URL',
  'NEXT_PUBLIC_PINTEREST_URL',
  'NEXT_PUBLIC_PRIVACY_URL',
  'NEXT_PUBLIC_TERMS_URL',
  'NEXT_PUBLIC_CONTACT_URL',
];
let homeOutput;
let privacyOutput;
let termsOutput;
let prerenderManifest;

test.before(async () => {
  const buildEnvironment = { ...process.env };
  for (const variable of landingPublicEnvironmentVariables) {
    delete buildEnvironment[variable];
  }
  buildEnvironment.NEXT_PUBLIC_SITE_URL = 'https://learnboxapp.com';
  buildEnvironment.NEXT_TELEMETRY_DISABLED = '1';

  const build = spawnSync(process.execPath, [nextBin, 'build'], {
    cwd: appRoot,
    encoding: 'utf8',
    env: buildEnvironment,
  });

  assert.equal(
    build.status,
    0,
    `Next.js build failed.\nSTDOUT:\n${build.stdout}\nSTDERR:\n${build.stderr}`,
  );

  [homeOutput, privacyOutput, termsOutput, prerenderManifest] = await Promise.all([
    readFile(resolve(buildRoot, 'server/app/index.html'), 'utf8'),
    readFile(resolve(buildRoot, 'server/app/privacy.html'), 'utf8'),
    readFile(resolve(buildRoot, 'server/app/terms.html'), 'utf8'),
    readFile(resolve(buildRoot, 'prerender-manifest.json'), 'utf8').then(JSON.parse),
  ]);
});

test('privacy route prerenders the approved user-facing policy', () => {
  assert.ok(prerenderManifest.routes['/privacy']);
  assert.match(privacyOutput, /<html lang="fa" dir="rtl">/);
  assert.match(
    privacyOutput,
    /<link rel="canonical" href="https:\/\/learnboxapp\.com\/privacy"\/>/,
  );
  assert.match(privacyOutput, /<h1>اطلاعات شما در LearnBox<\/h1>/);

  for (const phrase of ['داده‌های روی دستگاه', 'رضایت', 'نگهداری', 'حذف', 'فروش اطلاعات شخصی']) {
    assert.match(privacyOutput, new RegExp(phrase));
  }

  assert.match(privacyOutput, /href="\/"/);
  assert.match(privacyOutput, /href="mailto:hi@learnboxapp\.com"/);
});

test('terms route prerenders the approved user-facing conditions', () => {
  assert.ok(prerenderManifest.routes['/terms']);
  assert.match(termsOutput, /<html lang="fa" dir="rtl">/);
  assert.match(termsOutput, /<link rel="canonical" href="https:\/\/learnboxapp\.com\/terms"\/>/);
  assert.match(termsOutput, /<h1>چارچوب استفاده از LearnBox<\/h1>/);

  for (const phrase of [
    'نسخهٔ پیش‌انتشار',
    'استفادهٔ مجاز',
    'مالکیت فکری',
    'هدف آموزشی',
    'حقوق غیرقابل اسقاط',
  ]) {
    assert.match(termsOutput, new RegExp(phrase));
  }

  assert.match(termsOutput, /href="\/"/);
  assert.match(termsOutput, /href="mailto:hi@learnboxapp\.com"/);
});

test('home route exposes the verified active legal and contact links', () => {
  assert.match(homeOutput, /href="\/privacy"/);
  assert.match(homeOutput, /href="\/terms"/);
  assert.match(homeOutput, /href="mailto:hi@learnboxapp\.com"/);
  assert.match(
    homeOutput,
    /href="https:\/\/t\.me\/learnboxapp" target="_blank" rel="noopener noreferrer"/,
  );
});
