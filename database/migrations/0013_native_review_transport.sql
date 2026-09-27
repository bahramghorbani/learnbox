-- Native review transport remains dormant until NI-005 route authorization.
-- Preserve existing UUID values as text so queued base64url IDs need no rewrite.
ALTER TABLE review_events
  ALTER COLUMN client_event_id TYPE TEXT USING client_event_id::text;

ALTER TABLE review_events
  DROP CONSTRAINT review_events_client_event_id_key,
  ADD CONSTRAINT review_events_client_event_id_length
    CHECK (char_length(client_event_id) BETWEEN 1 AND 128),
  ADD CONSTRAINT review_events_user_client_event_id_key
    UNIQUE (user_id, client_event_id),
  ADD COLUMN applied_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE cards ADD COLUMN content_id TEXT;

-- Backfill is deterministic and only covers legacy rows. New canonical IDs are required below.
UPDATE cards
   SET content_id = 'legacy-' || id::text
 WHERE content_id IS NULL;

ALTER TABLE cards
  ALTER COLUMN content_id SET NOT NULL,
  ADD CONSTRAINT cards_content_id_length CHECK (char_length(content_id) BETWEEN 1 AND 128);

CREATE UNIQUE INDEX cards_content_id_unique ON cards (content_id);

CREATE OR REPLACE FUNCTION reject_cards_content_id_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.content_id IS DISTINCT FROM OLD.content_id THEN
    RAISE EXCEPTION 'content_id is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER cards_content_id_immutable
BEFORE UPDATE OF content_id ON cards
FOR EACH ROW EXECUTE FUNCTION reject_cards_content_id_change();

-- Server-owned, repeatable bootstrap. Only approved canonical content gets a learner schedule.
CREATE OR REPLACE FUNCTION bootstrap_approved_card_schedules(target_user_id UUID)
RETURNS void
LANGUAGE sql
AS $$
  INSERT INTO card_schedules (user_id, card_id)
  SELECT target_user_id, c.id
    FROM cards c
   WHERE EXISTS (
     SELECT 1
       FROM card_versions cv
      WHERE cv.card_id = c.id
        AND cv.status IN ('approved', 'published')
   )
  ON CONFLICT (user_id, card_id) DO NOTHING;
$$;
