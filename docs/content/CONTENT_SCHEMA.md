# Content schema

Cards are versioned records containing lemma, article, part of speech, CEFR, Persian meanings, examples/translations, grammar notes, collocations, media references, QA status, license provenance, and source/version metadata.

The executable foundation is [`@learnbox/content-models`](../../packages/content-models/src/index.ts). A published card requires a positive version, German lemma, valid Persian meaning, complete examples, HTTPS media references, unique media IDs and approved media. AI-originated suggestions cannot publish directly; they must become human-reviewed editorial content first.
