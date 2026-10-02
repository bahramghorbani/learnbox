// CP8 synthetic fixtures. No Production data is copied: learners, cards and history are
// created here so staging can be reasoned about exactly.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const repo = join(dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(join(repo, 'apps/website/package.json'));
const pg = require('pg');
const pool = new pg.Pool({ connectionString: process.env.STAGING_DATABASE_URL });

const DAY = 86400000;
const BASE = new Date('2026-09-01T08:00:00.000Z');

// Learners: L1 exercises Box-1 forward activation, L2 a mid-box card, L3 a Box-5 card, L4 legacy history.
const learners = [
  ['11111111-1111-4111-8111-111111111111', '+989120000001'],
  ['22222222-2222-4222-8222-222222222222', '+989120000002'],
  ['33333333-3333-4333-8333-333333333333', '+989120000003'],
  ['44444444-4444-4444-8444-444444444444', '+989120000004'],
];
// stability_days chosen to land in a known Box: Box1 ~1, Box2 ~1.8, Box5 large.
const cards = [
  ['aaaaaaaa-0000-4000-8000-000000000001', 'Haus', 1.0],
  ['aaaaaaaa-0000-4000-8000-000000000002', 'Buch', 1.8],
  ['aaaaaaaa-0000-4000-8000-000000000003', 'Tisch', 34.012],
  ['aaaaaaaa-0000-4000-8000-000000000004', 'Stuhl', 0.0416666667],
  ['aaaaaaaa-0000-4000-8000-000000000005', 'Lampe', 0.0416666667],
];

for (const [id, phone] of learners) {
  await pool.query(
    'insert into users (id, phone_e164, created_at) values ($1,$2,$3) on conflict do nothing',
    [id, phone, BASE],
  );
}
for (const [id, lemma] of cards) {
  await pool.query(
    `insert into cards (id, lemma, content_version, content_id, created_at)
     values ($1,$2,$3,$4,$5) on conflict do nothing`,
    [id, lemma, 1, 'cp8-' + lemma.toLowerCase(), BASE],
  );
}
// Cards are only reviewable when an approved/published card_version exists (resolveCardId +
// ensureApprovedSchedule both require it), so the fixture must provide one.
for (const [id, lemma] of cards) {
  await pool.query(
    `insert into card_versions (card_id, version, status, content_json, source_provider, published_at)
     values ($1, 1, 'published'::content_status, $2::jsonb, 'editorial', $3)
     on conflict do nothing`,
    [id, JSON.stringify({ lemma }), BASE],
  );
}

// Pre-existing schedules + one legacy review event, all written BEFORE 0023 exists.
const seedRows = [
  [learners[0][0], cards[0][0], 'review', 1.0, 0],
  [learners[1][0], cards[1][0], 'review', 1.8, 0],
  [learners[2][0], cards[2][0], 'review', 34.012, 1],
  [learners[3][0], cards[3][0], 'new', 0.0416666667, 0],
  [learners[0][0], cards[4][0], 'review', 0.0416666667, 0],
];
for (const [u, c, state, stability, lapses] of seedRows) {
  await pool.query(
    `insert into card_schedules (user_id, card_id, state, stability_days, difficulty, lapses, due_at, last_reviewed_at, updated_at)
     values ($1,$2,$3::learning_state,$4,5,$5,$6,$7,$7) on conflict (user_id, card_id) do nothing`,
    [
      u,
      c,
      state,
      stability,
      lapses,
      new Date(BASE.getTime() - DAY),
      new Date(BASE.getTime() - DAY),
    ],
  );
}
await pool.query(
  `insert into review_events (id, user_id, card_id, grade, occurred_at, client_event_id, applied_at)
   values ($1,$2,$3,$4,$5,$6,$5) on conflict do nothing`,
  [
    'eeeeeeee-0000-4000-8000-000000000001',
    learners[3][0],
    cards[3][0],
    'remembered',
    new Date(BASE.getTime() - DAY),
    'cp8-legacy-1',
  ],
);
console.log(
  'seeded learners=' +
    learners.length +
    ' cards=' +
    cards.length +
    ' schedules=' +
    seedRows.length +
    ' legacy_events=1',
);
await pool.end();
