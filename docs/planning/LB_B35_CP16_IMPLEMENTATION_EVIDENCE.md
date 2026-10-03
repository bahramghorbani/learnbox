# LB-B35 CP16 — Native Binary Review Migration (IMPLEMENTATION EVIDENCE)

**Status:** IMPLEMENTED, parked at the implementation/review gate. NOT committed, NOT pushed, no PR, NOT deployed.
**Branch:** `feat/lb-b35-cp15-contract-parity` (working tree on top of `bed91ed`)
**Owner authorization:** CP16 design approved 2026-10-03; implementation authorized in the mandated staged order; stop before merge/deployment.
**Scheduler V2:** `LEARNBOX_SCHEDULER_V2` remains **ABSENT** in Production throughout.
**Production:** **UNCHANGED** — re-verified after implementation (§9).

---

## 1. Exact files changed

### Modified (7)

| File                                                            | Change                                                                                                                                                                                                             |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/mobile/lib/features/review/pending_review_event.dart`     | B-3 forward compatibility (key-count check removed, unknown keys tolerated); optional `response` field; `PendingReviewEvent.binary` named constructor; new `toWireJson()` separating wire shape from storage shape |
| `apps/mobile/lib/features/review/review_queue.dart`             | B-3 salvage-and-quarantine load path (no wholesale deletion); `recordBinary()`; content-driven envelope version; quarantine carry-forward + cap                                                                    |
| `apps/mobile/lib/features/review/review_screen.dart`            | Binary interaction gated by `showsBinaryReview`; `_grade`/`_respond` share one `_save` path; `_BinaryResponseButtons` widget                                                                                       |
| `apps/mobile/lib/features/sync/http_review_sync_transport.dart` | Uploads `toWireJson()` instead of `toJson()` (**this is the B-2 fix**)                                                                                                                                             |
| `apps/mobile/test/review_queue_test.dart`                       | Destructive-behaviour test replaced with preservation assertions; 5 new B-3 adversarial tests                                                                                                                      |
| `apps/mobile/test/native_scheduler_rejection_test.dart`         | Characterization test that **pinned** the B-2 defect flipped to assert the fix                                                                                                                                     |
| `scripts/cp16-mixed-client-compat-probe.mjs`                    | Extended from 6 ad-hoc cases to 16 asserted cases with exit codes                                                                                                                                                  |

### Added (6)

| File                                                           | Purpose                                             |
| -------------------------------------------------------------- | --------------------------------------------------- |
| `apps/mobile/lib/features/review/binary_response.dart`         | `BinaryResponse` enum + `shadowGrade` mapping       |
| `apps/mobile/lib/features/review/binary_review_ui_config.dart` | Build-time gate, default **OFF**                    |
| `apps/mobile/test/pending_review_event_binary_test.dart`       | 13 tests: wire shape, legacy/binary distinction     |
| `apps/mobile/test/review_binary_interaction_test.dart`         | 6 tests: queue-level binary recording               |
| `apps/mobile/test/review_binary_ui_test.dart`                  | 4 widget tests driving the real buttons             |
| `scripts/cp16-mutation-pass.sh`                                | 7-mutant adversarial harness                        |
| `scripts/cp16-downgrade-characterization.mjs`                  | Downgrade behaviour measured against the old parser |

No change to: server code, `packages/learning-engine`, migrations, CI workflows, compose/env, Production.

---

## 2. B-3 status — **FIXED**

The old load path destroyed the entire queue on any of: non-JSON bytes, a non-map envelope, an envelope key count ≠ 2, `schemaVersion != 1`, one unparseable event, or one duplicate id.

**Smallest safe migration strategy derived from the existing implementation:**

1. **Tolerate unknown keys per event.** The key-count check (`value.length != 4`) was the actual upgrade-loss mechanism; required-key checks replace it. A newer queue stays readable.
2. **Per-entry quarantine, never collective punishment.** An unreadable entry is moved to a `quarantine` list; its valid neighbours are kept.
3. **Never silently drop.** Unreadable bytes are retained verbatim (`quarantinedEntries()`), capped at 50 entries. Unreadable-whole-blob cases preserve the original string.
4. **Content-driven envelope version.** `v1` is still written unless an event actually carries binary evidence (or quarantine exists), so adding the _capability_ does not break old readers — only actually _using_ it does.
5. **Unknown future versions are read, not purged.** A `schemaVersion` greater than this build's is parsed best-effort and left un-rewritten.

**Required adversarial cases (all asserted in `review_queue_test.dart`):**

| Case                                                                | Result                                        |
| ------------------------------------------------------------------- | --------------------------------------------- |
| existing legacy queue survives upgrade                              | PASS                                          |
| binary-capable app reads legacy queued events                       | PASS                                          |
| adding the optional binary field does not wipe legacy events        | PASS                                          |
| one malformed event cannot destroy unrelated valid events           | PASS — neighbours kept, bad entry quarantined |
| schema-version transition does not wholesale-delete pending reviews | PASS                                          |
| `clientEventId`, timestamps, ordering survive migration             | PASS                                          |
| attempts/backoff state survives migration                           | **N/A — see the honest finding below**        |
| downgrade behaviour explicitly characterized                        | PASS — §5, and it is **not** uniformly safe   |

**Honest finding — attempts/backoff are not persisted at all.** `ReviewQueueStore` has only `read()`/`write()`, and the stored envelope has never contained retry state; attempt counters live in memory in the sync coordinator and reset on app restart, before and after CP16. There is therefore no migration risk, but also no "preserved" claim to make. Persisting retry state is a separate change and is **not** in CP16.

---

## 3. B-2 status — **FIXED**

Root cause was **not** a wrong field name in the model — it was that the queue's **storage** format was reused as the **wire** format. `toJson()` emitted `cardId`, the server requires `contentId`, so every native upload was rejected `400 validation` and retried forever.

Fix separates the two deliberately:

- `toJson()` — storage: keeps `cardId` + shadow `grade` so an older build can still read the queue.
- `toWireJson()` — wire: emits `contentId`, and emits `response` **instead of** `grade` for binary events (the server rejects both together as ambiguous).

Parsing distinguishes three distinct states, which is the property the mutants attack:

| Stored                            | Meaning                                                     |
| --------------------------------- | ----------------------------------------------------------- |
| no `response` key                 | legacy four-grade; no binary intent was expressed           |
| `response: "known"\|"unknown"`    | explicit binary answer; `grade` is only a shadow            |
| `response` present but unreadable | **corrupt**, rejected — _not_ silently downgraded to legacy |

That third row matters: treating an unreadable response as legacy would fabricate history.

---

## 4. Native binary UI/model status — **IMPLEMENTED, gated OFF by default**

- Two choices, Web's exact wording and order: «بلد بودم» (known) then «بلد نیستم» (unknown).
- Shadow mapping matches the server's `BINARY_SHADOW_GRADE`: `known → remembered`, `unknown → forgot`.
- Binary taps route through `recordBinary()`, never through the four-grade path; the shadow grade is _derived_, never passed in, so storage cannot disagree with the learner's answer.
- Gate: `BinaryReviewUiConfig` reads `--dart-define=LEARNBOX_MOBILE_BINARY_REVIEW_UI`, default **off**, exact-`true` match so a typo fails safe. Mirrors Web's `NEXT_PUBLIC_LEARNBOX_BINARY_REVIEW_UI`.
- No documented UX divergence from Web was required.

---

## 5. Upgrade and downgrade behaviour

**Upgrade (old → new): SAFE.** A v1 legacy queue is read intact; `clientEventId`/`occurredAt`/order preserved; no re-mint; nothing purged. Asserted in `review_queue_test.dart`.

**Downgrade (new → old): DEPENDS ON QUEUE STATE — the categories are NOT equivalent.**

No attempt is made to "fix" the already-shipped old parser from the new client; that is impossible by construction. Instead the limitation is **measured**. `apps/mobile/test/cp16_downgrade_fixture_test.dart` drives the **real CP16 queue** to produce the exact stored bytes for each category, and `scripts/cp16-downgrade-characterization.mjs` feeds those bytes to the **pre-CP16 parser logic transcribed verbatim from the committed client**:

| #     | Downgrade category                                     | New build wrote | Old build's behaviour                            | Verdict                                   |
| ----- | ------------------------------------------------------ | --------------- | ------------------------------------------------ | ----------------------------------------- |
| **A** | Code rollback **before any binary review is created**  | `v1`, 2 keys    | **kept 1/1**                                     | **QUEUE-SAFE**                            |
| **B** | Downgrade with an **empty / fully synced** queue       | `v1`, 2 keys    | **kept 0/0**                                     | **QUEUE-SAFE** (nothing unsynced at risk) |
| **C** | Downgrade with a **pending legacy-only** queue         | `v1`, 2 keys    | **kept 2/2**                                     | **QUEUE-SAFE**                            |
| **D** | Downgrade **after binary queue state exists**          | `v2`, 2 keys    | **PURGED** (`schemaVersion=2 != 1`)              | **NOT QUEUE-SAFE**                        |
| **E** | Pending legacy-only, but a **quarantine entry exists** | `v2`, 3 keys    | **PURGED** (envelope has 3 keys, old requires 2) | **NOT QUEUE-SAFE**                        |

**The measured limitation, stated exactly:** once a device has created unsynced binary-capable queue state, downgrade to the pre-CP16 client is **not queue-safe**. Unsynced reviews on that device are destroyed by the old build. Already-synced reviews are unaffected (they live server-side).

Category **A** is the load-bearing result for merge safety: installing a binary-capable build does **not** by itself make downgrade unsafe, because `_envelopeVersionFor` keeps the envelope at `v1` until an event actually carries binary evidence. With the UI default **OFF**, a merged CP16 produces only category A/B/C states.

Category **E** is a distinct, independently discovered hazard: the `quarantine` key alone trips the old build's exact-2-key envelope check, so a **pure-legacy** pending queue can also be lost on downgrade if anything was ever quarantined. It is not caused by binary review and must not be folded into category D.

**This is not a merge blocker** (binary UI is default OFF), **but it is a release/activation constraint.** Before Native Binary Review is activated, a rollout policy must state which categories are reachable and must not claim downgrade safety we do not have. Recorded as a precondition for the Native Binary Rollout Readiness checkpoint:

- Treat a binary-capable **activated** client as **not freely reversible**; code rollback is only safe while category A/B/C holds.
- Any rollback plan that assumes "uninstall the new build and keep the queue" is **invalid** for category D/E.
- If reversibility is required, the queue must be flushed (synced) before downgrade, or the loss must be explicitly accepted.

---

## 6. Legacy queued-event preservation evidence

- `B-3: a legacy queue survives an upgrade that adds an unknown field` — PASS
- `B-3: one malformed event cannot destroy its valid neighbours` — PASS (neighbours kept, bad entry quarantined)
- `unreadable storage is quarantined, never silently discarded` — PASS (bytes retained)
- `B-3: clientEventId and occurredAt survive a queue migration unchanged` — PASS
- Wire-level: `Stage 4.3 — pre-upgrade queued event stays legacy` → parsed as `legacy(grade=forgot)`, `response === undefined`
- Mutant **M1** (restore the key-count check) and **M6** (purge on one bad event) both **KILLED**, proving these are tested, not merely asserted in prose.

---

## 7. Mixed Web/Native compatibility evidence

All 16 cases driven through the **real compiled server parser** (`apps/api/dist/.../mobile-review-batch.request.js`), re-run after a fresh `apps/api` build:

| Required case                                  | Result                                                                  |
| ---------------------------------------------- | ----------------------------------------------------------------------- |
| old Native → new server                        | PASS — accepted as legacy, `response` stays undefined                   |
| new Native → new server                        | PASS — `known→remembered`, `unknown→forgot`                             |
| queued legacy event → new Native → new server  | PASS — still legacy, not reinterpreted                                  |
| mixed legacy + binary batch                    | PASS — `legacy(grade=hard)                                              | explicit:known(shadow=remembered)` |
| Web binary + Native binary alternating         | PASS — identical wire shape, so semantically equivalent by construction |
| old Native four-grade + Web binary alternating | PASS — no cross-contamination                                           |
| duplicate/replay across upgrade boundary       | PASS — see §8                                                           |
| offline review before upgrade, synced after    | PASS                                                                    |
| `grade` + `response` together                  | REJECTED `validation`                                                   |
| pre-B-2 `cardId` field                         | REJECTED `validation`                                                   |
| legacy with flag OFF                           | PASS                                                                    |
| binary with flag OFF                           | REJECTED — **server flag must precede client rollout**                  |

**Old clients stay serviceable: proven, not assumed.** The old-Native case passes with the flag ON, so no synchronized client upgrade is required.

**Ordering constraint this exposes:** binary payloads are refused while `LEARNBOX_BINARY_REVIEW` is off, so the server flag must be enabled **before** any binary-capable client reaches a learner. The reverse order breaks new clients.

---

## 8. Idempotency / replay evidence

- `clientEventId` is preserved byte-for-byte through parsing in both shapes; the same id re-sent after upgrade in the _other_ shape still carries the same key (`idempotency key stable across shapes? YES`).
- A duplicate id **within one batch** is rejected `validation`.
- Cross-batch replay is stopped by the pre-existing `UNIQUE (user_id, client_event_id)` + `ON CONFLICT DO NOTHING` backstop; CP16 does not weaken it.
- Queue-side: ids are never re-minted on reload, and duplicate ids in storage are quarantined rather than loaded twice.
- Mutant **M2** (re-mint `clientEventId` on restore) — **KILLED**.

---

## 9. Full verification results

| Gate                                                       | Result                                                     |
| ---------------------------------------------------------- | ---------------------------------------------------------- |
| `flutter test` (mobile)                                    | **327 passed, 0 failed** (was 299 at CP15; +28 CP16 tests) |
| `flutter analyze`                                          | No issues found                                            |
| `dart format --set-exit-if-changed lib/ test/`             | 87 files, 0 changed                                        |
| `pnpm typecheck`                                           | admin / api / website all Done                             |
| `pnpm test` (TypeScript)                                   | **1,427 passed, 0 failed**, exit 0                         |
| `pnpm verify:review-sync-wire-contract`                    | fixture matches canonical (422 / `schedulerRejected`)      |
| `scripts/cp16-mixed-client-compat-probe.mjs`               | **ALL 16 CP16 WIRE CASES PASS**, exit 0                    |
| `scripts/cp16-mutation-pass.sh`                            | **7 killed, 0 survived**                                   |
| `prettier --check scripts/ docs/planning/ CURRENT_WORK.md` | all matched files use Prettier style                       |

**Mutation pass (all 7 required mutants, all KILLED):**

| Mutant | Attacks                                                     |
| ------ | ----------------------------------------------------------- |
| M1     | queue wholesale deletion on unknown/new fields              |
| M2     | regenerated `clientEventId`                                 |
| M3     | legacy event falsely acquiring `response`                   |
| M4     | known/unknown shadow mapping inversion                      |
| M5     | accepting simultaneous wire `grade` + `response`            |
| M6     | retry/idempotency regression (one bad event discards queue) |
| M7     | accidental Scheduler V2 / flag-discipline coupling          |

**Two harness defects found and fixed during this pass — both would have produced false confidence:**

1. **Restore by `git checkout --` silently failed on untracked files.** `binary_response.dart` was untracked, so the M4 inversion survived into the working tree and the next run snapshotted already-mutated source — 55 unrelated test failures, and three mutations (M2/M3/M5) left behind. Fixed: snapshot/restore by **file copy** into a temp dir, plus a post-restore `cmp` check that aborts on mismatch. All residue was removed and re-verified.
2. **M6's pattern never matched the source**, so the mutant was never applied and was reported as `SURVIVED` — indistinguishable from a real product gap. Fixed: pattern corrected, and the harness now `cmp`s against the snapshot before testing and reports `ERROR … mutant never applied` instead of a result.

The harness now also **verifies the baseline is green before mutating**, so an already-failing suite cannot make every mutant look dead.

**Stage 5 — scheduler isolation:** `grep` over `apps/mobile/lib/` finds no reference to `SCHEDULER_V2`, `engine_version`, or `engineVersion` except a comment in `binary_review_ui_config.dart` stating the independence. The binary UI define and the scheduler flag are unrelated; the wire probe passes with Scheduler V2 absent; M7 pins flag discipline.

**Production re-verified untouched after implementation:**
`digest=sha256:cb3090dada7b599ec2771fb6612fb14958bff24ab85fa72e8c4ee5ba05d10cc7`, `APP_SOURCE_SHA=d4ea6558b708d055cda8c3aca5010064b1cec58c`, `restarts=0`, `StartedAt=2026-10-02T21:28:45Z` (unchanged), `health=healthy`, `SCHEDULER_V2` env count **0**.

---

## 10. Can Native semantic parity be considered CLOSED?

**Code-complete and evidence-backed, but NOT closable as a shipped product guarantee.** Three things are genuinely closed, and two genuinely are not.

**Closed:**

- **B-3 queue forward compatibility** — fixed, with adversarial tests and two mutants pinning it.
- **B-2 wire compatibility** — fixed at the real root cause; the test that pinned the defect now pins the fix.
- **Semantic parity of newly-created reviews** — new Native emits a wire item byte-identical to Web's, proven against the real server parser. Legacy events are never reinterpreted.

**Not closed:**

- **Downgrade safety (§5).** Shipping a binary-capable build is effectively **one-way** for unsynced reviews. This is a property of the already-shipped old build and cannot be fixed from the new side.
- **Native sync is still disabled in production code.** `DisabledReviewSyncTransport` remains wired in, and a guard test asserts `HttpReviewSyncTransport` is excluded. CP16 makes the payload correct; it does not turn native sync on. Until that is enabled behind the server flag, parity is proven **at the contract and queue level, not in the field**.

**Recommended owner-facing status:**

- Native binary review model/UI: **IMPLEMENTED (flag-off)**
- B-2 / B-3: **CLOSED**
- Native↔Web semantic parity: **PROVEN AT CONTRACT LEVEL; NOT YET EXERCISED IN PRODUCTION**
- Downgrade: **KNOWN ONE-WAY LIMITATION — release-gate decision required**
- Scheduler V2: **OFF / ABSENT / UNCOUPLED**
- Production: **UNCHANGED**

**Required ordering for any future rollout:** enable `LEARNBOX_BINARY_REVIEW` server-side **first**, then ship the client with the define on. The reverse order breaks new clients (binary payloads are rejected while the flag is off).

---

## Stop gate

Implementation complete and verified. **Not committed, not pushed, no PR, not deployed.** No Production change. Scheduler V2 untouched. Awaiting owner review before any commit or merge.
