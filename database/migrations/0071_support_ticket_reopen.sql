-- 0071_support_ticket_reopen.sql
--
-- A reopened ticket retains its prior support reply and response metadata.  This preserves the
-- conversation while returning it to the operational `open` queue for follow-up.

ALTER TABLE support_tickets
  DROP CONSTRAINT IF EXISTS support_tickets_check;

ALTER TABLE support_tickets
  ADD CONSTRAINT support_tickets_check CHECK (
    (status = 'open' AND (
      (support_reply IS NULL AND responded_at IS NULL)
      OR (support_reply IS NOT NULL AND responded_at IS NOT NULL)
    ))
    OR (status IN ('answered', 'closed') AND support_reply IS NOT NULL AND responded_at IS NOT NULL)
  );
