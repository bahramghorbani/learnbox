-- 0033_admin_content_management_grants.sql
--
-- Restores the exact database privileges the already-shipped Admin content-management code needs,
-- and nothing more.
--
-- Why this migration exists
-- -------------------------
-- The Admin content workspace (pack creation, card creation/editing, pack-card association,
-- submit-for-review, publish, archive, CSV import) is implemented and merged, but
-- `infrastructure/database/db-roles-p0.sql` deliberately granted `learnbox_admin` NO write
-- privilege on `packs`, `cards`, `pack_cards` — that file was written when the legacy content
-- routes were hard-disabled, and it says so inline: "Re-enabling one in P1 must add its exact
-- grant in a reviewed change." This is that change.
--
-- Verified against the live Production database as the real `learnbox_admin` role (zero-row
-- statements inside a rolled-back transaction) before writing this migration:
--   packs_status_update  -> DENIED 42501 permission denied for table packs
--   cards_insert         -> DENIED 42501 permission denied for table cards
--   pack_cards_insert    -> DENIED 42501 permission denied for table pack_cards
-- So enabling LEARNBOX_ADMIN_CONTENT_PACKS_MANAGE_ENABLED without this migration would turn every
-- content mutation into a 500 at the first write.
--
-- Each verb below is justified by a statement that exists in the shipped code. Nothing is granted
-- "for symmetry": where the code only ever writes specific columns, the grant is column-level.
--
--   packs         INSERT            postgres-content-packs-write-store.ts:407  (create pack, status 'draft')
--                 UPDATE (status,
--                         published_at)
--                                   postgres-content-lifecycle-store.ts:414  status -> 'needs_review'
--                                   postgres-content-lifecycle-store.ts:547  status -> 'published', published_at
--                                   postgres-content-lifecycle-store.ts:637  status -> 'archived'
--   cards         INSERT            postgres-content-packs-write-store.ts:599  (create card)
--                 UPDATE (lemma,
--                         content_version)
--                                   postgres-content-packs-write-store.ts:746  (edit card headword mirror)
--   card_versions INSERT            postgres-content-packs-write-store.ts:603, :736  (first and new draft version)
--                 UPDATE (content_json,
--                         source_provider,
--                         source_reference)
--                                   postgres-content-packs-write-store.ts:725  (in-place draft edit)
--                 (status, published_at are already granted by db-roles-p0.sql:85)
--   pack_cards    INSERT            postgres-content-packs-write-store.ts:619  (associate card with pack)
--
-- Deliberately NOT granted
-- ------------------------
--   * No DELETE on any content table. Content is retired by status (`archived`, `deprecated`), never
--     removed, and no shipped statement deletes a pack, card, version or association.
--   * No UPDATE on `packs.price_tomans`, `is_free`, `id` or `locale`. Commercial configuration is an
--     owner decision and the Admin has no write path for it (the pricing route is gated off); the
--     column stays unwritable so a future route cannot quietly set a price.
--   * No UPDATE on `cards.content_id` (the learner media/review key, also protected by the
--     `cards_content_id_immutable` trigger) and none on `cards.id`.
--   * No TRUNCATE, REFERENCES, TRIGGER, ownership, schema CREATE or sequence privilege. The content
--     tables have no serial/identity column, so no sequence grant is required.
--   * Nothing is granted to `learnbox_app`. Learner isolation is untouched: the learner role still
--     cannot write content, and `learnbox_admin` still cannot write `review_events` or
--     `card_schedules` (learner progress).
--
-- Idempotent and retry-safe: GRANT is idempotent, there is no DDL, no data change and no
-- destructive statement, so re-running this migration is a no-op. The block is guarded on role
-- existence, so it is also a no-op on developer and CI databases that connect as the owner and have
-- no least-privilege roles.
--
-- Rollback: REVOKE the five statements below (no data or schema change to undo).
--   REVOKE INSERT ON packs, cards, card_versions, pack_cards FROM learnbox_admin;
--   REVOKE UPDATE (status, published_at) ON packs FROM learnbox_admin;
--   REVOKE UPDATE (lemma, content_version) ON cards FROM learnbox_admin;
--   REVOKE UPDATE (content_json, source_provider, source_reference) ON card_versions FROM learnbox_admin;

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'learnbox_admin') THEN
    GRANT INSERT ON packs, cards, card_versions, pack_cards TO learnbox_admin;
    GRANT UPDATE (status, published_at) ON packs TO learnbox_admin;
    GRANT UPDATE (lemma, content_version) ON cards TO learnbox_admin;
    GRANT UPDATE (content_json, source_provider, source_reference) ON card_versions
      TO learnbox_admin;
  END IF;
END $$;

-- Self-verification: fail the migration rather than leave a half-granted role behind.
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'learnbox_admin') THEN
    IF NOT has_table_privilege('learnbox_admin', 'packs', 'INSERT')
       OR NOT has_table_privilege('learnbox_admin', 'cards', 'INSERT')
       OR NOT has_table_privilege('learnbox_admin', 'card_versions', 'INSERT')
       OR NOT has_table_privilege('learnbox_admin', 'pack_cards', 'INSERT')
       OR NOT has_column_privilege('learnbox_admin', 'packs', 'status', 'UPDATE')
       OR NOT has_column_privilege('learnbox_admin', 'packs', 'published_at', 'UPDATE')
       OR NOT has_column_privilege('learnbox_admin', 'cards', 'lemma', 'UPDATE')
       OR NOT has_column_privilege('learnbox_admin', 'card_versions', 'content_json', 'UPDATE') THEN
      RAISE EXCEPTION '0033: learnbox_admin content-management grants are incomplete';
    END IF;
    -- The limits this migration must NOT cross.
    IF has_table_privilege('learnbox_admin', 'packs', 'DELETE')
       OR has_table_privilege('learnbox_admin', 'cards', 'DELETE')
       OR has_table_privilege('learnbox_admin', 'card_versions', 'DELETE')
       OR has_table_privilege('learnbox_admin', 'pack_cards', 'DELETE')
       OR has_column_privilege('learnbox_admin', 'packs', 'price_tomans', 'UPDATE')
       OR has_column_privilege('learnbox_admin', 'cards', 'content_id', 'UPDATE')
       OR has_table_privilege('learnbox_admin', 'review_events', 'UPDATE')
       OR has_table_privilege('learnbox_admin', 'card_schedules', 'UPDATE')
       OR has_schema_privilege('learnbox_admin', 'public', 'CREATE') THEN
      RAISE EXCEPTION '0033: learnbox_admin holds a privilege this migration must not grant';
    END IF;
  END IF;
END $$;
