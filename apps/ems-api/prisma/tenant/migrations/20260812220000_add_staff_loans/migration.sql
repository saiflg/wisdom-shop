-- Money the school has lent a member of staff, recovered from pay.

CREATE TYPE "StaffLoanKind" AS ENUM ('LOAN', 'SALARY_ADVANCE');
CREATE TYPE "StaffLoanStatus" AS ENUM ('ACTIVE', 'SETTLED', 'WRITTEN_OFF', 'CANCELLED');

CREATE TABLE "staff_loans" (
    "id" TEXT NOT NULL,
    "staffProfileId" TEXT NOT NULL,
    "kind" "StaffLoanKind" NOT NULL DEFAULT 'LOAN',
    "reference" TEXT NOT NULL,
    "principalCents" INTEGER NOT NULL,
    -- Maintained as repayments land, like fee_invoices.paidCents, so a balance
    -- never requires summing the repayment table at read time.
    "repaidCents" INTEGER NOT NULL DEFAULT 0,
    "monthlyDeductionCents" INTEGER NOT NULL DEFAULT 0,
    "issuedOn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "StaffLoanStatus" NOT NULL DEFAULT 'ACTIVE',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_loans_pkey" PRIMARY KEY ("id")
);

-- Unique so two clerks recording the same agreement twice collide instead of
-- creating two debts against one person.
CREATE UNIQUE INDEX "staff_loans_reference_key" ON "staff_loans"("reference");
CREATE INDEX "staff_loans_staffProfileId_idx" ON "staff_loans"("staffProfileId");
CREATE INDEX "staff_loans_status_idx" ON "staff_loans"("status");

CREATE TABLE "staff_loan_repayments" (
    "id" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    -- Null for a repayment made in cash rather than through payroll.
    "runId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "paidOn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_loan_repayments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "staff_loan_repayments_loanId_idx" ON "staff_loan_repayments"("loanId");

-- THE guard against double recovery. Payroll gets re-run — a correction, a
-- late starter, somebody clicking twice — and without this a second pass would
-- quietly deduct the same instalment again from somebody's wages. Enforced by
-- the database rather than by a check in the service, because an invariant a
-- caller can forget is not an invariant.
--
-- Postgres treats NULLs as distinct in a unique index, so any number of cash
-- repayments (runId IS NULL) can coexist against one loan, which is intended.
CREATE UNIQUE INDEX "staff_loan_repayments_loanId_runId_key" ON "staff_loan_repayments"("loanId", "runId");

ALTER TABLE "staff_loans" ADD CONSTRAINT "staff_loans_staffProfileId_fkey"
    FOREIGN KEY ("staffProfileId") REFERENCES "staff_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "staff_loan_repayments" ADD CONSTRAINT "staff_loan_repayments_loanId_fkey"
    FOREIGN KEY ("loanId") REFERENCES "staff_loans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
