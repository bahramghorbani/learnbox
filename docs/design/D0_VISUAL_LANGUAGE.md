# D0 — LearnBox visual language and token contract

**Status:** draft, ready for supervisor review (not approved).
**Scope:** learner surfaces (Splash, Onboarding, Today, Review, Words, Progress, Profile, Settings) and Admin content surfaces that share the learner design system.
**Evidence:** reviewed concepts in `docs/design/concepts/`, mobile theme `apps/mobile/lib/ui/learnbox_theme.dart`, Web learner CSS `apps/website/app/globals.css`, foundation tokens `packages/design-system/src/tokens.css`, QA record `docs/design/UI_QA.md`, and canonical Bobo registry `packages/bobo-design-system/registry.json`.
**Ownership:** contract for D1 implementation; changing any token value below requires a design decision recorded here before product code changes.

## 1. North star

Warm, calm, intelligent, legible, lightly playful — not childish, not noisy. Persian UI is RTL-first. Cards are fast to understand and never become grammar textbooks (`docs/design/DESIGN_PRINCIPLES.md`). Bobo is a supporting character, never a substitute for information hierarchy.

## 2. Color tokens (locked by existing code)

The palette below is locked by the mobile theme (`learnbox_theme.dart`), Web learner CSS (`globals.css`) and the foundation package (`tokens.css`). All three currently agree on the same hex values.

| Token              | Value     | Web CSS var    | Dart const         | Usage                                                               |
| ------------------ | --------- | -------------- | ------------------ | ------------------------------------------------------------------- |
| `bg.canvas`        | `#fffaf4` | `--bg`         | `learnBoxCanvas`   | Warm off-white app canvas / scaffold background                     |
| `bg.surface`       | `#ffffff` | `--surface`    | `learnBoxSurface`  | Cards, sheets, inputs (ColorScheme.surface)                         |
| `text.ink`         | `#1e293b` | `--ink`        | `learnBoxInk`      | Primary text on canvas/surface (onSurface)                          |
| `text.muted`       | `#64748b` | `--muted`      | `learnBoxMuted`    | Secondary/helper text                                               |
| `brand.primary`    | `#4d6bfe` | `--primary`    | `learnBoxPrimary`  | Primary action buttons, active nav, selected states, progress       |
| `brand.apricot`    | `#ffb36b` | `--apricot`    | `learnBoxApricot`  | Warm secondary accent; streak/today-summary emphasis                |
| `brand.lavender`   | `#f3ecff` | `--lavender`   | `learnBoxLavender` | Restrained support fills (goal icons, progress icon)                |
| `border.default`   | `#e7e3ff` | `--border`     | `learnBoxBorder`   | Card borders                                                        |
| `semantic.error`   | `#b3261e` | —              | `learnBoxError`    | Error text/feedback (ColorScheme.error; web uses `#bd3f3f` locally) |
| `semantic.success` | `#228b62` | `--lb-success` | —                  | Success states (foundation token only; verify before web use)       |
| `semantic.warning` | `#e87c23` | —              | —                  | Streak/today-apricot emphasis (web local `#ef852e` summary figure)  |

### Contrast rules

- `brand.primary` `#4d6bfe` on white: contrast ≈ 4.6:1 — meets WCAG AA for normal text and is used for large/primary CTA text on white.
- `text.muted` `#64748b` on `bg.canvas`/white: ≈ 4.8:1 — AA for normal text.
- White text on `brand.primary`: ≈ 4.6:1 — AA.
- `semantic.error` `#b3261e` on white: ≈ 6.8:1 — AA.
- Do not place body text in `brand.lavender`, `brand.apricot`, or `border.default` fills; those are decoration/support only.
- Every status cue must pair color with a second cue (icon, text, shape); never color-only.

## 3. Typography

- Persian-first UI family: `IRANSansX LearnBox` (regular 400, bold 700). Licensed production typeface adoption is pending license recording (`docs/design/DESIGN_TOKENS.md`); the bundled `IRANSansX-Regular.woff2` / `IRANSansX-Bold.woff2` (Web `apps/website/public/fonts/`, mobile `apps/mobile/assets/fonts/`) is the current implementation source.
- Fallback stack (web): `Tahoma, Arial, sans-serif` after the Persian family.
- Brand/display latin (web launch/brand surfaces): `-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif` with `800`/`31px` for brand wordmark, `800 clamp(42px,10vw,64px)` for German card lemma. Keep exact where implemented; treat as display-layer exception, not general body type.
- Numerals: `font-variant-numeric: tabular-nums` for OTP/code inputs; `text-align: left` on LTR inputs inside RTL forms.

### Type scale (observed sizes, learner surfaces)

| Role            | Web size                        | Mobile (Dart)                              | Notes                                  |
| --------------- | ------------------------------- | ------------------------------------------ | -------------------------------------- |
| Display H1      | `clamp(36–48px)` (screen-based) | `textTheme.headlineLarge` + theme defaults | Today/Onboarding/Progress/Words H1     |
| Card lemma (DE) | `clamp(42px,10vw,64px)` 800     | `learnBoxGermanStyle` bodyLarge bold       | Always LTR, wordmark-level weight      |
| H2 / section    | 21px                            | theme `titleLarge`                         | Chart headings, insights               |
| Body / lead     | 15–17px, line-height 1.8–2.0    | theme `bodyLarge`                          | Persian body; 1.9–2.0 web line-height  |
| Label / small   | 12–14px                         | theme `labelLarge` (16px on filled button) | Muted labels, notes, meta              |
| CTA button      | 16–20px 700                     | 16px 700 (filled button), min height 56px  | Single clear primary action per screen |

Rules: never `letter-spacing` on Persian text (`CONCEPTS.md`); German terms LTR and isolated with safe spacing from Persian text; keep `direction: ltr` on German lemma, article, code inputs and brand wordmark. Test dynamic text scaling (web zoom to 200%; mobile `textScaler`) — screens must not overflow horizontally at 390px × 844px with default scaling.

## 4. Spacing, radius, elevation

### Spacing (4px base, observed values)

| Token      | Value   | Web evidence                                           | Dart evidence                                        |
| ---------- | ------- | ------------------------------------------------------ | ---------------------------------------------------- |
| `space.xs` | 4px     | gaps `6–9px`, `11–14px` component clusters             | —                                                    |
| `space.sm` | 8px     | gaps 8–10px                                            | `EdgeInsets.all(8)` (progress)                       |
| `space.md` | 16px    | padding `16px`, form gap 13px, card padding            | `EdgeInsets.all(16)` (today/progress)                |
| `space.lg` | 20–24px | shell padding `22px`, `24px`, card padding 20px        | `EdgeInsets.symmetric(horizontal: 24)`, `all(20/24)` |
| `space.xl` | 28–32px | shell top padding `28–42px`, section margins `27–35px` | `fromLTRB(20,24,20,32)` auth                         |

Mobile shell and web `.app-shell` both cap content width at `520px` (`width: min(100%, 520px)`; web `.owner-otp-card` at `430px`, `.offline-content` at `440px`).

### Radius

| Token         | Value   | Web evidence                                                        | Dart evidence                     |
| ------------- | ------- | ------------------------------------------------------------------- | --------------------------------- |
| `radius.sm`   | 12–16px | chips `12px`, examples `16px`, inputs `14–17px`                     | auth inputs `18px`                |
| `radius.md`   | 18–22px | primary button `22px`, phone input `22px`, search `22px`            | filled button `18px`, card `20px` |
| `radius.lg`   | 25–30px | study card `30px`, weekly chart `30px`, summary `26px`, rows `25px` | mobile card `20px` (CardTheme)    |
| `radius.pill` | 99px    | progress bars, nav indicator                                        | progress track `circular(99)`     |

Card `20px` radius is the locked mobile CardTheme; web `30px` study card is the current evidence — D1 must reconcile these two values into one `radius.lg` before new surfaces ship.

### Elevation

Flat-first design: surfaces are white on warm canvas with hairline `1px` borders; elevation is soft shadow only, never layered surfaces inside surfaces (`CONCEPTS.md`).

| Level   | Shadow (web evidence)                    | Dart                      |
| ------- | ---------------------------------------- | ------------------------- |
| Resting | `0 10–12px 25–34px #34426f0a–0d`         | Card elevation 0 + border |
| Raised  | `0 18px 44px #34426f12` (study card)     | —                         |
| Action  | `0 12px 24px #4d6bfe35` (primary button) | —                         |

Use `#34426f`-based soft shadows on neutral surfaces; blue-tinted shadow only on primary actions. No surface may sit inside another card without a reason.

## 5. Component rules (learner surfaces)

- **Primary CTA**: one clear action per screen; filled `brand.primary`, white bold text, min-height 56px (mobile 56px, web 58px offline retry), radius `radius.md`, hover raises 2px (`translateY(-2px)`), focus ring 3px offset 4px.
- **Cards**: white surface, 1px `border.default`, radius per above, no inner nesting without reason.
- **Buttons/inputs**: min touch target 44×44px (web `min-height 42–58px`); focus visible ring `3px solid #25213b` offset 3–4px (web) / Material focus style (mobile).
- **Bottom nav**: 3 destinations (Today, Words, Progress) only after onboarding; active state = primary color + 4px pill indicator under item.
- **Grade buttons (review)**: 4 states with color+icon+text cue: forgot (red-tinted), hard (apricot-tinted), remembered (lavender-tinted), mastered (green-tinted). Disabled state opacity 0.72 while awaiting server.
- **German content**: always LTR (`direction: ltr`), wordmark-level lemma weight, isolated from Persian with safe spacing; article chip bordered `#ffba7a` with `#e87c23` text.
- **Bobo**: supporting only; see §8.
- **States to design in D1** (from `DESIGN_STATUS.md`): loading, empty, error, offline and sync states for every learner surface; Today counts must be server-backed and truthful.

## 6. Accessibility and reduced motion

- Support RTL, scalable text, screen reader labels, contrast, non-color status cues, minimum touch targets, keyboard navigation on web, captions/transcripts, reduced motion (`docs/design/ACCESSIBILITY.md`).
- Reduced motion: web `@media (prefers-reduced-motion: reduce)` zeroes transitions/animations (both blocks in `globals.css`; offline/launch animations disabled). Mobile: card flip is smooth 3D with no forced delay; Bobo decorative motion has a still equivalent and never blocks a session (`docs/design/MOTION.md`).
- Keyboard: all web interactive elements reachable and focus-visible outlined; `sr-only` for icon-only controls.
- Screen reader: German lemma/pronunciation controls labeled; `lang="de-DE"` where implemented; article/lemma boundaries exposed.

## 7. Responsive breakpoints

Evidence-based (web learner CSS; mobile is single-column 390×844 primary target):

| Breakpoint          | Behavior (web evidence)                                                                                                                                           |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `< 420px`           | Compact spacing: shell padding 22→16px, H1 42→36px, summary figures 45→38px, card padding 22→16px, grade padding/16px font, learner-nav negative margins          |
| `≤ 520px`           | Content column caps at `520px` (`.app-shell`), learner surfaces single-column                                                                                     |
| `> 520px` (desktop) | Learner shells stay centered max-520 column; desktop dashboards/Admin use wider grids (Admin: true-white RTL workspace per `admin-content-review-concept-v1.png`) |

All learner screens verified at 390×844 (no horizontal overflow); `@media (max-width: 420px)` is the only learner media query in `globals.css`.

## 8. Bobo and asset rules

- Canonical: owner-approved `1.0.0` — white, softly furry, single-piece round companion, no visible neck, two short attached ears, dark expressive eyes, gentle peach cheeks. Registry: `packages/bobo-design-system/registry.json` (`canonical-owner-approved`).
- Every shipped Bobo asset needs an `assetId` + canonical version `1.0.0`; unversioned asset = placeholder only. Never generate/substitute/ship a rabbit-like variant (long separated ears, visible neck, separate head/body).
- Expressions: `welcome`, `encourage`, `celebrate`, `recovery`, `focus` only; per `BOBO_SYSTEM.md` behavior table. Bobo never shames, gates, or blocks study/recovery/settings; copy short, Persian-first, action-oriented.
- Decorative motion needs reduced-motion still equivalent; never blocks a session.
- Vocabulary images: one primary concept, controlled soft-3D background, no generated text/watermark, no unapproved Bobo variation, clear mobile-card hierarchy, minimal irrelevant detail; ~70% presence is art direction, not a quota.
- Changing canonical appearance, expressions, voice, or physical cues requires explicit owner approval.
- Keep canonical assets versioned; do not alter canonical appearance without owner approval.

## 9. Iconography

- Same-family SVG icons, uniform stroke weight, colored soft circle backgrounds (goal icons: lavender/apricot `78px` circle, `47px` SVG; `#6d65da`/`#f08d43` foregrounds).
- Bottom nav: 3 destinations, filled/active primary. Decorative icons: stroke-based, neutral `#3d4656`, active `#4d6bfe`.
- Never use emoji/letterforms as product icons; avoid unapproved generated marks. (Brand book icon intentionally excluded pending owner approval — `CONCEPTS.md` deviation.)

## 10. RTL/LTR rules (Persian-first, German-second)

- Persian UI: RTL-first (`direction: rtl` default; `AGENTS.md`).
- German lemma, article, pronunciation, code/OTP inputs, brand wordmark: LTR (`direction: ltr`), with `text-align: right` where the LTR input sits in an RTL form.
- German example blocks: German line LTR, Persian translation below RTL (`example` class evidence).
- OTP/code inputs: `letter-spacing 0.38em`, centered, tabular numerals, LTR input; verify no overflow at 200% zoom.
- Mixed-layout components (phone input row) use explicit grid with LTR input + RTL label placement; test at 390×844 and desktop.

## 11. Web vs mobile parity notes (evidence gap)

- Dart `learnbox_theme.dart` and web `globals.css` agree on core palette (canvas/surface/ink/primary/apricot/lavender/border) and 16–20px radius cards, but differ on: primary button radius (18 Dart vs 22 web), study-card radius (20 Dart vs 30 web), H1 scale (theme defaults vs explicit clamps), shadows (Dart elevation 0 vs web soft shadows). D1 must reconcile these into the single token set above before new surfaces; document each resolution in D1 evidence.

## 12. D1 acceptance checklist

For each learner surface entering D1 implementation, the following must hold before it can be called production-implementable (per `DESIGN_STATUS.md` readiness rule):

- [ ] Uses tokens from this contract (no new hard-coded hex/font/size without a token entry or recorded deviation).
- [ ] Persian-first RTL; German/technical strings LTR; verified at 390×844 (no horizontal overflow) and desktop.
- [ ] Loading, empty, error, offline and sync states designed and evidenced (screenshots/specs).
- [ ] Contrast AA on all text; status cues not color-only.
- [ ] Reduced-motion equivalent for every animation; Bobo motion never blocks.
- [ ] Touch targets ≥ 44px; web keyboard navigable with visible focus; screen-reader labels on icon-only controls; `lang="de-DE"` for German pronunciation where applicable.
- [ ] Single primary CTA per screen; no card-in-card nesting without reason.
- [ ] Bobo assets versioned canonical `1.0.0` with `assetId`; no new appearance without owner approval.
- [ ] Web/mobile parity: radius.lg, button radius, H1 scale and elevation reconciled per §11 and recorded in D1 evidence.
- [ ] Data shown is truthful (server-backed counts; no placeholder numbers presented as real).
- [ ] Sound (if used) optional, soft, short, separately muteable (`docs/design/SOUND.md`).

## 13. Out of scope / boundaries

- No product code, API, mobile/Web implementation, queue, or secrets changes from this contract.
- No production/payment/OTP/server activation.
- D2 commerce/admin surfaces (Store, Pack detail, offers, checkout, Purchases, Content Factory) follow this contract's tokens but their full UI kits are D2.
- Admin workspace keeps its true-white RTL direction per approved admin concept.
