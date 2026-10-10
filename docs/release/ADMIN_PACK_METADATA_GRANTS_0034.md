# Admin pack metadata editing — migration 0034 + Admin-only release plan

Status: prepared, NOT applied. Production stands at ledger head `0033_admin_content_management_grants`.

## What this fixes

Editing a content pack's name, description, level, category or target item count returned
`503 Content packs unavailable` in Production. `editPack` updates those five columns plus `is_free`;
`learnbox_admin` held column-level UPDATE on `packs` only for `status` and `published_at`
(migration 0033), so Postgres refused the statement with `42501` and the route's catch-all turned
that into a 503 with no log line. Publish and archive were unaffected, which is why the gap
survived the 0033 release.

Proof on the live Production database as the real `learnbox_admin` role (zero-row statements inside
a rolled-back transaction, 2026-10-10):

```
UPDATE packs SET target_item_count = …  -> ERROR 42501 permission denied for table packs
UPDATE packs SET status = …             -> allowed
```

## Change set

- `database/migrations/0034_admin_pack_metadata_grants.sql` — grants
  `UPDATE (display_name, description, target_cefr, category, target_item_count) ON packs` to
  `learnbox_admin`, with a self-verification block that also asserts `is_free`, `price_tomans`,
  `packs.id`, `cards.content_id`, `packs DELETE`, learner-table UPDATE and `CREATE ON SCHEMA public`
  are **not** held.
- `apps/admin/lib/server/postgres-content-packs-write-store.ts` — `is_free` removed from the
  `editPack` SET list; a requested free/paid flip now returns a field-level 422
  (`isFree`: «تغییر رایگان/پولی بودن بسته از پنل مجاز نیست؛ این تصمیم مالکانه است.») instead of a
  permission denial.
- `apps/admin/lib/server/admin-content-packs-write-routes.ts` — `logWriteFailure()` logs one
  structured line (`event`, `operation`, `pgCode`, driver `message`) for every failed content write.
  No request body, cookie, CSRF token or idempotency key is logged; the client still receives the
  generic 503 body.
- `apps/admin/test/pack-metadata-role-grants-db.test.ts` — the real store under the real restricted
  role, in the required CI `quality` job.
- `apps/api/test/migrations-apply-and-retry-db.test.ts` — ledger head expectation moved to 0034.

## Evidence

- Local disposable Postgres 17, real migration runner: 0001–0034 apply to an empty database, second
  run applies 0; ledger head `0034_admin_pack_metadata_grants` (7/7 tests).
- New role test, 5/5: `current_user` is `learnbox_admin`; editorial edit through the real store
  succeeds and writes exactly one `content_pack.edit` audit row; a free/paid flip returns the field
  issue and leaves `is_free` untouched; `is_free`, `price_tomans`, `locale`, `packs DELETE`,
  `cards.content_id`, `review_events` and `card_schedules` stay denied; the 0033 lifecycle columns
  stay allowed.
- Negative control: with 0034 neutralised the same test fails with `permission denied for table
packs` — the guard really guards.
- Disposable Neon branch of Production (`test-0034-20261010`): grant absent before, present after,
  idempotent on a second apply, and as the real `learnbox_admin` role the exact editorial UPDATE
  that 503'd in Production returned `UPDATE 1` while `UPDATE packs SET is_free = true` was denied.
  Transaction rolled back.
- Full Admin suite 757/757; prettier, eslint, typecheck, `validate-migrations`,
  documentation-governance and web-security verifiers clean.

## Production application plan (owner approval required)

1. Confirm Admin health, image digest and ledger head 0033.
2. `pg_dump` backup to `/home/ubuntu/learnbox/backups/` (same step as the 0033/dcd82d7 releases).
3. Apply 0034 with the migrator role only (`LEARNBOX_MIGRATOR_DATABASE_URL`, SQL file, one
   transaction). Expected output: two `DO` blocks, ledger 33 → 34.
4. Verify as the real role: `has_column_privilege('learnbox_admin','packs','display_name','UPDATE')`
   true, `is_free`/`price_tomans` false.
5. Deploy the Admin image built from the merged commit (Admin only; the learner is not rebuilt,
   restarted or touched — no learner-facing code is in this change).
6. Functional check in the real Admin UI: rename a test pack and save; expect 200 and a
   `content_pack.edit` audit row.
7. Row-count comparison across the 17 tracked tables before/after.

Rollback: `REVOKE UPDATE (display_name, description, target_cefr, category, target_item_count) ON
packs FROM learnbox_admin;` and redeploy the previous Admin image
(`sha256:49c9d2e9a30b22c64602693cc00302723d4b9d742869a648bb379664d19c1ce6`, tag
`dcd82d7-step-up-reauth`, retained on the host). No data or schema change to undo.

## Open owner decision

The Admin edit form still posts `isFree` on every save, so the free/paid select is visible but
effectively read-only: saving an unchanged value works, flipping it returns the 422 above. Enabling
Admin-side free/paid changes would mean granting `UPDATE (is_free)` — and, for real pricing,
`price_tomans` — to `learnbox_admin`. That lets the Admin role move a pack between free and paid,
which changes learner entitlement reach (`published AND (is_free OR user_packs)`) without a payment
event, so it is a commercial decision, not an editorial one. It is deliberately out of this change
and needs its own reviewed migration if the owner wants it.
