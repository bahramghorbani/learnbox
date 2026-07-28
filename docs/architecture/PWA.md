# PWA boundary

LearnBox exposes an installable web manifest and a deliberately small service worker. It caches the public offline fallback page plus the approved launch image and installable icon; it does not cache authenticated API responses, phone numbers, personal cards, access tokens, or payment state. Learner review events remain in the existing device queue and are synced only through the authenticated API when that boundary is available.

The web app works without installation. Installation and notification permission are separate, optional actions. Native iOS icon variants, background sync policy and provider-backed push remain future platform validation work. See [launch experience](LAUNCH_EXPERIENCE.md) for the scheduled-admin boundary and the distinction between a dynamic in-app launch screen and a release-packaged home-screen icon.

The phone-entry screen links to `/install`, a Persian first-party guide for Safari on iPhone/iPad and Chrome on Android. It does not request a device permission or claim an installation occurred; the operating system remains in control of that action.
