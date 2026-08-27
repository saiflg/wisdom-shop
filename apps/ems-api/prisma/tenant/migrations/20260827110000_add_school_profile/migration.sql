-- The school's particulars as they appear on what it hands out. Separate from
-- branding_settings, which is how the console looks.

CREATE TABLE IF NOT EXISTS "school_profile" (
  "id"                 TEXT NOT NULL,
  "motto"              TEXT,
  "addressLine1"       TEXT,
  "addressLine2"       TEXT,
  "town"               TEXT,
  "state"              TEXT,
  "country"            TEXT,
  "phone"              TEXT,
  "email"              TEXT,
  "website"            TEXT,
  "registrationNumber" TEXT,
  "establishedYear"    INTEGER,
  "headTeacherName"    TEXT,
  "updatedByUserId"    TEXT,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL,
  CONSTRAINT "school_profile_pkey" PRIMARY KEY ("id")
);

-- A founding year in the future is always a typo, and one printed on a
-- transcript is a typo somebody else has to explain.
ALTER TABLE "school_profile"
  ADD CONSTRAINT "school_profile_establishedYear_sane"
  CHECK ("establishedYear" IS NULL OR ("establishedYear" >= 1800 AND "establishedYear" <= 2200));
