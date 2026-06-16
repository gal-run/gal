# ══════════════════════════════════════════════════════════════════════════════
# GAL Dashboard (Next.js) — Production Dockerfile (OSS / standalone build)
# ══════════════════════════════════════════════════════════════════════════════
#
# This image builds the open-source, single-tenant GAL Dashboard. The former
# @gal/* git submodules are vendored inline under src/vendored-gal/** and
# src/ee/vendored-gal-api/** and resolved via tsconfig "paths", so there are NO
# private submodules and NO private workspace packages to fetch.
#
# All NEXT_PUBLIC_* values below are build-time ARGs with safe public defaults.
# Provide your own at build time, e.g.:
#
#   docker build \
#     --build-arg NEXT_PUBLIC_API_URL=https://api.example.com \
#     --build-arg NEXT_PUBLIC_FIREBASE_API_KEY=$YOUR_FIREBASE_WEB_API_KEY \
#     -t gal-dashboard .
#
# NOTE: a Firebase *web* API key is not a secret (it is shipped to browsers), but
# this repo never hardcodes a real one — pass your own via the build arg / env.
# To enable the Enterprise surface, also pass NEXT_PUBLIC_GAL_EE_LICENSE_KEY and
# set GAL_EE_LICENSE_KEY at runtime.
# ══════════════════════════════════════════════════════════════════════════════

# ─────────────────────────────────────────────────────────────────────────────
# Stage 1: Builder
# ─────────────────────────────────────────────────────────────────────────────
FROM node:24-alpine AS builder

WORKDIR /app

RUN apk add --no-cache python3 py3-setuptools make g++ curl

RUN corepack enable && corepack prepare pnpm@10.20.0 --activate

# NEXT_PUBLIC_* vars are baked into the client JS bundle at build time.
# Override any of these with --build-arg. Defaults are non-secret placeholders.
ARG NEXT_PUBLIC_API_URL=http://localhost:3000
ARG NEXT_PUBLIC_FIREBASE_API_KEY=""
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=""
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID=""
ARG NEXT_PUBLIC_FIREBASE_DATABASE_URL=""
ARG NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=""
ARG NEXT_PUBLIC_GITHUB_APP_SLUG=""
ARG NEXT_PUBLIC_BACKGROUND_AGENT_GITHUB_REPO=""
ARG NEXT_PUBLIC_SENTRY_DSN=""
ARG NEXT_PUBLIC_ENVIRONMENT=production
ARG NEXT_PUBLIC_ADMIN_ORGS=""
# Leave EE disabled by default (single-tenant). Set to a gal-ee-... key to enable.
ARG NEXT_PUBLIC_GAL_EE_LICENSE_KEY=""

ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_FIREBASE_API_KEY=$NEXT_PUBLIC_FIREBASE_API_KEY \
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN \
    NEXT_PUBLIC_FIREBASE_PROJECT_ID=$NEXT_PUBLIC_FIREBASE_PROJECT_ID \
    NEXT_PUBLIC_FIREBASE_DATABASE_URL=$NEXT_PUBLIC_FIREBASE_DATABASE_URL \
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=$NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET \
    NEXT_PUBLIC_GITHUB_APP_SLUG=$NEXT_PUBLIC_GITHUB_APP_SLUG \
    NEXT_PUBLIC_BACKGROUND_AGENT_GITHUB_REPO=$NEXT_PUBLIC_BACKGROUND_AGENT_GITHUB_REPO \
    NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN \
    NEXT_PUBLIC_ENVIRONMENT=$NEXT_PUBLIC_ENVIRONMENT \
    NEXT_PUBLIC_ADMIN_ORGS=$NEXT_PUBLIC_ADMIN_ORGS \
    NEXT_PUBLIC_GAL_EE_LICENSE_KEY=$NEXT_PUBLIC_GAL_EE_LICENSE_KEY

# Install dependencies (no private registries, no submodules).
COPY package.json pnpm-workspace.yaml tsconfig.json ./
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --no-frozen-lockfile

# Copy source and build.
COPY src ./src
COPY public ./public
COPY next.config.ts postcss.config.mjs instrumentation.ts \
     sentry.client.config.ts sentry.edge.config.ts sentry.server.config.ts ./

RUN pnpm build

# Verify standalone output was produced
RUN test -d .next/standalone

# Copy static assets and public into standalone (required for Next.js standalone)
RUN cp -r .next/static .next/standalone/.next/static && \
    cp -r public .next/standalone/public

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2: Production Runtime
# ─────────────────────────────────────────────────────────────────────────────
FROM node:24-alpine

WORKDIR /app

RUN apk add --no-cache wget

# Copy the self-contained standalone output (includes its own node_modules)
COPY --from=builder /app/.next/standalone ./

# Create non-root user for security (UID 1001)
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001 -G nodejs

RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

CMD ["node", "server.js"]
