# Launch experience and app icon

## Current approved assets

- Launch screen: `germany-welcome-v1`, a short in-app launch screen using the supplied vertical Germany/Bobo scene, optimized as a 864×1821 JPEG for fast public caching.
- Installable web icon: `learnbox-v1`, supplied as a non-transparent square source and derived into 192 px and 512 px PWA assets.

Versioned launch and icon files are served with long-lived immutable browser caching. A future visual change therefore receives a new versioned file path and selection ID, rather than overwriting an already cached asset.

The launch screen appears only while the web app initializes, then fades into the current screen. It is an in-app experience, not a claim that an operating system's native pre-code launch screen can be remotely changed.

## Future admin publishing boundary

An authenticated admin publisher will create a **draft** launch experience with an opaque ID, image upload receipt, image checksum, crop focal point, timezone-aware start/end time and fallback state. A separate authorized publisher can approve and schedule it. The client can receive only the currently approved public selection; direct browser upload, direct private Blob URL use and automatic publishing are forbidden.

When an experience ends, expires or fails validation, the previous approved fallback remains active. Changes must be auditable and rollbackable by selection ID, without deleting the underlying asset.

The shared selection core deterministically considers only valid records: it selects a live
scheduled candidate first, then an active one, and otherwise returns the approved fallback. Draft,
rejected, future-dated, expired or invalid records cannot become visible through this resolver.

## Icon boundary

The web/PWA install icon is declared in the manifest. A later icon upload may be staged and reviewed in the admin panel, but changing the icon already displayed on a person's home screen is not an instant remote operation. Native mobile launcher icons are packaged for each release; iOS alternate icons must also be included in the app bundle. The admin panel will therefore manage icon candidates and release selection, not promise an immediate change to an installed app's icon.
