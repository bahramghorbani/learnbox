import { createHash } from 'node:crypto';

type QueryResult = { rows: Record<string, unknown>[] };
type Queryable = {
  query(sql: string, parameters?: readonly unknown[]): Promise<QueryResult>;
};
type Client = Queryable & { release(): void };
type DatabasePool = Queryable & { connect(): Promise<Client> };

const canonicalUuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Reading the commercial catalogue is an editorial capability. */
const readerRoles = ['content_reviewer', 'content_publisher', 'super_admin'] as const;
/**
 * Changing commercial availability is a release action, so it needs the same role that may publish
 * content. Listing a pack is the commercial equivalent of making it available, and must never be
 * easier to trigger than publishing it.
 */
const publisherRoles = ['content_publisher', 'super_admin'] as const;

export type StoreStatus = 'unlisted' | 'listed';

export function isStoreStatus(value: unknown): value is StoreStatus {
  return value === 'unlisted' || value === 'listed';
}

/**
 * One row of the Admin Store table: the canonical pack facts an operator needs in order to make a
 * commercial decision, plus the listing itself.
 *
 * The pack fields are READ-ONLY here by construction — this store never writes them. They are
 * reported so the operator can see the price and content state they are listing against without
 * the Store having to keep its own copy.
 */
export type StoreListingRow = {
  packId: string;
  packDisplayName: string;
  packStatus: string;
  /** Canonical on `packs`, surfaced for context. Not owned by the listing. */
  category: string | null;
  isFree: boolean;
  priceTomans: number | null;
  /** Null when the pack has no listing at all, i.e. it is not in the Store. */
  listing:
    | {
        storeStatus: StoreStatus;
        featured: boolean;
        displayOrder: number;
        coverObjectKey: string | null;
        commercialSummary: string | null;
        listedAt: string | null;
      }
    | undefined;
};

export type StoreListingUpsert = {
  packId: string;
  storeStatus: StoreStatus;
  featured: boolean;
  displayOrder: number;
  coverObjectKey: string | null;
  commercialSummary: string | null;
  /** Optimistic concurrency: when present it must match the stored status, or the write is stale. */
  expectedStoreStatus?: StoreStatus | 'absent';
  actorUserId: string;
  idempotencyKey: string;
};

export type ListStoreListingsResult =
  { status: 'ok'; rows: StoreListingRow[] } | { status: 'forbidden' };

export type UpsertStoreListingResult =
  | { status: 'applied'; row: StoreListingRow }
  | { status: 'idempotent'; row: StoreListingRow }
  | { status: 'stale'; currentStoreStatus: StoreStatus | 'absent' }
  | { status: 'forbidden' }
  | { status: 'not_found' };

/**
 * Canonical commercial-listing store (Phase 2 / M2.1).
 *
 * Invariants this class is responsible for:
 *
 *  - It writes EXACTLY ONE table: `store_listings`. It never writes `packs`, `pack_cards`, `cards`,
 *    `card_versions` or any media table, so the Store can never become a second source of truth for
 *    pack or card content. `store-content-isolation.test.ts` asserts this against this file's source.
 *  - Roles are resolved inside the transaction from `admin_role_assignments`, never from the
 *    request, mirroring the Phase 1 lifecycle store.
 *  - Every mutation is idempotent on `audit_logs.metadata.idempotency_key`, so a retried request
 *    reports the original outcome instead of re-applying a commercial change.
 *  - `listed_at` is set by the server when a listing becomes listed and preserved while it stays
 *    listed, so the "for sale since" timestamp cannot be backdated by a client.
 */
export class PostgresStoreListingsStore {
  constructor(private readonly pool: DatabasePool) {}

  private async hasRole(
    client: Queryable,
    actorUserId: string,
    roles: readonly string[],
  ): Promise<boolean> {
    const result = await client.query(
      `SELECT role FROM admin_role_assignments WHERE user_id = $1 AND role = ANY($2::admin_role[])`,
      [actorUserId, roles],
    );
    return result.rows.length > 0;
  }

  /**
   * Stable surrogate uuid for a text-keyed entity, identical to the Phase 1 stores.
   *
   * `audit_logs.entity_id` is `uuid NOT NULL` while `packs.id` is a text slug, so a listing audits
   * under a deterministic uuid derived from the slug and the slug itself is kept in
   * `metadata.pack_id`.
   */
  private static surrogateUuid(value: string): string {
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

  private async audit(
    client: Queryable,
    actorUserId: string,
    action: string,
    packId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await client.query(
      `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        actorUserId,
        action,
        'store_listing',
        PostgresStoreListingsStore.surrogateUuid(packId),
        { ...metadata, pack_id: packId },
      ],
    );
  }

  private async alreadyApplied(
    client: Queryable,
    action: string,
    idempotencyKey: string,
  ): Promise<boolean> {
    const existing = await client.query(
      `SELECT 1
         FROM audit_logs
        WHERE action = $1 AND metadata->>'idempotency_key' = $2
        LIMIT 1`,
      [action, idempotencyKey],
    );
    return existing.rows.length > 0;
  }

  private static toRow(row: Record<string, unknown>): StoreListingRow {
    const storeStatus = row.store_status;
    return {
      packId: String(row.pack_id),
      packDisplayName: String(row.display_name ?? ''),
      packStatus: String(row.pack_status ?? ''),
      category: row.category === null || row.category === undefined ? null : String(row.category),
      isFree: row.is_free === true,
      priceTomans:
        row.price_tomans === null || row.price_tomans === undefined
          ? null
          : Number(row.price_tomans),
      listing: isStoreStatus(storeStatus)
        ? {
            storeStatus,
            featured: row.featured === true,
            displayOrder: Number(row.display_order ?? 0),
            coverObjectKey:
              row.cover_object_key === null || row.cover_object_key === undefined
                ? null
                : String(row.cover_object_key),
            commercialSummary:
              row.commercial_summary === null || row.commercial_summary === undefined
                ? null
                : String(row.commercial_summary),
            listedAt:
              row.listed_at === null || row.listed_at === undefined
                ? null
                : new Date(row.listed_at as string | number | Date).toISOString(),
          }
        : undefined,
    };
  }

  /**
   * Canonical packs LEFT JOINed to their listing, so every pack appears exactly once whether or not
   * it is in the Store. The pack is the driving table — the Store has no catalogue of its own.
   */
  private static readonly selectSql = `SELECT p.id AS pack_id, p.display_name, p.status AS pack_status,
            p.category, p.is_free, p.price_tomans,
            s.store_status, s.featured, s.display_order, s.cover_object_key,
            s.commercial_summary, s.listed_at
       FROM packs p
       LEFT JOIN store_listings s ON s.pack_id = p.id`;

  private async readOne(client: Queryable, packId: string): Promise<StoreListingRow | undefined> {
    const result = await client.query(`${PostgresStoreListingsStore.selectSql} WHERE p.id = $1`, [
      packId,
    ]);
    const row = result.rows[0];
    return row ? PostgresStoreListingsStore.toRow(row) : undefined;
  }

  async listStoreListings(input: { actorUserId: string }): Promise<ListStoreListingsResult> {
    const client = await this.pool.connect();
    try {
      if (!(await this.hasRole(client, input.actorUserId, readerRoles))) {
        return { status: 'forbidden' };
      }
      const result = await client.query(
        `${PostgresStoreListingsStore.selectSql}
         ORDER BY s.featured DESC NULLS LAST, s.display_order NULLS LAST, p.id`,
      );
      return { status: 'ok', rows: result.rows.map(PostgresStoreListingsStore.toRow) };
    } finally {
      client.release();
    }
  }

  /**
   * Create or update exactly one listing. A single upsert covers listing, unlisting, featuring,
   * reordering and editing presentation, because they are all the same fact — the commercial state
   * of one pack — and splitting them into separate endpoints would let them disagree.
   */
  async upsertStoreListing(input: StoreListingUpsert): Promise<UpsertStoreListingResult> {
    if (!canonicalUuidPattern.test(input.idempotencyKey)) {
      return { status: 'forbidden' };
    }
    const action = 'store_listing.upsert';
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      if (!(await this.hasRole(client, input.actorUserId, publisherRoles))) {
        await client.query('ROLLBACK');
        return { status: 'forbidden' };
      }

      // The pack must exist and is read here only to prove it. Nothing about it is written.
      const pack = await client.query(`SELECT id FROM packs WHERE id = $1`, [input.packId]);
      if (pack.rows.length === 0) {
        await client.query('ROLLBACK');
        return { status: 'not_found' };
      }

      if (await this.alreadyApplied(client, action, input.idempotencyKey)) {
        const current = await this.readOne(client, input.packId);
        await client.query('COMMIT');
        return current ? { status: 'idempotent', row: current } : { status: 'not_found' };
      }

      const existing = await client.query(
        `SELECT store_status, listed_at FROM store_listings WHERE pack_id = $1 FOR UPDATE`,
        [input.packId],
      );
      const existingRow = existing.rows[0];
      const currentStoreStatus: StoreStatus | 'absent' = isStoreStatus(existingRow?.store_status)
        ? existingRow.store_status
        : 'absent';

      if (
        input.expectedStoreStatus !== undefined &&
        input.expectedStoreStatus !== currentStoreStatus
      ) {
        await client.query('ROLLBACK');
        return { status: 'stale', currentStoreStatus };
      }

      // Server owns the timestamp: first transition into 'listed' stamps it, staying listed keeps
      // the original, and unlisting clears it so a re-listing cannot claim the earlier date.
      const previousListedAt = existingRow?.listed_at ?? null;
      const listedAt =
        input.storeStatus === 'listed' ? (previousListedAt ?? new Date().toISOString()) : null;

      await client.query(
        `INSERT INTO store_listings
           (pack_id, store_status, featured, display_order, cover_object_key,
            commercial_summary, listed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (pack_id) DO UPDATE SET
           store_status = EXCLUDED.store_status,
           featured = EXCLUDED.featured,
           display_order = EXCLUDED.display_order,
           cover_object_key = EXCLUDED.cover_object_key,
           commercial_summary = EXCLUDED.commercial_summary,
           listed_at = EXCLUDED.listed_at`,
        [
          input.packId,
          input.storeStatus,
          input.featured,
          input.displayOrder,
          input.coverObjectKey,
          input.commercialSummary,
          listedAt,
        ],
      );

      await this.audit(client, input.actorUserId, action, input.packId, {
        idempotency_key: input.idempotencyKey,
        previous_store_status: currentStoreStatus,
        store_status: input.storeStatus,
        featured: input.featured,
        display_order: input.displayOrder,
      });

      const row = await this.readOne(client, input.packId);
      await client.query('COMMIT');
      return row ? { status: 'applied', row } : { status: 'not_found' };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}
