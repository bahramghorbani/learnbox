/**
 * Canonical learner pack access (Phase 2 / M2.2).
 *
 * The ONE definition of whether an authenticated learner may read a pack's content. Every
 * learner-facing read path — Today, Words, Cards, Progress, the summary endpoint and protected
 * content media — derives its filter from here, so no two surfaces can disagree about what a
 * learner is allowed to see.
 *
 * The rule:
 *
 *   Pack content is accessible only when
 *     1. packs.status = 'published'
 *   AND
 *     2. packs.is_free = true  OR  the learner holds the canonical entitlement in user_packs.
 *
 * Both halves matter and neither is sufficient alone.
 *
 * A Store Listing is NOT an entitlement. `store_listings` is commercial presentation only and is
 * deliberately absent from this predicate: a listed pack whose content is unpublished must never
 * become readable, and listing state must never substitute for publication or for ownership. The
 * only place `store_listings` appears is the Store CATALOGUE predicate below, which decides what a
 * learner may be *offered*, never what they may *read*.
 *
 * Why free packs need no entitlement row: `is_free` is canonical on the pack, so a free pack is
 * accessible to every authenticated learner the moment it is published. That keeps the currently
 * published free Start Pack working with `user_packs` empty, and means introducing enforcement
 * cannot revoke access from existing learners. Granting entitlement rows is M2.3's job; this
 * module only reads.
 *
 * Both `packs.status` and `packs.is_free` are NOT NULL with fail-closed defaults ('draft', false),
 * so an unconfigured pack denies access rather than leaking.
 */

import type { Pool } from 'pg';

/**
 * `users.id` is UUID and `user_packs.user_id` references it, so the predicate casts the session
 * subject with `::uuid`. A malformed subject must DENY rather than raise SQLSTATE 22P02 and turn an
 * authorization decision into a 500, so callers screen it here first. Fail closed, never open.
 */
export function isLearnerUserId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

/**
 * The canonical access predicate as SQL, for the alias a query already uses for `packs` and the
 * placeholder it already binds the learner id to.
 *
 * Exported as a fragment rather than hidden behind a single query function because the learner read
 * paths are legitimately different queries (aggregate CTEs, LATERAL joins, per-card lookups) that
 * cannot share one SELECT. Sharing the PREDICATE is what makes the rule single-sourced; a test
 * asserts every learner query site uses it.
 */
export function packAccessSql(packAlias: string, userParam: string): string {
  return `(
    ${packAlias}.status = 'published'
    AND (
      ${packAlias}.is_free = true
      OR EXISTS (
        SELECT 1 FROM user_packs up
        WHERE up.pack_id = ${packAlias}.id AND up.user_id = ${userParam}::uuid
      )
    )
  )`;
}

/**
 * The learner's curriculum: every card with a published version inside a pack the learner may
 * access. This is the denominator of every "x of y" on the progress screens, so a pack the learner
 * cannot open must not inflate it.
 */
export function curriculumCteSql(userParam: string): string {
  return `curriculum AS (
  SELECT DISTINCT pc.card_id
  FROM pack_cards pc
  JOIN packs p ON p.id = pc.pack_id
  JOIN card_versions cv ON cv.card_id = pc.card_id AND cv.status = 'published'
  WHERE ${packAccessSql('p', userParam)}
)`;
}

/**
 * Store CATALOGUE visibility — what a learner may be OFFERED. Requires BOTH canonical content
 * publication and a listed Store Listing.
 *
 * This is strictly weaker than access: appearing in the catalogue grants no right to read content.
 * A listed pack that is not published is invisible here AND unreadable above; an unlisted published
 * pack is invisible here but still readable if the learner is entitled, because hiding a shop
 * window must not revoke what someone already owns.
 */
export function storeCatalogueVisibilitySql(packAlias: string, listingAlias: string): string {
  return `(${packAlias}.status = 'published' AND ${listingAlias}.store_status = 'listed')`;
}

/**
 * Point check used by protected media: may this learner read the content identified by
 * `cards.content_id`? Media must sit behind exactly the same boundary as the card itself, or a
 * learner could skip the card API and fetch the image or audio directly.
 */
export async function canLearnerAccessContentId(
  pool: Pick<Pool, 'query'>,
  contentId: string,
  userId: string,
): Promise<boolean> {
  if (!isLearnerUserId(userId)) return false;
  const result = await pool.query<{ allowed: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM cards c
       JOIN pack_cards pc ON pc.card_id = c.id
       JOIN packs p ON p.id = pc.pack_id
       JOIN card_versions cv ON cv.card_id = c.id AND cv.status = 'published'
       WHERE c.content_id = $1 AND ${packAccessSql('p', '$2')}
     ) AS allowed`,
    [contentId, userId],
  );
  return result.rows[0]?.allowed === true;
}

/** Point check for a whole pack, by canonical `packs.id` slug. */
export async function canLearnerAccessPack(
  pool: Pick<Pool, 'query'>,
  packId: string,
  userId: string,
): Promise<boolean> {
  if (!isLearnerUserId(userId)) return false;
  const result = await pool.query<{ allowed: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM packs p WHERE p.id = $1 AND ${packAccessSql('p', '$2')}
     ) AS allowed`,
    [packId, userId],
  );
  return result.rows[0]?.allowed === true;
}

/** Canonical pack ids the learner may access, for the my-packs surface. */
export async function readAccessiblePackIds(
  pool: Pick<Pool, 'query'>,
  userId: string,
): Promise<string[]> {
  if (!isLearnerUserId(userId)) return [];
  const result = await pool.query<{ id: string }>(
    `SELECT p.id FROM packs p WHERE ${packAccessSql('p', '$1')} ORDER BY p.created_at, p.id`,
    [userId],
  );
  return result.rows.map((row) => row.id);
}
