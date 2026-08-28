-- Staff appraisals.

CREATE TYPE "AppraisalStatus" AS ENUM ('DRAFT', 'SHARED', 'ACKNOWLEDGED');

CREATE TABLE IF NOT EXISTS "appraisals" (
  "id"                  TEXT NOT NULL,
  "subjectUserId"       TEXT NOT NULL,
  "reviewerUserId"      TEXT NOT NULL,
  "reviewerName"        TEXT NOT NULL,
  "periodLabel"         TEXT NOT NULL,
  "status"              "AppraisalStatus" NOT NULL DEFAULT 'DRAFT',
  "strengths"           TEXT,
  "development"         TEXT,
  "comment"             TEXT,
  "sharedAt"            TIMESTAMP(3),
  "acknowledgedAt"      TIMESTAMP(3),
  "acknowledgementNote" TEXT,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL,
  "deletedAt"           TIMESTAMP(3),
  CONSTRAINT "appraisals_pkey" PRIMARY KEY ("id")
);

-- Nobody appraises themselves. The service refuses it too; this makes the row
-- impossible rather than merely unusual, because an appraisal somebody wrote
-- about themselves is the kind of thing that only surfaces years later.
ALTER TABLE "appraisals"
  ADD CONSTRAINT "appraisals_reviewer_is_not_subject"
  CHECK ("reviewerUserId" <> "subjectUserId");

-- An acknowledgement without a sharing is a signature on something never
-- shown. The status and its dates have to tell the same story.
ALTER TABLE "appraisals"
  ADD CONSTRAINT "appraisals_dates_match_status"
  CHECK (
    ("status" = 'DRAFT' AND "sharedAt" IS NULL AND "acknowledgedAt" IS NULL)
    OR ("status" = 'SHARED' AND "sharedAt" IS NOT NULL AND "acknowledgedAt" IS NULL)
    OR ("status" = 'ACKNOWLEDGED' AND "sharedAt" IS NOT NULL AND "acknowledgedAt" IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS "appraisals_subjectUserId_idx" ON "appraisals" ("subjectUserId");
CREATE INDEX IF NOT EXISTS "appraisals_status_idx" ON "appraisals" ("status");

ALTER TABLE "appraisals"
  ADD CONSTRAINT "appraisals_subjectUserId_fkey" FOREIGN KEY ("subjectUserId")
  REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "appraisal_ratings" (
  "id"          TEXT NOT NULL,
  "appraisalId" TEXT NOT NULL,
  "area"        TEXT NOT NULL,
  "score"       INTEGER NOT NULL,
  "comment"     TEXT,
  CONSTRAINT "appraisal_ratings_pkey" PRIMARY KEY ("id")
);

-- On the scale, or not at all. A score of 0 or 9 would drag an average
-- somewhere no reviewer put it.
ALTER TABLE "appraisal_ratings"
  ADD CONSTRAINT "appraisal_ratings_score_on_scale" CHECK ("score" >= 1 AND "score" <= 5);

-- One rating per area, ignoring capitals: two rows for the same area would
-- make the average depend on which was read last.
CREATE UNIQUE INDEX IF NOT EXISTS "appraisal_ratings_appraisalId_area_key"
  ON "appraisal_ratings" ("appraisalId", lower("area"));

CREATE INDEX IF NOT EXISTS "appraisal_ratings_appraisalId_idx" ON "appraisal_ratings" ("appraisalId");

ALTER TABLE "appraisal_ratings"
  ADD CONSTRAINT "appraisal_ratings_appraisalId_fkey" FOREIGN KEY ("appraisalId")
  REFERENCES "appraisals" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
