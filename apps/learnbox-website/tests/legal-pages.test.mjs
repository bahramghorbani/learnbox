import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const appRoot = resolve(import.meta.dirname, '..');
const nextBin = resolve(appRoot, 'node_modules/next/dist/bin/next');
const buildRoot = resolve(appRoot, '.next');
const destinationEnvironmentDefaults = {
  NEXT_PUBLIC_SITE_URL: 'https://learnboxapp.com',
  NEXT_PUBLIC_WEB_APP_URL: '',
  NEXT_PUBLIC_CAFE_BAZAAR_URL: '',
  NEXT_PUBLIC_TELEGRAM_URL: 'https://t.me/learnboxapp',
  NEXT_PUBLIC_INSTAGRAM_URL: '',
  NEXT_PUBLIC_LINKEDIN_URL: '',
  NEXT_PUBLIC_PINTEREST_URL: '',
  NEXT_PUBLIC_PRIVACY_URL: 'https://learnboxapp.com/privacy',
  NEXT_PUBLIC_TERMS_URL: 'https://learnboxapp.com/terms',
  NEXT_PUBLIC_CONTACT_URL: 'mailto:hi@learnboxapp.com',
};

let unavailableHomeOutput;
let availableHomeOutput;
let invalidLegalHomeOutput;
let privacyOutput;
let termsOutput;
let prerenderManifest;

function buildEnvironment(overrides = {}) {
  return {
    ...process.env,
    NEXT_TELEMETRY_DISABLED: '1',
    ...destinationEnvironmentDefaults,
    ...overrides,
  };
}

function buildSite(overrides, label) {
  const build = spawnSync(process.execPath, [nextBin, 'build'], {
    cwd: appRoot,
    encoding: 'utf8',
    env: buildEnvironment(overrides),
  });

  assert.equal(
    build.status,
    0,
    `${label} Next.js build failed.\nSTDOUT:\n${build.stdout}\nSTDERR:\n${build.stderr}`,
  );
}

test.before(async () => {
  buildSite({}, 'unavailable-destination');
  [unavailableHomeOutput, privacyOutput, termsOutput, prerenderManifest] = await Promise.all([
    readFile(resolve(buildRoot, 'server/app/index.html'), 'utf8'),
    readFile(resolve(buildRoot, 'server/app/privacy.html'), 'utf8'),
    readFile(resolve(buildRoot, 'server/app/terms.html'), 'utf8'),
    readFile(resolve(buildRoot, 'prerender-manifest.json'), 'utf8').then(JSON.parse),
  ]);

  buildSite(
    {
      NEXT_PUBLIC_WEB_APP_URL: 'https://app.learnboxapp.com',
      NEXT_PUBLIC_CAFE_BAZAAR_URL: 'https://cafebazaar.ir/app/com.learnbox.app',
      NEXT_PUBLIC_PRIVACY_URL: 'https://legal.example/privacy-notice',
      NEXT_PUBLIC_TERMS_URL: 'https://legal.example/terms-of-use',
    },
    'available-destination',
  );
  availableHomeOutput = await readFile(resolve(buildRoot, 'server/app/index.html'), 'utf8');

  buildSite(
    {
      NEXT_PUBLIC_PRIVACY_URL: 'javascript:alert(1)',
      NEXT_PUBLIC_TERMS_URL: ' ',
    },
    'invalid-legal-destination',
  );
  invalidLegalHomeOutput = await readFile(resolve(buildRoot, 'server/app/index.html'), 'utf8');
});

test('build fixtures pin every destination variable before applying overrides', () => {
  const environment = buildEnvironment({
    NEXT_PUBLIC_PRIVACY_URL: 'https://legal.example/privacy-notice',
  });

  for (const [key, value] of Object.entries(destinationEnvironmentDefaults)) {
    assert.equal(
      environment[key],
      key === 'NEXT_PUBLIC_PRIVACY_URL' ? 'https://legal.example/privacy-notice' : value,
      `Build fixture left ${key} open to dotenv replacement`,
    );
  }
});

test('privacy route verifies the rewritten truthful disclosure after B21', () => {
  assert.ok(prerenderManifest.routes['/privacy']);
  assert.match(privacyOutput, /<html lang="fa" dir="rtl">/);
  assert.match(
    privacyOutput,
    /<link rel="canonical" href="https:\/\/learnboxapp\.com\/privacy"\/>/,
  );
  assert.match(privacyOutput, /<h1>اطلاعات شما در LearnBox<\/h1>/);

  // After B21 rewrite, old operational draft language was removed.
  // Verify the new truthful content instead.
  assert.doesNotMatch(privacyOutput, /نسخهٔ پیش‌انتشار/);
  assert.match(privacyOutput, /کد یک‌بارمصرف به‌صورت رمزنگاری‌شده و با عمر کوتاه نگهداری می‌شود/);
  assert.match(privacyOutput, /تعداد[\s\S]*?درخواست کد برای هر شماره محدود شده/);
  assert.match(privacyOutput, /۳۰ روز/); // backup retention
  assert.match(privacyOutput, /فقط برای کاربر واردشده قابل دریافت/); // authenticated-only media
  assert.match(privacyOutput, /href="mailto:hi@learnboxapp\.com"/);
});

test('terms route prerenders the complete approved conditions', () => {
  assert.ok(prerenderManifest.routes['/terms']);
  assert.match(termsOutput, /<html lang="fa" dir="rtl">/);
  assert.match(termsOutput, /<link rel="canonical" href="https:\/\/learnboxapp\.com\/terms"\/>/);
  assert.match(termsOutput, /<h1>چارچوب استفاده از LearnBox<\/h1>/);

  for (const phrase of [
    'پذیرش شرایط',
    'سرپرست قانونی',
    'مالکیت فکری',
    'واژگان شخصی',
    'هدف آموزشی',
    'تعمیر و نگهداری',
  ]) {
    assert.match(termsOutput, new RegExp(phrase), `Missing terms condition: ${phrase}`);
  }

  assert.match(termsOutput, /ابتدا[^<]+hi@learnboxapp\.com[^<]+حل نشود/);
  assert.match(termsOutput, /href="\/"/);
  assert.match(termsOutput, /href="mailto:hi@learnboxapp\.com"/);
});

test('unavailable release destinations render an honest download claim boundary', () => {
  assert.match(unavailableHomeOutput, /پیوندهای رسمی انتشار LearnBox هنوز اعلام نشده‌اند/);
  assert.doesNotMatch(unavailableHomeOutput, /نسخه اندروید LearnBox را از کافه‌بازار دریافت کن/);
  assert.doesNotMatch(unavailableHomeOutput, /با نسخه وب[^<]+مسیر یادگیری‌ات را ادامه بده/);
});

test('available release destinations render only the configured download options', () => {
  assert.match(availableHomeOutput, /نسخهٔ اندروید LearnBox از کافه‌بازار در دسترس است/);
  assert.match(availableHomeOutput, /نسخهٔ وب رسمی را در مرورگر باز کنی/);
  assert.match(availableHomeOutput, /href="https:\/\/cafebazaar\.ir\/app\/com\.learnbox\.app"/);
  assert.match(availableHomeOutput, /href="https:\/\/app\.learnboxapp\.com\/"/);
  assert.doesNotMatch(availableHomeOutput, /پیوندهای رسمی انتشار LearnBox هنوز اعلام نشده‌اند/);
});

test('default same-origin legal destinations render as internal navigation', () => {
  assert.match(unavailableHomeOutput, /href="\/privacy"[^>]*>حریم خصوصی<\/a>/);
  assert.match(unavailableHomeOutput, /href="\/terms"[^>]*>شرایط استفاده<\/a>/);
  assert.doesNotMatch(
    unavailableHomeOutput,
    /href="https:\/\/learnboxapp\.com\/(?:privacy|terms)"/,
  );
});

test('valid external legal overrides render as safe external links', () => {
  assert.match(
    availableHomeOutput,
    /href="https:\/\/legal\.example\/privacy-notice" target="_blank" rel="noopener noreferrer">حریم خصوصی<\/a>/,
  );
  assert.match(
    availableHomeOutput,
    /href="https:\/\/legal\.example\/terms-of-use" target="_blank" rel="noopener noreferrer">شرایط استفاده<\/a>/,
  );
});

test('invalid legal overrides fail closed as non-navigating footer text', () => {
  assert.match(invalidLegalHomeOutput, /<span aria-disabled="true">حریم خصوصی<\/span>/);
  assert.match(invalidLegalHomeOutput, /<span aria-disabled="true">شرایط استفاده<\/span>/);
  assert.doesNotMatch(invalidLegalHomeOutput, /javascript:alert/);
});

test('home route exposes the verified contact and Telegram destinations', () => {
  assert.match(unavailableHomeOutput, /href="mailto:hi@learnboxapp\.com"/);
  assert.match(
    unavailableHomeOutput,
    /href="https:\/\/t\.me\/learnboxapp" target="_blank" rel="noopener noreferrer"/,
  );
});
