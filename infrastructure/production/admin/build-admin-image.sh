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
#
# The default target is the Admin image. LEARNBOX_IMAGE_TARGET=app builds the learner app image
# through the same provenance and verification path, so neither image is built by hand.
#
# The commit normally must exist in this checkout and must be given in full. The single, pinned
# Iran bridge is the exception: it validates one preserved digest from self-contained non-secret
# evidence, so it remains runnable from a shallow release checkout.
#
# This script BUILDS AND VERIFIES ONLY. It never tags an image as `production`, never writes a
# compose file, never touches a registry and never restarts a container. Deploying the result is a
# separate, owner-authorised step.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$REPO_ROOT"

SOURCE_SHA="${1:-}"
TAG_SUFFIX="${2:-candidate}"
RELEASE_PREFLIGHT="${LEARNBOX_RELEASE_PREFLIGHT:-false}"

if [ "$RELEASE_PREFLIGHT" != true ] && [ "$RELEASE_PREFLIGHT" != false ]; then
  echo "build-admin-image: LEARNBOX_RELEASE_PREFLIGHT must be true or false" >&2
  exit 2
fi

if ! [[ "$SOURCE_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "build-admin-image: need a full 40-character commit SHA, got '${SOURCE_SHA:-<none>}'" >&2
  exit 2
fi
TARGET="${LEARNBOX_IMAGE_TARGET:-admin}"
case "$TARGET" in
  admin) APP_DIR=apps/admin ;;
  app) APP_DIR=apps/website ;;
  *) echo "build-admin-image: LEARNBOX_IMAGE_TARGET must be admin or app, got '$TARGET'" >&2; exit 2 ;;
esac

# This bridge is intentionally the only source-free preflight path. It is pinned to one baseline,
# one candidate digest and its six non-secret values, so it remains usable from a shallow release
# checkout without turning an unknown artifact into an approved release.
BRIDGE_FILE="$REPO_ROOT/infrastructure/production/app/release-baselines/iran-app-87490d60.env"
BRIDGE_MATRIX=false
if [ "$RELEASE_PREFLIGHT" = true ] && [ "$TARGET" = app ] && [ -r "$BRIDGE_FILE" ]; then
  # shellcheck disable=SC1090
  . "$BRIDGE_FILE"
  if [ "$SOURCE_SHA" = "$CANDIDATE_SOURCE_SHA" ] \
    && [ "${LEARNBOX_CANDIDATE_IMAGE:-}" = "$CANDIDATE_IMAGE" ]; then
    BRIDGE_MATRIX=true
  fi
fi

if [ "$BRIDGE_MATRIX" != true ] && ! git cat-file -e "${SOURCE_SHA}^{commit}" 2>/dev/null; then
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
  # Ordinary builds use the exact source matrix. The one-time bridge carries the same six values
  # alongside exact digest/source evidence so preflight can validate an existing image from a
  # shallow release checkout without accepting any other unknown source.
  if [ "$BRIDGE_MATRIX" = true ]; then
    for flag in $APP_FLAGS; do
      name="NEXT_PUBLIC_LEARNBOX_$flag"
      bridge_name="BASELINE_$flag"
      value="${!bridge_name:-}"
      if [ "$value" != true ] && [ "$value" != false ]; then
        echo "build-admin-image: $bridge_name in $BRIDGE_FILE must be true or false" >&2; exit 2
      fi
      printf -v "$name" '%s' "$value"
      FLAG_ARGS+=(--build-arg "$name=$value")
    done
  else
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
  fi
else
  FLAG_ARGS+=(--build-arg "NEXT_PUBLIC_LEARNBOX_ADMIN_PASSKEY_UI_ENABLED=$PASSKEY_UI")
fi

IMAGE_TAG="learnbox-$TARGET:${SOURCE_SHA:0:7}-${TAG_SUFFIX}"
IMAGE_REF="$IMAGE_TAG"
BUILT_IMAGE=false

if [ "$RELEASE_PREFLIGHT" = true ]; then
  if [ "$TARGET" != app ]; then
    echo "build-admin-image: release preflight currently verifies the learner app only" >&2
    exit 2
  fi
  if [ -z "${LEARNBOX_CANDIDATE_IMAGE:-}" ] || [ -z "${LEARNBOX_RUNNING_CONTAINER:-}" ]; then
    echo "build-admin-image: release preflight needs LEARNBOX_CANDIDATE_IMAGE and LEARNBOX_RUNNING_CONTAINER" >&2
    exit 2
  fi
  if [ -n "${LEARNBOX_RUNNING_IMAGE:-}" ]; then
    echo "build-admin-image: LEARNBOX_RUNNING_IMAGE is not accepted for release preflight; use the running container" >&2
    exit 2
  fi
  IMAGE_REF="$LEARNBOX_CANDIDATE_IMAGE"
  echo "build-admin-image: release preflight only; existing image $IMAGE_REF will not be rebuilt"
else
  # Build from the commit, not the working tree. A dirty checkout is a normal state during release
  # preparation and must not be able to leak into a candidate.
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
  BUILT_IMAGE=true
fi

echo
if [ "$RELEASE_PREFLIGHT" = true ]; then
  echo "build-admin-image: verifying an existing release artifact"
else
  echo "build-admin-image: verifying a development artifact"
fi

checks=0; failures=0
check() {
  checks=$((checks + 1))
  if [ "$2" = "$3" ]; then printf 'ok   %-62s %s\n' "$1" "$3"
  else failures=$((failures + 1)); printf 'FAIL %-62s expected=%s actual=%s\n' "$1" "$2" "$3"; fi
}

inspect() { docker image inspect "$IMAGE_REF" --format "$1"; }
image_env() { inspect '{{range .Config.Env}}{{println .}}{{end}}' | grep -E "^$1=" | cut -d= -f2- || true; }
image_label() { docker image inspect "$1" --format "{{index .Config.Labels \"$2\"}}" 2>/dev/null || true; }
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

bundle_text() {
  docker run --rm --network none --platform "$PLATFORM" --entrypoint sh "$1" -c \
    'cat /app/apps/website/.next/static/chunks/app/page-*.js 2>/dev/null' || true
}
check_true_bundle_markers() {
  local image="$1" role="$2" bundle marker flag
  bundle="$(bundle_text "$image")"
  for flag in $APP_FLAGS; do
    case "$flag" in
      PROFILE_IDENTITY_ENABLED) marker='profileIdentityFlag:[A-Za-z_$]+="true"' ;;
      QUEUE_QUARANTINE) marker='\.\.\.\{quarantineKey:[A-Za-z_$]+\(t0\)\}' ;;
      SERVER_SESSION_PLAN) marker='JSON\.stringify\([A-Za-z_$]+\?\{nextCardIndex:[A-Za-z_$]+,nextCardId:[A-Za-z_$]+\}:\{nextCardIndex:[A-Za-z_$]+\}\)' ;;
      GOAL_UX_REMOVED) marker='goal:void 0' ;;
      SESSION_EXPIRY_UX) marker='sessionEnded&&1' ;;
      BINARY_REVIEW_UI) marker='binaryWire:!0' ;;
    esac
    check "$role bundle proves $flag=true" present \
      "$(printf '%s' "$bundle" | grep -Eq "$marker" && echo present || echo absent)"
  done
}

validate_release_baseline() {
  local running baseline_id candidate_id baseline_revision baseline_runtime label name bridge_name expected bridge
  if [ "$(docker container inspect "$LEARNBOX_RUNNING_CONTAINER" --format '{{.State.Running}}' 2>/dev/null || true)" != true ]; then
    echo "FAIL release baseline container must exist and be running" >&2
    failures=$((failures + 1)); checks=$((checks + 1)); return
  fi
  baseline_id="$(docker container inspect "$LEARNBOX_RUNNING_CONTAINER" --format '{{.Image}}' 2>/dev/null || true)"
  candidate_id="$(inspect '{{.Id}}' 2>/dev/null || true)"
  check "candidate reference resolves to its exact image digest" "$LEARNBOX_CANDIDATE_IMAGE" "$candidate_id"
  check "running container resolves to a complete image digest" sha256 \
    "$(printf '%s' "$baseline_id" | cut -d: -f1)"

  bridge="$REPO_ROOT/infrastructure/production/app/release-baselines/iran-app-87490d60.env"
  if [ -r "$bridge" ] && [ "$baseline_id" = "$(sed -n 's/^BASELINE_IMAGE=//p' "$bridge")" ]; then
    # shellcheck disable=SC1090
    . "$bridge"
    check "bridge candidate digest is exact" "$CANDIDATE_IMAGE" "$candidate_id"
    check "bridge candidate source is exact" "$CANDIDATE_SOURCE_SHA" "$SOURCE_SHA"
    check "bridge candidate architecture" "$BASELINE_ARCH" "$(inspect '{{.Architecture}}')"
    check "bridge candidate OS" "$BASELINE_OS" "$(inspect '{{.Os}}')"
    check "bridge baseline source label" "$BASELINE_SOURCE_SHA" \
      "$(image_label "$baseline_id" org.opencontainers.image.revision)"
    check "bridge baseline source runtime value" "$BASELINE_SOURCE_SHA" \
      "$(docker image inspect "$baseline_id" --format '{{range .Config.Env}}{{println .}}{{end}}' | grep '^APP_SOURCE_SHA=' | cut -d= -f2- || true)"
    check "bridge baseline architecture" "$BASELINE_ARCH" \
      "$(docker image inspect "$baseline_id" --format '{{.Architecture}}' 2>/dev/null || true)"
    check "bridge baseline OS" "$BASELINE_OS" \
      "$(docker image inspect "$baseline_id" --format '{{.Os}}' 2>/dev/null || true)"
    for flag in $APP_FLAGS; do
      name="NEXT_PUBLIC_LEARNBOX_$flag"
      bridge_name="BASELINE_$flag"
      expected="${!name}"
      check "bridge records $flag" "$expected" "${!bridge_name}"
      check "candidate $flag matches bridge" "$expected" "$(image_label "$candidate_id" "$(release_label "$flag")")"
    done
    check_true_bundle_markers "$baseline_id" baseline
    check_true_bundle_markers "$candidate_id" candidate
    return
  fi

  baseline_revision="$(image_label "$baseline_id" org.opencontainers.image.revision)"
  baseline_runtime="$(docker image inspect "$baseline_id" --format '{{range .Config.Env}}{{println .}}{{end}}' | grep '^APP_SOURCE_SHA=' | cut -d= -f2- || true)"
  if ! [[ "$baseline_revision" =~ ^[0-9a-f]{40}$ ]] || ! [[ "$baseline_runtime" =~ ^[0-9a-f]{40}$ ]]; then
    echo "FAIL running baseline has incomplete source provenance; no bridge applies" >&2
    failures=$((failures + 1)); checks=$((checks + 1))
  else
    check "running baseline source label matches runtime value" "$baseline_revision" "$baseline_runtime"
  fi
  check "running baseline architecture" amd64 "$(docker image inspect "$baseline_id" --format '{{.Architecture}}' 2>/dev/null || true)"
  check "running baseline OS" linux "$(docker image inspect "$baseline_id" --format '{{.Os}}' 2>/dev/null || true)"

  for flag in $APP_FLAGS; do
    name="NEXT_PUBLIC_LEARNBOX_$flag"
    label="$(release_label "$flag")"
    expected="$(image_label "$baseline_id" "$label")"
    if [ "$expected" != true ] && [ "$expected" != false ]; then
      echo "FAIL running baseline lacks comparable $label; no bridge applies" >&2
      failures=$((failures + 1)); checks=$((checks + 1))
    else
      check "running $label → candidate $label" "$expected" "$(image_label "$candidate_id" "$label")"
    fi
  done
}

# Provenance, from both sides: the label is readable without starting the container, the env var is
# readable from inside a running one. Both must name the commit that was asked for.
check "OCI label records the requested commit" "$SOURCE_SHA" \
  "$(inspect '{{index .Config.Labels "org.opencontainers.image.revision"}}')"
check "runtime APP_SOURCE_SHA records the requested commit" "$SOURCE_SHA" "$(image_env APP_SOURCE_SHA)"
check "image title is set" "learnbox-$TARGET" "$(inspect '{{index .Config.Labels "org.opencontainers.image.title"}}')"
if [ "$TARGET" = app ]; then
  # These labels are deliberately public and become the runnable image's comparable release record.
  # Verify every configured flag was baked into the artifact, rather than trusting the build command.
  for flag in $APP_FLAGS; do
    key="$(printf '%s' "$flag" | tr '[:upper:]' '[:lower:]')"
    key="$(printf '%s' "$key" | tr '_' '-')"
    label="io.learnbox.release.$key"
    # Labels use short keys for stable, readable release evidence.
    case "$label" in
      *profile-identity*) label=io.learnbox.release.profile_identity ;;
      *queue-quarantine*) label=io.learnbox.release.queue_quarantine ;;
      *server-session-plan*) label=io.learnbox.release.server_session_plan ;;
      *goal-ux-removed*) label=io.learnbox.release.goal_ux_removed ;;
      *session-expiry-ux*) label=io.learnbox.release.session_expiry_ux ;;
      *binary-review-ui*) label=io.learnbox.release.binary_review_ui ;;
    esac
    name="NEXT_PUBLIC_LEARNBOX_$flag"
    check "release label $label matches the approved matrix" "${!name}" "$(inspect "{{index .Config.Labels \"$label\"}}")"
  done
  if [ "$RELEASE_PREFLIGHT" = true ]; then
    validate_release_baseline
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
# The one-time bridge pins this non-secret package blob hash because it validates a preserved image
# without requiring its historical source tree to exist in a shallow checkout.
if [ "$BRIDGE_MATRIX" = true ]; then
  expected_pkg="${CANDIDATE_WEBSITE_PACKAGE_SHA:-}"
  if ! [[ "$expected_pkg" =~ ^[0-9a-f]{64}$ ]]; then
    echo "build-admin-image: $BRIDGE_FILE has no valid CANDIDATE_WEBSITE_PACKAGE_SHA" >&2; exit 2
  fi
else
  expected_pkg="$(git show "$SOURCE_SHA:$APP_DIR/package.json" | sha256sum | cut -d' ' -f1)"
fi
actual_pkg="$(docker run --rm --platform "$PLATFORM" --entrypoint sh "$IMAGE_REF" -c \
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
  # The one learner flag whose inlined value is readable verbatim in the client bundle. It proves
  # the requested flags reached the build (a stale cache or a dropped argument would show here).
  shipped_profile="$(docker run --rm --network none --platform "$PLATFORM" --entrypoint sh "$IMAGE_REF" -c \
    'cat /app/apps/website/.next/static/chunks/app/page-*.js 2>/dev/null' \
    | grep -oE 'profileIdentityFlag:[A-Za-z_$]+="(true|false)"' | head -1 | grep -oE 'true|false' || true)"
  check "shipped PROFILE_IDENTITY_ENABLED matches the requested value" \
    "$NEXT_PUBLIC_LEARNBOX_PROFILE_IDENTITY_ENABLED" "$shipped_profile"
else
rendered="$(docker run --rm --network none --platform "$PLATFORM" --entrypoint sh "$IMAGE_REF" -c \
  'cat /app/apps/admin/.next/server/app/index.html 2>/dev/null' || true)"
rendered_has() { printf '%s' "$rendered" | grep -cF -- "$1" || true; }

check "root page is prerendered into the image" present \
  "$([ -n "$rendered" ] && echo present || echo absent)"
check "shipped authentication mode is server-passkey" present \
  "$([ "$(rendered_has 'server-passkey')" != 0 ] && echo present || echo absent)"
check "shipped authentication mode cannot bypass the gate as local-prototype" absent \
  "$([ "$(rendered_has 'local-prototype')" = 0 ] && echo absent || echo present)"
fi

DIGEST="$(inspect '{{.Id}}')"
echo
echo "build-admin-image: image id      $DIGEST"
echo "build-admin-image: size          $(inspect '{{.Size}}') bytes"
echo

if [ "$failures" -eq 0 ]; then
  if [ "$RELEASE_PREFLIGHT" = true ]; then
    echo "RELEASE ARTIFACT: APPROVED ($checks checks)"
    echo "  candidate $DIGEST"
    echo "  baseline  $(docker container inspect "$LEARNBOX_RUNNING_CONTAINER" --format '{{.Image}}')"
    echo "  commit    $SOURCE_SHA"
    echo
    echo "Not deployed. Deployment requires separate owner authorisation."
  else
    echo "$(echo "$TARGET" | tr a-z A-Z) DEVELOPMENT IMAGE CANDIDATE: VERIFIED ($checks checks; not release-approved)"
    echo "  tag    $IMAGE_TAG"
    echo "  id     $DIGEST"
    echo "  commit $SOURCE_SHA"
    echo
    echo "Not deployed. Run release preflight against a running Production baseline before release approval."
  fi
else
  echo "$(echo "$TARGET" | tr a-z A-Z) IMAGE CANDIDATE: REJECTED ($failures of $checks checks)" >&2
  if [ "$BUILT_IMAGE" = true ]; then
    docker image rm -f "$IMAGE_TAG" >/dev/null 2>&1 || true
  fi
  exit 1
fi
