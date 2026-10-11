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
# values are different images. The default matches the value the live Production image was built
# with, so a rebuild of the same commit is comparable to it.
PASSKEY_UI="${NEXT_PUBLIC_LEARNBOX_ADMIN_PASSKEY_UI_ENABLED:-false}"

IMAGE_TAG="learnbox-admin:${SOURCE_SHA:0:7}-${TAG_SUFFIX}"

# Build from the commit, not the working tree. A dirty checkout is a normal state during release
# preparation and must not be able to leak into a candidate.
BUILD_DIR="$(mktemp -d)"
cleanup() { rm -rf "$BUILD_DIR"; }
trap cleanup EXIT
git archive --format=tar "$SOURCE_SHA" | tar -x -C "$BUILD_DIR"

echo "build-admin-image: commit        $SOURCE_SHA"
echo "build-admin-image: tree          $(git rev-parse "$SOURCE_SHA^{tree}")"
echo "build-admin-image: passkey UI    $PASSKEY_UI (inlined into the client bundle)"
echo "build-admin-image: tag           $IMAGE_TAG"
echo "build-admin-image: builder arch  $(docker info --format '{{.OSType}}/{{.Architecture}}')"
echo

docker build \
  --file "$BUILD_DIR/infrastructure/production/admin/Dockerfile" \
  --build-arg "APP_SOURCE_SHA=$SOURCE_SHA" \
  --build-arg "NEXT_PUBLIC_LEARNBOX_ADMIN_PASSKEY_UI_ENABLED=$PASSKEY_UI" \
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
check "image title is set" "learnbox-admin" "$(inspect '{{index .Config.Labels "org.opencontainers.image.title"}}')"
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
check "entrypoint is the Admin server" "[node apps/admin/server.js]" "$(inspect '{{.Config.Cmd}}')"

# The commit really is in the image: compare a file from the built bundle against the commit's blob.
# This catches a build that succeeded against a stale cache layer from a different commit.
expected_pkg="$(git show "$SOURCE_SHA:apps/admin/package.json" | sha256sum | cut -d' ' -f1)"
actual_pkg="$(docker run --rm --entrypoint sh "$IMAGE_TAG" -c \
  'sha256sum /app/apps/admin/package.json 2>/dev/null | cut -d" " -f1' || true)"
check "apps/admin/package.json in the image matches the commit" "$expected_pkg" "$actual_pkg"

DIGEST="$(inspect '{{.Id}}')"
echo
echo "build-admin-image: image id      $DIGEST"
echo "build-admin-image: size          $(inspect '{{.Size}}') bytes"
echo

if [ "$failures" -eq 0 ]; then
  echo "ADMIN IMAGE CANDIDATE: VERIFIED ($checks checks)"
  echo "  tag    $IMAGE_TAG"
  echo "  id     $DIGEST"
  echo "  commit $SOURCE_SHA"
  echo
  echo "Not deployed. Deployment requires separate owner authorisation."
else
  echo "ADMIN IMAGE CANDIDATE: REJECTED ($failures of $checks checks)" >&2
  docker image rm -f "$IMAGE_TAG" >/dev/null 2>&1 || true
  exit 1
fi
