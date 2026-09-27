# Mobile web-parity expansion design

## Purpose

Extend the existing Flutter learner shell so the available native offline experience reads as the
same LearnBox product as `apps/website`, while remaining mobile-native and truthful about what is
stored only on the device. This is a presentation and local-navigation expansion, not native
authentication, sync, billing, personal-vocabulary capture, media-player activation or a release
change.

## Design contract

**Thesis:** a short LearnBox session should feel like opening a calm personal study desk, not a
shrunk browser page or a generic Material demo.

**Own world:** retain the established warm canvas (`#fffaf4`), white content surfaces, indigo
action (`#4d6bfe`), lavender support layer (`#f3ecff`), IRANSansX and the approved Bobo assets.
One consistent native component vocabulary is used across the shell; the familiar web identity is
translated for touch, safe areas and dynamic type rather than copied as desktop chrome.

**Story:** the learner immediately sees what is ready today, can begin review, can browse the
three bundled words, and can see only truthful device-local review status.

**First viewport:** Today keeps its short greeting, daily-session summary, optional decorative
encourage Bobo on tall displays, and a full-width `شروع مرور` action in the natural thumb zone.
The persistent navigation stays at the lower edge outside active review.

**Form:** this is the second native expansion of the established web learner surface: a restrained,
touch-first study shell, not a new visual identity.

## Scope

### Included native surfaces

1. **Today:** preserve the current real repository load, empty, loading and recovery states;
   strengthen visual hierarchy only where it uses the existing tokens and real card count.
2. **Words:** replace the placeholder with a scrollable, offline `واژه‌های شروع` list built from
   the already-loaded canonical three cards. Each row shows the approved card image, German phrase
   including article (LTR), and Persian meaning. It does not imply that the learner owns, bought
   or can edit a broader vocabulary library.
3. **Progress:** replace the placeholder with an offline status surface derived only from
   `ReviewQueue.pendingCount()`: report the count as answers "ذخیره‌شده در این دستگاه". It must
   never claim upload, a streak, a server profile, proficiency, entitlement or sync completion.
4. **App shell:** own the selected native destination and preserve the bottom navigation across
   Today, Words and Progress. Review and completion remain focused routes without that navigation;
   returning from completion lands on Today.

### Deliberately excluded

- Native identity, OTP, session, real authenticated transport, background sync or any HTTP call.
- Pronunciation player; it is independently designed in PR #87 / Issue #59.
- Personal-word creation, package purchase, Plus, notification, onboarding, admin, splash upload,
  app-icon change, provider, flag, release, migration or Bobo-asset work.
- Any fabricated score, streak, learner profile, dashboard metric or remote status.

## Architecture and component boundaries

- `LearnBoxApp` continues to provide the repository and queue. After the existing launch handoff,
  it opens a new `LearnerHomeShell` instead of a fixed `TodayScreen`.
- `LearnerHomeShell` owns `LearnerDestination`, routes taps from `LearnerBottomNavigation`, and
  passes the same `StartPackRepository` and `ReviewQueue` to its selected screen. It does not
  read, write or acknowledge the queue.
- `TodayScreen` remains the learning-session entry point. Make navigation optional/injected so it
  can render inside the shell without duplicating it; its `FutureBuilder` and review route are
  retained.
- `WordsScreen` loads the canonical daily session through `StartPackRepository`, with the same
  loading/error/retry honesty as Today. It has no mutable word state.
- `ProgressScreen` obtains a one-time local pending-count read through `ReviewQueue`; it has
  loading/error/retry states and no sync trigger. Returning from a completed review rebuilds Today,
  so the visible count is refreshed when Progress is selected again.
- `LearnerBottomNavigation` stays a reusable labeled, semantic presentation component and receives
  only the selected destination plus a callback.

## Interaction and visual rules

- Persian interface text is RTL; German phrase, definition and examples are isolated LTR.
- Use the same warm canvas, white card surface, indigo primary action, lavender selected state,
  `learnBoxBorder`, `learnBoxInk`, `learnBoxMuted` and IRANSansX Regular/Bold as the web app.
- Screen gutters are 24px; compact spacing is 8/16px; card radii remain 16–20px; primary actions
  are at least 56px and every interactive target is at least 48px.
- Words uses a genuinely readable list, not a grid of equal decorative cards. Images support word
  recognition and remain semantically labeled; no duplicate Bobo or hero media is added.
- Progress is intentionally quiet: a precise local count, explanatory copy and a `شروع مرور`
  action when cards are ready. Its empty state says that no answer is yet stored on this device.
- Active navigation is indigo/lavender; unavailable-state SnackBars disappear because Words and
  Progress become real offline surfaces.
- Motion is limited to normal native route transition and existing answer/completion feedback;
  no autoplay sound, animation delay or network-dependent state is introduced.

## Accessibility and resilience

- Keep semantic headings, labels, error live regions and logical RTL focus order.
- Verify 320px width, landscape and enlarged text: no clipped Persian/German text, hidden primary
  action or overflow. Navigation remains reachable after scroll.
- Loading uses descriptive progress semantics; errors identify the failed local preparation and
  offer retry. Empty state, content and retry remain usable if image assets fail.
- Bobo is decorative only where it already is approved; no canonical expression or filename is
  changed.

## Acceptance criteria

1. Today, Words and Progress share the documented web token family and touch-native spacing.
2. Words displays only the exact three canonical Start cards in canonical order, with German
   article and Persian meaning.
3. Progress derives its number only from `ReviewQueue.pendingCount()` and labels it device-local.
4. Selecting a navigation destination changes only local presentation; it never calls sync,
   identity, HTTP, provider or release code.
5. The active review and completion behavior, including exactly one queue record per grade and
   return-to-Today behavior, remains unchanged.
6. RTL/LTR semantics, narrow width, landscape, enlarged text, loading, empty and error/retry
   states have Flutter widget coverage.
7. `flutter analyze`, full Flutter tests, debug APK build, emulator visual smoke and the existing
   physical Android visual smoke are recorded before a merge. Unavailable device verification is a
   merge blocker, not a passing claim.

## Rollback and analytics

The work adds no feature flag, analytics event, release state or remote write. Reverting its single
implementation PR restores the former Today-only shell and placeholder navigation without touching
the encrypted local review queue or any service boundary.
