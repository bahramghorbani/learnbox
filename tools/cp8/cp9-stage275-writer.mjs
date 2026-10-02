#!/usr/bin/env node
/**
 * LB-B35 CP9 Stage 2.75 writer. Submits real review events continuously through the SAME store the
 * application uses, and appends every CLIENT-ACKNOWLEDGED event id to ACK_LOG the instant the write
 * resolves. On SIGTERM it stops accepting new work, lets the in-flight write finish, and exits 0 --
 * the behaviour a graceful server must have. Staging only (port 55443 enforced by the caller).
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
// Repo root resolved from this script's location (tools/cp8/ -> root) for reproducibility
// on any checkout; resolution target is identical to the absolute path CP9 used.
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
import { appendFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { Pool } = require(path.join(REPO_ROOT, 'node_modules/.pnpm/pg@8.22.0/node_modules/pg'));

const DSN = process.env.STAGING_DATABASE_URL;
const ACK_LOG = process.env.ACK_LOG;
if (!DSN?.includes('55443') || !ACK_LOG) process.exit(2);

const { PostgresReviewEventStore } = await import(
  path.join(REPO_ROOT, 'apps/api/dist/reviews/postgres-review-event.store.js')
);

const pool = new Pool({ connectionString: DSN, max: 4 });
const store = new PostgresReviewEventStore(pool);

// Use a real seeded learner/card so the FK constraints are genuinely exercised.
const seed = await pool.query(
  `SELECT cs.user_id, cs.card_id, cs.stability_days, cs.difficulty, cs.lapses, cs.due_at, cs.state
     FROM card_schedules cs LIMIT 1`,
);
if (seed.rowCount === 0) {
  console.error('no seeded card_schedules row; cannot run the proof');
  process.exit(2);
}
const row = seed.rows[0];
const schedule = {
  state: row.state,
  stabilityDays: Number(row.stability_days),
  difficulty: Number(row.difficulty),
  lapses: Number(row.lapses),
  dueAt: new Date(row.due_at),
};

let draining = false;
let inFlight = 0;
let submitted = 0;
let acknowledged = 0;

const onSignal = (signal) => {
  // Graceful: stop taking new work, finish what is already in flight, then exit cleanly.
  if (draining) return;
  draining = true;
  console.error(`[writer] ${signal} received; draining ${inFlight} in-flight write(s)`);
};
process.on('SIGTERM', () => onSignal('SIGTERM'));
process.on('SIGINT', () => onSignal('SIGINT'));

const writeOne = async () => {
  const clientEventId = `cp9-275-${process.pid}-${submitted}`;
  submitted += 1;
  inFlight += 1;
  try {
    const result = await store.writeAtomically(
      {
        userId: row.user_id,
        cardId: row.card_id,
        grade: 'remembered',
        occurredAt: new Date(),
        clientEventId,
      },
      schedule,
    );
    // The client treats this, and only this, as acknowledged.
    appendFileSync(ACK_LOG, JSON.stringify({ clientEventId, eventId: result.event.id }) + '\n');
    acknowledged += 1;
  } catch {
    // Unacknowledged: a real client leaves the answer queued and retries later. Nothing is logged,
    // so the verifier must find NO row for it (or exactly one, which is also acceptable).
  } finally {
    inFlight -= 1;
  }
};

while (!draining) {
  await Promise.all([writeOne(), writeOne(), writeOne()]);
}
// Drain: in-flight writes above are already awaited; nothing new is started.
await pool.end();
console.error(`[writer] exit submitted=${submitted} acknowledged=${acknowledged}`);
process.exit(0);
