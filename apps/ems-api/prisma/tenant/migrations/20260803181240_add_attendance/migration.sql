-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'EXCUSED');

-- CreateTable
CREATE TABLE "attendance_registers" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "session" TEXT,
    "takenById" TEXT,
    "takenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_registers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_records" (
    "id" TEXT NOT NULL,
    "registerId" TEXT NOT NULL,
    "studentProfileId" TEXT NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_amendments" (
    "id" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "fromStatus" "AttendanceStatus" NOT NULL,
    "toStatus" "AttendanceStatus" NOT NULL,
    "reason" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_amendments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attendance_registers_classId_idx" ON "attendance_registers"("classId");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_registers_classId_date_session_key" ON "attendance_registers"("classId", "date", "session");

-- CreateIndex
CREATE INDEX "attendance_records_studentProfileId_idx" ON "attendance_records"("studentProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_records_registerId_studentProfileId_key" ON "attendance_records"("registerId", "studentProfileId");

-- CreateIndex
CREATE INDEX "attendance_amendments_recordId_idx" ON "attendance_amendments"("recordId");

-- AddForeignKey
ALTER TABLE "attendance_registers" ADD CONSTRAINT "attendance_registers_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_registers" ADD CONSTRAINT "attendance_registers_takenById_fkey" FOREIGN KEY ("takenById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_registerId_fkey" FOREIGN KEY ("registerId") REFERENCES "attendance_registers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_studentProfileId_fkey" FOREIGN KEY ("studentProfileId") REFERENCES "student_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_amendments" ADD CONSTRAINT "attendance_amendments_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "attendance_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
