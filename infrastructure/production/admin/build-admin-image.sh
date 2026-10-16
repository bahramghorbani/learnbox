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
# The commit must exist in this checkout and must be given in full: a short SHA would be recorded in
# the image as a short SHA, and provenance that cannot be compared byte for byte is not provenance.
#
# This script BUILDS AND VERIFIES ONLY. It never tags an image as `production`, never writes a
# compose file, never touches a registry and never restarts a container. Deploying the result is a
# separate, owner-authorised step.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
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

# The Production host is linux/amd64. Build for it explicitly: on an arm64 workstation the default
# platform is arm64, and such an image starts and then dies on exec format in Production.
PLATFORM=linux/amd64

# Learner app client flags. Like the passkey flag they are inlined at build time, and the Dockerfile
# and compose.yaml defaults have drifted from what Production runs (Production has binary review
# on, which both default to off). So every flag must be stated for the build; none is defaulted.
APP_FLAGS="PROFILE_IDENTITY_ENABLED QUEUE_QUARANTINE SERVER_SESSION_PLAN GOAL_UX_REMOVED SESSION_EXPIRY_UX BINARY_REVIEW_UI"
FLAG_ARGS=(--build-arg "APP_SOURCE_SHA=$SOURCE_SHA")
if [ "$TARGET" = app ]; then
  for flag in $APP_FLAGS; do
    name="NEXT_PUBLIC_LEARNBOX_$flag"; value="${!name:-}"
    if [ "$value" != true ] && [ "$value" != false ]; then
      echo "build-admin-image: $name must be set to 'true' or 'false' for an app image, got '${value:-<unset>}'" >&2
      echo "build-admin-image: copy the values from the image currently in Production; do not rely on defaults." >&2
      exit 2
    fi
    FLAG_ARGS+=(--build-arg "$name=$value")
  done
else
  FLAG_ARGS+=(--build-arg "NEXT_PUBLIC_LEARNBOX_ADMIN_PASSKEY_UI_ENABLED=$PASSKEY_UI")
fi

IMAGE_TAG="learnbox-$TARGET:${SOURCE_SHA:0:7}-${TAG_SUFFIX}"

# Build from the commit, not the working tree. A dirty checkout is a normal state during release
# preparation and must not be able to leak into a candidate.
BUILD_DIR="$(mktemp -d)"
cleanup() { rm -rf "$BUILD_DIR"; }
trap cleanup EXIT
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

echo
echo "build-admin-image: verifying the artifact"

checks=0; failures=0
check() {
  checks=$((checks + 1))
  if [ "$2" = "$3" ]; then printf 'ok   %-62s %s\n' "$1" "$3"
  else failures=$((failures + 1)); printf 'FAIL %-62s expected=%s actual=%s\n' "$1" "$2" "$3"; fi
}

inspect() { docker image inspect "$IMAGE_TAG" --format "$1"; }
image_env() { inspect '{{range .Config.Env}}{{println .}}{{end}}' | grep -E "^$1=" | cut -d= -f2- || true; }

# Provenance, from both sides: the label is readable without starting the container, the env var is
# readable from inside a running one. Both must name the commit that was asked for.
check "OCI label records the requested commit" "$SOURCE_SHA" \
  "$(inspect '{{index .Config.Labels "org.opencontainers.image.revision"}}')"
check "runtime APP_SOURCE_SHA records the requested commit" "$SOURCE_SHA" "$(image_env APP_SOURCE_SHA)"
check "image title is set" "learnbox-$TARGET" "$(inspect '{{index .Config.Labels "org.opencontainers.image.title"}}')"
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
actual_pkg="$(docker run --rm --entrypoint sh "$IMAGE_TAG" -c \
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
  shipped_profile="$(docker run --rm --network none --entrypoint sh "$IMAGE_TAG" -c \
    'cat /app/apps/website/.next/static/chunks/app/page-*.js 2>/dev/null' \
    | grep -oE 'profileIdentityFlag:[A-Za-z_$]+="(true|false)"' | head -1 | grep -oE 'true|false' || true)"
  check "shipped PROFILE_IDENTITY_ENABLED matches the requested value" \
    "$NEXT_PUBLIC_LEARNBOX_PROFILE_IDENTITY_ENABLED" "$shipped_profile"
else
rendered="$(docker run --rm --network none --entrypoint sh "$IMAGE_TAG" -c \
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
  echo "$(echo "$TARGET" | tr a-z A-Z) IMAGE CANDIDATE: VERIFIED ($checks checks)"
  echo "  tag    $IMAGE_TAG"
  echo "  id     $DIGEST"
  echo "  commit $SOURCE_SHA"
  echo
  echo "Not deployed. Deployment requires separate owner authorisation."
else
  echo "$(echo "$TARGET" | tr a-z A-Z) IMAGE CANDIDATE: REJECTED ($failures of $checks checks)" >&2
  docker image rm -f "$IMAGE_TAG" >/dev/null 2>&1 || true
  exit 1
fi
