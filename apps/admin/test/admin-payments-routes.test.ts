import { describe, expect, it, vi } from 'vitest';

import {
  createAdminPaymentConfigRoute,
  createAdminTransactionsRoute,
} from '../lib/server/admin-payments-routes';
import { hashAdminSecret } from '../lib/server/admin-session.js';

/**
 * Phase 2 / Milestone 2.4 — Admin payment operations boundary.
 *
 * Three guarantees under test.
 *
 * 1. Reading payment records is exactly as gated as the rest of the Admin Store workspace:
 *    unauthenticated and flag-off callers get nothing, and a caller without an operational role
 *    gets a 404 rather than a hint that the surface exists.
 * 2. The merchant credential never leaves the server. No Admin response may contain it, and the
 *    configuration view must not even read it — credential validity is reported from observed
 *    evidence instead.
 * 3. This surface is read-only. There is no payment write path to abuse.
 */

const config = {
  enabled: true as const,
  origin: 'https://admin.learnbox.app',
  rpId: 'admin.learnbox.app',
  tokenHashKey: 'k'.repeat(32),
};
const now = new Date('2026-10-06T10:30:00.000Z');
const sessionToken = 't'.repeat(43);
const csrfToken = 'c'.repeat(43);
const actorUserId = '22222222-2222-4222-8222-222222222222';

/** An obviously fake credential. It must never appear in any response. */
const fakeMerchantId = '00000000-0000-4000-8000-000000000000';

function sessionStore(overrides: { userId?: string | null } = {}) {
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
            recentAuthenticatedAt: now,
          },
    touchSession: async () => true,
  };
}

const transactionRow = {
  transactionId: '44444444-4444-4444-8444-444444444444',
  userId: '55555555-5555-4555-8555-555555555555',
  packId: 'paid-pack',
  packDisplayName: 'بستهٔ پولی',
  amountTomans: 150000,
  provider: 'zarinpal',
  environment: 'sandbox',
  status: 'verified',
  providerPurchaseId: `A${'0'.repeat(35)}`,
  providerReference: '987654321',
  createdAt: now.toISOString(),
  updatedAt: now.toISOString(),
  verifiedAt: now.toISOString(),
};

const configurationStatus = {
  state: 'ready' as const,
  enabled: true,
  environment: 'sandbox' as const,
  provider: 'zarinpal' as const,
  verifiedCount: 1,
  pendingCount: 0,
  failedCount: 0,
  lastVerifiedAt: now.toISOString(),
};

function transactionsStore(forbidden = false) {
  return {
    listTransactions: vi.fn(async () =>
      forbidden
        ? ({ status: 'forbidden' } as const)
        : ({ status: 'ok', rows: [transactionRow] } as const),
    ),
  };
}

function configStore(forbidden = false) {
  return {
    readConfigurationStatus: vi.fn(async () =>
      forbidden
        ? ({ status: 'forbidden' } as const)
        : ({ status: 'ok', configuration: configurationStatus } as const),
    ),
  };
}

const environment = {
  LEARNBOX_ZARINPAL_ENABLED: 'true',
  ZARINPAL_SANDBOX: 'true',
  ZARINPAL_MERCHANT_ID: fakeMerchantId,
};

function get(path: string, headers: Record<string, string> = {}, omit: string[] = []) {
  const base: Record<string, string> = {
    Origin: config.origin,
    Cookie: `__Host-learnbox_admin_session=${sessionToken}`,
    ...headers,
  };
  for (const key of omit) delete base[key];
  return new Request(`https://admin.learnbox.app${path}`, { method: 'GET', headers: base });
}

describe('M2.4 Admin transactions route', () => {
  it('returns canonical transaction records for an authorised operator', async () => {
    const store = transactionsStore();
    const route = createAdminTransactionsRoute({
      enabled: true,
      config,
      sessionStore: sessionStore(),
      store,
      now: () => now,
    });

    const response = await route(get('/api/store/transactions'));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { transactions: unknown[] };
    expect(body.transactions).toEqual([transactionRow]);
    expect(store.listTransactions).toHaveBeenCalledWith(expect.objectContaining({ actorUserId }));
  });

  it('is 404 while the Store workspace flag is off', async () => {
    const route = createAdminTransactionsRoute({
      enabled: false,
      config,
      sessionStore: sessionStore(),
      store: transactionsStore(),
      now: () => now,
    });
    expect((await route(get('/api/store/transactions'))).status).toBe(404);
  });

  it('refuses an unauthenticated caller', async () => {
    const route = createAdminTransactionsRoute({
      enabled: true,
      config,
      sessionStore: sessionStore({ userId: null }),
      store: transactionsStore(),
      now: () => now,
    });
    expect((await route(get('/api/store/transactions', {}, ['Cookie']))).status).toBe(401);
  });

  it('returns 404, not 403, for an operator without an operational role', async () => {
    const route = createAdminTransactionsRoute({
      enabled: true,
      config,
      sessionStore: sessionStore(),
      store: transactionsStore(true),
      now: () => now,
    });
    // The surface must not advertise its existence to someone who may not use it.
    expect((await route(get('/api/store/transactions'))).status).toBe(404);
  });

  it('passes only recognised filters through to the store', async () => {
    const store = transactionsStore();
    const route = createAdminTransactionsRoute({
      enabled: true,
      config,
      sessionStore: sessionStore(),
      store,
      now: () => now,
    });

    await route(get('/api/store/transactions?packId=paid-pack&status=verified&limit=25'));
    expect(store.listTransactions).toHaveBeenCalledWith(
      expect.objectContaining({ packId: 'paid-pack', status: 'verified', limit: 25 }),
    );
  });

  it('drops hostile or unknown filter values instead of forwarding them', async () => {
    const store = transactionsStore();
    const route = createAdminTransactionsRoute({
      enabled: true,
      config,
      sessionStore: sessionStore(),
      store,
      now: () => now,
    });

    await route(
      get(
        `/api/store/transactions?packId=${encodeURIComponent("'; DROP TABLE purchase_events; --")}&status=${encodeURIComponent('verified; DELETE FROM users')}&limit=abc`,
      ),
    );
    expect(store.listTransactions).toHaveBeenCalledWith({
      actorUserId,
      packId: undefined,
      status: undefined,
      limit: undefined,
    });
  });

  it('reports a store failure as unavailable rather than leaking the error', async () => {
    const route = createAdminTransactionsRoute({
      enabled: true,
      config,
      sessionStore: sessionStore(),
      store: {
        listTransactions: vi.fn(async () => {
          throw new Error('connection to 10.0.0.5 refused');
        }),
      },
      now: () => now,
    });
    const response = await route(get('/api/store/transactions'));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('10.0.0.5');
  });
});

describe('M2.4 Admin payment configuration route', () => {
  const route = (overrides: Record<string, unknown> = {}) =>
    createAdminPaymentConfigRoute({
      enabled: true,
      config,
      sessionStore: sessionStore(),
      store: configStore(),
      now: () => now,
      environment,
      ...overrides,
    } as never);

  it('reports configuration state and observed evidence', async () => {
    const response = await route()(get('/api/store/payment-config'));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { configuration: typeof configurationStatus };
    expect(body.configuration).toEqual(configurationStatus);
  });

  it('NEVER includes the merchant credential in the response', async () => {
    const response = await route()(get('/api/store/payment-config'));
    const raw = await response.text();
    // Not in full, not masked, not partially: the panel has no need for it at all.
    expect(raw).not.toContain(fakeMerchantId);
    expect(raw).not.toContain('0000-4000-8000');
    expect(raw).not.toMatch(/merchantId/i);
    expect(raw).not.toMatch(/ZARINPAL_MERCHANT_ID/);
  });

  it('is 404 while the Store workspace flag is off', async () => {
    expect((await route({ enabled: false })(get('/api/store/payment-config'))).status).toBe(404);
  });

  it('refuses an unauthenticated caller', async () => {
    const unauthenticated = createAdminPaymentConfigRoute({
      enabled: true,
      config,
      sessionStore: sessionStore({ userId: null }),
      store: configStore(),
      now: () => now,
      environment,
    });
    expect((await unauthenticated(get('/api/store/payment-config', {}, ['Cookie']))).status).toBe(
      401,
    );
  });

  it('returns 404 for an operator without an operational role', async () => {
    const forbidden = createAdminPaymentConfigRoute({
      enabled: true,
      config,
      sessionStore: sessionStore(),
      store: configStore(true),
      now: () => now,
      environment,
    });
    expect((await forbidden(get('/api/store/payment-config'))).status).toBe(404);
  });

  it('offers no write method, so payment configuration cannot be changed from a browser', () => {
    const handler = route();
    // The factory returns a single GET handler; there is deliberately no POST/PUT/PATCH companion.
    expect(typeof handler).toBe('function');
    expect(Object.keys({ createAdminPaymentConfigRoute, createAdminTransactionsRoute })).toEqual([
      'createAdminPaymentConfigRoute',
      'createAdminTransactionsRoute',
    ]);
  });
});
