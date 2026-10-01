import type { Pool } from 'pg';

import type {
  DailyPlanStore,
  LearnerNewCardCandidate,
  LearnerScheduleRow,
  LearnerStateRepository,
} from './learner-state.service.js';

interface ScheduleRow {
  card_id: string;
  content_id: string;
  state: LearnerScheduleRow['state'];
  stability_days: number;
  difficulty: number;
  lapses: number;
  due_at: Date;
}

interface NewCardRow {
  card_id: string;
  content_id: string;
}

const START_CONTENT_ID_PATTERN = 'start-a1-%';
const MAX_NEW_CARD_CANDIDATES = 12;

/** Read-only learner state projection. No writes; the review write path owns mutations. */
export class PostgresLearnerStateRepository implements LearnerStateRepository, DailyPlanStore {
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

  async findNewCardCandidates(userId: string, limit: number): Promise<LearnerNewCardCandidate[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_NEW_CARD_CANDIDATES) {
      throw new RangeError(`candidate limit must be between 1 and ${MAX_NEW_CARD_CANDIDATES}`);
    }
    const result = await this.pool.query<NewCardRow>(
      `SELECT c.id AS card_id, c.content_id
         FROM cards c
         LEFT JOIN card_schedules s
           ON s.user_id = $1 AND s.card_id = c.id
        WHERE s.card_id IS NULL
          AND c.content_id LIKE $2
          AND EXISTS (
            SELECT 1
              FROM card_versions cv
             WHERE cv.card_id = c.id
               AND cv.status IN ('approved', 'published')
          )
        ORDER BY c.content_id
        LIMIT $3`,
      [userId, START_CONTENT_ID_PATTERN, limit],
    );
    return result.rows.map((row) => ({
      cardId: row.card_id,
      contentId: row.content_id,
      importance: 1,
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

  // --- DailyPlanStore (LB-B35 CP4; only used behind LEARNBOX_SERVER_SESSION_PLAN) -----------------

  async readStoredTimeZone(userId: string): Promise<string | null> {
    const result = await this.pool.query<{ timezone: string | null }>(
      'SELECT timezone FROM users WHERE id = $1',
      [userId],
    );
    return result.rows[0]?.timezone ?? null;
  }

  async persistTimeZone(userId: string, timeZone: string): Promise<void> {
    await this.pool.query('UPDATE users SET timezone = $2 WHERE id = $1 AND timezone IS NULL', [
      userId,
      timeZone,
    ]);
  }

  async readAllowance(userId: string, localDay: string): Promise<string[] | null> {
    const result = await this.pool.query<{ new_card_ids: string[] }>(
      'SELECT new_card_ids FROM learner_daily_plans WHERE user_id = $1 AND local_day = $2::date',
      [userId, localDay],
    );
    return result.rows[0]?.new_card_ids ?? null;
  }

  async freezeAllowance(
    userId: string,
    localDay: string,
    timeZone: string,
    cardIds: string[],
  ): Promise<string[]> {
    await this.pool.query(
      `INSERT INTO learner_daily_plans (user_id, local_day, time_zone, new_card_ids)
       VALUES ($1, $2::date, $3, $4::uuid[])
       ON CONFLICT (user_id, local_day) DO NOTHING`,
      [userId, localDay, timeZone, cardIds],
    );
    return (await this.readAllowance(userId, localDay)) ?? [];
  }

  async findNewCardsByIds(userId: string, cardIds: string[]): Promise<LearnerNewCardCandidate[]> {
    if (cardIds.length === 0) return [];
    const result = await this.pool.query<NewCardRow>(
      `SELECT c.id AS card_id, c.content_id
         FROM cards c
         LEFT JOIN card_schedules s ON s.user_id = $1 AND s.card_id = c.id
        WHERE c.id = ANY($2::uuid[])
          AND s.card_id IS NULL
          AND EXISTS (
            SELECT 1 FROM card_versions cv
             WHERE cv.card_id = c.id AND cv.status IN ('approved', 'published')
          )
        ORDER BY c.content_id`,
      [userId, cardIds],
    );
    return result.rows.map((row) => ({
      cardId: row.card_id,
      contentId: row.content_id,
      importance: 1,
    }));
  }
}
