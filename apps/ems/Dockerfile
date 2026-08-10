# Production image for the school portal. The .dev variant next to this file
# runs `next dev` against a bind mount; this one builds once and serves the
# compiled output.

# ---- deps ----
FROM node:20-alpine AS deps
WORKDIR /workspace
RUN corepack enable

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/ems/package.json ./apps/ems/package.json
RUN pnpm install --frozen-lockfile --filter @wisdom-shop/ems...

# ---- build ----
FROM deps AS build
WORKDIR /workspace
COPY apps/ems ./apps/ems

# Baked into the browser bundle at build time, so it must be present now
# rather than at container start. A public URL, not a secret.
ARG NEXT_PUBLIC_SHOP_URL
ENV NEXT_PUBLIC_SHOP_URL=${NEXT_PUBLIC_SHOP_URL}

# EMS_API_URL must ALSO be a build argument. This is not obvious: next.config
# .mjs reads it inside rewrites(), and Next resolves rewrites at BUILD time
# into .next/routes-manifest.json — it does not re-run the config function
# when the server starts. Passing it only as a runtime environment variable
# silently bakes the fallback (http://localhost:4001) into the manifest. The
# app then boots, serves every page with a 200, and fails only when the
# browser calls the API, with ECONNREFUSED to 127.0.0.1 inside the container.
#
# Defaulted to the compose service name, because that is what it always is in
# production.
ARG EMS_API_URL=http://ems-api:4001
ENV EMS_API_URL=${EMS_API_URL}

ENV NEXT_TELEMETRY_DISABLED=1

WORKDIR /workspace/apps/ems
RUN pnpm build

# ---- runtime ----
FROM node:20-alpine AS runtime
WORKDIR /app

RUN apk add --no-cache tini
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3001

# The standalone output already contains the traced node_modules and its own
# server.js, so there is no install step here at all. No public/ copy: this
# app has no public directory, and COPY of a missing path fails the build.
COPY --from=build --chown=node:node /workspace/apps/ems/.next/standalone ./
COPY --from=build --chown=node:node /workspace/apps/ems/.next/static ./apps/ems/.next/static

USER node
EXPOSE 3001

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "apps/ems/server.js"]
