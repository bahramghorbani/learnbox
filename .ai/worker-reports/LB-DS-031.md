# LB-DS-031 — Admin Passkey Docker build contract

- Status: accepted
- Base: `14eb8ef560c1fe2327e38421c9a907d7a1e190e7`
- Branch: `fix/admin-passkey-build-contract`
- Head commit: `3011dedaaabcb06ad561c2ae7084b29e3c829515`
- Final branch head: `2d5eb546db0b9a16a70587d3385d4c41228586da`
- Merge commit: `254276e0ed314f5a20a5d030a11c2f56bdb28560` (PR #214)
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
- Production, seed, publication, schema and data remain unchanged. The prior staging image remains available as an immutable rollback target.

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
- Independent security/deployment review: passed with no blocking findings; production, seed and
  publication were confirmed untouched.
- GitHub CI for final head `2d5eb54`: all 7 checks passed (`quality`, `secrets`, `mobile`, `production-stack`, both Vercel deployments and Preview comments).
- Remote true-flag candidate built from merge commit `254276e`: root `200`, anonymous session `401`, bootstrap `404`, browser `login_ui=true`, `workspace_ui=false`.
- Staging-only cutover: healthy container on `learnbox-admin:254276e-admin-staging`; public root/session/bootstrap stabilized at `200`/`401`/`404`. Caddy returned a brief `503` while its active health check rediscovered the recreated container, then marked the host up. Landing remained `200` throughout verification.
- Hygiene: temporary candidate container/image/release and local SSH tunnel were removed; canonical release and rollback image were retained; staging env remains `root:root` mode `600`.

## Rollback

Redeploy the retained `learnbox-admin:staging-bootstrap-ui-fix` image with the pre-cutover Compose backup, then verify root `200`, anonymous session `401`, bootstrap `404` and Passkey login. Do not alter the isolated staging database or production services during rollback.
