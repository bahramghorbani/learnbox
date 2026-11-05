# ADR 0018 — Admin publishes dictionary releases into a shared release directory

- **Status:** accepted (owner approved one-click publishing from the Admin panel on 2026-11-05)
- **Date:** 2026-11-05
- **Extends:** [ADR 0017](0017-public-dictionary-read-only-release-file.md)

## Context

Since PR #534 the whole dictionary lives in the Admin editorial table (`dictionary_editorial_entries`)
and the owner wants every step after editing to be automatic: no off-host build, no file copy, no
landing restart. ADR 0017 requires the public site to keep reading only an immutable SQLite file with
no database credential.

## Decision

- One host directory (`/home/ubuntu/learnbox/dictionary/published`) holds the release files,
  `current.json` (which file is live) and `history.json`. Admin mounts it read-write, the landing
  mounts it **read-only** and is given `LEARNBOX_DICTIONARY_DIR`.
- **Publish** (Admin, super admin + CSRF + recent sign-in): copy the live release, apply every
  approved editorial row over it (deleted rows remove the word; queued drafts wait), keep fields the
  editor does not show (forms, tables, audio, IPA), then run the gates: SQLite integrity, no drop of
  more than 2% of words, search index complete, every word has a Persian meaning, German and Persian
  search smoke queries. Only a passing file becomes live, by an atomic rename of `current.json`.
  A failing build is deleted and the site keeps the live release.
- **Rollback** points `current.json` back at the previous release file.
- The landing re-reads `current.json` at most every 10 seconds and reopens the new file; no restart.
- Publish and rollback are written to `audit_logs` (`dictionary_release.*`). The five newest
  release files are kept, plus the live and previous ones.
- `LEARNBOX_DICTIONARY_FILE` (one mounted file) still works when the directory is not configured.

## Consequences

- The landing still has no database credential and opens files read-only; ADR 0009/0017 hold.
- Admin, which already holds a database credential, gains write access to one data directory only.
- No schema change: release state is files plus audit rows.
- A bad edit can reach the site within seconds; the gates catch structural damage, the rollback
  button covers content mistakes.
