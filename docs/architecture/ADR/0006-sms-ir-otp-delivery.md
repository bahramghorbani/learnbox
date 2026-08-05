# ADR 0006 — SMS.ir OTP delivery seam

- **Status:** accepted; template approved, delivery remains disabled
- **Date:** 2026-07-28

## Context

The owner selected SMS.ir for LearnBox's future Iranian phone-verification delivery service. The
closed alpha currently has a provider-neutral OTP contract and a local-only phone UI, but no
provider credential, template, server route, session issuance, or real SMS delivery.

SMS.ir's verification API sends a parameterized, approved template through a service route. It
does not act as LearnBox's identity verifier, so a code sent successfully is not itself a verified
learner identity.

On 2026-08-05, the owner confirmed that SMS.ir approved LearnBox verification template `495140`.
The exact case-sensitive code-placeholder name and private API key still belong to deployment
configuration and must be confirmed before delivery is enabled.

## Decision

- Use SMS.ir only through a future server-side delivery adapter; do not add an SDK or API key to
  the browser, mobile client, Git repository, logs, or analytics.
- Call the verification-template endpoint only after the owner has approved the exact template,
  its code-placeholder name, its numeric template ID, the service status, and the deployment
  secret configuration.
- Generate an opaque challenge ID and a cryptographically secure one-time code inside LearnBox;
  persist only a keyed hash of that code with expiry, attempt count and resend cooldown.
- Use the initial policy of five digits, five-minute expiry, one-minute resend cooldown and five
  attempts. These values are server-owned and covered by the challenge-core unit tests.
- Verify the code within LearnBox's server boundary, then derive a stable internal identity before
  issuing the existing signed learner session. A provider message ID is an audit reference, not a
  learner identifier.
- Keep the current disabled provider as the default until automated abuse, expiry, resend,
  incorrect-code, outage and real-device checks pass and the owner approves activation.

## Consequences

SMS.ir is now the documented candidate for OTP delivery, while the project remains fail-closed.
The opaque challenge core, database migration and atomic PostgreSQL transition store are present;
they do not expose a route, issue a learner session or deliver a message. The required account
actions are small and deferred until the server adapter reaches activation: an approved verification
template, its identifier and a restricted API key in the deployment secret store. This preserves
provider replaceability because challenge lifecycle and identity verification stay in LearnBox
rather than inside the vendor integration.

## Reversal trigger

Re-evaluate this decision if SMS.ir cannot provide an approved verification template, acceptable
delivery reliability, cost, account controls or data-processing terms for the intended alpha.
Replacing the delivery adapter must not change the challenge store, learner identity mapping,
session contract or client UI.
