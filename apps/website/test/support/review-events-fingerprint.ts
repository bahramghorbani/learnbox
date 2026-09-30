import type { Pool } from 'pg';

/**
 * Order-independent fingerprint of one learner's review history (LB-B35).
 *
 * Every column that defines a historical answer is included. Later checkpoints that add
 * columns (binary `response`, `scheduler_version`) must NOT change this digest for rows that
 * already existed: the original columns are hashed, never the additions. Use it before and
 * after any migration or backfill to prove that historical four-rating data was not rewritten.
 */
export interface ReviewEventsFingerprint {
  count: number;
  digest: string;
}

export async function reviewEventsFingerprint(
  pool: Pick<Pool, 'query'>,
  userId: string,
): Promise<ReviewEventsFingerprint> {
  const { rows } = await pool.query(
    `SELECT count(*)::int AS count,
            coalesce(md5(string_agg(
              concat_ws('|', id, user_id, card_id, grade,
                        to_char(occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'),
                        client_event_id),
              E'\\n' ORDER BY id)), 'empty') AS digest
       FROM review_events WHERE user_id = $1`,
    [userId],
  );
  return { count: rows[0].count, digest: rows[0].digest };
}
