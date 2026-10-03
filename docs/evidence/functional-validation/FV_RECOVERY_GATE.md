# FV Recovery Gate — Neon recovery point: creation + verification procedure

> **SUPERSEDED IN PART — read this first.** This document was written on 2026-10-03 *before* Hermes
> had Neon control-plane access. §1 and §3 claim Hermes cannot create the recovery point and that
> the owner must do it manually in the console. **That is no longer true.** A project-scoped Neon
> API key was subsequently authorized (profile `learnbox`, project `divine-silence-09471885`), and
> Hermes created the recovery point itself via the official Neon CLI.
>
> What actually happened: snapshot `snap-ancient-band-asqfztci`
> (`fv-pre-reset-20261003T203146Z`), created `2026-10-03T20:31:47Z` from `br-long-frog-assrohg5`,
> verified by restoring to isolated branch `br-purple-night-as1ji0k0` and querying it independently.
>
> §2 (identity), §4 (verification method), §5 (secondary COPY evidence) and §6 remain accurate and
> were followed. For the executed reset see `MONA_RESET_EXECUTION_EVIDENCE.md`.
> Retained as the historical record of the gate as it stood before Neon access existed.

**Status:** PREPARED. **No reset executed. No Production write. No grant/flag/deploy change.**
Prepared 2026-10-03 against main `23d0f1e23e6b94027a1d5b75f08d6bd9a300f04f` (post-PR #356).

This gate produces **one artifact**: a verified Neon recovery point representing Production
immediately before the future learner-state reset. It does **not** authorize the reset.

Per FV-1, the Neon snapshot/branch is the **primary** recovery point. The logical `COPY` export in
§5 is **secondary evidence only** and is explicitly **not** a substitute.

---

## 1. Hermes cannot create the recovery point — owner action required

Verified by probe, not assumed:

| Credential / tool | Local (Hermes) | Production host |
| ----------------- | -------------- | --------------- |
| `NEON_API_KEY`    | ABSENT         | ABSENT          |
| `NEON_TOKEN`      | ABSENT         | ABSENT          |
| `NEON_PROJECT_ID` | ABSENT         | ABSENT          |
| `neonctl` CLI     | ABSENT         | ABSENT          |
| Neon creds in `secrets/db-roles.env`, `app/.env` | — | none present |

The only Production DB credentials available are the `learnbox_app` and `learnbox_migrator`
connection strings. Neither can create a snapshot or branch — that is a control-plane operation
requiring the Neon account, not a Postgres role. **Therefore the owner must create the recovery
point in the Neon console.** Hermes verifies it afterwards (§4).

Per standing policy, no Neon API key should be pasted into chat. If you later want Hermes to create
recovery points itself, provision a Neon API key through the secure secret flow (`owner-secret-provisioning`) — not required for this gate.

---

## 2. Target identity (read live from Production, 2026-10-03 20:11 UTC)

| Field | Value |
| ----- | ----- |
| Neon project ID | `divine-silence-09471885` |
| Branch ID (root) | `br-long-frog-assrohg5` |
| Endpoint ID | `ep-jolly-hill-asbffbzx` |
| Host | `ep-jolly-hill-asbffbzx.c-4.eu-central-1.aws.neon.tech` |
| Database | `neondb` |
| Timeline ID | `5ec2b617eb25a644f2f6d140c71605eb` |
| Tenant ID | `643e5c2825d227c879f6e368fe832033` |
| Postgres version | 17.11 |
| Region | `eu-central-1` (AWS) |
| LSN at capture | `0/60C81E0` |
| Server time at capture | `2026-10-03 20:11:13 UTC` |

The branch is a **root** branch, which matters: Neon supports instant restore (PITR) only on root
branches. This is the good case — our recovery target supports both snapshot and PITR.

---

## 3. Owner steps — minimal path (do these, nothing more)

Perform these **immediately before** the reset, not days ahead: the recovery point must represent
Production as it stands at reset time.

1. Open <https://console.neon.tech> → project **`divine-silence-09471885`**.
2. Confirm you are on branch **`br-long-frog-assrohg5`** (the root branch serving
   `ep-jolly-hill-asbffbzx`). Do not select any other branch.
3. Go to **Backup & restore** (or **Branches → Snapshots**).
4. Click **Create snapshot**. Name it exactly:
   `fv-pre-reset-20261003` (adjust the date to the actual day you create it).
5. Wait until it is listed as complete, then note from the UI:
   - the **snapshot name/ID**,
   - its **creation timestamp (UTC)**,
   - the **branch** it was taken from.
6. Also note, from **Settings → Instant restore**, your project's **history window** and your
   **plan**.
7. Report items 5 and 6 back here. **Do not restore anything. Do not delete any branch.**

Two plan-dependent facts worth checking at step 6, because they change the safety margin:

- **Free plan allows only 1 manual snapshot and a 6-hour history window.** If the project is on
  Free, an older snapshot may need deleting first, and PITR can only reach back 6 hours — so the
  snapshot becomes the only durable recovery point and the reset should follow its creation
  promptly.
- Paid plans allow 100 manual snapshots and a 1–30 day window, which removes that pressure.

**Alternative (equally acceptable):** instead of a snapshot, create a **branch** from the current
head of `br-long-frog-assrohg5` named `fv-pre-reset-20261003`. A branch is a valid recovery point
and is cheap (copy-on-write). Either satisfies FV-1 — tell me which you created.

---

## 4. Verification — Hermes verifies, does not trust creation

After you report the identifier, Hermes verifies the recovery point actually contains the expected
state rather than assuming the console succeeded. Two levels:

**4a. Existence + metadata (requires only what you report):** name/ID, source branch
`br-long-frog-assrohg5`, creation timestamp at or after the pre-reset baseline read, and that it is
listed as complete.

**4b. Content verification (the real proof).** A recovery point is only proven by reading from it.
Restore it to a **new, separate branch** — never over Production — attach a compute, and run the
same fingerprint queries used for the baseline. Expected on the restored branch:

```sql
-- Run against the RESTORED branch, not Production.
SELECT count(*) FROM users;                 -- 2
SELECT count(*) FROM review_events;         -- 97
SELECT count(*) FROM card_schedules;        -- 31
SELECT count(*) FROM cards;                 -- 35
SELECT count(*) FROM revoked_sessions;      -- 7
SELECT version||'|'||checksum FROM schema_migrations ORDER BY version DESC LIMIT 1;
-- 0023_learning_persistence|ef364bd54dae164a28975d0c8e3f88ddf077aa8bdaeff6abd7321cd3eebc9b4e

-- Mona (must be present with full pre-reset state)
SELECT count(*) FROM review_events                  WHERE user_id='b4efb0a4-d829-4f33-b686-0f498fbef62c'; -- 39
SELECT count(*) FROM card_schedules                 WHERE user_id='b4efb0a4-d829-4f33-b686-0f498fbef62c'; -- 15
SELECT count(*) FROM learner_daily_plans            WHERE user_id='b4efb0a4-d829-4f33-b686-0f498fbef62c'; -- 1
SELECT count(*) FROM learner_reconciliation_cursors WHERE user_id='b4efb0a4-d829-4f33-b686-0f498fbef62c'; -- 1

-- Bahram control digest must equal the approved value
SELECT md5(
       coalesce((SELECT md5(string_agg(t::text,'|' ORDER BY t.id))      FROM review_events t                  WHERE t.user_id='451b0433-7204-44e9-957f-250cac59e28e'),'-')
||'/'||coalesce((SELECT md5(string_agg(t::text,'|' ORDER BY t.card_id)) FROM card_schedules t                 WHERE t.user_id='451b0433-7204-44e9-957f-250cac59e28e'),'-')
||'/'||coalesce((SELECT md5(string_agg(t::text,'|' ORDER BY t.user_id)) FROM learner_reconciliation_cursors t WHERE t.user_id='451b0433-7204-44e9-957f-250cac59e28e'),'-')
);  -- f6f477b2f42a957a15092871655eb277

-- catalog fingerprint
SELECT md5(string_agg(t::text,'|' ORDER BY t.id)) FROM cards t;  -- 8cd0abc62c29f6d3c83574d8e7bd8e2d
```

If the restored branch reproduces every value, the recovery point is **proven**. Delete the
verification branch afterwards to avoid branch-count charges.

Neon caveat that affects rollback planning: **PITR is not supported on a branch created from a
snapshot restore.** So the restore path for this recovery point is snapshot-restore, not
PITR-on-top-of-restore. PITR directly on `br-long-frog-assrohg5` remains available independently,
bounded by the history window.

---

## 5. Secondary evidence — logical COPY (TAKEN, read-only)

Captured read-only on the Production host; row counts re-verified unchanged after
(`total_ev=97`). **Secondary only — does not replace §3/§4.**

Location (Production host): `/home/ubuntu/learnbox/evidence/fv-recovery-gate-20261003T201213Z/`

| File | Rows | md5 |
| ---- | ---- | --- |
| `mona_review_events.csv` | 39 | `a4bf65120d19d72d89e6e605d0580ff7` |
| `mona_card_schedules.csv` | 15 | `2eba74ab48e301dae63ced3bd234eea0` |
| `mona_learner_daily_plans.csv` | 1 | `c7ef63b14b003c444668b48a641ad500` |
| `mona_learner_reconciliation_cursors.csv` | 1 | `ea16c448b52f89f1d543566446f367d5` |
| `mona_review_event_rejections.csv` | 0 | `f5efdefde4eb65d86e8564c9975505bf` |
| `mona_mobile_learner_sessions.csv` | 0 | `1fd47d652cd56131d796a0c32ebb8a2f` |
| `bahram_review_events.csv` | 58 | `076e03770bf43b2e0377266c31858081` |
| `bahram_card_schedules.csv` | 16 | `d6e29302cbd96a29110251d459553397` |
| `bahram_learner_reconciliation_cursors.csv` | 1 | `39134f462567cb85567df1c43a638a56` |

Manifest: `MANIFEST.md5` = `941110c8fa3af1cae706625703e72cab`

Why it is not equivalent: CSV restores need `INSERT` privileges the app role lacks on two of the six
tables, it carries no sequence/visibility state, and re-inserting rows would fabricate history
rather than restore it.

---

## 6. Recovery point record (fill at creation time)

| Field | Value |
| ----- | ----- |
| Recovery point identifier/name | `__________` (owner reports) |
| Type | snapshot \| branch (owner reports) |
| Source project | `divine-silence-09471885` |
| Source branch | `br-long-frog-assrohg5` (root) |
| Source endpoint | `ep-jolly-hill-asbffbzx` |
| Creation timestamp (UTC) | `__________` |
| Plan / history window | `__________` |
| Schema/migration state | 23 applied, head `0023_learning_persistence`, checksum `ef364bd5…9b4e` |
| Schema fingerprint | `0348784c84461e1bb7068411a8d33bcf` |
| Learner counts | `users=2 review_events=97 card_schedules=31 learner_daily_plans=1` |
| Mona baseline | 39 / 15 / 1 / 1 / 0 / 0 |
| Bahram baseline | 58 / 16 / 1; digest `f6f477b2f42a957a15092871655eb277` |
| Bahram xmin evidence | events `b9b103fa7525cc76a332ceac1bc3ec25`, schedules `a733156634d5c6c24fdefa05874d2e8d` |
| Catalog fingerprint | `cards` 35, md5 `8cd0abc62c29f6d3c83574d8e7bd8e2d` |
| `revoked_sessions` | 7, md5 `6c89b1a2ed6caab532d69030aab8a0be` |
| Restore capability verified | §4b run on a restored branch: PASS / FAIL |

---

## 7. What happens next (not authorized yet)

1. Owner creates the recovery point (§3) and reports the identifier.
2. Hermes verifies it (§4) — including content verification on a restored branch.
3. Hermes re-reads live Production and compares against the approved baseline. **Any drift → STOP
   and report; expected values are never rewritten to make the reset pass.**
4. Hermes presents the final destructive-operation gate (recovery point, live-vs-approved baseline,
   exact transaction, per-table row counts, assertions, post-COMMIT verification, Bahram isolation
   proof, Mona retention proof, catalog/auth/revoked proof, recovery procedure).
5. **Owner explicitly approves. Only then does the transaction run.**

No device test starts automatically. Scheduler V2 stays absent/OFF, flags unchanged, grants
unchanged, no deploy.
