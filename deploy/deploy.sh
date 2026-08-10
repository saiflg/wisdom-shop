#!/usr/bin/env bash
#
# Deploy the production stack.
#
#   ./deploy/deploy.sh                    build, migrate, restart
#   ./deploy/deploy.sh --migrate-tenants  also migrate every school database
#
# Run from the repository root on the server.
#
# Tenant migrations are opt-in because they are the slow, risky part: every
# school has its own database and they are migrated one at a time. A release
# that only changes the control schema or application code does not need them,
# and running them unnecessarily turns a thirty-second deploy into a long one.

set -euo pipefail

cd "$(dirname "$0")/.."

COMPOSE="docker compose -f docker-compose.prod.yml"
MIGRATE_TENANTS=0
[[ "${1:-}" == "--migrate-tenants" ]] && MIGRATE_TENANTS=1

step() { printf '\n\033[1;36m==> %s\033[0m\n' "$1"; }
fail() { printf '\n\033[1;31mERROR: %s\033[0m\n' "$1" >&2; exit 1; }

# --- checks that are cheaper to fail now than halfway through ---------------

[[ -f .env ]] || fail ".env not found. Copy .env.production.example to .env and fill it in."

# A secrets file the whole machine can read is the most common way a
# deployment leaks everything at once.
perms=$(stat -c '%a' .env)
if [[ "$perms" != "600" ]]; then
	printf 'Tightening .env permissions from %s to 600\n' "$perms"
	chmod 600 .env
fi

if grep -q 'CHANGE_ME' .env; then
	grep -n 'CHANGE_ME' .env >&2
	fail ".env still contains placeholder values (listed above)."
fi

for required in SHOP_DOMAIN CAMPUS_DOMAIN ADMIN_DOMAIN ACME_EMAIL; do
	grep -q "^${required}=." .env || fail "$required is not set in .env"
done

# --- build ------------------------------------------------------------------

step "Building images"
$COMPOSE build

# --- migrate ----------------------------------------------------------------

# Postgres must be up before either migrate container can connect, and
# `up -d` on just this service leaves the rest of the stack alone.
step "Starting Postgres"
$COMPOSE up -d postgres
$COMPOSE exec -T postgres sh -c 'until pg_isready -q; do sleep 1; done'

step "Migrating the shop database"
$COMPOSE run --rm migrate

step "Migrating the ERP control database and seeding the first operator"
$COMPOSE run --rm ems-migrate

if [[ $MIGRATE_TENANTS -eq 1 ]]; then
	step "Migrating every school database"
	# The list of schools lives in the control database, so ask it rather than
	# keeping a second copy of that list here that can drift.
	#
	# Failures are collected rather than fatal: one school whose database is in
	# an odd state should not stop the other schools being migrated, and a
	# half-finished loop that exited on the first error is worse than a full
	# pass with a report at the end.
	failed=()
	while read -r db; do
		[[ -z "$db" ]] && continue
		printf '  %s ... ' "$db"
		if $COMPOSE run --rm \
			-e DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${db}?schema=public" \
			ems-migrate \
			sh -c 'pnpm prisma migrate deploy --schema=prisma/tenant/schema.prisma' >/dev/null 2>&1; then
			printf 'ok\n'
		else
			printf 'FAILED\n'
			failed+=("$db")
		fi
	done < <($COMPOSE exec -T postgres psql -U "${POSTGRES_USER}" -d "${EMS_CONTROL_DB:-wisdom_ems_control}" \
		-tAc 'SELECT database_name FROM schools ORDER BY database_name')

	if [[ ${#failed[@]} -gt 0 ]]; then
		printf '\n\033[1;31mThese school databases did NOT migrate:\033[0m\n' >&2
		printf '  %s\n' "${failed[@]}" >&2
		fail "${#failed[@]} school database(s) failed to migrate. The stack was NOT restarted."
	fi
fi

# --- run --------------------------------------------------------------------

step "Starting the stack"
$COMPOSE up -d --remove-orphans

step "Waiting for health checks"
for service in api ems-api; do
	printf '  %s ... ' "$service"
	for _ in $(seq 1 60); do
		status=$($COMPOSE ps --format json "$service" | grep -o '"Health":"[a-z]*"' | cut -d'"' -f4 || true)
		[[ "$status" == "healthy" ]] && break
		sleep 2
	done
	if [[ "$status" == "healthy" ]]; then
		printf 'healthy\n'
	else
		printf '%s\n' "${status:-unknown}"
		fail "$service did not become healthy. Check: $COMPOSE logs $service"
	fi
done

step "Deployed"
source .env
printf '  Shop:    https://%s\n' "$SHOP_DOMAIN"
printf '  Campus:  https://%s\n' "$CAMPUS_DOMAIN"
printf '  Admin:   https://%s\n' "$ADMIN_DOMAIN"
printf '\nCertificates are issued on the first request to each name, so the\n'
printf 'first page load can take a few seconds. If one hangs, check that the\n'
printf 'DNS record points here: docker compose -f docker-compose.prod.yml logs proxy\n'
