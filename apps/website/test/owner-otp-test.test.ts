import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  isOtpVerificationSuccess,
  normalizeOtpDigits,
  otpErrorMessage,
  readChallengeResponse,
  rememberOtpChallenge,
  validateIranianMobile,
  verifyOtpChallenges,
} from '../lib/otp-client';
import { isOwnerOtpTestEnabled } from '../app/owner/otp-test/owner-otp-test';

describe('owner OTP test helpers', () => {
  it('keeps the three newest distinct challenges in memory', () => {
    const first = challenge('first-challenge-id-0001', '2026-08-08T10:05:00.000Z');
    const second = challenge('second-challenge-id-002', '2026-08-08T10:06:00.000Z');
    const third = challenge('third-challenge-id-0003', '2026-08-08T10:07:00.000Z');
    const fourth = challenge('fourth-challenge-id-004', '2026-08-08T10:08:00.000Z');

    const history = [first, second, third, fourth].reduce(rememberOtpChallenge, []);
    expect(history.map((item) => item.challengeId)).toEqual([
      fourth.challengeId,
      third.challengeId,
      second.challengeId,
    ]);
    expect(rememberOtpChallenge(history, third)).toEqual([third, fourth, second]);
  });

  it('lets the server decide expiry and accepts an older remembered challenge after a 400', async () => {
    const newest = challenge('newest-challenge-id-001', '2026-08-08T09:59:59.000Z');
    const older = challenge('older-challenge-id-0002', '2026-08-08T09:58:59.000Z');
    const calls: string[] = [];

    const result = await verifyOtpChallenges([newest, older], async (challengeId) => {
      calls.push(challengeId);
      return { status: calls.length === 1 ? 400 : 204 };
    });

    expect(calls).toEqual([newest.challengeId, older.challengeId]);
    expect(result).toEqual({ outcome: 'success' });
  });

  it('stops immediately after 204 and never checks an older challenge', async () => {
    const newest = challenge('newest-challenge-id-001', '2026-08-08T10:05:00.000Z');
    const older = challenge('older-challenge-id-0002', '2026-08-08T10:04:00.000Z');
    const calls: string[] = [];

    const result = await verifyOtpChallenges([newest, older], async (challengeId) => {
      calls.push(challengeId);
      return { status: 204 };
    });

    expect(calls).toEqual([newest.challengeId]);
    expect(result).toEqual({ outcome: 'success' });
  });

  it.each([403, 503])(
    'treats HTTP %s as terminal without checking older challenges',
    async (status) => {
      const newest = challenge('newest-challenge-id-001', '2026-08-08T10:05:00.000Z');
      const older = challenge('older-challenge-id-0002', '2026-08-08T10:04:00.000Z');
      const calls: string[] = [];
      const terminalResponse = { status };

      const result = await verifyOtpChallenges([newest, older], async (challengeId) => {
        calls.push(challengeId);
        return terminalResponse;
      });

      expect(calls).toEqual([newest.challengeId]);
      expect(result).toEqual({ outcome: 'terminal', response: terminalResponse });
    },
  );

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
        APP_ENV: 'staging',
        NODE_ENV: 'production',
      }),
    ).toBe(true);
    expect(
      isOwnerOtpTestEnabled({
        LEARNBOX_OTP_TEST_UI_ENABLED: 'true',
        APP_ENV: 'production',
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
    expect(source).toContain('verifyOtpChallenges(challenges');
    expect(source).not.toMatch(/localStorage|sessionStorage|console\./);
  });

  it('imports the client contract from lib and leaves the owner module as an environment gate', () => {
    const ownerUiSource = readSource('../app/owner/otp-test/OwnerOtpTest.tsx');
    const ownerModuleSource = readSource('../app/owner/otp-test/owner-otp-test.ts');

    expect(ownerUiSource).toContain("from '../../../lib/otp-client'");
    expect(ownerModuleSource).toContain('export function isOwnerOtpTestEnabled');
    expect(ownerModuleSource).not.toMatch(
      /ChallengeResponse|normalizeOtpDigits|validateIranianMobile|readChallengeResponse|rememberOtpChallenge|verifyOtpChallenges|otpErrorMessage/,
    );
  });
});

function readSource(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), 'test', relativePath), 'utf8');
}

function challenge(challengeId: string, expiresAt: string) {
  return {
    challengeId,
    expiresAt,
    resendAvailableAt: '2026-08-08T10:01:00.000Z',
  };
}
