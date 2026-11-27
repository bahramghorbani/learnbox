-- 0070_support_tickets.sql
--
-- A deliberately small, account-bound support ticket record. `ticket_number` is a database
-- identity sequence (TK is presentation only), so references are unique, monotonic and never
-- client-generated. Sequence gaps are normal after transaction rollback and do not reuse numbers.

CREATE TABLE IF NOT EXISTS support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number BIGINT GENERATED ALWAYS AS IDENTITY (START WITH 1001) UNIQUE NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  request_id UUID NOT NULL,
  subject TEXT NOT NULL CHECK (char_length(btrim(subject)) BETWEEN 3 AND 120),
  message TEXT NOT NULL CHECK (char_length(btrim(message)) BETWEEN 3 AND 3000),
  support_reply TEXT CHECK (support_reply IS NULL OR char_length(btrim(support_reply)) BETWEEN 1 AND 3000),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'answered', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ,
  responded_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  closed_at TIMESTAMPTZ,
  closed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (user_id, request_id),
  CHECK (
    (status = 'open' AND support_reply IS NULL AND responded_at IS NULL)
    OR (status IN ('answered', 'closed') AND support_reply IS NOT NULL AND responded_at IS NOT NULL)
  ),
  CHECK ((status = 'closed') = (closed_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS support_tickets_user_created_idx ON support_tickets (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS support_tickets_status_created_idx ON support_tickets (status, created_at DESC);

-- Ticket content stays in this table, never in audit_logs metadata.
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'learnbox_app') THEN
    GRANT SELECT, INSERT ON support_tickets TO learnbox_app;
    GRANT USAGE ON SEQUENCE support_tickets_ticket_number_seq TO learnbox_app;
  END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'learnbox_admin') THEN
    GRANT SELECT ON support_tickets TO learnbox_admin;
    GRANT SELECT (id, phone_e164, first_name, last_name) ON users TO learnbox_admin;
    GRANT UPDATE (support_reply, status, updated_at, responded_at, responded_by_user_id, closed_at, closed_by_user_id)
      ON support_tickets TO learnbox_admin;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'learnbox_app') THEN
    IF NOT has_table_privilege('learnbox_app', 'support_tickets', 'SELECT')
       OR NOT has_table_privilege('learnbox_app', 'support_tickets', 'INSERT')
       OR has_table_privilege('learnbox_app', 'support_tickets', 'UPDATE')
       OR has_table_privilege('learnbox_app', 'support_tickets', 'DELETE') THEN
      RAISE EXCEPTION '0070: learnbox_app support_tickets grant is incomplete';
    END IF;
  END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'learnbox_admin') THEN
    IF NOT has_table_privilege('learnbox_admin', 'support_tickets', 'SELECT')
       OR NOT has_column_privilege('learnbox_admin', 'support_tickets', 'support_reply', 'UPDATE')
       OR NOT has_column_privilege('learnbox_admin', 'support_tickets', 'status', 'UPDATE')
       OR NOT has_column_privilege('learnbox_admin', 'users', 'phone_e164', 'SELECT')
       OR has_table_privilege('learnbox_admin', 'support_tickets', 'INSERT')
       OR has_table_privilege('learnbox_admin', 'support_tickets', 'DELETE') THEN
      RAISE EXCEPTION '0070: learnbox_admin support_tickets grant is incomplete';
    END IF;
  END IF;
END $$;
