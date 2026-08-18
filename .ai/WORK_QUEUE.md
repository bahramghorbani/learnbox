# LearnBox AI work queue

Read `.ai/WORKER_PROTOCOL.md` before this file. `blocked` tasks are context, not authorization to
start. Historical tasks remain for traceability and must not be duplicated.

## LB-DS-004

- Status: ready
- Executor: any-capable-coding-agent
- Base: main at `198abd0` (PR #82 merged)
- Branch: worker/lb-ds-004-start-pack-audio-resolver
- Risk: routine-offline-content-contract
- Specification: GitHub issue #59; `CURRENT_WORK.md` native-audio continuation gate
- Allowed paths: apps/mobile/lib/features/review/start_pack_audio_assets.dart; apps/mobile/test/start_pack_audio_assets_test.dart; .ai/WORK_QUEUE.md; .ai/worker-reports/LB-DS-004.md; CURRENT_WORK.md
- Required checks: dart format --output=none --set-exit-if-changed apps/mobile/lib/features/review/start_pack_audio_assets.dart apps/mobile/test/start_pack_audio_assets_test.dart; cd apps/mobile && flutter analyze; cd apps/mobile && flutter test test/start_pack_audio_assets_test.dart; cd apps/mobile && flutter test
- Simulator required: no
- Draft PR required: yes
- Merge allowed: yes

Implement only a pure, offline `StartPackAudioAssets` resolver for the three canonical Start-card
IDs. It must return the exact already-approved V2 word and sentence asset paths for
`start-a1-haus`, `start-a1-tisch` and `start-a1-tuer`; it must return no mapping for an unknown
card ID. Keep the resolver independent of platform audio plugins and UI, with no `pubspec.yaml`,
dependency, asset, network, storage, sync, identity, provider, flag, release or Bobo change.
First add a failing unit test for the three exact mappings and the unknown-ID failure case, then
implement the smallest typed immutable API that makes it pass. Do not add a playback button or
player: physical `de-DE` listening QA and bundled asset provenance are already recorded, while
the native playback experience itself remains a separately reviewed follow-up. Record a standard
handoff report, mark the task `review_requested`, and stop at a Draft PR with actual check output.

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

- Status: accepted
- Executor: deepseek-flash
- Base: main at `22ccc73` (PR #68 merged)
- Branch: worker/lb-ds-002-today-layout
- Risk: routine-layout-after-reviewed-theme
- Specification: docs/superpowers/specs/2026-08-16-mobile-visual-parity-design.md; docs/superpowers/plans/2026-08-16-mobile-visual-parity.md (Task 3 only)
- Allowed paths: apps/mobile/lib/features/review/today_screen.dart; apps/mobile/test/mobile_visual_parity_test.dart; apps/mobile/test/mobile_learning_loop_test.dart; apps/mobile/test/app_test.dart; apps/mobile/test/widget_test.dart; apps/mobile/test/launch_experience_test.dart; .ai/WORK_QUEUE.md; .ai/worker-reports/LB-DS-002.md
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

Completed and merged through PR #70 after independent Flutter, CI and scope review. It is retained
for traceability; do not reopen or duplicate it.

## LB-DS-003

- Status: accepted
- Executor: deepseek-flash
- Base: main at `04d6205` (PR #70 merged)
- Branch: worker/lb-ds-003-completion-screen
- Risk: routine-presentation-with-preserved-grading
- Specification: docs/superpowers/specs/2026-08-16-mobile-visual-parity-design.md; docs/superpowers/plans/2026-08-16-mobile-visual-parity.md (Task 4 completion slice only)
- Allowed paths: apps/mobile/lib/features/review/completion_screen.dart; apps/mobile/lib/features/review/review_screen.dart; apps/mobile/test/mobile_learning_loop_test.dart; apps/mobile/test/mobile_visual_parity_test.dart; .ai/WORK_QUEUE.md; .ai/worker-reports/LB-DS-003.md
- Required checks: dart format --output=none --set-exit-if-changed apps/mobile/lib/features/review/completion_screen.dart apps/mobile/lib/features/review/review_screen.dart apps/mobile/test/mobile_learning_loop_test.dart apps/mobile/test/mobile_visual_parity_test.dart; cd apps/mobile && flutter analyze; cd apps/mobile && flutter test test/mobile_learning_loop_test.dart test/mobile_visual_parity_test.dart; cd apps/mobile && flutter test
- Simulator required: no
- Draft PR required: yes
- Merge allowed: yes

Accepted through green-check PR #73 on 2026-08-17. The review fixed the synthetic duplicate-event
ID test defect and added end-to-end return-to-Today coverage; do not reopen or duplicate this task.

Implement only the daily-completion presentation slice. First write a failing widget test that
verifies the canonical `celebrate-v2` image exposes the semantic label `بوبو موفقیت تو را جشن
می‌گیرد`, the existing truthful pending-answer text remains visible, and `بازگشت به امروز` returns
to Today. Create `CompletionScreen({required int? pendingCount, required String? storageError,
required VoidCallback onReturnToToday})`, then replace only the completed branch in `ReviewScreen`
with it. The return callback must use `Navigator.of(context).popUntil((route) => route.isFirst)`.
The return action must be at least 56px high. Preserve every `_grade` branch, its exact single
`reviewQueue.record` call, pending-count/error behavior, queue state and existing grade-layout
behavior. Do not restyle the active review card, alter grade labels, add audio/navigation/sync/API
logic, change assets or fonts, add dependencies, or modify any other file. Record a standard
handoff report, mark the task `review_requested`, and stop at a Draft PR with actual check output.
