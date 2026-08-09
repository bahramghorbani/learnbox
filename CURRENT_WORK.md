# LearnBox current work

**Scope:** unfinished, unmerged work only. Check live Git and open pull requests first; this file
must be refreshed whenever its recorded branch is merged, abandoned or materially redirected.

## Active work registry

- **Closed-alpha invite + consent boundary** — `feature/closed-alpha-invite-consent`: allowlist
  invite gate, keyed-hash persistence (migration 0010) and consent versioning, all disabled by
  default. Plan: `docs/superpowers/plans/2026-08-09-closed-alpha-invite-consent.md`. Ready for PR
  once GitHub auth is restored; no flag enabled, no invitation sent.
- **Local verification limitation (2026-08-09):** the full `pnpm check` cannot complete on this
  machine because the registry is network-blocked. `pnpm install` cannot fetch the admin
  `@simplewebauthn/*` deps (merged in PR #3) or `iconv-lite@0.6.3`; an interrupted reinstall also
  left local links restored by hand. All api + website tests, typecheck, lint, format and every
  `verify:*` boundary script pass locally; admin typecheck, the final `next build` worker step and
  `pnpm audit` require network/CI. CI runs `pnpm install --frozen-lockfile` with network and is
  expected green. PR creation pending the owner's `gh auth refresh`.

## Continuity update

- Before starting a new task, verify `git branch --all`, `git status --short --branch` and the
  active pull requests. Add only real unfinished work here; do not carry completed milestones.
- On `main`, an empty registry is valid. The absence of an entry is not permission to overwrite a
  dirty worktree or duplicate an open branch.

## Owner action

No technical action is required for the current repository state. Any credential, production
activation, paid provider, legal or irreversible action remains owner-gated under `AGENTS.md`.
