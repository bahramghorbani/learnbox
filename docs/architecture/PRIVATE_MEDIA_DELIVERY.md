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
outside development and requires an explicit local flag. It is not connected to the phone/code UI.

A real SMS or identity provider must issue the same signed server session only after the provider
has verified the learner. Connecting that provider remains a separate owner-account and terms
acceptance action. Until then, the card UI continues to use the existing local-only candidate
preview and the private-media feature flag stays disabled.

## Rollback

Set `LEARNBOX_PRIVATE_MEDIA_ATTACHMENT_ENABLED=false`. The route immediately returns `404` and no
private Blob object is exposed to the app.
