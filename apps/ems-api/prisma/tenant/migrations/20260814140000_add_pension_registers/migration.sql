-- The staff member's Retirement Savings Account PIN, printed on the schedule
-- filed with the pension administrator.
--
-- Not encrypted, unlike the bank account number: a PIN identifies an account
-- but cannot move money out of it, and it is printed on a schedule that
-- leaves the building every month regardless.
ALTER TABLE "staff_profiles" ADD COLUMN "pensionPin" TEXT;

-- Where this school's pension contributions go, and on what terms. A
-- singleton per school: the provider and account are printed at the top of
-- every schedule, so they belong to the school rather than a payroll run.
CREATE TABLE "pension_settings" (
    "id" TEXT NOT NULL,
    "providerName" TEXT,
    "remittanceBankName" TEXT,
    "remittanceAccountNumber" TEXT,
    -- The employer's share as a percentage OF THE EMPLOYEE'S contribution.
    -- One number covers both arrangements seen in practice: matching staff
    -- pound for pound is 100, and the statutory 10% employer against 8%
    -- employee is 125.
    "employerMatchPercent" INTEGER NOT NULL DEFAULT 100,
    "componentLabel" TEXT NOT NULL DEFAULT 'Pension',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pension_settings_pkey" PRIMARY KEY ("id")
);
