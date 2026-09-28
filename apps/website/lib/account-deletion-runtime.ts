import { Pool } from 'pg';

import { hashOtpPhone } from '../../api/dist/auth/otp-challenge.js';
import {
  deleteAccount as deleteAccountInStore,
  type DeletionOutcome as StoreOutcome,
} from './account-deletion-store';
import type { AccountDeletionDependencies, DeletionOutcome } from './account-deletion-http';

/**
 * Production wiring for account deletion (LB-B04).
 *
 * Reuses the same HMAC phone hash construction as OTP challenges, so the deletion audit record and
 * any later purchase restoration resolve to the same subject reference for the same phone number
 * without the audit ever holding the number itself.
 */

type Environment = Record<string, string | undefined>;
type DeletionGlobal = typeof globalThis & {
  learnboxAccountDeletionPool?: { databaseUrl: string; pool: Pool };
};

function deletionPool(databaseUrl: string): Pool {
  const shared = globalThis as DeletionGlobal;
  if (shared.learnboxAccountDeletionPool?.databaseUrl === databaseUrl) {
    return shared.learnboxAccountDeletionPool.pool;
  }
  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  shared.learnboxAccountDeletionPool = { databaseUrl, pool };
  return pool;
}

function toBoundaryOutcome(outcome: StoreOutcome): DeletionOutcome {
  switch (outcome.status) {
    case 'deleted':
      return { status: 'deleted', deletionId: outcome.deletionId };
    case 'already_deleted':
      return { status: 'already_deleted', deletionId: outcome.deletionId };
    case 'refused':
      return { status: 'refused', reason: outcome.reason };
  }
}

export function accountDeletionDependenciesFromEnvironment(
  environment: Environment = process.env,
): AccountDeletionDependencies | null {
  const databaseUrl = environment.DATABASE_URL ?? '';
  // MUST be the same secret the OTP flow hashes phones with (LEARNBOX_OTP_SECRET). Using any
  // other secret would yield a subject hash that never matches the OTP records, so a later
  // purchase-ownership claim for this phone could never be resolved.
  const phoneSecret = environment.LEARNBOX_OTP_SECRET ?? '';
  // Without the phone secret the audit record could not be written with a stable, non-reversible
  // subject reference, so deletion is reported unavailable rather than performed unaudited.
  if (!/^postgres(ql)?:\/\//.test(databaseUrl) || phoneSecret.length < 32) return null;

  const pool = deletionPool(databaseUrl);

  return {
    async readAccountPhone(userId: string): Promise<string | null> {
      const result = await pool.query<{ phone_e164: string }>(
        'SELECT phone_e164 FROM users WHERE id = $1',
        [userId],
      );
      return result.rows[0]?.phone_e164 ?? null;
    },

    async deleteAccount({ userId, requestId }): Promise<DeletionOutcome> {
      const phone = await this.readAccountPhone(userId);
      // The subject hash must be computed BEFORE the row is removed; afterwards the phone is gone.
      const subjectHash = phone ? hashOtpPhone(phoneSecret, phone) : `unknown:${userId}`;
      const outcome = await deleteAccountInStore(pool, {
        userId,
        subjectHash,
        actor: 'learner',
        requestedAt: new Date(),
        requestId,
      });
      return toBoundaryOutcome(outcome);
    },
  };
}
