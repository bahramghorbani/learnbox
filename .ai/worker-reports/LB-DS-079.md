# LB-DS-079 — learner-scoped Start new-card intake

- Branch: `feat/s2-start35-new-card-intake`
- Base commit: `6f1eb9e81acb35c183f1d330a87ed43a07690ca1`
- Head commit: read live with `gh pr view <PR> --json headRefOid` before readiness or merge
- Draft PR: yes
- Scope completed: bounded, learner-scoped approved Start-card admission through the existing server-authoritative learner-state read
- Files changed: learner-state repository/service/serializers/client/tests, governing contracts, queue, and this report
- Checks run: focused learner-state 15/15; API 141/141; Website 308/308; serial full `pnpm check`; queue/docs/security validators; API and Website typecheck; Prettier; ESLint; `git diff --check`; Gitleaks diff scan
- Checks unavailable: exact-head independent review and live GitHub/Vercel CI for the current PR head
- Remaining work: exact-head independent review, terminal-success CI verification, and separately authorized staging/Production activation
- Risks: candidate selection currently uses deterministic `content_id` ordering with constant importance until the catalog contract adds explicit curriculum priority
- Secrets or production changes: no
- Bobo canonical status: review_requested

## Scope

Expose approved/published Start Pack cards that remain unscheduled for the authenticated learner without writing schedule state during a read. Preserve review-first daily capacity, recovery-mode behavior, existing authentication boundaries, no-store responses, and canonical review-submit identity.

## Implementation

- Added a parameterized learner-scoped anti-join that returns at most 12 `start-a1-%` candidates with an approved/published card version.
- Carried both database `cardId` and canonical `contentId`; `contentId` remains the review-submit wire identity.
- Passed candidates through the existing learning-engine session planner, admitting at most three after due reviews and none in recovery mode.
- Added the selected `newCards` projection to API and Web responses.
- Tightened the Web parser so the selected card identities must align exactly with `plan.newCardIds`.
- Added focused coverage for candidate bounds, learner-scoped anti-join placement, response serialization, parser fail-closed behavior, the three-card cap, and recovery mode.
- Updated the governing persistence, Web wiring, and wire-contract documents.
- Repaired the LB-DS-079 queue record after a context-compression marker had replaced its required fields.

## Security and release boundary

- Identity continues to come only from the verified bearer token or signed HttpOnly learner session.
- SQL values are parameterized; no client-controlled learner identifier or SQL fragment is accepted.
- Candidate selection is learner-scoped and excludes draft/unapproved content.
- The read path performs no schedule, event, content, approval, attachment, or publication mutation.
- No migration, runtime flag, environment, provider, deployment, staging, Production, DNS, payment, secret, OTP, or publication change is included.

## Verification

- Focused learner-state API tests: 15/15 passed.
- Full API suite: 141/141 passed.
- Full Website suite: 308/308 passed.
- Full workspace `pnpm check` passed with workspace concurrency restricted to one to avoid unrelated test timeout contention.
- Queue, documentation-governance, Web-security, formatting, lint, typecheck, diff, and secret-scan gates passed.

## Deliberate follow-up

Explicit curriculum priority/importance, strict single-snapshot reads, real-Postgres integration coverage, and any staging or Production activation remain separate work. The current deterministic `content_id` ordering is bounded and safe but is not claimed as final pedagogical sequencing.
