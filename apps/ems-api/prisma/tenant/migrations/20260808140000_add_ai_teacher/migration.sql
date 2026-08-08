-- CreateEnum
CREATE TYPE "TutorSessionStatus" AS ENUM ('ACTIVE', 'ENDED');

-- CreateEnum
CREATE TYPE "TutorTurnRole" AS ENUM ('STUDENT', 'TUTOR');

-- CreateTable
CREATE TABLE "tutor_sessions" (
    "id" TEXT NOT NULL,
    "studentProfileId" TEXT,
    "startedByUserId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "schemeOfWorkId" TEXT,
    "weekNumber" INTEGER,
    "topic" TEXT NOT NULL,
    "status" "TutorSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tutor_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tutor_turns" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "role" "TutorTurnRole" NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tutor_turns_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tutor_sessions_studentProfileId_idx" ON "tutor_sessions"("studentProfileId");

-- CreateIndex
CREATE INDEX "tutor_sessions_startedByUserId_idx" ON "tutor_sessions"("startedByUserId");

-- CreateIndex
CREATE INDEX "tutor_turns_sessionId_idx" ON "tutor_turns"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "tutor_turns_sessionId_sequence_key" ON "tutor_turns"("sessionId", "sequence");

-- AddForeignKey
ALTER TABLE "tutor_sessions" ADD CONSTRAINT "tutor_sessions_studentProfileId_fkey" FOREIGN KEY ("studentProfileId") REFERENCES "student_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_sessions" ADD CONSTRAINT "tutor_sessions_startedByUserId_fkey" FOREIGN KEY ("startedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_sessions" ADD CONSTRAINT "tutor_sessions_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_sessions" ADD CONSTRAINT "tutor_sessions_schemeOfWorkId_fkey" FOREIGN KEY ("schemeOfWorkId") REFERENCES "schemes_of_work"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_turns" ADD CONSTRAINT "tutor_turns_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "tutor_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
