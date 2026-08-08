# Contributing

Use short-lived `feature/`, `fix/`, `refactor/`, `content/`, `docs/` or `chore/` branches,
conventional commits, and pull requests. Do not make meaningful changes directly on `main`.

Before opening a PR, follow [`AI_BOOTSTRAP.md`](./AI_BOOTSTRAP.md), run `pnpm check` and the
relevant focused/build/migration checks, update direct tests and documentation, and record material
architecture decisions in an ADR. Keep `PROJECT_STATE.md` limited to stable-main facts and
`CURRENT_WORK.md` limited to active unmerged work. Provider-native tools are interchangeable only
when they satisfy the repository's abstract capability requirements in `.ai/`.

Do not commit secrets or activate provider, production or release-flag boundaries without explicit
owner approval. Preserve the approved Bobo identity; visual changes require the recorded approval
defined by PDR-003.
