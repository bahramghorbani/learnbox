import { describe, expect, it } from 'vitest';

import { createPackPriceRoute } from '../lib/server/admin-pack-price-routes';
import { hashAdminSecret } from '../lib/server/admin-session';

const config = {
  enabled: true as const,
  origin: 'https://admin.learnbox.app',
  rpId: 'admin.learnbox.app',
  tokenHashKey: 'k'.repeat(32),
};
const now = new Date('2026-10-05T10:30:00.000Z');
const token = 't'.repeat(43);
const csrf = 'c'.repeat(43);
const actor = '22222222-2222-4222-8222-222222222222';
const key = '11111111-1111-4111-8111-111111111111';

function sessions(recent = true) {
  return {
    findActiveSession: async () => ({
      userId: actor,
      csrfHash: hashAdminSecret(csrf, config.tokenHashKey),
      lastSeenAt: now,
      absoluteExpiresAt: new Date(now.getTime() + 60_000),
      revokedAt: null,
      recentAuthenticatedAt: recent ? now : new Date(now.getTime() - 600_000),
    }),
    touchSession: async () => true,
  };
}

function request(body: unknown, options: { origin?: string; csrf?: string; key?: string } = {}) {
  return new Request('https://admin.learnbox.app/api/content/packs/test-pack/price', {
    method: 'POST',
    headers: {
      origin: options.origin ?? config.origin,
      'content-type': 'application/json',
      cookie: `__Host-learnbox_admin_session=${token}`,
      'x-learnbox-csrf-token': options.csrf ?? csrf,
      'idempotency-key': options.key ?? key,
    },
    body: JSON.stringify(body),
  });
}

const params = { params: Promise.resolve({ packId: 'test-pack' }) };

describe('pack price route', () => {
  it('runs the mutation guard chain before the price store', async () => {
    let called = false;
    const route = createPackPriceRoute({
      enabled: true,
      config,
      sessionStore: sessions(),
      store: {
        setPrice: async () => {
          called = true;
          return { status: 'applied' as const, priceTomans: 50000 };
        },
      },
      now: () => now,
    });
    expect(
      (await route(request({ priceTomans: 50000 }, { origin: 'https://evil.example' }), params))
        .status,
    ).toBe(400);
    expect((await route(request({ priceTomans: 50000 }, { csrf: 'x' }), params)).status).toBe(400);
    expect((await route(request({ priceTomans: 50000 }, { key: 'bad' }), params)).status).toBe(400);
    expect(called).toBe(false);
  });

  it('requires recent authentication and maps validation, role, and sale locks', async () => {
    const stale = createPackPriceRoute({
      enabled: true,
      config,
      sessionStore: sessions(false),
      store: { setPrice: async () => ({ status: 'applied' as const, priceTomans: 1 }) },
      now: () => now,
    });
    expect((await stale(request({ priceTomans: 1 }), params)).status).toBe(428);
    for (const [status, expected] of [
      ['invalid', 422],
      ['forbidden', 403],
      ['locked', 409],
    ] as const) {
      const route = createPackPriceRoute({
        enabled: true,
        config,
        sessionStore: sessions(),
        store: { setPrice: async () => ({ status }) },
        now: () => now,
      });
      expect((await route(request({ priceTomans: 50000 }), params)).status).toBe(expected);
    }
  });
});
