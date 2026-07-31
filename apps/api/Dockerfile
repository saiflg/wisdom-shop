# Production image for the API. The .dev variant next to this file runs
# `nest start --watch` against a bind mount; this one compiles once and ships
# only what is needed to run.

# ---- deps: install everything, including devDependencies, to build with ----
FROM node:20-alpine AS deps
WORKDIR /workspace

# Prisma's query engine dlopens libssl. Without it the engine guesses
# "openssl-1.1.x" and fails at runtime on modern Alpine — a failure that only
# appears once the first query runs, not at build time.
RUN apk add --no-cache openssl
RUN corepack enable

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json ./apps/api/package.json
RUN pnpm install --frozen-lockfile --filter @wisdom-shop/api...

# ---- build: compile TypeScript and generate the Prisma client ----
FROM deps AS build
WORKDIR /workspace
COPY apps/api ./apps/api
WORKDIR /workspace/apps/api
RUN pnpm prisma:generate && pnpm build

# ---- runtime: production dependencies plus the compiled output ----
FROM node:20-alpine AS runtime
WORKDIR /workspace

RUN apk add --no-cache openssl tini
RUN corepack enable

ENV NODE_ENV=production

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json ./apps/api/package.json
RUN pnpm install --frozen-lockfile --prod --filter @wisdom-shop/api...

COPY --from=build /workspace/apps/api/dist ./apps/api/dist
COPY --from=build /workspace/apps/api/prisma ./apps/api/prisma

# Generated here rather than copied from the build stage. Copying looked
# cheaper but does not work: pnpm's store is a tree of symlinks, and a glob
# COPY of @prisma+client* flattens two entries onto the same path
# ("cannot copy to non-directory"). Generating against this stage's own
# node_modules is both simpler and guaranteed to match it.
#
# This is also why `prisma` is a runtime dependency and not a devDependency:
# the migrate service in docker-compose.prod.yml runs `prisma migrate deploy`
# from this same image, so the CLI has to be here regardless.
WORKDIR /workspace/apps/api
RUN pnpm prisma:generate
WORKDIR /workspace

# node:20-alpine ships an unprivileged `node` user. Running as root would
# mean a code-execution bug in a dependency owns the container.
#
# Deliberately NOT `chown -R /workspace`. The application only ever reads
# these files, and root-owned files are world-readable, so the recursive
# chown buys nothing — while copying every inode in node_modules into a new
# layer, which roughly doubles the image and took over ten minutes to build
# on a bind-mounted Windows volume. Ownership is only changed where the
# process actually needs to write.
USER node

WORKDIR /workspace/apps/api
EXPOSE 4000

# tini reaps zombies and, more importantly here, forwards SIGTERM to node so
# Nest's shutdown hooks actually run instead of the process being killed.
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main.js"]
