# PDR-003 — Bobo visual vocabulary

- **Status:** approved
- **Date:** 2026-07-27

## Context

Bobo supports memory but the German meaning must remain clearer than the mascot.

## Decision

Use Bobo as the main subject for actions, emotions and human situations when helpful. For
concrete nouns the object dominates; for places the environment dominates; for abstract concepts
use one simple Bobo scenario only when it improves comprehension. Around 70% presence is an art
direction target, not a quota.

## Rationale

This keeps images memorable without sacrificing semantic clarity or making cards look alike.

## Affected systems

Content model, prompt generation, media QA, Bobo system, card UI and performance budgets.

## Consequences and implementation notes

One primary concept; no generated text or watermark; controlled background; soft 3D; canonical
Bobo only; no unauthorized changes to face, body, eyes, ears or silhouette. Validate semantics,
hierarchy, mobile-card readability, clutter, cultural ambiguity, similarity and asset size.

## Metrics

Track visual-QA rejection reason, semantic report rate, card-media load cost and confused-card
feedback. Do not infer a hard Bobo quota from analytics.

## Reversibility

Prompt and art-direction rules are versioned per asset; canonical Bobo changes still require
explicit owner approval.
