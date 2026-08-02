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

**Phase 2b (done): the edu-handoff onboarding is wired up.** A customer who
clicks "Complete Your School Setup" on a license (apps/api's existing
`createHandoffToken`/`verifyHandoffToken` in
`apps/api/src/licenses/edu-handoff.ts`, unchanged) now lands on a real
`apps/ems` page that provisions their school and logs them straight into
its dashboard — no more placeholder external domain.

- `EDU_SETUP_REDIRECT_URL` now points at `apps/ems`'s own `/onboarding`
  page (`http://localhost:3001/onboarding` in dev).
- `apps/ems-api` verifies the token itself
  (`onboarding/edu-handoff-token.ts`) — a byte-for-byte reimplementation of
  the shop's verification logic, not shared code, since the two apps are
  otherwise fully independent. `EDU_SETUP_SIGNING_SECRET` is the one
  deliberate exception to "every cross-app secret must be distinct" (see
  the JWT-secret-naming note above): both apps need the identical value to
  compute the same HMAC.
- `School.licenseKey` (unique, nullable) makes a license activate **at
  most one school, ever**. The shop mints a fresh token on every click, so
  a repeat click is the normal case, not a replay — `POST
  /v1/onboarding/from-license` treats a known `licenseKey` as "already
  done" (`{ alreadyOnboarded: true, schoolSlug }`) and returns the
  existing school rather than erroring or re-provisioning. Verified: a
  real, unmodified click of the shop's own button, through a real signed
  token, actually lands on a working dashboard — not just typechecked, not
  just a synthetic e2e token.
- `apps/ems`'s `/login` now accepts `?schoolSlug=` to prefill the field —
  the "already set up" page links there after a repeat click.
- **Docker gotcha hit again during this phase, same class as before**:
  `docker compose restart <service>` does **not** re-read `.env` for an
  already-created container — only `docker compose up -d <service>`
  (recreate) does. Spent real time chasing a stale
  `EDU_SETUP_REDIRECT_URL` because of this before remembering. Same fix
  needed after adding the new `/onboarding` route itself: Next's dev-mode
  file watcher didn't pick up the new route on this machine until the
  container was restarted (the same watch-mode quirk noted elsewhere in
  this file) — a route that 404s despite the files visibly existing in the
  container is that, not a real routing bug.

**Phase 3 (done): AI curriculum engine, phase 1 — settings, subjects, and
AI-generated schemes of work.** The owner's full vision is 12+ AI-generated
content types across 3 modes; this phase proves the pattern end-to-end for
**one** content type (Schemes of Work) so every later type is a repeat of an
already-working shape, not a new architecture. Verified: `typecheck`/`lint`/
unit tests pass in both apps, **4/4 e2e suites (16/16 tests)** pass including
the new `schemes-of-work.e2e-spec.ts`, and the full flow was walked manually
in a real browser — set mode to Hybrid, create a subject, manually create a
scheme of work, add a second week, publish it, and confirm the AI-generate
button surfaces a clear "not configured" message with no `GEMINI_API_KEY`
set.

- **AI provider: Google Gemini** (`@google/genai`), not the owner's original
  provider assumption — confirmed with the owner mid-phase. `src/ai/
  gemini.service.ts` follows the exact same "disabled until configured"
  posture as the shop's own payment providers: `GeminiService.isConfigured`
  is checked before any network call, and `generateJson<T>()` throws a 503
  immediately if `GEMINI_API_KEY` isn't set. No key is in `.env` yet — the
  owner does not have one ready (an earlier note in this file claiming
  otherwise was wrong and has been corrected).
- **Curriculum mode gates only AI generation, never manual editing.** A
  `MANUAL`-mode school gets a 403 from `POST /v1/schemes-of-work/generate`;
  manual create/edit/publish always work regardless of mode. `HYBRID` means
  both paths are offered. See `can-generate-with-ai.ts` for the one-line
  pure function this gate reduces to.
- **`CurriculumSettings` is a real singleton row per school**, seeded at
  provisioning time (`ProvisioningService.seedSchoolAdmin`) via a
  count-then-create check in the same tenant-client session already open
  there — not lazily created on first read. A school that predates this
  migration (`demo-academy`) needed a one-time manual SQL backfill to
  restore that invariant; any future new-tenant-table migration should ask
  "does an existing school need a backfill?" before assuming provisioning
  alone covers it.
- Gemini's structured-output mechanism (`config.responseSchema`) is an
  OpenAPI 3.0 **subset** — no `$ref`/`oneOf`/`patternProperties`, and
  `propertyOrdering` is required to pin field order since JS object key
  order isn't guaranteed in the model's response. See
  `scheme-of-work-prompt.ts` for the schema actually used.
- Generation is synchronous within the HTTP request (one LLM call), same
  simplification already used for school provisioning — revisit with a
  queue only if a later phase adds bulk "generate the whole term" jobs.
- **E2e test hook timeouts, not a real bug**: `schemes-of-work.e2e-spec.ts`'s
  `beforeAll`/`afterAll` need an explicit `120000`ms timeout (Jest's default
  is 60s) — a cold `ts-jest` compile of the whole `AppModule` graph plus a
  real school-provisioning cycle routinely exceeds the default on this
  machine, same reasoning as `tenant-isolation.e2e-spec.ts`'s two-provision
  test.
- **A genuinely confusing false alarm this phase**: the new e2e suite
  failed with a 401 on a freshly-provisioned school's own admin login —
  looked exactly like a real auth/provisioning bug. Root cause was Docker
  Desktop itself destabilizing mid-test-run (confirmed separately by `docker
  info` hanging and Postgres needing a slow fsync-recovery restart
  afterward) — rerunning the identical test once the stack was healthy
  passed cleanly. If a login fails right after provisioning with no other
  code changes nearby, check `docker compose ps`/Postgres health before
  assuming the new code is wrong.
- **Browser-automation click delivery is not reliable after resizing the
  viewport mid-session** in this environment — `resize_window` on a tab
  desynced coordinate mapping so real clicks (and even `dispatchEvent`)
  silently stopped reaching React's handlers, while `form_input` and direct
  `onClick` invocation via `__reactProps` kept working. A brand-new tab that
  never had `resize_window` called on it clicked normally. Not an app bug —
  confirmed by reproducing the same silent failure on the pre-existing,
  unmodified Classes page's "New class" button.
- One real (minor) app bug found and fixed during the manual walkthrough:
  the schemes-of-work list page (`apps/ems/app/(dashboard)/schemes-of-work/
  page.tsx`) shared one `formError` state between the "Create manually" and
  "Generate with AI" forms, so a 503 from a failed generate attempt stayed
  visible after switching to the manual form. Fixed by clearing the error
  whenever the mode toggle buttons are clicked.

**Phase 4 (done): AI curriculum engine, phase 2 — lesson plans.** The first
test of Phase 3's claim that later content types are "a repeat of an
already-working shape, not a new architecture" — and it held: `LessonPlan`
reuses the same mode-gated generate / manual-create / edit / publish /
PUBLISHED-only-read-scoping shape, reusing `canGenerateWithAi` and
`GeminiService` unchanged. No new architecture, no changes to the Phase 3
modules. Verified: `typecheck`/`lint`/unit tests pass in both apps, **5/5
e2e suites (21/21 tests)** pass including the new `lesson-plans.e2e-spec.ts`.

- **A lesson plan expands one week of a scheme of work**, keyed
  `@@unique([schemeOfWorkId, weekNumber])`. The AI prompt is built from that
  specific week's topic/objectives/activities (see `lesson-plan-prompt.ts`),
  so generation is grounded in the scheme the school already wrote rather
  than starting from the subject name alone. `weekNumber` is validated
  against the parent scheme's actual `content.weeks` — asking for week 99 of
  a 2-week scheme is a 404, not a silently-created orphan.
- Content shape is `{ objectives, materials, introduction, developmentSteps,
  conclusion, assessment, homework }` — flat, one level deep, well inside
  Gemini's reliable nesting depth.
- The scheme-of-work detail page now links per week to either the existing
  lesson plan or a prefilled create form
  (`/lesson-plans?schemeOfWorkId=…&weekNumber=N`), which is the main way
  teachers will actually reach this feature.
- **Real bug found in the manual walkthrough, present in Phase 3's code too:**
  prefilling a `<select>` via React Hook Form's `defaultValue` silently loses
  the value when the option list is still loading — the browser falls back to
  the first option, so arriving from a "create a lesson plan for week 1" link
  would quietly attach the plan to *the wrong scheme of work*. Fixed in both
  `lesson-plans/page.tsx` and `schemes-of-work/page.tsx` with a `useEffect`
  that calls `setValue` once the list resolves. Worth remembering for every
  future `<select>` prefilled from query params against async-loaded options.
  Confirmed fixed in a real browser afterwards: following "create a lesson
  plan for week 1" from the English Language scheme now preselects English
  Language (it previously fell back to Mathematics), and the created plan
  attaches to the right scheme.
- **Watch mode bit again, in a way tests can't catch**: the running `ems-api`
  dev server had not picked up `LessonPlansModule`, so the browser got
  `Cannot GET /v1/lesson-plans` while the e2e suite passed happily — e2e
  builds its own in-process `AppModule` and never touches the dev server.
  A route 404ing in the browser right after adding a module is this, not a
  routing bug; `docker compose restart ems-api` and wait for the new routes
  to appear in the logs before concluding anything.
- **`docker compose up -d ems-api` (recreate) resets the container's
  `node_modules` to the image's state**, which predates `@google/genai` —
  the `@google/genai` symlink survives but dangles into the workspace-root
  pnpm store, so `tsc` fails with "Cannot find module '@google/genai'" while
  `ls node_modules/@google` still shows it. Same dangling-symlink class as
  the note further down, and the fix is the same:
  `docker compose exec ems-api pnpm install` inside the container, then
  restart. Recreating (not just restarting) `ems-api` will need this again.

**Phase 5 (done): AI curriculum engine, phase 3 — quizzes.** Chosen over a
third prose-block content type because quizzes introduce something the
earlier types didn't have: stored content that contains answers a student
must never receive. Verified: typecheck/lint clean in both apps, 23 unit
tests, **6/6 e2e suites (28/28 tests)**.

- **The answer key is stripped at the service layer**, not split into a
  separate table — one source of truth that can't drift. `strip-answers.ts`
  is a pure function with its own unit tests, and it *fails closed*:
  anything it can't parse as a question list becomes an empty question set
  rather than passing an unrecognised field through. It rebuilds each
  question rather than `delete`-ing, so it can't corrupt the object a
  staff-facing caller is holding.
- The e2e suite asserts the invariant from the outside as well as the unit
  level: a student fetching a PUBLISHED quiz gets the prompts and options
  but no `correctAnswer` on either list or detail, the answer *text* appears
  nowhere in the serialised payload, and staff still get the answers. One
  unit test deliberately checks the serialised form, because
  `toHaveProperty` still passes for `{ correctAnswer: undefined }`.
- **Quizzes are deliberately not unique per week**, unlike lesson plans — a
  week can have a quiz and a retest — so they carry a title to tell them
  apart, and the scheme-of-work page links to the filtered list rather than
  to a single quiz.

**Architecture correction, part A (done): enterprise ERP shell.** The owner
reviewed the app and directed a refactor into a true enterprise ERP layout
before any further features. Part A covers the shell; per-school
communication/payment gateway settings (part B) and a separated Super Admin
portal (part C) are still outstanding.

- **Module navigation moved to a left sidebar; the top header now holds
  global controls only** (search, notifications, AI assistant, language,
  theme, school name, profile, sign out). `dashboard-nav.tsx` is gone.
- **`lib/navigation.ts` is the whole module tree as data** — nine groups,
  ~100 leaves, matching the owner's spec. A leaf with an `href` is a real
  route; a leaf without one is rendered **visibly disabled with a "Soon"
  badge, never as a link that 404s**. That was a deliberate deviation raised
  with the owner up front: ~90 of the specified items have no backend yet,
  and this repo's standing rule is that a control which looks real but does
  nothing is worse than no control. Giving a module an `href` is the single
  edit that turns it on.
- Sidebar does rail collapse, independent per-group expand, nav search,
  favorites, recently-used, role-based visibility and active highlight,
  persisted to localStorage. Hydration happens in an effect, not the store
  initializer, so server and first client render agree.
- **i18n is dependency-free and typed**: English is the source of truth,
  `TranslationKey` is `keyof typeof en`, and `Dictionary` widens values to
  `string`. That last part matters — leaving `as const` on the values made
  every English string its own literal type, so a translated locale could
  only ever repeat the English text verbatim (39 type errors on the first
  French file). Other locales are `Partial<Dictionary>` and fall back to
  English per key rather than rendering blank; the language selector marks
  incomplete locales "(partial)". French ships as a shell-only locale to
  prove the fallback path works end to end.
- Locale resolution is currently user-override -> default. The intended
  final order is user-override -> school default -> default, and the school
  default lands with school profile settings in part B.
- Post-login now lands on a real `/dashboard` overview whose widgets are all
  driven by data that actually exists — no placeholder charts.
- Two real bugs found and fixed during the walkthrough: `?? []` outside a
  `useMemo` dependency rebuilt the array every render and defeated the memo;
  and nav search rendered the owning group name only for live links, so
  searching "atten" gave two identical "Attendance" rows with no way to tell
  Students from Staff.

**Explicitly deferred, still not part of any phase so far:** daily lesson
notes, exams/worksheets/marking guides, PDF/Word/Excel export,
per-country curriculum-standard databases, subdomain-based tenant routing,
custom domains, per-school branding, the AI Teacher / live classroom,
2FA/lockout/real CSRF double-submit, payment gateways for schools,
messaging, automated backups, and a platform-admin onboarding UI (schools
are provisioned via API/script only — the edu-handoff flow above is the one
exception, and it's self-service by design, not an admin UI).

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
