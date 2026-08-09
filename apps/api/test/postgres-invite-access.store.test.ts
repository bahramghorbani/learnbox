import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';

import { hashInviteCode } from '../src/alpha/invite-policy.js';
import { PostgresInviteAccessStore } from '../src/alpha/postgres-invite-access.store.js';

const secret = 'postgres-invite-access-test-secret-that-is-long-enough';
const code = 'ALPHA-2026';
const codeHash = hashInviteCode(secret, code);
const consentVersion = 'v1';
const ipHash = 'ip-hash-value-that-is-long-enough-1234567890';
const now = new Date('2026-08-09T12:00:00Z');

type Call = { sql: string; params?: unknown[] };

function clientFor(overrides: {
  codeRows?: Array<{ max_uses: number; used_count: number; expires_at: Date | null }>;
  ipRows?: Array<{ requested_at: Date }>;
}) {
  const calls: Call[] = [];
  const client = {
    query: async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params });
      if (sql.includes('FROM invite_codes')) {
        return { rows: overrides.codeRows ?? [], rowCount: overrides.codeRows?.length ?? 0 };
      }
      if (sql.includes('FROM invite_request_events')) {
        return { rows: overrides.ipRows ?? [], rowCount: overrides.ipRows?.length ?? 0 };
      }
      if (sql.includes('INSERT INTO invite_consents')) return { rows: [], rowCount: 1 };
      if (sql.includes('UPDATE invite_codes')) return { rows: [], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    },
    release: () => undefined,
  };
  return { client, calls };
}

function poolFor(client: ReturnType<typeof clientFor>['client']) {
  return { connect: async () => client } as unknown as Pool;
}

describe('PostgresInviteAccessStore', () => {
  it('consumes a valid code, records consent and the request event in one transaction', async () => {
    const { client, calls } = clientFor({
      codeRows: [{ max_uses: 5, used_count: 0, expires_at: null }],
    });

    const outcome = await new PostgresInviteAccessStore(poolFor(client)).consumeForCode({
      codeHash,
      consentVersion,
      ipHash,
      now,
    });

    expect(outcome).toEqual({ status: 'consumed', alreadyConsented: false });
    const ordered = calls.map(({ sql }) => sql);
    expect(ordered.indexOf('BEGIN')).toBeLessThan(ordered.indexOf('COMMIT'));
    expect(calls.some(({ sql }) => sql.includes('pg_advisory_xact_lock'))).toBe(true);
    expect(calls.some(({ sql }) => sql.includes('INSERT INTO invite_consents'))).toBe(true);
    expect(
      calls.some(({ sql }) => sql.includes('ON CONFLICT (code_hash, consent_version) DO NOTHING')),
    ).toBe(true);
    expect(calls.some(({ sql }) => sql.includes('UPDATE invite_codes'))).toBe(true);
    expect(calls.some(({ sql }) => sql.includes('INSERT INTO invite_request_events'))).toBe(true);
    expect(JSON.stringify(calls)).not.toContain(code);
  });

  it('reports an already-recorded consent without duplicating the acknowledgement', async () => {
    const { client } = clientFor({
      codeRows: [{ max_uses: 5, used_count: 0, expires_at: null }],
    });
    const { client: existingClient, calls } = clientFor({
      codeRows: [{ max_uses: 5, used_count: 0, expires_at: null }],
    });
    existingClient.query = async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params });
      if (sql.includes('FROM invite_codes')) {
        return { rows: [{ max_uses: 5, used_count: 0, expires_at: null }], rowCount: 1 };
      }
      if (sql.includes('INSERT INTO invite_consents')) return { rows: [], rowCount: 0 };
      if (sql.includes('UPDATE invite_codes')) return { rows: [], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    };

    const outcome = await new PostgresInviteAccessStore(poolFor(existingClient)).consumeForCode({
      codeHash,
      consentVersion,
      ipHash,
      now,
    });

    expect(outcome).toEqual({ status: 'consumed', alreadyConsented: true });
    void client;
  });

  it('rolls back an unknown code to a generic invalid outcome', async () => {
    const { client, calls } = clientFor({ codeRows: [] });

    const outcome = await new PostgresInviteAccessStore(poolFor(client)).consumeForCode({
      codeHash,
      consentVersion,
      ipHash,
      now,
    });

    expect(outcome).toEqual({ status: 'invalid' });
    expect(calls.some(({ sql }) => sql === 'ROLLBACK')).toBe(true);
    expect(calls.some(({ sql }) => sql === 'COMMIT')).toBe(false);
  });

  it('rolls back an exhausted code without recording consent or events', async () => {
    const { client, calls } = clientFor({
      codeRows: [{ max_uses: 5, used_count: 5, expires_at: null }],
    });

    const outcome = await new PostgresInviteAccessStore(poolFor(client)).consumeForCode({
      codeHash,
      consentVersion,
      ipHash,
      now,
    });

    expect(outcome).toEqual({ status: 'limited' });
    expect(calls.some(({ sql }) => sql === 'ROLLBACK')).toBe(true);
    expect(calls.some(({ sql }) => sql.includes('INSERT INTO invite_consents'))).toBe(false);
    expect(calls.some(({ sql }) => sql.includes('INSERT INTO invite_request_events'))).toBe(false);
  });

  it('rolls back an expired code', async () => {
    const { client } = clientFor({
      codeRows: [{ max_uses: 5, used_count: 0, expires_at: new Date(now.getTime() - 1_000) }],
    });

    const outcome = await new PostgresInviteAccessStore(poolFor(client)).consumeForCode({
      codeHash,
      consentVersion,
      ipHash,
      now,
    });

    expect(outcome).toEqual({ status: 'limited' });
  });

  it('rolls back a request that exceeds the per-IP window', async () => {
    const saturated = Array.from({ length: 5 }, (_, index) => ({
      requested_at: new Date(now.getTime() - (index + 1) * 60_000),
    }));
    const { client, calls } = clientFor({
      codeRows: [{ max_uses: 5, used_count: 0, expires_at: null }],
      ipRows: saturated,
    });

    const outcome = await new PostgresInviteAccessStore(poolFor(client)).consumeForCode({
      codeHash,
      consentVersion,
      ipHash,
      now,
    });

    expect(outcome).toMatchObject({ status: 'rate_limited' });
    expect(calls.some(({ sql }) => sql === 'ROLLBACK')).toBe(true);
    expect(calls.some(({ sql }) => sql.includes('INSERT INTO invite_consents'))).toBe(false);
  });

  it('validates hashes and the consent version before opening a transaction', async () => {
    const { client, calls } = clientFor({ codeRows: [] });

    await expect(
      new PostgresInviteAccessStore(poolFor(client)).consumeForCode({
        codeHash: 'bad',
        consentVersion,
        ipHash,
      }),
    ).rejects.toThrow('Invite access hash is invalid.');
    await expect(
      new PostgresInviteAccessStore(poolFor(client)).consumeForCode({
        codeHash,
        consentVersion: '',
        ipHash,
      }),
    ).rejects.toThrow('Invite consent version is invalid.');
    expect(calls.some(({ sql }) => sql === 'BEGIN')).toBe(false);
  });
});
