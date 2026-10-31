import { createHash } from 'node:crypto';

type QueryResult = { rows: Record<string, unknown>[] };
type Queryable = {
  query(sql: string, parameters?: readonly unknown[]): Promise<QueryResult>;
};
type Client = Queryable & { release(): void };
type DatabasePool = { connect(): Promise<Client> };

/** Reading the commercial catalogue is an editorial capability. */
const readerRoles = ['content_reviewer', 'content_publisher', 'super_admin'] as const;

export type BazaarCatalogItem = {
  productId: string;
  title: string;
  description: string;
  /** Bazaar prices are Rials; LearnBox's canonical price is Tomans. */
  priceRials: number;
};

/** Writing provider SKU mappings is a publishing capability (same as Myket sync). */
const publisherRoles = ['content_publisher', 'super_admin'] as const;

export type BazaarCatalogConfirmResult =
  { status: 'confirmed'; count: number } | { status: 'forbidden' };

export type BazaarCatalogExportResult =
  { status: 'ok'; items: BazaarCatalogItem[] } | { status: 'forbidden' };

function text(value: unknown): string {
  return value === null || value === undefined ? '' : String(value).trim();
}

/**
 * Bazaar accepts lowercase `[a-z0-9_.]` product ids. The hash keeps a truncated pack slug stable
 * and collision-resistant, so the same canonical pack produces the same CSV row on every export.
 */
export function bazaarProductIdForPack(packId: string): string {
  const normalized = packId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 72);
  const stem = normalized || 'pack';
  const suffix = createHash('sha256')
    .update(`learnbox.bazaar:${packId}`)
    .digest('hex')
    .slice(0, 16);
  return `learnbox.${stem}.${suffix}`;
}

export function cafeBazaarCsv(items: readonly BazaarCatalogItem[]): string {
  const escape = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
  const rows = [
    ['product_id', 'title', 'description', 'status', 'price'].map(escape).join(','),
    ...items.map((item) =>
      [item.productId, item.title, item.description, 'unpublished', item.priceRials]
        .map(escape)
        .join(','),
    ),
  ];
  return `\uFEFF${rows.join('\r\n')}\r\n`;
}

/** Paid, published and listed packs: the one definition of "sellable in a store". */
export async function sellablePacks(
  client: Queryable,
): Promise<Array<{ packId: string; priceTomans: number; item: BazaarCatalogItem }>> {
  const result = await client.query(
    `SELECT p.id AS pack_id, p.display_name, s.commercial_summary, p.price_tomans
       FROM packs p
       INNER JOIN store_listings s ON s.pack_id = p.id
      WHERE p.status = 'published'
        AND p.is_free = false
        AND p.price_tomans > 0
        AND s.store_status = 'listed'
      ORDER BY s.featured DESC, s.display_order, p.id`,
  );
  return result.rows.map((row) => {
    const packId = text(row.pack_id);
    const title = text(row.display_name);
    const summary = text(row.commercial_summary);
    const priceTomans = Number(row.price_tomans);
    return {
      packId,
      priceTomans,
      item: {
        productId: bazaarProductIdForPack(packId),
        title,
        description: summary || `بستهٔ یادگیری LearnBox: ${title}`,
        priceRials: priceTomans * 10,
      },
    };
  });
}

/**
 * Read-only Bazaar catalogue export. It intentionally reads no provider credentials and writes no
 * SKU mapping: the CSV is an owner-reviewed import artifact, not a checkout activation.
 */
export class PostgresBazaarCatalogExportStore {
  constructor(private readonly pool: DatabasePool) {}

  private async hasRole(client: Queryable, actorUserId: string): Promise<boolean> {
    const result = await client.query(
      `SELECT role FROM admin_role_assignments WHERE user_id = $1 AND role = ANY($2::admin_role[])`,
      [actorUserId, readerRoles],
    );
    return result.rows.length > 0;
  }

  private sellable(client: Queryable) {
    return sellablePacks(client);
  }

  /**
   * The owner confirms they imported the CURRENT CSV into Bazaar's panel. Bazaar has no product
   * API, so this confirmation is what makes those packs purchasable through Bazaar: it records
   * each pack's product id and the price that was exported. Learner checkout still requires the
   * separately-gated website verifier. Re-running with the same idempotency key is a no-op.
   */
  async confirmCatalog(input: {
    actorUserId: string;
    idempotencyKey: string;
  }): Promise<BazaarCatalogConfirmResult> {
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
        `SELECT metadata->>'count' AS count FROM audit_logs
          WHERE action = 'store_iab_catalog.bazaar_confirm' AND metadata->>'idempotency_key' = $1
          LIMIT 1`,
        [input.idempotencyKey],
      );
      if (prior.rows[0]) {
        await client.query('COMMIT');
        return { status: 'confirmed', count: Number(prior.rows[0].count) };
      }
      const packs = await this.sellable(client);
      for (const pack of packs) {
        await client.query(
          `INSERT INTO store_iab_catalog_items (provider, pack_id, sku_id, synced_price_tomans)
           VALUES ('cafe_bazaar', $1, $2, $3)
           ON CONFLICT (provider, pack_id) DO UPDATE SET
             sku_id = EXCLUDED.sku_id,
             synced_price_tomans = EXCLUDED.synced_price_tomans,
             synced_at = now()`,
          [pack.packId, pack.item.productId, pack.priceTomans],
        );
      }
      await client.query(
        `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
         VALUES ($1, 'store_iab_catalog.bazaar_confirm', 'store_iab_catalog', $1, $2)`,
        [
          input.actorUserId,
          {
            idempotency_key: input.idempotencyKey,
            count: packs.length,
            items: packs.map((pack) => ({
              pack_id: pack.packId,
              sku_id: pack.item.productId,
              price_tomans: pack.priceTomans,
            })),
          },
        ],
      );
      await client.query('COMMIT');
      return { status: 'confirmed', count: packs.length };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async exportCatalog(input: { actorUserId: string }): Promise<BazaarCatalogExportResult> {
    const client = await this.pool.connect();
    try {
      if (!(await this.hasRole(client, input.actorUserId))) return { status: 'forbidden' };
      return { status: 'ok', items: (await this.sellable(client)).map(({ item }) => item) };
    } finally {
      client.release();
    }
  }
}
