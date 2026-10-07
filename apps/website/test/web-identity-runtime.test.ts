import { describe, expect, it } from 'vitest';

import { hashOtpPhone } from '../../api/dist/auth/otp-challenge.js';
import { PostgresWebLearnerIdentityStore } from '../lib/web-identity-runtime';

describe('PostgresWebLearnerIdentityStore', () => {
  it('upserts by normalized phone and returns only the canonical user id', async () => {
    const calls: Array<{ text: string; values?: unknown[] }> = [];
    const pool = {
      query: async (text: string, values?: unknown[]) => {
        calls.push({ text, values });
        return { rows: [{ id: '2efaf676-84e4-45b1-8a13-50735a8df2c8', status: 'active' }] };
      },
    } as never;
    const secret = 'otp-secret-that-is-at-least-thirty-two-bytes';
    const phoneE164 = '+989121234567';
    const store = new PostgresWebLearnerIdentityStore(pool, secret);

    await expect(
      store.resolveUserId({ phoneE164, phoneHash: hashOtpPhone(secret, phoneE164) }),
    ).resolves.toEqual({ status: 'ok', userId: '2efaf676-84e4-45b1-8a13-50735a8df2c8' });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.text).toContain('ON CONFLICT (phone_e164)');
    // The account status is read by the same statement: the sign-in door cannot forget to check it.
    expect(calls[0]?.text).toContain('RETURNING id, status');
    expect(calls[0]?.values).toEqual([phoneE164]);
  });

  it('refuses to sign in a suspended account and issues no subject for it', async () => {
    const pool = {
      query: async () => ({
        rows: [{ id: '2efaf676-84e4-45b1-8a13-50735a8df2c8', status: 'disabled' }],
      }),
    } as never;
    const secret = 'otp-secret-that-is-at-least-thirty-two-bytes';
    const phoneE164 = '+989121234567';
    const store = new PostgresWebLearnerIdentityStore(pool, secret);

    const outcome = await store.resolveUserId({
      phoneE164,
      phoneHash: hashOtpPhone(secret, phoneE164),
    });
    expect(outcome).toEqual({ status: 'suspended' });
    // No user id leaks out of a refused sign-in.
    expect(JSON.stringify(outcome)).not.toContain('2efaf676');
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
    ).resolves.toEqual({ status: 'rejected' });
    expect(called).toBe(false);
  });
});
