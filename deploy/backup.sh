#!/usr/bin/env bash
#
# Back up everything that cannot be rebuilt from the repository.
#
#   ./deploy/backup.sh [destination]     (default: ./backups)
#
# Suitable for cron:
#   0 2 * * * cd /opt/wisdom-shop && ./deploy/backup.sh >> /var/log/wisdom-backup.log 2>&1
#
# What is backed up, and why each one:
#
#   * EVERY database — the shop's, the ERP control database, and one per
#     school. `pg_dumpall` rather than a list of databases, because the list
#     grows every time a school is onboarded and a hardcoded list silently
#     stops covering the newest school.
#   * Uploaded files for both apps — product images and downloads, and
#     children's photographs, school logos and generated PDFs. These live only
#     on this disk; nothing regenerates them.
#   * .env — without EMS_SETTINGS_ENCRYPTION_KEY the database backup is
#     useless for the encrypted gateway credentials, because they cannot be
#     decrypted without it. A restore that has the rows but not the key means
#     every school re-enters its payment credentials.
#
# WHAT THIS DOES NOT DO: copy the archive off this machine. A backup on the
# same disk as the thing it protects is not a backup. Oracle Object Storage
# has a free tier; see docs/DEPLOY-ORACLE.md.

set -euo pipefail

cd "$(dirname "$0")/.."

DEST="${1:-./backups}"
STAMP=$(date +%Y%m%d-%H%M%S)
WORK="${DEST}/wisdom-${STAMP}"
COMPOSE="docker compose -f docker-compose.prod.yml"
KEEP_DAYS=14

[[ -f .env ]] || { echo "ERROR: .env not found; run from the repository root." >&2; exit 1; }
source .env

mkdir -p "$WORK"
# The archive contains every database and every secret. Created restrictively
# from the start rather than chmod'ed afterwards, so there is no window where
# it is world-readable.
chmod 700 "$WORK"

echo "==> Databases"
# --clean makes the dump restorable over an existing cluster without a manual
# drop first.
$COMPOSE exec -T postgres pg_dumpall -U "$POSTGRES_USER" --clean \
	| gzip > "${WORK}/databases.sql.gz"
echo "    $(du -h "${WORK}/databases.sql.gz" | cut -f1)"

echo "==> Uploaded files"
# Read straight from the volumes with a throwaway container. Reading the
# host path directly would depend on Docker's storage layout, which is not a
# stable interface.
docker run --rm \
	-v wisdom-shop_storage-data:/shop:ro \
	-v wisdom-shop_ems-storage:/campus:ro \
	-v "$(cd "$WORK" && pwd)":/backup \
	alpine tar czf /backup/storage.tar.gz -C / shop campus
echo "    $(du -h "${WORK}/storage.tar.gz" | cut -f1)"

echo "==> Secrets and certificates"
cp .env "${WORK}/env"
# Caddy's issued certificates. Not strictly required — it re-issues them — but
# Let's Encrypt rate-limits issuance, so restoring these avoids a rebuilt
# server sitting without TLS while it waits out a limit.
docker run --rm \
	-v wisdom-shop_caddy-data:/caddy:ro \
	-v "$(cd "$WORK" && pwd)":/backup \
	alpine tar czf /backup/caddy.tar.gz -C / caddy

echo "==> Packing"
tar czf "${WORK}.tar.gz" -C "$DEST" "wisdom-${STAMP}"
chmod 600 "${WORK}.tar.gz"
rm -rf "$WORK"

echo "==> Pruning backups older than ${KEEP_DAYS} days"
find "$DEST" -maxdepth 1 -name 'wisdom-*.tar.gz' -mtime "+${KEEP_DAYS}" -print -delete

echo
echo "Backup complete: ${WORK}.tar.gz ($(du -h "${WORK}.tar.gz" | cut -f1))"
echo
echo "This archive contains every password and every child's photograph."
echo "Copy it somewhere off this machine, and keep it encrypted at rest."
