import { Pool } from 'pg';
import { readAdminDatabaseConfig } from '../../../../../lib/server/admin-database';
import { getSharedAdminDatabasePool } from '../../../../../lib/server/admin-database-pool';
import { loadAdminSession } from '../../../../../lib/server/admin-route-security';
import { PostgresOwnerAuthStore } from '../../../../../lib/server/postgres-owner-auth-store';
import { readAdminAuthConfig } from '../../../../../lib/server/admin-auth-policy';
import { hashAdminSecret } from '../../../../../lib/server/admin-session';
import { verifyRegistrationResponse } from '@simplewebauthn/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getPool() {
  const dbConfig = readAdminDatabaseConfig(process.env);
  return getSharedAdminDatabasePool(dbConfig, (c: Record<string, unknown>) => new Pool(c));
}

function readCookie(request: Request, name: string) {
  return request.headers
    .get('cookie')
    ?.split(';')
    .map((c) => c.trim().split('='))
    .find((c) => c[0] === name)?.[1];
}

export async function POST(request: Request) {
  const config = readAdminAuthConfig(process.env);
  if (!config.enabled) return new Response('Not found', { status: 404 });

  const pool = getPool();
  const store = new PostgresOwnerAuthStore(pool);
  const session = await loadAdminSession(request, config, store);
  if (!session) return new Response('Unauthorized', { status: 401 });

  const nonce = readCookie(request, '__Host-learnbox_admin_addkey');
  if (!nonce) return new Response('Missing ceremony', { status: 400 });

  try {
    const payload = await request.json();
    if (!payload?.response?.id) return new Response('Invalid', { status: 400 });

    // Find pending challenge
    const nonceHash = hashAdminSecret(nonce, config.tokenHashKey);
    const challenge = await store.findPendingChallenge({
      browserNonceHash: nonceHash,
      ceremony: 'add_credential',
      now: new Date(),
    });
    if (!challenge) return new Response('Challenge expired', { status: 400 });

    // Verify registration
    const verification = await verifyRegistrationResponse({
      response: payload.response,
      expectedChallenge: (ch: string) =>
        hashAdminSecret(ch, config.tokenHashKey) === challenge.challengeHash,
      expectedOrigin: config.origin,
      expectedRPID: config.rpId,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return new Response('Verification failed', { status: 400 });
    }

    const { credential, credentialDeviceType, credentialBackedUp } =
      verification.registrationInfo;

    // Store new credential
    await store.addCredentialToOwner(
      {
        credentialId: new Uint8Array(Buffer.from(credential.id, 'base64url')),
        publicKey: new Uint8Array(credential.publicKey),
        counter: credential.counter,
        transports: credential.transports ?? [],
        deviceType: credentialDeviceType,
        backedUp: credentialBackedUp,
      },
      new Date(),
    );

    // Clean up ceremony cookie
    const response = new Response(JSON.stringify({ added: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
    response.headers.append(
      'Set-Cookie',
      `__Host-learnbox_admin_addkey=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict`,
    );
    return response;
  } catch (err) {
    console.error('Add passkey verify error:', err);
    return new Response('Internal error', { status: 500 });
  }
}
