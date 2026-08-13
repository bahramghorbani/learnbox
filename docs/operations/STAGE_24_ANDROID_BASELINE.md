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
- **Visual smoke:** approved Germany welcome image displayed during launch; the Persian Today
  shell displayed after the launch experience
- **Cold start:** three `adb shell am start -W` runs after `am force-stop`: 7427ms, 6376ms,
  6241ms (median 6376ms)
- **Resident memory sample:** 224,919 KB total reported by `dumpsys meminfo` while the shell was
  running

## Interpretation

The native host is installable and visually starts on this device. These numbers are a baseline
for the intentionally minimal shell only; they are not product-performance targets and do not
measure offline sync, card interaction, media playback, authentication, provider calls or a
production build. Repeat the same protocol after the approved mobile contract and learner flows
are implemented.
