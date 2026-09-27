import { timingSafeEqual } from 'node:crypto';
import type { Pool } from 'pg';

import { hashOtpPhone } from '../../api/dist/auth/otp-challenge.js';

import type { WebLearnerIdentityInput, WebLearnerIdentityStore } from './web-identity';

export class PostgresWebLearnerIdentityStore implements WebLearnerIdentityStore {
  constructor(
    private readonly pool: Pool,
    private readonly otpSecret: string,
  ) {}

  async resolveUserId(input: WebLearnerIdentityInput): Promise<string | null> {
    if (!sameHash(hashOtpPhone(this.otpSecret, input.phoneE164), input.phoneHash)) return null;
    const result = await this.pool.query<{ id: string }>(
      `INSERT INTO users (id, phone_e164)
       VALUES (gen_random_uuid(), $1)
       ON CONFLICT (phone_e164) DO UPDATE SET phone_e164 = EXCLUDED.phone_e164
       RETURNING id`,
      [input.phoneE164],
    );
    return result.rows[0]?.id ?? null;
  }
}

function sameHash(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
