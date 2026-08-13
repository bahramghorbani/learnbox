# LearnBox DeepSeek routine work queue

Read `.ai/WORKER_PROTOCOL.md` before this file. Process only the first `ready` task. `blocked` tasks
are context, not authorization to start.

## LB-DS-001

- Status: blocked
- Executor: deepseek-flash
- Base: pending-approved-plan
- Branch: worker/lb-ds-001-mobile-sync-contract-tests
- Risk: routine-after-security-plan
- Specification: docs/superpowers/specs/2026-08-13-mobile-sync-coordinator-design.md
- Allowed paths: pending implementation plan
- Required checks: pending implementation plan
- Simulator required: no
- Draft PR required: yes
- Merge allowed: no

Blocker: the owner-approved design is committed on `docs/mobile-sync-coordinator-design`, but the
implementation plan and Codex security task split are not yet merged into `main`. Codex will replace
the pending fields and set `Status: ready` only for the routine test/adapter subset. DeepSeek must
not infer or implement identity, transport, security or production composition itself.
