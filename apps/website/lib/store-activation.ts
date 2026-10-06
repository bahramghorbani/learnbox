import type { Pool } from 'pg';

import { isLearnerUserId, storeCatalogueVisibilitySql } from './pack-access';

/**
 * Canonical FREE pack acquisition (Phase 2 / M2.3).
 *
 * This is the only place an entitlement row is created. It writes `user_packs` — the same table the
 * M2.2 access rule reads — so acquiring a pack and being allowed to read it are the same fact, not
 * two states that can drift apart.
 *
 * Free only. Paid acquisition is M2.4 and deliberately has no code path here: there is no price
 * check to get wrong, no provider, and no `purchase_event`, because nothing was purchased.
 *
 * Every input to the decision is read from the database inside one statement. The client sends a
 * pack id and nothing else — price, free/paid state, publication state, listing state and ownership
 * are all server-side facts. A client claiming a paid pack is free changes nothing.
 */

export type ActivationDenialReason =
  /** No pack with this id, or it is not published, or its listing is not listed. */
  | 'unavailable'
  /** The pack exists and is offered, but it is not free: acquiring it is not an M2.3 operation. */
  | 'not_free';

export type ActivationOutcome =
  | { status: 'activated' }
  | { status: 'already_owned' }
  | { status: 'denied'; reason: ActivationDenialReason };

/**
 * Eligibility and the write happen in ONE statement.
 *
 * Checking first and inserting afterwards would leave a window where a pack is unpublished or
 * unlisted between the check and the write, and the insert would still land. Here the INSERT draws
 * its rows from the eligibility SELECT, so a pack that stops qualifying simply inserts nothing.
 *
 * Idempotence rests on the `UNIQUE (user_id, pack_id)` constraint rather than on a prior read:
 * `ON CONFLICT DO NOTHING` makes a repeat activation a no-op at the database level, so two
 * simultaneous requests cannot produce two rows. Note that `already_owned` is read from the
 * statement's own snapshot, which cannot see this statement's insert — so `inserted` and
 * `owned_before` are never both true, and their combination tells the outcomes apart exactly.
 */
export async function activateFreePack(
  pool: Pick<Pool, 'query'>,
  userId: string,
  packId: string,
): Promise<ActivationOutcome> {
  // A malformed subject must deny rather than raise 22P02 on the ::uuid cast (same rule as M2.2).
  if (!isLearnerUserId(userId)) return { status: 'denied', reason: 'unavailable' };
  if (typeof packId !== 'string' || packId.length === 0 || packId.length > 120) {
    return { status: 'denied', reason: 'unavailable' };
  }

  const result = await pool.query<{
    offered: boolean;
    free: boolean;
    inserted: boolean;
    owned_before: boolean;
  }>(
    `WITH offered AS (
       SELECT p.id, p.is_free
         FROM packs p
         JOIN store_listings sl ON sl.pack_id = p.id
        WHERE p.id = $2 AND ${storeCatalogueVisibilitySql('p', 'sl')}
     ),
     eligible AS (
       SELECT id FROM offered WHERE is_free = true
     ),
     inserted AS (
       INSERT INTO user_packs (user_id, pack_id, acquisition_type)
       SELECT $1::uuid, id, 'free' FROM eligible
       ON CONFLICT (user_id, pack_id) DO NOTHING
       RETURNING pack_id
     )
     SELECT EXISTS (SELECT 1 FROM offered)  AS offered,
            EXISTS (SELECT 1 FROM eligible) AS free,
            EXISTS (SELECT 1 FROM inserted) AS inserted,
            EXISTS (
              SELECT 1 FROM user_packs
               WHERE user_id = $1::uuid AND pack_id = $2
            ) AS owned_before`,
    [userId, packId],
  );

  const row = result.rows[0];
  if (!row) return { status: 'denied', reason: 'unavailable' };
  if (row.inserted) return { status: 'activated' };
  if (row.owned_before) return { status: 'already_owned' };
  if (!row.offered) return { status: 'denied', reason: 'unavailable' };
  if (!row.free) return { status: 'denied', reason: 'not_free' };
  // Eligible, not owned beforehand, yet nothing inserted: a concurrent identical request won the
  // race and created the single allowed row. The learner owns it either way.
  return { status: 'already_owned' };
}
