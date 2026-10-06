import { createHash } from 'node:crypto';

import {
  type CardPublishCandidate,
  type ContentStatus,
  type PackLifecycleStatus,
  type PackPublishReadiness,
  type WordCardDraft,
  canArchivePackFrom,
  canSubmitCardForReview,
  evaluatePackPublishReadiness,
  isPackLifecycleStatus,
} from '@learnbox/content-models';

const canonicalUuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
/** `packs.id` is a canonical text slug, not a uuid. Mirrors the content-packs write store. */
const packIdPattern = /^[a-z0-9][a-z0-9-]{1,119}$/;

type Row = Record<string, unknown>;
type QueryResult = { rows: Row[] };
type Queryable = {
  query(sql: string, parameters?: readonly unknown[]): Promise<QueryResult>;
};
type TransactionClient = Queryable & { release(): void };
type DatabasePool = Queryable & { connect(): Promise<TransactionClient> };

/** Editorial roles may move content into review; only a publisher may release or deactivate it. */
const reviewerRoles = ['content_reviewer', 'super_admin'] as const;
const publisherRoles = ['content_publisher', 'super_admin'] as const;

export interface PackLifecycleCard {
  cardId: string;
  cardVersionId: string;
  contentId: string;
  lemma: string;
  status: ContentStatus;
  /** Identity of the reviewer who approved this version, when one exists. */
  approvedBy: string | null;
}

export interface PackLifecycleView {
  packId: string;
  status: PackLifecycleStatus;
  publishedAt: string | null;
  targetItemCount: number;
  cards: PackLifecycleCard[];
  submittableCardCount: number;
  readiness: PackPublishReadiness;
  canSubmitForReview: boolean;
  canPublish: boolean;
  canArchive: boolean;
}

export type PackLifecycleViewResult =
  { status: 'ok'; view: PackLifecycleView } | { status: 'forbidden' } | { status: 'not_found' };

export interface PackLifecycleMutation {
  packId: string;
  actorUserId: string;
  idempotencyKey: string;
  /**
   * Lifecycle state the operator saw when they decided to act. A mismatch means the pack moved
   * underneath them, so the mutation is refused rather than applied to newer content.
   */
  expectedStatus?: PackLifecycleStatus;
}

export type SubmitForReviewResult =
  | { status: 'applied'; submittedCardCount: number; packStatus: PackLifecycleStatus }
  | { status: 'idempotent'; packStatus: PackLifecycleStatus }
  | { status: 'nothing_to_submit'; packStatus: PackLifecycleStatus }
  | { status: 'stale'; currentStatus: PackLifecycleStatus }
  | { status: 'forbidden' }
  | { status: 'not_found' };

export type PublishPackResult =
  | { status: 'applied'; publishedCardCount: number }
  | { status: 'idempotent' }
  | { status: 'not_ready'; readiness: PackPublishReadiness }
  | { status: 'stale'; currentStatus: PackLifecycleStatus }
  | { status: 'forbidden' }
  | { status: 'not_found' };

export type ArchivePackResult =
  | { status: 'applied'; deactivatedCardCount: number }
  | { status: 'idempotent' }
  | { status: 'stale'; currentStatus: PackLifecycleStatus }
  | { status: 'forbidden' }
  | { status: 'not_found' };

function toPackStatus(value: unknown): PackLifecycleStatus {
  return isPackLifecycleStatus(value) ? value : 'draft';
}

function toCount(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toIsoString(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  return value === null || value === undefined ? null : String(value);
}

/**
 * Builds the publish candidate for one card version.
 *
 * The persisted `content_json` is the canonical card. The only field layered on top is
 * `source.reviewedBy`, taken from the card's recorded approve decision: provenance (`provider`)
 * is never rewritten, so an AI-suggested card stays AI-suggested forever while still being able
 * to prove that a human approved its release.
 */
function toPublishCandidate(card: PackLifecycleCard, contentJson: unknown): CardPublishCandidate {
  const content = (contentJson ?? {}) as WordCardDraft;
  const source = (content.source ?? { provider: 'editorial' }) as WordCardDraft['source'];
  return {
    cardVersionId: card.cardVersionId,
    contentId: card.contentId,
    lemma: card.lemma,
    status: card.status,
    content: {
      ...content,
      status: card.status,
      source: {
        ...source,
        reviewedBy: source.reviewedBy ?? card.approvedBy ?? undefined,
      },
    },
  };
}

/**
 * Server-only content lifecycle persistence for the authenticated Admin runtime (Phase 1,
 * Milestone 1.6). It completes the operational path that M1.1–M1.5 deliberately left open:
 *
 *   draft / ai_generated --submit--> needs_review --review decision--> approved --publish--> published
 *                                                                                  --archive--> archived
 *
 * Design invariants, matching the content-review and content-packs stores:
 *  - The actor always arrives from an already-validated Passkey session; roles are resolved inside
 *    the transaction from `admin_role_assignments` and never read from a browser request.
 *  - Publication requires `content_publisher` (or `super_admin`), a different role from the
 *    `content_reviewer` who approves — the canonical model states that only a separate publisher
 *    may release approved content.
 *  - Readiness is evaluated by the canonical domain layer (`evaluatePackPublishReadiness`), never
 *    by SQL or by Admin-local rules, and it is re-evaluated server-side inside the transaction so
 *    a stale browser view can never authorise a release.
 *  - Every mutation locks its rows, is naturally idempotent on the target state, refuses a stale
 *    `expectedStatus`, and records `audit_logs` rows atomically.
 *  - Only canonical tables are written: `packs` and `card_versions`. There is no Admin-owned
 *    mirror of published content, so Admin publish and learner visibility cannot diverge.
 *  - Deactivation is `archived` / `deprecated` status only. Nothing is ever hard-deleted, so
 *    learning schedules, review events, audit history and entitlements stay intact.
 */
export class PostgresContentLifecycleStore {
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
   * Stable surrogate uuid for a text-keyed entity, identical to the content-packs write store.
   *
   * `audit_logs.entity_id` is `uuid NOT NULL` while `packs.id` is a text slug. Widening the audit
   * column is a schema change this milestone is not authorised to make, so a pack audits under a
   * deterministic uuid derived from its slug and the slug itself is kept in `metadata.pack_id`.
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
    entityType: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    const isUuid = canonicalUuidPattern.test(entityId);
    await client.query(
      `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        actorUserId,
        action,
        entityType,
        isUuid ? entityId : PostgresContentLifecycleStore.surrogateUuid(entityId),
        isUuid ? metadata : { ...metadata, pack_id: entityId },
      ],
    );
  }

  /**
   * True when this exact idempotency key already applied this action, so a retried request
   * reports the original outcome instead of repeating a lifecycle transition.
   */
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

  private async readPackCards(client: Queryable, packId: string): Promise<PackLifecycleCard[]> {
    const result = await client.query(
      `SELECT pc.card_id, c.content_id, c.lemma, cv.id AS card_version_id, cv.status,
              (SELECT d.reviewer_user_id
                 FROM content_review_decisions d
                WHERE d.card_version_id = cv.id AND d.action = 'approve'
                ORDER BY d.created_at DESC
                LIMIT 1) AS approved_by
         FROM pack_cards pc
         JOIN cards c ON c.id = pc.card_id
         JOIN LATERAL (
                SELECT inner_cv.id, inner_cv.status
                  FROM card_versions inner_cv
                 WHERE inner_cv.card_id = pc.card_id
                 ORDER BY inner_cv.version DESC
                 LIMIT 1
              ) cv ON true
        WHERE pc.pack_id = $1
        ORDER BY pc.sort_order, c.content_id`,
      [packId],
    );
    return result.rows.map((row) => ({
      cardId: String(row.card_id),
      cardVersionId: String(row.card_version_id),
      contentId: String(row.content_id),
      lemma: String(row.lemma),
      status: String(row.status) as ContentStatus,
      approvedBy:
        row.approved_by === null || row.approved_by === undefined ? null : String(row.approved_by),
    }));
  }

  /**
   * Reads the lifecycle state of one pack together with its concrete publish blockers, so an
   * operator sees why a pack cannot be released without inspecting database rows.
   */
  async getPackLifecycle(input: {
    packId: string;
    actorUserId: string;
  }): Promise<PackLifecycleViewResult> {
    if (!canonicalUuidPattern.test(input.actorUserId)) {
      throw new Error('Actor user id is invalid.');
    }
    if (!packIdPattern.test(input.packId)) return { status: 'not_found' };

    const client = await this.pool.connect();
    try {
      if (!(await this.hasRole(client, input.actorUserId, reviewerRoles))) {
        return { status: 'forbidden' };
      }
      const packResult = await client.query(
        'SELECT id, status, published_at, target_item_count FROM packs WHERE id = $1',
        [input.packId],
      );
      const pack = packResult.rows[0];
      if (!pack) return { status: 'not_found' };

      const cards = await this.readPackCards(client, input.packId);
      const contentResult = await client.query(
        'SELECT id, content_json FROM card_versions WHERE id = ANY($1::uuid[])',
        [cards.map((card) => card.cardVersionId)],
      );
      const contentByVersion = new Map(
        contentResult.rows.map((row) => [String(row.id), row.content_json]),
      );

      const packStatus = toPackStatus(pack.status);
      const targetItemCount = toCount(pack.target_item_count);
      const readiness = evaluatePackPublishReadiness({
        packStatus,
        targetItemCount,
        cards: cards.map((card) =>
          toPublishCandidate(card, contentByVersion.get(card.cardVersionId)),
        ),
      });
      const submittableCardCount = cards.filter((card) =>
        canSubmitCardForReview(card.status),
      ).length;
      const canPublish = await this.hasRole(client, input.actorUserId, publisherRoles);

      return {
        status: 'ok',
        view: {
          packId: String(pack.id),
          status: packStatus,
          publishedAt: toIsoString(pack.published_at),
          targetItemCount,
          cards,
          submittableCardCount,
          readiness,
          canSubmitForReview: submittableCardCount > 0,
          canPublish: canPublish && readiness.ready,
          canArchive: canPublish && canArchivePackFrom(packStatus),
        },
      };
    } finally {
      client.release();
    }
  }

  /** Moves every draft / AI-applied card in the pack into the human review queue. */
  async submitPackForReview(input: PackLifecycleMutation): Promise<SubmitForReviewResult> {
    if (!canonicalUuidPattern.test(input.actorUserId)) {
      throw new Error('Actor user id is invalid.');
    }
    if (!canonicalUuidPattern.test(input.idempotencyKey)) {
      throw new Error('Idempotency key is invalid.');
    }
    if (!packIdPattern.test(input.packId)) return { status: 'not_found' };

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      if (!(await this.hasRole(client, input.actorUserId, reviewerRoles))) {
        await client.query('ROLLBACK');
        return { status: 'forbidden' };
      }

      const packResult = await client.query(
        'SELECT id, status FROM packs WHERE id = $1 FOR UPDATE',
        [input.packId],
      );
      if (
        packResult.rows[0] &&
        (await this.alreadyApplied(
          client,
          'content_lifecycle.submit_pack_for_review',
          input.idempotencyKey,
        ))
      ) {
        await client.query('ROLLBACK');
        return { status: 'idempotent', packStatus: toPackStatus(packResult.rows[0].status) };
      }
      const pack = packResult.rows[0];
      if (!pack) {
        await client.query('ROLLBACK');
        return { status: 'not_found' };
      }
      const packStatus = toPackStatus(pack.status);
      if (input.expectedStatus && input.expectedStatus !== packStatus) {
        await client.query('ROLLBACK');
        return { status: 'stale', currentStatus: packStatus };
      }
      if (packStatus === 'published' || packStatus === 'archived') {
        await client.query('ROLLBACK');
        return { status: 'stale', currentStatus: packStatus };
      }

      const submittable = await client.query(
        `SELECT cv.id
           FROM pack_cards pc
           JOIN LATERAL (
                  SELECT inner_cv.id, inner_cv.status
                    FROM card_versions inner_cv
                   WHERE inner_cv.card_id = pc.card_id
                   ORDER BY inner_cv.version DESC
                   LIMIT 1
                ) cv ON true
          WHERE pc.pack_id = $1 AND cv.status IN ('draft', 'ai_generated')
          ORDER BY cv.id`,
        [input.packId],
      );
      // Re-select under a row lock: PostgreSQL cannot lock a LATERAL sub-select alias, and the
      // status is re-checked so a version that moved between the two reads is skipped.
      const locked = await client.query(
        `SELECT id
           FROM card_versions
          WHERE id = ANY($1::uuid[]) AND status IN ('draft', 'ai_generated')
          ORDER BY id
          FOR UPDATE`,
        [submittable.rows.map((row) => String(row.id))],
      );
      const versionIds = locked.rows.map((row) => String(row.id));
      if (versionIds.length === 0) {
        await client.query('ROLLBACK');
        if (packStatus === 'needs_review') return { status: 'idempotent', packStatus };
        return { status: 'nothing_to_submit', packStatus };
      }

      await client.query(
        `UPDATE card_versions SET status = 'needs_review' WHERE id = ANY($1::uuid[])`,
        [versionIds],
      );
      await client.query(`UPDATE packs SET status = 'needs_review' WHERE id = $1`, [input.packId]);

      for (const versionId of versionIds) {
        await this.audit(
          client,
          input.actorUserId,
          'content_lifecycle.submit_for_review',
          'card_version',
          versionId,
          { pack_id: input.packId, idempotency_key: input.idempotencyKey },
        );
      }
      await this.audit(
        client,
        input.actorUserId,
        'content_lifecycle.submit_pack_for_review',
        'pack',
        input.packId,
        { card_version_count: versionIds.length, idempotency_key: input.idempotencyKey },
      );

      await client.query('COMMIT');
      return {
        status: 'applied',
        submittedCardCount: versionIds.length,
        packStatus: 'needs_review',
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Releases an approved pack to learners. Readiness is re-evaluated inside the transaction, so
   * the decision is always made on locked canonical rows rather than on what a browser last saw.
   */
  async publishPack(input: PackLifecycleMutation): Promise<PublishPackResult> {
    if (!canonicalUuidPattern.test(input.actorUserId)) {
      throw new Error('Actor user id is invalid.');
    }
    if (!canonicalUuidPattern.test(input.idempotencyKey)) {
      throw new Error('Idempotency key is invalid.');
    }
    if (!packIdPattern.test(input.packId)) return { status: 'not_found' };

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      if (!(await this.hasRole(client, input.actorUserId, publisherRoles))) {
        await client.query('ROLLBACK');
        return { status: 'forbidden' };
      }

      const packResult = await client.query(
        'SELECT id, status, target_item_count FROM packs WHERE id = $1 FOR UPDATE',
        [input.packId],
      );
      const pack = packResult.rows[0];
      if (!pack) {
        await client.query('ROLLBACK');
        return { status: 'not_found' };
      }
      const packStatus = toPackStatus(pack.status);
      if (input.expectedStatus && input.expectedStatus !== packStatus) {
        await client.query('ROLLBACK');
        return { status: 'stale', currentStatus: packStatus };
      }
      if (
        packStatus === 'published' ||
        (await this.alreadyApplied(client, 'content_lifecycle.publish_pack', input.idempotencyKey))
      ) {
        await client.query('ROLLBACK');
        return { status: 'idempotent' };
      }

      const cards = await this.readPackCards(client, input.packId);
      const locked = await client.query(
        `SELECT id, status, content_json
           FROM card_versions
          WHERE id = ANY($1::uuid[])
          ORDER BY id
          FOR UPDATE`,
        [cards.map((card) => card.cardVersionId)],
      );
      const lockedByVersion = new Map(locked.rows.map((row) => [String(row.id), row]));

      // The locked row is authoritative: a concurrent review decision may have moved the version
      // between the unlocked read and the lock.
      const candidates = cards.map((card) => {
        const row = lockedByVersion.get(card.cardVersionId);
        const authoritative: PackLifecycleCard = {
          ...card,
          status: row ? (String(row.status) as ContentStatus) : card.status,
        };
        return toPublishCandidate(authoritative, row?.content_json);
      });

      const readiness = evaluatePackPublishReadiness({
        packStatus,
        targetItemCount: toCount(pack.target_item_count),
        cards: candidates,
      });
      if (!readiness.ready) {
        await client.query('ROLLBACK');
        return { status: 'not_ready', readiness };
      }

      for (const candidate of candidates) {
        await client.query(
          `UPDATE card_versions
              SET status = 'published', published_at = now(), content_json = $2
            WHERE id = $1`,
          [candidate.cardVersionId, { ...candidate.content, status: 'published' }],
        );
        await this.audit(
          client,
          input.actorUserId,
          'content_lifecycle.publish',
          'card_version',
          candidate.cardVersionId,
          {
            pack_id: input.packId,
            content_id: candidate.contentId,
            reviewed_by: candidate.content.source.reviewedBy ?? null,
            idempotency_key: input.idempotencyKey,
          },
        );
      }

      await client.query(
        `UPDATE packs
            SET status = 'published', published_at = COALESCE(published_at, now())
          WHERE id = $1`,
        [input.packId],
      );
      await this.audit(
        client,
        input.actorUserId,
        'content_lifecycle.publish_pack',
        'pack',
        input.packId,
        {
          published_card_count: candidates.length,
          previous_status: packStatus,
          idempotency_key: input.idempotencyKey,
        },
      );

      await client.query('COMMIT');
      return { status: 'applied', publishedCardCount: candidates.length };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Deactivates a pack without destroying anything. Published card versions move to `deprecated`,
   * which removes them from the learner curriculum while every schedule, review event and audit
   * row that references them survives untouched.
   */
  async archivePack(input: PackLifecycleMutation): Promise<ArchivePackResult> {
    if (!canonicalUuidPattern.test(input.actorUserId)) {
      throw new Error('Actor user id is invalid.');
    }
    if (!canonicalUuidPattern.test(input.idempotencyKey)) {
      throw new Error('Idempotency key is invalid.');
    }
    if (!packIdPattern.test(input.packId)) return { status: 'not_found' };

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      if (!(await this.hasRole(client, input.actorUserId, publisherRoles))) {
        await client.query('ROLLBACK');
        return { status: 'forbidden' };
      }

      const packResult = await client.query(
        'SELECT id, status FROM packs WHERE id = $1 FOR UPDATE',
        [input.packId],
      );
      const pack = packResult.rows[0];
      if (!pack) {
        await client.query('ROLLBACK');
        return { status: 'not_found' };
      }
      const packStatus = toPackStatus(pack.status);
      if (input.expectedStatus && input.expectedStatus !== packStatus) {
        await client.query('ROLLBACK');
        return { status: 'stale', currentStatus: packStatus };
      }
      if (
        !canArchivePackFrom(packStatus) ||
        (await this.alreadyApplied(client, 'content_lifecycle.archive_pack', input.idempotencyKey))
      ) {
        await client.query('ROLLBACK');
        return { status: 'idempotent' };
      }

      const deactivated = await client.query(
        `UPDATE card_versions
            SET status = 'deprecated'
          WHERE id IN (
                  SELECT cv.id
                    FROM pack_cards pc
                    JOIN LATERAL (
                           SELECT inner_cv.id, inner_cv.status
                             FROM card_versions inner_cv
                            WHERE inner_cv.card_id = pc.card_id
                            ORDER BY inner_cv.version DESC
                            LIMIT 1
                         ) cv ON true
                   WHERE pc.pack_id = $1 AND cv.status = 'published'
                )
          RETURNING id`,
        [input.packId],
      );
      await client.query(`UPDATE packs SET status = 'archived' WHERE id = $1`, [input.packId]);

      for (const row of deactivated.rows) {
        await this.audit(
          client,
          input.actorUserId,
          'content_lifecycle.deprecate',
          'card_version',
          String(row.id),
          { pack_id: input.packId, idempotency_key: input.idempotencyKey },
        );
      }
      await this.audit(
        client,
        input.actorUserId,
        'content_lifecycle.archive_pack',
        'pack',
        input.packId,
        {
          deactivated_card_count: deactivated.rows.length,
          previous_status: packStatus,
          idempotency_key: input.idempotencyKey,
        },
      );

      await client.query('COMMIT');
      return { status: 'applied', deactivatedCardCount: deactivated.rows.length };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
