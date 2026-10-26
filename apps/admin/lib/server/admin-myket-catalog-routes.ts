import { createHash } from 'node:crypto';

import {
  assertTrustedAdminMutation,
  type AdminAuthConfig,
  type EnabledAdminAuthConfig,
} from './admin-auth-policy';
import { loadAdminSession, verifyAdminCsrf } from './admin-route-security';
import type { MyketCatalogClient } from './myket-catalog-client';

type QueryResult = { rows: Record<string, unknown>[] };
type Queryable = { query(sql: string, parameters?: readonly unknown[]): Promise<QueryResult> };
type Client = Queryable & { release(): void };
type DatabasePool = { connect(): Promise<Client> };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const packIdPattern = /^[a-z0-9][a-z0-9-]{1,119}$/;
const publisherRoles = ['content_publisher', 'super_admin'] as const;

export type MyketCatalogSyncResult =
  | { status: 'created' | 'updated'; skuId: string; syncedPriceTomans: number }
  | { status: 'not_eligible' }
  | { status: 'forbidden' }
  | { status: 'not_found' };

/** Stable, provider-safe identifier. The hash prevents truncation collisions for long pack ids. */
export function myketSkuForPack(packId: string): string {
  const stem = packId.toUpperCase().replaceAll('-', '_').slice(0, 82);
  const suffix = createHash('sha256').update(packId).digest('hex').slice(0, 12).toUpperCase();
  return `LBP_${stem}_${suffix}`;
}

function surrogateUuid(value: string): string {
  const digest = createHash('sha256').update(`learnbox.pack:${value}`).digest('hex');
  return [
    digest.slice(0, 8),
    digest.slice(8, 12),
    `5${digest.slice(13, 16)}`,
    ((parseInt(digest.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, '0') +
      digest.slice(18, 20),
    digest.slice(20, 32),
  ].join('-');
}

async function hasPublisherRole(client: Queryable, actorUserId: string): Promise<boolean> {
  const result = await client.query(
    `SELECT 1 FROM admin_role_assignments WHERE user_id = $1 AND role = ANY($2::admin_role[])`,
    [actorUserId, publisherRoles],
  );
  return result.rows.length > 0;
}

/**
 * Synchronizes one canonical, sellable pack to Myket and then records its provider SKU mapping.
 *
 * The remote call intentionally runs before the local mapping write. If it fails, local catalog
 * state remains untouched. The deterministic SKU plus Myket list-then-create/update makes a retry
 * safe after an interrupted request. New SKUs start inactive; an existing Myket activation state is
 * preserved. Sync never makes an activation decision.
 */
export class MyketCatalogSyncStore {
  constructor(
    private readonly pool: DatabasePool,
    private readonly client: MyketCatalogClient,
  ) {}

  async sync(input: {
    actorUserId: string;
    packId: string;
    idempotencyKey: string;
  }): Promise<MyketCatalogSyncResult> {
    if (!packIdPattern.test(input.packId) || !uuidPattern.test(input.idempotencyKey))
      return { status: 'forbidden' };

    const reader = await this.pool.connect();
    let pack: Record<string, unknown> | undefined;
    try {
      if (!(await hasPublisherRole(reader, input.actorUserId))) return { status: 'forbidden' };
      const prior = await reader.query(
        `SELECT 1 FROM audit_logs WHERE action = 'store_iab_catalog.myket_sync'
           AND metadata->>'idempotency_key' = $1 LIMIT 1`,
        [input.idempotencyKey],
      );
      if (prior.rows.length > 0) {
        const mapped = await reader.query(
          `SELECT sku_id, synced_price_tomans FROM store_iab_catalog_items
            WHERE provider = 'myket' AND pack_id = $1`,
          [input.packId],
        );
        const current = mapped.rows[0];
        if (current)
          return {
            status: 'updated',
            skuId: String(current.sku_id),
            syncedPriceTomans: Number(current.synced_price_tomans),
          };
      }
      const result = await reader.query(
        `SELECT p.id, p.display_name, p.price_tomans, p.is_free, p.status, s.store_status
           FROM packs p LEFT JOIN store_listings s ON s.pack_id = p.id
          WHERE p.id = $1`,
        [input.packId],
      );
      pack = result.rows[0];
      if (!pack) return { status: 'not_found' };
      if (
        pack.is_free === true ||
        pack.status !== 'published' ||
        pack.store_status !== 'listed' ||
        !Number.isSafeInteger(pack.price_tomans) ||
        Number(pack.price_tomans) <= 0
      )
        return { status: 'not_eligible' };
    } finally {
      reader.release();
    }

    const skuId = myketSkuForPack(input.packId);
    const priceTomans = Number(pack.price_tomans);
    // Myket accepts IRR. Conversion occurs exactly at this provider boundary.
    const remoteStatus = await this.client.syncProduct({
      skuId,
      farsiTitle: String(pack.display_name).slice(0, 150),
      englishTitle: `LearnBox ${input.packId}`.slice(0, 150),
      priceRials: priceTomans * 10,
      isActive: false,
    });

    const writer = await this.pool.connect();
    try {
      await writer.query('BEGIN');
      if (!(await hasPublisherRole(writer, input.actorUserId))) {
        await writer.query('ROLLBACK');
        return { status: 'forbidden' };
      }
      const already = await writer.query(
        `SELECT 1 FROM audit_logs WHERE action = 'store_iab_catalog.myket_sync'
           AND metadata->>'idempotency_key' = $1 LIMIT 1`,
        [input.idempotencyKey],
      );
      if (already.rows.length > 0) {
        await writer.query('COMMIT');
        return { status: 'updated', skuId, syncedPriceTomans: priceTomans };
      }
      await writer.query(
        `INSERT INTO store_iab_catalog_items (provider, pack_id, sku_id, synced_price_tomans)
         VALUES ('myket', $1, $2, $3)
         ON CONFLICT (provider, pack_id) DO UPDATE SET
           sku_id = EXCLUDED.sku_id,
           synced_price_tomans = EXCLUDED.synced_price_tomans,
           synced_at = now()`,
        [input.packId, skuId, priceTomans],
      );
      await writer.query(
        `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
         VALUES ($1, 'store_iab_catalog.myket_sync', 'store_iab_catalog_item', $2, $3)`,
        [
          input.actorUserId,
          surrogateUuid(input.packId),
          {
            pack_id: input.packId,
            sku_id: skuId,
            price_tomans: priceTomans,
            idempotency_key: input.idempotencyKey,
            myket_product_active: false,
          },
        ],
      );
      await writer.query('COMMIT');
      return { status: remoteStatus, skuId, syncedPriceTomans: priceTomans };
    } catch (error) {
      await writer.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      writer.release();
    }
  }
}

type Dependencies = {
  enabled: boolean;
  config: AdminAuthConfig;
  sessionStore?: Parameters<typeof loadAdminSession>[2];
  store?: Pick<MyketCatalogSyncStore, 'sync'>;
  now?: () => Date;
};

function response(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

/** Full Admin mutation gate: trusted origin/type, passkey session, CSRF, fresh auth, idempotency. */
export function createMyketCatalogSyncRoute(dependencies: Dependencies) {
  return async function POST(request: Request) {
    if (
      !dependencies.enabled ||
      !dependencies.config.enabled ||
      !dependencies.sessionStore ||
      !dependencies.store
    ) {
      return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
    }
    const config: EnabledAdminAuthConfig = dependencies.config;
    try {
      assertTrustedAdminMutation(request, config, ['application/json']);
    } catch {
      return new Response('Invalid request', {
        status: 400,
        headers: { 'Cache-Control': 'no-store' },
      });
    }
    const session = await loadAdminSession(
      request,
      config,
      dependencies.sessionStore,
      (dependencies.now ?? (() => new Date()))(),
    );
    if (!session)
      return new Response('Unauthorized', {
        status: 401,
        headers: { 'Cache-Control': 'no-store' },
      });
    try {
      verifyAdminCsrf(request, session.csrfHash, config);
    } catch {
      return new Response('Invalid request', {
        status: 400,
        headers: { 'Cache-Control': 'no-store' },
      });
    }
    if (!session.recent) return response({ code: 'reauthentication_required' }, 428);
    const key = request.headers.get('idempotency-key');
    if (!key || !uuidPattern.test(key))
      return new Response('Invalid request', {
        status: 400,
        headers: { 'Cache-Control': 'no-store' },
      });
    const body = (await request.json().catch(() => undefined)) as { packId?: unknown } | undefined;
    if (!body || typeof body.packId !== 'string' || !packIdPattern.test(body.packId)) {
      return new Response('Invalid request', {
        status: 400,
        headers: { 'Cache-Control': 'no-store' },
      });
    }
    try {
      const result = await dependencies.store.sync({
        actorUserId: session.userId,
        packId: body.packId,
        idempotencyKey: key,
      });
      if (result.status === 'forbidden' || result.status === 'not_found')
        return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
      if (result.status === 'not_eligible') return response({ code: 'pack_not_sellable' }, 409);
      return response(result);
    } catch {
      return response({ code: 'myket_catalog_unavailable' }, 502);
    }
  };
}
