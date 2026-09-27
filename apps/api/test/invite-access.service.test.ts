import { describe, expect, it, vi } from 'vitest';

import {
  InviteAccessService,
  type InviteAccessConsumeOutcome,
  type InviteAccessStore,
} from '../src/alpha/invite-access.service.js';
import { hashInviteCode } from '../src/alpha/invite-policy.js';

const secret = 'invite-access-service-test-secret-that-is-long-enough';
const code = 'ALPHA-2026';
const consentVersion = 'v1';
const ipHash = 'ip-hash-value-that-is-long-enough-1234567890';

function recordingStore(outcome: InviteAccessConsumeOutcome) {
  const calls: Array<{
    codeHash: string;
    consentVersion: string;
    ipHash: string;
  }> = [];
  const store: InviteAccessStore = {
    consumeForCode: vi.fn(async (input) => {
      calls.push(input);
      return outcome;
    }),
  };
  return { store, calls };
}

describe('InviteAccessService', () => {
  it('hashes a valid code and forwards the store outcome', async () => {
    const { store, calls } = recordingStore({
      status: 'consumed',
      alreadyConsented: false,
    });
    const service = new InviteAccessService({ store, secret });

    await expect(
      service.check({ code, consentVersion, ipHash, now: new Date('2026-08-09T12:00:00Z') }),
    ).resolves.toEqual({ status: 'accepted', alreadyConsented: false });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.codeHash).toBe(hashInviteCode(secret, code));
    expect(calls[0]?.consentVersion).toBe(consentVersion);
    expect(calls[0]?.ipHash).toBe(ipHash);
  });

  it('rejects invalid and empty codes before the store is consulted', async () => {
    const { store, calls } = recordingStore({ status: 'consumed', alreadyConsented: false });
    const service = new InviteAccessService({ store, secret });

    await expect(service.check({ code: 'کد', consentVersion, ipHash })).resolves.toEqual({
      status: 'invalid',
    });
    await expect(service.check({ code: '', consentVersion, ipHash })).resolves.toEqual({
      status: 'invalid',
    });
    expect(calls).toHaveLength(0);
  });

  it('rejects an empty consent version', async () => {
    const { store, calls } = recordingStore({ status: 'consumed', alreadyConsented: false });
    const service = new InviteAccessService({ store, secret });

    await expect(service.check({ code, consentVersion: '  ', ipHash })).resolves.toEqual({
      status: 'invalid',
    });
    expect(calls).toHaveLength(0);
  });

  it('forwards store rejection outcomes unchanged', async () => {
    const limitedStore = recordingStore({ status: 'limited' });
    await expect(
      new InviteAccessService({ store: limitedStore.store, secret }).check({
        code,
        consentVersion,
        ipHash,
      }),
    ).resolves.toEqual({ status: 'limited' });

    const invalidStore = recordingStore({ status: 'invalid' });
    await expect(
      new InviteAccessService({ store: invalidStore.store, secret }).check({
        code,
        consentVersion,
        ipHash,
      }),
    ).resolves.toEqual({ status: 'invalid' });

    const limitedRate = recordingStore({ status: 'rate_limited', retryAfterMs: 42_000 });
    await expect(
      new InviteAccessService({ store: limitedRate.store, secret }).check({
        code,
        consentVersion,
        ipHash,
      }),
    ).resolves.toEqual({ status: 'rate_limited', retryAfterMs: 42_000 });
  });
});
