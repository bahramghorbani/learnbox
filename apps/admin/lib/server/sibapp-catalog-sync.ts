import { sellablePacks } from './postgres-bazaar-catalog-export-store';

type QueryResult = { rows: Record<string, unknown>[] };
type Queryable = { query(sql: string, parameters?: readonly unknown[]): Promise<QueryResult> };
type Client = Queryable & { release(): void };
type DatabasePool = { connect(): Promise<Client> };

const publisherRoles = ['content_publisher', 'super_admin'] as const;

export type SibappCatalogConfig = { secretKey: string; applicationId: string; timeoutMs?: number };

export type SibappPackage = {
  id: string;
  label: string;
  priceTomans: number;
  enabled: boolean;
  applicationId: string;
};

export type SibappCatalogSyncResult =
  | { status: 'confirmed'; count: number; missing: string[]; priceMismatch: string[] }
  | { status: 'forbidden' };

/**
 * Lists this application's in-app packages from Sibapp, server-to-server. The Secret-Key comes
 * only from Admin's environment and is never returned to a browser or audit row.
 */
export function createSibappPackageLister(
  config: SibappCatalogConfig,
  fetchImpl: typeof fetch = fetch,
) {
  return async function listPackages(): Promise<SibappPackage[]> {
    const response = await fetchImpl(
      `https://api.sibapp.net/api/v1/application/${encodeURIComponent(config.applicationId)}/package`,
      {
        headers: { 'Secret-Key': config.secretKey, accept: 'application/json' },
        signal: AbortSignal.timeout(config.timeoutMs ?? 10000),
        cache: 'no-store',
      },
    );
    if (!response.ok) throw new Error('sibapp_catalog_unavailable');
    const body = (await response.json()) as { list?: unknown };
    if (!Array.isArray(body.list)) throw new Error('sibapp_catalog_unavailable');
    return body.list.map((raw) => {
      const item = raw as Record<string, unknown>;
      const application = item.application as Record<string, unknown> | undefined;
      return {
        id: String(item.id ?? ''),
        label: String(item.label ?? ''),
        // Sibapp package prices are Tomans (same unit as LearnBox's canonical price).
        priceTomans: Number(item.price),
        enabled: item.is_enable === true,
        applicationId: String(application?.id ?? ''),
      };
    });
  };
}

/**
 * Maps every sellable LearnBox pack to the Sibapp package whose `label` is the pack id. A pack is
 * mapped only when that package belongs to this app, is enabled, and has exactly the LearnBox
 * price; anything else is reported, not written. A stale mapping whose price no longer matches is
 * already refused at checkout, so skipping it can never sell at a wrong price.
 */
export class SibappCatalogSyncStore {
  constructor(
    private readonly pool: DatabasePool,
    private readonly listPackages: () => Promise<SibappPackage[]>,
    private readonly applicationId: string,
  ) {}

  async confirmCatalog(input: {
    actorUserId: string;
    idempotencyKey: string;
  }): Promise<SibappCatalogSyncResult> {
    // Remote read first: if Sibapp is unreachable nothing local changes.
    const remote = await this.listPackages();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const role = await client.query(
        `SELECT 1 FROM admin_role_assignments WHERE user_id = $1 AND role = ANY($2::admin_role[])`,
        [input.actorUserId, publisherRoles],
      );
      if (role.rows.length === 0) {
        await client.query('ROLLBACK');
        return { status: 'forbidden' };
      }
      const prior = await client.query(
        `SELECT metadata FROM audit_logs
          WHERE action = 'store_iab_catalog.sibapp_sync' AND metadata->>'idempotency_key' = $1
          LIMIT 1`,
        [input.idempotencyKey],
      );
      if (prior.rows[0]) {
        await client.query('COMMIT');
        const m = prior.rows[0].metadata as {
          count: number;
          missing: string[];
          price_mismatch: string[];
        };
        return {
          status: 'confirmed',
          count: m.count,
          missing: m.missing,
          priceMismatch: m.price_mismatch,
        };
      }
      const mapped: Array<{ pack_id: string; sku_id: string; price_tomans: number }> = [];
      const missing: string[] = [];
      const priceMismatch: string[] = [];
      for (const pack of await sellablePacks(client)) {
        const match = remote.find(
          (item) =>
            item.label === pack.packId && item.enabled && item.applicationId === this.applicationId,
        );
        if (!match) missing.push(pack.packId);
        else if (match.priceTomans !== pack.priceTomans) priceMismatch.push(pack.packId);
        else
          mapped.push({ pack_id: pack.packId, sku_id: match.id, price_tomans: pack.priceTomans });
      }
      for (const row of mapped) {
        await client.query(
          `INSERT INTO store_iab_catalog_items (provider, pack_id, sku_id, synced_price_tomans)
           VALUES ('sibapp', $1, $2, $3)
           ON CONFLICT (provider, pack_id) DO UPDATE SET
             sku_id = EXCLUDED.sku_id,
             synced_price_tomans = EXCLUDED.synced_price_tomans,
             synced_at = now()`,
          [row.pack_id, row.sku_id, row.price_tomans],
        );
      }
      await client.query(
        `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
         VALUES ($1, 'store_iab_catalog.sibapp_sync', 'store_iab_catalog', $1, $2)`,
        [
          input.actorUserId,
          {
            idempotency_key: input.idempotencyKey,
            count: mapped.length,
            items: mapped,
            missing,
            price_mismatch: priceMismatch,
          },
        ],
      );
      await client.query('COMMIT');
      return { status: 'confirmed', count: mapped.length, missing, priceMismatch };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}
