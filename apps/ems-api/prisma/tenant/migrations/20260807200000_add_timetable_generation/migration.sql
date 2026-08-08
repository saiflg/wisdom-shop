-- CreateTable
CREATE TABLE "timetable_settings" (
    "id" TEXT NOT NULL,
    "dayStartMinute" INTEGER NOT NULL DEFAULT 480,
    "dayEndMinute" INTEGER NOT NULL DEFAULT 840,
    "periodsPerDay" INTEGER NOT NULL DEFAULT 8,
    "breakAfterPeriod" INTEGER,
    "breakLengthMinutes" INTEGER NOT NULL DEFAULT 30,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "timetable_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teaching_assignments" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "teacherUserId" TEXT,
    "periodsPerWeek" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teaching_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "teaching_assignments_teacherUserId_idx" ON "teaching_assignments"("teacherUserId");

-- One assignment per subject per class: "how many periods of Maths does
-- Grade 5A get" has exactly one answer.
CREATE UNIQUE INDEX "teaching_assignments_classId_subjectId_key" ON "teaching_assignments"("classId", "subjectId");

-- AddForeignKey
ALTER TABLE "teaching_assignments" ADD CONSTRAINT "teaching_assignments_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teaching_assignments" ADD CONSTRAINT "teaching_assignments_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teaching_assignments" ADD CONSTRAINT "teaching_assignments_teacherUserId_fkey" FOREIGN KEY ("teacherUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Every existing school gets the default day, so the timetable page has
-- something to show before anyone visits settings.
INSERT INTO "timetable_settings" ("id", "updatedAt") VALUES ('seed-timetable-settings', now());
