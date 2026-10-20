import { randomUUID } from 'node:crypto';

import type { CardMediaGenerationService } from './card-media-generation-service';
import type { CardMediaKind } from './card-media-storage';

type QueryResult = { rows: Record<string, unknown>[] };
type Queryable = { query(sql: string, parameters?: readonly unknown[]): Promise<QueryResult> };
type DatabaseClient = Queryable & { release(): void };
type DatabasePool = Queryable & { connect(): Promise<DatabaseClient> };

type JobStatus =
  'queued' | 'running' | 'stopped' | 'completed' | 'completed_with_deferred' | 'needs_attention';
type ItemStatus =
  | 'pending'
  | 'leased'
  | 'dispatching'
  | 'generated'
  | 'not_needed'
  | 'in_progress'
  | 'needs_attention'
  | 'deferred'
  | 'stopped';

const kinds: readonly CardMediaKind[] = ['image', 'word_audio', 'sentence_audio'];
const runnerGapSeconds = 5;

export type PackMediaJobItemView = {
  id: string;
  cardId: string;
  kind: CardMediaKind;
  status: ItemStatus;
  candidateId: string | null;
  detail: string | null;
  updatedAt: string | null;
};

export type PackMediaJobView = {
  id: string;
  packId: string;
  status: JobStatus;
  stopRequested: boolean;
  estimatedMaxSeconds: number;
  /** Last durable completion, never an optimistic client-side estimate. */
  lastProgressAt: string | null;
  counts: Record<ItemStatus, number>;
  items: PackMediaJobItemView[];
};

function itemStatus(value: unknown): ItemStatus {
  const known: readonly ItemStatus[] = [
    'pending',
    'leased',
    'dispatching',
    'generated',
    'not_needed',
    'in_progress',
    'needs_attention',
    'deferred',
    'stopped',
  ];
  return known.includes(value as ItemStatus) ? (value as ItemStatus) : 'needs_attention';
}

function jobStatus(value: unknown): JobStatus {
  const known: readonly JobStatus[] = [
    'queued',
    'running',
    'stopped',
    'completed',
    'completed_with_deferred',
    'needs_attention',
  ];
  return known.includes(value as JobStatus) ? (value as JobStatus) : 'needs_attention';
}

function iso(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

/**
 * Durable, single-item pack-media runner. It owns dispatch state only; candidate creation stays in
 * CardMediaGenerationService, so automatic acceptance and publishing are impossible here.
 */
export class PackMediaJobService {
  constructor(
    private readonly pool: DatabasePool,
    private readonly media: CardMediaGenerationService,
    private readonly limits: { imageTimeoutMs: number; audioTimeoutMs: number },
  ) {}

  private async editorial(actorUserId: string) {
    const result = await this.pool.query(
      `SELECT 1 FROM admin_role_assignments
        WHERE user_id = $1 AND role IN ('content_reviewer', 'super_admin')`,
      [actorUserId],
    );
    return result.rows.length > 0;
  }

  private async latestVersion(cardId: string) {
    const result = await this.pool.query(
      `SELECT id FROM card_versions WHERE card_id = $1 ORDER BY version DESC LIMIT 1`,
      [cardId],
    );
    return result.rows[0] ? String(result.rows[0].id) : undefined;
  }

  private get leaseSeconds() {
    // The lease must outlive the configured provider timeout; otherwise a second timer tick could
    // mark a still-running request unknown and permit no safe recovery.
    return Math.ceil(Math.max(this.limits.imageTimeoutMs, this.limits.audioTimeoutMs) / 1000) + 60;
  }

  private estimate(items: readonly { kind: CardMediaKind }[]) {
    // Transparent upper bound: configured per-call timeout plus the 5s interval after each item.
    const providerSeconds = items.reduce(
      (total, item) =>
        total +
        Math.ceil(
          (item.kind === 'image' ? this.limits.imageTimeoutMs : this.limits.audioTimeoutMs) / 1000,
        ),
      0,
    );
    return providerSeconds + Math.max(0, items.length - 1) * runnerGapSeconds;
  }

  /** The snapshot is atomic: a runner cannot see a queued job without all its approved items. */
  async create(actorUserId: string, packId: string) {
    if (!(await this.editorial(actorUserId))) return { status: 'forbidden' as const };
    const cards = await this.pool.query(
      `SELECT pc.card_id
         FROM pack_cards pc
         JOIN packs p ON p.id = pc.pack_id
        WHERE pc.pack_id = $1
        ORDER BY pc.sort_order, pc.card_id`,
      [packId],
    );
    if (cards.rows.length === 0) return { status: 'not_found' as const };

    const items: { cardId: string; kind: CardMediaKind; cardVersionId: string }[] = [];
    for (const row of cards.rows) {
      const cardId = String(row.card_id);
      const version = await this.latestVersion(cardId);
      if (!version) return { status: 'needs_attention' as const, reason: 'card_version_missing' };
      const states = await this.media.getCardMediaState(cardId);
      for (const kind of kinds) {
        if (states.find((state) => state.kind === kind)?.needsGeneration) {
          items.push({ cardId, kind, cardVersionId: version });
        }
      }
    }
    if (items.length === 0) return { status: 'nothing_needed' as const };

    const client = await this.pool.connect();
    let result: { status: 'created' | 'existing'; jobId: string };
    try {
      await client.query('BEGIN');
      const active = await client.query(
        `SELECT id FROM pack_media_jobs
          WHERE pack_id = $1 AND actor_user_id = $2 AND status IN ('queued', 'running', 'needs_attention', 'completed_with_deferred')
          ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
        [packId, actorUserId],
      );
      if (active.rows[0]) {
        result = { status: 'existing', jobId: String(active.rows[0].id) };
      } else {
        const inserted = await client.query(
          `INSERT INTO pack_media_jobs
            (pack_id, actor_user_id, request_key, status, estimated_max_seconds)
           VALUES ($1, $2, $3, 'queued', $4)
           ON CONFLICT DO NOTHING
           RETURNING id`,
          [packId, actorUserId, randomUUID(), this.estimate(items)],
        );
        if (!inserted.rows[0]) {
          // The partial unique index is the cross-transaction single-flight gate. Never create a
          // second chargeable job if a concurrent approval beat this request.
          const existing = await client.query(
            `SELECT id FROM pack_media_jobs
              WHERE pack_id = $1 AND actor_user_id = $2 AND status IN ('queued', 'running', 'needs_attention', 'completed_with_deferred')
              ORDER BY created_at DESC LIMIT 1`,
            [packId, actorUserId],
          );
          if (!existing.rows[0]) throw new Error('pack media job insert was not durable');
          result = { status: 'existing', jobId: String(existing.rows[0].id) };
        } else {
          const jobId = String(inserted.rows[0].id);
          for (const item of items) {
            await client.query(
              `INSERT INTO pack_media_job_items (job_id, card_id, kind, card_version_id, status)
               VALUES ($1, $2, $3, $4, 'pending')`,
              [jobId, item.cardId, item.kind, item.cardVersionId],
            );
          }
          result = { status: 'created', jobId };
        }
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
    return { status: result!.status, job: await this.get(result!.jobId, actorUserId) };
  }

  async get(jobId: string, actorUserId: string): Promise<PackMediaJobView | undefined> {
    if (!(await this.editorial(actorUserId))) return undefined;
    const job = await this.pool.query(
      `SELECT id, pack_id, status, stop_requested, estimated_max_seconds
         FROM pack_media_jobs WHERE id = $1 AND actor_user_id = $2`,
      [jobId, actorUserId],
    );
    const row = job.rows[0];
    if (!row) return undefined;
    const itemRows = await this.pool.query(
      `SELECT id, card_id, kind, status, candidate_id, detail, updated_at
         FROM pack_media_job_items WHERE job_id = $1 ORDER BY created_at, card_id, kind`,
      [jobId],
    );
    const counts = Object.fromEntries(
      [
        'pending',
        'leased',
        'dispatching',
        'generated',
        'not_needed',
        'in_progress',
        'needs_attention',
        'deferred',
        'stopped',
      ].map((status) => [status, 0]),
    ) as Record<ItemStatus, number>;
    const items = itemRows.rows.map((entry) => {
      const status = itemStatus(entry.status);
      counts[status] += 1;
      return {
        id: String(entry.id),
        cardId: String(entry.card_id),
        kind: entry.kind as CardMediaKind,
        status,
        candidateId: iso(entry.candidate_id),
        detail: iso(entry.detail),
        updatedAt: iso(entry.updated_at),
      };
    });
    const lastProgressAt = items
      .filter((item) => item.status === 'generated' || item.status === 'not_needed')
      .map((item) => item.updatedAt)
      .filter((updatedAt): updatedAt is string => updatedAt !== null)
      .reduce<string | null>(
        (latest, updatedAt) =>
          latest === null || Date.parse(updatedAt) > Date.parse(latest) ? updatedAt : latest,
        null,
      );
    return {
      id: String(row.id),
      packId: String(row.pack_id),
      status: jobStatus(row.status),
      stopRequested: row.stop_requested === true,
      estimatedMaxSeconds: Number(row.estimated_max_seconds),
      lastProgressAt,
      counts,
      items,
    };
  }

  async latest(packId: string, actorUserId: string) {
    if (!(await this.editorial(actorUserId))) return undefined;
    const result = await this.pool.query(
      `SELECT id FROM pack_media_jobs WHERE pack_id = $1 AND actor_user_id = $2
       ORDER BY created_at DESC LIMIT 1`,
      [packId, actorUserId],
    );
    return result.rows[0] ? this.get(String(result.rows[0].id), actorUserId) : undefined;
  }

  async stop(jobId: string, actorUserId: string) {
    if (!(await this.editorial(actorUserId))) return undefined;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const stopped = await client.query(
        `UPDATE pack_media_jobs SET stop_requested = true, updated_at = now()
          WHERE id = $1 AND actor_user_id = $2 AND status IN ('queued', 'running')
          RETURNING id`,
        [jobId, actorUserId],
      );
      if (!stopped.rows[0]) {
        await client.query('COMMIT');
        return this.get(jobId, actorUserId);
      }
      await client.query(
        `UPDATE pack_media_job_items SET status = 'stopped', lease_token = NULL, lease_until = NULL,
                updated_at = now()
          WHERE job_id = $1 AND status IN ('pending', 'leased')`,
        [jobId],
      );
      await client.query(
        `UPDATE pack_media_jobs SET status = 'stopped', updated_at = now()
          WHERE id = $1 AND NOT EXISTS (
            SELECT 1 FROM pack_media_job_items WHERE job_id = $1 AND status = 'dispatching'
          )`,
        [jobId],
      );
      await client.query('COMMIT');
      return this.get(jobId, actorUserId);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  /** Resolves only the locked snapshot item; no provider call occurs in this request. */
  async resolve(
    jobId: string,
    itemId: string,
    actorUserId: string,
    action: 'defer' | 'retry',
    reason: string,
    confirmedPotentialDuplicateCharge: boolean,
    confirmedContinuePending = false,
  ) {
    const normalizedReason = reason.trim();
    if (!normalizedReason || normalizedReason.length > 1200) return { status: 'invalid' as const };
    if (action === 'retry' && !confirmedPotentialDuplicateCharge)
      return { status: 'confirmation_required' as const };
    if (!(await this.editorial(actorUserId))) return { status: 'forbidden' as const };
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const locked = await client.query(
        `SELECT j.id, j.status AS job_status, j.stop_requested, i.status AS item_status,
                (SELECT count(*)::int FROM pack_media_job_items WHERE job_id = j.id AND status = 'pending') AS pending_count
           FROM pack_media_jobs j
           JOIN pack_media_job_items i ON i.job_id = j.id
          WHERE j.id = $1 AND j.actor_user_id = $2 AND i.id = $3
          FOR UPDATE OF j, i`,
        [jobId, actorUserId, itemId],
      );
      const current = locked.rows[0];
      if (!current) {
        await client.query('ROLLBACK');
        return { status: 'not_found' as const };
      }
      const expected = action === 'defer' ? 'needs_attention' : 'deferred';
      const nextStatus = action === 'defer' ? 'deferred' : 'pending';
      if (String(current.item_status) !== expected) {
        await client.query('ROLLBACK');
        return {
          status:
            String(current.item_status) === nextStatus
              ? ('idempotent' as const)
              : ('conflict' as const),
        };
      }
      if (
        current.stop_requested === true ||
        !['needs_attention', 'running', 'completed_with_deferred'].includes(
          String(current.job_status),
        ) ||
        (action === 'retry' && String(current.job_status) !== 'completed_with_deferred')
      ) {
        await client.query('ROLLBACK');
        return { status: 'conflict' as const };
      }
      if (action === 'defer' && Number(current.pending_count) > 0 && !confirmedContinuePending) {
        await client.query('ROLLBACK');
        return { status: 'continuation_confirmation_required' as const };
      }
      if (action === 'retry') {
        const candidate = await client.query(
          `SELECT 1 FROM card_media_candidates
           WHERE card_id = (SELECT card_id FROM pack_media_job_items WHERE id = $1)
             AND kind = (SELECT kind FROM pack_media_job_items WHERE id = $1)
             AND status = 'generating' LIMIT 1`,
          [itemId],
        );
        if (candidate.rows.length > 0) {
          await client.query('ROLLBACK');
          return { status: 'conflict' as const };
        }
      }
      await client.query(
        `UPDATE pack_media_job_items SET status = $3, detail = $4, lease_token = NULL,
                lease_until = NULL, updated_at = now() WHERE id = $1 AND job_id = $2`,
        [
          itemId,
          jobId,
          nextStatus,
          action === 'defer' ? 'operator_deferred_unknown_outcome' : 'operator_retry_authorized',
        ],
      );
      await client.query(
        `UPDATE pack_media_jobs SET status = CASE
           WHEN EXISTS (SELECT 1 FROM pack_media_job_items WHERE job_id = $1 AND status IN ('needs_attention', 'in_progress', 'dispatching', 'leased')) THEN 'needs_attention'
           WHEN EXISTS (SELECT 1 FROM pack_media_job_items WHERE job_id = $1 AND status = 'pending') THEN 'running'
           WHEN EXISTS (SELECT 1 FROM pack_media_job_items WHERE job_id = $1 AND status = 'deferred') THEN 'completed_with_deferred'
           ELSE 'completed' END,
           updated_at = now() WHERE id = $1`,
        [jobId],
      );
      await client.query(
        `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
         VALUES ($1, $2, 'pack_media_job', $3::uuid, $4)`,
        [
          actorUserId,
          action === 'defer'
            ? 'pack_media_job.defer_unknown_item'
            : 'pack_media_job.retry_unknown_item',
          jobId,
          {
            item_id: itemId,
            reason: normalizedReason,
            prior_outcome_may_have_been_billed: true,
            pending_continuation_confirmed: action === 'defer' && Number(current.pending_count) > 0,
          },
        ],
      );
      await client.query('COMMIT');
      return { status: 'applied' as const, job: await this.get(jobId, actorUserId) };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Called only by the token-authenticated internal endpoint. One invocation handles one item.
   * Expired leased work is safe to resume; expired dispatching work is deliberately never re-sent.
   */
  async runOne() {
    await this.pool.query(
      `UPDATE pack_media_job_items SET status = 'pending', lease_token = NULL, lease_until = NULL, updated_at = now()
        WHERE status = 'leased' AND lease_until < now()`,
    );
    await this.pool.query(
      `UPDATE pack_media_job_items SET status = 'needs_attention', detail = 'dispatch_outcome_unknown',
              lease_token = NULL, lease_until = NULL, updated_at = now()
        WHERE status = 'dispatching' AND lease_until < now()`,
    );
    await this.pool.query(
      `UPDATE pack_media_jobs SET status = 'needs_attention', updated_at = now()
       WHERE status IN ('queued', 'running') AND EXISTS (
         SELECT 1 FROM pack_media_job_items i
          WHERE i.job_id = pack_media_jobs.id AND i.status = 'needs_attention'
       )`,
    );

    const token = randomUUID();
    const claim = await this.pool.query(
      `WITH candidate AS (
         SELECT i.id
           FROM pack_media_job_items i
           JOIN pack_media_jobs j ON j.id = i.job_id
          WHERE i.status = 'pending' AND j.status IN ('queued', 'running') AND NOT j.stop_requested
            AND NOT EXISTS (
              SELECT 1 FROM pack_media_job_items blocker
               WHERE blocker.job_id = j.id AND blocker.status IN ('needs_attention', 'in_progress', 'dispatching', 'leased')
            )
            AND NOT EXISTS (
              SELECT 1 FROM pack_media_job_items earlier
               WHERE earlier.job_id = i.job_id AND earlier.status = 'pending'
                 AND (earlier.created_at, earlier.id) < (i.created_at, i.id)
            )
          ORDER BY j.created_at, i.created_at, i.id
          FOR UPDATE OF i SKIP LOCKED
          LIMIT 1
       )
       UPDATE pack_media_job_items i
          SET status = 'leased', lease_token = $1::uuid,
              lease_until = now() + (${this.leaseSeconds} || ' seconds')::interval, updated_at = now()
         FROM candidate
        WHERE i.id = candidate.id
       RETURNING i.id, i.job_id, i.card_id, i.kind, i.card_version_id`,
      [token],
    );
    const claimed = claim.rows[0];
    if (!claimed) return { status: 'idle' as const };
    const itemId = String(claimed.id);
    const jobId = String(claimed.job_id);

    const dispatch = await this.pool.query(
      `UPDATE pack_media_job_items i SET status = 'dispatching', updated_at = now()
        FROM pack_media_jobs j
       WHERE i.id = $1 AND i.job_id = j.id AND i.status = 'leased' AND i.lease_token = $2::uuid
         AND i.lease_until > now() AND NOT j.stop_requested AND j.status IN ('queued', 'running')
         AND NOT EXISTS (
           SELECT 1 FROM pack_media_job_items blocker
            WHERE blocker.job_id = j.id AND blocker.status IN ('needs_attention', 'in_progress')
         )
       RETURNING i.card_id, i.kind, i.card_version_id, j.actor_user_id`,
      [itemId, token],
    );
    const work = dispatch.rows[0];
    if (!work) {
      await this.pool.query(
        `UPDATE pack_media_job_items SET status = 'stopped', lease_token = NULL, lease_until = NULL, updated_at = now()
          WHERE id = $1 AND status = 'leased' AND lease_token = $2::uuid`,
        [itemId, token],
      );
      await this.completeIfDone(jobId);
      return { status: 'stopped' as const };
    }
    await this.pool.query(
      `UPDATE pack_media_jobs SET status = 'running', updated_at = now() WHERE id = $1`,
      [jobId],
    );

    const cardId = String(work.card_id);
    const expectedVersion = String(work.card_version_id);
    const currentVersion = await this.latestVersion(cardId);
    if (currentVersion !== expectedVersion) {
      await this.attention(jobId, itemId, token, 'content_changed');
      return { status: 'needs_attention' as const };
    }

    try {
      // The provider service checks accepted/ready media again immediately before any dispatch.
      // In particular, a manager-authorized retry must not regenerate an item since made ready.
      const outcome = await this.media.generate({
        cardId,
        kind: work.kind as CardMediaKind,
        actorUserId: String(work.actor_user_id),
        expectedCardVersionId: expectedVersion,
      });
      if (outcome.status === 'generated') {
        await this.finish(jobId, itemId, token, 'generated', outcome.candidate.id, null);
        return { status: 'generated' as const };
      }
      if (outcome.status === 'not_needed') {
        await this.finish(jobId, itemId, token, 'not_needed', outcome.candidate.id, outcome.reason);
        return { status: 'not_needed' as const };
      }
      if (outcome.status === 'already_generating') {
        await this.attention(jobId, itemId, token, 'already_generating', 'in_progress');
        return { status: 'in_progress' as const };
      }
      const detail =
        outcome.status === 'provider_failed' ? `provider_${outcome.code}` : outcome.status;
      await this.attention(jobId, itemId, token, detail);
      return { status: 'needs_attention' as const };
    } catch {
      // A worker crash after dispatch is intentionally indistinguishable from a lost provider answer.
      await this.attention(jobId, itemId, token, 'dispatch_outcome_unknown');
      return { status: 'needs_attention' as const };
    }
  }

  private async finish(
    jobId: string,
    itemId: string,
    token: string,
    status: Extract<ItemStatus, 'generated' | 'not_needed'>,
    candidateId: string,
    detail: string | null,
  ) {
    await this.pool.query(
      `UPDATE pack_media_job_items SET status = $3, candidate_id = $4::uuid, detail = $5,
              lease_token = NULL, lease_until = NULL, updated_at = now()
        WHERE id = $1 AND job_id = $2 AND status = 'dispatching' AND lease_token = $6::uuid`,
      [itemId, jobId, status, candidateId, detail, token],
    );
    await this.completeIfDone(jobId);
  }

  private async attention(
    jobId: string,
    itemId: string,
    token: string,
    detail: string,
    itemStatusValue: Extract<ItemStatus, 'in_progress' | 'needs_attention'> = 'needs_attention',
  ) {
    await this.pool.query(
      `UPDATE pack_media_job_items SET status = $3, detail = $4, lease_token = NULL, lease_until = NULL,
              updated_at = now()
        WHERE id = $1 AND job_id = $2 AND status = 'dispatching' AND lease_token = $5::uuid`,
      [itemId, jobId, itemStatusValue, detail, token],
    );
    await this.pool.query(
      `UPDATE pack_media_jobs SET status = 'needs_attention', updated_at = now() WHERE id = $1`,
      [jobId],
    );
  }

  private async completeIfDone(jobId: string) {
    await this.pool.query(
      `UPDATE pack_media_jobs SET status = CASE
              WHEN stop_requested THEN 'stopped'
              WHEN EXISTS (SELECT 1 FROM pack_media_job_items WHERE job_id = $1 AND status = 'deferred') THEN 'completed_with_deferred'
              ELSE 'completed' END,
              updated_at = now()
        WHERE id = $1 AND NOT EXISTS (
          SELECT 1 FROM pack_media_job_items
           WHERE job_id = $1 AND status NOT IN ('generated', 'not_needed', 'stopped', 'deferred')
        )`,
      [jobId],
    );
  }
}

export const PACK_MEDIA_RUNNER_GAP_SECONDS = runnerGapSeconds;
