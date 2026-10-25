#!/usr/bin/env bash
# Uses preserved local artifacts only; it never builds, deploys, or starts a Production service.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
BUILD="$REPO_ROOT/infrastructure/production/admin/build-admin-image.sh"
CONTROL_SHA="$(git -C "$REPO_ROOT" rev-parse HEAD)"
SOURCE_SHA=a7f582647e0297c04dcf2e967989e39ffd38df9c
APP_CANDIDATE=sha256:d327590ca12e919dfff5f2d45394cb909b890a51422092c222ed569900517971
APP_BASELINE=sha256:87490d60978e83cff664df31e5820ff47fb085d41754c8f666b0a6d7e82355d5
APP_WRONG_BASELINE=sha256:175daeb8a23542d6a1201483a2de928ed54b98c4b6d8840f8c9e1b0688783cc2
ADMIN_CANDIDATE=sha256:34685a08a9660ffbe25ac0ce81c39ec5b000a14030b5d116e64d3f209fb1ec1e
ADMIN_BASELINE=sha256:ba7cfcf5e7c2bb843807e91b50e933e14db9d610c13d511ec82f5f4f2562386c

for image in "$APP_CANDIDATE" "$APP_BASELINE" "$APP_WRONG_BASELINE" "$ADMIN_CANDIDATE" "$ADMIN_BASELINE"; do
  docker image inspect "$image" >/dev/null
 done

app_fixture="release-gate-app-test-$$"
wrong_fixture="release-gate-wrong-test-$$"
admin_fixture="release-gate-admin-test-$$"
cleanup() {
  docker rm -f "$app_fixture" "$wrong_fixture" "$admin_fixture" >/dev/null 2>&1 || true
}
trap cleanup EXIT
start_fixture() {
  docker run --platform linux/amd64 -d --rm --name "$1" \
    --label "com.docker.compose.project=$3" --label "com.docker.compose.service=$4" \
    --entrypoint sh "$2" -c 'sleep 180' >/dev/null
}
expect_failure() {
  local output
  if output=$("$@" 2>&1); then
    printf 'expected failure, got success:\n%s\n' "$output" >&2
    exit 1
  fi
}

# A usable image without the release-only inputs is explicitly non-releasable.
output=$(LEARNBOX_IMAGE_TARGET=app LEARNBOX_VALIDATE_IMAGE="$APP_CANDIDATE" "$BUILD" "$SOURCE_SHA" 2>&1)
printf '%s' "$output" | grep -F 'NOT RELEASE-APPROVED' >/dev/null

# Approval needs an exact reviewed control revision and cannot accept a caller-supplied baseline.
expect_failure env LEARNBOX_IMAGE_TARGET=app LEARNBOX_RELEASE_APPROVAL=true \
  LEARNBOX_VALIDATE_IMAGE="$APP_CANDIDATE" "$BUILD" "$SOURCE_SHA"
expect_failure env LEARNBOX_IMAGE_TARGET=app LEARNBOX_RELEASE_APPROVAL=true \
  LEARNBOX_RELEASE_CONTROL_SHA="$SOURCE_SHA" LEARNBOX_VALIDATE_IMAGE="$APP_CANDIDATE" \
  "$BUILD" "$SOURCE_SHA"
expect_failure env LEARNBOX_IMAGE_TARGET=app LEARNBOX_RELEASE_APPROVAL=true \
  LEARNBOX_RELEASE_CONTROL_SHA="$CONTROL_SHA" LEARNBOX_VALIDATE_IMAGE="$APP_CANDIDATE" "$BUILD" "$SOURCE_SHA"
expect_failure env LEARNBOX_IMAGE_TARGET=app LEARNBOX_RELEASE_APPROVAL=true \
  LEARNBOX_RELEASE_CONTROL_SHA="$CONTROL_SHA" LEARNBOX_VALIDATE_IMAGE="$APP_CANDIDATE" \
  LEARNBOX_RUNNING_IMAGE="$APP_BASELINE" "$BUILD" "$SOURCE_SHA"

start_fixture "$app_fixture" "$APP_BASELINE" learnbox-app-production app
output=$(LEARNBOX_IMAGE_TARGET=app LEARNBOX_RELEASE_APPROVAL=true \
  LEARNBOX_RELEASE_CONTROL_SHA="$CONTROL_SHA" LEARNBOX_VALIDATE_IMAGE="$APP_CANDIDATE" "$BUILD" "$SOURCE_SHA" 2>&1)
printf '%s' "$output" | grep -F 'APP RELEASE APPROVAL: VERIFIED' >/dev/null
printf '%s' "$output" | grep -F "product source $SOURCE_SHA" >/dev/null
printf '%s' "$output" | grep -F "control source $CONTROL_SHA" >/dev/null
docker rm -f "$app_fixture" >/dev/null

# A different, unlabeled legacy image cannot inherit the exact 87490d60 bridge.
start_fixture "$wrong_fixture" "$APP_WRONG_BASELINE" learnbox-app-production app
expect_failure env LEARNBOX_IMAGE_TARGET=app LEARNBOX_RELEASE_APPROVAL=true \
  LEARNBOX_RELEASE_CONTROL_SHA="$CONTROL_SHA" LEARNBOX_VALIDATE_IMAGE="$APP_CANDIDATE" "$BUILD" "$SOURCE_SHA"

start_fixture "$admin_fixture" "$ADMIN_BASELINE" learnbox-admin-production admin
NEXT_PUBLIC_LEARNBOX_ADMIN_PASSKEY_UI_ENABLED=true LEARNBOX_RELEASE_APPROVAL=true \
  LEARNBOX_RELEASE_CONTROL_SHA="$CONTROL_SHA" LEARNBOX_VALIDATE_IMAGE="$ADMIN_CANDIDATE" "$BUILD" "$SOURCE_SHA" \
  | grep -F 'ADMIN RELEASE APPROVAL: VERIFIED' >/dev/null

printf 'release image validation integration test: PASS\n'
