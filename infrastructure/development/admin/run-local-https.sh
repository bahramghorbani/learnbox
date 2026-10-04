#!/usr/bin/env bash
#
# Local HTTPS Admin for development review (LB-B36 Phase A).
#
# Why this exists: the Admin auth policy requires an exact HTTPS origin whose hostname equals
# LEARNBOX_ADMIN_RP_ID, so Admin cannot be reviewed over plain http://localhost. `localhost` IS a
# WebAuthn secure context, so a locally-trusted HTTPS cert on localhost satisfies both the policy
# and the browser with zero public exposure.
#
# What this does NOT do: it does not touch Production, it does not open a public port, and it does
# not create a parallel Admin. It runs the real Admin app, with the real auth stack, against an
# isolated Neon staging database.
#
# Usage:
#   export LEARNBOX_ADMIN_STAGING_DATABASE_URL='postgresql://...'   # isolated staging branch only
#   ./infrastructure/development/admin/run-local-https.sh
#
# The script refuses to start if the database URL looks like Production.

set -euo pipefail

PORT="${ADMIN_LOCAL_PORT:-3443}"
ORIGIN="https://localhost:${PORT}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
ADMIN_DIR="${REPO_ROOT}/apps/admin"

DB_URL="${LEARNBOX_ADMIN_STAGING_DATABASE_URL:-}"
if [[ -z "${DB_URL}" ]]; then
  echo "ERROR: LEARNBOX_ADMIN_STAGING_DATABASE_URL is not set." >&2
  echo "Set it to the ISOLATED staging database URL (never Production)." >&2
  exit 1
fi

# --- Production guard -------------------------------------------------------------------------
# The Production endpoint and database must never be reachable from this script. Fail closed.
PRODUCTION_ENDPOINT="ep-jolly-hill-asbffbzx"
if [[ "${DB_URL}" == *"${PRODUCTION_ENDPOINT}"* ]]; then
  echo "ERROR: refusing to start — that URL points at the Production endpoint." >&2
  exit 1
fi
if [[ "${DB_URL}" != *"learnbox_stage_rehearsal"* ]]; then
  echo "ERROR: refusing to start — expected the isolated staging database" >&2
  echo "       (learnbox_stage_rehearsal). Got a different database name." >&2
  exit 1
fi

# --- Bootstrap secret ------------------------------------------------------------------------
# Only needed the first time, to enrol the owner passkey. Generated locally if absent; it is never
# printed to a shared channel. Enrol once, then unset it so /bootstrap closes again.
BOOTSTRAP_ENABLED="${LEARNBOX_ADMIN_BOOTSTRAP_ENABLED:-false}"
BOOTSTRAP_SECRET="${LEARNBOX_ADMIN_BOOTSTRAP_SECRET:-}"
if [[ "${BOOTSTRAP_ENABLED}" == "true" && -z "${BOOTSTRAP_SECRET}" ]]; then
  echo "ERROR: bootstrap is enabled but LEARNBOX_ADMIN_BOOTSTRAP_SECRET is empty." >&2
  echo "       Generate one privately, e.g.: openssl rand -base64 32" >&2
  exit 1
fi

# Token hash key: stable across restarts so sessions survive a reload, local-only.
KEY_FILE="${HOME}/.learnbox/admin-local-token-hash.key"
if [[ ! -f "${KEY_FILE}" ]]; then
  mkdir -p "$(dirname "${KEY_FILE}")"
  openssl rand -hex 32 > "${KEY_FILE}"
  chmod 600 "${KEY_FILE}"
fi
TOKEN_HASH_KEY="$(cat "${KEY_FILE}")"

# --- Local TLS certificate --------------------------------------------------------------------
# Next's own `--experimental-https` downloads mkcert and needs a sudo password, which makes it
# unusable unattended (and it silently falls back to plain HTTP when it fails — which would break
# the WebAuthn origin requirement without saying so). Generate the cert ourselves instead and pass
# it explicitly, so HTTPS either works or the server refuses to start.
TLS_DIR="${HOME}/.learnbox/admin-local-tls"
TLS_KEY="${TLS_DIR}/localhost-key.pem"
TLS_CERT="${TLS_DIR}/localhost-cert.pem"
if [[ ! -f "${TLS_KEY}" || ! -f "${TLS_CERT}" ]]; then
  echo "Generating a local TLS certificate for localhost…"
  mkdir -p "${TLS_DIR}"
  cat > "${TLS_DIR}/req.cnf" <<'CERTCONF'
[req]
distinguished_name = dn
x509_extensions = v3
prompt = no
[dn]
CN = localhost
[v3]
subjectAltName = DNS:localhost,IP:127.0.0.1
basicConstraints = critical,CA:FALSE
keyUsage = critical,digitalSignature,keyEncipherment
extendedKeyUsage = serverAuth
CERTCONF
  openssl req -x509 -newkey rsa:2048 -nodes -days 365 \
    -keyout "${TLS_KEY}" -out "${TLS_CERT}" -config "${TLS_DIR}/req.cnf" >/dev/null 2>&1
  chmod 600 "${TLS_KEY}"
fi

echo "LearnBox Admin — local HTTPS review server"
echo "  origin:   ${ORIGIN}"
echo "  rpId:     localhost"
echo "  database: isolated staging (learnbox_stage_rehearsal)"
echo "  bootstrap:${BOOTSTRAP_ENABLED}"
echo
echo "Production is untouched and Admin remains public-404."
echo

cd "${ADMIN_DIR}"

# `--experimental-https-key/-cert` use the certificate generated above, so no download or sudo
# prompt is needed and the server cannot silently downgrade to HTTP.
LEARNBOX_ADMIN_PASSKEY_ENABLED=true \
NEXT_PUBLIC_LEARNBOX_ADMIN_PASSKEY_UI_ENABLED=true \
LEARNBOX_ADMIN_ORIGIN="${ORIGIN}" \
LEARNBOX_ADMIN_RP_ID="localhost" \
LEARNBOX_ADMIN_TOKEN_HASH_KEY="${TOKEN_HASH_KEY}" \
LEARNBOX_ADMIN_CONTENT_REVIEW_ENABLED="${LEARNBOX_ADMIN_CONTENT_REVIEW_ENABLED:-true}" \
LEARNBOX_ADMIN_BOOTSTRAP_ENABLED="${BOOTSTRAP_ENABLED}" \
LEARNBOX_ADMIN_BOOTSTRAP_SECRET="${BOOTSTRAP_SECRET}" \
LEARNBOX_ADMIN_LEGACY_ROUTES_ENABLED="${LEARNBOX_ADMIN_LEGACY_ROUTES_ENABLED:-false}" \
DATABASE_URL="${DB_URL}" \
NODE_ENV=development \
exec "${REPO_ROOT}/node_modules/.bin/next" dev \
  --experimental-https \
  --experimental-https-key "${TLS_KEY}" \
  --experimental-https-cert "${TLS_CERT}" \
  --hostname 127.0.0.1 \
  --port "${PORT}"
