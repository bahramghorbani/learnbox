# Mobile Visual Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first Flutter learner UI slice—Today, card review, completion and navigation—in the approved LearnBox visual language while preserving the existing offline learning behavior.

**Architecture:** Add a presentation-only `ui/` layer for tokens, typography and bottom navigation. Keep `TodayScreen`, `ReviewScreen`, `StartPackRepository`, `ReviewQueue` and the disabled sync coordinator behaviorally isolated; UI widgets receive data and callbacks rather than reading storage or calling transport. Canonical assets are copied byte-for-byte from their approved web locations and verified by checksum before use.

**Tech Stack:** Flutter/Dart 3.5+, Material 3, `flutter_test`, existing `flutter_secure_storage`, existing canonical image/font files, Android debug APK.

## Global Constraints

- Preserve Persian RTL; every German word, definition and example uses an explicit LTR subtree.
- Use only `IRANSansX-Regular.woff2` and `IRANSansX-Bold.woff2`, with `400` and `700` respectively.
- Preserve the exact approved Bobo `encourage-v2` and `celebrate-v2` bytes; do not generate, crop, recolour or otherwise alter Bobo.
- Keep the three canonical Start cards, exact grade mappings, encrypted local queue, no-data-loss failure behavior and disabled sync composition unchanged.
- No HTTP client, authentication, provider call, release flag, audio player, data migration, Bobo redesign, production activation or new dependency is allowed.
- Primary controls are at least 56px high; all other interactive controls are at least 48px high.
- Every implementation change runs `dart format`, `flutter analyze`, focused `flutter test`, full `flutter test`, `flutter build apk --debug`, `pnpm check`, `pnpm build` and `node scripts/validate-migrations.mjs` before PR.
- A developer may not claim emulator or physical-device evidence without actually recording it. The existing representative device is Xiaomi M2006C3LG; its unavailable test is a merge blocker.

---

## File structure

| Path                                                     | Responsibility                                                                             |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `apps/mobile/assets/fonts/IRANSansX-Regular.woff2`       | Approved regular Persian font, copied byte-for-byte.                                       |
| `apps/mobile/assets/fonts/IRANSansX-Bold.woff2`          | Approved bold Persian font, copied byte-for-byte.                                          |
| `apps/mobile/assets/bobo/encourage-v2.png`               | Approved decorative Today expression, copied byte-for-byte.                                |
| `apps/mobile/assets/bobo/celebrate-v2.png`               | Approved decorative completion expression, copied byte-for-byte.                           |
| `apps/mobile/lib/ui/learnbox_theme.dart`                 | Immutable token/theme mappings and LTR helper styles.                                      |
| `apps/mobile/lib/ui/learner_bottom_navigation.dart`      | Accessible labelled learner navigation and explicit placeholder callback.                  |
| `apps/mobile/lib/features/review/completion_screen.dart` | Presentation-only daily-complete state.                                                    |
| `apps/mobile/lib/features/review/today_screen.dart`      | Existing session loading behavior with new visual composition.                             |
| `apps/mobile/lib/features/review/review_screen.dart`     | Existing reveal/grade behavior with visual card components and extracted completion state. |
| `apps/mobile/test/visual_assets_test.dart`               | Bundled font/Bobo manifest and source-byte checksum checks.                                |
| `apps/mobile/test/learnbox_theme_test.dart`              | Token, font and RTL theme assertions.                                                      |
| `apps/mobile/test/learner_bottom_navigation_test.dart`   | Labels, selected state and non-fabricating placeholder behavior.                           |
| `apps/mobile/test/mobile_visual_parity_test.dart`        | Today/review/completion layout, semantics and narrow/large-text checks.                    |
| `scripts/verify-mobile-visual-assets.mjs`                | Source/mobile checksum verification usable in CI.                                          |

## Task 1: Approve and package immutable visual assets

**Files:**

- Create: `apps/mobile/assets/fonts/IRANSansX-Regular.woff2`
- Create: `apps/mobile/assets/fonts/IRANSansX-Bold.woff2`
- Create: `apps/mobile/assets/bobo/encourage-v2.png`
- Create: `apps/mobile/assets/bobo/celebrate-v2.png`
- Create: `apps/mobile/test/visual_assets_test.dart`
- Create: `scripts/verify-mobile-visual-assets.mjs`
- Modify: `apps/mobile/pubspec.yaml`
- Modify: `package.json`

**Interfaces:**

- Consumes: `apps/website/public/fonts/IRANSansX-Regular.woff2`, `apps/website/public/fonts/IRANSansX-Bold.woff2`, `apps/website/public/images/bobo/encourage-v2.png`, `apps/website/public/images/bobo/celebrate-v2.png`.
- Produces: Flutter asset paths `assets/fonts/IRANSansX-Regular.woff2`, `assets/fonts/IRANSansX-Bold.woff2`, `assets/bobo/encourage-v2.png`, and `assets/bobo/celebrate-v2.png`.

- [ ] **Step 1: Write checksum assertions before copying assets**

Create `scripts/verify-mobile-visual-assets.mjs` with these declared source and target checksums:

```js
const assets = [
  [
    'apps/website/public/fonts/IRANSansX-Regular.woff2',
    'apps/mobile/assets/fonts/IRANSansX-Regular.woff2',
    '989d0b33c3f9c36e2967ceb982165f6ebcc36eaa8007056a2d7a94a68f0b1d42',
  ],
  [
    'apps/website/public/fonts/IRANSansX-Bold.woff2',
    'apps/mobile/assets/fonts/IRANSansX-Bold.woff2',
    'ee7a4dc0bdbb8c364677e02af2d8d51d6c69e4d51c70089a5ec3fff478aa2c41',
  ],
  [
    'apps/website/public/images/bobo/encourage-v2.png',
    'apps/mobile/assets/bobo/encourage-v2.png',
    'a95193a4fb843d41c5139366eabe9f9038e9ce3e995ae4730d9bead825b2c43a',
  ],
  [
    'apps/website/public/images/bobo/celebrate-v2.png',
    'apps/mobile/assets/bobo/celebrate-v2.png',
    '06b57dee703c6660c0a2f334e8531ae2240a278266d3c43e3e984a6b397b4a8c',
  ],
];
```

Hash each existing path with `createHash('sha256')`; fail if the source or target is missing or differs from the listed hash. Add `verify:mobile-visual-assets` to `package.json`.

- [ ] **Step 2: Run the verifier and confirm it fails before assets exist**

Run: `node scripts/verify-mobile-visual-assets.mjs`

Expected: failure naming the first missing mobile target, while no source asset is changed.

- [ ] **Step 3: Copy only the approved bytes and register the Flutter assets/fonts**

Copy the four files with `cp -p`; add this exact section under `flutter:` in `apps/mobile/pubspec.yaml`:

```yaml
fonts:
  - family: IRANSansX LearnBox
    fonts:
      - asset: assets/fonts/IRANSansX-Regular.woff2
        weight: 400
      - asset: assets/fonts/IRANSansX-Bold.woff2
        weight: 700
assets:
  - assets/bobo/
  - assets/fonts/
```

Keep existing asset declarations intact. Do not add the unapproved `v1` Bobo images.

- [ ] **Step 4: Add a Flutter asset-manifest test**

In `visual_assets_test.dart`, load `AssetManifest.json` and assert all four exact paths are present:

```dart
for (final path in const [
  'assets/fonts/IRANSansX-Regular.woff2',
  'assets/fonts/IRANSansX-Bold.woff2',
  'assets/bobo/encourage-v2.png',
  'assets/bobo/celebrate-v2.png',
]) {
  expect(manifest.keys, contains(path));
}
```

- [ ] **Step 5: Run focused verification and commit**

Run: `node scripts/verify-mobile-visual-assets.mjs && cd apps/mobile && flutter test test/visual_assets_test.dart`

Expected: all four assets match approved source bytes and Flutter registers them.

Commit:

```bash
git add apps/mobile/assets apps/mobile/pubspec.yaml apps/mobile/test/visual_assets_test.dart scripts/verify-mobile-visual-assets.mjs package.json
git commit -m "feat(mobile): package approved visual assets"
```

## Task 2: Build the presentation-only LearnBox theme and navigation

**Files:**

- Create: `apps/mobile/lib/ui/learnbox_theme.dart`
- Create: `apps/mobile/lib/ui/learner_bottom_navigation.dart`
- Create: `apps/mobile/test/learnbox_theme_test.dart`
- Create: `apps/mobile/test/learner_bottom_navigation_test.dart`
- Modify: `apps/mobile/lib/app.dart`

**Interfaces:**

- Produces `ThemeData buildLearnBoxTheme()`, `TextStyle learnBoxGermanStyle(BuildContext context)`, `enum LearnerDestination { today, words, progress }`, and `LearnerBottomNavigation({required LearnerDestination current, required ValueChanged<LearnerDestination> onDestinationSelected})`.
- Consumes no repository, queue, identity, storage or sync type.

- [ ] **Step 1: Write the failing theme and navigation tests**

Assert the theme exposes the required colors and family, and that the nav emits only the selected
destination:

```dart
expect(theme.scaffoldBackgroundColor, const Color(0xfffffaf4));
expect(theme.colorScheme.primary, const Color(0xff4d6bfe));
expect(theme.textTheme.bodyLarge?.fontFamily, 'IRANSansX LearnBox');
await tester.tap(find.text('واژه‌ها'));
expect(selected, LearnerDestination.words);
```

Also assert `Semantics` exposes `ناوبری اصلی` and `امروز` has `isSelected` when current.

- [ ] **Step 2: Run focused tests and confirm missing symbols fail**

Run: `cd apps/mobile && flutter test test/learnbox_theme_test.dart test/learner_bottom_navigation_test.dart`

Expected: compile failure because the theme and navigation types do not yet exist.

- [ ] **Step 3: Implement `LearnBoxTheme` with fixed approved tokens**

Use the following token constants; create `ThemeData` with `useMaterial3: true`, white cards,
minimum 56px primary button, rounded 18px buttons, 20px cards and `IRANSansX LearnBox` text
themes. Do not use `ColorScheme.fromSeed`.

```dart
const learnBoxCanvas = Color(0xfffffaf4);
const learnBoxPrimary = Color(0xff4d6bfe);
const learnBoxLavender = Color(0xfff3ecff);
const learnBoxBorder = Color(0xffe7e3ff);
const learnBoxInk = Color(0xff1e293b);
const learnBoxMuted = Color(0xff64748b);
const learnBoxApricot = Color(0xffffb36b);
```

`learnBoxGermanStyle` must return a text style with `fontFamily: 'IRANSansX LearnBox'` and is used
inside an explicit LTR `Directionality`, never as a global text-direction switch.

- [ ] **Step 4: Implement labelled navigation without hidden future screens**

Render `NavigationBar` with exactly the labels `امروز`, `واژه‌ها`, `پیشرفت`; every destination has
an explicit icon and `onDestinationSelected` callback. The parent chooses whether to display a
placeholder notice; the component itself never routes, reads storage or claims data exists.

- [ ] **Step 5: Adopt the theme and run focused tests**

Set `theme: buildLearnBoxTheme()` in `LearnBoxApp` and preserve its existing `Locale('fa')` and
root RTL `Directionality`.

Run: `cd apps/mobile && flutter test test/learnbox_theme_test.dart test/learner_bottom_navigation_test.dart`

Expected: tests pass and `flutter analyze` reports no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/lib/app.dart apps/mobile/lib/ui apps/mobile/test/learnbox_theme_test.dart apps/mobile/test/learner_bottom_navigation_test.dart
git commit -m "feat(mobile): add LearnBox visual theme"
```

## Task 3: Restyle Today and keep its offline session contract

**Files:**

- Modify: `apps/mobile/lib/features/review/today_screen.dart`
- Modify: `apps/mobile/test/mobile_learning_loop_test.dart`
- Modify: `apps/mobile/test/support/mobile_test_app.dart`
- Create: `apps/mobile/test/mobile_visual_parity_test.dart`

**Interfaces:**

- Consumes existing `StartPackRepository`, `ReviewQueue`, `StartCard`, `LearnBoxTheme`, `LearnerBottomNavigation`.
- Produces an unchanged `onStart` review transition and an explicit `void _showUnavailableDestination(LearnerDestination destination)` callback.

- [ ] **Step 1: Write failing Today visual tests**

In `mobile_visual_parity_test.dart`, assert the readable title, card count, primary action, optional
decorative Bobo semantics exclusion and the non-fabricating navigation notice:

```dart
expect(find.text('امروز'), findsOneWidget);
expect(find.text('۳ کارت برای مرور امروز آماده است.'), findsOneWidget);
expect(find.text('شروع مرور'), findsOneWidget);
await tester.tap(find.text('واژه‌ها'));
await tester.pump();
expect(find.text('این بخش به‌زودی در اپ موبایل آماده می‌شود.'), findsOneWidget);
```

Test a `Size(320, 360)` view with `textScaleFactor: 2` and assert the primary button is discoverable
after `ensureVisible` without an exception.

- [ ] **Step 2: Run the new test and confirm the navigation assertion fails**

Run: `cd apps/mobile && flutter test test/mobile_visual_parity_test.dart`

Expected: failure because Today has no navigation or placeholder message.

- [ ] **Step 3: Implement the visual Today composition**

Keep the existing `FutureBuilder` loading/error branches and `onStart` callback. Replace only the
successful layout with: `SafeArea`, 24px horizontal gutter, short indigo eyebrow, `امروز` heading,
card-count white summary card, small `assets/bobo/encourage-v2.png` wrapped in `ExcludeSemantics`,
and bottom `LearnerBottomNavigation`. Use a `SnackBar` exactly with:

```dart
const SnackBar(
  content: Text('این بخش به‌زودی در اپ موبایل آماده می‌شود.'),
)
```

Only render Bobo when `constraints.maxHeight >= 620`; no content or action may be hidden when it is
omitted. Pass `LearnerDestination.today` and show the notice for Words/Progress.

- [ ] **Step 4: Preserve and extend offline behavior tests**

Keep all existing `mobile_learning_loop_test.dart` assertions. Add a test that starts review from
the redesigned Today screen and still lands on `das Haus` before the Persian answer is revealed.

- [ ] **Step 5: Run focused tests and commit**

Run: `cd apps/mobile && flutter test test/mobile_learning_loop_test.dart test/mobile_visual_parity_test.dart`

Expected: all existing queue, error and large-text cases pass; new navigation behavior is truthful.

Commit:

```bash
git add apps/mobile/lib/features/review/today_screen.dart apps/mobile/test/mobile_learning_loop_test.dart apps/mobile/test/mobile_visual_parity_test.dart apps/mobile/test/support/mobile_test_app.dart
git commit -m "feat(mobile): restyle Today experience"
```

## Task 4: Build the review and completion presentation without changing grading

**Files:**

- Create: `apps/mobile/lib/features/review/completion_screen.dart`
- Modify: `apps/mobile/lib/features/review/review_screen.dart`
- Modify: `apps/mobile/test/mobile_learning_loop_test.dart`
- Modify: `apps/mobile/test/mobile_visual_parity_test.dart`

**Interfaces:**

- `CompletionScreen({required int? pendingCount, required String? storageError, required VoidCallback onReturnToToday})` receives result state only.
- `ReviewScreen` continues to call `reviewQueue.record(_card.id, grade, DateTime.now())` exactly once per accepted button press.

- [ ] **Step 1: Write failing review/completion visual tests**

Add a test that verifies the German phrase is in an LTR `Directionality`, the four labels exist and
completion displays canonical Bobo while remaining truthful about locally pending answers:

```dart
expect(Directionality.of(tester.element(find.text('das Haus'))), TextDirection.ltr);
expect(find.text('دوباره می‌خوانم'), findsOneWidget);
expect(find.text('۳ پاسخ در این دستگاه آماده است.'), findsOneWidget);
expect(find.bySemanticsLabel('بوبو موفقیت تو را جشن می‌گیرد'), findsOneWidget);
```

Use `Size(320, 480)` and `textScaleFactor: 2` to assert all grade buttons can be made visible and
their rectangles contain their labels.

- [ ] **Step 2: Run the test and confirm completion Bobo/return action is absent**

Run: `cd apps/mobile && flutter test test/mobile_visual_parity_test.dart`

Expected: failure because the existing completion state is inline and has no Bobo or return action.

- [ ] **Step 3: Extract `CompletionScreen` and add one return action**

Move only the completed branch into `CompletionScreen`. Render `assets/bobo/celebrate-v2.png` with
semantic label `بوبو موفقیت تو را جشن می‌گیرد`, the existing completion headline, current pending
count/error logic, and one 56px `بازگشت به امروز` button. Its callback uses `Navigator.of(context).popUntil((route) => route.isFirst)`; it must not clear the queue, invoke sync or claim upload.

- [ ] **Step 4: Restyle review content without changing data flow**

Keep existing state fields and `_grade` branches. Use the token theme for the progress bar, white
rounded media/reveal cards and grade buttons. Keep `card.german`, `card.definition` and
`card.exampleGerman` inside LTR `Directionality`; preserve Persian labels in inherited RTL. Keep
the existing one-column grade threshold at narrow width or enlarged text, and do not add a
pronunciation button.

- [ ] **Step 5: Run focused assertions and commit**

Run: `cd apps/mobile && flutter test test/mobile_learning_loop_test.dart test/mobile_visual_parity_test.dart`

Expected: the exact existing grade mappings, persistence, write-failure retry, large-text review
and completion behavior all pass alongside the visual assertions.

Commit:

```bash
git add apps/mobile/lib/features/review/completion_screen.dart apps/mobile/lib/features/review/review_screen.dart apps/mobile/test/mobile_learning_loop_test.dart apps/mobile/test/mobile_visual_parity_test.dart
git commit -m "feat(mobile): refine review and completion visuals"
```

## Task 5: Verify package, build and real-device presentation

**Files:**

- Modify: `docs/operations/STAGE_24_ANDROID_BASELINE.md`
- Modify: `CURRENT_WORK.md` only if a new unmerged PR records this implementation; otherwise leave it unchanged.

**Interfaces:**

- Consumes the finished app and current device/build commands.
- Produces only documented, truthful emulator and physical-device observations; no release record.

- [ ] **Step 1: Run all static and Flutter checks**

Run:

```bash
dart format --output=none --set-exit-if-changed apps/mobile/lib apps/mobile/test
cd apps/mobile && flutter analyze && flutter test && flutter build apk --debug
cd ../.. && node scripts/verify-mobile-visual-assets.mjs && pnpm check && pnpm build && node scripts/validate-migrations.mjs
```

Expected: every command exits with `0` and no source check is skipped.

- [ ] **Step 2: Run the emulator smoke**

Run: `cd apps/mobile && flutter run --debug --no-resident -d emulator-5554`

Expected: the app launches, shows the approved launch image, Today, the three-card review path,
completion, and readable 56px controls. Stop only the debug app after observation with
`adb -s emulator-5554 shell am force-stop com.learnbox.learnbox`.

- [ ] **Step 3: Run and document the representative physical-device smoke**

Install the generated debug APK only on Xiaomi M2006C3LG after its owner connection is available.
Observe the same flows at normal and enlarged system text. Record device model, Android version,
build command, page observations, limitations and date in `STAGE_24_ANDROID_BASELINE.md`. Never
write a passing physical result if the device is disconnected; state that it is a merge blocker.

- [ ] **Step 4: Open a reviewed PR, then merge only after current green checks**

Create a PR from a current branch, list all actual commands and device evidence, obtain review and
merge only after all GitHub Quality checks are green and the PR base is current. Do not activate a
flag, release an APK, change the icon or deploy.

## Plan self-review

- Spec coverage: Task 1 covers approved fonts/Bobo provenance; Task 2 covers tokens and accessible
  navigation; Task 3 covers Today plus truthful placeholders; Task 4 covers review/completion and
  offline invariants; Task 5 covers all required build/device evidence.
- Placeholder scan: no unresolved markers, undecided paths or hidden implementation rules remain.
- Type consistency: only `LearnerDestination`, `buildLearnBoxTheme`, `learnBoxGermanStyle`,
  `LearnerBottomNavigation` and `CompletionScreen` are introduced; every later task uses their
  declared signatures.
- Delegation boundary: Task 1 asset selection, Task 2 theme design, active review-card composition,
  Task 4 behavior review and Task 5 device QA are reviewer-owned. After the visual contract and
  `CompletionScreen` interface are approved, the bounded Task 4 completion extraction and its
  widget tests may be delegated through `.ai/WORK_QUEUE.md`; final review and merge remain
  reviewer-owned.
