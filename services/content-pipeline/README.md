# Content pipeline

Provider-agnostic, review-gated pipeline for schema validation, linguistic QA, visual/audio QA, licensing records, and versioned publishing.

The executable contract has four states: `queued`, `processing`, `awaiting_review`, and `failed`. A provider may only complete a processing job into `awaiting_review`; it has no publishing operation. The review result comes from `@learnbox/content-models` and always requires a human editor.
