import { describe, expect, it } from 'vitest';

import { otpErrorMessage, readRetryAfterSeconds } from '../lib/otp-client';
import {
  MONITORING_TELEGRAM_USERNAME,
  SUPPORT_TELEGRAM_USERNAME,
} from '../lib/telegram-destinations';
import {
  isSafeSupportLink,
  supportLabelFor,
  supportLinkFor,
  supportTelegramUrl,
} from '../lib/support-contact';

describe('support contact surface (LB-B04)', () => {
  it('points at the learner support bot, never the monitoring bot', () => {
    for (const surface of ['login', 'profile', 'privacy'] as const) {
      const link = supportLinkFor(surface);
      expect(link).toContain(SUPPORT_TELEGRAM_USERNAME);
      expect(link).not.toContain(MONITORING_TELEGRAM_USERNAME);
    }
  });

  it('uses an https telegram deep link', () => {
    expect(supportTelegramUrl()).toBe(`https://t.me/${SUPPORT_TELEGRAM_USERNAME}`);
  });

  it('carries no personal data in the prefilled message', () => {
    const link = supportLinkFor('login');
    expect(isSafeSupportLink(link)).toBe(true);
    expect(decodeURIComponent(link)).not.toMatch(/\d{4,}/);
  });

  it('rejects a link that smuggles digits such as a phone or code', () => {
    expect(isSafeSupportLink(`https://t.me/${SUPPORT_TELEGRAM_USERNAME}?text=09123456789`)).toBe(
      false,
    );
  });

  it('rejects a link to any other destination', () => {
    expect(isSafeSupportLink('https://t.me/someone-else')).toBe(false);
    expect(isSafeSupportLink(`https://t.me/${MONITORING_TELEGRAM_USERNAME}`)).toBe(false);
  });

  it('offers Persian labels on every surface', () => {
    for (const surface of ['login', 'profile', 'privacy'] as const) {
      expect(supportLabelFor(surface)).toMatch(/[\u0600-\u06FF]/);
    }
  });
});

describe('OTP retry-after messaging (LB-B08)', () => {
  const rateLimited = (seconds?: string) =>
    new Response(null, { status: 429, headers: seconds ? { 'retry-after': seconds } : {} });

  it('reads the retry-after header in seconds', () => {
    expect(readRetryAfterSeconds(rateLimited('45'))).toBe(45);
  });

  it('returns undefined when the header is absent or malformed', () => {
    expect(readRetryAfterSeconds(rateLimited())).toBeUndefined();
    expect(readRetryAfterSeconds(rateLimited('soon'))).toBeUndefined();
  });

  it('survives a response object that has no headers at all', () => {
    // Regression guard: a throwing header read previously swallowed the real OTP error message.
    const headerless = { status: 503, json: async () => null } as Response;
    expect(() => readRetryAfterSeconds(headerless)).not.toThrow();
    expect(readRetryAfterSeconds(headerless)).toBeUndefined();
  });

  it('tells the learner the exact wait in seconds, in Persian digits', () => {
    const message = otpErrorMessage(429, 'request_limited', 45);
    expect(message).toContain('۴۵');
    expect(message).toContain('ثانیه');
  });

  it('switches to minutes for longer waits', () => {
    const message = otpErrorMessage(429, 'request_limited', 120);
    expect(message).toContain('دقیقه');
    expect(message).toContain('۲');
  });

  it('falls back to a generic wait message when the server gives no hint', () => {
    const message = otpErrorMessage(429, 'request_limited');
    expect(message).toContain('کمی صبر');
  });

  it('never claims a zero-second wait', () => {
    expect(otpErrorMessage(429, 'request_limited', 0)).toContain('۱');
  });

  it('keeps every other OTP message unchanged', () => {
    expect(otpErrorMessage(400, 'verification_failed')).toContain('کد واردشده درست نیست');
    expect(otpErrorMessage(503, 'delivery_unavailable')).toContain('ارسال پیامک');
    expect(otpErrorMessage(400, 'request_invalid')).toContain('شمارهٔ موبایل');
  });
});
