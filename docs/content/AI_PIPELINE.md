# AI pipeline

AI suggests content; it does not silently publish. Generation → schema/linguistic/visual/audio checks → human review gate → versioned publish → rollback. Never rely on live AI in a core review interaction.

## Executable first gate

`evaluateAiSuggestion` is the deterministic entry gate in `@learnbox/content-models`. It accepts an AI-originated draft plus a bounded confidence score and returns either `auto_validated` or `needs_review`. Both outcomes require a named editor to approve the content before it can become `published`; automated success is never publication authority.

The current gate covers structural schema validity, media transport and version checks, AI provenance, and confidence bounds. A later provider adapter may generate drafts, but it must supply no secrets to the client and must send every output through this gate. German linguistic review, licensing/provenance review, and image/audio review remain mandatory human steps.
