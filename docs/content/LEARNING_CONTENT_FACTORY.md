# Learning Content Factory architecture

## Boundaries

- `packages/content-models/`: stable schemas, statuses and deterministic validation.
- `services/content-factory/`: provider-neutral orchestration adapters and repeatable scripts.
- `services/content-pipeline/`: current job-state and human-review gate foundation.
- `apps/content-admin/`: review, rejection, publisher separation, audit and later configuration UI.
- `content/packs/`: versioned manifests and reviewed source/asset relationships.

## Controlled pipeline

`candidate → normalization → duplicate check → linguistic generation → schema validation → German validation → Persian validation → CEFR validation → visual concept → image prompt → image generation → Bobo/semantic visual QA → audio generation → audio QA → staging → app validation → approved versioned release`

An item may be `rejected` at any gate. AI success only reaches an editorial queue; it cannot publish. Use stable content IDs in media paths, explicit batch versions and a release manifest to support audit, replacement and rollback.

## Initial implementation boundary

The repository now has the data contract, pack manifest and a provider-free batch validator in
`@learnbox/content-factory`. It normalizes lemmas, finds within-batch duplicates and validates a
batch only for human review; it cannot publish or call an external provider. Provider adapters,
audio/image generators, content-admin release controls and bulk generation stay backlog tasks.
Paid external services are inactive pending cost estimate and explicit owner approval.

The content model now also records provider-free visual and audio QA. Publication requires the
recorded semantic, Bobo, mobile-readability, text/watermark/clutter and audio checks to pass.
