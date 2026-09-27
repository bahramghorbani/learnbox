import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import test from 'node:test';

const appRoot = resolve(import.meta.dirname, '..');
const script = resolve(appRoot, 'scripts/check-upload-readiness.mjs');

const validReleaseEnvironment = {
  NEXT_PUBLIC_SITE_URL: 'https://learnboxapp.com',
  NEXT_PUBLIC_WEB_APP_URL: 'https://app.learnboxapp.com',
  NEXT_PUBLIC_CAFE_BAZAAR_URL: 'https://cafebazaar.ir/app/com.learnbox.app',
  NEXT_PUBLIC_TELEGRAM_URL: 'https://t.me/learnboxapp',
  NEXT_PUBLIC_INSTAGRAM_URL: 'https://instagram.com/learnboxapp',
  NEXT_PUBLIC_LINKEDIN_URL: 'https://linkedin.com/company/learnboxapp',
  NEXT_PUBLIC_PINTEREST_URL: 'https://pinterest.com/learnboxapp',
  NEXT_PUBLIC_PRIVACY_URL: 'https://learnboxapp.com/privacy',
  NEXT_PUBLIC_TERMS_URL: 'https://learnboxapp.com/terms',
  NEXT_PUBLIC_CONTACT_URL: 'mailto:hi@learnboxapp.com',
  LEARNBOX_PRODUCT_SCREEN_STATUS: 'approved',
  LEARNBOX_QR_STATUS: 'approved',
  LEARNBOX_OG_STATUS: 'approved',
  LEARNBOX_LEGAL_REVIEW_STATUS: 'approved',
};

function runReadiness(mode, environment = {}) {
  return spawnSync(process.execPath, [script, `--mode=${mode}`], {
    cwd: appRoot,
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      ...environment,
    },
  });
}

test('preview upload gate passes with honest placeholders and the canonical site URL', () => {
  const result = runReadiness('preview', {
    NEXT_PUBLIC_SITE_URL: 'https://learnboxapp.com',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /PREVIEW UPLOAD READY/);
});

test('production gate rejects missing destinations and unapproved product content', () => {
  const result = runReadiness('production', {
    NEXT_PUBLIC_SITE_URL: 'https://learnboxapp.com',
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /NEXT_PUBLIC_WEB_APP_URL/);
  assert.match(result.stderr, /NEXT_PUBLIC_CAFE_BAZAAR_URL/);
  assert.match(result.stderr, /NEXT_PUBLIC_INSTAGRAM_URL/);
  assert.match(result.stderr, /NEXT_PUBLIC_LINKEDIN_URL/);
  assert.match(result.stderr, /NEXT_PUBLIC_PINTEREST_URL/);
  assert.match(result.stderr, /LEARNBOX_PRODUCT_SCREEN_STATUS/);
  assert.match(result.stderr, /LEARNBOX_QR_STATUS/);
  assert.match(result.stderr, /LEARNBOX_OG_STATUS/);
  assert.match(result.stderr, /LEARNBOX_LEGAL_REVIEW_STATUS/);
  assert.doesNotMatch(result.stderr, /NEXT_PUBLIC_TELEGRAM_URL/);
  assert.doesNotMatch(result.stderr, /NEXT_PUBLIC_PRIVACY_URL/);
  assert.doesNotMatch(result.stderr, /NEXT_PUBLIC_TERMS_URL/);
  assert.doesNotMatch(result.stderr, /NEXT_PUBLIC_CONTACT_URL/);
});

test('production gate accepts a complete valid release configuration', () => {
  const result = runReadiness('production', validReleaseEnvironment);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /PRODUCTION UPLOAD READY/);
});

test('production gate rejects a complete configuration without approved legal review', () => {
  const withoutLegalApproval = { ...validReleaseEnvironment };
  delete withoutLegalApproval.LEARNBOX_LEGAL_REVIEW_STATUS;
  const result = runReadiness('production', withoutLegalApproval);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /LEARNBOX_LEGAL_REVIEW_STATUS must be approved/);
});

test('production gate rejects insecure or mismatched official destinations', () => {
  const result = runReadiness('production', {
    ...validReleaseEnvironment,
    NEXT_PUBLIC_CAFE_BAZAAR_URL: 'http://example.com/fake-store',
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /NEXT_PUBLIC_CAFE_BAZAAR_URL/);
});
