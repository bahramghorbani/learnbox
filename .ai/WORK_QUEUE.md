# LearnBox AI work queue

Read `.ai/WORKER_PROTOCOL.md` before this file. `blocked` tasks are context, not authorization to
start. Historical tasks remain for traceability and must not be duplicated.

## LB-DS-001

- Status: accepted
- Executor: deepseek-flash
- Base: main-after-plan-merge
- Branch: worker/lb-ds-001-mobile-sync-contract-tests
- Risk: routine-after-security-plan
- Specification: docs/superpowers/specs/2026-08-13-mobile-sync-coordinator-design.md
- Allowed paths: apps/mobile/lib/features/sync/mobile_identity_state.dart; apps/mobile/lib/features/sync/review_sync_transport.dart; apps/mobile/lib/features/sync/review_sync_result.dart; apps/mobile/lib/features/sync/review_acknowledgement.dart; apps/mobile/test/review_sync_contract_test.dart; .ai/WORK_QUEUE.md; .ai/worker-reports/LB-DS-001.md
- Required checks: dart format --output=none --set-exit-if-changed apps/mobile/lib/features/sync apps/mobile/test/review_sync_contract_test.dart; cd apps/mobile && flutter analyze; cd apps/mobile && flutter test test/review_sync_contract_test.dart
- Simulator required: no
- Draft PR required: yes
- Merge allowed: yes

Completed and merged through PR #56 after required checks passed. It is retained as historical
context only; do not reopen or duplicate it.

## LB-DS-002

- Status: ready
- Executor: deepseek-flash
- Base: main at `22ccc73` (PR #68 merged)
- Branch: worker/lb-ds-002-today-layout
- Risk: routine-layout-after-reviewed-theme
- Specification: docs/superpowers/specs/2026-08-16-mobile-visual-parity-design.md; docs/superpowers/plans/2026-08-16-mobile-visual-parity.md (Task 3 only)
- Allowed paths: apps/mobile/lib/features/review/today_screen.dart; apps/mobile/test/mobile_visual_parity_test.dart; apps/mobile/test/mobile_learning_loop_test.dart; .ai/WORK_QUEUE.md; .ai/worker-reports/LB-DS-002.md
- Required checks: dart format --output=none --set-exit-if-changed apps/mobile/lib/features/review/today_screen.dart apps/mobile/test/mobile_visual_parity_test.dart apps/mobile/test/mobile_learning_loop_test.dart; cd apps/mobile && flutter analyze; cd apps/mobile && flutter test test/mobile_learning_loop_test.dart test/mobile_visual_parity_test.dart
- Simulator required: no
- Draft PR required: yes
- Merge allowed: yes

Implement only the reviewed Today layout: retain the existing `FutureBuilder`, repository and queue
behavior; render the approved `encourage-v2` asset as excluded decorative semantics only when the
height permits it; add `LearnerBottomNavigation` with Today selected; and show the exact truthful
SnackBar `این بخش به‌زودی در اپ موبایل آماده می‌شود.` when Words or Progress is tapped. Do not
change `app.dart`, `pubspec.yaml`, `ui/`, Bobo assets, review screen, data models, audio, storage,
sync, flags, dependencies, server code or release settings. Create one failing widget test before
the layout change; preserve every existing learning-loop assertion. Record a standard handoff
report, mark the task `review_requested`, and stop at a Draft PR with all actual checks listed.
