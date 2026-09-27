# M1-Q3 Independent QA — current Web server-wired slice

- Baseline: `origin/main` at `34e8e36` before QA documentation commit
- Scope: merged learner-state route/client/runtime and Today server-state behavior
- Executor: independent QA; no implementation changes
- Date: 2026-09-01

## Verification

| Check                                            | Result             |
| ------------------------------------------------ | ------------------ |
| Focused learner-state route/http/client/UI tests | 48/48 passed       |
| Website typecheck                                | passed             |
| Production service boundary tests                | 3/3 passed on main |
| Migration runner tests                           | 4/4 passed on main |
| Compose config validation with shape-only env    | passed on main     |
| `git diff --check`                               | passed             |

The existing M1-Q2 report records the broader live curl matrix: flag-off fail-closed 503,
invalid/forged cookie 401, unreachable database 503 without detail leakage, `no-store`,
secure-transport checks, client bundle leak check, RTL markup, responsive CSS and security
headers. Those checks were performed against the earlier equivalent server-wired slice and
remain relevant; this QA does not treat them as a real production deployment.

## Findings

No new blocker or high-severity finding was introduced by the current merged cursor-read
changes. Existing M1-Q2 findings remain open and review-gated:

- M-Q2-M1: read-only snapshot should not be labelled “last sync”; use “last server read”
  until push reconciliation exists.
- M-Q2-M2: Today actionable cards remain device-local; server-read copy must not imply the
  rendered list came from the server until canonical content mapping is live.
- M-Q2-M3: loading state changes copy but does not yet provide the specified skeleton board.
- M-Q2-L1/L2/L3/L4: small live contract/copy/formatting follow-ups recorded in M1-Q2.

## Browser and release limits

Browser visual, AX and keyboard acceptance is **not granted**. The browser harness previously
hit a Chrome remote-debugging permission dialog; policy forbids clicking permission UI. No
real PostgreSQL happy-path, real OTP, server deployment, DNS/TLS promotion or production
activation was performed. No code, schema, auth, flags or runtime behavior was changed.

## Verdict

**Tested foundation; not production-ready.** The security boundary and current test suite are
independently green, but visual/accessibility acceptance, canonical server-backed Today data,
push reconciliation wire contract, real database integration and owner-approved staging remain
required before release claims.
