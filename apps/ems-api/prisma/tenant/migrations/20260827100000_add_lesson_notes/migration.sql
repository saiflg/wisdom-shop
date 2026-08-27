-- The written subject content for one week, vetted before children see it.
-- Distinct from lesson_plans, which is what the teacher prepares to do.

CREATE TYPE "LessonNoteStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'RETURNED');

CREATE TABLE IF NOT EXISTS "lesson_notes" (
  "id"               TEXT NOT NULL,
  "subjectId"        TEXT NOT NULL,
  "classId"          TEXT NOT NULL,
  "academicYear"     TEXT NOT NULL,
  "term"             TEXT NOT NULL,
  "weekNumber"       INTEGER NOT NULL,
  "title"            TEXT NOT NULL,
  "body"             TEXT NOT NULL,
  "status"           "LessonNoteStatus" NOT NULL DEFAULT 'DRAFT',
  "authorUserId"     TEXT NOT NULL,
  "authorName"       TEXT NOT NULL,
  "submittedAt"      TIMESTAMP(3),
  "reviewedAt"       TIMESTAMP(3),
  "reviewedByUserId" TEXT,
  "reviewedByName"   TEXT,
  "reviewComment"    TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,
  "deletedAt"        TIMESTAMP(3),
  CONSTRAINT "lesson_notes_pkey" PRIMARY KEY ("id")
);

-- One note per subject per class per week. A second one is not a second note,
-- it is somebody working from a stale copy. Partial, so a withdrawn note does
-- not block writing that week again.
CREATE UNIQUE INDEX IF NOT EXISTS "lesson_notes_class_subject_week_key"
  ON "lesson_notes" ("classId", "subjectId", "academicYear", "term", "weekNumber")
  WHERE "deletedAt" IS NULL;

CREATE INDEX IF NOT EXISTS "lesson_notes_classId_status_idx" ON "lesson_notes" ("classId", "status");

-- A week number is a week in a term, not an arbitrary integer.
ALTER TABLE "lesson_notes"
  ADD CONSTRAINT "lesson_notes_weekNumber_sane" CHECK ("weekNumber" >= 1 AND "weekNumber" <= 52);

ALTER TABLE "lesson_notes"
  ADD CONSTRAINT "lesson_notes_subjectId_fkey" FOREIGN KEY ("subjectId")
  REFERENCES "subjects" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "lesson_notes"
  ADD CONSTRAINT "lesson_notes_classId_fkey" FOREIGN KEY ("classId")
  REFERENCES "classes" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
