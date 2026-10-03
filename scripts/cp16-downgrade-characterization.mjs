// Downgrade characterization for CP16, measured — not assumed.
//
// Feeds the EXACT bytes the real CP16 queue writes (captured by
// apps/mobile/test/cp16_downgrade_fixture_test.dart) to the pre-CP16 parser
// logic transcribed verbatim from the committed client, and reports what the
// old build would do to each.
//
// Keeps the owner-required downgrade categories explicitly DISTINCT.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE = path.join(REPO_ROOT, 'apps/mobile/test/fixtures/cp16_downgrade_queue_states.json');

// Pre-CP16 parsers, transcribed VERBATIM from git HEAD (bed91ed):
//   pending_review_event.dart: value.length != 4            -> null
//   review_queue.dart:         decoded.length != 2          -> discard whole queue
//                              schemaVersion != 1           -> discard whole queue
//                              any null event               -> discard whole queue
function oldParse(event) {
  if (Object.keys(event).length !== 4) return null;
  for (const k of ['clientEventId', 'cardId', 'grade', 'occurredAt']) {
    if (!(k in event)) return null;
  }
  // The old build only knew the four legacy grades.
  if (!['forgot', 'hard', 'remembered', 'mastered'].includes(event.grade)) return null;
  return event;
}

function oldQueueLoad(serialized) {
  let decoded;
  try {
    decoded = JSON.parse(serialized);
  } catch {
    return { kept: 0, total: 0, purged: true, reason: 'unparseable bytes' };
  }
  if (typeof decoded !== 'object' || decoded === null || Array.isArray(decoded)) {
    return { kept: 0, total: 0, purged: true, reason: 'envelope is not a map' };
  }
  // The old build demanded an envelope of EXACTLY two keys.
  if (Object.keys(decoded).length !== 2) {
    return {
      kept: 0,
      total: 0,
      purged: true,
      reason: `envelope has ${Object.keys(decoded).length} keys, old build requires exactly 2`,
    };
  }
  if (decoded.schemaVersion !== 1) {
    return {
      kept: 0,
      total: 0,
      purged: true,
      reason: `schemaVersion=${decoded.schemaVersion} != 1`,
    };
  }
  const events = decoded.events ?? [];
  const out = [];
  for (const raw of events) {
    if (oldParse(raw) === null) {
      return {
        kept: 0,
        total: events.length,
        purged: true,
        reason: 'one unreadable event discards the whole queue',
      };
    }
    out.push(raw);
  }
  return { kept: out.length, total: events.length, purged: false };
}

const CATEGORIES = [
  {
    key: 'A_capable_build_no_binary_review_taken',
    label: 'A. Code rollback BEFORE any binary review is created',
    expectPurge: false,
    verdict: 'QUEUE-SAFE — capable build alone does not bump the envelope',
  },
  {
    key: 'B_empty_or_fully_synced_queue',
    label: 'B. Downgrade with an empty / fully synced queue',
    expectPurge: false,
    verdict: 'QUEUE-SAFE — nothing unsynced is at risk',
  },
  {
    key: 'C_pending_legacy_only_queue',
    label: 'C. Downgrade with a PENDING LEGACY-ONLY queue',
    expectPurge: false,
    verdict: 'QUEUE-SAFE — pending legacy reviews survive',
  },
  {
    key: 'D_binary_queue_state_exists',
    label: 'D. Downgrade AFTER binary queue state exists',
    expectPurge: true,
    verdict: 'NOT QUEUE-SAFE — unsynced reviews are destroyed by the old build',
  },
  {
    key: 'E_legacy_pending_with_quarantine',
    label: 'E. Pending legacy-only, but a quarantine entry exists',
    expectPurge: true,
    verdict: 'NOT QUEUE-SAFE — the quarantine key alone trips the old envelope check',
  },
];

const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8'));
let failures = 0;

console.log('=== CP16 downgrade characterization (old parser, real queue bytes) ===\n');
for (const c of CATEGORIES) {
  const bytes = fixture[c.key];
  if (bytes === undefined) {
    console.log(`MISSING  ${c.label} — regenerate the fixture\n`);
    failures += 1;
    continue;
  }
  const r = oldQueueLoad(bytes);
  const ok = r.purged === c.expectPurge;
  if (!ok) failures += 1;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${c.label}`);
  console.log(
    `       new build wrote: schemaVersion=${JSON.parse(bytes).schemaVersion}, keys=${Object.keys(JSON.parse(bytes)).length}`,
  );
  console.log(
    `       old build: ${r.purged ? `PURGED (${r.reason})` : `kept ${r.kept}/${r.total}`}`,
  );
  console.log(`       verdict: ${c.verdict}\n`);
}

console.log(
  failures === 0
    ? 'CHARACTERIZATION STABLE — A/B/C queue-safe; D/E NOT queue-safe'
    : `${failures} CATEGORY MISMATCH(ES) — the characterization is stale`,
);
process.exit(failures === 0 ? 0 : 1);
