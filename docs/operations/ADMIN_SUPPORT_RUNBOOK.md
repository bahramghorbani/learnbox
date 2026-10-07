# LearnBox Admin support runbook

Phase 3 closure. One page for the operator on shift: what support can do from Admin, what it
deliberately cannot, and what each action does to a real learner.

Detail per capability lives in its own procedure — this page is the map, not a copy:

- Temporary disable / reactivate → [`ADMIN_USER_SUSPENSION.md`](./ADMIN_USER_SUSPENSION.md)
- Manual Pack grant / revoke → [`ADMIN_PACK_ENTITLEMENTS.md`](./ADMIN_PACK_ENTITLEMENTS.md)

## Who can do any of this

A signed-in Admin operator holding the `super_admin` role, with a **recent** passkey
authentication, in a deployment where `LEARNBOX_ADMIN_SUPPORT_ENABLED` is on (it is off by
default). Without the role, or with the flag off, every support surface answers `404` — identical to
"no such thing". That is deliberate: an unauthorized caller must not learn what exists.

Two rules hold for every action below:

1. **A reason is required, in both directions.** 3–500 characters, your own words. It is written
   into the permanent audit trail and read by whoever investigates this in six months — a ticket
   number, what happened, or the owner decision it implements. `"test"` is not a reason.
2. **Every action is recorded.** Actor, target, action, reason and timestamp go to the canonical
   `audit_logs`. There is no support action that leaves no trace, and no way to erase one.

## Disable vs permanent deletion

They are not two strengths of the same thing. Picking the wrong one is the most expensive mistake
available on this surface, because only one of them is reversible.

|                                   | Temporary disable (support)       | Permanent deletion (learner self-service)                 |
| --------------------------------- | --------------------------------- | --------------------------------------------------------- |
| Who performs it                   | Admin support                     | the learner, from their own settings                      |
| Reversible                        | yes, any time                     | **no**                                                    |
| Account record                    | kept, `users.status = 'disabled'` | removed                                                   |
| Learning progress, review history | kept                              | removed                                                   |
| Pack entitlements                 | kept                              | removed                                                   |
| Payment history                   | kept                              | kept as privacy-minimised evidence                        |
| Trace left                        | audit entry                       | `account_deletion_events` (no phone, no name, no content) |

Support can disable. **Support cannot delete an account from Admin at all** — there is no such
control, by design. A learner who wants deletion does it themselves; see escalation below if they
cannot.

Never disable an account as a way to "clean it up", and never route someone to deletion to pause
their access.

## Reactivation and session behaviour

Disabling cuts every live session immediately — the learner's next request returns them to
sign-in — and refuses new OTP sign-ins with
«حساب شما موقتاً غیرفعال شده است؛ برای بررسی با پشتیبانی تماس بگیرید.» rather than a misleading
"wrong code".

Reactivation restores the right to sign in. It does **not** resurrect the old sessions: the
"log out everywhere" cutoff written at disable time is not moved back, so the learner signs in
again on their devices. Tell them that — otherwise a reactivated learner reports "it is still
broken" when they are simply signed out.

Learning progress, entitlements, purchases, phone number and profile are untouched in both
directions.

## Manual Pack grant / revoke

Grant gives a real learner a real Pack without a payment, recorded as support provenance —
`acquisition_type = 'support'`, distinguishable forever from a free self-activation and from a
verified purchase. It invents no price, no transaction and no payment record.

Revoke removes **only** a support-issued entitlement. Two refusals are normal, expected results,
not errors to work around:

- **Purchased** → refused. See below.
- **Free Pack** → refused, because a published free Pack is accessible to every learner by the
  canonical access rule, with or without a row. Deleting the row would revoke nothing; the screen
  says so instead of pretending.

## Purchased entitlement protection

A verified purchase is financial evidence. Support cannot revoke it, and nothing in Admin can
alter, reverse or delete a payment record.

If a learner is entitled to lose paid access — a refund, a chargeback, a fraudulent purchase — that
is a payment-reversal decision with a money movement attached, and it is **not** implemented in
Admin. Escalate it. Do not approximate it by granting something else, by disabling the account, or
by asking for a database edit.

## Audit Log usage

Admin → «عملیات» shows the canonical trail of administrative actions: timestamp, operator, action,
target, the reason that was recorded, and the safe details the acting code wrote.

- It is **read-only**. Records cannot be edited or deleted from it, from any other Admin screen, or
  by the Admin database role.
- Filter by action, operator, date range and target. Filtering and paging happen on the server, so
  what you see is a complete answer to the filter you set — not one page searched in your browser.
- A refused filter says so. If you see «فیلترهای انتخاب‌شده معتبر نیستند», fix the filter; the
  result shown is never a silently narrowed trail.
- Some values appear as «پنهان‌شده». Those are credential-shaped or internal request identifiers,
  deliberately not displayed. The field is listed so you can tell redaction from absence.
- Phase 1 and 2 history is in the same place: content review decisions, pack lifecycle, splash
  replacements and Store listing changes, alongside Phase 3 support actions.

Use it before retrying anything. "این حساب از قبل در همین وضعیت بود", a surprising entitlement, or
a learner's "somebody already did that" are all answered here, by name and timestamp.

### Retention

**Audit records are retained for at least one year** (owner-approved product policy). Nothing in
the application expires or prunes them, and no Admin surface can delete one; retention beyond the
minimum is an infrastructure and backup matter, not an application behaviour.

## Escalation — actions not available in Admin

Admin exposes exactly what support may safely do unaided. For anything below, collect the facts and
escalate to the owner rather than improvising:

| Request                                 | Why it is not here                 | What to do                                                                     |
| --------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------ |
| Refund, chargeback, payment reversal    | real money movement, provider-side | escalate with purchase id and learner                                          |
| Revoke paid access                      | tied to the above                  | escalate; do not disable instead                                               |
| Delete an account on a learner's behalf | irreversible, learner-owned        | guide the learner through self-service; escalate only if they genuinely cannot |
| Reset learning progress                 | deferred, not built                | escalate; do not simulate with grant/revoke                                    |
| Change a phone number                   | identity change, no verified path  | escalate                                                                       |
| Edit or remove an audit record          | append-only by design              | never; report why it was asked                                                 |
| Direct database edit                    | no audit, no safety rails          | never; escalate the underlying need                                            |

When escalating, bring: learner identifier, what they asked for, what you already did, and the
audit entries involved. An escalation with the trail attached is one decision; one without it is an
investigation.
