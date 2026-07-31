# Wisdom Shop

**Everything Educational in One Place**

An educational marketplace: books, courses, school/university management
software, educational equipment, and more.

This is a multi-phase build; see [`docs/PHASES.md`](docs/PHASES.md) for the
roadmap and what's implemented so far, and [`PROGRESS.md`](PROGRESS.md) for
the current session's working notes and next steps.

## Stack

- **Web** — Next.js 14 (App Router), TypeScript, Tailwind CSS
- **API** — NestJS, Prisma ORM, PostgreSQL
- **Cache/Queue** — Redis, BullMQ (queue processors land in a later phase)
- **Search** — Meilisearch
- **Infra** — Docker Compose (dev), GitHub Actions (CI)

## What works today (Phases 1–3)

- **Accounts** — register, sign in, TOTP two-factor, refresh-token
  rotation with stolen-token reuse detection, password reset, email
  verification, and role-based access control.
- **Catalog** — hierarchical categories and products with images,
  variants, and 11 product types; public browse with search, category,
  type, and sort filters plus pagination; admin CRUD behind role gates.
- **Storefront** — home, shop (`/products`), product detail
  (`/products/[slug]`), sign-in and sign-up pages, dark/light mode.

Cart, checkout, payments, orders, and the admin UI are Phases 4–11 and
are **not** built yet — see [`docs/PHASES.md`](docs/PHASES.md) for the
full status table and an explicit "known gaps" list.

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) — **required**, since this machine does not have Node.js installed locally.
- Node.js 20+ and pnpm 9+ — only needed if you want to run `apps/web` / `apps/api` outside Docker.

## Quick start (Docker — recommended, no local Node needed)

```bash
cp .env.example .env
docker compose up --build
```

- Web: http://localhost:3000
- API: http://localhost:4000
- API docs (Swagger): http://localhost:4000/docs
- API health check: http://localhost:4000/health

First run only — apply the committed migrations:

```bash
docker compose exec api pnpm prisma migrate deploy
```

Optional — seed roles/permissions and a super admin account (set
`SEED_SUPER_ADMIN_EMAIL` / `SEED_SUPER_ADMIN_PASSWORD` in `.env` first):

```bash
docker compose exec api pnpm prisma:seed
```

## Quick start (local Node, no Docker for the apps)

```bash
cp .env.example .env
corepack enable
pnpm install
docker compose up -d postgres redis meilisearch
pnpm --filter @wisdom-shop/api exec prisma migrate deploy
pnpm dev
```

Then sign in at http://localhost:3000/login with the seeded super admin
credentials from your `.env`.

## Project layout

```
apps/
  web/    Next.js storefront (App Router)
  api/    NestJS REST API + Prisma schema
.github/workflows/ci.yml   Lint, typecheck, build, test on every push/PR
docker-compose.yml         Postgres, Redis, Meilisearch, api, web
```

## Development notes

- **Editing `apps/api` from Windows requires a restart.** Docker Desktop
  on Windows doesn't forward filesystem events across the bind mount, so
  `nest start --watch` won't notice your edits — run
  `docker compose restart api`. (`next dev` recompiles per request, so
  `apps/web` picks up changes without a restart.)
- **Schema changes** — use
  `docker compose exec api pnpm exec prisma migrate dev --name <name>`;
  don't hand-edit `apps/api/prisma/migrations/`.
- **Don't run `pnpm build` for `web` while its dev server is running.**
  Both write to the same `apps/web/.next` directory, so they corrupt each
  other — the build fails with `PageNotFoundError: Cannot find module for
  page: /`, and the dev server starts 500ing. Build with dev stopped:
  ```bash
  docker compose stop web
  rm -rf apps/web/.next
  docker compose run --rm --no-deps web pnpm build
  docker compose up -d web
  ```
- **Adding a dependency** takes three steps, and skipping any of them
  fails in a confusing way:
  1. `docker compose exec web pnpm add <pkg>` (or `api`).
  2. Regenerate the lockfile **with the whole workspace mounted** — a
     lockfile generated inside a single service container only covers
     that one package, and CI's `--frozen-lockfile` will reject it:
     ```bash
     docker run --rm -v "$PWD:/repo" -w /repo node:20-alpine \
       sh -c "corepack enable && pnpm install --lockfile-only"
     ```
  3. Recreate the container so its `node_modules` picks up the change:
     ```bash
     docker compose rm -sfv web && docker compose up --build -d web
     ```
     The `-v` matters. `apps/*/node_modules` is an anonymous volume (it
     shadows the host bind mount, which has no `node_modules`). Anonymous
     volumes survive a plain `up --build`, so without `rm -sfv` you get a
     stale `node_modules` and a "Cannot find module" error at build time
     even though the package is installed in the pnpm store.

## Environment variables

See [`.env.example`](.env.example) for the full list (database, Redis,
JWT secrets, storage, payment providers, notifications, monitoring).
Nothing in this repo talks to a live third-party service yet — payment,
storage, and notification provider keys are read from env but the
integrations themselves are built out in later phases.

## Scripts (from repo root)

| Command             | Description                          |
| -------------------- | ------------------------------------- |
| `pnpm dev`           | Run web + api in parallel (local)     |
| `pnpm build`         | Build all workspace packages          |
| `pnpm lint`          | Lint all workspace packages           |
| `pnpm typecheck`     | Typecheck all workspace packages      |
| `pnpm test`          | Run unit tests in all workspace packages |

E2E tests need a running database:

```bash
docker compose exec api pnpm test:e2e
```

They share one Postgres with no per-test isolation, so **don't hit the API
or database from anywhere else while they run** — concurrent writes will
produce confusing, unreproducible failures.
