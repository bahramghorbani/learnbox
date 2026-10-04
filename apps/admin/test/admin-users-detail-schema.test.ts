/**
 * LB-B34 Admin users-detail schema contract.
 *
 * The Admin user-detail route previously selected `rating` and `created_at` from `review_events`.
 * Those columns have never existed: `0001_initial.sql` defines `grade` and `occurred_at`, so every
 * authenticated call to this route failed with a Postgres `column does not exist` error. The bug
 * was invisible because the route is behind the LB-B30 legacy 404 gate and had no test.
 *
 * Two layers here, because each catches a different failure:
 *
 *  1. A behavioural test that invokes the real exported `GET` with a fake pool and asserts on the
 *     SQL the route actually sends. It fails if the route stops asking for the real columns.
 *  2. A contract test that reads the canonical migration DDL and cross-checks every column the
 *     route references against it. It fails if a future edit reintroduces a column that does not
 *     exist in the schema — the class of bug this was.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// Static import: the route creates its pool lazily inside the handler, so importing it here has no
// side effects. (A dynamic relative import would need a file extension under NodeResolution.)
import { GET } from '../app/api/users/[userId]/route';

const ROUTE_PATH = join(__dirname, '..', 'app', 'api', 'users', '[userId]', 'route.ts');
const INITIAL_MIGRATION = join(
  __dirname,
  '..',
  '..',
  '..',
  'database',
  'migrations',
  '0001_initial.sql',
);

/** Columns `review_events` really has, parsed from the canonical CREATE TABLE. */
function reviewEventColumnsFromMigration(): string[] {
  const sql = readFileSync(INITIAL_MIGRATION, 'utf8');
  const match = /CREATE TABLE review_events \(([\s\S]*?)\n\);/.exec(sql);
  if (!match) throw new Error('review_events CREATE TABLE not found in 0001_initial.sql');
  return match[1]
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('--'))
    .map((line) => line.split(/\s+/)[0].toLowerCase())
    .filter((name) => /^[a-z_]+$/.test(name) && name !== 'check');
}

type Captured = { sql: string; parameters: readonly unknown[] | undefined };

const AUTH_ENVIRONMENT = {
  LEARNBOX_ADMIN_PASSKEY_ENABLED: 'true',
  LEARNBOX_ADMIN_ORIGIN: 'https://admin.learnbox.app',
  LEARNBOX_ADMIN_RP_ID: 'admin.learnbox.app',
  LEARNBOX_ADMIN_TOKEN_HASH_KEY: 'k'.repeat(32),
  DATABASE_URL: 'postgres://admin:secret@db.example.com:5432/learnbox',
  // Outside production + explicit flag: opens the LB-B30 legacy gate so the handler body runs.
  NODE_ENV: 'development',
  LEARNBOX_ADMIN_LEGACY_ROUTES_ENABLED: 'true',
} as const;

const USER_ID = '11111111-2222-4333-8444-555555555555';
const SESSION_TOKEN = 'T'.repeat(48);

/**
 * Seeds the shared pool cache so the route's own `getPool()` returns this fake. The route builds
 * its config from `DATABASE_URL`, so the cache key is derived the same way the route derives it.
 */
function installFakePool(rowsFor: (sql: string) => Record<string, unknown>[]) {
  const captured: Captured[] = [];
  const pool = {
    async query(sql: string, parameters?: readonly unknown[]) {
      captured.push({ sql, parameters });
      return { rows: rowsFor(sql) };
    },
    async connect() {
      throw new Error('connect() is not used by this route');
    },
  };

  const globalWithPools = globalThis as typeof globalThis & {
    learnboxAdminPools?: Map<string, unknown>;
  };
  const pools = (globalWithPools.learnboxAdminPools ??= new Map());
  const connectionString = (() => {
    const parsed = new URL(AUTH_ENVIRONMENT.DATABASE_URL);
    parsed.searchParams.set('sslmode', 'verify-full');
    return parsed.toString();
  })();
  const key = [connectionString, '2', '10000', '5000'].join('\u0000');
  pools.set(key, pool);
  return { captured, key, pools };
}

describe('Admin users-detail schema contract (LB-B34)', () => {
  const originalEnvironment = { ...process.env };
  let installed: ReturnType<typeof installFakePool> | undefined;

  beforeEach(() => {
    Object.assign(process.env, AUTH_ENVIRONMENT);
  });

  afterEach(() => {
    if (installed) installed.pools.delete(installed.key);
    installed = undefined;
    for (const name of Object.keys(AUTH_ENVIRONMENT)) delete process.env[name];
    Object.assign(process.env, originalEnvironment);
  });

  it('asks review_events for grade and occurred_at, never rating or created_at', async () => {
    installed = installFakePool((sql) => {
      // Session lookup: return an active, recently-verified owner session.
      if (/admin_sessions/i.test(sql)) {
        const now = new Date();
        return [
          {
            token_hash: 'hash',
            user_id: 'owner-1',
            csrf_hash: 'csrf',
            created_at: now,
            last_seen_at: now,
            expires_at: new Date(now.getTime() + 60 * 60 * 1000),
            reauthenticated_at: now,
            revoked_at: null,
          },
        ];
      }
      if (/UPDATE admin_sessions/i.test(sql)) return [{ ok: true }];
      if (/FROM users/i.test(sql)) return [{ id: USER_ID, first_name: 'Mona' }];
      if (/cards_started/i.test(sql)) {
        return [{ cards_started: '3', total_reviews: '3', last_review_at: new Date() }];
      }
      return [{ card_id: 'card-1', grade: 'remembered', occurred_at: new Date() }];
    });

    const response = await GET(
      new Request(`https://admin.learnbox.app/api/users/${USER_ID}`, {
        headers: { cookie: `__Host-learnbox_admin_session=${SESSION_TOKEN}` },
      }),
      { params: Promise.resolve({ userId: USER_ID }) },
    );

    // The route must have reached its queries rather than short-circuiting on the gate or session.
    const reviewQueries = installed.captured
      .map((entry) => entry.sql)
      .filter((sql) => /review_events/i.test(sql));
    expect(reviewQueries.length).toBeGreaterThan(0);

    const combined = reviewQueries.join('\n');
    expect(combined).toMatch(/max\(occurred_at\)/i);
    expect(combined).toMatch(/\bgrade\b/);
    expect(combined).toMatch(/ORDER BY\s+occurred_at\s+DESC/i);
    // The exact regression: these columns do not exist on review_events.
    expect(combined).not.toMatch(/\brating\b/);
    expect(combined).not.toMatch(/\bcreated_at\b/);

    expect(response.status).toBe(200);
    const body = (await response.json()) as { recentReviews: Record<string, unknown>[] };
    expect(body.recentReviews[0]).toHaveProperty('grade');
    expect(body.recentReviews[0]).toHaveProperty('occurred_at');
  });

  it('references only columns that exist in the canonical review_events DDL', () => {
    const actual = reviewEventColumnsFromMigration();
    expect(actual).toContain('grade');
    expect(actual).toContain('occurred_at');
    expect(actual).not.toContain('rating');
    expect(actual).not.toContain('created_at');

    const source = readFileSync(ROUTE_PATH, 'utf8');
    // Non-greedy SELECT…FROM review_events would still span an earlier statement, so anchor each
    // fragment to the nearest preceding SELECT by forbidding another FROM inside the capture.
    const reviewEventSelects = [
      ...source.matchAll(/SELECT((?:(?!\bFROM\b)[\s\S])*?)FROM\s+review_events/gi),
    ].map((match) => match[1]);

    expect(reviewEventSelects.length).toBeGreaterThan(0);

    for (const fragment of reviewEventSelects) {
      for (const column of fragment.matchAll(/\b([a-z_]{3,})\b/g)) {
        const name = column[1];
        if (['select', 'from', 'max', 'count', 'where', 'user_id', 'and', 'as'].includes(name)) {
          continue;
        }
        expect(
          actual,
          `route selects "${name}" from review_events, which is not a real column`,
        ).toContain(name);
      }
    }
  });
});
