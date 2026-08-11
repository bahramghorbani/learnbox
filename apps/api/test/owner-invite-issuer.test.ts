import { describe, expect, test } from 'vitest';

import {
  createOwnerInviteCode,
  issueOwnerInviteCode,
  isOwnerInviteIssuerEnabled,
} from '../src/alpha/owner-invite-issuer.js';

describe('owner invite issuer', () => {
  test('creates a valid opaque invite code from supplied random bytes', () => {
    const code = createOwnerInviteCode(Buffer.alloc(18, 7));

    expect(code).toMatch(/^ALPHA-[a-zA-Z0-9-]{24}$/);
    expect(code).not.toContain('=');
  });

  test('allows the issuer only for an explicitly enabled Preview deployment', () => {
    expect(
      isOwnerInviteIssuerEnabled({
        LEARNBOX_OWNER_ALPHA_INVITE_ISSUER_ENABLED: 'true',
        VERCEL_ENV: 'preview',
      }),
    ).toBe(true);
  });

  test('rejects production and disabled deployments', () => {
    expect(
      isOwnerInviteIssuerEnabled({
        LEARNBOX_OWNER_ALPHA_INVITE_ISSUER_ENABLED: 'true',
        VERCEL_ENV: 'production',
      }),
    ).toBe(false);
    expect(isOwnerInviteIssuerEnabled({ VERCEL_ENV: 'preview' })).toBe(false);
  });

  test('persists only a keyed hash for a one-use, time-bounded owner test code', async () => {
    const calls: Array<{ sql: string; values: unknown[] }> = [];
    const now = new Date('2026-08-11T12:00:00.000Z');
    const pool = {
      query: async (sql: string, values: unknown[]) => {
        calls.push({ sql, values });
        return { rowCount: 1 };
      },
    };

    const issued = await issueOwnerInviteCode({
      pool,
      secret: 'owner-invite-issuer-test-secret-that-is-long-enough',
      now,
      random: Buffer.alloc(18, 9),
    });

    expect(issued.code).toMatch(/^ALPHA-/);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.sql).toContain('INSERT INTO invite_codes');
    expect(calls[0]?.values).toEqual([
      expect.stringMatching(/^[a-zA-Z0-9_-]{32,128}$/),
      'owner-controlled-test',
      1,
      new Date('2026-08-11T12:30:00.000Z'),
    ]);
    expect(JSON.stringify(calls)).not.toContain(issued.code);
  });
});
