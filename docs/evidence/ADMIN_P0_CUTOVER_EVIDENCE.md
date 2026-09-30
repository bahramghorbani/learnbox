# Admin P0 (LB-B30–B33) Production credential/least-privilege cutover: evidence

Executed 2026-09-30. Source of record: **`e601d8a118ec915d1a3c18cca7fb018025ad9a1c`** (PR #326 merge
commit on `main`). Validated candidate was `f44092a…`; `5ddc5c8` is retired. Raw evidence (mode 700,
not in Git): VPS `/home/ubuntu/learnbox/evidence/p0-cutover-20260930T173506Z/`.

## Outcome

- Learner `DATABASE_URL` moved from the owner DSN to the `learnbox_app` role. **Image and source
  unchanged** (v1.2.1, `sha256:5370578d187c`, `4ade0a8…`). Only that one `.env` line changed.
- Admin runs the merged-SHA image with role `learnbox_admin` and legacy routes disabled, **and stays
  contained**: Caddy answers 404 for `admin.learnboxapp.com`; the Vercel Admin preview stays paused.
- The Admin is **not approved for public exposure**. See "Exposure gate".

## Sequence and evidence

| Step                                                   | Result                                                                                                                                                                                       |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Merged tree vs validated candidate                     | Two runtime files differ (unused-variable/import removal). Dockerfile, compose, lockfile, packages and migrations are byte-identical.                                                        |
| Staging gates rerun on merged image                    | Anonymous 93/93, authenticated 48/48 (staging configuration).                                                                                                                                |
| Step 0 recovery checkpoint                             | Fresh dump `prod-pre-p0.dump` (checksum verified) restored to a throwaway DB: 38/38 tables, row counts, FKs, indexes, ledger `0022` and content hashes match.                                |
| Role SQL on Neon                                       | `db-roles-p0.sql` applied additively in one transaction; rehearsed first on a Neon-shaped non-superuser restore. Row counts unchanged afterwards.                                            |
| Role passwords                                         | Set only through the owner's terminal script (`set-role-passwords.sh`); stored only as SCRAM verifiers in the DB and plaintext once in `secrets/db-roles.env` (600, 700 dir). Never in chat. |
| Role proof on Neon, before any switch                  | Each role's own login: positive and negative permission checks (`role-live-check.sql`, always rolled back). The checker was first proven to fail on an injected over-grant.                  |
| Backup job                                             | Checked under the new roles; a post-role backup was taken and checksummed.                                                                                                                   |
| Learner switch                                         | Rollback image tag `rollback-pre-p0-dsn-5370578d187c` and `.env.bak-pre-p0-dsn` made first. Container recreated, healthy, 0 restarts.                                                        |
| Learner regression/security matrix (Production, HTTPS) | **79 PASS, 0 FAIL** (second run; see "Matrix history").                                                                                                                                      |
| Admin provenance                                       | SHA → OCI label → image ID `f9f117bb…` → running `ADMIN_SOURCE_SHA` all `e601d8a…`; built from a clean `git archive` (sha256 `58589cd0…`, no `.git`).                                        |
| Admin bundle identity                                  | 40 static client assets and 28 server route files identical to the validated image.                                                                                                          |
| Admin role at runtime                                  | Container connects as `learnbox_admin`; `DROP`, `TRUNCATE`, `CREATE`, deletes on `review_events` and on `account_deletion_events` are denied (42501).                                        |
| Logs                                                   | 0 permission/error lines in either container after the switch.                                                                                                                               |

## Admin anonymous matrix on Production: 60/93, not 93/93

Run against the Production Admin container (internal network) in its **deliberately disabled
configuration** (`LEARNBOX_ADMIN_PASSKEY_ENABLED=false`, `…_CONTENT_REVIEW_ENABLED=false`,
`…_BOOTSTRAP_ENABLED=false`, `ADMIN_LEGACY_ROUTES_DISABLED=true`).

- **Result: 60 PASS / 33 FAIL. This is not a 93/93 pass and must never be recorded as one.**
- All 33 mismatches are status-code differences: the harness expects guard statuses (403, 400, 415, 401) from routes that, with the feature disabled, answer 404. They cover the passkey-verify,
  logout and content-review check/decision routes plus four guard-ordering assertions.
- Observed, and passing: no card content in the anonymous HTML or JS chunks; `/api/banners` and
  `/api/packs` fail closed; every response is `no-store`; no unexpected public route and no 200 on any
  non-shell route.
- **Not proven in this configuration:** Origin → Content-Type → session guard ordering. That ordering
  is proven only on the staging image (93/93 and 48/48), not on Production.

The passkey and content-review flags were intentionally **not** enabled to satisfy the matrix.

## Exposure gate (required before Admin is ever public)

A separate owner-approved gate, run on the **exact configuration intended for public operation** and
the actual Production candidate image, must prove: the full Origin/Content-Type/session guard order on
every mutating route; anonymous and authenticated behaviour; no leak or caching defect; protected
media unaffected. Until that passes and the owner approves, Admin stays behind the Caddy 404 and the
Vercel preview stays paused.

## Reconciliation of P0 test writes since Step 0

Row counts were identical to Step 0 through the dump, role creation and role live checks
(`row-counts-after-dump/-roles/-live-check` all equal `row-counts-before`). The only differences
afterwards are `review_events` 76 → 78 and `revoked_sessions` 3 → 7. Attribution from the rows
themselves (timestamps `applied_at` / `revoked_at`, all after 17:35Z):

| Rows                  | Time (UTC, 2026-09-30) | Written by                                 | Subject                       |
| --------------------- | ---------------------- | ------------------------------------------ | ----------------------------- |
| `review_events` +1    | 17:58:59               | Learner regression matrix **run 1**        | synthetic user `b4efb0a4…`    |
| `review_events` +1    | 17:59:44               | Learner regression matrix **run 2**        | synthetic user `b4efb0a4…`    |
| `revoked_sessions` +2 | 17:59:01               | run 1: the two logouts the matrix performs | `b4efb0a4…` (two session ids) |
| `revoked_sessions` +2 | 17:59:45               | run 2: the two logouts the matrix performs | `b4efb0a4…` (two session ids) |

- **Correction:** I earlier guessed the extra rows came from the Step 1 and Admin-role live checks.
  That is wrong. Those checks ran in rolled-back transactions and the counts after them equal Step 0.
  The cause is that the matrix ran twice, because the first run had 3 faulty assertions (below), and
  each run writes one review event and two revocations by design.
- Each run's own delta was exactly +1 review and +2 revocations; two runs give +2 and +4.
- No row of the owner account `451b0433…` was written (0 owner `review_events` after 17:35Z; owner
  row, schedule and review hashes identical before and after). `user_session_cutoffs` has no rows
  touched; `account_deletion_events` is untouched; the 3 baseline revocations remain.
- The rows were **not** deleted and must not be: they are the synthetic user's real, correctly
  attributed records. Future counts should be compared against this table, not against Step 0.
- Event ids (run 1 `34f44867…`, run 2 `337a2d05…`) are in the raw evidence directory.

## Matrix history (no hidden reruns)

Run 1 scored 76 PASS / 3 FAIL. All three were wrong assertions in the harness, not application
faults: `/api/auth/session` answers `200 {"authenticated":false}` by design (I asserted 401, twice),
and `invalid_avatar` came from sending a placeholder avatar id. The harness was corrected and run 2 is
79/0. Both outputs are kept in the raw evidence directory.

## Rollback (kept)

`learnbox-app:rollback-pre-p0-dsn-5370578d187c`; learner and Admin `.env.bak-pre-p0-*` and
`compose.yaml.bak-pre-p0-admin`; Admin image tags `evidence-d4f39bfc` and
`evidence-pre-p0-20260930T1800Z`; the Step 0 dump and its checksum; earlier v1.2.1 backup and v1.2.0
rollback image. Rolling back the learner credential is one `.env` line plus a container recreate.

## Committed tooling

`infrastructure/production/p0-cutover/`: `set-role-passwords.sh`, `scram_verifier.py`,
`role-live-check.sql`, `learner-regression-matrix.mjs`. None contains a secret.
