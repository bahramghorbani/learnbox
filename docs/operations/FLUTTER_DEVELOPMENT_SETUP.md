# Flutter development setup

LearnBox keeps the Flutter client in `apps/mobile`. The mobile directory is an independent Flutter
application inside the monorepo; do not migrate the web learner or marketing site into it.

## Required tools

- Flutter stable for Apple Silicon or the matching architecture of the development machine.
- Dart supplied by the selected Flutter SDK; do not install a second Dart SDK.
- Xcode and iOS Simulator for iOS work on macOS.
- Android Studio with the Android SDK, Platform Tools, command-line tools and an ARM64 emulator
  for Android work on Apple Silicon.
- VS Code with the official `Dart-Code.dart-code` and `Dart-Code.flutter` extensions.

The repository does not commit SDK paths, emulator data, credentials or generated IDE state.

## Verify the toolchain

Run these commands from the repository root:

```bash
flutter --version
dart --version
which flutter
which dart
flutter doctor -v
```

Then validate the client:

```bash
cd apps/mobile
flutter pub get
flutter analyze
flutter test
flutter devices
```

For a build or device check, use an explicitly selected target from `flutter devices`; do not use
production services or real user data during local validation.

## VS Code

Open the repository root. The committed `.vscode` tasks and launch configuration use workspace
relative paths and let the Dart/Flutter extensions discover the SDK. Available tasks cover package
resolution, analysis and tests; launch targets cover the current Flutter app on a selected device.

If Flutter is not yet available, VS Code still opens the repository and the extensions remain
installed, but Flutter analysis and debugging cannot start until the SDK download is complete.

## Repository boundary

Flutter checks are required when `apps/mobile` or shared mobile contracts change. A passing web or
TypeScript check does not prove Android or iOS readiness. Record device, simulator and build
evidence separately, and keep release, signing, store, provider and production actions owner-gated.
