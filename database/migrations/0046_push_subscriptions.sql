-- Daily review-reminder push notifications (LB-B19 made real): a learner's browser push
-- subscription, enabled/disabled from Settings. Delivery is sent by the notification-worker
-- service, which runs on this same role so no new DB credential is needed.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  -- Guarantees at most one reminder per learner per calendar day without a separate lock table.
  last_sent_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'learnbox_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON push_subscriptions TO learnbox_app;
  END IF;
END $$;
