import { NextResponse } from 'next/server';
import { randomBytes, createHmac } from 'node:crypto';
import { Pool } from 'pg';

function hashInviteCode(secret: string, code: string): string {
  return createHmac('sha256', secret).update(code.toLowerCase()).digest('base64url');
}

export async function GET() {
  const secret = process.env.LEARNBOX_ALPHA_INVITE_SECRET ?? '';
  if (secret.length < 32) {
    return NextResponse.json({ error: 'invite_secret_missing', len: secret.length }, { status: 503 });
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 5000,
  });

  try {
    const random = randomBytes(18);
    const code = `ALPHA-${random.toString('base64url')}`;
    const codeHash = hashInviteCode(secret, code);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await pool.query(
      `INSERT INTO invite_codes (code_hash, display_label, max_uses, expires_at) VALUES ($1, $2, $3, $4)`,
      [codeHash, 'owner-alpha-test', 10, expiresAt],
    );

    return NextResponse.json({ code, expiresAt: expiresAt.toISOString() });
  } finally {
    await pool.end();
  }
}
