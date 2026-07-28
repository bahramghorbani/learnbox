# ADR 0004 — AvalAI media-generation seam

- **Status:** accepted
- **Date:** 2026-07-28

## Context

LearnBox needs five transparent Bobo expressions, controlled vocabulary images and German
pronunciation audio. The owner provided an AvalAI API account. Generated media must not bypass
the existing editorial and receipt gates, and Bobo's approved `1.0.0` identity must remain intact.

## Decision

- Keep the provider credential only in local `.env.avalai.local`; never commit or expose it to the
  web client.
- Use AvalAI `gpt-image-1.5` at high quality for Bobo reference edits, because character
  consistency and precise identity preservation matter more than the lowest per-image price.
- Generate Bobo outputs on a flat chroma-key background, remove that key locally, validate alpha,
  and keep every result as a review candidate until a human visually approves it.
- Do not replace any canonical Bobo asset, attach media to cards or publish generated output as a
  consequence of successful generation alone.
- Benchmark a lower-cost provider/model separately for concrete vocabulary images before bulk
  production; it must pass semantic, mobile-readability and visual-QA checks.

## Pilot result

The `start-a1-tisch` pilot passed visual QA at 1024×1024 with AvalAI `flux.2-pro`: the table is
unambiguous, dominant, free of generated text and readable at card size. Its recorded provider
cost was `0.03` unit. Use this model for simple concrete-object card candidates. Do not ask it to
draw Bobo; when Bobo is genuinely useful, reuse a separately approved transparent Bobo asset in a
reviewed composition instead.

The first 20-card candidate batch exposed seven text or semantic failures. Those candidates were
discarded and regenerated with prompt-specific visual directions; the resulting 20 candidates
passed visual review. Forty German `word` and `sentence` audio candidates were generated with
`eleven_flash_v2_5` and passed file-format and duration checks. Neither candidate set is attached
to a published card or a production media receipt.

## Consequences

The local commands `pnpm check:avalai` and `pnpm generate:avalai:bobo -- <expression>` are
operator tools, not runtime product features. The latter incurs provider cost and writes only
review candidates outside the repository. Media remains subject to the planned checksum, URL and
QA receipt validation before any later attachment decision.

## Reversal trigger

Replace AvalAI if it cannot reliably preserve Bobo's approved silhouette, its cost-quality ratio
is no longer appropriate, or its API terms and availability no longer meet LearnBox requirements.
