import { describe, expect, it, vi } from 'vitest';

import {
  createAdminTicketsRoute,
  createAdminUserTicketsRoute,
} from '../lib/server/admin-tickets-routes';
import { hashAdminSecret } from '../lib/server/admin-session.js';

const config = {
  enabled: true as const,
  origin: 'https://admin.learnbox.app',
  rpId: 'admin.learnbox.app',
  tokenHashKey: 'k'.repeat(32),
};
const now = new Date('2026-11-25T10:00:00.000Z');
const sessionToken = 't'.repeat(43);
const csrfToken = 'c'.repeat(43);
const actorUserId = '11111111-1111-4111-8111-111111111111';
const learnerId = '22222222-2222-4222-8222-222222222222';
const ticketId = '33333333-3333-4333-8333-333333333333';

const ticket = {
  id: ticketId,
  ticketNumber: 1001,
  userId: learnerId,
  userPhone: '+989****0000',
  userFirstName: 'سارا',
  userLastName: null,
  subject: 'مشکل ورود',
  message: 'لطفاً دسترسی من را بررسی کنید.',
  supportReply: null,
  status: 'open' as const,
  createdAt: now.toISOString(),
  respondedAt: null,
  closedAt: null,
};

function sessionStore(overrides: { userId?: string | null; recent?: boolean } = {}) {
  return {
    findActiveSession: async () =>
      overrides.userId === null
        ? undefined
        : {
            userId: overrides.userId ?? actorUserId,
            csrfHash: hashAdminSecret(csrfToken, config.tokenHashKey),
            lastSeenAt: now,
            absoluteExpiresAt: new Date(now.getTime() + 60_000),
            revokedAt: null,
            recentAuthenticatedAt: overrides.recent === false ? new Date(0) : now,
          },
    touchSession: async () => true,
  };
}

function store(overrides: { forbidden?: boolean } = {}) {
  return {
    listTickets: vi.fn(async () =>
      overrides.forbidden
        ? { status: 'forbidden' as const }
        : { status: 'ok' as const, rows: [ticket], total: 1 },
    ),
    listUserTickets: vi.fn(async () =>
      overrides.forbidden
        ? { status: 'forbidden' as const }
        : { status: 'ok' as const, rows: [ticket] },
    ),
    mutate: vi.fn(async () => ({ status: 'applied' as const, ticket })),
  };
}

function get(path: string, headers: Record<string, string> = {}) {
  return new Request(`https://admin.learnbox.app${path}`, {
    headers: {
      origin: config.origin,
      Cookie: `__Host-learnbox_admin_session=${sessionToken}`,
      ...headers,
    },
  });
}

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request('https://admin.learnbox.app/api/support/tickets', {
    method: 'POST',
    headers: {
      origin: config.origin,
      Cookie: `__Host-learnbox_admin_session=${sessionToken}`,
      'content-type': 'application/json',
      'x-learnbox-csrf-token': csrfToken,
      'idempotency-key': 'ticket-answer-1',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

describe('Admin support ticket routes', () => {
  it('hides ticket reads while the feature gate is off', async () => {
    const route = createAdminTicketsRoute({
      enabled: false,
      config,
      sessionStore: sessionStore(),
      store: store() as never,
      now: () => now,
    });
    expect((await route.GET(get('/api/support/tickets'))).status).toBe(404);
  });

  it('lists tickets only for an authenticated support operator', async () => {
    const tickets = store();
    const route = createAdminTicketsRoute({
      enabled: true,
      config,
      sessionStore: sessionStore(),
      store: tickets as never,
      now: () => now,
    });
    const response = await route.GET(get('/api/support/tickets?status=open'));
    expect(response.status).toBe(200);
    expect(tickets.listTickets).toHaveBeenCalledWith({
      actorUserId,
      status: 'open',
      reference: undefined,
    });
    await expect(response.json()).resolves.toEqual({ tickets: [ticket], total: 1 });
  });

  it('returns 404, not role information, for a forbidden operator', async () => {
    const route = createAdminTicketsRoute({
      enabled: true,
      config,
      sessionStore: sessionStore(),
      store: store({ forbidden: true }) as never,
      now: () => now,
    });
    expect((await route.GET(get('/api/support/tickets'))).status).toBe(404);
  });

  it('requires CSRF, fresh auth, and an idempotency key before a response write', async () => {
    const tickets = store();
    const route = createAdminTicketsRoute({
      enabled: true,
      config,
      sessionStore: sessionStore({ recent: false }),
      store: tickets as never,
      now: () => now,
    });
    const payload = { action: 'answer', ticketId, reply: 'مشکل بررسی شد.' };
    expect((await route.POST(post(payload))).status).toBe(428);
    expect(tickets.mutate).not.toHaveBeenCalled();

    const fresh = createAdminTicketsRoute({
      enabled: true,
      config,
      sessionStore: sessionStore(),
      store: tickets as never,
      now: () => now,
    });
    expect((await fresh.POST(post(payload, { 'x-learnbox-csrf-token': 'wrong' }))).status).toBe(
      400,
    );
    expect((await fresh.POST(post(payload, { 'idempotency-key': '' }))).status).toBe(400);
    expect(tickets.mutate).not.toHaveBeenCalled();
  });

  it('updates a ticket through the guarded mutation contract', async () => {
    const tickets = store();
    const route = createAdminTicketsRoute({
      enabled: true,
      config,
      sessionStore: sessionStore(),
      store: tickets as never,
      now: () => now,
    });
    const response = await route.POST(
      post({ action: 'answer', ticketId, reply: '  مشکل بررسی شد.  ' }),
    );
    expect(response.status).toBe(200);
    expect(tickets.mutate).toHaveBeenCalledWith({
      actorUserId,
      idempotencyKey: 'ticket-answer-1',
      mutation: { action: 'answer', ticketId, reply: 'مشکل بررسی شد.' },
    });
  });

  it('reads a selected learner ticket history through the same role gate', async () => {
    const tickets = store();
    const route = createAdminUserTicketsRoute({
      enabled: true,
      config,
      sessionStore: sessionStore(),
      store: tickets as never,
      now: () => now,
    });
    const response = await route(get(`/api/support/users/tickets?userId=${learnerId}`));
    expect(response.status).toBe(200);
    expect(tickets.listUserTickets).toHaveBeenCalledWith({ actorUserId, userId: learnerId });
  });
});
