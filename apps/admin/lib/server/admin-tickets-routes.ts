import { loadAdminSession } from './admin-route-security';
import { authorizeMutation, json, notFound, unavailable } from './admin-users-routes';
import type { AdminAuthConfig } from './admin-auth-policy';
import {
  PostgresAdminSupportTicketsStore,
  type AdminTicketStatus,
  type TicketMutation,
} from './postgres-admin-support-tickets-store';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const referencePattern = /^TK([1-9][0-9]{0,18})$/;

type Dependencies = {
  enabled: boolean;
  config: AdminAuthConfig;
  sessionStore?: Parameters<typeof loadAdminSession>[2];
  store?: PostgresAdminSupportTicketsStore;
  now?: () => Date;
};

async function authorizeRead(request: Request, dependencies: Dependencies) {
  if (
    !dependencies.enabled ||
    !dependencies.config.enabled ||
    !dependencies.sessionStore ||
    !dependencies.store
  ) {
    return undefined;
  }
  return loadAdminSession(
    request,
    dependencies.config,
    dependencies.sessionStore,
    (dependencies.now ?? (() => new Date()))(),
  );
}

function parseMutation(body: Record<string, unknown>): TicketMutation | undefined {
  if (typeof body.ticketId !== 'string' || !uuidPattern.test(body.ticketId)) return undefined;
  if (body.action === 'close' || body.action === 'reopen') {
    return { action: body.action, ticketId: body.ticketId };
  }
  if (body.action !== 'answer' || typeof body.reply !== 'string') return undefined;
  const reply = body.reply.trim();
  if (reply.length < 1 || reply.length > 3000) return undefined;
  return { action: 'answer', ticketId: body.ticketId, reply };
}

export function createAdminTicketsRoute(dependencies: Dependencies) {
  return {
    async GET(request: Request) {
      if (
        !dependencies.enabled ||
        !dependencies.config.enabled ||
        !dependencies.sessionStore ||
        !dependencies.store
      )
        return notFound();
      const session = await authorizeRead(request, dependencies);
      if (!session)
        return new Response('Unauthorized', {
          status: 401,
          headers: { 'Cache-Control': 'no-store' },
        });
      const reference = new URL(request.url).searchParams.get('q')?.trim() || undefined;
      const status = new URL(request.url).searchParams.get('status')?.trim() || undefined;
      if (
        (reference && !referencePattern.test(reference)) ||
        (status && !['open', 'answered', 'closed'].includes(status))
      ) {
        return new Response('Invalid request', {
          status: 400,
          headers: { 'Cache-Control': 'no-store' },
        });
      }
      try {
        const result = await dependencies.store!.listTickets({
          actorUserId: session.userId,
          reference,
          status: status as AdminTicketStatus | undefined,
        });
        return result.status === 'forbidden'
          ? notFound()
          : json({ tickets: result.rows, total: result.total });
      } catch {
        return unavailable();
      }
    },
    async POST(request: Request) {
      if (!dependencies.store) return notFound();
      const authorized = await authorizeMutation(request, dependencies, parseMutation);
      if (!authorized.ok) return authorized.response;
      try {
        const result = await dependencies.store.mutate({
          actorUserId: authorized.actorUserId,
          mutation: authorized.change,
          idempotencyKey: authorized.idempotencyKey,
        });
        if (result.status === 'forbidden' || result.status === 'not_found') return notFound();
        if (result.status === 'conflict')
          return json({ code: 'ticket_state_conflict' }, { status: 409 });
        if (result.status === 'applied' || result.status === 'idempotent') {
          return json({ status: result.status, ticket: result.ticket });
        }
        return unavailable();
      } catch {
        return unavailable();
      }
    },
  };
}

export function createAdminUserTicketsRoute(dependencies: Dependencies) {
  return async function GET(request: Request) {
    if (
      !dependencies.enabled ||
      !dependencies.config.enabled ||
      !dependencies.sessionStore ||
      !dependencies.store
    )
      return notFound();
    const session = await authorizeRead(request, dependencies);
    if (!session)
      return new Response('Unauthorized', {
        status: 401,
        headers: { 'Cache-Control': 'no-store' },
      });
    const userId = new URL(request.url).searchParams.get('userId')?.trim() ?? '';
    if (!uuidPattern.test(userId))
      return new Response('Invalid request', {
        status: 400,
        headers: { 'Cache-Control': 'no-store' },
      });
    try {
      const result = await dependencies.store!.listUserTickets({
        actorUserId: session.userId,
        userId,
      });
      return result.status === 'forbidden' ? notFound() : json({ tickets: result.rows });
    } catch {
      return unavailable();
    }
  };
}
