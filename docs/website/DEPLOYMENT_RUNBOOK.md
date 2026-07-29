# LearnBox Landing Deployment Runbook

## 1. Safe local gate

From the repository root:

```bash
pnpm --filter @learnbox/marketing-website test
pnpm --filter @learnbox/marketing-website typecheck
pnpm --filter @learnbox/marketing-website build
pnpm --filter @learnbox/marketing-website check:preview
```

The preview gate must print:

```text
PREVIEW UPLOAD READY
```

## 2. Vercel project boundary

Use a separate Vercel project for the landing:

```text
Root Directory: apps/learnbox-website
```

Do not modify or reuse the existing LearnBox learner-app project. Its root config
targets `apps/website`.

The app-local `vercel.json` provides:

```text
Framework: nextjs
Install: pnpm install --frozen-lockfile
Build: pnpm build
Output: .next
```

## 3. Preview deployment

Preview may use the honest unavailable states. Do not attach the public domain.

After Vercel access is available:

1. Import the existing GitHub repository as a new Vercel project.
2. Set Root Directory to `apps/learnbox-website`.
3. leave production destinations empty for the first preview.
4. Deploy the preview.
5. Record the preview URL and deployment identifier.

## 4. Preview smoke test

Verify on the generated preview URL:

- page title and Persian RTL hero,
- mobile menu and Escape behavior,
- all ten scenes,
- no horizontal overflow,
- no console errors or failed assets,
- `/robots.txt`,
- `/sitemap.xml`,
- `/manifest.webmanifest`,
- Open Graph metadata,
- placeholder CTAs show the visible unavailable notice,
- preview is not attached to `learnboxapp.com`.

## 5. Production content

Copy `.env.example` to `.env.production.local` only for local validation. Do not
commit the local file.

Fill the verified public values:

```text
NEXT_PUBLIC_SITE_URL
NEXT_PUBLIC_WEB_APP_URL
NEXT_PUBLIC_CAFE_BAZAAR_URL
NEXT_PUBLIC_TELEGRAM_URL
NEXT_PUBLIC_INSTAGRAM_URL
NEXT_PUBLIC_LINKEDIN_URL
NEXT_PUBLIC_PINTEREST_URL
NEXT_PUBLIC_PRIVACY_URL
NEXT_PUBLIC_TERMS_URL
NEXT_PUBLIC_CONTACT_URL
```

After approved screenshots, QR codes and final Open Graph art are versioned, set:

```text
LEARNBOX_PRODUCT_SCREEN_STATUS=approved
LEARNBOX_QR_STATUS=approved
LEARNBOX_OG_STATUS=approved
```

Then run:

```bash
pnpm --filter @learnbox/marketing-website check:release
```

The production gate must print:

```text
PRODUCTION UPLOAD READY
```

## 6. Production promotion

Production promotion, domain attachment and DNS changes require owner approval.

Before attaching `learnboxapp.com`:

1. Save the last known-good deployment identifier.
2. Save the current DNS records outside the repository.
3. Confirm SSL provisioning can complete.
4. Promote the verified preview.
5. Attach the domain.
6. Verify HTTPS, canonical URL, robots, sitemap and every official destination.

## 7. Rollback

If smoke tests fail:

1. Remove or revert the domain assignment to the last known-good deployment.
2. Use Vercel deployment rollback/promote on the recorded stable deployment.
3. If DNS changed, restore the saved records.
4. Keep the failed deployment for diagnosis; do not overwrite the stable commit.
5. Re-run the preview gate and smoke tests before a second promotion.

The landing has no learner database or migration. Rolling back it must not modify
`apps/website`, `apps/mobile`, API state or learner data.
