#!/usr/bin/env python3
"""LearnBox card-media offsite copy (encrypted, copy-only, append-only).

Card media files are immutable (migration 0061), so offsite is append-only: each run packs only the
files not yet recorded in the manifest into one tar, encrypts it to the same public key as the DB
offsite copy, and uploads it with rclone `copy --immutable --ignore-existing`. Nothing is ever
deleted or overwritten, locally or remotely. The manifest is updated only after a successful upload.

  --plan   (default) list what would be uploaded
  --run    encrypt + upload (requires the learnbox-media-offsite systemd unit or --confirm-upload)

Restore: download every media-*.tar.gpg, decrypt with the offline private key, extract in name order
into the media root, then run card-media-files.mjs verify.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import os
import subprocess
import sys
import tarfile
import tempfile
from pathlib import Path

OFFSITE = Path("/home/ubuntu/learnbox/offsite")
MEDIA_ROOT = Path("/home/ubuntu/learnbox/media")
SUBTREE = "card-media/admin/card-media"
MANIFEST = OFFSITE / "state" / "media-manifest.txt"
STATUS = OFFSITE / "state" / "media-offsite.status"
GNUPGHOME = OFFSITE / "gnupg"
RCLONE = OFFSITE / "bin" / "rclone"
RCLONE_CONF = OFFSITE / "config" / "rclone.conf"
WORKDIR = OFFSITE / "tmp"
FPR = "FF1C441D77781F99F2ABADE4A4CAE7A288970289"  # same pinned recipient as the DB offsite copy
REMOTE = "dropbox:learnbox-iran/media"


def current_files() -> list[str]:
    base = MEDIA_ROOT / SUBTREE
    if not base.is_dir():
        return []
    out = []
    for p in base.rglob("*"):
        if p.is_file() and ".tmp-" not in p.name:
            out.append(str(p.relative_to(MEDIA_ROOT)))
    return sorted(out)


def manifest() -> set[str]:
    return set(MANIFEST.read_text().split()) if MANIFEST.exists() else set()


def status(lines: list[str]) -> None:
    STATUS.write_text("\n".join(lines) + "\n")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", action="store_true")
    ap.add_argument("--confirm-upload", action="store_true")
    a = ap.parse_args()
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    new = [f for f in current_files() if f not in manifest()]
    size = sum((MEDIA_ROOT / f).stat().st_size for f in new)
    print(f"new_files={len(new)} new_bytes={size} manifest={len(manifest())}")
    if not a.run:
        return 0
    in_unit = "learnbox-media-offsite.service" in Path("/proc/self/cgroup").read_text()
    if not (in_unit or a.confirm_upload):
        print("REFUSED: run from learnbox-media-offsite.service or pass --confirm-upload", file=sys.stderr)
        return 2
    if not new:
        status(["status=ok", f"at={stamp}", "uploaded_files=0", f"manifest={len(manifest())}"])
        return 0
    WORKDIR.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(dir=WORKDIR, prefix="media.") as tmp:
        tar = Path(tmp) / f"media-{stamp}.tar"
        with tarfile.open(tar, "w") as t:
            for f in new:
                t.add(MEDIA_ROOT / f, arcname=f, recursive=False)
        # Prove the archive holds exactly the intended files before it leaves the host.
        with tarfile.open(tar) as t:
            if sorted(m.name for m in t.getmembers()) != sorted(new):
                status(["status=failed", f"at={stamp}", "reason=archive_mismatch"])
                return 1
        enc = tar.with_suffix(".tar.gpg")
        g = subprocess.run(["gpg", "--homedir", str(GNUPGHOME), "--batch", "--yes", "--trust-model", "always",
                            "--compress-algo", "none", "--recipient", FPR, "--output", str(enc), "--encrypt", str(tar)],
                           capture_output=True, text=True)
        if g.returncode != 0 or not enc.exists():
            status(["status=failed", f"at={stamp}", "reason=encrypt"])
            return 1
        r = subprocess.run([str(RCLONE), "--config", str(RCLONE_CONF), "copy", str(enc), REMOTE, "--no-traverse",
                            "--immutable", "--ignore-existing", "--transfers", "1", "--bwlimit", "2M",
                            "--tpslimit", "4", "--low-level-retries", "3", "--retries", "2"],
                           capture_output=True, text=True)
        if r.returncode != 0:
            status(["status=failed", f"at={stamp}", "reason=upload", f"files={len(new)}"])
            return 1
        digest = hashlib.sha256(enc.read_bytes()).hexdigest()
        with MANIFEST.open("a") as m:
            m.write("".join(f + "\n" for f in new))
        status(["status=ok", f"at={stamp}", f"uploaded_files={len(new)}", f"plaintext_bytes={size}",
                f"archive={enc.name}", f"encrypted_sha256={digest}", f"manifest={len(manifest())}",
                f"remote={REMOTE}", "remote_deletions=no", "remote_overwrites=no"])
        print(f"uploaded {enc.name} files={len(new)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
