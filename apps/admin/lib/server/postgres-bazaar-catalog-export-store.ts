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

  async exportCatalog(input: { actorUserId: string }): Promise<BazaarCatalogExportResult> {
    const client = await this.pool.connect();
    try {
      if (!(await this.hasRole(client, input.actorUserId))) return { status: 'forbidden' };
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
      return {
        status: 'ok',
        items: result.rows.map((row) => {
          const packId = text(row.pack_id);
          const title = text(row.display_name);
          const summary = text(row.commercial_summary);
          return {
            productId: bazaarProductIdForPack(packId),
            title,
            description: summary || `بستهٔ یادگیری LearnBox: ${title}`,
            priceRials: Number(row.price_tomans) * 10,
          };
        }),
      };
    } finally {
      client.release();
    }
  }
}
