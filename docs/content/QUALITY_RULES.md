# Quality rules

Reject linguistic errors, unsuitable images, malformed or distracting visuals, wrong embedded text, unverified pronunciation, unclear cultural references, and content without licensing/provenance.

Automated validation is a gate, not linguistic approval. A German-content reviewer must still check article, plural/conjugation, example naturalness, Persian meaning, CEFR appropriateness and the image/audio concept before publication.

For a vocabulary image, record semantic role, Bobo role, canonical version, semantic accuracy,
primary-concept clarity, mobile readability, generated text, watermark and clutter. Bobo may lead
actions and emotions, but never a concrete noun or place image. For audio, separately confirm the
word recording, sentence recording and absence of truncation or distortion. These fields are
required for a published vocabulary item and do not replace human linguistic review.

## Article-aware German audio

For a noun, word audio must speak the canonical `article + lemma`; article and noun use the same
qualified voice, and the card's canonical sentence audio uses that resolved role voice as well.
`der`, `die`, and `das` require three distinct stable voices; words without an article use the
recorded default voice. Each proposed model/voice pair requires a low-volume
candidate sample, provenance and checksum, explicit listener confirmation of `de-DE` / Hochdeutsch
pronunciation, audibly distinct article voices, and a cost record before it can be used. ASR or
provider success alone is not audio QA. See
[`PDR-010`](../product-decisions/PDR-010-ARTICLE-AWARE-AUDIO-AND-MEDIA-STANDARDS.md).

The review ledger has six required dimensions: German linguistic review, Persian translation,
provenance, visual QA, audio QA and app-flow validation. A pending check cannot be treated as a
pass; every completed result records the reviewer and review time.
