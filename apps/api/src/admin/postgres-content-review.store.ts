import type { Pool } from 'pg';

export type ContentReviewAction = 'approve' | 'return_for_revision' | 'reject';

type ReviewableContentStatus = 'auto_validated' | 'needs_review';
type NextContentStatus = 'approved' | 'rejected';

export interface ContentReviewSubmission {
  actorUserId: string;
  cardVersionId: string;
  action: ContentReviewAction;
  decisionKey: string;
  reason?: string;
}

export type ContentReviewWriteResult =
  | { status: 'applied'; nextStatus: NextContentStatus }
  | { action: ContentReviewAction; status: 'idempotent' }
  | { status: 'forbidden' }
  | { status: 'not_found' }
  | { pendingDimensions: string[]; status: 'review_incomplete' }
  | { currentStatus: string; status: 'not_reviewable' };

type ContentVersionRow = { id: string; status: string };
type DecisionRow = { action: ContentReviewAction };

const reviewableStatuses: readonly ReviewableContentStatus[] = ['auto_validated', 'needs_review'];

function nextStatusFor(action: ContentReviewAction): NextContentStatus {
  return action === 'approve' ? 'approved' : 'rejected';
}

function normalizedReason(reason: string | undefined): string | null {
  if (reason === undefined) return null;
  const value = reason.trim();
  if (value.length > 1_200) throw new Error('Content review reason is too long.');
  return value || null;
}

/**
 * Server-only persistence seam for the future authenticated content-review endpoint. The caller
 * supplies an actor derived from the server session; roles are read from PostgreSQL and never from
 * a browser request. This class intentionally provides no publication operation.
 */
export class PostgresContentReviewStore {
  constructor(private readonly pool: Pool) {}

  async submit(input: ContentReviewSubmission): Promise<ContentReviewWriteResult> {
    const reason = normalizedReason(input.reason);
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');
      const roles = await client.query(
        `SELECT role
           FROM admin_role_assignments
          WHERE user_id = $1 AND role IN ('content_reviewer', 'super_admin')
          FOR SHARE`,
        [input.actorUserId],
      );
      if (roles.rows.length === 0) {
        await client.query('ROLLBACK');
        return { status: 'forbidden' };
      }

      const existing = await client.query<DecisionRow>(
        'SELECT action FROM content_review_decisions WHERE decision_key = $1',
        [input.decisionKey],
      );
      if (existing.rows[0]) {
        await client.query('ROLLBACK');
        return { status: 'idempotent', action: existing.rows[0].action };
      }

      const version = await client.query<ContentVersionRow>(
        'SELECT id, status FROM card_versions WHERE id = $1 FOR UPDATE',
        [input.cardVersionId],
      );
      const current = version.rows[0];
      if (!current) {
        await client.query('ROLLBACK');
        return { status: 'not_found' };
      }
      if (!reviewableStatuses.includes(current.status as ReviewableContentStatus)) {
        await client.query('ROLLBACK');
        return { status: 'not_reviewable', currentStatus: current.status };
      }

      if (input.action === 'approve') {
        const pending = await client.query<{ dimension: string }>(
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
            pendingDimensions: pending.rows.map(({ dimension }) => dimension),
          };
        }
      }

      const decision = await client.query<DecisionRow>(
        `INSERT INTO content_review_decisions
          (card_version_id, reviewer_user_id, action, reason, decision_key)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (decision_key) DO NOTHING
         RETURNING action`,
        [input.cardVersionId, input.actorUserId, input.action, reason, input.decisionKey],
      );
      if (!decision.rows[0]) {
        const concurrent = await client.query<DecisionRow>(
          'SELECT action FROM content_review_decisions WHERE decision_key = $1',
          [input.decisionKey],
        );
        await client.query('ROLLBACK');
        if (!concurrent.rows[0]) throw new Error('Idempotent content review was not available.');
        return { status: 'idempotent', action: concurrent.rows[0].action };
      }

      const nextStatus = nextStatusFor(input.action);
      await client.query('UPDATE card_versions SET status = $2 WHERE id = $1', [
        input.cardVersionId,
        nextStatus,
      ]);
      await client.query(
        `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
         VALUES ($1, $2, 'card_version', $3, jsonb_build_object('decision_key', $4))`,
        [
          input.actorUserId,
          `content_review.${input.action}`,
          input.cardVersionId,
          input.decisionKey,
        ],
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
