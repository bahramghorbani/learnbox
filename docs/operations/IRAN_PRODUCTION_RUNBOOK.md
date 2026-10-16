# LearnBox Iran Production — operations runbook

**Current as of 2026-10-16.** This runbook covers how the Iran host runs Production, how it is
administered, backed up and monitored, and how to rebuild it. Release identity, capabilities and the
Admin content workflow live in [`ADMIN_PRODUCTION_STATUS.md`](./ADMIN_PRODUCTION_STATUS.md).
Release mechanics live in [`RELEASE_ARTIFACT_PREFLIGHT.md`](./RELEASE_ARTIFACT_PREFLIGHT.md).

No secret value appears here or anywhere in the repository. Every action below that changes the host
(deploy, restart, restore, firewall, timers) needs explicit owner authorization.

## Host-mirrored files

`infrastructure/production/iran/` holds byte-for-byte copies of the files that run on the host. They
are not reformatted, so their checksums can be compared with the host. They were last verified on
2026-10-16 (see the PR that added this runbook). The repository copy does not deploy itself: a host
file changes only through an authorized release or operation, and the copy here is updated in a PR
afterwards.

| Repository path (`infrastructure/production/…`)                  | Host path                                                                |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `iran/app/compose.yaml`                                          | `/home/ubuntu/learnbox/app/compose.yaml`                                 |
| `iran/admin/compose.yaml`                                        | `/home/ubuntu/learnbox/admin/compose.yaml`                               |
| `iran/landing/compose.yaml`                                      | `/srv/learnbox/landing/compose.yaml` (Landing + Caddy, public 80/443)    |
| `iran/db/compose.yaml`, `iran/db/pg_hba.conf`                    | `/home/ubuntu/learnbox/db/`                                              |
| `ops/learnbox-backup.sh`, `ops/learnbox-restore-drill.sh`        | `/home/ubuntu/learnbox/ops/`                                             |
| `ops/learnbox-alert.sh`                                          | `/home/ubuntu/learnbox/ops/` (Telegram is unreachable from Iran)         |
| `ops/systemd/learnbox-{backup,restore-drill}.{service,timer}`    | `/etc/systemd/system/`                                                   |
| `iran/systemd/learnbox-{backup,restore-drill}.service.d/*.conf`  | `/etc/systemd/system/<unit>.d/10-iran-selfhost.conf`                     |
| `iran/offsite/learnbox-offsite-sync.py`                          | `/home/ubuntu/learnbox/offsite/scripts/`                                 |
| `iran/offsite/learnbox-offsite.{service,timer}`                  | `/etc/systemd/system/`                                                   |
| `iran/monitor/learnbox-iran-monitor.sh`                          | `/home/ubuntu/learnbox/ops/`                                             |
| `iran/monitor/learnbox-iran-monitor.{service,timer}`             | `/etc/systemd/system/`                                                   |
| `iran/ops-access/ws-ssh-bridge.py`                               | `/opt/learnbox-ops-access/`                                              |
| `iran/ops-access/learnbox-ws-ssh.service`                        | `/etc/systemd/system/`                                                   |
| `iran/monitor/learnbox-iran-monitor-enroll.sh`, `…-disk-test.sh` | not installed; enrollment runs on the owner Mac, the disk test on demand |

App and Admin compose files reference images by local image ID (`sha256:…`). The image IDs are
the deployed digests in `ADMIN_PRODUCTION_STATUS.md`. A release changes exactly that line.

**Host-only files that intentionally differ from the repository:**

- `/srv/learnbox/landing/Caddyfile` differs from `infrastructure/production/landing/Caddyfile` in
  two places. (1) It serves the Enamad verification file `/41346530.txt` from `/config`. (2) In the
  `admin.learnboxapp.com` site, the repository's 2026-09-30 containment `respond "Not Found" 404` is
  replaced by the admin SSH path (`/_lb-ops/ssh`: `basic_auth` with a bcrypt hash, then
  `reverse_proxy 172.19.0.1:8022`) followed by `import admin_app`, which serves the Admin. **A
  Caddyfile rebuilt from the repository would therefore return 404 for the Admin.** Restore the
  live file from the encrypted config bundle. The bcrypt hash is a credential and stays on the host
  only.
- `/srv/learnbox/landing/enamad/` holds the temporary Enamad title files mounted into Landing.

## Topology

- **Host:** AbrArvan VM, Ubuntu 24.04, `linux/amd64`, 4 vCPU / 12 GiB / 75 GB, user `ubuntu`.
- **Edge:** ArvanCloud CDN proxies `learnboxapp.com`, `www`, `app` and `admin` to this host's origin
  IP. Caddy terminates TLS. Network `learnbox-edge` connects Caddy, Landing, App and Admin.
- **Database:** `postgres:17-alpine@sha256:b0f9560a…` in container `learnbox-db-postgres-1`. It runs
  on the internal network `learnbox-db` and publishes no host port. Only `hostssl` + SCRAM are
  accepted. Apps force `sslmode=verify-full` and trust the private CA via `NODE_EXTRA_CA_CERTS`
  (`/home/ubuntu/learnbox/db-tls/ca.crt`, SAN `learnbox-db`). The CA private key was destroyed
  after signing. Do not use Ed25519 certificates: libpq SCRAM channel binding has no digest for them.
- **Roles:** `neondb_owner` (owns objects), `learnbox_app`, `learnbox_admin`, `learnbox_migrator`
  (NOINHERIT). Database `neondb`, builtin `C.UTF-8` locale. The names are kept from the earlier Neon
  host; Neon itself is not in use.
- **Firewall:** UFW allows only 80/tcp, 443/tcp, 443/udp and `172.19.0.1:8022` from
  `172.19.0.0/16` (Caddy to the SSH bridge). Port 22 has no internet allow rule. Docker-published
  ports bypass UFW, so only Caddy publishes ports.
- **Host baseline:** `unattended-upgrades`, key-only SSH
  (`infrastructure/production/ssh/99-learnbox-hardening.conf`), Docker `local` log driver,
  `live-restore`, ArvanCloud registry mirror, DNS `178.22.122.100, 1.1.1.1, 8.8.8.8`. journald is
  capped at 1 GB; swap is 2 GB.

## Secrets: locations only

All live on the host. Every file below has mode 600 and `secrets/` has mode 700. They are never in
Git, logs, chat or evidence.

| Path (host)                                        | Holds                                                                  |
| -------------------------------------------------- | ---------------------------------------------------------------------- |
| `/home/ubuntu/learnbox/app/.env`, `admin/.env`     | Runtime configuration, including role DSNs and provider keys           |
| `/home/ubuntu/learnbox/secrets/db-superuser.env`   | PostgreSQL superuser for the DB container                              |
| `/home/ubuntu/learnbox/secrets/db-roles.env`       | Role DSNs used by backup, drill and migrations                         |
| `/home/ubuntu/learnbox/secrets/healthchecks.env`   | Healthchecks.io ping URLs                                              |
| `/home/ubuntu/learnbox/db-tls/server.key`          | DB TLS key (`ca.crt` and `server.crt` are public)                      |
| `/home/ubuntu/learnbox/offsite/config/rclone.conf` | Dropbox App Folder token                                               |
| `/home/ubuntu/learnbox/offsite/config/offsite.env` | Non-secret offsite settings (recipient fingerprint, remote name, path) |
| `/srv/learnbox/landing/Caddyfile` (mode 640)       | Contains the `/_lb-ops/ssh` bcrypt hash                                |
| Owner Mac `~/.ssh/learnbox-ops-ws.b64`             | Basic-auth string for the admin SSH path                               |

`db-roles.env` values are unquoted and contain `&`. Read one with `grep '^NAME=' | cut -d= -f2-`.
Never `source` the file.

`/home/ubuntu/learnbox/secrets/neon-source.env` is a leftover from the move and is not used by any
running unit. Removing it is a separate owner decision.

## Administration access

- **Primary:** `ssh learnbox-iran-cdn` from the owner Mac. This is SSH over WebSocket through the
  CDN: `wss://admin.learnboxapp.com/_lb-ops/ssh` → Caddy `basic_auth` → `learnbox-ws-ssh.service`
  (user `nobody`, bound to `172.19.0.1:8022`). The bridge carries opaque SSH bytes, so host-key and
  Ed25519 user-key authentication stay end to end. Password and root login are disabled.
- **Break-glass:** AbrArvan panel → server → web console, user `ubuntu` (console-only password held
  by the owner).
- **To disable the CDN path:** remove the `/_lb-ops/ssh` block from the host Caddyfile, run
  `caddy reload`, then `systemctl disable --now learnbox-ws-ssh`.
- The Mac cannot reach the host IP directly (a drop before the VM). Do not open port 22 to work
  around it.

## Backups, offsite and restore drill

| Unit (UTC)                                      | Does                                                                                                                                                                   |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `learnbox-backup.timer` 02:30 daily             | `learnbox-backup.sh`: `pg_dump` over TLS as the migrator role, 30-day local retention in `/home/ubuntu/learnbox/backups`                                               |
| `learnbox-offsite.timer` 04:10 daily (+≤15 min) | `learnbox-offsite-sync.py`: GPG-encrypts the newest backup to `FF1C441D…0289` and copies it to `dropbox:learnbox-iran/db`. Copy-only; nothing is ever deleted remotely |
| `learnbox-restore-drill.timer` Mon 03:30        | `learnbox-restore-drill.sh`: restores the newest backup into a disposable container and checks tables and migrations                                                   |

The drop-in `10-iran-selfhost.conf` sets `LEARNBOX_PG_DOCKER_ARGS` (DB network + CA mount).
`learnbox-backup.sh` passes it to its `docker run`; without it, the backup cannot reach the
internal database. The repository restore-drill script does not read this variable.

Status files: `/home/ubuntu/learnbox/ops/state/backup.status` and
`/home/ubuntu/learnbox/offsite/state/offsite.status`.

The GPG private key never exists on the host. It is on the owner Mac and the owner's offline USB
export. The datacenter's own server backup is **not** counted until its type, schedule, retention
and a restore are confirmed.

Before a migration, the release procedure takes a fresh backup, verifies its checksum, makes an
offsite copy and runs a disposable restore drill.

## Monitoring

`learnbox-iran-monitor.timer` runs every 5 min on the host and pings Healthchecks.io, which alerts
the owner by Telegram and email on down and on recovery:

- `learnbox-iran-uptime`: the three domains via the CDN, Learner `/api/health`, Admin, the Enamad
  file and container health. Silence for 15 min means the host or the network is down.
- `learnbox-iran-backups`: local backup ≤ 26 h, offsite ≤ 27 h, restore drill ≤ 8 d.
- `learnbox-iran-disk-warning` / `-critical`: root disk ≥ 75 % or < 15 GiB free / ≥ 85 % or < 8 GiB
  free.

Ping URLs exist only in `secrets/healthchecks.env`. To re-create them, the owner runs
`iran/monitor/learnbox-iran-monitor-enroll.sh` on the Mac; it creates or reuses the checks by name.
To check the disk thresholds without pinging, run
`bash learnbox-iran-monitor-disk-test.sh /home/ubuntu/learnbox/ops/learnbox-iran-monitor.sh`.

## Recovery material

| Item                    | Location                                                                                                                                                         |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Database backups        | Dropbox App Folder `learnbox-iran/db/*.sql.gz.gpg` (never auto-deleted); host local copies for 30 days                                                           |
| Recovery key            | GPG `FF1C441D77781F99F2ABADE4A4CAE7A288970289`, passphrase-protected, on the owner Mac and the owner's offline USB                                               |
| Server config + secrets | `~/LearnBox-Recovery/iran-config-<stamp>.tar.gz.gpg` on the owner Mac, encrypted to the recovery key. Never uploaded to Dropbox                                  |
| Images                  | Release images are rebuilt from the exact source SHA per `RELEASE_ARTIFACT_PREFLIGHT.md`; offline copies under `/Volumes/LearnBox-Dev/LearnBox-Recovery/images/` |

Refresh the config bundle after any host configuration change (run from the Mac):

```sh
ssh learnbox-iran-cdn 'O=/home/ubuntu/learnbox/offsite; sudo tar -czf - /home/ubuntu/learnbox/{admin,app,db,db-tls,secrets} /home/ubuntu/learnbox/ops/*.sh $O/config $O/scripts /srv/learnbox/landing /opt/learnbox-ops-access /etc/systemd/system/learnbox-* /etc/docker/daemon.json /etc/ufw/user*.rules /etc/ssh/sshd_config.d | gpg --homedir $O/gnupg --batch --trust-model always -e -r FF1C441D77781F99F2ABADE4A4CAE7A288970289' > ~/LearnBox-Recovery/iran-config-$(date -u +%Y%m%dT%H%M%SZ).tar.gz.gpg
```

## Disaster recovery

The only recovery target is a rebuilt Iran host restored from the Dropbox backups. Neon and the
retired Germany host hold no data written after 2026-10-13 and are **not** recovery paths.

- **A. Database damaged, host fine** (RTO ≈ 30 min, RPO ≤ 24 h):
  1. Stop App and Admin, and take a safety dump of the damaged database.
  2. Download the newest `.gpg` backup and decrypt it on the Mac.
  3. Verify its `sha256` against `offsite.status`.
  4. Recreate `neondb` (builtin `C.UTF-8`) with the roles from `db-roles.env`, then restore.
  5. Check the table count and the migration ledger against the schema head in
     `ADMIN_PRODUCTION_STATUS.md`.
  6. Start App and Admin.
- **B. Host lost** (RTO ≈ 2–4 h, RPO ≤ 24 h):
  1. Create a new AbrArvan VM (Ubuntu 24.04) and apply the host baseline.
  2. Install Docker with `daemon.json` and decrypt the config bundle into place.
  3. Load or rebuild the images at the recorded digests.
  4. Start PostgreSQL and restore the newest Dropbox backup.
  5. Start App, Admin, Landing and Caddy.
  6. The owner changes the Arvan CDN origin to the new IP.
  7. Re-authorize Dropbox (new token), then re-enable the timers and the monitor.
- **C. CDN admin path down:** use the AbrArvan web console.

Limits: RPO is the nightly schedule. If the host loses international connectivity, Dropbox uploads
and Healthchecks pings stop. Local backups continue, and Healthchecks reports the host as down.

## History

Production moved from the Germany host and the Neon database to this host on 2026-10-13 (write
outage ≈ 2 min). The rehearsal, the cutover procedure, `final-sync.sh`, `parity.sql`, the
`rollback-to-neon.sh` rollback, the Germany backup-watch units and the Germany retirement steps are
preserved on the PR #423 branch (`ops/iran-selfhost-migration`). They describe completed one-time
work and must not be used for current operations. The Germany host was powered off on 2026-10-13
and is kept, not deleted, until the owner decides. Neon stays frozen at the cutover and is a
historical copy only.
