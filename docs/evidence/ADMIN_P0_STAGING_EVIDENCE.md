# Admin P0 (LB-B30) staging evidence

Everything here ran against a disposable local Postgres 17 (all 22 repo migrations applied, TLS on,
`verify-full` against a throwaway CA) and a local Admin container. **No Production system, DSN or
credential was used.** Replaces an earlier draft whose "10 gates passed" claim was not backed by
executed proof.

## Source and image identity

| Link                                          | Value                                                                               |
| --------------------------------------------- | ----------------------------------------------------------------------------------- |
| Git commit                                    | `f44092a437c5c3105fee0327dce9c4aab673b0fb` (branch `fix/lb-b30-admin-p0-hardening`) |
| Build input                                   | `git archive` of that commit only (no working tree)                                 |
| OCI label `org.opencontainers.image.revision` | `f44092a437c5c3105fee0327dce9c4aab673b0fb`                                          |
| Image ID                                      | `sha256:9f2e7e8e8e2da1083ee40e85f6c93fd012170caff42f0f331b20350a84578741`           |
| Running container image                       | same ID                                                                             |
| Runtime `ADMIN_SOURCE_SHA`                    | same SHA                                                                            |

`5ddc5c8` (the commit named in the approval) does **not** contain the provenance label; it was
uncommitted then. The label landed in `ebf4574`. App code differs from `5ddc5c8` only by the two
`GET /api/users*` gates added in `f44092a`. Building from `5ddc5c8` is therefore not possible with a
truthful label; the owner must accept `f44092a` as the source of record.

## Results

| Proof                                                          | Result                                                                                                                                                            | Artifact                                                    |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Admin unit/integration suite                                   | 32 files, 193 tests pass                                                                                                                                          | vitest                                                      |
| Website suite                                                  | 86 files pass, 690 tests pass, 7 skipped (role test, needs role URLs)                                                                                             | vitest                                                      |
| DB role catalog + live proof                                   | 899 checks, 0 failures (592 catalog, 296 live-role probes, 5 column, 6 DDL)                                                                                       | `infrastructure/database/db-roles-p0-proof.sql`             |
| Proof can fail                                                 | 8 injected faults (extra DELETE, TRUNCATE, missing INSERT, column grant, schema CREATE, table ownership, CREATEROLE) each turned it red                           | manual mutation run                                         |
| Real store code under roles                                    | 7/7, twice: identity, profile, summary, review write, session revoke/logout-all, account deletion (as `learnbox_app`); content-review store (as `learnbox_admin`) | `apps/website/test/db-roles-functional.test.ts`             |
| Anonymous/forged HTTP matrix on the image                      | 93/93                                                                                                                                                             | `infrastructure/admin-p0-proof/anonymous-http-matrix.*`     |
| Authenticated HTTP matrix (synthetic owner, DB-seeded session) | 48/48                                                                                                                                                             | `infrastructure/admin-p0-proof/authenticated-http-matrix.*` |
| Container log during both matrices                             | no errors, no `permission denied`                                                                                                                                 | `docker logs`                                               |

The Admin container ran as `learnbox_admin` throughout, so the authenticated matrix is also a
functional proof that the least-privilege Admin role is sufficient for the live Admin surface
(session read/touch/revoke, review queue, review check write, idempotent replay).

## Defects found and fixed during re-verification

1. `GET /api/users` and `GET /api/users/[userId]` were not behind the legacy gate (401 to anonymous
   instead of fixed 404). Fixed in `f44092a`. The inventory test only inspected mutating handlers;
   it now covers every route file and every exported handler, and turns red if either gate is removed.
2. The first role model was a guess. It is replaced by a model derived from the SQL the shipped code
   runs. The functional test then caught a wrong grant: `user_session_cutoffs` needs UPDATE
   (`INSERT .. ON CONFLICT DO UPDATE`, used by log-out-everywhere). Applied as first written it would
   have broken that path in Production.

## Behaviour notes (not defects)

- Delegated routes (logout, review check/decision, splash replace) answer a generic 400 for a
  rejected Origin/Content-Type/CSRF, by design (no oracle). Their guard-before-session ordering is
  asserted at source level by the inventory test; for review check/decision it is also visible over
  HTTP (400 vs 401).
- `add-passkey/verify`: guard runs before the session read (403 vs 401 proven over HTTP).
- Legacy routes return 404, or 405 for methods a file does not export. Never 2xx, also for an
  authenticated owner.
- `add-passkey/options` is a session-gated GET that reads owner tables inline and issues a WebAuthn
  challenge. Known exception, deferred to LB-B31.

## Not proven (do not read past this)

- **Real Neon.** The role model ran on a local Postgres 17, not on Neon. Neon-specific behaviour
  (role creation privileges of `neondb_owner`, pooler, default privileges) is unproven until the
  Production role step, which is why that step has its own negative-permission gate.
- **Learner app HTTP path.** The learner runs its real store code under `learnbox_app`, but the
  learner _container/HTTP_ stack was not run under the restricted role in staging.
- **Splash replace end to end** (needs private blob storage); only its guard layer was exercised.
- **Real passkey ceremony.** Sessions were seeded in the database; WebAuthn login was not exercised.
- **Legacy image.** `learnbox-admin:production` (`d4f39bfc`) has no labels; it cannot be tied to a commit.
