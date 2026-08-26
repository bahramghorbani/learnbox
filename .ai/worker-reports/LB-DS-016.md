# LB-DS-016 activation

- Task: NI-008B dormant native auth client seam
- Base: main at `d5b5fa0`
- Branch: `docs/activate-lb-ds-016`
- Status: ready for activation review
- Allowed implementation paths: two new provider-neutral mobile auth client/HTTP contract files, two direct test files, two docs, queue/report/current-work metadata.
- Forbidden: UI, main composition, endpoint activation, real OTP, provider call, secret, deployment, Preview execution, Production, background work and review-sync upload.
- Required implementation: strict TDD, injected HTTP, typed request/verify/refresh/revoke outcomes, bounded HTTPS-only transport using NI-008A config, and existing secure session-store seam.
