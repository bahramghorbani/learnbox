import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';

import { hashOtpCode, hashOtpPhone } from '../src/auth/otp-challenge.js';
import { PostgresMobileIdentityStore } from '../src/auth/postgres-mobile-identity.store.js';

const secret = 'postgres-mobile-identity-test-secret-long-enough';
const now = new Date('2026-08-23T12:00:00Z');
const challengeId = '72c877d8-f87d-4d7d-a625-046776b57b32';
const phone = '+989123456789';
const phoneHash = hashOtpPhone(secret, phone);
const codeHash = hashOtpCode(secret, challengeId, '12345');
const refreshTokenHash = 'a'.repeat(43);

function poolFor(calls: Array<{ sql: string; params?: unknown[] }>) {
  const client = {
    query: async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params });
      if (sql.includes('FROM otp_challenges')) {
        return {
          rows: [
            {
              id: challengeId,
              phone_hash: phoneHash,
              purpose: 'sign_in',
              code_hash: codeHash,
              expires_at: new Date('2026-08-23T12:05:00Z'),
              resend_available_at: now,
              attempt_count: 0,
              max_attempts: 5,
              consumed_at: null,
            },
          ],
        };
      }
      if (sql.includes('INSERT INTO users')) return { rows: [{ id: 'learner-server' }] };
      if (sql.includes('INSERT INTO mobile_learner_sessions'))
        return { rows: [{ id: 'session-server' }] };
      return { rows: [] };
    },
    release: () => undefined,
  };
  return { connect: async () => client } as unknown as Pool;
}

describe('PostgresMobileIdentityStore', () => {
  it('locks, phone-binds, consumes, upserts and creates a hash-only session in one transaction', async () => {
    const calls: Array<{ sql: string; params?: unknown[] }> = [];
    const store = new PostgresMobileIdentityStore(poolFor(calls), secret);

    await expect(
      store.verifyAndCreate({
        challengeId,
        code: '12345',
        installationId: 'install-12345678',
        phoneE164: phone,
        phoneHash,
        now,
        refreshTokenHash,
      }),
    ).resolves.toEqual({
      status: 'verified',
      learnerId: 'learner-server',
      sessionId: 'session-server',
    });

    expect(calls.map((call) => call.sql)).toEqual(
      expect.arrayContaining([
        'BEGIN',
        expect.stringContaining('FOR UPDATE'),
        expect.stringContaining('UPDATE otp_challenges SET consumed_at'),
        expect.stringContaining('INSERT INTO users'),
        expect.stringContaining('INSERT INTO mobile_learner_sessions'),
        'COMMIT',
      ]),
    );
    expect(calls.find((call) => call.sql.includes('FROM otp_challenges'))?.params).toEqual([
      challengeId,
      'sign_in',
    ]);
    expect(calls.find((call) => call.sql.includes('FROM otp_challenges'))?.params).not.toContain(
      phone,
    );
    expect(calls.find((call) => call.sql.includes('FROM otp_challenges'))?.params).not.toContain(
      '12345',
    );
    expect(
      calls.find((call) => call.sql.includes('INSERT INTO mobile_learner_sessions'))?.params,
    ).not.toContain(refreshTokenHash.replace(/./g, 'refresh-token'));
  });

  it('revokes the family and returns generic reuse when presented hash is old or invalid', async () => {
    const calls: Array<{ sql: string; params?: unknown[] }> = [];
    const pool = {
      connect: async () => ({
        query: async (sql: string, params?: unknown[]) => {
          calls.push({ sql, params });
          if (sql.includes('FROM mobile_learner_sessions')) {
            return {
              rows: [
                {
                  id: 'session-server',
                  user_id: 'learner-server',
                  refresh_token_hash: 'b'.repeat(43),
                  family_generation: 2,
                  absolute_expires_at: new Date('2026-09-22T12:00:00Z'),
                  idle_expires_at: new Date('2026-08-30T12:00:00Z'),
                  revoked_at: null,
                },
              ],
            };
          }
          return { rows: [] };
        },
        release: () => undefined,
      }),
    } as unknown as Pool;

    await expect(
      new PostgresMobileIdentityStore(pool).rotateRefresh({
        sessionId: 'session-server',
        refreshTokenHash,
        nextRefreshTokenHash: 'c'.repeat(43),
        now,
      }),
    ).resolves.toEqual({ status: 'reused' });

    expect(calls.some((call) => call.sql.includes('SET revoked_at = $2'))).toBe(true);
    expect(calls).toEqual(expect.arrayContaining([{ sql: 'COMMIT' }]));
  });
});
