# LB-DS-054 — Admin content-review staging activation

- Branch: `ops/admin-content-review-staging-activation`
- Base commit: `801c532630d42042ebbd27b4fac158e294938075`
- Head commit: resolve from the live Draft PR `headRefOid` during exact-head review
- Draft PR: #262 — https://github.com/bahramghorbani/learnbox/pull/262
- Scope completed: no; staging backup, migration, activation and rollback proof are complete, but owner-operated authenticated read-only queue verification remains
- Files changed: `.ai/WORK_QUEUE.md`, `.ai/worker-reports/LB-DS-054.md`, `CURRENT_WORK.md`, `docs/operations/ADMIN_CONTENT_REVIEW_STAGING_ACTIVATION.md`
- Checks run: exact-release `pnpm check`, full build, migration validation, production dependency audit, `git diff --check`; restorable-backup test; migration ledger/checksum and `35 / 210 / 210 / 0 / 0` assertions; anonymous HTTPS boundaries; application rollback/reactivation proof
- Checks unavailable: authenticated queue read is waiting for the owner to complete Passkey authentication outside chat; independent review and final-head GitHub CI wait for the completed evidence commit
- Remaining work: owner Passkey login and read-only queue confirmation; final documentation validation; independent security/data-integrity review; Draft PR checks and merge; post-merge status reconciliation
- Risks: staging database integrity, authentication-boundary regression and accidental publication; mitigated by exact-release binding, restorable backup, reviewed checksum, immutable images, default-deny HTTP probes, retained rollback image and unchanged seed/publication/Production boundaries
- Secrets or production changes: no secret value was read into evidence or chat and Production was unchanged; isolated Admin staging received the approved additive migration and runtime flag
- Bobo canonical status: unchanged

## Executed evidence

- Exact release: `801c532630d42042ebbd27b4fac158e294938075`.
- Backup: encrypted artifact `lb54-pre-0017-20260910T194227Z`, mode `600`, with a separately stored
  root-only recovery key at mode `600`; decrypt-and-full-restore reproduced all 16 pre-existing
  migration entries. Plaintext/decrypted material and the temporary restore database were removed.
  Encrypted artifact SHA-256:
  `e4a8174f30c5178e6c0a32b92c3022689916f5bc0da46ad32173a676074105a3`.
- Migration: runner applied exactly one migration; ledger checksum for
  `0017_start_catalog_review_candidates` is
  `f80f20d1d3b1843933d51dadacdddf61aa4464abf0e49fbc4c61fffd9764ff3c`.
- Database assertion: candidates/checks/pending checks/decisions/published = `35 / 210 / 210 / 0 / 0`.
- Active Admin image:
  `sha256:fcb6595accd9a5019ddc5e90a5877601392af73858d88db36fc87fa134a5980e`.
- One-shot runner image:
  `sha256:4371d9b0e93216944de8299f53cf0ff11bfb5bf19ab23452b7807d81377a8127`.
- Anonymous active boundary: root `200`; session `401` + `no-store`; bootstrap `404` + `no-store`;
  review `401` + `no-store`.
- Rollback image:
  `sha256:06ca4de56ded9622989ce2d21a389f41e2bb68423ec2a7d28e89e89a9235f62c`.
  Rollback restored `review=404` and `bootstrap=404`; reactivation restored
  `review=401`, `bootstrap=404`, `session=401`.

## Preserved boundaries

- No human review check or decision was written.
- No version was approved or published; no media was attached; no catalog was seeded.
- No learner app, sync flag, invitation, payment, DNS/TLS, landing or Production state changed.
- Owner authentication data remains outside chat, logs, screenshots and repository evidence.
