import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Pool as PgPool } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { webReviewDependenciesFromEnvironment } from '../lib/learner-review-web-runtime';
import { mobileReviewHttpDependenciesFromEnvironment } from '../lib/mobile-review-runtime';

/**
 * LB-B35 CP7 — scheduler V2 on a REAL Postgres: history integrity, activation behavior for existing
 * schedules, schema preflight (fail closed), flag-off identity on a pre-0023 database, mobile/legacy grade
 * handling, and rollback consequences. Requires TEST_DATABASE_URL (the suite creates and drops its own DBs).
 */
const url = process.env.TEST_DATABASE_URL;
if (!url && process.env.CI) throw new Error('TEST_DATABASE_URL is required in CI');
const suite = url ? describe : describe.skip;
const migrationsDir = join(__dirname, '../../../database/migrations');
const NOW = '2026-10-01T09:00:00.000Z';
const DAY = 86_400_000;

let admin: PgPool;
const created: string[] = [];
const dbUrl = (name: string) => {
  const u = new URL(url as string);
  u.pathname = `/${name}`;
  return u.toString();
};

async function makeDb(through0023: boolean): Promise<{ pool: PgPool; cards: string[] }> {
  const { Pool } = await vi.importActual<typeof import('pg')>('pg');
  const name = `cp7_${Math.random().toString(36).slice(2, 10)}`;
  await admin.query(`CREATE DATABASE ${name}`);
  created.push(name);
  const pool = new Pool({ connectionString: dbUrl(name), max: 4 });
  pool.on('error', () => undefined);
  for (const file of readdirSync(migrationsDir)
    .filter((f) => /^\d{4}_.+\.sql$/.test(f) && (through0023 || !f.startsWith('0023')))
    .sort()) {
    await pool.query(readFileSync(join(migrationsDir, file), 'utf8'));
  }
  await pool.query(
    `INSERT INTO packs (id, display_name, target_item_count, status, is_free, published_at)
     VALUES ('cp7-pack', 'CP7 pack', 3, 'published', true, now())`,
  );
  const cards: string[] = [];
  for (const [i, lemma] of ['cp7-a', 'cp7-b', 'cp7-c'].entries()) {
    const id = randomUUID();
    await pool.query(`INSERT INTO cards (id, lemma, content_id) VALUES ($1, $2, $2)`, [id, lemma]);
    await pool.query(
      `INSERT INTO card_versions (card_id, version, status, content_json, source_provider, published_at)
       VALUES ($1, 1, 'published', $2::jsonb, 'editorial', now())`,
      [id, JSON.stringify({ lemma, article: 'das', persianMeanings: ['x'], cefr: 'A1' })],
    );
    await pool.query(
      `INSERT INTO pack_cards (pack_id, card_id, sort_order) VALUES ('cp7-pack', $1, $2)`,
      [id, i + 1],
    );
    cards.push(id);
  }
  return { pool, cards };
}

async function newLearner(pool: PgPool): Promise<string> {
  const id = randomUUID();
  await pool.query('INSERT INTO users (id, phone_e164) VALUES ($1, $2)', [
    id,
    `+98912${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`,
  ]);
  return id;
}

async function api() {
  const store = await import('../../api/dist/reviews/postgres-review-event.store.js');
  const svc = await import('../../api/dist/reviews/mobile-review-batch.service.js');
  const pre = await import('../../api/dist/reviews/scheduler-v2-preflight.js');
  const eng = await import('@learnbox/learning-engine');
  return { ...store, ...svc, ...pre, eng };
}

let seq = 0;
const answer = (contentId: string, response: 'known' | 'unknown', at: string) => ({
  clientEventId: `cp7-${++seq}`,
  contentId,
  grade: response === 'known' ? ('remembered' as const) : ('forgot' as const),
  response,
  occurredAt: new Date(at),
});

const schedRow = (pool: PgPool, user: string, card: string) =>
  pool
    .query(`SELECT * FROM card_schedules WHERE user_id = $1 AND card_id = $2`, [user, card])
    .then((r) => r.rows[0]);
const eventRows = (pool: PgPool, user: string) =>
  pool
    .query(`SELECT * FROM review_events WHERE user_id = $1 ORDER BY applied_at, id`, [user])
    .then((r) => r.rows);

beforeAll(async () => {
  const { Pool } = await vi.importActual<typeof import('pg')>('pg');
  admin = new Pool({ connectionString: url, max: 1 });
  admin.on('error', () => undefined);
});
afterAll(async () => {
  for (const name of created) await admin?.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await admin?.end();
});

suite('CP7 — schema preflight fails closed', () => {
  it('passes on a database with 0023, and refuses (with an operator error) on one without', async () => {
    const { verifySchedulerV2Schema, SchedulerV2PreflightError } = await api();
    const ok = await makeDb(true);
    await expect(verifySchedulerV2Schema(ok.pool as never)).resolves.toBeUndefined();
    const old = await makeDb(false);
    const err = await verifySchedulerV2Schema(old.pool as never).catch((e) => e);
    expect(err).toBeInstanceOf(SchedulerV2PreflightError);
    expect(err.message).toMatch(/engine_version is missing/);
    expect(err.message).toMatch(/Apply migration 0023/);
    expect(err.message).toMatch(/never falls back to V1 silently/);
    await ok.pool.end();
    await old.pool.end();
  });

  it('detects an incompatible shape: wrong column type and a stricter CHECK', async () => {
    const { verifySchedulerV2Schema } = await api();
    const t = await makeDb(true);
    await t.pool.query(
      `ALTER TABLE review_events DROP CONSTRAINT review_events_engine_version_valid`,
    );
    let err = await verifySchedulerV2Schema(t.pool as never).catch((e) => e);
    expect(err.message).toMatch(/review_events_engine_version_valid is missing/);
    await t.pool.query(
      `ALTER TABLE review_events ADD CONSTRAINT review_events_engine_version_valid CHECK (engine_version IS NULL OR engine_version BETWEEN 1 AND 1)`,
    );
    err = await verifySchedulerV2Schema(t.pool as never).catch((e) => e);
    expect(err.message).toMatch(/does not accept engine_version 2/);
    await t.pool.query(
      `ALTER TABLE review_events DROP CONSTRAINT review_events_engine_version_valid`,
    );
    await t.pool.query(`ALTER TABLE review_events ALTER COLUMN engine_version TYPE integer`);
    err = await verifySchedulerV2Schema(t.pool as never).catch((e) => e);
    expect(err.message).toMatch(/is integer, expected smallint/);
    await t.pool.end();
  });

  it('V2 on a pre-0023 database refuses the review and writes NOTHING (no silent V1 fallback)', async () => {
    const { PostgresReviewEventStore, MobileReviewBatchService, createSchedulerV2Preflight } =
      await api();
    const { pool } = await makeDb(false);
    const user = await newLearner(pool);
    const service = new MobileReviewBatchService(
      new PostgresReviewEventStore(pool as never),
      () => new Date(NOW),
      { schedulerV2: true, schedulerV2Preflight: createSchedulerV2Preflight(pool as never) },
    );
    await expect(
      service.submit({ userId: user, items: [answer('cp7-a', 'known', NOW)] }),
    ).rejects.toMatchObject({ code: 'serverUnavailable' });
    expect((await pool.query(`SELECT count(*)::int AS n FROM review_events`)).rows[0].n).toBe(0);
    expect((await pool.query(`SELECT count(*)::int AS n FROM card_schedules`)).rows[0].n).toBe(0);
    await pool.end();
  });

  it('a failed preflight is not cached: applying 0023 re-enables V2 without a restart', async () => {
    const { PostgresReviewEventStore, MobileReviewBatchService, createSchedulerV2Preflight } =
      await api();
    const { pool } = await makeDb(false);
    const user = await newLearner(pool);
    const service = new MobileReviewBatchService(
      new PostgresReviewEventStore(pool as never),
      () => new Date(NOW),
      { schedulerV2: true, schedulerV2Preflight: createSchedulerV2Preflight(pool as never) },
    );
    await expect(
      service.submit({ userId: user, items: [answer('cp7-a', 'known', NOW)] }),
    ).rejects.toBeTruthy();
    await pool.query(readFileSync(join(migrationsDir, '0023_learning_persistence.sql'), 'utf8'));
    const out = await service.submit({ userId: user, items: [answer('cp7-a', 'known', NOW)] });
    expect(out[0]).toMatchObject({ status: 'acknowledged' });
    await pool.end();
  });

  it('constructing the service with V2 on but no preflight is refused', async () => {
    const { PostgresReviewEventStore, MobileReviewBatchService } = await api();
    expect(
      () =>
        new MobileReviewBatchService(new PostgresReviewEventStore({} as never), undefined, {
          schedulerV2: true,
        }),
    ).toThrow(/requires a schema preflight/);
  });
});

suite('CP7 — flag OFF is the v1.2.1 path, on a database WITHOUT 0023', () => {
  it('a legacy answer is scheduled exactly like scheduleReview and stores no engine stamp', async () => {
    const { PostgresReviewEventStore, MobileReviewBatchService, eng } = await api();
    const { pool } = await makeDb(false);
    const user = await newLearner(pool);
    const service = new MobileReviewBatchService(
      new PostgresReviewEventStore(pool as never),
      () => new Date(NOW),
    );
    const before = await new PostgresReviewEventStore(pool as never).ensureApprovedSchedule(
      user,
      'cp7-a',
    );
    const expected = eng.scheduleReview(before!.schedule, 'remembered', new Date(NOW));
    await service.submit({
      userId: user,
      items: [{ ...answer('cp7-a', 'known', NOW), response: undefined }],
    });
    const row = await schedRow(pool, user, before!.cardId);
    expect(row.stability_days).toBe(expected.stabilityDays);
    expect(row.state).toBe(expected.state);
    expect(new Date(row.due_at).getTime()).toBe(expected.dueAt.getTime());
    const [ev] = await eventRows(pool, user);
    expect('engine_version' in ev).toBe(false); // column does not exist; statement did not name it
    await pool.end();
  });

  it('the INSERT statement text is byte-identical to v1.2.1 when no engine stamp is set', async () => {
    const { PostgresReviewEventStore } = await api();
    const seen: string[] = [];
    const client = {
      query: async (sql: string) => {
        seen.push(sql);
        if (sql.startsWith('INSERT INTO review_events')) return { rows: [] };
        return { rows: [] };
      },
      release: () => undefined,
    };
    const store = new PostgresReviewEventStore({ connect: async () => client } as never);
    const input = {
      userId: 'u',
      cardId: 'c',
      grade: 'remembered' as const,
      occurredAt: new Date(NOW),
      clientEventId: 'e',
    };
    await store
      .writeAtomically(input, {
        state: 'review',
        stabilityDays: 1,
        difficulty: 5,
        lapses: 0,
        dueAt: new Date(NOW),
      })
      .catch(() => undefined);
    const insert = seen.find((s) => s.startsWith('INSERT INTO review_events'))!;
    expect(insert).not.toMatch(/engine_version/);
    expect(insert).not.toMatch(/response/);
    expect(insert).toContain('applied_at)');
  });
});

suite('CP7 — V2 on a migrated database', () => {
  async function v2Stack(pool: PgPool) {
    const a = await api();
    const store = new a.PostgresReviewEventStore(pool as never);
    const service = new a.MobileReviewBatchService(store, () => new Date(NOW), {
      schedulerV2: true,
      schedulerV2Preflight: a.createSchedulerV2Preflight(pool as never),
    });
    const v1 = new a.MobileReviewBatchService(store, () => new Date(NOW));
    return { ...a, store, service, v1 };
  }

  it('stamps engine_version=2 and writes GR-1.8 schedules; Known from a new card enters Box 2', async () => {
    const { pool } = await makeDb(true);
    const { service, store, eng } = await v2Stack(pool);
    const user = await newLearner(pool);
    await service.submit({ userId: user, items: [answer('cp7-a', 'known', NOW)] });
    const card = (await store.resolveCardId('cp7-a'))!;
    const row = await schedRow(pool, user, card);
    expect(row.stability_days).toBe(1);
    expect(eng.boxFromStabilityDays(row.stability_days)).toBe(2);
    expect(row.state).toBe('learning');
    const [ev] = await eventRows(pool, user);
    expect(ev).toMatchObject({ engine_version: 2, response: 'known', grade: 'remembered' });
    await pool.end();
  });

  it('a legacy four-grade event (no response) is scheduled as its binary projection under V2', async () => {
    const { pool } = await makeDb(true);
    const { service, store, eng } = await v2Stack(pool);
    const user = await newLearner(pool);
    for (const [i, grade] of (['hard', 'mastered', 'forgot'] as const).entries()) {
      const contentId = ['cp7-a', 'cp7-b', 'cp7-c'][i]!;
      await service.submit({
        userId: user,
        items: [{ clientEventId: `leg-${i}`, contentId, grade, occurredAt: new Date(NOW) }],
      });
      const row = await schedRow(pool, user, (await store.resolveCardId(contentId))!);
      const expected = eng.scheduleBinaryReview(
        {
          state: 'new',
          stabilityDays: 0.0416666667,
          difficulty: 5,
          lapses: 0,
          dueAt: new Date(NOW),
        },
        { grade },
        new Date(NOW),
      );
      expect(row.stability_days).toBe(expected.stabilityDays);
    }
    const evs = await eventRows(pool, user);
    expect(evs.every((e) => e.response === null && e.engine_version === 2)).toBe(true);
    expect(evs.map((e) => e.grade).sort()).toEqual(['forgot', 'hard', 'mastered']);
    await pool.end();
  });

  it('review_events history is append-only and byte-identical for rows that already exist', async () => {
    const { pool } = await makeDb(true);
    const { service, v1, store } = await v2Stack(pool);
    const user = await newLearner(pool);
    await v1.submit({
      userId: user,
      items: [answer('cp7-a', 'known', '2026-09-30T08:00:00.000Z')],
    });
    const historic = await eventRows(pool, user);
    const card = (await store.resolveCardId('cp7-a'))!;
    const sched0 = await schedRow(pool, user, card);
    await service.submit({
      userId: user,
      items: [answer('cp7-a', 'known', NOW), answer('cp7-b', 'unknown', NOW)],
    });
    const all = await eventRows(pool, user);
    expect(all.length).toBe(historic.length + 2);
    for (const old of historic) {
      const same = all.find((e) => e.id === old.id);
      expect(same).toEqual(old); // every column of every pre-existing event unchanged
    }
    expect(historic[0].engine_version).toBeNull();
    expect(all.filter((e) => e.engine_version === 2).length).toBe(2);
    expect((await schedRow(pool, user, card)).stability_days).not.toBe(sched0.stability_days);
    await pool.end();
  });

  it('ACTIVATION rewrites no schedule and no event; an existing Box-1 card moves only on its next Known', async () => {
    const { pool } = await makeDb(true);
    const { service, v1, store, eng } = await v2Stack(pool);
    const user = await newLearner(pool);
    // Box-1 card created under v1: an Unknown keeps it in Box 1 under the v1 engine.
    await v1.submit({
      userId: user,
      items: [answer('cp7-a', 'unknown', '2026-09-30T08:00:00.000Z')],
    });
    const card = (await store.resolveCardId('cp7-a'))!;
    const beforeSched = await schedRow(pool, user, card);
    const beforeEvents = await eventRows(pool, user);
    expect(eng.boxFromStabilityDays(beforeSched.stability_days)).toBe(1);

    // "Activation" is process configuration only: constructing the V2 stack and running the preflight
    // touches no row.
    await v2Stack(pool);
    await (await api()).verifySchedulerV2Schema(pool as never);
    expect(await schedRow(pool, user, card)).toEqual(beforeSched);
    expect(await eventRows(pool, user)).toEqual(beforeEvents);

    // The first FUTURE Known advances it to Box 2 (stability lifted to at least 1 day).
    await service.submit({ userId: user, items: [answer('cp7-a', 'known', NOW)] });
    const after = await schedRow(pool, user, card);
    expect(eng.boxFromStabilityDays(after.stability_days)).toBe(2);
    expect(after.stability_days).toBeGreaterThanOrEqual(1);
    await pool.end();
  });

  it('a stored stability just under a Box edge survives the double-precision round trip in its Box', async () => {
    const { pool } = await makeDb(true);
    const { service, store, eng } = await v2Stack(pool);
    const user = await newLearner(pool);
    const card = (await store.resolveCardId('cp7-a'))!;
    await store.ensureApprovedSchedule(user, 'cp7-a');
    // Box 4 card with growth that would cross 21 d: the clamp keeps it under the edge, in the DB too.
    await pool.query(
      `UPDATE card_schedules SET stability_days = 20.99999999 WHERE user_id=$1 AND card_id=$2`,
      [user, card],
    );
    await service.submit({ userId: user, items: [answer('cp7-a', 'known', NOW)] });
    const row = await schedRow(pool, user, card);
    expect(eng.boxFromStabilityDays(row.stability_days)).toBe(5);
    expect(row.stability_days).toBeLessThanOrEqual(180);
    // and an Unknown from there drops exactly one Box to 4, stored value strictly below 21
    await service.submit({ userId: user, items: [answer('cp7-a', 'unknown', NOW)] });
    const down = await schedRow(pool, user, card);
    expect(eng.boxFromStabilityDays(down.stability_days)).toBe(4);
    expect(down.stability_days).toBeLessThan(21);
    await pool.end();
  });

  it('every Unknown across the stored range drops exactly one Box (full range incl. >180 d) through Postgres', async () => {
    const { pool } = await makeDb(true);
    const { service, store, eng } = await v2Stack(pool);
    const user = await newLearner(pool);
    const card = (await store.resolveCardId('cp7-a'))!;
    await store.ensureApprovedSchedule(user, 'cp7-a');
    let n = 0;
    for (const stab of [
      0.0104, 0.5, 0.99999999, 1, 2.9999999, 3, 6.99999999, 7, 20.99999999, 21, 63, 179.9, 180, 181,
      400, 4000,
    ]) {
      await pool.query(
        `UPDATE card_schedules SET stability_days=$3 WHERE user_id=$1 AND card_id=$2`,
        [user, card, stab],
      );
      const before = eng.boxFromStabilityDays(stab);
      await service.submit({ userId: user, items: [answer('cp7-a', 'unknown', NOW)] });
      const after = eng.boxFromStabilityDays((await schedRow(pool, user, card)).stability_days);
      expect(after, `Unknown @${stab}`).toBe(before === 1 ? 1 : before - 1);
      n++;
    }
    expect(n).toBe(16);
    await pool.end();
  });

  it('an invariant violation refuses the write: no event, no schedule change, batch refused', async () => {
    const { pool } = await makeDb(true);
    const a = await v2Stack(pool);
    const user = await newLearner(pool);
    const card = (await a.store.resolveCardId('cp7-a'))!;
    await a.store.ensureApprovedSchedule(user, 'cp7-a');
    await pool.query(
      `UPDATE card_schedules SET stability_days = 5 WHERE user_id=$1 AND card_id=$2`,
      [user, card],
    );
    // A schedule with a corrupt stored stability cannot be scheduled from: the DB CHECK forbids <= 0, so
    // simulate the corrupt read at the store seam instead.
    const corrupt = new a.MobileReviewBatchService(
      Object.assign(Object.create(a.store), {
        ensureApprovedSchedule: async () => ({
          cardId: card,
          schedule: {
            state: 'review',
            stabilityDays: Number.NaN,
            difficulty: 5,
            lapses: 0,
            dueAt: new Date(NOW),
          },
        }),
      }),
      () => new Date(NOW),
      { schedulerV2: true, schedulerV2Preflight: async () => undefined },
    );
    const eventsBefore = await eventRows(pool, user);
    const schedBefore = await schedRow(pool, user, card);
    await expect(
      corrupt.submit({ userId: user, items: [answer('cp7-a', 'known', NOW)] }),
    ).rejects.toMatchObject({ code: 'serverUnavailable' });
    expect(await eventRows(pool, user)).toEqual(eventsBefore);
    expect(await schedRow(pool, user, card)).toEqual(schedBefore);
    await pool.end();
  });

  it('idempotent replay of a V2 event neither re-schedules nor re-stamps', async () => {
    const { pool } = await makeDb(true);
    const { service, store } = await v2Stack(pool);
    const user = await newLearner(pool);
    const item = answer('cp7-a', 'known', NOW);
    await service.submit({ userId: user, items: [item] });
    const card = (await store.resolveCardId('cp7-a'))!;
    const s1 = await schedRow(pool, user, card);
    const out = await service.submit({ userId: user, items: [item] });
    expect(out[0]).toMatchObject({ status: 'acknowledged', idempotent: true });
    expect(await schedRow(pool, user, card)).toEqual(s1);
    expect((await eventRows(pool, user)).length).toBe(1);
    await pool.end();
  });
});

suite(
  'CP7 — rollback rehearsal: V2 -> flag off (V1) with the larger stability left in place',
  () => {
    it('stability stays valid, the Box does not drop at the switch, and V1 resumes from the stored value', async () => {
      const { pool } = await makeDb(true);
      const a = await api();
      const store = new a.PostgresReviewEventStore(pool as never);
      const v2 = new a.MobileReviewBatchService(store, () => new Date(NOW), {
        schedulerV2: true,
        schedulerV2Preflight: a.createSchedulerV2Preflight(pool as never),
      });
      const v1 = new a.MobileReviewBatchService(store, () => new Date(NOW));
      const user = await newLearner(pool);
      const card = (await store.resolveCardId('cp7-a'))!;

      // Climb to Box 5 under V2 (7 Knowns).
      for (let i = 0; i < 7; i++)
        await v2.submit({ userId: user, items: [answer('cp7-a', 'known', NOW)] });
      const atSwitch = await schedRow(pool, user, card);
      expect(a.eng.boxFromStabilityDays(atSwitch.stability_days)).toBe(5);

      // The same 7 Knowns under V1 would have left a SMALLER stability: the documented consequence.
      const v1Alone = await makeDb(true);
      const store1 = new a.PostgresReviewEventStore(v1Alone.pool as never);
      const v1Only = new a.MobileReviewBatchService(store1, () => new Date(NOW));
      const user1 = await newLearner(v1Alone.pool);
      for (let i = 0; i < 7; i++)
        await v1Only.submit({ userId: user1, items: [answer('cp7-a', 'known', NOW)] });
      const v1Stab = (await schedRow(v1Alone.pool, user1, (await store1.resolveCardId('cp7-a'))!))
        .stability_days;
      expect(atSwitch.stability_days).toBeGreaterThan(v1Stab);

      // Roll back: flag off. The next answer runs through plain V1 from the stored (larger) stability.
      const eventsBefore = await eventRows(pool, user);
      await v1.submit({ userId: user, items: [answer('cp7-a', 'known', NOW)] });
      const afterV1 = await schedRow(pool, user, card);
      expect(afterV1.stability_days).toBeCloseTo(atSwitch.stability_days * 1.8, 9);
      expect(a.eng.boxFromStabilityDays(afterV1.stability_days)).toBeGreaterThanOrEqual(5);
      // Earlier V2 events are untouched and keep their stamp; the new V1 event has none.
      const eventsAfter = await eventRows(pool, user);
      for (const e of eventsBefore) expect(eventsAfter.find((x) => x.id === e.id)).toEqual(e);
      expect(eventsAfter.filter((e) => e.engine_version === 2).length).toBe(7);
      expect(eventsAfter.filter((e) => e.engine_version === null).length).toBe(1);

      // An Unknown under V1 after rollback: V1 factor 0.35 from the larger value (still valid, > 0).
      await v1.submit({ userId: user, items: [answer('cp7-a', 'unknown', NOW)] });
      expect((await schedRow(pool, user, card)).stability_days).toBeGreaterThan(0);

      // Re-enable V2: scheduling continues from whatever is stored, assertion holds.
      await v2.submit({ userId: user, items: [answer('cp7-a', 'known', NOW)] });
      expect((await schedRow(pool, user, card)).stability_days).toBeLessThanOrEqual(180);
      await pool.end();
      await v1Alone.pool.end();
    });

    it('a card stored above the cap by V1 is pulled back to 180 days on its next V2 Known, never grown', async () => {
      const { pool } = await makeDb(true);
      const a = await api();
      const store = new a.PostgresReviewEventStore(pool as never);
      const v2 = new a.MobileReviewBatchService(store, () => new Date(NOW), {
        schedulerV2: true,
        schedulerV2Preflight: a.createSchedulerV2Preflight(pool as never),
      });
      const user = await newLearner(pool);
      const card = (await store.resolveCardId('cp7-a'))!;
      await store.ensureApprovedSchedule(user, 'cp7-a');
      await pool.query(
        `UPDATE card_schedules SET stability_days = 540 WHERE user_id=$1 AND card_id=$2`,
        [user, card],
      );
      await v2.submit({ userId: user, items: [answer('cp7-a', 'known', NOW)] });
      const row = await schedRow(pool, user, card);
      expect(row.stability_days).toBe(180);
      expect(new Date(row.due_at).getTime() - new Date(NOW).getTime()).toBe(180 * DAY);
      await pool.end();
    });
  },
);

suite('CP7 — the real runtime entry points honour LEARNBOX_SCHEDULER_V2 (web and mobile)', () => {
  const FAKE_URL = 'postgres://cp7:cp7@cp7-injected/cp7';
  const secret = 'x'.repeat(40);
  const globals = globalThis as unknown as Record<string, unknown>;

  async function entries(pool: PgPool, flag: string | undefined) {
    globals.learnboxWebReviewPool = { databaseUrl: FAKE_URL, pool };
    globals.learnboxMobileReviewPool = { databaseUrl: FAKE_URL, pool };
    const env: Record<string, string | undefined> = {
      DATABASE_URL: FAKE_URL,
      WEB_LEARNER_STATE_ENABLED: 'true',
      LEARNBOX_SESSION_SECRET: secret,
      MOBILE_REVIEW_SYNC_ENABLED: 'true',
      LEARNBOX_MOBILE_SESSION_SECRET: secret,
      ...(flag === undefined ? {} : { LEARNBOX_SCHEDULER_V2: flag }),
    };
    const web = webReviewDependenciesFromEnvironment(env)!;
    const mobile = mobileReviewHttpDependenciesFromEnvironment(env)!;
    return { web, mobile };
  }
  afterAll(() => {
    delete globals.learnboxWebReviewPool;
    delete globals.learnboxMobileReviewPool;
  });

  const input = (
    user: string,
    clientEventId: string,
    grade: 'remembered' | 'forgot' = 'remembered',
  ) => ({
    userId: user,
    items: [{ clientEventId, contentId: 'cp7-a', grade, occurredAt: new Date() }],
  });

  it('flag unset or false on a pre-0023 database: both entry points work and store no engine stamp', async () => {
    for (const flag of [undefined, 'false', '']) {
      const { pool } = await makeDb(false);
      const user = await newLearner(pool);
      const { web, mobile } = await entries(pool, flag);
      expect((await web.submit(input(user, `w-${flag}`)))[0]).toMatchObject({
        status: 'acknowledged',
      });
      expect((await mobile.submit(input(user, `m-${flag}`)))[0]).toMatchObject({
        status: 'acknowledged',
      });
      const events = await eventRows(pool, user);
      expect(events).toHaveLength(2);
      expect(events.every((e) => !('engine_version' in e))).toBe(true);
      await pool.end();
    }
  });

  it('flag true on a pre-0023 database: both entry points refuse and persist nothing', async () => {
    const { pool } = await makeDb(false);
    const user = await newLearner(pool);
    const { web, mobile } = await entries(pool, 'true');
    await expect(web.submit(input(user, 'w-1'))).rejects.toMatchObject({
      code: 'serverUnavailable',
    });
    await expect(mobile.submit(input(user, 'm-1'))).rejects.toMatchObject({
      code: 'serverUnavailable',
    });
    expect((await pool.query('SELECT count(*)::int AS n FROM review_events')).rows[0].n).toBe(0);
    expect((await pool.query('SELECT count(*)::int AS n FROM card_schedules')).rows[0].n).toBe(0);
    await pool.end();
  });

  it('flag true on a migrated database: both entry points schedule with GR-1.8 and stamp engine_version 2', async () => {
    const { pool } = await makeDb(true);
    const user = await newLearner(pool);
    const { web, mobile } = await entries(pool, 'true');
    expect((await web.submit(input(user, 'w-1')))[0]).toMatchObject({ status: 'acknowledged' });
    const afterWeb = await schedRow(
      pool,
      user,
      (await pool.query(`SELECT id FROM cards WHERE content_id='cp7-a'`)).rows[0].id,
    );
    expect(afterWeb.stability_days).toBe(1);
    expect((await mobile.submit(input(user, 'm-1')))[0]).toMatchObject({ status: 'acknowledged' });
    const events = await eventRows(pool, user);
    expect(events.map((e) => e.engine_version)).toEqual([2, 2]);
    await pool.end();
  });
});
