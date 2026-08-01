# Wisdom Shop — Progress Notes

Working notes for continuing this build across sessions. See
[`docs/PHASES.md`](docs/PHASES.md) for the full phase-by-phase feature
breakdown and the verification log — this file is about *state*, not
features.

## Current state

**All 15 phases are built; 1–5, 7, 8, 10–15 are verified for real** (6 and 9
are partial — see below) — not just written and eyeballed. The Docker
Compose stack builds and runs, a real migration is applied to a real
Postgres, the seed script runs, and the auth + catalog + cart + checkout +
payment flows have been exercised over real HTTP (including through the
browser's same-origin proxy path). `lint` / `typecheck` / `build` /
**75 API unit tests** / **141 API e2e tests** / **31 frontend tests** all
pass.

- **Phase 1** — monorepo, Docker Compose, CI, Prisma schema
- **Phase 2** — auth: register/login/refresh-rotation/2FA/password-reset/RBAC
- **Phase 3** — catalog: categories + products (public browse & admin CRUD),
  demo seed data, and the storefront + auth UI in `apps/web`
- **Phase 4** — cart: user-scoped cart API with server-side pricing, stock
  enforcement, line merging, IDOR protection; add-to-cart, `/cart` page,
  header badge
- **Phase 5** — checkout: addresses, order creation with price snapshotting
  and atomic stock decrement, `/checkout`, `/orders`, `/orders/[number]`
- **Phase 6 (partial)** — Stripe **and Paystack** payments: checkout/
  transaction initiation, signature-verified idempotent webhooks, amount
  reconciliation, explicit order status transitions, frontend Pay button
  gated on configured providers. **Flutterwave and PayPal are not built.**
- **Phase 7** — order management: admin listing/filter/search, status
  transitions sharing the payment `canTransition` table, restock-on-cancel
  (idempotent), shipment tracking, append-only status history
- **Phase 8** — vendor marketplace: onboarding + admin approval (which
  grants/revokes the VENDOR role), ownership-scoped vendor product
  management, commission snapshotted onto order lines, earnings view
- **Phase 9 (partial)** — licensing: idempotent license issuance when an
  order is paid, human-transcribable keys, and the signed short-lived
  "Complete Your School Setup" handoff into the separate EMS portal.
  **Secure file downloads are not built** (needs object storage first).
- **Phase 10** — customer dashboard: `/account` overview, security page
  (password + full TOTP 2FA enrolment with recovery codes), address book,
  and licenses with a working "Complete Your School Setup" button
- **Phase 11** — admin dashboard: role management API plus `/admin`,
  `/admin/orders`, `/admin/vendors`, `/admin/users`
- **Phase 12** — analytics: settled-revenue summary and best sellers, with
  the currency actually reported rather than assumed
- **Phase 13** — security hardening: account lockout with a backoff ladder,
  a strict rate-limit bucket for credential routes, NUL bytes rejected at
  the edge
- **Phase 14** — testing: the frontend had zero tests; it now has 31 across
  five suites, running in CI through the existing root `test` script
- **Phase 15** — production deployment: production Dockerfiles (multi-stage,
  non-root, tini for signal handling), `docker-compose.prod.yml` with
  migrations as a separate one-shot container, nginx TLS termination, and
  `docs/DEPLOYMENT.md`

See "Verification log" in [`docs/PHASES.md`](docs/PHASES.md) for the real
bugs found and fixed along the way.

## Next up

The 15 phases are complete. What remains is work that was deferred inside
them, listed here so it is not mistaken for done.

**Finishing Phase 9 — secure downloads.** Blocked on a real decision rather
than effort: digital goods need time-limited signed URLs from object
storage, and no S3/R2 client is wired up. `STORAGE_*` env vars are reserved.
Once a bucket exists, the shape is: an entitlement check (does this user own
a paid order line for this product?) producing a short-lived signed URL —
the authorization half mirrors the license ownership checks that already
exist.

**Finishing Phase 6 — Flutterwave and PayPal.** The env schema and the
frontend's provider gating already account for them; there are no providers
behind them. Also still missing: admin-initiated refunds. The refund
*webhook* is handled, but nothing calls the provider's refund API.

**Carried over:** coupons (`Coupon` exists, `Order.couponId` is always
null); Meilisearch indexing (it runs in Compose but nothing writes to it —
search is a SQL `contains`); and a shared order-status transition table so
the admin orders screen stops offering moves the server will refuse.

**Never run against a real server.** The production stack builds and is
written to be correct, but the first deploy will be the first time it meets
a real hostname, a real certificate and a real proxy. `docs/DEPLOYMENT.md`
lists what must change before that.

**This section is stale.** It described the repo before commits started;
`git log` is now the authoritative source for what's actually landed —
refunds (Phase 6d), coupons, search indexing, and more have shipped and been
committed since this was written.

## apps/ems — "Wisdom Campus" (new, 2026-08-01)

A second app in this monorepo, separate from the shop: an AI-powered
multi-tenant school management and learning platform (school admin,
curriculum engine, an AI Teacher, per-school branding). The scope the owner
described for it is genuinely enterprise-scale — comparable to PowerSchool
plus an AI tutoring engine — not something any single session builds in
full, so this is being taken in phases like the shop was.

**Phase 1 (done):** the app is scaffolded (Next 14, own Docker service on
port 3001, own `package.json`/tests/lint/typecheck, all passing) and serves
a real "coming soon" page — no fake buttons or features that go nowhere.
The shop's nav ("School Management Software") links to it at
`NEXT_PUBLIC_EMS_URL`; the coming-soon page links back via
`NEXT_PUBLIC_SHOP_URL`. Both default to the right localhost port in dev.

**Phase 2 (done): the school-admin foundation.** A real backend —
`apps/ems-api` (NestJS + two Prisma schemas) — and a working school-admin
console in `apps/ems`. Verified end to end: `typecheck`/`lint`/unit tests
pass in both apps, **7/7 e2e tests** pass (provisioning + tenant isolation,
including a 40-request concurrent test proving no cross-school leakage),
and the full flow — provision a school, log in, create a class, create a
student, link a guardian — was walked through manually in a real browser.

- **True per-school data isolation**: every school gets its **own Postgres
  database** (`wisdom_ems_school_<slug>`), not shared-schema-with-tenant-id.
  A **control-plane database** (`wisdom_ems_control`) holds the `School`
  registry and platform operators who onboard new schools.
  `TenancyService` resolves and caches a `PrismaClient` per school; which
  school a request belongs to is carried via **`AsyncLocalStorage`**
  (`tenancy/tenant-context.ts`), not a Nest `REQUEST`-scoped provider —
  deliberately, to avoid Nest's DI-subtree-contagion cost. See
  `tenancy/tenant-context.interceptor.ts` for why it has to be an
  `APP_INTERCEPTOR` wrapping a `new Observable(...)`, not middleware and not
  a bare `next.handle()` call.
- **Two separate JWT universes**: school-user tokens and platform-operator
  tokens use entirely different secret names
  (`EMS_JWT_ACCESS_SECRET`/`EMS_JWT_REFRESH_SECRET` vs
  `PLATFORM_JWT_ACCESS_SECRET`/`PLATFORM_JWT_REFRESH_SECRET`) — deliberately
  NOT reusing the shop's own `JWT_ACCESS_SECRET` name, since this whole
  monorepo shares one dev `.env` via `env_file`, and reusing a name would
  hand two unrelated apps the identical signing secret.
- **`ems-api`'s `DATABASE_URL` is intentionally poisoned** in
  `docker-compose.yml` (a bogus host that fails DNS) rather than inherited
  from the shared `.env`. The tenant Prisma schema reads `DATABASE_URL`
  directly when its migrations are run by hand; without this override, a
  `prisma migrate dev --schema=prisma/tenant/schema.prisma` run without an
  explicit `-e DATABASE_URL=...` would have silently targeted
  **the shop's own database**. Always pass that override explicitly for
  tenant-schema commands — see the schema file's own header comment.
- **Auth is deliberately simpler than the shop's**: JWT access+refresh,
  argon2id, simple rotate-and-revoke. No 2FA, no lockout ladder, no real
  CSRF double-submit (just the shop's own cheap header-presence check) —
  explicitly deferred to a security-hardening phase, same as the shop
  phased that in as Phase 13 rather than at its foundation.
- **Onboarding a school** (`POST /v1/platform/schools`) creates the
  database, runs `prisma migrate deploy` against it (shelled out via
  `execFile`, never `exec`), seeds the first `SCHOOL_ADMIN`, and records
  every step in `ProvisioningAttempt` — both `CREATE DATABASE` and
  `migrate deploy` are naturally idempotent, so a `FAILED` school can be
  safely retried via `POST /v1/platform/schools/:id/retry-provisioning`.
  `scripts/provision-demo-school.ts` is the stand-in for a platform-admin
  onboarding UI, which is out of scope for this phase.
- One real bug worth remembering if `TenantPrismaService` ever throws
  "outside a tenant-scoped request" again: `AccessTokenStrategy.validate()`
  returns `{ id, schoolId, schoolSlug, roles }` (matching
  `AuthenticatedUser`), not the JWT payload's own `sub` claim —
  `TenantContextInterceptor`'s type guard must check `.id`, not `.sub`.
  Silently mismatched by TypeScript once already, because the guard reads
  from an `unknown`-typed `req.user`.
- E2e tests firing genuinely concurrent requests through Supertest need
  `server.listen(0)` bound explicitly in `beforeAll` — without it,
  Supertest's implicit per-request listen/teardown races itself under
  concurrency and produces `ECONNRESET`/Postgres `57P01` errors that look
  exactly like a real tenant-isolation bug but aren't. Same fix the shop's
  own `refresh-race.e2e-spec.ts` already uses.

**Not yet connected:** the shop already has a signed handoff mechanism for
this exact purpose — `createHandoffToken`/`verifyHandoffToken` in
`apps/api/src/licenses/edu-handoff.ts`, used when a customer completes a
"School Setup" purchase (see Phase 9 above). `EDU_SETUP_REDIRECT_URL`
currently points at a placeholder external domain, not at this app. Wiring
that up — an `/onboarding` route in `apps/ems` that verifies the token with
the shared `EDU_SETUP_SIGNING_SECRET` — is the natural next phase, now that
apps/ems has a real school-admin console for a verified purchaser to land
on and manage.

**Explicitly deferred, not part of Phase 2:** subdomain-based tenant
routing, custom domains, per-school branding, the AI curriculum engine, the
AI Teacher / live classroom, 2FA/lockout/real CSRF double-submit, payment
gateways for schools, messaging, automated backups, and a platform-admin
onboarding UI (schools are provisioned via API/script only for now).

**Owner has AI provider API keys ready** for when the AI Teacher phase
starts; not yet added to `.env`.

**Working notes specific to apps/ems-api:**
- Two Prisma schemas in one package (`prisma/control/schema.prisma`,
  `prisma/tenant/schema.prisma`) each need their own `generator client {
  output }` — and that output **must** be under `node_modules`
  (`node_modules/ems-control-client`, `node_modules/ems-tenant-client`),
  never under `src/generated/...`. `tsc` only copies files it actually
  compiles from `src` into `dist`; a plain-JS Prisma client living under
  `src/generated` works at dev time (`nest start --watch`) but is silently
  absent from the compiled `dist/` output, so the packaged app crashes on
  boot with `Cannot find module`. This is exactly the bug that shipped
  once already in this phase.
- Docker anonymous volumes for `node_modules` can end up in a broken state
  (dangling pnpm symlinks — packages show up in a plain `ls` but resolve to
  nothing) after a sequence of manual `pnpm install` + image rebuild +
  container recreate. If a container reports "Cannot find module" for a
  package you can see listed in `node_modules`, don't keep restarting —
  `docker compose rm -f -s -v <service>` (drops the anonymous volume too)
  then `docker compose up -d <service>` for a genuinely clean container.

## Working notes for this machine

- **No local Node.js** — all JS tooling runs via
  `docker compose exec api pnpm ...` / `docker compose exec web pnpm ...`.
- **Watch mode doesn't reliably see host file edits.** Docker Desktop on
  Windows doesn't forward inotify events across the bind mount. This is
  confirmed for `nest start --watch` (`apps/api`) and, despite an earlier
  note here claiming otherwise, has now also been observed for `next dev`
  (`apps/web`) — a homepage rewrite kept serving the pre-edit page across
  several fresh navigations until the container was restarted. After
  editing either app from the Windows side, run
  `docker compose restart api` / `docker compose restart web` and confirm
  the change actually shows up before trusting it — don't assume either
  dev server recompiled on its own.
- **Schema changes** — always
  `docker compose exec api pnpm exec prisma migrate dev --name <name>`;
  never hand-edit `apps/api/prisma/migrations/`.
- **Lockfile** — `pnpm-lock.yaml` is committed and CI uses
  `--frozen-lockfile`. After `pnpm add` inside a container, regenerate it
  workspace-wide (a lockfile generated inside the `api` or `web`
  container alone only covers that one package, because each Dockerfile
  only copies its own `package.json`):
  ```
  docker run --rm -v "/c/Users/User/Desktop/wisdom-shop:/repo" -w /repo \
    node:20-alpine sh -c "corepack enable && pnpm install --lockfile-only"
  ```

## Things intentionally deferred (not bugs, just not built yet)

- **"Add to cart" button** — omitted on purpose until the Phase 4 cart API
  exists behind it. A button that looks real but does nothing is worse
  than no button.
- **Live payment gateways** (Stripe/Paystack/Flutterwave/PayPal) — Phase 6
  will write real SDK integrations, but actually charging a card needs
  the project owner's own sandbox/live keys. Claude will not be given or
  asked to enter those.
- **Live outbound email** — `MailerService` sends for real once
  `SMTP_HOST` is set; until then it logs to console by design, so auth
  flows stay testable without mailing real inboxes.
- **BullMQ processors, S3/R2 uploads, Meilisearch indexing** — env vars
  are reserved; wiring lands in the phases that need them. Product images
  are currently plain URLs (the seed uses Unsplash), not uploads.
- **Role management API** — there's no endpoint to grant/revoke roles yet
  (Phase 11). The catalog e2e test promotes its own admin directly via
  Prisma because of this.
