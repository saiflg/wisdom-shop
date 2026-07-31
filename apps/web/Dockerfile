# Production image for the web app. The .dev variant next to this file runs
# `next dev` against a bind mount; this one builds once and serves the
# compiled output.

# ---- deps ----
FROM node:20-alpine AS deps
WORKDIR /workspace
RUN corepack enable

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json ./apps/web/package.json
RUN pnpm install --frozen-lockfile --filter @wisdom-shop/web...

# ---- build ----
FROM deps AS build
WORKDIR /workspace
COPY apps/web ./apps/web

# Baked into the bundle at build time, so it must be present now rather than
# at container start. It is a public URL, not a secret.
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}
ENV NEXT_TELEMETRY_DISABLED=1

WORKDIR /workspace/apps/web
RUN pnpm build

# ---- runtime ----
FROM node:20-alpine AS runtime
WORKDIR /app

RUN apk add --no-cache tini
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# The standalone output already contains the traced node_modules and its own
# server.js, so there is no install step here at all.
COPY --from=build --chown=node:node /workspace/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /workspace/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /workspace/apps/web/public ./apps/web/public

USER node
EXPOSE 3000

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "apps/web/server.js"]
