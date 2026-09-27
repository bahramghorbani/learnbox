# Content Factory service

The service prepares complete AI-assisted German vocabulary pack drafts for the protected Admin workflow. It is part of the real product architecture, not a prototype shortcut.

## Intended workflow

Admin request → structured specification → queued batches → vocabulary/example/translation/media candidates → schema and linguistic validation → exact and semantic duplicate checks → human review → versioned pack release.

The service must never publish AI output directly. It records job state, provenance, validation findings and retryable batch boundaries. Official canonical vocabulary items are reusable across packs; personal user vocabulary is a separate boundary.

## Current repository boundary

The provider-neutral contract and batch validator exist. Complete generation adapters, cross-pack duplicate index, media provider integration, Admin job UI and production release operations are planned under M2 in `ROADMAP.md`.
