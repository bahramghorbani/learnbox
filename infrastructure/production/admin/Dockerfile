FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

FROM base AS dependencies
WORKDIR /workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/admin/package.json apps/admin/package.json
COPY packages/content-models/package.json packages/content-models/package.json
RUN --mount=type=cache,id=pnpm-admin,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @learnbox/admin...

FROM dependencies AS builder
COPY apps/admin apps/admin
COPY packages/content-models packages/content-models
COPY content content
ARG NEXT_PUBLIC_LEARNBOX_ADMIN_PASSKEY_UI_ENABLED=false
ENV NEXT_PUBLIC_LEARNBOX_ADMIN_PASSKEY_UI_ENABLED=$NEXT_PUBLIC_LEARNBOX_ADMIN_PASSKEY_UI_ENABLED
RUN pnpm --filter @learnbox/admin build

FROM node:22-bookworm-slim AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs nextjs
WORKDIR /app
COPY --from=builder --chown=nextjs:nodejs /workspace/apps/admin/.next/standalone ./
# Next standalone tracing omits pg's pnpm symlink target; keep the filtered runtime tree.
COPY --from=dependencies --chown=nextjs:nodejs /workspace/node_modules/.pnpm ./node_modules/.pnpm
COPY --from=dependencies --chown=nextjs:nodejs /workspace/apps/admin/node_modules ./apps/admin/node_modules
COPY --from=builder --chown=nextjs:nodejs /workspace/apps/admin/.next/static ./apps/admin/.next/static
COPY --from=builder --chown=nextjs:nodejs /workspace/apps/admin/public ./apps/admin/public
USER nextjs
EXPOSE 3000
CMD ["node", "apps/admin/server.js"]
