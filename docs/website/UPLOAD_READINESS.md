# LearnBox Landing Upload Readiness

## Current verdict

```text
PREVIEW UPLOAD READY
PRODUCTION UPLOAD BLOCKED BY VERIFIED CONTENT
```

Task 6 source commit and immutable Preview URL are recorded after the clean
verification commit is deployed.

Target package:

```text
apps/learnbox-website
```

Protected packages:

```text
apps/website
apps/mobile
```

## Automated evidence

- Website tests: 26 passed and 1 browser-environment test skipped in the normal
  suite; the browser-environment contract passed 14/14 against the built site.
- Website typecheck: passed.
- Website build: passed; 13 static routes generated. Home First Load JS is
  120 kB, with 102 kB shared.
- Repository-wide `pnpm check`: passed, including format, lint, all workspace
  tests and every security/content/release verifier.
- `pnpm check:preview`: passed.
- `pnpm check:release`: blocked as designed while production inputs are absent.
- Repository-wide `pnpm check`: passed, including format, lint, all workspace
  typechecks/tests and every repository verification script.
- The new immutable Preview checks are recorded below after the verification
  commit is deployed.

## Browser evidence

- In-app browser at 1440×900, 1024×768 and 390×844: Persian RTL identity,
  exact product order `start → today → return → progress`, no horizontal
  overflow, failed images, framework overlay or console errors.
- Desktop/laptop: the device remains CSS-sticky while the page scrolls normally;
  copy and owner-supplied screenshot stay synchronized down and back up.
- Mobile: four ordinary vertical cards, no swiper and no sticky device.
- Reduced motion: all four stages are static, visible and require no transform or
  opacity transition.
- Keyboard traversal reaches header anchors, the product/download flow, footer,
  Telegram, privacy, terms and email. Every interactive target has a meaningful
  name and a visible 3 px focus outline.
- `/privacy` and `/terms` render readable Persian RTL HTML with JavaScript
  disabled, canonical metadata and `mailto:hi@learnboxapp.com`; neither route
  depends on the landing client runtime.
- Product-story screenshots and legal mobile evidence are versioned under
  `docs/website/evidence/`.

## Verified public preview

The previous landing baseline was deployed as an isolated Vercel Preview:

```text
Project: learnbox-landing-preview
Project ID: prj_pPFcSkNaFvEWvKKAOxPNcbLmWEsd
Deployment ID: dpl_B3eeC2EfZ3uZy75jFT42kFuEgg5A
URL: https://learnbox-landing-preview-m7e6nc7ud-learn-box.vercel.app
Target: Preview
```

Task 6 will replace this paragraph with its immutable source SHA, deployment ID
and Preview URL after deploying only to the same `learnbox-landing-preview`
project. Production, `learnboxapp.com`, DNS, SSL and server state remain outside
this task.

## Lighthouse baseline

Local production build, simulated mobile:

| Category       | Score |
| -------------- | ----: |
| Performance    |    97 |
| Accessibility  |   100 |
| Best Practices |   100 |
| SEO            |   100 |

Key metrics:

- First Contentful Paint: 0.8 s
- Speed Index: 1.1 s
- Total Blocking Time: 40 ms
- Cumulative Layout Shift: 0
- Largest Contentful Paint: 2.6 s under Lighthouse throttling
- Home-route First Load JS: 120 kB; shared First Load JS: 102 kB

The Task 6 run used Lighthouse `12.8.2`, simulated mobile 390×844, a new clean
Chrome profile and the built local site. GSAP and ScrollTrigger remain deferred
outside the initial home bundle.

## Production blockers

`pnpm check:release` names every missing item:

1. Web app URL.
2. Café Bazaar URL.
3. Instagram URL.
4. LinkedIn URL.
5. Pinterest URL.
6. Owner-approved QR codes generated from the final destinations.
7. Owner-approved branded Open Graph artwork.
8. Owner/counsel review of the pre-release privacy and terms drafts.

Telegram (`https://t.me/learnboxapp`), contact
(`mailto:hi@learnboxapp.com`), `/privacy`, `/terms` and the four owner-supplied
product screenshots are now present and verified. The legal pages are honest
pre-release product drafts for owner/counsel review; they are not legal advice
or a claim of legal approval.

No destination should be inferred from a username or an unverified search result.

## Upload boundary

The repository-root `vercel.json` deploys the learner web app. The landing must
never be uploaded from that project.

The separate Vercel project now exists with:

```text
Root Directory: apps/learnbox-website
Framework: Next.js
Build Command: pnpm build
Output Directory: .next
```

The Preview smoke test has passed. Do not attach `learnboxapp.com` until all
production blockers above are supplied, `pnpm check:release` passes and the
owner explicitly starts the production-domain step.
