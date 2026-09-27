import type { Pool } from 'pg';

import {
  evaluateOtpRequestRateLimit,
  evaluateOtpVerification,
  type OtpChallengeRecord,
  type OtpPurpose,
  type OtpRequestRateLimitOutcome,
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

const selectPhoneRequestTimes = `SELECT requested_at
                                   FROM otp_request_events
                                  WHERE phone_hash = $1 AND purpose = $2 AND requested_at > $3
                                  ORDER BY requested_at ASC`;

const selectIpRequestTimes = `SELECT requested_at
                                FROM otp_request_events
                               WHERE ip_hash = $1 AND purpose = $2 AND requested_at > $3
                               ORDER BY requested_at ASC`;

const insertChallenge = `INSERT INTO otp_challenges
  (id, phone_hash, purpose, code_hash, expires_at, resend_available_at,
   attempt_count, max_attempts, consumed_at)
 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`;

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
    await this.pool.query(insertChallenge, challengeParameters(record));
  }

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
        [`phone:${record.phoneHash}:${record.purpose}`, `ip:${clientIpHash}:${record.purpose}`],
      );
      const windowStart = new Date(now.getTime() - 15 * 60 * 1000);
      const phoneRequests = await client.query<{ requested_at: Date }>(selectPhoneRequestTimes, [
        record.phoneHash,
        record.purpose,
        windowStart,
      ]);
      const ipRequests = await client.query<{ requested_at: Date }>(selectIpRequestTimes, [
        clientIpHash,
        record.purpose,
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
        `INSERT INTO otp_request_events (challenge_id, phone_hash, ip_hash, purpose, requested_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [record.id, record.phoneHash, clientIpHash, record.purpose, now],
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

function challengeParameters(record: OtpChallengeRecord): unknown[] {
  return [
    record.id,
    record.phoneHash,
    record.purpose,
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
