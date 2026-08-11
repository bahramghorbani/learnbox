import { randomBytes } from 'node:crypto';

import { hashInviteCode } from './invite-policy.js';

type OwnerInviteIssuerEnvironment = {
  LEARNBOX_OWNER_ALPHA_INVITE_ISSUER_ENABLED?: string;
  VERCEL_ENV?: string;
  NODE_ENV?: string;
};

export function createOwnerInviteCode(random: Buffer<ArrayBufferLike> = randomBytes(18)): string {
  return `ALPHA-${random.toString('base64url')}`;
}

export function isOwnerInviteIssuerEnabled(environment: OwnerInviteIssuerEnvironment): boolean {
  if (environment.LEARNBOX_OWNER_ALPHA_INVITE_ISSUER_ENABLED !== 'true') return false;
  if (environment.VERCEL_ENV === 'preview') return true;
  return environment.VERCEL_ENV === undefined && environment.NODE_ENV === 'development';
}

type OwnerInviteIssuerPool = {
  query(sql: string, values: unknown[]): Promise<{ rowCount: number | null }>;
};

type IssueOwnerInviteCodeInput = {
  pool: OwnerInviteIssuerPool;
  secret: string;
  now?: Date;
  random?: Buffer<ArrayBufferLike>;
};

export async function issueOwnerInviteCode({
  pool,
  secret,
  now = new Date(),
  random,
}: IssueOwnerInviteCodeInput): Promise<{ code: string; expiresAt: Date }> {
  const code = createOwnerInviteCode(random);
  const expiresAt = new Date(now.getTime() + 30 * 60 * 1000);
  const codeHash = hashInviteCode(secret, code);

  await pool.query(
    `INSERT INTO invite_codes (code_hash, display_label, max_uses, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [codeHash, 'owner-controlled-test', 1, expiresAt],
  );

  return { code, expiresAt };
}
