# LearnBox current work

**Scope:** unfinished, unmerged work only. Check live Git and open pull requests first; this file
must be refreshed whenever its recorded branch is merged, abandoned or materially redirected.

## Active work registry

| Work item                                            | Branch                         | State                                       | Resume rule                                                                                                               |
| ---------------------------------------------------- | ------------------------------ | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Owner-only passkey sign-in and direct splash control | `feature/owner-passkey-splash` | Unmerged, default-disabled where applicable | Read its branch plan, direct tests and diff before editing. Do not duplicate its UI or activation work on another branch. |

## Continuity update

- Before starting a new task, verify `git branch --all`, `git status --short --branch` and the
  active pull requests. Add only real unfinished work here; do not carry completed milestones.
- On `main`, an empty registry is valid. The absence of an entry is not permission to overwrite a
  dirty worktree or duplicate an open branch.

## Owner action

No technical action is required for the recorded work. Any credential, production activation,
paid provider, legal or irreversible action remains owner-gated under `AGENTS.md`.
