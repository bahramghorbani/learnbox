# ADR 0003: AI content review gate

## Context

LearnBox uses AI to propose learning content, but a faulty translation, grammar field, media reference, or license record must never reach learners automatically.

## Decision

Represent the lifecycle explicitly as `draft`, `ai_generated`, `auto_validated`, `needs_review`, `approved`, `published`, or `deprecated`. Run every AI suggestion through a deterministic schema and confidence gate. The gate may classify a suggestion as `auto_validated`, but always returns `requiresHumanReview: true`; only an explicit editorial action may approve and publish it.

## Consequences

The initial implementation is provider-agnostic and testable without an AI credential. It records no generated learner content and can be extended with dictionary, duplicate, visual, audio, and license checks. A future high-confidence auto-publication proposal would require a new ADR, security review, and owner approval.

## Reversal trigger

Replace this gate only if a stronger content workflow preserves the same no-silent-publication guarantee and a complete audit trail.
