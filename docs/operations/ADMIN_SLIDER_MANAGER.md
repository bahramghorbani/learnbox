# Admin Slider Manager (home-screen slides)

Phase 4 / M4.2. The Slider Manager lives on the Admin «نمایش اپ» (Presentation) workspace and
manages the canonical `banners` table — the same rows the learner home screen already reads. There
is no second banner system and no separate slider database.

**Implemented in the repository, not activated anywhere.** Production does not have the flag, does
not have migration `0031`, and its three sample banners are untouched.

## Enabling it

Both of these must be true, or every slider route answers `404`:

1. `LEARNBOX_ADMIN_PRESENTATION_ENABLED=true` in the Admin environment (default off), on top of the
   existing Admin auth and database configuration.
2. Migration `0031_m4_2_presentation_slides.sql` applied. It adds `banners.image_data` and grants
   `learnbox_admin` `INSERT, UPDATE` on `banners`. Without it, a slide cannot be stored.

The operator must additionally hold the `super_admin` role in `admin_role_assignments` and have
authenticated with their passkey within the last five minutes; the panel asks for
re-authentication by itself when the server demands it.

## What it can do

- List every slide with its state, destination, order and image.
- Create and edit a slide: title, optional description, destination, image.
- Activate and deactivate. **At most three slides may be active**, enforced in the database
  transaction under an advisory lock, so two operators acting at once cannot exceed it. Production
  currently has three active sample banners, so one must be deactivated before a new slide can go
  live there.
- Reorder. A reorder submits the complete order; a partial list is refused rather than applied.

It deliberately **cannot delete a slide** — deactivation is how a slide is retired, so no operator
action destroys a row, its image or its audit trail. The role holds no `DELETE` privilege on
`banners`.

## Images

A slide image is uploaded through the panel, decoded, re-encoded to WebP and stored as bytes in
`banners.image_data` — the same arrangement as the launch splash. No external URL is accepted and
no new storage provider is involved. Accepted input: PNG, JPEG or WebP, at most 6 MB, at least
720×240, landscape (aspect ratio between 1.2 and 4).

Bytes are served only to a signed-in `super_admin`, addressed by slide id, as
`private, no-store`. A slide cannot be activated without image bytes; deactivating never requires
one, so pre-existing rows that only have the legacy `image_url` can still be switched off.

## Destinations

- **A learner screen**: `today`, `words`, `progress`, `profile` or `store`.
- **A specific pack**: the pack must exist; it is checked in the same transaction.
- **An external link**: plain public `https` only — no embedded credentials, no custom port, no IP
  literal, no private-network suffix.

Since **M4.3** all three kinds are delivered to the learner app and navigate for real; see
[LEARNER_SLIDER_DELIVERY.md](LEARNER_SLIDER_DELIVERY.md).

## Audit

Every write goes to the canonical `audit_logs` in the same transaction as the change, with
`entity_type = 'presentation_slide'`, the actor, the slide id in `metadata.banner_id`, and the
action: `presentation_slide.created`, `.updated`, `.activated`, `.deactivated` or `.reordered`.
Each request carries an idempotency key, so a retried request reports the original outcome and
writes nothing a second time.

## If something is wrong

- **Panel says presentation management is not enabled in this environment** — the flag is off, or
  Admin auth/database configuration is incomplete.
- **Every action answers 404 while the panel is visible** — the operator lacks `super_admin`.
- **"بیشتر از 3 اسلاید نمی‌تواند فعال باشد"** — three slides are already active; deactivate one.
- **"برای فعال‌کردن اسلاید، تصویر لازم است"** — the slide has no stored image bytes.
- **A slide looks right in Admin but the app does not show it** — check it is active, inside its
  schedule, and among the three most recent by position; the learner receives at most three. See
  [LEARNER_SLIDER_DELIVERY.md](LEARNER_SLIDER_DELIVERY.md).
