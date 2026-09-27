# Owner Passkey and Splash Replacement Design

## Decision summary

LearnBox will have one permanent administrator identity: the owner. The owner signs in to the
admin web application with passkeys through WebAuthn. The admin can replace the application splash
image, but cannot schedule it. The last successfully uploaded image remains current until a newer
upload is fully validated and atomically promoted.

Installable and native application icons are outside this system. An icon changes only with a new
application release.

This design prepares code, persistence, tests and disabled-by-default deployment boundaries. It
does not enroll a real passkey, upload to production, expose the admin application, change DNS, or
activate learner delivery.

## Selected approach

Use a database-backed current-version pointer plus immutable private media objects:

1. Upload a candidate to a unique private object path.
2. Decode, validate, normalize and checksum it on the server.
3. In one database transaction, create the new version, point the singleton splash setting to it,
   and append an audit event.
4. After the transaction succeeds, remove the superseded private object.
5. If removal fails, keep the new version current and queue only the orphaned object for cleanup;
   never roll the application pointer back to a missing object.

This avoids partially overwritten files and cache ambiguity. A fixed object overwritten in place
was rejected because clients and CDNs can observe mixed versions. A scheduling system was rejected
because the owner explicitly wants only direct replacement. Keeping every historical image was
rejected because the owner wants the previous splash removed; only non-sensitive audit metadata is
retained.

## Scope

### Included

- one owner identity and multiple passkeys belonging to that identity;
- controlled first-passkey bootstrap;
- passkey sign-in, reauthentication, session revocation and logout;
- authenticated splash upload, validation, preview and direct replacement;
- same-origin current-splash metadata and media delivery for learner clients;
- device caching and a bundled fallback splash;
- audit records without credentials, source images, personal data or free-text secrets;
- rollback by uploading a new approved image, not by retaining the deleted prior object.

### Excluded

- multiple administrators, invitations, roles editable from the UI or delegated access;
- passwords, SMS login, email login or an external identity provider for admin access;
- seasonal scheduling, start/end dates or automatic rotation;
- dynamic installed-app icons;
- public deployment, real enrollment and production provider activation;
- arbitrary deletion of the current or bundled fallback splash.

## Owner authentication

The implementation uses WebAuthn through `@simplewebauthn/server` and
`@simplewebauthn/browser` version 13-compatible APIs. User verification is required for
registration, sign-in and sensitive reauthentication.

### Singleton owner

The database has one stable owner record with a random WebAuthn user handle. There is no public
username lookup, registration or administrator creation endpoint. Multiple credentials may attach
to the same owner so the owner can use synced passkeys or enroll another trusted device without
creating another administrator.

### First-passkey bootstrap

Registration is available only when no active owner credential exists and an exact server-side
bootstrap flag is enabled. The owner enters a high-entropy one-time bootstrap secret into a form;
the value is never placed in a URL, log, client storage or source control. The endpoint is
rate-limited and returns generic failures. After the first credential is stored, bootstrap returns
`404` regardless of whether the deployment secret still exists.

Additional passkeys require an authenticated owner session and fresh passkey reauthentication.

### Challenges and sessions

- Registration and authentication challenges are random, single-use, server-persisted and expire
  after five minutes.
- A challenge is bound to its ceremony type and browser session nonce.
- Successful authentication updates the credential counter according to WebAuthn verification and
  consumes the challenge atomically.
- Admin session tokens are random and stored only as keyed hashes in PostgreSQL.
- Cookies are `HttpOnly`, `Secure`, `SameSite=Strict`, scoped to the admin origin and rotated after
  authentication.
- Sessions expire after 15 minutes of inactivity and eight hours absolutely.
- Sensitive replacement and credential-management actions require authentication within the
  previous five minutes.
- Logout revokes the current session. A server-only owner operation can revoke all sessions.
- Mutating routes enforce exact trusted `Origin`, CSRF protection and content-type/size limits.

## Splash media contract

### Accepted input

- preferred source: `1080×1920` pixels;
- minimum: `864×1600` pixels;
- vertical width/height ratio between `0.42` and `0.55`;
- PNG, JPEG or WebP input;
- maximum upload size: 8 MiB;
- server decoding must succeed; file extensions and browser-provided MIME types are not trusted.

The server strips metadata and normalizes the accepted image to an immutable WebP object. It
records the normalized width, height, byte size, SHA-256 checksum and opaque object key. SVG, GIF,
animated media and image paths supplied by a client are rejected.

### Replacement transaction

The authenticated route accepts one file and an idempotency key. It validates and uploads the
candidate before opening the database transaction. The transaction locks the singleton splash
setting, inserts the immutable version, changes the current pointer and records an audit event.
Repeated requests with the same idempotency key return the original outcome.

The response contains only the new opaque version ID and safe preview state. It never returns a
private Blob URL, storage token, passkey material, session token or database identifier that
reveals another entity.

### Superseded object deletion

Only the object that was current immediately before the successful transaction may be deleted.
The bundled fallback is not an object-store candidate and can never be deleted. If object deletion
fails, its opaque key enters a cleanup table with bounded retry metadata. Audit metadata keeps
checksums, version IDs, timestamps and outcomes, but not the deleted image bytes or its public URL.
Deletion here means removal from LearnBox server storage. An offline device may retain its previous
local cache until it successfully receives and verifies the replacement, then it overwrites that
cache.

## Learner delivery and startup behavior

Learner clients call a same-origin current-splash metadata endpoint. The endpoint exposes an
opaque revision, checksum, dimensions and a same-origin media route. The media route reads only the
object selected by the server-side current pointer and returns explicit cache validators.

At startup the client:

1. immediately displays the last fully cached splash;
2. displays the immutable bundled splash if no valid cached version exists;
3. requests lightweight current metadata in the background;
4. downloads a changed version through the same-origin route;
5. verifies the expected revision/checksum contract before making it the cached current version;
6. uses the new image in the current launch only if it becomes ready during the splash window,
   otherwise from the next launch.

Network, metadata, decoding or checksum failure never leaves a blank screen and never deletes the
last valid client cache. The splash remains decorative and cannot block navigation after the
maximum splash duration.

## Admin interface

The current local admin prototype remains visibly non-production until passkey boundaries are
connected. The new owner-only area contains:

- passkey sign-in and explicit unsupported-browser guidance;
- current splash preview with revision and update time;
- one upload control with required size/format guidance;
- local preview before replacement;
- one clearly worded replacement confirmation;
- progress, validation, success and generic failure states;
- logout, current-session revocation and add-another-passkey controls.

There is no schedule calendar, history gallery, delete-current button, administrator list or icon
control.

## Persistence and audit

Add checksum-attested migrations for:

- singleton owner identity;
- WebAuthn credentials;
- one-time WebAuthn challenges;
- hashed admin sessions;
- immutable splash versions and singleton current pointer;
- idempotent splash replacement actions;
- orphaned-object cleanup attempts.

Existing `audit_logs` remains the append-only audit authority. Events include passkey enrollment,
sign-in success/failure category, logout, session revocation, upload rejection, splash replacement
and superseded-object cleanup outcome. Metadata uses opaque IDs and safe reason codes only. It must
not contain bootstrap secrets, challenges, credential public keys, cookies, raw IP addresses,
uploaded filenames or storage URLs.

## Failure behavior

- No credential or disabled bootstrap: registration route returns `404`.
- Invalid or expired challenge: generic authentication failure and no session.
- Unknown credential: generic authentication failure without owner enumeration.
- Invalid image: no Blob upload, database row or pointer change.
- Candidate upload succeeds but transaction fails: delete the unreferenced candidate; if deletion
  fails, queue it for cleanup.
- Pointer changes but old-object deletion fails: new splash remains current and cleanup retries are
  bounded.
- Database or storage unavailable: keep the old splash and report a generic admin error.
- Learner delivery unavailable: use the last valid cache or bundled fallback and continue startup.

## Verification

Tests must prove:

- exact bootstrap gating and permanent closure after first credential;
- registration/authentication challenge expiry, one-time use, user verification and origin/RP ID
  checks;
- session hashing, rotation, idle/absolute expiry, revocation, strict cookie and CSRF boundaries;
- a second credential belongs to the same owner rather than creating another admin;
- role or client claims cannot create an administrator or bypass recent reauthentication;
- real decoded image dimensions/type/animation/size validation;
- idempotent atomic replacement and concurrency locking;
- no current-pointer change on upload, database or validation failure;
- correct old-object deletion and orphan cleanup behavior;
- no private storage URL or credential/session material in responses, logs or browser storage;
- cached splash, changed revision, offline fallback, corrupt download and maximum-duration startup;
- admin RTL, keyboard, focus, status messaging and reduced-motion behavior;
- full repository checks, production builds, migration validation, dependency audit and an
  independent security review before merge.

## Activation boundary

All bootstrap, admin passkey and splash mutation endpoints are disabled by default. Real passkey
enrollment requires the owner to set a server-only bootstrap secret and complete Face ID/Touch ID
on the final HTTPS admin origin. DNS, TLS, server secrets, public routing and activation remain
separate owner-approved actions. No implementation commit from this design authorizes them.

## References

- W3C Web Authentication Level 3: <https://www.w3.org/TR/webauthn-3/>
- Apple Passkeys overview: <https://developer.apple.com/passkeys/>
- SimpleWebAuthn v13 documentation: <https://simplewebauthn.dev/docs/>
