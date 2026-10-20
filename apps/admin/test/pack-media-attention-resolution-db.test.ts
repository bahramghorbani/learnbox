import { randomBytes } from 'node:crypto';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { PackMediaJobService } from '../lib/server/pack-media-job-service';

const url = process.env.TEST_DATABASE_URL;
if (!url && process.env.CI) throw new Error('TEST_DATABASE_URL is required in CI');
const suite = url ? describe : describe.skip;

const ACTOR = '55555555-5555-4555-8555-555555555555';
const JOB = '22222222-2222-4222-8222-222222222222';
const ITEM = '11111111-1111-4111-8111-111111111111';
const CARD = '33333333-3333-4333-8333-333333333333';
const CANDIDATE = '44444444-4444-4444-8444-444444444444';
const PENDING_ITEM = '77777777-7777-4777-8777-777777777777';
const PENDING_CARD = '88888888-8888-4888-8888-888888888888';
const PENDING_VERSION = '99999999-9999-4999-8999-999999999999';

let root: Pool;
let pool: Pool;
let database = '';

async function scalar(sql: string, values?: unknown[]) {
  return pool.query(sql, values);
}

async function reset(
  status: 'needs_attention' | 'deferred' = 'needs_attention',
  withPending = false,
) {
  await scalar(
    'TRUNCATE audit_logs, card_media_candidates, card_versions, pack_media_job_items, pack_media_jobs',
  );
  await scalar(
    `INSERT INTO pack_media_jobs (id, pack_id, actor_user_id, status, stop_requested, estimated_max_seconds)
     VALUES ($1, 'pack-fixture', $2, $3, false, 0)`,
    [JOB, ACTOR, status === 'deferred' ? 'completed_with_deferred' : 'needs_attention'],
  );
  await scalar(
    `INSERT INTO pack_media_job_items (id, job_id, card_id, kind, card_version_id, status, candidate_id, detail)
     VALUES ($1, $2, $3, 'sentence_audio', '66666666-6666-4666-8666-666666666666', $4, $5, 'provider_timeout')`,
    [ITEM, JOB, CARD, status, CANDIDATE],
  );
  await scalar(
    `INSERT INTO card_media_candidates (id, card_id, kind, status, failure_code)
     VALUES ($1, $2, 'sentence_audio', 'failed', 'provider_timeout')`,
    [CANDIDATE, CARD],
  );
  if (withPending) {
    await scalar(`INSERT INTO card_versions (id, card_id, version) VALUES ($1, $2, 1)`, [
      PENDING_VERSION,
      PENDING_CARD,
    ]);
    await scalar(
      `INSERT INTO pack_media_job_items (id, job_id, card_id, kind, card_version_id, status)
       VALUES ($1, $2, $3, 'sentence_audio', $4, 'pending')`,
      [PENDING_ITEM, JOB, PENDING_CARD, PENDING_VERSION],
    );
  }
}

suite('pack-media attention resolution against real Postgres', () => {
  beforeAll(async () => {
    root = new Pool({ connectionString: url, max: 1 });
    root.on('error', () => undefined);
    database = `attention_${randomBytes(4).toString('hex')}`;
    await root.query(`CREATE DATABASE ${database}`);
    const scoped = new URL(url as string);
    scoped.pathname = `/${database}`;
    pool = new Pool({ connectionString: scoped.toString(), max: 2 });
    pool.on('error', () => undefined);
    await scalar(`
      CREATE TABLE admin_role_assignments (user_id uuid NOT NULL, role text NOT NULL);
      CREATE TABLE pack_media_jobs (
        id uuid PRIMARY KEY, pack_id text NOT NULL, actor_user_id uuid NOT NULL, status text NOT NULL,
        stop_requested boolean NOT NULL DEFAULT false, estimated_max_seconds integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE pack_media_job_items (
        id uuid PRIMARY KEY, job_id uuid NOT NULL, card_id uuid NOT NULL, kind text NOT NULL, card_version_id uuid NOT NULL,
        status text NOT NULL, candidate_id uuid, detail text, lease_token uuid, lease_until timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE card_versions (id uuid PRIMARY KEY, card_id uuid NOT NULL, version integer NOT NULL);
      CREATE TABLE card_media_candidates (id uuid PRIMARY KEY, card_id uuid NOT NULL, kind text NOT NULL, status text NOT NULL, failure_code text);
      CREATE TABLE audit_logs (actor_user_id uuid, action text NOT NULL, entity_type text NOT NULL, entity_id uuid NOT NULL, metadata jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now());
    `);
    await scalar(`INSERT INTO admin_role_assignments VALUES ($1, 'content_reviewer')`, [ACTOR]);
  });

  afterAll(async () => {
    await pool?.end();
    await root?.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);
    await root?.end();
  });

  it('defers without provider work, preserves the failed candidate, audits the actor/reason, then lets only the existing pending item reach the fake provider', async () => {
    await reset('needs_attention', true);
    const media = {
      generate: vi.fn(async () => ({
        status: 'generated' as const,
        candidate: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
      })),
    };
    const service = new PackMediaJobService(pool as never, media as never, {
      imageTimeoutMs: 180_000,
      audioTimeoutMs: 60_000,
    });

    await expect(
      service.resolve(JOB, ITEM, ACTOR, 'defer', 'outcome cannot be reconciled', false),
    ).resolves.toMatchObject({ status: 'applied' });
    const item = await scalar(
      `SELECT status, candidate_id, detail FROM pack_media_job_items WHERE id = $1`,
      [ITEM],
    );
    expect(item.rows[0]).toMatchObject({
      status: 'deferred',
      candidate_id: CANDIDATE,
      detail: 'operator_deferred_unknown_outcome',
    });
    await expect(
      scalar(`SELECT status, failure_code FROM card_media_candidates WHERE id = $1`, [CANDIDATE]),
    ).resolves.toMatchObject({ rows: [{ status: 'failed', failure_code: 'provider_timeout' }] });
    await expect(
      scalar(`SELECT status FROM pack_media_jobs WHERE id = $1`, [JOB]),
    ).resolves.toMatchObject({ rows: [{ status: 'running' }] });
    await expect(
      scalar(`SELECT action, actor_user_id, metadata->>'reason' AS reason FROM audit_logs`),
    ).resolves.toMatchObject({
      rows: [
        {
          action: 'pack_media_job.defer_unknown_item',
          actor_user_id: ACTOR,
          reason: 'outcome cannot be reconciled',
        },
      ],
    });
    expect(media.generate).not.toHaveBeenCalled();

    await expect(service.runOne()).resolves.toEqual({ status: 'generated' });
    expect(media.generate).toHaveBeenCalledTimes(1);
    expect(media.generate).toHaveBeenCalledWith(
      expect.objectContaining({ cardId: PENDING_CARD, expectedCardVersionId: PENDING_VERSION }),
    );
    await expect(
      scalar(`SELECT status FROM pack_media_job_items WHERE id = $1`, [ITEM]),
    ).resolves.toMatchObject({ rows: [{ status: 'deferred' }] });
    await expect(
      scalar(`SELECT status FROM pack_media_jobs WHERE id = $1`, [JOB]),
    ).resolves.toMatchObject({ rows: [{ status: 'completed_with_deferred' }] });
  });

  it('requires acknowledgement to retry and concurrent/repeated commands do not dispatch twice or replace history', async () => {
    await reset('deferred');
    const media = { generate: vi.fn() };
    const service = new PackMediaJobService(pool as never, media as never, {
      imageTimeoutMs: 180_000,
      audioTimeoutMs: 60_000,
    });

    await expect(
      service.resolve(JOB, ITEM, ACTOR, 'retry', 'reviewed prior charge', false),
    ).resolves.toEqual({ status: 'confirmation_required' });
    const results = await Promise.all([
      service.resolve(JOB, ITEM, ACTOR, 'retry', 'reviewed prior charge', true),
      service.resolve(JOB, ITEM, ACTOR, 'retry', 'second click', true),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual(['applied', 'idempotent']);
    await expect(
      scalar(`SELECT status, candidate_id FROM pack_media_job_items WHERE id = $1`, [ITEM]),
    ).resolves.toMatchObject({ rows: [{ status: 'pending', candidate_id: CANDIDATE }] });
    await expect(
      scalar(
        `SELECT count(*)::int AS count FROM audit_logs WHERE action = 'pack_media_job.retry_unknown_item'`,
      ),
    ).resolves.toMatchObject({ rows: [{ count: 1 }] });
    expect(media.generate).not.toHaveBeenCalled();
  });
});
