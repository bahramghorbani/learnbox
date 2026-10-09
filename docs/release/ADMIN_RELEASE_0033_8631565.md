# Admin Production release — migration `0033` and image `8631565`

Executed 2026-10-09 under explicit owner authorization (A: apply `0033`, B: deploy the Admin-only
fixes merged in #394/#395/#396, C: enable `LEARNBOX_ADMIN_CONTENT_PACKS_MANAGE_ENABLED` after A and B
succeed). The learner application was not redeployed, payments were not activated, no AI or Blob
credential was introduced, and no banner, splash, learner-progress or entitlement row was touched.

Everything below is a recorded observation. A healthy container and a `401` are not verification; the
privilege and data claims are each backed by a statement executed against the canonical Production
database.

## 1. Pre-flight baseline (before any change)

| Item                    | Value                                                                                                                                           |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Database                | `neondb` / `neondb_owner` / PostgreSQL `17.11`, project `divine-silence-09471885`, branch `main`                                                |
| Ledger                  | `32` rows, head `0032_role_grant_repair`, `0` rows at `0033`+                                                                                   |
| Tables                  | `45` in `public`, all owned by `neondb_owner`                                                                                                   |
| Checksum integrity      | `recorded=32 matched=32 mismatched=0` against the repo files at `1428614`                                                                       |
| Pending set             | exactly `0033_admin_content_management_grants`                                                                                                  |
| `0033` bytes            | `sha256:189add97818a240e035b9b5ac5e2e2360a293a8cc621b91a018a14664d368907`, identical to `origin/main`                                           |
| Default privileges      | `neondb_owner r/S → learnbox_migrator=r` (both rows present)                                                                                    |
| Backup-role readability | `unreadable_for_migrator = 0` across all objects in `public`                                                                                    |
| Content grants before   | `learnbox_admin` and `learnbox_app`: `SELECT` only on `packs`, `cards`, `card_versions`, `pack_cards`; every `INSERT`/`UPDATE`/`DELETE` `false` |
| Admin container         | image `sha256:1ad7033a…`, revision `fa44d21a`, started `2026-10-09T18:09:13Z`, healthy, restarts `0`                                            |
| Learner container       | image `sha256:65cd7969…`, revision `fa44d21a`, started `2026-10-09T14:33:02Z`, healthy, restarts `0`                                            |

Data fingerprint (counts and `xmin` digests, 12 tables / 8 digests): `users=2`, `cards=35`,
`card_versions=35`, `packs=1`, `pack_cards=35`, `review_events=156`, `card_schedules=31`,
`user_packs=0`, `purchase_events=0`, `banners=3`, `audit_logs=1`, `store_listings=0`.

Pre-existing condition, not caused by this release and not a stop condition: `learnbox-uptime-monitor`
has been logging `PROBLEM (1/2) Health endpoint reports degraded dependencies` intermittently since
2026-09-28 (388 occurrences, never reaching the 2-failure alert threshold). `/api/health` reported
`status: ok` with `database: ok` immediately before, during and after the window.

## 2. Backup, snapshot and rollback readiness

```
backup: ok file=learnbox-20261009T203501Z.sql.gz bytes=405340 tables=45 retained=12 pruned=0
        sha256=30d9d92ce15ce38b8b326c80607f61d8e6aa7719c161cbe17eb99e21a270a887
        unit=learnbox-backup.service Result=success ExecMainStatus=0
restore-drill: ok tables=45 users=2 cards=35 reviews=156 migrations=32
        archive=learnbox-20261009T203501Z.sql.gz target=disposable-container-only
        leftover containers: NONE
```

The archive was produced by the same systemd unit the nightly timer fires, and the drill restored
that exact archive into a disposable scratch database with no published ports. The restored counts
equal the live baseline.

Neon pre-change snapshot branch: `prod-pre-0033-20261009T2035Z` = `br-raspy-sun-asndzc7c`, parent
`br-long-frog-assrohg5` at `parent_lsn 0/AA380C8`, state `ready`. Verified on the snapshot itself:
`32` rows, head `0032_role_grant_repair`, `users=2 cards=35 review_events=156 tables=45`. This matters
because Neon history retention is 6 hours, so PITR alone is not a dependable rollback.

Rollback script (`REVOKE` × 4 plus the ledger row delete; `0033` changes no data and no schema) was
executed against the snapshot branch inside a rolled-back transaction before the apply, so the
rollback path is proven rather than asserted.

## 3. Apply

```
DATABASE_URL=<ephemeral owner DSN> node apps/api/dist/database/run-migrations.js
→ Database migrations complete; applied 1.
start 2026-10-09T20:37:34Z, end 20:37:45Z (11s), exit 0
```

The runner validates every recorded checksum before applying, so the 32 pre-existing migrations were
re-verified as a side effect. The owner DSN was minted on demand from the Neon control plane, lived
only in that process's environment, and was never written to the repository, the host or a log.

## 4. Ledger and privileges after

| Assertion                        | Result                                                                                                                                                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ledger                           | `33` rows, head `0033_admin_content_management_grants`                                                                                                                                                  |
| Recorded checksum of `0033`      | `189add97818a240e035b9b5ac5e2e2360a293a8cc621b91a018a14664d368907` = repo file                                                                                                                          |
| `learnbox_admin` `INSERT`        | `true` on `packs`, `cards`, `card_versions`, `pack_cards`                                                                                                                                               |
| `learnbox_admin` table `UPDATE`  | `false` on all four (column-level only, as designed)                                                                                                                                                    |
| `learnbox_admin` `DELETE`        | `false` on all four                                                                                                                                                                                     |
| `packs` column `UPDATE`          | `status` `true`, `published_at` `true`; `price_tomans`, `is_free`, `locale`, `id`, `display_name`, `description`, `category`, `target_cefr`, `target_item_count`, `ai_prompt`, `created_at` all `false` |
| `cards` column `UPDATE`          | `lemma` `true`, `content_version` `true`; `content_id` `false`, `id` `false`, `created_at` `false`                                                                                                      |
| Learner isolation                | `admin.review_events INSERT=false`, `admin.card_schedules UPDATE=false`, `admin.users DELETE=false`, `app.packs INSERT=false`, `app.cards UPDATE=false`                                                 |
| Backup-role readability          | `unreadable_for_migrator = 0`                                                                                                                                                                           |
| `pg_dump` as `learnbox_migrator` | `885692` bytes, **empty stderr** (host credential, byte count only, no archive written)                                                                                                                 |
| Tables                           | `45` (unchanged — `0033` creates nothing)                                                                                                                                                               |
| Data                             | 12 counts and 8 `xmin` digests **identical** to the pre-flight baseline                                                                                                                                 |

## 5. Deployment

The owner-preferred candidate digest was still present and valid, so nothing was rebuilt:

| Item                 | Value                                                                                                                                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Image                | `sha256:a6a7e3a4a01374684468d911f191f9c17c50040f4f09ed84ce1273e4c81d8e4d` (`learnbox-admin:8631565-store-fix`)                                                                                                |
| Revision label       | `org.opencontainers.image.revision=8631565ac4b7d408d6dd87a2a2011ea621262f2c` (= #395 merge commit)                                                                                                            |
| `ADMIN_SOURCE_SHA`   | `8631565ac4b7d408d6dd87a2a2011ea621262f2c`                                                                                                                                                                    |
| Source equivalence   | `git diff 8631565 1428614` = **4 documentation files, zero code**, so the image is code-identical to `main`                                                                                                   |
| Artifact-level proof | in the candidate image `/app/apps/admin/.next`: `admin_role_assignments` present in 4 files, `admin_user_roles` in **0**; in the previously running image the broken `admin_user_roles` is still present in 1 |
| Container            | started `2026-10-09T20:42:29Z` (recreated once more at `20:44:24Z` for flag C), healthy, restarts `0`, **no published ports**                                                                                 |
| Rollback artifacts   | `compose.yaml.pre-8631565-store-fix`, `.env.pre-manage-flag-20261009`, image `sha256:1ad7033a…` still on the host                                                                                             |

Preserved across the deployment: `LEARNBOX_ADMIN_PASSKEY_ENABLED=true`,
`NEXT_PUBLIC_LEARNBOX_ADMIN_PASSKEY_UI_ENABLED=true`, `LEARNBOX_ADMIN_BOOTSTRAP_ENABLED=false`,
origin and RP id pinned to `admin.learnboxapp.com`, the Caddy containment headers, and the
no-published-ports posture.

## 6. Flag activation (C) and content-management verification

`LEARNBOX_ADMIN_CONTENT_PACKS_MANAGE_ENABLED=true` was appended to `/home/ubuntu/learnbox/admin/.env`
only after §4 and §5 passed; the previous file is kept as `.env.pre-manage-flag-20261009`. The flag is
read server-side (`admin-content-packs-config.ts`), not a `NEXT_PUBLIC_*` build-time constant, so the
existing image honours it.

Route behaviour after activation — the write routes left their fail-closed `404` and now answer the
guard chain:

```
GET  /api/content/packs                 401   (was 401)
POST /api/content/packs                 404 → 401 with a trusted Origin and no session
POST /api/content/packs                 400 with a cross-origin Origin (trusted-origin guard, before auth)
POST /api/content/lifecycle/publish     400 cross-origin / guard chain live
GET  /api/auth/session                  401
/api/packs, /api/users (legacy)         404
admin.learnboxapp.com/                  200 (passkey login surface)
```

Privilege verification without modifying real published content — every statement zero-row
(`WHERE false`) inside one transaction that was rolled back, run as the real `learnbox_admin` role
through the Admin container's own DSN:

```
ALLOWED : packs INSERT, packs.status UPDATE, packs.published_at UPDATE,
          cards INSERT, cards.lemma UPDATE,
          card_versions INSERT, card_versions.content_json UPDATE,
          pack_cards INSERT
DENIED  : packs.price_tomans UPDATE, packs.is_free UPDATE, packs DELETE, cards DELETE,
          cards.content_id UPDATE, review_events INSERT, card_schedules UPDATE
after rollback: packs=1 cards=35 (unchanged)
```

Store transaction fix (#394) proven at the database level under the real role: `admin_user_roles`
does not exist (`to_regclass` null), `admin_role_assignments` does, and the fixed query
(`role::text = ANY(...)`) executes and returns `0` rows instead of failing with `42P01`.
`purchase_events` and `store_listings` remain readable and empty.

## 7. Learner integrity and payments

- Learner container untouched: same image `sha256:65cd7969…`, same start time `14:33:02Z`,
  restarts `0`, healthy. It was not redeployed and not restarted.
- `app.learnboxapp.com/` `200`, `/api/health` `status: ok`, `database: ok`.
- Payments remain off: `/api/payments/zarinpal/start` `404`, `/api/store/listings` `404`, no Zarinpal
  variable in the learner environment.
- Learner-visible data unchanged: all 12 counts and 8 `xmin` digests identical before and after the
  whole window (`review_events=156`, `card_schedules=31`, `banners=3`, `users=2`).

## 8. Remaining blockers (unchanged by this release)

- `LEARNBOX_AI_API_KEY` absent → AI content and AI media generation stay `BLOCKED`.
- `BLOB_READ_WRITE_TOKEN` absent → splash replacement stays `BLOCKED`.
- Zarinpal: no merchant id, no live payment verification.
- `packs.price_tomans` has no Admin write path by design (and now no privilege either).
- `infrastructure/database/db-roles-p0-proof.sql` is still ~9 tables behind and reports `FAIL` on
  `main`; it is a manual runbook script, not a CI gate.
- No authenticated, per-route Admin response has been captured as evidence, so the content-management
  capability is `DEPLOYED`, not `VERIFIED`, until the owner exercises it in the browser.
- The approved `prototypes/admin-ui-v1` design direction is preserved on the remote branch
  `proto/admin-ui-concept` (tip `8b3e050`); the Admin UI redesign (`LB-B36`) remains out of scope.

## 9. Owner-side functional tests still required

1. Sign in at `admin.learnboxapp.com` with the registered passkey.
2. Open Content and Packs; create a **draft** pack and one card, then edit the card.
3. Submit that draft pack for review, publish it, then archive it — the full lifecycle on a
   throwaway pack, not on `LearnBox Start — German A1 Essentials`.
4. Confirm pricing fields are not editable anywhere in the interface.
5. Open Store → transactions and payment configuration; both must load without a `500`
   (the ledger is empty and the gateway is disabled).
6. Confirm the learner app still shows the same home slider and progress after the above.
