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

interface ScheduleRow {
  state: CardSchedule['state'];
  stability_days: number;
  difficulty: number;
  lapses: number;
  due_at: Date;
}

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

/** PostgreSQL adapter. Callers must pass a current schedule projection. */
export class PostgresReviewEventStore implements ReviewEventStore {
  constructor(private readonly pool: Pool) {}

  async findByClientEventId(clientEventId: string): Promise<ReviewEventWriteResult | null> {
    const result = await this.pool.query<ReviewEventRow & ScheduleRow>(
      `SELECT e.id, e.user_id, e.card_id, e.grade, e.occurred_at, e.client_event_id,
              s.state, s.stability_days, s.difficulty, s.lapses, s.due_at
         FROM review_events e
         JOIN card_schedules s ON s.user_id = e.user_id AND s.card_id = e.card_id
        WHERE e.client_event_id = $1`,
      [clientEventId],
    );
    const row = result.rows[0];
    return row ? { event: toEvent(row), schedule: toSchedule(row), idempotent: true } : null;
  }

  async writeAtomically(
    input: ReviewEventInput,
    nextSchedule: CardSchedule,
  ): Promise<ReviewEventWriteResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const claimed = await client.query<ReviewEventRow>(
        `INSERT INTO review_events (id, user_id, card_id, grade, occurred_at, client_event_id)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)
         ON CONFLICT (client_event_id) DO NOTHING
         RETURNING id, user_id, card_id, grade, occurred_at, client_event_id`,
        [input.userId, input.cardId, input.grade, input.occurredAt, input.clientEventId],
      );

      if (claimed.rows.length === 0) {
        await client.query('ROLLBACK');
        const existing = await this.findByClientEventId(input.clientEventId);
        if (!existing) throw new Error('Idempotent review event was not available after conflict.');
        return existing;
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

      await client.query('COMMIT');
      return {
        event: toEvent(claimed.rows[0]),
        schedule: toSchedule(schedule.rows[0]),
        idempotent: false,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
