# Admin Content Lifecycle Verification — Production (2026-10-10)

Scope: end-to-end verification of the Admin → Learner content lifecycle on Production
after release `8631565a` / migration `0033_admin_content_management_grants`.
Executed against one isolated test pack. No existing content, learner progress,
entitlements or environment variables were changed. No deploy, no migration.

## Result: PASS (all 8 steps)

| Step                              | Result | Evidence                                                                                                                                                     |
| --------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Draft pack creation               | PASS   | `zz-test-lifecycle-20261010`, audit `content_pack.create` 04:49:15                                                                                           |
| Card creation                     | PASS   | `POST /api/content/packs/{id}/cards` → 200, card `de66b880…`, version `7a1ea31d…`, audit 05:40:33                                                            |
| Card edit                         | PASS   | `PATCH /api/content/cards/{id}` → 200, `persianMeanings` updated in place (version stays 1 while draft), audit 05:41:57                                      |
| Submit for review                 | PASS   | `submittedCardCount=1`, `packStatus=needs_review`, audit 05:41:58                                                                                            |
| Six-dimension review              | PASS   | 6× `POST /api/content/review/check` → 200 (`german_linguistic`, `persian_translation`, `provenance`, `visual`, `audio`, `app_flow`), audit 05:41:58–05:42:00 |
| Editorial decision                | PASS   | `POST /api/content/review/decision` → `nextStatus=approved`, audit `content_review.approve` 05:42:00                                                         |
| Publication                       | PASS   | `publishedCardCount=1`; pack `status=published`, version `status=published`, audit 05:42:01                                                                  |
| Learner catalogue visibility      | PASS   | learner-visible free published set = 36 cards; `Testwort` present for both users                                                                             |
| Archival                          | PASS   | `deactivatedCardCount=1`; pack `archived`, version `deprecated`, audit 05:43:32                                                                              |
| Learner visibility after archival | PASS   | learner set back to 35 cards; `Testwort` absent; visible packs = `learnbox_start_a1_essentials` only                                                         |

## Data integrity (post-test)

- LearnBox Start pack: `status=published`, 35 cards, 35 published versions; newest card row dates from 2026-09-23 — untouched.
- `users=2`, `banners=3`, `user_packs=0`, `purchase_events=0`, `store_listings=0` — unchanged.
- `review_events=160`, `card_schedules=34`: newest rows date from 2026-10-09 22:00, i.e. owner app usage **before** this verification. Zero rows in either table reference the test card.
- `audit_logs` grew by 16 rows, all of them this verification's own content actions.

## Confirmed defect (not fixed here)

Writing content requires authentication within `recentAuthenticationMs = 5 minutes`
(`apps/admin/lib/server/admin-session.ts`). `recent_authenticated_at` is set at sign-in and is
never refreshed by activity (`touchSession` advances only `last_seen_at`), so any content form that
takes longer than 5 minutes to fill fails with `428 reauthentication_required`.

The server-side step-up flow already exists (`/api/auth/reauth/options`, `/api/auth/reauth/verify`)
and is wired into `SliderManagerPanel` and `SplashReplacementPanel`, but **not** into
`ContentPacksWorkspace` or `ContentReviewWorkspace` — those only render the message
«احراز هویت مجدد لازم است؛ دوباره وارد شوید.» with no way to re-verify, and a reload discards the form.

This verification used the existing `/api/auth/reauth/*` endpoints from the authenticated Admin page
to refresh recency, then drove the same Admin API endpoints the workspace UI calls.

Recommended next implementation: reuse the `SliderManagerPanel` step-up pattern in
`ContentPacksWorkspace` and `ContentReviewWorkspace` (inline re-verify on 428, preserving form state).

## Test artefact

`zz-test-lifecycle-20261010` is left in `archived` state (invisible to learners) as the
end state of the lifecycle test; its single card version is `deprecated`.
