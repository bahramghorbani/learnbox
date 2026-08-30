# Architecture Decision Records

Use sequential files named `NNNN-title.md`. Decisions record context, decision, consequences, and reversal trigger.

Current decisions include [ADR 0009](0009-co-hosted-isolated-web-surfaces.md),
which keeps the public landing and learner web app independently deployable even
when they share one production server,
[ADR 0011](0011-native-mobile-session-and-transport.md), which records the
default-disabled native mobile session and authenticated review transport, and
[ADR 0012](0012-web-learner-state-server-wiring.md), which records the approved
Web HttpOnly-cookie → Next.js route → learner-state-service wiring contract and
its explicit blockers, and
[ADR 0013](0013-start-pack-contentid-contract.md), which records that bundled
Start Pack IDs are canonical immutable `cards.content_id` values for M1 (clients
send `contentId`; the server resolves it to `cards.id`), and
[ADR 0014](0014-push-reconciliation-cursor-policy.md), which records the approved
M1-D push reconciliation cursor/watermark policy: a per-learner monotonic integer
version incremented only when a review event is newly applied, committed in the
same transaction as the event and schedule update.
