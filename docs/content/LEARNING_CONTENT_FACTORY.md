# Learning Content Factory

The Learning Content Factory is a real product capability for creating complete, high-quality German vocabulary packs from an Admin request. It is AI-assisted, batch-oriented and human-controlled; it is not a chat demo and AI cannot publish directly.

## Admin request

A manager can use a form or natural language:

> Create a complete B1 travel vocabulary pack with images, German pronunciation, examples and Persian translations. Do not repeat canonical words already used in the approved catalog.

The system converts this into a reviewable specification containing level, topic, target count, item types, required media and duplicate policy before generation begins.

## Pack output

Each official card can contain German lemma/display form, word type, article/plural where relevant, Persian meaning, CEFR level, topic, German example, Persian translation, word audio, example audio, image and alt text. A canonical vocabulary item can belong to multiple packs without duplicating its review state or media.

## Controlled job pipeline

```text
Admin request
→ specification preview
→ queued batch job
→ AI vocabulary/translation/example draft
→ normalization and exact/semantic duplicate scan
→ schema, German, Persian and CEFR validation
→ image and pronunciation generation/candidate attachment
→ media and licensing/provenance QA
→ human editorial review
→ pack readiness
→ versioned release or rejection
```

Jobs are batched so failures can be retried without regenerating a whole pack. Every card and asset retains provenance, version and validation state. AI success is never publication authority.

## Duplicate policy

- Exact duplicate: block automatically.
- Cross-pack canonical duplicate: reuse the vocabulary item and attach pack membership.
- Possible semantic duplicate: flag for editor decision.
- Personal user word: check against canonical catalog and that user's collection; keep unknown personal words separate from official content.

## Boundaries

- `packages/content-models/` owns stable schemas and deterministic validation.
- `services/content-factory/` owns provider-neutral orchestration.
- `services/content-pipeline/` owns job state and review gate.
- `apps/admin/` owns the future operator workflow.
- `content/packs/` owns versioned reviewed manifests and asset relationships.

The repository has schema, normalization, within-batch duplicate and review-gate foundations. The complete Admin generation UX, cross-pack duplicate index, production AI/media adapters and release operations are milestone M2 work. No provider credential or paid AI call belongs in a client.
