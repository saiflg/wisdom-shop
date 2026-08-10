# Production image for the Wisdom Campus ERP API. The .dev variant next to
# this file runs `nest start --watch` against a bind mount; this one compiles
# once and ships only what is needed to run.
#
# Two things make this image different from apps/api/Dockerfile, and both are
# load-bearing:
#
#   1. There are TWO Prisma schemas — control and tenant — so both clients are
#      generated, into node_modules/ems-control-client and ems-tenant-client.
#   2. The Prisma CLI and the tenant migrations directory must survive into the
#      runtime image. Onboarding a school shells out to `prisma migrate deploy`
#      against that school's freshly created database (see
#      provisioning/migration-runner.ts, which resolves the binary at
#      process.cwd()/node_modules/.bin/prisma). An image without the CLI boots
#      perfectly and then fails the first time somebody creates a school.

# ---- deps: install everything, including devDependencies, to build with ----
FROM node:20-alpine AS deps
WORKDIR /workspace

# Prisma's query engine dlopens libssl. Without it the engine guesses
# "openssl-1.1.x" and fails at runtime on modern Alpine — a failure that only
# appears once the first query runs, not at build time.
RUN apk add --no-cache openssl
RUN corepack enable

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/ems-api/package.json ./apps/ems-api/package.json
RUN pnpm install --frozen-lockfile --filter @wisdom-shop/ems-api...

# ---- build: generate both clients, then compile TypeScript ----
FROM deps AS build
WORKDIR /workspace
COPY apps/ems-api ./apps/ems-api
WORKDIR /workspace/apps/ems-api
# Generate before build, not after: src imports types from both generated
# clients, so `nest build` does not typecheck without them present.
RUN pnpm prisma:generate && pnpm build

# ---- runtime: production dependencies plus the compiled output ----
FROM node:20-alpine AS runtime
WORKDIR /workspace

RUN apk add --no-cache openssl tini
RUN corepack enable

ENV NODE_ENV=production

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/ems-api/package.json ./apps/ems-api/package.json
RUN pnpm install --frozen-lockfile --prod --filter @wisdom-shop/ems-api...

COPY --from=build /workspace/apps/ems-api/dist ./apps/ems-api/dist
# The whole prisma directory, not just the schemas: migrations/ is what
# `migrate deploy` actually applies, both to the control database at deploy
# time and to each new school's database at onboarding time.
COPY --from=build /workspace/apps/ems-api/prisma ./apps/ems-api/prisma

# Generated here rather than copied from the build stage. Copying looked
# cheaper but does not work: pnpm's store is a tree of symlinks, and a glob
# COPY of the generated clients flattens entries onto the same path
# ("cannot copy to non-directory"). Generating against this stage's own
# node_modules is both simpler and guaranteed to match it.
#
# This is also why `prisma` is a runtime dependency rather than a
# devDependency — see the note at the top about school onboarding.
WORKDIR /workspace/apps/ems-api
RUN pnpm prisma:generate

# Photographs of children and staff, and generated PDFs. Created and chowned
# here so the volume mounted over it in docker-compose.prod.yml inherits the
# ownership — a volume mounted onto a root-owned directory is itself
# root-owned, and the first photo upload then fails with EACCES.
RUN mkdir -p /var/lib/wisdom-campus/storage && chown -R node:node /var/lib/wisdom-campus/storage

# node:20-alpine ships an unprivileged `node` user. Running as root would mean
# a code-execution bug in a dependency owns the container.
#
# Deliberately NOT `chown -R /workspace`: the application only reads those
# files, root-owned files are world-readable, and the recursive chown copies
# every inode in node_modules into a new layer for no benefit.
USER node

EXPOSE 4001

# tini reaps zombies and, more importantly here, forwards SIGTERM to node so
# Nest's shutdown hooks actually run instead of the process being killed —
# which matters because those hooks disconnect the per-tenant Prisma clients.
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main.js"]
