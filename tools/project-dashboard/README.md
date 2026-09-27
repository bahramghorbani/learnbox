# LearnBox local project dashboard

Local-only, dependency-free Node.js monitor for the LearnBox repository. Persian
(FA) RTL UI, auto-refresh every 15 seconds. No external JS, CSS, fonts, secrets,
dependencies, production calls or release activation.

## Start

```sh
pnpm dashboard            # default port 4173
# or a custom port:
node tools/project-dashboard/server.mjs --port 4321
PORT=4321 node tools/project-dashboard/server.mjs
```

Open http://127.0.0.1:4173 — the server binds to `127.0.0.1` only and rejects any
non-loopback client with `403`.

## Data

- **Live repository state** — git status/branch/log and `gh pr list` (when `gh` is
  available; the dashboard stays functional and shows an "offline" badge when it is
  not, and never blocks on it).
- **Task columns (completed / in progress / remaining)** — merged live from
  `.ai/WORK_QUEUE.md`, the explicit unfinished section in `CURRENT_WORK.md`, the
  current Git branch and its matching open PR, plus the committed release roadmap
  in `config.mjs`. The active-task percent comes from the documented
  status→percent mapping below.
- **Cafe Bazaar release readiness** — a committed auditable weighted checklist in
  `config.mjs` (weights sum to 100). Readiness is computed by formula, never
  inferred live. It lists evidence and blockers.
- **Storyboard stage progress** — read live from
  `docs/storyboard/STATUS.md` (`Current stage:` line), falling back to the
  committed `STORYBOARD` value if the file is absent.

## Status → percent mapping (transparent)

| Status                         | Percent |
| ------------------------------ | ------: |
| not-started / queued / planned |      10 |
| blocked                        |       5 |
| in-progress                    |      60 |
| review-requested               |      85 |
| done / accepted                |     100 |

Rationale: a coarse reviewable lifecycle; 0 implies no task is tracked, a task only
reaches 100 when verifiably merged/closed. Change/justify these in committed edits
only.

## Release readiness formula

```
readiness = Σ(weight of checked items) ÷ Σ(all weights) × 100
```

Every unmet item is shown as a blocker with its evidence string, all sourced from
the committed checklist — no live-invented numbers.

## Tests

```sh
pnpm test:dashboard        # node --test tools/project-dashboard/test/*.test.mjs
```

Pure computation (percent mapping, column split, weighted release score, storyboard
progress) and live-data parsers (git status/log, gh PR list, storyboard / work-queue
markdown) are unit-tested.

## Layout / accessibility

- Responsive: 3-column dashboard grid collapses to a single column below 840px.
- RTL-first Persian with `dir="rtl"` / `lang="fa"`; LTR values (git subjects, PR
  titles, formulas) isolate naturally via CSS direction on `.formula`.
- Semantic landmarks, `aria-live` regions, `aria-busy`, `role="alert"` for errors,
  visible `:focus-visible`, `color-scheme` light/dark support, and
  `prefers-reduced-motion` disables animation.
- Empty / error / offline states: empty columns show "data absent" text, a failed
  fetch shows a red banner (`role="alert"`), and `gh` offline shows a badge plus a
  notice in the PR card.

## Optional macOS LaunchAgent (do NOT install unless you opt in)

The repository ships a template plist
(`com.learnbox.project-dashboard.plist`). It is **not installed or activated**.
To use it yourself:

1. Edit `com.learnbox.project-dashboard.plist`:
   - set `/REPLACE_WITH_NODE_BIN` to your node path (run `which node`),
   - set `/REPLACE_WITH_REPO_PATH` to this repo's absolute path.
2. Symlink it into your user LaunchAgents and load/start:

   ```sh
   cp com.learnbox.project-dashboard.plist ~/Library/LaunchAgents/
   launchctl load ~/Library/LaunchAgents/com.learnbox.project-dashboard.plist
   launchctl start com.learnbox.project-dashboard  # optional immediate start
   ```

   To stop/remove: `launchctl unload` the plist and delete the file. The stub
   `KeepAlive` / `RunAtLoad` values in the template are `false` — change them only
   after you decide to run it as a service.
