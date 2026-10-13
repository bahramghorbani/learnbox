# LearnBox Iran server migration — runbook

Status: **Cutover DONE 2026-10-13 (owner-approved).** Germany write-freeze 15:38:04Z; final sync
15:38:22Z (34 s, parity 158/158, 45 tables / 1027 rows); Iran public 15:39Z; Arvan origin switched by owner.
Write outage ≈ 2 min. Germany stays frozen (503 on app/admin) and Neon untouched as rollback point.
Germany rehearsal DB + dump deleted (owner-approved). Iran landing `compose.yaml` is now the public bind.
No secret values appear in this document or anywhere in the repository.

## Topology

| | Germany (current Production) | Iran (prepared) |
|---|---|---|
| Host | `185.204.168.178`, 2 vCPU / 3.8 GiB | `185.226.118.146` (`learnboxapp`), 4 vCPU / 12 GiB / 75 GB, Ubuntu 24.04 |
| Database | Neon `divine-silence-09471885` (PostgreSQL 17) | Self-hosted `postgres:17-alpine@sha256:b0f9560a…` (17.11), container `learnbox-db-postgres-1` |
| Learner | `learnbox-app@sha256:051f8697…` (v1.2.2) | same image ID |
| Admin | `learnbox-admin@sha256:756abad3…` | same image ID |
| Landing | `learnbox-landing:0a36cce8a0a2-phase1` (`sha256:a6535fdc…`) | same image ID + temporary Enamad title files mounted read-only |
| Edge | Caddy `2-alpine@sha256:5f5c8640…`, public 80/443 | same Caddyfile (byte-identical) and copied TLS state; **bound to 127.0.0.1 until cutover** |

Public DNS for `learnboxapp.com`, `www`, `app` and `admin` is proxied by ArvanCloud CDN
(`185.143.233.132` / `185.143.234.132`). Cutover changes only the **origin IP** in the Arvan panel;
client-visible IPs and TTLs do not change.

Database access on Iran: internal Docker network `learnbox-db` (no host port), TLS required
(`hostssl` + SCRAM only; plaintext refused), private ECDSA CA at `/home/ubuntu/learnbox/db-tls/ca.crt`
(SAN `learnbox-db`). Apps keep forcing `sslmode=verify-full` and trust the CA through
`NODE_EXTRA_CA_CERTS` (the repo's existing pattern). The CA private key was destroyed after signing.
Do not use Ed25519 certificates here: libpq SCRAM channel binding has no digest for them.

Roles mirror Neon: `neondb_owner` (owns all objects, BYPASSRLS like Neon), `learnbox_app`,
`learnbox_admin`, `learnbox_migrator` (NOINHERIT, same grants/ACLs as Neon). Database `neondb` uses the
builtin `C.UTF-8` locale, matching Neon.

Secrets on Iran (mode 600, directory 700, never in Git): `/home/ubuntu/learnbox/secrets/`
`db-superuser.env`, `db-roles.env`, `neon-source.env` (Neon migrator DSN, read-only use), plus
`app/.env` and `admin/.env` copied from Germany with only `DATABASE_URL` rewritten to the Iran role DSN.
`db-roles.env` values are unquoted and contain `&`: read them with `grep '^NAME=' | cut -d= -f2-`
(as `learnbox-backup.sh` does) — never `source` the file, the shell treats `&` as a background operator.

## Host baseline (Phase 1)

- Full upgrade + reboot onto the current kernel; `unattended-upgrades` on.
- SSH: repository `99-learnbox-hardening.conf`; key-only, root login disabled, login user `ubuntu`.
  The cloud-init drop-in that re-enabled passwords is neutralised.
- UFW: deny inbound except 22 (rate-limited), 80, 443. Docker-published ports bypass UFW, so the
  database publishes no port at all.
- Docker: ArvanCloud registry mirror, `local` log driver (10 MB × 5), `live-restore`, DNS
  `178.22.122.100, 1.1.1.1, 8.8.8.8` (the provider resolvers cannot resolve foreign names).
- journald capped at 1 GB, 2 GB swap (`swappiness=10`), NTP synchronised.
- Resource limits: Postgres 3 GB / 2 CPU (`shared_buffers=768MB`, `max_connections=60`), app/admin
  1 GB each, landing 512 MB, Caddy 256 MB.

## Rehearsal evidence (Phase 2)

- Neon → Iran directly (Germany is not in the data path): `pg_dump --format=custom
  --serializable-deferrable`, TLS verify-full against the public CA.
- `db/final-sync.sh rehearsal` (dump → recreate → restore → parity → restart → health): **~48 s** end to end,
  dump ~26 s, restore ~3 s, parity ~11 s.
- `db/parity.sql`: per-table row count + order-independent content hash for all 45 tables, sequences,
  relation/column/schema/function ACLs, default privileges, role memberships and attributes, database
  CONNECT — **158 checks identical** to Neon (only Neon's platform-owned `cloud_admin` items differ by
  design and are excluded).
- Role boundaries: each role connects with TLS 1.3; plaintext and wrong-CA connections are refused.
- `p0-cutover/learner-regression-matrix.mjs` against the Iran stack (routed to Iran Caddy, not public DNS):
  **79 PASS / 0 FAIL** (auth, deletion guards, private media, CSRF guards, logout/revocation, owner data
  byte-identical).
- Admin: 26 routes return the same status codes as Production; Admin connects as `learnbox_admin`.
- External reachability: with Caddy briefly bound publicly, Germany reached all three hosts on Iran
  with valid TLS (`/api/health` ok, HTTP→HTTPS 308); rebound to 127.0.0.1 afterwards.

## Backups and monitoring (Phase 3)

- `learnbox-backup.timer` (02:30 UTC daily, 30-day retention) and `learnbox-restore-drill.timer`
  (Mon 03:30 UTC) run the repository scripts. The systemd drop-in
  `10-iran-selfhost.conf` sets `LEARNBOX_PG_DOCKER_ARGS` (network + CA mount); the role DSNs pin
  `sslrootcert=/run/db-tls/ca.crt`. Manual proof via the real units: backup ok (45 tables), drill ok
  (45 tables, 34 migrations, 0 orphans) on the same sha256. Scheduled runs not yet observed.
- **Telegram is unreachable from the Iran host**, so `learnbox-alert.sh` cannot deliver from there.
  Until an alert path exists, the Germany uptime monitor (which already checks the public URLs and can
  reach Telegram) is the alerting vantage point and must stay running.
- Encrypted offsite copy (Dropbox) is not configured on Iran: `rclone.conf` must never be copied, so
  it needs a new owner-authorised Dropbox token on the Iran host.

## Cutover (Phase 4 — only after owner approval)

Expected impact: learner/admin writes unavailable **~5–10 min** (503 with Retry-After); landing stays up.

1. Pre-checks: Germany Production healthy, Iran stack healthy, newest Germany nightly backup verified.
2. Freeze writes on Germany: install `/home/ubuntu/learnbox/evidence/iran-cutover-prep/Caddyfile.maintenance`
   (pre-validated; app/admin → 503, landing unchanged) and `caddy reload`. Confirm no
   `learnbox_app`/`learnbox_admin` activity on Neon.
3. On Iran: `LEARNBOX_WRITES_FROZEN=yes /home/ubuntu/learnbox/db/final-sync.sh cutover` — must end with
   `parity OK` and health ok. Any failure leaves Iran apps stopped; unfreeze Germany (step R1) and stop.
4. On Iran: `cd /srv/learnbox/landing && docker compose -f compose.public.yaml up -d --no-deps caddy`
   (public bind). From Germany: `curl --resolve <host>:443:185.226.118.146` for all three hosts.
5. **Owner, Arvan panel:** change the origin of `@`, `www`, `app`, `admin` from `185.204.168.178`
   to `185.226.118.146`.
6. Verify through the public URLs: landing title, `/41346530.txt`, app health, admin login options,
   OTP login on a real phone (owner), a review sync. Watch logs and DB connections for 30 min.
7. Germany stays in write-freeze (Neon unchanged = rollback point). Germany uptime monitor keeps running.

## Rollback

- R1 before step 5: restore the live Caddyfile from `iran-cutover-prep/Caddyfile.live-*` and
  `caddy reload` on Germany. Nothing else changed; Neon is untouched.
- R2 after step 5: Arvan origin back to `185.204.168.178`, then R1. Writes that reached Iran after the
  switch exist only on Iran: export them (`pg_dump` of the Iran DB, filtered to rows newer than the
  cutover time) and replay them into Neon as `neondb_owner` — a manual, owner-approved data step.
  The earlier the rollback, the smaller this delta.
- Neon, the Germany server and its backups are kept until the stabilisation period ends and the owner
  separately approves retirement (Phase 5).

## Rehearsal data retention

Rehearsal dumps and parity outputs (`/home/ubuntu/learnbox/backups/rehearsal/`, mode 600) contain real
user data. Delete them 14 days after a successful cutover, or immediately if the migration is
abandoned. The cutover dump is kept until the end of stabilisation. The temporary Germany rehearsal
database (`learnbox-selfhost-db-postgres-1`, stopped) and its dump are deleted only with owner approval.
