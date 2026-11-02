-- 0060_learner_league.sql
--
-- LearnBox League (لیگ لرن‌باکس): XP, badges and the weekly group league.
--
-- Additive only: three new tables, no existing table is altered or rewritten. XP itself is NOT
-- stored — it is derived on read from review_events, learner_daily_plans and verified
-- purchase_events, so the review and purchase write paths are untouched, a replay can never
-- double-award, and a refunded/revoked purchase stops counting automatically.
--
-- Every table is learner data: rows cascade with the users row and are listed in the account
-- deletion set (apps/website/lib/account-deletion.ts).

-- Badges are awarded once, the first time a read sees the condition met.
CREATE TABLE IF NOT EXISTS user_badges (
  user_id    uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_id   text        NOT NULL CHECK (badge_id ~ '^[a-z0-9_]{1,40}$'),
  awarded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, badge_id)
);

-- One row per learner per league week they earned XP in. `week_start` is the Saturday (Asia/Tehran)
-- that opens the week. Final fields are written once, when the week is closed.
CREATE TABLE IF NOT EXISTS league_members (
  week_start date        NOT NULL,
  user_id    uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tier       smallint    NOT NULL CHECK (tier BETWEEN 0 AND 5),
  group_no   integer     NOT NULL CHECK (group_no >= 1),
  joined_at  timestamptz NOT NULL DEFAULT now(),
  weekly_xp  integer     CHECK (weekly_xp IS NULL OR weekly_xp >= 0),
  final_rank integer     CHECK (final_rank IS NULL OR final_rank >= 1),
  outcome    text        CHECK (outcome IS NULL OR outcome IN ('promoted', 'stayed', 'demoted')),
  closed_at  timestamptz,
  PRIMARY KEY (week_start, user_id),
  CHECK ((closed_at IS NULL) = (outcome IS NULL))
);
CREATE INDEX IF NOT EXISTS league_members_group_idx ON league_members (week_start, tier, group_no);
CREATE INDEX IF NOT EXISTS league_members_user_idx ON league_members (user_id, week_start DESC);

-- Presence = the learner chose not to appear in any league table.
CREATE TABLE IF NOT EXISTS league_opt_outs (
  user_id    uuid        PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'learnbox_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON user_badges, league_members, league_opt_outs TO learnbox_app;
    IF NOT has_table_privilege('learnbox_app', 'league_members', 'UPDATE')
       OR NOT has_table_privilege('learnbox_app', 'user_badges', 'INSERT')
       OR NOT has_table_privilege('learnbox_app', 'league_opt_outs', 'DELETE') THEN
      RAISE EXCEPTION 'league app grants missing';
    END IF;
  END IF;
END $$;
