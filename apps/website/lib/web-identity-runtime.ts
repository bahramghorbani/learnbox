import { timingSafeEqual } from 'node:crypto';
import type { Pool } from 'pg';

import { hashOtpPhone } from '../../api/dist/auth/otp-challenge.js';

import type {
  WebLearnerIdentityInput,
  WebLearnerIdentityOutcome,
  WebLearnerIdentityStore,
} from './web-identity';

export class PostgresWebLearnerIdentityStore implements WebLearnerIdentityStore {
  constructor(
    private readonly pool: Pool,
    private readonly otpSecret: string,
  ) {}

  async resolveUserId(input: WebLearnerIdentityInput): Promise<WebLearnerIdentityOutcome> {
    if (!sameHash(hashOtpPhone(this.otpSecret, input.phoneE164), input.phoneHash)) {
      return { status: 'rejected' };
    }
    // The account status comes back from the UPSERT that already runs here, so the sign-in door
    // checks suspension without an extra round trip. A first-time phone is created active, so new
    // learners are unaffected; a suspended one is given no session at all (M3.1).
    const result = await this.pool.query<{ id: string; status: string }>(
      `INSERT INTO users (id, phone_e164)
       VALUES (gen_random_uuid(), $1)
       ON CONFLICT (phone_e164) DO UPDATE SET phone_e164 = EXCLUDED.phone_e164
       RETURNING id, status`,
      [input.phoneE164],
    );
    const row = result.rows[0];
    if (!row) return { status: 'rejected' };
    if (row.status !== 'active') return { status: 'suspended' };
    return { status: 'ok', userId: row.id };
  }
}

function sameHash(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
