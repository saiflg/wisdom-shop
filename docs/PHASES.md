# Wisdom Shop — Phase Roadmap

Each phase is completed, tested, and documented before the next begins.

| # | Phase | Status |
|---|-------|--------|
| 1 | Architecture and Project Setup | ✅ Done — verified |
| 2 | Authentication and User Management | ✅ Done — verified |
| 3 | Product Catalog | ✅ Done — verified |
| 4 | Shopping Cart | ✅ Done — verified |
| 5 | Checkout | ✅ Done — verified |
| 6 | Payment Gateway Integration | 🟡 Stripe + Paystack verified — Flutterwave/PayPal pending |
| 7 | Order Management | ✅ Done — verified |
| 8 | Vendor Marketplace | ✅ Done — verified |
| 9 | Educational Management Software Marketplace | 🟡 Licensing + handoff done — downloads pending |
| 10 | Customer Dashboard | ✅ Done — verified |
| 11 | Admin Dashboard | ✅ Done — verified |
| 12 | Analytics and Reporting | ✅ Done — verified |
| 13 | Security Hardening | ✅ Done — verified |
| 14 | Testing | ✅ Done — verified |
| 15 | Production Deployment | 🟡 Built and image-verified — never deployed |

## Phase 1 — what was built

- pnpm monorepo (`apps/web`, `apps/api`) with shared root scripts
- **Web**: Next.js 14 App Router, TypeScript, Tailwind, dark/light mode
  (`next-themes`), React Query provider, branded landing page
- **API**: NestJS with Zod-validated env config, global `ValidationPipe`,
  Helmet, CORS, URI versioning, rate limiting (`@nestjs/throttler`),
  Swagger at `/docs`, `/health` endpoint that checks DB connectivity
- **Database**: Prisma schema covering identity/RBAC, vendors, catalog
  (products/categories/variants/images/reviews), cart, orders, payments,
  coupons, and an audit log — all with soft deletes and indexed FKs
- **Infra**: Docker Compose (Postgres, Redis, Meilisearch, api, web) for a
  one-command dev environment on a machine with no local Node install
- **CI**: GitHub Actions running lint, typecheck, build, and test on every
  push/PR against a real Postgres service container

## Phase 2 — what was built

- **Prisma**: `EmailVerificationToken`, `PasswordResetToken`,
  `TwoFactorRecoveryCode` tables added; `User` gains `twoFactorEnabled`/
  `twoFactorSecret`.
- **`AuthService`** (`apps/api/src/auth/auth.service.ts`): register, login,
  refresh (with rotation + stolen-token reuse detection that revokes every
  session for the user), logout / logout-all, email verification,
  password-reset request/confirm, change-password, and full TOTP 2FA
  (setup → QR code → enable with recovery codes → verify-on-login →
  disable).
- **`AuthController`**: all of the above wired to `POST/GET /v1/auth/*`,
  with the refresh token delivered as an `httpOnly`, `SameSite=Strict`
  cookie scoped to `/v1/auth`, plus a custom CSRF header
  (`x-wisdom-shop-csrf`) required on cookie-authenticated routes
  (refresh/logout).
- **Global auth**: `JwtAuthGuard` is registered as an `APP_GUARD`, so every
  route requires a valid access token by default — routes opt out with
  `@Public()`. `RolesGuard` + `@Roles(...)` enforce RBAC on top of that.
  `/health` is exempted and also excluded from URI versioning
  (`VERSION_NEUTRAL`) so infra health checks have a stable path.
- **Supporting modules**: `MailerService` (SMTP via nodemailer, logs to
  console instead of sending when `SMTP_HOST` is unset — safe by default
  in dev), `EncryptionService` (AES-256-GCM for the TOTP secret at rest),
  `AuditLogService` (best-effort audit trail, never fails the request it's
  describing).
- **`prisma/seed.ts`**: seeds all ten `RoleName` rows, a base permission
  set, role→permission links, and (optionally) a Super Admin account from
  `SEED_SUPER_ADMIN_EMAIL`/`SEED_SUPER_ADMIN_PASSWORD`.
- **Tests**: `auth.service.spec.ts` (unit — register/login/refresh-rotation
  /refresh-reuse-detection/verify-email/change-password) and
  `test/auth.e2e-spec.ts` (full HTTP flow against a real Postgres:
  register → me → wrong-password rejection → CSRF enforcement → refresh
  rotation → reuse rejection → logout).

## Phase 3 — what was built

**Backend** (`apps/api/src/catalog/`)

- **`CategoriesService`** — hierarchical categories with automatic slug
  generation (`slugify`) and collision handling (`books`, `books-2`, …),
  parent validation, a `findTree()` that nests children in a single query
  (no N+1), and soft delete that *refuses* to run if the category still
  has subcategories or assigned products (409 rather than orphaning rows).
- **`ProductsService`** — filter/search/sort/paginate (`category`, `type`,
  `minPrice`/`maxPrice`, `search`, `sort=newest|price_asc|price_desc`),
  slug collision handling, and nested writes for images/variants/category
  links. Variant removal is a soft delete; image and category-link
  replacement happens inside a transaction so a partial update can't leave
  a product half-rewritten.
- **Route split** — public read-only controllers (`GET /v1/categories`,
  `GET /v1/products`, `GET /v1/products/:slug`) are `@Public()` and only
  ever return `PUBLISHED`, non-deleted rows. Admin controllers
  (`/v1/admin/categories`, `/v1/admin/products`) are role-gated via
  `@Roles("ADMIN", "SUPER_ADMIN", "MANAGER", "EDITOR")`, with product
  *deletion* further restricted to `ADMIN`/`SUPER_ADMIN`/`MANAGER`.
  Products are created as `DRAFT` and must be explicitly published.
- **Seed** — `prisma/seed.ts` now also seeds 8 demo categories (nested
  under a `Books` parent) and 7 demo products spanning `PHYSICAL`,
  `DIGITAL`, `COURSE`, and `SOFTWARE` types, all idempotent via `upsert`.

**Frontend** (`apps/web/`)

- **Auth UI** (deferred from Phase 2, now built): `/login` and `/register`
  with `react-hook-form` + `zod` validation mirroring the API's DTO rules,
  inline field errors, and full TOTP 2FA challenge handling on login.
- **`SessionBootstrap`** — on first load, silently exchanges the httpOnly
  refresh cookie for a fresh access token, so a page refresh doesn't
  appear logged-out just because the in-memory token was lost.
- **Catalog UI** — `/products` (server-rendered browse with search,
  category, type, sort filters and pagination) and `/products/[slug]`
  (detail page with image, variants, stock state, category links,
  per-page OpenGraph metadata, and Schema.org `Product` JSON-LD).
- **Next rewrite** — `/v1/*` is proxied to the API same-origin so the
  refresh cookie's `Path=/v1/auth` scope actually matches browser
  requests. (The earlier `/api/*` rewrite would have silently broken the
  cookie path.)

**Deliberately not built yet:** there is no "Add to cart" button on the
product page. The cart is Phase 4, and a button that looks functional but
does nothing is worse than its absence — it'll be added when the cart API
behind it exists.

## Phase 4 — what was built

**Backend** (`apps/api/src/cart/`)

- `GET /v1/cart`, `POST /v1/cart/items`, `PATCH /v1/cart/items/:itemId`,
  `DELETE /v1/cart/items/:itemId`, `DELETE /v1/cart`. Every route is
  authenticated and scoped to the caller — **no cart id appears in any
  path**, so one user structurally cannot address another's cart. Item
  mutations additionally scope the lookup by `cart: { userId }`, so a
  guessed item id returns 404 rather than mutating someone else's row.
- **Prices are never accepted from the client.** The unit price is resolved
  server-side from the chosen variant, falling back to the product. Because
  `forbidNonWhitelisted` is on globally, a request that even *includes* a
  `priceCents` field is rejected outright with 400.
- **Stock is enforced against the right entity** — a variant's own
  `stockQty` when one is chosen, otherwise the product's — and the check
  uses the *resulting* quantity, so repeatedly adding 1 can't walk past the
  limit. `stockQty: null` means untracked (digital/unlimited).
- Adding a product that already exists in the cart **merges into the
  existing line** rather than creating a duplicate. This is done with an
  explicit lookup, not an upsert, because Postgres treats NULLs as
  distinct in unique indexes — so `@@unique([cartId, productId,
  variantId])` does *not* dedupe rows where `variantId` is null. Relying on
  the constraint would have silently produced duplicate lines for every
  non-variant product.
- Unpublished/soft-deleted products return the same "Product not found" as
  a nonexistent id, so the API doesn't leak the existence of draft
  products.

**Frontend** (`apps/web/`)

- `AddToCart` on the product detail page (the button deliberately withheld
  in Phase 3, now that there's a real API behind it) with variant
  selection, quantity, inline error surfacing, and a sign-in prompt for
  guests instead of a button that would just 401.
- `/cart` page with per-line quantity steppers, remove, live subtotal, and
  stock-limit feedback. The `+` button disables at the stock ceiling.
- Header cart link with a live item-count badge; the cart query is dropped
  from the React Query cache on sign-out so one user's cart can't flash for
  the next.
- Cart mutations return the full updated cart, which is written straight
  into the query cache — no refetch round-trip per change.

**Decision recorded:** carts require sign-in. `Cart.userId` is non-null and
unique, so guest carts would need either a nullable `userId` plus a session
token or a separate guest-cart table. That's a product decision worth making
deliberately rather than defaulting into, so for now the UI asks guests to
sign in. Revisit before launch if guest checkout matters.

## Phase 5 — what was built

**Addresses** (`apps/api/src/addresses/`) — `/v1/addresses` CRUD scoped to
the caller. The first address saved becomes the default automatically so
checkout always has something to preselect; setting a new default clears
the old one in the same transaction. Deletion is a **soft** delete because
past orders reference the address and must keep showing where they shipped;
if the deleted one was the default, the next-newest is promoted.

**Checkout / Orders** (`apps/api/src/orders/`)

- `GET /v1/checkout/preview` returns line items plus subtotal, shipping,
  tax and total so the customer sees the real number before committing.
- `POST /v1/orders` turns the cart into a `PENDING` order and:
  - **Snapshots prices** into `OrderItem.unitPriceCents` and
    `titleSnapshot`. An order must always show what was actually charged,
    even after the product is renamed or repriced — there's an e2e test
    that reprices a product and asserts the order is unchanged.
  - **Decrements stock atomically** with a compare-and-swap:
    `updateMany({ where: { id, stockQty: { gte: qty } }, data: { decrement } })`.
    If the row no longer has enough, `count === 0` and the whole
    transaction rolls back. This closes the Phase 4 gap where stock was
    validated but never reserved. Variants are decremented against their
    own `stockQty`, products against theirs.
  - **Refuses to silently re-price.** The client sends the
    `expectedTotalCents` it displayed; a mismatch returns **409** with both
    the expected and actual totals so the UI can say "prices changed"
    rather than charging a different amount than was shown.
  - **Re-validates at checkout** — a product unpublished or soft-deleted
    while sitting in the cart returns 409, not a broken order.
  - **Rejects mixed-currency carts** rather than summing incomparable
    amounts into one total.
  - Requires a shipping address only when the cart contains a shippable
    type, so digital-only orders skip the step entirely.
  - **Clears the cart inside the same transaction**, so a later failure
    can't leave an empty cart with no order to show for it.
- `GET /v1/orders` and `GET /v1/orders/:orderNumber`, both scoped by
  `userId` so another user's order number yields 404.
- Order numbers are `WS-YYYYMMDD-<10 hex>` (UTC-based so they don't shift
  by deploy region), with `orderNumber` UNIQUE in the schema so a
  collision would fail loudly rather than merge orders.
- A confirmation email is sent via `MailerService` (console-logged in dev
  until `SMTP_HOST` is set).

**Frontend** — `/checkout` (order summary, address select/create, place
order, price-change and out-of-stock messaging), `/orders`,
`/orders/[orderNumber]`, a real "Proceed to checkout" button on the cart,
and an Orders link in the header.

**Pricing policy — deliberately minimal.** The spec calls for flat,
weight-, distance-, and zone-based shipping plus real tax. Only a **flat
rate** is implemented, via `SHIPPING_FLAT_CENTS` and `TAX_PERCENT`, both
**defaulting to 0** so no charge is ever applied that wasn't configured on
purpose. Weight/distance shipping needs rate tables and tax needs a
jurisdiction provider; half-building them would mean shipping fake
implementations. See `apps/api/src/orders/pricing.ts`.

**`BUNDLE` doesn't trigger shipping.** A bundle could contain physical
goods, but nothing models bundle contents yet, so treating it as shippable
would invent a shipping charge. Flagged in `SHIPPABLE_TYPES`.

## Phase 6 — what was built (Stripe only, deliberately)

**Scope decision:** one provider end-to-end rather than four half-done.
Stripe has by far the best local-testing story, so it went first. Paystack,
Flutterwave and PayPal are **not** implemented — `PaymentProvider` has the
enum values and `availableProviders()` reports what's actually configured,
so the UI can't offer a provider that doesn't exist.

**Credential boundary:** no API key, live or test, is in this repo or was
entered by Claude. `STRIPE_SECRET_KEY` is the project owner's to set.
Without it the app boots fine and every other feature works; payment
initiation returns a clear **503** rather than an opaque SDK error.

- `POST /v1/payments/stripe/checkout/:orderNumber` — creates a Checkout
  Session for one of the caller's own `PENDING` orders and records an
  `INITIATED` Payment row, so abandoned attempts are still traceable.
- `POST /webhooks/stripe` — `@Public()` (providers carry no bearer token;
  **the signature is the authentication**) and `VERSION_NEUTRAL` (the URL
  lives in a provider dashboard and shouldn't churn with API versions).
- **Idempotency**: `ProcessedWebhookEvent` with a unique `(provider,
  eventId)`. Providers retry; a duplicate delivery is a no-op. The unique
  constraint — not a read-then-write check — is the real guard, so two
  concurrent deliveries race on the insert and exactly one wins.
- **Amount reconciliation**: the webhook's `amount_total` is compared to
  `Order.totalCents`. A mismatch is recorded as a `FAILED` payment plus an
  audit entry and the order is *not* marked paid.
- **Explicit status transitions** (`order-status.ts`): `PENDING → PAID` is
  legal, `REFUNDED → PAID` is not, so a late or replayed success event
  can't resurrect a refunded order.
- Returns **200 for business-level no-ops** (duplicate, unhandled type,
  illegal transition) once the signature is valid — a non-2xx would make
  the provider retry forever.

**Testing without credentials.** Stripe signs `${timestamp}.${payload}`
with HMAC-SHA256, so `test/stripe-signature.ts` mints genuine signatures
from a test secret. The whole webhook path is therefore verified for real
with no account and no network: forged signature, payload tampered after
signing, stale timestamp outside tolerance, amount mismatch, duplicate
delivery, and refunded-then-late-success. The suite also `delete`s
`STRIPE_SECRET_KEY` in `beforeAll` so it *cannot* reach Stripe by accident.
The one thing genuinely unverifiable here is the outbound Checkout Session
call itself.

## Verification log (2026-07-30) — Phase 6

- **48/48 unit tests** and **56/56 e2e tests** (15 new payments tests);
  lint, typecheck and build all clean on `apps/api`.
- **Root cause of a bug that cost real debugging time, worth recording.**
  Every valid-signature webhook test failed with 400 while every
  *reject* test passed. The reject tests were passing **vacuously** — they'd
  have passed against an endpoint that always 400s, which is exactly what
  it was. The chain: `.env` was copied from `.env.example`, which ships
  `STRIPE_WEBHOOK_SECRET=` **empty**; that empty string shadowed the real
  value and defeated `ConfigService`'s fallback to `process.env`; the
  secret read as falsy so `verifyWebhookSignature` threw
  `ServiceUnavailable`; and a **blanket `catch` relabelled it "Invalid
  webhook signature"**. Three fixes, all worth keeping:
  1. `optionalSecret` in `env.validation.ts` normalises `""` → `undefined`.
     An empty value in `.env` is worse than an absent one, and every
     optional secret in `.env.example` had this hazard.
  2. The webhook handler no longer disguises "not configured" as "bad
     request" — a misconfiguration is an operator problem and now surfaces
     as 503.
  3. An explicit empty-`rawBody` check that fails with a distinct message,
     because a broken raw-body pipeline is otherwise indistinguishable
     from a bad signature.
  I chased the raw-body plumbing twice on hypotheses that turned out wrong
  before making the code report the truth; isolating the signature helper
  against Stripe's own verifier (it was correct all along) is what finally
  narrowed it.
- **Test suites were ~5× too slow for a fixable reason.** ts-jest was fully
  type-checking in every worker, and adding the Stripe SDK's very large
  type definitions pushed e2e `beforeAll` past a 60s hook timeout and the
  unit suite past 400s. Setting `isolatedModules: true` in
  `apps/api/tsconfig.json` (ts-jest reads it and transpiles instead) cut
  the payments suite from 136s to 25s and the unit suite from ~404s to
  **19.8s**. Types are still enforced by `pnpm typecheck` and `nest build`,
  so nothing is lost.

## Phase 7 — what was built

**Schema** — `OrderStatusHistory` (append-only: who moved an order from what
to what, with an optional note; `changedByUserId` is nullable because some
transitions come from a webhook rather than a person), plus `carrier`,
`trackingNumber`, `shippedAt`, `deliveredAt`, `cancelledAt` and
`stockRestored` on `Order`, and a `createdAt` index for date filtering.

**`/v1/admin/orders`** — list with filtering by status, date range, and a
search that matches either an order number or the customer's email (staff
get quoted whichever the customer has to hand). Detail returns items,
address, payments, customer, and the full status history.

**Status transitions reuse the same `canTransition` table the payment
webhooks use.** One definition of what's legal, so an admin can't do by
hand what a webhook is forbidden to do.

**Two decisions worth calling out:**

- **Cancelling returns items to stock.** Checkout decrements stock, so
  without this every cancelled order silently leaks inventory. It's made
  idempotent by `Order.stockRestored`, set inside the same transaction as
  the increment — and `CANCELLED` is terminal in the transition table, so
  there's no path back through it. A test asserts stock returns to its
  original value and that four separate re-cancellation attempts all 409
  without moving stock.
- **`SUPPORT` can read every order but cannot change status or shipment.**
  Support staff need visibility to answer "where is my order"; letting them
  move money-adjacent state is a different privilege. Enforced with a
  narrower `@Roles` on the mutating routes and asserted by test.

Refunding is *not* here: refund webhooks are handled, but issuing a refund
needs a provider API call and belongs with the admin dashboard (Phase 11).

## Phase 8 — what was built

**Correction to an earlier note.** I previously flagged that a VENDOR token
could edit another vendor's products. That was **wrong**: the admin product
routes gate on `@Roles("ADMIN", "SUPER_ADMIN", "MANAGER", "EDITOR")`, which
never included VENDOR, so vendors had no product access at all. I'd
conflated the seeded `products.write` *permission* with the route guards,
which consult **roles**, not permissions. (Worth knowing generally: the
`Permission` table is seeded but nothing reads it yet — authorisation is
role-based throughout.) The real work was scoping ownership correctly while
*adding* vendor endpoints.

**Onboarding** — `POST /v1/vendors/apply` (any signed-in customer, starts
`PENDING`, one application per user), `GET /v1/vendors/me`, and
`/v1/admin/vendors` for review. Status changes run through their own
transition table: `PENDING → APPROVED|REJECTED`, `APPROVED ↔ SUSPENDED`,
and `REJECTED` terminal so a declined applicant re-applies rather than
being quietly revived.

**Approval drives role membership.** Approving grants the `VENDOR` role;
suspending or rejecting revokes it, in the same transaction as the status
change — so role membership can't drift out of sync with vendor state.

**Ownership scoping (the security-relevant part).** Every
`/v1/vendor/products` route resolves the caller's *own* vendor id via
`requireApprovedVendorId` and passes it into the WHERE clause. Ownership is
filtered in the query rather than fetched-then-compared, so asking for
another vendor's product returns a plain 404 that leaks nothing about
whether the id exists. `vendorId` is taken from the token's vendor record
and never from the request body — and because `forbidNonWhitelisted` is on,
sending one is a 400 rather than being silently ignored. Holding the VENDOR
role is *not* sufficient: a `PENDING` or `SUSPENDED` vendor is refused.

**Commission is snapshotted at order time**, exactly like prices:
`OrderItem` gains `vendorId`, `commissionPct` and `commissionCents`.
Changing a vendor's rate later must not rewrite what was owed on orders
already placed — there's a test that raises a vendor's rate to 90% and
asserts the existing order line still reads 10%.

**Earnings** (`GET /v1/vendor/earnings`) list every line with its
snapshotted commission, but **totals count only settled orders**
(PAID/PROCESSING/SHIPPED/DELIVERED). Pending orders aren't paid for yet and
cancelled/refunded money went back to the customer; both are listed and
reported as `excludedLineCount` rather than hidden.

Not built: payouts (money movement out to vendors), and vendor-facing
order fulfilment — vendors can see their earnings but order status is still
admin-driven.

## Phase 9 — what was built

**License issuance on payment.** When an order reaches `PAID`,
`LicensesService.issueForOrder` runs from the same place the receipt is
sent. Only `SOFTWARE`, `LICENSE`, `SUBSCRIPTION` and `MEMBERSHIP` lines
produce a key — a `DIGITAL` book is a *download*, not an activation, and a
test buys one of each in a single order to prove only the right line gets a
license.

**Idempotency, because this hangs off a redeliverable webhook.**
`License.orderItemId` is UNIQUE; issuance checks for an existing row and
also catches `P2002` so a concurrent redelivery loses the race harmlessly.
The e2e test sends a *second webhook with a new event id* for the same
payment — that bypasses the webhook-event ledger entirely and exercises the
license guard itself, which is the case that would otherwise mint a
duplicate key. Issuance also swallows its own errors: a licensing failure
must never make a provider retry a payment that already succeeded.

**Quantity becomes seats, not keys.** Buying 3 gives one key with
`seats: 3` rather than three keys — one purchase, one activatable license.

**License keys** are `WS-XXXXX-XXXXX-XXXXX-XXXXX` in Crockford base32 (no
I, L, O or U), because customers and support staff read these aloud and
transcribe them by hand. 100 bits from a CSPRNG, and `key` is UNIQUE so a
collision fails loudly. A test generates 500 keys and asserts none of the
ambiguous characters ever appear.

**"Complete Your School Setup" handoff.** `POST
/v1/licenses/:key/setup-handoff` returns a redirect into the separate EMS
portal carrying a short-lived (5 min) HMAC-SHA256 token. The portal has no
access to this database, so the token is self-contained proof of purchase
it can verify alone — modelled directly on the payment webhook verifiers:
signature checked *before* the payload is parsed, constant-time comparison,
and expiry treated as part of validation rather than the receiver's problem.
Refused for revoked or expired licenses, and scoped so another customer's
key 404s.

**Not built:** secure file downloads. Digital goods need time-limited signed
URLs from object storage, and no S3/R2 client is wired up — building the
authorization half against storage that doesn't exist would be guesswork.
Admin refunds and Flutterwave/PayPal also remain outstanding.

## Phase 10 — what was built

Almost entirely frontend — the APIs were already in place and unused.

- **`/account`** — overview with role badges and counts linking to orders
  and licenses.
- **`/account/security`** — change password, plus the **full TOTP
  enrolment flow** that the API has supported since Phase 2 but nothing
  called: setup → QR code (with a manual-entry fallback for anyone who
  can't scan) → verify → **recovery codes shown once**, with an explicit
  warning that they won't be shown again. Disabling requires password +
  current code, matching the API.
- **`/account/addresses`** — list, add, set-default, remove. Reuses the
  existing `AddressForm` from checkout rather than duplicating validation.
- **`/account/licenses`** — license keys with status, seats and expiry,
  and a working **"Complete Your School Setup"** button. The handoff token
  is short-lived, so it's fetched *on click* and used immediately rather
  than being embedded in the page where it would go stale.
- **`RequireAuth`** — a shared client-side gate for account pages,
  commented as a UX guard rather than a security boundary: every
  underlying endpoint is authenticated server-side, so bypassing it yields
  an empty shell and 401s, not data.

**One behaviour worth noting:** changing your password revokes every
refresh token server-side, so the page clears the local session and
redirects to sign-in rather than leaving the user holding a token that
will fail on next use.

## Phase 11 (part 1) — role management API

This closes a gap flagged since Phase 7: there was no way to grant a role,
which is why every e2e suite promotes its own admin with a direct Prisma
write. `/v1/admin/users` now lists/searches/filters users and manages
roles — with three protections that are the actual substance of the work:

- **No privilege escalation.** `ADMIN`, `SUPER_ADMIN` and `DEVELOPER` can
  only be granted or revoked by a `SUPER_ADMIN`. Without this an ADMIN
  could promote themselves to the top of the tree, which is escalation
  dressed up as an ordinary feature. Tested from both directions: an admin
  granting SUPER_ADMIN to someone else, *and* to themselves.
- **No self-lockout.** You cannot remove your own last administrative
  role. A super admin who did would lock themselves — possibly the whole
  deployment — out of administration, recoverable only by direct database
  access.
- **VENDOR cannot be assigned by hand**, even by a super admin. Phase 8
  grants and revokes it inside the same transaction as vendor approval, so
  a manual grant here would let role membership drift away from
  `Vendor.status` — the exact invariant that design exists to hold. This
  is refused with an explanatory message rather than silently ignored.

The bootstrap super admin still has to be seeded directly — that's the
chicken-and-egg every deployment has, and why `prisma/seed.ts` exists.

## Phases 11 (UI) & 12 — Admin dashboard & analytics

> Written during a Docker Desktop outage and therefore unverified for a
> while; **verified in full on 2026-07-31** (log below).

**Analytics API** (`/v1/admin/analytics`) — `summary` and `top-products`.
Revenue counts **settled orders only** (PAID/PROCESSING/SHIPPED/DELIVERED),
deliberately the same rule vendor earnings uses: pending orders aren't paid
for and cancelled/refunded money went back.

`summary` also returns `revenue.currencies` — every distinct currency among
settled orders. Checkout rejects mixed-currency carts so each order is
internally consistent, but summing *across* orders is only meaningful when
that list holds one entry. Reporting it lets the dashboard say so rather
than stamp one symbol on a sum of different monies; the overview shows an
amber notice and drops the symbol when more than one appears.

Both query parameters are bounded (`days` 1–366, `limit` 1–50) via a DTO.
The original `ParseIntPipe` accepted `?limit=100000` and `?days=0`, handing
any staff account an unbounded aggregate over the orders table.

**Admin UI** — `/admin` (overview cards + orders-by-status + best sellers),
`/admin/orders` (filter/search, status transitions), `/admin/vendors`
(approve/suspend/reject), `/admin/users` (search, grant/revoke roles). The
Where the UI does encode a rule, it mirrors the server rather than inventing
one: the vendor screen offers only legal transitions, and the users screen
hides admin-level roles from non-super-admins and omits VENDOR entirely.
Refusals always show the *server's* message. `RequireStaff` is a UX guard,
not a security boundary — every endpoint behind it is role-gated
server-side.

**Correction to an earlier claim here.** This section previously said the UI
mirrors the server's rules generally. The **orders** screen does not: it
offers every status except the order's current one and lets the server's
transition table refuse the illegal ones with a 409. That is a deliberate
trade — no duplicated table means no drift — but the cost is real, and it is
that an admin can click "processing" on a refunded order and get an error.
The behaviour is now pinned by `admin-order-list.test.tsx` so it stays a
decision rather than becoming an accident. The lasting fix is a shared
transition table both sides import; that is a refactor, not a patch.

## Post-completion — refresh token races across browser tabs

The client-side single-flight fix stopped one tab refreshing twice, but two
tabs share a cookie jar and cannot coordinate: both send the same refresh
cookie, one rotates it, and the other arrives holding a token that was valid
when it left and rotated out microseconds later. The server correctly called
that theft and revoked every session — signing the user out of a browser they
were actively using.

**The containment behaviour is unchanged.** A replay is now tolerated only
when all three of these hold, and each condition exists to stop the exception
becoming a hole:

1. **It happened just now** — within `REFRESH_REUSE_GRACE_MS` (default 15s,
   `0` restores strict detection).
2. **The chain has not moved on** — the token's direct successor must still be
   live. A replay from more than one step back is not something a race
   produces; a captured token is.
3. **It is the same client** — user agent must match. IP is deliberately *not*
   compared: mobile clients change IP between requests routinely, so matching
   on it would sign real users out constantly while barely inconveniencing an
   attacker replaying a captured session.

Tolerating a race does not resurrect the replayed token and does not hand back
the successor — tokens are stored hashed, so the original string is not
recoverable. It issues a fresh pair and leaves the other tab's token alone, so
both tabs end up with their own, which is the state two devices would be in.
Races are audited as `auth.refresh_token_race_tolerated`, separately from
`auth.refresh_token_reuse_detected`, so a spike in one stays distinguishable
from a spike in the other.

### A concurrency hole found while testing this

Writing the e2e test surfaced something worse than the bug being fixed. The
first parallel test passed while producing **no audit events at all** — which
made no sense until it did: two concurrent refreshes both read the token as
live, and the unconditional `update` let *both* rotate it and succeed. So a
stolen token used at the same moment as the legitimate one was never detected
at all, and the reuse check simply never ran.

Rotation is now a compare-and-swap (`where: { id, revokedAt: null }`), so
exactly one request can claim it and the loser goes through the same
evaluation as any other replay. `lets only one concurrent request rotate a
token` pins it.

This is worth recording as a testing lesson, not just a bug: the test passed,
and passing was the *symptom*. Checking why it produced no audit trail is what
found it.

### Verification log (2026-07-31) — refresh races

- **87 unit**, **163 e2e across 14 suites**; lint and typecheck clean.
- `refresh-race.spec.ts` (12 tests) pins each condition and both window
  boundaries. `refresh-race.e2e-spec.ts` (6 tests) covers the real flow,
  including three that assert theft containment still burns everything.
- **Mutation-checked.** Removing the chain-position and same-client conditions
  turned exactly the two theft tests red and left the race tests green.
- Verified in two real browser tabs: both reloaded, both stayed signed in,
  zero `reuse_detected` events. Previously every page load produced a pair.

Two pre-existing auth e2e assertions were **deliberately changed** rather than
worked around: they asserted that an immediate same-client replay returns 401,
which is exactly the behaviour being fixed. The strict cases they were
protecting are covered in more depth by the new suite, and the change is
called out in the test itself so it cannot be mistaken for drift.

**Process note, third occurrence.** `prisma migrate dev` silently created no
migration: it needs a confirmation to add a unique constraint and refuses to
run non-interactively. I missed it because the command was chained and I read
only `tail -5`, which showed npm's update banner instead of the actual output
— the same mistake as the `timeout`-wrapped build in Phase 10 and the
`pnpm add` in Phase 14. The migration is now hand-written, with a comment
saying why.

## Post-completion — runtime settings, admin user creation, storefront redesign

### Runtime settings (Admin → Settings)

Payment credentials, SMTP and store details are now editable by a super admin
without editing `.env` and restarting. Backed by a `settings` table read
through `SettingsService`.

Decisions worth stating, because each cuts against an easier option:

- **Database wins over environment.** A saved value that the environment
  could override would make the screen decorative. The environment stays the
  way to bootstrap a deployment before anyone can log in, and is the only
  source in CI.
- **A closed registry, not free-form key/value.** `settings.registry.ts` lists
  every writable key. This table holds payment credentials, so an endpoint
  that writes arbitrary keys is an endpoint that can be pointed at anything
  the application later reads — `DATABASE_URL` and `JWT_ACCESS_SECRET` are
  rejected with a 400, and there is a test for exactly that.
- **Secrets never leave the server.** They are encrypted at rest with the same
  AES-256-GCM service used for TOTP secrets, and the API returns a masked
  hint (`sk_••••4242`). A UI that can display a key is a UI that leaks it to
  anyone who reaches the screen or its network log. The audit entry records
  *which keys* changed and not their values — encrypting the column would be
  pointless if the value were copied into a table admins can read.
- **SUPER_ADMIN only**, a narrower gate than the rest of the admin area, which
  MANAGER and SUPPORT can reach.

Both payment providers and the mailer were rewritten to read through this
service. The mailer previously built its SMTP transport once in the
constructor, which would have kept using the old server until the API was
restarted — the settings screen would have appeared to work and silently done
nothing. It now rebuilds when the underlying values change, and
`POST /v1/admin/settings/email/test` opens and authenticates a connection
without sending mail, because SMTP settings that quietly do not work are
otherwise only discovered when a customer never receives a password reset.

### Admin user creation

`POST /v1/admin/users`. Roles go through the **same** `canManageRole` policy
as granting a role to an existing user — without that, creation is a trivial
bypass: an ADMIN who cannot promote anyone to SUPER_ADMIN could simply create
one instead. Password rules match public registration; an account an admin
created is not a weaker account.

**A bug this caught, and a lesson repeated.** The first implementation wrote
`if (refusal) throw ...` against `canManageRole`, which returns a decision
*object* — always truthy — so it refused every role including permitted ones.
The two "refuses X" tests passed **vacuously**; only the positive case ("lets
a SUPER_ADMIN create staff with a privileged role") caught it. Same lesson as
the Phase 6 webhook tests: reject-only tests prove nothing without a matching
accept case.

### Storefront redesign

Header rebuilt around a dark masthead with a prominent search field, a
scrolling category strip, and a real mobile menu. Search moves to its own row
on small screens rather than being hidden — hiding it would remove the main
way to find anything on the device most people browse from. A site footer was
added to the root layout rather than to each page, so it cannot be forgotten
on a new route; every link in it points at a route that exists, because a
dead footer link reads as neglect rather than as work in progress.

Product grids went from 1–3 columns to 2–5, and cards use `object-contain`
with a two-line clamped title: catalogue imagery is book covers and boxed
software, and `object-cover` crops the title off.

`useSearchParams` was deliberately left out of the header. It opts a client
component out of static rendering unless wrapped in Suspense, and this header
is on every page — prefilling the search box is not worth making every page
dynamic.

## Post-completion fix — every form in the app was broken

Reported by the user, who could not sign in: the login form showed a red
"required" under fields that plainly contained text.

`FormField` was a plain function component, while every caller spreads
react-hook-form's `register(...)` onto it — and that object contains a
`ref`. React does not pass refs to non-`forwardRef` function components; it
drops them. So react-hook-form never bound to any `<input>`, no keystroke
was ever recorded, and submitting sent an empty object. The validation
message was therefore *correct* about what it was given, which is what made
it point at the schema rather than at the missing ref. Fixed by making
`FormField` a `forwardRef` component.

**This affected login, registration, change-password, 2FA enrolment and the
checkout address form — i.e. every form in the product.**

### Why nothing caught it

This is the important part, and it is a straight indictment of how the
frontend was verified. Lint, typecheck, the production build, 141 API e2e
tests and 31 frontend tests were all green. Every one of them could be green
with the app completely unusable, because:

- the API tests drove HTTP directly and never touched a form;
- the "live route checks" in Phases 10–12 asserted a **200 status code**,
  which a broken form returns perfectly well;
- the Phase 14 frontend tests covered admin *lists and guards* — components
  that display data — and not a single one typed into an input.

I verified the login *endpoint* repeatedly and never once verified the login
*form*. A 200 from `/login` says the page rendered, not that it works.

`login-form.test.tsx` now covers it: six tests that type into the fields and
assert the submitted body matches what was typed. Mutation-checked —
reverting `forwardRef` turns all six red.

**Rule this establishes:** a form is not verified until a test has typed
into it and asserted what got submitted. Rendering is not working.

### The second half: the fix looked like it had failed

After the fix was committed and all tests were green, the user reported the
form was *still* broken. It was — in their browser. `next dev` had never
recompiled.

This is the bind-mount watcher problem recorded in `PROGRESS.md`, and it is
worse than it sounds: the file on disk was correct, the file inside the
container was correct, every test read the correct file, and the browser was
still executing the previous build. Reading a file to check a fix landed
proves nothing about what the running app is serving.

What settled it was the browser console, not any file:

```
Warning: Function components cannot be given refs.
  at FormField (webpack-internal:///.../components/form-field.tsx:8:11)
```

Line 8 was where the *old* plain function sat. The stack trace was pointing
at code that no longer existed on disk. `docker compose stop web && rm -rf
apps/web/.next && docker compose up -d web` fixed it, and the same login
then succeeded in a real browser.

**Rule this establishes:** on this machine, after editing anything under
`apps/web`, assume the dev server has *not* picked it up. Verify in a
browser, not by re-reading the file. A passing test suite and a correct file
on disk are both compatible with the user staring at last week's bundle.

## Phase 15 — Production deployment

**Status is deliberately amber, not green.** The production images build and
the configuration is written to be correct, but nothing here has faced a real
hostname, certificate or proxy. Calling that "done — verified" would be
claiming a kind of verification that has not happened. See
[`docs/DEPLOYMENT.md`](DEPLOYMENT.md).

**Production Dockerfiles**, separate from the `.dev` ones rather than
parameterised. Multi-stage, non-root (`USER node`), and `tini` as the entry
point so SIGTERM reaches node and Nest's shutdown hooks actually run —
without that, a container stop kills the process mid-query and Prisma's pool
is never closed. The web image uses Next's `output: "standalone"`, which
traces the modules it needs; the alternative in a pnpm workspace is shipping
the whole symlinked `node_modules` tree.

**`docker-compose.prod.yml`** differs from the dev stack in three ways that
matter: nothing but the proxy publishes a port, there are no source bind
mounts, and **migrations run as their own one-shot container**. With more
than one API replica an entrypoint migration means every replica races to
migrate the same database on every deploy. It runs `migrate deploy`, never
`migrate dev` — the latter offers to drop the database when it finds drift,
and in a non-interactive container it does not stop to ask twice.

**nginx** terminates TLS and serves both apps from one origin. That is not
cosmetic: the refresh token is `SameSite=Strict` scoped to `Path=/v1/auth`,
so splitting the app and API across hostnames would stop the browser sending
it, and the usual fix (`SameSite=None`) discards exactly the protection that
cookie exists for. Webhooks bypass Next's rewrite with request buffering off,
because provider signatures are computed over the exact bytes sent.

**Two security changes came with this phase:**

- **Swagger is off in production.** It described every route, DTO and auth
  requirement to anyone who asked. `SWAGGER_ENABLED=true` re-enables it for a
  staging box that genuinely needs it.
- **`TRUST_PROXY_HOPS` defaults to 0.** Rate limiting keys on the client
  address, so behind a proxy the API must read `X-Forwarded-For` — but
  trusting that header when nothing sets it lets any client claim any IP and
  reduces the limiter to decoration. The safe default is therefore the
  inconvenient one, and `docs/DEPLOYMENT.md` says to set it to `1` behind the
  bundled nginx (and `2` behind nginx plus a CDN).

### Verification log (2026-07-31) — Phase 15

- Both production images build from a clean context. API lint and typecheck
  clean after the `main.ts` and `bootstrap.ts` changes.
- `pnpm install --frozen-lockfile` inside the image build confirms the
  committed lockfile is consistent — "Lockfile is up to date, resolution step
  is skipped".
- Full regression after the changes: **75/75 API unit, 141/141 API e2e,
  31/31 frontend**, lint and typecheck clean on both apps.
- CI now builds both production images, because a Dockerfile can break while
  every other check stays green — which is exactly what happened here. CI
  also had to be given the short rate-limit window: at the production
  setting the whole e2e run shares one IP and would exhaust the
  20-per-15-minutes credential bucket partway through.

Both images were then **run**, not merely built:

- **web** (225 MB, against the dev image's 1.14 GB) serves `/`, `/login` and
  `/admin` with 200s.
- **api** (645 MB) reports `{"status":"ok","database":"up"}`, serves
  `/v1/products`, runs as `uid=1000(node)`, and returns **404 for `/docs`**,
  confirming the Swagger gate. `docker stop` returns in 3 seconds rather than
  hitting the 10-second SIGKILL timeout, so `tini` is forwarding SIGTERM and
  Nest's shutdown hooks are running.

Three real defects in my own Dockerfiles, all found by building and running
rather than by reading:

1. **`COPY --from=build .../@prisma+client*` failed**: "cannot copy to
   non-directory". pnpm's store is a tree of symlinks and the glob flattened
   two entries onto one path. Copying the generated client looked cheaper
   than regenerating it; regenerating in the runtime stage is both simpler
   and guaranteed to match that stage's `node_modules`. This is also why
   `prisma` moved from devDependencies to dependencies — the migrate service
   runs `prisma migrate deploy` from the same image, so the CLI has to be
   there regardless.
2. **`RUN chown -R node:node /workspace` ran for over ten minutes** and was
   killed. It also buys nothing: the application only reads those files and
   root-owned files are world-readable, while the recursive chown copies
   every inode in `node_modules` into a new layer. Removing it took the image
   from 904 MB to 645 MB.
3. **The image built fine and then died on startup**: `Cannot find module
   '/workspace/apps/api/dist/main.js'`. `tsconfig.build.json` did not exclude
   `prisma/`, so TypeScript inferred the package root as `rootDir` and emitted
   `dist/src/main.js`. Excluding it restores the conventional layout and, as a
   side effect, stops shipping a compiled **seed script — which can create a
   super admin —** into the production image. This one is the argument for
   running the image rather than trusting a green build: nothing before that
   point was red.

A process note, third time this pattern has appeared: **the first API image
build reported exit code 0 while having failed.** The command ended with
`tail`, so the shell reported `tail`'s status, not the build's. The failure
was plainly in the log. Check the log, not the exit code, when the exit code
comes from the end of a pipeline.

## Phase 14 — Testing

The gap this phase existed to close was blunt: **the frontend had zero
tests.** Every phase before it verified the API and then checked the web app
by building it and curling a few routes, which proves the pages compile and
render — nothing about whether they render the *right* thing.

Jest + React Testing Library via `next/jest`, 31 tests across five suites,
wired into the existing root `pnpm -r run test` so CI picks them up with no
workflow change.

What was chosen for coverage, and why those:

- **`sign-in-errors.test.ts`** — the strings a locked-out user reads. A
  wrong message here sends someone to support instead of telling them to
  wait sixty seconds, and it is invisible in a screenshot. Also pins that
  the raw `ThrottlerException` text never reaches a user.
- **`require-staff.test.tsx`** — that children do **not** render while the
  session is still `idle`. A flash of the admin UI before the session
  resolves is the specific bug this component exists to prevent, and it is
  the kind that only shows up on a slow connection.
- **`admin-overview.test.tsx`** — the currency handling from Phase 12,
  including that a euro total is not labelled with a dollar sign.
- **`admin-user-list.test.tsx`** — that an ordinary ADMIN is not offered
  admin-level roles, VENDOR is never offered, and CUSTOMER/VENDOR have no
  revoke button. The server refuses all of these anyway; the test is that
  the UI does not present controls that can only fail.
- **`admin-order-list.test.tsx`** — that a server refusal is surfaced
  verbatim, and that the buttons send what they say they send.

**Mutation-checked.** Reverting `admin-overview.tsx` to the old hardcoded
`"USD"` turned exactly the two currency tests red, and they were the two
that should have been. The rest stayed green, which is also correct — they
are not about currency.

### Verification log (2026-07-31) — Phase 14

- **31/31 frontend**, 75/75 API unit, 141/141 API e2e. Web lint and
  typecheck clean with the test files included.
- `pnpm install --frozen-lockfile` verified against the regenerated
  workspace lockfile, so CI's install step will not fail on the new
  dev-dependencies.
- A worker-teardown warning ("failed to exit gracefully") was fixed rather
  than tolerated: react-query's five-minute default `gcTime` kept a timer
  alive past the end of the run. The test clients now use `gcTime: 0` and
  are cleared in `afterEach`.

Two pieces of environment friction, both already-known patterns that bit
again:

1. `jest.mock("@/lib/api")` failed to resolve from tests under `app/` even
   though ordinary imports of the same alias worked. Stating
   `moduleNameMapper` explicitly instead of relying on `next/jest`'s
   tsconfig inference fixed it.
2. A `pnpm add` running inside the web container died when the container
   restarted under it — and **reported exit code 0 with empty output.**
   Same lesson as the `timeout`-wrapped build in Phase 10 and the
   `restart && exec` chain in Phase 11: silence from a long command in this
   environment means it was killed, not that it passed. Here the install had
   in fact completed first, which only makes the signal more misleading. The
   lockfile was regenerated with the documented one-off `docker run`, which
   also needed `MSYS_NO_PATHCONV=1` — Git Bash rewrote `-w /repo` into a
   Windows path and Docker rejected it.

## Phase 13 — Security hardening

**Account lockout on repeated failed sign-ins.** `src/auth/login-lockout.ts`
holds the policy as pure functions: five consecutive failures lock the
account, and repeat offenders climb a ladder of 1 → 5 → 15 → 60 minutes that
caps rather than growing without bound. Any success clears the counter, so a
user who mistypes and then gets it right is never penalised.

Two design decisions worth stating, because both cut against an obvious
alternative:

- **The lock is time-boxed, not permanent.** A permanent lock turns this
  control into a denial-of-service — anyone who knows a victim's email could
  disable their account at will. A short lock costs an attacker orders of
  magnitude in throughput and costs a real user a few minutes.
- **It counts the account, not the IP.** An attacker with a proxy pool never
  trips a per-IP counter. The account is what is under attack, so the account
  is what is counted. IP limits are still there, one layer out.

The lock is checked *before* the password is verified, so guessing during a
lock window costs the attacker a database read rather than an argon2 hash,
and cannot succeed even with the right password. Failed 2FA codes feed the
same counter: without that, an attacker holding the password would get
unlimited guesses at a six-digit code, which is the whole of the remaining
protection.

Unknown accounts always answer 401, never the 403 that would confirm an
account exists to be locked.

**Two-tier rate limiting.** The global bucket (100/min by default) covers
everything; a strict bucket (20 per 15 minutes) applies only to routes
carrying `@StrictRateLimit()` — sign-in, 2FA, registration, password reset,
verification resend. The strict throttler is a named throttler that opts
*out* of everything unmarked via `skipIf` reading the decorator's metadata,
rather than matching URL prefixes: a prefix match silently stops protecting a
route the moment someone renames or re-mounts it, and a decorator moves with
the handler. All four limits are env-tunable, because the right numbers
depend on whether the API sits behind a shared NAT or a CDN.

**NUL bytes in request paths.** Found by probing rather than by reading:
`GET /v1/products/%00` returned 500, because Postgres refuses `0x00` in a
text column and the driver threw. Nothing leaked — the response body was the
generic "Internal server error" and the stack stayed in the server log — but
a malformed path is the client's error, and answering it with a 500 both
misreports the fault and lets anyone fill the error log at will. Rejected at
the edge with a 400, rather than per-parameter: every route with a string
path parameter has the same problem.

**The frontend now distinguishes the refusals.** A locked account (403) and a
throttled device (429) previously both showed "something went wrong", which
invites the one response that makes both worse — retrying immediately.

### Two prior notes corrected

- **"Meilisearch has no auth in Compose" was wrong.** The key is enforced: an
  unauthenticated `/indexes` request returns 401, verified directly. What is
  actually dev-only is that the key is a published placeholder and the port
  is bound to the host; the compose file now says so and states the
  production settings.
- **"SUPPORT reads all orders" is a deliberate design, not a gap.** SUPPORT
  is read-only on orders and cannot move money-adjacent state, and both
  halves are already covered by `admin-orders.e2e-spec.ts`. Seeing customer
  orders is the role's purpose; narrowing it would break the role.

### Verification log (2026-07-31) — Phase 13

- **75/75 unit** and **141/141 e2e across 12 suites**; lint and typecheck
  clean.
- `security.e2e-spec.ts` (11 tests) proves the lock end to end, including the
  assertion that matters most: **after the threshold, the *correct* password
  is refused too.** Without that check the counter would be decorative. Also
  covered: the lock expires, a success clears the counter, an unrelated
  account still signs in, and unknown emails never reveal themselves.
- `login-lockout.spec.ts` (9 tests) pins the ladder — `[60, 300, 900, 3600]`
  seconds — and its cap.

Three problems surfaced during verification, all worth recording:

1. **A hang that looked like a broken test.** The suite sat for seven minutes
   at ~5% CPU. The cause was environmental: the api container takes its
   environment from `env_file` at *container start*, so the newly added
   `RATE_LIMIT_TTL_MS` wasn't there, the Zod default of 60s applied, and each
   test slept a full production window. Recreating the container fixed it —
   but the test was also wrong to be capable of that, so it now caps how long
   it will wait and reports why it skipped instead of hanging.
2. **ECONNRESET on the parallel bursts.** supertest calls `listen(0)` per
   request and closes it when that request ends; with a parallel burst the
   first response to land tore the listener down under the others. Binding
   the server once in `beforeAll` makes supertest reuse the address.
3. **A flaky assertion, fixed rather than loosened.** The global-bucket burst
   straddled a window boundary, so its requests were split across two
   allowances and legitimately saw no 429. That is a property of the clock,
   not of the limiter, so the test retries a few rounds instead of encoding
   a lucky burst size.

One genuine robustness fix came out of the unit run: the stale mocks in
`auth.service.spec.ts` exposed that `isLockedOut` read a *missing*
`lockedUntil` as **locked** (`undefined !== null`). Harmless against Prisma,
which always returns the column, but it fails in the worst direction — it
would lock people out of accounts they hold the password to. It now treats
absent as unlocked, with a test pinning that.

## Verification log (2026-07-31) — Phases 11 (UI) & 12

- API lint + typecheck clean; **130/130 e2e across 11 suites**, including the
  new `analytics.e2e-spec.ts` (9 tests).
- Web lint + typecheck clean. One real defect found and fixed on the way:
  TS2322 in `admin-overview.tsx`, where an inline ternary produced a union
  TypeScript rejects as `HeadersInit`. Built as an explicit
  `Record<string, string>` instead.
- Clean production build, **18 routes**, all four admin routes present and
  prerendered. Verified live after restart: `/admin`, `/admin/orders`,
  `/admin/vendors`, `/admin/users` all 200 and render the nav and staff
  guard — no error boundaries.
- Analytics endpoints exercised live: authenticated admin 200, anonymous
  401, ordinary customer 403.

**The analytics test was the point of this pass.** The endpoints answered
fine against a database with zero orders, which proves nothing about the
revenue rule — the interesting behaviour is what gets *excluded*. The suite
creates six orders (paid, delivered, a 60-day-old paid one, plus pending
999k / refunded 777k / cancelled 666k) and asserts deltas against a
baseline captured before they exist, because the database is shared with
the other suites and the seed. Deliberately large unsettled amounts mean a
leak would be off by far more than the real total, not by a rounding error.

**Mutation-checked, given the Phase 6 lesson about tests that pass
vacuously.** Adding `PENDING` to `SETTLED_STATUSES` turned exactly three
tests red (revenue, window figures, best sellers) and the service was then
restored. The unsettled-order counts stayed green under that mutation,
correctly — they come from their own queries.

**Two real fixes came out of writing it**, neither found by reading the
code: unbounded `limit`/`days` query parameters, and the dashboard printing
a USD symbol on a total it had no currency information about.

Test bugs I made, both mine rather than service defects (the running tally
of red runs caused by my own tests rather than real bugs continues):
`type: "BOOK"` is not in `ProductType`, and the first draft captured the
baseline *after* creating the fixture products, so the product-count delta
was 0 instead of 2.

## Verification log (2026-07-30) — Phase 11 (part 1)

- **66/66 unit tests** and **121/121 e2e tests across 10 suites**, passing
  first run; lint and typecheck clean.
- The escalation and lockout tests assert *state*, not just status codes:
  after a refused escalation the target user's roles are re-read and
  checked to still lack ADMIN/SUPER_ADMIN, and after a refused
  self-revocation the actor is confirmed to still hold SUPER_ADMIN.
- Process note: a `docker compose restart api && docker compose exec …`
  chain silently produced no output — the exec died with the restart.
  Splitting them fixed it. Same lesson as the `timeout`-wrapped build in
  Phase 10: silence here means something was killed, not that it passed.

## Verification log (2026-07-30) — Phase 10

- `lint` and `typecheck` clean; clean production build with **all 14
  routes**, the four new account pages prerendering as static (they fetch
  client-side from authenticated endpoints).
- All account routes verified live after restart (`/`, `/account`,
  `/account/security`, `/account/addresses`, `/account/licenses`,
  `/orders`) → 200.
- A note on process, not code: my first build attempt produced *no output
  at all* because I wrapped it in `timeout 800`, which killed it partway.
  Re-running without the wrapper and redirecting to a log file gave the
  full result. Worth remembering that a silent "success" here usually
  means something was killed, not that it passed.

## Verification log (2026-07-30) — Phase 9

- **58/58 unit tests** and **108/108 e2e tests across 9 suites**; lint and
  typecheck clean.
- One failure, and it was **my test's wrong assumption, not a code bug** —
  and it was the *same* env-precedence subtlety already recorded in the
  Phase 6 log. `.env` defines a real `EDU_SETUP_SIGNING_SECRET`, and a
  non-empty `.env` value takes precedence over what a test puts in
  `process.env`, so the app signed with one secret while the test verified
  with another. Fixed by reading the secret from the running app's
  `ConfigService` — which is also more faithful, since it verifies with the
  key the app actually signed with. Knowing that precedence rule from
  Phase 6 is what made this a two-minute diagnosis instead of another
  hypothesis hunt.

## Verification log (2026-07-30) — Phase 8

- **96/96 e2e tests across 8 suites**, passing on the first run, lint and
  typecheck clean.
- The isolation tests are the point of this phase: vendor A gets 404 on
  read, edit *and* delete of vendor B's product, and the test then asserts
  vendor B's product is genuinely untouched (price unchanged, `deletedAt`
  still null) rather than just trusting the status code. Vendor A also sees
  zero of vendor B's earnings.
- Also covered: applying twice 409s; a PENDING vendor can't reach product
  routes; illegal vendor transitions 409; a suspended vendor loses access;
  and the commission snapshot survives a later rate change.

## Verification log (2026-07-30) — Phase 7

- **80/80 e2e tests across 7 suites**, passing on the first run, with lint
  and typecheck clean. No fixes were needed — a first for this build, and
  probably because the transition table and the shared payment logic were
  already in place and tested.
- Coverage worth noting: illegal transitions (`PENDING` → `DELIVERED`)
  409; a no-op transition to the current status 409s rather than writing a
  duplicate history row; tracking is refused on unpaid *and* on
  cancelled/refunded orders; a reversed date range 400s instead of quietly
  returning nothing; and the full `PAID → PROCESSING → SHIPPED →
  DELIVERED` walk asserts four history rows attributed to the right admin.

## Verification log (2026-07-30) — Phase 6b (Paystack, pay button)

- Added a **Paystack** provider written from its own spec, not copied from
  Stripe: HMAC-**SHA512** over the raw body, keyed with the **secret key**
  (there is no separate webhook secret), in `x-paystack-signature`, and
  with **no timestamp** — so there is no replay window and the idempotency
  ledger carries more weight. Paystack webhooks also carry **no unique
  event id**, so the idempotency key is `${event}:${reference}`. There is
  a test asserting a SHA256 signature is rejected, specifically to catch
  the copy-paste failure mode.
- Refactored the shared webhook logic (idempotency claim, amount
  reconciliation, guarded status transition, payment upsert) into
  provider-agnostic methods taking a normalised event, so Stripe and
  Paystack share one implementation and adding Flutterwave/PayPal is
  mostly a matter of writing a verifier plus a normaliser.
- Added the frontend Pay button, gated on `GET /v1/payments/providers` so
  it never appears on a deployment that would only return 503.
- **A real bug I introduced by not following my own documented procedure.**
  `pnpm add stripe` was run *inside the running container*, which updates
  the lockfile in the container but not on the host. The committed
  `pnpm-lock.yaml` therefore had **zero** references to `stripe` while
  `apps/api/package.json` required it — CI's `--frozen-lockfile` would
  have failed outright, and a fresh container built from the image had no
  `stripe`, producing a wall of misleading "Cannot find module 'stripe'"
  and "Prisma has no exported member" type errors. The README already
  documents the three-step add-a-dependency procedure (add → regenerate
  lockfile workspace-wide → recreate container); I did step 1 only. Same
  trap as Phase 3, second occurrence.
- **Docker `exec` broke mid-session again** (`OCI runtime exec failed:
  error starting setns process`) while the containers themselves stayed
  healthy. `docker compose run --rm` still worked and is a usable fallback
  — but note that `run` creates a container **from the image**, so it does
  not see packages installed into a running container, which is what
  exposed the lockfile bug above.

### Phase 6b verification (after Docker recovered)

Docker Desktop went down entirely mid-phase (the `dockerDesktopLinuxEngine`
named pipe disappeared), so this work sat unverified for a while. Once it
came back the full pass ran:

- **48/48 unit tests**, **66/66 e2e tests** across all six suites, with
  `lint` and `typecheck` clean.
- **The Stripe refactor did not regress behaviour** — all 15 Stripe
  payment tests pass. The one Stripe failure was a stale *assertion* of
  mine: `availableProviders()` legitimately returns two providers now, but
  the test still demanded an array of exactly one. Rewritten to assert by
  membership (plus "nothing claims to be configured"), so adding a third
  provider won't break it again.
- **Two Paystack failures were also my test bugs, not code bugs.** Both
  queried `payment` by `{ orderId, provider }` without scoping to a
  `providerRef`, so they picked up the `FAILED` row that the
  amount-mismatch test deliberately leaves behind. The code was right:
  a mismatched attempt is recorded as `FAILED` for the audit trail *and*
  a later success is a separate `SUCCEEDED` row. The Stripe suite already
  scoped by reference; I hadn't carried that over. Both now scope by
  reference, and the idempotency test asserts the accurate claim — "this
  reference produced exactly one row" — rather than "this order has one
  row".

Worth noting the shape of this: of three red tests, **zero** were real
defects. Had I trusted the red run and "fixed" the service, I'd have
broken working code — the same lesson as the Phase 5 contention failure.

## Verification log (2026-07-30) — Phase 5

- **42/42 unit tests** (pricing math incl. rounding, order-number format
  and 5000-iteration collision check) and **41/41 e2e tests** pass.
- `lint` and `typecheck` clean on `apps/api`.
- Live HTTP check: preview returned correct subtotal/shipping/tax/total for
  a digital-only cart; `POST /v1/orders` returned **201** with a
  `WS-YYYYMMDD-…` order number, correct `titleSnapshot` and
  `unitPriceCents`, `status: PENDING`, and `addressId: null` (no address
  required for digital).
- E2E coverage worth calling out: an order's snapshot price is asserted
  *unchanged after the product is repriced*; two concurrent checkouts for a
  single remaining unit are asserted to produce **exactly one** 201 with
  final `stockQty` of 0 (never negative); a product archived while in the
  cart returns 409; another user's order number and address both 404.
- **A failure I caused, not a code bug — worth recording as a hazard.** The
  first full-suite run had 2 failures in `checkout.e2e-spec.ts`. Cause: I
  was running manual `curl` checkout requests against the *same* database
  while the suite was executing, which mutated shared state mid-test. Run
  in isolation the suite passed 14/14, and a clean full re-run passed 41/41
  in 42s (vs 126s under contention). **Don't touch the dev database while
  the e2e suite is running** — it shares one Postgres with no per-test
  isolation.
- Fixed a real type error that `next lint` passed but `tsc` caught:
  `addresses[0]` after a `length > 0` check is still `| undefined` under
  `noUncheckedIndexedAccess`. Narrowed the resolved value instead of
  trusting the index. (Worth noting `next build` runs its own type check,
  so this would have failed the build too.)
- Clean production build succeeds with all 10 routes. `/checkout`,
  `/orders`, and `/cart` prerender static (they fetch client-side from
  authenticated endpoints); `/orders/[orderNumber]`, `/products`, and
  `/products/[slug]` are server-rendered on demand.
- All live routes re-checked after restart (`/`, `/products`, `/cart`,
  `/checkout`, `/orders`, `/login`) → 200.

## Verification log (2026-07-30) — Phase 4

- **33/33 unit tests** (15 new cart tests) and **27/27 e2e tests** pass.
- `lint` and `typecheck` clean on both `apps/api` and `apps/web`.
- Live HTTP check against the running stack: empty cart → `itemCount 0`;
  add qty 2 → `unitPriceCents 5000, subtotal 10000` (price resolved
  server-side); a request carrying `priceCents` → **400** (rejected by
  `forbidNonWhitelisted`, so client price injection can't even reach the
  service); adding past `stockQty` → rejected.
- **Fixed a real test-isolation bug found by accident.** A crashed e2e run
  left its fixture products in the database *as `PUBLISHED`* — so
  "Cart Limited 1785…" was live on the public storefront and was the first
  result from `/v1/products`. Two changes: fixtures now use a
  `cart-fixture-` slug/email prefix, and `beforeAll` sweeps any leftovers
  from a previous crashed run before creating new ones, so a dead run
  self-heals instead of polluting the catalog. Purged the leaked rows
  (catalog is back to exactly the 7 seeded products, 8 categories, 1 user).
- **Fixed a real e2e performance/reliability bug.** Jest was running the 3
  e2e suites in parallel workers, each booting its own Nest app against
  the *same* Postgres. That wasn't merely slow — it thrashed badly enough
  to blow the 30s hook timeout and fail all 24 tests. With
  `maxWorkers: 1`, total runtime dropped from an estimated 863s to 150s
  and individual suites from 100s+ to ~13s.
- The earlier `afterAll` guard work paid off immediately: when the parallel
  run failed, the output showed the *actual* timeout instead of the
  masking "Cannot read properties of undefined (reading 'user')".
- Clean production build of `apps/web` succeeds with all 8 routes.
  `/cart` prerenders as static (it fetches client-side from the
  authenticated endpoint), while `/products` and `/products/[slug]` remain
  server-rendered on demand.
- All 6 live routes re-checked after restart (`/`, `/products`, `/cart`,
  `/login`, `/register`, `/products/introduction-to-algebra`) → 200.

## Verification log (2026-07-29)

Docker Desktop's engine was unhealthy for most of the session (500s from
the daemon); once the user restarted it, the full stack was brought up
and verified for real — not just traced by hand:

- Fixed a genuinely broken Postgres data directory (bind-mount I/O stalled
  mid-`initdb`, most likely fallout from the earlier engine instability)
  by wiping the (empty, first-run) `.docker-data/postgres` volume and
  restarting — `initdb` then completed normally (~80s, slow bind-mount
  disk sync, not a hang).
- Fixed a real bug: `apps/api/tsconfig.json` was missing
  `esModuleInterop`, so the compiled `cookie-parser` default import
  crashed at runtime (`TypeError: ... is not a function`) even though
  `tsc`, `nest build`, and `helmet`'s default import all looked fine —
  helmet happens to self-export `.default`, cookie-parser doesn't.
- Fixed a real bug: Prisma's query engine binary needs a real `libssl` to
  `dlopen`; `node:20-alpine` doesn't ship one, so Prisma silently guessed
  the wrong engine target and crashed on `PrismaService.onModuleInit`.
  Fixed by installing `openssl` in `apps/api/Dockerfile.dev`.
- Fixed a real lint failure: an unused `EnvConfig` import in
  `mailer.service.ts`.
- Ran the real `prisma migrate dev --name init` — migration history now
  exists at `apps/api/prisma/migrations/` and is committed.
- Ran `pnpm prisma:seed` — roles, permissions, and the super admin account
  were created for real.
- Confirmed over real HTTP: unauthenticated `/v1/auth/me` → 401; super
  admin login → 200 with `SUPER_ADMIN` role; authenticated `/v1/auth/me`
  → 200; storefront renders at `localhost:3000`; Swagger loads at
  `localhost:4000/docs`.
- `pnpm lint` / `pnpm typecheck` / `pnpm build` pass clean on **both**
  `apps/api` and `apps/web`.
- **11/11 unit tests pass** (`auth.service.spec.ts`) and **9/9 e2e tests
  pass** (`test/auth.e2e-spec.ts`, against the real Postgres container —
  including CSRF-header enforcement and refresh-token rotation/reuse
  detection).

## Verification log (2026-07-30) — Phase 3

- Fixed a real config bug before it could bite: the Next.js rewrite
  proxied `/api/*` → API, but the refresh cookie is scoped
  `Path=/v1/auth`. A browser calling `/api/v1/auth/refresh` would never
  have sent that cookie. Changed the rewrite to preserve `/v1/*` exactly,
  then confirmed via `curl` through port 3000 that the cookie comes back
  with `Path=/v1/auth` and is accepted on the next request.
- Fixed a real test-infra failure: e2e `beforeAll` began exceeding Jest's
  5s default hook timeout as the app grew more modules (all 15 e2e tests
  failed at once). Added `testTimeout: 30000` to the e2e Jest config.
- **Committed a real `pnpm-lock.yaml`** and switched CI from
  `--frozen-lockfile=false` to `--frozen-lockfile`. Note: a lockfile
  generated *inside* the `api` or `web` container only covers that one
  package, since each Dockerfile copies just its own `package.json` — it
  has to be generated with the whole workspace mounted. Verified the
  committed lockfile passes `--frozen-lockfile` and is byte-identical
  afterward (all 3 importers: `.`, `apps/api`, `apps/web`).
- Switched CI's schema step from `prisma db push` to
  `prisma migrate deploy` (the follow-up noted in the 2026-07-29 log).
- Confirmed over real HTTP against the running stack: `/`, `/products`,
  `/login`, `/register`, and `/products/introduction-to-algebra` all 200;
  a nonexistent product slug correctly 404s; `/products` renders real
  seeded titles; `?category=islamic-books` server-side filters down to
  the one matching product; the detail page renders `$499.00` formatted
  currency, live stock state, and valid Schema.org `Product` JSON-LD.
- Confirmed the browser auth path end-to-end **through the Next proxy**:
  refresh without the CSRF header → 403; with it → 200 + rotated cookie;
  replaying the old cookie → 401 (reuse detection); rotated access token
  on `/v1/auth/me` → 200.
- **18/18 unit tests** and **15/15 e2e tests** pass (the e2e suite covers
  RBAC rejection for a customer token, DRAFT products staying invisible
  publicly until published, and category-delete protection); `lint`,
  `typecheck`, and `build` clean on both apps.
- Note on running the suites: the e2e suite and a `next build` compete
  hard for CPU on this machine. Run sequentially — running them
  concurrently caused e2e bootstrap to blow past even a 30s hook timeout
  and produced a spurious full-suite failure.
- Final `next build` output confirms the intended rendering strategy:
  `/`, `/login`, `/register`, `/_not-found` prerender as static, while
  `/products` and `/products/[slug]` are server-rendered on demand
  (correct — they read `searchParams` and live catalog data).
- Fixed a real Docker bug that `tsc` could not catch: `apps/*/node_modules`
  is an **anonymous volume** (it has to be, to shadow the host bind mount,
  which has no `node_modules`). Anonymous volumes survive
  `docker compose up --build`, so after adding `@hookform/resolvers` the
  container kept a stale `node_modules` — the package sat in the pnpm
  store but was never symlinked into `apps/web/node_modules`, and
  `next build` failed with "Cannot find module '@hookform/resolvers/zod'".
  Fixed with `docker compose rm -sfv web` before rebuilding; documented in
  the README so adding a dependency doesn't hit the same trap.
- Fixed a real weakness in my own e2e tests: `afterAll` called
  `prisma.user.deleteMany(...)` unguarded. Jest runs `afterAll` even when
  `beforeAll` fails, so a bootstrap failure produced a misleading
  "Cannot read properties of undefined (reading 'user')" that *replaced*
  the actual error. Both suites now guard teardown so the real failure
  surfaces.
- Two false alarms worth recording so they aren't re-investigated:
  1. `School Management System — Standard License` appeared mangled when
     piped through Python in this Windows shell. The database, raw
     `curl`, and the browser all render the em-dash correctly — a
     Git-Bash console encoding artifact in the verification command, not
     a data bug.
  2. The web app briefly returned 500s and a build failed with
     `PageNotFoundError: Cannot find module for page: /`. Cause was
     running `next build` while `next dev` was live in the same
     container — they share `apps/web/.next` and clobber each other. Not
     a code defect; the README now documents building with dev stopped.

## Known gaps

- **No checkout, orders, or payments yet** — Phases 5–7. The cart page
  intentionally stops at a subtotal with no "Checkout" button until there's
  a checkout flow behind it.
- **No guest carts.** Adding to cart requires sign-in (see the Phase 4
  decision note above).
- **Cart prices are live, not locked.** A cart line re-reads the current
  product/variant price on every fetch, so a price change between adding
  and viewing is reflected immediately. That's correct for a cart, but
  checkout will need to snapshot prices into `OrderItem.unitPriceCents`
  (the column already exists) and decide how to handle a price that moved
  mid-session.
- **Stock isn't reserved.** Stock is validated when adding to the cart but
  nothing is held, so two users can both hold the last unit in their carts.
  Checkout must re-validate and decrement atomically.
- **No verify-email / password-reset / 2FA-management UI.** Those API
  endpoints are complete and documented in Swagger, and login handles a
  2FA challenge, but there are no `/verify-email`, `/reset-password`, or
  account-settings pages yet.
- **No admin UI.** Admin catalog endpoints are role-gated and working,
  but they're API-only — no dashboard screens (Phase 11). There's also no
  endpoint for granting/revoking roles, so promoting a user to ADMIN
  currently requires a direct database write.
- **Product images are URLs, not uploads.** No S3/R2 client is wired up;
  the seed points at Unsplash URLs. Real upload handling comes with the
  storage work.
- **Search is a SQL `contains` match**, not Meilisearch. Meilisearch runs
  in Docker Compose but nothing indexes to it yet — fine at demo volume,
  will need revisiting before real catalog size.
- No BullMQ processors or payment/notification provider SDKs — only env
  vars are reserved (Phases 6/8/9). `MailerService` is real (nodemailer)
  but has no queue/retry behind it.
- Test coverage is meaningful but not exhaustive: `auth` and `catalog`
  have unit + e2e suites; the frontend has no component tests yet.
- **Jest warns "a worker process has failed to exit gracefully"** after
  the unit suite. All tests pass, but something (likely argon2's
  threadpool) isn't torn down. Harmless locally; worth fixing with
  `--detectOpenHandles` before it causes CI hangs. Deliberately *not*
  papered over with `forceExit`, which would hide the leak.
- **E2E suites run serially** (`maxWorkers: 1`). They share one Postgres
  and each boots its own Nest app, so parallel workers both exhausted this
  machine and risked cross-suite interference on shared tables. If the
  suite count grows a lot, consider a per-worker schema instead.
