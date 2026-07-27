# PDR-002 — Free-to-paid strategy

- **Status:** approved
- **Date:** 2026-07-27

## Context

Learners need to experience the core review loop before a serious purchase request.

## Decision

`learnbox_start` offers about 350 selected A1 words and practical expressions, 10–15 recommended
new words daily, unlimited due and learned-content review, images, standard audio, basic Bobo,
XP, levels, missions, streak, basic statistics and about 30 personal words. Limits are remote
configuration, not client constants.

A serious Plus offer is never shown on day one and becomes eligible only after configurable
value signals (80–100 learning-cycle words, three sessions, three active days, first collection
or meaningful report). The default supportive copy is: «تا اینجا خیلی خوب پیش رفتی! برای ادامه
مسیر و دسترسی به مجموعه‌های کامل‌تر، LearnBox Plus کنارت هست.»

## Rationale

Value before payment protects trust and makes conversion a voluntary continuation.

## Affected systems

Entitlements, remote config, paywall, analytics, content selection, admin configuration and
learner clients.

## Consequences and implementation notes

Never block due reviews or remove learned free content. Do not use fear, guilt, countdowns,
streak threats or false scarcity. Plus may later add complete levels, specialist packs, expanded
personal vocabulary, practice modes, reports, cached AI explanation and cross-device sync.

## Metrics

`free_pack_started`, `first_session_completed`, `learned_word_count_25`,
`learned_word_count_50`, `learned_word_count_100`, `paywall_eligible`, `paywall_viewed`,
`paywall_dismissed`, `subscription_started`, `subscription_completed`, `subscription_failed`,
`free_content_completed`, `personal_word_limit_reached`.

## Reversibility

Eligibility thresholds, display copy and offered features are versioned remote config. A real
purchase provider remains blocked pending owner approval, account and terms.
