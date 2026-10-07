import { describe, expect, it } from 'vitest';

import { resolveWebLearnerIdentity, type WebLearnerIdentityStore } from '../lib/web-identity';

describe('Web learner identity binding', () => {
  it('resolves the canonical user id from the verified phone identity', async () => {
    let received: Parameters<WebLearnerIdentityStore['resolveUserId']>[0] | undefined;
    const store: WebLearnerIdentityStore = {
      resolveUserId: async (input) => {
        received = input;
        return { status: 'ok', userId: '2efaf676-84e4-45b1-8a13-50735a8df2c8' };
      },
    };

    await expect(
      resolveWebLearnerIdentity(
        { phoneE164: '+989121234567', phoneHash: 'opaque-phone-hash' },
        store,
      ),
    ).resolves.toEqual({ status: 'ok', userId: '2efaf676-84e4-45b1-8a13-50735a8df2c8' });
    expect(received).toEqual({ phoneE164: '+989121234567', phoneHash: 'opaque-phone-hash' });
  });

  it('fails closed when the identity store cannot resolve a user', async () => {
    const store: WebLearnerIdentityStore = { resolveUserId: async () => ({ status: 'rejected' }) };

    await expect(
      resolveWebLearnerIdentity(
        { phoneE164: '+989121234567', phoneHash: 'opaque-phone-hash' },
        store,
      ),
    ).resolves.toEqual({ status: 'rejected' });
  });

  it('passes a suspended account through as suspended, never as a resolved learner', async () => {
    const store: WebLearnerIdentityStore = { resolveUserId: async () => ({ status: 'suspended' }) };

    await expect(
      resolveWebLearnerIdentity(
        { phoneE164: '+989121234567', phoneHash: 'opaque-phone-hash' },
        store,
      ),
    ).resolves.toEqual({ status: 'suspended' });
  });

  it('rejects a malformed phone or hash without consulting the store', async () => {
    let called = false;
    const store: WebLearnerIdentityStore = {
      resolveUserId: async () => {
        called = true;
        return { status: 'ok', userId: '2efaf676-84e4-45b1-8a13-50735a8df2c8' };
      },
    };
    await expect(
      resolveWebLearnerIdentity({ phoneE164: '+1555000000', phoneHash: 'short' }, store),
    ).resolves.toEqual({ status: 'rejected' });
    expect(called).toBe(false);
  });
});
