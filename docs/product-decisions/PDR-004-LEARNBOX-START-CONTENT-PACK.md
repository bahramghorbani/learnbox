# PDR-004 — LearnBox Start content pack

- **Status:** approved
- **Date:** 2026-07-27

## Context

The permanent Start tier requires a useful, controlled A1 foundation rather than an alphabetical
or unreviewed word list.

## Decision

Create `learnbox_start_a1_essentials`, displayed as “LearnBox Start — German A1 Essentials”,
with a target of about 35 high-value German A1 words and practical expressions. Selection uses
CEFR fit, practical frequency, migration relevance, progression, duplicate avoidance and visual
teachability across greetings, people, home, food, shopping, time, transport, city, work, health,
weather, clothing, core verbs/adjectives, questions and early administration.

## Rationale

The pack teaches the product loop, creates measurable progress and gives a natural route to Plus.

## Affected systems

Content schema, content factory, media pipeline, scheduling, offline data, progress, admin and
paywall signals.

## Consequences and implementation notes

Every item carries stable ID, normalized lemma, article/POS, Persian meaning, simple German
definition, CEFR, inflection, pronunciation, word and sentence audio, example plus Persian,
grammar note, tags, difficulty, visual concept/prompt, validation, version and provenance. Build
a balanced 20-item slice first, validate it in the app, then make versioned batches of up to 35;
never generate all 35 media assets at once.

## Metrics

Measure card completion, review outcomes, asset failures, offline readiness, QA rejection and
retention only with privacy-safe aggregate events.

## Reversibility

Each batch and asset is versioned and rollback-capable. The manifest remains `draft` until its
vertical slice is approved.
