# Commerce core contract — single-pack sales (v1)

> **Status:** Proposed for owner review (2026-10-17). Nothing in this document is implemented,
> migrated or enabled. It governs the next implementation phase; it does not authorise a
> migration, a Production change, a provider activation or a real transaction.
>
> **Scope of v1:** one-time purchase of a single pack through Zarinpal (Web/PWA), an internal
> order with an immutable product/price snapshot, payment attempts, server verification,
> idempotency, purchase history, Admin search and timeline, and limited reconciliation.
> Cafe Bazaar gets only the interface and identifiers below. Subscriptions, coupons, wallet,
> settlement, refunds automation and any other sales model are out of scope.

## 1. What exists today (evidence: repository at `50aed560`)

| Concern                        | Current home                            | Notes                                                                                                                                                                                        |
| ------------------------------ | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web price                      | `packs.price_tomans`                    | Set only through `admin_set_pack_price` (super_admin, audited); immutable after the first verified sale (`0036`).                                                                            |
| Listing / availability         | `store_listings` + `packs.status`       | `createPurchase` only offers listed, visible, paid packs.                                                                                                                                    |
| Order + attempt + verification | `purchase_events` (one row)             | One row per Zarinpal Authority: `provider_purchase_id` = Authority, `provider_reference` = RefID, `amount_tomans` snapshot, `environment`, status `pending → verified / failed / cancelled`. |
| Entitlement                    | `user_packs`                            | `acquisition_type` `free / purchased / support`; `purchased` carries `purchase_event_id`; `UNIQUE (user_id, pack_id)`.                                                                       |
| Manual support grant           | `user_packs` (`support`) + `audit_logs` | Never creates a `purchase_events` row.                                                                                                                                                       |
| Provider SKU catalogue         | `billing_products`                      | `kind`, `entitlement_keys`, `tier_id`; no pack link; unused by the web flow.                                                                                                                 |
| Deleted-account evidence       | `purchase_ownership_claims`             | Survives account deletion; keyed by `product_id`.                                                                                                                                            |
| Legacy                         | `payment_logs`, `payment_gateways`      | No current writer; read only by gated legacy Admin routes (`/api/transactions`, `/api/gateways`) and cleared by account deletion.                                                            |

Gaps this contract closes (derived from reading the code; not yet reproduced in a test or
against any data — Phase B adds the reproducing tests first):

1. **No order.** Every `initiate` inserts a new pending row with no idempotency key, so two
   parallel checkouts for the same learner and pack can both be paid. The second verified row then
   hits `ON CONFLICT DO NOTHING` on `user_packs`: money accepted, no new entitlement, no flag.
2. **Abandoned pending rows are never re-checked.** Without a callback a payment stays `pending`
   indefinitely; nothing asks Zarinpal again.
3. **Account deletion loses pack-purchase evidence.** The preservation query joins
   `billing_products` on `product_id`, which is `NULL` for pack purchases, so verified Zarinpal
   rows are deleted without a `purchase_ownership_claims` row. **Must be fixed before activation.**
4. **No timeline.** Only `created_at / updated_at / verified_at`; transitions are not recorded.
5. **Snapshot is amount only.** Pack name and composition at purchase time are not kept.
6. **Admin search** covers pack and status only; learner history covers one purchase by id.

## 2. Data model

No second payment history, entitlement table or offer table is introduced. One new order table and
one append-only event table are added; the existing tables evolve.

```text
packs (+ store_listings)          catalogue, web price source (price_tomans)
billing_products                  provider-store SKU → pack mapping (Bazaar phase only)
        │
purchase_orders        NEW        one learner intent to buy one pack; immutable snapshot
        │ 1..n
purchase_events        EVOLVED    one provider payment attempt (Zarinpal Authority / Bazaar token)
        │ 0..1 verified
user_packs             UNCHANGED  the only entitlement; purchased → purchase_event_id
purchase_order_events  NEW        append-only timeline for order and attempt transitions
purchase_ownership_claims EVOLVED durable evidence after account deletion, now pack-aware
audit_logs             UNCHANGED  Admin actor actions (repair, re-check, support grants)
```

### 2.1 `purchase_orders` (new)

| Column                                   | Rule                                                                                                                                               |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id UUID`                                | Internal identifier; never sequential.                                                                                                             |
| `public_code TEXT UNIQUE`                | Short opaque support code shown to the learner and Admin (e.g. `LB-7KQ4-M2XD`).                                                                    |
| `user_id`, `pack_id`                     | Canonical LearnBox account and pack.                                                                                                               |
| `channel`                                | `web_zarinpal` in v1; `android_bazaar` reserved.                                                                                                   |
| `environment`                            | `sandbox` / `production`, copied from runtime config.                                                                                              |
| `amount_tomans INTEGER > 0`              | Learner-facing price snapshot; the only display unit.                                                                                              |
| `snapshot JSONB`                         | `pack_display_name`, `target_item_count`, `target_cefr`, `price_source` (`packs.price_tomans`), `price_set_audit_id` when available. Written once. |
| `status`                                 | See §3.                                                                                                                                            |
| `idempotency_key`                        | Client key; `UNIQUE (user_id, idempotency_key)`.                                                                                                   |
| `created_at`, `updated_at`, `expires_at` | `expires_at` bounds new attempts only, never verification.                                                                                         |

A partial unique index allows **one open order per `(user_id, pack_id)`**. A second checkout
returns the open order instead of starting a parallel one.

### 2.2 `purchase_events` (evolves into the attempt record)

Kept as the attempt and provider-transaction table because `user_packs.purchase_event_id`,
the learner status route, Admin transactions and account deletion already reference it.

- Add `order_id UUID REFERENCES purchase_orders` (backfilled; then `NOT NULL` for pack rows).
- Add `provider_amount BIGINT` + `provider_currency TEXT CHECK ('IRR')`: the exact value sent to
  Zarinpal. `amount_tomans × 10 = provider_amount` is enforced by a `CHECK`; the conversion stays
  only in `tomansToRials` at the provider boundary.
- Add `last_check_at`, `last_check_outcome` (`none / paid / not_paid / unknown`), `check_count`,
  `last_provider_code`. No gateway body, card data or message text is stored.
- `UNIQUE (provider, provider_purchase_id)` stays the replay barrier for Authority/token.
- Bazaar (interface only): `provider_purchase_id` = SHA-256 of the purchase token (lookup and
  dedupe); the raw token goes to `provider_token_ciphertext`, encrypted with a runtime key, readable
  only by the verification service role, never selected by Admin, never logged. Admin shows the
  Bazaar order id and the last 6 characters of the hash; search by token hashes the pasted value
  server-side.

### 2.3 `purchase_order_events` (new, append-only)

`id, order_id, attempt_id?, kind, from_status, to_status, source, provider_code?, actor_user_id?,
reason?, created_at`. `source` ∈ `learner_initiate, provider_callback, server_verify,
reconciliation, admin_recheck, admin_repair, system_expiry`. App and Admin roles get
`INSERT, SELECT` only — no `UPDATE/DELETE`. Written in the same transaction as the transition.

### 2.4 `user_packs` — unchanged

It remains the single source of access. Archive, unlisting, price change and content revisions
never touch it. A purchase grants the pack id, i.e. the current and every later published revision
of that pack. Lightner progress (`card_schedules`, `review_events`) is keyed by user and card and
is not affected by any commerce state.

### 2.5 Roles of the remaining tables

| Table                       | Decision                                                                                                                                                                                                                   |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `billing_products`          | Kept as the provider-store SKU catalogue. In the Bazaar phase it gains `pack_id`; it is **not** an offer table for the web, and no `PackOffer` table is created. The web offer is `packs.price_tomans` + `store_listings`. |
| `payment_logs`              | **Deprecated, frozen.** No new writer. Removed by a later migration together with the gated legacy routes, after a read-only Production proof that it is empty. Until then account deletion keeps clearing it.             |
| `payment_gateways`          | **Deprecated, frozen.** Provider activation stays in runtime configuration (default off), never in this table. Removed with `payment_logs`.                                                                                |
| `purchase_ownership_claims` | Gains `pack_id` and `amount_tomans`; `product_id` becomes nullable with a `CHECK` that exactly one of `product_id / pack_id` is set. The deletion query preserves both shapes.                                             |

### 2.6 Existing rows

Migration backfills one `purchase_orders` row per existing pack `purchase_events` row
(status mapped per §3, snapshot from the current pack with `snapshot.backfilled = true`). Existing
`user_packs` rows and their `purchase_event_id` are not modified. Before the Production migration a
read-only count of `purchase_events`, `payment_logs` and `user_packs WHERE acquisition_type =
'purchased'` is recorded as evidence (expected: no paid rows, since payment was never enabled).

## 3. States and allowed transitions

### Attempt (`purchase_events.status`) — source of truth: provider server verification

```text
pending ──verify 100/101──▶ verified
pending ──callback NOK────▶ cancelled
pending ──definitive not-paid code──▶ failed
pending ──transport error / 5xx──▶ pending (last_check_outcome = unknown)
```

- Only `verifyPayment` with the stored `provider_amount` can produce `verified`. A callback never
  does. Late `NOK` or failures can never move a `verified` row (existing `WHERE status = 'pending'`
  guard is kept).
- `refunded / revoked / rejected` stay reserved; v1 writes none of them.
- Which Zarinpal codes count as definitive not-paid is fixed during sandbox testing (§7); until
  then any non-100/101 response keeps the attempt `pending` for reconciliation.

### Order (`purchase_orders.status`) — projection, updated in the attempt's transaction

```text
open ──attempt verified + entitlement inserted──▶ fulfilled
open ──attempt verified, learner already holds pack──▶ needs_review   (possible double charge)
open ──learner cancels / attempt failed, no pending attempt──▶ open (may retry)
open ──expires_at passed, no pending/unknown attempt──▶ expired
open / expired ──late verified attempt──▶ fulfilled or needs_review   (a valid payment always wins)
needs_review ──admin_repair or support decision (audited)──▶ fulfilled | needs_review
```

Rules: a new attempt on an open order is allowed only when no attempt is `pending`, or after the
pending attempt was re-verified and came back definitively not paid. An order is never deleted,
and an `expired`/`cancelled` order still accepts a late verified payment.

## 4. Recovery: verified payment, missing entitlement

Verification state, entitlement insert, order projection and timeline event commit in **one**
transaction. If that transaction fails after Zarinpal accepted the payment, the attempt is still
`pending`; the next verify (callback replay, reconciliation, or Admin re-check) receives code `101`
("already verified") and commits the same transaction. No new charge is ever created.

Reconciliation v1 (runtime flag, default off):

- Every 10 minutes: attempts `pending` older than 15 minutes and younger than 7 days → verify with
  the stored amount. Outcome per §3; each run writes one timeline event per changed attempt.
- Older than 7 days and still unknown → order `needs_review`; never auto-failed.
- Admin "re-check with provider" runs the same function for one order (idempotent, audited).
- Zarinpal `unVerified` is used as a cross-check for paid-but-unverified Authorities once its
  response is confirmed in sandbox.
- `admin_repair` (super_admin, reason required, audited) inserts the missing `purchased`
  entitlement only for a `verified` attempt whose order is not `fulfilled` and where the learner
  holds no entitlement for the pack. It never edits payment fields.

## 5. Archive and stopping sales

- Archive or unlist blocks new orders and new attempts (eligibility is re-read at attempt creation).
- Archive never blocks verification or reconciliation of an existing attempt; a verified payment for
  an archived pack still grants access (current `verifyPurchase` does not check visibility; a test
  pins this).
- Entitled learners keep archived packs (`pack-access.ts`: `published` or `archived` with
  entitlement). No hard delete of packs, purchases, orders, events or progress is added.

## 6. User and Admin surfaces (v1)

**Learner (Web/PWA):** checkout from the store → gateway → result page backed by the order
(`fulfilled` / `در حال بررسی` for unknown / `ناموفق` / `لغوشده`, with the public code) → a
"خریدهای من" list (pack name snapshot, amount in tomans, status, date, public code, RefID when
fulfilled) for the learner's own orders only.

**Admin (existing «فروشگاه» workspace, `PaymentOperationsPanel`; no new panel):**

- Search by public code, order id, user id or exact phone, Authority, RefID, Bazaar order id or
  pasted token (hashed server-side). Filters: status, pack, date, environment.
- Order detail: snapshot, attempts, timeline, linked entitlement, and any support grant for the same
  learner and pack shown separately and labelled "اعطای دستی — پرداخت نیست".
- Actions: re-check with provider; repair entitlement. View: roles that read payments today;
  actions: `super_admin`. No refund, edit or delete action in v1.

## 7. Provider requirements (official sources, reviewed 2026-10-17)

Review method: official pages through search-indexed content; full-text extraction was unavailable
in this session. Each line is re-read against the live page before the implementing PR.

| Requirement                                                                                            | Source                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Request returns `authority`; payer is redirected; success codes `100`, verify `101` = already verified | [Zarinpal — connect to gateway](https://www.zarinpal.com/docs/paymentGateway/connectToGateway), [error list](https://www.zarinpal.com/docs/paymentGateway/errorList) |
| Verify after the payer returns, server-side, with the same amount                                      | [Zarinpal — verify](https://www.zarinpal.com/docs/sdk/php/method/verify)                                                                                             |
| `unVerified` lists successful payments not yet verified                                                | [Zarinpal — unVerified](https://www.zarinpal.com/docs/paymentGateway/otherMethods/unVerified)                                                                        |
| Amount unit (IRR default) and sandbox host                                                             | To confirm on the live page before Phase C; current code sends rials.                                                                                                |
| Verify purchases on a remote server; use a developer payload                                           | [Bazaar — Security Notes](https://developers.cafebazaar.ir/en/guidelines/in-app-billing/security)                                                                    |
| Server access to purchase status through Developer API with OAuth 2.0                                  | [Bazaar — API](https://developers.cafebazaar.ir/en/guidelines/in-app-billing/api)                                                                                    |
| SKUs cannot be deleted or renamed, only deactivated; test purchases need an uploaded app               | [Bazaar — FAQ](https://developers.cafebazaar.ir/en/guidelines/in-app-billing/faq)                                                                                    |
| IAB v3 response keys                                                                                   | [Bazaar — Reference](https://developers.cafebazaar.ir/en/guidelines/in-app-billing/reference)                                                                        |

**Channel rule (owner decision, 2026-10-17):** the Cafe Bazaar build offers only Bazaar in-app
billing; it never shows the Zarinpal web checkout. SDK-specific details (Poolakey version,
payload size, consumption model) stay open until the Android release line is chosen.

## 8. Required tests (mock / sandbox only, no real money)

| Case                                             | Assertion                                                             |
| ------------------------------------------------ | --------------------------------------------------------------------- |
| Valid verify                                     | One `fulfilled` order, one entitlement, provider amount = tomans × 10 |
| Duplicate / concurrent callback                  | Same result; one entitlement; one `verified` timeline event           |
| Callback OK, verify rejects                      | No entitlement                                                        |
| Verify transport error                           | Attempt stays `pending`, `unknown`; reconciliation later settles it   |
| Verify succeeded, DB commit fails                | Re-check with code `101` grants once, no new attempt                  |
| Second checkout for the same pack                | Returns the open order; no parallel attempt                           |
| Learner already holds pack when payment verifies | `needs_review`, no silent drop                                        |
| Price change between order and verify            | Verify uses the snapshot                                              |
| Archive with an open attempt                     | New attempt refused; verification still grants                        |
| Account deletion after a pack purchase           | `purchase_ownership_claims` row with `pack_id`                        |
| Support grant                                    | Audit row, no order or attempt                                        |
| Admin role without `super_admin`                 | Re-check/repair refused server-side                                   |

## 9. Delivery phases and gates

| Phase | Content                                                                                              | Gate                                                       |
| ----- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| A     | This contract                                                                                        | Owner approval                                             |
| B     | Migration (local only) + core order/attempt/timeline + deletion fix + §8 DB tests with mock provider | Draft PR, required CI                                      |
| C     | Learner order flow, history, reconciliation behind flag (off)                                        | Draft PR, required CI                                      |
| D     | Admin search, detail, timeline, re-check, repair                                                     | Draft PR, browser check                                    |
| E     | Zarinpal sandbox run on personal staging                                                             | Evidence of §8 against sandbox                             |
| F     | Production migration + read-only pre-counts                                                          | Separate owner approval                                    |
| G     | One controlled real transaction, then activation                                                     | Separate owner approval, runbook, support/refund procedure |

Credentials never enter source, logs, screenshots or evidence; provider activation stays a runtime
flag that defaults to off.
