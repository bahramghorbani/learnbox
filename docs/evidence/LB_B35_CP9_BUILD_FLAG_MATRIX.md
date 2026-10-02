# LB-B35 CP9 — Build-time flag matrix (derived, not assumed)

**Purpose:** every build-time (`NEXT_PUBLIC_*`) value that affects the Production learner bundle,
classified and justified from evidence. Any unexplained flag blocks the rebuild (owner gate).

**Replacement build source SHA:** `8b7b32905ccbae09977cd0c102df62cf79e58bd5`
(branch `feat/lb-b35-cp9-n1-preflight`)
**Target platform:** `linux/amd64` · **Baseline for parity:** live Production image
`learnbox-app:production` (`APP_SOURCE_SHA=4ade0a885fa93a418db8cde94b81a206bcd80860`)

## Sources of truth used

1. **Live Production bundle** — inlined literals read out of
   `/app/apps/website/.next/static/chunks` in the running image.
2. **Canonical v1.2.1 build inputs** — `/home/ubuntu/learnbox/deployments/build-4ade0a8.sh` on the
   Production host: passes exactly one flag, `NEXT_PUBLIC_LEARNBOX_PROFILE_IDENTITY_ENABLED=true`.
3. **Candidate Dockerfile** `infrastructure/production/app/Dockerfile` — `ARG`/`ENV` pairs, lines 38–55.
4. **Source consumers** — every `NEXT_PUBLIC_LEARNBOX_*` reference under `apps/website`.
5. **CP9 owner decisions** — D-2 (Binary Review UI deferred), D-4 (no Admin/Caddy), Category C accepted.

## The matrix (9 flags — all source-referenced flags accounted for)

| #   | Flag                                            | Build arg passed               | Classification                           | Evidence / justification                                                                                                                                                                                                                                                                                                                                                  |
| --- | ----------------------------------------------- | ------------------------------ | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `NEXT_PUBLIC_LEARNBOX_PROFILE_IDENTITY_ENABLED` | **`true`**                     | **preserve current Production behavior** | Canonical v1.2.1 build passes `=true`; live bundle inlines `profileIdentityFlag:k="true"`. Dockerfile ARG default is `false`, so **omitting this would silently disable a live learner feature**. Must be explicit.                                                                                                                                                       |
| 2   | `NEXT_PUBLIC_LEARNBOX_BINARY_REVIEW_UI`         | **`false`**                    | **explicitly deferred (D-2)**            | Owner deferred the UI and its separate release until after CP9. Absent from v1.2.1 code entirely, so `false` = current behavior AND the deferral.                                                                                                                                                                                                                         |
| 3   | `NEXT_PUBLIC_LEARNBOX_QUEUE_QUARANTINE`         | **`false`**                    | **explicitly deferred**                  | New CP4 client flag, absent in v1.2.1. `false` keeps the v1.2.1 sync-queue path (`loadSyncQueue`). Server counterpart `LEARNBOX_QUEUE_QUARANTINE` also stays off until Stage 5.                                                                                                                                                                                           |
| 4   | `NEXT_PUBLIC_LEARNBOX_SERVER_SESSION_PLAN`      | **`false`**                    | **explicitly deferred**                  | New CP4 client flag, absent in v1.2.1. `false` disables resume-by-card. Server flag enabled separately at Stage 5; the client half stays off in CP9.                                                                                                                                                                                                                      |
| 5   | `NEXT_PUBLIC_LEARNBOX_GOAL_UX_REMOVED`          | **`false`**                    | **preserve current Production behavior** | `false` keeps the learning-goal rows rendering in Profile/Settings exactly as v1.2.1. This is why `ProfileScreen.tsx`/`SettingsScreen.tsx` are Category **A**, not C.                                                                                                                                                                                                     |
| 6   | `NEXT_PUBLIC_LEARNBOX_SESSION_EXPIRY_UX`        | **`false`**                    | **explicitly deferred**                  | `false` means `noteSessionEnded()` returns early and the new login-gate notice never renders — keeps `AuthGate.tsx` inert (Category A).                                                                                                                                                                                                                                   |
| 7   | `NEXT_PUBLIC_LEARNBOX_OTP_UI_ENABLED`           | **not passed** (no ARG exists) | **preserve current Production behavior** | **Not a build arg.** No `ARG` in the Dockerfile, and the flag name **survives in the shipped bundle** (`otpUiFlag:y=eO.env.NEXT_…`), proving Next did _not_ inline it — it is a runtime lookup falling back to the in-code default `?? 'true'`. Identical in the live Production bundle. Passing a build arg would have no effect; behavior is unchanged by construction. |
| 8   | `NEXT_PUBLIC_LEARNBOX_ALPHA_INVITE_UI_ENABLED`  | **not passed** (no ARG exists) | **preserve current Production behavior** | Same mechanism: name present in the bundle (`inviteFlag:C=eO.env.NEXT_…`), in-code default `?? 'false'`. Unchanged vs live Production.                                                                                                                                                                                                                                    |
| 9   | `NEXT_PUBLIC_LEARNBOX_PRIVATE_MEDIA_ENABLED`    | **not passed** (no ARG exists) | **preserve current Production behavior** | Same mechanism: `privateMediaFlag:w=eO.env.NEXT_…` present in both bundles; resolved at runtime from the server env, not baked. Protected-media auth is enforced **server-side** regardless of this flag.                                                                                                                                                                 |

## Why flags 7–9 are explained rather than unexplained

They are referenced in source but have **no `ARG`/`ENV` pair** in the Dockerfile. Reading the built
artifacts shows the literal strings `NEXT_PUBLIC_LEARNBOX_OTP_UI_ENABLED`,
`…ALPHA_INVITE_UI_ENABLED` and `…PRIVATE_MEDIA_ENABLED` **still present** in the client chunks of
**both** the live Production image and the candidate. Next.js removes the name when it inlines a
value; their survival proves these three are _not_ build-inlined in either build. They therefore
resolve identically in both images from the in-code defaults (`'true'`, `'false'`, server-side
respectively). Parity is structural, not a coincidence of matching build args.

Dockerfile `ARG`/`ENV` diff `4ade0a88..ff658a43` is **purely additive**: five new CP4/CP5 ARGs
(`QUEUE_QUARANTINE`, `SERVER_SESSION_PLAN`, `BINARY_REVIEW_UI`, `GOAL_UX_REMOVED`,
`SESSION_EXPIRY_UX`), all defaulting `false`. No existing ARG changed semantics.

## Non-`NEXT_PUBLIC_*` build arg

| Arg              | Value                                      | Why                                                                                                                                                                                                                                              |
| ---------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `APP_SOURCE_SHA` | `8b7b32905ccbae09977cd0c102df62cf79e58bd5` | Dockerfile default is the literal `unknown`; it feeds both the OCI label `org.opencontainers.image.revision` and the runtime `ENV`. The rejected arm64 artifact baked `unknown`, which is exactly why deployed-artifact identity was unprovable. |

## Server-side runtime flags (NOT build-time — listed to prevent conflation)

`LEARNBOX_SCHEDULER_V2`, `LEARNBOX_BINARY_REVIEW`, `LEARNBOX_TZ_PERSIST`,
`LEARNBOX_SERVER_SESSION_PLAN`, `LEARNBOX_TODAY_WORKLOAD`, `LEARNBOX_QUEUE_QUARANTINE` — all six are
ordinary env vars read at runtime, default OFF, **not** baked into the image. They are staged via
`.env` + systemd `Environment=` at Stage 5/6, and are **absent from Production today** (verified
count = 0).

## Gate statement

All **9** source-referenced build-time flags are classified; **zero unexplained**. Six are controlled
by explicit build args; three are structurally not build-inlined and provably identical to live
Production. Flag #1 is the one that preserves a live feature and is the defect the first build missed.
