import { describe, expect, it } from 'vitest';

import {
  createMyketCatalogSyncRoute,
  myketSkuForPack,
} from '../lib/server/admin-myket-catalog-routes';
import { hashAdminSecret } from '../lib/server/admin-session';

const now = new Date('2026-10-26T00:00:00.000Z');
const sessionToken = 't'.repeat(43);
const csrfToken = 'c'.repeat(43);
const actorUserId = '22222222-2222-4222-8222-222222222222';
const packId = 'paid-pack-a';
const idempotencyKey = '33333333-3333-4333-8333-333333333333';
const config = {
  enabled: true as const,
  origin: 'https://admin.learnbox.app',
  rpId: 'admin.learnbox.app',
  tokenHashKey: 'k'.repeat(32),
};

function dependencies(enabled = true) {
  return {
    enabled,
    config,
    now: () => now,
    sessionStore: {
      findActiveSession: async () => ({
        userId: actorUserId,
        csrfHash: hashAdminSecret(csrfToken, config.tokenHashKey),
        lastSeenAt: now,
        absoluteExpiresAt: new Date(now.getTime() + 60_000),
        revokedAt: null,
        recentAuthenticatedAt: now,
      }),
      touchSession: async () => true,
    },
    store: {
      sync: async () => ({
        status: 'created' as const,
        skuId: myketSkuForPack(packId),
        syncedPriceTomans: 25000,
      }),
    },
  };
}

function request(headers: Record<string, string> = {}) {
  return new Request('https://admin.learnbox.app/api/store/myket/sync', {
    method: 'POST',
    headers: {
      Origin: config.origin,
      'Content-Type': 'application/json',
      'x-learnbox-csrf-token': csrfToken,
      Cookie: `__Host-learnbox_admin_session=${sessionToken}`,
      'Idempotency-Key': idempotencyKey,
      ...headers,
    },
    body: JSON.stringify({ packId }),
  });
}

describe('Myket catalog sync Admin route', () => {
  it('is absent when its explicit gate is off', async () => {
    const response = await createMyketCatalogSyncRoute(dependencies(false))(request());
    expect(response.status).toBe(404);
  });

  it('requires CSRF before the catalog store is reached', async () => {
    const deps = dependencies();
    const response = await createMyketCatalogSyncRoute(deps)(
      request({ 'x-learnbox-csrf-token': 'wrong' }),
    );
    expect(response.status).toBe(400);
  });

  it('syncs a pack only after the full Admin mutation gate', async () => {
    const response = await createMyketCatalogSyncRoute(dependencies())(request());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: 'created',
      skuId: myketSkuForPack(packId),
    });
  });

  it('generates provider-safe stable SKU ids', () => {
    expect(myketSkuForPack(packId)).toMatch(/^LBP_[A-Z0-9_]{1,95}_[A-F0-9]{12}$/);
    expect(myketSkuForPack(packId)).toHaveLength(myketSkuForPack(packId).length);
    expect(myketSkuForPack('a'.repeat(120))).toHaveLength(99);
  });
});
