# LearnBox current work

**Scope:** only unfinished work. Stable merged facts live in `PROJECT_STATE.md`; capability truth lives in `docs/PRODUCT_STATUS.md`; release sequencing lives in `ROADMAP.md`; the normalized v1.1 backlog lives in `BACKLOG.md`; task authorization lives in `.ai/WORK_QUEUE.md`.

## Active work

**v1.1.0 Option B — implemented on `release/v1.1.0`, not deployed.**

Production still runs the v1.0 release: application SHA
`2acdcef4bc4e06c020f08de1fd16e4fbad2e1ea3`, image digest
`sha256:4e008803b22c63cc08ccbce4514834ceddeed0209f44c8e296c7efb665ae3bef`. Nothing in this
branch has reached Production, and migration `0019` has not been applied there.

Owner-selected scope (`LearnBox_v1.1_Option_B_Hermes_Directive.txt`): LB-B01, LB-B02, LB-B04,
LB-B03, LB-B08, LB-B09, LB-B21. Out of scope and untouched: LB-B05, LB-B06, LB-B10 residual,
LB-B11–LB-B20, Android, payments, premium packs, iOS, notifications, media migration, audio
regeneration and Git history cleanup.

### Delivered in this branch

- **LB-B01 / LB-B08 — support and contact path.** `@learnboxsupportbot` for learner support and
  as the escape path when OTP SMS does not arrive, surfaced in the profile alongside email.
- **LB-B02 — operations.** Daily database backup, uptime monitoring, error capture with secret
  redaction, and a weekly restore drill, each as a systemd timer with `@learnboxmonitoringbot`
  alerting. Monitoring and support bots are kept separate: separate tokens, separate chats,
  operational alerts never reach the learner-facing bot.
- **LB-B03 — learner profile.** One canonical phone-mask helper. Two endpoints had disagreed about
  the same field, one of them emitting a Persian prefix welded onto Latin digits, which renders as
  visibly broken text in a right-to-left interface.
- **LB-B04 — account deletion.** UI, API, and a SQL orchestrator that removes learner data while
  keeping a privacy-minimized deletion audit record and a purchase-ownership claim. Idempotent via
  a `request_id` unique index, so a retry cannot produce a second deletion.
- **LB-B09 — lifecycle integrity.** Media exposure and release stage are modelled and validated
  independently in the canonical Starter media manifest.
- **LB-B21 — this document and the other canonical current docs.**

### Not yet proven

- **Account deletion is not Production-proven.** The path is covered by unit tests and an 18-check
  integration proof against a copy of the Production database, but it has not run end-to-end in
  Production with a dedicated test account. It stays unproven until it has.
- **`/api/health` monitoring is availability-only.** The endpoint ships in this branch and is not
  deployed, so the uptime monitor currently checks reachability. After deploy, set
  `LEARNBOX_MONITOR_HEALTH_PATH=/api/health` and re-verify end to end.
- **Scheduled runs are enabled, not yet observed.** An active timer is not a successful execution.
  Backup and restore drill are proven by manual runs; the first real scheduled run of each must be
  recorded separately.

## What closed with v1

The pre-activation owner gates that this document previously tracked are resolved:

- the 35-item human review, starter media canonicalization (35/35 cards, 105/105 assets) and the
  authenticated learning loop shipped in the activated release;
- public activation completed with zero drift and no release blockers;
- rollback images, environment backups and the database backup are preserved.

Historical gate-by-gate detail remains in `ROADMAP.md` and the validation records under
`content/packs/learnbox-start/validation/` as history; it no longer describes pending work.

## Standing constraints

1. Keep Production change, database mutation, credential rotation and SMS configuration behind
   their existing owner gates; v1 being live does not open them.
2. Preserve rollback and backup evidence; deletion requires explicit owner authorization naming
   the specific artifacts.
3. The repository stays private, `v1.0.0` does not move, history is not rewritten, media is not
   purged, and protected-media authentication is not weakened.
