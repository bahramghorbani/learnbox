# Content Factory

The factory prepares controlled content batches for human review. It normalizes German lemmas,
finds deterministic within-batch duplicates and validates the reusable `LearningVocabularyItem`
contract. It cannot publish a batch and it does not call AI, image, audio or payment providers.

The first intended use is the 20-item LearnBox Start vertical slice. Production media and release
remain separate human-reviewed stages.
