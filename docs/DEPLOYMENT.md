# Deploying Wisdom Shop

The development stack (`docker-compose.yml`) and the production stack
(`docker-compose.prod.yml`) are separate files rather than one file with
overrides, because almost nothing about them is the same: different
Dockerfiles, different port exposure, different secrets, different migration
strategy. Sharing a base would mostly hide that.

**Nothing here has been run against a real server.** The images build and the
configuration is written to be correct, but the first deploy will be the
first time this stack faces a real hostname and certificate. Treat the
checklist below as required, not advisory.

---

## What must change before this faces the internet

The dev `.env` is not a starting point for production — several of its values
are published placeholders that appear in this repository.

| Variable | Why the dev value is unsafe |
|---|---|
| `POSTGRES_PASSWORD` | `wisdom` — in the compose file, in git |
| `REDIS_PASSWORD` | not set at all in dev |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | anyone with these mints valid sessions for any account |
| `TWO_FACTOR_ENCRYPTION_KEY` | decrypts every stored TOTP secret |
| `EDU_SETUP_SIGNING_SECRET` | forges EMS handoff tokens |
| `MEILI_MASTER_KEY` | `changeme_dev_master_key`, published here |
| `SEED_SUPER_ADMIN_PASSWORD` | published here; change it or omit the seed |
| `RATE_LIMIT_*` | dev uses a **one-second** window so tests don't throttle each other. In production that is 100 requests per second. Use the values in `.env.example`. |

Generate secrets with real entropy:

```bash
openssl rand -base64 48
```

Also set, and they have no safe default:

- `APP_URL` — the public origin, e.g. `https://wisdomshop.example`. It is
  both the CORS origin and the value baked into the frontend bundle.
- `TRUST_PROXY_HOPS=1` — required for rate limiting to work behind the
  bundled nginx. It defaults to `0`, which ignores `X-Forwarded-For`, because
  trusting that header when nothing sets it lets any client claim any IP and
  reduces the rate limiter to decoration. Set it to the *actual* number of
  proxies; if you add Cloudflare in front, it is 2, not 1.
- `COOKIE_DOMAIN` — only if the API and web app are on different subdomains.
  They should not be; see "Why one origin" below.

Leave `SWAGGER_ENABLED` unset. It defaults to off in production, which is
what you want — the schema describes every route, DTO and auth requirement.

---

## First deploy

```bash
cp .env.example .env   # then replace every value in the table above
mkdir -p deploy/nginx/certs
```

Put `fullchain.pem` and `privkey.pem` in `deploy/nginx/certs`. For Let's
Encrypt, the HTTP-01 challenge path is already served from the
`certbot-webroot` volume on port 80.

```bash
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml run --rm migrate
docker compose -f docker-compose.prod.yml up -d
```

Migrations run as their **own one-shot container**, not from the API's
entrypoint. With more than one API replica an entrypoint migration means
every replica races to migrate the same database on every deploy; one of them
wins and the others either fail or, worse, half-apply.

`migrate deploy` applies committed migrations and never generates or resets.
`migrate dev` — which is what the development stack uses — will offer to drop
the database when it finds drift, and in a non-interactive container it does
not stop to ask twice.

---

## Routine deploys

```bash
git pull
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml run --rm migrate
docker compose -f docker-compose.prod.yml up -d
```

Migrate before starting the new containers, and write migrations so the
*previous* version of the code still works against the new schema — during
the seconds between the two commands, old containers are serving traffic
against the migrated database. In practice: add columns as nullable first,
backfill, and only drop the old ones a release later.

---

## Why one origin

The proxy serves the web app and the API from the same hostname. This is not
an aesthetic choice. The refresh token is an httpOnly cookie with
`SameSite=Strict`, scoped to `Path=/v1/auth`. Split across two hostnames, the
browser stops sending it, and the usual workaround — `SameSite=None` — throws
away the exact protection that cookie is there to provide.

Payment webhooks are proxied straight to the API rather than through Next's
rewrite, with request buffering off. Provider signatures are computed over
the exact bytes sent, so nothing in the path may re-encode the body.

---

## Backups

`docker compose down -v` deletes the `postgres-data` volume and every order,
license and account in it. There is no undo.

```bash
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > backup-$(date +%F).sql.gz
```

A backup that has never been restored is a hypothesis. Restore one into a
scratch database and check that a known order and its license are intact.

---

## What is still missing

Stated plainly rather than left to be discovered:

- **No TLS automation.** Certificates are mounted from disk; renewal is
  manual or a cron job you add.
- **No log aggregation or error tracking.** `SENTRY_DSN` exists in the env
  schema but nothing reads it yet.
- **File storage is local disk.** Product images and downloadable files are
  written under `STORAGE_ROOT`. This works, and is tested, but it is a
  single-node story: with more than one API replica each gets its own
  directory and a file uploaded to one is missing from the others. Mount a
  shared volume across replicas, or write an S3/R2 driver — `StorageService`
  exists so that swap touches one file.

  The directory is backed by the `storage-data` volume in
  `docker-compose.prod.yml`, so it survives a rebuild — but it is **not
  covered by the database backup above**. Back it up separately, or a restored
  database will reference files that no longer exist.
- **No horizontal scaling story beyond the migrate split.** The API is
  stateless and should scale, but nothing has been tested with more than one
  replica.
- **Search is a soft dependency, by design.** Products are indexed into
  Meilisearch on every write, and the storefront falls back to database
  matching whenever the engine is unreachable — verified by stopping the
  container and confirming search still returns results. The fallback has no
  typo tolerance or relevance ranking, so a prolonged outage degrades results
  rather than breaking the shop.

  A fresh Meilisearch volume starts empty. Index settings are applied on API
  boot, but the documents are not: run
  `POST /v1/admin/search/reindex` once after restoring or replacing that
  volume.
- **Only Stripe and Paystack are implemented.** Flutterwave and PayPal are in
  the env schema and the UI gates on what is configured, but there are no
  providers behind them.
