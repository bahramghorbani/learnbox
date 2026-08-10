# Owner splash replacement activation

## Current state

LearnBox has a complete single-owner boundary for replacing the one current app splash. Uploads
are decoded and normalized to private WebP objects; PostgreSQL promotes one immutable version
atomically and deletion failures enter a bounded cleanup queue. The bundled app fallback is never
deleted. The capability, owner passkeys and admin UI remain disabled by default. No deployment,
flag activation or production splash upload is part of this implementation.

This boundary intentionally has no publishing schedule, image gallery, delete-current action or
app-icon control. The latest successful splash remains current until the next successful
replacement. App icons continue to ship only with a new application release.

## Owner-approved activation procedure

1. Complete the single-owner passkey activation in
   [`ADMIN_PASSKEY_ACTIVATION.md`](./ADMIN_PASSKEY_ACTIVATION.md), on the exact HTTPS admin origin.
2. Apply all append-only PostgreSQL migrations through `0011_owner_splash_replacement.sql` and run
   `node scripts/validate-migrations.mjs` against the repository migration set.
3. Connect the existing private Vercel Blob store to the admin and learner deployments so
   `BLOB_READ_WRITE_TOKEN` exists only in their protected secret stores. Never paste or commit the
   token; keep the public marketing deployment isolated from it.
4. Run `pnpm verify:owner-splash-boundary`, `pnpm check` and `pnpm build`.
5. Set `LEARNBOX_ADMIN_SPLASH_REPLACEMENT_ENABLED=true` only in the protected admin deployment.
   Set `LEARNBOX_DYNAMIC_SPLASH_ENABLED=true` only in the learner-app deployment, then redeploy
   both applications.
6. After signing in as the sole owner, upload one PNG, JPEG or WebP no larger than 8 MiB, at least
   864 × 1600 pixels and with a width/height ratio from 0.42 to 0.55. Confirm the preview, complete
   recent Passkey verification when asked, and verify the new splash in the learner application.

## Verification and rollback

- The admin metadata response must expose only revision, dimensions, byte size, update time and a
  same-origin preview path. It must never expose an object key or Blob URL.
- The learner app requests `/api/launch/splash`; that same-origin route reveals only image bytes
  and falls back to the bundled launch artwork whenever the flag, database or private object is
  unavailable.
- A failed upload or database transaction must leave the prior current splash usable.
- To stop further replacements, set `LEARNBOX_ADMIN_SPLASH_REPLACEMENT_ENABLED=false`. To stop
  dynamic learner delivery, set `LEARNBOX_DYNAMIC_SPLASH_ENABLED=false`. Redeploying returns those
  routes to `404` while the current splash pointer and bundled fallback remain intact.
- Storage cleanup jobs stop after five failed attempts and require an operator review; do not
  delete unknown Blob objects manually.
