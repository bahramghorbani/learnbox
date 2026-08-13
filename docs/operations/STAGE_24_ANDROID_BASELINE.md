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

## Interpretation

The native host and first offline review slice are installable and usable on this device. These
debug numbers are not release-performance targets and do not measure sync transport, audio,
authentication, provider calls or a production build. Repeat the protocol as those reviewed
boundaries are implemented.
