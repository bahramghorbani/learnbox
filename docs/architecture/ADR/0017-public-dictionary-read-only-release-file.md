# ADR 0017 — Public German–Persian dictionary served from a read-only release file

- **Status:** accepted (owner approved the dictionary plan and its visual design on 2026-11-04;
  this ADR selects the storage boundary that keeps ADR 0009 intact)
- **Date:** 2026-11-04

## Context

The owner approved a free public German–Persian dictionary at `learnboxapp.com/dictionary`
(served by the landing container) as an SEO and acquisition surface that leads to LearnBox packs.
The plan proposed a Postgres `dictionary` schema read by the landing through a new read-only role.

[ADR 0009](0009-co-hosted-isolated-web-surfaces.md) gives the landing **no database values**. A
landing database credential, even a read-only one, would put the shared Production Postgres
(learner progress, payments) one compromised public container away from the internet, and public
search traffic would compete for the 60 shared connections.

The running landing image (`node:22-bookworm-slim`, Node 22.23) ships the built-in `node:sqlite`
module with FTS5. A probe in the Production landing container on 2026-11-04 confirmed that a
`trigram remove_diacritics 1` index matches `turschl` to `Haustürschlüssel`.

## Decision

- Each dictionary **release** is one immutable SQLite file built off-host from open sources
  (German Wiktionary via kaikki, farhang, Tatoeba), with a sha256 and a validation report.
- The landing opens the active release file **read-only** with `node:sqlite`; no new dependency
  and no database credential. Search uses FTS5 trigram indexes on lemmas, inflected forms and
  Persian glosses.
- The file is mounted into the landing container read-only. Activating or rolling back a release
  is switching which verified file is mounted, then restarting only the landing.
- Pages are server-rendered and cached; the feature stays behind
  `LEARNBOX_DICTIONARY_ENABLED` (default off: `/dictionary` returns 404).
- Anything that writes stays in the learner app, which already owns a database credential:
  saved words after phone login and error reports. The landing only links to the app.
- The visual reference is locked: `docs/design/dictionary/index.html`. A built page is accepted only
  after a visual comparison against the screenshots in `docs/design/dictionary/shots/`.

## Consequences

- No schema change, role, or connection is added to Production Postgres for the public read path,
  and the core tables cannot be reached from the dictionary at all.
- Search load never touches the learner database.
- Release history is a set of files that are retained like backups (three latest kept).
- Admin editing and AI review (phase 2) need a writable store; that design is decided separately
  and must still publish through this release-file boundary.

## Reversal trigger

Revisit if the release file exceeds what the landing host can memory-map comfortably (roughly
2 GB), or if the public site needs per-request writes that cannot go through the learner app.
