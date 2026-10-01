# Release provenance reconciliation — 2026-10-01

Read-only. No tag was moved, deleted or recreated; Production was not changed.

## Tag → commit map (from Git, `git ls-remote --tags` and `git rev-parse <tag>^{commit}`)

| Tag      | Tag object (annotated) | Commit                                     | Commit subject                                             | GitHub Release |
| -------- | ---------------------- | ------------------------------------------ | ---------------------------------------------------------- | -------------- |
| `v1.0.0` | `cc292cf1…`            | `2acdcef4bc4e06c020f08de1fd16e4fbad2e1ea3` | content(start): canonicalize Starter media to 35/35 …      | yes            |
| `v1.1.0` | `47b460dc…`            | `46cc45e24bfd54fc1f3f23dd0429c2d4ebb3744f` | build(release): record source commit provenance in the app | **none**       |
| `v1.2.0` | `ec21db44…`            | `468f05463df94cf47e088960640c2b6b95f0e370` | feat(profile): v1.2 profile integration (#319)             | yes            |
| `v1.2.1` | `52ec6daf…`            | `4ade0a885fa93a418db8cde94b81a206bcd80860` | Merge pull request #322 (LB-B29 mutation guard)            | yes            |

All four tags are annotated; all four target commits are ancestors of `main`; `2acdcef4` is also an ancestor of `46cc45e`.

## Findings

- **`v1.0.0 → 2acdcef4` is correct.** It matches `PROJECT_STATE.md`, `docs/PRODUCT_STATUS.md`, `BACKLOG.md` and `V1_1_SCOPE_ANALYSIS.md`.
- **`46cc45e` belongs to `v1.1.0`**, not `v1.0.0`. It matches `CHANGELOG.md` (v1.1.0 entry) and `CURRENT_WORK.md`. The earlier working note pairing `46cc45e` with `v1.0.0` was a note error, not a repository error. No repository document carried it, so no repository correction was needed.
- **`v1.1.0` has no GitHub Release object** (`gh release view v1.1.0` → not found); only the annotated tag exists. Current-state documents claim a GitHub Release only for `v1.0.0`, `v1.2.0`, `v1.2.1`, so they are accurate. Not changed.
- **Tag-object vs commit SHA:** `git ls-remote` shows the tag object first and the peeled commit on the `^{}` line. The commit, not the tag object, is the release identity.

## Production container check (read-only, 2026-10-01 11:04 UTC, host `learnbox-prod-01`)

The earlier check was inconclusive because the container filter matched `learner`; the container is `learnbox-app-production-app-1`.

- Learner: image `sha256:5370578d187c`, started 2026-09-30T17:57:14Z, restarts 0, healthy; `APP_SOURCE_SHA` and OCI revision both `4ade0a885fa93a418db8cde94b81a206bcd80860` (= `v1.2.1`).
- Admin: image `sha256:f9f117bb46b6`, restarts 0, healthy, OCI revision `e601d8a118ec915d1a3c18cca7fb018025ad9a1c`; still contained (Caddy 404).
- Production DB (read-only transaction, rolled back): `review_events` has none of the CP4 columns (`response`, `engine_version`), `users.timezone` is absent, and `learner_daily_plans` and `review_event_rejections` do not exist. **Migration `0023` is not applied to Production.**
- A direct `schema_migrations` read was denied for the app role (SQLSTATE 42501, expected for the least-privilege `learnbox_app` DSN); the schema probes above are the evidence instead.
