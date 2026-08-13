# Mobile offline pronunciation

## Purpose and boundary

The native Flutter Start session plays the approved, bundled A1 pronunciation media for its three
canonical cards. It is a local learning aid: no text-to-speech service, HTTP client, provider,
credential, analytics event, background playback or download path is introduced.

## Learner behavior

- The word play control is available while the answer remains hidden.
- The example-sentence play control appears only after `نمایش پاسخ`.
- A playback error keeps the card and grading controls usable and shows the calm Persian fallback
  `پخش صدا فعلاً ممکن نشد.`

## Asset and platform contract

- `content/packs/learnbox-start/audio/` is the canonical source.
- `apps/mobile/assets/audio/` contains only the six byte-for-byte verified A1 files named by the
  bundled three-card JSON. The verifier rejects a missing or changed packaged MP3.
- Dart, Android and iOS accept only that fixed allowlist. Android reads the packaged
  `flutter_assets/assets/` entry with `MediaPlayer`; iOS reads the same bundled entry with
  `AVAudioPlayer`.
- The native player replaces an incompatible third-party audio package so the repository's current
  Android Gradle host remains reproducibly buildable.

## Acceptance and rollback

- Required checks: Node source/byte verifier, Flutter analysis and tests, Android debug APK and
  iOS debug no-codesign build.
- A physical-device listening check is still required before this is treated as learner-facing
  beta evidence. It does not enable a flag, service or release.
- Roll back by reverting this feature branch. The existing offline review flow has no dependency on
  playback success and remains usable without the player.
