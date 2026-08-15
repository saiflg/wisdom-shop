-- A parent telling the school their child will be away.
--
-- Deliberately not a foreign key to attendance_records and not an
-- AttendanceStatus. A note never changes a mark: it is put in front of whoever
-- takes the register, and they decide. A family able to set its own child's
-- attendance to EXCUSED would make truancy self-service, and attendance is
-- routinely used to justify decisions about a child.
--
-- The free-text "note" is health information about a named minor. Visible to
-- the parent who wrote it and to staff, and never to be included in anything
-- sent to an AI provider.
CREATE TABLE "absence_notes" (
    "id" TEXT NOT NULL,
    "studentProfileId" TEXT NOT NULL,
    -- Date only, UTC midnight, matching attendance_registers — otherwise a
    -- note would miss the register it exists to explain. Both ends inclusive.
    "fromDate" TIMESTAMP(3) NOT NULL,
    "toDate" TIMESTAMP(3) NOT NULL,
    -- A string rather than an enum so a school can be given its own list
    -- later without a migration.
    "reason" TEXT NOT NULL,
    "note" TEXT,
    -- Stored by value alongside the id so it still reads correctly if the
    -- account is later removed.
    "createdByUserId" TEXT NOT NULL,
    "createdByName" TEXT,
    "withdrawnAt" TIMESTAMP(3),
    -- After this a parent can no longer withdraw: the school decided
    -- something on the strength of it.
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedByUserId" TEXT,
    "acknowledgedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "absence_notes_pkey" PRIMARY KEY ("id")
);

-- The question every read asks: "any notes for this child, covering this
-- date?" — so the child and the range it spans are indexed together.
CREATE INDEX "absence_notes_studentProfileId_fromDate_toDate_idx"
    ON "absence_notes"("studentProfileId", "fromDate", "toDate");

ALTER TABLE "absence_notes" ADD CONSTRAINT "absence_notes_studentProfileId_fkey"
    FOREIGN KEY ("studentProfileId") REFERENCES "student_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
