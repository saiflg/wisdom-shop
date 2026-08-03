-- Makes attendance_registers.session NOT NULL, defaulting to ''.
--
-- The column was nullable in the previous migration, which silently
-- defeated the unique index on (classId, date, session): Postgres treats
-- NULLs as distinct, so two whole-day registers for the same class and
-- date would both have been accepted. Empty string is a real value and
-- compares equal, so the constraint now actually holds.

UPDATE "attendance_registers" SET "session" = '' WHERE "session" IS NULL;

ALTER TABLE "attendance_registers" ALTER COLUMN "session" SET DEFAULT '';
ALTER TABLE "attendance_registers" ALTER COLUMN "session" SET NOT NULL;
