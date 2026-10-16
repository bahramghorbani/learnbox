import { createHash } from 'node:crypto';

import {
  type CardPublishCandidate,
  type ContentStatus,
  type PackLifecycleStatus,
  type PackPublishReadiness,
  type WordCardDraft,
  canArchivePackFrom,
  canSubmitCardForReview,
  evaluateCardPublishReadiness,
  evaluateCardSubmitReadiness,
  evaluatePackPublishReadiness,
  isPackLifecycleStatus,
  pinCardMedia,
  type ContentValidationIssue,
  type GermanVoiceMapping,
} from '@learnbox/content-models';

import { readGermanVoiceMapping } from './ai-media-config';
import { readCanonicalCardBrief } from './canonical-image-standard';
import { type ResolvedCardMedia, resolveCardMediaReadiness } from './card-media-readiness';

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
  /** Latest non-published versions in a live pack; learners still receive the previous version. */
  pendingRevisionCount: number;
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

/** A card that was not declared ready because the shared card standard reports gaps. */
export interface IncompleteCard {
  cardVersionId: string;
  contentId: string;
  lemma: string;
  issues: ContentValidationIssue[];
}

export type SubmitForReviewResult =
  | {
      status: 'applied';
      submittedCardCount: number;
      packStatus: PackLifecycleStatus;
      /** Cards left in draft because they are incomplete; they are never declared ready. */
      incompleteCards: IncompleteCard[];
    }
  | { status: 'idempotent'; packStatus: PackLifecycleStatus }
  | { status: 'nothing_to_submit'; packStatus: PackLifecycleStatus }
  /** Every submittable card is incomplete: nothing moved to review. */
  | { status: 'incomplete'; packStatus: PackLifecycleStatus; incompleteCards: IncompleteCard[] }
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
function toPublishCandidate(
  card: PackLifecycleCard,
  contentJson: unknown,
  resolved?: ResolvedCardMedia,
): CardPublishCandidate {
  const content = (contentJson ?? {}) as WordCardDraft;
  const source = (content.source ?? { provider: 'editorial' }) as WordCardDraft['source'];
  return {
    cardVersionId: card.cardVersionId,
    contentId: card.contentId,
    lemma: card.lemma,
    status: card.status,
    // Media readiness comes from the media's real source; unresolved means "not ready".
    media: resolved?.media,
    imageBrief: resolved?.imageBrief ?? null,
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
  constructor(
    private readonly pool: DatabasePool,
    private readonly voiceMapping: GermanVoiceMapping = readGermanVoiceMapping(process.env),
  ) {}

  /** Media readiness for the given card versions, read through `client` (locked rows if any). */
  private resolveMedia(
    client: Queryable,
    cards: readonly PackLifecycleCard[],
    contentByVersion: Map<string, unknown>,
  ): Promise<Map<string, ResolvedCardMedia>> {
    return resolveCardMediaReadiness(
      client,
      cards.map((card) => ({
        cardId: card.cardId,
        cardVersionId: card.cardVersionId,
        contentId: card.contentId,
        content: (contentByVersion.get(card.cardVersionId) ?? {}) as Record<string, unknown>,
      })),
      this.voiceMapping,
    );
  }

  /** The published content: status published, accepted Admin media pinned by key and checksum. */
  private publishedContent(
    candidate: CardPublishCandidate,
    resolved: ResolvedCardMedia | undefined,
  ): Record<string, unknown> {
    const content = { ...candidate.content, status: 'published' } as Record<string, unknown>;
    if (resolved?.pins.length) content.media = pinCardMedia(content.media, resolved.pins);
    return content;
  }

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
      const media = await this.resolveMedia(client, cards, contentByVersion);
      const readiness = evaluatePackPublishReadiness({
        packStatus,
        targetItemCount,
        cards: cards.map((card) =>
          toPublishCandidate(
            card,
            contentByVersion.get(card.cardVersionId),
            media.get(card.cardVersionId),
          ),
        ),
      });
      const submittableCardCount = cards.filter((card) =>
        canSubmitCardForReview(card.status),
      ).length;
      const pendingRevisionCount =
        packStatus === 'published' ? cards.filter((card) => card.status !== 'published').length : 0;
      const canPublish = await this.hasRole(client, input.actorUserId, publisherRoles);
      const approvedRevisions = cards
        .filter((card) => card.status === 'approved')
        .map((card) =>
          toPublishCandidate(
            card,
            contentByVersion.get(card.cardVersionId),
            media.get(card.cardVersionId),
          ),
        )
        .filter((candidate) => evaluateCardPublishReadiness(candidate) === null).length;

      return {
        status: 'ok',
        view: {
          packId: String(pack.id),
          status: packStatus,
          publishedAt: toIsoString(pack.published_at),
          targetItemCount,
          cards,
          submittableCardCount,
          pendingRevisionCount,
          readiness,
          canSubmitForReview: submittableCardCount > 0,
          canPublish:
            canPublish && (packStatus === 'published' ? approvedRevisions > 0 : readiness.ready),
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
      if (packStatus === 'archived') {
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
        `SELECT cv.id, cv.content_json, c.content_id, c.lemma
           FROM card_versions cv
           JOIN cards c ON c.id = cv.card_id
          WHERE cv.id = ANY($1::uuid[]) AND cv.status IN ('draft', 'ai_generated')
          ORDER BY cv.id
          FOR UPDATE OF cv`,
        [submittable.rows.map((row) => String(row.id))],
      );
      // Declaring a card ready requires the shared card standard (IPA, example, part-of-speech
      // inflection, ...). An incomplete card stays a draft and is reported, never submitted.
      const incompleteCards: IncompleteCard[] = [];
      const versionIds: string[] = [];
      for (const row of locked.rows) {
        const contentId = String(row.content_id);
        const issues = evaluateCardSubmitReadiness(
          (row.content_json ?? {}) as Record<string, unknown>,
          { imageBrief: readCanonicalCardBrief(contentId) ?? null },
        );
        if (issues.length === 0) {
          versionIds.push(String(row.id));
        } else {
          incompleteCards.push({
            cardVersionId: String(row.id),
            contentId,
            lemma: String(row.lemma),
            issues,
          });
        }
      }
      if (versionIds.length === 0) {
        await client.query('ROLLBACK');
        if (incompleteCards.length > 0)
          return { status: 'incomplete', packStatus, incompleteCards };
        if (packStatus === 'needs_review') return { status: 'idempotent', packStatus };
        return { status: 'nothing_to_submit', packStatus };
      }

      await client.query(
        `UPDATE card_versions SET status = 'needs_review' WHERE id = ANY($1::uuid[])`,
        [versionIds],
      );
      if (packStatus !== 'published') {
        await client.query(`UPDATE packs SET status = 'needs_review' WHERE id = $1`, [
          input.packId,
        ]);
      }

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
        packStatus: packStatus === 'published' ? 'published' : 'needs_review',
        incompleteCards,
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
        await this.alreadyApplied(client, 'content_lifecycle.publish_pack', input.idempotencyKey)
      ) {
        await client.query('ROLLBACK');
        return { status: 'idempotent' };
      }
      if (packStatus === 'published') {
        // Lock card heads before selecting latest versions: editing a card also locks its head, so
        // the revision released here is the one that was actually reviewed.
        await client.query(
          `SELECT c.id
             FROM pack_cards pc
             JOIN cards c ON c.id = pc.card_id
            WHERE pc.pack_id = $1
            FOR UPDATE`,
          [input.packId],
        );
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
        const approvedCards = cards.filter(
          (card) => lockedByVersion.get(card.cardVersionId)?.status === 'approved',
        );
        const revisionMedia = await this.resolveMedia(
          client,
          approvedCards,
          new Map(
            approvedCards.map((card) => [
              card.cardVersionId,
              lockedByVersion.get(card.cardVersionId)!.content_json,
            ]),
          ),
        );
        const candidates = approvedCards.map((card) => {
          const row = lockedByVersion.get(card.cardVersionId)!;
          return toPublishCandidate(
            { ...card, status: 'approved' },
            row.content_json,
            revisionMedia.get(card.cardVersionId),
          );
        });
        if (candidates.length === 0) {
          await client.query('ROLLBACK');
          return { status: 'idempotent' };
        }
        const cardBlockers = candidates
          .map((candidate) => evaluateCardPublishReadiness(candidate))
          .filter((blocker): blocker is NonNullable<typeof blocker> => blocker !== null);
        if (cardBlockers.length > 0) {
          await client.query('ROLLBACK');
          return {
            status: 'not_ready',
            readiness: {
              ready: false,
              packStatus,
              publishableCardCount: candidates.length - cardBlockers.length,
              blockers: [{ code: 'cards_not_ready' }],
              cardBlockers,
            },
          };
        }

        for (const candidate of candidates) {
          // This transaction is the visibility boundary: the old published version remains readable
          // until the replacement is committed, then exactly one published version remains.
          await client.query(
            `UPDATE card_versions
                SET status = 'deprecated'
              WHERE card_id = $1 AND status = 'published'`,
            [cards.find((card) => card.cardVersionId === candidate.cardVersionId)!.cardId],
          );
          await client.query(
            `UPDATE card_versions
                SET status = 'published', published_at = now(), content_json = $2
              WHERE id = $1`,
            [
              candidate.cardVersionId,
              this.publishedContent(candidate, revisionMedia.get(candidate.cardVersionId)),
            ],
          );
          await this.audit(
            client,
            input.actorUserId,
            'content_lifecycle.publish_revision',
            'card_version',
            candidate.cardVersionId,
            {
              pack_id: input.packId,
              content_id: candidate.contentId,
              idempotency_key: input.idempotencyKey,
            },
          );
        }
        await this.audit(
          client,
          input.actorUserId,
          'content_lifecycle.publish_revisions',
          'pack',
          input.packId,
          { published_card_count: candidates.length, idempotency_key: input.idempotencyKey },
        );
        await client.query('COMMIT');
        return { status: 'applied', publishedCardCount: candidates.length };
      }
      if (packStatus === 'archived') {
        await client.query('ROLLBACK');
        return {
          status: 'not_ready',
          readiness: evaluatePackPublishReadiness({
            packStatus,
            targetItemCount: toCount(pack.target_item_count),
            cards: [],
          }),
        };
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
      const packMedia = await this.resolveMedia(
        client,
        cards,
        new Map(
          cards.map((card) => [
            card.cardVersionId,
            lockedByVersion.get(card.cardVersionId)?.content_json,
          ]),
        ),
      );
      const candidates = cards.map((card) => {
        const row = lockedByVersion.get(card.cardVersionId);
        const authoritative: PackLifecycleCard = {
          ...card,
          status: row ? (String(row.status) as ContentStatus) : card.status,
        };
        return toPublishCandidate(
          authoritative,
          row?.content_json,
          packMedia.get(card.cardVersionId),
        );
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
          [
            candidate.cardVersionId,
            this.publishedContent(candidate, packMedia.get(candidate.cardVersionId)),
          ],
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
   * Archives a pack without destroying anything. Published versions stay published so a learner
   * holding `user_packs` entitlement can continue the pack; access control denies everyone else.
   * Schedules, events and audit rows are never touched.
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

      await client.query(`UPDATE packs SET status = 'archived' WHERE id = $1`, [input.packId]);

      await this.audit(
        client,
        input.actorUserId,
        'content_lifecycle.archive_pack',
        'pack',
        input.packId,
        {
          deactivated_card_count: 0,
          previous_status: packStatus,
          idempotency_key: input.idempotencyKey,
        },
      );

      await client.query('COMMIT');
      return { status: 'applied', deactivatedCardCount: 0 };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
