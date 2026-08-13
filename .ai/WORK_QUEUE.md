# LearnBox DeepSeek routine work queue

Read `.ai/WORKER_PROTOCOL.md` before this file. Process only the first `ready` task. `blocked` tasks
are context, not authorization to start.

## LB-DS-001

- Status: review_requested
- Executor: deepseek-flash
- Base: main-after-plan-merge
- Branch: worker/lb-ds-001-mobile-sync-contract-tests
- Risk: routine-after-security-plan
- Specification: docs/superpowers/specs/2026-08-13-mobile-sync-coordinator-design.md
- Allowed paths: apps/mobile/lib/features/sync/mobile_identity_state.dart; apps/mobile/lib/features/sync/review_sync_transport.dart; apps/mobile/lib/features/sync/review_sync_result.dart; apps/mobile/lib/features/sync/review_acknowledgement.dart; apps/mobile/test/review_sync_contract_test.dart; .ai/WORK_QUEUE.md; .ai/worker-reports/LB-DS-001.md
- Required checks: dart format --output=none --set-exit-if-changed apps/mobile/lib/features/sync apps/mobile/test/review_sync_contract_test.dart; cd apps/mobile && flutter analyze; cd apps/mobile && flutter test test/review_sync_contract_test.dart
- Simulator required: no
- Draft PR required: yes
- Merge allowed: no

Authorization becomes effective only after this Plan and queue revision merge into `main`. DeepSeek
implements only Task 1 of the linked Plan. It must not infer or implement queue persistence,
coordinator behavior, identity/session, HTTP transport, security or production composition.
