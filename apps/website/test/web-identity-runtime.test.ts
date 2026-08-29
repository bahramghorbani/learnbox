import { describe, expect, it } from 'vitest';

import { hashOtpPhone } from '../../api/dist/auth/otp-challenge.js';
import { PostgresWebLearnerIdentityStore } from '../lib/web-identity-runtime';

describe('PostgresWebLearnerIdentityStore', () => {
  it('upserts by normalized phone and returns only the canonical user id', async () => {
    const calls: Array<{ text: string; values?: unknown[] }> = [];
    const pool = {
      query: async (text: string, values?: unknown[]) => {
        calls.push({ text, values });
        return { rows: [{ id: '2efaf676-84e4-45b1-8a13-50735a8df2c8' }] };
      },
    } as never;
    const secret = 'otp-secret-that-is-at-least-thirty-two-bytes';
    const phoneE164 = '+989121234567';
    const store = new PostgresWebLearnerIdentityStore(pool, secret);

    await expect(
      store.resolveUserId({ phoneE164, phoneHash: hashOtpPhone(secret, phoneE164) }),
    ).resolves.toBe('2efaf676-84e4-45b1-8a13-50735a8df2c8');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.text).toContain('ON CONFLICT (phone_e164)');
    expect(calls[0]?.values).toEqual([phoneE164]);
  });

  it('fails closed without touching the database for a mismatched verified hash', async () => {
    let called = false;
    const pool = {
      query: async () => {
        called = true;
        return { rows: [] };
      },
    } as never;
    const store = new PostgresWebLearnerIdentityStore(
      pool,
      'otp-secret-that-is-at-least-thirty-two-bytes',
    );

    await expect(
      store.resolveUserId({ phoneE164: '+989121234567', phoneHash: 'wrong-hash' }),
    ).resolves.toBeNull();
    expect(called).toBe(false);
  });
});
