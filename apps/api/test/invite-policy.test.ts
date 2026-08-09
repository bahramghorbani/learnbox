import { describe, expect, it } from 'vitest';

import {
  constantTimeEqual,
  evaluateInviteRequestRateLimit,
  hashInviteCode,
  invitePolicy,
  normalizeInviteCode,
} from '../src/alpha/invite-policy.js';

const secret = 'invite-policy-test-secret-that-is-long-enough';

describe('invite code normalization', () => {
  it('accepts only strict ASCII allowlist codes of bounded length', () => {
    expect(normalizeInviteCode('ALPHA-2026')).toBe('ALPHA-2026');
    expect(normalizeInviteCode('abcd')).toBe('abcd');
    expect(normalizeInviteCode('a'.repeat(64))).toBe('a'.repeat(64));
    expect(normalizeInviteCode('a'.repeat(65))).toBeNull();
    expect(normalizeInviteCode('')).toBeNull();
    expect(normalizeInviteCode(undefined)).toBeNull();
    expect(normalizeInviteCode(null)).toBeNull();
  });

  it('rejects Persian digits, non-ASCII and whitespace rather than normalizing them', () => {
    expect(normalizeInviteCode('کد۱۲۳۴')).toBeNull();
    expect(normalizeInviteCode('1234۵')).toBeNull();
    expect(normalizeInviteCode('ab cd')).toBeNull();
    expect(normalizeInviteCode('ab_cd')).toBeNull();
  });
});

describe('invite code hashing', () => {
  it('derives a deterministic keyed hash from which the code cannot be recovered', () => {
    const first = hashInviteCode(secret, 'ALPHA-2026');
    const second = hashInviteCode(secret, 'ALPHA-2026');

    expect(first).toBe(second);
    expect(first).toMatch(/^[a-zA-Z0-9_-]{43}$/);
    expect(first).not.toContain('ALPHA-2026');
  });

  it('throws when the secret is too short or the code format is invalid', () => {
    expect(() => hashInviteCode('too-short', 'ALPHA-2026')).toThrow(
      'Invite code secret must be at least 32 characters.',
    );
    expect(() => hashInviteCode(secret, 'کد')).toThrow('Invite code format is invalid.');
  });
});

describe('invite request rate limiting', () => {
  const now = new Date('2026-08-09T12:00:00Z');

  it('allows requests within the per-IP window', () => {
    const recent = Array.from({ length: 4 }, (_, index) => new Date(now.getTime() - index * 60_000));
    expect(evaluateInviteRequestRateLimit(recent, now)).toEqual({ status: 'allowed' });
  });

  it('rejects when the per-IP window is saturated and reports the retry delay', () => {
    const saturated = Array.from({ length: 5 }, (_, index) =>
      new Date(now.getTime() - (index + 1) * 60_000),
    );
    const outcome = evaluateInviteRequestRateLimit(saturated, now);

    expect(outcome).toMatchObject({ status: 'rate_limited' });
    expect(outcome.status === 'rate_limited' ? outcome.retryAfterMs : 0).toBeGreaterThan(0);
  });

  it('ignores requests outside the window and rejects invalid timestamps', () => {
    const stale = [new Date(now.getTime() - 16 * 60 * 1000)];
    expect(evaluateInviteRequestRateLimit(stale, now)).toEqual({ status: 'allowed' });
    expect(() => evaluateInviteRequestRateLimit([new Date(Number.NaN)], now)).toThrow(
      'Invite request timestamp is invalid.',
    );
  });

  it('exposes the bounded policy constants', () => {
    expect(invitePolicy.codeFormat).toEqual(/^[a-zA-Z0-9-]{4,64}$/);
    expect(invitePolicy.maxRequestsPerIp).toBe(5);
  });
});

describe('constant-time comparison', () => {
  it('matches only identical values and rejects length mismatches', () => {
    expect(constantTimeEqual('abc', 'abc')).toBe(true);
    expect(constantTimeEqual('abc', 'abd')).toBe(false);
    expect(constantTimeEqual('abc', 'abcd')).toBe(false);
  });
});
