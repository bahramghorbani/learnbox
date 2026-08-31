import type { Pool } from 'pg';

import type { LearnerScheduleRow, LearnerStateRepository } from './learner-state.service.js';

interface ScheduleRow {
  card_id: string;
  content_id: string;
  state: LearnerScheduleRow['state'];
  stability_days: number;
  difficulty: number;
  lapses: number;
  due_at: Date;
}

/** Read-only learner state projection. No writes; the review write path owns mutations. */
export class PostgresLearnerStateRepository implements LearnerStateRepository {
  constructor(private readonly pool: Pool) {}

  async findSchedules(userId: string): Promise<LearnerScheduleRow[]> {
    const result = await this.pool.query<ScheduleRow>(
      `SELECT s.card_id, c.content_id, s.state, s.stability_days, s.difficulty, s.lapses, s.due_at
         FROM card_schedules s
         JOIN cards c ON c.id = s.card_id
        WHERE s.user_id = $1
        ORDER BY s.due_at, s.card_id`,
      [userId],
    );
    return result.rows.map((row) => ({
      cardId: row.card_id,
      contentId: row.content_id,
      state: row.state,
      stabilityDays: row.stability_days,
      difficulty: row.difficulty,
      lapses: row.lapses,
      dueAt: row.due_at,
    }));
  }

  async countReviewEvents(userId: string): Promise<number> {
    const result = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM review_events
        WHERE user_id = $1`,
      [userId],
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  /**
   * Authoritative per-learner reconciliation cursor (ADR 0014). BIGINT is cast
   * to text so the decimal string survives without JS-number precision loss;
   * no row means the learner never had an applied event, so the cursor is '0'.
   */
  async readReconciliationCursor(userId: string): Promise<string> {
    const result = await this.pool.query<{ cursor: string }>(
      `SELECT cursor::text AS cursor
         FROM learner_reconciliation_cursors
        WHERE user_id = $1`,
      [userId],
    );
    return result.rows[0]?.cursor ?? '0';
  }
}
