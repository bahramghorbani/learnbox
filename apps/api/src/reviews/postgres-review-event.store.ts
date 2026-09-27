import type {
  CardSchedule,
  PersistedReviewEvent,
  ReviewEventInput,
  ReviewEventStore,
  ReviewEventWriteResult,
} from '@learnbox/learning-engine';
import type { Pool } from 'pg';

interface ReviewEventRow {
  id: string;
  user_id: string;
  card_id: string;
  grade: ReviewEventInput['grade'];
  occurred_at: Date;
  client_event_id: string;
  reconciliation_cursor: string | null;
}

interface ReconciliationCursorRow {
  cursor: string;
}

export interface MobileReviewReconciliationResult {
  cursor: string;
  nextCursor: string;
  hasMore: boolean;
  events: Array<{ clientEventId: string; eventId: string; appliedAt: string }>;
}

interface ScheduleRow {
  state: CardSchedule['state'];
  stability_days: number;
  difficulty: number;
  lapses: number;
  due_at: Date;
}

export interface ApprovedSchedule {
  cardId: string;
  schedule: CardSchedule;
}

/**
 * Same-learner client event id already exists with a different payload.
 * The batch service maps this to a typed `idempotencyConflict` outcome.
 */
export class ReviewIdempotencyConflictError extends Error {
  constructor(
    readonly userId: string,
    readonly clientEventId: string,
    message = 'Review idempotency conflict: existing event payload differs.',
  ) {
    super(message);
    this.name = 'ReviewIdempotencyConflictError';
  }
}

const payloadMatches = (existing: PersistedReviewEvent, input: ReviewEventInput): boolean =>
  existing.cardId === input.cardId &&
  existing.grade === input.grade &&
  existing.occurredAt.getTime() === input.occurredAt.getTime() &&
  existing.clientEventId === input.clientEventId;

const toSchedule = (row: ScheduleRow): CardSchedule => ({
  state: row.state,
  stabilityDays: row.stability_days,
  difficulty: row.difficulty,
  lapses: row.lapses,
  dueAt: row.due_at,
});

const toEvent = (row: ReviewEventRow): PersistedReviewEvent => ({
  id: row.id,
  userId: row.user_id,
  cardId: row.card_id,
  grade: row.grade,
  occurredAt: row.occurred_at,
  clientEventId: row.client_event_id,
});

// The event's own stored cursor (ADR 0014 per-event binding), never the current
// learner cursor: an idempotent replay must return the cursor that was assigned
// to that exact event. Legacy rows (applied before migration 0015) are NULL and
// coalesce to 0, matching the pre-cursor default.
const CURSOR_COLUMN = 'COALESCE(e.reconciliation_cursor, 0) AS cursor';

/** PostgreSQL adapter. Callers must pass a current schedule projection. */
export class PostgresReviewEventStore implements ReviewEventStore {
  constructor(private readonly pool: Pool) {}

  async findByClientEventId(clientEventId: string): Promise<ReviewEventWriteResult | null> {
    const result = await this.pool.query<ReviewEventRow & ScheduleRow & ReconciliationCursorRow>(
      `SELECT e.id, e.user_id, e.card_id, e.grade, e.occurred_at, e.client_event_id,
              s.state, s.stability_days, s.difficulty, s.lapses, s.due_at,
              ${CURSOR_COLUMN}
         FROM review_events e
         JOIN card_schedules s ON s.user_id = e.user_id AND s.card_id = e.card_id
        WHERE e.client_event_id = $1`,
      [clientEventId],
    );
    const row = result.rows[0];
    return row
      ? {
          event: toEvent(row),
          schedule: toSchedule(row),
          idempotent: true,
          reconciliationCursor: row.cursor,
        }
      : null;
  }

  async writeAtomically(
    input: ReviewEventInput,
    nextSchedule: CardSchedule,
  ): Promise<ReviewEventWriteResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const claimed = await client.query<ReviewEventRow>(
        `INSERT INTO review_events (id, user_id, card_id, grade, occurred_at, client_event_id, applied_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5,
                 GREATEST(
                   COALESCE((SELECT MAX(applied_at) FROM review_events prior
                              WHERE prior.user_id = $1 AND prior.card_id = $2), now()),
                   LEAST($4, now())))
         ON CONFLICT (user_id, client_event_id) DO NOTHING
         RETURNING id, user_id, card_id, grade, occurred_at, client_event_id`,
        [input.userId, input.cardId, input.grade, input.occurredAt, input.clientEventId],
      );

      if (claimed.rows.length === 0) {
        await client.query('ROLLBACK');
        const existing = await this.findByLearnerAndClientEventId(
          input.userId,
          input.clientEventId,
        );
        if (!existing) throw new Error('Idempotent review event was not available after conflict.');
        if (!payloadMatches(existing.event, input)) {
          throw new ReviewIdempotencyConflictError(input.userId, input.clientEventId);
        }
        return { ...existing, idempotent: true };
      }

      const schedule = await client.query<ScheduleRow>(
        `UPDATE card_schedules
            SET state = $3, stability_days = $4, difficulty = $5, lapses = $6, due_at = $7,
                last_reviewed_at = $8, updated_at = now()
          WHERE user_id = $1 AND card_id = $2
          RETURNING state, stability_days, difficulty, lapses, due_at`,
        [
          input.userId,
          input.cardId,
          nextSchedule.state,
          nextSchedule.stabilityDays,
          nextSchedule.difficulty,
          nextSchedule.lapses,
          nextSchedule.dueAt,
          input.occurredAt,
        ],
      );
      if (schedule.rows.length !== 1) {
        throw new Error('Card schedule must exist before accepting a review event.');
      }

      // ADR 0014: a newly claimed event that successfully updated the schedule
      // advances the learner cursor exactly once, in this same transaction.
      const cursor = await client.query<ReconciliationCursorRow>(
        `SELECT advance_learner_reconciliation_cursor($1) AS cursor`,
        [input.userId],
      );
      const eventCursor = cursor.rows[0]?.cursor ?? '0';

      // Bind the exact assigned cursor to the newly claimed event in the same
      // transaction, so idempotent replay and learner+cursor reads use the
      // event's own cursor rather than the current learner cursor.
      await client.query(
        `UPDATE review_events
            SET reconciliation_cursor = $2
          WHERE id = $1`,
        [claimed.rows[0].id, eventCursor],
      );

      await client.query('COMMIT');
      return {
        event: toEvent(claimed.rows[0]),
        schedule: toSchedule(schedule.rows[0]),
        idempotent: false,
        reconciliationCursor: eventCursor,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async findByLearnerAndClientEventId(
    userId: string,
    clientEventId: string,
  ): Promise<ReviewEventWriteResult | null> {
    const result = await this.pool.query<ReviewEventRow & ScheduleRow & ReconciliationCursorRow>(
      `SELECT e.id, e.user_id, e.card_id, e.grade, e.occurred_at, e.client_event_id,
              s.state, s.stability_days, s.difficulty, s.lapses, s.due_at,
              ${CURSOR_COLUMN}
         FROM review_events e
         JOIN card_schedules s ON s.user_id = e.user_id AND s.card_id = e.card_id
        WHERE e.user_id = $1 AND e.client_event_id = $2`,
      [userId, clientEventId],
    );
    const row = result.rows[0];
    return row
      ? {
          event: toEvent(row),
          schedule: toSchedule(row),
          idempotent: true,
          reconciliationCursor: row.cursor,
        }
      : null;
  }

  /** Resolves a canonical content id to the DB card uuid; null when unknown. */
  async resolveCardId(contentId: string): Promise<string | null> {
    const result = await this.pool.query<{ id: string }>(
      `SELECT c.id
         FROM cards c
        WHERE c.content_id = $1
          AND EXISTS (
            SELECT 1
              FROM card_versions cv
             WHERE cv.card_id = c.id
               AND cv.status IN ('approved', 'published')
          )`,
      [contentId],
    );
    return result.rows[0]?.id ?? null;
  }

  /**
   * Creates only the submitted approved/published card schedule. Unknown, draft and rejected
   * content fails closed; the unique key makes concurrent first submissions idempotent.
   */
  async ensureApprovedSchedule(
    userId: string,
    contentId: string,
  ): Promise<ApprovedSchedule | null> {
    const inserted = await this.pool.query<ScheduleRow & { card_id: string }>(
      `INSERT INTO card_schedules (user_id, card_id)
       SELECT $1, c.id
         FROM cards c
        WHERE c.content_id = $2
          AND EXISTS (
            SELECT 1
              FROM card_versions cv
             WHERE cv.card_id = c.id
               AND cv.status IN ('approved', 'published')
          )
       ON CONFLICT (user_id, card_id) DO NOTHING
       RETURNING card_id, state, stability_days, difficulty, lapses, due_at`,
      [userId, contentId],
    );
    const created = inserted.rows[0];
    if (created) return { cardId: created.card_id, schedule: toSchedule(created) };

    const existing = await this.pool.query<ScheduleRow & { card_id: string }>(
      `SELECT c.id AS card_id, s.state, s.stability_days, s.difficulty, s.lapses, s.due_at
         FROM cards c
         JOIN card_schedules s ON s.card_id = c.id AND s.user_id = $1
        WHERE c.content_id = $2
          AND EXISTS (
            SELECT 1
              FROM card_versions cv
             WHERE cv.card_id = c.id
               AND cv.status IN ('approved', 'published')
          )`,
      [userId, contentId],
    );
    const row = existing.rows[0];
    return row ? { cardId: row.card_id, schedule: toSchedule(row) } : null;
  }

  async findSchedule(userId: string, cardId: string): Promise<CardSchedule | null> {
    const result = await this.pool.query<ScheduleRow>(
      `SELECT state, stability_days, difficulty, lapses, due_at
         FROM card_schedules
        WHERE user_id = $1 AND card_id = $2`,
      [userId, cardId],
    );
    const row = result.rows[0];
    return row ? toSchedule(row) : null;
  }

  async readReconciliation(
    userId: string,
    after: string,
    pageSize = 100,
  ): Promise<MobileReviewReconciliationResult> {
    const rows = await this.pool.query<{
      client_event_id: string;
      event_id: string;
      applied_at: Date;
      reconciliation_cursor: string;
    }>(
      `SELECT e.client_event_id, e.id AS event_id, e.applied_at, e.reconciliation_cursor
         FROM review_events e
        WHERE e.user_id = $1
          AND e.reconciliation_cursor IS NOT NULL
          AND e.reconciliation_cursor > $2::bigint
        ORDER BY e.reconciliation_cursor ASC
        LIMIT $3`,
      [userId, after, pageSize + 1],
    );
    const hasMore = rows.rows.length > pageSize;
    const events = rows.rows.slice(0, pageSize).map((row) => ({
      clientEventId: row.client_event_id,
      eventId: row.event_id,
      appliedAt: row.applied_at.toISOString(),
    }));
    const nextCursor =
      events.length === 0 ? after : rows.rows[events.length - 1].reconciliation_cursor;
    return { cursor: after, nextCursor, hasMore, events };
  }
}
