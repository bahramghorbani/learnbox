# Media worker

Validates the receipt of versioned image/audio derivatives against an approved media plan. It does
not generate, attach or publish assets. A receipt needs a matching content ID, versioned storage
key, HTTPS URL, suitable MIME type, SHA-256 checksum and explicit QA approval before it is merely
eligible for a later attachment decision.

## AvalAI local connection

AvalAI credentials remain local in `.env.avalai.local`, which is ignored by Git. After the owner
enters `AVALAI_API_KEY` in that file, run `pnpm check:avalai` to make a read-only credit request.
This is deliberately separate from media generation, storage, attachment, and publication.

The local Bobo review-candidate command is `pnpm generate:avalai:bobo -- <expression>`. It is a
paid, manual operator action; generated files remain outside the repository until visual QA and
an explicit attachment decision. See `docs/architecture/ADR/0004-avalai-media-generation-seam.md`.
