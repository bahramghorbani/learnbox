# Content schema

Cards are versioned records containing stable ID, lemma and normalized lemma, article, part of
speech, CEFR, Persian meaning, simple German definition, plural or essential conjugation,
pronunciation metadata, practical examples/translations, grammar note, tags, difficulty, visual
concept, image prompt, media references, QA status, provenance and source/version metadata.

The executable foundation is [`@learnbox/content-models`](../../packages/content-models/src/index.ts). A published card requires a positive version, German lemma, valid Persian meaning, complete examples, HTTPS media references, unique media IDs and approved media. AI-originated suggestions cannot publish directly; they must become human-reviewed editorial content first.

`LearningVocabularyItem` is the additive production contract for packs. It preserves the existing
`WordCardDraft` review flow while requiring the factory metadata needed for a reviewed Start item.
The status model also includes `rejected`; rejection is a recorded editorial outcome, not deletion.
