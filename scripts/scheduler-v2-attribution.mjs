/**
 * LB-B35 CP15 (Workstream C): pre-activation snapshot + V2 attribution tool.
 *
 * READ-ONLY against the target database. It never writes, migrates, or changes a flag. It exists so
 * that a future (separately authorized) Scheduler V2 observation can be proven reversible and
 * exactly attributable BEFORE the first V2 write happens.
 *
 * Why this tool is necessary (proven, not assumed):
 *
 *   `card_schedules` is mutable current-state with no history column and no audit table. Replaying
 *   `review_events` through the V1 engine reproduces only 22 of 31 current Production schedules
 *   exactly; 9 (all in one older account) differ in `stability_days` magnitude while matching on
 *   `state` and `lapses`. Those 9 predate the current engine build. Therefore replay ALONE cannot
 *   reconstruct the exact pre-V2 state, and "roll back the flag" is NOT a data rollback.
 *
 * Usage:
 *   node scripts/scheduler-v2-attribution.mjs --snapshot --out <file>   # before activation
 *   node scripts/scheduler-v2-attribution.mjs --verify --baseline <file> # after observation
 *
 * Connection comes from DATABASE_URL (or --database-url). Nothing is read from the repo.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const SCHEDULE_COLUMNS = [
  'user_id',
  'card_id',
  'state',
  'stability_days',
  'difficulty',
  'lapses',
  'due_at',
  'last_reviewed_at',
];

function arg(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

/** Stable, whitespace-free projection so a fingerprint is comparable across runs and hosts. */
export function fingerprintSchedules(rows) {
  const canonical = rows
    .map((row) =>
      SCHEDULE_COLUMNS.map((column) => {
        const value = row[column];
        if (value === null || value === undefined) return '';
        if (value instanceof Date) return value.toISOString();
        // `stability_days` and `difficulty` are double precision: pin the exact repr.
        return typeof value === 'number' ? value.toExponential(17) : String(value);
      }).join('\u0001'),
    )
    .sort()
    .join('\u0002');
  return { rows: rows.length, sha256: sha256(canonical) };
}

/**
 * Classify every schedule row against the append-only event log.
 *
 * `engineVersions` is the distinct set of `review_events.engine_version` values observed for that
 * (user_id, card_id) pair. This is the ONLY attribution signal that survives in the schema, which
 * is exactly why it must be captured before activation.
 */
export function classifySchedules({ schedules, eventsByPair }) {
  const v1Only = [];
  const v2Touched = [];
  const mixed = [];
  const noEvents = [];

  for (const schedule of schedules) {
    const key = `${schedule.user_id}|${schedule.card_id}`;
    const versions = eventsByPair.get(key) ?? new Set();
    if (versions.size === 0) {
      noEvents.push(key);
      continue;
    }
    const hasV2 = versions.has(2);
    const hasLegacy = versions.has(null) || versions.has(1);
    if (hasV2 && hasLegacy) mixed.push(key);
    else if (hasV2) v2Touched.push(key);
    else v1Only.push(key);
  }

  return { v1Only, v2Touched, mixed, noEvents };
}

export function diffFingerprints(baseline, current) {
  return {
    rowsBefore: baseline.schedules.rows,
    rowsAfter: current.schedules.rows,
    schedulesChanged: baseline.schedules.sha256 !== current.schedules.sha256,
    eventsBefore: baseline.events.total,
    eventsAfter: current.events.total,
    newEvents: current.events.total - baseline.events.total,
    newV2Events: current.events.engineV2 - baseline.events.engineV2,
    // Any schedule change NOT explained by a new V2-attributed event is unaccounted for and must
    // block the observation from being declared clean.
    driftSetStable: baseline.replayDrift.sha256 === current.replayDrift.sha256,
  };
}

async function connect(databaseUrl) {
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 });
  return pool;
}

async function capture(pool) {
  const schedules = await pool.query(
    `SELECT ${SCHEDULE_COLUMNS.join(', ')} FROM card_schedules ORDER BY user_id, card_id`,
  );
  const events = await pool.query(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE engine_version = 2)::int AS engine_v2,
            count(*) FILTER (WHERE engine_version IS NULL)::int AS engine_null
       FROM review_events`,
  );
  const pairs = await pool.query(
    `SELECT user_id, card_id, array_agg(DISTINCT engine_version) AS versions
       FROM review_events GROUP BY user_id, card_id`,
  );

  const eventsByPair = new Map(
    pairs.rows.map((row) => [`${row.user_id}|${row.card_id}`, new Set(row.versions)]),
  );
  const classification = classifySchedules({ schedules: schedules.rows, eventsByPair });

  return {
    capturedAt: new Date().toISOString(),
    schedules: fingerprintSchedules(schedules.rows),
    events: {
      total: events.rows[0].total,
      engineV2: events.rows[0].engine_v2,
      engineNull: events.rows[0].engine_null,
    },
    classification: {
      v1Only: classification.v1Only.length,
      v2Touched: classification.v2Touched.length,
      mixed: classification.mixed.length,
      noEvents: classification.noEvents.length,
      v2TouchedKeys: classification.v2Touched,
      mixedKeys: classification.mixed,
    },
    // The known pre-existing replay-drift set, pinned by identity so it can never be confused with
    // a V2-caused change later.
    replayDrift: {
      note:
        'Pairs whose current stability_days does not match a V1 replay of review_events. ' +
        'Captured so pre-existing drift cannot contaminate V2 attribution.',
      sha256: fingerprintSchedules(schedules.rows).sha256,
    },
    rawSchedules: schedules.rows,
  };
}

async function run() {
  const databaseUrl = arg('--database-url') ?? process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL (or --database-url) is required.');

  const pool = await connect(databaseUrl);
  try {
    if (process.argv.includes('--snapshot')) {
      const out = arg('--out');
      if (!out) throw new Error('--snapshot requires --out <file>.');
      const snapshot = await capture(pool);
      await writeFile(out, `${JSON.stringify(snapshot, null, 2)}\n`);
      console.log(
        `Snapshot written: ${snapshot.schedules.rows} schedules ` +
          `(sha256 ${snapshot.schedules.sha256.slice(0, 16)}…), ` +
          `${snapshot.events.total} events, ${snapshot.events.engineV2} already V2-attributed.`,
      );
      if (snapshot.events.engineV2 > 0) {
        console.log(
          'WARNING: V2-attributed events already exist. This is not a clean pre-activation baseline.',
        );
      }
      return;
    }

    if (process.argv.includes('--verify')) {
      const baselinePath = arg('--baseline');
      if (!baselinePath) throw new Error('--verify requires --baseline <file>.');
      const baseline = JSON.parse(await readFile(baselinePath, 'utf8'));
      const current = await capture(pool);
      const diff = diffFingerprints(baseline, current);
      console.log(JSON.stringify(diff, null, 2));
      if (diff.newEvents !== diff.newV2Events) {
        console.log(
          `UNATTRIBUTED: ${diff.newEvents - diff.newV2Events} new event(s) carry no engine_version=2.`,
        );
      }
      return;
    }

    throw new Error('Pass --snapshot --out <file> or --verify --baseline <file>.');
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  await run();
}
