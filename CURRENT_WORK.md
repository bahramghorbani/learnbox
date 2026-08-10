# LearnBox current work

**Scope:** unfinished, unmerged work only. Check live Git and open pull requests first; this file
must be refreshed whenever its recorded branch is merged, abandoned or materially redirected.

## Active work registry

- **Branch:** `feat/start-pack-media-v2`.
  **Purpose:** produce the 20-card Start V2 media set from the owner-approved `Haus`, `Wasser`, and
  `Brot` visual standard.
  **State:** the visual contract and local AvalAI generator are committed. Network access was
  restored on 2026-08-10; all 20 local 1024px candidates now exist and are versioned in the
  content pack. `Haus`, `Wasser`, and `Brot` are the owner-approved pilot files; the other 17
  passed the first visual QA sweep. The existing 40 German audio candidates were re-validated.
  V2 media is not yet runtime-attached or uploaded to private storage.
  **Current external blocker:** none for generation. Attachment remains intentionally gated on
  audio re-validation, complete media receipts, and the existing private-storage validator.
  **Boundary:** generated V2 media stays candidate-only until complete visual/audio QA, private
  storage receipt validation, and a dedicated attachment decision; no release flag changes.

## Continuity note

- The closed-alpha invite + consent boundary (`feature/closed-alpha-invite-consent`) was merged to
  `main` by the owner on 2026-08-09. No flag is enabled and no invitation has been sent.
- On 2026-08-10 the Stage 23 hardening work was recorded in `CHANGELOG.md` (PR #6) and the learner
  core-flow tests landed (PR #7). Merged remote branches carrying no unique work were removed from
  `origin` after owner approval; local `main` stays in sync with `origin/main`.

## Continuity update

- Before starting a new task, verify `git branch --all`, `git status --short --branch` and the
  active pull requests. Add only real unfinished work here; do not carry completed milestones.
- On `main`, an empty registry is valid. The absence of an entry is not permission to overwrite a
  dirty worktree or duplicate an open branch.

## Owner action

No technical action is required for the current repository state. Any credential, production
activation, paid provider, legal or irreversible action remains owner-gated under `AGENTS.md`.
