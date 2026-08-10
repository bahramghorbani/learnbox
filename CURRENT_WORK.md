# LearnBox current work

**Scope:** unfinished, unmerged work only. Check live Git and open pull requests first; this file
must be refreshed whenever its recorded branch is merged, abandoned or materially redirected.

## Active work registry

| Branch | Scope | Current checkpoint | Next bounded work |
| --- | --- | --- | --- |
| `feat/owner-splash-replacement` | Owner-only splash replacement boundary | Persistence, atomic private-Blob replacement, protected routes and the single-owner upload UI are implemented; all release flags remain disabled. | Add operational validation, activation guidance and complete the branch quality gates. |

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
