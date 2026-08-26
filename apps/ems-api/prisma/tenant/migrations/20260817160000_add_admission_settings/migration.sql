-- Automatic admission numbers: "DA/2026/0001".
--
-- One row per school, created lazily on first use so existing schools need
-- no backfill. `counterYear` exists so the serial restarts each year, which
-- is what putting the year in the number is for.

CREATE TABLE IF NOT EXISTS "admission_settings" (
  "id"           TEXT NOT NULL,
  "abbreviation" TEXT,
  "counterYear"  INTEGER NOT NULL DEFAULT 0,
  "counter"      INTEGER NOT NULL DEFAULT 0,
  "enabled"      BOOLEAN NOT NULL DEFAULT true,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "admission_settings_pkey" PRIMARY KEY ("id")
);
