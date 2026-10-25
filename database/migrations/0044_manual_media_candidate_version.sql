-- Imported media is version-pinned; legacy/generated candidates remain nullable and compatible.
ALTER TABLE card_media_candidates
  ADD COLUMN IF NOT EXISTS provenance TEXT NOT NULL DEFAULT 'generated'
    CHECK (provenance IN ('generated', 'manual_import')),
  ADD COLUMN IF NOT EXISTS card_version_id UUID REFERENCES card_versions(id);

CREATE UNIQUE INDEX IF NOT EXISTS card_media_candidates_manual_idempotency_idx
  ON card_media_candidates (card_id, kind, card_version_id, checksum)
  WHERE provenance = 'manual_import' AND status IN ('ready', 'accepted', 'superseded');
