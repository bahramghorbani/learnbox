# Admin Production status

**As of 2026-10-09.** Canonical operational truth for the Production Admin panel at
`https://admin.learnboxapp.com`. Learner deployment truth stays in
`docs/release/LEARNER_DEPLOY_FA44D21.md`; schema/migration truth in
`docs/release/PRODUCTION_SYNC_0024_0032_EXECUTION.md`; capability inventory in
`docs/PRODUCT_STATUS.md`.

Every row below carries one of five states, and they are not interchangeable:

| State           | Means                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------ |
| **IMPLEMENTED** | Code exists on `main` and is tested in CI. Says nothing about Production.                  |
| **MERGED**      | On `main`, but the running Production artifact predates it.                                |
| **DEPLOYED**    | The running Production image contains it and its flag is on.                               |
| **VERIFIED**    | Exercised **through an authenticated owner session or a real-database test** and observed. |
| **BLOCKED**     | Cannot operate until a named credential, privilege or authorization arrives.               |

A `401` from an anonymous probe, a green CI run and a healthy container are **not** verification.
They prove the boundary, the code and the process — not the capability.

## 1. Baseline (recorded before any change in this task)

> Superseded on 2026-10-09T20:44Z by the executed release: Production now runs Admin image
> `sha256:a6a7e3a4a01374684468d911f191f9c17c50040f4f09ed84ce1273e4c81d8e4d`
> (revision `8631565a`), schema head is `0033_admin_content_management_grants`, and
> `LEARNBOX_ADMIN_CONTENT_PACKS_MANAGE_ENABLED=true`. The table below is kept as the pre-release
> baseline; the execution record is `docs/release/ADMIN_RELEASE_0033_8631565.md`.

| Item                | Value                                                                                                                                                                                                 |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Admin image         | `sha256:1ad7033a8f3f7bc85f578a80fd8bb4bbb7048d5d1859471b6b0b7f639395d37d`                                                                                                                             |
| Admin revision      | `org.opencontainers.image.revision=fa44d21a0e0604960becd66a8ab6e2d935911700`                                                                                                                          |
| Admin container     | `learnbox-admin-production-admin-1`, started `2026-10-09T18:09:13Z`, healthy, restarts `0`                                                                                                            |
| Learner image       | `sha256:65cd79695c1c0352c49e5c2b69d7c31be058ac034f26a4355390c45bf0e7c495` (`fa44d21`)                                                                                                                 |
| Learner container   | started `2026-10-09T14:33:02Z`, healthy, restarts `0`, `/api/health` `200`                                                                                                                            |
| Schema              | ledger `32`, head `0032_role_grant_repair`, `45` tables                                                                                                                                               |
| Owner binding       | `admin_owner.user_id = 451b0433-…`, `admin_role_assignments = super_admin`                                                                                                                            |
| Passkey credentials | 1 (`singleDevice`, registered 2026-09-24)                                                                                                                                                             |
| Required CI         | `quality`, `secrets`, `mobile`, `production-stack`                                                                                                                                                    |
| Rollback artifacts  | `.env.bak-pre-capabilities-…`, `.env.bak-pre-passkey-…`, `compose.yaml.pre-passkey`, `compose.yaml.pre-fa44d21`, images `sha256:e1aecf51…` and `sha256:f9f117bb…`, `Caddyfile.pre-admin-activation-…` |
| Database rollback   | Neon history retention is **6 hours** — point-in-time recovery is NOT a substitute for a pre-change branch snapshot                                                                                   |

Production data fingerprint, unchanged across capability activation: `users=2`, `packs=1`,
`cards=35`, `card_versions=35`, `banners=3` (`1` active, `banner_sample3`), `splash_versions=1`,
`review_events=149`, `card_schedules=31`, `purchase_events=0`, `store_listings=0`, `user_packs=0`.

## 2. Authentication — VERIFIED

Passkey sign-in works and is the only door. Evidence, from the Production database rather than from
the browser: `admin_passkey_credentials.last_used_at = 2026-10-09T18:18:57Z` against the credential
enrolled on 2026-09-24, with live rows in `admin_sessions`. Sessions are stored in the database, so
they survived four `--force-recreate` cycles during capability activation — the owner stayed signed
in. Anonymous probes remain `401` on every API route and the UI serves the Passkey login page.

Bootstrap enrollment is closed by three independent layers: `LEARNBOX_ADMIN_BOOTSTRAP_ENABLED=false`,
no `LEARNBOX_ADMIN_BOOTSTRAP_SECRET` in the environment, and an existing active credential.
`/api/admin/bootstrap/options` answers `404` externally.

`LEARNBOX_ADMIN_TOKEN_HASH_KEY` is present in the Admin environment as required. It was read into an
operator session transcript during this task; rotating it at the next Admin deployment is cheap (new
key, owner signs in again) and is recorded as a follow-up, not an incident — the key never left the
operator machine or the server.

## 3. Confirmed defects and their resolutions

### 3.1 Store transactions read a table that does not exist — FIXED, MERGED, not deployed

`apps/admin/lib/server/postgres-admin-payments-store.ts` resolved admin roles from
`admin_user_roles`. The canonical table is `admin_role_assignments` (migration `0021`, enum
`admin_role`). Reproduced against the live database as the real `learnbox_admin` role:

```
payments_role_resolution = ERR 42P01 relation "admin_user_roles" does not exist
store_role_resolution    = super_admin      # same actor, correct table
```

Both Store capabilities route through the same private `hasRole()`, so `/api/store/transactions` and
`/api/store/payment-config` failed together and one line fixed both. No data was exposed: the query
threw before reading a row.

Fixed in PR #394, merged as `f5c27a08f9173407fa449eb84b36da38300d2be7`, 4/4 required checks green on
the reviewed head `853cab23`, merged files byte-identical to the reviewed blobs. Regression coverage:
`apps/admin/test/admin-payments-store-db.test.ts` runs the real store against a real Postgres with
every migration applied — the existing payments tests used a fake client that answered any SQL, which
is exactly why a missing table shipped. Removing the fix makes the suite fail with `42P01`.

**The running Admin image predates this fix.** Store transactions stay broken in Production until an
Admin deployment is authorized.

### 3.2 Admin content management had no database privileges — MIGRATION MERGED, not applied

The content workspace (create pack, create/edit card, associate, submit for review, publish, archive,
import) is implemented and deployed, but `learnbox_admin` held `SELECT` only on the content tables.
Reproduced live, zero-row statements inside a rolled-back transaction: `packs` status `UPDATE`,
`cards` `INSERT` and `pack_cards` `INSERT` all `DENIED 42501`. Enabling the manage flag without the
grant would have turned every content mutation into a `500` at the first write.

`database/migrations/0033_admin_content_management_grants.sql` (PR #395, merged as
`8631565ac4b7d408d6dd87a2a2011ea621262f2c`, 4/4 required checks green on the reviewed head
`88e0b74d`) grants exactly what shipped statements need:

| Table           | Verb                                                                 |
| --------------- | -------------------------------------------------------------------- |
| `packs`         | `INSERT`; `UPDATE (status, published_at)`                            |
| `cards`         | `INSERT`; `UPDATE (lemma, content_version)`                          |
| `card_versions` | `INSERT`; `UPDATE (content_json, source_provider, source_reference)` |
| `pack_cards`    | `INSERT`                                                             |

Not granted, deliberately: no `DELETE` on any content table (content is retired by status), no
`UPDATE` on `packs.price_tomans` or `packs.is_free` (pricing is an owner decision with no Admin write
path), no `UPDATE` on `cards.content_id` (the learner media/review key), no `TRUNCATE`, `REFERENCES`,
`TRIGGER`, ownership, schema `CREATE` or sequence privilege, and nothing for `learnbox_app`. The
Admin role still cannot write `review_events` or `card_schedules`, so learner progress remains
untouchable from Admin.

The migration is a guarded, idempotent `DO` block with a self-verification block that raises if a
required grant is missing **or** a forbidden one is present. Regression coverage in
`apps/website/test/db-role-grant-matrix-db.test.ts`: the whole lifecycle runs as the restricted role
(create → edit → `needs_review` → `published` → `archived`), and the denial list pins
`price_tomans`, `is_free`, `content_id`, `DELETE` on all four content tables and learner-progress
writes. Removing the grants fails the suite with `permission denied for table packs`.

**Production is at head `0033`.** Applied 2026-10-09T20:37Z under owner authorization; verified after
the apply: `packs INSERT = true`, `packs.status UPDATE = true`, `cards INSERT = true`,
`packs.price_tomans UPDATE = false`, `DELETE = false` on all four content tables, and
`learnbox_admin` still cannot write `review_events` or `card_schedules`. Data unchanged (12 counts
and 8 `xmin` digests identical). Full record: `docs/release/ADMIN_RELEASE_0033_8631565.md`.

### 3.3 Pre-existing, found while verifying — not fixed here

- `infrastructure/database/db-roles-p0-proof.sql` is a manual runbook script, not a CI check, and its
  expectation matrix is about nine tables behind migrations `0019`–`0032` (`ai_generation_jobs`,
  `card_media_*`, `banners` write verbs, `store_listings`, `user_packs`, `user_session_cutoffs`,
  `users.status`, learner `purchase_events`/`learner_daily_plans`), so it reports `FAIL` on `main`
  today. `0033`'s own grants are declared in it. Refreshing the rest is a separate chore; the
  authoritative checks are the migration's self-verification and the grant-matrix suite in CI.
- `apps/admin/lib/server/database-splash-storage.ts` has **no importers**. It keeps pending upload
  bytes in a module-level `Map` and needs a manual flush call that nothing makes, so wiring it as-is
  would lose bytes across processes. Treat it as dead code, not as the no-credential splash path.
- The Admin environment contains `ADMIN_LEGACY_ROUTES_DISABLED=true`, which no code reads. The real
  switch is `legacyAdminRoutesEnabled()`: legacy routes are hard-closed in any `NODE_ENV=production`
  build whatever the environment says, and the opt-in key is `LEARNBOX_ADMIN_LEGACY_ROUTES_ENABLED`.
  The stray key is inert, and the routes are fail-closed either way — no action required.

## 4. Production Admin feature flags (current)

| Flag                                            | Value   | Effect                                                      |
| ----------------------------------------------- | ------- | ----------------------------------------------------------- |
| `LEARNBOX_ADMIN_PASSKEY_ENABLED`                | `true`  | Passkey authentication required                             |
| `NEXT_PUBLIC_LEARNBOX_ADMIN_PASSKEY_UI_ENABLED` | `true`  | Passkey login UI compiled into the image                    |
| `LEARNBOX_ADMIN_BOOTSTRAP_ENABLED`              | `false` | Enrollment closed                                           |
| `LEARNBOX_ADMIN_SUPPORT_ENABLED`                | `true`  | Users and Support                                           |
| `LEARNBOX_ADMIN_CONTENT_PACKS_ENABLED`          | `true`  | Content and Packs — read                                    |
| `LEARNBOX_ADMIN_CONTENT_REVIEW_ENABLED`         | `true`  | Content review workspace                                    |
| `LEARNBOX_ADMIN_PRESENTATION_ENABLED`           | `true`  | Slider and splash authoring surface                         |
| `LEARNBOX_ADMIN_STORE_ENABLED`                  | `true`  | Store administration (no payment path)                      |
| `LEARNBOX_ADMIN_CONTENT_PACKS_MANAGE_ENABLED`   | `true`  | Content mutations on since 2026-10-09T20:44Z (after `0033`) |
| `LEARNBOX_ADMIN_CONTENT_AI_ENABLED`             | absent  | AI pack generation off                                      |
| `LEARNBOX_ADMIN_MEDIA_AI_ENABLED`               | absent  | AI media generation off                                     |
| `LEARNBOX_ADMIN_SPLASH_REPLACEMENT_ENABLED`     | absent  | Splash replacement off                                      |
| `LEARNBOX_ZARINPAL_ENABLED`                     | absent  | No payment initiation, no merchant id in the environment    |

`LEARNBOX_ADMIN_ORIGIN` and `LEARNBOX_ADMIN_RP_ID` are pinned to `admin.learnboxapp.com`.

## 5. Capability matrix

| Capability                                 | State                 | Basis                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------ | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Passkey authentication, session security   | **VERIFIED**          | Real owner sign-in recorded in `admin_passkey_credentials`/`admin_sessions`; sessions survive container recreation; anonymous `401`; bootstrap `404`                                                                                                                                                                                                  |
| Users and Support                          | **DEPLOYED**          | Flag on, routes answer `401` anonymously; column grants verified (`users.status` writable, `users.phone_e164` `DENIED 42501`); owner reviewed the interface without a blocking finding. Not VERIFIED: no authenticated per-route response captured as evidence                                                                                        |
| Content and Packs — read                   | **DEPLOYED**          | Flag on; Admin reads the same canonical rows the learner serves (`packs=1`, `cards=35`, `card_versions=35`, `pack_cards=35`) as `learnbox_admin` on the same Neon endpoint                                                                                                                                                                            |
| Content review workspace                   | **DEPLOYED**          | Flag on; `content_review_decisions` `INSERT` and `card_versions.status` `UPDATE` verified present                                                                                                                                                                                                                                                     |
| Content lifecycle (publish/archive/import) | **DEPLOYED**          | `0033` applied 2026-10-09T20:37Z and the manage flag on at `20:44Z`; the eight granted verbs ALLOWED and the seven forbidden ones DENIED as `learnbox_admin` in a rolled-back zero-row transaction; write routes left `404` and now answer `401` with a trusted Origin, `400` cross-origin. Not VERIFIED: no authenticated lifecycle run captured yet |
| Presentation and slider                    | **DEPLOYED**          | Flag on; `banners` `INSERT`/`UPDATE` verified in a rolled-back transaction; real-database suite green (14 tests)                                                                                                                                                                                                                                      |
| Splash management                          | **BLOCKED**           | Needs `BLOB_READ_WRITE_TOKEN`; see §6                                                                                                                                                                                                                                                                                                                 |
| Store listings (administration)            | **DEPLOYED**          | Flag on; `store_listings` `INSERT`/`UPDATE` verified; catalogue currently empty                                                                                                                                                                                                                                                                       |
| Store transactions / gateway status        | **DEPLOYED**          | #394 live since 2026-10-09T20:42Z in image `sha256:a6a7e3a4…` (`admin_user_roles` absent from the artifact); the fixed query executes as the real `learnbox_admin` role in Production and returns rows instead of `42P01`. Not VERIFIED: no authenticated page load captured yet                                                                      |
| Payments / Zarinpal                        | **BLOCKED**           | No merchant id, flag absent, `purchase_events` is `SELECT`-only for Admin. Deliberately inactive                                                                                                                                                                                                                                                      |
| AI content management                      | **BLOCKED**           | Needs `LEARNBOX_AI_API_KEY`; see §6                                                                                                                                                                                                                                                                                                                   |
| AI media generation                        | **BLOCKED**           | Needs the same key; see §6                                                                                                                                                                                                                                                                                                                            |
| Audit logging                              | **IMPLEMENTED**       | Write path proven in the real-database suites (every slider mutation writes `audit_logs` in the same transaction). Production holds `1` row from 2026-09-25; no new Admin mutation has occurred, so there is nothing newer to show                                                                                                                    |
| Legacy prototype routes                    | **DEPLOYED (closed)** | `legacyAdminRoutesEnabled()` is false in any production build; `/api/users`, `/api/packs`, `/api/gateways`, `/api/transactions` answer `404`                                                                                                                                                                                                          |

Canonical-data equivalence is established: the Admin container's own connection reports
`current_user = learnbox_admin` on the same Neon endpoint and database as the learner, and the rows
it reads (`start-a1-apfel` / `Apfel`, pack `LearnBox Start — German A1 Essentials`, active slide
`banner_sample3`, the single splash version) are the rows the learner serves.

## 6. Remaining external credential dependencies

| Capability                                 | Exact missing dependency                                                                      | Owner action                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------ | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AI content management, AI media generation | `LEARNBOX_AI_API_KEY` (Anthropic API key; `ANTHROPIC_API_KEY` is accepted as a fallback name) | Provide an Anthropic API key for the Admin environment. The implementation is provider-specific (`x-api-key`, `anthropic-version`); no substitute provider exists and none may be invented. Without the key the capability reports `provider_not_configured` instead of failing                                                                                                                 |
| Splash management                          | `BLOB_READ_WRITE_TOKEN` (Vercel Blob read-write token, minimum 20 characters)                 | Provide the read-write token for the existing Blob store. The learner environment carries `BLOB_STORE_ID` but no read-write token, so the store is referenced but not writable from either app. The database-backed alternative in the tree is dead code (§3.3) and switching splash to database bytes would also change the learner delivery path — that is new development, not configuration |

No new paid subscription is implied by either row: both are credentials for services the
architecture already names.

## 7. Prerequisites for the next Production changes

### 7.1 Applying migration `0033` (needs owner authorization)

1. Take a Neon branch snapshot of `main` immediately before applying. Neon history retention is six
   hours, so point-in-time recovery is not a dependable rollback for a change reviewed later.
2. Apply as `neondb_owner` with the repository runner, from `main` at `8631565a` or later.
3. Expected result: ledger `33`, head `0033_admin_content_management_grants`, `45` tables (no DDL,
   no data change — grants only). The migration self-verifies and raises if a required grant is
   missing or a forbidden one present.
4. Confirm after apply: `has_table_privilege('learnbox_admin','packs','INSERT') = true` and
   `has_table_privilege('learnbox_admin','packs','DELETE') = false`.
5. Rollback: the four `REVOKE` statements listed in the migration header. Nothing to restore.

### 7.2 Deploying the Admin image (needs owner authorization)

1. Build from `main` at `8631565a` with
   `--build-arg NEXT_PUBLIC_LEARNBOX_ADMIN_PASSKEY_UI_ENABLED=true` and
   `--build-arg ADMIN_SOURCE_SHA=<sha>`. Omitting the first argument silently removes the Passkey
   login UI from the image.
2. Verify `org.opencontainers.image.revision` on the built image equals the intended commit, then
   pin `compose.yaml` to the digest, never to a tag.
3. Preserve: `.env` as it stands (Passkey on, bootstrap off, payments absent), the Caddy
   `import admin_app` block, the learner stack, `banner_sample3` as the only active slide, the single
   splash version.
4. Rollback: `compose.yaml.pre-passkey` with image `sha256:1ad7033a…` (current) or
   `sha256:e1aecf51…` (pre-Passkey), both retained on the host.
5. After deployment, verification means an authenticated owner session reaching
   `/api/store/transactions` and `/api/store/payment-config` with `200`, not container health.

### 7.3 Enabling content mutations (after 7.1 and 7.2)

Set `LEARNBOX_ADMIN_CONTENT_PACKS_MANAGE_ENABLED=true`, recreate the Admin container, then confirm
the lifecycle routes stop answering `404`. Publishing changes learner-visible curriculum, so the
first real publish should be a deliberate owner action on a chosen pack, not a smoke test.

## 8. Remaining operational limitations

- Store transactions and gateway status are broken in the **running** image (fix merged, not
  deployed).
- Content mutations are impossible until `0033` is applied; the flag is correctly absent.
- Splash replacement and both AI capabilities are credential-blocked.
- Payments are inactive and no real Zarinpal transaction has ever been performed.
- Device-level learner QA (OTP sign-in, a review round trip, progress persistence on a real phone)
  is still unperformed.
- The first unattended backup after the backup fix (`2026-10-10T02:32Z`) has not been observed.
- `price_tomans` has no Admin write path, by design; commercial configuration stays an owner action.
- Stuck-pending reconciliation: `store-purchase.ts` leaves a row `pending` on `verification_error`
  with no Admin reconciliation path. Irrelevant while payments are off; required before they are on.
- `learnbox_migrator` retains `INSERT` on 38 older tables and `CREATE` on `public` — vestigial
  breadth recorded in the role audit, unrelated to `0033`.
- No Admin deployment record PR exists yet; this document is the operational record until one does.

## 9. Planned, not started: Admin UI/UX redesign

Functional stabilization deliberately changed no interface. The redesign is a separate workstream
recorded in `BACKLOG.md` — professional dashboard layout, navigation and information architecture,
consistent Persian RTL, better tables/filters/forms, responsive desktop and mobile, clear status,
confirmation and error states, one visual design system. It must not be mixed into a defect fix.
