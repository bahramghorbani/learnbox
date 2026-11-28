import type { Pool } from 'pg';

import { hasAdminSupportRole } from './admin-support-role';

export type AdminTicketStatus = 'open' | 'answered' | 'closed';
export type AdminSupportTicket = {
  id: string;
  ticketNumber: number;
  userId: string;
  userPhone: string;
  userFirstName: string | null;
  userLastName: string | null;
  subject: string;
  message: string;
  supportReply: string | null;
  status: AdminTicketStatus;
  createdAt: string;
  respondedAt: string | null;
  closedAt: string | null;
};

const selection = `
  t.id,
  t.ticket_number AS "ticketNumber",
  t.user_id AS "userId",
  u.phone_e164 AS "userPhone",
  u.first_name AS "userFirstName",
  u.last_name AS "userLastName",
  t.subject,
  t.message,
  t.support_reply AS "supportReply",
  t.status,
  to_char(t.created_at, 'YYYY-MM-DD"T"HH24:MI:SSOF') AS "createdAt",
  to_char(t.responded_at, 'YYYY-MM-DD"T"HH24:MI:SSOF') AS "respondedAt",
  to_char(t.closed_at, 'YYYY-MM-DD"T"HH24:MI:SSOF') AS "closedAt"
`;

export type TicketMutation =
  | { action: 'answer'; ticketId: string; reply: string }
  | { action: 'close'; ticketId: string }
  | { action: 'reopen'; ticketId: string };

export class PostgresAdminSupportTicketsStore {
  static readonly listLimit = 100;
  constructor(private readonly pool: Pool) {}

  async listTickets(input: {
    actorUserId: string;
    reference?: string;
    status?: AdminTicketStatus;
  }): Promise<
    { status: 'ok'; rows: AdminSupportTicket[]; total: number } | { status: 'forbidden' }
  > {
    const client = await this.pool.connect();
    try {
      if (!(await hasAdminSupportRole(client, input.actorUserId))) return { status: 'forbidden' };
      const ticketNumber = input.reference ? Number(input.reference.slice(2)) : null;
      const rows = await client.query<AdminSupportTicket>(
        `SELECT ${selection}
           FROM support_tickets t JOIN users u ON u.id = t.user_id
          WHERE ($1::bigint IS NULL OR t.ticket_number = $1)
            AND ($2::text IS NULL OR t.status = $2)
          ORDER BY t.created_at DESC LIMIT ${PostgresAdminSupportTicketsStore.listLimit}`,
        [ticketNumber, input.status ?? null],
      );
      const total = await client.query<{ total: number }>(
        `SELECT count(*)::int AS total FROM support_tickets t
          WHERE ($1::bigint IS NULL OR t.ticket_number = $1)
            AND ($2::text IS NULL OR t.status = $2)`,
        [ticketNumber, input.status ?? null],
      );
      return { status: 'ok', rows: rows.rows, total: total.rows[0]?.total ?? 0 };
    } finally {
      client.release();
    }
  }

  async listUserTickets(input: {
    actorUserId: string;
    userId: string;
  }): Promise<{ status: 'ok'; rows: AdminSupportTicket[] } | { status: 'forbidden' }> {
    const client = await this.pool.connect();
    try {
      if (!(await hasAdminSupportRole(client, input.actorUserId))) return { status: 'forbidden' };
      const rows = await client.query<AdminSupportTicket>(
        `SELECT ${selection}
           FROM support_tickets t JOIN users u ON u.id = t.user_id
          WHERE t.user_id = $1::uuid ORDER BY t.created_at DESC LIMIT ${PostgresAdminSupportTicketsStore.listLimit}`,
        [input.userId],
      );
      return { status: 'ok', rows: rows.rows };
    } finally {
      client.release();
    }
  }

  async mutate(input: {
    actorUserId: string;
    mutation: TicketMutation;
    idempotencyKey: string;
  }): Promise<
    | { status: 'applied' | 'idempotent'; ticket: AdminSupportTicket }
    | { status: 'forbidden' | 'not_found' | 'conflict' }
  > {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      if (!(await hasAdminSupportRole(client, input.actorUserId))) {
        await client.query('ROLLBACK');
        return { status: 'forbidden' };
      }
      const current = await client.query<AdminSupportTicket>(
        `SELECT ${selection} FROM support_tickets t JOIN users u ON u.id = t.user_id
          WHERE t.id = $1::uuid FOR UPDATE OF t`,
        [input.mutation.ticketId],
      );
      const ticket = current.rows[0];
      if (!ticket) {
        await client.query('ROLLBACK');
        return { status: 'not_found' };
      }
      const prior = await client.query<{ ok: boolean }>(
        `SELECT EXISTS (SELECT 1 FROM audit_logs WHERE entity_type = 'support_ticket'
           AND entity_id = $1::uuid AND metadata->>'idempotency_key' = $2) AS ok`,
        [ticket.id, input.idempotencyKey],
      );
      if (prior.rows[0]?.ok) {
        await client.query('ROLLBACK');
        return { status: 'idempotent', ticket };
      }
      if (input.mutation.action === 'answer' && ticket.status !== 'open') {
        await client.query('ROLLBACK');
        return { status: 'conflict' };
      }
      if (input.mutation.action === 'close' && ticket.status !== 'answered') {
        await client.query('ROLLBACK');
        return { status: 'conflict' };
      }
      if (input.mutation.action === 'reopen' && ticket.status !== 'closed') {
        await client.query('ROLLBACK');
        return { status: 'conflict' };
      }
      const updated = await client.query<{ id: string }>(
        input.mutation.action === 'answer'
          ? `UPDATE support_tickets SET support_reply = $2, status = 'answered', updated_at = now(),
                responded_at = now(), responded_by_user_id = $3::uuid
              WHERE id = $1::uuid RETURNING id`
          : input.mutation.action === 'close'
            ? `UPDATE support_tickets SET status = 'closed', updated_at = now(), closed_at = now(),
                  closed_by_user_id = $2::uuid WHERE id = $1::uuid RETURNING id`
            : `UPDATE support_tickets SET status = 'open', updated_at = now(), closed_at = NULL,
                  closed_by_user_id = NULL WHERE id = $1::uuid RETURNING id`,
        input.mutation.action === 'answer'
          ? [ticket.id, input.mutation.reply, input.actorUserId]
          : input.mutation.action === 'close'
            ? [ticket.id, input.actorUserId]
            : [ticket.id],
      );
      if (updated.rowCount !== 1) throw new Error('ticket update lost');
      await client.query(
        `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
         VALUES ($1::uuid, $2, 'support_ticket', $3::uuid, $4)`,
        [
          input.actorUserId,
          input.mutation.action === 'answer'
            ? 'support_ticket.answer'
            : input.mutation.action === 'close'
              ? 'support_ticket.close'
              : 'support_ticket.reopen',
          ticket.id,
          { ticket_number: ticket.ticketNumber, idempotency_key: input.idempotencyKey },
        ],
      );
      const saved = await client.query<AdminSupportTicket>(
        `SELECT ${selection} FROM support_tickets t JOIN users u ON u.id = t.user_id
          WHERE t.id = $1::uuid`,
        [ticket.id],
      );
      await client.query('COMMIT');
      return { status: 'applied', ticket: saved.rows[0] };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}
