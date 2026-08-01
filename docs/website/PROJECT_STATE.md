# LearnBox Website Project State

## Current Release

Version: 1.1 product-story Preview candidate
Status: LOCAL QA PASSED — CLEAN PREVIEW DEPLOYMENT PENDING

## Current Phase

Phase: Product-story and legal Preview verification

## Current Task

Commit the verified candidate, deploy the exact source to the isolated Preview
project and repeat the deployed smoke path.

## Completed

- Repository audit: pnpm monorepo; `apps/website` is the learner web app and remains untouched.
- Scope and storyboard lock for the public website.
- Approved midnight-purple visual direction, using the supplied landing reference.
- Static responsive public experience with all storyboard themes.
- Centralized unavailable distribution states to avoid unsupported platform claims.
- Canonical BuBu assets preserved; DuDu reference added without regeneration.
- Motion foundation complete: shared timing/easing tokens, scene lifecycle and static fallback.
- Story motion implemented: cinematic hero, forgetting-card drift, ordered Leitner progression, vocabulary-card transformation, path feedback, progress animation and resolved final invitation.
- Desktop and 390px mobile motion paths verified in-browser with no overflow or console errors.
- Authored German ambient wallpaper added for the hero and journey chapters.
- GSAP scroll-linked depth system added for capable desktops, simplified on mobile and frozen for reduced motion.
- Final production build verified at 1280×720 and 390×844 with no horizontal overflow or browser-console errors.
- Reduced Motion verified with all scenes visible and all wallpaper transforms disabled.
- Path-selector interaction verified in the production build.
- CR-LANDING-003 completed with the corrected Variant C German summer direction.
- Modular `src/themes/summer/` runtime added with responsive Berlin and Rhine scenes.
- RTL header, accessible mobile navigation and first-viewport mobile CTA verified.
- Five versioned BuBu scene compositions added without overwriting canonical character files.
- GSAP/ScrollTrigger, Motion for React, CSS loops and explanatory SVG paths verified in production.
- Focused Variant A/B/C comparison routes added with `noindex, nofollow`.
- Final V3 browser QA passed at 1440×900, 1024×768 and 390×844 with no overflow or console errors.
- German scroll chapters and landmark polish completed.
- Public destinations centralized with unavailable and invalid URL safeguards.
- SEO metadata, canonical URL, robots, sitemap and web manifest completed.
- Landing-specific Vercel config separated from the learner web app deployment.
- Browser security headers and immutable versioned-asset caching added.
- Preview and production upload gates implemented and tested.
- Chrome-compatible browser, Safari and Firefox smoke tests passed.
- Lighthouse mobile baseline: Performance 91, Accessibility 100, Best Practices 100, SEO 100 and CLS 0.
- Theme-engine summer implementation and documentation verified.
- Deployment and rollback runbooks completed.
- Dedicated Vercel project `learnbox-landing-preview` created without touching
  the learner web app deployment.
- Public Preview deployed and verified at
  `https://learnbox-landing-preview-m7e6nc7ud-learn-box.vercel.app`.
- Preview authentication removed, Preview indexing intentionally disabled and
  Vercel feedback injection disabled.
- Live HTTPS routes, security headers, mobile RTL layout and browser console
  verified after the final redeployment.
- GSAP and ScrollTrigger moved out of the initial client bundle and initialized
  during browser idle time without removing the approved story motion.
- Home-route First Load JS reduced from 204 kB to 160 kB; local optimized
  Lighthouse runs scored Performance 90–93 with LCP 2.9–3.2 s and CLS 0.
- Optimized public Preview reverified at Performance 90, Accessibility 100,
  Best Practices 100, LCP 2.7 s, TBT 210 ms and CLS 0.
- Four owner-supplied product screenshots replace fictional interface mockups in
  the exact narrative order: start, today, return and progress.
- Desktop sticky storytelling, mobile document flow and reduced-motion static
  fallback passed browser/CDP verification.
- A stale removed-scene motion target was caught by a new console regression and
  fixed; the final browser contract reports no GSAP missing-target warnings.
- Keyboard traversal, exact Telegram/email targets and honest unavailable
  destinations passed.
- Persian RTL `/privacy` and `/terms` routes passed JavaScript-disabled static
  HTML verification with canonical metadata and email links.
- Task 6 Lighthouse mobile: Performance 97, Accessibility 100, Best Practices
  100, SEO 100, LCP 2.6 s, TBT 40 ms and CLS 0.
- Home First Load JS is 120 kB, with 102 kB shared.

## In Progress

- Clean exact-source deployment and deployed smoke verification.

## Remaining

- Web app and Café Bazaar URLs; Instagram, LinkedIn and Pinterest destinations;
  approved QR codes and branded Open Graph artwork.
- Owner/counsel review of the pre-release privacy and terms drafts.
- Production domain, SSL, DNS verification and final handover.

## Active Change Request

CR-LANDING-007 — Product story, legal routes and Preview verification.

## Resume Point

When all official inputs are available, run `pnpm check:release`, create a
production deployment, then start the coordinated domain/DNS/SSL checklist.

## Blockers

Production remains blocked by verified distribution/social destinations, QR
codes, branded Open Graph art, legal review, domain approval and DNS access. The
four product screenshots, Telegram, contact, privacy and terms inputs are no
longer missing.

## Next Automatic Action

Deploy the exact Task 6 commit only to `learnbox-landing-preview`, verify it and
hand the immutable Preview URL to the owner. Do not begin production-domain,
DNS, SSL or server work.
