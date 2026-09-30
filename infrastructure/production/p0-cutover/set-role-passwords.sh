#!/usr/bin/env bash
# LearnBox Admin P0 (LB-B30) - set the three database-role passwords on Production, securely.
#
#   * Runs in YOUR terminal. Nothing you type is echoed, logged, or sent to the chat.
#   * Press ENTER at a prompt to have a strong random password generated for you instead
#     (recommended: then nobody, including you, ever needs to know it).
#   * Neon accepts only plaintext in ALTER ROLE (it rejects SCRAM verifiers), so the password travels
#     over SSH+TLS on stdin only (never argv, never a log) and Neon hashes it.
#   * The plaintext is stored once, on the server, in a mode-600 file the services read
#     (/home/ubuntu/learnbox/secrets/db-roles.env). The existing learner/Admin env files are NOT touched.
#   * It then proves each role can log in, and prints only non-secret confirmations.
set -euo pipefail
HOST="${LB_SSH_HOST:-learnbox-prod}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DRYRUN="${LB_DRYRUN:-0}"
ROLES=(learnbox_migrator learnbox_app learnbox_admin)
declare -a PW

gen() { python3 -c 'import secrets;print(secrets.token_urlsafe(30).replace("=",""))'; }

for r in "${ROLES[@]}"; do
  while :; do
    printf 'Password for %s (input hidden; ENTER = generate a random one): ' "$r"
    IFS= read -r -s v; printf '\n'
    if [ -z "$v" ]; then v="$(gen)"; echo "  -> generated (not displayed)"; fi
    if [[ "$v" =~ ^[A-Za-z0-9_-]{24,128}$ ]]; then break; fi
    echo "  Must be 24-128 characters of A-Z a-z 0-9 _ - only (so it is URL-safe). Try again."
  done
  PW+=("$v")
done
if [ "${PW[0]}" = "${PW[1]}" ] || [ "${PW[0]}" = "${PW[2]}" ] || [ "${PW[1]}" = "${PW[2]}" ]; then
  echo "The three passwords must all be different. Aborting; nothing was changed."; exit 1
fi


# Ship the remote script first (no secrets in it), then feed values on stdin only.
ssh "$HOST" 'cat > /tmp/lb_set_role_pw.sh && chmod 700 /tmp/lb_set_role_pw.sh' <<'REMOTE'
set -euo pipefail
umask 077
DRY="${1:-0}"
IFS= read -r P_MIG; IFS= read -r P_APP; IFS= read -r P_ADM
for x in "$P_MIG" "$P_APP" "$P_ADM"; do [ -n "$x" ] || { echo "empty input"; exit 2; }; done
APP_ENV=/home/ubuntu/learnbox/app/.env
OUT_DIR=/home/ubuntu/learnbox/secrets
OUT="$OUT_DIR/db-roles.env"
if [ "$DRY" = 1 ]; then OUT_DIR=/tmp/lb-dryrun-secrets; OUT="$OUT_DIR/db-roles.env"; fi
mkdir -p "$OUT_DIR"; chmod 700 "$OUT_DIR"
OWNER_URL="$(grep -E '^DATABASE_URL=' "$APP_ENV" | cut -d= -f2-)"
TAIL="${OWNER_URL#*@}"                         # host/db?params of the current DSN (credentials stripped)
[ -n "$TAIL" ] && [ "$TAIL" != "$OWNER_URL" ] || { echo "cannot derive host from current DSN"; exit 3; }
if [ "$DRY" != 1 ]; then
  printf '%s\n%s\n%s\n' \
    "BEGIN;" \
    "ALTER ROLE learnbox_migrator PASSWORD '$P_MIG'; ALTER ROLE learnbox_app PASSWORD '$P_APP'; ALTER ROLE learnbox_admin PASSWORD '$P_ADM';" \
    "COMMIT;" \
  | docker run --rm -i -e PGURL="$OWNER_URL" postgres:17-alpine sh -c 'psql "$PGURL" -v ON_ERROR_STOP=1 -q -f -' >/dev/null
fi
[ -f "$OUT" ] && cp -p "$OUT" "$OUT.bak-$(date -u +%Y%m%dT%H%M%SZ)"
tmp="$(mktemp)"; trap 'rm -f "$tmp"' EXIT
{
  echo "LEARNBOX_MIGRATOR_DATABASE_URL=postgresql://learnbox_migrator:${P_MIG}@${TAIL}"
  echo "LEARNBOX_APP_DATABASE_URL=postgresql://learnbox_app:${P_APP}@${TAIL}"
  echo "LEARNBOX_ADMIN_DATABASE_URL=postgresql://learnbox_admin:${P_ADM}@${TAIL}"
} > "$tmp"
install -m 600 "$tmp" "$OUT"
echo "stored: $(grep -oE '^[A-Z_]+' "$OUT" | tr '\n' ' ')"
echo "file mode: $(stat -c '%a %U' "$OUT"), dir mode: $(stat -c '%a' "$OUT_DIR")"
if [ "$DRY" != 1 ]; then
  for k in LEARNBOX_MIGRATOR_DATABASE_URL LEARNBOX_APP_DATABASE_URL LEARNBOX_ADMIN_DATABASE_URL; do
    url="$(grep -E "^$k=" "$OUT" | cut -d= -f2-)"
    who="$(docker run --rm -e PGURL="$url" postgres:17-alpine sh -c 'psql "$PGURL" -Atc "select current_user"' 2>&1 | tail -1)"
    echo "login check $k -> ${who}"
  done
fi
REMOTE

printf '%s\n%s\n%s\n' "${PW[0]}" "${PW[1]}" "${PW[2]}" \
  | ssh "$HOST" "bash /tmp/lb_set_role_pw.sh $DRYRUN; rc=\$?; rm -f /tmp/lb_set_role_pw.sh; exit \$rc"
unset PW v
echo "Done. Tell Hermes 'passwords set'. Do not paste any password anywhere."
