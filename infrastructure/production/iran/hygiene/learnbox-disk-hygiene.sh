#!/usr/bin/env bash
# LearnBox weekly disk hygiene for the Iran Production host.
#
# Removes only rebuildable leftovers of past releases. DRY-RUN unless LEARNBOX_HYGIENE_APPLY=1.
#   * learnbox-* images: keeps every image any container uses (running or stopped), every digest pinned
#     in a compose file or its newest backup, and the KEEP_IMAGES newest per repository.
#     Removed by tag/ID without force, so Docker itself refuses anything still referenced.
#   * Docker build cache unused for 7 days (this host only loads images built elsewhere).
#   * Image transfer tars older than 7 days.
#   * Nightly DB dumps: grandfather-father-son 7 daily + 4 weekly + 3 monthly; newest always kept.
#   * Pre-migration dump directories: newest 3 kept.
# Never touched: running containers, volumes, the database, Caddy, secrets, compose files, evidence.
# Aborts before deleting anything when a LearnBox container is unhealthy or a backup/offsite/deploy runs.
set -euo pipefail

ROOT="${LEARNBOX_ROOT:-/home/ubuntu/learnbox}"
APPLY="${LEARNBOX_HYGIENE_APPLY:-0}"
KEEP_IMAGES="${LEARNBOX_HYGIENE_KEEP_IMAGES:-3}"
STATE="$ROOT/ops/state/hygiene.status"
ALERT="$ROOT/ops/learnbox-alert.sh"
mode=$([ "$APPLY" = 1 ] && echo apply || echo dry-run)

log() { echo "[$mode] $*"; }
act() { # act <description> <command...>
  log "REMOVE $1"
  if [ "$APPLY" = 1 ]; then "${@:2}" || log "SKIP (refused) $1"; fi
}
fail() {
  log "ABORT: $*"
  printf 'result=aborted\nreason=%s\nat=%s\n' "$*" "$(date -u +%FT%TZ)" >"$STATE"
  exit 1
}

REQUIRED="app-production-app admin-production-admin production-landing production-caddy db-postgres"
healthy() {
  local running name
  running=$(docker ps --filter name=learnbox --format '{{.Names}} {{.Status}}')
  for name in $REQUIRED; do
    grep -q "learnbox-$name-1 Up" <<<"$running" || { echo "missing: $name"; return 1; }
  done
  ! grep -E 'unhealthy|starting' <<<"$running"
}

# --- Preconditions ---------------------------------------------------------------------------
for unit in learnbox-backup.service learnbox-offsite.service; do
  ! systemctl is-active --quiet "$unit" || fail "$unit is running"
done
! pgrep -f 'docker (load|compose|build)' >/dev/null || fail "a deploy (docker load/compose/build) is running"
healthy || fail "LearnBox containers not healthy before start"
before=$(df -P / | awk 'NR==2{print $5}')

# --- Images ----------------------------------------------------------------------------------
protected=$(
  {
    docker ps -aq | xargs -r docker inspect --format '{{.Image}}'
    for dir in "$ROOT/app" "$ROOT/admin"; do
      # Current pins plus the newest compose backup = the one-step rollback target.
      newest_backup=$(ls -t "$dir"/compose.yaml.* 2>/dev/null | head -1 || true)
      grep -hoE 'sha256:[a-f0-9]{64}' "$dir/compose.yaml" ${newest_backup:+"$newest_backup"} 2>/dev/null || true
    done
  } | sort -u
)
docker images --no-trunc --format '{{.Repository}}' | grep '^learnbox-' | sort -u | while read -r repo; do
  docker images --no-trunc --filter "reference=$repo" --format '{{.ID}}' | awk '!s[$0]++' |
    while read -r id; do
      created=$(docker image inspect --format '{{.Created}}' "$id")
      echo "$created $id"
    done | sort -r | awk '{print $2}' | tail -n +"$((KEEP_IMAGES + 1))" |
    while read -r id; do
      grep -qx "$id" <<<"$protected" && { log "KEEP $repo $id (in use or pinned)"; continue; }
      mapfile -t tags < <(docker image inspect --format '{{range .RepoTags}}{{println .}}{{end}}' "$id" | sed '/^$/d')
      # An ID also tagged under another repository is that repository's business, not ours.
      if [ "${#tags[@]}" -gt 0 ] && printf '%s\n' "${tags[@]}" | grep -qv "^$repo:"; then log "KEEP $id (shared tag)"; continue; fi
      if [ "${#tags[@]}" -gt 0 ]; then act "$repo $id ${tags[*]}" docker rmi "${tags[@]}"
      else act "$repo $id (untagged)" docker rmi "$id"; fi
    done
done

# --- Build cache -----------------------------------------------------------------------------
log "build cache older than 7 days: $(docker system df --format '{{.Type}} {{.Size}}' | grep 'Build Cache' || true)"
if [ "$APPLY" = 1 ]; then docker builder prune -f --filter until=168h >/dev/null; fi

# --- Transfer tars ---------------------------------------------------------------------------
find "$ROOT/ops" "$ROOT/releases" "$ROOT/release-evidence" -maxdepth 2 -type f \
  \( -name '*.tar' -o -name '*.tar.gz' -o -name '*.tar.sha256' -o -name '*.tar.gz.sha256' \) -mtime +7 \
  2>/dev/null | while read -r f; do act "$f ($(du -h "$f" | cut -f1))" rm -f -- "$f"; done

# --- Nightly DB dumps: GFS 7/4/3 -------------------------------------------------------------
python3 - "$ROOT/backups" <<'PY' | while read -r f; do act "$f" rm -f -- "$f"; done
import datetime as dt, pathlib, re, sys
files = sorted(pathlib.Path(sys.argv[1]).glob('learnbox-*.sql.gz'), reverse=True)
stamp = lambda p: dt.datetime.strptime(re.search(r'(\d{8}T\d{6}Z)', p.name).group(1), '%Y%m%dT%H%M%SZ')
keep, seen = set(), {}
for key, n in ((lambda t: t.date(), 7), (lambda t: t.isocalendar()[:2], 4), (lambda t: (t.year, t.month), 3)):
    buckets = []
    for p in files:  # newest first: the first file of each bucket is that bucket's newest
        k = key(stamp(p))
        if k not in buckets:
            buckets.append(k)
            if len(buckets) <= n: keep.add(p)
keep.add(files[0]) if files else None
for p in files:
    if p not in keep: print(p)
PY

# --- Pre-migration dump directories: newest 3 ------------------------------------------------
find "$ROOT/backups" -maxdepth 1 -mindepth 1 -type d -name 'pre-0*' -printf '%T@ %p\n' | sort -rn |
  tail -n +4 | cut -d' ' -f2- | while read -r d; do act "$d ($(du -sh "$d" | cut -f1))" rm -rf -- "$d"; done

# --- After -----------------------------------------------------------------------------------
sleep 5
healthy || { [ -x "$ALERT" ] && "$ALERT" critical "LearnBox disk hygiene: container unhealthy after run" || true; fail "unhealthy after run"; }
after=$(df -P / | awk 'NR==2{print $5}')
log "disk used before=$before after=$after"
printf 'result=ok\nmode=%s\nbefore=%s\nafter=%s\nat=%s\n' "$mode" "$before" "$after" "$(date -u +%FT%TZ)" >"$STATE"
if [ "${after%\%}" -ge 75 ] && [ -x "$ALERT" ]; then
  "$ALERT" warn "LearnBox disk at $after" "Weekly hygiene ran ($mode); disk still at or above 75%." || true
fi
