# Admin release-preparation handoff

**Snapshot:** 2026-10-12 · **Repository `main`:** `4d077214d05e7dc363fbfc968c0d74c6d7b3ee15` (PRs #415, #416) · **Status:** preparation complete; Production deployment is **not authorized**.

This is a concise continuation index, not a deployment runbook. The release procedure and recovery detail remain in the documents linked below.

## What is complete on `main`

- Admin UI stages **0–11** are merged. All nine PDR-009 navigation destinations are real; stages 12 and 13 were respectively the read-only Production audit and release preparation.
- Admin release validation: **893 tests passed, 0 skipped** against live PostgreSQL; typecheck, lint, format, production build, migration validation, five boundary checks, and required GitHub CI **4/4** passed.
- No product, migration, or learner source file changed in the release-preparation PRs.

## Production and candidate identity

| Service/artifact     | Exact identity                                                                                                                         | State                                                                                                                                                                          |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Running Admin        | `sha256:20263ce025b239213a4f181f1816d0b967a53866984b21da55c2052dd0dd27cd`; `ADMIN_SOURCE_SHA=b34647e166cd7a0f8bb80d44c075a23faef0e8ce` | Healthy, `RestartCount=0`; contains Admin stages 0–6 only. Do not replace without owner authorization.                                                                         |
| Running learner      | `sha256:65cd79695c1c0352c49e5c2b69d7c31be058ac034f26a4355390c45bf0e7c495`                                                              | Healthy, `RestartCount=0`; must not be redeployed for the Admin release.                                                                                                       |
| Verified Admin image | `learnbox-admin:9829c88-release` = `sha256:bfb9db8c2e13e87d082530aa2f104473e9ad4123255e290168ed137bc179d7f0`                           | Built on the amd64 host from `9829c8819c347609578225cc2d1ccc8f453646da`; 10 provenance checks passed. It is host-local only: not pushed, not tagged `production`, not running. |

`9829c881` is the PR #415 merge that contains the build/recovery changes. `main` is one documentation-only commit later. Before a future deployment, rebuild the Admin artifact from the then-current approved `main` commit so its OCI revision label and runtime `APP_SOURCE_SHA` name the exact shipped commit.

## N2 and N3 evidence

- **N2 recovery:** `learnbox-recovery-drill.sh` restored the real archive `learnbox-20261011T023257Z.sql.gz` only into a disposable PostgreSQL container: **PASS (46 checks)**. It rebuilt roles and ACLs from `db-roles-p0.sql` plus the role-guarded grant migrations, replayed them twice, and proved `learnbox_app` plus `learnbox_admin` matched the 164-line Production ACL baseline exactly (0 missing, 0 extra). No Production database write occurred.
- **N3 provenance:** `build-admin-image.sh` builds from `git archive <commit>`, embeds `APP_SOURCE_SHA` and the OCI revision label, and rejects mismatched source/architecture/entrypoint or secret-shaped image variables. The verified candidate above is the evidence; it does not authorize deployment.
- Production ledger is **34/34**, head `0034_admin_pack_metadata_grants`; no new migration is part of this Admin release.

## Backup and recovery posture

- Nightly backup timer was observed successful on 2026-10-10 and 2026-10-11. Latest recorded archive: `learnbox-20261011T023257Z.sql.gz`, 45 tables.
- Nightly `pg_dump` contains schema/data/ledger but **no roles or grants**. Neon PITR retention is only **6 hours**; use the complete procedure, not the data-only restore drill, for a post-window recovery.
- Open operations work, requiring separate owner authorization: make `learnbox-recovery-drill.sh` and its timer available on the host; update the host backup script from the reviewed repository version; observe a scheduled weekly restore drill at ledger head 0034; and create encrypted, versioned **off-host** archive replication. Archives currently live only on the Production host.

## Release gate and restrictions

**Pending owner decision:** authorize a dedicated Admin Production deployment window. Until then: no deploy, restart, Production database operation, migration, `GRANT`/`REVOKE`, environment/secret/configuration change, learner redeploy, payment activation, or feature-flag activation.

Keep `LEARNBOX_ADMIN_BOOTSTRAP_ENABLED=false`; preserve Passkey and existing access controls. Do not enable payments, AI, splash replacement, or introduce Blob/AI credentials. Do not redesign the Admin UI or treat a test, candidate image, or healthy container as real-operator verification.

After explicit authorization, follow the ordered rollback points, flag sequence, and ten-item real-operator smoke test in the readiness document. In particular: deploy with the currently absent release flags still absent; then enable only the approved flag one at a time with smoke tests between steps. Any unhealthy container, restart loop, or workspace 5xx is a rollback condition.

## Next session: read before acting

1. `AGENTS.md`, `AI_BOOTSTRAP.md`, `PROJECT_STATE.md`, this file, `.ai/WORK_QUEUE.md`, and current `git status`/open PRs.
2. `docs/planning/ADMIN_RELEASE_READINESS.md` — authoritative Admin release state, flags, rollback and smoke-test checklist.
3. `docs/operations/BACKUP_RESTORE.md` — complete recovery procedure and backup/off-host gaps.
4. `infrastructure/production/admin/build-admin-image.sh` and `infrastructure/production/ops/learnbox-recovery-drill.sh` — only when working under an authorized release or recovery task.
5. `infrastructure/database/role-privilege-baseline.txt` and `infrastructure/database/db-roles-p0.sql` — ACL evidence/model; never substitute a hand-written consolidated grant script.

Safe orientation commands (read-only):

```bash
git status --short --branch
git fetch origin
git rev-parse HEAD origin/main
git log -1 --oneline origin/main
pnpm format:check
pnpm verify:documentation-governance
```

Do not run a deployment, migration, backup service, recovery drill, or host change merely to resume context. Each requires its own explicit authorization.
