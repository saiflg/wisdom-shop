-- CreateEnum
CREATE TYPE "TutorSessionMode" AS ENUM ('ASK', 'AUTO');

-- CreateEnum
CREATE TYPE "LessonResourceKind" AS ENUM ('VIDEO', 'DOCUMENT', 'LINK');

-- AlterEnum
-- Safe in one transaction on PG12+ only because nothing below writes 'PAUSED';
-- a new enum value cannot be used in the transaction that adds it.
ALTER TYPE "TutorSessionStatus" ADD VALUE 'PAUSED';

-- AlterTable
ALTER TABLE "tutor_sessions" ADD COLUMN     "mode" "TutorSessionMode" NOT NULL DEFAULT 'ASK',
ADD COLUMN     "outline" JSONB,
ADD COLUMN     "position" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "tutor_turns" ADD COLUMN     "diagram" TEXT,
ADD COLUMN     "lessonIndex" INTEGER;

-- CreateTable
CREATE TABLE "lesson_resources" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "kind" "LessonResourceKind" NOT NULL DEFAULT 'VIDEO',
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "keywords" TEXT,
    "addedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "lesson_resources_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lesson_resources_subjectId_idx" ON "lesson_resources"("subjectId");

-- AddForeignKey
ALTER TABLE "lesson_resources" ADD CONSTRAINT "lesson_resources_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_resources" ADD CONSTRAINT "lesson_resources_addedByUserId_fkey" FOREIGN KEY ("addedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
