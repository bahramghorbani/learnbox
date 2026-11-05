-- 0064_dictionary_saved_words.sql
--
-- Vocabulary section (بخش واژگان): a learner's saved dictionary words, synced across devices.
-- Guest saves on the public dictionary site live only in that site's localStorage; this table is
-- where they land once the learner has an account. Cascades with the users row, so no entry in
-- the account-deletion set is needed.
CREATE TABLE IF NOT EXISTS dictionary_saved_words (
  user_id    uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lemma      text        NOT NULL CHECK (char_length(lemma) BETWEEN 1 AND 80),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, lemma)
);
CREATE INDEX IF NOT EXISTS dictionary_saved_words_user_idx
  ON dictionary_saved_words (user_id, created_at DESC);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'learnbox_app') THEN
    GRANT SELECT, INSERT, DELETE ON dictionary_saved_words TO learnbox_app;
    IF NOT has_table_privilege('learnbox_app', 'dictionary_saved_words', 'INSERT') THEN
      RAISE EXCEPTION 'dictionary_saved_words app grants missing';
    END IF;
  END IF;
END $$;
