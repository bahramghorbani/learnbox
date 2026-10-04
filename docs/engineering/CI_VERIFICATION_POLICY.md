# CI verification policy — local-first, selective hosted

GitHub Actions minutes are a managed project constraint (Free plan, 2,000
minutes/month). This document states where verification runs and why. It does
not weaken any check: every check that protected `main` before still protects
it, and launch/Production-critical changes still get the full gate.

## Why

Before this policy every push ran all four jobs unconditionally. A
documentation-only PR spent roughly 18 minutes of hosted time on a Flutter
APK build, a production Docker image build and a full Node test suite that
could not possibly be affected by a markdown edit.

## The model

**Local first.** Hermes and developers verify before opening or updating a PR.
GitHub is not a test runner to iterate against: every push costs shared
minutes, and a red hosted run that a local run would have caught is waste.

Run before pushing:

```bash
pnpm check                              # lint + types + unit tests
pnpm build                              # production build
node --test scripts/*.test.mjs          # workflow classifier tests
node scripts/validate-migrations.mjs    # when database/ changed
```

For `apps/mobile` changes, additionally:

```bash
cd apps/mobile && flutter analyze && flutter test
```

Do not open a PR, or push a fix-up commit, to find out whether something
passes that you can run locally in under two minutes.

**Hosted CI is for what local runs cannot give us:** a clean-room environment,
a disposable Postgres matching the migration path, a real Linux production
image build, and full-history secret scanning with repository credentials.

## What runs when

The `changes` job classifies the diff (`scripts/ci-changed-areas.mjs`) and the
other jobs gate their expensive steps on it.

| Change                                       | quality           | secrets  | mobile            | production-stack  |
| -------------------------------------------- | ----------------- | -------- | ----------------- | ----------------- |
| Docs, plans, `prototypes/`                   | resolves, no work | **full** | resolves, no work | resolves, no work |
| `apps/admin` only                            | **full**          | **full** | resolves, no work | resolves, no work |
| `apps/mobile` only                           | **full**          | **full** | **full**          | resolves, no work |
| Website/API/packages/config/content/database | **full**          | **full** | resolves, no work | **full**          |
| `infrastructure/`, lockfile, workflows       | **full**          | **full** | **full**          | **full**          |

All four checks always report a conclusion. A skipped job still succeeds, so a
required check never hangs as "Expected" and branch protection stays workable.

## Safety properties

These are the reasons this is a minutes optimisation and not a coverage cut.

1. **Allow-list, not deny-list.** Only paths proven inert are classified as
   documentation. Any unrecognised path — including a brand-new top-level
   directory — falls through to full CI. Adding source can never silently
   lose coverage; it can only run more CI than strictly needed.
2. **`secrets` is never skipped.** A credential can be committed in a markdown
   file. Gitleaks scans full history on every change, docs included. It is also
   the cheapest job (~11s), so there was nothing to save.
3. **The image build follows the Dockerfile.** `INFRA` covers every path the
   production Dockerfile copies, including `apps/api`, `config`, `content`,
   `database/migrations` and `tsconfig.base.json`. A test asserts this, so a
   new `COPY` line that outgrows the list fails CI rather than skipping the
   build silently.
4. **An empty or unresolvable diff means full CI.** A first branch push or a
   forced update cannot resolve a base commit, so the classifier returns "run
   everything" rather than guessing.
5. **`main` is never cancelled.** Superseded-run cancellation applies only to
   pull requests. Every commit that lands on `main` keeps its own complete
   verification record.
6. **No test was weakened, skipped or retimed** to reduce minutes. The command
   lines in every job are byte-identical to before; only `if:` conditions and
   the classifier were added.

## Release and Production changes

Anything touching `infrastructure/`, the lockfile or the workflows runs the
complete gate, unconditionally. Release and Production cutover verification is
unchanged and is not subject to path filtering — see
`docs/planning/` release runbooks and the owner gates recorded there.

If in doubt, run the full suite. Minutes are cheaper than a bad deploy.

<!-- protection probe: verifies feature-branch -> PR -> CI -> merge still works -->
