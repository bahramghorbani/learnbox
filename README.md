# LearnBox

LearnBox is a real online-first German vocabulary Leitner product for Persian-speaking learners. It is free to download, includes approximately 35 complete A1 words, and sells additional complete vocabulary packs.

## Start here

1. [`docs/PRODUCT_STATUS.md`](docs/PRODUCT_STATUS.md) — current feature inventory and truthful status.
2. [`PRODUCT.md`](PRODUCT.md) — product definition, platforms and commercial model.
3. [`ROADMAP.md`](ROADMAP.md) — outcome-based milestones and release criteria.
4. [`docs/architecture/SYSTEM_CONTEXT.md`](docs/architecture/SYSTEM_CONTEXT.md) — product and system boundaries.
5. [`docs/DOCUMENTATION_GOVERNANCE.md`](docs/DOCUMENTATION_GOVERNANCE.md) — rule for keeping docs current.
6. [`.ai/WORK_QUEUE.md`](.ai/WORK_QUEUE.md) and [`.ai/WORKSTREAMS.md`](.ai/WORKSTREAMS.md) — active work and worker model.
7. [`AI_BOOTSTRAP.md`](AI_BOOTSTRAP.md) and [`AGENTS.md`](AGENTS.md) — contributor rules.

## Surfaces

- `learnboxapp.com`: independent informational landing only; it is not connected to learner, admin or API.
- Learner Web App: online learner experience and interim iOS route.
- Android app: native online-first app with tolerance for temporary disconnects.
- Native iOS app: final App Store surface in a later milestone.
- Admin panel: AI-assisted content, media QA, pack release, catalog, pricing, commerce and operations.
- API/workers: account, learning state, sync, canonical vocabulary, content jobs, purchase verification and shared entitlements.

## Product model

The normal state is online. If connectivity drops, the client retains pending review actions safely and synchronizes them idempotently after reconnect. The free A1 starter has approximately 35 words. Premium packs are complete vocabulary products with images, pronunciation, examples and translations, generated with AI assistance and approved by a human before publication.

Payments are platform-specific: Web direct bank gateway, Android Cafe Bazaar in-app billing, and iOS Apple In-App Purchase. Prices and provider product IDs may differ; verified purchases map to a shared backend entitlement.

## Development

```bash
cp .env.example .env
docker compose up -d
pnpm install
pnpm check
pnpm dev
```

For Flutter:

```bash
cd apps/mobile
flutter pub get
flutter analyze
flutter test
```

Use the canonical status and roadmap before treating a component, test fixture or dormant flag as a released feature. Never commit secrets, real phone numbers, OTPs, receipts or provider credentials.
