# LearnBox mobile

The native Android and iOS hosts for LearnBox live here. The learner product remains in
`apps/website`; this client now implements the first approved offline mobile learning-loop slice:
the bundled three-card Start session and a device-local review-event queue.

## Implemented mobile boundary

- The approved Germany welcome image remains visible in Flutter for three seconds before Today.
- Today loads exactly the validated bundled Start cards and has one primary `شروع مرور` action.
- Each card uses active recall: the Persian answer and example stay hidden until `نمایش پاسخ`.
- The four Persian grade labels persist `forgot`, `hard`, `remembered` and `mastered` events to the
  secure local queue. The UI cannot advance until that write succeeds, disables every grade while
  the write is pending and keeps the revealed card available with a calm retry message on failure.
- Each schema-version-1 event uses the shared-engine name `clientEventId`. Android storage uses the
  isolated `learnbox.reviewQueue.v1` namespace with deletion-on-error disabled and backup-protected
  cipher migration; storage failures therefore reach the retry UI instead of clearing the queue.
- Production creates one process-long `ReviewQueue` in `main.dart` and injects that same instance
  through Today and the complete three-card flow. Widget builds never create another queue.
- Completion reports the current number of responses waiting on the device. This boundary does not
  upload or acknowledge them.
- The approved foreground-sync coordinator is present behind typed identity and transport ports. In
  the current production composition identity is always `signedOut` and its transport throws before
  any delivery; there is no sync UI action, HTTP client, credential, timer, connectivity listener or
  background worker. A future separately reviewed authenticated adapter may invoke it only after a
  real learner identity and server protocol exist.

The flow is Persian RTL-first, isolates German text as LTR and uses at least 52–56 logical-pixel
primary and grading controls. Today, review controls and completion scroll or reflow on short and
landscape viewports; large-text coverage verifies that all Persian grade labels remain inside their
controls. Widget coverage also includes persistence-before-advance, all four exact mappings, the
three-card completion count and secure-storage retry behavior.

## Local checks

```bash
flutter pub get
flutter analyze
flutter test
flutter build apk --debug
```

The debug build is an internal developer artifact only. It does not configure release signing,
Cafe Bazaar publication, authentication, API/upload/sync, providers, analytics, production
services, payment or owner-controlled feature flags.

## Native hosts

- Android application ID: `com.learnbox.learnbox`
- iOS bundle ID: `com.learnbox.learnbox`
- Android keeps `allowBackup=false` and Android 12+ extraction rules explicitly exclude the secure
  queue's data, wrapped-key and configuration preferences from cloud backup and device transfer.
- iOS Runner Debug, Profile and Release configurations link the Keychain Sharing entitlements
  required by the pinned secure-storage plugin. This is source/build configuration, not a physical
  iOS verification claim.
- Required local setup: [`docs/operations/FLUTTER_DEVELOPMENT_SETUP.md`](../../docs/operations/FLUTTER_DEVELOPMENT_SETUP.md)

The Android Gradle Wrapper is versioned so a clean clone can run the same debug-build check as CI.

## Native launch branding

- The bundled app icon is derived from the approved LearnBox icon asset in
  `apps/website/public/icons/learnbox-v1-1024.png`.
- The bundled native launch image is derived from the approved Germany welcome asset in
  `apps/website/public/images/launch/germany-welcome-v1.jpg`.
- These are release-packaged fallbacks for Android and iOS. The owner-controlled splash
  replacement boundary remains a separately gated learner-web capability; it does not change an
  installed app icon or native operating-system launch screen without a new application release.
