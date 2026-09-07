# M3 Profile and Settings interaction contract

**Status:** owner-approved bounded design direction; implementation remains task-scoped and test-gated.
**Baseline:** `origin/main` at `e074ccfaa9b078609a9942398a79d37c5e79261c`.
**Scope:** learner Profile and Settings on Web and Android. Store, Purchases, account deletion,
notification delivery, server persistence, authentication changes and Production activation remain
separate gated work.

## 1. Product outcome

Profile answers «حساب و وضعیت من چیست؟». Settings answers «تجربهٔ یادگیری را چگونه تنظیم کنم؟».
Both surfaces must be useful without fabricating identity, purchases, synchronization or preference
state. They share the existing learner shell and D0/D1 visual language.

This contract turns the direction-only D1 section into an approved state and interaction model for
the bounded P1/S1 foundations. It does not make either surface implemented or release-ready. The
owner selections are recorded in
[`PDR-006`](../product-decisions/PDR-006-PROFILE-SETTINGS-ALPHA-POLICIES.md).

## 2. Current repository truth

- Web and Android learner navigation currently expose Today, Words and Progress only.
- The information architecture names Profile as a learner destination, while D1 §9 says Profile and
  Settings sit behind a Today-header/account entry and have no bottom navigation. This is unresolved.
- Web OTP creates a canonical `users.id` session subject, but no learner-profile read contract exposes
  a display name, masked phone or account metadata to the learner UI.
- The onboarding goal is explicitly device-only and is not an authenticated account profile.
- Web review events, review-session position, daily progress, onboarding goal and personal words are
  device-local foundations. Android review events and personal words use secure device storage.
- Neither learner surface has a safe, complete account sign-out flow composed with account-scoped
  pending-event storage.
- Sound is optional and separately muteable, but no shared preference contract is implemented.
- Reminder delivery, quiet hours, purchases, account deletion and server-backed preference sync are
  planned, not implemented.

## 3. Recommended information architecture

### 3.1 Navigation

**Recommendation:** add Profile as the fourth persistent learner destination after Progress. Settings
is a child surface opened from Profile and uses a back action to Profile; it is not a fifth bottom-nav
item.

Order in Persian RTL presentation:

1. امروز
2. واژه‌ها
3. پیشرفت
4. پروفایل

Rationale: Profile is already a peer destination in `INFORMATION_ARCHITECTURE.md`; a stable fourth
item keeps account and sync visibility discoverable on Web and Android. Settings is task-oriented and
belongs one level below Profile. Four destinations remain within the mobile navigation capacity and
avoid hiding account state in a Today-only header affordance.

**Owner decision M3-D-1 — approved 2026-09-08:** use the recommended fourth persistent Profile
destination. Settings remains a child surface.

### 3.2 Profile hierarchy

1. Page title «پروفایل» and truthful account-state summary.
2. Learning section: device-only goal summary, clearly labelled «فقط در این دستگاه» until a server
   preference contract exists.
3. Status section: pending review-event count from real local storage; no “synced” claim without an
   acknowledgement-backed server read.
4. Account rows: Settings, My Packs/Purchases (disabled or absent until D2), Support, Privacy.
5. Account actions: sign out only after the pending-data policy in §7 is implemented.

Do not show an avatar, learner name, phone number, membership tier, purchase count, pack count or
“last synchronized” timestamp unless a reviewed server contract supplies that exact fact. The
pre-implementation state uses a neutral account label rather than a fake person identity.

### 3.3 Settings hierarchy

1. Sound: one local preference «پخش تلفظ» with on/off state.
2. Learning goal: links to the existing device-local goal editor and retains the local-only label.
3. Accessibility: informational row explaining that text size follows the browser/device setting;
   do not add an in-app scale control in the first slice.
4. Language: informational row «فارسی»; no disabled fake language picker.
5. Reminders and quiet hours: absent until notification permission, scheduling, timezone and delivery
   behavior are separately approved.

## 4. Surface and state model

### 4.1 Profile

| State            | Required behavior                                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------------------------------------ |
| Default          | Render only locally known goal and pending counts; account identity remains neutral unless a server read succeeds. |
| Loading          | Skeleton only for a real server-backed account read; local facts do not wait on network.                           |
| Auth unavailable | Hide account-specific values and expose the existing sign-in entry when the auth mode permits it.                  |
| Error            | Keep local facts visible; show a retry only for the failed server read. Never render raw error codes.              |
| Offline          | Show the shared offline banner; label goal and pending counts as device-local.                                     |
| Sync pending     | Show the real unacknowledged review-event count. Do not infer server progress.                                     |
| Empty            | If no goal exists, offer «انتخاب هدف»; do not treat the account itself as empty.                                   |
| Success          | A preference or goal save may use the shared ≤3 second toast; reduced motion uses fade only.                       |

### 4.2 Settings

| State               | Required behavior                                                                                                |
| ------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Default             | Render only implemented local preferences and truthful informational rows.                                       |
| Saving              | Disable only the affected control; preserve the rest of the page.                                                |
| Save error          | Revert the affected toggle, announce the error and offer retry where meaningful.                                 |
| Offline             | Local sound and goal changes remain available and explicitly device-local.                                       |
| Pending server sync | Not shown until an account-scoped preference queue and acknowledgement contract exist.                           |
| Permission denied   | Future reminder UI must explain OS/browser permission denial and link to recovery; it is out of the first slice. |

## 5. Data-truth contract

| Field or action         | First implementation source                | Label / boundary                                       |
| ----------------------- | ------------------------------------------ | ------------------------------------------------------ |
| Account label           | Static product copy                        | «حساب LearnBox»; not a person name.                    |
| Learning goal           | Existing device-local goal store           | «فقط در این دستگاه».                                   |
| Pending review count    | Existing local review queue                | «در انتظار همگام‌سازی» only for the real queue length. |
| Sound preference        | New versioned local preference             | «روی این دستگاه».                                      |
| Text size               | Browser/OS                                 | Informational; no persisted app value.                 |
| Language                | Current Persian UI                         | Informational; no fake selector.                       |
| Support                 | Approved external contact destination      | Opens outside the learner state boundary.              |
| Privacy                 | Approved informational privacy destination | Opens outside the learner state boundary.              |
| Name / masked phone     | Deferred server profile read               | Absent until implemented and reviewed.                 |
| Purchases / packs       | Deferred D2/M4 contracts                   | Absent; never show zero as a placeholder.              |
| Last sync time          | Deferred acknowledgement-backed state      | Absent; browser time is not server evidence.           |
| Reminders / quiet hours | Deferred notification contract             | Absent from first implementation.                      |

Local preferences use a versioned, fail-closed record. Malformed or unknown versions fall back to the
safe default without deleting review queues, personal vocabulary or session data. Web storage denial
falls back to memory for the open session and is labelled non-durable if surfaced. Android uses an
appropriate preference store; secrets and learner tokens never enter it.

## 6. Accessibility, responsive and motion contract

- Persian-first RTL; German, URLs and technical identifiers are isolated LTR.
- Profile is announced as the current page in persistent navigation. Settings has a labelled back
  action and restores focus to the Settings row on return.
- Rows are real links or buttons; no clickable `div`. Toggles expose name, checked state and visible
  focus. Touch targets are at least 44×44 px.
- Status is never color-only. Pending counts are announced as complete Persian phrases.
- A save error uses `role="alert"`; a successful local save uses the shared polite status region.
- At 390×844, 200% text and desktop width, content remains one readable column with no horizontal
  overflow. Long Persian labels wrap; badges do not truncate their meaning.
- Use D0/D1 tokens only. No new Bobo appearance is required. Motion is limited to the shared short
  transition/toast behavior and respects reduced motion.

## 7. Sign-out and pending local data

The existing D1 direction—confirm sign-out and preserve unacknowledged events—is insufficient while
local learner data is not account-scoped. Preserving an unscoped queue across sign-out can expose or
submit one learner's events under a later learner session; deleting it can lose review work.

**Recommendation:** the first Profile implementation does not expose sign out. Add sign out only
after local review events, personal vocabulary and any pending preferences are durably bound to a
stable local account partition derived from the authenticated canonical subject without storing raw
phone or token values. The sign-out sheet then offers:

- «همگام‌سازی و خروج» when online;
- «ماندن در حساب»;
- an offline explanation that pending work must remain isolated and will not be discarded.

A later explicitly approved policy may add «خروج و نگهداری امن روی این دستگاه» after account-scoped
quarantine and re-authentication ownership checks are implemented.

**Owner decision M3-D-2 — approved 2026-09-08:** use the fail-closed recommendation. Do not expose
learner sign out until pending local learner data is account-scoped and cross-account isolation is
verified. This decision does not authorize sign-out implementation.

## 8. Privacy, support and account deletion

Profile may link to the approved privacy and support destinations without making the independent
marketing site a runtime dependency. External navigation is labelled and failure leaves the learner
app usable.

Account deletion is not a sign-out variant. It requires a separately reviewed authenticated server
operation, reauthentication, pending-event treatment, retention/deletion policy, audit evidence and
recovery copy. Do not render a working deletion control in the first slice.

**Owner decision M3-D-3 — approved 2026-09-08:** omit an account-deletion entry from the closed alpha
until a real deletion flow or owner-approved support handoff and response process exists.

## 9. Analytics and privacy

No analytics is required for the first local-only slice. Future instrumentation may record only
surface entry, preference outcome class and support-link activation. It must never include phone,
OTP, token, free-text support content, vocabulary content or local queue payloads.

## 10. Implementation slices after approval

1. **M3-P1 — navigation and truthful Profile foundation:** fourth destination or selected entry,
   local goal/pending facts, Settings/Privacy/Support rows, state-complete Web and Android tests.
2. **M3-S1 — local Settings foundation:** versioned sound preference and device/system information,
   storage-denial/corrupt-record recovery, Web/Android parity.
3. **M3-A1 — account profile read:** separately reviewed authenticated endpoint and masked identity
   presentation; no auth redesign.
4. **M3-A2 — account-scoped local data and sign out:** security-sensitive storage partition,
   pending-event policy, session revocation and cross-account isolation tests.
5. Reminder, account deletion, purchases/packs and server preference synchronization remain separate
   contracts and approval gates.

P1 and S1 may proceed in parallel only if their shared navigation/theme paths do not overlap. A1 and
A2 are serial security-sensitive work. No slice may activate Production, payments, notification
providers or dormant review-sync flags.

## 11. Acceptance gate for implementation readiness

P1/S1 implementation readiness still requires:

- the first-slice rows and deferred rows remain within this approved contract;
- final Persian copy is reviewed in each implementation PR;
- Web and Android test paths and allowed files are recorded in separate queue tasks;
- an independent product/accessibility review finds no data-truth or cross-account blocker.

The owner approval authorizes only the bounded design direction. Every implementation, server, auth,
storage and rollout slice still needs its own queue scope and green-check merge.
