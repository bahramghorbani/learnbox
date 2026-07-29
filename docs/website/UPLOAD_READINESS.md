# LearnBox Landing Upload Readiness

## Current verdict

```text
PREVIEW UPLOAD READY
PRODUCTION UPLOAD BLOCKED BY VERIFIED CONTENT
```

Checked commit: set at the next clean pre-upload checkpoint.

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

- `pnpm test`: 13/13 passed.
- `pnpm typecheck`: passed.
- `pnpm build`: passed; 11 static routes generated.
- Repository-wide `pnpm check`: passed, including format, lint, all workspace
  tests and every security/content/release verifier.
- `pnpm check:preview`: passed.
- `pnpm check:release`: blocked as designed while production inputs are absent.
- Security headers verified on the production server.
- `/`, `/robots.txt`, `/sitemap.xml`, `/manifest.webmanifest`, `/icon.svg` and the
  summer social image return HTTP 200.

## Browser evidence

- Chrome-compatible in-app browser: 1440×900, 1024×768 and 390×844; zero
  horizontal overflow and zero console warnings/errors.
- Safari: full RTL document and all ten story chapters exposed; page scroll smoke
  test passed.
- Firefox: full RTL document and all ten story chapters exposed.
- Mobile menu: opens with the correct expanded state and closes with Escape.
- Internal anchors: all targets exist.
- Placeholder CTA: fixed live status remains visible in the current viewport.
- DOM audit: one H1, no duplicate IDs, no unnamed buttons, no images without alt,
  and no nested interactive controls.

## Lighthouse baseline

Local production build, simulated mobile:

| Category       | Score |
| -------------- | ----: |
| Performance    |    91 |
| Accessibility  |   100 |
| Best Practices |   100 |
| SEO            |   100 |

Key metrics:

- First Contentful Paint: 0.8 s
- Speed Index: 1.3 s
- Total Blocking Time: 60 ms
- Cumulative Layout Shift: 0
- Largest Contentful Paint: 3.4 s under Lighthouse throttling

Lighthouse was pinned to `12.8.2` because the registry dependency graph for
`13.4.1` was temporarily inconsistent during QA.

## Production blockers

`pnpm check:release` names every missing item:

1. Web app URL.
2. Café Bazaar URL.
3. Telegram URL.
4. Instagram URL.
5. LinkedIn URL.
6. Pinterest URL.
7. Privacy URL.
8. Terms URL.
9. Contact URL.
10. Owner-approved real product screenshots.
11. Owner-approved QR codes generated from the final destinations.
12. Owner-approved branded Open Graph artwork.

No destination should be inferred from a username or an unverified search result.

## Upload boundary

The repository-root `vercel.json` deploys the learner web app. The landing must
never be uploaded from that project.

Create or connect a separate Vercel project with:

```text
Root Directory: apps/learnbox-website
Framework: Next.js
Build Command: pnpm build
Output Directory: .next
```

Do not attach `learnboxapp.com` until the preview deployment has passed the smoke
test in `DEPLOYMENT_RUNBOOK.md`.
