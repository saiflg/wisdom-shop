-- CreateEnum
CREATE TYPE "MarkStatus" AS ENUM ('RECORDED', 'ABSENT', 'EXCUSED');

-- CreateEnum
CREATE TYPE "TermResultStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateTable
CREATE TABLE "grade_scales" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "grade_scales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grade_bands" (
    "id" TEXT NOT NULL,
    "gradeScaleId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "minPercent" INTEGER NOT NULL,
    "maxPercent" INTEGER NOT NULL,
    "remark" TEXT,
    "gradePoint" INTEGER,

    CONSTRAINT "grade_bands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessments" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "academicYear" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "maxScoreHundredths" INTEGER NOT NULL,
    "weightPercent" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marks" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "studentProfileId" TEXT NOT NULL,
    "scoreHundredths" INTEGER,
    "status" "MarkStatus" NOT NULL DEFAULT 'RECORDED',
    "comment" TEXT,
    "recordedByUserId" TEXT,
    "recordedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "term_results" (
    "id" TEXT NOT NULL,
    "studentProfileId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "academicYear" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "status" "TermResultStatus" NOT NULL DEFAULT 'DRAFT',
    "gradeScaleId" TEXT,
    "overallPercentHundredths" INTEGER,
    "publishedAt" TIMESTAMP(3),
    "publishedByUserId" TEXT,
    "publishedByName" TEXT,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "term_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subject_results" (
    "id" TEXT NOT NULL,
    "termResultId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "percentHundredths" INTEGER NOT NULL,
    "gradeLabel" TEXT NOT NULL,
    "gradeRemark" TEXT,
    "gradePoint" INTEGER,
    "comment" TEXT,

    CONSTRAINT "subject_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "grade_bands_gradeScaleId_idx" ON "grade_bands"("gradeScaleId");

-- CreateIndex
CREATE INDEX "assessments_classId_academicYear_term_idx" ON "assessments"("classId", "academicYear", "term");

-- CreateIndex
CREATE UNIQUE INDEX "assessments_subjectId_classId_academicYear_term_name_key" ON "assessments"("subjectId", "classId", "academicYear", "term", "name");

-- CreateIndex
CREATE INDEX "marks_studentProfileId_idx" ON "marks"("studentProfileId");

-- One mark per student per assessment. Entering a class's marks twice
-- corrects rather than duplicating.
CREATE UNIQUE INDEX "marks_assessmentId_studentProfileId_key" ON "marks"("assessmentId", "studentProfileId");

-- CreateIndex
CREATE INDEX "term_results_classId_academicYear_term_idx" ON "term_results"("classId", "academicYear", "term");

-- One result per student per class per term.
CREATE UNIQUE INDEX "term_results_studentProfileId_classId_academicYear_term_key" ON "term_results"("studentProfileId", "classId", "academicYear", "term");

-- CreateIndex
CREATE INDEX "subject_results_subjectId_idx" ON "subject_results"("subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "subject_results_termResultId_subjectId_key" ON "subject_results"("termResultId", "subjectId");

-- AddForeignKey
ALTER TABLE "grade_bands" ADD CONSTRAINT "grade_bands_gradeScaleId_fkey" FOREIGN KEY ("gradeScaleId") REFERENCES "grade_scales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marks" ADD CONSTRAINT "marks_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marks" ADD CONSTRAINT "marks_studentProfileId_fkey" FOREIGN KEY ("studentProfileId") REFERENCES "student_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "term_results" ADD CONSTRAINT "term_results_studentProfileId_fkey" FOREIGN KEY ("studentProfileId") REFERENCES "student_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "term_results" ADD CONSTRAINT "term_results_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "term_results" ADD CONSTRAINT "term_results_gradeScaleId_fkey" FOREIGN KEY ("gradeScaleId") REFERENCES "grade_scales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subject_results" ADD CONSTRAINT "subject_results_termResultId_fkey" FOREIGN KEY ("termResultId") REFERENCES "term_results"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subject_results" ADD CONSTRAINT "subject_results_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
