import { describe, expect, it } from 'vitest';

import { PostgresOwnerAuthStore } from '../lib/server/postgres-owner-auth-store';

const now = new Date('2026-08-08T12:00:00.000Z');
const credential = {
  credentialId: Buffer.from('credential-id'),
  publicKey: Buffer.from('public-key'),
  counter: 0,
  transports: ['internal'],
  deviceType: 'multiDevice' as const,
  backedUp: true,
};

type QueryCall = { sql: string; parameters?: readonly unknown[] };

function recordingPool(rowsForSql: (sql: string) => Record<string, unknown>[] = () => []) {
  const calls: QueryCall[] = [];
  let released = false;
  const client = {
    async query(sql: string, parameters?: readonly unknown[]) {
      calls.push({ sql, parameters });
      return { rows: rowsForSql(sql) };
    },
    release() {
      released = true;
    },
  };
  return {
    calls,
    get released() {
      return released;
    },
    pool: {
      connect: async () => client,
      query: client.query.bind(client),
    },
  };
}

describe('PostgresOwnerAuthStore', () => {
  it('persists only challenge and browser-nonce hashes', async () => {
    const database = recordingPool((sql) =>
      sql.includes('RETURNING id') ? [{ id: 'challenge-id' }] : [],
    );
    const store = new PostgresOwnerAuthStore(database.pool);

    await expect(
      store.issueChallenge({
        challengeHash: 'challenge-hash',
        browserNonceHash: 'nonce-hash',
        ceremony: 'authentication',
        expiresAt: new Date(now.getTime() + 300_000),
        ownerSingletonId: 1,
      }),
    ).resolves.toBe('challenge-id');

    const insert = database.calls.find(({ sql }) => sql.includes('admin_webauthn_challenges'));
    expect(insert?.parameters).toContain('challenge-hash');
    expect(insert?.parameters).toContain('nonce-hash');
    expect(JSON.stringify(insert)).not.toContain('raw-challenge');
  });

  it('serializes bootstrap and closes permanently when a credential exists', async () => {
    const database = recordingPool((sql) =>
      sql.includes('SELECT credential_id') ? [{ credential_id: Buffer.from('existing') }] : [],
    );
    const store = new PostgresOwnerAuthStore(database.pool);

    await expect(
      store.bootstrapFirstCredential(Buffer.from('owner-handle'), credential, now),
    ).resolves.toEqual({ status: 'closed' });

    expect(database.calls.map(({ sql }) => sql)).toContain('BEGIN');
    expect(database.calls.some(({ sql }) => sql.includes('pg_advisory_xact_lock'))).toBe(true);
    expect(database.calls.some(({ sql }) => sql.includes('INSERT INTO admin_owner'))).toBe(false);
    expect(database.calls.map(({ sql }) => sql)).toContain('COMMIT');
    expect(database.released).toBe(true);
  });

  it('adds another credential to the existing singleton owner', async () => {
    const database = recordingPool((sql) =>
      sql.includes('FROM admin_owner') ? [{ singleton_id: 1 }] : [],
    );
    const store = new PostgresOwnerAuthStore(database.pool);

    await expect(store.addCredentialToOwner(credential, now)).resolves.toEqual({
      status: 'added',
    });

    const insert = database.calls.find(({ sql }) => sql.includes('INSERT INTO admin_passkey'));
    expect(insert?.parameters?.[1]).toBe(1);
    expect(database.calls.some(({ sql }) => sql.includes('INSERT INTO admin_owner'))).toBe(false);
  });

  it('updates the credential counter and consumes the challenge in one transaction', async () => {
    const database = recordingPool((sql) => {
      if (sql.includes('FROM admin_webauthn_challenges')) {
        return [{ id: 'challenge-id', expires_at: new Date(now.getTime() + 1_000) }];
      }
      if (sql.includes('UPDATE admin_passkey_credentials'))
        return [{ credential_id: Buffer.from('credential-id') }];
      return [];
    });
    const store = new PostgresOwnerAuthStore(database.pool);

    await expect(
      store.completeAuthentication({
        challengeHash: 'challenge-hash',
        browserNonceHash: 'nonce-hash',
        ceremony: 'authentication',
        credentialId: credential.credentialId,
        expectedCounter: 0,
        newCounter: 1,
        now,
      }),
    ).resolves.toEqual({ status: 'authenticated' });

    const sql = database.calls.map((call) => call.sql);
    expect(sql).toContain('BEGIN');
    expect(sql.some((statement) => statement.includes('FOR UPDATE'))).toBe(true);
    expect(sql.some((statement) => statement.includes('SET sign_count'))).toBe(true);
    expect(sql.some((statement) => statement.includes('SET consumed_at'))).toBe(true);
    expect(sql).toContain('COMMIT');
  });

  it('touches an active session without extending its absolute expiry', async () => {
    const database = recordingPool((sql) =>
      sql.includes('UPDATE admin_sessions') ? [{ token_hash: 'token-hash' }] : [],
    );
    const store = new PostgresOwnerAuthStore(database.pool);

    await expect(store.touchSession('token-hash', now)).resolves.toBe(true);

    const update = database.calls.find(({ sql }) => sql.includes('UPDATE admin_sessions'));
    expect(update?.sql).toContain('last_seen_at = $2');
    expect(update?.sql).toContain('absolute_expires_at > $2');
    expect(update?.sql).not.toContain('SET absolute_expires_at');
  });

  it('refreshes recent authentication only for an active, non-idle session', async () => {
    const database = recordingPool((sql) =>
      sql.includes('UPDATE admin_sessions') ? [{ token_hash: 'token-hash' }] : [],
    );
    const store = new PostgresOwnerAuthStore(database.pool);

    await expect(store.touchRecentAuthentication('token-hash', now)).resolves.toBe(true);

    const update = database.calls.find(({ sql }) => sql.includes('UPDATE admin_sessions'));
    expect(update?.sql).toContain('recent_authenticated_at = $2');
    expect(update?.sql).toContain('absolute_expires_at > $2');
    expect(update?.sql).toContain("last_seen_at >= $2 - INTERVAL '15 minutes'");
    expect(update?.sql).not.toContain('SET absolute_expires_at');
  });

  it('creates and revokes sessions by opaque hashes', async () => {
    const database = recordingPool((sql) =>
      sql.includes('RETURNING token_hash') ? [{ token_hash: 'token-hash' }] : [],
    );
    const store = new PostgresOwnerAuthStore(database.pool);
    const absoluteExpiresAt = new Date(now.getTime() + 8 * 60 * 60_000);

    await store.createSession({
      tokenHash: 'token-hash',
      csrfHash: 'csrf-hash',
      now,
      absoluteExpiresAt,
    });
    await expect(store.revokeSession('token-hash', now)).resolves.toBe(true);
    await store.revokeAllSessions(now);

    expect(database.calls.some(({ sql }) => sql.includes('INSERT INTO admin_sessions'))).toBe(true);
    expect(database.calls.filter(({ sql }) => sql.includes('SET revoked_at'))).toHaveLength(2);
    expect(JSON.stringify(database.calls)).not.toContain('raw-session-token');
  });

  it('reads only a usable credential and a still-pending nonce-bound challenge', async () => {
    const database = recordingPool((sql) => {
      if (sql.includes('FROM admin_passkey_credentials')) {
        return [
          {
            credential_id: credential.credentialId,
            public_key: credential.publicKey,
            sign_count: 7,
            transports: ['internal'],
          },
        ];
      }
      if (sql.includes('FROM admin_webauthn_challenges')) {
        return [{ id: 'challenge-id', challenge_hash: 'challenge-hash' }];
      }
      return [];
    });
    const store = new PostgresOwnerAuthStore(database.pool);

    await expect(store.findActiveCredential(credential.credentialId)).resolves.toMatchObject({
      counter: 7,
      transports: ['internal'],
    });
    await expect(
      store.findPendingChallenge({
        browserNonceHash: 'nonce-hash',
        ceremony: 'authentication',
        now,
      }),
    ).resolves.toEqual({ id: 'challenge-id', challengeHash: 'challenge-hash' });

    expect(
      database.calls.some(({ sql }) => sql.includes('active') && sql.includes('credential_id')),
    ).toBe(true);
    expect(
      database.calls.some(
        ({ sql }) =>
          sql.includes('consumed_at IS NULL') &&
          sql.includes('expires_at >') &&
          sql.includes('browser_nonce_hash'),
      ),
    ).toBe(true);
  });

  it('reads only active sessions and leaves the token hash out of returned state', async () => {
    const database = recordingPool((sql) =>
      sql.includes('FROM admin_sessions')
        ? [
            {
              csrf_hash: 'csrf-hash',
              last_seen_at: now,
              absolute_expires_at: new Date(now.getTime() + 1_000),
              revoked_at: null,
              recent_authenticated_at: now,
            },
          ]
        : [],
    );
    const store = new PostgresOwnerAuthStore(database.pool);

    await expect(store.findActiveSession('token-hash', now)).resolves.toEqual({
      csrfHash: 'csrf-hash',
      lastSeenAt: now,
      absoluteExpiresAt: new Date(now.getTime() + 1_000),
      revokedAt: null,
      recentAuthenticatedAt: now,
    });

    const select = database.calls.find(({ sql }) => sql.includes('FROM admin_sessions'));
    expect(select?.sql).toContain('revoked_at IS NULL');
    expect(select?.sql).toContain('absolute_expires_at > $2');
    expect(select?.sql).toContain("last_seen_at >= $2 - INTERVAL '15 minutes'");
  });
});
