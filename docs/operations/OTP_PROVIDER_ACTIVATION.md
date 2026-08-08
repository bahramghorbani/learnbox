# OTP provider activation

## Current state

The owner selected SMS.ir for the future Iranian OTP delivery adapter, and SMS.ir approved template
`495140` with code-placeholder `OTP`. The restricted API key, alpha database and internal OTP/session
secrets are installed in Vercel Preview. Tested same-origin request and verification routes are
deployed behind Vercel authentication, but delivery remains disabled; no real message or learner
session has been enabled. A separate same-server app stack is prepared for the final deployment
target, but it has not received server secrets or public routing. The
phone entry screen is therefore still a local
closed-alpha prototype; it does not prove an identity, issue a production session, or enable
private media for a learner.

The default provider is intentionally disabled. It fails closed and cannot deliver a code by accident.

## Controlled owner Preview test

The hidden route `/owner/otp-test` is the only UI authorized for the first real delivery check. It
returns 404 unless `LEARNBOX_OTP_TEST_UI_ENABLED=true`, is excluded from indexing, and must remain
behind Vercel Authentication. The owner enters the test number and code in that page; neither value
is placed in chat, URLs, browser storage or application logs.

For the controlled test only, set both `LEARNBOX_OTP_TEST_UI_ENABLED=true` and
`SMS_IR_ENABLED=true` in the **Preview** environment and redeploy. Production and the internal
same-server stack remain false. Rollback is immediate: set both Preview flags back to `false` and
redeploy; the route then returns 404 and the provider fails closed.

## Required owner action before activation

Before activation, the owner must place the private API key only in the deployment secret store.
SMS.ir's verification endpoint delivers a parameterized template but does not verify a code for
LearnBox, so LearnBox must keep the opaque challenge, hashed code, expiry, resend cooldown,
attempts, and final identity binding on its own server. The owner explicitly approved one
controlled real-message test on 2026-08-08. Codex may prepare and activate the protected Preview
flags, while the owner remains the only person who enters the phone number and received code.

The prepared SMS.ir delivery client is server-only and uses its `POST /v1/send/verify` endpoint
with the `X-API-KEY` header, the owner-approved template ID, and a single code parameter. It is
tested with mocked delivery and generic outage handling; it does not issue sessions or expose a
browser SDK. The browser must never receive those values. LearnBox's tested OTP core, database
migrations and atomic PostgreSQL store already cover opaque challenge lifecycle, five-minute
expiry, one-minute resend cooldown, five attempts, keyed hashes, one-time consumption and
persistence-backed 15-minute request-rate limits (three requests per phone hash and ten per IP
hash); routes and activation remain inactive.

The provider-neutral request and verification coordinators are also implemented and tested. The
request coordinator generates the code in LearnBox, stores only keyed hashes after the persisted
phone/IP limit permits the request, and calls the delivery client only after that transaction
succeeds. A provider outage leaves the request counted for abuse protection, but never exposes the
code or phone through logs or persistence. The verification coordinator returns one generic
rejection for unknown, incorrect, locked, expired and already-used challenges, and exposes the
opaque phone hash only after the atomic store consumes a valid challenge.

## Adapter contract

The chosen adapter implements `apps/website/lib/otp-provider.ts` and must:

- accept only a server-normalized Iranian E.164 phone number;
- create an opaque challenge ID, never a phone-derived ID;
- enforce provider-side and application-side IP/phone/challenge rate limits, resend cooldown, expiry, and attempt limits;
- return a stable opaque `providerSubject` only after successful verification;
- avoid logging a phone number, code, provider response, or credential in plaintext;
- return a generic failure for invalid or expired codes to avoid account enumeration;
- support an outage-safe disabled state and a documented provider-switch procedure.

Only a verified identity may call `createLearnerSession`. The application must map a stable provider subject to its internal learner record before issuing that signed cookie. A browser must never receive an SMS credential, provider secret, or direct private Blob URL.

## Required implementation sequence

1. Configure the prepared SMS.ir delivery client with the approved template and server-only deployment secrets; do not add a browser SDK. **Complete for Preview.**
2. Connect the tested request and verification coordinators through CSRF-aware routes with generic errors. **Complete and protected in Preview; delivery remains disabled.**
3. Replace the local phone prototype only after the routes are tested against the approved owner-controlled test number.
4. Run abuse, expiry, resend, incorrect-code, outage, logout, and real-device tests.
5. Obtain owner approval before enabling production OTP or attaching private media to learner cards.

`OTP_DEVELOPMENT_MODE` remains false by default. Any development-only test path must reject every non-development environment and must never be used as a production identity issuer.

## SMS.ir handoff checklist

When the implementation reaches activation, ask the owner only for these account actions:

1. Create a restricted private API key in SMS.ir and place it directly in the deployment secret store; never paste it into chat, source control, or a browser field.
2. Confirm the service/template is approved for verification delivery and allow one owner-controlled test number.

Codex will then complete the server adapter, challenge store, rate limits, routes, automated tests, and an owner-visible test run before any production release.
