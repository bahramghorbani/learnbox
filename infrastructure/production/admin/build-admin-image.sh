#!/usr/bin/env bash
# Reproducible Admin image build with embedded provenance (N3).
#
# WHY THIS EXISTS
# ---------------
# The Admin Dockerfile already records its source commit, as both the OCI label
# org.opencontainers.image.revision and the runtime env var APP_SOURCE_SHA. What was missing is the
# build itself: the image serving Production was produced by hand, which is why nothing in the
# repository states which commit it came from, and why the readback has to be trusted rather than
# reproduced. A hand-run `docker build` also silently defaults APP_SOURCE_SHA to "unknown" when the
# argument is forgotten, and bakes whatever happens to be in the working tree.
#
# This script removes all three problems: it builds from `git archive <commit>` so an uncommitted
# edit cannot reach the image, it passes the commit as a build argument, and it refuses to hand back
# an image whose recorded revision is not the commit asked for.
#
# USAGE
#   build-admin-image.sh <full-40-char-commit> [tag-suffix]
#   LEARNBOX_IMAGE_TARGET=app build-admin-image.sh <full-40-char-commit> [tag-suffix]
#   LEARNBOX_VALIDATE_IMAGE=sha256:... build-admin-image.sh <full-40-char-commit>
#
# The default target is the Admin image. LEARNBOX_IMAGE_TARGET=app builds the learner app image
# through the same provenance and verification path, so neither image is built by hand. Supplying
# LEARNBOX_VALIDATE_IMAGE skips the build and validates that exact existing image instead.
#
# A normal build/validation is useful for development and test evidence but is never release approval.
# Release approval is an explicit, fail-closed operation:
#   LEARNBOX_RELEASE_APPROVAL=true LEARNBOX_VALIDATE_IMAGE=sha256:... \
#   build-admin-image.sh <full-40-char-commit>
# It derives the baseline from the one currently running Iran Production compose service at validation
# time; a result cannot be reused after an artifact or baseline change.
#
# The commit must exist in this checkout and must be given in full: a short SHA would be recorded in
# the image as a short SHA, and provenance that cannot be compared byte for byte is not provenance.
#
# This script BUILDS AND VERIFIES ONLY. It never tags an image as `production`, never writes a
# compose file, never touches a registry and never restarts a container. Deploying the result is a
# separate, owner-authorised step.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
CONTROL_SCRIPT_PATH="infrastructure/production/admin/build-admin-image.sh"
cd "$REPO_ROOT"

SOURCE_SHA="${1:-}"
TAG_SUFFIX="${2:-candidate}"

if ! [[ "$SOURCE_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "build-admin-image: need a full 40-character commit SHA, got '${SOURCE_SHA:-<none>}'" >&2
  exit 2
fi
if ! git cat-file -e "${SOURCE_SHA}^{commit}" 2>/dev/null; then
  echo "build-admin-image: $SOURCE_SHA is not a commit in this repository" >&2
  exit 2
fi

# The build-time public flag. Next.js inlines NEXT_PUBLIC_* into the client bundle, so it is part of
# the artifact's identity, not of its configuration: two images built from one commit with different
# values are different images, and no runtime environment variable can change the value an image
# already carries.
#
# It is therefore required rather than defaulted. Built as anything but "true", resolveAdminAuthMode()
# returns 'local-prototype', and AdminAuthGate then renders the workspace as already signed in
# without ever calling /api/auth/session or offering the passkey prompt. A default would make that
# the quiet consequence of forgetting one variable, so this script fails closed instead.
PASSKEY_UI="${NEXT_PUBLIC_LEARNBOX_ADMIN_PASSKEY_UI_ENABLED:-}"
if [ "${LEARNBOX_IMAGE_TARGET:-admin}" = admin ]; then
if [ "$PASSKEY_UI" != "true" ]; then
  echo "build-admin-image: NEXT_PUBLIC_LEARNBOX_ADMIN_PASSKEY_UI_ENABLED must be exactly 'true'" >&2
  echo "build-admin-image: for a production Admin image, got '${PASSKEY_UI:-<unset>}'." >&2
  echo "build-admin-image: a lower value ships an Admin that signs itself in without a passkey." >&2
  exit 2
fi
fi

TARGET="${LEARNBOX_IMAGE_TARGET:-admin}"
case "$TARGET" in
  admin) APP_DIR=apps/admin ;;
  app) APP_DIR=apps/website ;;
  *) echo "build-admin-image: LEARNBOX_IMAGE_TARGET must be admin or app, got '$TARGET'" >&2; exit 2 ;;
esac

VALIDATE_IMAGE="${LEARNBOX_VALIDATE_IMAGE:-}"
RELEASE_APPROVAL="${LEARNBOX_RELEASE_APPROVAL:-false}"
RELEASE_CONTROL_SHA="${LEARNBOX_RELEASE_CONTROL_SHA:-}"
case "$RELEASE_APPROVAL" in
  true|false) ;;
  *) echo "build-admin-image: LEARNBOX_RELEASE_APPROVAL must be true or false" >&2; exit 2 ;;
esac

# SOURCE_SHA binds the product baked into the candidate. RELEASE_CONTROL_SHA independently binds
# this validator. Approval refuses a later main checkout whose control script differs from the
# explicitly recorded reviewed revision.
if [ "$RELEASE_APPROVAL" = true ]; then
  if ! [[ "$RELEASE_CONTROL_SHA" =~ ^[0-9a-f]{40}$ ]]; then
    echo "build-admin-image: release approval needs LEARNBOX_RELEASE_CONTROL_SHA as a full 40-character commit SHA" >&2
    exit 2
  fi
  if ! git cat-file -e "${RELEASE_CONTROL_SHA}^{commit}" 2>/dev/null; then
    echo "build-admin-image: release control commit $RELEASE_CONTROL_SHA is not available in this repository" >&2
    exit 2
  fi
  declared_control_hash="$(git show "$RELEASE_CONTROL_SHA:$CONTROL_SCRIPT_PATH" | shasum -a 256 | cut -d' ' -f1)"
  executing_control_hash="$(shasum -a 256 "${BASH_SOURCE[0]}" | cut -d' ' -f1)"
  if [ "$declared_control_hash" != "$executing_control_hash" ]; then
    echo "build-admin-image: executing validator does not match LEARNBOX_RELEASE_CONTROL_SHA=$RELEASE_CONTROL_SHA" >&2
    exit 2
  fi
fi

case "$TARGET" in
  app)
    PRODUCTION_PROJECT=learnbox-app-production
    PRODUCTION_SERVICE=app
    ;;
  admin)
    PRODUCTION_PROJECT=learnbox-admin-production
    PRODUCTION_SERVICE=admin
    ;;
esac
if [ "$RELEASE_APPROVAL" = true ] && [ -z "$VALIDATE_IMAGE" ]; then
  echo "build-admin-image: release approval validates an existing exact image; set LEARNBOX_VALIDATE_IMAGE" >&2
  exit 2
fi
if [ "$RELEASE_APPROVAL" = true ] && [ -n "${LEARNBOX_RUNNING_IMAGE:-}" ]; then
  echo "build-admin-image: release approval derives its baseline from the running Production service; do not set LEARNBOX_RUNNING_IMAGE" >&2
  exit 2
fi
if [ "$RELEASE_APPROVAL" = true ] && ! [[ "$VALIDATE_IMAGE" =~ ^sha256:[0-9a-f]{64}$ ]]; then
  echo "build-admin-image: release approval requires an immutable sha256 candidate reference" >&2
  exit 2
fi

# The Production host is linux/amd64. Build for it explicitly: on an arm64 workstation the default
# platform is arm64, and such an image starts and then dies on exec format in Production.
PLATFORM=linux/amd64

# Build from the commit, not the working tree. Create this before reading the app matrix because the
# matrix itself is part of the exact source tree to be built.
BUILD_DIR="$(mktemp -d)"
cleanup() { rm -rf "$BUILD_DIR"; }
trap cleanup EXIT

# Learner app client flags. Like the passkey flag they are inlined at build time, and the Dockerfile
# and compose.yaml defaults have drifted from what Production runs (Production has binary review
# on, which both default to off). So every flag must be stated for the build; none is defaulted.
APP_FLAGS="PROFILE_IDENTITY_ENABLED QUEUE_QUARANTINE SERVER_SESSION_PLAN GOAL_UX_REMOVED SESSION_EXPIRY_UX BINARY_REVIEW_UI"
FLAG_ARGS=(--build-arg "APP_SOURCE_SHA=$SOURCE_SHA")
if [ "$TARGET" = app ]; then
  # One tracked non-secret matrix, read from the SAME commit being built. Direct environment
  # overrides are rejected: relying on Dockerfile/compose defaults hid the profile in a release.
  APP_RELEASE_CONFIG="infrastructure/production/app/release-build.env"
  if ! git cat-file -e "$SOURCE_SHA:$APP_RELEASE_CONFIG" 2>/dev/null; then
    echo "build-admin-image: $APP_RELEASE_CONFIG is missing from $SOURCE_SHA" >&2; exit 2
  fi
  config_file="$BUILD_DIR/release-build.env"
  git show "$SOURCE_SHA:$APP_RELEASE_CONFIG" > "$config_file"
  set -a; . "$config_file"; set +a
  for flag in $APP_FLAGS; do
    name="NEXT_PUBLIC_LEARNBOX_$flag"; value="${!name:-}"
    if [ "$value" != true ] && [ "$value" != false ]; then
      echo "build-admin-image: $name in $APP_RELEASE_CONFIG must be true or false" >&2; exit 2
    fi
    FLAG_ARGS+=(--build-arg "$name=$value")
  done
else
  FLAG_ARGS+=(--build-arg "NEXT_PUBLIC_LEARNBOX_ADMIN_PASSKEY_UI_ENABLED=$PASSKEY_UI")
fi

IMAGE_TAG="learnbox-$TARGET:${SOURCE_SHA:0:7}-${TAG_SUFFIX}"
IMAGE_REF="$IMAGE_TAG"

# Build from the commit, not the working tree. A dirty checkout is a normal state during release
# preparation and must not be able to leak into a candidate. Existing images are never rebuilt just
# to validate them: their digest remains the subject of the approval.
if [ -n "$VALIDATE_IMAGE" ]; then
  IMAGE_REF="$VALIDATE_IMAGE"
  if ! docker image inspect "$IMAGE_REF" >/dev/null 2>&1; then
    echo "build-admin-image: LEARNBOX_VALIDATE_IMAGE is not available locally: $IMAGE_REF" >&2
    exit 2
  fi
  echo "build-admin-image: validating existing image $IMAGE_REF (no build)"
else
  git archive --format=tar "$SOURCE_SHA" | tar -x -C "$BUILD_DIR"

  echo "build-admin-image: commit        $SOURCE_SHA"
  echo "build-admin-image: tree          $(git rev-parse "$SOURCE_SHA^{tree}")"
  echo "build-admin-image: target        $TARGET ($PLATFORM)"
  echo "build-admin-image: build args    ${FLAG_ARGS[*]}"
  echo "build-admin-image: tag           $IMAGE_TAG"
  echo "build-admin-image: builder arch  $(docker info --format '{{.OSType}}/{{.Architecture}}')"
  echo

  docker build \
    --platform "$PLATFORM" \
    --file "$BUILD_DIR/infrastructure/production/$TARGET/Dockerfile" \
    "${FLAG_ARGS[@]}" \
    --tag "$IMAGE_TAG" \
    "$BUILD_DIR"
fi

echo
printf 'build-admin-image: source commit %s\n' "$SOURCE_SHA"
printf 'build-admin-image: target        %s (%s)\n' "$TARGET" "$PLATFORM"
printf 'build-admin-image: image         %s\n' "$IMAGE_REF"
echo "build-admin-image: verifying the artifact"

checks=0; failures=0
check() {
  checks=$((checks + 1))
  if [ "$2" = "$3" ]; then printf 'ok   %-62s %s\n' "$1" "$3"
  else failures=$((failures + 1)); printf 'FAIL %-62s expected=%s actual=%s\n' "$1" "$2" "$3"; fi
}

inspect() { docker image inspect "$IMAGE_REF" --format "$1"; }
image_env() { inspect '{{range .Config.Env}}{{println .}}{{end}}' | grep -E "^$1=" | cut -d= -f2- || true; }

# Provenance, from both sides: the label is readable without starting the container, the env var is
# readable from inside a running one. Both must name the commit that was asked for.
check "OCI label records the requested commit" "$SOURCE_SHA" \
  "$(inspect '{{index .Config.Labels "org.opencontainers.image.revision"}}')"
check "runtime APP_SOURCE_SHA records the requested commit" "$SOURCE_SHA" "$(image_env APP_SOURCE_SHA)"
check "image title is set" "learnbox-$TARGET" "$(inspect '{{index .Config.Labels "org.opencontainers.image.title"}}')"
release_label() {
  case "$1" in
    PROFILE_IDENTITY_ENABLED) printf '%s' io.learnbox.release.profile_identity ;;
    QUEUE_QUARANTINE) printf '%s' io.learnbox.release.queue_quarantine ;;
    SERVER_SESSION_PLAN) printf '%s' io.learnbox.release.server_session_plan ;;
    GOAL_UX_REMOVED) printf '%s' io.learnbox.release.goal_ux_removed ;;
    SESSION_EXPIRY_UX) printf '%s' io.learnbox.release.session_expiry_ux ;;
    BINARY_REVIEW_UI) printf '%s' io.learnbox.release.binary_review_ui ;;
  esac
}
legacy_baseline_value() {
  case "$1" in
    PROFILE_IDENTITY_ENABLED) printf '%s' "$LEARNBOX_LEGACY_PROFILE_IDENTITY" ;;
    QUEUE_QUARANTINE) printf '%s' "$LEARNBOX_LEGACY_QUEUE_QUARANTINE" ;;
    SERVER_SESSION_PLAN) printf '%s' "$LEARNBOX_LEGACY_SERVER_SESSION_PLAN" ;;
    GOAL_UX_REMOVED) printf '%s' "$LEARNBOX_LEGACY_GOAL_UX_REMOVED" ;;
    SESSION_EXPIRY_UX) printf '%s' "$LEARNBOX_LEGACY_SESSION_EXPIRY_UX" ;;
    BINARY_REVIEW_UI) printf '%s' "$LEARNBOX_LEGACY_BINARY_REVIEW_UI" ;;
  esac
}

if [ "$RELEASE_APPROVAL" = true ]; then
  running_containers="$(docker ps --filter "label=com.docker.compose.project=$PRODUCTION_PROJECT" \
    --filter "label=com.docker.compose.service=$PRODUCTION_SERVICE" --format '{{.ID}}' 2>/dev/null || true)"
  running_count="$(printf '%s\n' "$running_containers" | awk 'NF { count++ } END { print count + 0 }')"
  if [ "$running_count" -ne 1 ]; then
    checks=$((checks + 1)); failures=$((failures + 1))
    printf 'FAIL %-62s expected=one actual=%s\n' "one running Production $PRODUCTION_SERVICE container" "$running_count"
    running_id=""
    running_container=""
  else
    running_container="$(printf '%s\n' "$running_containers" | awk 'NF { print; exit }')"
    running_id="$(docker container inspect "$running_container" --format '{{.Image}}' 2>/dev/null || true)"
    candidate_id="$(inspect '{{.Id}}')"
    container_running="$(docker container inspect "$running_container" --format '{{.State.Running}}' 2>/dev/null || true)"
    check "candidate reference is its immutable image id" "$VALIDATE_IMAGE" "$candidate_id"
    check "Production baseline container is running now" true "$container_running"
    check "Production baseline image has an immutable id" sha256 "${running_id%%:*}"
  fi
fi

if [ "$TARGET" = app ]; then
  # These labels are deliberately public and become the runnable image's comparable release record.
  # Verify every configured flag was baked into the artifact, rather than trusting the build command.
  for flag in $APP_FLAGS; do
    label="$(release_label "$flag")"
    name="NEXT_PUBLIC_LEARNBOX_$flag"
    check "release label $label matches the approved matrix" "${!name}" "$(inspect "{{index .Config.Labels \"$label\"}}")"
  done

  if [ "$RELEASE_APPROVAL" = true ]; then
    baseline_file="infrastructure/production/app/iran-production-87490d60-release-baseline.env"
    # shellcheck disable=SC1090 -- tracked, non-secret exact bridge data
    . "$baseline_file"
    if [ "$running_id" = "$LEARNBOX_LEGACY_BASELINE_IMAGE" ]; then
      check "legacy bridge baseline digest" "$LEARNBOX_LEGACY_BASELINE_IMAGE" "$running_id"
      check "legacy bridge baseline source" "$LEARNBOX_LEGACY_BASELINE_SOURCE_SHA" \
        "$(docker image inspect "$running_id" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')"
      check "legacy bridge baseline architecture" "$LEARNBOX_LEGACY_BASELINE_ARCH" \
        "$(docker image inspect "$running_id" --format '{{.Architecture}}')"
      check "legacy bridge baseline OS" "$LEARNBOX_LEGACY_BASELINE_OS" \
        "$(docker image inspect "$running_id" --format '{{.Os}}')"
      for flag in $APP_FLAGS; do
        name="NEXT_PUBLIC_LEARNBOX_$flag"
        check "legacy bridge $flag → candidate matrix" "$(legacy_baseline_value "$flag")" "${!name}"
      done
      legacy_bundle="$(docker run --rm --network none --entrypoint sh "$running_id" -c \
        'cat /app/apps/website/.next/static/chunks/app/page-*.js 2>/dev/null' || true)"
      legacy_bundle_has() { printf '%s' "$legacy_bundle" | grep -qE "$1"; }
      check_legacy_bundle() {
        checks=$((checks + 1))
        if legacy_bundle_has "$2"; then printf 'ok   %-62s true\n' "$1"
        else failures=$((failures + 1)); printf 'FAIL %-62s expected=true actual=missing\n' "$1"; fi
      }
      check_legacy_bundle "legacy bundle PROFILE_IDENTITY_ENABLED marker" 'profileIdentityFlag:[A-Za-z_$]+="true"'
      check_legacy_bundle "legacy bundle QUEUE_QUARANTINE marker" 'quarantineKey:[A-Za-z_$][A-Za-z0-9_$]*\('
      check_legacy_bundle "legacy bundle SERVER_SESSION_PLAN marker" 'nextCardId:[A-Za-z_$][A-Za-z0-9_$]*\}'
      check_legacy_bundle "legacy bundle GOAL_UX_REMOVED marker" 'goal:void 0'
      check_legacy_bundle "legacy bundle SESSION_EXPIRY_UX marker" 'sessionEnded&&1'
      check_legacy_bundle "legacy bundle BINARY_REVIEW_UI marker" 'binaryWire:!0'
    else
      echo "build-admin-image: running-to-candidate public configuration diff"
      for flag in $APP_FLAGS; do
        label="$(release_label "$flag")"
        running="$(docker image inspect "$running_id" --format "{{index .Config.Labels \"$label\"}}" 2>/dev/null || true)"
        name="NEXT_PUBLIC_LEARNBOX_$flag"
        if [ "$running" != true ] && [ "$running" != false ]; then
          echo "FAIL running image lacks comparable $label; unknown baseline is not releasable" >&2
          failures=$((failures + 1)); checks=$((checks + 1))
        else
          check "running $label → candidate $label" "${!name}" "$running"
        fi
      done
    fi
  elif [ -n "${LEARNBOX_RUNNING_IMAGE:-}" ]; then
    echo "build-admin-image: running image supplied without LEARNBOX_RELEASE_APPROVAL=true; non-release validation only" >&2
  else
    echo "build-admin-image: no running baseline; DEVELOPMENT/TEST ONLY — NOT RELEASE-APPROVED" >&2
  fi
fi
check "provenance is not the forgotten-argument default" absent \
  "$([ "$(image_env APP_SOURCE_SHA)" = unknown ] && echo present || echo absent)"

# Architecture. The Production host is linux/amd64; an image built on an arm64 workstation starts
# and then dies on exec format, which looks like an application crash in the logs.
check "image architecture" "amd64" "$(inspect '{{.Architecture}}')"
check "image OS" "linux" "$(inspect '{{.Os}}')"

# An image must carry no credential. The runtime reads secrets from the environment at start, so
# anything secret-shaped baked into the layers is a leak that survives in every registry copy.
baked_secrets="$(inspect '{{range .Config.Env}}{{println .}}{{end}}' \
  | grep -ciE '^(DATABASE_URL|.*_SECRET|.*_TOKEN|.*API_KEY|.*PASSWORD|.*CREDENTIAL)=' || true)"
check "no secret-shaped variable baked into the image" 0 "$baked_secrets"

# The server must not run as root, and must be the Admin entrypoint rather than the learner's.
check "runs as the unprivileged build user" "nextjs" "$(inspect '{{.Config.User}}')"
check "entrypoint is the $TARGET server" "[node $APP_DIR/server.js]" "$(inspect '{{.Config.Cmd}}')"

# The commit really is in the image: compare a file from the built bundle against the commit's blob.
# This catches a build that succeeded against a stale cache layer from a different commit.
expected_pkg="$(git show "$SOURCE_SHA:$APP_DIR/package.json" | sha256sum | cut -d' ' -f1)"
actual_pkg="$(docker run --rm --entrypoint sh "$IMAGE_REF" -c \
  "sha256sum /app/$APP_DIR/package.json 2>/dev/null | cut -d' ' -f1" || true)"
check "$APP_DIR/package.json in the image matches the commit" "$expected_pkg" "$actual_pkg"

# The authentication mode the image will actually serve, read from the artifact's own rendered
# output. Everything above proves what the build was asked for; this proves what came out. Next
# prerenders the Admin root page during the build and serialises the gate's mode into that HTML, so
# the shipped mode is a fact on disk inside the image — not something to infer from a label, a build
# argument or a runtime variable, none of which can still influence it.
#
# A 'true' build renders only the gate's secure-sign-in check. A 'false' build renders the whole
# workspace instead, because AdminAuthGate short-circuits to signed-in for 'local-prototype'. So the
# mode must be present and its bypass counterpart must be absent.
if [ "$TARGET" = app ]; then
  # Each currently approved learner flag is true. Verify all six rendered semantics, not merely
  # labels or build arguments; an intentional false value needs an explicit validator update.
  shipped_bundle="$(docker run --rm --network none --entrypoint sh "$IMAGE_REF" -c \
    'cat /app/apps/website/.next/static/chunks/app/page-*.js 2>/dev/null' || true)"
  bundle_has() { printf '%s' "$shipped_bundle" | grep -qE "$1"; }
  check_bundle_true() {
    checks=$((checks + 1))
    if bundle_has "$2"; then printf 'ok   %-62s true\n' "$1"
    else failures=$((failures + 1)); printf 'FAIL %-62s expected=true actual=missing\n' "$1"; fi
  }
  check_bundle_true "shipped PROFILE_IDENTITY_ENABLED semantic marker" 'profileIdentityFlag:[A-Za-z_$]+="true"'
  check_bundle_true "shipped QUEUE_QUARANTINE semantic marker" 'quarantineKey:[A-Za-z_$][A-Za-z0-9_$]*\('
  check_bundle_true "shipped SERVER_SESSION_PLAN semantic marker" 'nextCardId:[A-Za-z_$][A-Za-z0-9_$]*\}'
  check_bundle_true "shipped GOAL_UX_REMOVED semantic marker" 'goal:void 0'
  check_bundle_true "shipped SESSION_EXPIRY_UX semantic marker" 'sessionEnded&&1'
  check_bundle_true "shipped BINARY_REVIEW_UI semantic marker" 'binaryWire:!0'
  for flag in $APP_FLAGS; do
    name="NEXT_PUBLIC_LEARNBOX_$flag"
    check "approved matrix supports shipped semantic proof for $flag" true "${!name}"
  done
else
rendered="$(docker run --rm --network none --entrypoint sh "$IMAGE_REF" -c \
  'cat /app/apps/admin/.next/server/app/index.html 2>/dev/null' || true)"
rendered_has() { printf '%s' "$rendered" | grep -cF -- "$1" || true; }

check "root page is prerendered into the image" present \
  "$([ -n "$rendered" ] && echo present || echo absent)"
check "shipped authentication mode is server-passkey" present \
  "$([ "$(rendered_has 'server-passkey')" != 0 ] && echo present || echo absent)"
check "shipped authentication mode cannot bypass the gate as local-prototype" absent \
  "$([ "$(rendered_has 'local-prototype')" = 0 ] && echo absent || echo present)"
if [ "$RELEASE_APPROVAL" = true ]; then
  running_rendered="$(docker run --rm --network none --entrypoint sh "$running_id" -c \
    'cat /app/apps/admin/.next/server/app/index.html 2>/dev/null' || true)"
  check "running Admin has server-passkey mode" present \
    "$([ "$(printf '%s' "$running_rendered" | grep -cF 'server-passkey' || true)" != 0 ] && echo present || echo absent)"
  check "running Admin cannot bypass as local-prototype" absent \
    "$([ "$(printf '%s' "$running_rendered" | grep -cF 'local-prototype' || true)" = 0 ] && echo absent || echo present)"
fi
fi

DIGEST="$(inspect '{{.Id}}')"
echo
echo "build-admin-image: image id      $DIGEST"
echo "build-admin-image: size          $(inspect '{{.Size}}') bytes"
echo

if [ "$failures" -eq 0 ]; then
  if [ "$RELEASE_APPROVAL" = true ]; then
    echo "$(echo "$TARGET" | tr a-z A-Z) RELEASE APPROVAL: VERIFIED ($checks checks)"
    echo "  candidate $DIGEST"
    echo "  baseline  $running_id (container $running_container)"
  else
    echo "$(echo "$TARGET" | tr a-z A-Z) IMAGE VALIDATION: VERIFIED — NOT RELEASE-APPROVED ($checks checks)"
    echo "  candidate $DIGEST"
  fi
  echo "  product source $SOURCE_SHA"
  if [ "$RELEASE_APPROVAL" = true ]; then
    echo "  control source $RELEASE_CONTROL_SHA"
  fi
  echo
  echo "Not deployed. Deployment requires separate owner authorisation."
else
  echo "$(echo "$TARGET" | tr a-z A-Z) IMAGE VALIDATION: REJECTED ($failures of $checks checks)" >&2
  if [ -z "$VALIDATE_IMAGE" ]; then docker image rm -f "$IMAGE_TAG" >/dev/null 2>&1 || true; fi
  exit 1
fi
