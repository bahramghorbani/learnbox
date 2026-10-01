import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Pool as PgPool } from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * LB-B35 CP4 — binary-response compatibility and rejection recording on the real Postgres write path, against a REAL Postgres with
 * every repo migration applied. The REAL route handlers run; only the pg Pool, session authentication
 * and the TLS guard are replaced (same seams as the CP0 characterization suite).
 *
 * Requires TEST_DATABASE_URL (an empty database; the suite creates and drops its own database).
 */
const h = vi.hoisted(() => ({
  shared: null as null | { query: (...args: unknown[]) => Promise<unknown> },
  session: null as null | { subject: string },
}));

vi.mock('pg', async (importOriginal) => {
  const actual = await importOriginal<typeof import('pg')>();
  class SharedPool {
    constructor() {
      return {
        query: (...args: unknown[]) => h.shared!.query(...args),
        end: async () => undefined,
      } as never;
    }
  }
  return { ...actual, default: { ...actual, Pool: SharedPool }, Pool: SharedPool };
});
vi.mock('../lib/learner-auth', () => ({ authenticateLearner: async () => h.session }));
vi.mock('../../api/dist/database/migration-runner.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  requireVerifiedDatabaseTls: (value: string) => value,
}));

const url = process.env.TEST_DATABASE_URL;
if (!url && process.env.CI) throw new Error('TEST_DATABASE_URL is required in CI');
const suite = url ? describe : describe.skip;
const dbName = `cp4rev_${Math.random().toString(36).slice(2, 10)}`;
const migrationsDir = join(__dirname, '../../../database/migrations');
let pool: PgPool;
let admin: PgPool;
const cards: string[] = [];

async function newLearner(): Promise<string> {
  const id = randomUUID();
  await pool.query('INSERT INTO users (id, phone_e164) VALUES ($1, $2)', [
    id,
    `+98912${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`,
  ]);
  return id;
}

beforeAll(async () => {
  vi.stubEnv('DATABASE_URL', 'postgres://unused/unused');
  const { Pool } = await vi.importActual<typeof import('pg')>('pg');
  admin = new Pool({ connectionString: url, max: 1 });
  admin.on('error', () => undefined);
  await admin.query(`CREATE DATABASE ${dbName}`);
  const scoped = new URL(url as string);
  scoped.pathname = `/${dbName}`;
  pool = new Pool({ connectionString: scoped.toString(), max: 4 });
  pool.on('error', () => undefined);
  h.shared = pool;
  for (const file of readdirSync(migrationsDir)
    .filter((f) => /^\d{4}_.+\.sql$/.test(f) && !f.startsWith('0023'))
    .sort()) {
    await pool.query(readFileSync(join(migrationsDir, file), 'utf8'));
  }
  await pool.query(
    `INSERT INTO packs (id, display_name, target_item_count, status, is_free, published_at)
     VALUES ('cp4-pack', 'CP4 pack', 4, 'published', true, now()),
            ('cp4-draft', 'CP4 draft', 1, 'draft', false, null)`,
  );
  const make = async (name: string, pack: string, sort: number) => {
    const id = randomUUID();
    await pool.query(`INSERT INTO cards (id, lemma, content_id) VALUES ($1, $2, $2)`, [id, name]);
    await pool.query(
      `INSERT INTO card_versions (card_id, version, status, content_json, source_provider, published_at)
       VALUES ($1, 1, 'published', $2::jsonb, 'editorial', now())`,
      [id, JSON.stringify({ lemma: name, article: 'das', persianMeanings: ['x'], cefr: 'A1' })],
    );
    await pool.query(`INSERT INTO pack_cards (pack_id, card_id, sort_order) VALUES ($1, $2, $3)`, [
      pack,
      id,
      sort,
    ]);
    return id;
  };
  for (const [i, name] of [
    'start-a1-cp4-a',
    'start-a1-cp4-b',
    'start-a1-cp4-c',
    'start-a1-cp4-d',
  ].entries()) {
    cards.push(await make(name, 'cp4-pack', i + 1));
  }
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv('DATABASE_URL', 'postgres://unused/unused');
});

afterAll(async () => {
  h.shared = null;
  await pool?.end();
  await admin?.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin?.end();
  vi.unstubAllEnvs();
});

const apply0023 = () =>
  pool.query(readFileSync(join(migrationsDir, '0023_learning_persistence.sql'), 'utf8'));

async function stack() {
  const { PostgresReviewEventStore } =
    await import('../../api/dist/reviews/postgres-review-event.store.js');
  const { MobileReviewBatchService } =
    await import('../../api/dist/reviews/mobile-review-batch.service.js');
  const { parseMobileReviewBatchRequest } =
    await import('../../api/dist/reviews/mobile-review-batch.request.js');
  const store = new PostgresReviewEventStore(pool as never);
  const service = new MobileReviewBatchService(store, () => new Date(NOW));
  return { store, service, parseMobileReviewBatchRequest };
}

const NOW = '2026-10-01T09:00:00.000Z';
const rows = (user: string) =>
  pool
    .query(`SELECT * FROM review_events WHERE user_id = $1 ORDER BY occurred_at`, [user])
    .then((r) => r.rows);

suite('CP4 — rollback guarantee: every flag off runs on a database WITHOUT migration 0023', () => {
  it('a legacy four-grade answer is stored exactly as v1.2.1 stored it, before 0023 exists', async () => {
    const user = await newLearner();
    const { service } = await stack();
    const out = await service.submit({
      userId: user,
      items: [
        {
          clientEventId: 'legacy-1',
          contentId: 'start-a1-cp4-a',
          grade: 'remembered',
          occurredAt: new Date(NOW),
        },
      ],
    });
    expect(out[0]).toMatchObject({ status: 'acknowledged', idempotent: false });
    const [row] = await rows(user);
    expect(row.grade).toBe('remembered');
    expect('response' in row).toBe(false); // the column does not exist yet
  });

  it('the strict v1.2.1 wire format is unchanged: `response` is rejected while the binary flag is off', async () => {
    const { parseMobileReviewBatchRequest } = await stack();
    const body = {
      items: [
        { clientEventId: 'c1', contentId: 'start-a1-cp4-a', response: 'known', occurredAt: NOW },
      ],
    };
    expect(() => parseMobileReviewBatchRequest(body, 'u')).toThrow();
    expect(() => parseMobileReviewBatchRequest(body, 'u', { binaryResponses: false })).toThrow();
  });
});

suite('CP4 — migration 0023 applied: legacy and binary answers coexist', () => {
  it('applies cleanly on top of existing review history and leaves it untouched', async () => {
    const user = await newLearner();
    const { service } = await stack();
    await service.submit({
      userId: user,
      items: [
        {
          clientEventId: 'pre-0023',
          contentId: 'start-a1-cp4-b',
          grade: 'hard',
          occurredAt: new Date(NOW),
        },
      ],
    });
    const before = await rows(user);
    await apply0023();
    await apply0023(); // idempotent
    const after = await rows(user);
    const legacyColumns = (row: Record<string, unknown>) => {
      const copy = { ...row };
      delete copy.response;
      delete copy.engine_version;
      return copy;
    };
    expect(after.map(legacyColumns)).toEqual(before);
    expect(after[0].response).toBeNull();
    expect(after[0].engine_version).toBeNull();
  });

  it('a legacy answer after 0023 still stores response NULL and its own grade', async () => {
    const user = await newLearner();
    const { service } = await stack();
    await service.submit({
      userId: user,
      items: [
        {
          clientEventId: 'legacy-2',
          contentId: 'start-a1-cp4-c',
          grade: 'mastered',
          occurredAt: new Date(NOW),
        },
      ],
    });
    const [row] = await rows(user);
    expect(row).toMatchObject({ grade: 'mastered', response: null });
  });

  it('a binary answer stores `response` plus the shadow grade; the legacy CHECK never sees known/unknown', async () => {
    const user = await newLearner();
    const { service, parseMobileReviewBatchRequest } = await stack();
    const parsed = parseMobileReviewBatchRequest(
      {
        items: [
          {
            clientEventId: 'b-known',
            contentId: 'start-a1-cp4-a',
            response: 'known',
            occurredAt: NOW,
          },
          {
            clientEventId: 'b-unknown',
            contentId: 'start-a1-cp4-b',
            response: 'unknown',
            occurredAt: NOW,
          },
        ],
      },
      user,
      { binaryResponses: true },
    );
    const out = await service.submit({ userId: user, items: parsed.items });
    expect(out.map((o) => o.status)).toEqual(['acknowledged', 'acknowledged']);
    const stored = Object.fromEntries((await rows(user)).map((r) => [r.client_event_id, r]));
    expect(stored['b-known']).toMatchObject({ grade: 'remembered', response: 'known' });
    expect(stored['b-unknown']).toMatchObject({ grade: 'forgot', response: 'unknown' });
    // Anything that is not one of the four legacy grades is still refused in the legacy column.
    await expect(
      pool.query(`UPDATE review_events SET grade = 'known' WHERE user_id = $1`, [user]),
    ).rejects.toThrow();
  });

  it('a binary answer schedules exactly as its shadow grade does (scheduler untouched)', async () => {
    const a = await newLearner();
    const b = await newLearner();
    const { service, parseMobileReviewBatchRequest } = await stack();
    const binary = parseMobileReviewBatchRequest(
      {
        items: [
          { clientEventId: 'x1', contentId: 'start-a1-cp4-c', response: 'known', occurredAt: NOW },
        ],
      },
      a,
      { binaryResponses: true },
    );
    await service.submit({ userId: a, items: binary.items });
    await service.submit({
      userId: b,
      items: [
        {
          clientEventId: 'x2',
          contentId: 'start-a1-cp4-c',
          grade: 'remembered',
          occurredAt: new Date(NOW),
        },
      ],
    });
    const sched = (u: string) =>
      pool
        .query(
          `SELECT stability_days, difficulty, lapses, state, due_at FROM card_schedules WHERE user_id = $1 AND card_id = $2`,
          [u, cards[2]],
        )
        .then((r) => r.rows[0]);
    expect(await sched(a)).toEqual(await sched(b));
  });

  it('replaying the same binary event is idempotent; a different answer under the same id is a conflict', async () => {
    const user = await newLearner();
    const { service, parseMobileReviewBatchRequest } = await stack();
    const post = (response: 'known' | 'unknown') =>
      service.submit({
        userId: user,
        items: parseMobileReviewBatchRequest(
          {
            items: [
              { clientEventId: 'idem', contentId: 'start-a1-cp4-d', response, occurredAt: NOW },
            ],
          },
          user,
          { binaryResponses: true },
        ).items,
      });
    expect((await post('known'))[0]).toMatchObject({ status: 'acknowledged', idempotent: false });
    expect((await post('known'))[0]).toMatchObject({ status: 'acknowledged', idempotent: true });
    expect((await post('unknown'))[0]).toMatchObject({ status: 'idempotencyConflict' });
    expect(await rows(user)).toHaveLength(1);
  });

  it('malformed binary items are refused: both keys, wrong value, extra key', async () => {
    const { parseMobileReviewBatchRequest } = await stack();
    const parse = (item: Record<string, unknown>) =>
      parseMobileReviewBatchRequest(
        { items: [{ clientEventId: 'm', contentId: 'start-a1-cp4-a', occurredAt: NOW, ...item }] },
        'u',
        { binaryResponses: true },
      );
    expect(() => parse({ response: 'known', grade: 'remembered' })).toThrow();
    expect(() => parse({ response: 'maybe' })).toThrow();
    expect(() => parse({ response: 'known', extra: 1 })).toThrow();
    expect(() => parse({ response: 7 })).toThrow();
    // The legacy four-grade shape is still accepted with the flag on (mixed-client transition).
    expect(parse({ grade: 'hard' }).items[0]).toMatchObject({ grade: 'hard' });
  });

  it('review history stays append-only: the write path adds rows and never changes an existing one', async () => {
    const user = await newLearner();
    const { service } = await stack();
    await service.submit({
      userId: user,
      items: [
        {
          clientEventId: 'ao-1',
          contentId: 'start-a1-cp4-a',
          grade: 'remembered',
          occurredAt: new Date(NOW),
        },
      ],
    });
    const first = (await rows(user))[0];
    await service.submit({
      userId: user,
      items: [
        {
          clientEventId: 'ao-2',
          contentId: 'start-a1-cp4-a',
          grade: 'forgot',
          occurredAt: new Date(Date.parse(NOW) + 1000),
        },
      ],
    });
    const all = await rows(user);
    expect(all).toHaveLength(2);
    expect(all.find((r) => r.client_event_id === 'ao-1')).toEqual(first);
  });
});

suite('CP4 — rejection recording (flag LEARNBOX_QUEUE_QUARANTINE)', () => {
  it('stores a bounded reason code per rejected event and no answer payload', async () => {
    const user = await newLearner();
    const { store } = await stack();
    await store.recordRejections(user, [
      { clientEventId: 'r1', reason: 'validation' },
      { clientEventId: 'r2', reason: 'clockSkew' },
      { clientEventId: 'r3', reason: 'idempotencyConflict' },
    ]);
    const { rows: out } = await pool.query(
      `SELECT client_event_id, reason FROM review_event_rejections WHERE user_id = $1 ORDER BY client_event_id`,
      [user],
    );
    expect(out).toEqual([
      { client_event_id: 'r1', reason: 'validation' },
      { client_event_id: 'r2', reason: 'clockSkew' },
      { client_event_id: 'r3', reason: 'idempotencyConflict' },
    ]);
    const cols = (
      await pool.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'review_event_rejections' ORDER BY 1`,
      )
    ).rows.map((r) => r.column_name);
    expect(cols).toEqual(['client_event_id', 'id', 'reason', 'received_at', 'user_id']);
  });

  it('accepts a non-UUID, up-to-128-character client event id (same bound as review_events)', async () => {
    const user = await newLearner();
    const { store } = await stack();
    await store.recordRejections(user, [{ clientEventId: 'x'.repeat(128), reason: 'validation' }]);
    expect(
      (await pool.query(`SELECT 1 FROM review_event_rejections WHERE user_id = $1`, [user]))
        .rowCount,
    ).toBe(1);
  });

  it('is best-effort: a recording failure never throws into the review request', async () => {
    const { store } = await stack();
    await expect(
      store.recordRejections('00000000-0000-0000-0000-00000000dead', [
        { clientEventId: 'orphan', reason: 'validation' },
      ]),
    ).resolves.toBeUndefined(); // FK violation (unknown user) is swallowed
    await expect(store.recordRejections('u', [])).resolves.toBeUndefined();
  });

  it('the runtime role can insert and read rejections but cannot update or delete them', async () => {
    const has = async (priv: string) =>
      (
        await pool.query(
          `SELECT has_table_privilege('learnbox_app', 'review_event_rejections', $1) AS ok`,
          [priv],
        )
      ).rows[0].ok;
    const roleExists = (await pool.query(`SELECT 1 FROM pg_roles WHERE rolname = 'learnbox_app'`))
      .rowCount;
    if (!roleExists) return; // plain test database: the grants block is intentionally conditional
    expect(await has('INSERT')).toBe(true);
    expect(await has('SELECT')).toBe(true);
    expect(await has('UPDATE')).toBe(false);
    expect(await has('DELETE')).toBe(false);
  });
});
