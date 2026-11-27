import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  subject: '11111111-1111-4111-8111-111111111111' as string | null,
  createTicket: vi.fn(),
  listTickets: vi.fn(),
}));

vi.mock('../lib/learner-auth', () => ({
  authenticateLearner: async () => (state.subject ? { subject: state.subject } : null),
}));
vi.mock('../lib/support-tickets-web-runtime', () => ({
  learnerSupportTicketsDependenciesFromEnvironment: () => ({
    createTicket: state.createTicket,
    listTickets: state.listTickets,
  }),
}));

import { GET, POST } from '../app/api/learner/support/tickets/route';

const ORIGIN = 'https://app.learnboxapp.com';
const ticket = {
  id: '22222222-2222-4222-8222-222222222222',
  ticketNumber: 1001,
  subject: 'مشکل ورود',
  message: 'لطفاً دسترسی من را بررسی کنید.',
  supportReply: null,
  status: 'open',
  createdAt: '2026-11-25T10:00:00+00',
  respondedAt: null,
  closedAt: null,
};

function post(body: unknown, headers: Record<string, string> = {}) {
  return POST(
    new Request(`${ORIGIN}/api/learner/support/tickets`, {
      method: 'POST',
      headers: {
        origin: ORIGIN,
        'content-type': 'application/json',
        'idempotency-key': '44444444-4444-4444-8444-444444444444',
        ...headers,
      },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  state.subject = '11111111-1111-4111-8111-111111111111';
  state.createTicket.mockReset().mockResolvedValue(ticket);
  state.listTickets.mockReset().mockResolvedValue([ticket]);
  process.env.LEARNBOX_PUBLIC_APP_ORIGIN = ORIGIN;
});

describe('learner support tickets route', () => {
  it('creates only under the authenticated learner id', async () => {
    const response = await post({
      subject: '  مشکل ورود  ',
      message: '  لطفاً دسترسی من را بررسی کنید.  ',
    });

    expect(response.status).toBe(201);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(state.createTicket).toHaveBeenCalledWith({
      userId: state.subject,
      requestId: '44444444-4444-4444-8444-444444444444',
      subject: 'مشکل ورود',
      message: 'لطفاً دسترسی من را بررسی کنید.',
    });
  });

  it('rejects invalid or over-posted content before the store is touched', async () => {
    for (const body of [
      { subject: 'x', message: 'ok' },
      {
        subject: 'مشکل ورود',
        message: 'لطفاً دسترسی من را بررسی کنید.',
        userId: '33333333-3333-4333-8333-333333333333',
      },
    ]) {
      expect((await post(body)).status).toBe(400);
    }
    expect(state.createTicket).not.toHaveBeenCalled();
  });

  it('rejects a missing or malformed idempotency key before the store is touched', async () => {
    for (const idempotencyKey of ['', 'not-a-uuid']) {
      expect(
        (
          await post(
            { subject: 'مشکل ورود', message: 'لطفاً دسترسی من را بررسی کنید.' },
            { 'idempotency-key': idempotencyKey },
          )
        ).status,
      ).toBe(400);
    }
    expect(state.createTicket).not.toHaveBeenCalled();
  });

  it('runs the origin guard before session lookup and database work', async () => {
    state.subject = null;
    const response = await post(
      { subject: 'مشکل ورود', message: 'لطفاً دسترسی من را بررسی کنید.' },
      { origin: 'https://evil.example' },
    );
    expect(response.status).toBe(403);
    expect(state.createTicket).not.toHaveBeenCalled();
  });

  it('returns only the authenticated learner history', async () => {
    const response = await GET(new Request(`${ORIGIN}/api/learner/support/tickets`));
    expect(response.status).toBe(200);
    expect(state.listTickets).toHaveBeenCalledWith(state.subject);
    await expect(response.json()).resolves.toEqual({ tickets: [ticket] });
  });
});
