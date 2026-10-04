# Functional Validation — Mona Real-Device End-to-End: Results

**Status:** COMPLETE — PASS, with 2 non-blocking UI defects recorded
**Date:** 2026-10-03
**Tester:** Owner (Bahram), physical Android device, Chrome, https://app.learnboxapp.com
**Observer:** Hermes, querying Production between every step
**Recovery point held throughout:** `snap-ancient-band-asqfztci`

## 1. Environment

| Item                              | Value                                                                     |
| --------------------------------- | ------------------------------------------------------------------------- |
| Image digest                      | `sha256:cb3090dada7b599ec2771fb6612fb14958bff24ab85fa72e8c4ee5ba05d10cc7` |
| `APP_SOURCE_SHA`                  | `d4ea6558b708d055cda8c3aca5010064b1cec58c`                                |
| RestartCount                      | 0 (unchanged across the whole run)                                        |
| `LEARNBOX_BINARY_REVIEW`          | `true`                                                                    |
| `LEARNBOX_BINARY_REVIEW_CREATION` | `<ABSENT>`                                                                |
| `LEARNBOX_SCHEDULER_V2`           | `<ABSENT>` — OFF before, during and after                                 |
| Health                            | 200                                                                       |

Client under test was the shipped **web PWA**, not a Native build. The Native path still
wires `DisabledReviewSyncTransport` in Production, so a Native install could not have
exercised review sync; no build was released to make a test pass.

## 2. Accounts

- **Account A — Mona** `b4efb0a4-d829-4f33-b686-0f498fbef62c`, tz `Asia/Tehran`.
  Entered the test at the post-reset fresh state `0 / 0 / 0`.
- **Account B — Bahram** `451b0433-7204-44e9-957f-250cac59e28e`. Isolation control.
  Never touched by any test action.

## 3. Step results

### 3.1 Login → bootstrap

Server created exactly one `learner_daily_plans` row at `21:08:22`, `local_day=2026-10-04`,
`time_zone=Asia/Tehran` (her stored timezone, not browser-guessed), `new_card_ids` length 3.

`review_events=0`, `card_schedules=0`, `cursors=0` at this point. **Schedules are not
pre-created at login** — they are bootstrapped on first answer. No synthetic history.

### 3.2 Today screen (before any answer)

UI "3 of 3 remaining" matched `array_length(new_card_ids,1)=3`.
Navigating to Today did **not** re-bootstrap: `plan_rows_total=1`, `plan_rows_today=1`,
`created_at` still `21:08:22`. Totals unchanged.

### 3.3 Card 1 — «بلد بودم» (known)

| field            | value        |
| ---------------- | ------------ |
| `response`       | `known`      |
| `grade`          | `remembered` |
| `state`          | `learning`   |
| `stability_days` | 0.0750       |
| `difficulty`     | 4.9          |
| `lapses`         | 0            |
| due              | +108 min     |

Exactly 1 event, 1 schedule, 1 cursor row. `client_event_id` present. Answered card was a
member of today's plan; schedule row was for that same card.

**This proves the binary review path is genuinely live on the shipped build**: the answer is
persisted as a first-class `response` value with the legacy `grade` kept as the compatibility
shadow, exactly as `HISTORICAL_GRADE_PROJECTION` / `BINARY_SHADOW_GRADE` specify.

### 3.4 Card 2 — «بلد نیستم» (unknown)

| field            | card 1 (known)         | card 2 (unknown)     |
| ---------------- | ---------------------- | -------------------- |
| response / grade | `known` / `remembered` | `unknown` / `forgot` |
| state            | `learning`             | `relearning`         |
| stability        | 0.0750 d               | 0.0146 d             |
| difficulty       | 4.9                    | 5.5                  |
| lapses           | 0                      | **1**                |
| due in           | 108 min                | **21 min**           |

The unknown branch produced a shorter interval, higher difficulty and an incremented lapse
counter — the engine reacts to the answer rather than merely logging it.

No duplicates: `ev=2`, `sch=2`, `distinct client_event_id=2`, `distinct schedule cards=2`,
rejections 0, still exactly 1 plan row. Cursor advanced 1 → 2.

### 3.5 Offline — card 3 answered in airplane mode

UI accepted the answer and reported «۱ پاسخ برای همگام‌سازی امن نگهداری شد».

Production during the offline window:

- `ev=2` (**not 3**), `sch=2`, cursor 2, rejections 0
- last event `21:17:05` vs server now `21:26:40` — 9.5 min stale, nothing arrived
- third plan card `ece1459b` had **no** event server-side
- no partial write, no ghost row, no rejection

Answer was genuinely held on-device; nothing was lost and nothing leaked through.

### 3.6 Reconnect — exactly-once flush

| check                         | result        |
| ----------------------------- | ------------- |
| `ev` 2 → 3, never 4           | PASS          |
| `sch` 2 → 3                   | PASS          |
| `ece1459b` events / schedules | exactly 1 / 1 |
| cursor 2 → 3                  | PASS          |
| duplicate `client_event_id`   | NONE          |
| rejections                    | 0             |

The decisive evidence of true offline capture:

```
EV3 card=ece1459b resp=known grade=remembered cur=3 ceid=3fa8608d
    occurred_at = 2026-10-03 21:21:24  (while offline)
    applied_at  = 2026-10-03 21:27:21  (~6 min later, on reconnect)
```

The client preserved the real answer time instead of stamping upload time.

### 3.7 Restart / re-login persistence

App fully closed, reopened, re-authenticated.

- `ev=3`, `sch=3`, `distinct ceid=3`, cursor 3, rejections 0, plans **1**
- plan `created_at` still `21:08:22` — re-login did **not** re-bootstrap
- `ev_ids_md5=f2f8b0e8c46f6f8196a5d1fb4309b8ad`
- `applied_md5=40811723e57f311e8553721ca1e96b7e`

Queued event was not replayed on reconnect nor on re-login.

### 3.8 Relearning loop — lapsed card returns

After refresh, UI showed «۱ کارت دیگه مونده», ring 3 of 4, review button re-enabled.

Server confirmed the due card is exactly the lapsed one:

```
DUE_NOW: 96d7ac0c state=relearning lapses=1 due=21:38:05
not_due: 01e8dd91 due=23:02:37
not_due: ece1459b due=23:09:24
```

Critically, **refreshing created nothing**: `ev=3`, `sch=3`, cursor 3, rejections 0,
`ev_ids_md5` and `applied_md5` byte-identical to §3.7, and
`sch_updated_md5=d3c84dd3ade708039b32d2af68b69b4e` unchanged. The card returned to the queue
purely because `due_at` passed — a read, not a write.

## 4. Isolation control — Bahram

Verified after **every** step, unchanged throughout:

- counts `58 / 16 / 1`
- combined digest `f6f477b2f42a957a15092871655eb277`
- `xmin` events `b9b103fa7525cc76a332ceac1bc3ec25`

Unchanged `xmin` proves no Bahram row was updated, deleted or rewritten — a no-op rewrite
would still have bumped it. Cross-user isolation holds under real learner traffic.

## 5. Defects found

### D-FV-1 — Completion mascot breaks when first reached offline (UI, non-blocking) — **CLOSED**

**Status:** **DEPLOYED to Production** 2026-10-04 — artifact `sha256:953b7b62…`,
`APP_SOURCE_SHA=6d6aa72489dd895299f8a1f4bedb2c205e32e31b`. Production serves SW `v10` with
`celebrate-v2.png` precached; offline path proven against the deployed digest with the origin
killed (raw image `DECODED_1024x1536`, no broken icon). Evidence:
`D_FV_1_PRODUCTION_DEPLOYMENT_EVIDENCE.md`.

Fixed and merged to `main` as `88c36bd890e61990d3bf6729ccb6665ad8f78b9d`
(PR #358, reviewed head `b780bd38eea3e015729df16b183815f6a360e394`, required CI 4/4 green on
both the PR head and `main`; merged tree byte-identical to the reviewed head).
Fix evidence: `D_FV_1_OFFLINE_COMPLETION_IMAGE.md`.

**Symptom:** the celebration illustration on the session-complete screen rendered as a broken
image icon after the offline card was answered.

**Not a missing asset.** Server-side all healthy:

- `/images/bobo/celebrate-v2.png` → 200, 510,518 B, present in container
- `next/image` optimizer → 200 as PNG (w=96/128/256) and as WebP with a browser `Accept` header

**Root cause — `apps/website/public/sw.js`:** `OFFLINE_ASSETS` precaches
`/images/bobo/recovery-v2.png` but **not** `celebrate-v2.png`. The fetch handler only
populates the cache _after_ a successful network fetch. The completion screen is the only
place rendering `celebrate-v2`, and it is first reached at the end of a session — in this run,
while offline. Network failed, cache was empty, `request.mode !== 'navigate'`, so the handler
returned `Response.error()`. React does not retry a failed `<img>`, so it does not self-heal
on reconnect.

**Impact:** cosmetic, zero data impact — but it will hit every learner who finishes their
first session offline, at precisely the reward moment.

**Contributing factors (recorded, not fixed):**

1. `Bobo` has no `onError` fallback, unlike `StartMediaVisual` which does. — **fixed in #358**
2. The SW's prefix test checks `/images/`, but `next/image` requests arrive as
   `/_next/image?url=...`, so **no** `next/image` asset is ever precached. — **unchanged and
   deliberate**: that path can proxy protected media, so it must stay uncached. The component
   fallback to the raw precached path is the fix instead.

**Residual (F-1):** `welcome`, `encourage` and `focus` are still not precached (~1.5 MB).
They now degrade to a decorative placeholder rather than a broken icon, so the learner-visible
defect is closed; precaching all five would roughly double the ~1.6 MB install payload, which
is a product decision rather than a bug.

### D-FV-2 — «دقت» 67% reads as session progress — **CLOSED, no code change (accepted UX debt)**

The 67% is `realAccuracy` under the label «دقت» (accuracy): 2 known of 3 answers = 66.7% → 67%.
**The number is correct.** Session progress is a separate ring showing «۳ از ۳» with no percent.

**Decision: not worth fixing now.** Reviewed `TodayScreen.tsx`: the value already sits in a
`stat-card` with «دقت» rendered directly beneath it, inside a `quick-stats` group labelled
«آمار سریع», and the progress ring carries no percentage at all. The label is present, correct
and adjacent — so there is no defect in the markup to repair. The single observed misreading
happened while reading a text summary, not while using the screen, and one data point is not
evidence that the UI misleads learners. Any "fix" here (renaming a correct label, adding
explanatory copy, restyling the stat) would be speculative churn on a screen that is already
accurate, and would need its own visual/a11y verification to land safely.

**Revisit if** a real learner misreads it, or when the Today screen is next reworked for other
reasons — at which point the cheap move is a clearer unit on the value («۶۷٪ دقت») rather than
new UI. Tracked here; no backlog item opened, because the current behaviour is correct.

## 6. Scope discipline

No code was changed to make any test pass. No deploy, no flag change, no Native release,
no Scheduler V2 activation. Both defects were recorded as findings during the test run itself;
D-FV-1 was fixed afterwards under its own reviewed PR (#358) with the same discipline.

## 7. Recovery assets — still preserved

```
snap-ancient-band-asqfztci   fv-pre-reset-20261003T203146Z   br-long-frog-assrohg5   2026-10-03T20:31:47Z
fv-recovery-verify-20261003  br-purple-night-as1ji0k0        ready                   2026-10-03T20:32:09Z
```

Neither restored nor deleted.

## 8. Verdict

Functional Validation **PASSES**. Login, fresh-learner bootstrap, binary review (both
branches), persistence, offline queueing, reconnect flush, exactly-once semantics,
restart/re-login durability and the relearning loop all behave correctly against real
Production with a real device. Cross-user isolation is proven by unchanged control
fingerprints. Two UI defects are recorded; neither affects data integrity.
