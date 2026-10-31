# Café Bazaar and multi-channel commerce roadmap

**Status:** owner-approved implementation roadmap; no provider, learner-payment, store-publication or Production activation is authorised by this document.

**Owner decision recorded:** 2026-10-31. LearnBox will add a Café Bazaar Android distribution channel, use server-side receipt verification, and make Admin transactions and purchases distinguishable by platform. The design must preserve the existing Web/Zarinpal and Myket paths and keep releases traceable in GitHub.

## 1. Scope and non-goals

### In scope

- Café Bazaar Android flavor and native IAB bridge.
- Server-side OAuth and receipt validation for Bazaar.
- One shared entitlement ledger for Web/Zarinpal, Myket and Bazaar.
- Admin transaction filters, reports and exports grouped by provider and channel.
- Bazaar catalog export/import workflow with auditable mapping confirmation.
- Component-specific source, artifact and release versioning.

### Explicitly out of scope

- A second account system, database, entitlement table or learner payment UI.
- Client-side receipt validation, credentials in an APK, browser or repository.
- Automation that drives the Bazaar panel or creates Bazaar SKU records through unsupported APIs.
- Subscription products, wallet, coupons, direct web checkout inside a Bazaar build, or a production activation.
- Any change to Starter, published content, Zarinpal configuration, Caddy, DNS or a live service as part of this roadmap.

## 2. Architecture invariants

1. `packs` remains the only product catalogue. Provider records only map a provider SKU and the last verified/synced canonical price to a pack.
2. `user_packs` remains the only entitlement record. A successful provider verification grants exactly one entitlement through the shared IAB purchase core.
3. A provider receipt is never trusted because the Android client says it succeeded. The server resolves `(provider, sku)` from its mapping, validates the receipt with the provider, verifies the account binding, then commits the event and entitlement atomically.
4. `provider` and `channel` are separate facts. Provider answers _who verified the transaction_ (`zarinpal`, `myket`, `cafe_bazaar`); channel answers _where it originated_ (`web_zarinpal`, `android_myket`, `android_bazaar`). Neither is accepted from untrusted browser input.
5. Provider identifiers are namespaced. Receipt/token uniqueness, replay protection, mapping lookup, reporting and audit queries always include the provider. A token or SKU string alone is not globally unique.
6. The Bazaar APK offers only Bazaar IAB. It never offers Zarinpal checkout. Generic builds remain IAB-unavailable; Myket builds remain Myket-only.
7. Every provider secret is server-only, loaded from a permission-restricted environment file. Admin surfaces show presence/state only, never a secret or a raw receipt.
8. The shared purchase core must stay provider-agnostic. Provider-specific code belongs in small adapters; conditionals that make one provider change another provider's entitlement semantics are forbidden.

## 3. Bazaar facts that shape the design

- Android binds the Bazaar IAB service package `com.farsitel.bazaar` and uses `com.farsitel.bazaar.permission.PAY_THROUGH_BAZAAR` in the Bazaar flavor only.
- Server verification uses Bazaar OAuth 2.0 client credentials and the official validation API. The OAuth token and client secret never reach Android.
- Bazaar product IDs are lowercase/provider-safe and permanent. A Bazaar SKU must not reuse Myket's SKU format or identifier.
- Bazaar has no supported public API to create or edit products. LearnBox can generate deterministic CSV input and reconcile the imported result, but an operator imports/activates products in Bazaar's panel.
- Packs are one-time, non-consumable purchases. Ownership refresh comes from the Bazaar client `getPurchases` path; unknown tokens cannot be swept from the server without first being presented by a device.

## 4. Admin outcome

The existing read-only payment workspace becomes a provider-neutral operations surface. It remains a record/audit surface: no browser action can grant an entitlement, alter a provider response, reveal a credential or activate a store product.

### Transaction list and detail

Every row and detail view must expose:

- provider and distribution channel as distinct, localized labels;
- pack, learner-safe identifier, order/public code, canonical amount and currency boundary;
- normalized status (`pending`, `verified`, `failed`, `cancelled`, `rejected`, `refunded`, `revoked`);
- created, verified/checked and refunded/revoked timestamps where applicable;
- a truncated/hashed provider receipt reference, never a raw purchase token;
- the append-only verification/reconciliation timeline.

### Filters and reports

The Admin API, query layer and UI will support the same server-authorized dimensions:

- provider (all / Zarinpal / Myket / Café Bazaar);
- channel (all / Web / Android-Myket / Android-Bazaar);
- status, pack, date range and review-needed state;
- grouped counts and canonical-Toman totals by provider, channel and outcome;
- a deliberately bounded, role-protected CSV export that contains only the same allowed operational fields.

Filters use controlled enum values, are applied in SQL with parameterized queries and have focused database tests. The UI never derives provider totals by filtering only its currently loaded page.

### Catalog control plane

Myket retains its API-backed sync action. Bazaar receives a separate workflow rather than a misleading "sync" button:

1. Admin creates a deterministic Bazaar catalog export preview for eligible paid, published, listed packs.
2. The backend records the intended `provider`, Bazaar-safe SKU, canonical price and source pack revision; it does not call Bazaar or activate anything.
3. The operator imports the generated CSV in Bazaar's official panel.
4. Admin confirms the exact imported SKU/price mapping with step-up authentication, CSRF protection, idempotency and audit logging.
5. Verification refuses a new entitlement if the mapped price has drifted from the canonical pack price.

The UI wording must explicitly distinguish **CSV prepared**, **imported/confirmed**, **Bazaar product active**, and **learner payments enabled**. These are different states.

## 5. Delivery phases

Each phase is independently reviewable and mergeable. A later phase cannot silently activate an earlier one.

### BZ-0 — contract and compatibility inventory

**Deliverable:** provider/channel taxonomy, migration plan and test matrix.

- Read current production schema and migrations before choosing a new migration; confirm the live `purchase_orders.channel` constraint and receipt uniqueness scopes.
- Document all current Myket and Zarinpal contracts, environment flags, API routes, browser bridge payloads and Admin report fields.
- Add no provider calls and make no live configuration change.

**Exit gate:** architecture review confirms additive/backward-compatible schema changes only, and names every affected existing provider test.

### BZ-1 — provider-neutral reporting foundation

**Deliverable:** Admin can reliably separate existing historical transactions by provider/channel.

- Add only the minimum additive migration needed for the current taxonomy and indexes; backfill existing rows deterministically and preserve every record.
- Extend the Admin read projection, route validation and payment workspace filters/reports.
- Add grouped aggregation and bounded CSV export only after role, data-minimization and query-volume review.
- Keep all payment mutations, reconciliation and provider activation unchanged.

**Exit gate:** real-Postgres migration tests, authorization/CSRF tests, query-plan coverage for the report dimensions, and Admin browser proof using seeded Zarinpal/Myket/Bazaar-shaped fixtures.

### BZ-2 — Bazaar catalog import workflow

**Deliverable:** a non-activating Bazaar CSV export and a safe mapping-confirmation path.

- Generate lowercase Bazaar-safe SKUs from canonical pack IDs with collision tests and permanent mapping semantics.
- Export the official Bazaar CSV shape in rials (`tomans × 10`) from server-side canonical data.
- Separate export generation from mapping confirmation; neither activates an SKU or learner payment.
- Keep Myket API sync untouched and test that a Bazaar operation cannot call the Myket adapter.

**Exit gate:** deterministic export fixtures, price-drift refusal tests, Admin authorization tests and manual review of an example CSV before any panel import.

### BZ-3 — Android Bazaar flavor and account binding

**Deliverable:** a compile-tested Bazaar-specific APK flavor with no live payment enablement.

- Add `bazaar` alongside `generic` and `myket`; move store permissions and `<queries>` to flavor manifests so no APK declares another store's billing permission.
- Implement a Bazaar bridge adapter behind the existing native bridge contract; preserve the generic unavailable result and Myket behavior.
- Replace the bridge's unbound purchase payload with an opaque, short-lived server-issued account-binding nonce. Bazaar's returned `developerPayload` must match this nonce before any grant.
- Add ownership-refresh behavior for non-consumable purchases, with duplicate/replay handling.

**Exit gate:** unit tests for each bridge result, Gradle builds for all flavors, manifest assertions, and regression tests proving Myket and generic behavior do not change.

### BZ-4 — Bazaar server verifier

**Deliverable:** a disabled-by-default Bazaar verification adapter and guarded receipt endpoint.

- Exchange OAuth client credentials server-to-server, cache tokens only in process with expiry/skew protection and redact all credential-bearing errors.
- Classify Bazaar responses into definitive success, definitive invalid/refunded/cancelled, and unresolved transport/provider failure; unresolved results never grant or falsely fail a purchase.
- Resolve only database-mapped Bazaar SKU records; validate the binding nonce, canonical price and provider-scoped token uniqueness inside the shared purchase transaction.
- Add the provider-specific runtime flag separately from the general Android/store UI visibility flag.

**Exit gate:** mocked official API response tests, real-Postgres idempotency/concurrency tests, negative security tests, and a disabled-route proof with no Bazaar credential present.

### BZ-5 — device proof and operational readiness

**Deliverable:** evidence from the exact signed Bazaar artifact, without public activation.

- Build from a pinned commit with the permanent Android signing identity; calculate and retain only the artifact hash in release evidence.
- Use an approved non-production/store-test path to prove purchase UI, account binding, server verification, one entitlement, duplicate receipt refusal, reinstall/login restore and Admin traceability.
- Exercise refund/cancelled classifications with provider-approved test evidence or documented response fixtures; do not invent a live refund.
- Verify support/reconciliation behavior and ensure no raw tokens or credentials enter logs, screenshots, GitHub issues or evidence.

**Exit gate:** owner reviews the evidence pack and explicitly authorizes the separate store-submission or activation stage.

### BZ-6 — release, submission and controlled activation

**Deliverable:** only after distinct owner approvals.

Separate approvals are required for each of: Bazaar app-record setup, OAuth client provisioning, CSV import, SKU activation, signed APK upload, Bazaar review submission, production verifier deployment, learner-payment flag enablement, and any controlled real transaction.

No phase permits a Docker/Caddy restart, database restore, DNS/CDN change, Zarinpal mutation, Starter/content mutation, or a real provider purchase by default.

## 6. GitHub and versioning rules

### Source and PR boundaries

- Use one provider-scoped branch/PR family per vertical slice: `feat/bazaar-admin-reporting`, `feat/bazaar-catalog-export`, `feat/bazaar-android-bridge`, `feat/bazaar-server-verify`.
- Apply/maintain GitHub labels `area:commerce`, `area:admin`, `area:android`, `provider:bazaar`, `provider:myket`, `provider:zarinpal`, and `risk:payment` rather than mixing platform work under a generic mobile label.
- A provider PR must list: providers intentionally touched, migrations, flags, artifact/version effect, test evidence and whether it changes activation state. If it changes more than one provider, it needs an explicit compatibility section.
- Keep store credentials and raw receipts out of commits, PR text, CI output and GitHub artifacts.

### Android version line

Android is one signed application identity, not separate applications per store. Therefore `versionCode` is **global and strictly monotonic across every signed Android artifact**, regardless of flavor or store. It is never reset after a rejection, rollback or removed store build.

- `versionName` is the Android component's SemVer line and is shared by all artifacts built from the same source release.
- The current checked-in Android baseline is `versionName=0.1.1`, `versionCode=2`; it is not a Bazaar publication or GitHub Release.
- The first Bazaar-capable build receives a new Android component version and next unused global `versionCode`; the implementation PR must calculate it from the actual latest submitted artifact, not assume a number from source alone.
- Artifact filenames/evidence include channel without changing the component identity, for example `learnbox-android-bazaar-v0.2.0+3.apk`.
- Git tags use `android/vX.Y.Z`; a store submission is recorded separately from a tag, GitHub Release, merge or deployment.

### Other components

- Admin versions remain in `apps/admin/package.json`; a reporting-only Admin release changes only the Admin version after the scope and changelog justify it.
- Learner Web/PWA and Admin never display or import Android's version accessor.
- The repository version validator must be extended when Android begins surfacing a version in its own UI/build evidence, but no component receives a fabricated `1.0.0` merely because it is deployed or submitted.

## 7. Compatibility and rollback rules

- Use expand → deploy compatible readers/writers → backfill/verify → contract only in a later separately approved change. No destructive rewrite of payment rows.
- Retain legacy reads during any provider/channel field transition; dual-write only when an explicit migration requires it and remove it only after an observed compatibility window.
- Runtime flags are independent per provider. Disabling Bazaar affects Bazaar only; it cannot disable Zarinpal, Myket catalog mappings or existing entitlements.
- Rollback means reverting code or disabling the relevant Bazaar flag. It does not reuse a consumed Android `versionCode`, erase a payment event or mutate a provider receipt.
- Admin reporting is read-only against the ledger. A reporting rollback cannot revoke ownership or alter purchase history.

## 8. Acceptance checklist before Bazaar is exposed

- [ ] Existing Zarinpal transactions render with `web_zarinpal` and correct provider grouping.
- [ ] Existing Myket transactions render with `android_myket` and correct provider grouping.
- [ ] Bazaar records render with `android_bazaar`; no client can select this value arbitrarily.
- [ ] Provider/channel filters, totals and export match independently recomputed database fixtures.
- [ ] Bazaar CSV is deterministic, lower-case/provider-valid, priced in rials and never activates a product.
- [ ] Generic, Myket and Bazaar manifests contain only their own billing declarations.
- [ ] A server-issued binding nonce prevents receipt-to-account substitution.
- [ ] Duplicate, concurrent, refunded, cancelled, mismatched-SKU and transport-error receipts do not create an incorrect entitlement.
- [ ] Restore proves a legitimate already-owned Bazaar pack maps to the same account only after server verification.
- [ ] All required CI checks pass, with real Postgres coverage where the schema/ledger changes.
- [ ] Signed artifact hash, source SHA, Android versionName/versionCode and distribution status are recorded without secrets.
- [ ] Separate owner authorization is recorded before any Bazaar upload, SKU activation, production flag activation or real money flow.
