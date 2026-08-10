import type { NormalizedSplashCandidate } from './replace-splash';

type QueryResult = { rows: Record<string, unknown>[] };
type TransactionClient = {
  query(sql: string, parameters?: readonly unknown[]): Promise<QueryResult>;
  release(): void;
};
type DatabasePool = { connect(): Promise<TransactionClient> };

const splashPromotionLockId = 1_954_127_803;

type PromotionInput = {
  actionId: string;
  versionId: string;
  objectKey: string;
  candidate: NormalizedSplashCandidate;
  now: Date;
};

export class PostgresSplashStore {
  constructor(private readonly pool: DatabasePool) {}

  async claimCleanupJobs(input: {
    now: Date;
    limit: number;
  }): Promise<Array<{ id: string; objectKey: string; attemptCount: number }>> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `WITH due AS (
           SELECT id
             FROM private_media_cleanup_jobs
            WHERE completed_at IS NULL
              AND attempt_count < 5
              AND next_attempt_at <= $1
            ORDER BY next_attempt_at, created_at
            FOR UPDATE SKIP LOCKED
            LIMIT $2
         )
         UPDATE private_media_cleanup_jobs AS cleanup
            SET attempt_count = cleanup.attempt_count + 1,
                next_attempt_at = $1 + INTERVAL '15 minutes'
           FROM due
          WHERE cleanup.id = due.id
         RETURNING cleanup.id, cleanup.object_key, cleanup.attempt_count`,
        [input.now, Math.max(1, Math.min(25, input.limit))],
      );
      return result.rows.map((row) => ({
        id: String(row.id),
        objectKey: String(row.object_key),
        attemptCount: Number(row.attempt_count),
      }));
    } finally {
      client.release();
    }
  }

  async completeCleanup(id: string, now: Date): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(
        `UPDATE private_media_cleanup_jobs
            SET completed_at = $2, last_error_code = NULL
          WHERE id = $1 AND completed_at IS NULL`,
        [id, now],
      );
    } finally {
      client.release();
    }
  }

  async rescheduleCleanup(input: {
    id: string;
    attemptCount: number;
    nextAttemptAt: Date;
    lastErrorCode: 'delete_failed';
  }): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(
        `UPDATE private_media_cleanup_jobs
            SET next_attempt_at = $3, last_error_code = $4
          WHERE id = $1
            AND attempt_count = $2
            AND attempt_count < 5
            AND completed_at IS NULL`,
        [input.id, input.attemptCount, input.nextAttemptAt, input.lastErrorCode],
      );
    } finally {
      client.release();
    }
  }

  async exhaustCleanup(input: {
    id: string;
    attemptCount: number;
    completedAt: Date;
    lastErrorCode: 'delete_failed_exhausted';
  }): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(
        `UPDATE private_media_cleanup_jobs
            SET completed_at = $3, last_error_code = 'delete_failed_exhausted'
          WHERE id = $1
            AND attempt_count = $2
            AND attempt_count >= 5
            AND completed_at IS NULL`,
        [input.id, input.attemptCount, input.completedAt],
      );
    } finally {
      client.release();
    }
  }

  async abandonReplacement(actionId: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(
        `DELETE FROM splash_replacement_actions
          WHERE id = $1 AND status = 'pending'`,
        [actionId],
      );
    } finally {
      client.release();
    }
  }

  async queueCleanup(input: {
    objectKey: string;
    reasonCode: 'candidate_after_transaction_failure' | 'superseded_after_promotion';
    now: Date;
  }): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(
        `INSERT INTO private_media_cleanup_jobs
          (object_key, reason_code, next_attempt_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (object_key) DO UPDATE
           SET reason_code = EXCLUDED.reason_code,
               next_attempt_at = LEAST(private_media_cleanup_jobs.next_attempt_at,
                                       EXCLUDED.next_attempt_at)`,
        [input.objectKey, input.reasonCode, input.now],
      );
    } finally {
      client.release();
    }
  }

  async reserveReplacement(input: {
    idempotencyKeyHash: string;
    now: Date;
  }): Promise<
    | { status: 'reserved'; actionId: string }
    | { status: 'completed'; versionId: string }
    | { status: 'in_progress' }
  > {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const inserted = await client.query(
        `INSERT INTO splash_replacement_actions (idempotency_key_hash, status, created_at)
         VALUES ($1, 'pending', $2)
         ON CONFLICT (idempotency_key_hash) DO NOTHING
         RETURNING id`,
        [input.idempotencyKeyHash, input.now],
      );
      if (!inserted.rows[0]?.id) {
        const existing = await client.query(
          `SELECT status, version_id
             FROM splash_replacement_actions
            WHERE idempotency_key_hash = $1
            FOR SHARE`,
          [input.idempotencyKeyHash],
        );
        const row = existing.rows[0];
        if (!row) throw new Error('Splash replacement reservation is unavailable.');
        await client.query('COMMIT');
        if (row.status === 'completed' && row.version_id) {
          return { status: 'completed', versionId: String(row.version_id) };
        }
        return { status: 'in_progress' };
      }
      await client.query('COMMIT');
      return { status: 'reserved', actionId: String(inserted.rows[0].id) };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async promoteReplacement(input: PromotionInput): Promise<{
    status: 'promoted';
    versionId: string;
    previousObjectKey?: string;
  }> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock($1)', [splashPromotionLockId]);
      const action = await client.query(
        `SELECT status, version_id
           FROM splash_replacement_actions
          WHERE id = $1
          FOR UPDATE`,
        [input.actionId],
      );
      if (action.rows[0]?.status !== 'pending') {
        throw new Error('Splash replacement action is not pending.');
      }

      const current = await client.query(
        `SELECT current_splash.version_id, splash_versions.object_key
           FROM current_splash
           JOIN splash_versions ON splash_versions.id = current_splash.version_id
          WHERE current_splash.singleton_id = 1
          FOR UPDATE OF current_splash`,
      );
      const previousObjectKey = current.rows[0]?.object_key
        ? String(current.rows[0].object_key)
        : undefined;

      await client.query(
        `INSERT INTO splash_versions
          (id, object_key, checksum, width, height, byte_size, media_type, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          input.versionId,
          input.objectKey,
          input.candidate.checksum,
          input.candidate.width,
          input.candidate.height,
          input.candidate.byteSize,
          input.candidate.mediaType,
          input.now,
        ],
      );
      await client.query(
        `INSERT INTO current_splash (singleton_id, version_id, updated_at)
         VALUES (1, $1, $2)
         ON CONFLICT (singleton_id) DO UPDATE
           SET version_id = EXCLUDED.version_id, updated_at = EXCLUDED.updated_at`,
        [input.versionId, input.now],
      );
      await client.query(
        `UPDATE splash_replacement_actions
            SET version_id = $2, status = 'completed', completed_at = $3
          WHERE id = $1 AND status = 'pending'`,
        [input.actionId, input.versionId, input.now],
      );
      await client.query(
        `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
         VALUES (NULL, 'splash.replaced', 'splash_version', $1,
                 jsonb_build_object('previous_version_id', $2::text))`,
        [input.versionId, current.rows[0]?.version_id ?? null],
      );
      await client.query('COMMIT');
      return { status: 'promoted', versionId: input.versionId, previousObjectKey };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
