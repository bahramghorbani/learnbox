import type { Pool } from 'pg';

import {
  evaluateOtpRequestRateLimit,
  evaluateOtpVerification,
  type OtpChallengeRecord,
  type OtpRequestRateLimitOutcome,
  type OtpVerificationOutcome,
} from './admin-otp-challenge';

type OtpChallengeRow = {
  id: string;
  phone_hash: string;
  code_hash: string;
  expires_at: Date;
  resend_available_at: Date;
  attempt_count: number;
  max_attempts: number;
  consumed_at: Date | null;
};

// Adapted from apps/api/src/auth/postgres-otp-challenge.store.ts; no `purpose` column.
const selectChallenge = `SELECT id, phone_hash, code_hash, expires_at, resend_available_at,
                                  attempt_count, max_attempts, consumed_at
                             FROM admin_otp_challenges
                            WHERE id = $1
                            FOR UPDATE`;

const selectPhoneRequestTimes = `SELECT requested_at
                                   FROM admin_otp_request_events
                                  WHERE phone_hash = $1 AND requested_at > $2
                                  ORDER BY requested_at ASC`;

const selectIpRequestTimes = `SELECT requested_at
                                FROM admin_otp_request_events
                               WHERE ip_hash = $1 AND requested_at > $2
                               ORDER BY requested_at ASC`;

const insertChallenge = `INSERT INTO admin_otp_challenges
  (id, phone_hash, code_hash, expires_at, resend_available_at, attempt_count, max_attempts, consumed_at)
 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`;

function toRecord(row: OtpChallengeRow): OtpChallengeRecord {
  return {
    id: row.id,
    phoneHash: row.phone_hash,
    codeHash: row.code_hash,
    expiresAt: row.expires_at,
    resendAvailableAt: row.resend_available_at,
    attemptCount: row.attempt_count,
    maxAttempts: row.max_attempts,
    consumedAt: row.consumed_at,
  };
}

/**
 * Postgres persistence for admin OTP challenges. No `purpose` column; admin login is the only use.
 * Verification locks one row before evaluating the transition so a challenge cannot be consumed
 * or have its attempt counter updated twice.
 */
export class PostgresAdminOtpStore {
  constructor(private readonly pool: Pool) {}

  /**
   * Atomically checks opaque phone/IP windows and records a challenge only when both are allowed.
   * Advisory transaction locks also protect the empty-window case from parallel requests.
   */
  async createIfRequestAllowed(
    record: OtpChallengeRecord,
    clientIpHash: string,
    now = new Date(),
  ): Promise<OtpRequestRateLimitOutcome> {
    if (!isHash(clientIpHash)) throw new Error('OTP client IP hash is invalid.');

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `SELECT pg_advisory_xact_lock(hashtextextended($1, 0)),
                pg_advisory_xact_lock(hashtextextended($2, 0))`,
        [`phone:${record.phoneHash}`, `ip:${clientIpHash}`],
      );
      const windowStart = new Date(now.getTime() - 15 * 60 * 1000);
      const phoneRequests = await client.query<{ requested_at: Date }>(selectPhoneRequestTimes, [
        record.phoneHash,
        windowStart,
      ]);
      const ipRequests = await client.query<{ requested_at: Date }>(selectIpRequestTimes, [
        clientIpHash,
        windowStart,
      ]);
      const outcome = evaluateOtpRequestRateLimit({
        phoneRequestTimes: phoneRequests.rows.map((row) => row.requested_at),
        ipRequestTimes: ipRequests.rows.map((row) => row.requested_at),
        now,
      });
      if (outcome.status === 'rate_limited') {
        await client.query('ROLLBACK');
        return outcome;
      }

      await client.query(insertChallenge, challengeParameters(record));
      await client.query(
        `INSERT INTO admin_otp_request_events (challenge_id, phone_hash, ip_hash, requested_at)
         VALUES ($1, $2, $3, $4)`,
        [record.id, record.phoneHash, clientIpHash, now],
      );
      await client.query('COMMIT');
      return outcome;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async verify(
    challengeId: string,
    suppliedCodeHash: string,
    now = new Date(),
  ): Promise<OtpVerificationOutcome | null> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const challenge = await client.query<OtpChallengeRow>(selectChallenge, [challengeId]);
      const row = challenge.rows[0];
      if (!row) {
        await client.query('ROLLBACK');
        return null;
      }

      const outcome = evaluateOtpVerification(toRecord(row), suppliedCodeHash, now);
      if (outcome.status === 'verified') {
        await client.query(
          'UPDATE admin_otp_challenges SET consumed_at = $2 WHERE id = $1 AND consumed_at IS NULL',
          [challengeId, outcome.record.consumedAt],
        );
      }
      if (outcome.status === 'invalid' || outcome.status === 'locked') {
        await client.query('UPDATE admin_otp_challenges SET attempt_count = $2 WHERE id = $1', [
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

function challengeParameters(record: OtpChallengeRecord): unknown[] {
  return [
    record.id,
    record.phoneHash,
    record.codeHash,
    record.expiresAt,
    record.resendAvailableAt,
    record.attemptCount,
    record.maxAttempts,
    record.consumedAt,
  ];
}

function isHash(value: string): boolean {
  return /^[a-zA-Z0-9_-]{32,128}$/.test(value);
}
