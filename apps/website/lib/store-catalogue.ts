import type { Pool } from 'pg';

import { isLearnerUserId, packAccessSql, storeCatalogueVisibilitySql } from './pack-access';

/**
 * Learner Store read model (Phase 2 / M2.2, read-only).
 *
 * The SQL lives here rather than in the route handlers so the real queries can be exercised against
 * a real database in tests — the routes pin `sslmode=verify-full`, which a disposable test database
 * cannot satisfy, so a route-level test could only ever mock the thing worth proving.
 *
 * Nothing here returns card content. A Store response is commercial presentation plus a card count.
 */

export interface StoreCataloguePack {
  id: string;
  name: string;
  category: string | null;
  isFree: boolean;
  priceTomans: number | null;
  featured: boolean;
  displayOrder: number;
  coverObjectKey: string | null;
  commercialSummary: string | null;
  listedAt: Date | null;
  totalCards: number;
  /** Derived from the canonical content-access rule, never from listing state. */
  owned: boolean;
}

const PUBLISHED_CARD_COUNT = `(SELECT count(DISTINCT pc.card_id)
   FROM pack_cards pc
   JOIN card_versions cv ON cv.card_id = pc.card_id AND cv.status = 'published'
  WHERE pc.pack_id = p.id)`;

/**
 * The catalogue: packs a learner may be OFFERED. Requires BOTH canonical publication and a listed
 * Store Listing, so commercial fields can be prepared on an unpublished pack without that pack ever
 * becoming visible, and unlisting hides a pack from the shop window immediately.
 */
export async function readStoreCatalogue(
  pool: Pick<Pool, 'query'>,
  userId: string,
): Promise<StoreCataloguePack[]> {
  if (!isLearnerUserId(userId)) return [];
  const result = await pool.query(
    `SELECT p.id, p.display_name, p.category, p.is_free, p.price_tomans,
            sl.featured, sl.display_order, sl.cover_object_key, sl.commercial_summary, sl.listed_at,
            ${PUBLISHED_CARD_COUNT} AS total_cards,
            ${packAccessSql('p', '$1')} AS owned
       FROM packs p
       JOIN store_listings sl ON sl.pack_id = p.id
      WHERE ${storeCatalogueVisibilitySql('p', 'sl')}
      ORDER BY sl.featured DESC, sl.display_order, p.created_at, p.id`,
    [userId],
  );
  return result.rows.map((row) => ({
    id: row.id,
    name: row.display_name,
    category: row.category ?? null,
    isFree: row.is_free === true,
    priceTomans: row.price_tomans ?? null,
    featured: row.featured === true,
    displayOrder: Number(row.display_order ?? 0),
    coverObjectKey: row.cover_object_key ?? null,
    commercialSummary: row.commercial_summary ?? null,
    listedAt: row.listed_at ?? null,
    totalCards: Number(row.total_cards ?? 0),
    owned: row.owned === true,
  }));
}

export interface LearnerPack {
  id: string;
  name: string;
  category: string | null;
  isFree: boolean;
  totalCards: number;
  acquisition: string | null;
  acquiredAt: Date | null;
}

/**
 * What this learner may actually access — the same question the content guards answer, so the
 * library and the content endpoints cannot disagree.
 *
 * Not "rows in user_packs": a free published pack appears with `acquisition: 'free'` while
 * `user_packs` is empty, which is how the current Start Pack keeps working without a backfill.
 * Listing state is irrelevant here: unlisting removes a pack from the shop window, never from the
 * library of someone who already has access.
 */
export async function readLearnerPacks(
  pool: Pick<Pool, 'query'>,
  userId: string,
): Promise<LearnerPack[]> {
  if (!isLearnerUserId(userId)) return [];
  const result = await pool.query(
    `SELECT p.id, p.display_name, p.category, p.is_free,
            up.acquired_at, up.acquisition_type,
            ${PUBLISHED_CARD_COUNT} AS total_cards
       FROM packs p
       LEFT JOIN user_packs up ON up.pack_id = p.id AND up.user_id = $1::uuid
      WHERE ${packAccessSql('p', '$1')}
      ORDER BY p.created_at, p.id`,
    [userId],
  );
  return result.rows.map((row) => ({
    id: row.id,
    name: row.display_name,
    category: row.category ?? null,
    isFree: row.is_free === true,
    totalCards: Number(row.total_cards ?? 0),
    // An entitlement row wins when present; otherwise access comes from the pack being free.
    acquisition: row.acquisition_type ?? (row.is_free === true ? 'free' : null),
    acquiredAt: row.acquired_at ?? null,
  }));
}
