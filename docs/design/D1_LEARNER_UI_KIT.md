# D1 — LearnBox learner UI kit (state board)

**Status:** draft, ready for supervisor review (not approved). Companion to
[`D0_VISUAL_LANGUAGE.md`](./D0_VISUAL_LANGUAGE.md); every value below comes from the D0 token set.
**Scope:** learner surfaces only — Splash, Onboarding, Today, Review Card, Words, Progress,
Profile, Settings. D2 covers Store/Pack detail/Purchases/Admin.
**Baseline:** `origin/main` at `66b4251` (D0 #150, M1-A #151, M1-D slice 1 #152).
**Ground rule:** this is a design state board, not an implementation claim. Endpoints named
below are proposed shapes from `docs/architecture/M1_ONLINE_LEARNING_CONTRACT.md` §8.2 unless a
§8.1 row says implemented-dormant. No surface may present placeholder numbers as real data
(`D0_VISUAL_LANGUAGE.md` §12; `docs/design/UI_QA.md` deviations).

## 0. D1 decisions (recorded here, supersede nothing in D0)

| ID     | Gap (D0 §11)                                             | Decision (chosen recommendation)                                                                                                                                                                                                                                                                                                                              |
| ------ | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1-D-1 | `radius.lg` card: mobile `20px` vs web study card `30px` | **One token: `radius.lg` = `20px` for all learner cards.** Rationale: mobile CardTheme `20px` is the locked value with most shipped evidence; `30px` exists only on one web study-card example. Rebase web cards to `20px`. Hero/display containers that need emphasis use elevation (`D1-D-3`), not radius. `radius.pill` stays `99px` (progress, nav pill). |
| D1-D-2 | Primary button radius: mobile `18px` vs web `22px`       | **`radius.md` = `20px` for primary CTA and inputs.** Single value for both platforms; `18px`/`22px` evidence collapse into it. Touch target stays `56px` height (web desktop may use `58px`).                                                                                                                                                                 |
| D1-D-3 | Elevation: Dart elevation 0 vs web soft shadows          | **Flat-first: resting elevation 0 + `1px border.default` on every card (both platforms).** Web keeps its soft shadow only for the raised study card and primary-button action shadow (`0 12px 24px #4d6bfe35`), matching D0 §4 elevation table; Dart adds the same two shadows behind their equivalents, never default elevation on all surfaces.             |
| D1-D-4 | H1 scale: theme defaults vs explicit clamps              | **Single H1 token: `clamp(32px, 8vw, 48px)` web, `headlineLarge` mobile with minimum `32px`.** Today/Onboarding/Progress/Words H1s use it; `@media (max-width: 420px)` floor `32px` (D0 §7 evidence `36px` → adjust to token). German card lemma keeps its own display exception (`clamp(42px,10vw,64px)` 800, always LTR) — display layer, not body type.    |

Other binding rules carried forward: `radius.sm` `12–16px`, `radius.md` `20px` (D1-D-2), content
column `width: min(100%, 520px)`, spacing 4px base (`space.xs` 4 / `sm` 8 / `md` 16 / `lg` 20–24 /
`xl` 28–32), single primary CTA per screen, no card-in-card without reason, status never
color-only, focus ring `3px solid #25213b` offset 3–4px (web) / Material focus (mobile), touch
targets ≥ 44×44px.

## 1. Cross-surface state vocabulary

Every learner surface below uses the same five states plus sync/success. Copy is Persian-first
(RTL) unless marked LTR (German, code, URLs, identifiers).

| State   | Trigger                                           | Visual/copy rule                                                                                                                                                           |
| ------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Loading | First fetch, session assembly, reconnect fetch    | Skeleton blocks in surface shape (no spinner for cards); `brand.lavender` fill at 40% opacity, pulse 1.2s; reduced-motion → static skeleton. Never show partial numbers.   |
| Empty   | No due cards, no words, no history                | Bobo `welcome`/`recovery` still + one-line Persian copy + single primary CTA to the next useful action. Never "no data" alone.                                             |
| Error   | Failed fetch/action (typed codes §4)              | Inline banner: `semantic.error` icon + text + retry button; keeps last good content when present. Never color-only.                                                        |
| Offline | Connectivity loss detected                        | Top hairline banner: `semantic.warning` (apricot) icon + short Persian text; read-only surfaces keep working, review actions queue locally. Banner never covers CTA.       |
| Sync    | Pending local events, reconciling after reconnect | Small status chip (icon + text) on Today/Words/Progress; count only when server has acknowledged it. `applied_at` is server truth (`M1_ONLINE_LEARNING_CONTRACT.md` §3.1). |
| Success | Event acknowledged / mutation confirmed           | Brief toast or Bobo `celebrate` still, auto-dismiss ≤ 3s; reduced-motion → fade only. Never a blocking modal.                                                              |

Analytics intent (recorded, not implemented): one event per state enter/exit per surface, one per
sync outcome class (`acknowledged`, `idempotencyConflict`, `validation`, `clockSkew`), never raw
content, phone, OTP or token values (`M1_ONLINE_LEARNING_CONTRACT.md` §10).

## 2. Error taxonomy → surface mapping (D0/§9 codes)

| Code                | Surface rendering                                                        |
| ------------------- | ------------------------------------------------------------------------ |
| `validation`        | Inline field or banner error; keep user input; actionable message.       |
| `invalidToken`      | Sign-in required state: hide learner data, show auth CTA (no data loss). |
| `invalidChallenge`  | OTP field error, generic message, allow resend after `retry-after`.      |
| `rateLimited`       | OTP field error + countdown from `retry-after`; no resend spam.          |
| `serverUnavailable` | Offline/error banner + retry; queued events stay pending locally.        |

All learner endpoints require the authenticated boundary (Bearer or learner cookie per surface)
and `cache-control: no-store` on responses; client shows generic copy, never raw error codes.

## 3. Splash / launch

**Hierarchy:** full-canvas brand moment → memory-wave motif (decorative, still in reduced-motion) → LearnBox wordmark (LTR display) → tagline (Persian, RTL) → session-assembly progress → auto-advance to Today (signed-in) or Onboarding/Auth (signed-out).

**Component rules:** `bg.canvas` full bleed; wordmark uses display stack (`800`/`31px`); wave motif `brand.lavender` + `brand.apricot` at low opacity; no CTA on splash (auto-advance only); Bobo only as the `welcome` still, never blocking.

**States:**

| State   | Rule                                                                                                |
| ------- | --------------------------------------------------------------------------------------------------- |
| Loading | Session-assembly skeleton (logo + progress bar `radius.pill` `brand.primary`); max 2s then advance. |
| Error   | If session assembly fails: retry button + Persian copy; never claim signed-in state.                |
| Offline | Show "آفلاین" chip; still advance to cached local state if any; never pretend server sync.          |
| Success | Route by auth truth: authenticated → Today; else → Onboarding (first run) or Auth.                  |

**Accessibility:** wordmark and tagline have text alternatives; wave is decorative (`aria-hidden`); no auto-playing motion that cannot be paused; reduced-motion shows static wave.

**Responsive/motion:** full-bleed at all sizes; `< 420px` compact spacing (D0 §7); wave animation ≤ 1.5s loop, disabled under `prefers-reduced-motion`.

**Acceptance:** splash never shows before auth truth resolves; no invented status text; 390×844 and desktop no overflow.

**Verification:** screenshot at 390×844 and desktop, light only (no dark theme in D0); reduced-motion capture; AX tree shows decorative wave hidden.

## 4. Onboarding

**Hierarchy:** title (Persian H1) → goal radio list (خانه / کار و دانشگاه / سفر — from `INFORMATION_ARCHITECTURE.md` and `onboarding-goal-concept.png`) → secondary "skip" → primary CTA «ادامه».

**Component rules:** goal rows are radio cards (`radius.md` `20px`, `border.default`; selected: 2px `brand.primary` + lavender fill, icon in 78px colored circle per D0 §9); one primary CTA; book logo from concept is NOT product mark (`CONCEPTS.md` deviation — wordmark + neutral memory wave only); skip is a text link, never a second CTA.

**States:**

| State   | Rule                                                                                             |
| ------- | ------------------------------------------------------------------------------------------------ |
| Loading | Skeleton goal rows (3 blocks).                                                                   |
| Error   | Banner on goal save failure; selection preserved.                                                |
| Offline | Local-first: goal can be saved locally and synced later; chip shows pending sync.                |
| Sync    | After reconnect, saved goal syncs; success toast ≤ 3s.                                           |
| Success | CTA → Today; bottom nav appears only after onboarding completes (`INFORMATION_ARCHITECTURE.md`). |

**Copy/data truth:** goal values are product copy (localized), not backend-enumerated unless a `§8.2` proposed endpoint defines them; no fake counts.

**Accessibility:** radio semantics + visible focus; selection change announced; 44px targets; German/technical strings LTR.

**Responsive/motion:** single column; goal rows stack; reduced-motion: no row entrance animation (fade only).

**Acceptance:** goal selection reachable and announcable by keyboard/SR on web; saved locally without server; 390×844 no overflow.

**Verification:** screenshots: default, selected goal, skip path, offline chip; keyboard focus ring capture; AX snapshot of radio group.

## 5. Today

**Hierarchy (from `today-concept.png`):** greeting + Persian H1 (short) → Bobo `welcome`/`recovery` still (optional) → truthful summary figures (due today, new words — server-backed only) → primary CTA «شروع مرور» → secondary: streak chip (apricot) → bottom nav (Today/Words/Progress, active = primary + pill).

**Component rules:** summary figures are `space.md` cards (`radius.lg` `20px`, `1px border.default`, resting elevation 0); figures use `tabular-nums` and `brand.primary` value + `text.muted` label; single primary CTA per D0 §5; streak is feedback, never shame (`BOBO_SYSTEM.md`); counts must be server-backed — no placeholder numbers (`UI_QA.md` deviation).

**States:**

| State   | Rule                                                                                                                           |
| ------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Loading | Skeleton figures + CTA block; no "0" flashes.                                                                                  |
| Empty   | No due cards: Bobo `recovery` still + «کارتی برای مرور نیست» + CTA to Words to learn new words.                                |
| Error   | Banner with retry; keep last good counts if any.                                                                               |
| Offline | Hairline offline banner; figures show last-synced snapshot labelled «آخرین همگام‌سازی»; CTA still starts local review session. |
| Sync    | Pending chip: «N رویداد در انتظار همگام‌سازی» only when locally true; reconcile on reconnect before refreshing figures.        |
| Success | After sync: toast «همگام‌سازی شد»; figures re-fetch from server.                                                               |

**Copy/data truth:** greeting may use first name only when server-provided; due count comes from proposed `GET due-card/Today session` endpoint (§8.2) — NOT implemented; until then Today must show local truth only and label it.

**Accessibility:** figures read as single summary sentence to SR; CTA 56px; offline banner announced; nav keyboard reachable.

**Responsive/motion:** single column ≤ 520px; figures grid 2-up ≥ 520px; streak chip animates once on change, reduced-motion static.

**Acceptance:** no placeholder count; offline label present when stale; CTA starts session from local queue when offline; 390×844 no overflow.

**Verification:** screenshots: loading, empty, offline+banner, pending-sync chip, synced; forced-offline flow capture; AX summary reading.

## 6. Review Card

**Hierarchy:** session header (progress bar `radius.pill` + «کارت X از Y») → German lemma (LTR, display weight) → article chip (LTR, `#ffba7a` border + `#e87c23` text) → vocabulary image (controlled soft-3D, no generated text) → flip control → back face: example (German LTR line + Persian RTL translation) → pronunciation control (audio, `lang="de-DE"`) → four grade buttons (`forgot` red-tinted / `hard` apricot / `remembered` lavender / `mastered` green-tinted; icon+text, never color-only) → session end summary + Bobo `celebrate`.

**Component rules:** card `radius.lg` `20px`; flip is smooth 3D, no forced delay, reduced-motion → crossfade (`MOTION.md`); grade disabled state opacity 0.72 while awaiting server; grade buttons min 44×44, stacked 2×2 on mobile, row of 4 ≥ 520px; session end is calm, never pressure (`BOBO_SYSTEM.md`).

**States:**

| State   | Rule                                                                                                                                                                                                              |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Loading | Card skeleton (lemma block + image block).                                                                                                                                                                        |
| Empty   | No cards in session: end state with summary + CTA back to Today.                                                                                                                                                  |
| Error   | Grade submission failed: keep event pending locally, show inline error on the grade row, allow retry; never drop the event.                                                                                       |
| Offline | Banner; grades queue locally (idempotent `clientEventId`); session continues.                                                                                                                                     |
| Sync    | Pending chip on session header; `acknowledged` → success toast per batch; `idempotencyConflict` → keep event, resolve with new payload (M1 §6 rule 2); `validation`/`clockSkew` → surface inline, event retained. |
| Success | Bobo `celebrate` still ≤ 3s; next card or end summary.                                                                                                                                                            |

**Copy/data truth:** lemma/article/example are content from approved `card_versions` only (server resolves `contentId` → `approved`/`published`); no card text hard-coded in UI; media failures show a labelled placeholder, never broken layout.

**Accessibility:** flip is a labelled button (not div-click); pronunciation button has `lang="de-DE"` and SR label; grades have text labels; keyboard flip + grade reachable; German blocks LTR isolated.

**Responsive/motion:** lemma `clamp(42px,10vw,64px)`; card max-width 520px; flip 3D disabled under reduced-motion; no horizontal overflow at 390×844 (test with 200% zoom text).

**Acceptance:** every grade produces a persisted pending event with unique `clientEventId`; offline grade survives restart; exact-acknowledgement only removes it (`offline-sync.ts`); no duplicate events after replay.

**Verification:** screenshots: front, back, grades, offline pending, sync toast, end summary; forced airplane-mode restart → queue intact; replay same `clientEventId` → idempotent (API tests cover server side).

## 7. Words

**Hierarchy (from `words-screen-concept.png`):** Persian H1 «واژه‌ها» → search input (LTR-isolated for German terms) → filter chips (همه / رسمی / شخصی — `radius.sm`) → word list (rows: German lemma LTR + article chip + Persian gloss) → add-personal-word FAB/entry (only if personal vocabulary is in scope) → bottom nav.

**Component rules:** rows are `radius.md` cards, `1px border.default`; search min-height 44px, `radius.md` `20px`; chips `radius.sm` 12–16px; canonical vs personal distinction shown as chip/metadata, never color-only; personal words are `:v1:local-prototype` until the proposed vocabulary endpoints exist (§8.2).

**States:**

| State   | Rule                                                                                                      |
| ------- | --------------------------------------------------------------------------------------------------------- |
| Loading | List skeleton rows (6).                                                                                   |
| Empty   | No results: Bobo `focus` still + «واژه‌ای پیدا نشد» + clear-search action; empty personal list → add CTA. |
| Error   | Banner + retry; search results kept if cached.                                                            |
| Offline | Banner; catalog list shows last-synced cache labelled; add-word queues locally.                           |
| Sync    | Added word shows pending chip → acknowledged → moves to synced list.                                      |
| Success | Add-word success toast; duplicate check inline (normalization per `PRODUCT_STATUS.md`).                   |

**Copy/data truth:** official catalog words are content-versioned; personal words must never be presented as official; no counts invented.

**Accessibility:** search labelled; list items are buttons with lemma read first (`lang="de-DE"`); chips focusable; keyboard reachable.

**Responsive/motion:** single column; list virtualizes long catalogs (design note; implementation gated); row entrance fade only under reduced-motion.

**Acceptance:** search works offline over cached catalog; add-word duplicates rejected or clearly labelled personal; no official/personal mix-up.

**Verification:** screenshots: list, search active, no-results empty, add-word pending chip, offline banner; SR reading of a row.

## 8. Progress

**Hierarchy (from `progress-screen-concept.png`):** Persian H1 «پیشرفت» → streak chip (apricot) → weekly chart card (bars, `radius.pill` track, `brand.primary`/`lavender`) → insight summary (text, accessible equivalent of chart) → next-step CTA (recovery or continue) → Bobo `encourage`/`recovery` still → bottom nav.

**Component rules:** chart bars are non-interactive decoration with a full text summary beside/below (never color-only, never chart-only); streak rules are server-side (proposed — `PRODUCT_STATUS.md` "Partial"); recovery mode per `USER_FLOWS.md` (backlog → short recovery session, no new cards, encouraging copy).

**States:**

| State   | Rule                                                                                          |
| ------- | --------------------------------------------------------------------------------------------- |
| Loading | Chart skeleton + summary skeleton.                                                            |
| Empty   | No history: Bobo `welcome` still + «هنوز داده‌ای نیست؛ اولین جلسه را شروع کن» + CTA to Today. |
| Error   | Banner + retry; last-good chart kept.                                                         |
| Offline | Banner; chart shows last-synced snapshot labelled «آخرین همگام‌سازی».                         |
| Sync    | Pending chip while local events reconcile; chart refreshes only from server truth after ack.  |
| Success | CTA to next session; streak chip updates once, calm (no confetti).                            |

**Copy/data truth:** device-local counts were the prior web truth (`UI_QA.md`: "فقط تعداد واقعی کارت‌های ثبت‌شدهٔ امروز"); server-backed history is proposed (§8.2) — chart must be labelled as local/sample until server endpoint exists. Streak language never shames (`BOBO_SYSTEM.md`).

**Accessibility:** chart has `role="img"` + full text summary; summary read by SR; CTA 56px.

**Responsive/motion:** chart scales to column width; bars animate height once, static under reduced-motion.

**Acceptance:** no invented weekly numbers; every figure labelled with its source truth (server/local); recovery CTA present on backlog.

**Verification:** screenshots: loading, empty, chart+summary, offline stale label, recovery state; SR reads summary sentence.

## 9. Profile / Settings

**Hierarchy (direction only — no complete product surface exists, `DESIGN_STATUS.md`):** Profile: learner identity (name from server, avatar placeholder — no unapproved mark) → goal summary → account rows (حساب، خریدها، همگام‌سازی، پشتیبانی) → sign out (destructive, confirm). Settings: preferences — یادآورها (delivery/quiet hours — product behavior per `PRODUCT_STATUS.md` "Planned"), صدا (separate mute, `SOUND.md`), ظاهر/مقیاس متن, زبان. Profile and Settings share the learner shell; no bottom nav on Profile/Settings (they sit behind Today header or account entry).

**Component rules:** rows are `radius.md` cards with chevron; toggles ≥ 44px with text label; sign-out is `semantic.error` text action with confirmation sheet; no card-in-card.

**States:**

| State   | Rule                                                                                          |
| ------- | --------------------------------------------------------------------------------------------- |
| Loading | Rows skeleton.                                                                                |
| Empty   | Not applicable (identity always present once signed in); auth surfaces are outside D1 board.  |
| Error   | Banner on preference save failure; revert toggle.                                             |
| Offline | Banner; preferences save locally and sync later (queued like review events where applicable). |
| Sync    | Pending chip on preference rows until acknowledged.                                           |
| Success | Toast ≤ 3s per saved preference.                                                              |

**Copy/data truth:** identity fields server-provided; purchases rows are D2 (Store/Pack/Purchases) — do not render fake purchase history here; sign-out copy explicit about local pending sync before logout (never delete unacknowledged events).

**Accessibility:** toggles labelled, keyboard operable; confirmation sheet focus-trapped; sign-out reachable by keyboard.

**Responsive/motion:** single column ≤ 520px; sheet slides, reduced-motion → fade.

**Acceptance:** every toggle persists truthfully (server or clearly-labelled local); sign-out confirms and preserves pending queue; no purchase placeholders.

**Verification:** screenshots: profile, settings, toggle on/off, offline pending chip, sign-out confirm; keyboard + SR pass.

## 10. Cross-surface acceptance (D0 §12 gates, restated for D1)

- [ ] Every surface uses D0 tokens (no new hard-coded hex/size) or a recorded deviation here.
- [ ] Persian RTL first; German/technical LTR; verified 390×844 (no overflow) + desktop + 200% zoom.
- [ ] Loading, empty, error, offline and sync states specified per surface above and evidenced in D3 (`DESIGN_STATUS.md` readiness rule).
- [ ] Contrast AA on all text; status never color-only.
- [ ] Reduced-motion equivalent for every animation; Bobo motion never blocks.
- [ ] Touch targets ≥ 44px; web keyboard + visible focus; SR labels on icon-only controls; `lang="de-DE"` on German content.
- [ ] One primary CTA per screen; no card-in-card without reason.
- [ ] Bobo assets canonical `1.0.0` with `assetId`; no new appearance without owner approval.
- [ ] Web/mobile parity per D1-D-1..D1-D-4 (radius.lg 20px, button radius 20px, flat-first elevation, H1 clamp token).
- [ ] Data truthful: server-backed counts or clearly-labelled local/sample; no placeholder numbers.
- [ ] Sound (if any) optional, soft, short, separately muteable.

## 11. Screenshot verification plan (executed at D3, not now)

| Surface          | Matrix                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------ |
| Splash           | 390×844, desktop, reduced-motion static, AX (decorative hidden).                           |
| Onboarding       | Default, selected goal, skip path, offline chip, keyboard focus.                           |
| Today            | Loading skeleton, empty, offline banner, pending sync chip, synced toast.                  |
| Review           | Front, back, grades, offline pending, restart-with-queue, replay idempotency, end summary. |
| Words            | List, search, no-results, add-word pending→ack, offline banner.                            |
| Progress         | Loading, empty, chart+text summary, stale offline label, recovery state.                   |
| Profile/Settings | Profile, settings, toggle on/off, pending chip, sign-out confirm, keyboard/SR.             |

Each capture records: device/viewport, locale (fa / de-isolated-LTR), reduced-motion state,
auth/sync state, and the truth label shown (server / local / sample). Screenshots are QA
evidence only (`M1-Q`), never approval.

## 12. Out of scope / boundaries

- No product code, API, mobile/Web implementation, queue, secrets or deployment changes from this board.
- D2: Store, Pack detail, offers, checkout, Purchases, My Packs, Admin Content Factory/review.
- Auth (phone OTP) screens are referenced but not re-specified here; they follow D0 tokens and their own QA record (`UI_QA.md`).
- No owner/design approval is claimed by this document; it is a review artifact.
