-- CreateEnum
CREATE TYPE "ReadingSupport" AS ENUM ('NONE', 'SIMPLIFIED', 'STEP_BY_STEP');

-- AlterTable
ALTER TABLE "lesson_resources" ADD COLUMN     "hasCaptions" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "tutor_turns" ADD COLUMN     "diagramAlt" TEXT;

-- CreateTable
CREATE TABLE "accessibility_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "largeText" BOOLEAN NOT NULL DEFAULT false,
    "highContrast" BOOLEAN NOT NULL DEFAULT false,
    "dyslexiaFont" BOOLEAN NOT NULL DEFAULT false,
    "reduceMotion" BOOLEAN NOT NULL DEFAULT false,
    "readingSupport" "ReadingSupport" NOT NULL DEFAULT 'NONE',
    "describeVisuals" BOOLEAN NOT NULL DEFAULT false,
    "requireCaptions" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accessibility_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "accessibility_profiles_userId_key" ON "accessibility_profiles"("userId");

-- AddForeignKey
ALTER TABLE "accessibility_profiles" ADD CONSTRAINT "accessibility_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accessibility_profiles" ADD CONSTRAINT "accessibility_profiles_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
