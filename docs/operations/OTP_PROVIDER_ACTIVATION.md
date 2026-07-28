# OTP provider activation

## Current state

LearnBox has a provider-neutral server contract, but no SMS or identity provider is selected or connected. The phone entry screen is therefore a local closed-alpha prototype; it does not prove an identity, issue a production session, or enable private media for a learner.

The default provider is intentionally disabled. It fails closed and cannot deliver a code by accident.

## Required owner action before activation

The owner must choose an Iranian-capable provider, create and verify its account, accept its terms, supply credentials through the deployment secret store, and explicitly approve the provider's cost and data-processing terms. These actions are external, potentially paid, and must not be automated by Codex.

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

1. Add the audited provider adapter and server-only environment variables; do not add a browser SDK.
2. Add request-code and verify-code routes with CSRF-aware session handling, rate limits, structured security events without personal data, and generic errors.
3. Replace the local phone prototype only after the routes are tested against the provider sandbox or approved test account.
4. Run abuse, expiry, resend, incorrect-code, outage, logout, and real-device tests.
5. Obtain owner approval before enabling production OTP or attaching private media to learner cards.

`OTP_DEVELOPMENT_MODE` remains false by default. Any development-only test path must reject every non-development environment and must never be used as a production identity issuer.
