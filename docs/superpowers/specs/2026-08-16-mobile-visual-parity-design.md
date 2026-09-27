# Mobile visual parity design

## Purpose and scope

Bring the Flutter learner experience into the same visual family as the existing learner web app
without copying desktop layout into a touch interface. This first slice covers only the daily
learning loop:

1. Today
2. Card review
3. Daily completion
4. Persistent bottom navigation

Authentication, onboarding, personal vocabulary, Progress, Plus, settings, provider activation,
network transport and app-icon changes are explicitly out of scope. The existing secure offline
review queue, three-card Start session and disabled sync composition remain behaviorally unchanged.

## Chosen approach

Use a mobile-native interpretation of the established web design system. Reuse the web identity
(warm canvas, white surfaces, indigo action colour, lavender borders, IRANSansX, Persian RTL,
calm supportive copy and canonical Bobo) while adapting density, safe areas and touch targets for
small screens. Do not reproduce the web DOM or desktop shell mechanically.

The web learner app is the visual source of truth. Flutter remains an independent client with its
own components and no web runtime dependency.

## Visual contract

| Element         | Mobile rule                                                                                                                                                                                                      |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Canvas          | `#fffaf4` warm background; white cards/sheets; no dark application chrome.                                                                                                                                       |
| Brand action    | Primary indigo `#4d6bfe`; a pressed/disabled state remains visibly distinct.                                                                                                                                     |
| Support colours | Lavender `#f3ecff`, border `#e7e3ff`, muted text `#64748b`, ink `#1e293b`, apricot accent `#ffb36b`.                                                                                                             |
| Typography      | Ship the licensed IRANSansX Regular 400 and Bold 700 files already approved for LearnBox. Persian is RTL; German examples and word forms are isolated LTR. No fallback font is used when the bundled files load. |
| Spacing         | 8px base rhythm; 16px compact gaps; 24px screen gutters; 16–24px rounded cards; 56px minimum primary controls.                                                                                                   |
| Bobo            | Only the canonical approved asset expressions and filenames may be imported. Bobo is supportive, never a replacement for task status, text or controls.                                                          |
| Motion          | Short, reduced-motion-safe feedback only: answer reveal, card transition and completion celebration. No blocking animation, autoplay sound or network-dependent motion.                                          |

## Screen design

### Today

The launch screen continues to hand off after its current three-second duration. Today then uses a
short greeting/eyebrow, a clear daily-card count, a lightweight progress/streak summary and one
full-width primary `شروع مرور` button near the natural thumb zone. A small canonical encouraging
Bobo may accompany the summary on sufficiently tall screens; it is decorative and omitted before
content or controls must shrink. Loading, empty and recovery states retain the same layout,
supportive copy and an explicit retry button.

### Card review

The screen keeps a persistent, labelled progress indicator and a concise ordinal. The card image
is the hero; its image uses the card asset and semantic label. The German phrase is visually
prominent, LTR and includes its article. Before reveal, there is one clear `نمایش پاسخ` action.
After reveal, Persian meaning, definition and example are grouped into a readable card, followed
by the four grades. Grade actions retain their current meaning and queue behavior; they become
two-by-two buttons on normal widths and one column for narrow screens or enlarged text. A future
pronunciation control is reserved only after Issue #59 and PR #65 are fully approved and merged;
this visual slice does not add a player.

### Daily completion

Completion is a focused success surface with canonical celebration Bobo, the existing truthful
completion message and the locally pending answer count. It presents a single return-to-Today
action. It must never imply that local events have uploaded or that a streak, entitlement or
server state changed.

### Bottom navigation

Today, Words and Progress are always labelled in Persian and remain keyboard- and screen-reader
accessible. Today is active for this slice. Words and Progress are visual destination placeholders
only until their approved mobile flows are implemented: tapping them must either retain the user
on Today with a calm "به‌زودی" notice or be disabled with an explanation; it must not fabricate
data or route to a partial feature. Navigation is outside review flow and does not appear while a
card is being graded.

## Component boundaries

- `LearnBoxTheme`: colour scheme, IRANSansX text theme, button/card/navigation defaults and RTL
  helpers. It has no storage or sync dependency.
- `TodayScreen`: presentation around the existing `StartPackRepository` session and `ReviewQueue`.
- `ReviewScreen`: keeps grade persistence and error behavior; presentation-only subwidgets may be
  extracted for progress, media card, revealed answer and grade grid.
- `CompletionScreen`: owns completion presentation and receives the already-computed local pending
  count; it does not read storage itself.
- `LearnerBottomNavigation`: labelled presentation component with an explicit destination callback.

No component may call the dormant `ReviewSyncCoordinator`, make HTTP requests, inspect a release
flag or modify the canonical learning data model.

## Responsiveness, accessibility and resilience

- Support narrow Android widths, safe-area insets and dynamic type without clipped German or
  Persian text.
- Preserve current semantic labels, live error announcements, contrast and logical RTL focus
  order. Interactive targets are at least 48px high; primary buttons are at least 56px.
- When image/font/Bobo assets fail to load, text, task state and primary actions remain usable.
  Do not render an opaque or substitute Bobo asset.
- All existing offline persistence and failure handling remain unchanged. UI language must say
  "ذخیره روی این دستگاه" unless a future authenticated acknowledgement is actually present.

## Acceptance criteria

1. Android/iOS Flutter Today, review and completion screens visually use the documented LearnBox
   token family and bundled IRANSansX Regular/Bold fonts.
2. The daily loop still loads exactly three canonical Start cards, records exactly one local event
   per grade and preserves the current no-data-loss error behavior.
3. German content is LTR and includes the displayed article; Persian interface text is RTL.
4. All reviewed states work at narrow width and enlarged text, with no hidden essential control.
5. The bottom navigation is accessible and cannot expose fabricated Words/Progress data.
6. Bobo appearance is unchanged and only canonical approved asset variants are used.
7. Existing mobile, storage, sync-composition and launch tests remain green; new widget tests cover
   token/theme usage, key visual states, RTL semantics, narrow/enlarged-text grade layout,
   navigation placeholder behavior and asset fallback.
8. A debug APK is built and visually smoke-tested on the existing Android emulator and the
   representative physical Android device before merge. The physical-device result is recorded
   honestly; inability to run it blocks merge.

## Delivery sequence

1. Audit and package licensed fonts plus approved Bobo assets with source/provenance checks.
2. Implement the isolated theme and reusable presentation components with widget tests.
3. Restyle Today and review without changing their learning/storage contracts.
4. Extract and restyle completion, then add accessible bottom navigation placeholders.
5. Run Flutter analysis/tests, debug APK, emulator smoke and physical-device validation; open a
   PR only after the required evidence is recorded.

Routine, bounded widgets and widget tests may be delegated after this design and an implementation
plan are approved. Theme architecture, Bobo asset selection, behavior boundaries, design review,
device QA and the final merge remain reviewer-owned work.
