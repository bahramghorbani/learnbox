# Learner application Production deployment — `fa44d21` (2026-10-09)

**Owner-authorized, learner application only.** No Admin deployment, no migrations, no flag
changes, no payment activation. Supersedes the deployment facts of
`docs/evidence/functional-validation/D_FV_1_PRODUCTION_DEPLOYMENT_EVIDENCE.md` (2026-10-04,
`6d6aa724`), which remains the historical record of that release.

## 1. Source identity

| Item                  | Value                                                                                |
| --------------------- | ------------------------------------------------------------------------------------ |
| Source commit         | `fa44d21a0e0604960becd66a8ab6e2d935911700` (`main`)                                  |
| Working tree          | clean, `0` modified files, `0/0` ahead/behind `origin/main`                          |
| Required CI on commit | run `37937216334` — `quality`, `secrets`, `mobile`, `production-stack` all `success` |
| Previous deployed SHA | `6d6aa72489dd895299f8a1f4bedb2c205e32e31b`                                           |
| Schema head at deploy | `0032_role_grant_repair` — 32 ledger rows, 45 tables                                 |

## 2. Build-time configuration

`infrastructure/production/app/Dockerfile`, `compose.yaml` and `app.env.example` are
**byte-identical** between `6d6aa724` and `fa44d21`, so the build-time flag surface did not change
across this deployment. The image was built with the same canonical matrix as the previous release:

| Build arg (`NEXT_PUBLIC_LEARNBOX_…`) | Value   |
| ------------------------------------ | ------- |
| `PROFILE_IDENTITY_ENABLED`           | `true`  |
| `BINARY_REVIEW_UI`                   | `true`  |
| `QUEUE_QUARANTINE`                   | `false` |
| `SERVER_SESSION_PLAN`                | `false` |
| `GOAL_UX_REMOVED`                    | `false` |
| `SESSION_EXPIRY_UX`                  | `false` |

`APP_SOURCE_SHA=fa44d21a0e0604960becd66a8ab6e2d935911700` was passed as a build arg and is present
both as a runtime env var and as the OCI `org.opencontainers.image.revision` label.

Three `NEXT_PUBLIC_*` flags read by the code (`OTP_UI_ENABLED`, `ALPHA_INVITE_UI_ENABLED`,
`PRIVATE_MEDIA_ENABLED`) are declared by no `ARG` in the Dockerfile and are therefore inlined as
undefined — in this image exactly as in the one it replaced.

## 3. Artifact and transfer integrity

| Item                  | Value                                                                                                    |
| --------------------- | -------------------------------------------------------------------------------------------------------- |
| Image digest          | `sha256:65cd79695c1c0352c49e5c2b69d7c31be058ac034f26a4355390c45bf0e7c495`                                |
| Platform              | `linux/amd64` (matches the host)                                                                         |
| Size on host          | `519,054,875` bytes                                                                                      |
| `docker save` archive | `141,691,904` bytes                                                                                      |
| Archive `sha256`      | `f58a808e6d47bd42dd6561e48f2f3c402c58afc2b162bd638adee49584319af9` — identical on build machine and host |

Built on the development machine for `linux/amd64`, transferred by `docker save` + `scp` with the
archive hash compared on both ends, then `docker load` on the host.

## 4. Pre-switch candidate check (off the edge network)

The candidate ran as a throwaway container bound to `127.0.0.1:3100` with the production env file,
never attached to the edge network, and was removed afterwards:

- `GET /api/health` → `200`, `{"status":"ok"}` with `database: ok`
- `GET /api/banners` → `401`; `POST /api/store/purchase/initiate` → `403`
- logs clean (`Ready in 670ms`; only the known `pg` `sslmode` deprecation warning)

## 5. Switch

| Item            | Value                                                                              |
| --------------- | ---------------------------------------------------------------------------------- |
| Method          | digest pin in `/home/ubuntu/learnbox/app/compose.yaml`, `docker compose up -d app` |
| Start / healthy | `2026-10-09T14:33:00Z` → `2026-10-09T14:33:09Z`                                    |
| Container       | `4fa173a9adeadc8b4319e681bedaf57aa7d5c98c00bcbd968f0ac06f7908eaa4`                 |
| Running image   | `sha256:65cd7969…`                                                                 |
| `RestartCount`  | `0`                                                                                |
| Health / streak | `healthy` / failing streak `0`                                                     |

## 6. Banner delivery correction (owner-authorized, same session)

M4.3's delivery predicate admits `link_url = 'store'` and the `pack`/`url` link kinds, which the
previously deployed predicate deliberately excluded. Three pre-existing sample rows therefore
changed from one deliverable slide to three — including a promotional "autumn discount" slide
pointing at a Store with no listings. The owner authorized deactivating exactly two rows:

```
UPDATED banner_sample1 | 🎓 بسته LearnBox Start | active=false
UPDATED banner_sample2 | 🔥 تخفیف ویژه پاییزه  | active=false
UPDATE 2    rows_total 3
```

- No row deleted; `banners` still holds 3 rows.
- `banner_sample3` untouched — `is_active=true` and `xmin` unchanged at `79875` (the two updated
  rows moved to `1259535`), proving it was not rewritten.
- Delivery after the change: `delivered_count = 1` (`banner_sample3`) — identical to what learners
  saw before the deployment.

## 7. Post-deployment verification

**Health and identity** — `GET https://app.learnboxapp.com/api/health` → `200` with
`database: ok`; running `APP_SOURCE_SHA` and the image revision label both `fa44d21…`.

**Learner data integrity** — full fingerprint (row counts + `md5` of ordered rows + `xmin` digests)
captured immediately before and after the switch is **identical**: `users=2`,
`review_events=137`, `card_schedules=31`, `learner_daily_plans=6`.

**Schema untouched by the deploy** — `schema_migrations` still 32 rows, 45 tables; the application
container runs no migrations at boot.

**Access and entitlement** — the canonical rule (`apps/website/lib/pack-access.ts`: published AND
(`is_free` OR a `user_packs` row)) resolves for both real accounts to
`learnbox_start_a1_essentials` with a 35-card curriculum, with `user_packs` empty, so enforcement
cannot revoke pre-existing access. `user_session_cutoffs = 0` and no non-`active` user, so existing
learner sessions are not invalidated.

**Commerce fail-closed** — `store_listings = 0` (Store renders its empty state),
`purchase_events = 0`, `user_packs = 0`; `LEARNBOX_ZARINPAL_ENABLED` absent from the container env,
so `readZarinpalConfig` returns `null`.

**Public surface probes**

| Request                             | Status |
| ----------------------------------- | ------ |
| `GET /`                             | `200`  |
| `GET /api/health`                   | `200`  |
| `GET /api/banners`                  | `401`  |
| `GET /api/store/packs`              | `401`  |
| `GET /api/store/my-packs`           | `401`  |
| `POST /api/store/purchase/initiate` | `403`  |
| `POST /api/store/activate`          | `403`  |
| `GET /api/private-media/<unknown>`  | `404`  |
| `GET /api/content-media/<unknown>`  | `404`  |
| `GET /api/banners/<id>/image`       | `401`  |

**Splash** — `GET /api/launch/splash` → `200`, `image/webp`, `298,150` bytes, `922×1706`, served
from `splash_versions.image_data` (one version, referenced by `current_splash`); no
`BLOB_READ_WRITE_TOKEN` is required for delivery and published content was not changed.

## 8. Rollback procedure

Both rollback inputs are retained on the host:

- `/home/ubuntu/learnbox/app/compose.yaml.pre-fa44d21` — the pin of the previous release
- image `learnbox-app:dfv1-candidate-amd64` = `sha256:953b7b6240c266ec22d1ed6bc4dad5998ae679cd907276d39c232676f7709d24`

To roll back: `cp compose.yaml.pre-fa44d21 compose.yaml && docker compose up -d app`, then confirm
`APP_SOURCE_SHA=6d6aa724…` and `/api/health` `200`. The schema stays at `0032`; the previous
release's suites are proven against it and its write paths are additive-compatible
(`apps/website/test/deployed-schema-compat-db.test.ts`).

## 9. Not verified by this deployment

- **Device-level learner QA.** Authentication with a real OTP session, a card review round trip and
  the progress screen were **not** exercised end to end: that needs a real learner login on a
  device. Leitner behavior here rests on the canonical CI suites for this commit plus unchanged
  `card_schedules` and read-model query results.
- **First unattended backup after the backup fix** is due `2026-10-10T02:32Z` and has not yet been
  observed. The host still runs the pre-fix `learnbox-backup.sh`; the hardened version
  (`sanitize_error`, `umask 077`, migrator DSN preference) exists only in the repository.
- **Outstanding release gates:** `price_tomans` has no write path (legacy Admin route is 404 in
  production builds); a store purchase hitting `verification_error` leaves the row `pending`;
  `BLOB_READ_WRITE_TOKEN` is unset; no verified Zarinpal Merchant ID.
- **Admin** was not deployed and remains unreachable (`admin.learnboxapp.com` answers a fixed 404,
  container publishes no ports), running `e601d8a1`.
