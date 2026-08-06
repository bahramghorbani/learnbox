FROM node:22-bookworm-slim AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable

FROM base AS dependencies

WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/website/package.json apps/website/package.json
COPY apps/api/package.json apps/api/package.json
COPY packages/billing-core/package.json packages/billing-core/package.json
COPY packages/learning-engine/package.json packages/learning-engine/package.json

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile \
      --filter @learnbox/website... \
      --filter @learnbox/api...

FROM dependencies AS builder

COPY apps/website apps/website
COPY apps/api apps/api
COPY packages/billing-core packages/billing-core
COPY packages/learning-engine packages/learning-engine
COPY database/migrations database/migrations

ENV NEXT_TELEMETRY_DISABLED=1

RUN pnpm --filter @learnbox/website build

FROM node:22-bookworm-slim AS runner

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nextjs

WORKDIR /app

COPY --from=builder --chown=nextjs:nodejs /workspace/apps/website/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /workspace/apps/website/.next/static ./apps/website/.next/static
COPY --from=builder --chown=nextjs:nodejs /workspace/apps/website/public ./apps/website/public
COPY --from=builder --chown=nextjs:nodejs /workspace/apps/api/dist ./apps/api/dist
COPY --from=builder --chown=nextjs:nodejs /workspace/database/migrations ./database/migrations

USER nextjs

EXPOSE 3000

CMD ["node", "apps/website/server.js"]
