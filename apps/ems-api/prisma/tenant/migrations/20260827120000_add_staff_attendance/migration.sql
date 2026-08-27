-- One member of staff, one day. Separate from the student registers: staff
-- are marked by whoever notices rather than class by class.

CREATE TYPE "StaffAttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'ON_LEAVE');

CREATE TABLE IF NOT EXISTS "staff_attendance_days" (
  "id"               TEXT NOT NULL,
  "userId"           TEXT NOT NULL,
  "date"             TIMESTAMP(3) NOT NULL,
  "status"           "StaffAttendanceStatus" NOT NULL,
  "minutesLate"      INTEGER,
  "note"             TEXT,
  "recordedByUserId" TEXT NOT NULL,
  "recordedByName"   TEXT NOT NULL,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,
  CONSTRAINT "staff_attendance_days_pkey" PRIMARY KEY ("id")
);

-- One mark per person per day. Marking twice is a correction, not a second
-- day, and without this a morning register run twice doubles everybody.
CREATE UNIQUE INDEX IF NOT EXISTS "staff_attendance_days_userId_date_key"
  ON "staff_attendance_days" ("userId", "date");

CREATE INDEX IF NOT EXISTS "staff_attendance_days_date_idx" ON "staff_attendance_days" ("date");

-- Minutes late belong to a LATE mark and nowhere else. A number left behind
-- by a status somebody changed makes every lateness total wrong.
ALTER TABLE "staff_attendance_days"
  ADD CONSTRAINT "staff_attendance_days_minutes_only_when_late"
  CHECK (
    ("status" = 'LATE' AND "minutesLate" IS NOT NULL AND "minutesLate" > 0 AND "minutesLate" <= 600)
    OR ("status" <> 'LATE' AND "minutesLate" IS NULL)
  );

ALTER TABLE "staff_attendance_days"
  ADD CONSTRAINT "staff_attendance_days_userId_fkey" FOREIGN KEY ("userId")
  REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
