# Admin content-review staging activation

## Purpose and current boundary

This runbook prepares the separately owner-approved **staging-only** activation of the persisted
Admin content-review workflow merged in PR #252. It does not itself authorize or execute a deploy,
database migration, feature-flag change, human review, catalog seed, publication, or Production
change.

Migration `0017_start_catalog_review_candidates.sql` imports 35 committed Start Pack candidates as
version 1 in `needs_review`, with exactly six pending checks per candidate. It creates no reviewer
attestations, decisions, approvals, publication timestamps, pack membership, or learner availability.
The Admin routes remain fail-closed unless both the existing Passkey boundary and the dedicated
runtime gate are enabled.

## Stop conditions

Stop before changing staging when any of these is true:

- the owner has not approved this exact staging operation;
- the target is not the isolated Admin staging environment or its dedicated staging database;
- the release commit is not the reviewed commit that contains PR #252 and this runbook's default-off
  Compose wiring;
- required GitHub checks or the independent review are not green;
- the staging database cannot produce a verified, restorable pre-migration backup;
- the current `schema_migrations` ledger is unavailable, contains a checksum mismatch, or has an
  unexpected pending migration before `0017`;
- the Passkey login, canonical owner identity, or `super_admin` assignment is unavailable;
- any secret value would need to be copied into chat, source control, command output, screenshots, or
  evidence;
- the deployment target, database target, TLS trust root, or previous rollback image is ambiguous.

Never substitute Production, a public Preview, a local database, or a different server to work around
a stop condition.

## Required invariants

- `LEARNBOX_ADMIN_CONTENT_REVIEW_ENABLED` defaults to `false` in Compose and is runtime-only.
- `LEARNBOX_ADMIN_PASSKEY_ENABLED=true` and the already-built Passkey UI remain prerequisites.
- `DATABASE_URL` stays in the restricted server environment and uses verified TLS. Do not print or
  export it into shell history.
- The migration runner applies **every pending numbered migration**, not an individually selected
  file. Inspect the ledger before running it.
- Migration `0017` must run before the content-review flag is enabled.
- All 35 candidates remain `needs_review`; all 210 checks remain `pending`; no decision or publication
  is created by activation.
- Seed, pack release, learner delivery, participant access, and Production remain off.

## Phase 1 — exact-release preflight

1. Record the approved staging release commit and confirm it is an ancestor of current `origin/main`.
2. From one clean checkout of that exact commit, run the preflight and all Phase 3 image builds;
   do not build from a different or previously generated working tree. Run:

   ```bash
   pnpm install --frozen-lockfile
   pnpm check
   pnpm build
   node scripts/validate-migrations.mjs
   pnpm audit --prod --audit-level=high
   git diff --check
   ```

3. Confirm the release contains:
   - `database/migrations/0017_start_catalog_review_candidates.sql`;
   - the persisted Admin queue/check/decision routes;
   - the default-false `LEARNBOX_ADMIN_CONTENT_REVIEW_ENABLED` Compose mapping;
   - the Admin deployment-boundary test.
4. From that same approved checkout, derive the expected ledger checksum over the raw migration file:

   ```bash
   sha256sum database/migrations/0017_start_catalog_review_candidates.sql
   ```

   In the trusted database console, inspect `schema_migrations` by version and checksum and compare
   `0017_start_catalog_review_candidates` with that value. Do not run the migration if anything other
   than the reviewed pending set would be applied.

5. Confirm the current staging Admin image identifier is retained and runnable for application
   rollback.
6. Confirm the currently deployed review route is fail-closed: an unauthenticated
   `GET /api/content/review` returns `404` before the new flag is enabled.

## Phase 2 — backup gate

1. Create an encrypted staging-database backup or provider snapshot immediately before migration.
2. Record only its opaque backup identifier, creation time, database environment class, and a generic
   verification result. Do not record connection strings or credentials.
3. Verify restore readiness using the approved provider procedure. A backup job reporting success
   without a readable artifact or restore check is insufficient.
4. Freeze unrelated staging database writes for the bounded migration window.

## Phase 3 — build immutable candidates

Build the Admin candidate from the approved commit with the existing Passkey UI build flag preserved.
The content-review flag is runtime-only and must remain false during candidate verification.

Build a same-commit learner-app image only as the one-shot migration runner, because that image
contains `apps/api/dist/database/run-migrations.js` and the numbered SQL files. Building it does not
authorize deploying the learner application. Build both images directly so no runtime secret file is
loaded during the build:

```bash
: "${APPROVED_RELEASE_COMMIT:?set APPROVED_RELEASE_COMMIT to the reviewed commit}"

docker build \
  --file infrastructure/production/admin/Dockerfile \
  --build-arg NEXT_PUBLIC_LEARNBOX_ADMIN_PASSKEY_UI_ENABLED=true \
  --tag "learnbox-admin:$APPROVED_RELEASE_COMMIT" \
  .

docker build \
  --file infrastructure/production/app/Dockerfile \
  --tag "learnbox-learner-app:$APPROVED_RELEASE_COMMIT" \
  .

# Prove the immutable image contains the runner, migrations and pg runtime before touching a DB.
docker run --rm --workdir /app/apps/api \
  "learnbox-learner-app:$APPROVED_RELEASE_COMMIT" \
  node -e "require('pg');require('node:fs').accessSync('dist/database/run-migrations.js');require('node:fs').accessSync('../../database/migrations/0017_start_catalog_review_candidates.sql')"
```

Do not pass `DATABASE_URL`, Passkey secrets, session secrets, provider credentials, or other runtime
secrets as build arguments. Do not run `docker compose config` into logs or evidence because rendered
output can include secrets.

## Phase 4 — execute migrations (owner-approved operation)

Run the repository migration runner exactly once from the same-commit learner-app image. Use a
mode-`600`, ignored `MIGRATION_ENV_FILE` containing only the exact staging `DATABASE_URL`; do not
reuse an application env file that would expose unrelated OTP, session, Passkey, or provider secrets
to the one-shot container. Mount the staging database CA read-only and use the existing private
staging network:

```bash
: "${MIGRATION_ENV_FILE:?set MIGRATION_ENV_FILE to the restricted DATABASE_URL-only file}"
: "${STAGING_DB_CA_PATH:?set STAGING_DB_CA_PATH to the verified staging CA file}"

docker run --rm \
  --network learnbox-staging-internal \
  --env-file "$MIGRATION_ENV_FILE" \
  --env NODE_EXTRA_CA_CERTS=/run/db-tls/ca.crt \
  --env PGSSLROOTCERT=/run/db-tls/ca.crt \
  --volume "$STAGING_DB_CA_PATH:/run/db-tls/ca.crt:ro" \
  "learnbox-learner-app:$APPROVED_RELEASE_COMMIT" \
  node apps/api/dist/database/run-migrations.js
```

Expected application-level output reports the number of migrations applied. It must not print the
connection string. Any checksum mismatch, fail-closed `0017` exception, TLS error, or unexpected
migration count is a stop condition: leave the content-review flag false and investigate without
editing an applied migration.

## Phase 5 — verify the dormant database state

Run the following read-only assertion in the trusted database console. The result must be one row
with `candidates=35`, `checks=210`, `pending_checks=210`, `decisions=0`, and `published=0`.

```sql
WITH imported AS (
  SELECT cv.id, cv.status, cv.published_at
  FROM cards c
  JOIN card_versions cv ON cv.card_id = c.id
  WHERE c.content_id LIKE 'start-a1-%'
    AND cv.version = 1
    AND cv.source_provider = 'ai_suggestion'
    AND cv.source_reference =
      'Goethe A1 scope reference; German and Persian linguistic review recorded; remaining release gates pending.'
),
check_totals AS (
  SELECT
    count(*) AS checks,
    count(*) FILTER (
      WHERE outcome = 'pending'
        AND reviewer_user_id IS NULL
        AND reviewed_at IS NULL
        AND notes IS NULL
        AND idempotency_key IS NULL
    ) AS pending_checks
  FROM content_review_checks
  WHERE card_version_id IN (SELECT id FROM imported)
),
decision_totals AS (
  SELECT count(*) AS decisions
  FROM content_review_decisions
  WHERE card_version_id IN (SELECT id FROM imported)
)
SELECT
  (SELECT count(*) FROM imported) AS candidates,
  (SELECT checks FROM check_totals) AS checks,
  (SELECT pending_checks FROM check_totals) AS pending_checks,
  (SELECT decisions FROM decision_totals) AS decisions,
  (SELECT count(*) FROM imported WHERE status = 'published' OR published_at IS NOT NULL) AS published;
```

Also confirm `schema_migrations` contains the reviewed checksum for
`0017_start_catalog_review_candidates`. Do not include the full database ledger or row content in
public evidence.

## Phase 6 — activate only the Admin review runtime

1. In the restricted Admin staging environment, set only:

   ```text
   LEARNBOX_ADMIN_CONTENT_REVIEW_ENABLED=true
   ```

2. Keep Passkey configuration unchanged. Do not reopen bootstrap or alter any learner, review-sync,
   media, seed, invitation, or Production flag.
3. Start the already-built immutable Admin candidate with the restricted Admin environment file:

   ```bash
   : "${ADMIN_ENV_FILE:?set ADMIN_ENV_FILE to the restricted Admin environment file}"

   ADMIN_VERSION="$APPROVED_RELEASE_COMMIT" \
     docker compose --env-file "$ADMIN_ENV_FILE" \
     --file infrastructure/production/admin/compose.yaml \
     up -d --no-build admin
   ```

4. Wait for its health check.
5. Verify:
   - root returns `200` over the existing protected HTTPS origin;
   - anonymous Admin session remains `401`;
   - bootstrap remains `404`;
   - unauthenticated `GET /api/content/review` changes from disabled `404` to authenticated-boundary
     `401` with `Cache-Control: no-store`;
   - an authenticated owner session with current Passkey authentication can read the queue;
   - the queue shows the imported candidates in `needs_review` with pending checks;
   - no write is performed during activation verification.
6. Record only generic counts, HTTP status classes, release commit/image identifier, and the rollback
   image identifier. Never record cookies, CSRF values, Passkey material, database rows, or secrets.

## Human-review handoff

Activation only makes the review workflow available. A human reviewer must re-attest each of the six
dimensions for each candidate through the authenticated server workflow. Do not bulk-pass checks,
forge repository evidence as database-user attestation, or automate approval decisions.

Catalog seed and publication remain separate owner/review-gated tasks even after all checks pass.

## Rollback

### Application-only rollback

For route, UI, or runtime problems:

1. set `LEARNBOX_ADMIN_CONTENT_REVIEW_ENABLED=false` in the restricted staging environment;
2. redeploy the retained previous Admin image or the approved candidate with the flag false;
3. verify root health, Passkey login, bootstrap `404`, and review route `404`;
4. leave the additive migration in place and preserve all review data.

### Database restore

There is no down migration. Restore the pre-migration backup only when migration integrity itself is
compromised and **before** any human review writes occur. Once a check or decision has been written,
restoring the snapshot can destroy review evidence and requires a separate explicit owner/data-loss
decision. Never delete candidate rows manually as a rollback shortcut.

## Completion evidence

The operation is complete only when all of these are recorded without sensitive values:

- approved release commit and immutable image identifiers;
- green preflight checks;
- verified backup identifier and restore-readiness result;
- expected migration count and reviewed `0017` checksum presence;
- `35 / 210 / 210 / 0 / 0` database assertion;
- healthy Admin staging, protected Passkey boundary, bootstrap closed, review route authenticated;
- Production, seed, publication, learner delivery, and unrelated flags unchanged;
- rollback image retained and rollback procedure verified.
