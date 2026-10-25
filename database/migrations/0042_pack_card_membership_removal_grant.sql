-- Draft-only pack membership removal retains cards, versions, media, candidates and job evidence.
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'learnbox_admin') THEN
    GRANT DELETE ON pack_cards TO learnbox_admin;
    IF NOT has_table_privilege('learnbox_admin', 'pack_cards', 'DELETE') THEN
      RAISE EXCEPTION '0042: learnbox_admin requires DELETE on pack_cards';
    END IF;
  END IF;
END $$;
