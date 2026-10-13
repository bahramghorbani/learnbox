# LearnBox Iran server migration — runbook

Status: **Cutover DONE 2026-10-13 (owner-approved).** Germany write-freeze 15:38:04Z; final sync
15:38:22Z (34 s, parity 158/158, 45 tables / 1027 rows); Iran public 15:39Z; Arvan origin switched by owner.
Write outage ≈ 2 min. Germany stays frozen (503 on app/admin) and Neon untouched as rollback point.
Germany rehearsal DB + dump deleted (owner-approved). Iran landing `compose.yaml` is now the public bind.
No secret values appear in this document or anywhere in the repository.

## Topology

|          | Germany (current Production)                                | Iran (prepared)                                                                               |
| -------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Host     | `185.204.168.178`, 2 vCPU / 3.8 GiB                         | `185.226.118.146` (`learnboxapp`), 4 vCPU / 12 GiB / 75 GB, Ubuntu 24.04                      |
| Database | Neon `divine-silence-09471885` (PostgreSQL 17)              | Self-hosted `postgres:17-alpine@sha256:b0f9560a…` (17.11), container `learnbox-db-postgres-1` |
| Learner  | `learnbox-app@sha256:051f8697…` (v1.2.2)                    | same image ID                                                                                 |
| Admin    | `learnbox-admin@sha256:756abad3…`                           | same image ID                                                                                 |
| Landing  | `learnbox-landing:0a36cce8a0a2-phase1` (`sha256:a6535fdc…`) | same image ID + temporary Enamad title files mounted read-only                                |
| Edge     | Caddy `2-alpine@sha256:5f5c8640…`, public 80/443            | same Caddyfile (byte-identical) and copied TLS state; **bound to 127.0.0.1 until cutover**    |

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
- **Alerting:** Telegram is unreachable from Iran, so Germany runs `learnbox-iran-backup-watch.timer`
  (hourly, `infrastructure/production/iran/monitor/`): it pulls the three Iran status files with a
  forced-command key (`from=185.204.168.178,restrict`, `grep -H` of the status files only) and alerts via
  Telegram once per state change (backup >26 h, offsite >27 h, restore drill >8 d, or unreachable).
  Germany's uptime monitor covers the public URLs. **Replacement independent of Germany:**
  `learnbox-iran-monitor.timer` on Iran (every 5 min) pings two Healthchecks.io checks —
  `learnbox-iran-uptime` (3 domains via CDN, Learner `/api/health`, Admin, Enamad, container health;
  silence for 15 min = host/network down) and `learnbox-iran-backups` (same freshness limits). Healthchecks
  alerts the owner (Telegram/email) on down and on recovery. Ping URLs only in
  `secrets/healthchecks.env` (0600), written by `monitor/learnbox-iran-monitor-enroll.sh` run on the Mac.
- **Offsite (Dropbox, active 2026-10-13):** owner-authorized App Folder app, remote `dropbox:learnbox-iran/db`,
  copy-only/immutable, GPG to `FF1C441D…0289` (no secret key on Iran). `learnbox-offsite.timer` enabled
  (04:10 UTC). First point `learnbox-20261013T164948Z` uploaded, downloaded from Dropbox to the owner Mac,
  sha256 (encrypted + plaintext) matched, decrypted, restored into an isolated container: 45 tables /
  1045 rows / 34 migrations / 0 orphans, identical row counts to Iran live, newest row 16:16Z
  (post-cutover, so the source is Iran, not Neon). Remote retention: none (never auto-deleted);
  ~0.4 MB/day. Local retention 30 days.

## Admin access independent of Germany (2026-10-13)

Why the Mac cannot reach Iran directly (evidence 2026-10-13 16:15Z):

- The Mac leaves via MCI mobile (`5.210.91.249`, MCCI, IR — as seen by Arvan in `Ar-Real-Ip`), no VPN
  active, default route `en0`.
- Mac → `185.226.118.146` TCP 22/443/2222 and ICMP: timeout. A SYN capture on the Iran host (all
  interfaces) during those probes saw **0 packets** — the drop happens before the VM, so it is not UFW,
  sshd or Docker.
- Germany → `185.226.118.146` 22/443: open. Mac → `185.226.118.1:443` (same /24) and the Arvan CDN edge
  `185.143.233/234.132`: open.
- Re-check 17:20Z: the Mac sits behind OpenWrt (`192.168.20.1`) doing split routing — foreign
  destinations exit via an OVH proxy (`168.222.43.234`), Iranian ones directly via MCI. A second 30 s SYN
  capture again saw 0 packets from the Mac, while the VM does receive internet scan traffic (601 UFW
  blocks from many foreign sources in 6 h), so there is no blanket inbound whitelist in front of it.
- Remaining candidates, not yet distinguishable from here: an AbrArvan cloud-firewall / security-group /
  DDoS rule in front of this VM, or MCI-side filtering of this specific address. Owner check: Arvan panel
  → this server → Firewall/Security groups (inbound rules and any geo/ISP filter).

Fix (no new public port): SSH over WebSocket through the CDN that already serves the site.

- `admin.learnboxapp.com/_lb-ops/ssh` → Caddy `basic_auth` (bcrypt) → `reverse_proxy 172.19.0.1:8022`.
- `learnbox-ws-ssh.service` (`infrastructure/production/iran/ops-access/`): python3-websockets bridge,
  user `nobody`, bound to the `learnbox-edge` gateway only; UFW allows 8022 only from `172.19.0.0/16`.
- The bridge carries opaque SSH bytes: host key and Ed25519 user-key auth stay end to end; the CDN sees
  only TLS + ciphertext. Password/root login remain disabled.
- Mac: `ssh learnbox-iran-cdn` (`ProxyCommand websocat … wss://admin.learnboxapp.com/_lb-ops/ssh`,
  basic-auth string in `~/.ssh/learnbox-ops-ws.b64`, mode 600). Verified: login, 30 MB scp sha match,
  idle 75 s, `-L` port forwarding.
- Port 22 is no longer open to the internet: UFW `22/tcp` now allows only `185.204.168.178` (Germany
  jump, kept as the second path). Disable the CDN path: delete the `@lb_ops` block + `caddy reload`,
  `systemctl disable --now learnbox-ws-ssh`. Pre-change copies: `/home/ubuntu/learnbox/evidence/ops-access-*`.
- Before Germany is retired, replace its UFW rule with another fixed admin IP (or rely on the CDN path +
  AbrArvan web console as break-glass).

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

DNS alone is **not** a rollback after step 5: Iran is the only writer, so pointing traffic back at
Germany/Neon would silently drop every signup, review and payment written since 15:38Z
(already 17 rows within 30 min). Rollback is therefore a data move first, DNS last.

- R1 before step 5: restore the live Caddyfile from `iran-cutover-prep/Caddyfile.live-*` and
  `caddy reload` on Germany. Nothing else changed; Neon is untouched.
- R2 after step 5 (`infrastructure/production/iran/db/rollback-to-neon.sh`, on Iran):
  1. `rollback-to-neon.sh drift-check` (read-only). Proves Neon still equals the cutover snapshot,
     so Iran ⊇ Neon and a full replace loses nothing. If Neon changed: stop, manual merge.
  2. Freeze Iran writes: install `Caddyfile.maintenance` on Iran + `caddy reload` (Germany stays frozen).
  3. Owner approval + `neondb_owner` DSN supplied only in the environment (secure path, never stored).
  4. `LEARNBOX_IRAN_WRITES_FROZEN=yes LEARNBOX_ROLLBACK_APPROVED=yes NEON_OWNER_DATABASE_URL=… \
rollback-to-neon.sh execute` — drift-check, safety `pg_dump` of Neon, dump Iran, single-transaction
     `pg_restore --clean` into Neon as `neondb_owner` (Neon platform objects filtered), parity Iran == Neon.
  5. Only on `ROLLBACK DATA OK`: unfreeze Germany (R1), Arvan origin → `185.204.168.178`, then keep
     Iran frozen as the new rollback point. On parity failure: stay on Iran (unfreeze it).
- `rehearsal` mode proves steps 1/4 against a disposable Neon-like container (non-superuser
  `neondb_owner`, `cloud_admin`-owned pgcrypto, seeded from the cutover Neon dump). 2026-10-13 16:10Z:
  **REHEARSAL OK** — 45 tables, 1044 rows, 158 checks equal; seed == Neon at cutover; Neon unchanged.
  Write outage for a real R2 ≈ 2–3 min.
- Neon PITR is only 6 h, so the script's own pre-overwrite Neon dump plus
  `backups/cutover/neon-*.dump` are the Neon restore points.
- Neon, the Germany server and its backups are kept until the stabilisation period ends and the owner
  separately approves retirement (Phase 5).

## Rehearsal data retention

Rehearsal dumps and parity outputs (`/home/ubuntu/learnbox/backups/rehearsal/`, mode 600) contain real
user data. Delete them 14 days after a successful cutover, or immediately if the migration is
abandoned. The cutover dump is kept until the end of stabilisation. The temporary Germany rehearsal
database and its dump were deleted with owner approval on 2026-10-13.

## Disaster recovery without Germany

Where the recovery material lives (none of it on Germany):

| Item                    | Location                                                                                                                                                                                                                                                                                                   |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DB backups              | Dropbox app folder `learnbox-iran/db/*.sql.gz.gpg` (daily 04:10 UTC, never auto-deleted); Iran local 30 days                                                                                                                                                                                               |
| Recovery key            | GPG `FF1C…0289` (encryption subkey `D1B7C975D8DC014A`), passphrase-protected, **only** in owner Mac `~/.gnupg`. Owner keeps an offline export (`gpg --export-secret-keys --armor FF1C441D77781F99F2ABADE4A4CAE7A288970289`) on USB, passphrase stored separately. Revocation cert: `~/LearnBox-Recovery/`  |
| Server config + secrets | `~/LearnBox-Recovery/iran-config-<stamp>.tar.gz.gpg` on the Mac, encrypted on Iran to the recovery key (app/admin `.env`, `secrets/`, DB TLS, compose, Caddyfile, systemd units, ops + offsite scripts, `rclone.conf`). Refresh after any config change with the command below. Never uploaded to Dropbox. |
| Images                  | `/Volumes/LearnBox-Dev/LearnBox-Recovery/images/` (app, admin, landing, postgres:17-alpine + `SHA256SUMS`); caddy digest in Mac Docker. Source fallback: rebuild from the Git SHAs in the deployment record.                                                                                               |

Refresh the config bundle (from the Mac):
`ssh learnbox-iran-cdn 'O=/home/ubuntu/learnbox/offsite; sudo tar -czf - /home/ubuntu/learnbox/{admin,app,db,db-tls,secrets} /home/ubuntu/learnbox/ops/*.sh $O/config $O/scripts /srv/learnbox/landing /opt/learnbox-ops-access /etc/systemd/system/learnbox-* /etc/docker/daemon.json /etc/ufw/user*.rules /etc/ssh/sshd_config.d | gpg --homedir $O/gnupg --batch --trust-model always -e -r FF1C441D77781F99F2ABADE4A4CAE7A288970289' > ~/LearnBox-Recovery/iran-config-$(date -u +%Y%m%dT%H%M%SZ).tar.gz.gpg`

Scenarios:

- **A. Database damaged, server fine** (RTO ~30 min, RPO ≤24 h): stop app + admin; take a safety dump of
  the damaged DB; download the newest `.gpg` (Dropbox web or `rclone` on Iran); decrypt on the Mac
  (`gpg -d`, pinentry asks for the passphrase); verify `sha256` against `offsite.status`; restore into a
  recreated `neondb` (locale `C.UTF-8`, builtin provider, roles from `secrets/db-roles.env`); run
  `parity.sql` sanity; start app + admin.
- **B. Iran server lost** (RTO ~2–4 h, RPO ≤24 h): new Arvan VM (Ubuntu 24.04) → Docker + `daemon.json`
  DNS → `docker load` the images → decrypt the config bundle into place → start PostgreSQL, restore the
  newest Dropbox dump → start app/admin/landing/Caddy → owner changes the Arvan CDN origin to the new IP
  → re-enroll Dropbox (new token) and re-enable timers. Healthchecks URLs come back with the bundle.
- **C. CDN admin path down:** Arvan panel → server → web console, user `ubuntu` (console-only password;
  SSH password login stays disabled).

Limits: RPO is the nightly schedule (≤24 h). Neon is frozen at the 2026-10-13 15:38Z cutover and holds
none of the later data; after Germany is retired `rollback-to-neon.sh` has no application host to fail
over to, so Neon is a historical copy, not a DR target. If Iran loses international connectivity,
Dropbox uploads and Healthchecks pings stop (local backups continue; Healthchecks alerts as down).

## Germany retirement readiness (2026-10-13)

Evidence:

- Scheduled-path test: temporary timer drop-ins fired the real units. `learnbox-backup.service`
  18:25:00Z → `learnbox-20261013T182500Z.sql.gz`, 45 tables, `pruned=0`; `learnbox-offsite.service`
  18:29:00Z → `dropbox:learnbox-iran/db/learnbox-20261013T182500Z.sql.gz.gpg` (430,925 bytes, pubkey
  packet for `D1B7C975D8DC014A`), plaintext sha256 matches `backup.status`; earlier object untouched
  (no deletions or overwrites). Drop-ins removed; timers back to 02:30 / 04:10 UTC.
- Monitor timer active on Iran (5 min) with Healthchecks ping URLs in `secrets/healthchecks.env` (0600).
  Controlled `/fail` sent 18:19:25Z, success pings since. Telegram delivery must be confirmed by the owner (not visible to Hermes).
- Break-glass: owner logged in through the AbrArvan web console (independent of Germany and the CDN).
- The datacenter's own server backup is **not counted** until its type, schedule, retention,
  storage location and a restore are confirmed. It does not replace the Dropbox DB dumps.

Stops when Germany is powered off (none serve Production): Germany uptime monitor, error scan,
`learnbox-iran-backup-watch`, and the Germany Neon backup / offsite (`dropbox:learnbox/`) /
restore-drill timers. Neon has been unchanged since cutover; its last dumps stay in Dropbox.

Shutdown procedure (owner-approved only):

1. Pre-check: three domains 200, both Healthchecks checks up, newest `backup.status` and
   `offsite.status` `ok`.
2. Germany: `sudo systemctl disable --now 'learnbox-*.timer'`, then power off from the provider panel
   (power off, **do not delete**; keep the disk for at least 14 days).
3. Post-checks within 30 min: domains, Learner `/api/health`, Admin login page, owner SMS login,
   `ssh learnbox-iran-cdn true`, Healthchecks still green after two monitor runs. Next morning: 02:30
   backup, 04:10 offsite, `learnbox-iran-backups` green.
4. Same day, after step 3 passes: on Iran remove the UFW rule allowing `185.204.168.178` to port 22
   and the `learnbox-iran-status` forced-command key from `authorized_keys` (the IP may be reassigned).
   Mac alias `learnbox-iran` (ProxyJump Germany) stops working; use `learnbox-iran-cdn` or the console.
5. Back-out: Production does not depend on Germany, so nothing in Production is rolled back. If
   something unexpected needed Germany, power it on again from the panel and re-enable its timers.
   Deleting the Germany VM is a separate owner decision.
