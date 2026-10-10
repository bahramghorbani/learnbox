-- 0034_admin_pack_metadata_grants.sql
--
-- Adds the one column-level privilege 0033 missed, and nothing more.
--
-- Why this migration exists
-- -------------------------
-- 0033 enumerated the write statements of the shipped Admin content code and granted exactly their
-- columns. It missed one: `postgres-content-packs-write-store.ts` editPack (the pack metadata
-- PATCH behind `/api/content/packs/[packId]`). Production proof, 2026-10-10, on the real deployed
-- Admin as the real `learnbox_admin` role (zero-row statements inside a rolled-back transaction):
--   UPDATE packs SET target_item_count = …  -> DENIED 42501 permission denied for table packs
--   UPDATE packs SET status = …            -> allowed (0033 granted it)
-- The route's catch-all turned that denial into `503 Content packs unavailable`, so editing a
-- pack's name, description, level, category or target item count was impossible in Production
-- while publish and archive worked. This migration is the fix.
--
-- Granted here (each column appears in the editPack SET list, store line 490)
-- -------------------------------------------------------------------------
--   packs  UPDATE (display_name, description, target_cefr, category, target_item_count)
--
-- Deliberately NOT granted
-- ------------------------
--   * `packs.is_free` and `packs.price_tomans`. Free/paid and pricing are owner decisions, exactly
--     as 0033 states. The same commit removes `is_free` from the editPack SET list, so the column
--     is unwritable in BOTH layers: the Admin cannot flip a pack to paid even if a future route
--     tries, and the store answers a requested change with a field-level 422 instead of a 503.
--     Enabling it later is an owner decision and needs its own reviewed migration.
--   * `packs.id`, `packs.locale` — identity and canonical locale are immutable for the Admin.
--   * `packs.status`, `packs.published_at` — already granted by 0033 for the lifecycle store; not
--     re-granted here.
--   * No DELETE, TRUNCATE, REFERENCES, TRIGGER, ownership or schema privilege. No new grant on
--     `cards`: nothing in the shipped code updates `cards.content_id` (it is also protected by the
--     `cards_content_id_immutable` trigger), so it stays denied.
--   * Nothing for `learnbox_app`. Learner isolation is untouched: `learnbox_admin` still cannot
--     write `review_events` or `card_schedules`.
--
-- Idempotent and retry-safe: GRANT only, no DDL, no data change, guarded on role existence, so it
-- is a no-op on a second run and on developer/CI databases that have no least-privilege roles.
--
-- Rollback (no data or schema change to undo):
--   REVOKE UPDATE (display_name, description, target_cefr, category, target_item_count)
--     ON packs FROM learnbox_admin;

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'learnbox_admin') THEN
    GRANT UPDATE (display_name, description, target_cefr, category, target_item_count)
      ON packs TO learnbox_admin;
  END IF;
END $$;

-- Self-verification: fail the migration rather than leave a half-granted role behind.
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'learnbox_admin') THEN
    IF NOT has_column_privilege('learnbox_admin', 'packs', 'display_name', 'UPDATE')
       OR NOT has_column_privilege('learnbox_admin', 'packs', 'description', 'UPDATE')
       OR NOT has_column_privilege('learnbox_admin', 'packs', 'target_cefr', 'UPDATE')
       OR NOT has_column_privilege('learnbox_admin', 'packs', 'category', 'UPDATE')
       OR NOT has_column_privilege('learnbox_admin', 'packs', 'target_item_count', 'UPDATE') THEN
      RAISE EXCEPTION '0034: learnbox_admin pack metadata grants are incomplete';
    END IF;
    -- The limits this migration must NOT cross.
    IF has_column_privilege('learnbox_admin', 'packs', 'is_free', 'UPDATE')
       OR has_column_privilege('learnbox_admin', 'packs', 'price_tomans', 'UPDATE')
       OR has_column_privilege('learnbox_admin', 'packs', 'id', 'UPDATE')
       OR has_column_privilege('learnbox_admin', 'cards', 'content_id', 'UPDATE')
       OR has_table_privilege('learnbox_admin', 'packs', 'DELETE')
       OR has_table_privilege('learnbox_admin', 'review_events', 'UPDATE')
       OR has_table_privilege('learnbox_admin', 'card_schedules', 'UPDATE')
       OR has_schema_privilege('learnbox_admin', 'public', 'CREATE') THEN
      RAISE EXCEPTION '0034: learnbox_admin holds a privilege this migration must not grant';
    END IF;
  END IF;
END $$;
