# Learner slider delivery (home-screen slides)

Phase 4 / M4.3. What the Admin [Slider Manager](ADMIN_SLIDER_MANAGER.md) publishes is what the
learner home screen («امروز») shows. One table (`banners`), one rule, no second banner system, and
no code change per slide: an operator edits a slide and the next learner read reflects it.

**Implemented in the repository, not activated anywhere.** Production does not have migration
`0031`, does not have the Admin flag, and its three sample banners are untouched. Nothing on this
page is live until a separately authorized deployment.

## The one rule

`apps/website/lib/learner-slider.ts` is the single definition of what a learner receives, used by
both learner routes and by the tests. A slide is delivered when all of these hold:

- `is_active = true`
- `starts_at` is null or already passed, and `ends_at` is null or not yet passed
- its destination is one this product will navigate to (below)
- it is among the first **three** such slides, ordered by `sort_order`, then newest authored, then
  id

The maximum of three is enforced on delivery as well as on authoring, so a legacy or manually
edited table with more active rows still cannot produce a four-slide carousel. More candidate rows
are read than are delivered, so one unusable row does not cost the learner a real slide.

A slide that is active but holds a destination outside the rule — a pre-existing sample banner, a
row authored before the Slider Manager — stays in the table and is simply not delivered. It is
never shown as a dead tap target.

## The two routes

Both require a signed-in learner and both are checked before any database access. Both answer
`private, no-store`.

| Route                        | Answers                                                                                                            |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `GET /api/banners`           | `{ "slides": [...] }` — id, title, description, background colour, destination, and whether the slide has an image |
| `GET /api/banners/:id/image` | the stored WebP bytes of one slide                                                                                 |

A slide payload deliberately carries no `image_data`, no legacy `image_url`, no `link_target`, and
no `sort_order`, `is_active`, `starts_at`, `ends_at` or `created_at`: scheduling and activation are
server concerns.

The image route answers the bytes only for a slide that is **currently delivered**. Retiring a
slide in the Admin therefore also stops its image; an id that is no longer delivered is a plain
`404`. Bytes come back as `image/webp` with `no-store`, `nosniff` and a same-origin resource
policy, so they are not cached by a proxy, a CDN or the service worker and cannot be embedded from
another origin. An anonymous request receives `401` and no bytes, on either route.

Delivery needs no new database privilege: both queries run with nothing but `SELECT` on `banners`,
which the learner role already has. M4.3 adds no migration.

## Destinations

- **A learner screen** — `today`, `words`, `progress`, `profile` or `store`. The Store opens as the
  Store always has.
- **A specific pack** — there is no pack detail route, so the Store opens with that pack brought
  into view and marked as the current card. The Store still shows exactly its own catalogue
  (published and listed) and its own ownership data: a slide cannot surface a draft, unlisted or
  unentitled pack, and a pack the Store does not offer is simply not highlighted.
- **An external link** — opened in a new tab with no handle back to the app. The URL is
  revalidated server-side at delivery, not merely trusted because the Admin accepted it: public
  `https` only, no embedded credentials, no custom port, no IP literal, no private-network name.

## The carousel

Same visual identity as before, with the real image behind the text and a gradient so the title
stays readable over a photograph. Unchanged: auto-rotation every four seconds, pagination dots,
position-based order, responsive sizing.

Behaviour worth knowing when reading a bug report:

- **Reduced motion** — with `prefers-reduced-motion: reduce` the carousel does not rotate by
  itself and does not animate between slides. The dots still work.
- **Swipe** — a horizontal drag past 40 px changes slide and does not count as a tap, so a swipe
  never navigates.
- **Accessibility** — the slider is a labelled region, each slide is a real button (so Enter and
  Space work), off-screen slides are out of the tab order and out of the accessibility tree, and
  the pagination buttons are exposed to assistive technology. The M4.2 defect — focusable
  pagination buttons inside `aria-hidden="true"`, reachable by keyboard but invisible to a screen
  reader — is fixed.

## When something is missing

Every failure degrades to less carousel, never to a broken home screen:

- no delivered slide → no carousel is rendered at all
- a slide whose image fails to load → the approved background colour, title still readable
- the slider API unavailable, or the database unreachable → Today renders normally with no carousel
- no learner session → `401` on both routes and no protected bytes anywhere

## Evidence

- `apps/website/test/m4.3-learner-slider-db.test.ts` — real Postgres, driven by the real Admin
  store: an Admin edit reaching the learner, deactivation, scheduling, order, the maximum, excluded
  destinations, payload hygiene, image bytes, and the same rule read under a `SELECT`-only role
- `apps/website/test/m4.3-learner-slider-routes.test.ts` — the HTTP contract of both routes
- `apps/website/test/m4.3-today-slider-ui.test.tsx` — image rendering, fallbacks, accessibility,
  reduced motion, swipe, destinations, empty and error states
- `apps/website/test/m4.3-store-pack-destination.test.tsx` — the pack destination inside the Store
- `scripts/m4.3-mutation-battery.mjs` — 53 deliberate breakages, each of which must fail the suites
