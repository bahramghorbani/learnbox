# LearnBox mobile

The native Android and iOS hosts for LearnBox live here. The learner product remains in
`apps/website`; this client is intentionally a small Flutter shell until the approved mobile
contract is implemented.

## Local checks

```bash
flutter pub get
flutter analyze
flutter test
flutter build apk --debug
```

The debug build is an internal developer artifact only. It does not configure release signing,
Cafe Bazaar publication, production services, payment or owner-controlled feature flags.

## Native hosts

- Android application ID: `com.learnbox.learnbox`
- iOS bundle ID: `com.learnbox.learnbox`
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
