import { describe, expect, it, vi } from 'vitest';

import { PackMediaJobService } from '../lib/server/pack-media-job-service';

const ITEM_ID = '11111111-1111-4111-8111-111111111111';
const JOB_ID = '22222222-2222-4222-8222-222222222222';
const CARD_ID = '33333333-3333-4333-8333-333333333333';
const VERSION_ID = '44444444-4444-4444-8444-444444444444';
const ACTOR_ID = '55555555-5555-4555-8555-555555555555';

function runnerFixture(outcome: { status: string; candidate?: { id: string }; reason?: string }) {
  let claimed = false;
  const sql: string[] = [];
  const media = {
    generate: vi.fn(async () => outcome),
  };
  const query = vi.fn(async (statement: string) => {
    sql.push(statement);
    if (statement.includes('WITH candidate AS')) {
      if (claimed) return { rows: [] };
      claimed = true;
      return {
        rows: [
          {
            id: ITEM_ID,
            job_id: JOB_ID,
            card_id: CARD_ID,
            kind: 'image',
            card_version_id: VERSION_ID,
          },
        ],
      };
    }
    if (statement.includes("SET status = 'dispatching'")) {
      return {
        rows: [
          { card_id: CARD_ID, kind: 'image', card_version_id: VERSION_ID, actor_user_id: ACTOR_ID },
        ],
      };
    }
    if (statement.includes('FROM card_versions')) return { rows: [{ id: VERSION_ID }] };
    return { rows: [] };
  });
  const pool = { query, connect: async () => ({ query, release: () => undefined }) };
  return {
    service: new PackMediaJobService(pool as never, media as never, {
      imageTimeoutMs: 100,
      audioTimeoutMs: 100,
    }),
    media,
    sql,
  };
}

describe('durable pack-media runner', () => {
  it('claims one item across simultaneous timer ticks and dispatches it once', async () => {
    const { service, media } = runnerFixture({
      status: 'generated',
      candidate: { id: '66666666-6666-4666-8666-666666666666' },
    });

    const result = await Promise.all([service.runOne(), service.runOne()]);

    expect(result.map((entry) => entry.status).sort()).toEqual(['generated', 'idle']);
    expect(media.generate).toHaveBeenCalledTimes(1);
  });

  it('marks an existing provider operation in progress and never dispatches it again', async () => {
    const { service, media, sql } = runnerFixture({ status: 'already_generating' });

    await expect(service.runOne()).resolves.toEqual({ status: 'in_progress' });
    expect(media.generate).toHaveBeenCalledTimes(1);
    expect(
      sql.some(
        (statement) =>
          statement.includes('SET status = $3') && statement.includes("'needs_attention'"),
      ),
    ).toBe(false);
    expect(
      sql.some(
        (statement) =>
          statement.includes('SET status = $3') && statement.includes('lease_token = NULL'),
      ),
    ).toBe(true);
  });

  it('turns an expired post-dispatch lease into attention rather than retrying it', async () => {
    const { service, media, sql } = runnerFixture({
      status: 'generated',
      candidate: { id: '66666666-6666-4666-8666-666666666666' },
    });
    // Consume the only fake item as if a prior runner had already claimed it; the second tick is idle.
    await service.runOne();
    media.generate.mockClear();

    await expect(service.runOne()).resolves.toEqual({ status: 'idle' });
    expect(sql.some((statement) => statement.includes("detail = 'dispatch_outcome_unknown'"))).toBe(
      true,
    );
    expect(media.generate).not.toHaveBeenCalled();
  });
});
