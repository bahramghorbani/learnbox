# LB-DS-031 — Admin Passkey Docker build contract

- Status: review_requested
- Base: `14eb8ef560c1fe2327e38421c9a907d7a1e190e7`
- Branch: `fix/admin-passkey-build-contract`
- Risk: security-sensitive deployment contract

## Trigger

The isolated `learnbox-admin:14eb8ef-admin-staging` candidate built successfully, but a loopback-only probe returned `login_ui=false` and `workspace_ui=true`. The running staging container was not changed. Root cause: `NEXT_PUBLIC_LEARNBOX_ADMIN_PASSKEY_UI_ENABLED` is consumed during the Next.js build, while the Docker contract supplied it only as a runtime environment variable.

## Change

- Add a default-false Docker build argument for the public Passkey UI flag.
- Promote that argument to the builder environment before `next build`.
- Pass the same public boolean through the tracked Admin Compose build contract.
- Keep token hash keys, bootstrap secrets, database credentials and every other secret runtime-only.
- Correct the activation runbook and current-work record so GitHub documents the build-time contract
  and the verified staging-only state.

## TDD evidence

- RED: deployment-contract test failed because the Dockerfile had no public build argument.
- GREEN: focused deployment-contract tests pass after adding the explicit default-false build path.

## Boundaries

- No auth policy, route or session logic changes.
- No secret becomes a Docker argument or image layer.
- No migration, data mutation, content approval, seed or publication.
- No Production deployment or configuration change.
- Staging remains on the previously healthy image until a true-flag candidate passes isolated probing.

## Checks

- Focused deployment contract: 2 passed.
- Full Admin suite: 122 passed across 26 files.
- Admin typecheck and production build: passed.
- True-flag and default-false Docker image builds: passed (`learnbox-admin:lb-ds-031-local` and `learnbox-admin:lb-ds-031-default`).
- Isolated browser probes: true-flag image produced `login_ui=true`, `workspace_ui=false`; default-false image kept `local_notice=true`, `login_ui=false`. Both probe containers were removed.
- Compose config with non-secret placeholders: passed.
- Prettier on supported changed files and `git diff --check`: passed. Dockerfile is validated by the real Docker build because Prettier has no inferred parser for extensionless Dockerfiles.
- Queue, documentation-governance, continuity and dashboard validators: passed.
- Secret-pattern scan of the tracked diff: passed (no assigned secret, private key or AWS-key pattern).
- GitHub CI, remote staging candidate and staging-only cutover: pending.

## Rollback

Revert this PR. The current running staging image is unchanged at the time this report is created.
