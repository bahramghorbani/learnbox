export type AdminCeremony =
  'bootstrap_registration' | 'add_credential' | 'authentication' | 'reauthentication';

export type PasskeyCredentialRecord = {
  credentialId: Uint8Array;
  publicKey: Uint8Array;
  counter: number;
  transports: readonly string[];
  deviceType: 'singleDevice' | 'multiDevice';
  backedUp: boolean;
};

type QueryResult = { rows: Record<string, unknown>[] };

type Queryable = {
  query(sql: string, parameters?: readonly unknown[]): Promise<QueryResult>;
};

type TransactionClient = Queryable & { release(): void };

type DatabasePool = Queryable & { connect(): Promise<TransactionClient> };

type ChallengeInput = {
  challengeHash: string;
  browserNonceHash: string;
  ceremony: AdminCeremony;
  expiresAt: Date;
  ownerSingletonId: 1 | null;
};

type AuthenticationCompletion = {
  challengeHash: string;
  browserNonceHash: string;
  ceremony: 'authentication' | 'reauthentication';
  credentialId: Uint8Array;
  expectedCounter: number;
  newCounter: number;
  now: Date;
};

type PendingChallengeLookup = {
  browserNonceHash: string;
  ceremony: AdminCeremony;
  now: Date;
};

const bootstrapLockId = 1_913_268_079;

function credentialParameters(credential: PasskeyCredentialRecord, now: Date) {
  return [
    Buffer.from(credential.credentialId),
    1,
    Buffer.from(credential.publicKey),
    credential.counter,
    [...credential.transports],
    credential.deviceType,
    credential.backedUp,
    now,
  ] as const;
}

export class PostgresOwnerAuthStore {
  constructor(private readonly pool: DatabasePool) {}

  async issueChallenge(input: ChallengeInput) {
    const result = await this.pool.query(
      `INSERT INTO admin_webauthn_challenges
        (owner_singleton_id, challenge_hash, browser_nonce_hash, ceremony, expires_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [
        input.ownerSingletonId,
        input.challengeHash,
        input.browserNonceHash,
        input.ceremony,
        input.expiresAt,
      ],
    );
    return String(result.rows[0]?.id);
  }

  async findActiveCredential(credentialId: Uint8Array): Promise<
    | {
        credentialId: Uint8Array;
        publicKey: Uint8Array;
        counter: number;
        transports: string[];
      }
    | undefined
  > {
    const result = await this.pool.query(
      `SELECT credential_id, public_key, sign_count, transports
         FROM admin_passkey_credentials
        WHERE credential_id = $1 AND active
        LIMIT 1`,
      [Buffer.from(credentialId)],
    );
    const row = result.rows[0];
    if (!row) return undefined;
    return {
      credentialId: new Uint8Array(row.credential_id as Uint8Array),
      publicKey: new Uint8Array(row.public_key as Uint8Array),
      counter: Number(row.sign_count),
      transports: Array.isArray(row.transports) ? row.transports.map(String) : [],
    };
  }

  async findPendingChallenge(
    input: PendingChallengeLookup,
  ): Promise<{ id: string; challengeHash: string } | undefined> {
    const result = await this.pool.query(
      `SELECT id, challenge_hash
         FROM admin_webauthn_challenges
        WHERE browser_nonce_hash = $1
          AND ceremony = $2
          AND consumed_at IS NULL
          AND expires_at > $3
        LIMIT 1`,
      [input.browserNonceHash, input.ceremony, input.now],
    );
    const row = result.rows[0];
    return row ? { id: String(row.id), challengeHash: String(row.challenge_hash) } : undefined;
  }

  async bootstrapFirstCredential(
    ownerHandle: Uint8Array,
    credential: PasskeyCredentialRecord,
    now: Date,
  ): Promise<{ status: 'bootstrapped' | 'closed' }> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock($1)', [bootstrapLockId]);
      const existing = await client.query(
        `SELECT credential_id
           FROM admin_passkey_credentials
          WHERE active
          LIMIT 1`,
      );
      if (existing.rows.length > 0) {
        await client.query('COMMIT');
        return { status: 'closed' };
      }

      await client.query(
        `INSERT INTO admin_owner (singleton_id, webauthn_user_handle, created_at, updated_at)
         VALUES (1, $1, $2, $2)
         ON CONFLICT (singleton_id) DO NOTHING`,
        [Buffer.from(ownerHandle), now],
      );
      await this.insertCredential(client, credential, now);
      await client.query('COMMIT');
      return { status: 'bootstrapped' };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async addCredentialToOwner(
    credential: PasskeyCredentialRecord,
    now: Date,
  ): Promise<{ status: 'added' | 'missing_owner' }> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const owner = await client.query(
        'SELECT singleton_id FROM admin_owner WHERE singleton_id = 1 FOR UPDATE',
      );
      if (owner.rows.length === 0) {
        await client.query('COMMIT');
        return { status: 'missing_owner' };
      }
      await this.insertCredential(client, credential, now);
      await client.query('COMMIT');
      return { status: 'added' };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async completeAuthentication(
    input: AuthenticationCompletion,
  ): Promise<{ status: 'authenticated' | 'invalid' }> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const challenge = await client.query(
        `SELECT id, expires_at
           FROM admin_webauthn_challenges
          WHERE challenge_hash = $1
            AND browser_nonce_hash = $2
            AND ceremony = $3
            AND consumed_at IS NULL
          FOR UPDATE`,
        [input.challengeHash, input.browserNonceHash, input.ceremony],
      );
      const challengeRow = challenge.rows[0];
      if (
        !challengeRow ||
        new Date(String(challengeRow.expires_at)).getTime() <= input.now.getTime()
      ) {
        await client.query('COMMIT');
        return { status: 'invalid' };
      }

      const credential = await client.query(
        `UPDATE admin_passkey_credentials
            SET sign_count = $3, last_used_at = $4
          WHERE credential_id = $1
            AND sign_count = $2
            AND active
          RETURNING credential_id`,
        [Buffer.from(input.credentialId), input.expectedCounter, input.newCounter, input.now],
      );
      if (credential.rows.length === 0) {
        await client.query('ROLLBACK');
        return { status: 'invalid' };
      }
      await client.query(
        `UPDATE admin_webauthn_challenges
            SET consumed_at = $2
          WHERE id = $1 AND consumed_at IS NULL`,
        [challengeRow.id, input.now],
      );
      await client.query('COMMIT');
      return { status: 'authenticated' };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async touchSession(tokenHash: string, now: Date) {
    const result = await this.pool.query(
      `UPDATE admin_sessions
          SET last_seen_at = $2
        WHERE token_hash = $1
          AND revoked_at IS NULL
          AND absolute_expires_at > $2
          AND last_seen_at >= $2 - INTERVAL '15 minutes'
        RETURNING token_hash`,
      [tokenHash, now],
    );
    return result.rows.length === 1;
  }

  async touchRecentAuthentication(tokenHash: string, now: Date) {
    const result = await this.pool.query(
      `UPDATE admin_sessions
          SET recent_authenticated_at = $2, last_seen_at = $2
        WHERE token_hash = $1
          AND revoked_at IS NULL
          AND absolute_expires_at > $2
        RETURNING token_hash`,
      [tokenHash, now],
    );
    return result.rows.length === 1;
  }

  async findActiveSession(
    tokenHash: string,
    now: Date,
  ): Promise<
    | {
        csrfHash: string;
        lastSeenAt: Date;
        absoluteExpiresAt: Date;
        revokedAt: Date | null;
        recentAuthenticatedAt: Date;
      }
    | undefined
  > {
    const result = await this.pool.query(
      `SELECT csrf_hash, last_seen_at, absolute_expires_at, revoked_at, recent_authenticated_at
         FROM admin_sessions
        WHERE token_hash = $1
          AND revoked_at IS NULL
          AND absolute_expires_at > $2
          AND last_seen_at >= $2 - INTERVAL '15 minutes'
        LIMIT 1`,
      [tokenHash, now],
    );
    const row = result.rows[0];
    if (!row) return undefined;
    return {
      csrfHash: String(row.csrf_hash),
      lastSeenAt: new Date(row.last_seen_at as string | Date),
      absoluteExpiresAt: new Date(row.absolute_expires_at as string | Date),
      revokedAt: row.revoked_at ? new Date(row.revoked_at as string | Date) : null,
      recentAuthenticatedAt: new Date(row.recent_authenticated_at as string | Date),
    };
  }

  async createSession(input: {
    tokenHash: string;
    csrfHash: string;
    now: Date;
    absoluteExpiresAt: Date;
  }) {
    await this.pool.query(
      `INSERT INTO admin_sessions
        (token_hash, owner_singleton_id, csrf_hash, created_at, last_seen_at,
         absolute_expires_at, recent_authenticated_at)
       VALUES ($1, 1, $2, $3, $3, $4, $3)`,
      [input.tokenHash, input.csrfHash, input.now, input.absoluteExpiresAt],
    );
  }

  async revokeSession(tokenHash: string, now: Date) {
    const result = await this.pool.query(
      `UPDATE admin_sessions
          SET revoked_at = $2
        WHERE token_hash = $1 AND revoked_at IS NULL
        RETURNING token_hash`,
      [tokenHash, now],
    );
    return result.rows.length === 1;
  }

  async revokeAllSessions(now: Date) {
    await this.pool.query(
      `UPDATE admin_sessions
          SET revoked_at = $1
        WHERE owner_singleton_id = 1 AND revoked_at IS NULL`,
      [now],
    );
  }

  private insertCredential(client: Queryable, credential: PasskeyCredentialRecord, now: Date) {
    return client.query(
      `INSERT INTO admin_passkey_credentials
        (credential_id, owner_singleton_id, public_key, sign_count, transports, device_type,
         backed_up, active, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, $8)`,
      credentialParameters(credential, now),
    );
  }
}
