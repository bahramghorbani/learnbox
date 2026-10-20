import { describe, expect, it, vi } from 'vitest';

import { PackMediaJobService } from '../lib/server/pack-media-job-service';

const JOB = '22222222-2222-4222-8222-222222222222';
const ITEM = '11111111-1111-4111-8111-111111111111';
const ACTOR = '55555555-5555-4555-8555-555555555555';

function fixture(initial: 'needs_attention' | 'deferred' = 'needs_attention') {
  let status: string = initial;
  let jobStatus = initial === 'deferred' ? 'completed_with_deferred' : 'needs_attention';
  let pending = 228;
  const audited: { action: string; reason: string }[] = [];
  const media = { generate: vi.fn() };
  const query = vi.fn(async (sql: string, args?: unknown[]) => {
    if (sql.includes('FROM admin_role_assignments'))
      return { rows: [{ role: 'content_reviewer' }] };
    if (sql.includes('FROM pack_media_jobs j') && sql.includes('FOR UPDATE OF j, i')) {
      return {
        rows: [{ id: JOB, job_status: jobStatus, stop_requested: false, item_status: status }],
      };
    }
    if (sql.includes('UPDATE pack_media_job_items SET status = $3')) {
      status = String(args?.[2]);
      if (status === 'pending') pending += 1;
      return { rows: [] };
    }
    if (sql.includes('UPDATE pack_media_jobs SET status = CASE')) {
      jobStatus = pending > 0 ? 'running' : 'completed_with_deferred';
      return { rows: [] };
    }
    if (sql.includes('INSERT INTO audit_logs')) {
      const metadata = args?.[3] as { reason: string };
      audited.push({ action: String(args?.[1]), reason: metadata.reason });
      return { rows: [] };
    }
    if (sql.includes('SELECT id, pack_id, status, stop_requested')) {
      return {
        rows: [
          {
            id: JOB,
            pack_id: 'pack-fixture',
            status: jobStatus,
            stop_requested: false,
            estimated_max_seconds: 0,
          },
        ],
      };
    }
    if (sql.includes('FROM pack_media_job_items WHERE job_id')) {
      return {
        rows: [
          {
            id: ITEM,
            card_id: 'card-fixture',
            kind: 'sentence_audio',
            status,
            candidate_id: null,
            detail: 'provider_provider_timeout',
            updated_at: new Date(),
          },
        ],
      };
    }
    if (sql.includes('WITH candidate AS')) return { rows: [] }; // No real provider in tests.
    return { rows: [] };
  });
  const pool = { query, connect: async () => ({ query, release: () => undefined }) };
  return {
    service: new PackMediaJobService(pool as never, media as never, {
      imageTimeoutMs: 180_000,
      audioTimeoutMs: 60_000,
    }),
    media,
    query,
    audited,
    state: () => ({ status, jobStatus, pending }),
  };
}

describe('operator resolution of an uncertain media item', () => {
  it('defers with audit and resumes only pending snapshot items without provider calls', async () => {
    const { service, media, audited, state, query } = fixture();
    await expect(
      service.resolve(JOB, ITEM, ACTOR, 'defer', 'provider outcome unknown', false),
    ).resolves.toMatchObject({ status: 'applied' });
    expect(state()).toMatchObject({ status: 'deferred', jobStatus: 'running', pending: 228 });
    expect(audited).toEqual([
      { action: 'pack_media_job.defer_unknown_item', reason: 'provider outcome unknown' },
    ]);
    expect(media.generate).not.toHaveBeenCalled();
    expect(query.mock.calls.some(([sql]) => sql.includes('UPDATE card_media_candidates'))).toBe(
      false,
    );
    expect(query.mock.calls.some(([sql]) => sql.includes('INSERT INTO pack_media_jobs'))).toBe(
      false,
    );
    expect(query.mock.calls.some(([sql]) => sql.includes("i.status = 'pending'"))).toBe(false); // Resolution did not dispatch.
  });

  it('makes a repeated operator action idempotent without a second audit or status write', async () => {
    const { service, query, audited } = fixture();
    await service.resolve(JOB, ITEM, ACTOR, 'defer', 'first decision', false);
    const writesBefore = query.mock.calls.filter(([sql]) =>
      sql.includes('UPDATE pack_media_job_items SET status = $3'),
    ).length;
    await expect(service.resolve(JOB, ITEM, ACTOR, 'defer', 'repeat', false)).resolves.toEqual({
      status: 'idempotent',
    });
    expect(
      query.mock.calls.filter(([sql]) =>
        sql.includes('UPDATE pack_media_job_items SET status = $3'),
      ),
    ).toHaveLength(writesBefore);
    expect(audited).toHaveLength(1);
  });

  it('requires explicit duplicate-charge confirmation before retry while preserving the previous candidate', async () => {
    const { service, media, audited, state, query } = fixture('deferred');
    await expect(service.resolve(JOB, ITEM, ACTOR, 'retry', 'try again', false)).resolves.toEqual({
      status: 'confirmation_required',
    });
    expect(state().status).toBe('deferred');
    await expect(
      service.resolve(JOB, ITEM, ACTOR, 'retry', 'reviewed past charge', true),
    ).resolves.toMatchObject({ status: 'applied' });
    expect(state().status).toBe('pending');
    expect(audited).toEqual([
      { action: 'pack_media_job.retry_unknown_item', reason: 'reviewed past charge' },
    ]);
    expect(media.generate).not.toHaveBeenCalled();
    expect(query.mock.calls.some(([sql]) => sql.includes('UPDATE card_media_candidates'))).toBe(
      false,
    );
    await expect(service.resolve(JOB, ITEM, ACTOR, 'retry', 'repeat', true)).resolves.toEqual({
      status: 'idempotent',
    });
    expect(audited).toHaveLength(1);
  });
});
