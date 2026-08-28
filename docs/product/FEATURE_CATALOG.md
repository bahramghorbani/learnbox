# LearnBox feature catalog

This is the compact product catalog. The detailed status of every item is in [`docs/PRODUCT_STATUS.md`](../PRODUCT_STATUS.md). A feature is not a release feature merely because a component, test, flag or design exists.

## Learner app

- Launch splash and calm startup experience.
- Online-first account and session.
- Today daily review with active recall.
- Leitner/adaptive scheduling.
- Free A1 starter collection of approximately 350 words.
- Premium vocabulary packs.
- Words/catalog browsing.
- Personal vocabulary with exact and possible-duplicate checks.
- Progress, streak and pack completion.
- Profile, settings, purchases, packs, sync status and support.
- German pronunciation, examples and images.
- Temporary offline tolerance with durable local pending review events and idempotent reconnect sync.
- Web learner app as the immediate iOS path; native iOS as a later App Store product.

## Content and AI factory

- Admin natural-language pack request, for example: “Create a B1 travel vocabulary pack.”
- Structured generation specification preview before a job starts.
- Batch generation of vocabulary, translations, examples, images and pronunciation.
- CEFR, linguistic, schema, media and duplicate validation.
- Canonical vocabulary items reusable across packs.
- Human review, rejection, regeneration and release gates.
- Pack versioning, release, retirement and rollback.
- Personal user words remain separate from official published content.

## Admin and operations

- Passkey/protected admin boundary.
- Content review workspace.
- Pack builder and readiness panel.
- Media QA and release manifest.
- Splash replacement control remains owner-only operational tooling.
- Catalog, platform offers, pricing and product identifiers.
- Purchases, entitlements, refunds/revocations and audit history.
- User/cohort/support operations.
- Provider, job and service health visibility.

## Commerce

- Free app and free A1 entitlement.
- Web direct bank gateway.
- Android Cafe Bazaar in-app billing.
- iOS Apple In-App Purchase.
- Platform-specific price and offer records.
- Server-side verification and shared pack entitlements.
- Restore, refund, revoke and support reconciliation.

## Product boundaries

- `learnboxapp.com` is a standalone informational landing site.
- Learner Web, mobile apps, Admin and API are separate product surfaces.
- Provider secrets never enter clients.
- AI never publishes directly.
- Payment clients never grant entitlement without server verification.
- Temporary offline operation is a resilience mode, not a replacement for the online backend.
