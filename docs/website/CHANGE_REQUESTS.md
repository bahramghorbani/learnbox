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

## CR-LANDING-006 — Upload readiness and deployment safeguards

Status: Completed locally; preview deployment pending access

Request:

- Continue until the landing can confidently enter the upload process.

Implemented:

- Separate app-local Vercel target that cannot deploy `apps/website`.
- Central public-destination configuration with unavailable and invalid states.
- Preview and production upload gates with pressure-tested failure paths.
- Canonical metadata, Open Graph metadata, robots, sitemap and manifest.
- CSP, referrer, content-type, framing and permissions security headers.
- Visible global unavailable notice and non-interactive product-preview controls.
- Local font preloading and mobile motion/image delivery performance safeguards.
- Upload-readiness report, deployment runbook and rollback procedure.

Validation:

- 13/13 automated tests.
- Production build with 11 static routes.
- `check:preview` passed; `check:release` blocks every missing production input.
- Chrome-compatible browser, Safari and Firefox smoke tests.
- Lighthouse mobile: 91 Performance, 100 Accessibility, 100 Best Practices, 100 SEO and CLS 0.
- Protected `apps/website` and `apps/mobile` unchanged.

Resume point:

- Connect a separate Vercel project rooted at `apps/learnbox-website` and create the first preview deployment without attaching the production domain.

## CR-LANDING-007 — Product story, legal routes and Preview verification

Status: Completed — exact-source Preview deployed and verified

Final review closure (2026-08-01):

- Replaced unconditional download language with configuration-aware copy for
  both, one or zero verified release destinations.
- Completed the Persian RTL privacy and terms contracts while preserving their
  explicit pre-release owner/counsel-review boundary.
- Routed footer items through the destination configuration, normalized
  same-origin legal URLs, protected external links and made invalid destinations
  non-navigable.
- Added the mandatory production gate
  `LEARNBOX_LEGAL_REVIEW_STATUS=approved` and documented it in the environment
  example and deployment runbook.
- Rebuilt the motion lifecycle around a live desktop/reduced-motion query; the
  same page now transitions cleanly among desktop, mobile and reduced profiles.
- Removed dead motion selectors, shared the product-story note, added HTTP 400+
  response auditing and fixed the real mobile Leitner contrast regression.
- Source `40e79e42bc8ad88d3af55de65f10178847e36ba5` is deployed only to
  Ready/Preview deployment `dpl_AQQNTjQrJj3A2LPsBxYRDibmbmBJ` at
  `https://learnbox-landing-preview-hzk38cm9m-learn-box.vercel.app`.
- Deployed verification passed for all three HTTP routes, canonical/security
  headers, same-page breakpoint/reduced-motion transitions, keyboard and
  JavaScript-disabled legal behavior, image decoding, console/network failures
  and HTTP response statuses.
- Production, the custom domain, DNS, SSL, learner web app and mobile app remain
  untouched.

Fix Round 1:

- Corrected the 390 px product-story regression where flattened grid children
  formed implicit columns and clipped screenshots off-screen.
- Added browser assertions for viewport/container containment, one-column
  stage/screen order, page width and complete per-surface console/network
  cleanliness.
- Replaced the mobile product-story evidence and preserved desktop sticky,
  reduced-motion and JavaScript-disabled legal behavior.

Request:

- Replace fictional app mockups with the four owner-supplied screenshots.
- Deliver desktop sticky storytelling, mobile document flow and a static
  reduced-motion fallback in the approved order.
- Add honest Persian RTL privacy and terms drafts, activate Telegram/contact and
  keep unknown release destinations unavailable.
- Complete accessibility, browser, performance and isolated Preview QA without
  touching Production.

Local validation:

- Browser contract: 14/14 passed, including bidirectional product-stage sync,
  exact 390×844 mobile containment/flow, reduced motion, keyboard focus,
  JavaScript-disabled legal HTML and final console/network sweeps.
- In-app Browser evidence: 1440×900, 1024×768 and 390×844; no horizontal
  overflow, failed images, overlay or console errors.
- Lighthouse 12.8.2 clean mobile profile: Performance 97, Accessibility 100,
  Best Practices 100, SEO 100 and CLS 0.
- Build output: home First Load JS 120 kB; shared 102 kB.
- Canonical BuBu hashes remained unchanged.
- Fix Round 1 source `831fdc8d234b3c40429bea90557715d146355419`
  is deployed to the Ready/Preview deployment
  `dpl_8zMFz3YvMPyMdndav4FzTbEmgYMw` at
  `https://learnbox-landing-preview-ix8lgp6h2-learn-box.vercel.app`.
- `https://t.me/learnboxapp`, `mailto:hi@learnboxapp.com`, `/privacy` and
  `/terms` are active. Web app, Café Bazaar, Instagram, LinkedIn and Pinterest
  remain unavailable.

Legal and release boundary:

- Privacy and terms are pre-release owner-facing drafts pending owner/counsel
  review, not legal advice or an assertion of approval.
- Production, `learnboxapp.com`, DNS, SSL, auth, payments, analytics, the learner
  app and server state are untouched.

Preview delivery:

- source: `831fdc8d234b3c40429bea90557715d146355419`;
- deployment: `dpl_8zMFz3YvMPyMdndav4FzTbEmgYMw`;
- URL: `https://learnbox-landing-preview-ix8lgp6h2-learn-box.vercel.app`;
- Vercel target/status: Preview/Ready, with no production or custom-domain alias;
- `/`, `/privacy` and `/terms`: HTTP 200 with canonical and security headers;
- deployed browser contract: 14/14 passed, including desktop/mobile product flow,
  reduced motion, keyboard focus, JavaScript-disabled legal HTML, image/network
  requests and invalid-GSAP-target console regression.
