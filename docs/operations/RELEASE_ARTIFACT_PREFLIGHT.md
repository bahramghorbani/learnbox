# Release artifact preflight

This is the artifact section of the Production runbook. It does not authorize a deploy, migration, configuration change, bypass, or restart.

## Source of truth

- `infrastructure/production/app/release-build.env` is the approved, non-secret learner **build-time** matrix. It is read from the exact Git commit used to create the image. `NEXT_PUBLIC_*` values are compiled into the client and cannot be changed at runtime.
- Runtime configuration remains the deployed service's protected environment. Never copy secrets into the matrix, image labels, Git, or evidence.
- The artifact records the **product source SHA**, image digest, OS/architecture, and its public build matrix in OCI labels. Retain those values for the deployed image and the `.previous` rollback image in release evidence.
- Release approval also records a separate **control source SHA** through `LEARNBOX_RELEASE_CONTROL_SHA`. The validator hashes its executing file against that commit and fails if they differ, so a later `main` checkout cannot silently substitute altered approval logic for the reviewed control.
- `infrastructure/production/admin/build-admin-image.sh` is both the canonical builder and the existing-image validator. It never deploys, tags `production`, edits compose, or restarts a container.

## Historical bridge: `175da…` → `87490d…`

The earlier unlabeled image `sha256:175daeb8a23542d6a1201483a2de928ed54b98c4b6d8840f8c9e1b0688783cc2` was compared to `87490d…`: 63 of 64 normalized learner chunks matched, and the sole page hunk was `profileIdentityFlag: "false" → "true"`. This is historical evidence only; it is **not** a general allowance for unlabeled artifacts.

## Iran `87490d60…` legacy bridge

The active Production learner image is the exact legacy baseline recorded in `infrastructure/production/app/iran-production-87490d60-release-baseline.env`:

- digest `sha256:87490d60978e83cff664df31e5820ff47fb085d41754c8f666b0a6d7e82355d5`
- source `15e6783b8f3efed2dbf1de382161099fd8b0b7fe`
- `linux/amd64`
- Profile Identity, Queue Quarantine, Server Session Plan, Goal UX Removed, Session Expiry UX and Binary Review UI: all `true`

The six values were recovered from the real compiled Production bundle and corroborate the #429 bridge/matrix evidence. The validator accepts this bridge only when every identifier above matches; another unlabeled digest is rejected.

## Development or test validation

A build or validation without release-approval inputs is useful evidence only. It always prints `NOT RELEASE-APPROVED` and cannot be used as a deployment gate.

```bash
LEARNBOX_IMAGE_TARGET=app \
LEARNBOX_VALIDATE_IMAGE=sha256:<candidate> \
infrastructure/production/admin/build-admin-image.sh <full-source-sha>
```

`LEARNBOX_VALIDATE_IMAGE` verifies an existing image and never rebuilds it. The validator checks source provenance, architecture, package content, public labels and rendered client semantic markers. Current approved learner markers are all `true`; a future approved `false` value needs a matching deliberate validator change and owner decision rather than a silent fallback.

## Release approval immediately before a Production image switch

Run the validator **on the host that has the currently running Production service and the exact candidate image**, immediately before the image-switch command. Do not reuse old output or substitute a tag for a digest. The validator resolves exactly one running container from the immutable Iran Compose project/service labels; the operator cannot supply a stale baseline digest or arbitrary container name.

```bash
LEARNBOX_IMAGE_TARGET=app \
LEARNBOX_RELEASE_APPROVAL=true \
LEARNBOX_RELEASE_CONTROL_SHA=<full-reviewed-control-commit-sha> \
LEARNBOX_VALIDATE_IMAGE=sha256:<candidate-app> \
infrastructure/production/admin/build-admin-image.sh <full-candidate-product-source-sha>

NEXT_PUBLIC_LEARNBOX_ADMIN_PASSKEY_UI_ENABLED=true \
LEARNBOX_RELEASE_APPROVAL=true \
LEARNBOX_RELEASE_CONTROL_SHA=<full-reviewed-control-commit-sha> \
LEARNBOX_VALIDATE_IMAGE=sha256:<candidate-admin> \
infrastructure/production/admin/build-admin-image.sh <full-candidate-product-source-sha>
```

Release approval is fail-closed: it requires an immutable candidate digest, exactly one currently running Production service container, matching candidate provenance/architecture, and either comparable labels or the exact `87490d60…` bridge. For Admin, the candidate and running bundle must both retain `server-passkey` and omit `local-prototype`.

A successful result prints the exact candidate and baseline image IDs, product source SHA, and control source SHA. If either image, the running baseline, or the validator differs, re-run the command; previous approval cannot carry forward. Record all of those values together with migration and rollback identities before traffic changes.

## Before a Production release

1. Read the active image's source SHA, digest, OS/architecture, public labels and container identity. `linux/amd64` is required for the Iran host.
2. Build through `infrastructure/production/admin/build-admin-image.sh`, with `LEARNBOX_IMAGE_TARGET=app` for learner. It reads the matrix from the requested commit and rejects an incomplete one.
3. Validate the exact retained candidate images with the release-approval commands above. A missing baseline, inactive container, unknown digest, missing comparable setting, changed enabled feature, or bundle mismatch stops release approval.
4. Record source SHA, digest, OS/architecture, public labels, bridge evidence if applicable, migration and rollback identities before traffic changes.
5. Post-deploy, run the feature smoke for each changed flag as well as health/authentication checks. `health=200` alone does not prove a client flag.

Temporary local/dev test sessions or bypasses must stay outside images, tracked configuration and Production. Remove test identities/tokens after the proof.
