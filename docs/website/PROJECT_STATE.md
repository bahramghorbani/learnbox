# LearnBox Website Project State

## Current Release

Version: 1.0 verified public preview
Status: PREVIEW DEPLOYED — PRODUCTION CONTENT BLOCKED

## Current Phase

Phase: Production-input gate

## Current Task

Collect and verify the official production destinations and assets.

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

## In Progress

- Owner-approved production URLs, product captures, QR codes and social artwork.

## Remaining

- Verified URLs, QR codes, official social destinations, approved product screenshots and production content.
- Production domain, SSL, DNS verification and final handover.

## Active Change Request

CR-LANDING-006 — Upload readiness and deployment safeguards.

## Resume Point

When all official inputs are available, run `pnpm check:release`, create a
production deployment, then start the coordinated domain/DNS/SSL checklist.

## Blockers

Production remains blocked by verified destinations, approved screenshots, QR
codes, branded Open Graph art, domain approval and DNS access. Preview has no
remaining infrastructure blocker.

## Next Automatic Action

Collect verified production content, run `check:release`, and notify the owner
before beginning any production-domain or server work.
