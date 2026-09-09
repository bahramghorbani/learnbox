import { createHash } from 'node:crypto';

export const contentReviewDimensions = [
  'german_linguistic',
  'persian_translation',
  'provenance',
  'visual',
  'audio',
  'app_flow',
] as const;

export type ContentReviewDimension = (typeof contentReviewDimensions)[number];
export type ContentReviewOutcome = 'pending' | 'passed' | 'failed';
export type ContentReviewAction = 'approve' | 'return_for_revision' | 'reject';

export interface ContentReviewCheckState {
  dimension: ContentReviewDimension;
  outcome: ContentReviewOutcome;
  notes: string | null;
  reviewedAt: string | null;
}

export interface ContentReviewQueueEntry {
  cardVersionId: string;
  contentId: string;
  lemma: string;
  status: 'auto_validated' | 'needs_review';
  article: string | null;
  partOfSpeech: string;
  persianMeanings: string[];
  essentialInflection: string | null;
  pronunciationIpa: string | null;
  examples: Array<{ german: string; persian: string }>;
  mediaCount: number;
  sourceProvider: string;
  sourceReference: string | null;
  checks: ContentReviewCheckState[];
}

export type ContentReviewQueueResult =
  { status: 'forbidden' } | { status: 'ok'; items: ContentReviewQueueEntry[] };

export interface ContentReviewCheckSubmission {
  cardVersionId: string;
  dimension: ContentReviewDimension;
  outcome: 'passed' | 'failed';
  notes?: string;
  idempotencyKey: string;
}

export type ContentReviewCheckWriteResult =
  | { status: 'applied' }
  | { status: 'idempotent' }
  | { status: 'conflict' }
  | { status: 'forbidden' }
  | { status: 'not_found' }
  | { currentStatus: string; status: 'not_reviewable' };

export interface ContentReviewDecisionSubmission {
  cardVersionId: string;
  action: ContentReviewAction;
  decisionKey: string;
  reason?: string;
}

export type ContentReviewDecisionWriteResult =
  | { nextStatus: 'approved' | 'needs_review' | 'rejected'; status: 'applied' }
  | { action: ContentReviewAction; status: 'idempotent' }
  | { status: 'conflict' }
  | { status: 'forbidden' }
  | { status: 'not_found' }
  | { currentStatus: string; status: 'not_reviewable' }
  | { pendingDimensions: ContentReviewDimension[]; status: 'review_incomplete' };

// RFC 4122 URL namespace; this is intentionally not the adjacent DNS namespace (`...b810...`).
const uuidNamespaceUrlHex = '6ba7b8119dad11d180b400c04fd430c8';
const canonicalUuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const reviewableStatuses = new Set(['auto_validated', 'needs_review']);
const decisionActions = new Set<ContentReviewAction>(['approve', 'return_for_revision', 'reject']);

type Row = Record<string, unknown>;
type QueryResult = { rows: Row[] };
type Queryable = {
  query(sql: string, parameters?: readonly unknown[]): Promise<QueryResult>;
};
type TransactionClient = Queryable & { release(): void };
type DatabasePool = Queryable & { connect(): Promise<TransactionClient> };

/** Deterministic uuid5 (RFC 4122 version 5) over the standard URL namespace. */
export function deterministicUuid5(name: string): string {
  const namespace = Buffer.from(uuidNamespaceUrlHex, 'hex');
  const digest = createHash('sha1')
    .update(Buffer.concat([namespace, Buffer.from(name, 'utf8')]))
    .digest()
    .subarray(0, 16);
  digest[6] = (digest[6]! & 0x0f) | 0x50;
  digest[8] = (digest[8]! & 0x3f) | 0x80;
  const hex = digest.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function normalizedText(value: string | undefined, label: string, maximum: number): string | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  if (trimmed.length > maximum) throw new Error(`${label} is too long.`);
  return trimmed || null;
}

function isUniqueConstraintViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}

function isContentReviewDimension(value: string): value is ContentReviewDimension {
  return (contentReviewDimensions as readonly string[]).includes(value);
}

function isReviewable(status: string): status is 'auto_validated' | 'needs_review' {
  return reviewableStatuses.has(status);
}

function nextStatusFor(action: ContentReviewAction): 'approved' | 'needs_review' | 'rejected' {
  if (action === 'approve') return 'approved';
  if (action === 'reject') return 'rejected';
  return 'needs_review';
}

/**
 * Server-only content-review persistence for the authenticated Admin runtime (PDR-008). The
 * actor always comes from the validated Passkey session, roles are read from PostgreSQL and
 * never from a browser request, and every write locks the target version, is idempotent per
 * key, and records an audit row atomically. This class intentionally provides no publication
 * operation: approval only moves a version to `approved`, never to `published`.
 */
export class PostgresContentReviewStore {
  constructor(private readonly pool: DatabasePool) {}

  private async roleQuery(client: Queryable, actorUserId: string): Promise<boolean> {
    const roles = await client.query(
      `SELECT role
         FROM admin_role_assignments
        WHERE user_id = $1 AND role IN ('content_reviewer', 'super_admin')`,
      [actorUserId],
    );
    return roles.rows.length > 0;
  }

  async listReviewQueue(actorUserId: string): Promise<ContentReviewQueueResult> {
    if (!canonicalUuidPattern.test(actorUserId)) throw new Error('Actor user id is invalid.');
    const client = await this.pool.connect();
    try {
      if (!(await this.roleQuery(client, actorUserId))) return { status: 'forbidden' };

      const candidates = await client.query(
        `SELECT cv.id, cv.status, c.content_id, c.lemma, cv.content_json
           FROM card_versions cv
           JOIN cards c ON c.id = cv.card_id
          WHERE cv.status IN ('auto_validated', 'needs_review')
          ORDER BY c.content_id`,
      );
      if (candidates.rows.length === 0) return { status: 'ok', items: [] };

      const versionIds = candidates.rows.map((row) => String(row.id));
      const checks = await client.query(
        `SELECT card_version_id, dimension, outcome, notes, reviewed_at
           FROM content_review_checks
          WHERE card_version_id = ANY($1::uuid[])`,
        [versionIds],
      );
      const checksByVersion = new Map<string, ContentReviewCheckState[]>();
      for (const check of checks.rows) {
        const versionId = String(check.card_version_id);
        const entry = checksByVersion.get(versionId) ?? [];
        entry.push({
          dimension: String(check.dimension) as ContentReviewDimension,
          outcome: String(check.outcome) as ContentReviewOutcome,
          notes: check.notes === null ? null : String(check.notes),
          reviewedAt:
            check.reviewed_at === null ? null : new Date(check.reviewed_at as string).toISOString(),
        });
        checksByVersion.set(versionId, entry);
      }

      const items: ContentReviewQueueEntry[] = candidates.rows.map((row) => {
        const content = (row.content_json ?? {}) as Record<string, unknown>;
        const pronunciation = content.pronunciation as Record<string, unknown> | undefined;
        const source = content.source as Record<string, unknown> | undefined;
        const media = Array.isArray(content.media) ? (content.media as unknown[]) : [];
        const examples = Array.isArray(content.examples)
          ? (content.examples as Array<{ german?: unknown; persian?: unknown }>).map((example) => ({
              german: String(example.german ?? ''),
              persian: String(example.persian ?? ''),
            }))
          : [];
        const persianMeanings = Array.isArray(content.persianMeanings)
          ? (content.persianMeanings as unknown[]).map(String)
          : [];
        return {
          cardVersionId: String(row.id),
          contentId: String(row.content_id),
          lemma: String(row.lemma),
          status: String(row.status) as 'auto_validated' | 'needs_review',
          article:
            content.article === null || content.article === undefined
              ? null
              : String(content.article),
          partOfSpeech: String(content.partOfSpeech ?? 'other'),
          persianMeanings,
          essentialInflection:
            content.essentialInflection === null || content.essentialInflection === undefined
              ? null
              : String(content.essentialInflection),
          pronunciationIpa:
            pronunciation && pronunciation.ipa !== null && pronunciation.ipa !== undefined
              ? String(pronunciation.ipa)
              : null,
          examples,
          mediaCount: media.length,
          sourceProvider: String(source?.provider ?? 'ai_suggestion'),
          sourceReference:
            source?.reference === null || source?.reference === undefined
              ? null
              : String(source.reference),
          checks: checksByVersion.get(String(row.id)) ?? [],
        };
      });
      return { status: 'ok', items };
    } finally {
      client.release();
    }
  }

  async recordCheck(
    actorUserId: string,
    input: ContentReviewCheckSubmission,
  ): Promise<ContentReviewCheckWriteResult> {
    if (!canonicalUuidPattern.test(actorUserId)) throw new Error('Actor user id is invalid.');
    if (!isContentReviewDimension(input.dimension)) {
      throw new Error(`unknown review dimension: ${input.dimension}`);
    }
    if (input.outcome !== 'passed' && input.outcome !== 'failed') {
      throw new Error('check outcome must be passed or failed');
    }
    if (!canonicalUuidPattern.test(input.idempotencyKey)) {
      throw new Error('Idempotency key is invalid.');
    }
    const notes = normalizedText(input.notes, 'Content review note', 1_200);

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      if (!(await this.roleQuery(client, actorUserId))) {
        await client.query('ROLLBACK');
        return { status: 'forbidden' };
      }

      const version = await client.query(
        'SELECT id, status FROM card_versions WHERE id = $1 FOR UPDATE',
        [input.cardVersionId],
      );
      const current = version.rows[0];
      if (!current) {
        await client.query('ROLLBACK');
        return { status: 'not_found' };
      }
      if (!isReviewable(String(current.status))) {
        await client.query('ROLLBACK');
        return { status: 'not_reviewable', currentStatus: String(current.status) };
      }

      const existing = await client.query(
        `SELECT id, outcome, idempotency_key
           FROM content_review_checks
          WHERE card_version_id = $1
            AND dimension = $2::content_review_dimension
          FOR UPDATE`,
        [input.cardVersionId, input.dimension],
      );
      const row = existing.rows[0];
      if (row) {
        if (
          String(row.outcome) !== 'pending' &&
          !(String(row.outcome) === input.outcome && row.idempotency_key === input.idempotencyKey)
        ) {
          await client.query('ROLLBACK');
          return { status: 'conflict' };
        }
        if (String(row.outcome) !== 'pending') {
          await client.query('ROLLBACK');
          return { status: 'idempotent' };
        }
      }

      if (row) {
        await client.query(
          `UPDATE content_review_checks
              SET outcome = $1,
                  reviewer_user_id = $2,
                  notes = $3,
                  reviewed_at = now(),
                  idempotency_key = $4
            WHERE card_version_id = $5
              AND dimension = $6::content_review_dimension`,
          [
            input.outcome,
            actorUserId,
            notes,
            input.idempotencyKey,
            input.cardVersionId,
            input.dimension,
          ],
        );
      } else {
        const checkKey = deterministicUuid5(
          `learnbox-check-key:${input.cardVersionId}:${input.dimension}`,
        );
        await client.query(
          `INSERT INTO content_review_checks
            (card_version_id, dimension, outcome, reviewer_user_id, notes, check_key, idempotency_key, reviewed_at)
           VALUES ($2, $3::content_review_dimension, $4, $1, $5, $6, $7, now())`,
          [
            actorUserId,
            input.cardVersionId,
            input.dimension,
            input.outcome,
            notes,
            checkKey,
            input.idempotencyKey,
          ],
        );
      }
      await client.query(
        `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
         VALUES ($1, $2, 'card_version', $3, $4)`,
        [
          actorUserId,
          'content_review.check',
          input.cardVersionId,
          {
            dimension: input.dimension,
            outcome: input.outcome,
            idempotency_key: input.idempotencyKey,
          },
        ],
      );
      await client.query('COMMIT');
      return { status: 'applied' };
    } catch (error) {
      await client.query('ROLLBACK');
      if (isUniqueConstraintViolation(error)) return { status: 'conflict' };
      throw error;
    } finally {
      client.release();
    }
  }

  async submitDecision(
    input: ContentReviewDecisionSubmission & { actorUserId: string },
  ): Promise<ContentReviewDecisionWriteResult> {
    const { actorUserId } = input;
    if (!canonicalUuidPattern.test(actorUserId)) throw new Error('Actor user id is invalid.');
    if (!decisionActions.has(input.action))
      throw new Error(`unknown review action: ${input.action}`);
    if (!canonicalUuidPattern.test(input.decisionKey)) throw new Error('Decision key is invalid.');
    const reason = normalizedText(input.reason, 'Content review reason', 1_200);

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      if (!(await this.roleQuery(client, actorUserId))) {
        await client.query('ROLLBACK');
        return { status: 'forbidden' };
      }

      const existingByKey = await client.query(
        'SELECT card_version_id, action FROM content_review_decisions WHERE decision_key = $1',
        [input.decisionKey],
      );
      const existingDecision = existingByKey.rows[0];
      if (existingDecision) {
        await client.query('ROLLBACK');
        if (
          String(existingDecision.card_version_id) === input.cardVersionId &&
          String(existingDecision.action) === input.action
        ) {
          return { status: 'idempotent', action: input.action };
        }
        return { status: 'conflict' };
      }

      const version = await client.query(
        'SELECT id, status FROM card_versions WHERE id = $1 FOR UPDATE',
        [input.cardVersionId],
      );
      const current = version.rows[0];
      if (!current) {
        await client.query('ROLLBACK');
        return { status: 'not_found' };
      }
      if (!isReviewable(String(current.status))) {
        await client.query('ROLLBACK');
        return { status: 'not_reviewable', currentStatus: String(current.status) };
      }

      if (input.action === 'approve') {
        const pending = await client.query(
          `SELECT required.dimension
             FROM unnest(ARRAY[
               'german_linguistic'::content_review_dimension,
               'persian_translation'::content_review_dimension,
               'provenance'::content_review_dimension,
               'visual'::content_review_dimension,
               'audio'::content_review_dimension,
               'app_flow'::content_review_dimension
             ]) AS required(dimension)
            WHERE NOT EXISTS (
              SELECT 1
                FROM content_review_checks check_row
               WHERE check_row.card_version_id = $1
                 AND check_row.dimension = required.dimension
                 AND check_row.outcome = 'passed'
            )
            ORDER BY required.dimension`,
          [input.cardVersionId],
        );
        if (pending.rows.length > 0) {
          await client.query('ROLLBACK');
          return {
            status: 'review_incomplete',
            pendingDimensions: pending.rows.map(
              ({ dimension }) => dimension as ContentReviewDimension,
            ),
          };
        }
      }

      const decision = await client.query(
        `INSERT INTO content_review_decisions
          (card_version_id, reviewer_user_id, action, reason, decision_key)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (decision_key) DO NOTHING
         RETURNING action`,
        [input.cardVersionId, actorUserId, input.action, reason, input.decisionKey],
      );
      if (!decision.rows[0]) {
        const concurrent = await client.query(
          'SELECT card_version_id, action FROM content_review_decisions WHERE decision_key = $1',
          [input.decisionKey],
        );
        await client.query('ROLLBACK');
        const concurrentRow = concurrent.rows[0];
        if (!concurrentRow) throw new Error('Idempotent content review was not available.');
        if (
          String(concurrentRow.card_version_id) === input.cardVersionId &&
          String(concurrentRow.action) === input.action
        ) {
          return { status: 'idempotent', action: input.action };
        }
        return { status: 'conflict' };
      }

      const nextStatus = nextStatusFor(input.action);
      if (input.action === 'return_for_revision') {
        await client.query(
          `UPDATE content_review_checks
              SET outcome = 'pending',
                  reviewer_user_id = NULL,
                  notes = NULL,
                  reviewed_at = NULL,
                  idempotency_key = NULL
            WHERE card_version_id = $1`,
          [input.cardVersionId],
        );
      }
      await client.query('UPDATE card_versions SET status = $2 WHERE id = $1', [
        input.cardVersionId,
        nextStatus,
      ]);
      await client.query(
        `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
         VALUES ($1, $2, 'card_version', $3, jsonb_build_object('decision_key', $4))`,
        [actorUserId, `content_review.${input.action}`, input.cardVersionId, input.decisionKey],
      );
      await client.query('COMMIT');
      return { status: 'applied', nextStatus };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
