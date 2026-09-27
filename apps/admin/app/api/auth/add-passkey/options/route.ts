import { Pool } from 'pg';
import { readAdminDatabaseConfig } from '../../../../../lib/server/admin-database';
import { getSharedAdminDatabasePool } from '../../../../../lib/server/admin-database-pool';
import { loadAdminSession } from '../../../../../lib/server/admin-route-security';
import { PostgresOwnerAuthStore } from '../../../../../lib/server/postgres-owner-auth-store';
import { readAdminAuthConfig } from '../../../../../lib/server/admin-auth-policy';
import { hashAdminSecret } from '../../../../../lib/server/admin-session';
import { generateRegistrationOptions } from '@simplewebauthn/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getPool() {
  const dbConfig = readAdminDatabaseConfig(process.env);
  return getSharedAdminDatabasePool(dbConfig, (c: Record<string, unknown>) => new Pool(c));
}

export async function GET(request: Request) {
  const config = readAdminAuthConfig(process.env);
  if (!config.enabled) return new Response('Not found', { status: 404 });

  const pool = getPool();
  const store = new PostgresOwnerAuthStore(pool);
  const session = await loadAdminSession(request, config, store);
  if (!session) return new Response('Unauthorized', { status: 401 });

  try {
    // Get existing owner's userHandle
    const ownerRow = await pool.query(
      'SELECT webauthn_user_handle FROM admin_owner WHERE singleton_id = 1',
    );
    if (ownerRow.rows.length === 0) return new Response('No owner', { status: 404 });
    const userHandle = new Uint8Array(ownerRow.rows[0].webauthn_user_handle as Buffer);

    // Get existing credentials to exclude
    const existingCreds = await pool.query(
      'SELECT credential_id FROM admin_passkey_credentials WHERE owner_singleton_id = 1',
    );
    const excludeCredentials = existingCreds.rows.map((r) => ({
      id: Buffer.from(r.credential_id as Buffer).toString('base64url'),
      type: 'public-key' as const,
    }));

    const options = await generateRegistrationOptions({
      rpID: config.rpId,
      rpName: 'LearnBox',
      userName: 'learnbox-owner',
      userID: userHandle,
      attestationType: 'none',
      excludeCredentials,
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
    });

    // Store challenge
    const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
    await store.issueChallenge({
      challengeHash: hashAdminSecret(options.challenge, config.tokenHashKey),
      browserNonceHash: hashAdminSecret(nonce, config.tokenHashKey),
      ceremony: 'add_credential',
      expiresAt: new Date(Date.now() + 5 * 60_000),
      ownerSingletonId: 1,
    });

    const response = Response.json(options, {
      headers: { 'Cache-Control': 'no-store' },
    });
    response.headers.append(
      'Set-Cookie',
      `__Host-learnbox_admin_addkey=${nonce}; Max-Age=300; Path=/; HttpOnly; Secure; SameSite=Strict`,
    );
    return response;
  } catch (err) {
    console.error('Add passkey options error:', err);
    return new Response('Internal error', { status: 500 });
  }
}
