# LearnBox

LearnBox is a real online-first German vocabulary Leitner product for Persian-speaking learners. It is free to use, includes 35 complete A1 words, and will sell additional complete vocabulary packs.

## Release state

**Web/PWA v1 is LIVE and closed.** The learner app is publicly reachable at `app.learnboxapp.com` with the free 35-card A1 Starter pack. Future work begins at v1.1; see [`BACKLOG.md`](BACKLOG.md).

The deployed application source is recorded in [`PROJECT_STATE.md`](PROJECT_STATE.md). Repository `main` may advance beyond it with documentation-only commits; that is not application drift.

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
- `app.learnboxapp.com`: the LIVE learner Web/PWA app — the v1 release surface.
- Android app: native online-first app, deferred to v1.1.
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
