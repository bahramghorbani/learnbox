# LB-B35 CP16 — Native Binary Review Migration (DESIGN, not implemented)

**Status:** DESIGN FOR OWNER REVIEW. No implementation. No Production change. Scheduler V2 stays OFF.
**Owner decision it implements:** Decision A (2026-10-03) — native adopts the binary known/unknown
review model; backward compatibility is mandatory; legacy four-grade events must never be
reinterpreted as explicit binary answers.

---

## 0. The headline finding: the wire protocol already supports this

The compatibility mechanism does **not** need to be invented. `LEARNBOX_BINARY_REVIEW` (CP5) already
added an optional binary shape to the mobile batch endpoint, and migration 0023 already added the
column that distinguishes an explicit binary answer from a projected legacy one.

Verified by running the **real compiled parser** (`apps/api/dist/reviews/mobile-review-batch.request.js`),
not by reading code:

| #   | Payload                                                     | Flag | Result                                                    |
| --- | ----------------------------------------------------------- | ---- | --------------------------------------------------------- |
| 1   | `{clientEventId, contentId, grade:'hard', occurredAt}`      | ON   | **accepted**, `grade=hard`, `response=undefined`          |
| 2   | `{clientEventId, contentId, response:'known', occurredAt}`  | ON   | **accepted**, `grade=remembered`, `response=known`        |
| 3   | `{clientEventId, cardId, grade, occurredAt}` (native today) | ON   | **rejected** `validation`                                 |
| 4   | `{… grade AND response …}`                                  | ON   | **rejected** `validation` (ambiguity refused)             |
| 5   | legacy four-grade                                           | OFF  | **accepted**                                              |
| 6   | binary `response`                                           | OFF  | **rejected** `validation`                                 |
| 7   | batch of legacy + binary together                           | ON   | **accepted**, distinguishable: `legacy \| explicit:known` |

Row 7 is the invariant the owner asked for, demonstrated end-to-end: one batch carrying both an old
client's four-grade event and a new client's binary event is accepted, and the two remain
**distinguishable after parsing**.

### Why no new version discriminator is needed

`response` **is** the discriminator, and it is self-describing per event:

- `response` present → the learner explicitly answered known/unknown.
- `response` absent → legacy four-grade evidence; `review_events.response` stays `NULL`
  (`0023_learning_persistence.sql:35,44-45`, `CHECK (response IS NULL OR response IN ('known','unknown'))`).

A separate `schemaVersion` field would add a second, redundant source of truth about the same fact.
**Smallest robust design = use the discriminator that already exists and is already persisted.**

Note `shadowGradeFor` (`definitions.ts:45-52`) writes a _compatibility shadow_ grade
(`known→remembered`, `unknown→forgot`) so a code rollback never sees an invalid grade — but the
explicit answer is preserved separately in `response`. A shadow grade is therefore **not** mistaken
for a real four-grade answer: the `response` column is what separates them.

### The lossy direction, stated precisely

`HISTORICAL_GRADE_PROJECTION` (`definitions.ts:31-41`) maps `hard`, `remembered`, `mastered` → `known`
and `forgot` → `unknown`: **3:1 and irreversible**. This is legitimate for _reading_ history, and must
**never** be written back as though the learner had pressed a binary button. The rule:

> Project legacy → binary **at read time only**. Never persist a projection into `review_events.response`.

---

## 1–8. The owner's eight compatibility cases

**1. Newly-created binary native reviews.**
Native sends `{clientEventId, contentId, response, occurredAt}` — byte-identical in meaning to Web.
Requires the flag ON; server stores `response` plus the shadow grade. Row 2 above.

**2. Already-queued legacy four-grade reviews (the upgrade boundary).**
These must drain as legacy: the parser accepts them unchanged (row 1) and leaves `response` NULL.
**This is the dangerous case** — not because of the protocol, but because of B-3 (below).

**3. Old installed native clients still sending four-grade payloads.**
Permanently supported: row 1 is accepted with the flag ON. No forced upgrade. Note these clients send
`cardId` and are therefore _already_ broken against this endpoint (row 3, defect B-2) — but native sync
is wired to `DisabledReviewSyncTransport` in production, so no installed client is actually sending.

**4. Alternating Web binary / old Native / new Native on the same card.**
All three land in one `review_events` stream, ordered by `occurredAt`, each row self-describing via
`response`. Scheduler V2 reads them through `toBinaryResponse`, which accepts both vocabularies
(`definitions.ts:69-71`). Semantically equivalent for new clients; legacy rows stay marked legacy.

**5. Idempotency / replay across the upgrade boundary.**
`clientEventId` is the key, unchanged by the shape, with `UNIQUE (user_id, client_event_id)` +
`ON CONFLICT DO NOTHING`. **Design rule: the upgrade must preserve each queued event's existing
`clientEventId`.** Re-minting ids during migration would double-count every queued review. A replayed
legacy event after upgrade is deduped, not re-applied.

**6. Reconciliation.**
`reconciliationCursor` is a decimal string, shape-independent; no change required.

**7. Native app rollback/downgrade.**
A downgraded client reads the queue written by the newer build. Today that is **unsafe** — see B-3.
After the B-3 fix, an unreadable event is dropped individually and the rest of the queue survives.
Server-side, a rolled-back client simply resumes sending four-grade payloads, which stay valid.

**8. Server compatibility during mixed-client rollout.**
The flag must be ON _before_ any binary-capable native build ships, otherwise row 6 applies and new
clients get hard `validation` rejections. `LEARNBOX_BINARY_REVIEW` is already ON in Production.
**Ordering constraint: server flag first, client release second.** Never the reverse.

---

## The real blocker is client-side, and it is a data-loss bug

The protocol is ready. The native client is not. Three defects, all verified in source:

**B-3 (HIGH, data loss, pre-dates V2).** `review_queue.dart:111-112` returns `_discardCorruptQueue()`
when _any single_ event fails to parse, and `:122-125` writes an empty list — **the entire offline
queue is destroyed**. `:100-103` also discards the whole queue when `schemaVersion != 1`. Combined with
`pending_review_event.dart:25` (`value.length != 4`, an exact key-count check), **adding the `response`
field to the queue format silently destroys every pending offline review on the first launch after
upgrade.** This bug exists today, independently of Scheduler V2 and of this migration.

**B-2 (HIGH, blocks any native sync).** Native serializes `cardId`
(`pending_review_event.dart:18`); the server requires `contentId`. Proven: row 3 → `validation` → the
Dart transport maps 400 to `RetryableFailure` → retries forever. Dormant only because production wires
`DisabledReviewSyncTransport`.

**B-4 (resolved by design, not code).** No per-event version field is needed — `response`
presence/absence is the discriminator (see §0).

### Required order of work in CP16

1. **B-3 first** (fault-tolerant queue decode: drop the bad event, keep the rest; tolerate unknown
   fields and a bumped `schemaVersion`). This must ship _before_ the queue format changes, otherwise
   the upgrade that introduces binary events is itself the event that destroys the queue.
2. **B-2** (`cardId` → `contentId`).
3. Binary domain model + UI (`ReviewGrade` → binary response; two buttons matching Web).
4. Queue format carries `response`; legacy queued events drain as legacy.

Steps 1–2 are independently valuable and carry no protocol risk.

---

## Invariant to be proven in CP16 (not yet proven)

> New capable Web and Native clients produce equivalent known/unknown evidence, while legacy clients
> and legacy queued events remain valid and are never falsely reinterpreted as explicit binary answers.

Mechanical proof obligations:

- a test asserting no write path ever sets `review_events.response` from a _projected_ legacy grade;
- a Dart upgrade test: queue written by the old build, read by the new build, **zero events lost**;
- a Dart downgrade test: queue written by the new build, read by the old build, no total wipe;
- a parser test pinning all seven rows of the table in §0;
- an equivalence test: Web binary payload and Native binary payload produce the same stored
  `(response, grade)` pair.

---

## Out of scope / stop conditions

- **Scheduler V2 is not activated by CP16.**
- No Production deploy, migration, data or flag change.
- Stop for owner review before implementation if any protocol or UX decision is still open.
