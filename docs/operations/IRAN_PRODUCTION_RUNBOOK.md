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

| Repository path (`infrastructure/production/…`)                          | Host path                                                                   |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `iran/app/compose.yaml`                                                  | `/home/ubuntu/learnbox/app/compose.yaml`                                    |
| `iran/admin/compose.yaml`                                                | `/home/ubuntu/learnbox/admin/compose.yaml`                                  |
| `iran/landing/compose.yaml`                                              | `/srv/learnbox/landing/compose.yaml` (Landing + Caddy, public 80/443)       |
| `iran/landing/Caddyfile.template` (credential replaced by a placeholder) | `/srv/learnbox/landing/Caddyfile` (see below; not byte-identical by design) |
| `iran/db/compose.yaml`, `iran/db/pg_hba.conf`                            | `/home/ubuntu/learnbox/db/`                                                 |
| `ops/learnbox-backup.sh`, `ops/learnbox-restore-drill.sh`                | `/home/ubuntu/learnbox/ops/`                                                |
| `ops/learnbox-alert.sh`                                                  | `/home/ubuntu/learnbox/ops/` (Telegram is unreachable from Iran)            |
| `ops/systemd/learnbox-{backup,restore-drill}.{service,timer}`            | `/etc/systemd/system/`                                                      |
| `iran/systemd/learnbox-{backup,restore-drill}.service.d/*.conf`          | `/etc/systemd/system/<unit>.d/10-iran-selfhost.conf`                        |
| `iran/offsite/learnbox-offsite-sync.py`                                  | `/home/ubuntu/learnbox/offsite/scripts/`                                    |
| `iran/offsite/learnbox-offsite.{service,timer}`                          | `/etc/systemd/system/`                                                      |
| `iran/monitor/learnbox-iran-monitor.sh`                                  | `/home/ubuntu/learnbox/ops/`                                                |
| `iran/monitor/learnbox-iran-monitor.{service,timer}`                     | `/etc/systemd/system/`                                                      |
| `iran/ops-access/ws-ssh-bridge.py`                                       | `/opt/learnbox-ops-access/`                                                 |
| `iran/ops-access/learnbox-ws-ssh.service`                                | `/etc/systemd/system/`                                                      |
| `iran/monitor/learnbox-iran-monitor-enroll.sh`, `…-disk-test.sh`         | not installed; enrollment runs on the owner Mac, the disk test on demand    |
| `iran/commerce/learnbox-commerce-reconcile.{sh,service,timer}`           | **not installed**; part of payment activation (see below)                   |

App and Admin compose files reference images by local image ID (`sha256:…`). The image IDs are
the deployed digests in `ADMIN_PRODUCTION_STATUS.md`. A release changes exactly that line.

**Host-only files that intentionally differ from the repository:**

- `/srv/learnbox/landing/Caddyfile` contains a credential (a bcrypt hash), so it is not mirrored.
  Its non-secret twin is `iran/landing/Caddyfile.template`. The template is byte-identical to the
  live file, except that the hash is replaced by the Caddy environment placeholder
  `{$LEARNBOX_OPS_SSH_BCRYPT_HASH}`. Without that value the template fails `caddy validate` (fail
  closed). Restore it as described in [Restoring Caddy](#restoring-caddy). The older
  `infrastructure/production/landing/Caddyfile` still carries the 2026-09-30 Admin containment
  (`respond "Not Found" 404`). It is **not** a recovery source for this host. The `TEMPORARY
CONTAINMENT` comment inside the live file and the template is stale text: the block below it
  serves the Admin.
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

Scratch database containers (restore drill, recovery drill, account-deletion check) must be
removed with `docker rm -fv`, by the container ID the same run created (never by name). The postgres image declares a data volume, and `docker rm -f` on a
`--rm` container leaves it behind with the restored copy of the data in it. A host that ran the
older scripts can hold such volumes; list them with `docker volume ls -f dangling=true` and treat
their contents as Production data.

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

## Commerce reconciliation (not installed)

Payment is off in Production. The files in `infrastructure/production/iran/commerce/` are prepared
and were tested only on the Mac staging stack with a fake provider. Installing them is part of the
payment activation, which needs separate owner authorization.

**What runs.** `learnbox-commerce-reconcile.timer` starts `learnbox-commerce-reconcile.sh` every
10 min. The script runs `node` inside the app container and calls
`POST http://127.0.0.1:3000/api/internal/commerce/reconcile` with
`Authorization: Bearer $LEARNBOX_COMMERCE_RECONCILE_TOKEN`, read from the container environment.
The token lives only in `app/.env`. It is not on a command line, in a URL, in Caddy logs or in the
output. The app re-checks unsettled Zarinpal attempts and queued Admin re-check requests through its
payment service (contract §10.1). The script prints and stores counts only. A run that overlaps the
callback cannot grant twice, because the app settles each attempt under a row lock.

**Rollout order (the flag goes on only after scheduled execution is ready):**

1. Copy the script to `/home/ubuntu/learnbox/ops/` and the units to `/etc/systemd/system/`, then
   `systemctl daemon-reload`. Leave the timer disabled.
2. Run the script once by hand. While the flag is off, expect
   `commerce-reconcile: fail http=404 error=notFound`, which proves the path and the container name.
3. Add `LEARNBOX_COMMERCE_RECONCILE_TOKEN` (`openssl rand -hex 32`, at least 32 characters) and
   `LEARNBOX_COMMERCE_RECONCILE_ENABLED=true` to `app/.env`, then recreate the app.
4. Run the script by hand again and expect `ok http=200 checked=… verified=…`. Then
   `systemctl enable --now learnbox-commerce-reconcile.timer`.
5. Add one line to the monitor next to the other `fresh` checks, and update the repository mirror
   in the same change:
   `fresh commerce-reconcile "$L/ops/state/commerce-reconcile.status" 1`
6. Only then set `LEARNBOX_COMMERCE_RECONCILE_ENABLED=true` in `admin/.env` and recreate the Admin.
   That shows the «درخواست بررسی دوباره از درگاه» button. Without it the Admin explains that
   reconciliation is off and the API refuses with 409.

Rollback is the reverse order: Admin flag off, `systemctl disable --now` the timer, remove the
monitor line, then turn off the app flag.

**Seeing the last run and detecting a stopped timer:**

- Last result: `cat /home/ubuntu/learnbox/ops/state/commerce-reconcile.status`
  (`status`, `at`, `detail`).
- Schedule: `systemctl list-timers learnbox-commerce-reconcile.timer` (last and next trigger).
- History: `journalctl -u learnbox-commerce-reconcile.service -n 20`.
- Alerting reuses the existing monitor and the `learnbox-iran-backups` Healthchecks check (job
  freshness). If the status is `fail` or older than the threshold (integer hours, so about 2 h with
  `1`), the check fails and the owner is alerted. There is no separate monitor.
- Per payment, the Admin transaction details show the check count, the last provider code and
  «بررسی بعدی» (next check). After 20 inconclusive checks an attempt shows that the check limit was
  reached and stays in «نیازمند بررسی» until someone handles it.

## Recovery material

| Item                    | Location                                                                                                                                                              |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Database backups        | Dropbox App Folder `learnbox-iran/db/*.sql.gz.gpg` (never auto-deleted); host local copies for 30 days                                                                |
| Recovery key            | GPG `FF1C441D77781F99F2ABADE4A4CAE7A288970289`, passphrase-protected, on the owner Mac and the owner's offline USB                                                    |
| Server config + secrets | `iran-config-<stamp>.tar.gz.gpg` (incl. live Caddyfile + Caddy volumes) on the owner Mac and external drive, encrypted to the recovery key. Never uploaded to Dropbox |
| Images                  | Release images are rebuilt from the exact source SHA per `RELEASE_ARTIFACT_PREFLIGHT.md`; offline copies under `/Volumes/LearnBox-Dev/LearnBox-Recovery/images/`      |

The bundle also contains both Caddy volumes (`learnbox-production_caddy_config`, with the Enamad
file, and `learnbox-production_caddy_data`, with the ACME account and certificates). Keep one copy on
the owner Mac (`~/LearnBox-Recovery/`) and one on the owner's external drive
(`/Volumes/LearnBox-Dev/LearnBox-Recovery/`). Never upload it to Dropbox. Never overwrite or delete
an older bundle; add a new stamped one.

Refresh the bundle after any host configuration change (run from the Mac; nothing on the host
changes). Compare the two printed ciphertext hashes:

```sh
OUT=~/LearnBox-Recovery/iran-config-$(date -u +%Y%m%dT%H%M%SZ).tar.gz.gpg
ssh learnbox-iran-cdn 'set -o pipefail; O=/home/ubuntu/learnbox/offsite; V=/var/lib/docker/volumes; sudo tar -czf - /home/ubuntu/learnbox/{admin,app,db,db-tls,secrets} /home/ubuntu/learnbox/ops/*.sh $O/config $O/scripts /srv/learnbox/landing /opt/learnbox-ops-access /etc/systemd/system/learnbox-* /etc/docker/daemon.json /etc/ufw/user*.rules /etc/ssh/sshd_config.d $V/learnbox-production_caddy_config/_data $V/learnbox-production_caddy_data/_data | gpg --homedir $O/gnupg --batch --trust-model always -e -r FF1C441D77781F99F2ABADE4A4CAE7A288970289 | tee >(sha256sum >&2)' > "$OUT"
shasum -a 256 "$OUT"; cp -n "$OUT" /Volumes/LearnBox-Dev/LearnBox-Recovery/
```

Current bundle: `iran-config-20261016T203227Z.tar.gz.gpg`, 115 entries, ciphertext sha256
`55a7fdb0e4dde533…` (identical on host stream, Mac and external drive). On 2026-10-16 a
disposable local drill decrypted it and checked each of the following:

- the plaintext matched the host's pre-encryption sha256;
- the restored Caddyfile matched the live sha256 `65ee66ae8ceab13f…`;
- the Enamad file was present;
- the template plus the restored hash reproduced the live file byte for byte;
- `caddy validate` (same `caddy:2-alpine@sha256:5f5c8640…` image, `--network none`) passed for the
  restored file and for the template with a fresh dummy hash.

Production was not touched.

## Restoring Caddy

1. **Preferred: the exact file from the bundle.** On the Mac, decrypt the newest bundle (passphrase
   only in the pinentry dialog) and extract `srv/learnbox/landing/Caddyfile`, `srv/learnbox/landing/`
   and the two Caddy volumes. Place them at the same paths on the new host: Caddyfile mode 640, the
   volumes restored before Caddy starts. Then run `caddy validate` before `docker compose up`.
2. **Fallback, when no bundle is usable: render the template with a new credential.**
   - The owner picks a new password and runs
     `docker run --rm caddy:2-alpine caddy hash-password` (it prompts; the password never goes
     into shell history).
   - Write the final file. Put the hash in a variable and substitute the token:
     `awk -v h="$HASH" '{gsub(/\{\$LEARNBOX_OPS_SSH_BCRYPT_HASH\}/, h); print}' Caddyfile.template > Caddyfile`.
     `envsubst` cannot do this, because it does not expand `{$…}`.
   - Then update `~/.ssh/learnbox-ops-ws.b64` on the Mac to `base64("lbops:<new password>")`.
   - Alternatively, keep the template as is and pass the variable to the Caddy container. The live
     compose does not do this, so it would be a compose change.
3. Certificates: if the `caddy_data` volume is lost, Caddy requests new certificates on first start.
   This needs ArvanCloud to forward the ACME HTTP challenge.

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
  2. Install Docker with `daemon.json` and decrypt the config bundle into place
     (Caddy: see [Restoring Caddy](#restoring-caddy)).
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
