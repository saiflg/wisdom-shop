-- Live lessons: a link to a meeting the school runs somewhere else. This
-- schedules a link; it does not host video.

CREATE TABLE IF NOT EXISTS "live_lessons" (
  "id"              TEXT NOT NULL,
  "classId"         TEXT NOT NULL,
  "subjectId"       TEXT,
  "title"           TEXT NOT NULL,
  "meetingUrl"      TEXT NOT NULL,
  "startsAt"        TIMESTAMP(3) NOT NULL,
  "endsAt"          TIMESTAMP(3) NOT NULL,
  "cancelledAt"     TIMESTAMP(3),
  "createdByUserId" TEXT NOT NULL,
  "createdByName"   TEXT NOT NULL,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "live_lessons_pkey" PRIMARY KEY ("id")
);

-- A lesson that ends before it starts would sit "live" indefinitely on every
-- child's screen.
ALTER TABLE "live_lessons"
  ADD CONSTRAINT "live_lessons_ends_after_starts" CHECK ("endsAt" > "startsAt");

CREATE INDEX IF NOT EXISTS "live_lessons_classId_startsAt_idx"
  ON "live_lessons" ("classId", "startsAt");

ALTER TABLE "live_lessons"
  ADD CONSTRAINT "live_lessons_classId_fkey" FOREIGN KEY ("classId")
  REFERENCES "classes" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SET NULL: removing a subject must not delete a lesson children are waiting
-- for.
ALTER TABLE "live_lessons"
  ADD CONSTRAINT "live_lessons_subjectId_fkey" FOREIGN KEY ("subjectId")
  REFERENCES "subjects" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
