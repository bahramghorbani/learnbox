# ADR 0013 — Start Pack ↔ canonical contentId contract (M1)

- **Status:** accepted decision contract; seed/catalog/reconciliation implementation requires separately authorized queue tasks
- **Date:** 2026-08-30
- **Basis:** `origin/main` at `bab5e57` (PR #166). Read with `docs/architecture/M1_ONLINE_LEARNING_CONTRACT.md`, ADR 0012, `docs/product-decisions/PDR-004`, and `database/migrations/0013_native_review_transport.sql`.

## Context

The bundled Start Pack is the free A1 vertical slice shipped inside the learner surfaces:

- The Flutter surface resolves exactly three canonical bundled card IDs — `start-a1-haus`,
  `start-a1-tisch`, `start-a1-tuer` — via `BundledStartPackRepository` (enforces the exact
  ID set) and `StartPackAudioAssets` (maps those IDs to approved V2 audio assets).
- The web surface ships the same bundled Start slice as a device-local prototype
  (`learnbox:review-sync:v1:local-prototype`, `apps/website/app/LearnerHome.tsx`).
- The content factory owns a 20-item draft batch in
  `content/packs/learnbox-start/vocabulary/start-a1-vertical-slice-drafts.json`, where each
  item's `id` is the stable identity (e.g. `start-a1-haus`). These drafts are
  `needs_editorial_review`; the manifest `content/packs/learnbox-start/manifest.json` remains
  `releaseStatus: "draft"`. PDR-004 names the target pack
  `learnbox_start_a1_essentials` (~35 words). No draft is approved or published content.
- The server's canonical content identity is `cards.content_id`: `TEXT NOT NULL`, 1–128
  characters, unique, immutable via trigger `cards_content_id_immutable`, backfilled
  `'legacy-' || id` for legacy rows (migration 0013). Server review writes resolve
  `contentId → cards.id` **only** for cards that have an `approved`/`published`
  `card_versions` row (`PostgresReviewEventStore.resolveCardId`); schedule bootstrap
  (`bootstrap_approved_card_schedules`) inserts learner schedules only for approved/published
  cards. `review_events` is keyed by `cards.id` (`card_id`), never by `content_id`.
- The web learner-state read (`GET /api/learner/state`, PR #163) returns both
  `schedules[].cardId` (DB UUID) and `schedules[].contentId` (canonical `cards.content_id`)
  in every schedule row (`learner-state-web-http.ts` serialize).
- M1-A §3.2 left the client-side mapping open: mobile `PendingReviewEvent.cardId` carries
  Start-pack values (e.g. `start-a1-haus`) while the server wire item uses `contentId`; the
  equality `contentId == canonical content_id` must be specified explicitly. ADR 0012 lists
  the same gap as an unsolved catalog blocker: "No Web code may construct or infer
  `contentId` from a Start-pack id or vice versa."

## Decision

For M1, the bundled Start Pack IDs are the canonical, immutable `cards.content_id` values.
There is exactly one namespace; no inference, mapping table, rename or transformation exists
between them.

- `start-a1-haus` **is** `cards.content_id = 'start-a1-haus'` for the corresponding card row.
  Same for `start-a1-tisch`, `start-a1-tuer`, and every future `start-a1-*` item that passes
  editorial review and is seeded into `cards`.
- Clients send `contentId` on the wire. The server resolves it to the DB `cards.id`
  (`PostgresReviewEventStore.resolveCardId`), never the reverse. A client never sends, stores
  as its primary key, or trusts a `cards.id` UUID; `cardId` values returned by the server
  (e.g. `schedules[].cardId`) are row identities only.
- No inference or rename: bundled draft `id` values are not derived from any other field,
  and the server never derives a `content_id` from a Start-pack id. A bundled ID that has no
  matching approved card row is simply unresolved (per-item `validation` on the review path,
  absent from the learner-state read) until catalog/seed work creates it.
- Future aliases, taxonomy (canonical-vocabulary-item modeling), pack membership and any
  alternate identifier scheme are **separate decisions** with their own ADRs. This decision
  does not create them and does not forbid them later.

This is a recording of an approved decision, not an implementation. No seed data, catalog
code, API or schema change is added here.

## Preserved gates (unchanged)

- **Editorial content required:** no bundled or draft item becomes resolvable content until
  its `card_versions` row is `approved`/`published`. `resolveCardId` and
  `bootstrap_approved_card_schedules` keep enforcing this; the editorial review packet
  (`docs/content/START_A1_EDITORIAL_REVIEW_PACKET.md`) records that the 20-draft batch is
  linguistic-review-confirmed but publication remains blocked.
- **Seed/release is a separate review-gated task:** inserting Start-pack rows into `cards`,
  `card_versions`, or any catalog/pack-membership tables requires its own authorized task
  (owner/review-gated, additive migration and content validation included). Nothing here
  authorizes it.
- **No production activation:** no route, flag, provider, deployment or server activation is
  authorized or implied by this decision.
- **Reconciliation cursor/watermark still requires separate policy:** the server-side push
  acknowledgement watermark and reconciliation cursor remain open M1-D items (ADR 0012
  "Migration constraints", M1-A §3.2). This decision does not resolve them.

## Consequences

- Client code may treat bundled `start-a1-*` IDs and server `contentId` as the same stable
  key for local-queue/Start-pack correlation (M1-A §5.2 pending-event payloads, ADR 0012
  schedule `contentId` join rule). The mobile `PendingReviewEvent.cardId` field carries
  canonical content IDs for M1.
- The mapping question recorded in M1-A §3.2 and ADR 0012 is now answered for M1: equality,
  not inference. The 0012 "blocker" wording is superseded for the bundled-Start case while
  remaining true for any non-Start, catalog-added content whose ID scheme is defined later.
- A future `cards.content_id` rename or alias requires lifting the immutability trigger via a
  separate additive, migration-tested, owner-reviewed decision (M1-A §11 rules apply).

## Out of scope

- Seed/catalog/reconciliation implementation, schema or API changes, flags, deployments,
  payments, mobile or web code changes, and content publication. No code is added by this ADR.
- Alias and taxonomy decisions (separate ADRs).
- Reconciliation cursor/watermark policy (serial M1-D decision).

## Reversal trigger

Re-open this decision if a bundled Start-pack ID must ever differ from its canonical
`cards.content_id` (e.g. a taxonomy split renames content while old clients still send the
bundled ID), or if a client is ever required to send or persist a `cards.id` UUID instead of
`contentId`. Reversal must never lose queued review events and must keep at least one stable
canonical identity per card.
