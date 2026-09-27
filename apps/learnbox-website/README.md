# LearnBox Marketing Website

Public RTL-first marketing site. `apps/website` remains the separate learner web app.

```bash
pnpm --filter @learnbox/marketing-website dev
pnpm --filter @learnbox/marketing-website test
pnpm --filter @learnbox/marketing-website typecheck
pnpm --filter @learnbox/marketing-website build
pnpm --filter @learnbox/marketing-website check:preview
pnpm --filter @learnbox/marketing-website check:release
```

The copied BuBu PNG files are checksum-identical derivatives of the canonical v2 assets; never edit them. DuDu's supplied reference is protected as a reference only, not used as a production scene asset.

Public URLs are configured through `.env.example`. Unknown destinations remain
plain unavailable states; never add guessed URLs directly to a component.

Deployment must use a separate Vercel project with Root Directory
`apps/learnbox-website`. The repository-root Vercel project belongs to the learner
web app.

See:

- `docs/website/UPLOAD_READINESS.md`
- `docs/website/DEPLOYMENT_RUNBOOK.md`
