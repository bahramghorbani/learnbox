import type { Pool } from 'pg';

import { evaluateInviteRequestRateLimit } from './invite-policy.js';
import type { InviteAccessConsumeOutcome, InviteAccessStore } from './invite-access.service.js';

type InviteCodeRow = {
  max_uses: number;
  used_count: number;
  expires_at: Date | null;
};

const selectCode = `SELECT max_uses, used_count, expires_at
                      FROM invite_codes
                     WHERE code_hash = $1
                     FOR UPDATE`;

const selectIpRequestTimes = `SELECT requested_at
                                FROM invite_request_events
                               WHERE ip_hash = $1 AND requested_at > $2
                               ORDER BY requested_at ASC`;

const insertRequestEvent = `INSERT INTO invite_request_events (ip_hash, code_hash, requested_at)
                            VALUES ($1, $2, $3)`;

const insertConsent = `INSERT INTO invite_consents (code_hash, consent_version, accepted_at)
                       VALUES ($1, $2, $3)
                       ON CONFLICT (code_hash, consent_version) DO NOTHING`;

const consumeCodeUse = `UPDATE invite_codes
                          SET used_count = used_count + 1
                        WHERE code_hash = $1 AND used_count < max_uses`;

function isHash(value: string): boolean {
  return /^[a-zA-Z0-9_-]{32,128}$/.test(value);
}

/**
 * Postgres persistence for the closed-alpha invitation boundary. One advisory-locked transaction
 * applies the per-IP request window, records the consent acknowledgement for the current consent
 * version and consumes a single use of the allowlist code; invalid, expired or exhausted codes
 * roll back and collapse to one generic outcome.
 */
export class PostgresInviteAccessStore implements InviteAccessStore {
  constructor(private readonly pool: Pool) {}

  async consumeForCode(input: {
    codeHash: string;
    consentVersion: string;
    ipHash: string;
    now?: Date;
  }): Promise<InviteAccessConsumeOutcome> {
    const { codeHash, consentVersion, ipHash, now = new Date() } = input;
    if (!isHash(codeHash) || !isHash(ipHash)) throw new Error('Invite access hash is invalid.');
    if (!consentVersion.trim()) throw new Error('Invite consent version is invalid.');

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        `invite:${codeHash}`,
      ]);

      const code = await client.query<InviteCodeRow>(selectCode, [codeHash]);
      const row = code.rows[0];
      if (!row) {
        await client.query('ROLLBACK');
        return { status: 'invalid' };
      }
      if (row.used_count >= row.max_uses) {
        await client.query('ROLLBACK');
        return { status: 'limited' };
      }
      if (row.expires_at && row.expires_at.getTime() <= now.getTime()) {
        await client.query('ROLLBACK');
        return { status: 'limited' };
      }

      const windowStart = new Date(now.getTime() - 15 * 60 * 1000);
      const ipRequests = await client.query<{ requested_at: Date }>(selectIpRequestTimes, [
        ipHash,
        windowStart,
      ]);
      const limit = evaluateInviteRequestRateLimit(
        ipRequests.rows.map((item) => item.requested_at),
        now,
      );
      if (limit.status === 'rate_limited') {
        await client.query('ROLLBACK');
        return { status: 'rate_limited', retryAfterMs: limit.retryAfterMs };
      }

      const consent = await client.query(insertConsent, [codeHash, consentVersion, now]);
      const consumed = await client.query(consumeCodeUse, [codeHash]);
      if (consumed.rowCount !== 1) {
        await client.query('ROLLBACK');
        return { status: 'limited' };
      }

      await client.query(insertRequestEvent, [ipHash, codeHash, now]);
      await client.query('COMMIT');
      return { status: 'consumed', alreadyConsented: consent.rowCount === 0 };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

export type { InviteAccessConsumeOutcome };
