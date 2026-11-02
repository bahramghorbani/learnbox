import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Pool as PgPool } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { readLeague, setLeagueOptOut } from '../lib/league';
import { guardForcedTeardown } from './support/forced-teardown-guard';

/**
 * LearnBox League against real Postgres with every migration applied: forming state below the
 * active threshold, live weekly groups, first-name-only rows, percentile instead of a global rank,
 * idempotent week close with promotion, badges awarded once, refunds removing XP, opt-out, the
 * feature flag on the real route, and account deletion clearing league rows.
 *
 * Requires TEST_DATABASE_URL (an empty database; the suite creates and drops its own database).
 */
const h = vi.hoisted(() => ({
  shared: null as null | PgPool,
  session: null as null | { subject: string },
}));
vi.mock('pg', async (importOriginal) => {
  const actual = await importOriginal<typeof import('pg')>();
  class SharedPool {
    constructor() {
      return h.shared as never;
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
const dbName = `league_${Math.random().toString(36).slice(2, 10)}`;
const migrationsDir = join(__dirname, '../../../database/migrations');
let pool: PgPool;
let admin: PgPool;
const cards: string[] = [];
const users: string[] = [];
const teardowns: Array<{ beginTeardown: () => void }> = [];
// Monday 2026-11-02 12:00 Tehran; the league week opened Saturday 2026-10-31.
const NOW = new Date('2026-11-02T08:30:00Z');
const NEXT_WEEK = new Date('2026-11-07T08:30:00Z');

async function addUser(name: string): Promise<string> {
  const id = randomUUID();
  await pool.query('INSERT INTO users (id, phone_e164, first_name) VALUES ($1, $2, $3)', [
    id,
    `+98912${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`,
    name,
  ]);
  users.push(id);
  return id;
}

async function review(userId: string, count: number, at: Date) {
  for (let i = 0; i < count; i += 1) {
    await pool.query(
      `INSERT INTO review_events (id, user_id, card_id, grade, occurred_at, client_event_id)
       VALUES ($1, $2, $3, 'remembered', $4, $5)`,
      [
        randomUUID(),
        userId,
        cards[i % cards.length],
        new Date(at.getTime() + i * 1000),
        randomUUID(),
      ],
    );
  }
}

suite('LearnBox League (real Postgres)', () => {
  beforeAll(async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://unused/unused');
    const { Pool } = await vi.importActual<typeof import('pg')>('pg');
    admin = new Pool({ connectionString: url, max: 1 });
    teardowns.push(guardForcedTeardown(admin));
    await admin.query(`CREATE DATABASE ${dbName}`);
    const scoped = new URL(url as string);
    scoped.pathname = `/${dbName}`;
    pool = new Pool({ connectionString: scoped.toString(), max: 4 });
    teardowns.push(guardForcedTeardown(pool));
    h.shared = pool;
    for (const file of readdirSync(migrationsDir)
      .filter((f) => /^\d{4}_.+\.sql$/.test(f))
      .sort()) {
      await pool.query(readFileSync(join(migrationsDir, file), 'utf8'));
    }
    await pool.query(
      `INSERT INTO packs (id, display_name, target_item_count, status, is_free, published_at)
       VALUES ('league-pack', 'League pack', 1, 'published', false, now())`,
    );
    for (let i = 0; i < 20; i += 1) {
      const id = randomUUID();
      await pool.query(`INSERT INTO cards (id, lemma, content_id) VALUES ($1, $2, $2)`, [
        id,
        `w${i}`,
      ]);
      cards.push(id);
    }
  }, 180_000);

  afterAll(async () => {
    h.shared = null;
    teardowns.forEach((t) => t.beginTeardown());
    await pool?.end();
    await admin?.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
    await admin?.end();
  });

  it('stays "forming" below the active threshold and reveals no rows', async () => {
    const sara = await addUser('سارا احمدی');
    await review(sara, 5, new Date('2026-11-01T06:00:00Z'));
    const view = await readLeague(pool, sara, NOW);
    expect(view.league.state).toBe('forming');
    expect(view.league.group).toEqual([]);
    expect(view.league.global).toBeNull();
    expect(view.xp.weekly).toBe(5 * 15 + 5); // five first-time cards + day-1 streak
    expect(view.badges).toEqual([]);
  });

  it('goes live at 10 active learners with first names only and a percentile', async () => {
    for (let i = 0; i < 11; i += 1) {
      const id = await addUser(`نفر${i} فامیلی`);
      await review(id, i + 1, new Date('2026-11-01T07:00:00Z'));
    }
    const top = users[users.length - 1];
    const view = await readLeague(pool, top, NOW);
    expect(view.league.state).toBe('live');
    expect(view.league.group.length).toBeLessThanOrEqual(10);
    expect(view.league.group[0]).toMatchObject({ rank: 1, me: true, name: 'نفر10' });
    expect(view.league.group.every((r) => !r.name.includes(' '))).toBe(true);
    expect(view.league.me).toMatchObject({ rank: 1, zone: 'promotion' });
    expect(view.league.global?.percentile).toBe(10);
    expect(JSON.stringify(view)).not.toMatch(/\+98|phone|user_id/);
    const members = await pool.query('SELECT count(*)::int AS n FROM league_members');
    expect(members.rows[0].n).toBe(12);
  });

  it('a second read in the same week changes nothing (idempotent sync)', async () => {
    const before = await pool.query('SELECT * FROM league_members ORDER BY user_id');
    await readLeague(pool, users[0], NOW);
    const after = await pool.query('SELECT * FROM league_members ORDER BY user_id');
    expect(after.rows).toEqual(before.rows);
  });

  it('closes the week once on the first read after Saturday and promotes the top', async () => {
    const top = users[users.length - 1];
    await review(top, 2, new Date('2026-11-07T07:00:00Z'));
    const [a, b] = await Promise.all([
      readLeague(pool, top, NEXT_WEEK),
      readLeague(pool, users[1], NEXT_WEEK),
    ]);
    expect(a.league.weekStart).toBe('2026-11-07');
    expect(b.league.weekStart).toBe('2026-11-07');
    const closed = await pool.query<{ user_id: string; final_rank: number; outcome: string }>(
      `SELECT user_id, final_rank, outcome FROM league_members WHERE week_start = '2026-10-31'`,
    );
    expect(closed.rows.every((r) => r.outcome !== null)).toBe(true);
    const ranks = closed.rows.map((r) => r.final_rank).sort((x, y) => x - y);
    expect(ranks).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
    expect(closed.rows.find((r) => r.user_id === top)).toMatchObject({
      final_rank: 1,
      outcome: 'promoted',
    });
    expect(a.league.tier).toBe(1); // Dresden
    expect(a.badges.map((x) => x.id)).toEqual(
      expect.arrayContaining(['league_promoted', 'league_medal']),
    );
    const again = await readLeague(pool, top, NEXT_WEEK);
    expect(again.badges).toHaveLength(a.badges.length); // awarded once
  });

  it('a purchase adds XP only while verified; a refund takes it back', async () => {
    const buyer = users[0];
    const before = (await readLeague(pool, buyer, NOW)).xp.total;
    const purchase = await pool.query<{ id: string }>(
      `INSERT INTO purchase_events (user_id, provider, environment, provider_purchase_id, pack_id, amount_tomans, status, verified_at)
       VALUES ($1, 'zarinpal', 'sandbox', $2, 'league-pack', 240000, 'verified', $3) RETURNING id`,
      [buyer, `A${randomUUID().replace(/-/g, '')}`, NOW],
    );
    const bought = await readLeague(pool, buyer, NOW);
    expect(bought.xp.total).toBe(before + 2_500 + 100); // + collector badge
    expect(bought.badges.map((x) => x.id)).toContain('collector');
    await pool.query(`UPDATE purchase_events SET status = 'refunded' WHERE id = $1`, [
      purchase.rows[0].id,
    ]);
    const refunded = await readLeague(pool, buyer, NOW);
    expect(refunded.xp.total).toBe(before + 100); // the badge stays, the purchase XP does not
  });

  it('opting out hides the learner immediately and keeps their XP', async () => {
    const top = users[users.length - 1];
    await setLeagueOptOut(pool, top, true, NEXT_WEEK);
    const self = await readLeague(pool, top, NEXT_WEEK);
    expect(self.league.state).toBe('opted_out');
    expect(self.xp.total).toBeGreaterThan(0);
    const other = await readLeague(pool, users[1], NEXT_WEEK);
    expect(other.league.global?.top.some((r) => r.name === 'نفر10') ?? false).toBe(false);
    await setLeagueOptOut(pool, top, false, NEXT_WEEK);
  });

  it('the route returns { enabled: false } outside the rollout and data inside it', async () => {
    const { GET, POST } = await import('../app/api/learner/league/route.js');
    h.session = { subject: users[0] };
    vi.stubEnv('LEARNBOX_LEAGUE_ENABLED', '');
    expect(await (await GET(new Request('http://localhost/api/learner/league'))).json()).toEqual({
      enabled: false,
    });
    expect(
      (await POST(new Request('http://localhost/api/learner/league', { method: 'POST' }))).status,
    ).not.toBe(200);
    vi.stubEnv('LEARNBOX_LEAGUE_ENABLED', users[0]);
    const body = await (await GET(new Request('http://localhost/api/learner/league'))).json();
    expect(body.enabled).toBe(true);
    expect(body.xp.total).toBeGreaterThan(0);
    h.session = null;
    expect((await GET(new Request('http://localhost/api/learner/league'))).status).toBe(401);
    vi.unstubAllEnvs();
  });

  it('cascades league rows with the user', async () => {
    const gone = users[2];
    await pool.query('DELETE FROM review_events WHERE user_id = $1', [gone]);
    await pool.query('DELETE FROM users WHERE id = $1', [gone]);
    const left = await pool.query(
      `SELECT (SELECT count(*) FROM league_members WHERE user_id = $1)
            + (SELECT count(*) FROM user_badges WHERE user_id = $1) AS n`,
      [gone],
    );
    expect(Number(left.rows[0].n)).toBe(0);
  });
});
