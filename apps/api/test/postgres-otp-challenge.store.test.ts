import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';

import {
  createOtpChallenge,
  hashOtpCode,
  hashOtpPhone,
  type OtpChallengeRecord,
} from '../src/auth/otp-challenge.js';
import { PostgresOtpChallengeStore } from '../src/auth/postgres-otp-challenge.store.js';

const secret = 'postgres-otp-challenge-test-secret-that-is-long-enough';
const challengeId = '72c877d8-f87d-4d7d-a625-046776b57b32';
const now = new Date('2026-07-28T12:00:00Z');
const record = createOtpChallenge({
  id: challengeId,
  phoneHash: hashOtpPhone(secret, '+989121234567'),
  codeHash: hashOtpCode(secret, challengeId, '12345'),
  purpose: 'sign_in',
  now,
});

function toRow(value: OtpChallengeRecord) {
  return {
    id: value.id,
    phone_hash: value.phoneHash,
    purpose: value.purpose,
    code_hash: value.codeHash,
    expires_at: value.expiresAt,
    resend_available_at: value.resendAvailableAt,
    attempt_count: value.attemptCount,
    max_attempts: value.maxAttempts,
    consumed_at: value.consumedAt,
  };
}

describe('PostgresOtpChallengeStore', () => {
  it('persists only the opaque challenge record', async () => {
    const calls: Array<{ sql: string; params?: unknown[] }> = [];
    const pool = {
      query: async (sql: string, params?: unknown[]) => {
        calls.push({ sql, params });
        return { rows: [] };
      },
    } as unknown as Pool;

    await new PostgresOtpChallengeStore(pool).create(record);

    expect(calls[0].sql).toContain('INSERT INTO otp_challenges');
    expect(JSON.stringify(calls[0].params)).not.toContain('12345');
    expect(calls[0].params?.[1]).toBe(record.phoneHash);
  });

  it('locks a challenge row before consuming a verified code', async () => {
    const calls: string[] = [];
    const client = {
      query: async (sql: string) => {
        calls.push(sql);
        if (sql.includes('FOR UPDATE')) return { rows: [toRow(record)] };
        return { rows: [] };
      },
      release: () => undefined,
    };
    const pool = {
      connect: async () => client,
    } as unknown as Pool;

    const result = await new PostgresOtpChallengeStore(pool).verify(
      challengeId,
      'sign_in',
      hashOtpCode(secret, challengeId, '12345'),
      now,
    );

    expect(result?.status).toBe('verified');
    expect(calls).toContain('BEGIN');
    expect(calls.some((sql) => sql.includes('FOR UPDATE'))).toBe(true);
    expect(calls.some((sql) => sql.startsWith('UPDATE otp_challenges SET consumed_at'))).toBe(true);
    expect(calls).toContain('COMMIT');
  });

  it('records an incorrect attempt before returning a generic failure state', async () => {
    const calls: Array<{ sql: string; params?: unknown[] }> = [];
    const client = {
      query: async (sql: string, params?: unknown[]) => {
        calls.push({ sql, params });
        if (sql.includes('FOR UPDATE')) return { rows: [toRow(record)] };
        return { rows: [] };
      },
      release: () => undefined,
    };
    const pool = {
      connect: async () => client,
    } as unknown as Pool;

    const result = await new PostgresOtpChallengeStore(pool).verify(
      challengeId,
      'sign_in',
      hashOtpCode(secret, challengeId, '54321'),
      now,
    );

    expect(result?.status).toBe('invalid');
    expect(
      calls.find(({ sql }) => sql.startsWith('UPDATE otp_challenges SET attempt_count'))?.params,
    ).toEqual([challengeId, 1]);
  });
});
