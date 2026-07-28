# OTP provider activation

## Current state

The owner selected SMS.ir for the future Iranian OTP delivery adapter. It is not connected: no API key, template ID, deployment secret, route, real delivery, or learner session has been enabled. The phone entry screen is therefore still a local closed-alpha prototype; it does not prove an identity, issue a production session, or enable private media for a learner.

The default provider is intentionally disabled. It fails closed and cannot deliver a code by accident.

## Required owner action before activation

Before activation, the owner must provide the approved SMS.ir verification-template ID and place its private API key only in the deployment secret store. SMS.ir's verification endpoint delivers a parameterized template but does not verify a code for LearnBox, so LearnBox must keep the opaque challenge, hashed code, expiry, resend cooldown, attempts, and final identity binding on its own server. These actions are external, potentially paid, and must not be automated by Codex.

The required SMS.ir adapter is server-only and will use its `POST /v1/send/verify` endpoint with the `X-API-KEY` header, the owner-approved template ID, and a single code parameter. The browser must never receive those values.

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

1. Add the audited SMS.ir delivery adapter and server-only environment variables; do not add a browser SDK.
2. Add request-code and verify-code routes with CSRF-aware session handling, rate limits, structured security events without personal data, and generic errors.
3. Replace the local phone prototype only after the routes are tested against the provider sandbox or approved test account.
4. Run abuse, expiry, resend, incorrect-code, outage, logout, and real-device tests.
5. Obtain owner approval before enabling production OTP or attaching private media to learner cards.

`OTP_DEVELOPMENT_MODE` remains false by default. Any development-only test path must reject every non-development environment and must never be used as a production identity issuer.

## SMS.ir handoff checklist

When the implementation reaches activation, ask the owner only for these account actions:

1. Create or approve the LearnBox verification template in SMS.ir and note its numeric template ID plus the exact code-placeholder name.
2. Create a restricted private API key in SMS.ir and place it directly in the deployment secret store; never paste it into chat, source control, or a browser field.
3. Confirm the service/template is approved for verification delivery and allow one owner-controlled test number.

Codex will then complete the server adapter, challenge store, rate limits, routes, automated tests, and an owner-visible test run before any production release.
