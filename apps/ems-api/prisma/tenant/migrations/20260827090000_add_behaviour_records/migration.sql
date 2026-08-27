-- Things staff write down about a child: merits and concerns.

CREATE TYPE "BehaviourKind" AS ENUM ('MERIT', 'CONCERN');

CREATE TABLE IF NOT EXISTS "behaviour_records" (
  "id"               TEXT NOT NULL,
  "studentProfileId" TEXT NOT NULL,
  "classId"          TEXT,
  "kind"             "BehaviourKind" NOT NULL,
  "category"         TEXT NOT NULL,
  "description"      TEXT NOT NULL,
  "points"           INTEGER NOT NULL DEFAULT 0,
  "occurredAt"       TIMESTAMP(3) NOT NULL,
  "recordedByUserId" TEXT NOT NULL,
  "recordedByName"   TEXT NOT NULL,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,
  "deletedAt"        TIMESTAMP(3),
  CONSTRAINT "behaviour_records_pkey" PRIMARY KEY ("id")
);

-- Points are always positive; the kind decides which way they count. A
-- negative here would let a concern improve a child's total, which is the
-- kind of thing nobody notices until a report card is already printed.
ALTER TABLE "behaviour_records"
  ADD CONSTRAINT "behaviour_records_points_not_negative" CHECK ("points" >= 0);

CREATE INDEX IF NOT EXISTS "behaviour_records_studentProfileId_occurredAt_idx"
  ON "behaviour_records" ("studentProfileId", "occurredAt");

CREATE INDEX IF NOT EXISTS "behaviour_records_classId_occurredAt_idx"
  ON "behaviour_records" ("classId", "occurredAt");

ALTER TABLE "behaviour_records"
  ADD CONSTRAINT "behaviour_records_studentProfileId_fkey" FOREIGN KEY ("studentProfileId")
  REFERENCES "student_profiles" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SET NULL: a class being removed must not delete what was written about the
-- children who were in it.
ALTER TABLE "behaviour_records"
  ADD CONSTRAINT "behaviour_records_classId_fkey" FOREIGN KEY ("classId")
  REFERENCES "classes" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
