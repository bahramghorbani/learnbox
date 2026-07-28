import type { Pool } from 'pg';

import {
  evaluateOtpVerification,
  type OtpChallengeRecord,
  type OtpPurpose,
  type OtpVerificationOutcome,
} from './otp-challenge.js';

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

const selectChallenge = `SELECT id, phone_hash, purpose, code_hash, expires_at, resend_available_at,
                                  attempt_count, max_attempts, consumed_at
                             FROM otp_challenges
                            WHERE id = $1 AND purpose = $2
                            FOR UPDATE`;

function toRecord(row: OtpChallengeRow): OtpChallengeRecord {
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

/**
 * Postgres persistence for opaque OTP challenges. Verification locks one row before evaluating the
 * transition so a challenge cannot be consumed or have its attempt counter updated twice.
 */
export class PostgresOtpChallengeStore {
  constructor(private readonly pool: Pool) {}

  async create(record: OtpChallengeRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO otp_challenges
          (id, phone_hash, purpose, code_hash, expires_at, resend_available_at,
           attempt_count, max_attempts, consumed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        record.id,
        record.phoneHash,
        record.purpose,
        record.codeHash,
        record.expiresAt,
        record.resendAvailableAt,
        record.attemptCount,
        record.maxAttempts,
        record.consumedAt,
      ],
    );
  }

  async verify(
    challengeId: string,
    purpose: OtpPurpose,
    suppliedCodeHash: string,
    now = new Date(),
  ): Promise<OtpVerificationOutcome | null> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const challenge = await client.query<OtpChallengeRow>(selectChallenge, [
        challengeId,
        purpose,
      ]);
      const row = challenge.rows[0];
      if (!row) {
        await client.query('ROLLBACK');
        return null;
      }

      const outcome = evaluateOtpVerification(toRecord(row), suppliedCodeHash, now);
      if (outcome.status === 'verified') {
        await client.query(
          'UPDATE otp_challenges SET consumed_at = $2 WHERE id = $1 AND consumed_at IS NULL',
          [challengeId, outcome.record.consumedAt],
        );
      }
      if (outcome.status === 'invalid' || outcome.status === 'locked') {
        await client.query('UPDATE otp_challenges SET attempt_count = $2 WHERE id = $1', [
          challengeId,
          outcome.record.attemptCount,
        ]);
      }

      await client.query('COMMIT');
      return outcome;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
