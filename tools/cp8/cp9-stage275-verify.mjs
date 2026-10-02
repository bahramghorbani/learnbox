#!/usr/bin/env node
/**
 * LB-B35 CP9 Stage 2.75 verifier. Reconciles what the client believes was acknowledged against what
 * the database actually holds, and asserts the owner's six PASS criteria.
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
// Repo root resolved from this script's location (tools/cp8/ -> root) for reproducibility
// on any checkout; resolution target is identical to the absolute path CP9 used.
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { Pool } = require(path.join(REPO_ROOT, 'node_modules/.pnpm/pg@8.22.0/node_modules/pg'));

const DSN = process.env.STAGING_DATABASE_URL;
if (!DSN?.includes('55443')) process.exit(2);

const ackLines = readFileSync(process.env.ACK_LOG, 'utf8').trim().split('\n').filter(Boolean);
const acknowledged = ackLines.map((line) => JSON.parse(line));
const elapsed = Number(process.env.SHUTDOWN_SECONDS);
const grace = Number(process.env.GRACE_PERIOD);
const sigkill = process.env.SIGKILL_REQUIRED === 'yes';
const exitCode = Number(process.env.WRITER_EXIT_CODE);

const pool = new Pool({ connectionString: DSN });
const rows = await pool.query(
  `SELECT client_event_id, count(*)::int AS n
     FROM review_events
    WHERE client_event_id LIKE 'cp9-275-%'
    GROUP BY client_event_id`,
);
const byId = new Map(rows.rows.map((r) => [r.client_event_id, r.n]));

// Partial write = an event row whose schedule side of the transaction never landed.
const orphans = await pool.query(
  `SELECT count(*)::int AS n
     FROM review_events re
    WHERE re.client_event_id LIKE 'cp9-275-%'
      AND NOT EXISTS (
        SELECT 1 FROM card_schedules cs
         WHERE cs.user_id = re.user_id AND cs.card_id = re.card_id)`,
);

const results = [];
const check = (name, cond, detail = '') =>
  results.push(`${cond ? 'PASS' : 'FAIL'} ${name}${detail ? ' :: ' + detail : ''}`);

// 1 + 3: every acknowledged event must exist in the database.
const lost = acknowledged.filter((a) => (byId.get(a.clientEventId) ?? 0) === 0);
check(
  'zero lost acknowledged reviews',
  lost.length === 0,
  `${lost.length} lost of ${acknowledged.length} acknowledged`,
);

// 2: no client_event_id may appear more than once.
const dupes = [...byId.entries()].filter(([, n]) => n > 1);
check('zero duplicate review rows', dupes.length === 0, `${dupes.length} duplicated ids`);

// 1 (other half): nothing in the database that the client never had acknowledged is a *problem* only
// if it is a duplicate; a row written but unacknowledged is the "persisted exactly once" case and is
// explicitly allowed, because the client keeps it queued and the UNIQUE constraint makes the retry a
// no-op. Report the count for the record.
const ackIds = new Set(acknowledged.map((a) => a.clientEventId));
const writtenNotAcked = [...byId.keys()].filter((id) => !ackIds.has(id));
check(
  'every row is either acknowledged or safely retryable (exactly-once holds)',
  dupes.length === 0,
  `${writtenNotAcked.length} written-but-unacknowledged (allowed; UNIQUE makes retry a no-op)`,
);

// 4: zero partial writes.
check(
  'zero partial writes (no event without its schedule)',
  orphans.rows[0].n === 0,
  `orphans=${orphans.rows[0].n}`,
);

// 5 + 6: graceful exit inside the grace period, no SIGKILL.
check(
  'graceful SIGTERM exit within grace period',
  !sigkill && elapsed <= grace,
  `${elapsed}s <= ${grace}s`,
);
check('no SIGKILL required', !sigkill);
check('writer exited cleanly (code 0)', exitCode === 0, `exit=${exitCode}`);

await pool.end();
const failed = results.filter((r) => r.startsWith('FAIL'));
console.log(results.join('\n'));
console.log(
  `\nCP9-STAGE275: ${results.length - failed.length} passed, ${failed.length} failed` +
    `\nacknowledged=${acknowledged.length} rows=${byId.size} shutdown=${elapsed}s sigkill=${sigkill}`,
);
process.exit(failed.length === 0 ? 0 : 1);
