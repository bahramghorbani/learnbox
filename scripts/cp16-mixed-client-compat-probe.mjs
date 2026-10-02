// CP16 compatibility probe: drive the REAL compiled parser, not a reimplementation.
import { parseMobileReviewBatchRequest } from '../apps/api/dist/reviews/mobile-review-batch.request.js';

const U = '00000000-0000-0000-0000-000000000001';
const t = '2026-10-03T10:00:00.000Z';

function run(label, payload, opts) {
  try {
    const r = parseMobileReviewBatchRequest(payload, U, opts);
    const i = r.items[0];
    console.log(
      `${label}\n   -> OK grade=${i.grade} response=${i.response === undefined ? 'UNDEFINED(legacy)' : i.response}`,
    );
  } catch (e) {
    console.log(`${label}\n   -> REJECT ${e.code ?? e.name}: ${e.message}`);
  }
}

const legacy = { clientEventId: 'e1', contentId: 'c1', grade: 'hard', occurredAt: t };
const binary = { clientEventId: 'e2', contentId: 'c1', response: 'known', occurredAt: t };
const nativeToday = { clientEventId: 'e3', cardId: 'c1', grade: 'hard', occurredAt: t };
const both = {
  clientEventId: 'e4',
  contentId: 'c1',
  grade: 'hard',
  response: 'known',
  occurredAt: t,
};

console.log('=== FLAG ON (binaryResponses: true) — target mixed-client state ===');
run(
  '1. legacy 4-grade (old installed client / queued event)',
  { items: [legacy] },
  { binaryResponses: true },
);
run(
  '2. binary response (new native, = Web semantics)',
  { items: [binary] },
  { binaryResponses: true },
);
run('3. native TODAY (cardId)', { items: [nativeToday] }, { binaryResponses: true });
run('4. both grade AND response (ambiguous)', { items: [both] }, { binaryResponses: true });

console.log('\n=== FLAG OFF — rollback / pre-activation ===');
run('5. legacy 4-grade', { items: [legacy] }, {});
run('6. binary response while flag off', { items: [binary] }, {});

console.log('\n=== idempotency key survives both shapes ===');
const mixed = parseMobileReviewBatchRequest({ items: [legacy, binary] }, U, {
  binaryResponses: true,
});
console.log(
  '   batch of legacy+binary accepted, clientEventIds =',
  mixed.items.map((i) => i.clientEventId).join(','),
);
console.log(
  '   distinguishable?',
  mixed.items
    .map((i) => (i.response === undefined ? 'legacy' : 'explicit:' + i.response))
    .join(' | '),
);
