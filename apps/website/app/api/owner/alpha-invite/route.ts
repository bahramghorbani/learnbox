import { Pool } from 'pg';

import {
  issueOwnerInviteCode,
  isOwnerInviteIssuerEnabled,
} from '../../../../../api/dist/alpha/owner-invite-issuer.js';
import { requireVerifiedDatabaseTls } from '../../../../../api/dist/database/migration-runner.js';
import { handleOwnerInviteIssue } from '../../../../lib/owner-invite-http';
import { readInviteRuntimeConfig } from '../../../../lib/alpha-runtime';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  const config = readInviteRuntimeConfig(process.env);
  if (!config || !isOwnerInviteIssuerEnabled(process.env)) {
    return new Response('Not found', { status: 404 });
  }

  const pool = new Pool({
    connectionString: requireVerifiedDatabaseTls(config.databaseUrl),
    max: 1,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
  });

  try {
    return await handleOwnerInviteIssue(request, {
      issue: () => issueOwnerInviteCode({ pool, secret: config.inviteSecret }),
    });
  } finally {
    await pool.end();
  }
}
