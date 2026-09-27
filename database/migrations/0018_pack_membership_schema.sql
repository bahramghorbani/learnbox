-- Reconcile the previously out-of-band pack membership schema with tracked migrations.
-- Data and publication state are never seeded or changed by this migration.
-- CREATE IF NOT EXISTS is followed by a shape check: an incompatible existing table
-- fails closed rather than silently being accepted by a clean deployment.
CREATE TABLE IF NOT EXISTS packs (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  description TEXT,
  locale TEXT NOT NULL DEFAULT 'de-DE',
  target_cefr TEXT NOT NULL DEFAULT 'A1',
  target_item_count INTEGER NOT NULL,
  category TEXT,
  is_free BOOLEAN NOT NULL DEFAULT false,
  price_tomans INTEGER,
  status TEXT NOT NULL DEFAULT 'draft',
  ai_prompt TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS pack_cards (
  pack_id TEXT NOT NULL REFERENCES packs(id),
  card_id UUID NOT NULL REFERENCES cards(id),
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (pack_id, card_id)
);

DO $validate_pack_membership$
DECLARE
  expected TEXT[] := ARRAY[
    'packs.id:text:NO', 'packs.display_name:text:NO',
    'packs.description:text:YES', 'packs.locale:text:NO',
    'packs.target_cefr:text:NO', 'packs.target_item_count:integer:NO',
    'packs.category:text:YES', 'packs.is_free:boolean:NO',
    'packs.price_tomans:integer:YES', 'packs.status:text:NO',
    'packs.ai_prompt:text:YES', 'packs.created_at:timestamp with time zone:NO',
    'packs.published_at:timestamp with time zone:YES',
    'pack_cards.pack_id:text:NO', 'pack_cards.card_id:uuid:NO',
    'pack_cards.sort_order:integer:NO'
  ];
  actual TEXT[];
BEGIN
  SELECT array_agg(table_name || '.' || column_name || ':' || data_type || ':' || is_nullable
                   ORDER BY table_name, ordinal_position)
    INTO actual
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name IN ('packs', 'pack_cards');
  IF (SELECT array_agg(x ORDER BY x) FROM unnest(expected) x)
     IS DISTINCT FROM (SELECT array_agg(x ORDER BY x) FROM unnest(actual) x) THEN
    RAISE EXCEPTION 'Incompatible packs/pack_cards schema; inspect before migration';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'packs'::regclass AND contype = 'p'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'pack_cards'::regclass AND contype = 'p'
       AND pg_get_constraintdef(oid) = 'PRIMARY KEY (pack_id, card_id)'
  ) OR (
    SELECT count(*) FROM pg_constraint
     WHERE conrelid = 'pack_cards'::regclass AND contype = 'f'
  ) <> 2 THEN
    RAISE EXCEPTION 'Incompatible pack membership keys/foreign keys';
  END IF;
END
$validate_pack_membership$;
