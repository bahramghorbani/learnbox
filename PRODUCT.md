# LearnBox product definition

LearnBox is an online-first German vocabulary Leitner application for Persian-speaking learners. The free app gives every user an approximately 35-word A1 starter collection. Learners can buy additional complete vocabulary packs, review them daily, track progress and keep their learning state across Web and mobile.

## User promise

A Persian-first, calm and effective way to learn German vocabulary through active recall, spaced review, useful examples, images and pronunciation. The service remains usable during a temporary internet interruption: local review actions are retained and synchronized when connectivity returns.

## Platforms

- Informational landing: `learnboxapp.com`, independent and not coupled to the product backend.
- Learner Web App: online learner product and interim iOS experience.
- Android: native online-first learner app with offline tolerance.
- iOS: native App Store app in a later release.
- Admin: protected content, pack, commerce and operations panel.

## Commercial model

The app is free to download. The free A1 starter pack is included. Premium packs are one-time vocabulary products initially; subscriptions are deferred until the one-time pack model is proven.

Payment is platform-specific:

- Web: direct Iranian bank gateway.
- Android: Cafe Bazaar in-app billing.
- iOS: Apple In-App Purchase / StoreKit.

Each provider is verified server-side and produces a shared entitlement for the canonical pack. Prices, offers, currency and provider product IDs are separate per platform.

## Content model

Official packs are generated with AI assistance but cannot be published automatically. A pack must pass schema, CEFR, linguistic, duplicate, image, pronunciation and human editorial review. A canonical vocabulary item may belong to multiple packs without duplicating its learning state or media.

Users may add personal words. Existing official words are reused; new personal words remain separate from official catalog content and may receive AI suggestions without becoming publishable official content.

## Product principles

- Real product UX, not a prototype disguised as a release.
- Online-first, offline-tolerant.
- Persian RTL with correct German LTR isolation.
- One account and shared learning/entitlement model across surfaces.
- Human approval for AI content and commercial release.
- Measurable, reversible and observable production changes.
