import { timingSafeEqual } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';

import type { MobileIdentityStore, MobileIdentityStoreResult } from './mobile-identity.service.js';
import {
  evaluateOtpVerification,
  hashOtpCode,
  hashOtpPhone,
  type OtpChallengeRecord,
  type OtpPurpose,
} from './otp-challenge.js';

const refreshIdleMs = 7 * 24 * 60 * 60 * 1000;
const refreshAbsoluteMs = 30 * 24 * 60 * 60 * 1000;
const selectChallenge = `SELECT id, phone_hash, purpose, code_hash, expires_at, resend_available_at,
                                  attempt_count, max_attempts, consumed_at
                             FROM otp_challenges
                            WHERE id = $1 AND purpose = $2
                            FOR UPDATE`;
const selectSession = `SELECT id, user_id, refresh_token_hash, family_generation, absolute_expires_at,
                              idle_expires_at, revoked_at
                         FROM mobile_learner_sessions
                        WHERE id = $1
                        FOR UPDATE`;

type OtpChallengeRow = {
  id: string;
  phone_hash: string;
  purpose: OtpPurpose;
  code_hash: string;
  expires_at: Date;
  resend_available_at: Date;
  attempt_count: number;
  max_attempts: number;
  consumed_at: Date | null;
};
type SessionRow = {
  id: string;
  user_id: string;
  refresh_token_hash: string;
  family_generation: number;
  absolute_expires_at: Date;
  idle_expires_at: Date;
  revoked_at: Date | null;
};

/** PostgreSQL NI-002 seam. Pure layer owns tokens and generic public failures. */
export class PostgresMobileIdentityStore implements MobileIdentityStore {
  constructor(
    private readonly pool: Pool,
    private readonly otpSecret: string,
  ) {}

  async verifyAndCreate(input: Parameters<MobileIdentityStore['verifyAndCreate']>[0]) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const challenge = await client.query<OtpChallengeRow>(selectChallenge, [
        input.challengeId,
        'sign_in',
      ]);
      const row = challenge.rows[0];
      if (
        !row ||
        !sameHash(hashOtpPhone(this.otpSecret, input.phoneE164), input.phoneHash) ||
        !sameHash(row.phone_hash, input.phoneHash)
      )
        return rollback(client, { status: 'rejected' });
      const outcome = evaluateOtpVerification(
        toChallenge(row),
        hashOtpCode(this.otpSecret, input.challengeId, input.code),
        input.now,
      );
      if (outcome.status !== 'verified') {
        if (outcome.status === 'invalid' || outcome.status === 'locked') {
          await client.query('UPDATE otp_challenges SET attempt_count = $2 WHERE id = $1', [
            input.challengeId,
            outcome.record.attemptCount,
          ]);
          await client.query('COMMIT');
        } else await client.query('ROLLBACK');
        return { status: 'rejected' } as const;
      }
      await client.query(
        'UPDATE otp_challenges SET consumed_at = $2 WHERE id = $1 AND consumed_at IS NULL',
        [input.challengeId, outcome.record.consumedAt],
      );
      const learner = await client.query<{ id: string }>(
        `INSERT INTO users (id, phone_e164)
         VALUES (gen_random_uuid(), $1)
         ON CONFLICT (phone_e164) DO UPDATE SET phone_e164 = EXCLUDED.phone_e164
         RETURNING id`,
        [input.phoneE164],
      );
      const session = await client.query<{ id: string }>(
        `INSERT INTO mobile_learner_sessions
           (user_id, installation_id, refresh_token_hash, absolute_expires_at, idle_expires_at)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [
          learner.rows[0].id,
          input.installationId,
          input.refreshTokenHash,
          new Date(input.now.getTime() + refreshAbsoluteMs),
          new Date(input.now.getTime() + refreshIdleMs),
        ],
      );
      await client.query('COMMIT');
      return {
        status: 'verified' as const,
        learnerId: learner.rows[0].id,
        sessionId: session.rows[0].id,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async rotateRefresh(
    input: Parameters<MobileIdentityStore['rotateRefresh']>[0],
  ): Promise<MobileIdentityStoreResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<SessionRow>(selectSession, [input.sessionId]);
      const session = result.rows[0];
      if (
        !session ||
        session.revoked_at ||
        input.now >= session.absolute_expires_at ||
        input.now >= session.idle_expires_at ||
        !sameHash(session.refresh_token_hash, input.refreshTokenHash)
      ) {
        if (session && !session.revoked_at)
          await client.query(
            `UPDATE mobile_learner_sessions SET revoked_at = $2, revoked_reason = 'refresh_reuse' WHERE id = $1`,
            [session.id, input.now],
          );
        await client.query('COMMIT');
        return { status: 'reused' };
      }
      await client.query(
        `UPDATE mobile_learner_sessions
            SET refresh_token_hash = $2, family_generation = family_generation + 1,
                last_used_at = $3, idle_expires_at = $4
          WHERE id = $1`,
        [
          session.id,
          input.nextRefreshTokenHash,
          input.now,
          new Date(input.now.getTime() + refreshIdleMs),
        ],
      );
      await client.query('COMMIT');
      return { status: 'rotated', learnerId: session.user_id, sessionId: session.id };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

async function rollback(
  client: PoolClient,
  result: MobileIdentityStoreResult,
): Promise<MobileIdentityStoreResult> {
  await client.query('ROLLBACK');
  return result;
}
function toChallenge(row: OtpChallengeRow): OtpChallengeRecord {
  return {
    id: row.id,
    phoneHash: row.phone_hash,
    purpose: row.purpose,
    codeHash: row.code_hash,
    expiresAt: row.expires_at,
    resendAvailableAt: row.resend_available_at,
    attemptCount: row.attempt_count,
    maxAttempts: row.max_attempts,
    consumedAt: row.consumed_at,
  };
}
function sameHash(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
