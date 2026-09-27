# Stage 24 local synthetic load testing

## Purpose and boundary

This procedure establishes a repeatable local baseline for the learner web app before any beta
cohort is considered. It uses only synthetic read requests and aggregate latency/count results.
It does not send invitation, OTP, billing, private-media, admin or provider requests.

**Production is forbidden.** Preview, Vercel, LAN and public hosts are forbidden too. The runner
accepts only `http://127.0.0.1:3010` or `http://localhost:3010` and rejects every other target
before it sends a request.

Never put a phone number, invitation code, OTP, cookie, credential, response body or real-user
data into a command, report, issue, PR or log.

## Fixed routes and profiles

The runner requests only public, read-only learner routes: `/`, `/manifest.webmanifest`, `/offline`
and `/icon.svg`. Redirects are failures.

| Profile    | Requests |                      Failure gate | Latency gate               |
| ---------- | -------: | --------------------------------: | -------------------------- |
| `smoke`    |      100 |                     zero failures | p95 ≤ 1000ms, p99 ≤ 1500ms |
| `baseline` |      500 | fewer than 1%, stop at 5 failures | p95 ≤ 1500ms, p99 ≤ 2500ms |

These are local baseline gates, not a Production capacity claim. The low-end Android measurements
in [`PERFORMANCE_BUDGETS.md`](./PERFORMANCE_BUDGETS.md) remain required before beta release.

The shared learning engine has a separate CPU-only synthetic profile:

```bash
pnpm test:engine-load
```

It has no network target and exercises deterministic review scheduling plus retry-queue ordering.
Its result is not evidence of Flutter, Preview or Production capacity.

## Controlled run

In one terminal, build and serve the learner app only on loopback:

```bash
pnpm build
pnpm preview:web
```

In a second terminal, run the profiles:

```bash
pnpm load:local:smoke
pnpm load:local:baseline
```

Each command writes one JSON line containing only profile name, loopback target, request totals,
failure counts/rate, latency percentiles, pass/fail and stop reason. A failed profile returns a
non-zero exit code. Do not rerun against a remote URL to work around a target rejection.

## Recovery check

1. Stop the local server, then start a smoke profile.
2. Confirm that the command stops with `failure_limit` and a non-zero exit code.
3. Restart the same local server.
4. Rerun `pnpm load:local:smoke`; it must return `"passed":true`.

If recovery does not pass, keep beta, provider and release flags disabled; record only the
aggregate failure/latency evidence and investigate locally.

The runner stops scheduling new work once its failure limit is observed. Requests already in flight
may complete, so an aggregate report can contain up to the concurrency plus failure-limit allowance
of failures.

## Evidence template

Record the date, commit SHA, Node version, profile, aggregate JSON result, and whether recovery
passed. Keep any optional local artifact beneath ignored `.artifacts/load/`. Do not treat a
successful local run as evidence for Preview or Production capacity.

## Latest local evidence

On 2026-08-25 at `main` commit `7e3d1f3`, the built learner app was served only on
`http://127.0.0.1:3010` and produced these aggregate-only results:

- `smoke`: 100 requests, 0 failures, p50 4ms, p95 31ms, p99 34ms, passed.
- `baseline`: 500 requests, 0 failures, p50 8ms, p95 15ms, p99 31ms, passed.
- CPU-only engine profile: 10,000 schedules, 100,000 transitions, 10,000 queued events, 0 invariant failures, passed.
- Recovery: with the server stopped, smoke stopped at `failure_limit` with exit code 1; after restart, smoke passed with 100 requests and 0 failures.

This is repeatable local regression evidence only. It does not establish Preview, LAN, Production,
real-user, provider, or low-end Android capacity.

On 2026-08-12, the local built learner app passed `smoke` with 100 requests, zero failures, p95
33ms and p99 38ms; it passed `baseline` with 500 requests, zero failures, p95 18ms and p99 34ms.
The stopped-server recovery check returned `failure_limit` with a non-zero exit, and the restarted
server then passed `smoke`. This evidence is aggregate-only and loopback-only.
