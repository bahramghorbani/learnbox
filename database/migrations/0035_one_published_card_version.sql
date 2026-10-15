-- A learner card has exactly one live version. Revision publishing changes the old row to
-- deprecated and the approved replacement to published inside one transaction.
CREATE UNIQUE INDEX IF NOT EXISTS card_versions_one_published_per_card_idx
  ON card_versions (card_id)
  WHERE status = 'published';
