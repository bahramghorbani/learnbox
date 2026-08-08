# Authenticated Start Media Client Design

## Goal

Connect the learner card UI to the existing same-origin private-media route after a valid server OTP session, while keeping every release and provider boundary disabled by default.

## Current boundary

- Start media objects are private in Vercel Blob and are addressable only through `/api/private-media/[contentId]/[kind]`.
- The route already requires an exact server flag, a signed short-lived learner session and an attested card/media pair.
- OTP verification already issues the signed HttpOnly session, but the learner card UI still selects only localhost preview assets or placeholders.

## Design

### One explicit client mode

Add a pure resolver with three results:

- `placeholder`: the safe default for every deployed environment;
- `local-preview`: localhost-only access to the existing development media route;
- `private-session`: same-origin private-media paths, selected only when the learner uses `server-otp` and `NEXT_PUBLIC_LEARNBOX_PRIVATE_MEDIA_ENABLED` is exactly `true`.

The resolver must prefer `private-session` over localhost preview so the complete authenticated path can be tested deliberately. Any other public-flag spelling or value remains disabled.

### Same-origin sources only

A pure source builder accepts a validated Start content ID and produces only these relative paths:

- `/api/private-media/<contentId>/image`
- `/api/private-media/<contentId>/word-audio`
- `/api/private-media/<contentId>/sentence-audio`

Local preview uses the equivalent `/api/local-preview-media/...` paths. No Blob URL, token, phone number, challenge ID or session value enters component state, browser storage, logs or source manifests.

### UI behavior

The card UI receives resolved sources instead of deciding between booleans inline. In placeholder mode it keeps the existing honest pending copy and browser pronunciation fallback. In local-preview mode it keeps the existing QA notice. In private-session mode it renders the attested image and audio through the same-origin routes and labels them as protected alpha media.

Image or audio failure must not authenticate, retry another provider, reveal an upstream error or block grading. The image falls back to the current neutral placeholder; audio uses the existing unavailable state.

### Independent server gate

The public client flag never enables delivery by itself. `LEARNBOX_PRIVATE_MEDIA_ATTACHMENT_ENABLED` remains independently `false` by default and the route continues to return `404` until an approved environment enables it. Learner OTP UI, SMS.ir delivery, invitations and private-media delivery remain separate activation decisions.

## Verification

- Pure tests cover exact flag selection, local-preview selection, placeholder fallback and same-origin path construction.
- Rendered learner tests prove private sources appear only in `server-otp` mode with the exact public flag and that image failure returns to the placeholder.
- The private-media boundary validator requires both defaults to remain false and rejects direct Blob URLs in learner source.
- Run focused website tests, type checking, private-media validation, full `pnpm check`, website build, migration validation and production dependency audit.

## Rollback

Set `NEXT_PUBLIC_LEARNBOX_PRIVATE_MEDIA_ENABLED=false` or revert the client attachment commit. The existing server flag remains a second immediate stop and no stored learner data requires migration.

## Out of scope

- Enabling either client or server media flags;
- activating learner OTP or SMS.ir delivery;
- invitations, participant allowlists or consent acceptance persistence;
- changing private Blob objects, canonical Bobo assets or Start content;
- deployment or public release.
