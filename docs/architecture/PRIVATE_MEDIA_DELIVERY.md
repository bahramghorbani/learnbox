# Private media delivery boundary

The Start A1 media objects remain private in Vercel Blob. Their Blob URLs are not stored in Git,
rendered into cards, or sent to a browser client.

## Delivery conditions

`/api/private-media/[contentId]/[kind]` returns a media stream only when all conditions hold:

1. `LEARNBOX_PRIVATE_MEDIA_ATTACHMENT_ENABLED=true` is explicitly configured.
2. The request has a valid, signed, short-lived learner session cookie.
3. The requested card and media kind appear in the checksum-attested Start manifest.
4. Vercel Blob can read the private object through project-scoped OIDC.

Otherwise the route returns either `404` (feature disabled or unknown media) or `401` (no valid
session). Successful responses are `private, no-store`, same-origin and `nosniff`.

## Session issuer boundary

The development-only session route exists solely for local route verification. It is unavailable
outside development and requires an explicit local flag.

The fail-closed OTP verification coordinator can issue the same signed server session only after a
valid code is verified. Its learner UI is still gated by
`NEXT_PUBLIC_LEARNBOX_OTP_UI_ENABLED=false`, and SMS.ir delivery remains independently gated by
`SMS_IR_ENABLED=false`.

The Start card client now has an authenticated same-origin media seam. It selects private routes
only when the learner auth mode is `server-otp` and
`NEXT_PUBLIC_LEARNBOX_PRIVATE_MEDIA_ENABLED=true`; otherwise production displays the neutral
placeholder, while localhost retains its explicit QA preview. The public selection flag and the
server delivery flag are deliberately independent and both remain `false` by default. Media errors
fall back to generic unavailable copy and never block grading.

## Rollback

Set either `NEXT_PUBLIC_LEARNBOX_PRIVATE_MEDIA_ENABLED=false` to stop client selection or
`LEARNBOX_PRIVATE_MEDIA_ATTACHMENT_ENABLED=false` to stop server delivery. With the server flag
off, the route immediately returns `404` and no private Blob object is exposed to the app.
