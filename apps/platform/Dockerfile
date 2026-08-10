# Production image for the Super Admin console.
#
# This portal runs on its own origin, not a path under the school portal, so
# that a platform token is unreachable from school-portal JavaScript. That
# separation is only real if it is also a separate deployment — hence its own
# image rather than a route inside apps/ems.

# ---- deps ----
FROM node:20-alpine AS deps
WORKDIR /workspace
RUN corepack enable

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/platform/package.json ./apps/platform/package.json
RUN pnpm install --frozen-lockfile --filter @wisdom-shop/platform...

# ---- build ----
FROM deps AS build
WORKDIR /workspace
COPY apps/platform ./apps/platform

# No NEXT_PUBLIC_* build args: nothing about the backend reaches the browser
# bundle. But EMS_API_URL is still needed HERE, at build time, not at run
# time — next.config.mjs reads it inside rewrites(), and Next resolves
# rewrites into .next/routes-manifest.json during the build rather than
# re-running the config function at startup. Supplied only at runtime, the
# fallback http://localhost:4001 gets baked in and every API call from the
# browser fails with ECONNREFUSED while the pages themselves still serve 200.
ARG EMS_API_URL=http://ems-api:4001
ENV EMS_API_URL=${EMS_API_URL}

ENV NEXT_TELEMETRY_DISABLED=1

WORKDIR /workspace/apps/platform
RUN pnpm build

# ---- runtime ----
FROM node:20-alpine AS runtime
WORKDIR /app

RUN apk add --no-cache tini
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3002

COPY --from=build --chown=node:node /workspace/apps/platform/.next/standalone ./
COPY --from=build --chown=node:node /workspace/apps/platform/.next/static ./apps/platform/.next/static

USER node
EXPOSE 3002

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "apps/platform/server.js"]
