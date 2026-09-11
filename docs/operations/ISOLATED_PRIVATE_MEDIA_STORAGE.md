# Isolated private-media storage contract

**Status:** decision-ready preflight only. This document creates no provider resource, credential, deployment, upload, attachment, review decision, seed, release or publication.

## Scope and non-goals

This contract covers a future private target for the 15 candidate items prepared by LB-DS-060 (45 expected image/audio objects). It does not authorize:

- use of the existing `learnbox-media-private` store;
- access to, creation of, or connection changes for any Vercel store or project;
- `vercel env pull`, static-token use, provider CLI operations, uploads, lists, heads, deletes or receipt generation;
- card attachment, learner delivery, runtime-flag change, deployment, review approval, seed, release or publication.

Private Blob read and write requests require authentication.[1] Private media must continue to be served only through the existing session-guarded same-origin route, never by storing or exposing object URLs.

## Read-only findings

| Finding                                                                                                                                                                                                                               | Evidence                                                                                                                                                                                             | Consequence                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The repository states that `learnbox-media-private` is connected to `learnbox-preview` for Development, Preview and Production.                                                                                                       | `docs/operations/VERCEL_PRIVATE_MEDIA_SETUP.md:7-9`                                                                                                                                                  | The existing target fails the isolation requirement. A staging-only upload would be Production-adjacent.                                                         |
| The legacy uploader accepts any resolved `BLOB_STORE_ID` / token credentials and has no expected-store identity guard before Blob SDK import or write-capable operations.                                                             | `scripts/upload-start-slice-private-media.mjs:7-9,50-60,92-100`                                                                                                                                      | It must not be executed. LB-DS-062 must add a default-off identity guard before any future execution path.                                                       |
| The repository's runtime references declare both private-media flags `false` and no populated Blob token variable; no live learner runtime value is asserted because no learner container is present in the local Docker environment. | `docs/operations/LEARNER_APP_SERVER_DEPLOYMENT.md:20-31`; `infrastructure/production/app/app.env.example:13-14`; `.env.example:25-26`; local `docker ps -a` on 2026-09-11 found no learner container | This is not proof of store isolation. It confirms no activation is being inferred from repository-declared defaults; the learner runtime was not inspected live. |
| This worktree has no local Vercel project link or local Blob/OIDC environment file.                                                                                                                                                   | local presence-only inspection on 2026-09-11                                                                                                                                                         | Do not pull or create credentials as part of this task.                                                                                                          |

The Vercel dashboard, store metadata, project connections, environment selections, account/team ownership, region, billing state and object inventory were not queried during this preflight. They remain explicit unknowns.

## Required target shape

A future target is eligible only if every item below is independently verified by the owner in the Vercel dashboard and recorded as a non-secret attestation for LB-DS-062:

1. **Separate private store:** newly created for this purpose; access mode is Private and is not the known shared store.
2. **Separate project boundary:** connected only to a dedicated non-Production private-media project. It must not be connected to the Production learner project or any project that deploys Production.
3. **Environment boundary:** Production is not selected. Preview is not selected for the first upload. Development may be selected only if the owner explicitly chooses a local-only isolated workflow. Vercel preselects Production and Preview when connecting a store, so their removal must be checked deliberately.[2]
4. **Credential boundary:** use Vercel-managed OIDC for a Vercel-hosted future delivery function. OIDC is preferred to a long-lived read-write token because it rotates automatically.[2] No token, store ID, object URL or credential value may enter Git, chat, reports or tests.
5. **Delivery boundary:** no custom domain, route change or client flag is enabled by target creation. The existing private route remains default-off until a later, separately approved delivery operation.
6. **Region/retention boundary:** owner records the selected region and provider retention/deletion policy in the provider account, not in Git; the target must permit a scoped rollback without changing or deleting any shared store.
7. **Cost boundary:** owner confirms the selected plan and accepts the limited target's budget. Private and public stores have the same storage/operation/upload pricing, but private delivery adds Function-to-store and Function-to-browser transfer paths.[3]

## State transitions

```text
no target
  -> owner creates isolated private target (owner gate)
  -> owner verifies non-secret target attestation (owner gate)
  -> LB-DS-062 validates attestation and implements a default-off guard
  -> separately approved upload executes and writes an out-of-repo receipt
  -> receipt is independently validated without copying URLs to Git
  -> separately approved persisted attachment
  -> separately approved authenticated delivery activation
  -> authenticated review approval
  -> seed
  -> release/publication
```

Every arrow is independent. Passing an earlier transition grants none of the later ones.

## Non-secret attestation shape for LB-DS-062

LB-DS-062 may accept only a local ignored JSON file with these literal booleans and labels. It must never contain an ID, token, URL, pathname, account name, project ID or object metadata:

```json
{
  "version": 1,
  "ownerApproved": true,
  "targetPurpose": "learnbox-private-media-isolated-nonproduction",
  "access": "private",
  "dedicatedStore": true,
  "dedicatedProject": true,
  "productionConnectionAbsent": true,
  "previewConnectionAbsent": true,
  "sharedKnownStoreRejected": true,
  "noExistingObjectsExpected": true
}
```

The guard must require every field exactly, reject any missing/extra or false value, reject the known shared-target marker, and exit **before importing `@vercel/blob` or invoking list/head/put/delete**. This attestation proves only an owner declaration, not provider state; future execution requires a separate owner-authenticated live dashboard verification.

## Rollback-safe checklist

Before any upload is proposed:

- [ ] Owner confirms that target creation itself is approved, including any plan/cost consequence.
- [ ] Owner creates a new private store and dedicated non-Production project; no existing store is repurposed.
- [ ] Owner visually verifies the target has no Production or Preview connection and has no pre-existing objects.
- [ ] Owner records the provider-side region/retention/deletion policy outside Git.
- [ ] A non-secret local attestation matches the shape above.
- [ ] LB-DS-062 tests missing, malformed, mismatched and known-shared attestation paths and proves zero Blob SDK writes.
- [ ] A distinct owner approval authorizes the first upload only after the guard and review merge.

If any check fails, do not upload. Disable or remove only the newly created dedicated target after owner approval; never delete, empty or disconnect the shared store as rollback.

## Minimum consequential owner decision

Choose one:

1. **Recommended — authorize creation of a new dedicated private Vercel Blob store and dedicated non-Production project only.** This permits the provider-side creation step after secure owner login, but not credential pull, upload, attachment, activation, review, seed or publication.
2. **Keep storage unprovisioned.** LB-DS-062 can still implement and test its fail-closed guard, but all provider verification and upload remain blocked.

## Sources

[1] [Vercel Blob: Private Storage](https://vercel.com/docs/vercel-blob/private-storage)

[2] [Vercel Blob SDK and authentication](https://vercel.com/docs/vercel-blob/using-blob-sdk)

[3] [Vercel Blob pricing](https://vercel.com/docs/vercel-blob/usage-and-pricing)
