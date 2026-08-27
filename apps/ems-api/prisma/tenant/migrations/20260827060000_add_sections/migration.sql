-- The parts a school divides itself into: "Primary", "Secondary",
-- "Islamiyyah". Staff already carry this as free text on staff_profiles
-- ("section"), which is why turnover is read by section; this is that same
-- list kept in one place so it can be spelled one way.

CREATE TABLE IF NOT EXISTS "sections" (
  "id"          TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "description" TEXT,
  "position"    INTEGER NOT NULL DEFAULT 0,
  "headId"      TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  "deletedAt"   TIMESTAMP(3),
  CONSTRAINT "sections_pkey" PRIMARY KEY ("id")
);

-- One "Primary", not "Primary" and "primary" side by side. Partial so that
-- deleting a section and adding it back under the same name keeps working,
-- and on lower(name) because the second person to type it will use different
-- capitals. A constraint rather than a check in the service: two admins
-- adding the same section at the same moment beat any read-then-write.
CREATE UNIQUE INDEX IF NOT EXISTS "sections_name_active_key"
  ON "sections" (lower("name")) WHERE "deletedAt" IS NULL;

CREATE INDEX IF NOT EXISTS "sections_position_idx" ON "sections" ("position");

ALTER TABLE "sections"
  ADD CONSTRAINT "sections_headId_fkey" FOREIGN KEY ("headId")
  REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Nullable: a school that has never divided itself into sections still has
-- classes, and choosing one for them here would invent a fact.
ALTER TABLE "classes" ADD COLUMN IF NOT EXISTS "sectionId" TEXT;

CREATE INDEX IF NOT EXISTS "classes_sectionId_idx" ON "classes" ("sectionId");

-- SET NULL, not CASCADE: removing a section must never take its classes —
-- and the children enrolled in them — with it.
ALTER TABLE "classes"
  ADD CONSTRAINT "classes_sectionId_fkey" FOREIGN KEY ("sectionId")
  REFERENCES "sections" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
