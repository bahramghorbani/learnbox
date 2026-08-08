import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  isOtpVerificationSuccess,
  isOwnerOtpTestEnabled,
  normalizeOtpDigits,
  otpErrorMessage,
  readChallengeResponse,
  validateIranianMobile,
} from '../app/owner/otp-test/owner-otp-test';

describe('owner OTP test helpers', () => {
  it('enables the owner UI only in Preview or explicit local development', () => {
    expect(
      isOwnerOtpTestEnabled({
        LEARNBOX_OTP_TEST_UI_ENABLED: 'true',
        VERCEL_ENV: 'preview',
        NODE_ENV: 'production',
      }),
    ).toBe(true);
    expect(
      isOwnerOtpTestEnabled({
        LEARNBOX_OTP_TEST_UI_ENABLED: 'true',
        VERCEL_ENV: 'production',
        NODE_ENV: 'production',
      }),
    ).toBe(false);
    expect(
      isOwnerOtpTestEnabled({
        LEARNBOX_OTP_TEST_UI_ENABLED: 'true',
        NODE_ENV: 'development',
      }),
    ).toBe(true);
    expect(isOwnerOtpTestEnabled({ LEARNBOX_OTP_TEST_UI_ENABLED: 'false' })).toBe(false);
  });

  it('accepts only the exact no-content verification response', () => {
    expect(isOtpVerificationSuccess(204)).toBe(true);
    expect(isOtpVerificationSuccess(200)).toBe(false);
    expect(isOtpVerificationSuccess(201)).toBe(false);
  });

  it('normalizes Persian and Arabic digits without keeping separators', () => {
    expect(normalizeOtpDigits('۰۹۱۲ ٣٤۵-۶۷۸۹')).toBe('09123456789');
  });

  it('accepts only complete Iranian mobile numbers in national form', () => {
    expect(validateIranianMobile('۰۹۱۲۱۲۳۴۵۶۷')).toBe(true);
    expect(validateIranianMobile('۹۱۲۱۲۳۴۵۶۷')).toBe(true);
    expect(validateIranianMobile('۰۲۱۱۲۳۴۵۶۷۸')).toBe(false);
    expect(validateIranianMobile('0912123456')).toBe(false);
  });

  it('accepts only opaque, complete challenge metadata', () => {
    expect(
      readChallengeResponse({
        challengeId: 'd3f1ddca-f8e8-45c8-bdc6-67eef1ab1aed',
        expiresAt: '2026-08-08T10:05:00.000Z',
        resendAvailableAt: '2026-08-08T10:01:00.000Z',
      }),
    ).toEqual({
      challengeId: 'd3f1ddca-f8e8-45c8-bdc6-67eef1ab1aed',
      expiresAt: '2026-08-08T10:05:00.000Z',
      resendAvailableAt: '2026-08-08T10:01:00.000Z',
    });
    expect(readChallengeResponse({ challengeId: 'short' })).toBeNull();
  });

  it('maps server failures to safe Persian guidance', () => {
    expect(otpErrorMessage(400, 'request_invalid')).toBe('شمارهٔ موبایل را کامل و درست وارد کنید.');
    expect(otpErrorMessage(429, 'request_limited')).toBe(
      'تعداد درخواست‌ها زیاد شده است؛ کمی صبر کنید و دوباره تلاش کنید.',
    );
    expect(otpErrorMessage(400, 'verification_failed')).toBe(
      'کد واردشده درست نیست یا اعتبار آن تمام شده است.',
    );
    expect(otpErrorMessage(503, 'delivery_unavailable')).toBe(
      'ارسال پیامک اکنون در دسترس نیست؛ دوباره تلاش کنید.',
    );
  });
});

describe('owner OTP test route boundary', () => {
  it('fails closed unless the exact server flag is enabled', () => {
    const source = readSource('../app/owner/otp-test/page.tsx');
    expect(source).toContain('isOwnerOtpTestEnabled(process.env)');
    expect(source).toContain('notFound()');
  });

  it('uses only the existing same-origin OTP API routes', () => {
    const source = readSource('../app/owner/otp-test/OwnerOtpTest.tsx');
    expect(source).toContain("fetch('/api/auth/otp/request'");
    expect(source).toContain("fetch('/api/auth/otp/verify'");
    expect(source).toContain('isOtpVerificationSuccess(response.status)');
    expect(source).not.toMatch(/localStorage|sessionStorage|console\./);
  });
});

function readSource(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), 'test', relativePath), 'utf8');
}
