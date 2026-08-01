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

**Nothing has been committed.** 200+ files are staged in a repo with no
commits. This was left alone deliberately — committing was never asked for.

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
