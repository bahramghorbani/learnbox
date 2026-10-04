#!/usr/bin/env bash
# Binds the local/staging Admin owner to a canonical users.id row.
#
# Migration 0016 deliberately leaves admin_owner.user_id NULL: the owner stays fail-closed until a
# canonical users.id is explicitly bound by an owner-controlled operation. Passkey bootstrap creates
# the owner and its credential but never performs that binding, so a freshly bootstrapped Admin can
# sign in and still receive 401 from every data route (loadAdminSession rejects a NULL user_id).
#
# This script performs only that binding, for the local HTTPS review environment. It is NOT a
# Production tool: it refuses any database that is not the isolated staging database.
set -euo pipefail

if [[ -z "${LEARNBOX_ADMIN_STAGING_DATABASE_URL:-}" ]]; then
  echo "LEARNBOX_ADMIN_STAGING_DATABASE_URL is required." >&2
  exit 1
fi

DSN="${LEARNBOX_ADMIN_STAGING_DATABASE_URL}"

# Fail closed on anything that is not the isolated staging database.
if [[ "${DSN}" != *"learnbox_stage_rehearsal"* ]]; then
  echo "Refusing to run: DSN does not point at learnbox_stage_rehearsal (staging)." >&2
  exit 1
fi
if [[ "${DSN}" == *"185.204.168.178"* || "${DSN}" == *"ep-jolly-hill"* ]]; then
  echo "Refusing to run against Production." >&2
  exit 1
fi

USER_ID="${1:-}"
if [[ -z "${USER_ID}" ]]; then
  echo "Usage: bind-local-owner.sh <canonical users.id uuid>" >&2
  echo "Available staging users:" >&2
  docker run --rm postgres:17-alpine psql "${DSN}" -X -A -t \
    -c "SELECT id FROM users ORDER BY created_at;" >&2
  exit 1
fi

# Same write-once guard as PostgresOwnerAuthStore.bindOwnerToUser: binds only while user_id IS NULL,
# so re-running can never silently repoint the owner at a different learner.
docker run --rm postgres:17-alpine psql "${DSN}" -X -A -t -v ON_ERROR_STOP=1 \
  -c "UPDATE admin_owner
         SET user_id = '${USER_ID}'::uuid, updated_at = now()
       WHERE singleton_id = 1 AND user_id IS NULL
   RETURNING 'bound=' || user_id;"

docker run --rm postgres:17-alpine psql "${DSN}" -X -A -t \
  -c "SELECT 'admin_owner.user_id=' || COALESCE(user_id::text, 'NULL') FROM admin_owner;"

# The content-review routes additionally require a role assignment for the canonical actor
# (content_reviewer or super_admin); without it listReviewQueue returns 'forbidden' -> 404.
docker run --rm postgres:17-alpine psql "${DSN}" -X -A -t -v ON_ERROR_STOP=1 \
  -c "INSERT INTO admin_role_assignments (user_id, role, assigned_at)
      VALUES ('${USER_ID}'::uuid, 'super_admin', now())
      ON CONFLICT DO NOTHING;"

docker run --rm postgres:17-alpine psql "${DSN}" -X -A -t \
  -c "SELECT 'role=' || role FROM admin_role_assignments WHERE user_id = '${USER_ID}'::uuid;"
