-- 0069_admin_unified_sales_grant.sql
--
-- Re-establishes the purchase-ledger columns needed by the Admin dashboard's aggregate,
-- production-only verified-sales report after `db-roles-p0.sql` resets application grants.
-- This migration does not add any customer contact field or write privilege.
--
-- It does not reduce the legacy table-wide purchase_events SELECT granted by migration 0029,
-- which remains part of the pre-existing transaction-operations scope on upgraded databases.
--
-- Granted:
--   purchase_events SELECT (environment, status, amount_tomans, created_at)
--
-- Deliberately not granted here: any customer contact field or write privilege.
--
-- Rollback (no schema or data change):
--   REVOKE SELECT (environment, status, amount_tomans, created_at)
--     ON purchase_events FROM learnbox_admin;

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'learnbox_admin') THEN
    GRANT SELECT (environment, status, amount_tomans, created_at)
      ON purchase_events TO learnbox_admin;
  END IF;
END $$;

-- Fail closed if the post-reset aggregate grant is incomplete.
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'learnbox_admin') THEN
    IF NOT has_column_privilege('learnbox_admin', 'purchase_events', 'environment', 'SELECT')
       OR NOT has_column_privilege('learnbox_admin', 'purchase_events', 'status', 'SELECT')
       OR NOT has_column_privilege('learnbox_admin', 'purchase_events', 'amount_tomans', 'SELECT')
       OR NOT has_column_privilege('learnbox_admin', 'purchase_events', 'created_at', 'SELECT') THEN
      RAISE EXCEPTION '0069: learnbox_admin unified-sales grant is incomplete';
    END IF;
    IF has_table_privilege('learnbox_admin', 'purchase_events', 'INSERT')
       OR has_table_privilege('learnbox_admin', 'purchase_events', 'UPDATE')
       OR has_table_privilege('learnbox_admin', 'purchase_events', 'DELETE') THEN
      RAISE EXCEPTION '0069: learnbox_admin holds a privilege this migration must not grant';
    END IF;
  END IF;
END $$;
