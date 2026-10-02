# LB-B35 CP9 — Production Cutover Runbook (NOT YET AUTHORIZED)

**Status:** prepared, **not executed**. Production cutover requires explicit owner authorization.
**Baseline:** `4ade0a88` (v1.2.1) · **Candidate:** `ff658a43` (`main`)
**Approved artifact:** `learnbox-app:cp9-candidate` → image id
`sha256:9f14c7c8da9ee6b78cd1766929e400c7e57cbcd2cc1086765304cfa62b569dd2`
**Host:** `learnbox-prod` (185.204.168.178) · app dir `/home/ubuntu/learnbox/app`

Owner decisions in force: **D-1** migrator DSN per-command only · **D-2** Binary Review UI deferred
(not in this artifact) · **D-3** one dedicated test account with event-count gates · **D-4** no
Caddy/Admin containment · **D-5** V2 last, separately authorized, flag-off ≠ data rollback.

---

## Global abort conditions (any one ⇒ stop and roll back to the last rollback point)

1. `/api/health` not `200` for two consecutive checks after a step.
2. Any HTTP `5xx` on `/api/reviews*` attributable to the deploy.
3. Any unauthenticated request returning protected content/media with `200`.
4. `review_events` duplicate `client_event_id`, or an event without its `card_schedules` row.
5. A learner-visible count changing in a way not predicted by Stage 2.5 Category C.
6. Migration runner reporting checksum mismatch or a non-0023 migration pending.
7. Any step requiring an unplanned command — stop and re-plan instead of improvising.

---

## Stage 0 — Freeze and record (no change)

```bash
ssh learnbox-prod 'cd /home/ubuntu/learnbox/app
  docker ps --format "{{.ID}} {{.Image}} {{.Status}}"
  docker exec $(docker ps -q --filter name=app) printenv APP_SOURCE_SHA
  curl -fsS -o /dev/null -w "health=%{http_code}\n" https://app.learnboxapp.com/api/health'
```

**Gate:** `APP_SOURCE_SHA=4ade0a88…`, health `200`. Record container id and image id.
**Rollback point R0:** current image + current `.env` + current compose.

## Stage 1 — Backup with immediately verified restore (D-1 rollback basis)

```bash
# On the host, with the migrator DSN injected for this command only (never written to compose/.env):
ssh learnbox-prod 'set -a; . /home/ubuntu/learnbox/secrets/db-roles.env; set +a
  TS=$(date -u +%Y%m%dT%H%M%SZ)
  pg_dump --no-owner --no-privileges --format=custom \
    -d "$LEARNBOX_MIGRATOR_DATABASE_URL" -f /home/ubuntu/learnbox/backups/cp9-$TS.dump
  ls -l /home/ubuntu/learnbox/backups/cp9-$TS.dump'
```

Then **prove the dump restores** into a throwaway database (not the live one) and compare row counts
for `users`, `cards`, `card_schedules`, `review_events`, plus `schema_migrations` max version.

**Gate:** restore succeeds and every count matches the live database exactly.
**Abort if:** restore fails or any count differs. **Rollback point R1:** verified dump path.

## Stage 2 — Candidate artifact onto the host (no traffic change)

Build is already proven locally (see `LB_B35_CP9_ARTIFACT_PROOF`). Transfer **by digest**, never by
mutable tag:

```bash
docker save learnbox-app:cp9-candidate | gzip | ssh learnbox-prod 'gunzip | docker load'
ssh learnbox-prod 'docker image inspect learnbox-app:cp9-candidate --format "{{.Id}}"'
```

**Gate:** host-side image id equals
`sha256:9f14c7c8da9ee6b78cd1766929e400c7e57cbcd2cc1086765304cfa62b569dd2`.
**Abort if:** the digest differs by one character.

## Stage 2.5 — Inventory gate (hard gate, already PASSED)

`docs/planning/LB_B35_CP9_STAGE25_RUNTIME_INVENTORY.md`: **41/41** classified (40 changed runtime
files + 1 new CP9 file), zero unexplained, zero duplicated, **zero schema-risk**.
**Gate:** owner has explicitly **accepted Category C** (C-1…C-7). Flag C-1 in the go/no-go: the
accuracy definition widens to count `hard`+`mastered` as correct, moving displayed accuracy from
**≈33% to ≈77%** on current Production data (39 of 90 events reclassified). Every other Category C
change is provably inert today (all 31 schedules are Box 1–2).
**Abort if:** any Category C item is rejected — then CP9 must be re-scoped, not deployed.

## Stage 2.75 — Graceful shutdown proof (already PASSED on staging, 7/7)

`tools/cp8/cp9-stage275-proof.sh` — 4,416 real reviews, SIGTERM mid-flight: 0 lost, 0 duplicate,
0 partial, graceful exit in 1 s, no SIGKILL.
**Gate:** re-run on staging if any lifecycle/compose change is made after this date.

## Stage 3 — Deploy candidate with ALL flags OFF (first traffic change)

Pin compose to the **digest**, not `learnbox-app:production`:

```bash
ssh learnbox-prod 'cd /home/ubuntu/learnbox/app
  cp .env .env.cp9-pre && cp compose.yaml compose.yaml.cp9-pre
  # edit compose.yaml: image: learnbox-app@sha256:9f14c7c8…  (digest pin, no tag)
  docker compose up -d --no-deps app
  sleep 5; curl -fsS -o /dev/null -w "health=%{http_code}\n" https://app.learnboxapp.com/api/health
  docker exec $(docker ps -q --filter name=app) printenv APP_SOURCE_SHA'
```

**Gate:** health `200`; `APP_SOURCE_SHA=ff658a43…`; **zero** `LEARNBOX_*` feature flags present;
anonymous `GET /api/content-media/<cardId>/audio` returns `401`.
**Expected learner-visible delta:** exactly Category C — dominated by **C-1**, the accuracy jump
(≈33%→≈77%). `mastered`/ring/words-progress are provably unchanged (all 31 schedules Box 1–2); the
Persian labels (تسلط→یادگیری, مسلط→یاد گرفته) and the field renames change immediately.
**If accuracy does NOT change, that is a red flag** — it means the new read path is not live.
**Rollback R3:** restore `compose.yaml.cp9-pre` + `docker compose up -d --no-deps app` (back to
`4ade0a88`). No schema change has happened yet, so this rollback is complete and lossless.

## Stage 3-OBS — Scripted observation with event-count gates (D-3)

Using the single owner-approved test account, submit a predefined number of reviews (recommend
**N = 20**) through the real web client, then verify:

```sql
SELECT count(*) FROM review_events WHERE user_id = :test_user AND occurred_at > :t0;      -- expect N
SELECT count(*) FROM (SELECT client_event_id FROM review_events
  WHERE user_id = :test_user GROUP BY 1 HAVING count(*) > 1) d;                           -- expect 0
SELECT count(*) FROM review_events re WHERE re.user_id = :test_user
  AND NOT EXISTS (SELECT 1 FROM card_schedules cs
    WHERE cs.user_id = re.user_id AND cs.card_id = re.card_id);                            -- expect 0
```

**Gate:** exactly `N` events, `0` duplicates, `0` orphans, no `5xx` in logs.
**Cleanup (scoped, reversible):** `DELETE FROM review_events WHERE user_id = :test_user AND occurred_at > :t0;`
then re-verify the count is `0`. Never a bare `DELETE FROM review_events`.

## Stage 4 — Apply migration 0023 (first schema change)

```bash
ssh learnbox-prod 'set -a; . /home/ubuntu/learnbox/secrets/db-roles.env; set +a
  cd /home/ubuntu/learnbox/app
  docker exec -e DATABASE_URL="$LEARNBOX_MIGRATOR_DATABASE_URL" \
    $(docker ps -q --filter name=app) node dist/database/migrate.js --to 0023'
```

0023 is **purely additive** (new nullable columns + CHECK + new tables); the runner is
advisory-locked, transactional and checksum-verified.
**Gate:** `schema_migrations` max = `0023`; `review_events.response` exists as `text` with
`review_events_response_valid`; health `200`; all flags still off.
**Abort if:** checksum mismatch, or any migration other than 0023 is pending.
**Rollback R4:** 0023 is additive and inert while flags are off — **leave it applied**. Do not write a
down-migration. If the code must go back, roll back the image only (R3).

## Stage 5 — Enable CP4 server flags incrementally (one at a time)

Order: `LEARNBOX_TZ_PERSIST` → `LEARNBOX_SERVER_SESSION_PLAN` → `LEARNBOX_TODAY_WORKLOAD` →
`LEARNBOX_QUEUE_QUARANTINE`. For each: add to **both** `.env` and the systemd unit `Environment=`
(this host requires both), restart, then re-check health + the Stage 3-OBS queries.
**Gate per flag:** health `200`, no `5xx`, event invariants hold.
**Rollback R5:** remove that one flag, restart. Fully reversible — no data is rewritten by these.

## Stage 6 — Binary Review backend (requires the N1 preflight, now implemented)

**Prerequisite (hard):** 0023 applied (Stage 4) **and** the CP9 N1 preflight present in the running
image — proven by `tools/cp8/cp9-n1-realdb-proof.mjs` (9/9) and 10 unit tests.
Set `LEARNBOX_BINARY_REVIEW=true` (both `.env` and unit), restart.
**Gate:** a binary answer persists exactly once with `response` set; on a hypothetical pre-0023
schema the request would fail **422 deterministic**, never 503 retry-loop.
**Mobile scope note (adversarial pass):** Stage 6 enables binary review for the **web only**. The
mobile HTTP boundary does not pass `binaryResponses` (pre-existing since v1.2.1), so mobile binary
items are rejected 400 — and the mobile route answers 503 regardless, since
`MOBILE_REVIEW_SYNC_ENABLED` is absent in Production. No native behaviour changes in CP9 (D16).

**Note (D-2):** the **UI stays off** — `binaryWire:!1` is baked into this artifact and cannot be
flipped at runtime. Binary review is backend-only here; the UI is a separate later release.
**Rollback R6:** `LEARNBOX_BINARY_REVIEW=false`, restart. Rows already written keep their `response`
value, which is additive and ignored by the V1 path.

## Stage 7 — Scheduler V2 — **SEPARATE AUTHORIZATION REQUIRED (D-5)**

**Do not perform as part of CP9.** Blocked by **D16**: the Dart client
(`apps/mobile/lib/features/sync/http_review_sync_transport.dart`) must first treat `422
schedulerRejected` as non-retryable, with tests. Web-only activation is permitted in principle, but
remains a distinct owner gate.
**Rollback asymmetry (acknowledged):** `LEARNBOX_SCHEDULER_V2=false` restores future algorithm
behaviour but **not** already-overwritten `stability_days`/`due_at`. The only full restore is the
Stage 1 verified dump (R1).

---

## Rollback points summary

| Id  | After   | Restores                                         | Complete?                                    |
| --- | ------- | ------------------------------------------------ | -------------------------------------------- |
| R0  | Stage 0 | image + env + compose                            | yes                                          |
| R1  | Stage 1 | full database (verified dump)                    | yes — the only full data restore             |
| R3  | Stage 3 | v1.2.1 image via compose digest swap             | yes (no schema change yet)                   |
| R4  | Stage 4 | image only; 0023 stays applied (additive, inert) | schema forward-only                          |
| R5  | Stage 5 | per-flag off                                     | yes                                          |
| R6  | Stage 6 | binary review off                                | yes (written `response` values are additive) |
| R7  | Stage 7 | algorithm only — **not** data                    | **no** — needs R1                            |
