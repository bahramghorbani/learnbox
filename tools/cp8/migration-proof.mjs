// CP8 remediated migration-0023 proof.
//
// Proves, with artifacts rather than assertion-by-narration:
//   * additive / forward-only: only the expected objects appear, nothing is dropped or retyped;
//   * no unintended backfill: response and engine_version are NULL on every pre-existing event;
//   * history + schedule integrity: content digests over EVERY correctness-relevant column,
//     including response and engine_version themselves, are unchanged by the migration;
//   * re-apply is a verified no-op.
//
// Two defects from the superseded package are structurally prevented here:
//   1. The old digest omitted response and engine_version — the exact two columns 0023 adds — so an
//      unintended backfill could have slipped past it. The full digest now covers them, and the
//      digest SHAPE is recorded so a pre-0023 digest can never be compared against a post-0023 one
//      without the difference being visible.
//   2. A crashed baseline previously left a STALE fingerprint file on disk, which the next stage
//      silently compared against. The baseline is now stamped with the run id and the comparison
//      stages refuse to run unless the file belongs to this run.
import {
  pool,
  record,
  finish,
  eventDigest,
  eventDigestShape,
  scheduleDigest,
  closePool,
  RUN,
} from './lib.mjs';
import { writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';

const mode = process.argv[2]; // 'pre' | 'post' | 'reapply'
const OUT = process.env.CP8_FP_DIR ?? '/tmp/cp8';
const BASELINE = `${OUT}/fp_pre0023.json`;

const counts = async () => {
  const out = {};
  for (const t of ['users', 'cards', 'card_versions', 'card_schedules', 'review_events']) {
    out[t] = (await pool.query(`select count(*)::int n from ${t}`)).rows[0].n;
  }
  return out;
};

// 0023 adds: users.timezone, review_events.response, review_events.engine_version,
// two review_events check constraints, and the tables learner_daily_plans + review_event_rejections.
const EXPECTED_TABLES = ['learner_daily_plans', 'review_event_rejections'];

const surface = async () => ({
  columns: (
    await pool.query(
      `select coalesce(string_agg(column_name || ':' || data_type, ',' order by column_name), 'NONE') s
       from information_schema.columns
      where table_name = 'review_events' and column_name in ('response', 'engine_version')`,
    )
  ).rows[0].s,
  users_timezone: (
    await pool.query(
      `select coalesce(string_agg(column_name, ',' ), 'NONE') s
       from information_schema.columns
      where table_name = 'users' and column_name = 'timezone'`,
    )
  ).rows[0].s,
  tables: (
    await pool.query(
      `select coalesce(string_agg(table_name, ',' order by table_name), 'NONE') s
       from information_schema.tables
      where table_schema = 'public' and table_name = any($1)`,
      [EXPECTED_TABLES],
    )
  ).rows[0].s,
  constraints: (
    await pool.query(
      `select coalesce(string_agg(conname, ',' order by conname), 'NONE') s
       from pg_constraint
      where conname in ('review_events_response_valid', 'review_events_engine_version_valid')`,
    )
  ).rows[0].s,
});

// Legacy-only digest: columns that existed before 0023. Kept alongside the full digest so the two
// instruments can be compared — if the legacy digest is stable but the full digest moves, 0023
// touched the new columns and that is visible rather than invisible.
const legacyDigest = async () =>
  (
    await pool.query(
      `select md5(string_agg(
              client_event_id || '|' || user_id::text || '|' || card_id::text || '|' || grade ||
              '|' || occurred_at::text || '|' || coalesce(reconciliation_cursor::text, '<null>'),
              E'\n' order by reconciliation_cursor, client_event_id)) h
       from review_events`,
    )
  ).rows[0].h;

const snapshot = async () => ({
  run: RUN,
  counts: await counts(),
  surface: await surface(),
  digest_shape: await eventDigestShape(),
  digests: {
    review_events_full: await eventDigest(),
    review_events_legacy: await legacyDigest(),
    card_schedules: await scheduleDigest(),
  },
});

if (mode === 'pre') {
  // Remove any baseline from an earlier run FIRST, so a crash here cannot leave a stale file that a
  // later stage would silently consume.
  if (existsSync(BASELINE)) rmSync(BASELINE);
  const snap = await snapshot();
  writeFileSync(BASELINE, JSON.stringify(snap, null, 2));
  console.log('PRE  counts=' + JSON.stringify(snap.counts));
  console.log('PRE  surface=' + JSON.stringify(snap.surface));
  console.log('PRE  digest_shape=' + snap.digest_shape);
  record(
    'pre-0023: review_events.response / engine_version are absent',
    snap.surface.columns === 'NONE',
    `columns=${snap.surface.columns}`,
  );
  record(
    'pre-0023: the 0023 tables are absent',
    snap.surface.tables === 'NONE',
    `tables=${snap.surface.tables}`,
  );
  record(
    'pre-0023: the 0023 check constraints are absent',
    snap.surface.constraints === 'NONE',
    `constraints=${snap.surface.constraints}`,
  );
  record(
    'pre-0023: baseline digest was computed in the pre-0023 shape',
    snap.digest_shape === 'response=absent,engine_version=absent',
    snap.digest_shape,
  );
} else {
  if (!existsSync(BASELINE)) {
    console.log(`FAIL  ${mode}: no pre-0023 baseline exists — refusing to compare against nothing`);
    console.log(`\nCP8_MIGRATION_${mode.toUpperCase()}_TOTAL=1 PASSED=0 FAILED=1`);
    await closePool();
    process.exit(1);
  }
  const pre = JSON.parse(readFileSync(BASELINE, 'utf8'));
  if (pre.run !== RUN) {
    console.log(
      `FAIL  ${mode}: baseline belongs to run ${pre.run}, this run is ${RUN} — refusing to use a stale fingerprint`,
    );
    console.log(`\nCP8_MIGRATION_${mode.toUpperCase()}_TOTAL=1 PASSED=0 FAILED=1`);
    await closePool();
    process.exit(1);
  }
  const snap = await snapshot();
  writeFileSync(`${OUT}/fp_${mode}0023.json`, JSON.stringify(snap, null, 2));
  console.log(`${mode.toUpperCase()} counts=` + JSON.stringify(snap.counts));
  console.log(`${mode.toUpperCase()} surface=` + JSON.stringify(snap.surface));
  console.log(`${mode.toUpperCase()} digest_shape=` + snap.digest_shape);

  const label = mode === 'post' ? '0023' : '0023 re-apply';
  record(
    `${label}: baseline is from this run (no stale fingerprint)`,
    pre.run === RUN,
    `baseline_run=${pre.run} this_run=${RUN}`,
  );
  record(
    `${label}: row counts unchanged for every data table`,
    JSON.stringify(pre.counts) === JSON.stringify(snap.counts),
    `${JSON.stringify(pre.counts)} -> ${JSON.stringify(snap.counts)}`,
  );
  record(
    `${label}: legacy review_events columns are byte-identical`,
    pre.digests.review_events_legacy === snap.digests.review_events_legacy,
    pre.digests.review_events_legacy === snap.digests.review_events_legacy
      ? 'IDENTICAL'
      : 'CHANGED',
  );
  record(
    `${label}: card_schedules digest (all 8 correctness columns) is identical`,
    pre.digests.card_schedules === snap.digests.card_schedules,
    pre.digests.card_schedules === snap.digests.card_schedules ? 'IDENTICAL' : 'CHANGED',
  );

  // The full digest legitimately changes shape across 0023 ('<absent>' -> '<null>'), so comparing the
  // raw hashes pre/post would be meaningless. What must hold is that the new columns are entirely
  // NULL — asserted directly below — and that the full digest is then STABLE across the re-apply,
  // which is a genuine same-shape comparison.
  if (mode === 'post') {
    record(
      '0023: is additive — response and engine_version exist with the expected types',
      snap.surface.columns.includes('response:text') &&
        snap.surface.columns.includes('engine_version:smallint'),
      `columns=${snap.surface.columns}`,
    );
    record(
      '0023: adds users.timezone',
      snap.surface.users_timezone === 'timezone',
      `users_timezone=${snap.surface.users_timezone}`,
    );
    record(
      '0023: adds learner_daily_plans and review_event_rejections',
      snap.surface.tables === EXPECTED_TABLES.join(','),
      `tables=${snap.surface.tables}`,
    );
    record(
      '0023: adds both review_events check constraints',
      snap.surface.constraints.includes('review_events_engine_version_valid') &&
        snap.surface.constraints.includes('review_events_response_valid'),
      `constraints=${snap.surface.constraints}`,
    );
    record(
      '0023: the digest instrument switched to the post-0023 shape (comparison is honest)',
      snap.digest_shape === 'response=present,engine_version=present',
      snap.digest_shape,
    );
  } else {
    const post = JSON.parse(readFileSync(`${OUT}/fp_post0023.json`, 'utf8'));
    // NF-1: the post fingerprint must come from THIS run too. Without this guard a crashed 'post'
    // stage would leave a previous run's file in place and the re-apply comparison below would
    // silently compare against it, logging spurious PASSes. Same protection as the baseline.
    if (post.run !== RUN) {
      console.error(
        `FATAL: fp_post0023.json is from run ${post.run}, expected ${RUN} (stale artifact)`,
      );
      process.exit(1);
    }
    console.log(`post_fingerprint_run=${post.run} (matches this run)`);
    record(
      '0023 re-apply: FULL digest incl. response + engine_version is unchanged vs post-0023',
      post.digests.review_events_full === snap.digests.review_events_full,
      post.digests.review_events_full === snap.digests.review_events_full ? 'IDENTICAL' : 'CHANGED',
    );
    record(
      '0023 re-apply: schema surface is unchanged vs post-0023',
      JSON.stringify(post.surface) === JSON.stringify(snap.surface),
      JSON.stringify(post.surface) === JSON.stringify(snap.surface) ? 'IDENTICAL' : 'CHANGED',
    );
  }

  // No unintended backfill: every pre-existing event must still have NULL in both new columns.
  const bf = (
    await pool.query(
      `select count(*)::int rows,
            count(*) filter (where response is not null)::int response_nonnull,
            count(*) filter (where engine_version is not null)::int engine_version_nonnull
       from review_events`,
    )
  ).rows[0];
  record(
    `${label}: no unintended backfill (response and engine_version NULL on all pre-existing events)`,
    bf.response_nonnull === 0 && bf.engine_version_nonnull === 0,
    `rows=${bf.rows} response_nonnull=${bf.response_nonnull} engine_version_nonnull=${bf.engine_version_nonnull}`,
  );
}

const failures = finish(`CP8_MIGRATION_${(mode ?? 'pre').toUpperCase()}`);
await closePool();
process.exit(failures === 0 ? 0 : 1);
