# Active agent brief

Use this brief after `AGENTS.md` and `AI_BOOTSTRAP.md`. The canonical product status is [`docs/PRODUCT_STATUS.md`](../../docs/PRODUCT_STATUS.md); this file is only an execution aid.

## Current product truth

- LearnBox is an online-first German vocabulary Leitner product, not an offline-only app and not a prototype.
- The free app includes approximately 35 complete A1 words; premium vocabulary packs are purchased separately.
- Temporary connectivity loss is tolerated by a durable local queue and idempotent reconnect sync.
- `learnboxapp.com` is an independent informational landing site and must not be coupled to learner, admin, API or private media.
- Web is the current learner/iOS interim surface; Android is native; native iOS is a later App Store milestone.
- Payments: Web direct bank gateway, Android Cafe Bazaar, iOS Apple IAP; prices/product IDs differ, entitlement is shared server-side.
- AI can generate pack drafts and media candidates; human review is required before publication.

## Read order

1. `AGENTS.md`
2. `AI_BOOTSTRAP.md`
3. `PROJECT_STATE.md`
4. `docs/PRODUCT_STATUS.md`
5. `ROADMAP.md`
6. `.ai/WORK_QUEUE.md` and `.ai/WORKSTREAMS.md`
7. `CURRENT_WORK.md` for unmerged work
8. Task-specific design, tests and operations docs

## Delivery model

Work by milestone and grouped workstream, not serial micro-tasks. Use independent worktrees only for genuinely independent paths. Auth/session, database, payments, infrastructure, release and legal/store work remain serial with high-reasoning review.

## Safety

- Do not call paid providers, use real payment, send OTP, enable Production, mutate DNS, enter secrets or perform destructive actions without the relevant owner gate.
- Never claim prototype/test code is a released feature.
- Never add secrets, receipts, phone numbers, OTPs or personal data to docs, logs or handoffs.
- Keep Splash, Profile, Settings, Progress, Purchases, Personal Vocabulary and Sync Status in product scope.
