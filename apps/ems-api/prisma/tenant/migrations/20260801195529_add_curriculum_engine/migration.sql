-- CreateEnum
CREATE TYPE "CurriculumMode" AS ENUM ('MANUAL', 'AI_AUTOMATIC', 'HYBRID');

-- CreateEnum
CREATE TYPE "SchemeOfWorkStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "ContentSource" AS ENUM ('MANUAL', 'AI_GENERATED');

-- CreateTable
CREATE TABLE "curriculum_settings" (
    "id" TEXT NOT NULL,
    "mode" "CurriculumMode" NOT NULL DEFAULT 'MANUAL',
    "country" TEXT,
    "curriculumStandard" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "curriculum_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subjects" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gradeLevel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schemes_of_work" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "academicYear" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "status" "SchemeOfWorkStatus" NOT NULL DEFAULT 'DRAFT',
    "source" "ContentSource" NOT NULL,
    "content" JSONB NOT NULL,
    "generatedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schemes_of_work_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subjects_name_gradeLevel_key" ON "subjects"("name", "gradeLevel");

-- CreateIndex
CREATE UNIQUE INDEX "schemes_of_work_subjectId_academicYear_term_key" ON "schemes_of_work"("subjectId", "academicYear", "term");

-- AddForeignKey
ALTER TABLE "schemes_of_work" ADD CONSTRAINT "schemes_of_work_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schemes_of_work" ADD CONSTRAINT "schemes_of_work_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
