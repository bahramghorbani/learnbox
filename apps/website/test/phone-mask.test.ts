import { describe, expect, it } from 'vitest';

import { toPersianDigits } from '../app/persian-digits';
import { maskIranianPhone } from '../lib/phone-mask';

/**
 * Regression cover for LB-B03.
 *
 * Production returned `۰۹38****4003` from /api/learner/profile/stats: a Persian prefix welded onto
 * Latin digits, with four stars, while /api/learner/profile returned `0938***4003` with three. Two
 * endpoints describing one field disagreed on both script and shape, and the mixed-script value
 * renders as visibly broken text in a right-to-left interface.
 */

describe('maskIranianPhone', () => {
  it('masks the middle digits and keeps a single consistent shape', () => {
    expect(maskIranianPhone('+989381234003')).toBe('0938***4003');
  });

  it('never mixes Persian and Latin digits in the stored value', () => {
    const masked = maskIranianPhone('+989381234003') ?? '';
    expect(masked).not.toMatch(/[۰-۹]/);
    expect(masked).toMatch(/^09\d{2}\*{3}\d{4}$/);
  });

  it('hides the subscriber digits it is supposed to hide', () => {
    const masked = maskIranianPhone('+989381234003') ?? '';
    // The three masked digits (123) must not survive anywhere in the output.
    expect(masked).not.toContain('123');
  });

  it('agrees with the shape /api/learner/profile validates before returning a profile', () => {
    // learner-profile-web-http rejects anything failing this exact pattern.
    expect(maskIranianPhone('+989381234003')).toMatch(/^09\d{2}\*{3}\d{4}$/);
  });

  it('returns null rather than a partially masked string for non-Iranian input', () => {
    expect(maskIranianPhone('+14155550123')).toBeNull();
    expect(maskIranianPhone('09381234003')).toBeNull();
    expect(maskIranianPhone('')).toBeNull();
    expect(maskIranianPhone('+98938123400')).toBeNull();
  });
});

describe('toPersianDigits', () => {
  it('converts every Latin digit', () => {
    expect(toPersianDigits('0123456789')).toBe('۰۱۲۳۴۵۶۷۸۹');
  });

  it('leaves the mask stars intact', () => {
    expect(toPersianDigits('0938***4003')).toBe('۰۹۳۸***۴۰۰۳');
  });

  it('accepts numbers, as the OTP wait message passes', () => {
    expect(toPersianDigits(45)).toBe('۴۵');
  });
});
