import { describe, expect, it } from 'vitest';

import { resolveWebLearnerIdentity, type WebLearnerIdentityStore } from '../lib/web-identity';

describe('Web learner identity binding', () => {
  it('resolves the canonical user id from the verified phone identity', async () => {
    let received: Parameters<WebLearnerIdentityStore['resolveUserId']>[0] | undefined;
    const store: WebLearnerIdentityStore = {
      resolveUserId: async (input) => {
        received = input;
        return '2efaf676-84e4-45b1-8a13-50735a8df2c8';
      },
    };

    await expect(
      resolveWebLearnerIdentity(
        { phoneE164: '+989121234567', phoneHash: 'opaque-phone-hash' },
        store,
      ),
    ).resolves.toBe('2efaf676-84e4-45b1-8a13-50735a8df2c8');
    expect(received).toEqual({ phoneE164: '+989121234567', phoneHash: 'opaque-phone-hash' });
  });

  it('fails closed when the identity store cannot resolve a user', async () => {
    const store: WebLearnerIdentityStore = { resolveUserId: async () => null };

    await expect(
      resolveWebLearnerIdentity(
        { phoneE164: '+989121234567', phoneHash: 'opaque-phone-hash' },
        store,
      ),
    ).resolves.toBeNull();
  });
});
