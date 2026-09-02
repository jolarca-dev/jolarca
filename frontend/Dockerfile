# JOL Marketplace frontend — multi-stage production build.
# Targets: `dev` (compose live-reload) and `runner` (production, standalone).
# Security: lockfile-only installs, no secrets in any layer (all runtime
# configuration arrives via environment), non-root runtime user.

# --- Stage 1: dependencies (lockfile-only; no lifecycle scripts) ------------
FROM node:26-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# --- Dev target (docker-compose.dev.yml) -------------------------------------
FROM deps AS dev
COPY . .
# Dev runs as the stock `node` user (uid 1000) so files written into the
# ./frontend bind mount (.next, caches) stay host-writable — running as
# root poisons the checkout with root-owned build artifacts.
USER node
EXPOSE 3000
CMD ["npm", "run", "dev"]

# --- Stage 2: builder ---------------------------------------------------------
FROM deps AS builder
WORKDIR /app
# NEXT_PUBLIC_* are baked into the client bundle at build time; compose
# passes them as build args (runtime env cannot reach the bundle).
ARG NEXT_PUBLIC_API_URL=
ARG NEXT_PUBLIC_SITE_URL=
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
ARG NEXT_PUBLIC_MEDIA_HOSTNAME=
ARG NEXT_PUBLIC_OTEL_ENDPOINT=
ARG NEXT_PUBLIC_PLAUSIBLE_API=
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} \
    NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL} \
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=${NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY} \
    NEXT_PUBLIC_MEDIA_HOSTNAME=${NEXT_PUBLIC_MEDIA_HOSTNAME} \
    NEXT_PUBLIC_OTEL_ENDPOINT=${NEXT_PUBLIC_OTEL_ENDPOINT} \
    NEXT_PUBLIC_PLAUSIBLE_API=${NEXT_PUBLIC_PLAUSIBLE_API}
COPY . .
# next/font fetches Google Fonts at build time (self-hosted output). In
# restricted networks it degrades to fallback families — never fails the build.
RUN npm run build

# --- Stage 3: runner (minimal surface) -----------------------------------------
FROM node:26-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# The runner only executes `node server.js` — the npm CLI bundled in the
# base image is dead weight and a CVE surface (trivy CRITICAL: npm's
# vendored tar). Strip it; installs happen in the deps stage.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

# Compliance: run as non-root (node:node).
RUN addgroup -S node 2>/dev/null || true \
    && adduser -S nextjs -G node

# Only the standalone server + static assets + public files ship.
COPY --from=builder --chown=nextjs:node /app/.next/standalone ./
COPY --from=builder --chown=nextjs:node /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:node /app/public ./public

USER nextjs
EXPOSE 3000

# Alpine ships busybox wget — no curl install needed (smaller attack
# surface). Probe the dedicated liveness route, not a rendered page.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD wget -qO /dev/null http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server.js"]
