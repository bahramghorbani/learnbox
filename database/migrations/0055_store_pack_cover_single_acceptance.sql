-- 0055_store_pack_cover_single_acceptance.sql
-- A pack has exactly one active cover candidate. Keep the cover currently bound to its listing,
-- otherwise retain the most recently accepted candidate, before enforcing the invariant.

WITH ranked AS (
  SELECT
    c.id,
    row_number() OVER (
      PARTITION BY c.pack_id
      ORDER BY (c.object_key = sl.cover_object_key) DESC, c.accepted_at DESC, c.id DESC
    ) AS candidate_rank
  FROM store_pack_cover_candidates c
  LEFT JOIN store_listings sl ON sl.pack_id = c.pack_id
  WHERE c.status = 'accepted'
)
UPDATE store_pack_cover_candidates c
   SET status = 'ready', accepted_by_user_id = NULL, accepted_at = NULL
  FROM ranked r
 WHERE c.id = r.id AND r.candidate_rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS store_pack_cover_candidates_one_accepted_per_pack
  ON store_pack_cover_candidates (pack_id)
  WHERE status = 'accepted';
