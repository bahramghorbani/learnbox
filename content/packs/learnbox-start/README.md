# LearnBox Start content pack

This is the controlled source location for `learnbox_start_a1_essentials`. No learner-facing
content is committed here until the 20-item vertical slice passes linguistic, visual, audio and
in-app validation. Stable content IDs name all derived media and preserve rollback links.

Expected directories: `vocabulary/`, `examples/`, `grammar/`, `prompts/`, `images/`, `audio/`,
`validation/`, and `versions/`. Empty directories are intentionally not tracked until the first
reviewed batch exists.

`validation/start-a1-slice-candidates.json` is a source-referenced intake basket, not published
content. It contains neither learner-facing translations/examples nor media and must pass German
and Persian editorial review before individual cards are drafted.

`vocabulary/start-a1-vertical-slice-drafts.json` contains the matching 20 structured linguistic
drafts. They are review-queued AI-assisted material: no production media, visual/audio QA or
publication claim is present.

`validation/start-a1-slice-review-queue.json` records the review boundary for this batch. It is
publication-blocked until every named linguistic, media and in-app validation step is complete.

`prompts/start-a1-slice-media-production-spec.json` records the stable asset naming and QA
requirements for future image and audio work. Its state is planning-only; it has no provider
configuration or production media.

## Local candidate media — 2026-07-28

The `images/` directory contains 20 visually reviewed, local image candidates. The `audio/`
directory contains 40 local de-DE audio candidates (one word and one example sentence for each
item). The audio transcription check matched all 40 expected German strings; its evidence is in
`validation/start-a1-avalai-audio-transcription-qa.json`.

These files are versioned candidate material only. They are not attached to learner cards, do
not change the planning-only media handoff, and are not published. Publication remains blocked
until the existing linguistic, provenance, visual, audio and in-app gates are closed.

`validation/start-a1-provenance-ledger.json` records page-level lexical-scope evidence from the
official Goethe A1 list, clearly separates LearnBox's original editorial text from that source,
and records the platform-terms assessment for candidate media. Production attachment and
owner-release gates still apply.

`validation/start-a1-candidate-qa.json` records candidate-stage passes for provenance, visual,
audio and local app flow. It explicitly does not attach or publish media; release still needs
production receipts and owner approval.
