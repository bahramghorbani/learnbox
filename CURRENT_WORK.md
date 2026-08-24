# LearnBox current work

**Scope:** unfinished, unmerged work only. Check live Git and open pull requests first; this file
must be refreshed whenever its recorded branch is merged, abandoned or materially redirected.

## Active work registry

- **LB-DS-010 / NI-004 review schema and learner-scoped server core** — implemented on branch
  `worker/lb-ds-010-native-review-core` (uncommitted, no PR). Migration `0013_native_review_transport.sql`
  (TEXT `client_event_id` 1–128, `UNIQUE (user_id, client_event_id)`, server `applied_at`, canonical
  immutable `cards.content_id` with unique index + trigger, `bootstrap_approved_card_schedules`),
  `PostgresReviewEventStore` (learner-scoped exact-payload idempotency with
  `ReviewIdempotencyConflictError`, content-id resolution, bootstrap, schedule read),
  `MobileReviewBatchService` (max-20 ordered batch, generic typed per-item outcomes:
  `acknowledged`/`idempotencyConflict`/`validation`/`clockSkew`, typed batch failure). Local gates:
  API tests 93/93, migration validation (13), typecheck, build, `git diff --check`. No route,
  mobile code, flag or network activation.

## Agent work log

This log records what the development agent did and did not do on the current `main`, so the
other agent can pick up without re-deriving state. It does not define anyone's role.

### Done on 2026-08-18

- Rebased PR #65 (`chore/mobile-audio-assets`) on current `origin/main`, resolved the `pubspec.yaml`
  conflict (`assets/fonts/` + `assets/audio/` both kept), ran `flutter analyze` (clean) and full
  `flutter test` (66/66 pass). With owner approval for the force-push, PR #65 was merged.
- Opened PR #81 (`docs/audio-listening-qa`): recorded the de-DE listening QA for the six bundled
  Start-card clips (`das Haus`, `der Tisch`, `die Tür`) — each word clip verified as the exact
  displayed German phrase with its article (independent Whisper transcription; `die Tür` reads
  "Die Tür."). With owner approval for the force-push, PR #81 was merged.
- Confirmed LB-DS-001/002/003 are `accepted` and their PRs (#70, #73, #75, #76) are merged.

### Done on 2026-08-20

- PR #84 merged the reviewed pure offline Start Pack audio resolver after every required local and
  GitHub check passed. No player, dependency, provider, release flag or production path was added.
- PR #85 merged the provider-portable orchestration policy after independent high-reasoning review
  and green local and GitHub gates. No machine-local aliases, credentials or endpoints were added.

### Done on 2026-08-22

- PR #90 merged the no-dependency native offline pronunciation controls for all three Start cards
  after local/full CI, Android/iOS builds, emulator smoke, independent high-reasoning review and
  owner-confirmed physical Android listening QA for all six approved V2 clips.
- PR #94 merged the offline Today/Words/Progress learner shell after sequential lower-cost coding,
  full local and GitHub gates, emulator/physical visual smoke and independent high-reasoning review.

### Not done (open for the other agent)

- **Native identity + authenticated transport:** reviewed design and LB-DS-007/008 merged through
  PRs #97, #100 and #104. LB-DS-009 / NI-003 is now the sole authorized next slice; NI-004–NI-007
  remain unauthorized and unstarted.
- **Issue #92** is **CLOSED**: the physical Android secure-storage write failure was a local
  `--no-pub` artifact missing its generated plugin registrant, not a source defect, so no source fix
  was required.

## Known continuation gate

- Native offline pronunciation is now merged through PR #90 using only the approved V2 German word
  phrases and sentences. Closed PR #58 and its rejected V1 media remain historical and must never be
  restored. No network, provider or release path was enabled.
- PRs #60 and #61 merged after their required CI gates became available and green. Do not treat
  their historical billing note as an active blocker; always inspect live GitHub checks instead.

## Continuity note

- On 2026-08-13 PR #52 merged the owner-approved mobile review synchronization coordinator design.
  It keeps identity, transport and Production disabled and authorizes no network call.
- On 2026-08-13 PR #53 merged the test-driven implementation Plan and activated only `LB-DS-001`
  for DeepSeek. Tasks 2–4 remain Codex-owned; no implementation or network path was merged by that
  planning PR.
- On 2026-08-13 the reviewed `LB-DS-001` contract task merged through PR #56 after Codex corrected
  validation to require the full typed transport response. Flutter analysis, focused/full mobile
  tests and required CI passed. The routine worker task is closed.
- On 2026-08-14 PR #55 merged the remaining approved coordinator boundary: serialized queue
  snapshots, a maximum-20 foreground attempt, full acknowledgement validation, no-data-loss failure
  handling and one shared in-flight attempt. Production composition remains permanently dormant in
  this slice (`signedOut` identity plus disabled transport), so no upload, HTTP, credential, timer,
  background worker, Preview or Production path is active. Local full validation and required CI
  passed before merge.

- On 2026-08-13 PR #51 added the bounded DeepSeek routine-worker queue, Draft PR handoff protocol
  and CI validator. DeepSeek cannot merge its own work or claim unavailable Flutter, Android Studio,
  emulator, Xcode, APK-install or physical-device evidence. No routine task is authorized yet.

- The closed-alpha invite + consent boundary (`feature/closed-alpha-invite-consent`) was merged to
  `main` by the owner on 2026-08-09. No flag is enabled and no invitation has been sent.
- On 2026-08-10 the Stage 23 hardening work was recorded in `CHANGELOG.md` (PR #6) and the learner
  core-flow tests landed (PR #7). Merged remote branches carrying no unique work were removed from
  `origin` after owner approval; local `main` stays in sync with `origin/main`.
- On 2026-08-10 the disabled-by-default owner splash replacement and learner fallback-delivery
  boundary passed all local and GitHub quality gates and merged through PR #19. No migration was
  applied, no flag was enabled and no production splash was uploaded.
- On 2026-08-10 PR #21 permanently added the four Start Pack V2 validators to `pnpm check` and
  closed the implementation plan against merged PR #17/#18 evidence. No media object, provider,
  release flag or production environment was changed.
- On 2026-08-10 PR #23 (analytics negative coverage), PR #24 (registry note), PR #25
  (billing/content-model edge coverage), PR #26 (release/status corrections) and PR #27
  (registry synchronization) merged to `main` with green CI. On 2026-08-11 PR #28 recorded the
  owner-approved closed-alpha consent wording (`v1`) and the maximum group size of five. No
  provider, release flag, invitation or production surface was changed.
- On 2026-08-11 PR #29 reconciled the Stage 23 readiness documents: consent version `v1` is
  approved, while the actual participant list, invitation channel and approved-environment
  end-to-end run remain owner-gated.
- On 2026-08-12 PR #32 completed the owner-controlled invitation, SMS.ir OTP, secure-session and
  three-card private-media journey, returned every temporary Preview flag to `false`, and advanced
  the canonical storyboard to Stage 24. Production remained unchanged.
- On 2026-08-12 PR #34 added the Stage 24 local synthetic load foundation: a loopback-only runner,
  bounded smoke/baseline profiles, aggregate-only evidence and stopped-server recovery protocol.
  It passed local checks and green CI without Preview, Production, provider or real-user traffic.
- On 2026-08-12 PR #36 added the CPU-only learning-engine guardrail: 100,000 deterministic review
  transitions and 10,000 retry-queue events with invariant checks. It passed local checks and green
  CI without network, database, provider, Preview, Production or real-user traffic.
- On 2026-08-12 PR #39 added portable Flutter/VS Code setup documentation and workspace-relative
  Flutter tasks. On 2026-08-13 PRs #42–#46 added generated native hosts, tracked Android Gradle
  wrapper files, a CI debug-APK gate, approved static icon/launch assets and the packaged Flutter
  launch experience. The local Flutter toolchain and Android emulator completed a debug APK
  install/visual smoke. A Xiaomi M2006C3LG running Android 11 then completed the same debug APK
  install and visual smoke. On 2026-08-13 PR #49 merged the canonical three-card Start bundle,
  secure offline review queue and responsive Persian active-recall flow after every required CI
  gate passed. The full flow passed on that physical device with three pending events retained
  locally; evidence is in `docs/operations/STAGE_24_ANDROID_BASELINE.md`. Sync transport and native
  identity remain separate future boundaries.

## Continuity update

- Before starting a new task, verify `git branch --all`, `git status --short --branch` and the
  active pull requests. Add only real unfinished work here; do not carry completed milestones.
- On `main`, an empty registry is valid. The absence of an entry is not permission to overwrite a
  dirty worktree or duplicate an open branch.

## Owner action

No owner action is required. No provider, release flag or production service was enabled.
