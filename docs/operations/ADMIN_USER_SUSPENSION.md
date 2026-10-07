# Admin user suspension (temporary disable / reactivate)

Phase 3 / Milestone 3.1. Operator-facing procedure for temporarily suspending a LearnBox learner
account and restoring it.

**Suspension is not deletion.** Suspension withdraws the right to act and keeps everything else;
permanent account deletion is a separate, irreversible lifecycle documented with the learner
self-service deletion flow. Never use suspension as a way to "clean up" an account, and never use
deletion to pause one.

## What suspension does

|                                     | Suspended                    | Restored (reactivated)                 |
| ----------------------------------- | ---------------------------- | -------------------------------------- |
| Account status                      | `users.status = 'disabled'`  | `users.status = 'active'`              |
| Active learner sessions             | cut off immediately          | stay dead — the learner signs in again |
| New sign-in (OTP)                   | refused with a clear message | works normally                         |
| Learning progress, review history   | untouched                    | untouched                              |
| Pack entitlements, purchase records | untouched                    | untouched                              |
| Phone number, name, profile         | untouched                    | untouched                              |

Both directions are recorded in the canonical `audit_logs` with the acting operator, the target
account, the reason, the status transition and the timestamp.

## Who can do it

A signed-in Admin operator holding the `super_admin` role, with a **recent** passkey
authentication. A role-less operator gets the same `404` as a non-existent account: the surface
does not confirm who exists to someone not entitled to act.

The capability is behind `LEARNBOX_ADMIN_SUPPORT_ENABLED` (default off). With the flag unset the
whole surface answers `404`.

## Procedure

1. Open Admin → «مدیریت کاربران».
2. Find the learner by phone number or name. The list shows the current account status.
3. Open «جزئیات».
4. Write a reason in the required field. Write it for the person who reads it in six months:
   a ticket number, a short description of what happened, or the owner decision it implements.
   "test" is not a reason.
5. Press «غیرفعال‌سازی موقت حساب» (or «فعال‌سازی مجدد حساب» for a suspended account).
6. Confirm the result banner. "این حساب از قبل در همین وضعیت بود" means somebody else already
   applied the change — check the audit trail rather than retrying.

A retried request (double click, flaky connection) is safe: the request carries an idempotency key
and a repeat neither applies twice nor writes a second audit entry.

## What the learner sees

- An open session stops working on the next request and returns them to sign-in.
- Signing in with a correct OTP code returns
  «حساب شما موقتاً غیرفعال شده است؛ برای بررسی با پشتیبانی تماس بگیرید.» — not "wrong code".

Tell the learner what to expect when the suspension is a response to something they reported.

## When to suspend

Suspend for a situation that should end: an abuse report under review, a disputed payment being
investigated, a compromised account, an owner instruction to pause an account. Suspension is the
reversible tool — prefer it over anything destructive while facts are still being established.

Do not suspend to "fix" a stuck learner: suspension changes nothing about learning state.

## Enforcement (why a UI-only suspension is impossible)

Both doors are closed server-side, in one place each:

- **Authenticated requests** — `authenticateLearner` is the single place a learner request is
  authenticated, and it asks one question of the database ("may this session act?") that now also
  covers account status. Every learner endpoint goes through it; there are no per-page checks to
  forget.
- **Sign-in** — the identity store that turns a verified phone number into a session subject reads
  the account status in the same statement, so a suspended account is refused a session instead of
  being handed one that every later request would reject.

Suspending writes the canonical session cutoff (`user_session_cutoffs`, migration `0020`) — the
same "log out everywhere" mechanism the learner's own setting uses. Reactivation does not move that
cutoff back, so sessions killed during a suspension stay dead.

## Not in this capability

Granting or revoking a Pack entitlement (M3.2), the Admin audit log viewer (M3.3), resetting
learning state (deferred, post-launch), and permanent account deletion (separate lifecycle). None
of them can be reached from this surface.
