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
COPY config config
COPY content content
COPY database/migrations database/migrations

ENV NEXT_TELEMETRY_DISABLED=1

# NEXT_PUBLIC_* values are inlined into the client bundle at build time, so a runtime
# env var cannot enable the learner profile-details panel (v1.2 CP-7). Pass it as a
# build arg; compose supplies the release default.
ARG NEXT_PUBLIC_LEARNBOX_PROFILE_IDENTITY_ENABLED=false
ENV NEXT_PUBLIC_LEARNBOX_PROFILE_IDENTITY_ENABLED=$NEXT_PUBLIC_LEARNBOX_PROFILE_IDENTITY_ENABLED

# LB-B35 CP4/CP5 client flags. Inlined at build time exactly like the flag above, so a runtime env
# var cannot enable or disable them in a built image — the value here IS the released behaviour.
#
# v1.2.2 activates four of them (their server counterparts are already enabled in Production):
#   QUEUE_QUARANTINE    per-item queue parsing + flush-before-logout. Default off was the v1.2.1
#                       whole-queue reset, which discarded unrelated unsent answers.
#   SERVER_SESSION_PLAN resume a review session by card identity instead of by queue index.
#   GOAL_UX_REMOVED     drop the unused learning-goal UX (onboarding gate + Profile/Settings rows).
#   SESSION_EXPIRY_UX   Persian session-ended notice + kept-answers count on the login gate.
ARG NEXT_PUBLIC_LEARNBOX_QUEUE_QUARANTINE=true
ARG NEXT_PUBLIC_LEARNBOX_SERVER_SESSION_PLAN=true
ARG NEXT_PUBLIC_LEARNBOX_GOAL_UX_REMOVED=true
ARG NEXT_PUBLIC_LEARNBOX_SESSION_EXPIRY_UX=true
# LB-B35 CP5-B binary review UI («بلد بودم» / «بلد نیستم»), web only. Already live in Production
# since CP13/D-FV-1: the deploy build passes =true explicitly, so this default must NOT be relied
# on — a build that omits the arg would ship four grades again. Left unchanged by v1.2.2.
ARG NEXT_PUBLIC_LEARNBOX_BINARY_REVIEW_UI=false
ENV NEXT_PUBLIC_LEARNBOX_QUEUE_QUARANTINE=$NEXT_PUBLIC_LEARNBOX_QUEUE_QUARANTINE
ENV NEXT_PUBLIC_LEARNBOX_GOAL_UX_REMOVED=$NEXT_PUBLIC_LEARNBOX_GOAL_UX_REMOVED
ENV NEXT_PUBLIC_LEARNBOX_SESSION_EXPIRY_UX=$NEXT_PUBLIC_LEARNBOX_SESSION_EXPIRY_UX
ENV NEXT_PUBLIC_LEARNBOX_SERVER_SESSION_PLAN=$NEXT_PUBLIC_LEARNBOX_SERVER_SESSION_PLAN
ENV NEXT_PUBLIC_LEARNBOX_BINARY_REVIEW_UI=$NEXT_PUBLIC_LEARNBOX_BINARY_REVIEW_UI

RUN pnpm --filter @learnbox/website build

FROM node:22-bookworm-slim AS runner

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

# Release provenance. A deployed artifact must be traceable back to the exact source commit it was
# built from, so the running container's identity can be proven rather than assumed. Passed as
# --build-arg APP_SOURCE_SHA=<full sha> and recorded both as a standard OCI label and as a runtime
# environment variable, so `docker image inspect` and the running container agree on one answer.
ARG APP_SOURCE_SHA=unknown
# Repeat client build arguments in the runner stage so their public values can be recorded as labels.
# They remain build-time only; runtime env cannot change the compiled Next.js client.
ARG NEXT_PUBLIC_LEARNBOX_PROFILE_IDENTITY_ENABLED
ARG NEXT_PUBLIC_LEARNBOX_QUEUE_QUARANTINE
ARG NEXT_PUBLIC_LEARNBOX_SERVER_SESSION_PLAN
ARG NEXT_PUBLIC_LEARNBOX_GOAL_UX_REMOVED
ARG NEXT_PUBLIC_LEARNBOX_SESSION_EXPIRY_UX
ARG NEXT_PUBLIC_LEARNBOX_BINARY_REVIEW_UI
LABEL org.opencontainers.image.revision="${APP_SOURCE_SHA}"
LABEL org.opencontainers.image.title="learnbox-app"
# Public build-time configuration is artifact identity. Keep it inspectable for the next release's
# preflight diff; no secret or runtime configuration belongs in these labels.
LABEL io.learnbox.release.profile_identity="${NEXT_PUBLIC_LEARNBOX_PROFILE_IDENTITY_ENABLED}"
LABEL io.learnbox.release.queue_quarantine="${NEXT_PUBLIC_LEARNBOX_QUEUE_QUARANTINE}"
LABEL io.learnbox.release.server_session_plan="${NEXT_PUBLIC_LEARNBOX_SERVER_SESSION_PLAN}"
LABEL io.learnbox.release.goal_ux_removed="${NEXT_PUBLIC_LEARNBOX_GOAL_UX_REMOVED}"
LABEL io.learnbox.release.session_expiry_ux="${NEXT_PUBLIC_LEARNBOX_SESSION_EXPIRY_UX}"
LABEL io.learnbox.release.binary_review_ui="${NEXT_PUBLIC_LEARNBOX_BINARY_REVIEW_UI}"
ENV APP_SOURCE_SHA=${APP_SOURCE_SHA}

RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nextjs

WORKDIR /app

COPY --from=builder --chown=nextjs:nodejs /workspace/apps/website/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /workspace/apps/website/.next/static ./apps/website/.next/static
COPY --from=builder --chown=nextjs:nodejs /workspace/apps/website/public ./apps/website/public
COPY --from=builder --chown=nextjs:nodejs /workspace/apps/api/dist ./apps/api/dist
COPY --from=builder --chown=nextjs:nodejs /workspace/database/migrations ./database/migrations
# Starter learning media is served by the authenticated content-media route through
# a runtime path, so it must be packaged explicitly instead of relying on Next.js
# file tracing to incidentally carry a directory it never statically imports.
COPY --from=builder --chown=nextjs:nodejs /workspace/content ./content
# The one-shot API migration runner resolves pg through the traced Website runtime.
RUN test ! -e apps/api/node_modules \
    && ln -s ../website/node_modules apps/api/node_modules \
    && test -e apps/api/node_modules/pg/package.json

USER nextjs

EXPOSE 3000

CMD ["node", "apps/website/server.js"]
