-- Runs only when Postgres initializes a brand-new (empty) data directory —
-- see docker-entrypoint-initdb.d in the official Postgres image docs. On an
-- already-initialized volume (like this project's dev one, which predates
-- apps/ems-api), this file is a no-op; the wisdom_ems_control database has
-- to be created manually once via `docker compose exec postgres psql -U
-- wisdom -c "CREATE DATABASE wisdom_ems_control;"` — see PROGRESS.md.
CREATE DATABASE wisdom_ems_control;
