# LearnBox current work

**Scope:** unfinished, unmerged work only. Check live Git and open pull requests first; this file
must be refreshed whenever its recorded branch is merged, abandoned or materially redirected.

## Active work registry

- **Branch:** `docs/sync-alpha-readiness`.
  **Purpose:** reconcile the stable alpha state after merged PRs #25–#28 and record the exact
  remaining Stage 23 exit inputs.
  **State:** documentation only. No release flag, invite code, provider credential, participant
  data, upload, database migration or production environment is changed.
  **Ready when:** documentation checks and GitHub CI are green; the branch then merges and this
  registry is cleared in a follow-up state record.

## Continuity note

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

## Continuity update

- Before starting a new task, verify `git branch --all`, `git status --short --branch` and the
  active pull requests. Add only real unfinished work here; do not carry completed milestones.
- On `main`, an empty registry is valid. The absence of an entry is not permission to overwrite a
  dirty worktree or duplicate an open branch.

## Owner action

No technical action is required for the current repository state. Any credential, production
activation, paid provider, legal or irreversible action remains owner-gated under `AGENTS.md`.
