import { createHash } from 'node:crypto';

import {
  maximumActiveSlides,
  readStoredDestination,
  toStoredDestination,
  type SlideDestination,
} from './presentation-slide';

type QueryResult = { rows: Record<string, unknown>[] };
type Queryable = {
  query(sql: string, parameters?: readonly unknown[]): Promise<QueryResult>;
};
type Client = Queryable & { release(): void };
type DatabasePool = Queryable & { connect(): Promise<Client> };

const canonicalUuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/**
 * Presentation is an owner-level surface: what every learner sees on the home screen is not an
 * editorial decision about one card, so it needs the highest role rather than a content role.
 */
const presentationRoles = ['super_admin'] as const;

/**
 * One lock for every slide write, including reorders.
 *
 * The maximum-three rule is a statement about the WHOLE table, so it cannot be enforced by locking
 * the row being written: two transactions activating two different slides never touch a common row
 * and would both read "two active" and both commit. Taking one transaction-scoped advisory lock
 * before counting makes activation serial, which is what the rule requires.
 *
 * ponytail: a single global lock, not a per-slide lock. Presentation edits are rare operator
 * actions on at most a handful of rows; if slide writes ever became hot, the upgrade path is a
 * dedicated activation-slot table with a unique constraint, not a finer lock.
 */
const activationLockKey = 'presentation_slide_activation';

export type SlideRow = {
  id: string;
  title: string;
  description: string | null;
  /** Undefined when the row predates the Slider Manager and holds a destination it would reject. */
  destination: SlideDestination | undefined;
  isActive: boolean;
  sortOrder: number;
  /** True when canonical image bytes are stored for this slide. The bytes are never listed. */
  hasImage: boolean;
  /** Legacy external URL on pre-existing rows. Read-only here; the Slider Manager never writes it. */
  legacyImageUrl: string | null;
  createdAt: string | null;
};

export type SlideUpsert = {
  /** Absent means create. */
  slideId?: string;
  title: string;
  description: string | null;
  destination: SlideDestination;
  isActive: boolean;
  /** Normalized image bytes. Absent means "keep whatever the slide already has". */
  imageBytes?: Buffer;
  actorUserId: string;
  idempotencyKey: string;
};

export type UpsertSlideResult =
  | { status: 'applied'; row: SlideRow }
  | { status: 'idempotent'; row: SlideRow }
  | { status: 'forbidden' }
  | { status: 'not_found' }
  | { status: 'unknown_pack' }
  | { status: 'image_required' }
  | { status: 'active_limit_reached'; activeCount: number };

export type ReorderSlidesResult =
  | { status: 'applied'; rows: SlideRow[] }
  | { status: 'idempotent'; rows: SlideRow[] }
  | { status: 'forbidden' }
  | { status: 'invalid_order' };

export type ListSlidesResult = { status: 'ok'; rows: SlideRow[] } | { status: 'forbidden' };

export type ReadSlideImageResult =
  | { status: 'ok'; bytes: Buffer; checksum: string }
  | { status: 'forbidden' }
  | { status: 'not_found' };

/**
 * Canonical presentation-slide store (Phase 4 / M4.2).
 *
 * Invariants this class is responsible for:
 *
 *  - It writes EXACTLY ONE table: `banners`. There is no second banner model, no slide table and
 *    no separate media table — slide bytes live in `banners.image_data`, exactly as splash bytes
 *    live in `splash_versions.image_data`.
 *  - It never DELETEs. A slide is retired by deactivating it, so no history and no image is
 *    destroyed by an operator action, and the role holds no DELETE privilege.
 *  - Roles are resolved inside the transaction from `admin_role_assignments`, never from the
 *    request, mirroring every other canonical Admin store.
 *  - At most `maximumActiveSlides` rows are active, enforced under an advisory lock so the rule
 *    holds for concurrent requests and not just for the UI.
 *  - An active slide always has canonical image bytes. Deactivating never requires an image, so a
 *    pre-existing row can always be switched off.
 *  - Every mutation is idempotent on `audit_logs.metadata.idempotency_key`, so a retried request
 *    reports the original outcome instead of applying a second change.
 *  - `image_url`, `background_color`, `link_target`, `starts_at` and `ends_at` are never written.
 *    The existing Production sample banners keep their values, and M4.2 ships no scheduling.
 */
export class PostgresPresentationSlidesStore {
  constructor(private readonly pool: DatabasePool) {}

  private async hasRole(client: Queryable, actorUserId: string): Promise<boolean> {
    const result = await client.query(
      `SELECT role FROM admin_role_assignments WHERE user_id = $1 AND role = ANY($2::admin_role[])`,
      [actorUserId, presentationRoles],
    );
    return result.rows.length > 0;
  }

  /**
   * Stable surrogate uuid for a text-keyed entity, identical to the Phase 1 and Phase 2 stores.
   *
   * `audit_logs.entity_id` is `uuid NOT NULL` while `banners.id` is a text key, so a slide audits
   * under a deterministic uuid derived from its id and the id itself is kept in `metadata.banner_id`.
   */
  private static surrogateUuid(value: string): string {
    const digest = createHash('sha256').update(`learnbox.banner:${value}`).digest('hex');
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
    bannerId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await client.query(
      `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        actorUserId,
        action,
        'presentation_slide',
        PostgresPresentationSlidesStore.surrogateUuid(bannerId),
        { ...metadata, banner_id: bannerId },
      ],
    );
  }

  /**
   * The id a previous attempt with this key already wrote, when there was one.
   *
   * Matched across every presentation action rather than one action name, because a replay must be
   * caught even though the first attempt may have been recorded as `created` while the retry would
   * be `updated`. Returning the stored `banner_id` is what lets a replayed CREATE report the row it
   * originally created instead of creating a second slide.
   */
  private async appliedBannerId(
    client: Queryable,
    idempotencyKey: string,
  ): Promise<string | undefined> {
    const existing = await client.query(
      `SELECT metadata->>'banner_id' AS banner_id
         FROM audit_logs
        WHERE entity_type = 'presentation_slide'
          AND action LIKE 'presentation_slide.%'
          AND metadata->>'idempotency_key' = $1
        LIMIT 1`,
      [idempotencyKey],
    );
    const row = existing.rows[0];
    if (!row) return undefined;
    return typeof row.banner_id === 'string' ? row.banner_id : '';
  }

  private static toRow(row: Record<string, unknown>): SlideRow {
    return {
      id: String(row.id),
      title: String(row.title ?? ''),
      description:
        row.description === null || row.description === undefined ? null : String(row.description),
      destination: readStoredDestination(row.link_type, row.link_url),
      isActive: row.is_active === true,
      sortOrder: Number(row.sort_order ?? 0),
      hasImage: row.has_image === true,
      legacyImageUrl:
        row.image_url === null || row.image_url === undefined ? null : String(row.image_url),
      createdAt:
        row.created_at === null || row.created_at === undefined
          ? null
          : new Date(row.created_at as string | number | Date).toISOString(),
    };
  }

  /**
   * Metadata only. `image_data` is deliberately reduced to a boolean here so listing slides can
   * never ship image bytes inside a JSON response; the bytes have one authenticated read path.
   */
  private static readonly selectSql = `SELECT id, title, description, link_type, link_url,
            is_active, sort_order, image_url, created_at,
            image_data IS NOT NULL AS has_image
       FROM banners`;

  private static readonly orderSql = `ORDER BY sort_order NULLS LAST, created_at NULLS LAST, id`;

  private async readOne(client: Queryable, slideId: string): Promise<SlideRow | undefined> {
    const result = await client.query(
      `${PostgresPresentationSlidesStore.selectSql} WHERE id = $1`,
      [slideId],
    );
    const row = result.rows[0];
    return row ? PostgresPresentationSlidesStore.toRow(row) : undefined;
  }

  private async readAll(client: Queryable): Promise<SlideRow[]> {
    const result = await client.query(
      `${PostgresPresentationSlidesStore.selectSql} ${PostgresPresentationSlidesStore.orderSql}`,
    );
    return result.rows.map(PostgresPresentationSlidesStore.toRow);
  }

  async listSlides(input: { actorUserId: string }): Promise<ListSlidesResult> {
    const client = await this.pool.connect();
    try {
      if (!(await this.hasRole(client, input.actorUserId))) return { status: 'forbidden' };
      return { status: 'ok', rows: await this.readAll(client) };
    } finally {
      client.release();
    }
  }

  async readSlideImage(input: {
    slideId: string;
    actorUserId: string;
  }): Promise<ReadSlideImageResult> {
    const client = await this.pool.connect();
    try {
      if (!(await this.hasRole(client, input.actorUserId))) return { status: 'forbidden' };
      const result = await client.query(
        `SELECT image_data FROM banners WHERE id = $1 AND image_data IS NOT NULL`,
        [input.slideId],
      );
      const bytes = result.rows[0]?.image_data;
      if (!bytes) return { status: 'not_found' };
      const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes as Uint8Array);
      return {
        status: 'ok',
        bytes: buffer,
        checksum: createHash('sha256').update(buffer).digest('hex'),
      };
    } finally {
      client.release();
    }
  }

  /**
   * Create or edit exactly one slide.
   *
   * Creating, editing, activating and deactivating are one upsert because they are one fact — the
   * state of one slide. Splitting them into separate endpoints would let the maximum-three rule be
   * checked on one path and skipped on another.
   */
  async upsertSlide(input: SlideUpsert): Promise<UpsertSlideResult> {
    if (!canonicalUuidPattern.test(input.idempotencyKey)) return { status: 'forbidden' };
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      if (!(await this.hasRole(client, input.actorUserId))) {
        await client.query('ROLLBACK');
        return { status: 'forbidden' };
      }

      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [activationLockKey]);

      const replayedBannerId = await this.appliedBannerId(client, input.idempotencyKey);
      if (replayedBannerId !== undefined) {
        const current = replayedBannerId ? await this.readOne(client, replayedBannerId) : undefined;
        await client.query('COMMIT');
        return current ? { status: 'idempotent', row: current } : { status: 'not_found' };
      }

      const existing = input.slideId
        ? await client.query(
            `SELECT id, is_active, image_data IS NOT NULL AS has_image
               FROM banners WHERE id = $1 FOR UPDATE`,
            [input.slideId],
          )
        : undefined;
      if (input.slideId && (existing?.rows.length ?? 0) === 0) {
        await client.query('ROLLBACK');
        return { status: 'not_found' };
      }
      const existingRow = existing?.rows[0];

      if (input.destination.kind === 'pack') {
        // The pack must exist and is read only to prove it. Nothing about it is written.
        const pack = await client.query(`SELECT id FROM packs WHERE id = $1`, [
          input.destination.packId,
        ]);
        if (pack.rows.length === 0) {
          await client.query('ROLLBACK');
          return { status: 'unknown_pack' };
        }
      }

      const willHaveImage = Boolean(input.imageBytes) || existingRow?.has_image === true;
      if (input.isActive && !willHaveImage) {
        await client.query('ROLLBACK');
        return { status: 'image_required' };
      }

      const wasActive = existingRow?.is_active === true;
      if (input.isActive && !wasActive) {
        const active = await client.query(
          `SELECT count(*)::int AS active FROM banners
            WHERE is_active = true AND id <> COALESCE($1, '')`,
          [input.slideId ?? null],
        );
        const activeCount = Number(active.rows[0]?.active ?? 0);
        if (activeCount >= maximumActiveSlides) {
          await client.query('ROLLBACK');
          return { status: 'active_limit_reached', activeCount };
        }
      }

      const stored = toStoredDestination(input.destination);
      let slideId: string;
      if (input.slideId) {
        slideId = input.slideId;
        await client.query(
          `UPDATE banners
              SET title = $2, description = $3, link_type = $4, link_url = $5, is_active = $6,
                  image_data = COALESCE($7, image_data)
            WHERE id = $1`,
          [
            slideId,
            input.title,
            input.description,
            stored.linkType,
            stored.linkUrl,
            input.isActive,
            input.imageBytes ?? null,
          ],
        );
      } else {
        const inserted = await client.query(
          `INSERT INTO banners (title, description, link_type, link_url, is_active, image_data,
                                sort_order)
           VALUES ($1, $2, $3, $4, $5, $6,
                   (SELECT COALESCE(max(sort_order), -1) + 1 FROM banners))
           RETURNING id`,
          [
            input.title,
            input.description,
            stored.linkType,
            stored.linkUrl,
            input.isActive,
            input.imageBytes ?? null,
          ],
        );
        slideId = String(inserted.rows[0]?.id ?? '');
        if (!slideId) throw new Error('banner insert returned no id');
      }

      // One audit row per request, named after what the operator actually did. An activation
      // change wins the name, because "who switched this on" is the question asked of the trail.
      const action = !input.slideId
        ? 'presentation_slide.created'
        : input.isActive === wasActive
          ? 'presentation_slide.updated'
          : input.isActive
            ? 'presentation_slide.activated'
            : 'presentation_slide.deactivated';

      await this.audit(client, input.actorUserId, action, slideId, {
        idempotency_key: input.idempotencyKey,
        previous_is_active: input.slideId ? wasActive : null,
        is_active: input.isActive,
        destination_kind: input.destination.kind,
        destination: stored.linkUrl,
        image_replaced: Boolean(input.imageBytes),
      });

      const row = await this.readOne(client, slideId);
      await client.query('COMMIT');
      return row ? { status: 'applied', row } : { status: 'not_found' };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Rewrite the display order of every slide in one transaction.
   *
   * The submitted order must name every existing slide exactly once. A partial order is rejected
   * rather than applied, because renumbering a subset is how two slides end up sharing a position.
   */
  async reorderSlides(input: {
    order: readonly string[];
    actorUserId: string;
    idempotencyKey: string;
  }): Promise<ReorderSlidesResult> {
    if (!canonicalUuidPattern.test(input.idempotencyKey)) return { status: 'forbidden' };
    if (input.order.length === 0) return { status: 'invalid_order' };
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      if (!(await this.hasRole(client, input.actorUserId))) {
        await client.query('ROLLBACK');
        return { status: 'forbidden' };
      }

      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [activationLockKey]);

      if ((await this.appliedBannerId(client, input.idempotencyKey)) !== undefined) {
        const rows = await this.readAll(client);
        await client.query('COMMIT');
        return { status: 'idempotent', rows };
      }

      const current = await client.query(`SELECT id FROM banners ORDER BY id FOR UPDATE`);
      const existingIds = current.rows.map((row) => String(row.id));
      const submitted = new Set(input.order);
      if (
        submitted.size !== input.order.length ||
        submitted.size !== existingIds.length ||
        !existingIds.every((id) => submitted.has(id))
      ) {
        await client.query('ROLLBACK');
        return { status: 'invalid_order' };
      }

      await client.query(
        `UPDATE banners AS b
            SET sort_order = ordered.position - 1
           FROM unnest($1::text[]) WITH ORDINALITY AS ordered(id, position)
          WHERE b.id = ordered.id`,
        [[...input.order]],
      );

      await this.audit(client, input.actorUserId, 'presentation_slide.reordered', input.order[0], {
        idempotency_key: input.idempotencyKey,
        order: [...input.order],
      });

      const rows = await this.readAll(client);
      await client.query('COMMIT');
      return { status: 'applied', rows };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}
