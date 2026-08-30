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
}

interface ReconciliationCursorRow {
  cursor: number;
}

interface ScheduleRow {
  state: CardSchedule['state'];
  stability_days: number;
  difficulty: number;
  lapses: number;
  due_at: Date;
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

const CURSOR_COLUMN = 'COALESCE(c.cursor, 0) AS cursor';

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
         LEFT JOIN learner_reconciliation_cursors c ON c.user_id = e.user_id
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

      await client.query('COMMIT');
      return {
        event: toEvent(claimed.rows[0]),
        schedule: toSchedule(schedule.rows[0]),
        idempotent: false,
        reconciliationCursor: cursor.rows[0]?.cursor ?? 0,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async findByLearnerAndClientEventId(
    userId: string,
    clientEventId: string,
  ): Promise<ReviewEventWriteResult | null> {
    const result = await this.pool.query<ReviewEventRow & ScheduleRow & ReconciliationCursorRow>(
      `SELECT e.id, e.user_id, e.card_id, e.grade, e.occurred_at, e.client_event_id,
              s.state, s.stability_days, s.difficulty, s.lapses, s.due_at,
              ${CURSOR_COLUMN}
         FROM review_events e
         JOIN card_schedules s ON s.user_id = e.user_id AND s.card_id = e.card_id
         LEFT JOIN learner_reconciliation_cursors c ON c.user_id = e.user_id
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

  /** Idempotent server-owned schedule bootstrap for a learner (approved content only). */
  async bootstrapSchedules(userId: string): Promise<void> {
    await this.pool.query(`SELECT bootstrap_approved_card_schedules($1)`, [userId]);
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
}
