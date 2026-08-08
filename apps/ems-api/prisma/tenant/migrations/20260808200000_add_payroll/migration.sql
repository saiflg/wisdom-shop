-- Payroll: salary components, monthly runs, payslips.
--
-- Two unique indexes carry most of the safety here:
--   payroll_runs (year, month)        - a month cannot be run twice
--   payslips (runId, staffProfileId)  - nobody is paid twice within a run
-- Paying somebody twice is a mistake a school discovers at the bank.
-- CreateEnum
CREATE TYPE "PayComponentKind" AS ENUM ('EARNING', 'DEDUCTION');

-- CreateEnum
CREATE TYPE "PayComponentBasis" AS ENUM ('FIXED', 'PERCENT_OF_BASIC');

-- CreateEnum
CREATE TYPE "PayrollRunStatus" AS ENUM ('DRAFT', 'APPROVED', 'PAID');

-- CreateTable
CREATE TABLE "salary_components" (
    "id" TEXT NOT NULL,
    "staffProfileId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "kind" "PayComponentKind" NOT NULL,
    "basis" "PayComponentBasis" NOT NULL DEFAULT 'FIXED',
    "amount" INTEGER NOT NULL,
    "isBasic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "salary_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_runs" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "status" "PayrollRunStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedByUserId" TEXT,
    "approvedByName" TEXT,
    "paidAt" TIMESTAMP(3),
    "paidByUserId" TEXT,
    "paidByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payslips" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "staffProfileId" TEXT NOT NULL,
    "staffName" TEXT NOT NULL,
    "staffNumber" TEXT,
    "grossCents" INTEGER NOT NULL,
    "deductionsCents" INTEGER NOT NULL,
    "netCents" INTEGER NOT NULL,
    "lines" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payslips_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "salary_components_staffProfileId_idx" ON "salary_components"("staffProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_runs_year_month_key" ON "payroll_runs"("year", "month");

-- CreateIndex
CREATE INDEX "payslips_staffProfileId_idx" ON "payslips"("staffProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "payslips_runId_staffProfileId_key" ON "payslips"("runId", "staffProfileId");

-- AddForeignKey
ALTER TABLE "salary_components" ADD CONSTRAINT "salary_components_staffProfileId_fkey" FOREIGN KEY ("staffProfileId") REFERENCES "staff_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_runId_fkey" FOREIGN KEY ("runId") REFERENCES "payroll_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_staffProfileId_fkey" FOREIGN KEY ("staffProfileId") REFERENCES "staff_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

