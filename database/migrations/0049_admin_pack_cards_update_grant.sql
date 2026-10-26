-- learnbox_admin was missing UPDATE on pack_cards, so PostgresContentLifecycleStore.publishPack's
-- `SELECT ... FOR UPDATE` row lock on pack_cards failed with "permission denied" (Postgres requires
-- the UPDATE privilege for FOR UPDATE locking, not just SELECT). Discovered publishing issue #427's
-- content fix in prod; applied there directly, recorded here so fresh environments get it too.
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'learnbox_admin') THEN
    GRANT UPDATE ON pack_cards TO learnbox_admin;
    IF NOT has_table_privilege('learnbox_admin', 'pack_cards', 'UPDATE') THEN
      RAISE EXCEPTION '0049: learnbox_admin requires UPDATE on pack_cards';
    END IF;
  END IF;
END $$;
