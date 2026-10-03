// CP16 compatibility probe: drive the REAL compiled parser, not a reimplementation.
//
// Stage 4 of the CP16 implementation order. Every case below is a wire payload
// that a real client can produce, fed to the production parser. The native
// payloads are the exact shape `PendingReviewEvent.toWireJson()` emits (see
// apps/mobile/test/pending_review_event_binary_test.dart, which pins it).
import { parseMobileReviewBatchRequest } from '../apps/api/dist/reviews/mobile-review-batch.request.js';

const U = '00000000-0000-0000-0000-000000000001';
const t = '2026-10-03T10:00:00.000Z';

let failures = 0;

function describe(item) {
  if (item.response === undefined) return `legacy(grade=${item.grade})`;
  return `explicit:${item.response}(shadow=${item.grade})`;
}

/** Assert a payload parses, and optionally assert the parsed item. */
function expectOk(label, payload, opts, check) {
  try {
    const parsed = parseMobileReviewBatchRequest(payload, U, opts);
    const shapes = parsed.items.map(describe).join(' | ');
    const problem = check?.(parsed);
    if (problem) {
      failures += 1;
      console.log(`FAIL ${label}\n   -> ${shapes}\n   -> ${problem}`);
      return parsed;
    }
    console.log(`PASS ${label}\n   -> ${shapes}`);
    return parsed;
  } catch (error) {
    failures += 1;
    console.log(
      `FAIL ${label}\n   -> unexpected REJECT ${error.code ?? error.name}: ${error.message}`,
    );
    return null;
  }
}

/** Assert a payload is refused. */
function expectReject(label, payload, opts) {
  try {
    parseMobileReviewBatchRequest(payload, U, opts);
    failures += 1;
    console.log(`FAIL ${label}\n   -> accepted, but MUST be rejected`);
  } catch (error) {
    console.log(`PASS ${label}\n   -> REJECT ${error.code ?? error.name}`);
  }
}

const ON = { binaryResponses: true };
const OFF = {};

// Wire shapes. `contentId` is the server's field name; native emits it since B-2.
const legacyWire = (id, card = 'c1', grade = 'hard') => ({
  clientEventId: id,
  contentId: card,
  grade,
  occurredAt: t,
});
const binaryWire = (id, card = 'c1', response = 'known') => ({
  clientEventId: id,
  contentId: card,
  response,
  occurredAt: t,
});

console.log('=== Stage 4.1 — old Native -> new server ===');
// An old installed build still sends four grades. It must keep working, with no
// response invented for it.
expectOk('old Native four-grade accepted as legacy', { items: [legacyWire('e1')] }, ON, (r) =>
  r.items[0].response === undefined
    ? null
    : 'legacy event acquired a response (history would be falsified)',
);

console.log('\n=== Stage 4.2 — new Native -> new server ===');
expectOk('new Native binary known', { items: [binaryWire('e2')] }, ON, (r) =>
  r.items[0].response === 'known' && r.items[0].grade === 'remembered'
    ? null
    : `wrong mapping: ${describe(r.items[0])}`,
);
expectOk('new Native binary unknown', { items: [binaryWire('e3', 'c1', 'unknown')] }, ON, (r) =>
  r.items[0].response === 'unknown' && r.items[0].grade === 'forgot'
    ? null
    : `wrong mapping: ${describe(r.items[0])}`,
);

console.log('\n=== Stage 4.3 — legacy queued event synced BY a new Native build ===');
// The upgraded app flushes a review queued before the upgrade. It is still a
// four-grade event and must stay one.
expectOk(
  'pre-upgrade queued event stays legacy',
  { items: [legacyWire('e4', 'c1', 'forgot')] },
  ON,
  (r) =>
    r.items[0].response === undefined && r.items[0].grade === 'forgot'
      ? null
      : 'queued legacy event was reinterpreted as an explicit answer',
);

console.log('\n=== Stage 4.4 — mixed legacy + binary in ONE batch ===');
expectOk(
  'mixed batch accepted and each item self-describing',
  { items: [legacyWire('e5'), binaryWire('e6')] },
  ON,
  (r) => {
    if (r.items.length !== 2) return 'batch lost an item';
    if (r.items[0].response !== undefined) return 'legacy item gained a response';
    if (r.items[1].response !== 'known') return 'binary item lost its response';
    return null;
  },
);

console.log('\n=== Stage 4.5 — Web binary + Native binary alternating, same learner/card ===');
// Web and new Native produce the SAME wire shape, so the server cannot tell them
// apart — which is exactly the invariant: equivalent semantic evidence.
expectOk(
  'alternating binary reviews are semantically identical',
  { items: [binaryWire('web-1'), binaryWire('nat-1', 'c1', 'unknown')] },
  ON,
  (r) => {
    const semantic = r.items.map((i) => `${i.response}/${i.grade}`);
    return semantic[0] === 'known/remembered' && semantic[1] === 'unknown/forgot'
      ? null
      : `unexpected: ${semantic.join(',')}`;
  },
);

console.log('\n=== Stage 4.6 — old Native four-grade + Web binary alternating ===');
expectOk(
  'legacy and binary coexist on one card without cross-contamination',
  { items: [legacyWire('old-1'), binaryWire('web-2')] },
  ON,
  (r) =>
    r.items[0].response === undefined && r.items[1].response === 'known'
      ? null
      : 'legacy/binary distinction lost when both touch the same card',
);

console.log('\n=== Stage 4.7 — duplicate / replay across the upgrade boundary ===');
// The SAME clientEventId re-sent after upgrade, now in binary shape. The parser
// accepts it; the UNIQUE (user_id, client_event_id) + ON CONFLICT DO NOTHING
// backstop is what prevents double-counting. Proven here: the key is preserved
// unchanged through parsing, which is the precondition for that backstop.
const replay = expectOk(
  'replayed clientEventId is preserved byte-for-byte',
  { items: [binaryWire('dup-1')] },
  ON,
  (r) => (r.items[0].clientEventId === 'dup-1' ? null : 'clientEventId was rewritten'),
);
const replayAgain = expectOk(
  'same id re-sent in the other shape still carries the same key',
  { items: [legacyWire('dup-1')] },
  ON,
  (r) => (r.items[0].clientEventId === 'dup-1' ? null : 'clientEventId was rewritten'),
);
if (replay && replayAgain) {
  const same = replay.items[0].clientEventId === replayAgain.items[0].clientEventId;
  console.log(`   idempotency key stable across shapes? ${same ? 'YES' : 'NO'}`);
  if (!same) failures += 1;
}
expectReject(
  'a duplicate id WITHIN one batch',
  { items: [binaryWire('dup-2'), binaryWire('dup-2')] },
  ON,
);

console.log('\n=== Stage 4.8 — offline review before upgrade, synced after ===');
// Queue holds a legacy event; app upgrades; new build adds a binary event; both
// flush together. Already covered by 4.4/4.3 at the wire level, asserted here as
// the realistic combined batch.
expectOk(
  'pre-upgrade legacy + post-upgrade binary flush together',
  { items: [legacyWire('off-1', 'c1', 'mastered'), binaryWire('off-2', 'c2', 'unknown')] },
  ON,
  (r) =>
    r.items[0].response === undefined && r.items[1].response === 'unknown'
      ? null
      : 'offline upgrade flush corrupted event semantics',
);

console.log('\n=== Ambiguity and flag discipline ===');
expectReject(
  'grade AND response on the same item',
  {
    items: [
      { clientEventId: 'amb-1', contentId: 'c1', grade: 'hard', response: 'known', occurredAt: t },
    ],
  },
  ON,
);
expectReject(
  'native pre-B-2 cardId field',
  {
    items: [{ clientEventId: 'b2-1', cardId: 'c1', grade: 'hard', occurredAt: t }],
  },
  ON,
);
expectOk(
  'legacy still accepted with the flag OFF',
  { items: [legacyWire('off-flag-1')] },
  OFF,
  (r) => (r.items[0].response === undefined ? null : 'response appeared with the flag off'),
);
expectReject(
  'binary refused while the flag is OFF (server-first ordering)',
  { items: [binaryWire('off-flag-2')] },
  OFF,
);

console.log(`\n${failures === 0 ? 'ALL CP16 WIRE CASES PASS' : `${failures} CASE(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
