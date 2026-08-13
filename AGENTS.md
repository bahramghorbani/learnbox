# LearnBox execution rules

- Treat `docs/product/MASTER_SPEC.md` as authoritative; choose safe reversible defaults and record material choices in an ADR.
- Persian is RTL-first. Isolate German, code, URLs, and identifiers as LTR and test RTL, accessibility, empty, loading, error, and offline states.
- Do not commit secrets, production credentials, real personal data, or generated content without QA. Use synthetic test data only.
- Prefer privacy, offline resilience, measurable learning value, and rollback capability. Production, payment, legal, public-release, and destructive actions require owner approval.
- Every feature needs acceptance criteria, tests proportionate to risk, analytics intent, documentation, and a rollback/feature-flag assessment.
- Keep Bobo canonical assets versioned and do not alter their canonical appearance without owner approval.
- Run `pnpm check`, migration validation, and relevant Flutter checks before committing. Keep `main` runnable.
- The repository is the source of truth across providers. Before meaningful work, follow
  [`AI_BOOTSTRAP.md`](./AI_BOOTSTRAP.md); keep stable-main facts in
  [`PROJECT_STATE.md`](./PROJECT_STATE.md) and unmerged work in
  [`CURRENT_WORK.md`](./CURRENT_WORK.md).
- Never implement meaningful work directly on `main`. Use `feature/`, `fix/`, `refactor/`,
  `content/`, `docs/` or `chore/` branches, validate the change, and prefer pull request plus CI
  before merge.
- Before new implementation, inspect `.ai/WORK_QUEUE.md` and open Draft PRs. Review and close any
  `review_requested` routine-worker task before creating overlapping work; only Codex may approve
  its integration after required checks and CI pass.

## Efficient agent workflow

- Start with [`AI_BOOTSTRAP.md`](./AI_BOOTSTRAP.md), then use
  [`docs/operations/AGENT_ACTIVE_BRIEF.md`](./docs/operations/AGENT_ACTIVE_BRIEF.md) for compact
  task navigation and read only task-relevant files and direct references.
- Prefer `git status`, `git diff --name-only`, `rg` and focused tests over broad repository reads
  and repeated full checks.
- Use the brief's model-routing and minimal-delegation policy. Never trade away security, release
  gates or required verification merely to reduce token use.
