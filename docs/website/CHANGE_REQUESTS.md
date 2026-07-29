# LearnBox Website Change Requests

## Initial architecture record

Status: Completed

Affected areas:

- Public marketing surface and character-asset consumption

Required actions:

- Preserve the learner web app.
- Create a separate reversible marketing subproject.
- Import the supplied DuDu reference without regenerating it.

Validation:

- Canonical BuBu files remain unchanged; imported derivatives have matching SHA-256 checksums.
- The public website builds independently.

Resume point:

- Static experience QA

## CR-LANDING-003 — Mandatory summer landing revision

Status: Completed

Source of truth:

- `/Users/test/Documents/LearnBox/learnbox-website-codex-pack/learnbox-landing-revision-brief-v3/LEARNBOX_LANDING_REVISION_BRIEF_V3.md`
- `/Users/test/Documents/LearnBox/learnbox-website-codex-pack/learnbox-landing-revision-brief-v3/summer-theme-reference.jpeg`

Baseline verified before revision:

- Desktop: 1280×720, no horizontal overflow.
- Tablet: 1024×768, no horizontal overflow.
- Mobile: 390×844, no horizontal overflow.
- The desktop navigation occupies the center band instead of reading as a right-aligned RTL cluster.
- The mobile hero CTAs begin below the first 844 px viewport.
- BuBu is cinematic only in the hero; measured downstream widths are approximately 155–275 px.
- GSAP and ScrollTrigger are active, but Motion for React is absent.
- Most downstream scenes depend on entrance transitions instead of a complete enter/main/exit motion concept.
- The current night-Germany wallpaper does not satisfy the supplied bright, layered summer reference.
- Current copy differs from the mandatory final Persian copy in Brief V3.
- The current landing has no isolated A/B/C variant routes.

Required result:

- RTL header and accessible mobile menu.
- Modular summer theme with sky, clouds, landscape, architecture, foliage, lighting and content layers.
- Larger, varied BuBu staging without overwriting canonical assets.
- Real GSAP/ScrollTrigger, Motion for React, CSS and SVG roles.
- Complete Brief V3 copy and honest unavailable destinations.
- Focused Variant A/B/C routes excluded from search indexing.
- Dedicated mobile and reduced-motion behavior.
- Desktop, tablet and mobile browser QA.

Protected boundary:

- `apps/website` and `apps/mobile` are outside this change request.
- Existing BuBu source files must not be overwritten.
- App Store availability must not be implied.

Resume point after completion:

- Return to the previous production-content handoff roadmap state.

Completion evidence:

- Safe baseline checkpoint: `01452d4`
- Direction decision and comparison boards: `5097291`
- Implementation plan: `8b839e1`
- V3 contract test: `dbb6787`
- Integrated landing, summer theme and noindex variants: `75b1ebb`
- Selected direction: Variant C, corrected to a German product/story hybrid.
- Contract tests: 5/5 passed.
- Production build: passed with static `/`, A/B/C comparison routes and icon route.
- Browser QA: desktop 1440×900, tablet 1024×768 and mobile 390×844 with no horizontal overflow.
- Reduced motion: parallax and loops disabled; all content visible.
- Canonical BuBu files remained untouched; V3 scene assets are versioned additions.
- Protected `apps/website` and `apps/mobile` remained untouched.

## CR-LANDING-004 — German scroll chapters

Status: Completed

Request:

- Give every landing segment an attractive German-themed background.
- Add more movement that happens with scroll.

Implemented:

- Eight typed Germany chapter backdrops: station, rail, street, map, park, harbor, square and garden.
- Five depth layers per chapter: far, mid, route, near and accent.
- Scrubbed GSAP parallax, SVG route drawing, U-Bahn/regional-train travel, apartment-window reveal, Olympiapark sun travel and city signal expansion.
- Existing Berlin hero and Cologne/Rhine download chapters retained.
- Mobile movement capped at 4%; no pinning or scroll hijacking.
- Reduced-motion profile renders resolved, static layers.

Validation:

- Source contract expanded to six tests.
- Browser QA at 1440×900, 1024×768 and 390×844.
- Eight chapter backdrops found in production.
- Desktop far-layer transform changes across scroll.
- Zero horizontal overflow, console errors or failed HTTP responses.

## CR-LANDING-005 — German landmark and legibility polish

Status: Completed

Request:

- Continue strengthening the German identity of every scroll segment.
- Keep motion attractive while protecting Persian copy legibility.

Implemented:

- Eight recognizable landmarks: U-Bahn, railway platform, Fernsehturm, Germany map, Olympiapark, Elbphilharmonie, Brandenburg Gate and a German learning signpost.
- Chapter-colored SVG silhouettes integrated into the existing accent layer.
- Gentle landmark parallax on desktop and a 1% motion cap on mobile.
- Theme-aware heading veils that remain soft on both light and dark scenes.
- Static landmark resolution under `prefers-reduced-motion`.

Validation:

- Source contract expanded to seven tests.
- Production build and TypeScript validation passed.
- Browser QA at 1440×900, 1024×768 and 390×844.
- Eight landmarks and nine heading-safe regions found in production.
- Navigation interaction to the learning-method chapter completed successfully.
- Zero horizontal overflow or browser-console errors.
- Existing BuBu assets and protected `apps/website` and `apps/mobile` remained untouched.
