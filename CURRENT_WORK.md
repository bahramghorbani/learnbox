# LearnBox current work

**Scope:** only unfinished work. Stable merged facts live in `PROJECT_STATE.md`; capability truth lives in `docs/PRODUCT_STATUS.md`; release sequencing lives in `ROADMAP.md`; the normalized v1.1 backlog lives in `BACKLOG.md`; task authorization lives in `.ai/WORK_QUEUE.md`.

## Active work

**None. Web/PWA v1 is LIVE and CLOSED** as of 2026-09-28 at Production application SHA
`2acdcef4bc4e06c020f08de1fd16e4fbad2e1ea3`, image digest
`sha256:4e008803b22c63cc08ccbce4514834ceddeed0209f44c8e296c7efb665ae3bef`.

No v1.1 work is authorized or in progress. The candidate v1.1 scope is inventoried in
[`BACKLOG.md`](./BACKLOG.md) and awaits owner scope selection before any task is queued.

## What closed with v1

The pre-activation owner gates that this document previously tracked are resolved:

- the 35-item human review, starter media canonicalization (35/35 cards, 105/105 assets) and the
  authenticated learning loop shipped in the activated release;
- public activation completed with zero drift and no release blockers;
- rollback images, environment backups and the database backup are preserved.

Historical gate-by-gate detail remains in `ROADMAP.md` and the validation records under
`content/packs/learnbox-start/validation/` as history; it no longer describes pending work.

## Before starting v1.1

1. Obtain explicit owner selection of the v1.1 scope from the `BACKLOG.md` candidate set.
2. Queue a path-bounded task per selected item before execution begins.
3. Keep Production change, database mutation, credential rotation and SMS configuration behind
   their existing owner gates; v1 being live does not open them.
4. Preserve rollback and backup evidence; deletion requires explicit owner authorization naming
   the specific artifacts.
