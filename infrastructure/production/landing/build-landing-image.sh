#!/usr/bin/env bash
# Build the Landing image from one committed source tree and prove its provenance.
# Usage: build-landing-image.sh <full-40-char-commit> [tag-suffix]
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$REPO_ROOT"

SOURCE_SHA="${1:-}"
TAG_SUFFIX="${2:-candidate}"
PLATFORM=linux/amd64

if ! [[ "$SOURCE_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "build-landing-image: need a full 40-character commit SHA" >&2
  exit 2
fi
if ! git cat-file -e "${SOURCE_SHA}^{commit}" 2>/dev/null; then
  echo "build-landing-image: $SOURCE_SHA is not a commit in this repository" >&2
  exit 2
fi

BUILD_DIR="$(mktemp -d)"
cleanup() { rm -rf "$BUILD_DIR"; }
trap cleanup EXIT

git archive --format=tar "$SOURCE_SHA" | tar -x -C "$BUILD_DIR"
IMAGE_REF="learnbox-landing:${SOURCE_SHA:0:12}-${TAG_SUFFIX}"

docker build \
  --platform "$PLATFORM" \
  --file "$BUILD_DIR/infrastructure/production/landing/Dockerfile" \
  --build-arg "APP_SOURCE_SHA=$SOURCE_SHA" \
  --tag "$IMAGE_REF" \
  "$BUILD_DIR"

inspect() { docker image inspect "$IMAGE_REF" --format "$1"; }
image_env() {
  inspect '{{range .Config.Env}}{{println .}}{{end}}' | grep '^APP_SOURCE_SHA=' | cut -d= -f2- || true
}
check() {
  if [ "$2" != "$3" ]; then
    echo "FAIL $1: expected=$2 actual=$3" >&2
    exit 1
  fi
  printf 'ok   %-56s %s\n' "$1" "$3"
}

check "OCI revision" "$SOURCE_SHA" "$(inspect '{{index .Config.Labels "org.opencontainers.image.revision"}}')"
check "runtime source" "$SOURCE_SHA" "$(image_env)"
check "image title" "learnbox-landing" "$(inspect '{{index .Config.Labels "org.opencontainers.image.title"}}')"
check "architecture" "amd64" "$(inspect '{{.Architecture}}')"
check "operating system" "linux" "$(inspect '{{.Os}}')"
check "runtime user" "nextjs" "$(inspect '{{.Config.User}}')"
check "entrypoint" "[node apps/learnbox-website/server.js]" "$(inspect '{{.Config.Cmd}}')"

expected_package="$(git show "$SOURCE_SHA:apps/learnbox-website/package.json" | sha256sum | cut -d' ' -f1)"
actual_package="$(docker run --rm --network none --platform "$PLATFORM" --entrypoint sh "$IMAGE_REF" -c 'sha256sum /app/apps/learnbox-website/package.json | cut -d" " -f1')"
check "package manifest matches source" "$expected_package" "$actual_package"

if [ "$(image_env)" = unknown ]; then
  echo "FAIL source provenance must not be unknown" >&2
  exit 1
fi

echo "LANDING IMAGE VERIFIED"
echo "  image  $(inspect '{{.Id}}')"
echo "  source $SOURCE_SHA"
