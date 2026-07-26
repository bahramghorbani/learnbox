# PWA boundary

LearnBox exposes an installable web manifest and a deliberately small service worker. It caches only the public offline fallback page; it does not cache authenticated API responses, phone numbers, personal cards, access tokens, or payment state. Learner review events remain in the existing device queue and are synced only through the authenticated API when that boundary is available.

The web app works without installation. Installation and notification permission are separate, optional actions. Native iOS icon variants, background sync policy and provider-backed push remain future platform validation work.
