import type { Pool } from 'pg';

export type SupportTicketStatus = 'open' | 'answered' | 'closed';

export type LearnerSupportTicket = {
  id: string;
  ticketNumber: number;
  subject: string;
  message: string;
  supportReply: string | null;
  status: SupportTicketStatus;
  createdAt: string;
  respondedAt: string | null;
  closedAt: string | null;
};

const selection = `
  id,
  ticket_number AS "ticketNumber",
  subject,
  message,
  support_reply AS "supportReply",
  status,
  to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SSOF') AS "createdAt",
  to_char(responded_at, 'YYYY-MM-DD"T"HH24:MI:SSOF') AS "respondedAt",
  to_char(closed_at, 'YYYY-MM-DD"T"HH24:MI:SSOF') AS "closedAt"
`;

/** The user id is always a separately authenticated server value, never a request-body field. */
export async function createLearnerSupportTicket(
  pool: Pool,
  input: { userId: string; requestId: string; subject: string; message: string },
): Promise<LearnerSupportTicket> {
  const result = await pool.query<LearnerSupportTicket>(
    `WITH inserted AS (
       INSERT INTO support_tickets (user_id, request_id, subject, message)
       VALUES ($1::uuid, $2::uuid, $3, $4)
       ON CONFLICT (user_id, request_id) DO NOTHING
       RETURNING ${selection}
     )
     SELECT * FROM inserted
     UNION ALL
     SELECT ${selection} FROM support_tickets
      WHERE user_id = $1::uuid AND request_id = $2::uuid
     LIMIT 1`,
    [input.userId, input.requestId, input.subject, input.message],
  );
  return result.rows[0];
}

/** Bounded newest-first history for exactly one authenticated learner. */
export async function listLearnerSupportTickets(
  pool: Pool,
  userId: string,
): Promise<LearnerSupportTicket[]> {
  const result = await pool.query<LearnerSupportTicket>(
    `SELECT ${selection}
       FROM support_tickets
      WHERE user_id = $1::uuid
      ORDER BY created_at DESC
      LIMIT 50`,
    [userId],
  );
  return result.rows;
}
