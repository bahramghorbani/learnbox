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

Status: In progress

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
