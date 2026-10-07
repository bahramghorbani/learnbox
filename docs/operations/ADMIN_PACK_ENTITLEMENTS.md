# Manual Pack Grant and Revoke (Admin support)

Phase 3 / Milestone 3.2. Operator procedure for giving a learner access to a pack by hand, and for
taking back access that support itself gave.

This surface is off unless `LEARNBOX_ADMIN_SUPPORT_ENABLED=true` and the operator holds
`super_admin`. Without both, the routes are 404 — not 403, so the surface does not advertise itself.

## What the screen shows

Open **مدیریت کاربران → جزئیات کاربر**. Under **دسترسی بسته‌ها** every canonical pack is listed with
the reason the learner can or cannot read it right now:

| Label                         | Meaning                                                                  | Manual action                        |
| ----------------------------- | ------------------------------------------------------------------------ | ------------------------------------ |
| رایگان برای همهٔ کاربران      | The pack is published and free. Every signed-in learner reads it (M2.2). | None. A grant would change nothing.  |
| خریداری‌شده (پرداخت تأییدشده) | Access came from a **verified payment** (M2.4).                          | None. See _Refunds_ below.           |
| اعطای پشتیبانی                | Access came from a manual grant (this procedure).                        | Revocable.                           |
| فعال‌سازی رایگان توسط کاربر   | The learner activated a free pack themselves (M2.3).                     | None.                                |
| بدون دسترسی                   | No entitlement and no free access.                                       | Grantable, if the account is active. |

A pack marked **منتشر نشده** grants no access even to a learner who holds an entitlement —
publication is the other half of the canonical access rule. Granting such a pack is allowed and
real; access simply begins when the pack is published.

The buttons are driven by the server's own verdicts, and the server re-decides when the request
arrives. If no button appears, the line beneath the pack says why.

## Granting

1. Find the learner, open the detail panel, locate the pack.
2. Press **اعطای دسترسی**.
3. Write the reason — what happened and why support is intervening (ticket number, incident).
   3–500 characters, required.
4. Press **تأیید و اعطای دسترسی**.

The learner gains access immediately, through the same rule the app already uses. Nothing about
payment changes: **no transaction is created, no price is recorded, no payment status moves.** The
entitlement is stored as `acquisition_type = 'support'`, which is how it stays distinguishable from a
purchase and from a free activation forever after.

A grant to a **disabled** account is refused. Reactivate the account first (see
`ADMIN_USER_SUSPENSION.md`) — otherwise the entitlement exists but the learner cannot sign in to use
it, which looks to everyone like a broken promise.

Retrying after a network error is safe: each attempt carries its own idempotency key, and a replay
is reported as «قبلاً ثبت شده بود» instead of granting twice.

## Revoking

Revoke removes **only** a support-issued entitlement.

1. Open the pack line marked **اعطای پشتیبانی**.
2. Press **لغو دسترسی اعطایی**, write the reason, confirm.

Access disappears immediately.

### What revoke deliberately will not do

- **A verified purchase is never revoked here.** The learner paid; removing access without a refund
  decision is a money question, not a support click. The request is refused and the payment record
  is untouched. Escalate to the owner for refund policy.
- **A free pack is never "revoked".** While the pack is published and free, every learner reads it
  (M2.2). Deleting an acquisition row would change nothing, so the screen says so instead of
  pretending the action worked.
- **Nothing is deleted besides that one entitlement row.** Learning progress, review history,
  payment records and the account itself are not touched.

## Audit

Both directions write to the canonical `audit_logs`:

- `action`: `user_pack.grant` / `user_pack.revoke`
- `entity_type`: `user_pack_entitlement`, `entity_id`: the learner
- `metadata`: the reason, the pack, the previous and resulting acquisition and access state, whether
  the pack is free and published, and the idempotency key

No credentials, session tokens or payment secrets are ever written there.

## Deployment prerequisite

Migration `0029_support_pack_entitlements.sql` must be applied before this surface works. It widens
`user_packs.acquisition_type` to admit `'support'`, forbids any non-purchased entitlement from
pointing at a transaction, and adds the least-privilege grants
(`SELECT, INSERT, DELETE` on `user_packs`; `SELECT` on `packs` and `purchase_events`).

`purchase_events` is granted **SELECT only** on purpose: support must be able to recognise a verified
payment in order to refuse to revoke it, and must never be able to alter one.
