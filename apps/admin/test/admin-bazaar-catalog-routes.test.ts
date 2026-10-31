import { describe, expect, it, vi } from 'vitest';

import {
  createCafeBazaarCatalogConfirmRoute,
  createCafeBazaarCatalogExportRoute,
} from '../lib/server/admin-bazaar-catalog-routes';
import {
  bazaarProductIdForPack,
  cafeBazaarCsv,
  PostgresBazaarCatalogExportStore,
} from '../lib/server/postgres-bazaar-catalog-export-store';
import { hashAdminSecret } from '../lib/server/admin-session';

const now = new Date('2026-10-31T12:00:00.000Z');
const sessionToken = 't'.repeat(43);
const csrfToken = 'c'.repeat(43);
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
        userId: '22222222-2222-4222-8222-222222222222',
        csrfHash: hashAdminSecret(csrfToken, config.tokenHashKey),
        lastSeenAt: now,
        absoluteExpiresAt: new Date(now.getTime() + 60_000),
        revokedAt: null,
        recentAuthenticatedAt: now,
      }),
      touchSession: async () => true,
    },
    store: {
      exportCatalog: vi.fn(async () => ({
        status: 'ok' as const,
        items: [
          {
            productId: bazaarProductIdForPack('first-30-days-in-germany-a1'),
            title: '۳۰ روز اول در آلمان',
            description: 'آمادگی برای زندگی روزمره',
            priceRials: 250_000,
          },
        ],
      })),
      confirmCatalog: vi.fn(async () => ({ status: 'confirmed' as const, count: 1 })),
    },
  };
}

function request(cookie = true) {
  return new Request('https://admin.learnbox.app/api/store/bazaar/catalog', {
    headers: cookie ? { Cookie: `__Host-learnbox_admin_session=${sessionToken}` } : {},
  });
}

describe('Cafe Bazaar catalog export', () => {
  it('is absent when the Store feature gate is off', async () => {
    const deps = dependencies(false);
    const response = await createCafeBazaarCatalogExportRoute(deps)(request());
    expect(response.status).toBe(404);
    expect(deps.store.exportCatalog).not.toHaveBeenCalled();
  });

  it('requires an authenticated Admin session', async () => {
    const deps = dependencies();
    const response = await createCafeBazaarCatalogExportRoute(deps)(request(false));
    expect(response.status).toBe(401);
    expect(deps.store.exportCatalog).not.toHaveBeenCalled();
  });

  it('returns only a downloadable CSV artifact and does not mutate catalog state', async () => {
    const deps = dependencies();
    const response = await createCafeBazaarCatalogExportRoute(deps)(request());
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
    expect(response.headers.get('Content-Disposition')).toContain(
      'learnbox-cafe-bazaar-catalog.csv',
    );
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    await expect(response.text()).resolves.toContain(
      '"product_id","title","description","status","price"',
    );
    expect(deps.store.exportCatalog).toHaveBeenCalledWith({
      actorUserId: '22222222-2222-4222-8222-222222222222',
    });
  });

  it('uses stable Bazaar-safe product ids and RFC4180-safe CSV quoting', () => {
    const productId = bazaarProductIdForPack('First 30 Days / Germany A1');
    expect(productId).toMatch(/^learnbox\.[a-z0-9.]+\.[a-f0-9]{16}$/);
    expect(productId).toBe(bazaarProductIdForPack('First 30 Days / Germany A1'));
    expect(
      cafeBazaarCsv([
        { productId, title: 'یک "عنوان"', description: 'خط اول, خط دوم', priceRials: 10 },
      ]),
    ).toContain('"یک ""عنوان""","خط اول, خط دوم","unpublished","10"');
  });

  it('reads only canonical paid, published and listed packs', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ role: 'content_publisher' }] })
      .mockResolvedValueOnce({
        rows: [
          {
            pack_id: 'first-30-days-in-germany-a1',
            display_name: '۳۰ روز اول در آلمان',
            commercial_summary: null,
            price_tomans: 25_000,
          },
        ],
      });
    const release = vi.fn();
    const store = new PostgresBazaarCatalogExportStore({
      connect: async () => ({ query, release }),
    });

    await expect(
      store.exportCatalog({ actorUserId: '22222222-2222-4222-8222-222222222222' }),
    ).resolves.toEqual({
      status: 'ok',
      items: [
        {
          productId: bazaarProductIdForPack('first-30-days-in-germany-a1'),
          title: '۳۰ روز اول در آلمان',
          description: 'بستهٔ یادگیری LearnBox: ۳۰ روز اول در آلمان',
          priceRials: 250_000,
        },
      ],
    });
    expect(query.mock.calls[1][0]).toContain("p.status = 'published'");
    expect(query.mock.calls[1][0]).toContain('p.is_free = false');
    expect(query.mock.calls[1][0]).toContain('p.price_tomans > 0');
    expect(query.mock.calls[1][0]).toContain("s.store_status = 'listed'");
    expect(release).toHaveBeenCalledOnce();
  });

  describe('confirm (POST)', () => {
    const post = (headers: Record<string, string> = {}) =>
      new Request('https://admin.learnbox.app/api/store/bazaar/catalog', {
        method: 'POST',
        headers: {
          Origin: config.origin,
          'Content-Type': 'application/json',
          'x-learnbox-csrf-token': csrfToken,
          Cookie: `__Host-learnbox_admin_session=${sessionToken}`,
          'Idempotency-Key': '33333333-3333-4333-8333-333333333333',
          ...headers,
        },
        body: '{}',
      });

    it('refuses bad CSRF, foreign origin and missing idempotency before touching the store', async () => {
      for (const headers of <Array<Record<string, string>>>[
        { 'x-learnbox-csrf-token': 'wrong' },
        { Origin: 'https://evil.example' },
        { 'Idempotency-Key': '' },
      ]) {
        const deps = dependencies();
        const response = await createCafeBazaarCatalogConfirmRoute(deps)(post(headers));
        expect(response.status).toBe(400);
        expect(deps.store.confirmCatalog).not.toHaveBeenCalled();
      }
    });

    it('records the mappings after the full gate', async () => {
      const deps = dependencies();
      const response = await createCafeBazaarCatalogConfirmRoute(deps)(post());
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ status: 'confirmed', count: 1 });
      expect(deps.store.confirmCatalog).toHaveBeenCalledWith({
        actorUserId: '22222222-2222-4222-8222-222222222222',
        idempotencyKey: '33333333-3333-4333-8333-333333333333',
      });
    });

    it('upserts cafe_bazaar rows with the exported product id and price, then audits', async () => {
      const query = vi.fn<
        (
          sql: string,
          parameters?: readonly unknown[],
        ) => Promise<{ rows: Record<string, unknown>[] }>
      >(async (sql) => {
        if (sql.includes('admin_role_assignments')) return { rows: [{}] };
        if (sql.includes('FROM packs'))
          return {
            rows: [
              {
                pack_id: 'paid-a',
                display_name: 'A',
                commercial_summary: '',
                price_tomans: 25_000,
              },
            ],
          };
        return { rows: [] };
      });
      const store = new PostgresBazaarCatalogExportStore({
        connect: async () => ({ query, release: vi.fn() }),
      });
      await expect(
        store.confirmCatalog({
          actorUserId: '22222222-2222-4222-8222-222222222222',
          idempotencyKey: '33333333-3333-4333-8333-333333333333',
        }),
      ).resolves.toEqual({ status: 'confirmed', count: 1 });
      const upsert = query.mock.calls.find(([sql]) => sql.includes('store_iab_catalog_items'))!;
      expect(upsert[0]).toContain("'cafe_bazaar'");
      expect(upsert[1]).toEqual(['paid-a', bazaarProductIdForPack('paid-a'), 25_000]);
      expect(query.mock.calls.at(-1)![0]).toBe('COMMIT');
    });

    it('a non-publisher is refused and nothing is written', async () => {
      const query = vi.fn<(sql: string) => Promise<{ rows: Record<string, unknown>[] }>>(
        async () => ({ rows: [] }),
      );
      const store = new PostgresBazaarCatalogExportStore({
        connect: async () => ({ query, release: vi.fn() }),
      });
      await expect(
        store.confirmCatalog({ actorUserId: 'x', idempotencyKey: 'y' }),
      ).resolves.toEqual({ status: 'forbidden' });
      expect(query.mock.calls.map(([sql]) => sql)).not.toContainEqual(
        expect.stringContaining('INSERT'),
      );
    });
  });
});
