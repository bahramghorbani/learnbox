#!/usr/bin/env python3
"""LearnBox offsite recovery-point sync.

Read-only against the existing local backup workflow: it never creates,
rewrites, prunes or deletes a local archive, never touches ops/state/backup.status,
and never issues an rclone delete/sync/move. Uploads are copy-only.

Two authorization paths, neither weaker than the other:
  interactive  --run --confirm-upload   requires config/ARMED to exist
  automated    --run --automated        requires proof that this process IS the
                                        learnbox-offsite.service systemd unit, and
                                        that the pinned recipient, remote and
                                        destination path match expectations

Modes:
  --self-check  assertions on selection, identity and precondition logic (no network)
  --plan        read-only: what WOULD be uploaded, with size estimates (default)
  --run         encrypt + copy to Dropbox (see authorization paths above)
"""
from __future__ import annotations

import argparse
import datetime as dt
import getpass
import hashlib
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BACKUP_DIR = Path("/home/ubuntu/learnbox/backups")
BACKUP_STATUS = Path("/home/ubuntu/learnbox/ops/state/backup.status")
CONFIG = ROOT / "config" / "offsite.env"
ARMED = ROOT / "config" / "ARMED"
GNUPGHOME = ROOT / "gnupg"
RCLONE = ROOT / "bin" / "rclone"
RCLONE_CONF = ROOT / "config" / "rclone.conf"
STATE = ROOT / "state" / "offsite.status"
WORKDIR = ROOT / "tmp"

# Pinned expectations for the automated path. These are deliberately hard-coded:
# the automated path must not be steerable by editing a config file alone.
EXPECTED_UNIT = "learnbox-offsite.service"
EXPECTED_FPR = "FF1C441D77781F99F2ABADE4A4CAE7A288970289"
EXPECTED_REMOTE = "dropbox"
EXPECTED_REMOTE_PATH = "learnbox-iran"  # Iran host: separate from the frozen Germany/Neon points
EXPECTED_USER = "ubuntu"

# A transfer is pointless, and possibly misleading, if the local backup it would
# replicate never succeeded. 26h tolerates timer drift on a 24h schedule.
MAX_LOCAL_BACKUP_AGE_H = 26

# Only strictly-named scheduled archives rotate. Manual/pre-migration archives
# (e.g. learnbox-pre-0019-*.sql.gz) are deliberately never auto-selected.
ARCHIVE_RE = re.compile(r"^learnbox-(\d{8}T\d{6}Z)\.sql\.gz$")

KEEP_DAILY = 7
KEEP_WEEKLY = 4
KEEP_MONTHLY = 3


def parse_archive(name: str) -> dt.datetime | None:
    m = ARCHIVE_RE.match(name)
    if not m:
        return None
    return dt.datetime.strptime(m.group(1), "%Y%m%dT%H%M%SZ").replace(tzinfo=dt.timezone.utc)


def select_recovery_points(names: list[str]) -> list[str]:
    """Newest archive per day/week/month bucket, newest N buckets per tier."""
    dated = sorted(
        ((ts, n) for n in names if (ts := parse_archive(n))),
        key=lambda x: x[0],
    )
    if not dated:
        return []

    def pick(keyfn, keep):
        buckets: dict = {}
        for ts, n in dated:  # ascending, so last write per bucket is the newest
            buckets[keyfn(ts)] = n
        return [buckets[k] for k in sorted(buckets)[-keep:]]

    chosen = set()
    chosen.update(pick(lambda t: t.date(), KEEP_DAILY))
    chosen.update(pick(lambda t: t.isocalendar()[:2], KEEP_WEEKLY))
    chosen.update(pick(lambda t: (t.year, t.month), KEEP_MONTHLY))
    return sorted(chosen, key=lambda n: parse_archive(n), reverse=True)


def parse_kv(text: str) -> dict:
    out = {}
    for line in text.splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            out[k.strip()] = v.strip().strip('"').strip("'")
    return out


def local_backup_precondition(status_text: str, now: dt.datetime,
                              max_age_h: int = MAX_LOCAL_BACKUP_AGE_H) -> tuple[bool, str]:
    """The local backup must have succeeded recently. Never writes to backup.status."""
    kv = parse_kv(status_text)
    if kv.get("status") != "ok":
        return False, f"local_backup_status={kv.get('status') or 'missing'}"
    at = kv.get("at")
    if not at:
        return False, "local_backup_timestamp_missing"
    try:
        ts = dt.datetime.strptime(at, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=dt.timezone.utc)
    except ValueError:
        return False, f"local_backup_timestamp_unparseable={at}"
    age_h = (now - ts).total_seconds() / 3600.0
    if age_h > max_age_h:
        return False, f"local_backup_stale_{age_h:.1f}h"
    if age_h < -1:
        return False, f"local_backup_timestamp_in_future_{-age_h:.1f}h"
    return True, f"local_backup_ok_age={age_h:.1f}h"


def identity_failures(env: dict, cgroup_text: str, cfg: dict,
                      conf_mode: int | None, user: str) -> list[str]:
    """Proof that this process is the intended systemd unit with the intended target.

    Interactive invocations fail here: a login shell's cgroup is a user session
    scope, never the service unit, so --automated cannot be borrowed by hand.
    """
    bad = []
    if not env.get("INVOCATION_ID"):
        bad.append("not_started_by_systemd")
    if EXPECTED_UNIT not in cgroup_text:
        bad.append("wrong_service_identity")
    if user != EXPECTED_USER:
        bad.append(f"wrong_user={user}")
    if cfg.get("RECIPIENT_FPR") != EXPECTED_FPR:
        bad.append("recipient_fpr_mismatch")
    if cfg.get("RCLONE_REMOTE") != EXPECTED_REMOTE:
        bad.append("remote_mismatch")
    if cfg.get("REMOTE_PATH", EXPECTED_REMOTE_PATH) != EXPECTED_REMOTE_PATH:
        bad.append("remote_path_mismatch")
    if conf_mode is None:
        bad.append("rclone_conf_absent")
    elif conf_mode & 0o077:
        bad.append(f"rclone_conf_permissive_{conf_mode:o}")
    return bad


def self_check() -> int:
    base = dt.datetime(2026, 7, 1, 2, 30, tzinfo=dt.timezone.utc)
    names = [
        (base + dt.timedelta(days=i)).strftime("learnbox-%Y%m%dT%H%M%SZ.sql.gz")
        for i in range(100)
    ]
    sel = select_recovery_points(names)

    assert parse_archive("learnbox-20261011T023257Z.sql.gz") is not None
    assert parse_archive("learnbox-pre-0019-20260928T203854Z.sql.gz") is None, "manual archive must not rotate"
    assert parse_archive("learnbox-20261011T023257Z.sql.gz.gpg") is None
    assert parse_archive("random.txt") is None

    assert names[-1] in sel, "newest archive must always be a recovery point"
    assert len(sel) <= KEEP_DAILY + KEEP_WEEKLY + KEEP_MONTHLY == 14, len(sel)
    assert len(sel) == len(set(sel)), "no duplicate recovery points"

    days = {parse_archive(n).date() for n in sel}
    assert len(days) == len(sel), "one archive per calendar day at most"

    assert len({parse_archive(n).isocalendar()[:2] for n in sel}) >= KEEP_WEEKLY
    assert len({(parse_archive(n).year, parse_archive(n).month) for n in sel}) == KEEP_MONTHLY
    span = (parse_archive(sel[0]) - parse_archive(sel[-1])).days
    assert span >= 30, f"retention must reach back at least a month, got {span}d"

    same_day = ["learnbox-20261011T023257Z.sql.gz", "learnbox-20261011T193000Z.sql.gz"]
    assert select_recovery_points(same_day) == ["learnbox-20261011T193000Z.sql.gz"]
    assert select_recovery_points([]) == []
    assert select_recovery_points(["learnbox-pre-0019-20260928T203854Z.sql.gz"]) == []

    # --- local backup precondition -------------------------------------------
    now = dt.datetime(2026, 10, 12, 4, 10, tzinfo=dt.timezone.utc)
    fresh = "status=ok\nat=2026-10-12T02:34:33Z\nfile=x.sql.gz\n"
    ok, why = local_backup_precondition(fresh, now)
    assert ok and why.startswith("local_backup_ok"), why
    ok, why = local_backup_precondition("status=failed\nat=2026-10-12T02:34:33Z\n", now)
    assert not ok and "status=failed" in why, why
    ok, why = local_backup_precondition("status=ok\nat=2026-10-09T02:34:33Z\n", now)
    assert not ok and "stale" in why, why
    ok, why = local_backup_precondition("status=ok\n", now)
    assert not ok and "timestamp_missing" in why, why
    ok, why = local_backup_precondition("", now)
    assert not ok and "missing" in why, why
    ok, why = local_backup_precondition("status=ok\nat=2026-10-14T02:00:00Z\n", now)
    assert not ok and "future" in why, why

    # --- automated identity gate ---------------------------------------------
    good_cfg = {"RECIPIENT_FPR": EXPECTED_FPR, "RCLONE_REMOTE": EXPECTED_REMOTE,
                "REMOTE_PATH": EXPECTED_REMOTE_PATH}
    unit_cgroup = f"0::/system.slice/{EXPECTED_UNIT}"
    env_ok = {"INVOCATION_ID": "deadbeef"}
    assert identity_failures(env_ok, unit_cgroup, good_cfg, 0o600, EXPECTED_USER) == []
    # An interactive shell cannot borrow the automated path.
    shell_cgroup = "0::/user.slice/user-1000.slice/session-14483.scope"
    assert "wrong_service_identity" in identity_failures(env_ok, shell_cgroup, good_cfg, 0o600, EXPECTED_USER)
    assert "not_started_by_systemd" in identity_failures({}, unit_cgroup, good_cfg, 0o600, EXPECTED_USER)
    # A redirected destination or rotated recipient must not run unattended.
    assert "remote_mismatch" in identity_failures(
        env_ok, unit_cgroup, {**good_cfg, "RCLONE_REMOTE": "elsewhere"}, 0o600, EXPECTED_USER)
    assert "remote_path_mismatch" in identity_failures(
        env_ok, unit_cgroup, {**good_cfg, "REMOTE_PATH": "somewhere"}, 0o600, EXPECTED_USER)
    assert "recipient_fpr_mismatch" in identity_failures(
        env_ok, unit_cgroup, {**good_cfg, "RECIPIENT_FPR": "0" * 40}, 0o600, EXPECTED_USER)
    assert "wrong_user=root" in identity_failures(env_ok, unit_cgroup, good_cfg, 0o600, "root")
    assert any(f.startswith("rclone_conf_permissive") for f in
               identity_failures(env_ok, unit_cgroup, good_cfg, 0o644, EXPECTED_USER))
    assert "rclone_conf_absent" in identity_failures(env_ok, unit_cgroup, good_cfg, None, EXPECTED_USER)

    print(f"self-check OK: {len(sel)} recovery points from {len(names)} archives, span {span}d; "
          "precondition and identity gates asserted")
    return 0


def load_config() -> dict:
    return parse_kv(CONFIG.read_text()) if CONFIG.exists() else {}


def sha256_file(p: Path) -> str:
    h = hashlib.sha256()
    with p.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def gzip_ok(p: Path) -> bool:
    return subprocess.run(["gzip", "-t", str(p)], capture_output=True).returncode == 0


def read_cgroup() -> str:
    try:
        return Path("/proc/self/cgroup").read_text()
    except OSError:
        return ""


def conf_mode() -> int | None:
    try:
        return RCLONE_CONF.stat().st_mode & 0o777
    except OSError:
        return None


def remote_existing(remote: str, rpath: str) -> set[str]:
    """Objects already offsite. Listing, not deleting: retry must never re-upload."""
    r = subprocess.run(
        [str(RCLONE), "--config", str(RCLONE_CONF), "lsf", f"{remote}:{rpath}/db"],
        capture_output=True, text=True,
    )
    if r.returncode != 0:
        raise RuntimeError(f"remote listing failed: {r.stderr.strip()[:200]}")
    return {ln.strip() for ln in r.stdout.splitlines() if ln.strip()}


def write_status(lines: list[str]) -> None:
    STATE.write_text("\n".join(lines) + "\n")
    STATE.chmod(0o640)
    print("\n".join(lines))


def plan(cfg: dict) -> int:
    names = sorted(os.listdir(BACKUP_DIR)) if BACKUP_DIR.is_dir() else []
    sel = select_recovery_points(names)
    total = 0
    print(f"backup_dir={BACKUP_DIR}")
    print(f"archives_present={len([n for n in names if parse_archive(n)])} "
          f"non_rotating={len([n for n in names if n.endswith('.sql.gz') and not parse_archive(n)])}")
    print(f"recovery_points_selected={len(sel)} "
          f"(daily={KEEP_DAILY} weekly={KEEP_WEEKLY} monthly={KEEP_MONTHLY})")
    for n in sel:
        size = (BACKUP_DIR / n).stat().st_size
        total += size
        print(f"  {n} bytes={size}")
    est = int(total * 1.01) + 1024 * len(sel)
    print(f"plaintext_total_bytes={total}")
    print(f"estimated_encrypted_bytes={est} (~{est/1048576:.2f} MiB)")
    print(f"recipient_fpr={cfg.get('RECIPIENT_FPR') or 'UNSET'}")
    print(f"rclone_remote={cfg.get('RCLONE_REMOTE') or 'UNSET'}:{cfg.get('REMOTE_PATH') or 'UNSET'}")
    print(f"rclone_conf_present={RCLONE_CONF.exists()}")
    print(f"armed={ARMED.exists()} (interactive upload refused while false)")
    if BACKUP_STATUS.exists():
        ok, why = local_backup_precondition(BACKUP_STATUS.read_text(), dt.datetime.now(dt.timezone.utc))
        print(f"local_backup_precondition={'pass' if ok else 'FAIL'} ({why})")
    return 0


def run(cfg: dict, confirm: bool, automated: bool) -> int:
    now = dt.datetime.now(dt.timezone.utc)
    stamp = now.strftime("%Y-%m-%dT%H:%M:%SZ")

    # --- authorization -------------------------------------------------------
    if automated:
        bad = identity_failures(dict(os.environ), read_cgroup(), cfg, conf_mode(), getpass.getuser())
        if bad:
            # Deliberately does NOT touch offsite.status: a rejected caller must not
            # be able to erase the record of the last real transfer. The refusal is
            # reported on stderr and, for the real unit, in the journal.
            print(f"REFUSED: automated path not authorized: {','.join(bad)}", file=sys.stderr)
            return 4
    else:
        if not ARMED.exists():
            print(f"REFUSED: {ARMED} absent. Interactive uploads require the sentinel.", file=sys.stderr)
            return 3
        if not confirm:
            print("REFUSED: --run requires --confirm-upload.", file=sys.stderr)
            return 3

    fpr = cfg.get("RECIPIENT_FPR")
    remote = cfg.get("RCLONE_REMOTE")
    rpath = cfg.get("REMOTE_PATH", "learnbox")
    if not fpr or not remote:
        print("REFUSED: RECIPIENT_FPR and RCLONE_REMOTE must be set in offsite.env.", file=sys.stderr)
        return 3
    if not RCLONE_CONF.exists():
        print(f"REFUSED: {RCLONE_CONF} absent (Dropbox not authorized).", file=sys.stderr)
        return 3

    # --- precondition: the local backup this would replicate must be healthy --
    status_text = BACKUP_STATUS.read_text() if BACKUP_STATUS.exists() else ""
    ok, why = local_backup_precondition(status_text, now)
    if not ok:
        print(f"REFUSED: {why}", file=sys.stderr)
        write_status([f"status=skipped", f"at={stamp}",
                      f"mode={'automated' if automated else 'interactive'}",
                      f"reason={why}", "uploaded=0",
                      "local_backups_modified=no", "remote_deletions=no"])
        return 5

    # --- transfer ------------------------------------------------------------
    bwlimit = cfg.get("BWLIMIT", "2M")
    tpslimit = cfg.get("TPSLIMIT", "4")
    names = sorted(os.listdir(BACKUP_DIR))
    sel = select_recovery_points(names)

    try:
        already = remote_existing(remote, rpath)
    except RuntimeError as e:
        print(f"REFUSED: {e}", file=sys.stderr)
        write_status([f"status=failed", f"at={stamp}",
                      f"mode={'automated' if automated else 'interactive'}",
                      f"reason=remote_listing_failed", "uploaded=0",
                      "local_backups_modified=no", "remote_deletions=no"])
        return 1

    uploaded, failed, skipped = [], [], []
    tmp = Path(tempfile.mkdtemp(dir=WORKDIR, prefix="offsite."))
    try:
        for n in sel:
            if n + ".gpg" in already:
                # Already offsite. Never re-encrypt and never overwrite: a retry
                # must be a no-op for points that already landed.
                skipped.append(n)
                continue
            src = BACKUP_DIR / n
            if not gzip_ok(src):
                failed.append(f"{n}:gzip_integrity")
                continue
            digest = sha256_file(src)
            enc = tmp / (n + ".gpg")
            # Public-key only: no private key material exists on this host.
            g = subprocess.run(
                ["gpg", "--homedir", str(GNUPGHOME), "--batch", "--yes", "--trust-model", "always",
                 "--compress-algo", "none", "--recipient", fpr,
                 "--output", str(enc), "--encrypt", str(src)],
                capture_output=True, text=True,
            )
            if g.returncode != 0 or not enc.exists():
                failed.append(f"{n}:encrypt")
                continue
            # copy only: never sync/move/delete. --ignore-existing and --immutable
            # both forbid overwriting an object that is already offsite.
            r = subprocess.run(
                [str(RCLONE), "--config", str(RCLONE_CONF), "copy", str(enc),
                 f"{remote}:{rpath}/db", "--no-traverse", "--immutable", "--ignore-existing",
                 "--transfers", "1", "--checkers", "2",
                 "--bwlimit", bwlimit, "--tpslimit", tpslimit,
                 "--low-level-retries", "3", "--retries", "2"],
                capture_output=True, text=True,
            )
            if r.returncode != 0:
                failed.append(f"{n}:upload")
                continue
            uploaded.append((n, enc.stat().st_size, digest, sha256_file(enc)))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    status = "failed" if failed and not uploaded else ("partial" if failed else "ok")
    lines = [
        f"status={status}", f"at={stamp}",
        f"mode={'automated' if automated else 'interactive'}",
        f"precondition={why}",
        f"selected={len(sel)}", f"uploaded={len(uploaded)}",
        f"skipped_already_offsite={len(skipped)}", f"failed={len(failed)}",
        f"failures={','.join(failed) if failed else 'none'}",
        f"remote={remote}:{rpath}/db",
        f"bwlimit={bwlimit} tpslimit={tpslimit}",
        "local_backups_modified=no", "remote_deletions=no", "remote_overwrites=no",
    ]
    for n in skipped:
        lines.append(f"skipped={n}")
    for n, size, psha, esha in uploaded:
        lines.append(f"point={n} encrypted_bytes={size} plaintext_sha256={psha} encrypted_sha256={esha}")
    write_status(lines)
    return 0 if status == "ok" else 1


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--self-check", action="store_true")
    ap.add_argument("--plan", action="store_true")
    ap.add_argument("--run", action="store_true")
    ap.add_argument("--confirm-upload", action="store_true")
    ap.add_argument("--automated", action="store_true",
                    help="systemd-only path; refused unless the service identity verifies")
    a = ap.parse_args()
    if a.self_check:
        return self_check()
    cfg = load_config()
    if a.run:
        return run(cfg, a.confirm_upload, a.automated)
    return plan(cfg)


if __name__ == "__main__":
    sys.exit(main())
