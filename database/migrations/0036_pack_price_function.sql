-- Owner-controlled pack pricing. The Admin role stays unable to UPDATE packs.price_tomans directly.
-- This SECURITY DEFINER boundary validates the commercial invariant, records the canonical audit row,
-- and changes the price in the same transaction.
CREATE OR REPLACE FUNCTION public.admin_set_pack_price(
  pack_id TEXT,
  new_price_tomans INTEGER,
  actor_user_id UUID
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  old_price_tomans INTEGER;
  pack_hash TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM admin_role_assignments
     WHERE user_id = actor_user_id AND role = 'super_admin'
  ) THEN
    RAISE EXCEPTION 'only super_admin may set pack prices' USING ERRCODE = '42501';
  END IF;
  IF new_price_tomans IS NULL OR new_price_tomans < 1 OR new_price_tomans > 100000000 THEN
    RAISE EXCEPTION 'price must be a positive integer up to 100000000 tomans' USING ERRCODE = '22023';
  END IF;

  SELECT price_tomans INTO old_price_tomans
    FROM packs p WHERE p.id = $1 AND NOT p.is_free FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'paid pack not found' USING ERRCODE = 'P0002';
  END IF;
  IF EXISTS (SELECT 1 FROM purchase_events pe WHERE pe.pack_id = $1 AND pe.status = 'verified')
     OR EXISTS (SELECT 1 FROM user_packs up WHERE up.pack_id = $1 AND up.acquisition_type = 'purchased') THEN
    RAISE EXCEPTION 'pack price is immutable after its first sale' USING ERRCODE = '55000';
  END IF;

  UPDATE packs SET price_tomans = new_price_tomans WHERE id = $1;
  pack_hash := md5('learnbox.pack:' || pack_id);
  INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
  VALUES (
    actor_user_id, 'content_pack.price_set', 'pack',
    (substr(pack_hash, 1, 8) || '-' || substr(pack_hash, 9, 4) || '-5' || substr(pack_hash, 14, 3) || '-8' || substr(pack_hash, 18, 3) || '-' || substr(pack_hash, 21, 12))::uuid,
    jsonb_build_object('pack_id', pack_id, 'old_price_tomans', old_price_tomans, 'new_price_tomans', new_price_tomans)
  );
  RETURN new_price_tomans;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_pack_price(TEXT, INTEGER, UUID) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'learnbox_admin') THEN
    GRANT EXECUTE ON FUNCTION public.admin_set_pack_price(TEXT, INTEGER, UUID) TO learnbox_admin;
  END IF;
END $$;
