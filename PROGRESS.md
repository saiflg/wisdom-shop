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

**Architecture correction, part B (done): per-school communication and
payment gateways.** Every school owns and configures its own
email/SMS/WhatsApp/push and Paystack/Flutterwave/Stripe credentials;
nothing is shared platform-wide. Backend, settings pages and tests are all
in. `Settings → Communication gateways` and `Settings → Payment gateways`
are the **first two of the ~90 disabled sidebar entries to be turned on** —
adding an `href` in `navigation.ts` was the only nav change needed, as
designed.

- **Credentials are encrypted at rest** with AES-256-GCM
  (`TenantSecretsService`), keyed by `EMS_SETTINGS_ENCRYPTION_KEY`. That is
  a deliberate reimplementation of the shop's own `EncryptionService` rather
  than shared code — the apps are independent, and separate keys mean a leak
  of one can't decrypt the other's data. GCM over CBC because it
  authenticates: tampered ciphertext throws instead of yielding plausible
  garbage.
- **Secrets never leave the server, in any form.** Reads return a masked
  hint (`sk_••••4b7d`) via a `view` mapper; the raw `*Encrypted` columns are
  never selected into a response, since ciphertext is still material for an
  offline attack. Values of 8 characters or fewer are masked entirely —
  showing 3 of 6 characters of a weak key gives away more than it helps.
- **Blank means "leave unchanged", not "erase".** Because the form only ever
  received a mask, a save of an unrelated field sends back an empty secret;
  treating that as a write would destroy a working gateway on every edit.
  `secret-update.ts` encodes the rule (omitted/empty = keep, explicit
  `null` = clear, non-empty = replace) as a tested pure function, and the
  e2e suite asserts the round-trip.
- Rotating `EMS_SETTINGS_ENCRYPTION_KEY` makes stored secrets undecryptable.
  `tryDecrypt` returns null rather than throwing, so the settings page then
  reports the gateway as unconfigured and asks for re-entry instead of
  500-ing.
- **All settings routes are SCHOOL_ADMIN only** — a teacher has no reason to
  read even a masked hint of a payment key.
- **"Test payment" verifies credentials without moving money**, hitting a
  read-only authenticated endpoint per provider. A settings button that
  actually charged a card would be unacceptable.
- SMS is **provider-agnostic** by request: the school supplies base URL and
  credentials and the call posts a conventional payload, rather than
  hardcoding one vendor. Vendors expecting a different request shape will
  need a per-provider adapter — a known follow-up.
- The settings forms are **uncontrolled on purpose**. A secret input must
  start empty, because empty is the "keep what's stored" signal; seeding it
  from server state would either show a mask as if it were the value or
  overwrite the real secret with the mask on save. `SecretField` states the
  rule in the UI ("A value is stored (sk_••••4b7d). Leave blank to keep
  it.") and makes clearing a separate explicit action, since otherwise an
  admin editing an unrelated field reasonably fears wiping their gateway.
- Verified in a browser, not just by tests: saving a real SMTP password
  flips the card to Configured and returns only a mask, the plaintext never
  appears anywhere in the page, and a second save with the password box left
  blank changed the sender name while keeping the stored password.

**Architecture correction, part C (in progress): Super Admin portal,
starting with tenant lifecycle.** The backend is done and tested; the
console app itself is new and its browser walkthrough is the outstanding
piece.

- **`apps/platform` is a separate Next app on port 3002**, not a route group
  inside `apps/ems`. Two reasons: a school user's browser never receives
  platform-console code, and a platform token is unreachable from the school
  portal's origin. The two token families were already signed with different
  secrets server-side; this closes the browser side of the same boundary.
- **Only ACTIVE <-> SUSPENDED is a permitted transition.** PROVISIONING and
  FAILED belong to the provisioning pipeline: a school mid-provision has a
  half-built database, and "reactivating" a FAILED school would flag it
  ACTIVE without the database whose absence caused the failure. Those are
  recovered through retry-provisioning, which re-runs the idempotent steps.
  `school-lifecycle.ts` encodes this and its test asserts the whole
  4x4 status matrix, so adding a new `SchoolStatus` without deciding its
  transitions breaks the build rather than silently permitting everything.
- **`TenancyService.invalidateSchool` had zero callers before this phase.**
  Without wiring it into the transition, a suspended school would have kept
  serving requests for up to the 60s school-cache TTL. The e2e test proves
  the fix by warming the cache first, then suspending, then reusing the
  *same* token — which is refused with no wait. Known limit, deliberately
  left: that only clears the current process's cache, so other API instances
  still lag by the TTL; making it instant fleet-wide needs a shared
  invalidation channel and is a non-goal while this runs single-node.
- **`SchoolLifecycleEvent`** records who changed a school's status and why,
  with the reason required rather than optional — "this school is locked
  out" is useless to whoever picks it up next without it. The actor is
  stored by value (id + email), deliberately *not* as a foreign key, so
  deleting a departed operator's account can't cascade away the history of
  the suspensions they issued. First slice of the platform-wide audit log.
- The console has **no session refresh**: a reload returns the operator to
  login. That is a deliberate trade for an operator console — short-lived,
  non-persisted platform tokens — not an oversight.
- Module marketplace, platform analytics, monitoring, support and resellers
  are still absent, and are intentionally not shown in the console's nav
  rather than stubbed as dead links.

**Part C, subscriptions and billing (done).** Plans, per-school
subscriptions, invoicing and a revenue summary, all in the control plane
since revenue reporting has to aggregate across tenants.

- **Money is integer minor units end to end** (`*Cents`, matching the
  shop's convention) — never a float, never converted to one on the way to
  the screen. The only conversion is at the plan form's input boundary, and
  it is `Math.round(major * 100)` because `45.10 * 100` is `4509.999…`.
- **`addInterval` clamps to month end.** This is the real trap in billing
  date maths: naive `setMonth` on 31 January gives **3 March**, so a school
  billed on the 31st would skip February entirely and be charged early.
  Clamping gives 28 (or 29) February. Tested across every month, leap years
  and the 1900/2000 century rules, and all period maths is UTC so a server
  timezone change can't shift a boundary by a day.
- **Invoice numbers are allocated inside the same transaction as the
  insert.** The counter row is incremented in that transaction, so a second
  concurrent generation blocks until the first commits. The obvious
  alternative — `count() + 1` outside the transaction — hands two
  simultaneous requests the same number. The e2e fires 8 concurrent
  generations and asserts all 8 numbers are distinct.
- **Subscription price is snapshotted at subscribe time.** Repricing a plan
  must never silently change what an existing customer pays; the e2e
  reprices a plan and asserts the existing subscription is untouched.
- **PAID and VOID invoices are terminal**, and only DRAFT is editable — a
  settled financial record is corrected with a credit note, not an edit.
  CANCELED subscriptions are terminal too, so resubscribing creates a new
  one and the cancellation stays on the record.
- **Billing state never suspends a school on its own.** A PAST_DUE
  subscription is recorded but access is unaffected; cutting a customer off
  remains an explicit operator action with a reason. Automating that link
  is a policy decision the owner should make deliberately, not a default.
- Revenue reports **collected and outstanding separately** rather than one
  "revenue" number — invoiced is not received, and merging them flatters
  the dashboard.
- Not modelled yet, deliberately: mid-period proration on plan change
  (changes take effect from the next period), tax and credit notes.
- Walked in a browser afterwards: a plan created through the console at
  `45000.50` stored exactly `4500050` minor units and rendered back as
  `NGN 45,000.50` with no drift; subscribing Demo Academy snapshotted that
  price onto a correct one-month period; generating an invoice produced
  `INV-000011` whose single line summed to the total; and once paid the
  invoice showed **no action controls at all**, which is the terminal-state
  rule surfacing in the UI rather than only in the API.

**Part C, recurring billing cycle (done).** Subscription periods now
advance on their own instead of only when a human clicks.

- **The double-billing guard is a database constraint, not scheduler
  bookkeeping**: a *partial* unique index on
  `(subscriptionId, periodStart) WHERE origin = 'CYCLE'`. Correctness
  therefore does not depend on the timer firing exactly once — a second
  instance, a restart mid-run, or an operator hitting the manual trigger
  all lose the race at the database and are counted as skips. "The timer
  fired twice" is normal in any real deployment and must never cost a
  customer money.
- **A plain unique index was wrong and the full e2e run caught it.** The
  first version constrained every invoice, which also blocked an operator
  raising a legitimate second ad-hoc invoice inside the same period — two
  previously-passing billing tests failed. Narrowing it to `origin =
  'CYCLE'` keeps the guard exactly where it matters. Prisma's DSL can't
  express a partial index, so it lives in migration SQL only; Prisma still
  reports the violation as P2002.
- **Deliberately no queue.** BullMQ would add retry, backoff and per-job
  visibility, but not correctness — the constraint already provides that,
  and adding a dependency here means a lockfile regen plus a container
  rebuild, which is this environment's least reliable operation. A plain
  `setInterval` (unref'd, skipping overlapping ticks) does the job; a queue
  is the natural upgrade when operational visibility matters more.
- **Off by default** (`BILLING_CYCLE_ENABLED=false`). An accidental cycle
  charges real customers, so opting in is explicit; tests and local runs
  can never produce surprise invoices.
- Periods are **contiguous**: the next period starts where the last ended,
  not at "now", so a cycle that runs late cannot lose billable days.
  Expired trials convert to ACTIVE **without** being invoiced, and a
  scheduled `cancelAtPeriodEnd` cancels instead of renewing.
- Verified against the live system as well as by tests: forcing the demo
  school's period into the past produced exactly one invoice
  (`INV-000029`), an immediate re-run did nothing, and two manual invoices
  in that same period were both accepted — confirming the partial index is
  scoped correctly rather than merely absent.

**Attendance (done).** The first school-facing daily-operations feature:
registers per class and date, guardian/student-scoped reads, and corrections
that leave a trail.

- **`session` is `String @default("")`, deliberately not nullable.** Postgres
  treats NULLs as *distinct* in a unique index, so a nullable `session` would
  have silently defeated `@@unique([classId, date, session])` and let a class
  accumulate two whole-day registers for the same date — the exact duplicate
  the constraint exists to prevent. It was caught by a type error on the
  compound-unique where clause, not by reading the schema, which is a good
  argument for letting the database shape the types rather than the reverse.
- **A mark is never silently rewritten.** Re-submitting a register only fills
  in students who have no mark yet; changing an existing one goes through
  `PATCH /v1/attendance/records/:id`, which *requires* a reason and writes an
  `AttendanceAmendment` row in the same transaction as the update. Attendance
  is routinely used to justify decisions about a child, so corrections are
  legitimate but they have to be visible, attributed and explained.
- **Amendments store the actor by value** (`actorUserId` *and* `actorName`),
  the same call as `SchoolLifecycleEvent`: deleting a departed teacher's
  account must not erase the history of the corrections they made.
- **0/0 is `null`, not `NaN`.** `summariseAttendance` returns
  `presentRate: null` for an empty set rather than dividing by zero, so an
  unmarked student shows "—" instead of a nonsense percentage. LATE counts as
  attended; ABSENT and EXCUSED do not.
- **Guardians and students get 404, not 403**, for a child who isn't theirs —
  "that student exists but isn't yours" is itself a leak. The e2e sets up two
  unrelated families precisely so a scoping mistake has something real to
  expose, and asserts an absence note from one family never appears in the
  other's response.
- Enrollment is validated on marking: a student not enrolled in that class is
  rejected rather than quietly recorded.
- Walked in a browser afterwards on Demo Academy: marking Aisha ABSENT saved,
  the register history rendered "taken by Demo Admin", and correcting it to
  EXCUSED with a reason produced exactly one `attendance_amendments` row —
  `ABSENT -> EXCUSED | Mother phoned: medical appointment | by Demo Admin` —
  with the register itself stored as `session=[]`, the empty-string default
  doing its job.

**School fees (done).** Fee structures, per-student invoices and payments —
the first module that gives the per-school payment gateways something to
charge.

- **Two unique constraints carry the correctness, and both lean on Postgres
  NULL-distinctness on purpose.** `(studentProfileId, feeStructureId)` means
  running "raise invoices for this class" twice cannot bill a family twice,
  while ad-hoc invoices (null structure) stay unlimited. `(invoiceId,
  reference)` means a replayed gateway webhook cannot credit twice, while
  cash payments (null reference) stay unlimited. This is the same rule that
  silently broke `AttendanceRegister.session`: distinct NULLs are a tool when
  the null means "not part of this rule" and a trap when it means "no value
  yet". Worth stating explicitly, because the two cases look identical in
  the schema and behave in opposite ways.
- **Duplicate generation is reported, not raised as an error.** Re-running
  after adding a student returns `invoicesCreated: 1, duplicatesSkipped: 12`,
  because "run it again" is a normal thing for a bursar to do.
- **Overpayment is refused rather than absorbed.** Taking more than is owed
  creates a credit the school now has to track, and credits are not modelled;
  swallowing the excess would lose money that belongs to a family. The
  balance is checked in `applyPayment`, which is pure and tested against
  every boundary.
- **Status is derived from the money**, never set by hand at a call site, so
  the ledger and the badge cannot disagree — the classic finance bug is a
  PAID invoice with a balance still on it. A zero-total invoice (full
  scholarship, full waiver) settles as PAID immediately instead of sitting in
  the arrears report forever chasing 0.00.
- **Money is parsed from strings on the frontend too.**
  `Math.round(parseFloat("4500.55") * 100)` is 450055 today and a support
  ticket the day it isn't, so `parseMoneyToCents` is regex-validated and
  returns null rather than guessing — the UI refuses instead of billing a
  number nobody typed. Tested on both sides of the wire.
- **The currency locks once any invoice exists.** Every stored amount is in
  that currency's minor units, so switching would silently reinterpret the
  whole ledger.
- **Voiding is not deleting.** A family may already have been sent the
  invoice, so it stays visible with its reason appended, and voiding is
  refused outright once payments exist — that case is a refund, not an
  erasure.
- **Money handling is SCHOOL_ADMIN-only.** Teachers get no finance access at
  all. There is no BURSAR role yet; `FINANCE_ROLES` in `fees.service.ts` is
  the single place that changes when one is added.
- Payments record the actor by value (`recordedByUserId` *and*
  `recordedByName`), the same call as attendance amendments: deleting a
  departed bursar's account must not erase who took the money.
- Walked in a browser afterwards on Demo Academy: a structure typed as
  `45000.55` + `7500.5` totalled `NGN 52,501.05` live and stored `5250105`
  minor units whose lines sum exactly to the total — note `7500.5` read as
  7,500.50 and not 7,500.05. Raising invoices reported "1 raised · 0 already
  invoiced" and, on a second click, "0 raised · 1 already invoiced". An
  attempted overpayment was refused with the API's own message, and
  replaying a payment reference returned the duplicate error with the
  balance and payment count provably unchanged — the transaction rolled
  back rather than half-crediting.

**Examinations and grading (done).** Assessments, weighted marks, grade
scales and published report cards — the third leg of the attendance/fees/
grades triad.

- **Grading policy is data, not code.** Grade scales are per-school rows with
  editable bands, and weights live on each assessment. Nothing about A=70 or
  CA=40/exam=60 is baked in, because that varies by country and by school and
  hardcoding it would have made the module unusable outside one market. A
  sensible default scale is seeded at provisioning so no school is blocked on
  day one.
- **ABSENT and EXCUSED are deliberately different, and this is the whole
  point of the module.** ABSENT counts as zero — the student was assessed and
  did not score. EXCUSED is removed and the *remaining weights are
  renormalised*, so the student is judged only on what they actually sat.
  Treating them alike would either punish a child with a documented medical
  absence or hand a free pass to one who skipped. The e2e proves the
  difference in money terms: the same student scores 50% excused and would
  have scored 20% absent — a pass versus a fail.
- **Publication snapshots every grade.** `SubjectResult` stores the band
  label and remark *by value*. A school that later retunes its scale, fixes a
  weight or corrects a mark does not silently rewrite a report card a family
  already holds — the same rule as an invoice's line snapshot and a
  subscription's price. The e2e retunes A from 70 to 90 after publishing and
  asserts the issued card still reads A.
- **Publication is refused while anything is missing**, and says how much: a
  count of absent marks and the offending subject's weight total. An
  incomplete report card is worse than a late one. Weights must total exactly
  100 per subject — 90% would deflate every child in the class invisibly, and
  130% would inflate them.
- **Bands must tile 0–100 with no gap or overlap.** A scale of 70–100, 61–69,
  0–59 leaves a mark of 60 with no grade at all, and a blank where a grade
  should be is found by a parent, not by us. `validateBands` refuses it at
  the door and again at publication, in case the scale was edited in between.
- **Half marks are integers in hundredths**, and the band lookup **rounds
  half up** so 69.5% earns the higher grade. Both are stated explicitly in
  code rather than left to whatever the caller does, because rounding down at
  a boundary silently costs a student a grade.
- **Families see published results only** — a draft is working material, and
  a parent reading a half-computed grade would be told something the school
  has not decided. Marks behind published results are frozen until an
  explicit unpublish. Guardians get 404, never 403, for another family's
  child.

**Messaging that actually sends (done).** The communication gateways stored
credentials and could send a test, but nothing in the product ever sent
anything. Attendance, fees and grading now reach families.

- **A message that cannot be filled in is never sent.** `renderTemplate`
  refuses on a missing *or empty* placeholder rather than substituting a
  blank, and the outbox records exactly what was missing. "Dear ," arriving
  at a parent about their child is worse than a message that did not go —
  the first is visibly broken software, the second is a gap the school can
  see and fix. Empty counts as missing because an empty string renders the
  identical broken sentence.
- **Send-once is a unique index**, `(dedupeKey, channel, recipientAddress)`,
  where `dedupeKey` encodes the event and its subject and deliberately never
  a timestamp. Teachers re-save registers all morning as latecomers arrive;
  invoices get re-raised; results get republished after a correction. All
  three land on the key they landed on before and the database rejects the
  duplicate. Application bookkeeping would race — two teachers saving the
  same register at once both reach the insert, and exactly one wins.
- **SKIPPED is not FAILED.** No gateway configured, no address on file, or a
  template that could not render are all "there was nowhere to send", not
  "sending went wrong". Collapsing them would have schools chasing phantom
  errors on a system that is merely not set up yet. Every skip carries a
  human-readable reason, shown in the outbox rather than buried in a log.
- **Recipient resolution is pure and separately tested**, because it is the
  function that decides whether one family learns something about another
  family's child. Links for other students are never considered rather than
  filtered afterwards, so passing the whole school's links — the realistic
  careless call — is safe. Two tests assert the negative directly, including
  that another family's guardian does not even appear in the *skipped* list,
  since that is shown to staff too.
- **Notifying never blocks the school's real work.** `notify()` cannot throw
  at its caller: a mail server being down must not roll back a register, an
  invoice run or a publication.
- **Opt-out lives on the guardian link, not the guardian**, so a parent can
  mute one child's routine notifications without going silent on another's —
  the realistic case being a guardian who also works at the school.
- Default templates are seeded at provisioning and live in
  `default-templates.ts` as the single source, with a spec checking every one
  against the placeholders its event supplies. Rendering fails closed, so a
  typo in a seeded template would be a notification that can never send,
  discovered the morning someone takes a register.
- **A migration lesson worth keeping:** the `phone` column was first folded
  into the already-applied messaging migration. Prisma checksums applied
  migrations, so editing one in place leaves every database that ran the
  original permanently out of step with the file — and the demo school
  silently never got the column. Reverted and added as its own migration.
  Never edit a migration that has been applied anywhere.

**Timetable and scheduling (done).** Periods, lessons, and the two rules that
make a timetable possible rather than merely stored.

- **A class cannot be in two lessons at once; a teacher cannot be in two
  rooms at once.** Both are checked by a pure function that names what is in
  the way ("Mathematics with Grade 5A"), and enforced again by unique
  indexes, which is what actually holds when two schedulers save in the same
  second. The P2002 catch is that race arriving; rare, but a double-booked
  teacher is the one outcome that must never happen.
- **Postgres NULL-distinctness is used deliberately here, and it is the same
  behaviour that silently broke `AttendanceRegister.session`.** The unique
  index on `(teacherUserId, weekday, periodId)` only constrains real
  teachers: a lesson with nobody assigned has a null teacher, and any number
  of classes may sit unstaffed in the same slot — which is exactly what a
  half-planned term looks like. Distinct NULLs are a tool when the null means
  "this rule doesn't apply to me" and a trap when it means "no value yet".
- **Periods are minutes since midnight, not DateTime.** A period is a
  time-of-day that recurs, not an instant. A DateTime would drag in a date
  nobody means and a timezone nobody set, and 08:30 would start drifting when
  the clocks change.
- **Touching periods are allowed, overlapping ones are not.** 09:00–09:40
  followed by 09:40–10:20 is a school day; the comparison is strict for that
  reason. An actual overlap makes "which lesson is this class in right now"
  unanswerable and quietly voids the per-slot uniqueness everything else
  relies on.
- **The whole day is saved in one call**, because "no two periods overlap" is
  a property of the set, not of any row. Editing one at a time would mean
  either rejecting a legitimate intermediate state or letting the day be
  briefly incoherent. Periods sent back with their id keep the lessons
  already scheduled against them — renaming a period must not wipe a week.
- An entry being edited does not clash with itself, or saving a lesson
  without moving it would be refused.
- Families read the timetable of a class their child is actually in and get a
  404 for any other; the teacher staffing view is staff-only.
- **A type cast nearly hid a real defect.** `useReplacePeriods` had a
  malformed parameter type that typechecked only because the call site said
  `as never`. Removing the cast and naming the type properly is what made the
  check meaningful — a passing `tsc` proves nothing about code that has been
  cast out of the type system.

**Staff records and bank details (done).** The first step of the
import/export and payroll work: teachers were bare `User` rows with nowhere
to hang a staff number or the bank details payroll needs.

- **`StaffProfile` is separate from `User`** because a login and an
  employment record have different lifetimes: an account can be disabled
  while the employment record must survive for payroll history.
- **`staffNumber` is the natural key that makes staff import idempotent.**
  Re-uploading a spreadsheet must update the same person rather than create a
  second one. Unique with NULLs distinct — the third deliberate use of that
  Postgres behaviour in this codebase — so any number of staff may have no
  number assigned yet, which is the normal state before a school does its
  first import. `StudentProfile.studentCode` already served this purpose, so
  students needed nothing new.
- **A staff bank account number is the one field here that can be used to
  defraud someone directly.** It is encrypted with AES-256-GCM like the
  gateway secrets, and *masked by default everywhere*. There is deliberately
  no flag on the list or read routes to unmask it: the full value has its own
  endpoint, so seeing it is a decision someone makes rather than a default
  they inherit.
- **The mask is fixed-width**, not one bullet per hidden digit. The length of
  an account number narrows down the country and bank, and there is no reason
  to give that away. A number of four digits or fewer masks completely —
  "the last four" of a four-digit number is the whole number.
- **`toMaskedBankDetails` returns a shape with no field capable of carrying
  the full value**, so a route that forgets to mask cannot leak: there is
  nowhere for the plaintext to go.
- **Revealing a full number requires a reason and is logged before the value
  is returned.** If writing the log fails, the caller does not get the
  number — an unlogged disclosure is worse than a failed payroll run, because
  only one of the two is recoverable. Actor and subject are stored by value,
  like attendance amendments, so deleting an account cannot erase the record.
- **Omitting `accountNumber` leaves it alone; sending an empty string clears
  it.** Without that distinction, editing a job title would silently wipe
  someone's bank details, or there would be no way to remove them at all.
- The e2e checks the **actual database column**, not the API response — the
  first version of that test only proved the API hides the number, which is
  not the same as proving a database dump would not reveal it.
- Deliberately **not** built yet: salary, pay periods, deductions and tax. A
  lone salary field would suggest payroll is half-done when none of the
  decisions behind it have been made.

**Spreadsheet import and export (done).** Students, staff, parents, subjects
and classes move in and out as `.xlsx` or `.csv`, with a blank template, a
full export, and an upload that is checked and shown before anything is
written.

- **Import never writes on the first call.** Upload returns a per-row account
  — creates, updates, and problems reported against *the spreadsheet's own
  row numbers* — and committing is a separate request. A file that quietly
  creates four hundred students or overwrites the ones already there is not
  undoable in any way a school would recognise. The person fixing the file is
  looking at the file, which is why row numbers count the header.
- **A matching key is an update, not a second copy of the same person.** This
  is what `studentCode` and `staffNumber` are for, and it is what makes
  "export, fix it in Excel, upload again" safe rather than a way to double
  the roster.
- **Structural faults are all-or-nothing; bad rows are not.** A missing
  required column means this is the wrong file, and importing the readable
  half of the wrong file is worse than importing none of it. A single typo,
  though, must not block four hundred correct rows — so bad rows are skipped
  and listed.
- **Everything is read and written as text.** `"007"` is not seven and
  `"0123456789"` is not `123456789`. Excel dropping a leading zero silently
  mis-identifies a child or misdirects a salary.
- **Staff exports carry masked account numbers only** — this file is built to
  be emailed around. Staff *import* has no account-number column and no
  branch that writes one: bank details change one person at a time through a
  route that validates them, not in bulk from a file that has been
  round-tripped through email.
- **A parent row naming an unknown child is an error, not an invitation to
  create one.** The admission number is far likelier to be a typo than the
  child to be missing.
- Two real defects the tests caught. **exceljs coerces csv cells by default**,
  so `"007"` came back as the number `7` and dates as `Date` objects — a csv
  exported from here would not have survived being re-imported; fixed with an
  explicit identity mapper. And **`Date.parse("2026-02-31")` does not fail**
  in JavaScript, it rolls over to 3 March, which would have moved a child's
  date of birth by two days with no error shown; dates now round-trip through
  their parts.
- One cast was kept deliberately: exceljs declares `Buffer` against the
  pre-generic type while `@types/node` now models it as
  `Buffer<ArrayBufferLike>`. Same object at runtime — a disagreement between
  two type packages — so the conversion lives in one named helper rather than
  spread across call sites.
- Frontend notes: downloads go through `fetch` because a plain `<a href>`
  sends no `Authorization` header, and the object URL is revoked afterwards
  so a full roster is not held in memory for the tab's lifetime. The upload
  deliberately sets no `Content-Type` — the browser must set it along with
  the multipart boundary, and overriding it makes the body unparseable.

**PDF documents (done).** Report cards, class lists, fee invoices and class
timetables, as the printable sheets a school actually hands out.

- **pdfkit, not headless Chrome.** Rendering HTML to PDF properly means
  running Chromium, which on a 3.6 GB Docker VM is this environment's worst
  behaved operation. A pure-JS generator produces the four documents a school
  needs without a browser anywhere near it.
- **Pagination is a tested pure function, because silent truncation is the
  failure mode.** A class list that quietly stops at the bottom of page one,
  or a report card missing its last two subjects, looks entirely correct —
  nobody notices until a parent asks why their child's best subject is
  absent. `paginate` returns explicit row ranges per page and a test asserts,
  across a dozen list lengths, that every row lands somewhere and no page
  overlaps another. The first page holds fewer rows because it carries the
  title, and getting that off by one is exactly how the last entry vanishes.
- **Truncated text is always marked.** A name silently cut from
  "Oluwaseun Adebayo-Williams" to "Oluwaseun Adebayo" is a different person
  to whoever reads the sheet, so `fitText` measures in the real font and
  appends an ellipsis.
- **An empty list still produces a page** saying so. A zero-byte file reads
  as a broken export, and a school will not trust the feature again.
- **Every document reads its data through the service that already enforces
  who may see it** — `GradingService.reportCard`, and so on. If the scoping
  is right in JSON it is right on paper, because it is the same code.
- **But reuse is only safe when the question is the same, and once it wasn't.**
  The class list first borrowed `TimetableService`'s class check. That
  service answers "may this viewer see this class's timetable", and a
  guardian legitimately may — it is their child's week. A class *list* is a
  different question: it is every other family's children's names and
  admission numbers on one sheet. The e2e caught it; the class list is now
  explicitly staff-only. Reusing a scoping rule is right when the questions
  match and a quiet disclosure when they don't.
- Served `inline` rather than `attachment`, so a parent checking a report
  card on a phone gets it opened rather than dropped in a downloads folder.

**Automatic timetable generation (done).** A school states the shape of its
day once; the periods and the whole week follow.

- **The school day is settings, not data entry.** "08:00 to 14:00, six
  lessons, break after the third" derives the period boundaries. Typing six
  start and end times by hand is slower and is how a day acquires a gap
  nobody notices until two classes are booked into the same minute.
- **Leftover minutes are reported, never absorbed.** If the lessons and the
  break do not divide the day exactly, the remainder is real and a head
  teacher should see it — silently stretching the last period is how a
  timetable stops matching the bell.
- **A missing prerequisite had to come first.** `TimetableEntry` records
  where a lesson *ended up*; nothing recorded what the school actually needs
  taught. `TeachingAssignment` — this class, this subject, this teacher, so
  many periods a week — is the input generation reads, and without it
  automatic scheduling has nothing to work from.
- **The generator never double-books.** Greedy placement ordered
  most-constrained-first, checked again over the finished week before
  anything is written: a scheduler that silently double-books is worse than
  one that refuses to save. Proved by a property-style sweep over 27 school
  shapes (3–8 periods a day × 1–6 classes × 1–5 teachers), and again in the
  e2e against what was actually written to the database rather than what the
  algorithm claimed.
- **It reports what it could not fit, in terms a head teacher can act on.**
  "Grade 5A · Mathematics, 3 short — that teacher is already teaching in
  every period of the week" rather than a week that looks finished and
  quietly lost three lessons. Placed plus shortfall always equals what was
  asked for; nothing may vanish.
- **A subject spreads across days before doubling up**, so four periods of
  Maths land on four days rather than stacking into one afternoon — but a
  doubled-up lesson still beats a missing one, so it falls back rather than
  giving up.
- **Deterministic.** Same input, same week. A school that has worked around
  one awkward slot should not find everything rearranged after an unrelated
  edit.
- **Generating previews by default**, because it replaces every lesson in the
  school — the same rule as spreadsheet import, for the same reason.
- Teachers get their own printable week, which is what a timetable is
  actually for: seeing at a glance whether you have a class. Free periods are
  left blank on purpose.

**The AI provider is a Super Admin setting, not an environment variable
(done).** `GEMINI_API_KEY` is gone; whoever runs the platform picks a
provider in the console and pastes their own key.

- **Five providers, one code path.** OpenRouter, OpenAI, Anthropic, Google
  Gemini, and anything OpenAI-compatible (Groq, Together, DeepSeek, a local
  Ollama — that one asks for a base URL). They differ only in where the key
  goes and how the response is shaped: Gemini wants the key in the query
  string, Anthropic wants `x-api-key` plus a version header, the rest want
  `Authorization: Bearer`. Three response shapes, one `generateJson`.
- **The key is never returned, by design and by test.** AES-256-GCM at rest
  via the same `TenantSecretsService` the payment gateways use; the settings
  route returns `••••` plus the last four and there is no route that returns
  it whole. The e2e asserts on the `apiKeyEncrypted` *column*, not the API
  response — a masked view can be right while the column still holds
  plaintext, and only one of those two is a breach.
- **Omitting the key keeps it; sending an empty one clears it.** Changing the
  model must not silently sign the platform out of its provider, and there
  has to be some way to revoke without a database edit.
- **A Test button, because the alternative is finding out mid-lesson.**
  One small real request, and the result is stored — a wrong key should
  surface in the console, not as a teacher's generation failing while they
  are planning tomorrow's class. Provider errors are translated: 401/403
  becomes "rejected the API key", 404 points at the model name, 429 at rate
  limits or credit.
- **Structured output is asked for in words, not with a provider flag.**
  Only Gemini has a real `responseSchema`; folding the schema into the prompt
  and unwrapping ```json fences on the way back is the one approach all five
  support. `extractJson` returns null rather than throwing, so a chatty model
  degrades to a clear error instead of a stack trace.
- **PLATFORM_ADMIN only.** A school administrator must not be able to read
  the key, change it, or point generation at a provider of their own — the
  bill lands on the platform. `PLATFORM_SUPPORT` gets 403, and the e2e checks
  the rejected write did not land.

A note on the guard, since it cost a debugging round: `@PlatformRoles(...)`
is only metadata. A `/platform/*` controller also needs
`@Public()` (to opt out of the tenant `JwtAuthGuard`) **and**
`@UseGuards(PlatformJwtAuthGuard, PlatformRolesGuard)`. Without them every
route 401s with a perfectly valid platform token.

**The AI Teacher (done).** A tutoring conversation grounded in the school's
own curriculum, which is the difference between this and a general chatbot
with a school logo on it.

- **A lesson is anchored to a subject and a topic**, and optionally to one
  week of a scheme of work — when it is, that week's objectives go into the
  prompt. "Explain fractions" and "explain fractions the way this class is
  being taught them this term" are different lessons.
- **Every turn is stored, and that is the point.** Not for resuming a
  conversation, though it allows it: a child is on the other side of this,
  and a school or a parent must be able to read exactly what the AI said. An
  unlogged tutor is not shippable to minors.
- **Nobody can write into someone else's transcript — including staff.**
  Teachers and admins read the whole thing; that is what keeping it is for.
  Writing into it would forge the record a safeguarding review depends on.
  Guardians see their own children's lessons and no others; a student sees
  only their own. Someone else's lesson 404s rather than 403s, because
  whether a given lesson exists is itself information about another child.
- **The rules that make this safe live in a tested pure function.**
  `tutor-prompt.ts` is where "stay on this subject", "never ask for personal
  details", "never claim to be human", "guide them rather than doing their
  homework", and — the one that matters most — "if the student says anything
  suggesting they are unsafe or in distress, do not counsel them; tell them
  to speak to a trusted adult" are written. Each has a test, because each is
  a requirement for putting a chatbot in front of a child rather than a
  nicety.
- **Limits are checked before the provider is called**, never after: 40
  questions a session, 120 a student a day, 1000 characters a question. The
  key belongs to the platform operator and every turn is billed to them, so
  a refusal that still cost money would defeat the purpose.
- **`@@unique([sessionId, sequence])` makes a double-tapped Send harmless.**
  The question is written *before* the provider is called, so the second tap
  collides on the constraint instead of buying a second answer. If the
  provider then fails, that reservation is removed — a question with no
  answer reads like the tutor ignored the child.
- **Only the transcript replay is trimmed, and the opening turn always
  survives.** Every replayed turn is billed again on every question, so an
  unbounded transcript gets quadratically expensive; but the first turn is
  what states the topic, and dropping it is exactly how a tutor forty
  questions in ends up cheerfully discussing something else.
- `AiService` grew `generateText` alongside `generateJson`. A tutoring reply
  is prose, and the "reply with JSON only" instruction has to be absent
  rather than merely ignored — a reply that arrives wrapped in an object is
  a bug the student sees.

Two things this cost that are worth not re-learning. `z.coerce.number()` on
an untouched optional number input receives `""`, coerces it to `0`, and then
fails `.min(1)` — so an optional field rejects being left alone.
`z.preprocess` fixes the validation but makes the schema's input type diverge
from its output, which react-hook-form's resolver rejects; keeping the field
a string and converting at submit is the version that stays simple. And the
Docker-on-Windows watcher gap applies to **edits inside a newly created
directory**, not just to the directory's first appearance: the first build of
`app/(dashboard)/ai-teacher/` was served happily and then three subsequent
edits to it were not, which reads exactly like a bug in the code being edited.

**A harness hole the fees phase exposed.** Adding a twelfth e2e suite made three
suites fail at once (`fees`, `onboarding`, `tenant-isolation` — 28 tests,
which was every test in all three), while each passed alone. The cause was
not the new code: `onboarding` and `tenant-isolation` were still on Jest's
**default 60s hook timeout** while every suite added since carries an
explicit 120–180s, and provisioning gets slower as a full run accumulates
tenant databases on one Postgres. They had been sitting at 58.8s and 57.7s
— under the line by a second. Worse, a timed-out `beforeAll` never reaches
`app.close()`, so that suite's two Prisma pools leak into every suite after
it, which is how the failure spread to `fees` despite `fees` already having
its own 180s timeout. Both suites now carry explicit timeouts; the full run
went from 3 failed / 880s to **12 suites, 101 tests, all passing, 407s**.
The general rule: any e2e suite that provisions a school needs an explicit
hook timeout, and a whole-suite failure with zero assertion failures is a
hook problem, not a logic problem.

**Explicitly deferred, still not part of any phase so far:** daily lesson
notes, exams/worksheets/marking guides, PDF/Word/Excel export,
per-country curriculum-standard databases, subdomain-based tenant routing,
custom domains, per-school branding, live voice/video classroom (the AI
Teacher above is text; speech is its own phase),
2FA/lockout/real CSRF double-submit, messaging, automated backups,
**live charging through a school's payment gateway** (the keys are stored,
encrypted and testable, but nothing is ever charged — a fee payment with
method `GATEWAY` is still recorded by hand, and the webhook that would
replace that is exactly what the `(invoiceId, reference)` constraint is
already waiting for), fee discounts/scholarships as their own entities,
credit notes and refunds, and a platform-admin onboarding UI (schools
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
  dev server recompiled on its own. Now confirmed for `apps/ems` and
  `apps/ems-api` as well, and it is worst for **newly created directories**:
  a brand-new route folder 404s and a brand-new Nest module simply doesn't
  appear in the `RoutesResolver` log, which reads exactly like "the code is
  wrong" when the code is fine. Both were fixed by a container restart while
  the e2e suite — which compiles from source — had been passing all along.
  After a `next dev` restart the browser also holds stale chunks and throws
  `ChunkLoadError`; a forced reload clears it.
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
  **The regenerated lockfile does not reach the running container on its
  own.** Compose bind-mounts only `./apps/<name>`, never the repo root, so
  `/workspace/pnpm-lock.yaml` is whatever was baked in at image build time.
  The symptom is confusing: the container sees the *new* `package.json` and
  the *old* lockfile, and `--frozen-lockfile` fails complaining they disagree.
  Either rebuild the image or copy the file in:
  ```
  docker cp pnpm-lock.yaml "$(docker compose ps -q ems-api):/workspace/pnpm-lock.yaml"
  docker compose exec -T ems-api pnpm install --frozen-lockfile
  ```
  Keep `--frozen-lockfile` rather than reaching for `--no-frozen-lockfile`:
  a frozen install succeeding is the proof that CI will succeed too.

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
