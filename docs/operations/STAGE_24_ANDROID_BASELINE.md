# Stage 24 Android baseline

This is a local, non-release measurement of the current Flutter host on a representative
low-end Android phone. It does not authorize a beta cohort, production traffic, signing or
Cafe Bazaar publication.

## Evidence

- **Date:** 2026-08-13
- **Device:** Xiaomi M2006C3LG (Android 11)
- **ABI:** `armeabi-v7a`
- **Display:** 720 × 1600, density 320
- **Install:** debug APK installed successfully over ADB after the device owner allowed USB
  installation
- **Visual smoke:** approved Germany welcome image displayed during launch; Persian Today loaded;
  all three canonical Start cards revealed and graded; completion reported three pending responses
- **Cold start:** three `adb shell am start -W` runs after `am force-stop`: 7427ms, 6376ms,
  6241ms (median 6376ms)
- **Resident memory sample:** 224,919 KB total reported by `dumpsys meminfo` while the shell was
  running

## First offline review-flow measurement

- **Boundary:** debug APK with canonical Haus, Tisch and Tür cards, approved V2 images, active
  recall and secure device-local review queue
- **Offline completion:** three grades completed without any API or upload; completion displayed
  `۳ پاسخ در این دستگاه آماده است.`
- **Cold start:** three post-implementation `adb shell am start -W` runs after `am force-stop`:
  7574ms, 6812ms and 7536ms (median 7536ms)
- **Resident memory sample:** 263,061 KB total reported by `dumpsys meminfo` after the flow was
  installed and launched

## Today visual follow-up

- **Date:** 2026-08-16
- **Source:** `main` at `04d6205` (PR #70, mobile Today visual parity)
- **Device:** Xiaomi M2006C3LG (Android 11), installed with
  `flutter run --debug --no-resident -d 5PPBXCP7LBCMHQDE`
- **Observed:** the warm canvas, IRANSansX Persian typography, indigo eyebrow, card-count summary,
  canonical `encourage-v2` Bobo, 56px `شروع مرور` action and labelled three-item bottom navigation
  rendered on the physical device.
- **Cleanup:** the debug process was stopped with
  `adb -s 5PPBXCP7LBCMHQDE shell am force-stop com.learnbox.learnbox` after observation.
- **Limit:** this is a Today-only visual follow-up. It does not replace the final Task 5 full-loop
  verification after the reviewed completion presentation is merged; no release, provider,
  authentication, audio or production claim follows from it.

## Review-visuals follow-up

- **Date:** 2026-08-17
- **Source:** `feature/mobile-review-visuals` at `37f891e` (Draft PR #77)
- **Physical device:** Xiaomi M2006C3LG (Android 11, 720 × 1600), installed with
  `flutter run --debug --no-resident -d 5PPBXCP7LBCMHQDE`.
- **Physical observation:** Today, all three Start cards, revealed answers, the complete four-grade
  control set (after ordinary scrolling), completion Bobo and `بازگشت به امروز` rendered and
  worked. The completion surface accurately showed six locally pending answers because earlier
  debug review events were retained on the device; no upload or server acknowledgement was claimed.
- **Large-text observation:** device `font_scale` was temporarily changed from `0.81` to `1.3`, the
  app was cold-started and Today plus the active `das Haus` card remained readable without clipped
  essential controls. The device setting was restored to `0.81` immediately after the check.
- **Emulator observation:** Pixel 7 API 37 arm64 launched the same debug APK with
  `flutter run --debug --no-resident -d emulator-5554`; launch, Today and the active `das Haus`
  review surface rendered successfully. A previous emulator attempt under memory pressure produced
  a system-UI ANR and is not counted as evidence.
- **Boundary:** debug-only local evidence. No flag, provider, authentication, audio, production
  route, signing or release action was enabled.

## Native pronunciation QA follow-up

- **Date:** 2026-08-25
- **Source:** `main` at `fb8a45a` (documentation-only S2 follow-up; mobile source unchanged)
- **Device:** Xiaomi M2006C3LG (Android 11), `armeabi-v7a`, 720 × 1600, density 320
- **APK:** existing debug artifact from the clean `main` worktree, installed with `adb install -r`; SHA-256 `51bcd64c05e97916a584825d20a71e14f109f6ce4ece7b180050e99e500a8250`
- **Build note:** a fresh local build in the isolated QA worktree was blocked before compilation by the existing Flutter artifact repository HTTP 403; Flutter analyze and full tests passed, and the installed artifact was verified to contain all six V2 audio assets.
- **Physical smoke:** app launched, Today showed the Persian shell and three canonical cards, and review opened on `das Haus` with the word-pronunciation control available.
- **Cold start:** three `adb shell am start -W` runs after `am force-stop`: 10434ms, 10193ms, 10183ms (median 10193ms; device/process timing only).
- **Resident memory:** 253,418 KB total PSS from `dumpsys meminfo` after launch/review entry.
- **Owner-confirmed listening QA:** all six approved V2 clips passed on the connected device: `das Haus` word/sentence, `der Tisch` word/sentence and `die Tür` word/sentence.

This is debug-only physical-device evidence. It does not authorize network, sync, authentication, provider,
Preview, Production, signing or release activity.

## Interpretation

The native host and first offline review slice are installable and usable on this device. These
debug numbers are not release-performance targets and do not measure sync transport, audio,
authentication, provider calls or a production build. Repeat the protocol as those reviewed
boundaries are implemented.
