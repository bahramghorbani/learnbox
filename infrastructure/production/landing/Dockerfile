FROM node:22-bookworm-slim AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable

FROM base AS dependencies

WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/learnbox-website/package.json apps/learnbox-website/package.json

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @learnbox/marketing-website...

FROM dependencies AS builder

COPY apps/learnbox-website apps/learnbox-website

ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_SITE_URL=https://learnboxapp.com

RUN pnpm --filter @learnbox/marketing-website build

FROM node:22-bookworm-slim AS runner

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nextjs

WORKDIR /app

COPY --from=builder --chown=nextjs:nodejs /workspace/apps/learnbox-website/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /workspace/apps/learnbox-website/.next/static ./apps/learnbox-website/.next/static
COPY --from=builder --chown=nextjs:nodejs /workspace/apps/learnbox-website/public ./apps/learnbox-website/public

USER nextjs

EXPOSE 3000

CMD ["node", "apps/learnbox-website/server.js"]
