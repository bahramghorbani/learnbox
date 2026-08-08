# LearnBox execution rules

- Treat `docs/product/MASTER_SPEC.md` as authoritative; choose safe reversible defaults and record material choices in an ADR.
- Persian is RTL-first. Isolate German, code, URLs, and identifiers as LTR and test RTL, accessibility, empty, loading, error, and offline states.
- Do not commit secrets, production credentials, real personal data, or generated content without QA. Use synthetic test data only.
- Prefer privacy, offline resilience, measurable learning value, and rollback capability. Production, payment, legal, public-release, and destructive actions require owner approval.
- Every feature needs acceptance criteria, tests proportionate to risk, analytics intent, documentation, and a rollback/feature-flag assessment.
- Keep Bobo canonical assets versioned and do not alter their canonical appearance without owner approval.
- Run `pnpm check`, migration validation, and relevant Flutter checks before committing. Keep `main` runnable.

## Efficient agent workflow

- Start with [`docs/operations/AGENT_ACTIVE_BRIEF.md`](./docs/operations/AGENT_ACTIVE_BRIEF.md), then
  read only task-relevant files and direct references.
- Prefer `git status`, `git diff --name-only`, `rg` and focused tests over broad repository reads
  and repeated full checks.
- Use the brief's model-routing and minimal-delegation policy. Never trade away security, release
  gates or required verification merely to reduce token use.
